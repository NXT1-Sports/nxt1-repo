/**
 * @fileoverview Help Center Module - Barrel Export
 * @module @nxt1/ui/help-center
 * @version 3.0.0
 *
 * Adaptive Design Architecture:
 * - _shared/: Platform-agnostic services (HelpCenterService)
 * - mobile/: Ionic components for native mobile experience
 * - web/: Tailwind components for SSR-optimized web experience
 *
 * Usage:
 * ```typescript
 * // Shared service (all platforms)
 * import { HelpCenterService } from '@nxt1/ui';
 *
 * // Mobile (Ionic)
 * import { HelpCenterShellMobileComponent } from '@nxt1/ui';
 *
 * // Web (Tailwind SSR)
 * import { HelpCenterShellWebComponent } from '@nxt1/ui';
 * ```
 */

// ============================================
// SHARED (_shared/) - Platform-agnostic
// ============================================
export { HelpCenterService } from './_shared';

// ============================================
// MOBILE (mobile/) - Ionic components
// ============================================
export { HelpCenterShellMobileComponent, type HelpNavigateEvent } from './mobile';

// ============================================
// WEB (web/) - Tailwind SSR components
// ============================================
export {
  HelpCenterShellWebComponent,
  HelpCategoryDetailWebComponent,
  HelpArticleDetailWebComponent,
  // Re-export type for convenience (same interface)
  type HelpNavigateEvent as HelpNavigateEventWeb,
} from './web';

// ============================================
// LEGACY EXPORTS (Deprecated - use platform-specific)
// Keep for backward compatibility during migration
// ============================================
export { HelpCenterShellComponent } from './help-center-shell.component';
export { HelpCategoryDetailComponent } from './help-center-category-detail.component';
export { HelpArticleDetailComponent } from './help-center-article-detail.component';
