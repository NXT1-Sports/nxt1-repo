/**
 * @fileoverview Generate Image Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Agent X tool for generating images via the OpenRouter multimodal API.
 * Used by the BrandMediaCoordinatorAgent for creating:
 * - Welcome graphics (personalized for athletes and teams)
 * - Promo graphics and social media assets
 * - Brand collateral and visual content
 *
 * The tool delegates image generation to OpenRouterService.generateImage()
 * and uploads the result to Firebase Storage for CDN delivery.
 *
 * Architecture:
 * - Tool receives a text prompt + optional reference image URL
 * - OpenRouterService calls the image model (Nano Banana Pro 2)
 * - Generated image is uploaded to Firebase Storage
 * - Returns the public CDN URL to the agent for downstream use
 */

import { getStorage } from 'firebase-admin/storage';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';

export class GenerateImageTool extends BaseTool {
  readonly name = 'generate_image';
  readonly description =
    'Generates an image from a text prompt using an AI image model. ' +
    'Can optionally accept a reference image URL for compositing or image-to-image editing. ' +
    'Returns a public CDN URL of the generated image. ' +
    'Use for: welcome graphics, promo cards, social media assets, branded templates, ' +
    'team graphics with logos, athlete profile cards, and any visual content creation.';

  readonly parameters = {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description:
          'Detailed text prompt describing the image to generate. ' +
          'Include style, colors, layout, text overlays, and composition instructions.',
      },
      referenceImageUrl: {
        type: 'string',
        description:
          'Optional public URL of a reference image to use as input. ' +
          'For compositing tasks (e.g. incorporating an athlete photo or team logo).',
      },
      storagePath: {
        type: 'string',
        description:
          'Firebase Storage path prefix for the generated image ' +
          '(e.g. "agent-graphics/welcome"). A unique filename is appended automatically.',
      },
      userId: {
        type: 'string',
        description: 'The user ID this image is being generated for (used in storage path).',
      },
    },
    required: ['prompt', 'storagePath', 'userId'],
  } as const;

  override readonly allowedAgents = ['brand_media_coordinator'] as const;

  readonly isMutation = true;
  readonly category = 'media' as const;

  constructor(private readonly llm: OpenRouterService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const prompt = input['prompt'];
    const referenceImageUrl = input['referenceImageUrl'];
    const storagePath = input['storagePath'];
    const userId = input['userId'];

    // ── Input validation ───────────────────────────────────────────────
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return {
        success: false,
        error: 'Parameter "prompt" is required and must be a non-empty string.',
      };
    }
    if (typeof storagePath !== 'string' || storagePath.trim().length === 0) {
      return { success: false, error: 'Parameter "storagePath" is required.' };
    }
    if (typeof userId !== 'string' || userId.trim().length === 0) {
      return { success: false, error: 'Parameter "userId" is required.' };
    }
    if (referenceImageUrl !== undefined && typeof referenceImageUrl !== 'string') {
      return { success: false, error: 'Parameter "referenceImageUrl" must be a string URL.' };
    }

    // Sanitize storagePath — constrain to the agent-graphics directory
    const sanitizedPath = (storagePath as string).trim().replace(/\.\./g, '').replace(/\/\//g, '/');
    if (!sanitizedPath.startsWith('agent-graphics/')) {
      return { success: false, error: 'storagePath must start with "agent-graphics/".' };
    }

    // ── Generate image ─────────────────────────────────────────────────
    try {
      const progress = context?.onProgress;
      progress?.('Generating image with AI…');
      const result = await this.llm.generateImage({
        prompt: prompt.trim(),
        referenceImageUrl: typeof referenceImageUrl === 'string' ? referenceImageUrl : undefined,
        telemetryContext: {
          operationId: '',
          userId: userId as string,
          agentId: 'brand_media_coordinator',
        },
      });

      // ── Upload to Firebase Storage ─────────────────────────────────
      progress?.('Uploading to CDN…');
      const timestamp = Date.now();
      const extension = result.mimeType === 'image/jpeg' ? 'jpg' : 'png';

      // Thread-scoped staging: media shares the thread's lifecycle and is
      // bulk-deleted when the thread expires. Falls back to the legacy
      // agent-graphics/ path only when no thread context is available.
      const filePath =
        context?.userId && context?.threadId
          ? `users/${context.userId}/threads/${context.threadId}/media/${timestamp}-${userId}.${extension}`
          : `${sanitizedPath}/${timestamp}-${userId}.${extension}`;

      const bucket = getStorage().bucket();
      const file = bucket.file(filePath);
      const imageBuffer = Buffer.from(result.imageBase64, 'base64');

      // Upload the file
      await file.save(imageBuffer, {
        contentType: result.mimeType,
        metadata: { cacheControl: 'public, max-age=31536000, immutable' },
      });

      // Make publicly accessible and build direct URL
      await file.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

      return {
        success: true,
        data: {
          imageUrl: publicUrl,
          storagePath: filePath,
          mimeType: result.mimeType,
          model: result.model,
          latencyMs: result.latencyMs,
          costUsd: result.costUsd,
          textContent: result.textContent,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image generation failed';
      return { success: false, error: message };
    }
  }
}
