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
import type { AgentWeeklyRecap } from '@nxt1/core';
import { OpenRouterService } from '../llm/openrouter.service.js';
import { resolveStructuredOutput } from '../llm/structured-output.js';
import { sendPlatformEmail } from '../../../services/communications/platform-email.service.js';
import { dispatchAgentPush } from './agent-push-adapter.service.js';
import { logger } from '../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RECAP_HISTORY = 52;
const RECAP_CONTEXT_COUNT = 3;
const USERS_COLLECTION = 'Users';
const RECAPS_SUBCOLLECTION = 'agent_weekly_recaps';
const APP_URL = 'https://app.nxt1sports.com';

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

/** ISO week label, e.g. "Week 28, 2025". */
function getWeekLabel(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86_400_000 + startOfYear.getDay() + 1) / 7
  );
  return `Week ${weekNum}, ${now.getFullYear()}`;
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
  agentResultSummary: string,
  history: AgentWeeklyRecap[],
  db: Firestore,
  goalProgress?: GoalProgressSummary
): Promise<RecapEmailContent> {
  const llm = new OpenRouterService({ firestore: db });
  const weekLabel = getWeekLabel();

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
  "introParagraph": "string (2-3 sentences, personal and motivating, references the week)",
  "completedActions": ["string", ...] (3-5 specific actions completed this week),
  "resultsHighlights": ["string", ...] (3-5 concrete results or milestones),
  "nextSteps": ["string", ...] (3-5 recommended next steps for the coming week),
  "ctaText": "string (action button label, under 25 chars)",
  "ctaUrl": "string (absolute URL)"
}

