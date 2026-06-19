/**
 * @fileoverview Weekly Recap Email Service
 * @module @nxt1/backend/modules/agent/services/weekly-recap-email
 *
 * Orchestrates the full weekly recap pipeline for a single user:
 *   1. Load recap history from Firestore (last 3 for LLM context)
 *   2. Call OpenRouter to generate personalised email content slots
 *   3. Build branded HTML email from those slots
 *   4. Save the recap document to `Users/{uid}/agent_weekly_recaps/`
 *   5. Send via platform-email.service.ts (respects opt-out flags)
 *
 * Called fire-and-forget from agent.worker.ts after any `weekly_recap` job
 * completes. Never throws — all errors are logged and swallowed so a recap
 * failure never fails the agent job itself.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { AgentIdentifier, AgentWeeklyRecap } from '@nxt1/core';
import { OpenRouterService } from '../llm/openrouter.service.js';
import { resolveStructuredOutput } from '../llm/structured-output.js';
import { sendPlatformEmail } from '../../../services/communications/platform-email.service.js';
import { buildMarketingEmailShell } from '../../../services/marketing/email/templates/marketing-email-shell.js';
import { dispatchAgentPush } from './agent-push-adapter.service.js';
import { logger } from '../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RECAP_HISTORY = 52;
const RECAP_CONTEXT_COUNT = 3;
const USERS_COLLECTION = 'Users';
const RECAPS_SUBCOLLECTION = 'agent_weekly_recaps';
const WEEKLY_RECAP_DISPATCH_COLLECTION = 'AgentWeeklyRecapDispatches';
const APP_URL = 'https://app.nxt1sports.com';
export const WEEKLY_RECAP_EMAIL_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecapEmailContent {
  subject: string;
  introParagraph: string;
  completedActions: string[];
  resultsHighlights: string[];
  nextSteps: string[];
  ctaText: string;
  ctaUrl: string;
}

interface GoalProgressSummary {
  activeGoals: Array<{ text: string; itemsCompleted: number; itemsTotal: number }>;
  completedGoals: Array<{ text: string; completedAt: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const recapEmailContentSchema = z.object({
  subject: z.string().optional(),
  introParagraph: z.string().optional(),
  completedActions: z.array(z.string()).optional(),
  resultsHighlights: z.array(z.string()).optional(),
  nextSteps: z.array(z.string()).optional(),
  ctaText: z.string().optional(),
  ctaUrl: z.string().optional(),
});

/** User progression label, e.g. "Week 1" or "Week 8". */
export function getRecapWeekLabel(recapNumber: number): string {
  return `Week ${Number.isInteger(recapNumber) && recapNumber > 0 ? recapNumber : 1}`;
}

function coerceRecapItems(value: unknown, fallback: string[], maxItems = 5): string[] {
  const items = Array.isArray(value)
    ? value
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0)
        .slice(0, maxItems)
    : [];

  return items.length > 0 ? items : fallback;
}

function extractFirstName(value: string | undefined): string {
  const normalized = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  return normalized.split(' ')[0] ?? '';
}

