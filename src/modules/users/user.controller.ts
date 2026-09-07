import type { NextFunction, Request, Response } from 'express';
import { BadRequestError } from '../../common/errors/AppError.js';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { UserService } from './user.service.js';

export class UserController {
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.getProfile(req.user!.id);
      return ApiResponse.success(res, user, 'User profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.updateProfile(req.user!.id, req.body);
      return ApiResponse.success(res, user, 'User profile updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async uploadAvatar(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file?.buffer) {
        throw new BadRequestError('Avatar image file is required');
      }
      const user = await UserService.uploadAvatar(req.user!.id, req.file.buffer);
      return ApiResponse.success(res, user, 'Avatar uploaded successfully');
    } catch (error) {
      next(error);
    }
  }
}
