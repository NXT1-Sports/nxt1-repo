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

import { randomUUID } from 'node:crypto';
import {
  AGENT_TRIGGER_RULES,
  type AgentJobPayload,
  type AgentTriggerEvent,
  type SyncDeltaReport,
} from '@nxt1/core';
import { AgentTriggerService } from './trigger.service.js';
import { AgentGenerationService } from '../services/generation.service.js';
import { OpenRouterService } from '../llm/openrouter.service.js';
import { ContextBuilder } from '../memory/context-builder.js';
import { SyncMemoryExtractorService } from '../memory/sync-memory-extractor.service.js';
import { VectorMemoryService } from '../memory/vector.service.js';
import { AgentQueueService } from '../queue/queue.service.js';
import { getNextRecapNumber, getRecapWeekLabel } from '../services/weekly-recap-email.service.js';
import { logger } from '../../../utils/logger.js';
import { getSyncDeltaEventService } from '../../../services/core/sync-delta-event.service.js';
import { db as appDb } from '../../../utils/firebase.js';

const WEEKLY_RECAP_DISPATCH_COLLECTION = 'AgentWeeklyRecapDispatches';
const WEEKLY_RECAP_BATCH_SIZE = 20;
const WEEKLY_RECAP_ACTIVITY_LOOKBACK_DAYS = 14;
const WEEKLY_RECAP_MINIMUM_ACCOUNT_AGE_DAYS = 7;

interface WeeklyRecapRunResult {
  readonly totalUsers: number;
  readonly eligible: number;
  readonly enqueued: number;
  readonly skippedAlreadyDispatched: number;
  readonly skippedEmailOptOut: number;
  readonly skippedNewAccount: number;
  readonly failed: number;
  readonly weekKey: string;
}

interface WeeklyRecapEligibleUser {
  readonly id: string;
  readonly email: string;
}

/** Lazy singleton — avoids eager Firestore access at module load time. */
let _triggerService: AgentTriggerService | null = null;
function getTriggerService(): AgentTriggerService {
  if (!_triggerService) _triggerService = new AgentTriggerService();
  return _triggerService;
}

let _queueService: AgentQueueService | null = null;
function getQueueService(): AgentQueueService {
  if (!_queueService) _queueService = new AgentQueueService();
  return _queueService;
}

/** Lazy singleton for content generation. */
let _generationService: AgentGenerationService | null = null;
function getGenerationService(): AgentGenerationService {
  if (!_generationService) _generationService = new AgentGenerationService();
  return _generationService;
}

let _syncMemoryExtractor: SyncMemoryExtractorService | null = null;
function getSyncMemoryExtractor(): SyncMemoryExtractorService {
  if (!_syncMemoryExtractor) {
    const llm = new OpenRouterService({ firestore: appDb });
    const vectorMemory = new VectorMemoryService(llm);
    _syncMemoryExtractor = new SyncMemoryExtractorService(
      vectorMemory,
      new ContextBuilder(vectorMemory),
      llm
    );
  }
  return _syncMemoryExtractor;
}

async function getEligibleUserIdsWithGoals(): Promise<string[]> {
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore();
  const snapshot = await db.collection('Users').select('agentGoals').get();

  return snapshot.docs
    .filter((doc) => {
      const goals = doc.data()['agentGoals'];
      return Array.isArray(goals) && goals.length > 0;
    })
    .map((doc) => doc.id);
}

async function processInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const chunk = items.slice(index, index + batchSize);
    const chunkResults = await Promise.all(chunk.map((item) => worker(item)));
    results.push(...chunkResults);
  }

  return results;
}

function getWeeklyRecapWeekKey(date = new Date()): string {
  const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000) + 1;
  const weekNum = Math.ceil((dayOfYear + startOfYear.getUTCDay()) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function isAlreadyExistsError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const record = error as Record<string, unknown>;
  return (
    record['code'] === 6 ||
    String(record['message'] ?? '')
      .toLowerCase()
      .includes('already exists')
  );
}

