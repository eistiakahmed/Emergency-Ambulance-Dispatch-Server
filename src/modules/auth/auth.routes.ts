import { Router } from 'express';
import { authRateLimiter } from '../../common/middlewares/rateLimiter.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import { AuthController } from './auth.controller.js';
import {
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from './auth.validation.js';

const router = Router();

// Standard Auth
router.post(
  '/register',
  authRateLimiter,
  validate({ body: registerSchema }),
  AuthController.register
);

router.post('/login', authRateLimiter, validate({ body: loginSchema }), AuthController.login);

router.post(
  '/google',
  authRateLimiter,
  validate({ body: googleAuthSchema }),
  AuthController.googleLogin
);

router.get('/google-client-id', AuthController.getGoogleClientId);

router.post('/refresh-token', validate({ body: refreshTokenSchema }), AuthController.refreshToken);

router.post('/logout', AuthController.logout);

// Redis-powered OTP & Password Reset
router.post(
  '/send-otp',
  authRateLimiter,
  validate({ body: sendOtpSchema }),
  AuthController.sendOtp
);

router.post(
  '/verify-otp',
  authRateLimiter,
  validate({ body: verifyOtpSchema }),
  AuthController.verifyOtp
);

router.post(
  '/forgot-password',
  authRateLimiter,
  validate({ body: forgotPasswordSchema }),
  AuthController.forgotPassword
);

router.post(
  '/reset-password',
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  AuthController.resetPassword
);

export default router;
