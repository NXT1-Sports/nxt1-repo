/**
 * @fileoverview Explore Module — Barrel Export
 * @module @nxt1/ui/explore
 * @version 3.0.0
 *
 * PLATFORM-SPECIFIC COMPONENTS:
 * - Mobile (Ionic): ExploreShellComponent, ExploreListComponent, ExploreItemComponent
 * - Web (Zero Ionic): ExploreShellWebComponent, ExploreListWebComponent, ExploreItemWebComponent
 * - Shared: ExploreSkeletonComponent, ExploreService
 */

// ============================================
// MOBILE — Ionic-based components
// ============================================
export { ExploreShellComponent, type ExploreUser } from './explore-shell.component';
export { ExploreListComponent } from './explore-list.component';
export { ExploreItemComponent } from './explore-item.component';
export { ExploreForYouComponent } from './explore-for-you.component';
export { ExploreCollegesMobileComponent } from './mobile/explore-colleges-mobile.component';

// ============================================
// WEB — Zero Ionic, SSR-optimized
// ============================================
export { ExploreShellWebComponent } from './web/explore-shell-web.component';
export { ExploreListWebComponent } from './web/explore-list-web.component';
export { ExploreItemWebComponent } from './web/explore-item-web.component';
export { ExploreForYouWebComponent } from './web/explore-for-you-web.component';
export { ExploreCollegesWebComponent } from './web/explore-colleges-web.component';

// ============================================
// SHARED — Works on both platforms
// ============================================
export { ExploreSkeletonComponent } from './explore-skeleton.component';
export { ExploreService } from './explore.service';
export { ExploreFilterModalComponent } from './explore-filter-modal.component';
export {
  ExploreFilterModalService,
  type ExploreFilterModalConfig,
  type ExploreFilterModalResult,
} from './explore-filter-modal.service';
