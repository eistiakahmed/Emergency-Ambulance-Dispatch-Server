import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { uploadSingleImage } from '../../common/middlewares/upload.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import { UserController } from './user.controller.js';
import { updateProfileSchema } from './user.validation.js';

const router = Router();

// All user routes are protected
router.use(authenticate);

router.get('/me', UserController.getProfile);
router.patch('/me', validate({ body: updateProfileSchema }), UserController.updateProfile);
router.patch('/me/avatar', uploadSingleImage('avatar'), UserController.uploadAvatar);

export default router;
