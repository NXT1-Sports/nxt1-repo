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

import type { AgentTriggerEvent } from '@nxt1/core';
import { AgentTriggerService } from './trigger.service.js';

const triggerService = new AgentTriggerService();

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

  await triggerService.processTrigger(event);
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

  await triggerService.processTrigger(event);
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

  await triggerService.processTrigger(event);
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

  await triggerService.processBatchTrigger('daily_briefing', eligibleUserIds);
}

/**
 * Called by Cloud Scheduler every Friday at 9:00 AM.
 * Fetches all premium users and enqueues weekly recaps.
 */
export async function runWeeklyRecaps(): Promise<void> {
  // TODO: Fetch all users with autonomousEnabled = true and subscriptionTier >= 'premium'
  const eligibleUserIds: string[] = []; // Placeholder

  await triggerService.processBatchTrigger('weekly_recap', eligibleUserIds);
}

/**
 * Called by Cloud Scheduler daily.
 * Checks for profiles that haven't been updated in 14+ days.
 */
export async function runStaleProfileCheck(): Promise<void> {
  // TODO: Query database for users with lastProfileUpdate < 14 days ago
  const staleUserIds: string[] = []; // Placeholder

  await triggerService.processBatchTrigger('stale_profile', staleUserIds);
}
