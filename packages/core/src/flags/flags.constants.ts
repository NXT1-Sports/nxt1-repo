/**
 * @fileoverview Feature Flags Registry & Constants
 * @module @nxt1/core/flags
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Single source of truth for all feature flag definitions.
 * Add new flags here, then implement in backend/frontend.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { FeatureFlagDefinition, FeatureFlagKey, FeatureFlagRegistry } from './flags.types';

// ============================================
// TEAM FLAGS
// ============================================

const TEAM_INTEL_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'team.intel.enabled',
  title: 'Team Intel Dashboard',
  description:
    'Enable the Team Intel dashboard for advanced team performance analytics, benchmarking, and competitive insights.',
  scope: 'team',
  type: 'boolean',
  defaultValue: false,
  requiresAudit: true,
  tags: ['premium', 'analytics'],
};

const TEAM_PROFILES_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'team.profiles.enabled',
  title: 'Team Public Profiles',
  description: 'Enable public-facing team profile pages and team discovery surfaces.',
  scope: 'team',
  type: 'boolean',
  defaultValue: false,
  requiresAudit: true,
  tags: ['public-facing'],
};

const TEAM_ROSTER_ADVANCED_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'team.roster.advanced.enabled',
  title: 'Advanced Roster Management',
  description:
    'Enable advanced roster features: bulk operations, position analytics, scholarship tracking.',
  scope: 'team',
  type: 'boolean',
  defaultValue: false,
  tags: ['premium', 'high-impact'],
};

const TEAM_ANALYTICS_PREMIUM_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'team.analytics.premium.enabled',
  title: 'Premium Team Analytics',
  description:
    'Enable premium analytics exports, custom dashboards, and predictive models for team coordinators.',
  scope: 'team',
  type: 'boolean',
  defaultValue: false,
  tags: ['premium', 'high-value'],
};

// ============================================
// ATHLETE FLAGS
// ============================================

const ATHLETE_HIGHLIGHTS_AI_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'athlete.highlights.ai.enabled',
  title: 'AI Highlight Generation',
  description:
    'Enable automatic AI-powered highlight reel generation from raw footage and game video.',
  scope: 'athlete',
  type: 'boolean',
  defaultValue: false,
  tags: ['ai', 'premium'],
};

const ATHLETE_PROFILE_VIDEO_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'athlete.profile.video.enabled',
  title: 'Athlete Video Profiles',
  description: 'Enable video content and video galleries on athlete profile pages.',
  scope: 'athlete',
  type: 'boolean',
  defaultValue: false,
  tags: ['content', 'ux'],
};

const ATHLETE_RECRUITING_PREMIUM_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'athlete.recruiting.premium.enabled',
  title: 'Premium Recruiting Tools',
  description:
    'Enable premium recruiting features: college outreach templates, recruitment tracking, offer management.',
  scope: 'athlete',
  type: 'boolean',
  defaultValue: false,
  tags: ['premium', 'recruiting'],
};

// ============================================
// SCOUT FLAGS
// ============================================

const SCOUT_REPORTS_AI_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'scout.reports.ai.enabled',
  title: 'AI Scout Report Generation',
  description:
    'Enable AI-powered scout report generation with auto-analysis of performance metrics.',
  scope: 'scout',
  type: 'boolean',
  defaultValue: false,
  tags: ['ai', 'premium'],
};

const SCOUT_BOARD_COLLABORATIVE_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'scout.board.collaborative.enabled',
  title: 'Collaborative Scouting Board',
  description: 'Enable multi-user collaborative scouting boards with real-time synchronization.',
  scope: 'scout',
  type: 'boolean',
  defaultValue: false,
  tags: ['collaborative', 'real-time'],
};

const SCOUT_SEARCH_ADVANCED_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'scout.search.advanced.enabled',
  title: 'Advanced Scout Search',
  description:
    'Enable advanced athlete search with detailed filtering, saved searches, and alerts.',
  scope: 'scout',
  type: 'boolean',
  defaultValue: false,
  tags: ['search', 'ux'],
};

// ============================================
// CONTENT FLAGS
// ============================================

const CONTENT_GRAPHICS_AI_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'content.graphics.ai.enabled',
  title: 'AI Graphics Generation',
  description: 'Enable AI-powered graphic design and image generation for content creation.',
  scope: 'content',
  type: 'boolean',
  defaultValue: false,
  tags: ['ai', 'creative', 'premium'],
};

const CONTENT_VIDEO_EDITOR_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'content.video.editor.enabled',
  title: 'Video Editor',
  description: 'Enable in-app video editing tools: trim, crop, effects, transitions, overlays.',
  scope: 'content',
  type: 'boolean',
  defaultValue: false,
  tags: ['content', 'premium'],
};

const CONTENT_TEMPLATES_PREMIUM_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'content.templates.premium.enabled',
  title: 'Premium Content Templates',
  description:
    'Enable premium template library for graphics, videos, social media posts, and email campaigns.',
  scope: 'content',
  type: 'boolean',
  defaultValue: false,
  tags: ['premium', 'content'],
};

// ============================================
// AGENT X FLAGS
// ============================================

const AGENT_PRIMARY_ENABLED_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'agent.primary.enabled',
  title: 'Primary Agent Enabled',
  description:
    'Enable the Primary Agent (Tier A) for autonomous task execution and complex workflows.',
  scope: 'agent',
  type: 'boolean',
  defaultValue: true,
  requiresRestart: true,
  tags: ['agent-x', 'critical'],
};

const AGENT_COORDINATOR_SCOUT_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'agent.coordinator.scout.enabled',
  title: 'Scout Coordinator',
  description: 'Enable Scout Coordinator for scouting workflows and report generation.',
  scope: 'agent',
  type: 'boolean',
  defaultValue: false,
  tags: ['agent-x', 'role-specific'],
};

const AGENT_COORDINATOR_BRAND_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'agent.coordinator.brand.enabled',
  title: 'Brand Coordinator',
  description: 'Enable Brand Coordinator for content creation, graphics, and media management.',
  scope: 'agent',
  type: 'boolean',
  defaultValue: false,
  tags: ['agent-x', 'role-specific'],
};

const AGENT_TOOLS_DISABLED_FLAG: FeatureFlagDefinition<string> = {
  key: 'agent.tools.disabled',
  title: 'Disabled Tools (Comma-Separated)',
  description:
    'Comma-separated list of tool names to disable in Agent X (e.g., "send_email,generate_graphic").',
  scope: 'agent',
  type: 'enum',
  defaultValue: '',
  tags: ['agent-x', 'safety'],
};

const AGENT_IMAGE_GENERATION_DISABLED_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'agent.image.generation.disabled',
  title: 'Disable Image Generation',
  description:
    'Global kill switch: disable all image generation tools (generate_graphic, image_edit, etc.) in Agent X.',
  scope: 'agent',
  type: 'boolean',
  defaultValue: false,
  tags: ['agent-x', 'cost-control'],
};

const AGENT_EMAIL_SENDING_DISABLED_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'agent.email.sending.disabled',
  title: 'Disable Email Sending',
  description:
    'Global kill switch: disable all email sending tools (send_email, batch_send_email) in Agent X.',
  scope: 'agent',
  type: 'boolean',
  defaultValue: false,
  tags: ['agent-x', 'safety', 'cost-control'],
};

const AGENT_GAMEPLANS_ENABLED_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'agent.gameplans.enabled',
  title: 'Agent X Game Plans Panel',
  description:
    'Enable the Game Plans center pill in Agent X desktop shell for viewing, creating, and editing team game plans.',
  scope: 'agent',
  type: 'boolean',
  defaultValue: false,
  tags: ['agent-x', 'premium', 'game-plans'],
};

// ============================================
// AI FLAGS
// ============================================

const AI_PLAY_DIAGRAM_EXTENDED_SPORTS_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'ai.play.diagram.extended.sports.enabled',
  title: 'Play Diagram Extended Sports',
  description:
    'Enable play diagram generation for extended sports beyond football (soccer, baseball, etc.).',
  scope: 'ai',
  type: 'boolean',
  defaultValue: true,
  tags: ['ai', 'play-diagram'],
};

const AI_CONTENT_GENERATION_BATCH_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'ai.content.generation.batch.enabled',
  title: 'Batch Content Generation',
  description:
    'Enable batch AI content generation: generate multiple graphics, videos, or reports in one request.',
  scope: 'ai',
  type: 'boolean',
  defaultValue: false,
  tags: ['ai', 'batch-operations', 'experimental'],
};

const AI_DISTILLER_ENABLED_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'ai.distiller.enabled',
  title: 'Universal AI Distiller',
  description:
    'Enable the universal AI distiller path for Firecrawl content extraction and profile structuring.',
  scope: 'ai',
  type: 'boolean',
  defaultValue: true,
  tags: ['ai', 'distillation'],
};

const AI_MODEL_PROD_CATALOG_IN_DEV_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'ai.model.prod.catalog.in.dev.enabled',
  title: 'Use Production Model Catalog In Dev',
  description:
    'Allow development environments to use the production model catalog and fallback chain for parity testing.',
  scope: 'ai',
  type: 'boolean',
  defaultValue: false,
  tags: ['ai', 'models', 'development'],
};

// ============================================
// UI FLAGS
// ============================================

const UI_MOBILE_NEW_NAV_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'ui.mobile.new.nav.enabled',
  title: 'Mobile New Navigation',
  description: 'Enable new mobile navigation UI redesign (Ionic components, new tab bar).',
  scope: 'ui',
  type: 'boolean',
  defaultValue: false,
  tags: ['ui', 'mobile', 'ux'],
};

const UI_WEB_REDESIGN_PHASE2_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'ui.web.redesign.phase2.enabled',
  title: 'Web Redesign Phase 2',
  description:
    'Enable web UI redesign phase 2: new layouts, components, color scheme, and interactions.',
  scope: 'ui',
  type: 'boolean',
  defaultValue: false,
  tags: ['ui', 'web', 'ux'],
};

const UI_ANIMATIONS_REDUCED_MOTION_DEFAULT_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'ui.animations.reduced.motion.default.enabled',
  title: 'Default to Reduced Motion',
  description:
    'Default to reduced motion animations for all users (unless they override in preferences).',
  scope: 'ui',
  type: 'boolean',
  defaultValue: false,
  tags: ['accessibility', 'performance'],
};

// ============================================
// BILLING FLAGS
// ============================================

const BILLING_STRIPE_ENABLED_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'billing.stripe.enabled',
  title: 'Stripe Billing Enabled',
  description: 'Enable Stripe billing and checkout processing in the backend billing module.',
  scope: 'billing',
  type: 'boolean',
  defaultValue: true,
  tags: ['billing', 'payments', 'critical'],
};

// ============================================
// EXPERIMENTAL FLAGS
// ============================================

const EXPERIMENTAL_THREAD_AS_TRUTH_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'experimental.thread.as.truth.enabled',
  title: 'Thread as Source of Truth (Phase F)',
  description:
    'Phase F: MongoDB thread replay as canonical history source. Replaces flat-string history path.',
  scope: 'experimental',
  type: 'boolean',
  defaultValue: true,
  requiresRestart: true,
  tags: ['experimental', 'phase-f', 'critical'],
};

const EXPERIMENTAL_MONGODB_REPLAY_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'experimental.mongodb.replay.enabled',
  title: 'MongoDB Message Replay',
  description: 'Enable MongoDB-based message replay for thread history reconstruction.',
  scope: 'experimental',
  type: 'boolean',
  defaultValue: true,
  tags: ['experimental', 'phase-f'],
};

const EXPERIMENTAL_REALTIME_SYNC_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'experimental.realtime.sync.enabled',
  title: 'Real-Time Sync',
  description:
    'Enable real-time data synchronization across web and mobile using Firebase Realtime DB.',
  scope: 'experimental',
  type: 'boolean',
  defaultValue: false,
  tags: ['experimental', 'realtime', 'beta'],
};

const EXPERIMENTAL_TYPED_DELTAS_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'experimental.typed.deltas.enabled',
  title: 'Typed Delta Generation',
  description:
    'Enable typed delta generation for mutation policy sync pipeline; fallback to synthetic deltas when disabled.',
  scope: 'experimental',
  type: 'boolean',
  defaultValue: true,
  tags: ['experimental', 'sync', 'agent-x'],
};

const EXPERIMENTAL_AGENT_ENGINE_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'experimental.agent.engine.enabled',
  title: 'Agent Engine Enabled',
  description:
    'Enable Agent X queue bootstrap and background processing workers. Disable as a kill switch.',
  scope: 'experimental',
  type: 'boolean',
  defaultValue: true,
  tags: ['experimental', 'agent-x', 'critical'],
};

const EXPERIMENTAL_SEMANTIC_CACHE_FLAG: FeatureFlagDefinition<boolean> = {
  key: 'experimental.semantic.cache.enabled',
  title: 'Semantic Cache Enabled',
  description:
    'Enable semantic vector cache for equivalent intent reuse in Agent X execution pipelines.',
  scope: 'experimental',
  type: 'boolean',
  defaultValue: false,
  tags: ['experimental', 'cache', 'agent-x'],
};

// ============================================
// REGISTRY
// ============================================

/**
 * Complete feature flag registry — Single source of truth.
 * Add all new flags to this object.
 */
