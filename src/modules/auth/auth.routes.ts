import { Router } from 'express';
import { authRateLimiter } from '../../common/middlewares/rateLimiter.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import { AuthController } from './auth.controller.js';
import {
  googleAuthSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from './auth.validation.js';

const router = Router();

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

router.post('/refresh-token', validate({ body: refreshTokenSchema }), AuthController.refreshToken);

router.post('/logout', AuthController.logout);

export default router;
