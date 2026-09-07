import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requireRoles } from '../../common/middlewares/role.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import { AmbulanceController } from './ambulance.controller.js';
import {
  createAmbulanceSchema,
  getNearbyAmbulancesSchema,
  updateAmbulanceSchema,
  updateDriverStatusSchema,
} from './ambulance.validation.js';

const router = Router();

router.use(authenticate);

// Driver specific routes
router.patch(
  '/driver/status',
  requireRoles('DRIVER'),
  validate({ body: updateDriverStatusSchema }),
  AmbulanceController.updateDriverStatus
);

router.get('/driver/me', requireRoles('DRIVER'), AmbulanceController.getMyVehicle);

// Fleet listing, nearby search & details
router.get(
  '/nearby',
  validate({ query: getNearbyAmbulancesSchema }),
  AmbulanceController.getNearby
);
router.get('/', AmbulanceController.list);
router.get('/:id', AmbulanceController.getById);

// Admin only fleet mutations
router.post(
  '/',
  requireRoles('ADMIN'),
  validate({ body: createAmbulanceSchema }),
  AmbulanceController.create
);

router.patch(
  '/:id',
  requireRoles('ADMIN'),
  validate({ body: updateAmbulanceSchema }),
  AmbulanceController.update
);

router.delete('/:id', requireRoles('ADMIN'), AmbulanceController.delete);

export default router;
