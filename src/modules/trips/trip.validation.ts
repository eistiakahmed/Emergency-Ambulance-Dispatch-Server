import { z } from 'zod';

export const dispatchTripSchema = z.object({
  emergencyRequestId: z.string().uuid('Valid emergencyRequestId is required'),
  ambulanceId: z.string().uuid().optional(), // Optional: manual override by dispatcher, else auto-matched
});

export const updateTripStatusSchema = z.object({
  status: z.enum([
    'ASSIGNED',
    'EN_ROUTE_PICKUP',
    'PATIENT_PICKED_UP',
    'EN_ROUTE_HOSPITAL',
    'ARRIVED_HOSPITAL',
    'COMPLETED',
    'CANCELLED',
  ]),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  note: z.string().optional(),
  hospitalId: z.string().uuid().optional(),
  distanceKm: z.number().nonnegative().optional(),
});

export const reassignTripSchema = z.object({
  newAmbulanceId: z.string().uuid('Valid newAmbulanceId is required'),
  reason: z.string().min(5, 'Reassignment reason is required'),
});
