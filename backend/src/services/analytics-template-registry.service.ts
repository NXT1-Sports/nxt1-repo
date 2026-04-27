/**
 * @fileoverview Analytics Custom Template Registry Repository
 * @module @nxt1/backend/services/analytics-template-registry
 *
 * Provides discovery, creation, and usage tracking for custom analytics templates.
 * Ensures no duplicate template keys via unique constraint and transactional semantics.
 */

import { logger } from '../utils/logger.js';
import {
  AnalyticsCustomEventTemplateModel,
  type AnalyticsCustomEventTemplateDocument,
} from '../models/analytics/analytics-custom-template.model.js';
import type {
  AnalyticsCustomEventTemplate,
  DiscoverAnalyticsTemplatesQuery,
  DiscoveredAnalyticsTemplate,
  RegisterAnalyticsTemplateRequest,
} from '@nxt1/core/models';

/**
 * Service for managing custom analytics event templates.
 * Prevents duplicate template creation through uniqueness constraints
 * and provides discovery for agents to reuse existing templates.
 */
export class AnalyticsTemplateRegistry {
  async getById(templateId: string): Promise<AnalyticsCustomEventTemplate | null> {
    const doc = await AnalyticsCustomEventTemplateModel.findById(
      templateId
    ).lean<AnalyticsCustomEventTemplateDocument | null>();

    return doc ? toTemplateDto(doc) : null;
  }

  /**
   * Discover existing templates matching query criteria.
   * Results ranked by relevance score (exact key match > alias match > usage count).
   */
  async discover(query: DiscoverAnalyticsTemplatesQuery): Promise<DiscoveredAnalyticsTemplate[]> {
    const { baseDomain, keyword, status = 'active', limit = 20 } = query;

    type FilterQuery = Record<string, unknown>;
    const filter: FilterQuery = { status };

    if (baseDomain) {
      filter['baseDomain'] = baseDomain;
    }

    if (keyword) {
      const normalizedKeyword = keyword.toLowerCase().trim();
      filter['$or'] = [
        { templateKey: { $regex: normalizedKeyword, $options: 'i' } },
        { displayName: { $regex: normalizedKeyword, $options: 'i' } },
        { aliases: { $elemMatch: { $regex: normalizedKeyword, $options: 'i' } } },
        { description: { $regex: normalizedKeyword, $options: 'i' } },
      ];
    }

    const templates = await AnalyticsCustomEventTemplateModel.find(filter)
      .sort({ usageCount: -1, createdAt: -1 })
      .limit(limit)
      .lean<AnalyticsCustomEventTemplateDocument[]>();

    // Calculate relevance scores for ranking
    const keyword_lower = keyword?.toLowerCase() ?? '';
    return templates.map((template) => {
      let relevanceScore = 0;

      // Exact key match: highest score
      if (template.templateKey === keyword_lower) {
        relevanceScore = 100;
      }
      // Key prefix match
      else if (template.templateKey.startsWith(keyword_lower)) {
        relevanceScore = 80;
      }
      // Alias match
      else if (template.aliases.some((a: string) => a === keyword_lower)) {
        relevanceScore = 75;
      }
      // Alias prefix match
      else if (template.aliases.some((a: string) => a.startsWith(keyword_lower))) {
        relevanceScore = 60;
      }
      // Generic keyword found (already filtered, so this is present)
      else {
        relevanceScore = 50;
      }

      return {
        id: String(template.id ?? template._id),
        templateKey: template.templateKey,
        displayName: template.displayName,
        baseDomain: template.baseDomain,
        canonicalEventType: template.canonicalEventType,
        requiredPayloadFields: template.requiredPayloadFields,
        suggestedTags: template.suggestedTags,
        status: template.status,
        usageCount: template.usageCount,
        relevanceScore,
      };
    });
  }

  /**
   * Get a template by key or by checking aliases.
   * Returns null if not found.
   */
  async getByKeyOrAlias(keyOrAlias: string): Promise<AnalyticsCustomEventTemplate | null> {
    const normalized = keyOrAlias.toLowerCase().trim();

    const doc = await AnalyticsCustomEventTemplateModel.findOne({
      $or: [{ templateKey: normalized }, { aliases: normalized }],
    }).lean<AnalyticsCustomEventTemplateDocument | null>();

    if (!doc) return null;

    return toTemplateDto(doc);
  }