function isWeeklyRecapEmailEligible(
  data: Record<string, unknown>
): data is Record<string, unknown> & { email: string } {
  const preferences = data['preferences'] as Record<string, unknown> | undefined;
  const notifications = preferences?.['notifications'] as Record<string, unknown> | undefined;
  const createdAt = data['createdAt'] as unknown;

  // Email must be valid and not opted out
  if (
    typeof data['email'] !== 'string' ||
    data['email'].trim().length === 0 ||
    notifications?.['email'] === false
  ) {
    return false;
  }

  // Account must be at least 7 days old (prevents sending recap 1 day after signup)
  if (createdAt instanceof Date || typeof createdAt === 'string' || typeof createdAt === 'number') {
    const accountAgeMs = Date.now() - new Date(createdAt).getTime();
    const accountAgeDays = accountAgeMs / (24 * 60 * 60 * 1000);
    if (accountAgeDays < WEEKLY_RECAP_MINIMUM_ACCOUNT_AGE_DAYS) {
      return false;
    }
  }

  return true;
}

async function getWeeklyRecapActiveUserIds(
  db: import('firebase-admin/firestore').Firestore
): Promise<ReadonlySet<string>> {
  const { Timestamp } = await import('firebase-admin/firestore');
  const cutoff = new Date(Date.now() - WEEKLY_RECAP_ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const snapshot = await db
    .collection('AgentJobs')
    .where('createdAt', '>=', Timestamp.fromDate(cutoff))
    .select('userId', 'origin')
    .get();

  const activeUserIds = new Set<string>();

  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data['origin'] !== 'user') continue;

    const userId = data['userId'];
    if (typeof userId === 'string' && userId.trim().length > 0) {
      activeUserIds.add(userId);
    }
  }

  return activeUserIds;
}

