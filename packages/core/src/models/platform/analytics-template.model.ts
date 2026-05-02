/**
 * @fileoverview Analytics custom event template registry schema
 * @module @nxt1/core/models/platform/analytics-template
 *
 * Defines the structure for custom analytics event templates that agents
 * can discover and reuse to prevent duplicate category creation.
 *
 * Pure TypeScript only — no framework or runtime dependencies.
 */

import type { AnalyticsDomain } from './analytics-event.model.js';

export type AnalyticsTemplateStatus = 'active' | 'deprecated' | 'pending_review';

/**
 * Canonical analytics custom event template.
 * Agents discover these before registering new ones to avoid duplicates.
 */
export interface AnalyticsCustomEventTemplate {
  /** Unique identifier (usually auto-generated) */
  readonly id: string;

  /** Normalized template key (lowercase, no spaces). Unique constraint. */
  readonly templateKey: string;

  /** Human-readable name for the template */
  readonly displayName: string;

  /** Longer description of what this template tracks */
  readonly description: string;

  /** Base intelligence domain this template extends (recruiting, nil, performance, engagement, communication) */
  readonly baseDomain: Exclude<AnalyticsDomain, 'system' | 'custom'>;

  /**
   * Canonical event type for this template.
   * Custom templates are written to domain='custom' with this eventType.
   * This ensures all agents tracking the same pattern use the same eventType.
   */
  readonly canonicalEventType: string;

  /**
   * Alternative names for this template.
   * During discovery, if an agent asks about "injury", it might match alias "athletic_injury".
   * All aliases are lowercased and normalized for matching.
   */
  readonly aliases: readonly string[];

  /**
   * Required fields in the payload when tracking this template.
   * Used for validation before write.
   */
  readonly requiredPayloadFields: readonly string[];

  /**
   * Default tags that should be applied to events using this template.
   * Agents can override with additional tags.
   */
  readonly suggestedTags: readonly string[];

  /**
   * Semantic version of the template's payload schema.
   * If structure changes, bump version to support migrations.
   */
  readonly payloadSchemaVersion: string;

  /** Current status of the template */
  readonly status: AnalyticsTemplateStatus;

  /** Who created this template (userId or agentId) */
  readonly createdBy: string;

  /** When was this template first created */
  readonly createdAt: string;

  /** When was this template last used */
  readonly lastUsedAt: string | null;

  /** How many times has this template been used to track events */
  readonly usageCount: number;

  /** Optional metadata for future use */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Request to register a new analytics template.
 * Agents use this when discovery returns no matches.
 */
export interface RegisterAnalyticsTemplateRequest {
  readonly templateKey: string;
  readonly displayName: string;
  readonly description: string;
  readonly baseDomain: Exclude<AnalyticsDomain, 'system' | 'custom'>;
  readonly canonicalEventType: string;
  readonly aliases?: readonly string[];
  readonly requiredPayloadFields?: readonly string[];
  readonly suggestedTags?: readonly string[];
  readonly payloadSchemaVersion?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Query parameters for discovering existing templates.
 */
export interface DiscoverAnalyticsTemplatesQuery {
  /** Filter by base domain */
  readonly baseDomain?: Exclude<AnalyticsDomain, 'system' | 'custom'>;
  /** Search by keyword in templateKey, displayName, aliases, description */
  readonly keyword?: string;
  /** Filter by status (default: 'active') */
  readonly status?: AnalyticsTemplateStatus;
  /** Maximum results to return */
  readonly limit?: number;
}

/**
 * Result of discovering templates.
 */
export interface DiscoveredAnalyticsTemplate {
  readonly id: string;
  readonly templateKey: string;
  readonly displayName: string;
  readonly baseDomain: Exclude<AnalyticsDomain, 'system' | 'custom'>;
  readonly canonicalEventType: string;
  readonly requiredPayloadFields: readonly string[];
  readonly suggestedTags: readonly string[];
  readonly status: AnalyticsTemplateStatus;
  readonly usageCount: number;
  readonly relevanceScore?: number; // For ranking discovery results
}
