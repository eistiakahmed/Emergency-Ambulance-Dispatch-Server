import type { Prisma } from '@prisma/client';
import { BadRequestError, NotFoundError } from '../../common/errors/AppError.js';
import { logAuditEvent } from '../../common/utils/auditLogger.js';
import { buildPaginatedResponse, parsePaginationParams } from '../../common/utils/pagination.js';
import { prisma } from '../../config/prisma.js';

export class AdminService {
  static async listUsers(query: any) {
    const { page, limit, skip, sortBy, sortOrder } = parsePaginationParams(query);
    const search = query.search as string | undefined;
    const role = query.role as any;
    const isActive = query.isActive !== undefined ? query.isActive === 'true' : undefined;

    const where: any = {
      deletedAt: null,
      ...(role ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          driverProfile: {
            select: {
              id: true,
              licenseNumber: true,
              status: true,
            },
          },
        },
      }),
    ]);

    return buildPaginatedResponse(users, total, page, limit);
  }

  static async updateUserRole(
    targetUserId: string,
    newRole: 'PATIENT' | 'DRIVER' | 'ADMIN',
    adminId: string
  ) {
    const user = await prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
    });

    if (!user) throw new NotFoundError('User not found');

    if (user.id === adminId && newRole !== 'ADMIN') {
      throw new BadRequestError('Cannot demote your own administrator account');
    }

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedUser = await tx.user.update({
        where: { id: targetUserId },
        data: { role: newRole },
        select: { id: true, email: true, name: true, role: true },
      });

      // If promoted to driver and no driver profile exists, create one
      if (newRole === 'DRIVER') {
        const existingProfile = await tx.driverProfile.findUnique({
          where: { userId: targetUserId },
        });
        if (!existingProfile) {
          await tx.driverProfile.create({
            data: {
              userId: targetUserId,
              licenseNumber: `DL-PROMOTE-${Date.now()}`,
              status: 'AVAILABLE',
            },
          });
        }
      }

      await logAuditEvent({
        actorId: adminId,
        actorRole: 'ADMIN',
        action: 'UPDATE',
        resourceType: 'USER',
        resourceId: targetUserId,
        oldValues: { role: user.role },
        newValues: { role: newRole },
      });

      return updatedUser;
    });

    return updated;
  }

  static async updateUserStatus(targetUserId: string, isActive: boolean, adminId: string) {
    const user = await prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
    });

    if (!user) throw new NotFoundError('User not found');

    if (user.id === adminId && !isActive) {
      throw new BadRequestError('Cannot deactivate your own administrator account');
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { isActive },
      select: { id: true, email: true, name: true, isActive: true },
    });

    await logAuditEvent({
      actorId: adminId,
      actorRole: 'ADMIN',
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: targetUserId,
      oldValues: { isActive: user.isActive },
      newValues: { isActive },
    });

    return updated;
  }

  static async getDashboardStats() {
    const [
      totalUsers,
      totalDrivers,
      activeEmergencies,
      activeTrips,
      completedTrips,
      operationalAmbulances,
      totalAmbulances,
      availableBeds,
      paymentAggregate,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.driverProfile.count({ where: { deletedAt: null } }),
      prisma.emergencyRequest.count({ where: { status: 'PENDING', deletedAt: null } }),
      prisma.trip.count({
        where: {
          status: {
            in: [
              'ASSIGNED',
              'EN_ROUTE_PICKUP',
              'PATIENT_PICKED_UP',
              'EN_ROUTE_HOSPITAL',
              'ARRIVED_HOSPITAL',
            ],
          },
          deletedAt: null,
        },
      }),
      prisma.trip.count({ where: { status: 'COMPLETED', deletedAt: null } }),
      prisma.ambulance.count({ where: { isOperational: true, deletedAt: null } }),
      prisma.ambulance.count({ where: { deletedAt: null } }),
      prisma.hospital.aggregate({
        _sum: { emergencyBedsAvailable: true, icuBedsAvailable: true },
        where: { deletedAt: null },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        _count: { id: true },
        where: { status: 'SUCCEEDED' },
      }),
    ]);

    const fleetUtilizationRate =
      totalAmbulances > 0 ? Math.round((activeTrips / totalAmbulances) * 100) : 0;

    return {
      overview: {
        totalUsers,
        totalDrivers,
        activeEmergencies,
        activeTrips,
        completedTrips,
      },
      fleet: {
        totalAmbulances,
        operationalAmbulances,
        fleetUtilizationRate: `${fleetUtilizationRate}%`,
      },
      capacity: {
        totalEmergencyBedsAvailable: availableBeds._sum.emergencyBedsAvailable || 0,
        totalIcuBedsAvailable: availableBeds._sum.icuBedsAvailable || 0,
      },
      revenue: {
        totalRevenueUsd: paymentAggregate._sum.amount || 0,
        settledTransactionsCount: paymentAggregate._count.id || 0,
      },
    };
  }

  static async listAuditLogs(query: any) {
    const { page, limit, skip, sortBy, sortOrder } = parsePaginationParams(query);
    const action = query.action as any;
    const resourceType = query.resourceType as string | undefined;
    const actorId = query.actorId as string | undefined;

    const where: any = {
      ...(action ? { action } : {}),
      ...(resourceType ? { resourceType } : {}),
      ...(actorId ? { actorId } : {}),
    };

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          actor: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
    ]);

    return buildPaginatedResponse(logs, total, page, limit);
  }
}
