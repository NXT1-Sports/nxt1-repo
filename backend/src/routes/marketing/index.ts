import { Router } from 'express';
import cronRoutes from './cron.routes.js';
import reportRoutes from './report.routes.js';

const router = Router();

router.use(cronRoutes);
router.use(reportRoutes);

export default router;