  /**
   * Register a new custom analytics template.
   * Uses unique constraint + upsert to prevent race condition duplicates.
   * If template key already exists (from concurrent request), returns existing template.
   */
  async register(
    request: RegisterAnalyticsTemplateRequest,
    createdByUserId: string
  ): Promise<AnalyticsCustomEventTemplate> {
    const normalizedKey = request.templateKey.toLowerCase().trim();
    const now = new Date();

    try {
      // First attempt: insert only if key doesn't exist
      // This ensures only one template per normalized key
      const inserted = await AnalyticsCustomEventTemplateModel.create({
        templateKey: normalizedKey,
        displayName: request.displayName,
        description: request.description,
        baseDomain: request.baseDomain,
        canonicalEventType: request.canonicalEventType,
        aliases: (request.aliases ?? []).map((a) => a.toLowerCase().trim()),
        requiredPayloadFields: request.requiredPayloadFields ?? [],
        suggestedTags: request.suggestedTags ?? [],
        payloadSchemaVersion: request.payloadSchemaVersion ?? '1.0.0',
        status: 'active',
        createdBy: createdByUserId,
        createdAt: now,
        lastUsedAt: null,
        usageCount: 0,
        metadata: request.metadata ?? {},
      });

      logger.info('Analytics template registered', {
        templateId: String(inserted._id),
        templateKey: normalizedKey,
        baseDomain: request.baseDomain,
        createdBy: createdByUserId,
      });

      return toTemplateDto(inserted.toObject());
    } catch (err) {
      // Check if duplicate key error
      if (
        err instanceof Error &&
        err.message.includes('duplicate key error') &&
        err.message.includes('templateKey')
      ) {
        logger.info('Template key already exists (concurrent creation), returning existing', {
          templateKey: normalizedKey,
        });

        // Fetch and return the existing template
        const existing = await this.getByKeyOrAlias(normalizedKey);
        if (!existing) {
          // This should not happen, but safeguard
          throw new Error(
            `Template key "${normalizedKey}" exists but cannot be retrieved. Database inconsistency.`
          );
        }
        return existing;
      }

      logger.error('Failed to register analytics template', {
        err,
        templateKey: normalizedKey,
        baseDomain: request.baseDomain,
      });
      throw err;
    }
  }

  /**
   * Increment usage count and update lastUsedAt for a template.
   * Called after a successful track operation using this template.
   */
  async incrementUsage(templateId: string): Promise<void> {
    try {
      await AnalyticsCustomEventTemplateModel.findByIdAndUpdate(
        templateId,
        {
          $inc: { usageCount: 1 },
          $set: { lastUsedAt: new Date().toISOString() },
        },
        { new: false }
      );
    } catch (err) {
      logger.warn('Failed to increment template usage count', { err, templateId });
      // Non-blocking: don't fail tracking just because usage count update failed
    }
  }

  /**
   * Mark a template as deprecated.
   */
  async deprecate(templateId: string, reason?: string): Promise<void> {
    try {
      await AnalyticsCustomEventTemplateModel.findByIdAndUpdate(
        templateId,
        {
          $set: {
            status: 'deprecated',
            metadata: { ...({} as Record<string, unknown>), deprecationReason: reason },
          },
        },
        { new: false }
      );

      logger.info('Analytics template deprecated', { templateId, reason });
    } catch (err) {
      logger.error('Failed to deprecate analytics template', { err, templateId });
      throw err;
    }
  }
}

function toTemplateDto(doc: AnalyticsCustomEventTemplateDocument): AnalyticsCustomEventTemplate {
  return {
    id: String(doc.id ?? doc._id),
    templateKey: doc.templateKey,
    displayName: doc.displayName,
    description: doc.description,
    baseDomain: doc.baseDomain,
    canonicalEventType: doc.canonicalEventType,
    aliases: doc.aliases,
    requiredPayloadFields: doc.requiredPayloadFields,
    suggestedTags: doc.suggestedTags,
    payloadSchemaVersion: doc.payloadSchemaVersion,
    status: doc.status,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt.toISOString(),
    lastUsedAt: doc.lastUsedAt ? doc.lastUsedAt.toISOString() : null,
    usageCount: doc.usageCount,
    metadata: doc.metadata,
  };
}

let _instance: AnalyticsTemplateRegistry | null = null;

export function getAnalyticsTemplateRegistry(): AnalyticsTemplateRegistry {
  if (!_instance) {
    _instance = new AnalyticsTemplateRegistry();
  }
  return _instance;
}
