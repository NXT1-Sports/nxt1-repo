/**
 * @fileoverview Brand & Media Coordinator Agent
 * @module @nxt1/backend/modules/agent/agents
 *
 * Specialized coordinator for visual content, branding, and media management:
 * - Generating promo graphics and social media assets
 * - Cutting highlight reels from uploaded video
 * - Designing branded templates with sport-specific colors
 * - Creating social media captions and hashtag strategies
 * - Image-to-image editing and enhancement
 * - NIL branding and personal brand management
 * - Auto-tagging game film and media library management
 *
 * Uses the "creative" model tier and connects to media generation tools.
 */

import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import { BaseAgent } from './base.agent.js';

export class BrandMediaCoordinatorAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'brand_media_coordinator';
  readonly name = 'Brand & Media Coordinator';

  getSystemPrompt(_context: AgentSessionContext): string {
    // TODO: Build the brand & media coordinator persona with brand guidelines context
    return '';
  }

  getAvailableTools(): readonly string[] {
    // TODO: Return tool names like 'generate_graphic', 'cut_highlight', 'enhance_image', etc.
    return [];
  }

  getModelRouting(): ModelRoutingConfig {
    return MODEL_ROUTING_DEFAULTS['creative'];
  }
}