const ALL_FLAGS = {
  // Team
  'team.intel.enabled': TEAM_INTEL_FLAG,
  'team.profiles.enabled': TEAM_PROFILES_FLAG,
  'team.roster.advanced.enabled': TEAM_ROSTER_ADVANCED_FLAG,
  'team.analytics.premium.enabled': TEAM_ANALYTICS_PREMIUM_FLAG,

  // Athlete
  'athlete.highlights.ai.enabled': ATHLETE_HIGHLIGHTS_AI_FLAG,
  'athlete.profile.video.enabled': ATHLETE_PROFILE_VIDEO_FLAG,
  'athlete.recruiting.premium.enabled': ATHLETE_RECRUITING_PREMIUM_FLAG,

  // Scout
  'scout.reports.ai.enabled': SCOUT_REPORTS_AI_FLAG,
  'scout.board.collaborative.enabled': SCOUT_BOARD_COLLABORATIVE_FLAG,
  'scout.search.advanced.enabled': SCOUT_SEARCH_ADVANCED_FLAG,

  // Content
  'content.graphics.ai.enabled': CONTENT_GRAPHICS_AI_FLAG,
  'content.video.editor.enabled': CONTENT_VIDEO_EDITOR_FLAG,
  'content.templates.premium.enabled': CONTENT_TEMPLATES_PREMIUM_FLAG,

  // Agent X
  'agent.primary.enabled': AGENT_PRIMARY_ENABLED_FLAG,
  'agent.coordinator.scout.enabled': AGENT_COORDINATOR_SCOUT_FLAG,
  'agent.coordinator.brand.enabled': AGENT_COORDINATOR_BRAND_FLAG,
  'agent.tools.disabled': AGENT_TOOLS_DISABLED_FLAG,
  'agent.image.generation.disabled': AGENT_IMAGE_GENERATION_DISABLED_FLAG,
  'agent.email.sending.disabled': AGENT_EMAIL_SENDING_DISABLED_FLAG,
  'agent.gameplans.enabled': AGENT_GAMEPLANS_ENABLED_FLAG,

  // AI
  'ai.play.diagram.extended.sports.enabled': AI_PLAY_DIAGRAM_EXTENDED_SPORTS_FLAG,
  'ai.content.generation.batch.enabled': AI_CONTENT_GENERATION_BATCH_FLAG,
  'ai.distiller.enabled': AI_DISTILLER_ENABLED_FLAG,
  'ai.model.prod.catalog.in.dev.enabled': AI_MODEL_PROD_CATALOG_IN_DEV_FLAG,

  // UI
  'ui.mobile.new.nav.enabled': UI_MOBILE_NEW_NAV_FLAG,
  'ui.web.redesign.phase2.enabled': UI_WEB_REDESIGN_PHASE2_FLAG,
  'ui.animations.reduced.motion.default.enabled': UI_ANIMATIONS_REDUCED_MOTION_DEFAULT_FLAG,

  // Billing
  'billing.stripe.enabled': BILLING_STRIPE_ENABLED_FLAG,

  // Experimental
  'experimental.thread.as.truth.enabled': EXPERIMENTAL_THREAD_AS_TRUTH_FLAG,
  'experimental.mongodb.replay.enabled': EXPERIMENTAL_MONGODB_REPLAY_FLAG,
  'experimental.realtime.sync.enabled': EXPERIMENTAL_REALTIME_SYNC_FLAG,
  'experimental.typed.deltas.enabled': EXPERIMENTAL_TYPED_DELTAS_FLAG,
  'experimental.agent.engine.enabled': EXPERIMENTAL_AGENT_ENGINE_FLAG,
  'experimental.semantic.cache.enabled': EXPERIMENTAL_SEMANTIC_CACHE_FLAG,
} as const;

