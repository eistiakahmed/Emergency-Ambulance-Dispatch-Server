import { NotFoundError } from '../../common/errors/AppError.js';
import { RedisService } from '../../common/services/redis.service.js';
import { logAuditEvent } from '../../common/utils/auditLogger.js';
import { buildPaginatedResponse, parsePaginationParams } from '../../common/utils/pagination.js';
import { prisma } from '../../config/prisma.js';

export class HospitalService {
  static async createHospital(data: any, actorId: string) {
    const hospital = await prisma.hospital.create({
      data,
    });

    await logAuditEvent({
      actorId,
      actorRole: 'ADMIN',
      action: 'CREATE',
      resourceType: 'HOSPITAL',
      resourceId: hospital.id,
      newValues: data,
    });

    await RedisService.del('hospitals:list:*');
    return hospital;
  }

  static async listHospitals(query: any) {
    const { page, limit, skip, sortBy, sortOrder } = parsePaginationParams(query);
    const search = query.search as string | undefined;
    const hasIcu = query.hasIcu !== undefined ? query.hasIcu === 'true' : undefined;
    const minBeds = query.minBeds ? parseInt(query.minBeds as string, 10) : undefined;

    const where: any = {
      deletedAt: null,
      ...(hasIcu !== undefined ? { hasIcu } : {}),
      ...(minBeds !== undefined ? { emergencyBedsAvailable: { gte: minBeds } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { address: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, hospitals] = await Promise.all([
      prisma.hospital.count({ where }),
      prisma.hospital.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
    ]);

    return buildPaginatedResponse(hospitals, total, page, limit);
  }

  static async getHospitalById(id: string) {
    const hospital = await prisma.hospital.findFirst({
      where: { id, deletedAt: null },
    });

    if (!hospital) {
      throw new NotFoundError('Hospital facility not found');
    }

    return hospital;
  }

  static async updateHospital(id: string, data: any, actorId: string) {
    const existing = await prisma.hospital.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('Hospital facility not found');

    const updated = await prisma.hospital.update({
      where: { id },
      data,
    });

    await logAuditEvent({
      actorId,
      actorRole: 'ADMIN',
      action: 'UPDATE',
      resourceType: 'HOSPITAL',
      resourceId: id,
      oldValues: existing,
      newValues: data,
    });

    return updated;
  }

  static async updateBeds(
    id: string,
    data: { emergencyBedsAvailable?: number; icuBedsAvailable?: number },
    actorId: string
  ) {
    const existing = await prisma.hospital.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('Hospital facility not found');

    const updated = await prisma.hospital.update({
      where: { id },
      data: {
        ...(data.emergencyBedsAvailable !== undefined
          ? { emergencyBedsAvailable: data.emergencyBedsAvailable }
          : {}),
        ...(data.icuBedsAvailable !== undefined ? { icuBedsAvailable: data.icuBedsAvailable } : {}),
      },
    });

    await logAuditEvent({
      actorId,
      actorRole: 'ADMIN',
      action: 'STATUS_CHANGE',
      resourceType: 'HOSPITAL',
      resourceId: id,
      oldValues: {
        emergencyBedsAvailable: existing.emergencyBedsAvailable,
        icuBedsAvailable: existing.icuBedsAvailable,
      },
      newValues: data,
    });

    return updated;
  }

  static async softDeleteHospital(id: string, actorId: string) {
    const existing = await prisma.hospital.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('Hospital facility not found');

    await prisma.hospital.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAuditEvent({
      actorId,
      actorRole: 'ADMIN',
      action: 'DELETE',
      resourceType: 'HOSPITAL',
      resourceId: id,
    });

    return true;
  }
}
