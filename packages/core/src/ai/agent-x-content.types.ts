/**
 * @fileoverview Agent X Mode Content Types
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Pure TypeScript interfaces for Agent X mode-specific content.
 * Defines templates, bundles, drafts, and task items displayed
 * across Highlights, Graphics, Recruiting, and Evaluation tabs.
 *
 * ⭐ 100% PORTABLE — Zero framework dependencies ⭐
 */

import type { AgentXMode } from './agent-x.types';

// ============================================
// TEMPLATE TYPES (Highlights & Graphics)
// ============================================

/** Status of a draft item. */
export type AgentXDraftStatus = 'in-progress' | 'review' | 'ready';

/** A user-created draft that's in-progress or ready for review. */
export interface AgentXDraft {
  /** Unique draft identifier. */
  readonly id: string;
  /** Display title of the draft. */
  readonly title: string;
  /** Which mode this draft belongs to. */
  readonly mode: 'highlights' | 'graphics';
  /** Template category id used for this draft. */
  readonly templateCategoryId: string;
  /** Current completion percentage 0–100. */
  readonly progress: number;
  /** Current status. */
  readonly status: AgentXDraftStatus;
  /** Thumbnail URL (placeholder for design). */
  readonly thumbnailUrl?: string;
  /** Last updated ISO timestamp. */
  readonly updatedAt: string;
  /** XP earned so far on this draft. */
  readonly xpEarned: number;
  /** XP awarded upon completion. */
  readonly xpReward: number;
}

/** A template category that Agent X can auto-generate. */
export interface AgentXTemplateCategory {
  /** Unique category id. */
  readonly id: string;
  /** Display label. */
  readonly label: string;
  /** Short description. */
  readonly description: string;
  /** Icon name (ionicon id or inline SVG key). */
  readonly icon: string;
  /** Number of templates available in this category. */
  readonly templateCount: number;
  /** Mode for this category. */
  readonly mode: 'highlights' | 'graphics';
  /** Whether this is a popular / featured category. */
  readonly featured?: boolean;
  /** XP reward for completing one from this category. */
  readonly xpReward: number;
  /** Accent color token for the card. */
  readonly accentColor?: string;
}

/**
 * An individual template within a category — the actual visual card
 * users browse and click to start creating (Canva-style).
 */
export interface AgentXTemplate {
  /** Unique template id. */
  readonly id: string;
  /** Display title shown under the thumbnail. */
  readonly title: string;
  /** Category this template belongs to. */
  readonly categoryId: string;
  /** Mode (highlights or graphics). */
  readonly mode: 'highlights' | 'graphics';
  /** Aspect ratio for the thumbnail placeholder. */
  readonly aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  /** Placeholder accent gradient for the thumbnail card. */
  readonly placeholderGradient: string;
  /** Placeholder icon shown in the center of the card. */
  readonly placeholderIcon: string;
  /** Whether this template is popular / trending. */
  readonly popular?: boolean;
  /** Whether this is a "Pro" / premium template. */
  readonly pro?: boolean;
  /** Number of times this template has been used. */
  readonly usageCount: number;
  /** XP reward for completing this template. */
  readonly xpReward: number;
}

// ============================================
// BUNDLE TYPES
// ============================================

/**
 * A bundle/pack combining multiple template categories at a value.
 * Gamified with XP bonuses and tier badges.
 */
export interface AgentXBundle {
  /** Unique bundle id. */
  readonly id: string;
  /** Bundle display name. */
  readonly title: string;
  /** Short tagline. */
  readonly subtitle: string;
  /** Ionicon / SVG key. */
  readonly icon: string;
  /** Accent gradient CSS for the card. */
  readonly gradient: string;
  /** Number of items included. */
  readonly itemCount: number;
  /** Categories included (as ids). */
  readonly categoryIds: readonly string[];
  /** Bonus XP for completing the entire bundle. */
  readonly bonusXp: number;
  /** Badge rarity awarded on completion. */
  readonly badgeRarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  /** Badge label shown on the card. */
  readonly badgeLabel: string;
  /** Which mode(s) this bundle spans. */
  readonly modes: readonly AgentXMode[];
}

// ============================================
// RECRUITING & EVALUATION TASK TYPES
// ============================================

/** Priority level for a recruiting / evaluation task. */
export type AgentXTaskPriority = 'normal' | 'high' | 'critical';

/** A ready-to-go action row in Recruiting or Evaluation. */
export interface AgentXTaskItem {
  /** Unique task id. */
  readonly id: string;
  /** Task title displayed prominently. */
  readonly title: string;
  /** Brief description of what Agent X does. */
  readonly description: string;
  /** Ionicon / SVG key. */
  readonly icon: string;
  /** Mode this task belongs to. */
  readonly mode: 'recruiting' | 'evaluation';
  /** Priority / urgency level. */
  readonly priority: AgentXTaskPriority;
  /** XP reward for this task. */
  readonly xpReward: number;
  /** Estimated time to complete (human display). */
  readonly estimatedTime: string;
  /** Optional social-proof text. */
  readonly socialProof?: string;
  /** Whether this task is featured / pinned. */
  readonly featured?: boolean;
  /** Accent color token. */
  readonly accentColor?: string;
}

// ============================================
// MODE CONTENT AGGREGATE
// ============================================

/** All content for a creative mode (Highlights or Graphics). */
export interface AgentXCreativeModeContent {
  readonly drafts: readonly AgentXDraft[];
  readonly categories: readonly AgentXTemplateCategory[];
  readonly bundles: readonly AgentXBundle[];
}

/** All content for an action mode (Recruiting or Evaluation). */
export interface AgentXActionModeContent {
  readonly tasks: readonly AgentXTaskItem[];
  readonly bundles: readonly AgentXBundle[];
}
