/**
 * @fileoverview Redis PubSub Service — Agent Stream Pipe
 * @module @nxt1/backend/modules/agent/queue
 *
 * Bridges the gap between BullMQ background workers and Express SSE connections.
 * When a heavy task runs in BullMQ, the worker publishes SSE-format events to a
 * Redis PubSub channel (`agent:stream:{jobId}`). The Express server holding the
 * user's SSE connection subscribes to that channel and forwards events verbatim.
 *
 * This gives the frontend a seamless, unified streaming experience regardless of
 * whether the LLM loop runs inline in Express or in a background worker.
 *
 * Architecture:
 *   BullMQ Worker → Redis PubSub channel → Express SSE proxy → Frontend
 *
 * Key design decisions:
 * - Uses a **dedicated subscriber Redis client** (ioredis requires a separate
 *   connection for subscriptions — the subscribed client cannot run commands).
 * - Publisher reuses the standard ioredis connection (no extra client needed).
 * - Channel naming: `agent:stream:{jobId}` — scoped per operation.
 * - Messages are raw SSE strings (e.g. `event: delta\ndata: {...}\n\n`).
 * - Terminal events (`done`, `error`) signal that the stream is complete.
 */

import { Redis } from 'ioredis';
import { AgentQueueService } from './queue.service.js';
import { logger } from '../../../utils/logger.js';
import { getRuntimeEnvironment } from '../../../config/runtime-environment.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Redis PubSub channel prefix for agent streaming. */
export const AGENT_STREAM_CHANNEL_PREFIX =
  getRuntimeEnvironment() === 'production' ? 'agent:stream:prod:' : 'agent:stream:stg:';

/**
 * Redis PubSub channel prefix for cross-instance lifecycle control messages
 * (pause / cancel). Separated from stream events so SSE proxies don't see
 * control traffic.
 *
 * The control channel is the ONLY way for a pause/cancel HTTP request that
 * lands on instance A to reach a worker running on instance B. Without this,
 * the in-memory `activeControllers` map on instance A is empty for that
 * operation and `controller.abort()` is a no-op.
 */
export const AGENT_CONTROL_CHANNEL_PREFIX =
  getRuntimeEnvironment() === 'production' ? 'agent:control:prod:' : 'agent:control:stg:';

/**
 * Redis PubSub channel prefix for cross-instance pending-attachment
 * resolutions. The /chat handler subscribes here while it waits for the
 * frontend to finish uploading deferred attachments; the /pending-attachments
 * resolver publishes the resolved payload so the waiting handler can resume
 * regardless of which instance received the resolution POST.
 */
export const AGENT_ATTACHMENTS_CHANNEL_PREFIX =
  getRuntimeEnvironment() === 'production' ? 'agent:attachments:prod:' : 'agent:attachments:stg:';

/** Reserved event type indicating the stream is complete (worker finished). */
export const STREAM_TERMINAL_EVENTS = new Set(['done', 'error']);

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A single SSE-style message published through the Redis pipe.
 * Serialized as JSON on the wire.
 */
export interface PubSubStreamMessage {
  /** SSE event type: delta, step, card, done, error, ping */
  readonly event: string;
  /** JSON-serializable payload for the SSE `data:` field */
  readonly data: unknown;
}

/** Callback invoked for each message received on a subscribed channel. */
export type PubSubMessageHandler = (message: PubSubStreamMessage) => void;

/** Cleanup function returned by subscribe — call to unsubscribe. */
export type PubSubUnsubscribe = () => Promise<void>;

/**
 * Cross-instance lifecycle control actions broadcast over Redis.
 * Workers listen on the control channel for the operations they own.
 */
export type AgentControlAction = 'pause' | 'cancel';

/** Payload for control messages — minimal so any worker instance can act. */
export interface AgentControlMessage {
  readonly action: AgentControlAction;
  readonly operationId: string;
  /** ISO timestamp the control message was issued (for diagnostics). */
  readonly issuedAt: string;
  /** Optional user that issued the control (for audit logs). */
  readonly issuedBy?: string;
}

