/**
 * @fileoverview SSE Stream Adapter
 *
 * Bridges the agent framework's `OnStreamEvent` callback to the HTTP SSE
 * wire protocol consumed by the frontend. Replaces the manual agentic loop
 * that was previously inline in chat.routes.ts.
 *
 * Maps `StreamEvent.type` → SSE event name + data shape:
 *
 *   delta        → event: delta   { content: string }
 *   step_active  → event: step    { id, label, status: 'active' }
 *   step_done    → event: step    { id, label, status: 'success' }
 *   step_error   → event: step    { id, label, status: 'error' }
 *   card         → event: card    { ...cardData }
 *   tool_result  → captures media / autoOpenPanel
 *   tool_call    → no-op (step_active carries the canonical UI step identity)
 */

import type { Response } from 'express';
import type { OnStreamEvent, StreamEvent } from '../../modules/agent/queue/event-writer.js';
import { forceProxyFlush } from './shared.js';
import { logger } from '../../utils/logger.js';
import { createStreamingSanitizer, type StreamingSanitizer } from '@nxt1/core';

// ─── Shared mutable ref ────────────────────────────────────────────────────

/**
 * Mutable state captured by the SSE adapter and read by the route handler
 * after `agentRouterRef.run()` completes.
 */
export interface SseStreamRef {
  /** All tool names invoked during the run (for billing metadata). */
  invokedTools: string[];
  /** Successful tool names completed during the run (for dynamic feature naming). */
  successfulTools: string[];
  /** The model name resolved from the LLM response (best-effort). */
  model: string;
  /** Token usage totals (best-effort, may be undefined if unavailable). */
  tokenUsage: { inputTokens: number; outputTokens: number; model: string } | undefined;
  /** autoOpenPanel payload from tools (e.g. live view, media panel). */
  pendingAutoOpenPanel: Record<string, unknown> | null;
}

export interface SseStreamDebugConfig {
  readonly enabled?: boolean;
  readonly operationId?: string;
  readonly userId?: string;
  /**
   * URLs of attachments the user uploaded in this turn. The adapter strips any
   * `<video>`/`<img>`/markdown image whose URL matches this set out of streaming
   * deltas so the assistant never echoes the user's own media back to them.
   */
  readonly userAttachmentUrls?: ReadonlySet<string>;
}

type SseMediaPayload = {
  type: 'image' | 'video';
  url: string;
  mimeType?: string;
  thumbnailUrl?: string;
};

