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
import { AgentGenerationService } from '../services/generation.service.js';
import { OpenRouterService } from '../llm/openrouter.service.js';
import { ContextBuilder } from '../memory/context-builder.js';
import { SyncMemoryExtractorService } from '../memory/sync-memory-extractor.service.js';
import { VectorMemoryService } from '../memory/vector.service.js';
import { logger } from '../../../utils/logger.js';
import { getSyncDeltaEventService } from '../../../services/core/sync-delta-event.service.js';
import { db as appDb } from '../../../utils/firebase.js';

/** Lazy singleton — avoids eager Firestore access at module load time. */
let _triggerService: AgentTriggerService | null = null;
function getTriggerService(): AgentTriggerService {
  if (!_triggerService) _triggerService = new AgentTriggerService();
  return _triggerService;
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

  // Fetch users who have agent goals set (they opted into Agent X)
  let eligibleUserIds: string[];
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const usersWithGoals = await db
      .collection('Users')
      .where('agentGoals', '!=', [])
      .select() // Only fetch doc IDs — no full document reads
      .get();

    eligibleUserIds = usersWithGoals.docs.map((doc) => doc.id);
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
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const snap = await db.collection('Users').where('agentGoals', '!=', []).select().get();
    eligibleUserIds = snap.docs.map((doc) => doc.id);
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

  let successCount = 0;
  let failCount = 0;

  for (const uid of eligibleUserIds) {
    try {
      // force=false: the 144h dedup guard prevents duplicate generation
      // if the scheduler fires twice in a week for any reason
      await generation.generateWeeklyPlaybook(uid);
      successCount++;
    } catch (err) {
      failCount++;
      logger.error('[TriggerListener] Weekly playbook generation failed for user', {
        userId: uid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('[TriggerListener] Weekly playbooks complete', {
    total: eligibleUserIds.length,
    success: successCount,
    failed: failCount,
  });
}

/**
 * Called by Cloud Scheduler every Friday at 9:00 AM.
 * Fetches all premium users and enqueues weekly recaps.
 */
export async function runWeeklyRecaps(): Promise<void> {
  let eligibleUserIds: string[];
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const snap = await db.collection('Users').select().get();
    eligibleUserIds = snap.docs
      .filter((doc) => doc.data()['weeklyRecapEmailEnabled'] !== false)
      .map((doc) => doc.id);
  } catch (err) {
    logger.error('[TriggerListener] Failed to fetch eligible users for weekly recaps', {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (eligibleUserIds.length === 0) {
    logger.info('[TriggerListener] No eligible users for weekly recaps');
    return;
  }

  await getTriggerService().processBatchTrigger('weekly_recap', eligibleUserIds);
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
    const snap = await db.collection('Users').where('agentGoals', '!=', []).select().get();
    userDocs = snap.docs;
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
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const userDoc of userDocs) {
    const uid = userDoc.id;
    try {
      // ── 2. Dedup guard ──────────────────────────────────────────────
      const fullUser = await db.collection('Users').doc(uid).get();
      const userData = fullUser.data() ?? {};
      const lastNudge = userData['lastPlaybookNudgeAt'];
      if (lastNudge) {
        const lastMs =
          typeof lastNudge === 'object' && 'toMillis' in lastNudge
            ? (lastNudge as FirebaseFirestore.Timestamp).toMillis()
            : new Date(String(lastNudge)).getTime();
        if (now - lastMs < DEDUP_WINDOW_MS) {
          skipped++;
          continue;
        }
      }

      // ── 3. Agent X generates the nudge copy via LLM ─────────────────
      // Reads the user's active playbook + compressed profile context
      // and writes a personalized title + body — no hardcoded templates.
      const nudge = await generation.generatePlaybookNudge(uid, db);

      if (!nudge) {
        // No active playbook this week or LLM failed — skip silently
        skipped++;
        continue;
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

      sent++;
    } catch (err) {
      failed++;
      logger.error('[TriggerListener] runPlaybookNudge: failed for user', {
        userId: uid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('[TriggerListener] runPlaybookNudge complete', {
    total: userDocs.length,
    sent,
    skipped,
    failed,
  });
}
