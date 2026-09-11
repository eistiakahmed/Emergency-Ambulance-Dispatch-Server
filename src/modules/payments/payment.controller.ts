import type { NextFunction, Request, Response } from 'express';
import { BadRequestError } from '../../common/errors/AppError.js';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { PaymentService } from './payment.service.js';

export class PaymentController {
  // ==============================================================================
  // Stripe Controllers
  // ==============================================================================

  static async initiate(req: Request, res: Response, next: NextFunction) {
    try {
      const { tripId, successUrl, cancelUrl } = req.body;
      const result = await PaymentService.initiatePayment(tripId, req.user!, {
        successUrl,
        cancelUrl,
      });
      return ApiResponse.created(res, result, 'Stripe payment session initialized successfully');
    } catch (error) {
      next(error);
    }
  }

  static async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      const signature = req.headers['stripe-signature'] as string;
      if (!signature) {
        throw new BadRequestError('Missing stripe-signature header');
      }

      // rawBody is attached via express.raw middleware
      const rawBody = (req as any).rawBody || req.body;
      const result = await PaymentService.handleWebhook(rawBody, signature);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ==============================================================================
  // bKash Controllers
  // ==============================================================================

  static async initiateBkash(req: Request, res: Response, next: NextFunction) {
    try {
      const { tripId, payerReference, callbackURL, agreementID } = req.body;
      const result = await PaymentService.initiateBkashPayment(tripId, req.user!, {
        payerReference,
        callbackURL,
        agreementID,
      });
      return ApiResponse.created(res, result, 'bKash payment session initialized successfully');
    } catch (error) {
      next(error);
    }
  }

  static async executeBkash(req: Request, res: Response, next: NextFunction) {
    try {
      const { paymentID } = req.body;
      const result = await PaymentService.executeBkashPayment(paymentID);
      return ApiResponse.success(res, result, 'bKash payment executed and confirmed successfully');
    } catch (error) {
      next(error);
    }
  }

  static async bkashCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const { paymentID, status, signature } = req.query as {
        paymentID: string;
        status: string;
        signature?: string;
      };

      const result = await PaymentService.handleBkashCallback({
        paymentID,
        status,
        signature,
      });

      return ApiResponse.success(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async queryBkashStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { paymentId } = req.params;
      const result = await PaymentService.queryBkashPaymentStatus(paymentId as string);
      return ApiResponse.success(res, result, 'bKash payment status retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async captureBkash(req: Request, res: Response, next: NextFunction) {
    try {
      const { paymentId } = req.params;
      const result = await PaymentService.captureBkashPayment(paymentId as string);
      return ApiResponse.success(res, result, 'bKash payment captured successfully');
    } catch (error) {
      next(error);
    }
  }

  // ==============================================================================
  // Shared Query Controllers
  // ==============================================================================

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await PaymentService.getPaymentById(req.params.id as string);
      return ApiResponse.success(res, payment, 'Payment verification details');
    } catch (error) {
      next(error);
    }
  }

  static async getByTripId(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await PaymentService.getPaymentByTripId(req.params.tripId as string);
      return ApiResponse.success(res, payment, 'Trip payment details');
    } catch (error) {
      next(error);
    }
  }
}
