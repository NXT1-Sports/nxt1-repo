/**
 * @fileoverview Agent Trigger Service — Autonomous Wake-Up Engine
 * @module @nxt1/backend/modules/agent/triggers
 *
 * This service is the "Always-On" engine for Agent X. It listens to
 * system events (database changes, cron schedules, webhooks) and
 * autonomously enqueues jobs for individual users' agents.
 *
 * Architecture:
 * ┌──────────────────┐   ┌──────────────────┐   ┌────────────────┐
 * │ Firestore Trigger │   │ Cron Scheduler   │   │ Webhook Route  │
 * │ (profile_view,   │   │ (daily_briefing, │   │ (stripe,       │
 * │  new_follower)    │   │  weekly_recap)   │   │  maxpreps)     │
 * └────────┬─────────┘   └────────┬─────────┘   └────────┬───────┘
 *          │                      │                       │
 *          ▼                      ▼                       ▼
 * ┌──────────────────────────────────────────────────────────────┐
 * │              AgentTriggerService                             │
 * │  1. Validate trigger rule (enabled? cooldown? tier?)         │
 * │  2. Check user preferences (autonomous on? trigger muted?)  │
 * │  3. Check quiet hours                                        │
 * │  4. Synthesize intent from template                          │
 * │  5. Enqueue AgentJobPayload to Worker Queue                  │
 * └──────────────────────────────────┬───────────────────────────┘
 *                                    │
 *                                    ▼
 *                           ┌────────────────┐
 *                           │ Agent Worker    │
 *                           │ (existing queue)│
 *                           └────────────────┘
 *
 * IMPORTANT: An "always-on agent" does NOT mean a running process per user.
 * It means the system drops micro-tasks into a shared queue when events occur.
 * The agent is "state stored in a database," not "a process occupying RAM."
 */

import type {
  AgentTriggerEvent,
  AgentTriggerType,
  AgentTriggerPreferences,
  AgentJobPayload,
} from '@nxt1/core';

import { AGENT_TRIGGER_RULES } from '@nxt1/core';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '../../../utils/logger.js';
import { AgentQueueService } from '../queue/queue.service.js';

const TRIGGER_COOLDOWNS_COLLECTION = 'AgentTriggerCooldowns';
const TRIGGER_PREFERENCES_COLLECTION = 'AgentTriggerPreferences';

export class AgentTriggerService {
  /** Lazy Firestore access — safe even if called before Firebase.initializeApp(). */
  private get db() {
    return getFirestore();
  }

  private _queueService: AgentQueueService | null = null;
  private get queueService() {
    if (!this._queueService) this._queueService = new AgentQueueService();
    return this._queueService;
  }

  /**
   * Process an incoming trigger event.
   * This is the single entry point called by database listeners,
   * cron jobs, and webhook routes.
   *
   * Flow:
   * 1. Find the matching trigger rule.
   * 2. Validate the rule is enabled and the user qualifies.
   * 3. Check cooldown (has this trigger fired recently for this user?).
   * 4. Check the user's trigger preferences (opt-in, muted triggers, quiet hours).
   * 5. Synthesize the intent string from the rule's template + event data.
   * 6. Enqueue an AgentJobPayload to the Worker Queue.
   */
  async processTrigger(event: AgentTriggerEvent): Promise<{ enqueued: boolean; reason?: string }> {
    // ── Step 1: Find the trigger rule ─────────────────────────────────────
    const rule = AGENT_TRIGGER_RULES.find((r) => r.type === event.type);
    if (!rule) {
      return { enqueued: false, reason: `Unknown trigger type: ${event.type}` };
    }

    if (!rule.enabled) {
      return { enqueued: false, reason: `Trigger "${rule.name}" is disabled.` };
    }

    // ── Step 2: Check user subscription tier ──────────────────────────────
    if (rule.minTier) {
      const userDoc = await this.db.collection('Users').doc(event.userId).get();
      const tier = (userDoc.data()?.['subscriptionTier'] ?? 'free') as string;
      const tierRank: Record<string, number> = { free: 0, starter: 1, premium: 2, elite: 3 };
      if ((tierRank[tier] ?? 0) < (tierRank[rule.minTier] ?? 0)) {
        return {
          enqueued: false,
          reason: `User tier "${tier}" insufficient for "${rule.name}" (requires ${rule.minTier}).`,
        };
      }
    }

    // ── Step 3: Check cooldown ────────────────────────────────────────────
    if (rule.cooldownMs > 0) {
      const lastFired = await this.getLastTriggerTimestamp(event.userId, event.type);
      if (lastFired && Date.now() - lastFired < rule.cooldownMs) {
        logger.debug('[AgentTrigger] Cooldown active', {
          userId: event.userId,
          type: event.type,
          remainingMs: rule.cooldownMs - (Date.now() - lastFired),
        });
        return { enqueued: false, reason: `Cooldown active for "${rule.name}".` };
      }
    }

    // ── Step 4: Check user preferences ────────────────────────────────────
    const preferences = await this.getUserTriggerPreferences(event.userId);

    if (!preferences.autonomousEnabled) {
      return { enqueued: false, reason: 'User has autonomous mode disabled.' };
    }

    if (preferences.disabledTriggers.includes(event.type)) {
      return { enqueued: false, reason: `User muted trigger: "${event.type}".` };
    }

    if (this.isQuietHours(preferences)) {
      return { enqueued: false, reason: 'Quiet hours active. Job will be deferred.' };
    }

    // ── Step 5: Synthesize intent from template ───────────────────────────
    const intent = this.synthesizeIntent(rule.intentTemplate, event.eventData);

    // ── Step 6: Build and enqueue the job payload ─────────────────────────
    const payload: AgentJobPayload = {
      operationId: this.generateOperationId(),
      userId: event.userId,
      intent,
      sessionId: `trigger_${event.id}`,
      origin: event.origin,
      triggerEvent: event,
      context: event.eventData,
    };

    await this.enqueueJob(payload);

    // ── Step 7: Record the trigger timestamp for cooldown tracking ────────
    await this.setLastTriggerTimestamp(event.userId, event.type, Date.now());

    logger.info('[AgentTrigger] Job enqueued', {
      userId: event.userId,
      type: event.type,
      operationId: payload.operationId,
    });

    return { enqueued: true };
  }

