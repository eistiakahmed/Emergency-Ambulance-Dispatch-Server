import type { Prisma } from '@prisma/client';
import { BadRequestError, NotFoundError } from '../../common/errors/AppError.js';
import { logAuditEvent } from '../../common/utils/auditLogger.js';
import { buildPaginatedResponse, parsePaginationParams } from '../../common/utils/pagination.js';
import { prisma } from '../../config/prisma.js';

export class EmergencyService {
  static async createEmergency(patientId: string, data: any) {
    const emergency = await prisma.emergencyRequest.create({
      data: {
        patientId,
        patientName: data.patientName,
        patientPhone: data.patientPhone,
        priority: data.priority || 'MEDIUM',
        pickupAddress: data.pickupAddress,
        pickupLatitude: data.pickupLatitude,
        pickupLongitude: data.pickupLongitude,
        symptoms: data.symptoms,
        notes: data.notes,
        destinationHospitalId: data.destinationHospitalId,
        status: 'PENDING',
      },
      include: {
        destinationHospital: true,
      },
    });

    await logAuditEvent({
      actorId: patientId,
      actorRole: 'PATIENT',
      action: 'CREATE',
      resourceType: 'EMERGENCY_REQUEST',
      resourceId: emergency.id,
      newValues: {
        priority: emergency.priority,
        pickupAddress: emergency.pickupAddress,
      },
    });

    return emergency;
  }

  static async listEmergencies(query: any, user: { id: string; role: string }) {
    const { page, limit, skip, sortBy, sortOrder } = parsePaginationParams(query);
    const priority = query.priority as any;
    const status = query.status as any;

    const where: any = {
      deletedAt: null,
      ...(user.role === 'PATIENT' ? { patientId: user.id } : {}),
      ...(priority ? { priority } : {}),
      ...(status ? { status } : {}),
    };

    const [total, emergencies] = await Promise.all([
      prisma.emergencyRequest.count({ where }),
      prisma.emergencyRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          destinationHospital: true,
          trip: {
            include: {
              ambulance: true,
              driverProfile: {
                include: { user: { select: { name: true, phone: true } } },
              },
            },
          },
        },
      }),
    ]);

    return buildPaginatedResponse(emergencies, total, page, limit);
  }

  static async getEmergencyById(id: string, user: { id: string; role: string }) {
    const emergency = await prisma.emergencyRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(user.role === 'PATIENT' ? { patientId: user.id } : {}),
      },
      include: {
        destinationHospital: true,
        trip: {
          include: {
            ambulance: true,
            driverProfile: {
              include: { user: { select: { name: true, phone: true } } },
            },
            statusLogs: { orderBy: { timestamp: 'asc' } },
            payment: true,
          },
        },
      },
    });

    if (!emergency) {
      throw new NotFoundError('Emergency request not found');
    }

    return emergency;
  }

  static async cancelEmergency(id: string, reason: string, user: { id: string; role: string }) {
    const emergency = await prisma.emergencyRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(user.role === 'PATIENT' ? { patientId: user.id } : {}),
      },
      include: { trip: true },
    });

    if (!emergency) {
      throw new NotFoundError('Emergency request not found');
    }

    if (emergency.status === 'COMPLETED' || emergency.status === 'CANCELLED') {
      throw new BadRequestError(`Emergency request is already ${emergency.status.toLowerCase()}`);
    }

    // If trip reached PATIENT_PICKED_UP or beyond, caller cannot cancel
    if (
      emergency.trip &&
      ['PATIENT_PICKED_UP', 'EN_ROUTE_HOSPITAL', 'ARRIVED_HOSPITAL', 'COMPLETED'].includes(
        emergency.trip.status
      )
    ) {
      throw new BadRequestError(
        'Cannot cancel emergency request after patient has already been picked up by the ambulance'
      );
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Update emergency status
      const updatedEmergency = await tx.emergencyRequest.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // 2. If trip was active, cancel trip and release driver
      if (emergency.trip) {
        await tx.trip.update({
          where: { id: emergency.trip.id },
          data: {
            status: 'CANCELLED',
            cancellationReason: reason,
          },
        });

        await tx.tripStatusLog.create({
          data: {
            tripId: emergency.trip.id,
            status: 'CANCELLED',
            note: `Cancelled by ${user.role}: ${reason}`,
          },
        });

        await tx.driverProfile.update({
          where: { id: emergency.trip.driverProfileId },
          data: { status: 'AVAILABLE' },
        });
      }

      await logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: 'STATUS_CHANGE',
        resourceType: 'EMERGENCY_REQUEST',
        resourceId: id,
        newValues: { status: 'CANCELLED', reason },
      });

      return updatedEmergency;
    });
  }
}
