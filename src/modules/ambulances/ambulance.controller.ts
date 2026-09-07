import type { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { AmbulanceService } from './ambulance.service.js';

export class AmbulanceController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const ambulance = await AmbulanceService.createAmbulance(req.body, req.user!.id);
      return ApiResponse.created(res, ambulance, 'Ambulance registered successfully');
    } catch (error) {
      next(error);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AmbulanceService.listAmbulances(req.query);
      return ApiResponse.success(
        res,
        result.data,
        'Ambulances retrieved successfully',
        200,
        result.meta
      );
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const ambulance = await AmbulanceService.getAmbulanceById(req.params.id as string);
      return ApiResponse.success(res, ambulance, 'Ambulance details retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await AmbulanceService.updateAmbulance(
        req.params.id as string,
        req.body,
        req.user!.id
      );
      return ApiResponse.success(res, updated, 'Ambulance updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await AmbulanceService.softDeleteAmbulance(req.params.id as string, req.user!.id);
      return ApiResponse.success(res, null, 'Ambulance soft deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  static async updateDriverStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await AmbulanceService.updateDriverStatus(req.user!.id, req.body);
      return ApiResponse.success(res, profile, 'Driver shift and location status updated');
    } catch (error) {
      next(error);
    }
  }

  static async getMyVehicle(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await AmbulanceService.getDriverMyVehicle(req.user!.id);
      return ApiResponse.success(res, profile, 'Assigned ambulance and driver profile retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async getNearby(req: Request, res: Response, next: NextFunction) {
    try {
      const { latitude, longitude, radiusKm, vehicleType } = req.query as any;
      const ambulances = await AmbulanceService.findNearbyAmbulances({
        latitude: Number(latitude),
        longitude: Number(longitude),
        radiusKm: radiusKm ? Number(radiusKm) : undefined,
        vehicleType: vehicleType as string,
      });
      return ApiResponse.success(
        res,
        ambulances,
        `Found ${ambulances.length} available ambulances nearby`
      );
    } catch (error) {
      next(error);
    }
  }
}
