/**
 * @fileoverview Auth Error Handler Service (Mobile)
 * @module @nxt1/mobile/features/auth
 *
 * Enterprise-grade error handling for authentication flows on mobile.
 * Identical to web version - uses @nxt1/core/errors for portable logic.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// Re-export from web since it's 100% compatible (uses @nxt1/core/errors internally)
export {
  AuthErrorHandler,
  type AuthError,
  type AuthRecoveryAction,
} from '../../../../../../web/src/app/features/auth/services/auth-error.handler';
