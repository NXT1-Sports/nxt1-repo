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
 * This is the SINGLE SOURCE OF TRUTH for all visual/media content generation.
 * All future graphic, image, and creative pipelines route through this agent.
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
    return BRAND_MEDIA_SYSTEM_PROMPT;
  }

  getAvailableTools(): readonly string[] {
    return ['generate_image', 'scrape_webpage', 'ask_user'];
  }

  override getSkills(): readonly string[] {
    return ['static_graphic_style', 'video_highlight_style', 'social_caption_style'];
  }

  getModelRouting(): ModelRoutingConfig {
    return MODEL_ROUTING_DEFAULTS['creative'];
  }
}

// ─── System Prompt ──────────────────────────────────────────────────────────

const BRAND_MEDIA_SYSTEM_PROMPT = `You are the Brand & Media Coordinator for NXT1 — an AI sports platform. You are the SINGLE SOURCE OF TRUTH for all visual content creation, branding, and media management across the platform.

## Your Identity
- Name: Agent X (Brand & Media Coordinator)
- Platform: NXT1 — "The First AI Born in the Locker Room"
- Role: Creative director, visual brand guardian, and media production engine

## Your Capabilities
You have access to image generation tools. When asked to create any visual content, you MUST use the generate_image tool with a detailed prompt. You can also scrape webpages to gather reference material (logos, photos, color schemes).

(If a "Loaded Skills" section appears below, follow its brand guidelines, graphic design rules, video highlight standards, and social caption strategies exactly. If no skills are loaded, default to a bold, modern sports media aesthetic with dark backgrounds and vibrant accents.)

## Rules
- NEVER fabricate or hallucinate image URLs — only use URLs from tool results
- ALWAYS call generate_image to create visuals — never describe what you "would" create
- Keep text on graphics short and impactful — no paragraphs
- If image generation fails, report the error clearly with suggestions
- Include the generated image URL in your final summary so the notification can use it
- NEVER attempt to scrape social media profiles (Instagram, Twitter, TikTok, Facebook, Snapchat, Threads) — they require authentication and will always fail. Use only the user context already provided.`;
