/**
 * @fileoverview Auth Services Barrel Export
 * @module @nxt1/web/features/auth/services
 *
 * All auth services in one place per 2026 feature-first architecture.
 *
 * IMPORTANT: Server-specific imports (ServerAuthService) should be
 * imported directly to avoid bundling Firebase SDK in browser.
 */

// Flow orchestration services
export { AuthApiService } from './auth-api.service';
export { AuthFlowService } from './auth-flow.service';
export type { SignInCredentials, SignUpCredentials } from './auth-flow.service';

// Auth Error Handler - re-export from shared @nxt1/ui package
export { AuthErrorHandler, type AuthError, type AuthRecoveryAction } from '@nxt1/ui';

// Interface and injection token
export {
  IAuthService,
  AUTH_SERVICE,
  type AppUser,
  type FirebaseUserInfo,
  type SignInCredentials as ISignInCredentials,
  type SignUpCredentials as ISignUpCredentials,
} from './auth.interface';

// Browser auth implementation
export { BrowserAuthService } from './browser-auth.service';

// Onboarding Analytics Service - professional funnel tracking
export { OnboardingAnalyticsService } from './onboarding-analytics.service';

// Auth Cookie Service (for token persistence)
export { AuthCookieService, AUTH_TOKEN_COOKIE } from './auth-cookie.service';

// SSR tokens (safe to import anywhere)
export { SSR_AUTH_TOKEN, SSR_FIREBASE_CONFIG } from './ssr-tokens';

// Re-export auth types from @nxt1/core for consumers
export type { AuthState, AuthUser } from '@nxt1/core';

// ============================================
// SERVER-ONLY EXPORTS - DO NOT USE IN BROWSER
// ============================================
// Import directly from './server-auth.service' to avoid
// bundling Firebase SDK in the browser:
//
// import { ServerAuthService, initializeServerAuth } from './features/auth/services/server-auth.service';
// import { getOrCreateFirebaseServerApp } from './features/auth/services/firebase-server-app';
