import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requireRoles } from '../../common/middlewares/role.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import { HospitalController } from './hospital.controller.js';
import {
  createHospitalSchema,
  updateBedsSchema,
  updateHospitalSchema,
} from './hospital.validation.js';

const router = Router();

// Public / Authenticated read access
router.get('/', authenticate, HospitalController.list);
router.get('/:id', authenticate, HospitalController.getById);

// Admin only management
router.post(
  '/',
  authenticate,
  requireRoles('ADMIN'),
  validate({ body: createHospitalSchema }),
  HospitalController.create
);

router.patch(
  '/:id',
  authenticate,
  requireRoles('ADMIN'),
  validate({ body: updateHospitalSchema }),
  HospitalController.update
);

router.patch(
  '/:id/beds',
  authenticate,
  requireRoles('ADMIN', 'DRIVER'),
  validate({ body: updateBedsSchema }),
  HospitalController.updateBeds
);

router.delete('/:id', authenticate, requireRoles('ADMIN'), HospitalController.delete);

export default router;
