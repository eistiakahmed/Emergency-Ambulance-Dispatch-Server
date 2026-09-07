import type { Prisma } from '@prisma/client';
import { BadRequestError, NotFoundError } from '../../common/errors/AppError.js';
import { EmailService } from '../../common/services/email.service.js';
import { logAuditEvent } from '../../common/utils/auditLogger.js';
import { calculateDistanceKm, calculateEtaMinutes } from '../../common/utils/geo.js';
import { FARE_CONFIG } from '../../config/constants.js';
import { prisma } from '../../config/prisma.js';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ASSIGNED: ['EN_ROUTE_PICKUP', 'CANCELLED'],
  EN_ROUTE_PICKUP: ['PATIENT_PICKED_UP', 'CANCELLED'],
  PATIENT_PICKED_UP: ['EN_ROUTE_HOSPITAL'],
  EN_ROUTE_HOSPITAL: ['ARRIVED_HOSPITAL'],
  ARRIVED_HOSPITAL: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export class TripService {
  static async dispatch(
    data: { emergencyRequestId: string; ambulanceId?: string },
    actor: { id: string; role: string }
  ) {
    const emergency = await prisma.emergencyRequest.findFirst({
      where: { id: data.emergencyRequestId, deletedAt: null },
      include: { patient: true },
    });

    if (!emergency) {
      throw new NotFoundError('Emergency request not found');
    }

    if (emergency.status !== 'PENDING') {
      throw new BadRequestError(
        `Cannot dispatch: Emergency request status is already ${emergency.status}`
      );
    }

    // Atomic transaction for finding available ambulance + locking status
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let ambulance: any = null;

      if (data.ambulanceId) {
        ambulance = await tx.ambulance.findFirst({
          where: {
            id: data.ambulanceId,
            isOperational: true,
            deletedAt: null,
            driverProfile: {
              status: 'AVAILABLE',
            },
          },
          include: {
            driverProfile: {
              include: { user: true },
            },
          },
        });

        if (!ambulance?.driverProfile) {
          throw new BadRequestError(
            'Specified ambulance is not available or driver is offline/busy'
          );
        }
      } else {
        // Auto-match nearest available operational ambulance based on GPS coordinates
        const availableAmbulances = await tx.ambulance.findMany({
          where: {
            isOperational: true,
            deletedAt: null,
            driverProfile: {
              status: 'AVAILABLE',
            },
          },
          include: {
            driverProfile: {
              include: { user: true },
            },
          },
        });

        if (!availableAmbulances.length) {
          throw new BadRequestError(
            'No operational ambulances or drivers are currently available for dispatch'
          );
        }

        // If pickup coordinates exist, sort by nearest distance using Haversine formula
        if (emergency.pickupLat && emergency.pickupLng) {
          availableAmbulances.sort((a, b) => {
            const distA =
              a.driverProfile?.currentLat && a.driverProfile?.currentLng
                ? calculateDistanceKm(
                    emergency.pickupLat!,
                    emergency.pickupLng!,
                    a.driverProfile.currentLat,
                    a.driverProfile.currentLng
                  )
                : Number.POSITIVE_INFINITY;

            const distB =
              b.driverProfile?.currentLat && b.driverProfile?.currentLng
                ? calculateDistanceKm(
                    emergency.pickupLat!,
                    emergency.pickupLng!,
                    b.driverProfile.currentLat,
                    b.driverProfile.currentLng
                  )
                : Number.POSITIVE_INFINITY;

            return distA - distB;
          });
        }

        ambulance = availableAmbulances[0];

        if (!ambulance?.driverProfile) {
          throw new BadRequestError(
            'No operational ambulances or drivers are currently available for dispatch'
          );
        }
      }

      // 1. Lock driver status to BUSY
      await tx.driverProfile.update({
        where: { id: ambulance.driverProfile.id },
        data: { status: 'BUSY' },
      });

      // 2. Base fare initialization
      const vehicleTypeKey = ambulance.vehicleType as keyof typeof FARE_CONFIG.BASE_FARES;
      const baseFare = FARE_CONFIG.BASE_FARES[vehicleTypeKey] || 30.0;

      // 3. Create Trip record
      const trip = await tx.trip.create({
        data: {
          emergencyRequestId: emergency.id,
          ambulanceId: ambulance.id,
          driverProfileId: ambulance.driverProfile.id,
          hospitalId: emergency.destinationHospitalId,
          status: 'ASSIGNED',
          baseFare,
          totalFare: baseFare,
        },
        include: {
          ambulance: true,
          driverProfile: {
            include: { user: { select: { name: true, phone: true } } },
          },
          emergencyRequest: true,
        },
      });

      // 4. Update Emergency Request status to DISPATCHED
      await tx.emergencyRequest.update({
        where: { id: emergency.id },
        data: { status: 'DISPATCHED' },
      });

      // 5. Create initial TripStatusLog with distance & ETA calculation
      let dispatchNote = `Unit ${ambulance.plateNumber} dispatched by ${actor.role}`;
      if (
        emergency.pickupLat &&
        emergency.pickupLng &&
        ambulance.driverProfile.currentLat &&
        ambulance.driverProfile.currentLng
      ) {
        const dist = calculateDistanceKm(
          emergency.pickupLat,
          emergency.pickupLng,
          ambulance.driverProfile.currentLat,
          ambulance.driverProfile.currentLng
        );
        const eta = calculateEtaMinutes(dist);
        dispatchNote += ` — Distance: ${dist}km, ETA: ~${eta} mins`;
      }

      await tx.tripStatusLog.create({
        data: {
          tripId: trip.id,
          status: 'ASSIGNED',
          latitude: ambulance.driverProfile.currentLat,
          longitude: ambulance.driverProfile.currentLng,
          note: dispatchNote,
        },
      });

      // 6. Record Audit Log
      await logAuditEvent({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'DISPATCH',
        resourceType: 'TRIP',
        resourceId: trip.id,
        newValues: {
          emergencyRequestId: emergency.id,
          ambulanceId: ambulance.id,
          driverProfileId: ambulance.driverProfile.id,
        },
      });

      // 7. Non-blocking email alert to patient
      if (emergency.patient.email) {
        EmailService.sendDispatchAlert(
          emergency.patient.email,
          emergency.patientName,
          ambulance.plateNumber,
          ambulance.driverProfile.user.name,
          ambulance.driverProfile.user.phone || emergency.patientPhone
        ).catch((e) => console.warn('Email send error:', e));
      }

      return trip;
    });
  }

  static async getActiveTrip(user: { id: string; role: string }) {
    const where: any = {
      status: {
        in: [
          'ASSIGNED',
          'EN_ROUTE_PICKUP',
          'PATIENT_PICKED_UP',
          'EN_ROUTE_HOSPITAL',
          'ARRIVED_HOSPITAL',
        ],
      },
    };

    if (user.role === 'DRIVER') {
      const driver = await prisma.driverProfile.findUnique({ where: { userId: user.id } });
      if (!driver) throw new NotFoundError('Driver profile not found');
      where.driverProfileId = driver.id;
    } else if (user.role === 'PATIENT') {
      where.emergencyRequest = { patientId: user.id };
    }

    const trip = await prisma.trip.findFirst({
      where,
      include: {
        ambulance: true,
        driverProfile: {
          include: { user: { select: { name: true, phone: true } } },
        },
        emergencyRequest: {
          include: { destinationHospital: true },
        },
        statusLogs: {
          orderBy: { timestamp: 'desc' },
          take: 5,
        },
        hospital: true,
      },
    });

    return trip;
  }

  static async getTripById(id: string, user: { id: string; role: string }) {
    const trip = await prisma.trip.findFirst({
      where: { id, deletedAt: null },
      include: {
        ambulance: true,
        driverProfile: {
          include: { user: { select: { name: true, phone: true } } },
        },
        emergencyRequest: {
          include: { patient: { select: { name: true, email: true, phone: true } } },
        },
        hospital: true,
        statusLogs: { orderBy: { timestamp: 'asc' } },
        payment: true,
      },
    });

    if (!trip) {
      throw new NotFoundError('Trip not found');
    }

    // Role check: Patients can only view their own trips, Drivers only their assigned trips
    if (user.role === 'PATIENT' && trip.emergencyRequest.patientId !== user.id) {
      throw new NotFoundError('Trip not found');
    }
    if (user.role === 'DRIVER' && trip.driverProfile.userId !== user.id) {
      throw new NotFoundError('Trip not found');
    }

    return trip;
  }

  static async updateTripStatus(
    tripId: string,
    data: {
      status: string;
      latitude?: number;
      longitude?: number;
      note?: string;
      hospitalId?: string;
      distanceKm?: number;
    },
    user: { id: string; role: string }
  ) {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      include: {
        ambulance: true,
        driverProfile: true,
        emergencyRequest: true,
      },
    });

    if (!trip) {
      throw new NotFoundError('Trip not found');
    }

    // Verify caller has permission to advance trip
    if (user.role === 'DRIVER' && trip.driverProfile.userId !== user.id) {
      throw new BadRequestError('You are not authorized to update another driver’s trip status');
    }

    const currentStatus = trip.status;
    const nextStatus = data.status;

    // Validate state machine progression
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestError(
        `Invalid status transition from '${currentStatus}' to '${nextStatus}'. Allowed next steps: [${allowed.join(
          ', '
        )}]`
      );
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let finalFare = Number(trip.totalFare);
      const isCompleted = nextStatus === 'COMPLETED';

      if (isCompleted) {
        // Calculate fare
        const distance =
          data.distanceKm !== undefined ? data.distanceKm : Number(trip.distanceKm) || 5.0;
        const vehicleTypeKey = trip.ambulance.vehicleType as keyof typeof FARE_CONFIG.PER_KM_RATES;
        const perKmRate = FARE_CONFIG.PER_KM_RATES[vehicleTypeKey] || 3.0;
        const priorityKey = trip.emergencyRequest
          .priority as keyof typeof FARE_CONFIG.PRIORITY_MULTIPLIER;
        const multiplier = FARE_CONFIG.PRIORITY_MULTIPLIER[priorityKey] || 1.0;

        finalFare =
          Math.round((Number(trip.baseFare) + distance * perKmRate) * multiplier * 100) / 100;

        // 1. Free up driver
        await tx.driverProfile.update({
          where: { id: trip.driverProfileId },
          data: { status: 'AVAILABLE' },
        });

        // 2. Mark emergency request COMPLETED
        await tx.emergencyRequest.update({
          where: { id: trip.emergencyRequestId },
          data: { status: 'COMPLETED' },
        });

        // 3. Create initial Payment record in PENDING status
        await tx.payment.upsert({
          where: { tripId: trip.id },
          create: {
            tripId: trip.id,
            userId: trip.emergencyRequest.patientId,
            amount: finalFare,
            currency: 'USD',
            provider: 'STRIPE',
            status: 'PENDING',
          },
          update: {
            amount: finalFare,
          },
        });
      }

      // Update trip
      const updatedTrip = await tx.trip.update({
        where: { id: trip.id },
        data: {
          status: nextStatus as any,
          hospitalId: data.hospitalId || trip.hospitalId,
          ...(data.distanceKm !== undefined ? { distanceKm: data.distanceKm } : {}),
          ...(isCompleted ? { totalFare: finalFare, completedAt: new Date() } : {}),
        },
        include: {
          ambulance: true,
          hospital: true,
          statusLogs: { orderBy: { timestamp: 'desc' }, take: 5 },
          payment: true,
        },
      });

      // Record breadcrumb log
      await tx.tripStatusLog.create({
        data: {
          tripId: trip.id,
          status: nextStatus as any,
          latitude: data.latitude,
          longitude: data.longitude,
          note: data.note || `Transitioned to ${nextStatus}`,
        },
      });

      // Log system audit
      await logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: 'STATUS_CHANGE',
        resourceType: 'TRIP',
        resourceId: trip.id,
        oldValues: { status: currentStatus },
        newValues: { status: nextStatus, totalFare: finalFare },
      });

      return updatedTrip;
    });
  }

  static async reassignTrip(
    tripId: string,
    newAmbulanceId: string,
    reason: string,
    actor: { id: string; role: string }
  ) {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      include: { driverProfile: true },
    });

    if (!trip) throw new NotFoundError('Trip not found');

    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
      throw new BadRequestError(
        `Cannot reassign a trip that is already ${trip.status.toLowerCase()}`
      );
    }

    const newAmbulance = await prisma.ambulance.findFirst({
      where: {
        id: newAmbulanceId,
        isOperational: true,
        deletedAt: null,
        driverProfile: { status: 'AVAILABLE' },
      },
      include: { driverProfile: true },
    });

    if (!newAmbulance?.driverProfile) {
      throw new BadRequestError(
        'Target replacement ambulance is not operational or driver is unavailable'
      );
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Free old driver
      await tx.driverProfile.update({
        where: { id: trip.driverProfileId },
        data: { status: 'AVAILABLE' },
      });

      // Occupy new driver
      await tx.driverProfile.update({
        where: { id: newAmbulance.driverProfile!.id },
        data: { status: 'BUSY' },
      });

      // Update trip
      const updatedTrip = await tx.trip.update({
        where: { id: trip.id },
        data: {
          ambulanceId: newAmbulance.id,
          driverProfileId: newAmbulance.driverProfile!.id,
        },
        include: { ambulance: true, driverProfile: true },
      });

      // Log breadcrumb
      await tx.tripStatusLog.create({
        data: {
          tripId: trip.id,
          status: trip.status,
          note: `Reassigned from unit ${trip.ambulanceId} to unit ${newAmbulance.plateNumber}. Reason: ${reason}`,
        },
      });

      // Audit Log
      await logAuditEvent({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'UPDATE',
        resourceType: 'TRIP',
        resourceId: trip.id,
        oldValues: { ambulanceId: trip.ambulanceId, driverProfileId: trip.driverProfileId },
        newValues: {
          ambulanceId: newAmbulance.id,
          driverProfileId: newAmbulance.driverProfile!.id,
          reason,
        },
      });

      return updatedTrip;
    });
  }
}
