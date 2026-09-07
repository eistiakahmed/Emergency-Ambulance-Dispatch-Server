import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import { EmergencyController } from './emergency.controller.js';
import { cancelEmergencySchema, createEmergencySchema } from './emergency.validation.js';

const router = Router();

router.use(authenticate);

router.post('/', validate({ body: createEmergencySchema }), EmergencyController.create);
router.get('/', EmergencyController.list);
router.get('/:id', EmergencyController.getById);
router.post('/:id/cancel', validate({ body: cancelEmergencySchema }), EmergencyController.cancel);

export default router;