function humanizeToolName(toolName: string): string {
  return toolName
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function inferMediaType(url: string, mimeType?: string): 'image' | 'video' | null {
  const lowerMime = (mimeType ?? '').toLowerCase();
  if (lowerMime.startsWith('image/')) return 'image';
  if (lowerMime.startsWith('video/')) return 'video';

  const lowerUrl = url.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:\?|#|$)/i.test(lowerUrl)) return 'image';
  if (/\.(mp4|mov|m4v|webm|avi|mkv|m3u8)(?:\?|#|$)/i.test(lowerUrl)) return 'video';
  if (/videodelivery\.net\//i.test(lowerUrl)) return 'video';
  // Firebase Storage / GCS: encoded paths or extensionless objects — detect by domain + path
  if (/(?:firebasestorage|storage)\.googleapis\.com/i.test(lowerUrl)) {
    if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#%]|$)/i.test(lowerUrl)) return 'image';
    if (/\.(mp4|mov|m4v|webm|avi|mkv)(?:[?#%]|$)/i.test(lowerUrl)) return 'video';
    if (/(?:\/|%2F)videos?(?:\/|%2F)/i.test(lowerUrl)) return 'video';
    if (/(?:\/|%2F)images?(?:\/|%2F)/i.test(lowerUrl)) return 'image';
  }
  return null;
}

function maybePushMedia(
  seen: Set<string>,
  output: SseMediaPayload[],
  urlValue: unknown,
  mimeTypeValue?: unknown,
  forcedType?: 'image' | 'video',
  thumbnailUrlValue?: unknown
): void {
  if (typeof urlValue !== 'string') return;
  const url = urlValue.trim();
  if (!url || !isHttpUrl(url)) return;
  const mimeType = typeof mimeTypeValue === 'string' ? mimeTypeValue : undefined;
  const type = forcedType ?? inferMediaType(url, mimeType);
  if (!type) return;
  const thumbnailUrl =
    typeof thumbnailUrlValue === 'string' && isHttpUrl(thumbnailUrlValue.trim())
      ? thumbnailUrlValue.trim()
      : undefined;
  const dedupeKey = `${type}|${url}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  output.push({
    type,
    url,
    ...(mimeType ? { mimeType } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  });
}

function extractMediaPayloads(toolResult: Record<string, unknown>): readonly SseMediaPayload[] {
  const seen = new Set<string>();
  const media: SseMediaPayload[] = [];

  maybePushMedia(seen, media, toolResult['imageUrl'], toolResult['mimeType'], 'image');
  maybePushMedia(
    seen,
    media,
    toolResult['videoUrl'],
    toolResult['mimeType'],
    'video',
    toolResult['thumbnailUrl']
  );
  maybePushMedia(seen, media, toolResult['url'], toolResult['mimeType']);
  maybePushMedia(seen, media, toolResult['publicUrl'], toolResult['mimeType']);
  maybePushMedia(seen, media, toolResult['downloadUrl'], toolResult['mimeType']);
  maybePushMedia(
    seen,
    media,
    toolResult['outputUrl'],
    toolResult['mimeType'],
    'video',
    toolResult['thumbnailUrl']
  );

  const imageUrls = toolResult['imageUrls'];
  if (Array.isArray(imageUrls)) {
    for (const url of imageUrls) maybePushMedia(seen, media, url, toolResult['mimeType'], 'image');
  }

  const videoUrls = toolResult['videoUrls'];
  if (Array.isArray(videoUrls)) {
    for (const url of videoUrls) maybePushMedia(seen, media, url, toolResult['mimeType'], 'video');
  }

  const files = toolResult['files'];
  if (Array.isArray(files)) {
    for (const file of files) {
      if (!file || typeof file !== 'object') continue;
      const record = file as Record<string, unknown>;
      maybePushMedia(
        seen,
        media,
        record['url'],
        record['mimeType'],
        undefined,
        record['thumbnailUrl']
      );
      maybePushMedia(
        seen,
        media,
        record['downloadUrl'],
        record['mimeType'],
        undefined,
        record['thumbnailUrl']
      );
    }
  }

  const attachments = toolResult['attachments'];
  if (Array.isArray(attachments)) {
    for (const attachment of attachments) {
      if (!attachment || typeof attachment !== 'object') continue;
      const record = attachment as Record<string, unknown>;
      const forcedType =
        record['type'] === 'image' || record['type'] === 'video' ? record['type'] : undefined;
      maybePushMedia(
        seen,
        media,
        record['url'],
        record['mimeType'],
        forcedType,
        record['thumbnailUrl']
      );
      maybePushMedia(
        seen,
        media,
        record['downloadUrl'],
        record['mimeType'],
        forcedType,
        record['thumbnailUrl']
      );
    }
  }

  const mediaArtifact = toolResult['mediaArtifact'];
  if (mediaArtifact && typeof mediaArtifact === 'object' && !Array.isArray(mediaArtifact)) {
    const record = mediaArtifact as Record<string, unknown>;
    const forcedType =
      record['type'] === 'image' || record['type'] === 'video' ? record['type'] : undefined;
    maybePushMedia(
      seen,
      media,
      record['url'],
      record['mimeType'],
      forcedType,
      record['thumbnailUrl']
    );
    maybePushMedia(
      seen,
      media,
      record['downloadUrl'],
      record['mimeType'],
      forcedType,
      record['thumbnailUrl']
    );
  }

  // NOTE: We intentionally do NOT scan `toolResult.markdown` / `text` / `content`
  // for free-floating URLs. Tools that want to surface assets to the media panel
  // must publish them through dedicated fields (`imageUrl`, `videoUrl`, `files`,
  // `imageUrls`, `videoUrls`, `outputUrl`). Scanning prose for URLs surfaced too
  // many false positives (e.g. citations, links to articles, the user's own
  // attachment URLs echoed by the model).

  return media;
}

function toStepPayload(
  event: StreamEvent,
  status: 'active' | 'success' | 'error'
): Record<string, unknown> | null {
  const stepId = typeof event.stepId === 'string' ? event.stepId.trim() : '';
  const explicitLabel = typeof event.message === 'string' ? event.message.trim() : '';
  const fallbackLabel =
    typeof event.toolName === 'string' && event.toolName.trim().length > 0
      ? humanizeToolName(event.toolName)
      : '';
  const label = explicitLabel || fallbackLabel;
  if (!stepId || !label) return null;

  const toolName =
    'toolName' in event && typeof event.toolName === 'string' ? event.toolName.trim() : '';
  const metadata = {
    ...((event.metadata as Record<string, unknown> | undefined) ?? {}),
    ...(toolName ? { toolName } : {}),
  };

  return {
    ...(typeof event.seq === 'number' ? { seq: event.seq } : {}),
    emittedAt: new Date().toISOString(),
    ...(event.messageKey ? { messageKey: event.messageKey } : {}),
    id: stepId,
    label,
    ...(event.agentId ? { agentId: event.agentId } : {}),
    ...(event.stageType ? { stageType: event.stageType } : {}),
    ...(event.stage ? { stage: event.stage } : {}),
    ...(event.outcomeCode ? { outcomeCode: event.outcomeCode } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    ...(event.icon ? { icon: event.icon } : {}),
    status,
  };
}

// ─── Step ID tracker ──────────────────────────────────────────────────────

class StepIdTracker {
  private counter = 0;
  private readonly pendingStepIds = new Map<string, string[]>();

  private nextStepId(): string {
    const id = `step-${this.counter++}`;
    return id;
  }

  resolveStartedStepId(event: StreamEvent): string | null {
    if (!event.toolName) return null;
    if (event.stepId && event.stepId.trim()) {
      return event.stepId;
    }

    const stepId = this.nextStepId();
    const queue = this.pendingStepIds.get(event.toolName) ?? [];
    queue.push(stepId);
    this.pendingStepIds.set(event.toolName, queue);
    return stepId;
  }

  resolveCompletedStepId(event: StreamEvent): string | null {
    if (!event.toolName) return null;
    if (event.stepId && event.stepId.trim()) {
      return event.stepId;
    }

    const pending = this.pendingStepIds.get(event.toolName)?.shift();
    if (pending) return pending;
    return this.nextStepId();
  }
}

// ─── Adapter factory ───────────────────────────────────────────────────────

/**
 * Build an `OnStreamEvent` callback that writes SSE events to the HTTP
 * response, and captures runtime state into `streamRef` for the caller
 * to read after the agent run completes.
 */
export function buildSseStreamCallback(
  res: Response,
  streamRef: SseStreamRef,
  debug?: SseStreamDebugConfig
): OnStreamEvent {
  const stepTracker = new StepIdTracker();

  // Defense-in-depth: strip any `<video>`/`<img>`/markdown image whose URL
  // matches the user's own attachments out of streaming deltas. The system
  // prompt instructs the model never to re-embed user media, but a deterministic
  // pass guarantees correctness even if the LLM ignores the rule.
  const userAttachmentUrls = debug?.userAttachmentUrls;
  const sanitizer: StreamingSanitizer | null =
    userAttachmentUrls && userAttachmentUrls.size > 0
      ? createStreamingSanitizer(userAttachmentUrls)
      : null;

  return (event: StreamEvent): void => {
    // Guard: never write to a closed connection
    if (res.writableEnded) return;

    switch (event.type) {
      // ── Text delta ────────────────────────────────────────────────────
      case 'delta': {
        if (!event.text) return;
        const safeText = sanitizer ? sanitizer.push(event.text) : event.text;
        if (!safeText) return;
        try {
          res.write(`event: delta\ndata: ${JSON.stringify({ content: safeText })}\n\n`);
        } catch {
          // Client disconnected — handled by abort signal
        }
        return;
      }

      // ── Tool starting ─────────────────────────────────────────────────
      case 'tool_call': {
        return;
      }

      case 'step_active': {
        const stepId = stepTracker.resolveStartedStepId(event);
        if (!stepId) return;
        const payload = toStepPayload({ ...event, stepId }, 'active');
        if (!payload) return;
        try {
          res.write(`event: step\ndata: ${JSON.stringify(payload)}\n\n`);
          forceProxyFlush(res);
        } catch {
          // Client disconnected
        }
        if (event.toolName) streamRef.invokedTools.push(event.toolName);
        return;
      }

      // ── Tool done ─────────────────────────────────────────────────────
      case 'step_done':
      case 'tool_result': {
        const stepId = stepTracker.resolveCompletedStepId(event);
        if (!stepId) return;
        const succeeded = event.toolSuccess !== false;
        const enrichedMetadata = {
          ...((event.metadata as Record<string, unknown> | undefined) ?? {}),
        };
        const payload = toStepPayload(
          { ...event, stepId, metadata: enrichedMetadata },
          succeeded ? 'success' : 'error'
        );
        if (!payload) return;

        if (succeeded && event.toolName) {
          streamRef.successfulTools.push(event.toolName);
        }

        try {
          res.write(`event: step\ndata: ${JSON.stringify(payload)}\n\n`);
          forceProxyFlush(res);
        } catch {
          // Client disconnected
        }

        // Capture autoOpenPanel payload (e.g. live-view, media)
        if (succeeded && event.toolResult) {
          if (
            typeof event.toolResult['autoOpenPanel'] === 'object' &&
            event.toolResult['autoOpenPanel'] !== null
          ) {
            streamRef.pendingAutoOpenPanel = event.toolResult['autoOpenPanel'] as Record<
              string,
              unknown
            >;
            try {
              res.write(
                `event: panel\ndata: ${JSON.stringify(streamRef.pendingAutoOpenPanel)}\n\n`
              );
              forceProxyFlush(res);
            } catch {
              // Client disconnected
            }
          }

          // Emit media events (image / video URLs) from common tool-result shapes.
          const mediaPayloads = extractMediaPayloads(event.toolResult);
          for (const media of mediaPayloads) {
            if (debug?.enabled) {
              logger.info('Agent X stream output (adapter-media)', {
                operationId: debug.operationId ?? null,
                userId: debug.userId ?? null,
                event: 'media',
                type: media.type,
                mediaHost: (() => {
                  try {
                    return new URL(media.url).host;
                  } catch {
                    return null;
                  }
                })(),
                mimeType: media.mimeType ?? null,
                sourceTool: event.toolName ?? null,
              });
            }
            try {
              res.write(`event: media\ndata: ${JSON.stringify(media)}\n\n`);
              forceProxyFlush(res);
            } catch {
              // Client disconnected
            }
          }
        }

        return;
      }

      // ── Tool failed ───────────────────────────────────────────────────
      case 'step_error': {
        const stepId = stepTracker.resolveCompletedStepId(event);
        if (!stepId) return;
        const payload = toStepPayload({ ...event, stepId }, 'error');
        if (!payload) return;
        try {
          res.write(`event: step\ndata: ${JSON.stringify(payload)}\n\n`);
          forceProxyFlush(res);
        } catch {
          // Client disconnected
        }
        return;
      }

      // ── Rich UI card (plan, approval, etc.) ───────────────────────────
      case 'card': {
        if (!event.cardData) return;
        try {
          res.write(`event: card\ndata: ${JSON.stringify(event.cardData)}\n\n`);
          forceProxyFlush(res);
        } catch {
          // Client disconnected
        }
        return;
      }

      // ── Operation lifecycle / phase commentary ────────────────────────
      case 'operation': {
        try {
          res.write(
            `event: operation\ndata: ${JSON.stringify({
              operationId: event.operationId,
              threadId: event.threadId,
              status: event.status,
              agentId: event.agentId,
              stageType: event.stageType,
              stage: event.stage,
              outcomeCode: event.outcomeCode,
              metadata: event.metadata,
              message: event.message,
              yieldState: event.yieldState,
              timestamp: event.timestamp ?? new Date().toISOString(),
            })}\n\n`
          );
          forceProxyFlush(res);
        } catch {
          // Client disconnected
        }
        return;
      }

      case 'progress_stage':
      case 'progress_subphase':
      case 'metric': {
        try {
          res.write(
            `event: progress\ndata: ${JSON.stringify({
              operationId: event.operationId,
              threadId: event.threadId,
              type: event.type,
              agentId: event.agentId,
              stageType: event.stageType,
              stage: event.stage,
              outcomeCode: event.outcomeCode,
              metadata: event.metadata,
              message: event.message,
              timestamp: event.timestamp ?? new Date().toISOString(),
            })}\n\n`
          );
          forceProxyFlush(res);
        } catch {
          // Client disconnected
        }
        return;
      }

      // All other event types (e.g. 'done', 'error') are handled by the
      // route handler directly — not emitted by base.agent.ts callbacks.
      default:
        return;
    }
  };
}
