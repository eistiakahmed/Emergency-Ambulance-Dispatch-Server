import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  phone: z.string().optional(),
  role: z.enum(['PATIENT', 'DRIVER']).default('PATIENT'),
  // Driver specific optional fields
  licenseNumber: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(10, 'Google ID Token is required'),
  role: z.enum(['PATIENT', 'DRIVER']).optional().default('PATIENT'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});
