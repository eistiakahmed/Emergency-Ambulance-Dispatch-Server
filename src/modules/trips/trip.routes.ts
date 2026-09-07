import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requireRoles } from '../../common/middlewares/role.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import { TripController } from './trip.controller.js';
import {
  dispatchTripSchema,
  reassignTripSchema,
  updateTripStatusSchema,
} from './trip.validation.js';

const router = Router();

router.use(authenticate);

// Dispatch an ambulance (Admin / Dispatcher)
router.post(
  '/dispatch',
  requireRoles('ADMIN'),
  validate({ body: dispatchTripSchema }),
  TripController.dispatch
);

// Active trip for driver or patient
router.get('/active', TripController.getActiveTrip);

// Get trip by ID
router.get('/:id', TripController.getById);

// Driver / Admin status milestone progression
router.patch(
  '/:id/status',
  requireRoles('DRIVER', 'ADMIN'),
  validate({ body: updateTripStatusSchema }),
  TripController.updateStatus
);

// Reassign trip in emergency breakdown
router.post(
  '/:id/reassign',
  requireRoles('ADMIN'),
  validate({ body: reassignTripSchema }),
  TripController.reassign
);

export default router;
