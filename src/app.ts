import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { errorHandler } from './common/middlewares/error.middleware.js';
import { globalRateLimiter } from './common/middlewares/rateLimiter.middleware.js';
import { ApiResponse } from './common/responses/ApiResponse.js';
import { env } from './config/env.js';
import adminRoutes from './modules/admin/admin.routes.js';
import ambulanceRoutes from './modules/ambulances/ambulance.routes.js';
// Route imports
import authRoutes from './modules/auth/auth.routes.js';
import emergencyRoutes from './modules/emergencies/emergency.routes.js';
import hospitalRoutes from './modules/hospitals/hospital.routes.js';
import paymentRoutes from './modules/payments/payment.routes.js';
import tripRoutes from './modules/trips/trip.routes.js';
import userRoutes from './modules/users/user.routes.js';

export const app = express();

// 1. Security & Core Middlewares
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL || '*',
    credentials: true,
  })
);
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// 2. Stripe Webhook Raw Body Handling (must be applied before express.json)
app.use(
  `${env.API_PREFIX}/payments/webhook`,
  express.raw({ type: 'application/json' }),
  (req, _res, next) => {
    (req as any).rawBody = req.body;
    next();
  }
);

// 3. JSON & URL-Encoded Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Rate Limiter
app.use(globalRateLimiter);

// 5. Swagger Interactive API Documentation
try {
  const swaggerPath = join(process.cwd(), 'src/docs/swagger.json');
  const swaggerDoc = JSON.parse(readFileSync(swaggerPath, 'utf8'));
  app.use(`${env.API_PREFIX}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerDoc));
} catch (err) {
  console.warn('⚠️ Could not load swagger.json for /docs:', err);
}

// 6. Health Check Endpoint
app.get(`${env.API_PREFIX}/health`, (_req: Request, res: Response) => {
  return ApiResponse.success(
    res,
    {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
    },
    'Emergency Ambulance Dispatch System API is operational'
  );
});

// 7. Mount Domain API Routes
app.use(`${env.API_PREFIX}/auth`, authRoutes);
app.use(`${env.API_PREFIX}/users`, userRoutes);
app.use(`${env.API_PREFIX}/hospitals`, hospitalRoutes);
app.use(`${env.API_PREFIX}/ambulances`, ambulanceRoutes);
app.use(`${env.API_PREFIX}/emergencies`, emergencyRoutes);
app.use(`${env.API_PREFIX}/trips`, tripRoutes);
app.use(`${env.API_PREFIX}/payments`, paymentRoutes);
app.use(`${env.API_PREFIX}/admin`, adminRoutes);

// 8. 404 Route Not Found Handler
app.use((req: Request, res: Response) => {
  return ApiResponse.error(
    res,
    `Cannot find requested endpoint ${req.method} ${req.originalUrl}`,
    404
  );
});

// 9. Centralized Error Filter
app.use(errorHandler);
