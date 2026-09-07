import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requireRoles } from '../../common/middlewares/role.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import { AdminController } from './admin.controller.js';
import { updateUserRoleSchema, updateUserStatusSchema } from './admin.validation.js';

const router = Router();

// Strict RBAC: Admin only for all administration routes
router.use(authenticate, requireRoles('ADMIN'));

router.get('/users', AdminController.listUsers);
router.patch(
  '/users/:id/role',
  validate({ body: updateUserRoleSchema }),
  AdminController.updateUserRole
);
router.patch(
  '/users/:id/status',
  validate({ body: updateUserStatusSchema }),
  AdminController.updateUserStatus
);

router.get('/dashboard-stats', AdminController.getDashboardStats);
router.get('/audit-logs', AdminController.listAuditLogs);

export default router;
