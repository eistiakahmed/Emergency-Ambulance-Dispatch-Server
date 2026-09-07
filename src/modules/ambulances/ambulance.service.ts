import { ConflictError, NotFoundError } from '../../common/errors/AppError.js';
import { RedisService } from '../../common/services/redis.service.js';
import { logAuditEvent } from '../../common/utils/auditLogger.js';
import { buildPaginatedResponse, parsePaginationParams } from '../../common/utils/pagination.js';
import { prisma } from '../../config/prisma.js';

export class AmbulanceService {
  static async createAmbulance(data: any, actorId: string) {
    const existing = await prisma.ambulance.findFirst({
      where: { plateNumber: data.plateNumber },
    });
    if (existing) {
      throw new ConflictError('An ambulance with this plate number already exists');
    }

    const ambulance = await prisma.ambulance.create({
      data,
      include: {
        driverProfile: {
          include: { user: { select: { name: true, email: true, phone: true } } },
        },
      },
    });

    await logAuditEvent({
      actorId,
      actorRole: 'ADMIN',
      action: 'CREATE',
      resourceType: 'AMBULANCE',
      resourceId: ambulance.id,
      newValues: data,
    });

    return ambulance;
  }

  static async listAmbulances(query: any) {
    const { page, limit, skip, sortBy, sortOrder } = parsePaginationParams(query);
    const vehicleType = query.vehicleType as any;
    const isOperational =
      query.isOperational !== undefined ? query.isOperational === 'true' : undefined;
    const search = query.search as string | undefined;

    const where: any = {
      deletedAt: null,
      ...(vehicleType ? { vehicleType } : {}),
      ...(isOperational !== undefined ? { isOperational } : {}),
      ...(search
        ? {
            OR: [
              { plateNumber: { contains: search, mode: 'insensitive' } },
              { model: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, ambulances] = await Promise.all([
      prisma.ambulance.count({ where }),
      prisma.ambulance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          driverProfile: {
            include: {
              user: { select: { name: true, email: true, phone: true } },
            },
          },
        },
      }),
    ]);

    return buildPaginatedResponse(ambulances, total, page, limit);
  }

  static async getAmbulanceById(id: string) {
    const ambulance = await prisma.ambulance.findFirst({
      where: { id, deletedAt: null },
      include: {
        driverProfile: {
          include: { user: { select: { name: true, email: true, phone: true } } },
        },
      },
    });

    if (!ambulance) {
      throw new NotFoundError('Ambulance record not found');
    }

    return ambulance;
  }

  static async updateAmbulance(id: string, data: any, actorId: string) {
    const existing = await prisma.ambulance.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('Ambulance record not found');

    const updated = await prisma.ambulance.update({
      where: { id },
      data,
      include: {
        driverProfile: {
          include: { user: { select: { name: true, email: true, phone: true } } },
        },
      },
    });

    await logAuditEvent({
      actorId,
      actorRole: 'ADMIN',
      action: 'UPDATE',
      resourceType: 'AMBULANCE',
      resourceId: id,
      oldValues: existing,
      newValues: data,
    });

    return updated;
  }

  static async softDeleteAmbulance(id: string, actorId: string) {
    const existing = await prisma.ambulance.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('Ambulance record not found');

    await prisma.ambulance.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAuditEvent({
      actorId,
      actorRole: 'ADMIN',
      action: 'DELETE',
      resourceType: 'AMBULANCE',
      resourceId: id,
    });

    return true;
  }

  static async updateDriverStatus(
    userId: string,
    data: { status: 'AVAILABLE' | 'BUSY' | 'OFFLINE'; latitude?: number; longitude?: number }
  ) {
    const profile = await prisma.driverProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundError('Driver profile not found for this account');
    }

    const updated = await prisma.driverProfile.update({
      where: { id: profile.id },
      data: {
        status: data.status,
        ...(data.latitude !== undefined ? { currentLat: data.latitude } : {}),
        ...(data.longitude !== undefined ? { currentLng: data.longitude } : {}),
        lastLocationUpdate: new Date(),
      },
      include: { ambulance: true },
    });

    // Cache coordinates in Redis for real-time spatial lookup
    if (data.latitude !== undefined && data.longitude !== undefined) {
      await RedisService.setDriverLocation(profile.id, data.latitude, data.longitude);
    }

    return updated;
  }

  static async getDriverMyVehicle(userId: string) {
    const profile = await prisma.driverProfile.findUnique({
      where: { userId },
      include: { ambulance: true },
    });
    if (!profile) throw new NotFoundError('Driver profile not found');
    return profile;
  }
}
