import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../errors/AppError.js';
import { ApiResponse } from '../responses/ApiResponse.js';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  // 1. Operational AppError
  if (err instanceof AppError) {
    return ApiResponse.error(res, err.message, err.statusCode, err.errors);
  }

  // 2. Zod Validation Error
  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return ApiResponse.error(res, 'Validation failed for request input', 400, formattedErrors);
  }

  // 3. Prisma Database Constraint Errors
  if (err?.name === 'PrismaClientKnownRequestError' || err?.code?.startsWith?.('P')) {
    // Unique constraint violation
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || [];
      const field = target.join(', ');
      return ApiResponse.error(res, `A record with this ${field || 'value'} already exists`, 409, [
        { field, message: 'Unique constraint violation' },
      ]);
    }

    // Record not found
    if (err.code === 'P2025') {
      return ApiResponse.error(res, 'Requested database record was not found', 404);
    }

    // Foreign key failure
    if (err.code === 'P2003') {
      return ApiResponse.error(
        res,
        'Related record was not found or foreign key constraint failed',
        400
      );
    }
  }

  // 4. JWT Errors
  if (err.name === 'JsonWebTokenError') {
    return ApiResponse.error(res, 'Invalid authentication token signature', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return ApiResponse.error(res, 'Authentication token has expired, please refresh token', 401);
  }

  // 5. Multer file upload errors
  if (err.name === 'MulterError') {
    return ApiResponse.error(res, `File upload error: ${err.message}`, 400);
  }

  // 6. Unknown Internal Server Error
  console.error('🔥 Unexpected Server Error:', err);
  const message = env.NODE_ENV === 'production' ? 'Internal server error occurred' : err.message;
  return ApiResponse.error(res, message, 500);
}