/**
 * Default feature flag registry with helper methods.
 */
export const FEATURE_FLAG_REGISTRY: FeatureFlagRegistry = {
  flags: ALL_FLAGS,

  getFlag(key: FeatureFlagKey) {
    return (ALL_FLAGS as Record<string, FeatureFlagDefinition | undefined>)[key];
  },

  getFlagsByScope(scope) {
    return Object.values(ALL_FLAGS).filter((flag) => flag.scope === scope);
  },

  getFlagsByTag(tag) {
    return Object.values(ALL_FLAGS).filter((flag) => flag.tags?.includes(tag) ?? false);
  },

  validate(key: string, value: unknown): { valid: boolean; error?: string } {
    const flag = (ALL_FLAGS as Record<string, FeatureFlagDefinition | undefined>)[key];

    if (!flag) {
      return { valid: false, error: `Unknown flag: ${key}` };
    }

    // Validate by type
    switch (flag.type) {
      case 'boolean':
        if (value !== null && typeof value !== 'boolean') {
          return { valid: false, error: `Expected boolean, got ${typeof value}` };
        }
        break;

      case 'enum':
        if (value !== null && typeof value !== 'string') {
          return { valid: false, error: `Expected string, got ${typeof value}` };
        }
        if (flag.allowedValues && value && !flag.allowedValues.includes(value as string)) {
          return {
            valid: false,
            error: `Invalid enum value: ${value}. Allowed: ${flag.allowedValues.join(', ')}`,
          };
        }
        break;

      case 'numeric':
        if (value !== null && typeof value !== 'number') {
          return { valid: false, error: `Expected number, got ${typeof value}` };
        }
        if (flag.bounds) {
          if (flag.bounds.min !== undefined && (value as number) < flag.bounds.min) {
            return {
              valid: false,
              error: `Value ${value} is below minimum ${flag.bounds.min}`,
            };
          }
          if (flag.bounds.max !== undefined && (value as number) > flag.bounds.max) {
            return {
              valid: false,
              error: `Value ${value} is above maximum ${flag.bounds.max}`,
            };
          }
        }
        break;

      case 'json':
        if (value !== null && typeof value !== 'object') {
          return { valid: false, error: `Expected object, got ${typeof value}` };
        }
        break;
    }

    return { valid: true };
  },
};

