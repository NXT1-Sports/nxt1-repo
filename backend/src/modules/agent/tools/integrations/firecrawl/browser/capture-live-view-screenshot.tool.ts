/**
 * @fileoverview Capture Live View Screenshot Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/browser
 */

import { storage as defaultStorage } from '../../../../../../utils/firebase.js';
import { stagingStorage } from '../../../../../../utils/firebase-staging.js';
import { logger } from '../../../../../../utils/logger.js';
import { AgentMediaLifecycleService } from '../../../media/agent-media-lifecycle.service.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../../base.tool.js';
import type {
  LiveViewScreenshotOptions,
  LiveViewSessionService,
} from './live-view-session.service.js';
import { z } from 'zod';

const ScreenshotInputSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  fullPage: z.boolean().optional(),
  selector: z.string().trim().min(1).max(512).optional(),
  format: z.enum(['png', 'jpeg']).optional(),
  quality: z.number().int().min(1).max(100).optional(),
  viewport: z
    .object({
      width: z.number().int().min(320).max(3840),
      height: z.number().int().min(240).max(2160),
    })
    .optional(),
});

type StorageResolver = (environment?: ToolExecutionContext['environment']) => {
  bucket: () => Parameters<typeof AgentMediaLifecycleService.saveBufferAndSignRead>[0]['bucket'];
};

export class CaptureLiveViewScreenshotTool extends BaseTool {
  readonly name = 'capture_live_view_screenshot';

  readonly description =
    'Captures a visual screenshot from the active Firecrawl live-view browser session and stores it as a signed image URL. ' +
    'Use this when you need visual evidence of the current page state, a UI debug snapshot, a proof screenshot, or a still view of what the user sees. ' +
    'This uses Firecrawl Interact Playwright screenshot support on the same browser session shown in the live-view panel. ' +
    'Do not use screenshots as a substitute for actual film/video analysis; for video breakdowns, use extract_live_view_media or extract_live_view_playlist to obtain real media URLs.';

  readonly parameters = ScreenshotInputSchema;
  readonly isMutation = false;
  readonly category = 'system' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  constructor(
    private readonly sessionService: LiveViewSessionService,
    private readonly resolveStorage: StorageResolver = (environment) =>
      environment === 'staging' ? stagingStorage : defaultStorage
  ) {
    super();
  }

  private buildFileName(sessionId: string, mimeType: string): string {
    const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'session';
    return `live-view-${safeSessionId}-${Date.now()}.${extension}`;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ScreenshotInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = context?.userId ?? this.str(input, 'userId');
    if (!userId) return this.paramError('userId');

    try {
      const sessionId = this.sessionService.resolveSessionId(parsed.data.sessionId ?? null, userId);
      const options: LiveViewScreenshotOptions = {
        fullPage: parsed.data.fullPage,
        selector: parsed.data.selector,
        format: parsed.data.format,
        quality: parsed.data.quality,
        viewport: parsed.data.viewport,
      };
      const screenshot = await this.sessionService.captureScreenshot(sessionId, userId, options);
      const buffer = Buffer.from(screenshot.base64, 'base64');
      const fileName = this.buildFileName(sessionId, screenshot.mimeType);
      const bucket = this.resolveStorage(context?.environment).bucket();
      const storagePath = AgentMediaLifecycleService.buildStoragePath({
        userId,
        threadId: context?.threadId,
        zone: 'tmp',
        mimeType: screenshot.mimeType,
        fileName,
      });
      const signed = await AgentMediaLifecycleService.saveBufferAndSignRead({
        bucket,
        storagePath,
        buffer,
        mimeType: screenshot.mimeType,
        cacheControl: 'private, max-age=0',
      });

      logger.info('[CaptureLiveViewScreenshotTool] Screenshot persisted', {
        sessionId,
        userId,
        pageUrl: screenshot.url,
        mimeType: screenshot.mimeType,
        sizeBytes: screenshot.sizeBytes,
        storagePath,
      });

      return {
        success: true,
        data: {
          sessionId,
          url: signed.url,
          imageUrl: signed.url,
          downloadUrl: signed.url,
          expiresAt: new Date(signed.expiresAt).toISOString(),
          storagePath,
          fileName,
          mimeType: screenshot.mimeType,
          sizeBytes: screenshot.sizeBytes,
          pageUrl: screenshot.url,
          title: screenshot.title,
          capturedAt: screenshot.capturedAt,
          fullPage: screenshot.fullPage,
          selector: screenshot.selector,
          viewport: screenshot.viewport,
          source: screenshot.source,
          message: `Captured a live-view screenshot from ${screenshot.url}.`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to capture live view screenshot';
      logger.error('[CaptureLiveViewScreenshotTool] Capture failed', {
        userId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
