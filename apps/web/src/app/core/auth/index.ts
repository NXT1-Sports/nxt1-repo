/**
 * @fileoverview Auth Module Barrel Exports
 * @module @nxt1/web/core/auth
 *
 * Exports for the authentication system including:
 * - IAuthService interface and injection token
 * - Platform-specific implementations (Browser/Server)
 * - FirebaseServerApp utilities for authenticated SSR
 * - Auth cookie service for token persistence
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

// Platform-specific implementations
export { BrowserAuthService } from './browser-auth.service';
export { ServerAuthService } from './server-auth.service';

// SSR Auth Token (for FirebaseServerApp)
export { SSR_AUTH_TOKEN } from './ssr-auth-token';

// Auth Cookie Service (for token persistence)
export { AuthCookieService, AUTH_TOKEN_COOKIE } from './auth-cookie.service';

// FirebaseServerApp utilities (pure functions, no Angular dependencies)
export {
  initializeFirebaseServer,
  extractAuthTokenFromCookies,
  type FirebaseServerConfig,
  type FirebaseServerAppResult,
} from './firebase-server-app';
