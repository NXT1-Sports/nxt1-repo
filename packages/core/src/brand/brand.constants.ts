/**
 * @fileoverview Brand Constants — Pure TypeScript
 * @module @nxt1/core/brand
 * @version 1.0.0
 *
 * Configuration constants for the Brand Vault feature.
 * 100% portable — no platform dependencies.
 *
 * These categories map to profile sections and open Agent X
 * with pre-filled prompts to guide the athlete through uploading
 * and managing their brand assets.
 */

import type { BrandCategory } from './brand.types';

// ============================================
// BRAND CATEGORIES
// ============================================

/**
 * Brand vault categories displayed as a grid.
 * Each card opens Agent X with a contextual prompt.
 */
export const BRAND_CATEGORIES: readonly BrandCategory[] = [
  {
    id: 'connections',
    label: 'Connections',
    description: 'Link Hudl, MaxPreps & socials',
    icon: 'link',
    accentColor: '#06b6d4',
    agentPrompt:
      'I want to connect my accounts. Help me link my Hudl, MaxPreps, Instagram, or other platforms so Agent X can auto-sync my data.',
  },
  {
    id: 'videos',
    label: 'Film & Video',
    description: 'Game film & clips',
    icon: 'videocam',
    accentColor: '#3b82f6',
    agentPrompt:
      'I want to manage my film and video. Help me upload game film, connect my Hudl account, or create a highlight reel from my raw footage.',
  },
  {
    id: 'stats',
    label: 'Stats',
    description: 'Season records',
    icon: 'barChart',
    accentColor: '#22c55e',
    agentPrompt:
      'I want to update my stats. Help me log new game stats, update season records, or connect my MaxPreps account to auto-sync.',
  },
  {
    id: 'metrics',
    label: 'Metrics',
    description: 'Speed & strength',
    icon: 'barbell',
    accentColor: '#f97316',
    agentPrompt:
      'I want to update my physical metrics. Help me log my latest 40-yard dash, bench press, vertical jump, or other measurables.',
  },
  {
    id: 'highlights',
    label: 'Highlights',
    description: 'AI highlight reels',
    icon: 'bolt',
    accentColor: '#a855f7',
    agentPrompt:
      'I want to create a highlight reel. Help me generate an AI-powered highlight video from my uploaded game film.',
  },
  {
    id: 'graphics',
    label: 'Graphics',
    description: 'Sports graphics',
    icon: 'image',
    accentColor: '#ec4899',
    agentPrompt:
      'I want to create a sports graphic. Help me generate a professional graphic using my stats, photos, or achievements.',
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    description: 'Offers & outreach',
    icon: 'trophy',
    accentColor: '#eab308',
    agentPrompt:
      'I want to work on my recruiting. Help me draft emails to coaches, track my offers, or find college programs that fit my profile.',
  },
  {
    id: 'academic',
    label: 'Academic',
    description: 'GPA & test scores',
    icon: 'school',
    accentColor: '#14b8a6',
    agentPrompt:
      'I want to update my academic info. Help me add my GPA, test scores, or academic achievements to strengthen my profile.',
  },
  {
    id: 'schedule',
    label: 'Schedule',
    description: 'Games & camps',
    icon: 'calendar',
    accentColor: '#ef4444',
    agentPrompt:
      'I want to manage my schedule. Help me add upcoming games, camps, showcases, or events to my profile.',
  },
] as const;

/**
 * Default page title for Brand.
 */
export const BRAND_PAGE_TITLE = 'Brand' as const;

/**
 * Brand page subtitle.
 */
export const BRAND_PAGE_SUBTITLE = 'Your vault. Feed it, and Agent X builds your legacy.' as const;
