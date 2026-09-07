import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  tripId: z.string().uuid('Valid tripId is required'),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});
