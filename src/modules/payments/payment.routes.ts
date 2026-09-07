import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import { PaymentController } from './payment.controller.js';
import { initiatePaymentSchema } from './payment.validation.js';

const router = Router();

// Stripe Webhook (No auth header, uses raw body & Stripe signature verification)
router.post('/webhook', PaymentController.webhook);

// Protected routes
router.use(authenticate);

router.post('/initiate', validate({ body: initiatePaymentSchema }), PaymentController.initiate);

router.get('/:id', PaymentController.getById);
router.get('/trip/:tripId', PaymentController.getByTripId);

export default router;