Keep the tone professional yet energetic. Be specific — reference sports context, recruiting, and performance where relevant. ctaUrl should be a valid app.nxt1sports.com path.`;

  try {
    const response = await llm.complete([{ role: 'user', content: prompt }], {
      tier: 'chat',
      modelOverride: 'openai/gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 700,
      outputSchema: {
        name: 'weekly_recap_email',
        schema: recapEmailContentSchema,
      },
    });

    const parsed = resolveStructuredOutput(
      response,
      recapEmailContentSchema,
      'Weekly recap email generation'
    ) as RecapEmailContent;

    return {
      subject: String(parsed.subject ?? `Your Week ${weekLabel} Recap`),
      introParagraph: String(parsed.introParagraph ?? ''),
      completedActions: Array.isArray(parsed.completedActions)
        ? parsed.completedActions.slice(0, 5).map(String)
        : [],
      resultsHighlights: Array.isArray(parsed.resultsHighlights)
        ? parsed.resultsHighlights.slice(0, 5).map(String)
        : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.slice(0, 5).map(String) : [],
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
      completedActions: [agentResultSummary.slice(0, 120)],
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

  const listItems = (items: string[]): string =>
    items
      .map(
        (item) =>
          `<li style="margin: 0 0 10px 0; padding-left: 8px; color: #e2e8f0; font-size: 15px; line-height: 1.6;">${escapeHtml(item)}</li>`
      )
      .join('');

  const sectionTitle = (title: string): string =>
    `<h3 style="margin: 24px 0 12px 0; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #00d4ff;">${title}</h3>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Week ${weekNumber} Agent X Recap</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0e1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0e1a;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 16px 16px 0 0; padding: 40px 40px 32px; border-bottom: 2px solid #00d4ff;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px;">Agent X Weekly Recap #${recapNumber}</p>
                    <h1 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 800; color: #f8fafc; line-height: 1.2;">Your Week at a Glance</h1>
                    <p style="margin: 0; font-size: 13px; color: #64748b;">Week ${weekNumber} · ${escapeHtml(role.charAt(0).toUpperCase() + role.slice(1))}</p>
                  </td>
                  <td width="80" valign="top" align="right">
                    <div style="width: 56px; height: 56px; background: linear-gradient(135deg, #00d4ff, #7c3aed); border-radius: 14px; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 56px; font-size: 28px;">⚡</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color: #111827; padding: 36px 40px;">

              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; font-size: 17px; color: #f8fafc; line-height: 1.6;">Hey ${escapeHtml(userName)},</p>
              <p style="margin: 0 0 28px 0; font-size: 15px; color: #94a3b8; line-height: 1.7;">${escapeHtml(introParagraph)}</p>

              <!-- Completed Actions -->
              ${sectionTitle('✅ What Agent X Did This Week')}
              <ul style="margin: 0 0 8px 0; padding: 0 0 0 20px;">
                ${listItems(completedActions)}
              </ul>

              <!-- Results -->
              ${sectionTitle('📊 Key Results')}
              <ul style="margin: 0 0 8px 0; padding: 0 0 0 20px;">
                ${listItems(resultsHighlights)}
              </ul>

              <!-- Next Steps -->
              ${sectionTitle('🚀 Recommended Next Steps')}
              <ul style="margin: 0 0 32px 0; padding: 0 0 0 20px;">
                ${listItems(nextSteps)}
              </ul>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${ctaUrl}"
                      style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #00d4ff, #7c3aed); color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 10px; letter-spacing: 0.5px;">
                      ${escapeHtml(ctaText)} →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; border-radius: 0 0 16px 16px; padding: 24px 40px; border-top: 1px solid #1e293b;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #475569; text-align: center;">
                You're receiving this because you have Agent X autonomous mode enabled.
              </p>
              <p style="margin: 0; font-size: 12px; color: #475569; text-align: center;">
                <a href="${APP_URL}/settings/notifications" style="color: #00d4ff; text-decoration: none;">Manage email preferences</a>
                &nbsp;·&nbsp;
                <a href="${APP_URL}" style="color: #00d4ff; text-decoration: none;">NXT1 Sports</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
  db: Firestore
): Promise<void> {
  try {
    // ── 1. Load user doc ────────────────────────────────────────────────────
    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (!userSnap.exists) {
      logger.warn('[WeeklyRecap] User not found, skipping recap', { uid });
      return;
    }

    const user = userSnap.data() as Record<string, unknown>;
    const email = user['email'] as string | undefined;
    const rawDisplayName =
      (user['displayName'] as string | undefined) ??
      `${(user['firstName'] as string | undefined) ?? ''} ${(user['lastName'] as string | undefined) ?? ''}`.trim();
    const displayName = rawDisplayName || 'Athlete';
    const role = (user['role'] as string | undefined) ?? 'athlete';
    const primarySport = (user['sports'] as Array<{ sport: string }> | undefined)?.[0]?.sport;

    // ── 2. Check opt-out flags ──────────────────────────────────────────────
    const prefs = user['preferences'] as Record<string, unknown> | undefined;
    const notifications = prefs?.['notifications'] as Record<string, unknown> | undefined;
    const emailEnabled = notifications?.['email'] !== false;
    const recapEmailEnabled = user['weeklyRecapEmailEnabled'] !== false;
    const shouldSendEmail = emailEnabled && recapEmailEnabled && !!email;

    // ── 3. Load history + goal progress in parallel ─────────────────────────
    const [history, goalProgress] = await Promise.all([
      getRecapHistory(uid, db),
      getGoalProgressForRecap(uid, db),
    ]);

    // ── 4. Get next recap number ────────────────────────────────────────────
    const recapNumber = await getNextRecapNumber(uid, db);
    const weekLabel = getWeekLabel();
    const weekNumber = recapNumber; // Use recap # as week display number

    // ── 5. Generate content via OpenRouter ──────────────────────────────────
    const content = await generateEmailContent(
      displayName,
      role,
      primarySport,
      agentResultSummary,
      history,
      db,
      goalProgress
    );

    // ── 6. Build HTML ────────────────────────────────────────────────────────
    const html = buildEmailHtml({
      userName: displayName,
      role,
      weekNumber,
      recapNumber,
      introParagraph: content.introParagraph,
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
      introParagraph: content.introParagraph,
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
        recapEmailEnabled,
        hasEmail: !!email,
      });
    }
  } catch (err) {
    logger.error('[WeeklyRecap] processRecapForUser failed', {
      uid,
      jobId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // Never propagate — recap failure must not fail the agent job
  }
}
