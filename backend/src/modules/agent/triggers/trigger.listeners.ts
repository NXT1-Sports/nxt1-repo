/**
 * @fileoverview Agent Trigger Listeners — Database & Cron Hooks
 * @module @nxt1/backend/modules/agent/triggers
 *
 * These are the actual "wires" that connect real-world events to
 * the AgentTriggerService. Each listener is responsible for:
 *
 * 1. Detecting an event (Firestore change, cron tick, webhook).
 * 2. Building an AgentTriggerEvent with the correct type and data.
 * 3. Passing it to AgentTriggerService.processTrigger().
 *
 * These can be deployed as:
 * - Firebase Cloud Functions (Gen 2) for Firestore triggers
 * - Cloud Scheduler jobs for cron-based triggers
 * - Express routes for webhook-based triggers
 */

import type { AgentTriggerEvent, SyncDeltaReport } from '@nxt1/core';
import { AgentTriggerService } from './trigger.service.js';
import { logger } from '../../../utils/logger.js';

/** Lazy singleton — avoids eager Firestore access at module load time. */
let _triggerService: AgentTriggerService | null = null;
function getTriggerService(): AgentTriggerService {
  if (!_triggerService) _triggerService = new AgentTriggerService();
  return _triggerService;
}

// ─── Database Event Listeners ───────────────────────────────────────────────

/**
 * Called when a profile view is recorded in the database.
 * Wired to: Firestore onWrite('profileViews/{viewId}') or equivalent.
 */
export async function onProfileView(data: {
  viewedUserId: string;
  viewerName: string;
  viewerRole: string;
  viewerOrg: string;
  viewerId: string;
}): Promise<void> {
  const event: AgentTriggerEvent = {
    id: `pv_${Date.now()}`,
    type: 'profile_view',
    userId: data.viewedUserId,
    intent: '', // Synthesized by the service from the template
    eventData: {
      viewerName: data.viewerName,
      viewerRole: data.viewerRole,
      viewerOrg: data.viewerOrg,
      viewerId: data.viewerId,
    },
    origin: 'database_event',
    priority: 'high',
    createdAt: new Date().toISOString(),
  };

  await getTriggerService().processTrigger(event);
}

/**
 * Called when a new follower is recorded.
 * Wired to: Firestore onCreate('follows/{followId}')
 */
export async function onNewFollower(data: {
  followedUserId: string;
  followerName: string;
  followerId: string;
}): Promise<void> {
  const event: AgentTriggerEvent = {
    id: `nf_${Date.now()}`,
    type: 'new_follower',
    userId: data.followedUserId,
    intent: '',
    eventData: {
      followerName: data.followerName,
      followerId: data.followerId,
    },
    origin: 'database_event',
    priority: 'normal',
    createdAt: new Date().toISOString(),
  };

  await getTriggerService().processTrigger(event);
}

/**
 * Called when a coach replies to a recruiting email.
 * Wired to: Gmail webhook / polling service
 */
export async function onCoachReply(data: {
  athleteUserId: string;
  coachName: string;
  collegeName: string;
  replySnippet: string;
  emailThreadId: string;
}): Promise<void> {
  const event: AgentTriggerEvent = {
    id: `cr_${Date.now()}`,
    type: 'coach_reply',
    userId: data.athleteUserId,
    intent: '',
    eventData: {
      coachName: data.coachName,
      collegeName: data.collegeName,
      replySnippet: data.replySnippet,
      emailThreadId: data.emailThreadId,
    },
    origin: 'webhook',
    priority: 'critical',
    createdAt: new Date().toISOString(),
  };

  await getTriggerService().processTrigger(event);
}

// ─── Sync Event Listeners ───────────────────────────────────────────────────

/**
 * Called by the daily background scraper after computing a delta report.
 * If the delta report is empty (nothing changed), this is a no-op.
 * Otherwise, it fires a `daily_sync_complete` trigger to wake Agent X.
 *
 * Wired to: The daily sync worker/cron after write_season_stats completes.
 */
export async function onDailySyncComplete(delta: SyncDeltaReport): Promise<void> {
  // Gate: If nothing changed, don't wake the agent
  if (delta.isEmpty) {
    logger.info('[TriggerListener] Daily sync complete — no changes detected', {
      userId: delta.userId,
      sport: delta.sport,
      source: delta.source,
    });
    return;
  }

  logger.info('[TriggerListener] Daily sync detected changes, firing trigger', {
    userId: delta.userId,
    sport: delta.sport,
    source: delta.source,
    totalChanges: delta.summary.totalChanges,
  });

  const event: AgentTriggerEvent = {
    id: `sync_${Date.now()}_${delta.userId}`,
    type: 'daily_sync_complete',
    userId: delta.userId,
    intent: '', // Synthesized from the AGENT_TRIGGER_RULES template
    eventData: {
      source: delta.source,
      sport: delta.sport,
      syncedAt: delta.syncedAt,
      // Flatten summary into eventData so the intent template can interpolate
      ...delta.summary,
      // Attach full delta for Agent X's context
      deltaReport: delta,
    },
    origin: 'system_cron',
    priority:
      delta.summary.newRecruitingActivities > 0 || delta.summary.newVideos > 0 ? 'high' : 'normal',
    createdAt: new Date().toISOString(),
  };

  await getTriggerService().processTrigger(event);
}

// ─── Cron / Scheduled Triggers ──────────────────────────────────────────────

/**
 * Called by Cloud Scheduler every morning at 8:00 AM per timezone.
 * Fetches all premium users and enqueues daily briefings.
 */
export async function runDailyBriefings(): Promise<void> {
  // TODO: Fetch all users with autonomousEnabled = true and subscriptionTier >= 'premium'
  // const eligibleUserIds = await getUserIdsForCron('daily_briefing');
  const eligibleUserIds: string[] = []; // Placeholder

  await getTriggerService().processBatchTrigger('daily_briefing', eligibleUserIds);
}

/**
 * Called by Cloud Scheduler every Friday at 9:00 AM.
 * Fetches all premium users and enqueues weekly recaps.
 */
export async function runWeeklyRecaps(): Promise<void> {
  // TODO: Fetch all users with autonomousEnabled = true and subscriptionTier >= 'premium'
  const eligibleUserIds: string[] = []; // Placeholder

  await getTriggerService().processBatchTrigger('weekly_recap', eligibleUserIds);
}

/**
 * Called by Cloud Scheduler daily.
 * Checks for profiles that haven't been updated in 14+ days.
 */
export async function runStaleProfileCheck(): Promise<void> {
  // TODO: Query database for users with lastProfileUpdate < 14 days ago
  const staleUserIds: string[] = []; // Placeholder

  await getTriggerService().processBatchTrigger('stale_profile', staleUserIds);
}
