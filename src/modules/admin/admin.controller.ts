import type { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { AdminService } from './admin.service.js';

export class AdminController {
  static async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminService.listUsers(req.query);
      return ApiResponse.success(
        res,
        result.data,
        'Users retrieved successfully',
        200,
        result.meta
      );
    } catch (error) {
      next(error);
    }
  }

  static async updateUserRole(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await AdminService.updateUserRole(
        req.params.id as string,
        req.body.role,
        req.user!.id
      );
      return ApiResponse.success(res, updated, 'User role updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async updateUserStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await AdminService.updateUserStatus(
        req.params.id as string,
        req.body.isActive,
        req.user!.id
      );
      return ApiResponse.success(res, updated, 'User account status updated');
    } catch (error) {
      next(error);
    }
  }

  static async getDashboardStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await AdminService.getDashboardStats();
      return ApiResponse.success(res, stats, 'Operational dashboard KPI statistics');
    } catch (error) {
      next(error);
    }
  }

  static async listAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminService.listAuditLogs(req.query);
      return ApiResponse.success(res, result.data, 'Audit logs retrieved', 200, result.meta);
    } catch (error) {
      next(error);
    }
  }
}
