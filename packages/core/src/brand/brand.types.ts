/**
 * @fileoverview Brand Vault Type Definitions
 * @module @nxt1/core/brand
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for the Brand Vault feature.
 * 100% portable — zero framework dependencies.
 */

import type { AgentXMode } from '../ai/agent-x.types';

/**
 * A brand category card displayed in the 2×2 Brand Vault grid.
 * Each category opens Agent X with a specific mode context.
 */
export interface BrandCategory {
  /** Unique category identifier */
  readonly id: string;
  /** Display label shown on the card */
  readonly label: string;
  /** Short description shown on the card */
  readonly description: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Agent X mode to open when this category is selected */
  readonly agentMode: AgentXMode;
  /** Optional CSS accent colour token for the card */
  readonly accentColor?: string;
}
