import { NotFoundError } from '../../common/errors/AppError.js';
import { CloudinaryService } from '../../common/services/cloudinary.service.js';
import { logAuditEvent } from '../../common/utils/auditLogger.js';
import { prisma } from '../../config/prisma.js';

export class UserService {
  static async getProfile(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        driverProfile: {
          select: {
            id: true,
            licenseNumber: true,
            status: true,
            currentLat: true,
            currentLng: true,
            lastLocationUpdate: true,
            ambulance: {
              select: {
                id: true,
                plateNumber: true,
                model: true,
                vehicleType: true,
                isOperational: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User profile not found');
    }

    return user;
  }

  static async updateProfile(userId: string, data: { name?: string; phone?: string }) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundError('User not found');

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        avatar: true,
      },
    });

    await logAuditEvent({
      actorId: userId,
      actorRole: updated.role,
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: userId,
      oldValues: { name: existing.name, phone: existing.phone },
      newValues: data,
    });

    return updated;
  }

  static async uploadAvatar(userId: string, fileBuffer: Buffer) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    const { url } = await CloudinaryService.uploadImage(fileBuffer, 'avatars');

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatar: url },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
    });

    return updated;
  }
}
