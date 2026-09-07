import { z } from 'zod';

export const createHospitalSchema = z.object({
  name: z.string().min(3, 'Hospital name must be at least 3 characters'),
  address: z.string().min(5, 'Valid address is required'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  contactPhone: z.string().min(6, 'Valid contact phone is required'),
  emergencyBedsTotal: z.number().int().positive().default(10),
  emergencyBedsAvailable: z.number().int().nonnegative().default(10),
  hasIcu: z.boolean().default(true),
  icuBedsAvailable: z.number().int().nonnegative().default(2),
});

export const updateHospitalSchema = createHospitalSchema.partial();

export const updateBedsSchema = z.object({
  emergencyBedsAvailable: z.number().int().nonnegative().optional(),
  icuBedsAvailable: z.number().int().nonnegative().optional(),
});
