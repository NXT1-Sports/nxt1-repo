/**
 * @fileoverview @nxt1/ui - Main Entry Point
 *
 * Shared Angular/Ionic UI components, services, and infrastructure for NXT1 platform.
 * Cross-platform compatible with Web, iOS, and Android.
 *
 * This package consolidates ALL Angular-specific code:
 * - UI Components (auth, onboarding, shared)
 * - Services (platform, haptics, toast)
 * - Infrastructure (error handling, interceptors)
 * - Auth Services (error handling for Firebase/backend)
 *
 * IMPORTANT: This package contains ANGULAR/IONIC dependencies.
 * For pure TypeScript utilities, use @nxt1/core instead.
 *
 * @example
 * ```typescript
 * // Import from specific modules (RECOMMENDED)
 * import { AuthShellComponent, AuthEmailFormComponent } from '@nxt1/ui/auth';
 * import { NxtLogoComponent } from '@nxt1/ui/shared';
 * import { NxtPlatformService } from '@nxt1/ui/services';
 * import { HapticButtonDirective } from '@nxt1/ui/directives';
 * import { NxtRefreshContainerComponent } from '@nxt1/ui/components';
 * import {
 *   OnboardingRoleSelectionComponent,
 *   OnboardingProgressBarComponent,
 * } from '@nxt1/ui/onboarding';
 *
 * // Infrastructure (error handling, interceptors)
 * import { GlobalErrorHandler, httpErrorInterceptor } from '@nxt1/ui/infrastructure';
 *
 * // Auth services (Firebase error handling)
 * import { AuthErrorHandler, type AuthError } from '@nxt1/ui/auth-services';
 * ```
 *
 * @version 2.0.0
 */

// Re-export version info
export const NXT1_UI_VERSION = '2.0.0';

// Note: For tree-shaking optimization, import directly from:
// - '@nxt1/ui/auth' for auth components
// - '@nxt1/ui/onboarding' for onboarding wizard components
// - '@nxt1/ui/shared' for shared components
// - '@nxt1/ui/services' for platform services
// - '@nxt1/ui/directives' for haptic directives
// - '@nxt1/ui/components' for refresh container, etc.
// - '@nxt1/ui/infrastructure' for error handling and interceptors
// - '@nxt1/ui/auth-services' for auth error handling