// ============================================
// EXPORTS (Grouped by Scope for Convenience)
// ============================================

/** All team-related feature flags */
export const TEAM_FLAGS = {
  intel: TEAM_INTEL_FLAG,
  profiles: TEAM_PROFILES_FLAG,
  rosterAdvanced: TEAM_ROSTER_ADVANCED_FLAG,
  analyticsPremium: TEAM_ANALYTICS_PREMIUM_FLAG,
} as const;

/** All athlete-related feature flags */
export const ATHLETE_FLAGS = {
  highlightsAi: ATHLETE_HIGHLIGHTS_AI_FLAG,
  profileVideo: ATHLETE_PROFILE_VIDEO_FLAG,
  recruitingPremium: ATHLETE_RECRUITING_PREMIUM_FLAG,
} as const;

/** All scout-related feature flags */
export const SCOUT_FLAGS = {
  reportsAi: SCOUT_REPORTS_AI_FLAG,
  boardCollaborative: SCOUT_BOARD_COLLABORATIVE_FLAG,
  searchAdvanced: SCOUT_SEARCH_ADVANCED_FLAG,
} as const;

/** All content-related feature flags */
export const CONTENT_FLAGS = {
  graphicsAi: CONTENT_GRAPHICS_AI_FLAG,
  videoEditor: CONTENT_VIDEO_EDITOR_FLAG,
  templatesPremium: CONTENT_TEMPLATES_PREMIUM_FLAG,
} as const;

