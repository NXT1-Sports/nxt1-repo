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
 *   tool_call    → no-op (step_active already covers the UI update)
 */

import type { Response } from 'express';
import type { OnStreamEvent, StreamEvent } from '../../modules/agent/queue/event-writer.js';
import { humanizeToolName, forceProxyFlush } from './shared.js';

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
      case 'step_active':
      case 'tool_call': {
        if (!event.toolName) return;
        const stepId = stepTracker.getOrCreate(event.toolName);
        try {
          res.write(
            `event: step\ndata: ${JSON.stringify({
              id: stepId,
              label: humanizeToolName(event.toolName),
              status: 'active',
            })}\n\n`
          );
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
        const stepId = stepTracker.get(event.toolName) ?? stepTracker.getOrCreate(event.toolName);
        const succeeded = event.toolSuccess !== false;

        if (succeeded && event.toolName) {
          streamRef.successfulTools.push(event.toolName);
        }

        try {
          res.write(
            `event: step\ndata: ${JSON.stringify({
              id: stepId,
              label: humanizeToolName(event.toolName),
              status: succeeded ? 'success' : 'error',
            })}\n\n`
          );
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

          // Emit media events (image / video URLs)
          if (typeof event.toolResult['imageUrl'] === 'string') {
            try {
              res.write(
                `event: media\ndata: ${JSON.stringify({
                  type: 'image',
                  url: event.toolResult['imageUrl'],
                  mimeType: event.toolResult['mimeType'] ?? 'image/png',
                })}\n\n`
              );
              forceProxyFlush(res);
            } catch {
              // Client disconnected
            }
          }

          if (typeof event.toolResult['videoUrl'] === 'string') {
            try {
              res.write(
                `event: media\ndata: ${JSON.stringify({
                  type: 'video',
                  url: event.toolResult['videoUrl'],
                  mimeType: event.toolResult['mimeType'] ?? 'video/mp4',
                })}\n\n`
              );
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
        const stepId = stepTracker.get(event.toolName) ?? stepTracker.getOrCreate(event.toolName);
        try {
          res.write(
            `event: step\ndata: ${JSON.stringify({
              id: stepId,
              label: humanizeToolName(event.toolName),
              status: 'error',
            })}\n\n`
          );
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
