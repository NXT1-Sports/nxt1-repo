/**
 * @fileoverview Help Center Module - Barrel Export
 * @module @nxt1/ui/help-center
 * @version 2.0.0
 *
 * Clean, minimal Help Center implementation.
 * Uses native Ionic components for professional look.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

// Service
export { HelpCenterService } from './help-center.service';

// Components
export { HelpCenterShellComponent, type HelpNavigateEvent } from './help-center-shell.component';

export { HelpCategoryDetailComponent } from './help-center-category-detail.component';

export { HelpArticleDetailComponent } from './help-center-article-detail.component';