function stripLeadingGreeting(paragraph: string): string {
  const trimmed = paragraph.trim();
  if (!trimmed) return trimmed;

  return trimmed.replace(
    /^(?:hey|hi|hello)\s+[a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*)?\s*[,:!-]\s*/i,
    ''
  );
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

/**
 * Fetch the last N recap documents for context (ordered by recapNumber desc).
 */
export async function getRecapHistory(uid: string, db: Firestore): Promise<AgentWeeklyRecap[]> {
  try {
    const snap = await db
      .collection(USERS_COLLECTION)
      .doc(uid)
      .collection(RECAPS_SUBCOLLECTION)
      .orderBy('recapNumber', 'desc')
      .limit(RECAP_CONTEXT_COUNT)
      .get();

    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AgentWeeklyRecap);
  } catch (err) {
    logger.warn('[WeeklyRecap] Failed to load recap history', {
      uid,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export async function updateWeeklyRecapDispatchStatus(
  db: Firestore,
  input: {
    readonly operationId: string | undefined;
    readonly status: 'completed' | 'failed';
    readonly error?: string | null;
  }
): Promise<boolean> {
  const operationId = input.operationId?.trim();
  if (!operationId) return false;

  const { FieldValue } = await import('firebase-admin/firestore');
  const snapshot = await db
    .collection(WEEKLY_RECAP_DISPATCH_COLLECTION)
    .where('operationId', '==', operationId)
    .limit(1)
    .get();

  const dispatchDoc = snapshot.docs[0];
  if (!dispatchDoc) return false;

  await dispatchDoc.ref.set(
    {
      status: input.status,
      updatedAt: FieldValue.serverTimestamp(),
      ...(input.status === 'completed'
        ? {
            completedAt: FieldValue.serverTimestamp(),
            failedAt: null,
            error: null,
          }
        : {
            failedAt: FieldValue.serverTimestamp(),
            completedAt: null,
            error: input.error ?? 'Weekly recap failed',
          }),
    },
    { merge: true }
  );

  return true;
}

/**
 * Determine the next recap number (max existing + 1, or 1 if none).
 */
export async function getNextRecapNumber(uid: string, db: Firestore): Promise<number> {
  try {
    const snap = await db
      .collection(USERS_COLLECTION)
      .doc(uid)
      .collection(RECAPS_SUBCOLLECTION)
      .orderBy('recapNumber', 'desc')
      .limit(1)
      .get();

    if (snap.empty) return 1;
    const last = snap.docs[0].data() as Partial<AgentWeeklyRecap>;
    return (last.recapNumber ?? 0) + 1;
  } catch {
    return 1;
  }
}

/**
 * Fetch goal progress data for the past 7 days from goal_history.
 * Used to ground the weekly recap email in real user activity data.
 */
export async function getGoalProgressForRecap(
  uid: string,
  db: Firestore
): Promise<GoalProgressSummary> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [activeSnap, completedSnap] = await Promise.all([
      // Goals with activity in last 7 days that are still in progress
      db
        .collection(USERS_COLLECTION)
        .doc(uid)
        .collection('goal_history')
        .where('isCompleted', '==', false)
        .where('lastSeenAt', '>=', sevenDaysAgo)
        .orderBy('lastSeenAt', 'desc')
        .limit(5)
        .get(),
      // Goals completed in the last 7 days
      db
        .collection(USERS_COLLECTION)
        .doc(uid)
        .collection('goal_history')
        .where('isCompleted', '==', true)
        .where('completedAt', '>=', sevenDaysAgo)
        .orderBy('completedAt', 'desc')
        .limit(3)
        .get(),
    ]);

    return {
      activeGoals: activeSnap.docs.map((d) => {
        const data = d.data();
        return {
          text: String(data['text'] ?? ''),
          itemsCompleted: Number(data['itemsCompleted'] ?? 0),
          itemsTotal: Number(data['itemsTotal'] ?? 0),
        };
      }),
      completedGoals: completedSnap.docs.map((d) => {
        const data = d.data();
        return {
          text: String(data['text'] ?? ''),
          completedAt: String(data['completedAt'] ?? ''),
        };
      }),
    };
  } catch (err) {
    logger.warn('[WeeklyRecap] Failed to fetch goal progress', {
      uid,
      error: err instanceof Error ? err.message : String(err),
    });
    return { activeGoals: [], completedGoals: [] };
  }
}

/**
 * Save a new recap doc and trim the collection to MAX_RECAP_HISTORY.
 */
export async function saveRecap(
  uid: string,
  recap: Omit<AgentWeeklyRecap, 'id'>,
  db: Firestore
): Promise<string> {
  const colRef = db.collection(USERS_COLLECTION).doc(uid).collection(RECAPS_SUBCOLLECTION);

  const docRef = colRef.doc();
  await docRef.set({ ...recap, createdAt: new Date().toISOString() });

  // Trim oldest docs to keep at most MAX_RECAP_HISTORY
  try {
    const allSnap = await colRef.orderBy('recapNumber', 'asc').get();
    if (allSnap.size > MAX_RECAP_HISTORY) {
      const excess = allSnap.size - MAX_RECAP_HISTORY;
      const batch = db.batch();
      allSnap.docs.slice(0, excess).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    logger.warn('[WeeklyRecap] Failed to trim recap history', {
      uid,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return docRef.id;
}

// ─── Email content generation ─────────────────────────────────────────────────

/**
 * Call OpenRouter to generate personalised email content slots based on the
 * agent's result summary, real goal progress data, and the user's recap history.
 */
export async function generateEmailContent(
  userName: string,
  role: string,
  sport: string | undefined,
  weekLabel: string,
  agentResultSummary: string,
  history: AgentWeeklyRecap[],
  db: Firestore,
  goalProgress?: GoalProgressSummary,
  telemetry?: {
    readonly operationId: string;
    readonly userId: string;
    readonly agentId?: AgentIdentifier;
  }
): Promise<RecapEmailContent> {
  const llm = new OpenRouterService({ firestore: db });

  const historyContext =
    history.length > 0
      ? `\nPrevious recap subjects for continuity: ${history.map((h) => `"${h.subject}" (${h.weekLabel})`).join(', ')}.`
      : '';

  // Build a real goal progress section to ground the LLM in actual data
  let goalProgressContext = '';
  if (goalProgress) {
    const lines: string[] = [];
    if (goalProgress.activeGoals.length > 0) {
      lines.push('Active goal progress this week:');
      for (const g of goalProgress.activeGoals) {
        lines.push(`• "${g.text}" — ${g.itemsCompleted} of ${g.itemsTotal} tasks completed`);
      }
    }
    if (goalProgress.completedGoals.length > 0) {
      lines.push('Goals completed this week:');
      for (const g of goalProgress.completedGoals) {
        lines.push(`• "${g.text}" ✓`);
      }
    }
    if (lines.length > 0) {
      goalProgressContext = `\n\nReal goal progress data (use this to make completedActions and resultsHighlights specific and accurate):\n${lines.join('\n')}`;
    }
  }

  const prompt = `You are Agent X, an AI sports platform assistant. Generate a weekly recap email for a ${role}${sport ? ` (${sport})` : ''} named ${userName}.

This week's agent activity summary:
${agentResultSummary}${goalProgressContext}

Week: ${weekLabel}${historyContext}

Respond ONLY with valid JSON matching this schema:
{
  "subject": "string (compelling email subject, under 60 chars)",
  "introParagraph": "string (2-3 sentences, personal and motivating, references the week, with no salutation and no name)",
  "completedActions": ["string", ...] (3-5 specific actions completed this week),
  "resultsHighlights": ["string", ...] (3-5 concrete results or milestones),
  "nextSteps": ["string", ...] (3-5 recommended next steps for the coming week),
  "ctaText": "string (action button label, under 25 chars)",
  "ctaUrl": "string (absolute URL)"
}

Keep the tone professional yet energetic. Be specific — reference sports context, recruiting, and performance where relevant. Do not start introParagraph with greetings like "Hey"/"Hi" and do not repeat the user's name. ctaUrl should be a valid app.nxt1sports.com path.`;

  try {
    const response = await llm.complete([{ role: 'user', content: prompt }], {
      // Keep weekly recap email copy on a zero-cost OpenRouter model without
      // changing the broader task_automation routing used by other Agent X jobs.
      tier: 'task_automation',
      modelOverride: WEEKLY_RECAP_EMAIL_MODEL,
      temperature: 0.7,
      maxTokens: 900,
      outputSchema: {
        name: 'weekly_recap_email',
        schema: recapEmailContentSchema,
      },
      ...(telemetry
        ? {
            telemetryContext: {
              operationId: telemetry.operationId,
              userId: telemetry.userId,
              agentId: telemetry.agentId ?? 'strategy_coordinator',
              feature: 'weekly-recap-email',
            },
          }
        : {}),
    });

    const parsed = resolveStructuredOutput(
      response,
      recapEmailContentSchema,
      'Weekly recap email generation'
    ) as RecapEmailContent;

    const fallbackCompletedActions = [
      'Reviewed your Agent X activity from this week.',
      agentResultSummary,
      'Prepared a focused recap for your next step forward.',
    ];
    const fallbackResultsHighlights = [
      `${weekLabel} recap is ready to review.`,
      'Your latest activity has been organized into clear progress highlights.',
      'Agent X identified next steps to keep momentum moving.',
    ];
    const fallbackNextSteps = [
      'Open your dashboard and review the full recap.',
      'Choose one priority action to complete next.',
      'Ask Agent X for a fresh plan when you are ready to move faster.',
    ];

    return {
      subject: String(parsed.subject ?? `Your ${weekLabel} Recap`),
      introParagraph: String(
        parsed.introParagraph ??
          `Here's a clear look at what Agent X helped you move forward in ${weekLabel}.`
      ),
      completedActions: coerceRecapItems(parsed.completedActions, fallbackCompletedActions),
      resultsHighlights: coerceRecapItems(parsed.resultsHighlights, fallbackResultsHighlights),
      nextSteps: coerceRecapItems(parsed.nextSteps, fallbackNextSteps),
      ctaText: String(parsed.ctaText ?? 'Open Dashboard'),
      ctaUrl:
        typeof parsed.ctaUrl === 'string' && parsed.ctaUrl.startsWith('https://')
          ? parsed.ctaUrl
          : `${APP_URL}/dashboard`,
    };
  } catch (err) {
    logger.warn('[WeeklyRecap] Failed to parse LLM response, using fallback', {
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      subject: `Your ${weekLabel} Agent X Recap`,
      introParagraph: `Here's a summary of what Agent X accomplished for you this week.`,
      completedActions: [agentResultSummary],
      resultsHighlights: ['Agent X completed your weekly recap.'],
      nextSteps: ['Check your dashboard for detailed insights.'],
      ctaText: 'Open Dashboard',
      ctaUrl: `${APP_URL}/dashboard`,
    };
  }
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

/**
 * Build the full branded HTML email.
 * Inline CSS only — no external stylesheets for email client compatibility.
 */
export function buildEmailHtml(params: {
  userName: string;
  role: string;
  weekNumber: number;
  recapNumber: number;
  introParagraph: string;
  completedActions: string[];
  resultsHighlights: string[];
  nextSteps: string[];
  ctaText: string;
  ctaUrl: string;
}): string {
  const {
    userName,
    role,
    weekNumber,
    recapNumber,
    introParagraph,
    completedActions,
    resultsHighlights,
    nextSteps,
    ctaText,
    ctaUrl,
  } = params;

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const greetingName = role.trim().toLowerCase() === 'athlete' ? userName : 'there';

  const renderBulletSection = (title: string, items: string[]): string => {
    const rows = items
      .map(
        (item) =>
          `<li style="margin:0 0 10px 0;font-size:17px;line-height:1.6;color:#1f2937;">${escapeHtml(item)}</li>`
      )
      .join('');

    return [
      `<h2 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;color:#111827;font-weight:800;">${escapeHtml(title)}</h2>`,
      `<ul style="margin:0 0 8px 0;padding:0 0 0 22px;color:#1f2937;">${rows}</ul>`,
    ].join('');
  };

  return buildMarketingEmailShell({
    preheader: `Your Agent X weekly recap for week ${weekNumber} is ready.`,
    eyebrow: `Agent X Weekly Recap #${recapNumber}`,
    title: 'Your Week at a Glance',
    subtitle: `Week ${weekNumber} · ${roleLabel}`,
    introHtml: `
      <p style="margin:0 0 16px 0;font-size:20px;line-height:1.5;color:#101722;">Hey ${escapeHtml(greetingName)},</p>
      <p style="margin:0;font-size:19px;line-height:1.65;color:#1f2937;">${escapeHtml(introParagraph)}</p>
    `,
    sectionsHtml: [
      renderBulletSection('What Agent X Did This Week', completedActions),
      renderBulletSection('Key Results', resultsHighlights),
      renderBulletSection('Recommended Next Steps', nextSteps),
    ],
    ctaButtons: [
      {
        label: ctaText,
        href: ctaUrl,
      },
    ],
    footerHtml: `
      <p style="margin:0;font-size:12px;line-height:1.5;color:#b7c5d5;">You're receiving this because you have Agent X autonomous mode enabled.</p>
      <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#8ea0b4;">
        <a href="${APP_URL}/settings/notifications" style="color:#ccff00;text-decoration:none;">Manage email preferences</a>
        &nbsp;·&nbsp;
        <a href="${APP_URL}" style="color:#ccff00;text-decoration:none;">NXT1 Sports</a>
      </p>
    `,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Full weekly recap pipeline for a single user.
 *
 * - Fetches user doc for name, role, email, and opt-out flags.
 * - Generates personalised content via OpenRouter.
 * - Builds branded HTML.
 * - Saves to Firestore.
 * - Sends email if the user hasn't opted out.
 *
 * Never throws — all errors are caught and logged.
 */
export async function processRecapForUser(
  uid: string,
  agentResultSummary: string,
  jobId: string | undefined,
  db: Firestore,
  progression?: {
    readonly recapNumber?: number;
    readonly weekLabel?: string;
  }
): Promise<void> {
  try {
    // ── 1. Load user doc ────────────────────────────────────────────────────
    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (!userSnap.exists) {
      logger.warn('[WeeklyRecap] User not found, skipping recap', { uid });
      await updateWeeklyRecapDispatchStatus(db, {
        operationId: jobId,
        status: 'failed',
        error: 'Weekly recap user not found',
      }).catch((dispatchErr) => {
        logger.warn('[WeeklyRecap] Failed to update dispatch status for missing user', {
          uid,
          jobId,
          error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
        });
      });
      return;
    }

    const user = userSnap.data() as Record<string, unknown>;
    const email = user['email'] as string | undefined;
    const rawDisplayName =
      (user['displayName'] as string | undefined) ??
      `${(user['firstName'] as string | undefined) ?? ''} ${(user['lastName'] as string | undefined) ?? ''}`.trim();
    const firstName =
      extractFirstName(user['firstName'] as string | undefined) ||
      extractFirstName(rawDisplayName) ||
      'Athlete';
    const role = (user['role'] as string | undefined) ?? 'athlete';
    const primarySport = (user['sports'] as Array<{ sport: string }> | undefined)?.[0]?.sport;

    // ── 2. Check opt-out flags ──────────────────────────────────────────────
    const prefs = user['preferences'] as Record<string, unknown> | undefined;
    const notifications = prefs?.['notifications'] as Record<string, unknown> | undefined;
    const emailEnabled = notifications?.['email'] !== false;
    const shouldSendEmail = emailEnabled && !!email;

    // ── 3. Load history + goal progress in parallel ─────────────────────────
    const [history, goalProgress] = await Promise.all([
      getRecapHistory(uid, db),
      getGoalProgressForRecap(uid, db),
    ]);

    // ── 4. Get next recap number ────────────────────────────────────────────
    const hintedRecapNumber = progression?.recapNumber;
    const recapNumber =
      Number.isInteger(hintedRecapNumber) && (hintedRecapNumber ?? 0) > 0
        ? (hintedRecapNumber as number)
        : await getNextRecapNumber(uid, db);
    const weekLabel = progression?.weekLabel?.trim() || getRecapWeekLabel(recapNumber);
    const weekNumber = recapNumber; // Use recap # as week display number

    // ── 5. Generate content via OpenRouter ──────────────────────────────────
    const content = await generateEmailContent(
      firstName,
      role,
      primarySport,
      weekLabel,
      agentResultSummary,
      history,
      db,
      goalProgress,
      jobId
        ? {
            operationId: jobId,
            userId: uid,
          }
        : undefined
    );
    const introParagraph = stripLeadingGreeting(content.introParagraph) || content.introParagraph;

    // ── 6. Build HTML ────────────────────────────────────────────────────────
    const html = buildEmailHtml({
      userName: firstName,
      role,
      weekNumber,
      recapNumber,
      introParagraph,
      completedActions: content.completedActions,
      resultsHighlights: content.resultsHighlights,
      nextSteps: content.nextSteps,
      ctaText: content.ctaText,
      ctaUrl: content.ctaUrl,
    });

    // ── 7. Save to Firestore (always, regardless of email opt-out) ───────────
    const recapDoc: Omit<AgentWeeklyRecap, 'id'> = {
      recapNumber,
      weekLabel,
      subject: content.subject,
      introParagraph,
      completedActions: content.completedActions,
      resultsHighlights: content.resultsHighlights,
      nextSteps: content.nextSteps,
      ctaText: content.ctaText,
      ctaUrl: content.ctaUrl,
      emailSent: shouldSendEmail,
      jobId,
      createdAt: new Date().toISOString(),
    };

    const savedId = await saveRecap(uid, recapDoc, db);

    logger.info('[WeeklyRecap] Recap saved', { uid, recapId: savedId, recapNumber });

    // ── 8. Push notification (fire-and-forget — non-critical) ───────────────
    dispatchAgentPush(db, {
      kind: 'agent_weekly_recap_ready',
      userId: uid,
      operationId: jobId ?? `weekly-recap-${uid}-${recapNumber}`,
      title: `📊 Week ${recapNumber} Recap is Ready`,
      body: 'Your weekly Agent X Recap is ready to review.',
      recapNumber,
    }).catch(() => {
      /* non-critical — never block the recap flow */
    });

    // ── 9. Send email if opted in ────────────────────────────────────────────
    if (shouldSendEmail) {
      await sendPlatformEmail(email!, content.subject, html);
      logger.info('[WeeklyRecap] Recap email sent', { uid, to: email });
    } else {
      logger.info('[WeeklyRecap] Email skipped (opted out or no email address)', {
        uid,
        emailEnabled,
        hasEmail: !!email,
      });
    }

    await updateWeeklyRecapDispatchStatus(db, {
      operationId: jobId,
      status: 'completed',
    }).catch((dispatchErr) => {
      logger.warn('[WeeklyRecap] Failed to update dispatch status after success', {
        uid,
        jobId,
        error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
      });
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('[WeeklyRecap] processRecapForUser failed', {
      uid,
      jobId,
      error: errorMessage,
      stack: err instanceof Error ? err.stack : undefined,
    });
    await updateWeeklyRecapDispatchStatus(db, {
      operationId: jobId,
      status: 'failed',
      error: errorMessage,
    }).catch((dispatchErr) => {
      logger.warn('[WeeklyRecap] Failed to update dispatch status after failure', {
        uid,
        jobId,
        error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
      });
    });
    // Never propagate — recap failure must not fail the agent job
  }
}
