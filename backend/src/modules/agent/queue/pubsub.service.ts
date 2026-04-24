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

// ─── Service ────────────────────────────────────────────────────────────────

export class AgentPubSubService {
  /** Dedicated subscriber client (ioredis requires a separate connection for SUBSCRIBE). */
  private subscriber: Redis | null = null;

  /** Publisher client — shared with BullMQ queue (normal commands still work). */
  private publisher: Redis | null = null;

  /** Active subscriptions: channelId → Set of handlers. */
  private readonly handlers = new Map<string, Set<PubSubMessageHandler>>();

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

  // ─── Shutdown ───────────────────────────────────────────────────────────

  /**
   * Gracefully close all Redis connections.
   * Called during server shutdown.
   */
  async shutdown(): Promise<void> {
    this.handlers.clear();
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
