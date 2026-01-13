/**
 * @fileoverview Auth Module Barrel Exports
 * @module @nxt1/web/core/auth
 *
 * Exports for the authentication system.
 *
 * IMPORTANT: This barrel is for BROWSER code only.
 * Server-specific code (ServerAuthService) must be imported directly
 * from './server-auth.service' to avoid bundling Firebase SDK in browser.
 *
 * Server imports (in app.config.server.ts):
 * ```typescript
 * import {
 *   ServerAuthService,
 *   SSR_AUTH_TOKEN,
 *   SSR_FIREBASE_CONFIG,
 *   initializeServerAuth,
 * } from './core/auth/server-auth.service';
 * ```
 */

// Interface and injection token
export {
  IAuthService,
  AUTH_SERVICE,
  AppUser,
  FirebaseUserInfo,
  SignInCredentials,
  SignUpCredentials,
} from './auth.interface';

// Browser auth implementation
export { BrowserAuthService } from './browser-auth.service';

// Auth Cookie Service (for token persistence)
export { AuthCookieService, AUTH_TOKEN_COOKIE } from './auth-cookie.service';

// Route Guards (uses @nxt1/core guard functions)
export { authGuard, guestGuard, premiumGuard, roleGuard } from './auth.guards';

// ============================================
// SERVER-ONLY EXPORTS - DO NOT USE IN BROWSER
// ============================================
// These are NOT exported from the barrel to prevent Firebase SDK
// from being bundled in the browser. Import directly instead:
//
// import {
//   ServerAuthService,
//   SSR_AUTH_TOKEN,
//   SSR_FIREBASE_CONFIG,
//   initializeServerAuth,
// } from './core/auth/server-auth.service';
//
// import {
//   initializeFirebaseServer,
//   extractAuthTokenFromCookies,
// } from './core/auth/firebase-server-app';
