import { z } from 'zod';

export const createEmergencySchema = z.object({
  patientName: z.string().min(2, 'Patient name is required'),
  patientPhone: z.string().min(6, 'Valid contact phone number is required'),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  pickupAddress: z.string().min(5, 'Detailed pickup address is required'),
  pickupLatitude: z.number().min(-90).max(90),
  pickupLongitude: z.number().min(-180).max(180),
  symptoms: z.string().min(3, 'Symptoms description is required'),
  notes: z.string().optional(),
  destinationHospitalId: z.string().uuid().optional(),
});

export const cancelEmergencySchema = z.object({
  reason: z.string().min(3, 'Cancellation reason is required'),
});
