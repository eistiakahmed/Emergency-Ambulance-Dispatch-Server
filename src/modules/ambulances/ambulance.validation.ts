import { z } from 'zod';

export const createAmbulanceSchema = z.object({
  plateNumber: z.string().min(3, 'Plate number is required'),
  model: z.string().min(2, 'Model is required'),
  vehicleType: z
    .enum(['BASIC_LIFE_SUPPORT', 'ADVANCED_LIFE_SUPPORT', 'PATIENT_TRANSPORT', 'NEONATAL'])
    .default('BASIC_LIFE_SUPPORT'),
  driverProfileId: z.string().uuid().optional(),
  isOperational: z.boolean().default(true),
  equipment: z.array(z.string()).default([]),
});

export const updateAmbulanceSchema = createAmbulanceSchema.partial();

export const updateDriverStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'BUSY', 'OFFLINE']),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
