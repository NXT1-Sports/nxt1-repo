/**
 * @fileoverview Auth Module Barrel Exports
 * @module @nxt1/web/core/auth
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
