/**
 * @fileoverview Auth Routes — Composition Shim
 * @module @nxt1/backend
 *
 * Composes all auth sub-routers into a single Express Router.
 * The original monolithic implementation has been split into:
 *
 * - routes/auth/team-code.routes.ts         — validate-team-code, team-sources, check-username
 * - routes/auth/user-creation.routes.ts     — create-user, join-team
 * - routes/auth/onboarding.routes.ts        — profile/onboarding, profile/onboarding-step
 * - routes/auth/oauth.routes.ts             — Google/Microsoft/Yahoo OAuth + custom-token
 * - routes/auth/analytics-unicode.routes.ts — analytics/hear-about, unicode
 *
 * Profile sub-routes (GET/PUT /auth/profile/*) are handled by profileRoutes,
 * which implements Redis caching (MEDIUM_TTL = 15 min).
 *
 * @version 3.0.0
 */

import { Router } from 'express';
import type { Router as RouterType } from 'express';

import teamCodeRoutes from './auth/team-code.routes.js';
import userCreationRoutes from './auth/user-creation.routes.js';
import onboardingRoutes from './auth/onboarding.routes.js';
import oauthRoutes from './auth/oauth.routes.js';
import analyticsUnicodeRoutes from './auth/analytics-unicode.routes.js';
import profileRoutes from './profile/index.js';

const router: RouterType = Router();

router.use(teamCodeRoutes);
router.use(userCreationRoutes);
router.use(onboardingRoutes);
router.use(oauthRoutes);
router.use(analyticsUnicodeRoutes);

// GET/PUT /auth/profile/* — handled by profileRoutes (Redis-cached, MEDIUM_TTL = 15 min)
router.use('/profile', profileRoutes);

export default router;
