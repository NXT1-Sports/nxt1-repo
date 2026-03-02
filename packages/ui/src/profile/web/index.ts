/**
 * @fileoverview Profile Web Components - Barrel Export
 * @module @nxt1/ui/profile/web
 *
 * Web-ONLY profile components. These use SSR-specific patterns,
 * Tailwind desktop layouts, or schema.org microdata that are NOT
 * shared with the mobile shell.
 *
 * Shared components live in ../components/ and are exported from
 * the root profile/index.ts barrel.
 *
 * Usage:
 * ```typescript
 * import { ProfileShellWebComponent } from '@nxt1/ui/profile/web';
 * ```
 */

// Web-only shell (SSR layout, semantic HTML, Tailwind grid)
export { ProfileShellWebComponent } from './profile-shell-web.component';

// Web-only header (SSR banner hero with schema.org microdata)
export { ProfileHeaderWebComponent } from './profile-header-web.component';

// Web-only desktop page header (badge shelf, XP ring, desktop nav)
export { ProfilePageHeaderComponent } from './profile-page-header.component';

// Web-only discovery row
export { RelatedAthletesComponent, type RelatedAthlete } from './related-athletes.component';
