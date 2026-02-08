/**
 * @fileoverview Explore Module - Barrel Export
 * @module @nxt1/ui/explore
 * @version 2.0.0
 *
 * ADAPTIVE DESIGN PATTERN:
 * - ExploreShellComponent → Mobile (Ionic)
 * - ExploreShellWebComponent → Web (Tailwind, SSR-optimized)
 *
 * Import based on platform:
 * ```typescript
 * // Mobile app (Ionic)
 * import { ExploreShellComponent } from '@nxt1/ui';
 *
 * // Web app (SSR, Grade A+ SEO)
 * import { ExploreShellWebComponent } from '@nxt1/ui';
 * ```
 */

// Shell Components
/** Mobile shell (Ionic) — For web SSR, use ExploreShellWebComponent instead */
export { ExploreShellComponent, type ExploreUser } from './explore-shell.component';

// Web-optimized shell (Tailwind, semantic HTML, Grade A+ SEO)
export { ExploreShellWebComponent } from './web/explore-shell-web.component';

// Shared Components (work with both shells)
export { ExploreListComponent } from './explore-list.component';
export { ExploreItemComponent } from './explore-item.component';
export { ExploreSkeletonComponent } from './explore-skeleton.component';

// Services (Shared)
export { ExploreService } from './explore.service';
