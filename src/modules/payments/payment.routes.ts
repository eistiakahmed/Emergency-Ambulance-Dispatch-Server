import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requireRoles } from '../../common/middlewares/role.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import { PaymentController } from './payment.controller.js';
import {
  bkashCallbackQuerySchema,
  bkashPaymentParamSchema,
  executeBkashPaymentSchema,
  initiateBkashPaymentSchema,
  initiatePaymentSchema,
} from './payment.validation.js';

const router = Router();

// ==============================================================================
// Public Callbacks & Webhooks (No Bearer Header Required)
// ==============================================================================

// Stripe Webhook (uses raw body & Stripe signature verification)
router.post('/webhook', PaymentController.webhook);

// bKash Browser Callback (bKash redirects here with ?paymentID=...&status=...)
router.get(
  '/bkash/callback',
  validate({ query: bkashCallbackQuerySchema }),
  PaymentController.bkashCallback
);

// ==============================================================================
// Protected Payment Routes
// ==============================================================================
router.use(authenticate);

// Stripe Checkout
router.post('/initiate', validate({ body: initiatePaymentSchema }), PaymentController.initiate);

// bKash Tokenized Checkout
router.post(
  '/bkash/initiate',
  requireRoles('PATIENT'),
  validate({ body: initiateBkashPaymentSchema }),
  PaymentController.initiateBkash
);

router.post(
  '/bkash/execute',
  validate({ body: executeBkashPaymentSchema }),
  PaymentController.executeBkash
);

router.get(
  '/bkash/status/:paymentId',
  validate({ params: bkashPaymentParamSchema }),
  PaymentController.queryBkashStatus
);

router.post(
  '/bkash/capture/:paymentId',
  requireRoles('ADMIN'),
  validate({ params: bkashPaymentParamSchema }),
  PaymentController.captureBkash
);

// Shared Payment Query Endpoints
router.get('/:id', PaymentController.getById);
router.get('/trip/:tripId', PaymentController.getByTripId);

export default router;
