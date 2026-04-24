import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { appGuard } from '../../../middleware/auth/auth.middleware.js';
import cloudflareRoutes from './cloudflare.routes.js';
import imagesRoutes from './images.routes.js';

const router: RouterType = Router();

// All upload routes require authentication
router.use(appGuard);

router.use(cloudflareRoutes);
router.use(imagesRoutes);

export default router;
