import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  phone: z.string().optional(),
  role: z
    .preprocess(
      (val) => (typeof val === 'string' ? val.toUpperCase() : val),
      z.enum(['PATIENT', 'DRIVER'])
    )
    .default('PATIENT'),
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
  refreshToken: z.string().optional(),
});

export const sendOtpSchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string().optional().default('User'),
});

export const verifyOtpSchema = z.object({
  email: z.string().email('Valid email is required'),
  otp: z.string().min(4).max(8, 'Valid OTP is required'),
  purpose: z.enum(['VERIFY_EMAIL', 'FORGOT_PASSWORD']).default('VERIFY_EMAIL'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email is required'),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Valid email is required'),
  otp: z.string().min(4).max(8, 'Valid OTP code is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters long'),
});
