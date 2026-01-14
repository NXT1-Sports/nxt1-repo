/**
 * @fileoverview Mobile Auth Module Barrel Export
 *
 * ⭐ Auth services are now in core/auth/ ⭐
 * This barrel exports routes and guards for the auth feature module.
 */

// Routes
export { AUTH_ROUTES } from './auth.routes';

// Guards
export { authGuard, guestGuard, premiumGuard, roleGuard } from './guards/auth.guards';

// Legacy re-export (for backwards compatibility during migration)
// Import from core/auth instead for new code
export { MobileAuthService } from './services/mobile-auth.service';
