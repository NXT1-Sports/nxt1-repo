import { Router } from 'express';
import cronRoutes from './cron.routes.js';
import reportRoutes from './report.routes.js';
import demoRequestRoutes from './demo-request.routes.js';

const router = Router();

router.use(cronRoutes);
router.use(reportRoutes);
router.use(demoRequestRoutes);

export default router;
