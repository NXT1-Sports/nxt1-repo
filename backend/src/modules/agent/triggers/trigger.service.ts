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

export class AgentTriggerService {
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
    // TODO: Fetch user's subscription tier from database
    // if (rule.minTier && !userMeetsTier(user, rule.minTier)) {
    //   return { enqueued: false, reason: `User tier insufficient for "${rule.name}".` };
    // }

    // ── Step 3: Check cooldown ────────────────────────────────────────────
    // TODO: Check Redis/Firestore for last trigger timestamp for this user+type
    // const lastFired = await this.getLastTriggerTimestamp(event.userId, event.type);
    // if (lastFired && Date.now() - lastFired < rule.cooldownMs) {
    //   return { enqueued: false, reason: `Cooldown active for "${rule.name}".` };
    // }

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
    // TODO: await this.setLastTriggerTimestamp(event.userId, event.type, Date.now());

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

    // TODO: Proper timezone-aware check using preferences.quietHours.timezone
    // const userHour = getCurrentHourInTimezone(preferences.quietHours.timezone);
    // const { startHour, endHour } = preferences.quietHours;
    // if (startHour < endHour) return userHour >= startHour && userHour < endHour;
    // return userHour >= startHour || userHour < endHour; // Wraps midnight

    return false;
  }

  /**
   * Fetch user's trigger preferences from the database.
   */
  private async getUserTriggerPreferences(_userId: string): Promise<AgentTriggerPreferences> {
    // TODO: Fetch from Firestore/MongoDB
    // Return defaults for now (autonomous OFF — user must opt-in)
    return {
      userId: _userId,
      autonomousEnabled: false,
      disabledTriggers: [],
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Push a job payload to the Worker Queue (Redis BullMQ / Cloud Tasks).
   */
  private async enqueueJob(_payload: AgentJobPayload): Promise<void> {
    // TODO: Wire to your Redis BullMQ queue or Google Cloud Tasks
    // await agentQueue.add(AGENT_JOB_CONFIG.QUEUE_NAME, payload, {
    //   priority: this.mapPriorityToNumber(payload.triggerEvent?.priority),
    //   attempts: AGENT_JOB_CONFIG.MAX_RETRIES,
    //   backoff: { type: 'exponential', delay: AGENT_JOB_CONFIG.RETRY_DELAY_MS },
    // });
  }

  /**
   * Generate a unique operation ID.
   */
  private generateOperationId(): string {
    return `op_${crypto.randomUUID()}`;
  }
}
