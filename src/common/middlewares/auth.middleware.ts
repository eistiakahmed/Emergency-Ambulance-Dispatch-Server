import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { UnauthorizedError } from '../errors/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication required: Bearer token is missing');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('Bearer token is malformed');
    }

    const decoded = verifyAccessToken(token);

    // Verify user is active and not soft-deleted
    const user = await prisma.user.findFirst({
      where: {
        id: decoded.id,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User account not found or has been removed');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('User account has been deactivated by administrator');
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}