/** All Agent X-related feature flags */
export const AGENT_FLAGS = {
  primaryEnabled: AGENT_PRIMARY_ENABLED_FLAG,
  coordinatorScout: AGENT_COORDINATOR_SCOUT_FLAG,
  coordinatorBrand: AGENT_COORDINATOR_BRAND_FLAG,
  toolsDisabled: AGENT_TOOLS_DISABLED_FLAG,
  imageGenerationDisabled: AGENT_IMAGE_GENERATION_DISABLED_FLAG,
  emailSendingDisabled: AGENT_EMAIL_SENDING_DISABLED_FLAG,
} as const;

/** All AI-related feature flags */
export const AI_FLAGS = {
  playDiagramExtendedSports: AI_PLAY_DIAGRAM_EXTENDED_SPORTS_FLAG,
  contentGenerationBatch: AI_CONTENT_GENERATION_BATCH_FLAG,
  distillerEnabled: AI_DISTILLER_ENABLED_FLAG,
  modelProdCatalogInDev: AI_MODEL_PROD_CATALOG_IN_DEV_FLAG,
} as const;

/** All UI-related feature flags */
export const UI_FLAGS = {
  mobileNewNav: UI_MOBILE_NEW_NAV_FLAG,
  webRedesignPhase2: UI_WEB_REDESIGN_PHASE2_FLAG,
  animationsReducedMotionDefault: UI_ANIMATIONS_REDUCED_MOTION_DEFAULT_FLAG,
} as const;

/** All billing-related feature flags */
export const BILLING_FLAGS = {
  stripeEnabled: BILLING_STRIPE_ENABLED_FLAG,
} as const;

/** All experimental feature flags */
export const EXPERIMENTAL_FLAGS = {
  threadAsTruth: EXPERIMENTAL_THREAD_AS_TRUTH_FLAG,
  mongodbReplay: EXPERIMENTAL_MONGODB_REPLAY_FLAG,
  realtimeSync: EXPERIMENTAL_REALTIME_SYNC_FLAG,
  typedDeltas: EXPERIMENTAL_TYPED_DELTAS_FLAG,
  agentEngine: EXPERIMENTAL_AGENT_ENGINE_FLAG,
  semanticCache: EXPERIMENTAL_SEMANTIC_CACHE_FLAG,
} as const;
