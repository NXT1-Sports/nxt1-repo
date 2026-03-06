/**
 * @fileoverview Brand Module — Barrel Export
 * @module @nxt1/ui/brand
 * @version 1.0.0
 *
 * PLATFORM-SPECIFIC COMPONENTS:
 * - Mobile (Ionic): BrandShellComponent
 * - Web (Zero Ionic): BrandShellWebComponent
 * - Shared: BrandService, BrandCategoryCardComponent
 */

// ============================================
// MOBILE — Ionic-based components
// ============================================
export { BrandShellComponent } from './brand-shell.component';

// ============================================
// WEB — Zero Ionic, SSR-optimized
// ============================================
export { BrandShellWebComponent } from './web/brand-shell-web.component';

// ============================================
// SHARED — Works on both platforms
// ============================================
export { BrandService } from './brand.service';
export { BrandCategoryCardComponent } from './brand-category-card.component';