/** Callback invoked when a control message arrives for a subscribed operation. */
export type AgentControlHandler = (message: AgentControlMessage) => void;

/**
 * Payload published when the frontend finishes resolving deferred attachment
 * stubs for an operation. Shape mirrors the HTTP body of
 * `POST /pending-attachments/:operationId` so consumers can forward it
 * without translation.
 */
export interface AgentAttachmentsResolvedMessage {
  readonly operationId: string;
  readonly userId: string;
  readonly attachments: ReadonlyArray<Record<string, unknown>>;
  readonly resolvedAt: string;
}

export type AgentAttachmentsResolvedHandler = (message: AgentAttachmentsResolvedMessage) => void;

// ─── Service ────────────────────────────────────────────────────────────────

export class AgentPubSubService {
  /** Dedicated subscriber client (ioredis requires a separate connection for SUBSCRIBE). */
  private subscriber: Redis | null = null;

  /** Publisher client — shared with BullMQ queue (normal commands still work). */
  private publisher: Redis | null = null;

  /** Active subscriptions: channelId → Set of handlers. */
  private readonly handlers = new Map<string, Set<PubSubMessageHandler>>();

  /** Active control-channel subscriptions: channelId → Set of control handlers. */
  private readonly controlHandlers = new Map<string, Set<AgentControlHandler>>();

  /** Active attachments-channel subscriptions: channelId → Set of handlers. */
  private readonly attachmentsHandlers = new Map<string, Set<AgentAttachmentsResolvedHandler>>();

  /** Whether the message listener has been attached to the subscriber client. */
  private listenerAttached = false;

  /** Redis URL for creating connections. */
  private readonly redisUrl: string;