  /**
   * Batch process: Loop through all eligible users for a scheduled trigger.
   * Called by cron jobs (e.g., daily briefing at 8am).
   *
   * @param triggerType - The cron trigger type (e.g., 'daily_briefing')
   * @param userIds - Array of user IDs to process (fetched by the cron job)
   */
  async processBatchTrigger(
    triggerType: AgentTriggerType,
    userIds: readonly string[]
  ): Promise<{ total: number; enqueued: number; skipped: number }> {
    let enqueued = 0;
    let skipped = 0;

    for (const userId of userIds) {
      const event: AgentTriggerEvent = {
        id: this.generateOperationId(),
        type: triggerType,
        userId,
        intent: '', // Will be synthesized by processTrigger
        eventData: { scheduledAt: new Date().toISOString() },
        origin: 'system_cron',
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const result = await this.processTrigger(event);
      if (result.enqueued) {
        enqueued++;
      } else {
        skipped++;
      }
    }

    return { total: userIds.length, enqueued, skipped };
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────

  /**
   * Replace {{placeholders}} in the intent template with actual event data.
   * e.g., "{{coachName}} viewed your profile" → "Coach Smith viewed your profile"
   */
  private synthesizeIntent(template: string, eventData: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = eventData[key];
      return value !== undefined ? String(value) : `[unknown ${key}]`;
    });
  }

  /**
   * Check if the current time falls within the user's quiet hours window.
   */
  private isQuietHours(preferences: AgentTriggerPreferences): boolean {
    if (!preferences.quietHours) return false;

    const { startHour, endHour, timezone } = preferences.quietHours;

    // Get current hour in the user's timezone
    let userHour: number;
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone,
      });
      userHour = parseInt(formatter.format(new Date()), 10);
    } catch {
      // Invalid timezone — default to not quiet
      return false;
    }

    // Handle ranges that cross midnight (e.g., 22:00 → 07:00)
    if (startHour < endHour) {
      return userHour >= startHour && userHour < endHour;
    }
    return userHour >= startHour || userHour < endHour;
  }

  /**
   * Fetch user's trigger preferences from the database.
   * Falls back to defaults (autonomous OFF) if no document exists.
   */
  private async getUserTriggerPreferences(userId: string): Promise<AgentTriggerPreferences> {
    try {
      const doc = await this.db.collection(TRIGGER_PREFERENCES_COLLECTION).doc(userId).get();
      if (doc.exists) {
        const data = doc.data() as Record<string, unknown>;
        return {
          userId,
          autonomousEnabled: data['autonomousEnabled'] === true,
          disabledTriggers: Array.isArray(data['disabledTriggers'])
            ? (data['disabledTriggers'] as AgentTriggerType[])
            : [],
          quietHours: data['quietHours'] as AgentTriggerPreferences['quietHours'],
          updatedAt: (data['updatedAt'] as string) ?? new Date().toISOString(),
        };
      }
    } catch (err) {
      logger.warn('[AgentTrigger] Failed to fetch preferences, using defaults', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Defaults: autonomous OFF — user must opt-in
    return {
      userId,
      autonomousEnabled: false,
      disabledTriggers: [],
      updatedAt: new Date().toISOString(),
    };
  }

  // ─── Cooldown Persistence ─────────────────────────────────────────────

  /**
   * Read the last time a trigger of this type was fired for a user.
   */
  private async getLastTriggerTimestamp(
    userId: string,
    type: AgentTriggerType
  ): Promise<number | null> {
    try {
      const docId = `${userId}_${type}`;
      const doc = await this.db.collection(TRIGGER_COOLDOWNS_COLLECTION).doc(docId).get();
      if (doc.exists) {
        return (doc.data()?.['firedAt'] as number) ?? null;
      }
    } catch (err) {
      logger.debug('[AgentTrigger] Failed to read cooldown, proceeding without', {
        userId,
        type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }

  /**
   * Record a trigger firing timestamp for cooldown enforcement.
   */
  private async setLastTriggerTimestamp(
    userId: string,
    type: AgentTriggerType,
    timestamp: number
  ): Promise<void> {
    try {
      const docId = `${userId}_${type}`;
      await this.db.collection(TRIGGER_COOLDOWNS_COLLECTION).doc(docId).set(
        {
          userId,
          type,
          firedAt: timestamp,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      logger.warn('[AgentTrigger] Failed to set cooldown timestamp', {
        userId,
        type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Push a job payload to the BullMQ Worker Queue.
   */
  private async enqueueJob(payload: AgentJobPayload): Promise<void> {
    try {
      await this.queueService.enqueue(payload, 'production');
      logger.info('[AgentTrigger] Job enqueued to BullMQ', {
        operationId: payload.operationId,
        userId: payload.userId,
      });
    } catch (err) {
      logger.error('[AgentTrigger] Failed to enqueue job to BullMQ, falling back to Firestore', {
        operationId: payload.operationId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Fallback
      const docRef = this.db.collection('AgentJobQueue').doc(payload.operationId);
      await docRef.set({
        ...payload,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Generate a unique operation ID.
   */
  private generateOperationId(): string {
    return `op_${crypto.randomUUID()}`;
  }
}