async function enqueueWeeklyRecapForUser(input: {
  readonly user: WeeklyRecapEligibleUser;
  readonly weekKey: string;
  readonly scheduledAt: string;
}): Promise<'enqueued' | 'already_dispatched' | 'failed'> {
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const db = getFirestore();
  const dispatchId = `${input.weekKey}_${input.user.id}`;
  const dispatchRef = db.collection(WEEKLY_RECAP_DISPATCH_COLLECTION).doc(dispatchId);
  const operationId = `op_${randomUUID()}`;
  const recapNumber = await getNextRecapNumber(input.user.id, db);
  const recapWeekLabel = getRecapWeekLabel(recapNumber);

  try {
    await dispatchRef.create({
      userId: input.user.id,
      email: input.user.email,
      triggerType: 'weekly_recap',
      weekKey: input.weekKey,
      recapNumber,
      recapWeekLabel,
      operationId,
      status: 'enqueuing',
      scheduledAt: input.scheduledAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (isAlreadyExistsError(err)) return 'already_dispatched';
    logger.error('[TriggerListener] Weekly recap dispatch reservation failed', {
      userId: input.user.id,
      weekKey: input.weekKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return 'failed';
  }

  const rule = AGENT_TRIGGER_RULES.find((candidate) => candidate.type === 'weekly_recap');
  const payload: AgentJobPayload = {
    operationId,
    userId: input.user.id,
    intent: rule?.intentTemplate ?? 'Generate a comprehensive weekly recap for this user.',
    displayIntent: `Generate ${recapWeekLabel} recap for this user.`,
    sessionId: `trigger_weekly_recap_${input.weekKey}`,
    origin: 'system_cron',
    triggerEvent: {
      id: `weekly_recap_${input.weekKey}_${input.user.id}`,
      type: 'weekly_recap',
      userId: input.user.id,
      intent: '',
      eventData: {
        scheduledAt: input.scheduledAt,
        weekKey: input.weekKey,
        recapNumber,
        recapWeekLabel,
      },
      origin: 'system_cron',
      priority: 'normal',
      createdAt: input.scheduledAt,
    },
    context: {
      scheduledAt: input.scheduledAt,
      weekKey: input.weekKey,
      recapNumber,
      recapWeekLabel,
    },
  };

  try {
    await getQueueService().enqueue(payload, 'production');
    await dispatchRef.set(
      {
        status: 'enqueued',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return 'enqueued';
  } catch (err) {
    logger.error('[TriggerListener] Weekly recap enqueue failed', {
      userId: input.user.id,
      operationId,
      weekKey: input.weekKey,
      error: err instanceof Error ? err.message : String(err),
    });
    await dispatchRef.delete().catch(() => undefined);
    return 'failed';
  }
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

  try {
    const persisted = await getSyncDeltaEventService().record(delta);
    logger.info('[TriggerListener] Sync delta persisted for context + analytics', {
      userId: delta.userId,
      eventId: persisted.eventId,
    });
  } catch (persistErr) {
    logger.warn('[TriggerListener] Sync delta persistence failed', {
      userId: delta.userId,
      error: persistErr instanceof Error ? persistErr.message : String(persistErr),
    });
  }

  try {
    const memoriesCreated = await getSyncMemoryExtractor().storeDeltaMemories(delta);
    logger.info('[TriggerListener] Sync memories extracted', {
      userId: delta.userId,
      memoriesCreated,
    });
  } catch (memoryErr) {
    logger.warn('[TriggerListener] Sync memory extraction failed', {
      userId: delta.userId,
      error: memoryErr instanceof Error ? memoryErr.message : String(memoryErr),
    });
  }

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

  // ── Generate fresh playbook + briefing after sync ───────────────────────
  // The trigger above enqueues reactive jobs (e.g. email follow-ups).
  // Additionally, regenerate the user's daily content so the dashboard
  // reflects the latest profile changes when they next open Agent X.
  try {
    await getGenerationService().generateDailyBriefing(delta.userId);
    logger.info('[TriggerListener] Daily briefing generated after sync', {
      userId: delta.userId,
    });
  } catch (genErr) {
    // Generation failure is non-critical — the trigger job still ran
    logger.error('[TriggerListener] Failed to generate daily briefing after sync', {
      userId: delta.userId,
      error: genErr instanceof Error ? genErr.message : String(genErr),
    });
  }
}

// ─── Cron / Scheduled Triggers ──────────────────────────────────────────────

/**
 * Called by Cloud Scheduler every morning at 8:00 AM.
 *
 * Generates a fresh personalized daily briefing (morning summary card +
 * insight chips) for every user who has Agent X goals set.
 * Also fires reactive BullMQ jobs via the trigger service.
 *
 * NOTE: Playbook (action plan) is weekly — see runWeeklyPlaybooks().
 */
export async function runDailyBriefings(): Promise<void> {
  const generation = getGenerationService();

  let eligibleUserIds: string[];
  try {
    eligibleUserIds = await getEligibleUserIdsWithGoals();
  } catch (err) {
    logger.error('[TriggerListener] Failed to fetch eligible users for daily briefings', {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (eligibleUserIds.length === 0) {
    logger.info('[TriggerListener] No eligible users for daily briefings');
    return;
  }

  logger.info('[TriggerListener] Running daily briefings', {
    userCount: eligibleUserIds.length,
  });

  // Fire reactive BullMQ jobs for the daily_briefing trigger type
  await getTriggerService().processBatchTrigger('daily_briefing', eligibleUserIds);

  // Pre-render briefing for each user (sequential to avoid LLM rate limits)
  let successCount = 0;
  let failCount = 0;

  for (const uid of eligibleUserIds) {
    try {
      await generation.generateDailyBriefing(uid);
      successCount++;
    } catch (err) {
      failCount++;
      logger.error('[TriggerListener] Daily briefing generation failed for user', {
        userId: uid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('[TriggerListener] Daily briefings complete', {
    total: eligibleUserIds.length,
    success: successCount,
    failed: failCount,
  });
}

/**
 * Called by Cloud Scheduler every Monday at 8:00 AM.
 *
 * Generates a fresh weekly action plan (playbook) for every user who has
 * Agent X goals set. The playbook contains 5 tasks: 2 recurring habits +
 * 3 goal-execution items tied to the user's specific goals.
 *
 * Three triggers regenerate the playbook mid-week:
 *   1. This Monday cron (scheduled).
 *   2. Goals changed (POST /goals route fires generateWeeklyPlaybook(uid, true)).
 *   3. All 5 tasks completed (status route fires generateWeeklyPlaybook(uid, true)).
 */
export async function runWeeklyPlaybooks(): Promise<void> {
  const generation = getGenerationService();

  let eligibleUserIds: string[];
  try {
    eligibleUserIds = await getEligibleUserIdsWithGoals();
  } catch (err) {
    logger.error('[TriggerListener] Failed to fetch eligible users for weekly playbooks', {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (eligibleUserIds.length === 0) {
    logger.info('[TriggerListener] No eligible users for weekly playbooks');
    return;
  }

  logger.info('[TriggerListener] Running weekly playbooks', {
    userCount: eligibleUserIds.length,
  });

  const outcomes = await processInBatches(eligibleUserIds, 4, async (uid) => {
    try {
      // force=false: the 144h dedup guard prevents duplicate generation
      // if the scheduler fires twice in a week for any reason.
      await generation.generateWeeklyPlaybook(uid);
      return 'success' as const;
    } catch (err) {
      logger.error('[TriggerListener] Weekly playbook generation failed for user', {
        userId: uid,
        error: err instanceof Error ? err.message : String(err),
      });
      return 'failed' as const;
    }
  });

  const successCount = outcomes.filter((outcome) => outcome === 'success').length;
  const failCount = outcomes.length - successCount;

  logger.info('[TriggerListener] Weekly playbooks complete', {
    total: eligibleUserIds.length,
    success: successCount,
    failed: failCount,
  });
}

/**
 * Called by Cloud Scheduler every Sunday.
 * Generates 3 personalized suggested actions inside each coordinator panel
 * for recently active Agent X users in supported dashboard roles.
 */
export async function runWeeklySuggestedActions(): Promise<void> {
  const generation = getGenerationService();

  let eligibleUserIds: string[];
  try {
    const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const cutoff = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const snap = await db
      .collection('Users')
      .where('agentXLastActiveAt', '>=', cutoff)
      .select('role')
      .get();

    eligibleUserIds = snap.docs
      .filter((doc) => ['athlete', 'coach', 'director'].includes(String(doc.data()['role'] ?? '')))
      .map((doc) => doc.id);
  } catch (err) {
    logger.error('[TriggerListener] Failed to fetch eligible users for weekly suggested actions', {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (eligibleUserIds.length === 0) {
    logger.info('[TriggerListener] No eligible users for weekly suggested actions');
    return;
  }

  logger.info('[TriggerListener] Running weekly suggested actions', {
    userCount: eligibleUserIds.length,
  });

  const outcomes = await processInBatches(eligibleUserIds, 4, async (uid) => {
    try {
      await generation.generateWeeklySuggestedActions(uid);
      return 'success' as const;
    } catch (err) {
      logger.error('[TriggerListener] Weekly suggested actions generation failed for user', {
        userId: uid,
        error: err instanceof Error ? err.message : String(err),
      });
      return 'failed' as const;
    }
  });

  const successCount = outcomes.filter((outcome) => outcome === 'success').length;
  const failCount = outcomes.length - successCount;

  logger.info('[TriggerListener] Weekly suggested actions complete', {
    total: eligibleUserIds.length,
    success: successCount,
    failed: failCount,
  });
}

/**
 * Called by Cloud Scheduler every Friday at 9:00 AM.
 * Fetches recently active Agent X users, filters email-eligible recipients,
 * and enqueues weekly recap jobs.
 *
 * Weekly recaps are a scheduled email product, not a user-initiated autonomous
 * action. They intentionally bypass AgentTriggerPreferences.autonomousEnabled
 * and the generic rolling trigger cooldown. Professional campaign-style
 * delivery uses the standard email notification gate plus a deterministic
 * per-week dispatch ledger for idempotency.
 */
export async function runWeeklyRecaps(): Promise<WeeklyRecapRunResult> {
  const scheduledAt = new Date().toISOString();
  const weekKey = getWeeklyRecapWeekKey();
  let totalUsers = 0;
  let skippedEmailOptOut = 0;
  let skippedNewAccount = 0;
  let eligibleUsers: WeeklyRecapEligibleUser[];

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const activeUserIds = await getWeeklyRecapActiveUserIds(db);

    if (activeUserIds.size === 0) {
      logger.info('[TriggerListener] No recently active Agent X users for weekly recaps', {
        weekKey,
        lookbackDays: WEEKLY_RECAP_ACTIVITY_LOOKBACK_DAYS,
      });
      return {
        totalUsers: 0,
        eligible: 0,
        enqueued: 0,
        skippedAlreadyDispatched: 0,
        skippedEmailOptOut: 0,
        skippedNewAccount: 0,
        failed: 0,
        weekKey,
      };
    }

    const userSnapshots = await processInBatches(
      [...activeUserIds].map((userId) => db.collection('Users').doc(userId)),
      100,
      async (ref) => ref.get()
    );

    totalUsers = userSnapshots.filter((doc) => doc.exists).length;
    eligibleUsers = userSnapshots.reduce<WeeklyRecapEligibleUser[]>((users, doc) => {
      if (!doc.exists) {
        return users;
      }

      const data = doc.data() as Record<string, unknown>;
      const createdAt = data['createdAt'] as unknown;

      // Check account age separately to track it
      if (
        createdAt instanceof Date ||
        typeof createdAt === 'string' ||
        typeof createdAt === 'number'
      ) {
        const accountAgeMs = Date.now() - new Date(createdAt).getTime();
        const accountAgeDays = accountAgeMs / (24 * 60 * 60 * 1000);
        if (accountAgeDays < WEEKLY_RECAP_MINIMUM_ACCOUNT_AGE_DAYS) {
          skippedNewAccount++;
          return users;
        }
      }

      if (!isWeeklyRecapEmailEligible(data)) {
        skippedEmailOptOut++;
        return users;
      }

      users.push({ id: doc.id, email: data.email.trim() });
      return users;
    }, []);
  } catch (err) {
    logger.error('[TriggerListener] Failed to fetch eligible users for weekly recaps', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      totalUsers,
      eligible: 0,
      enqueued: 0,
      skippedAlreadyDispatched: 0,
      skippedEmailOptOut,
      skippedNewAccount,
      failed: 1,
      weekKey,
    };
  }

  if (eligibleUsers.length === 0) {
    logger.info('[TriggerListener] No active email-eligible users for weekly recaps', {
      totalUsers,
      skippedEmailOptOut,
      skippedNewAccount,
      weekKey,
      lookbackDays: WEEKLY_RECAP_ACTIVITY_LOOKBACK_DAYS,
    });
    return {
      totalUsers,
      eligible: 0,
      enqueued: 0,
      skippedAlreadyDispatched: 0,
      skippedEmailOptOut,
      skippedNewAccount,
      failed: 0,
      weekKey,
    };
  }

  const outcomes = await processInBatches(eligibleUsers, WEEKLY_RECAP_BATCH_SIZE, (user) =>
    enqueueWeeklyRecapForUser({ user, weekKey, scheduledAt })
  );

  const result: WeeklyRecapRunResult = {
    totalUsers,
    eligible: eligibleUsers.length,
    enqueued: outcomes.filter((outcome) => outcome === 'enqueued').length,
    skippedAlreadyDispatched: outcomes.filter((outcome) => outcome === 'already_dispatched').length,
    skippedEmailOptOut,
    skippedNewAccount,
    failed: outcomes.filter((outcome) => outcome === 'failed').length,
    weekKey,
  };

  logger.info('[TriggerListener] Weekly recaps enqueue complete', { ...result });
  return result;
}

/**
 * Called by Cloud Scheduler daily.
 * Checks for profiles that haven't been updated in 14+ days.
 */
export async function runStaleProfileCheck(): Promise<void> {
  let staleUserIds: string[];
  try {
    const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const snap = await db
      .collection('Users')
      .where('lastProfileUpdate', '<', Timestamp.fromDate(cutoff))
      .select()
      .get();
    staleUserIds = snap.docs.map((doc) => doc.id);
  } catch (err) {
    logger.error('[TriggerListener] Failed to fetch stale profiles', {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (staleUserIds.length === 0) {
    logger.info('[TriggerListener] No stale profiles found');
    return;
  }

  await getTriggerService().processBatchTrigger('stale_profile', staleUserIds);
}

/**
 * Called by Cloud Scheduler on Wednesday + Saturday at 6:00 PM (cron: 0 18 * * 3,6).
 *
 * For every user whose current-week playbook is still active, dispatches a
 * personalized progress-nudge push notification summarising:
 *   - Goals in focus  (from agentGoals on user doc)
 *   - Tasks done / remaining / snoozed  (from latest agent_playbooks doc)
 *
 * Dedup guard: skips users nudged within the last 44 hours so a double-fire
 * from Cloud Scheduler never spams the same user twice in one cycle.
 */
export async function runPlaybookNudge(): Promise<void> {
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const { dispatchAgentPush } = await import('../services/agent-push-adapter.service.js');

  const db = getFirestore();
  const now = Date.now();
  const DEDUP_WINDOW_MS = 44 * 60 * 60 * 1000; // 44 hours

  // ── 1. Fetch users who have active goals ──────────────────────────────
  let userDocs: FirebaseFirestore.QueryDocumentSnapshot[];
  try {
    const snap = await db.collection('Users').select('agentGoals', 'lastPlaybookNudgeAt').get();
    userDocs = snap.docs.filter((doc) => {
      const goals = doc.data()['agentGoals'];
      return Array.isArray(goals) && goals.length > 0;
    });
  } catch (err) {
    logger.error('[TriggerListener] runPlaybookNudge: failed to fetch users', {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (userDocs.length === 0) {
    logger.info('[TriggerListener] runPlaybookNudge: no eligible users');
    return;
  }

  logger.info('[TriggerListener] runPlaybookNudge started', { userCount: userDocs.length });

  const generation = getGenerationService();
  const outcomes = await processInBatches(userDocs, 5, async (userDoc) => {
    const uid = userDoc.id;
    try {
      // ── 2. Dedup guard ──────────────────────────────────────────────
      const userData = userDoc.data() ?? {};
      const lastNudge = userData['lastPlaybookNudgeAt'];
      if (lastNudge) {
        const lastMs =
          typeof lastNudge === 'object' && 'toMillis' in lastNudge
            ? (lastNudge as FirebaseFirestore.Timestamp).toMillis()
            : new Date(String(lastNudge)).getTime();
        if (now - lastMs < DEDUP_WINDOW_MS) {
          return 'skipped' as const;
        }
      }

      // ── 3. Agent X generates the nudge copy via LLM ─────────────────
      // Reads the user's active playbook + compressed profile context
      // and writes a personalized title + body — no hardcoded templates.
      const nudge = await generation.generatePlaybookNudge(uid, db);

      if (!nudge) {
        // No active playbook this week or LLM failed — skip silently
        return 'skipped' as const;
      }

      // ── 4. Dispatch push ─────────────────────────────────────────────
      await dispatchAgentPush(db, {
        kind: 'agent_playbook_nudge',
        userId: uid,
        operationId: `playbook-nudge-${uid}-${Math.floor(now / DEDUP_WINDOW_MS)}`,
        title: nudge.title,
        body: nudge.body,
      });

      // ── 5. Stamp lastPlaybookNudgeAt to enforce dedup ────────────────
      await db
        .collection('Users')
        .doc(uid)
        .update({ lastPlaybookNudgeAt: FieldValue.serverTimestamp() });

      return 'sent' as const;
    } catch (err) {
      logger.error('[TriggerListener] runPlaybookNudge: failed for user', {
        userId: uid,
        error: err instanceof Error ? err.message : String(err),
      });
      return 'failed' as const;
    }
  });

  const sent = outcomes.filter((outcome) => outcome === 'sent').length;
  const skipped = outcomes.filter((outcome) => outcome === 'skipped').length;
  const failed = outcomes.filter((outcome) => outcome === 'failed').length;

  logger.info('[TriggerListener] runPlaybookNudge complete', {
    total: userDocs.length,
    sent,
    skipped,
    failed,
  });
}
