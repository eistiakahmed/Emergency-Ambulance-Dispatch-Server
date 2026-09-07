import type { Response } from 'express';
import httpStatus from 'http-status';

export interface StandardSuccessResponse<T = any> {
  success: true;
  message: string;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface StandardErrorResponse {
  success: false;
  message: string;
  errors: any[];
}

export class ApiResponse {
  static success<T>(
    res: Response,
    data: T,
    message = 'Operation successful',
    statusCode: number = httpStatus.OK,
    meta?: StandardSuccessResponse<T>['meta']
  ) {
    const payload: StandardSuccessResponse<T> = {
      success: true,
      message,
      data,
      ...(meta ? { meta } : {}),
    };
    return res.status(statusCode).json(payload);
  }

  static created<T>(res: Response, data: T, message = 'Resource created successfully') {
    return ApiResponse.success(res, data, message, httpStatus.CREATED);
  }

  static error(
    res: Response,
    message = 'Something went wrong',
    statusCode = 500,
    errors: any[] = []
  ) {
    const payload: StandardErrorResponse = {
      success: false,
      message,
      errors,
    };
    return res.status(statusCode).json(payload);
  }
}
