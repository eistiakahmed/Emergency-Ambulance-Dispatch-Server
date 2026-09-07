import { z } from 'zod';

export const updateUserRoleSchema = z.object({
  role: z.enum(['PATIENT', 'DRIVER', 'ADMIN']),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});
