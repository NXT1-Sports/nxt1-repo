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
 *   tool_result  → captures heavyTaskOperationId / media / autoOpenPanel
 *   tool_call    → no-op (step_active carries the canonical UI step identity)
 */

import type { Response } from 'express';
import type { OnStreamEvent, StreamEvent } from '../../modules/agent/queue/event-writer.js';
import { forceProxyFlush } from './shared.js';

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

type SseMediaPayload = {
  type: 'image' | 'video';
  url: string;
  mimeType?: string;
};

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
  return null;
}

function maybePushMedia(
  seen: Set<string>,
  output: SseMediaPayload[],
  urlValue: unknown,
  mimeTypeValue?: unknown,
  forcedType?: 'image' | 'video'
): void {
  if (typeof urlValue !== 'string') return;
  const url = urlValue.trim();
  if (!url || !isHttpUrl(url)) return;
  const mimeType = typeof mimeTypeValue === 'string' ? mimeTypeValue : undefined;
  const type = forcedType ?? inferMediaType(url, mimeType);
  if (!type) return;
  const dedupeKey = `${type}|${url}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  output.push({ type, url, ...(mimeType ? { mimeType } : {}) });
}

function extractMediaPayloads(toolResult: Record<string, unknown>): readonly SseMediaPayload[] {
  const seen = new Set<string>();
  const media: SseMediaPayload[] = [];

  maybePushMedia(seen, media, toolResult['imageUrl'], toolResult['mimeType'], 'image');
  maybePushMedia(seen, media, toolResult['videoUrl'], toolResult['mimeType'], 'video');
  maybePushMedia(seen, media, toolResult['url'], toolResult['mimeType']);
  maybePushMedia(seen, media, toolResult['publicUrl'], toolResult['mimeType']);
  maybePushMedia(seen, media, toolResult['downloadUrl'], toolResult['mimeType']);
  maybePushMedia(seen, media, toolResult['outputUrl'], toolResult['mimeType'], 'video');

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
      maybePushMedia(seen, media, record['url'], record['mimeType'], undefined);
      maybePushMedia(seen, media, record['downloadUrl'], record['mimeType'], undefined);
    }
  }

  const markdownOrText = [toolResult['markdown'], toolResult['text'], toolResult['content']]
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
  if (markdownOrText) {
    const matches = markdownOrText.match(/https?:\/\/[^\s)\]"']+/gi) ?? [];
    for (const match of matches) {
      maybePushMedia(seen, media, match, undefined, undefined);
    }
  }

  return media;
}

function toStepPayload(
  event: StreamEvent,
  status: 'active' | 'success' | 'error'
): Record<string, unknown> | null {
  const stepId = typeof event.stepId === 'string' ? event.stepId.trim() : '';
  const label = typeof event.message === 'string' ? event.message.trim() : '';
  if (!stepId || !label) return null;

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
    ...(event.metadata ? { metadata: event.metadata } : {}),
    ...(event.icon ? { icon: event.icon } : {}),
    status,
  };
}

// ─── Step ID tracker ──────────────────────────────────────────────────────

class StepIdTracker {
  private counter = 0;
  private readonly toolToStepId = new Map<string, string>();

  getOrCreate(toolName: string): string {
    const existing = this.toolToStepId.get(toolName);
    if (existing) return existing;
    const id = `step-${this.counter++}`;
    this.toolToStepId.set(toolName, id);
    return id;
  }

  get(toolName: string): string | undefined {
    return this.toolToStepId.get(toolName);
  }
}

// ─── Adapter factory ───────────────────────────────────────────────────────

/**
 * Build an `OnStreamEvent` callback that writes SSE events to the HTTP
 * response, and captures runtime state into `streamRef` for the caller
 * to read after the agent run completes.
 */
export function buildSseStreamCallback(res: Response, streamRef: SseStreamRef): OnStreamEvent {
  const stepTracker = new StepIdTracker();

  return (event: StreamEvent): void => {
    // Guard: never write to a closed connection
    if (res.writableEnded) return;

    switch (event.type) {
      // ── Text delta ────────────────────────────────────────────────────
      case 'delta': {
        if (!event.text) return;
        try {
          res.write(`event: delta\ndata: ${JSON.stringify({ content: event.text })}\n\n`);
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
        if (!event.toolName) return;
        const stepId = event.stepId ?? stepTracker.getOrCreate(event.toolName);
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
        if (!event.toolName) return;
        const stepId =
          event.stepId ??
          stepTracker.get(event.toolName) ??
          stepTracker.getOrCreate(event.toolName);
        const succeeded = event.toolSuccess !== false;
        const payload = toStepPayload({ ...event, stepId }, succeeded ? 'success' : 'error');
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
        if (!event.toolName) return;
        const stepId =
          event.stepId ??
          stepTracker.get(event.toolName) ??
          stepTracker.getOrCreate(event.toolName);
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
