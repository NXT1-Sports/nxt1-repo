/**
 * @fileoverview Auth Feature Barrel Export
 * @module @nxt1/mobile/features/auth
 *
 * Single entry point for all auth-related exports.
 * This is the 2026 best practice: feature-first architecture
 * with everything auth-related colocated.
 *
 * Structure:
 * ```
 * features/auth/
 * ├── services/      # AuthFlowService, FirebaseAuth, etc.
 * ├── guards/        # Route guards
 * ├── pages/         # Login, Signup, etc.
 * └── auth.routes.ts # Feature routes
 * ```
 */

// Routes
export { AUTH_ROUTES } from './auth.routes';

// Services
export * from './services';

// Guards
export * from './guards';
