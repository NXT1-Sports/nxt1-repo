/**
 * @fileoverview Brand Vault Constants
 * @module @nxt1/core/brand
 * @version 1.0.0
 *
 * Static configuration for the Brand Vault page.
 * 100% portable — zero framework dependencies.
 */

import type { BrandCategory } from './brand.types';

/** Subtitle shown below the Brand Vault page header. */
export const BRAND_PAGE_SUBTITLE = 'Build your personal brand with AI-powered tools.';

/** Four categories displayed in the Brand Vault 2×2 grid. */
export const BRAND_CATEGORIES: readonly BrandCategory[] = [
  {
    id: 'highlights',
    label: 'Highlights',
    description: 'Create AI-powered highlight reels',
    icon: 'videocam-outline',
    agentMode: 'highlights',
    accentColor: 'var(--nxt1-color-primary)',
  },
  {
    id: 'graphics',
    label: 'Graphics',
    description: 'Generate professional sports graphics',
    icon: 'image-outline',
    agentMode: 'graphics',
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    description: 'College matching and guidance',
    icon: 'school-outline',
    agentMode: 'recruiting',
    accentColor: 'var(--nxt1-color-primary)',
  },
  {
    id: 'evaluation',
    label: 'Evaluation',
    description: 'Performance analysis and skills',
    icon: 'analytics-outline',
    agentMode: 'evaluation',
  },
] as const;
