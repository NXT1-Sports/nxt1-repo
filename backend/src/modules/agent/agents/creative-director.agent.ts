/**
 * @fileoverview Creative Director Agent (PR Agent)
 * @module @nxt1/backend/modules/agent/agents
 *
 * Specialized sub-agent for visual content and brand management:
 * - Generating promo graphics and social media assets
 * - Cutting highlight reels from uploaded video
 * - Designing branded templates with sport-specific colors
 * - Creating social media captions and hashtag strategies
 * - Image-to-image editing and enhancement
 *
 * Uses the "creative" model tier and connects to media generation tools.
 */

import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import { BaseAgent } from './base.agent.js';

export class CreativeDirectorAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'creative_director';
  readonly name = 'Creative Director Agent';

  getSystemPrompt(_context: AgentSessionContext): string {
    // TODO: Build the creative director persona with brand guidelines context
    return '';
  }

  getAvailableTools(): readonly string[] {
    // TODO: Return tool names like 'generate_graphic', 'cut_highlight', 'enhance_image', etc.
    return [];
  }

  getModelRouting(): ModelRoutingConfig {
    return MODEL_ROUTING_DEFAULTS.creative;
  }
}
