import type { Role } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';

export function requireRoles(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required before checking permissions'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access denied: requires one of the following roles: [${allowedRoles.join(', ')}]`
        )
      );
    }

    next();
  };
}
