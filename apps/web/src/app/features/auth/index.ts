/**
 * @fileoverview Auth Feature Barrel Export
 * @module @nxt1/web/features/auth
 *
 * Single entry point for all auth-related exports.
 * Auth services have been consolidated to core/services/auth/
 * to match mobile app architecture.
 *
 * Structure:
 * ```
 * features/auth/
 * ├── guards/        # Route guards
 * ├── pages/         # Page components (login, signup, etc.)
 * └── auth.routes.ts # Feature routes
 * ```
 */

// Routes
export { AUTH_ROUTES } from './auth.routes';

// Services (consolidated to core/services/auth/)
export * from '../../core/services/auth';

// Guards
export * from './guards';
