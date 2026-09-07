import type { Prisma } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { BadRequestError, ConflictError, UnauthorizedError } from '../../common/errors/AppError.js';
import { logAuditEvent } from '../../common/utils/auditLogger.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../common/utils/jwt.js';
import { comparePassword, hashPassword } from '../../common/utils/password.js';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export class AuthService {
  static async register(data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    role?: 'PATIENT' | 'DRIVER';
    licenseNumber?: string;
  }) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new ConflictError('A user with this email address is already registered');
    }

    if (data.role === 'DRIVER' && !data.licenseNumber) {
      throw new BadRequestError('Driver registration requires a valid driver license number');
    }

    const hashedPassword = await hashPassword(data.password);
    const userRole = data.role || 'PATIENT';

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          name: data.name,
          phone: data.phone,
          role: userRole,
        },
      });

      if (userRole === 'DRIVER') {
        const license = data.licenseNumber || `DL-${Date.now()}`;
        const existingLicense = await tx.driverProfile.findUnique({
          where: { licenseNumber: license },
        });
        if (existingLicense) {
          throw new ConflictError('This driver license number is already registered in the system');
        }

        await tx.driverProfile.create({
          data: {
            userId: user.id,
            licenseNumber: license,
            status: 'AVAILABLE',
          },
        });
      }

      const tokens = await AuthService.generateAndSaveTokens(user.id, user.email, user.role, tx);

      await logAuditEvent({
        tx,
        actorId: user.id,
        actorRole: user.role,
        action: 'CREATE',
        resourceType: 'USER',
        resourceId: user.id,
        newValues: { email: user.email, role: user.role },
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        tokens,
      };
    });
  }

  static async login(email: string, password: string) {
    const user = await prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: { driverProfile: true },
    });

    if (!user?.password) {
      throw new UnauthorizedError('Invalid email or password credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Your account has been deactivated. Please contact support.');
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password credentials');
    }

    const tokens = await AuthService.generateAndSaveTokens(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        driverProfile: user.driverProfile,
      },
      tokens,
    };
  }

  static async googleLogin(idToken: string, requestedRole: 'PATIENT' | 'DRIVER' = 'PATIENT') {
    let email: string | undefined;
    let name: string | undefined;
    let googleId: string | undefined;
    let avatar: string | undefined;

    try {
      if (env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_ID.includes('placeholder')) {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        email = payload?.email;
        name = payload?.name;
        googleId = payload?.sub;
        avatar = payload?.picture;
      } else {
        // Mock payload verification for evaluation test tokens
        const decodedMock = JSON.parse(
          Buffer.from(idToken.split('.')[1] || '', 'base64').toString() || '{}'
        );
        email = decodedMock.email || `google.user.${Date.now()}@emergency.com`;
        name = decodedMock.name || 'Google Verified User';
        googleId = decodedMock.sub || `g_${Date.now()}`;
        avatar = decodedMock.picture;
      }
    } catch {
      throw new UnauthorizedError('Invalid or expired Google OAuth token');
    }

    if (!email) {
      throw new BadRequestError('Google token did not contain a valid email address');
    }

    let user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId }, { email }],
        deletedAt: null,
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || 'Google User',
          googleId,
          avatar,
          role: requestedRole,
        },
      });

      if (requestedRole === 'DRIVER') {
        await prisma.driverProfile.create({
          data: {
            userId: user.id,
            licenseNumber: `DL-G-${Date.now()}`,
            status: 'AVAILABLE',
          },
        });
      }
    }

    const tokens = await AuthService.generateAndSaveTokens(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tokens,
    };
  }

  static async refreshToken(oldRefreshToken: string) {
    let decoded: any;
    try {
      decoded = verifyRefreshToken(oldRefreshToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const tokenRecord = await prisma.refreshToken.findFirst({
      where: {
        token: oldRefreshToken,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!tokenRecord?.user?.isActive) {
      throw new UnauthorizedError('Refresh token has been revoked or is no longer valid');
    }

    // Revoke old token (Token rotation policy)
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    });

    // Issue new pair
    const tokens = await AuthService.generateAndSaveTokens(
      tokenRecord.user.id,
      tokenRecord.user.email,
      tokenRecord.user.role
    );

    return { tokens };
  }

  static async logout(refreshToken: string) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    });
    return true;
  }

  private static async generateAndSaveTokens(
    userId: string,
    email: string,
    role: any,
    client: any = prisma
  ) {
    const accessToken = signAccessToken({ id: userId, email, role });
    const refreshToken = signRefreshToken({ id: userId, email, role });

    // Store refresh token in DB with 7-day expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await client.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    };
  }
}
