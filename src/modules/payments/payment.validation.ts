import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  tripId: z.string().uuid('Valid tripId is required'),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export const initiateBkashPaymentSchema = z.object({
  tripId: z.string().uuid('Valid tripId is required'),
  payerReference: z.string().max(255).optional(),
  callbackURL: z.string().url().optional(),
  agreementID: z.string().optional(),
});

export const executeBkashPaymentSchema = z.object({
  paymentID: z.string().min(1, 'paymentID is required'),
});

export const bkashCallbackQuerySchema = z.object({
  paymentID: z.string().min(1, 'paymentID is required'),
  status: z.enum(['success', 'failure', 'cancel']),
  signature: z.string().optional(),
});

export const bkashPaymentParamSchema = z.object({
  paymentId: z.string().min(1, 'paymentId is required'),
});