  constructor(redisUrl?: string) {
    this.redisUrl = redisUrl ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /** Lazily create the publisher Redis client. */
  private getPublisher(): Redis {
    if (!this.publisher) {
      const opts = AgentQueueService.parseRedisUrl(this.redisUrl);
      this.publisher = new Redis({
        ...opts,
        lazyConnect: false,
        enableOfflineQueue: true,
      });
      this.publisher.on('error', (err) => {
        logger.warn('[pubsub] Publisher Redis error', { error: err.message });
      });
    }
    return this.publisher;
  }

  /** Lazily create the subscriber Redis client. */
  private getSubscriber(): Redis {
    if (!this.subscriber) {
      const opts = AgentQueueService.parseRedisUrl(this.redisUrl);
      this.subscriber = new Redis({
        ...opts,
        lazyConnect: false,
        enableOfflineQueue: true,
      });
      this.subscriber.on('error', (err) => {
        logger.warn('[pubsub] Subscriber Redis error', { error: err.message });
      });
    }
    return this.subscriber;
  }

  /**
   * Attach the global message listener to the subscriber client (once).
   * Routes incoming messages to the correct handlers by channel.
   */
  private ensureListener(): void {
    if (this.listenerAttached) return;
    const sub = this.getSubscriber();

    sub.on('message', (channel: string, rawMessage: string) => {
      // Control-channel messages take priority — fan out to control handlers
      // and skip the stream-handler routing entirely.
      const controlSet = this.controlHandlers.get(channel);
      if (controlSet && controlSet.size > 0) {
        let parsedControl: AgentControlMessage;
        try {
          parsedControl = JSON.parse(rawMessage) as AgentControlMessage;
        } catch {
          logger.warn('[pubsub] Failed to parse control message', {
            channel,
            raw: rawMessage.slice(0, 200),
          });
          return;
        }
        for (const handler of controlSet) {
          try {
            handler(parsedControl);
          } catch (err) {
            logger.warn('[pubsub] Control handler threw', {
              channel,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        return;
      }

      const attachmentsSet = this.attachmentsHandlers.get(channel);
      if (attachmentsSet && attachmentsSet.size > 0) {
        let parsedAttachments: AgentAttachmentsResolvedMessage;
        try {
          parsedAttachments = JSON.parse(rawMessage) as AgentAttachmentsResolvedMessage;
        } catch {
          logger.warn('[pubsub] Failed to parse attachments-resolved message', {
            channel,
            raw: rawMessage.slice(0, 200),
          });
          return;
        }
        for (const handler of attachmentsSet) {
          try {
            handler(parsedAttachments);
          } catch (err) {
            logger.warn('[pubsub] Attachments handler threw', {
              channel,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        return;
      }

      const handlerSet = this.handlers.get(channel);
      if (!handlerSet || handlerSet.size === 0) return;

      let parsed: PubSubStreamMessage;
      try {
        parsed = JSON.parse(rawMessage) as PubSubStreamMessage;
      } catch {
        logger.warn('[pubsub] Failed to parse message', {
          channel,
          raw: rawMessage.slice(0, 200),
        });
        return;
      }

      for (const handler of handlerSet) {
        try {
          handler(parsed);
        } catch (err) {
          logger.warn('[pubsub] Handler threw', {
            channel,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });

    this.listenerAttached = true;
  }

  // ─── Publish (Worker side) ──────────────────────────────────────────────

  /**
   * Build the channel name for a given job/operation.
   */
  static channelFor(jobId: string): string {
    return `${AGENT_STREAM_CHANNEL_PREFIX}${jobId}`;
  }

  /**
   * Publish a single SSE event to the Redis channel for a job.
   * Called by the BullMQ worker as it generates tokens and tool steps.
   */
  async publish(jobId: string, event: string, data: unknown): Promise<void> {
    const channel = AgentPubSubService.channelFor(jobId);
    const message: PubSubStreamMessage = { event, data };
    try {
      await this.getPublisher().publish(channel, JSON.stringify(message));
    } catch (err) {
      logger.warn('[pubsub] Publish failed', {
        channel,
        event,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ─── Subscribe (Express SSE proxy side) ─────────────────────────────────

  /**
   * Subscribe to a job's stream channel.
   * Returns an unsubscribe function that cleans up the subscription.
   *
   * Multiple handlers can be attached to the same channel (rare, but safe).
   */
  async subscribe(jobId: string, handler: PubSubMessageHandler): Promise<PubSubUnsubscribe> {
    const channel = AgentPubSubService.channelFor(jobId);
    this.ensureListener();

    // Register handler
    let handlerSet = this.handlers.get(channel);
    if (!handlerSet) {
      handlerSet = new Set();
      this.handlers.set(channel, handlerSet);
      // First handler for this channel → actually subscribe via Redis
      await this.getSubscriber().subscribe(channel);
    }
    handlerSet.add(handler);

    // Return cleanup function
    return async () => {
      const set = this.handlers.get(channel);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          this.handlers.delete(channel);
          await this.getSubscriber()
            .unsubscribe(channel)
            .catch(() => undefined);
        }
      }
    };
  }

  // ─── Control channel (cross-instance pause/cancel) ──────────────────────

  /** Build the control channel name for a given operation. */
  static controlChannelFor(operationId: string): string {
    return `${AGENT_CONTROL_CHANNEL_PREFIX}${operationId}`;
  }

  /**
   * Publish a control action (pause/cancel) for an operation.
   *
   * The worker that owns the operation \u2014 regardless of which instance it runs
   * on \u2014 receives this message and aborts its local AbortController. This
   * solves the multi-instance gap where an HTTP pause request lands on
   * instance A but the worker runs on instance B.
   */
  async publishControl(message: AgentControlMessage): Promise<void> {
    const channel = AgentPubSubService.controlChannelFor(message.operationId);
    try {
      await this.getPublisher().publish(channel, JSON.stringify(message));
    } catch (err) {
      logger.warn('[pubsub] Control publish failed', {
        channel,
        action: message.action,
        operationId: message.operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Subscribe a worker to its operation's control channel. Returns an
   * unsubscribe function that MUST be invoked when the job ends so we don't
   * leak Redis subscriptions.
   */
  async subscribeControl(
    operationId: string,
    handler: AgentControlHandler
  ): Promise<PubSubUnsubscribe> {
    const channel = AgentPubSubService.controlChannelFor(operationId);
    this.ensureListener();

    let handlerSet = this.controlHandlers.get(channel);
    if (!handlerSet) {
      handlerSet = new Set();
      this.controlHandlers.set(channel, handlerSet);
      await this.getSubscriber().subscribe(channel);
    }
    handlerSet.add(handler);

    return async () => {
      const set = this.controlHandlers.get(channel);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) {
        this.controlHandlers.delete(channel);
        await this.getSubscriber()
          .unsubscribe(channel)
          .catch(() => undefined);
      }
    };
  }

  /**
   * Return the number of active Redis subscribers for a job stream channel.
   * Used to avoid sending duplicate push notifications while the user is
   * actively watching a live SSE stream.
   */
  async subscriberCount(jobId: string): Promise<number> {
    const channel = AgentPubSubService.channelFor(jobId);
    try {
      const result = await this.getPublisher().pubsub('NUMSUB', channel);
      if (!Array.isArray(result) || result.length < 2) return 0;
      const countRaw = result[1];
      const parsed =
        typeof countRaw === 'number' ? countRaw : Number.parseInt(String(countRaw ?? '0'), 10);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    } catch (err) {
      logger.warn('[pubsub] subscriberCount failed', {
        channel,
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
  }

  /**
   * Lightweight health probe for PubSub admission control.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const pong = await this.getPublisher().ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  // ─── Attachments-resolved channel (cross-instance stub waiter) ─────────

  /** Build the attachments-resolved channel name for an operation. */
  static attachmentsChannelFor(operationId: string): string {
    return `${AGENT_ATTACHMENTS_CHANNEL_PREFIX}${operationId}`;
  }

  /**
   * Publish an attachments-resolved payload. Called by the
   * `/pending-attachments/:operationId` resolver so the `/chat` handler that
   * is currently parked waiting for stub URLs can resume — even if the
   * resolver lands on a different instance than the SSE connection.
   */
  async publishAttachmentsResolved(message: AgentAttachmentsResolvedMessage): Promise<void> {
    const channel = AgentPubSubService.attachmentsChannelFor(message.operationId);
    try {
      await this.getPublisher().publish(channel, JSON.stringify(message));
    } catch (err) {
      logger.warn('[pubsub] Attachments publish failed', {
        channel,
        operationId: message.operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Subscribe to an operation's attachments-resolved channel. Returns an
   * unsubscribe function that MUST be invoked when the wait completes so we
   * don't leak Redis subscriptions.
   */
  async subscribeAttachmentsResolved(
    operationId: string,
    handler: AgentAttachmentsResolvedHandler
  ): Promise<PubSubUnsubscribe> {
    const channel = AgentPubSubService.attachmentsChannelFor(operationId);
    this.ensureListener();

    let handlerSet = this.attachmentsHandlers.get(channel);
    if (!handlerSet) {
      handlerSet = new Set();
      this.attachmentsHandlers.set(channel, handlerSet);
      await this.getSubscriber().subscribe(channel);
    }
    handlerSet.add(handler);

    return async () => {
      const set = this.attachmentsHandlers.get(channel);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) {
        this.attachmentsHandlers.delete(channel);
        await this.getSubscriber()
          .unsubscribe(channel)
          .catch(() => undefined);
      }
    };
  }

  // ─── Shutdown ───────────────────────────────────────────────────────────

  /**
   * Gracefully close all Redis connections.
   * Called during server shutdown.
   */
  async shutdown(): Promise<void> {
    this.handlers.clear();
    this.controlHandlers.clear();
    this.attachmentsHandlers.clear();
    if (this.subscriber) {
      await this.subscriber.quit().catch(() => undefined);
      this.subscriber = null;
    }
    if (this.publisher) {
      await this.publisher.quit().catch(() => undefined);
      this.publisher = null;
    }
    this.listenerAttached = false;
  }
}
