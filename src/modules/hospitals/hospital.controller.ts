import type { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { HospitalService } from './hospital.service.js';

export class HospitalController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const hospital = await HospitalService.createHospital(req.body, req.user!.id);
      return ApiResponse.created(res, hospital, 'Hospital created successfully');
    } catch (error) {
      next(error);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await HospitalService.listHospitals(req.query);
      return ApiResponse.success(
        res,
        result.data,
        'Hospitals retrieved successfully',
        200,
        result.meta
      );
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const hospital = await HospitalService.getHospitalById(req.params.id as string);
      return ApiResponse.success(res, hospital, 'Hospital details retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await HospitalService.updateHospital(
        req.params.id as string,
        req.body,
        req.user!.id
      );
      return ApiResponse.success(res, updated, 'Hospital updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async updateBeds(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await HospitalService.updateBeds(
        req.params.id as string,
        req.body,
        req.user!.id
      );
      return ApiResponse.success(res, updated, 'Hospital bed capacity updated');
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await HospitalService.softDeleteHospital(req.params.id as string, req.user!.id);
      return ApiResponse.success(res, null, 'Hospital soft deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}
