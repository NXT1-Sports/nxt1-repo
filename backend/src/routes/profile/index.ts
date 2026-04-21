/**
 * @fileoverview Profile routes barrel — composes all profile sub-routers.
 *
 * Route registration order is critical:
 * 1. lookupRoutes  — /me, /unicode/:unicode, /related, /search, /:userId (exact)
 * 2. subFeedsRoutes  — /:userId/timeline, /:userId/sports/:sportId/...
 * 3. mutationsRoutes — PUT /:userId, POST /:userId/image, PUT|POST|DELETE /:userId/sport
 * 4. intelRoutes     — /:userId/intel, /:userId/intel/generate
 *
 * Express matches routes in registration order. Since /:userId only matches
 * a single path segment with nothing after it, sub-paths like /:userId/timeline
 * safely fall through to the next router.
 */

import { Router } from 'express';
import lookupRoutes from './lookup.routes.js';
import subFeedsRoutes from './sub-feeds.routes.js';
import mutationsRoutes from './mutations.routes.js';
import intelRoutes from './intel.routes.js';

const router = Router();

router.use(lookupRoutes);
router.use(subFeedsRoutes);
router.use(mutationsRoutes);
router.use(intelRoutes);

export default router;
