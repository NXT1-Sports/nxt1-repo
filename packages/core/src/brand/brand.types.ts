/**
 * @fileoverview Brand Types — Pure TypeScript
 * @module @nxt1/core/brand
 * @version 1.0.0
 *
 * Type definitions for the Brand Vault feature.
 * 100% portable — no platform dependencies.
 *
 * Brand is the athlete's private back-office where they dump raw materials
 * (video, stats, connections) that Agent X processes into polished profile content.
 */

// ============================================
// BRAND CATEGORY TYPES
// ============================================

/**
 * Brand category identifiers.
 * Each corresponds to a section of the athlete's brand vault.
 */
export type BrandCategoryId =
  | 'videos'
  | 'stats'
  | 'metrics'
  | 'schedule'
  | 'academic'
  | 'highlights'
  | 'graphics'
  | 'recruiting'
  | 'connections';

/**
 * Single brand category card displayed in the grid.
 */
export interface BrandCategory {
  /** Unique identifier */
  readonly id: BrandCategoryId;
  /** Display label */
  readonly label: string;
  /** Short description of what this category does */
  readonly description: string;
  /** Design token icon name (e.g., 'videocam', 'barChart') */
  readonly icon: string;
  /** Gradient or solid color for the card background accent */
  readonly accentColor: string;
  /** Pre-filled prompt sent to Agent X when category is tapped */
  readonly agentPrompt: string;
  /** Optional badge count (e.g., number of uploaded items) */
  readonly badge?: number;
  /** Whether this category is available */
  readonly disabled?: boolean;
}

/**
 * Event emitted when a brand category is selected from the grid.
 */
export interface BrandCategorySelectEvent {
  /** The selected category */
  readonly category: BrandCategory;
  /** Event timestamp */
  readonly timestamp: number;
}
