/**
 * @fileoverview @nxt1/ui - Main Entry Point
 *
 * Shared Angular/Ionic UI components for NXT1 platform.
 * Cross-platform compatible with Web, iOS, and Android.
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
 * ```
 *
 * @version 1.0.0
 */

// Re-export version info
export const NXT1_UI_VERSION = '1.0.0';

// Note: For tree-shaking optimization, import directly from:
// - '@nxt1/ui/auth' for auth components
// - '@nxt1/ui/shared' for shared components
// - '@nxt1/ui/services' for platform services
