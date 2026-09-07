import type { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { TripService } from './trip.service.js';

export class TripController {
  static async dispatch(req: Request, res: Response, next: NextFunction) {
    try {
      const trip = await TripService.dispatch(req.body, req.user!);
      return ApiResponse.created(res, trip, 'Ambulance successfully dispatched to emergency');
    } catch (error) {
      next(error);
    }
  }

  static async getActiveTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const trip = await TripService.getActiveTrip(req.user!);
      return ApiResponse.success(res, trip, 'Active trip retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const trip = await TripService.getTripById(req.params.id as string, req.user!);
      return ApiResponse.success(res, trip, 'Trip details and milestone history');
    } catch (error) {
      next(error);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const trip = await TripService.updateTripStatus(req.params.id as string, req.body, req.user!);
      return ApiResponse.success(res, trip, `Trip status updated to ${req.body.status}`);
    } catch (error) {
      next(error);
    }
  }

  static async reassign(req: Request, res: Response, next: NextFunction) {
    try {
      const { newAmbulanceId, reason } = req.body;
      const trip = await TripService.reassignTrip(
        req.params.id as string,
        newAmbulanceId,
        reason,
        req.user!
      );
      return ApiResponse.success(res, trip, 'Trip successfully reassigned to backup ambulance');
    } catch (error) {
      next(error);
    }
  }
}
