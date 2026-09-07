import type { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { EmergencyService } from './emergency.service.js';

export class EmergencyController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const emergency = await EmergencyService.createEmergency(req.user!.id, req.body);
      return ApiResponse.created(
        res,
        emergency,
        'Emergency request received and queued for dispatch'
      );
    } catch (error) {
      next(error);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await EmergencyService.listEmergencies(req.query, req.user!);
      return ApiResponse.success(
        res,
        result.data,
        'Emergency requests retrieved',
        200,
        result.meta
      );
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const emergency = await EmergencyService.getEmergencyById(req.params.id as string, req.user!);
      return ApiResponse.success(res, emergency, 'Emergency request details');
    } catch (error) {
      next(error);
    }
  }

  static async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const { reason } = req.body;
      const cancelled = await EmergencyService.cancelEmergency(
        req.params.id as string,
        reason,
        req.user!
      );
      return ApiResponse.success(res, cancelled, 'Emergency request has been cancelled');
    } catch (error) {
      next(error);
    }
  }
}
