/**
 * @fileoverview Agent Generation Service — Playbook & Briefing Generation
 * @module @nxt1/backend/modules/agent/services
 *
 * Extracted from route handlers so both HTTP endpoints and backend triggers
 * (e.g. onDailySyncComplete, runDailyBriefings) can generate playbooks and
 * briefings without duplicating logic.
 *
 * Uses `getFirestore()` directly (not req.firebase) so it works outside
 * Express request context.
 */

import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { AgentDashboardGoal, ShellWeeklyPlaybookItem, ShellBriefingInsight } from '@nxt1/core';
import { getShellContentForRole } from '@nxt1/core';
import { logger } from '../../../utils/logger.js';
import {
  buildEliteContext,
  getRecurringHabitsPrompt,
  resolvePrimarySport,
} from './elite-context.js';

// ─── Shared Helpers ─────────────────────────────────────────────────────────

/** Strip markdown code fences from LLM JSON output. */
function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return cleaned;
}

/** Extract human-readable delta sync parts from a sync report document. */
function extractDeltaSyncParts(reportData: Record<string, unknown>): string[] {
  const summary = reportData['summary'] as Record<string, number> | undefined;
  const parts: string[] = [];
  const statsUpdated = summary?.['statsUpdated'] ?? 0;
  const newRecruiting = summary?.['newRecruitingActivities'] ?? 0;
  const newAwards = summary?.['newAwards'] ?? 0;
  const newSchedule = summary?.['newScheduleEvents'] ?? 0;

  if (statsUpdated > 0) parts.push(`${statsUpdated} stat updates`);
  if (newRecruiting > 0) parts.push(`${newRecruiting} new recruiting activities`);
  if (newAwards > 0) parts.push(`${newAwards} new awards`);
  if (newSchedule > 0) parts.push(`${newSchedule} upcoming schedule events`);
  return parts;
}

const VALID_BRIEFING_ICONS = new Set([
  'trophy-outline',
  'mail-outline',
  'trending-up-outline',
  'alert-outline',
  'checkmark-circle-outline',
  'star-outline',
]);

function sanitizeBriefingIcon(icon: unknown): string {
  const value = String(icon ?? 'star-outline');
  return VALID_BRIEFING_ICONS.has(value) ? value : 'star-outline';
}

// ─── Result Types ───────────────────────────────────────────────────────────

export interface PlaybookGenerationResult {
  items: ShellWeeklyPlaybookItem[];
  goals: AgentDashboardGoal[];
  generatedAt: string;
  canRegenerate: boolean;
}

export interface BriefingGenerationResult {
  previewText: string;
  insights: ShellBriefingInsight[];
  generatedAt: string;
}

// ─── Generation Service ─────────────────────────────────────────────────────

export class AgentGenerationService {
  private get db(): Firestore {
    return getFirestore();
  }

  /** Return a Firestore reference, preferring an explicit override. */
  private resolveDb(dbOverride?: Firestore): Firestore {
    return dbOverride ?? this.db;
  }

  /**
   * Generate a personalized weekly playbook for a user.
   * Reads user profile + goals from Firestore, calls OpenRouter LLM,
   * persists result, and prunes old playbooks (keep 10).
   */
  async generatePlaybook(uid: string, dbOverride?: Firestore): Promise<PlaybookGenerationResult> {
    const db = this.resolveDb(dbOverride);
    const userDoc = await db.collection('Users').doc(uid).get();
    const userData = userDoc.data() ?? {};
    const role = (userData['role'] ?? 'athlete') as string;
    const agentGoals: AgentDashboardGoal[] = (userData['agentGoals'] ?? []) as AgentDashboardGoal[];

    // ── Build elite context from full user profile ────────────────────────
    const eliteContext = buildEliteContext(userData);

    // ── Resolve primary sport for habit menu ──────────────────────────────
    const primarySport = resolvePrimarySport(userData);
    const recurringHabitsBlock = getRecurringHabitsPrompt(role, primarySport || undefined);

    if (agentGoals.length === 0) {
      throw new Error('Set at least one goal before generating a playbook');
    }

    const goalsText = agentGoals
      .map((g, i) => `${i + 1}. [id: "${g.id}"] ${g.text} (category: ${g.category})`)
      .join('\n');

    const goalsForPrompt = agentGoals
      .map((g) => `- id: "${g.id}", label: "${g.text.slice(0, 40)}"`)
      .join('\n');

    // ── Gather past task context ──────────────────────────────────────────
    let pastTaskContext = '';
    try {
      const prevPlaybook = await db
        .collection('Users')
        .doc(uid)
        .collection('agent_playbooks')
        .orderBy('generatedAt', 'desc')
        .limit(1)
        .get();

      if (!prevPlaybook.empty) {
        const prevItems = (prevPlaybook.docs[0].data()['items'] ?? []) as ShellWeeklyPlaybookItem[];
        const completedTitles = prevItems
          .filter((i) => i.status === 'complete')
          .map((i) => `"${i.title}"`)
          .join(', ');
        const inProgressTitles = prevItems
          .filter((i) => i.status === 'in-progress')
          .map((i) => `"${i.title}"`)
          .join(', ');

        if (completedTitles || inProgressTitles) {
          pastTaskContext = '\n\nContext from last week:\n';
          if (completedTitles) pastTaskContext += `- Already completed: ${completedTitles}\n`;
          if (inProgressTitles) pastTaskContext += `- Still in progress: ${inProgressTitles}\n`;
          pastTaskContext +=
            'Do NOT repeat completed tasks. Continue or build on in-progress tasks.';
        }
      }
    } catch {
      // Past context is non-critical — continue without it
    }

    // ── Gather delta sync context ─────────────────────────────────────────
    let deltaContext = '';
    try {
      const syncReport = await db
        .collection('Users')
        .doc(uid)
        .collection('agent_sync_reports')
        .orderBy('syncedAt', 'desc')
        .limit(1)
        .get();

      if (!syncReport.empty) {
        const parts = extractDeltaSyncParts(syncReport.docs[0].data());
        if (parts.length > 0) {
          deltaContext = `\n\nRecent profile activity detected: ${parts.join(', ')}. Incorporate relevant follow-up actions into the playbook.`;
        }
      }
    } catch {
      // Delta context is non-critical — continue without it
    }

    const shellContent = getShellContentForRole(role);
    const coordinatorsList = shellContent.coordinators
      .map((c) => `- id: "${c.id}", label: "${c.label}", icon: "${c.icon}"`)
      .join('\n');

    const prompt = [
      `You are Agent X, the AI-powered sports assistant for the NXT1 platform — the first AI born in the locker room. You are not just a recruiting tool; you are an intelligent sports operations agent that helps athletes develop, coaches strategize, parents navigate, directors manage, and scouts evaluate.`,
      ``,
      `═══ USER PROFILE (Elite Context) ═══`,
      eliteContext,
      ``,
      `═══ USER'S GOALS (Your #1 Priority) ═══`,
      goalsText,
      pastTaskContext,
      deltaContext,
      ``,
      `═══ RECURRING WEEKLY HABITS ═══`,
      recurringHabitsBlock,
      ``,
      `Available user goal IDs (for the "goal" field on strategic tasks):\n${goalsForPrompt}`,
      ``,
      `Available coordinators (assign the most relevant one to each task):\n${coordinatorsList}`,
      ``,
      `═══ OUTPUT FORMAT (CATEGORIZED PLAYBOOK) ═══`,
      `Return a JSON array of EXACTLY 5 playbook items split into TWO categories:`,
      ``,
      `CATEGORY 1 — RECURRING HABITS (exactly 2 items):`,
      `  These are routine maintenance tasks from the habits menu above.`,
      `  Set "goal" to: { "id": "recurring", "label": "Weekly Habits" }`,
      `  Set "weekLabel" to "Weekly".`,
      ``,
      `CATEGORY 2 — GOAL EXECUTION (exactly 3 items):`,
      `  These are unique, high-impact strategic tasks tied to the user's specific goals.`,
      `  Set "goal" to: { "id": "<real goal id>", "label": "<goal text (max 30 chars)>" }`,
      `  Set "weekLabel" to a specific day ("Mon", "Tue", "Wed", "Thu", "Fri").`,
      ``,
      `Each item must have:`,
      `- "id": unique string like "wp-1"`,
      `- "weekLabel": "Weekly" for recurring habits, or a day abbreviation for goal tasks`,
      `- "title": short action title (max 50 chars)`,
      `- "summary": one-sentence description of the task`,
      `- "why": a compelling, hyper-personal reason WHY this matters — reference their specific profile data (class year, position, sport, season, team, location). Example: "As a Class of 2026 PG heading into summer AAU, this exposure window closes in 8 weeks."`,
      `- "details": detailed explanation of what Agent X prepared`,
      `- "actionLabel": button text (e.g., "Review Draft", "Send Emails", "Sync Now")`,
      `- "status": always "pending"`,
      `- "goal": object with "id" and "label" as described above`,
      `- "coordinator": object with "id", "label", and "icon" from the available coordinators list above`,
      ``,
      `IMPORTANT: Return the 2 recurring items FIRST, then the 3 goal items (ordered most time-sensitive first). The "why" field is critical — hook the user emotionally. Never produce generic advice — always ground it in their reality using their profile data.`,
      ``,
      `Return ONLY the JSON array, no markdown fences, no explanation.`,
    ]
      .filter(Boolean)
      .join('\n');

    let playbookItems: ShellWeeklyPlaybookItem[] = [];

    try {
      const { OpenRouterService } = await import('../llm/openrouter.service.js');
      const llm = new OpenRouterService();
      const llmResult = await llm.complete(
        [
          {
            role: 'system',
            content:
              "You are Agent X, a hyper-personalized AI sports assistant. You deeply understand each user's role, sport, season, and goals. Return only valid JSON arrays. Every task you generate must feel hand-crafted for this specific user — never generic.",
          },
          { role: 'user', content: prompt },
        ],
        {
          tier: 'chat',
          maxTokens: 2048,
          temperature: 0.7,
          jsonMode: true,
        }
      );

      try {
        const jsonText = stripMarkdownFences(llmResult.content ?? '');
        const parsed = JSON.parse(jsonText) as unknown;
        if (Array.isArray(parsed)) {
          playbookItems = parsed.map((item: Record<string, unknown>) => ({
            id: String(item['id'] ?? `wp-${crypto.randomUUID().slice(0, 8)}`),
            weekLabel: String(item['weekLabel'] ?? ''),
            title: String(item['title'] ?? ''),
            summary: String(item['summary'] ?? ''),
            why: String(item['why'] ?? ''),
            details: String(item['details'] ?? ''),
            actionLabel: String(item['actionLabel'] ?? 'Take Action'),
            status: 'pending' as const,
            goal:
              item['goal'] && typeof item['goal'] === 'object'
                ? {
                    id: String((item['goal'] as Record<string, unknown>)['id'] ?? ''),
                    label: String((item['goal'] as Record<string, unknown>)['label'] ?? ''),
                  }
                : undefined,
            coordinator:
              item['coordinator'] && typeof item['coordinator'] === 'object'
                ? {
                    id: String((item['coordinator'] as Record<string, unknown>)['id'] ?? ''),
                    label: String((item['coordinator'] as Record<string, unknown>)['label'] ?? ''),
                    icon: String(
                      (item['coordinator'] as Record<string, unknown>)['icon'] ?? 'sparkles'
                    ),
                  }
                : undefined,
          }));
        }
      } catch (parseErr) {
        logger.error('Failed to parse playbook JSON from LLM', { error: String(parseErr) });
      }
    } catch {
      logger.warn('OpenRouter not available for playbook generation, using fallback');
    }

    // Fallback: generate template-based playbook if LLM unavailable or parse fails
    if (playbookItems.length === 0) {
      const defaultCoordinator = shellContent.coordinators[0];
      const coordObj = defaultCoordinator
        ? {
            id: defaultCoordinator.id,
            label: defaultCoordinator.label,
            icon: defaultCoordinator.icon,
          }
        : undefined;

      // 2 recurring habit tasks
      const recurringItems: ShellWeeklyPlaybookItem[] = [
        {
          id: 'wp-recurring-1',
          weekLabel: 'Weekly',
          title: 'Sync your profile',
          summary: 'Make sure your profile is up to date so coaches and scouts see the latest you.',
          why: 'An outdated profile means missed opportunities — keep it fresh.',
          details:
            'Review your height, weight, stats, and contact info. Update anything that has changed.',
          actionLabel: 'Sync Now',
          status: 'pending' as const,
          goal: { id: 'recurring', label: 'Weekly Habits' },
          coordinator: coordObj,
        },
        {
          id: 'wp-recurring-2',
          weekLabel: 'Weekly',
          title: 'Review your weekly progress',
          summary: 'Take 5 minutes to review what you accomplished this week.',
          why: 'Consistent reflection builds momentum and keeps you on track.',
          details: 'Check your completed tasks, look at your stats, and plan for next week.',
          actionLabel: 'Review Now',
          status: 'pending' as const,
          goal: { id: 'recurring', label: 'Weekly Habits' },
          coordinator: coordObj,
        },
      ];

      // 3 goal-specific tasks (distribute across goals)
      const goalItems: ShellWeeklyPlaybookItem[] = agentGoals.slice(0, 3).map((goal, gi) => ({
        id: `wp-goal-${gi + 1}`,
        weekLabel: ['Mon', 'Wed', 'Fri'][gi % 3],
        title: `Work on: ${goal.text.slice(0, 40)}`,
        summary: `Agent X has prepared action steps for your "${goal.text}" goal.`,
        why: 'Getting ahead on this goal now gives you an edge before the week gets busy.',
        details: 'Review the plan and take the first step toward achieving your goal.',
        actionLabel: 'Review Plan',
        status: 'pending' as const,
        goal: { id: goal.id, label: goal.text.slice(0, 30) },
        coordinator: coordObj,
      }));

      playbookItems = [...recurringItems, ...goalItems];
    }

    const generatedAt = new Date().toISOString();

    // Persist and prune old playbooks (keep last 10)
    const playbooksRef = db.collection('Users').doc(uid).collection('agent_playbooks');
    await playbooksRef.add({
      items: playbookItems,
      goals: agentGoals,
      generatedAt,
      role,
    });

    try {
      const allPlaybooks = await playbooksRef.orderBy('generatedAt', 'desc').get();
      const toDelete = allPlaybooks.docs.slice(10);
      await Promise.all(toDelete.map((doc) => doc.ref.delete()));
    } catch (pruneErr) {
      logger.warn('Failed to prune old playbook documents', {
        userId: uid,
        error: pruneErr instanceof Error ? pruneErr.message : String(pruneErr),
      });
    }

    logger.info('Agent playbook generated', {
      userId: uid,
      itemCount: playbookItems.length,
      goalCount: agentGoals.length,
    });

    return {
      items: playbookItems,
      goals: agentGoals,
      generatedAt,
      canRegenerate: true,
    };
  }

  /**
   * Generate a personalized daily briefing for a user.
   * Reads user profile, recent operations, and sync data from Firestore,
   * calls OpenRouter LLM, persists result, and prunes old briefings (keep 7).
   *
   * @param uid  - The user's Firestore UID
   * @param force - If false, returns an existing today's briefing instead of generating new
   */
  async generateBriefing(
    uid: string,
    force = false,
    dbOverride?: Firestore
  ): Promise<BriefingGenerationResult> {
    const db = this.resolveDb(dbOverride);
    // ── Check if a fresh briefing already exists (skip unless forced) ────
    if (!force) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const existingBriefing = await db
        .collection('Users')
        .doc(uid)
        .collection('agent_briefings')
        .where('generatedAt', '>=', todayStart.toISOString())
        .limit(1)
        .get();

      if (!existingBriefing.empty) {
        const bData = existingBriefing.docs[0].data();
        return {
          previewText: (bData['previewText'] as string) ?? '',
          insights: (bData['insights'] as ShellBriefingInsight[]) ?? [],
          generatedAt: (bData['generatedAt'] as string) ?? new Date().toISOString(),
        };
      }
    }

    // ── Fetch user profile data ─────────────────────────────────────────
    const userDoc = await db.collection('Users').doc(uid).get();
    const userData = userDoc.data() ?? {};
    const role = (userData['role'] ?? 'athlete') as string;
    const agentGoals: AgentDashboardGoal[] = (userData['agentGoals'] ?? []) as AgentDashboardGoal[];

    // ── Build elite context from full user profile ────────────────────────
    const eliteContext = buildEliteContext(userData);

    const goalsText =
      agentGoals.length > 0 ? agentGoals.map((g) => `• ${g.text}`).join('\n') : 'No goals set yet.';

    // ── Fetch recent operations (last 24h activity) ─────────────────────
    let recentActivityText = '';
    try {
      const recentBriefings = await db
        .collection('Users')
        .doc(uid)
        .collection('agent_playbooks')
        .orderBy('generatedAt', 'desc')
        .limit(1)
        .get();

      if (!recentBriefings.empty) {
        const items = (recentBriefings.docs[0].data()['items'] ?? []) as ShellWeeklyPlaybookItem[];
        const completed = items.filter((i) => i.status === 'complete').slice(0, 5);
        if (completed.length > 0) {
          recentActivityText =
            `\n\nRecently completed tasks:\n` + completed.map((t) => `• ${t.title}`).join('\n');
        }
      }
    } catch {
      // Non-critical — continue without recent activity
    }

    // ── Fetch recent delta sync context ─────────────────────────────────
    let syncContext = '';
    try {
      const syncReport = await db
        .collection('Users')
        .doc(uid)
        .collection('agent_sync_reports')
        .orderBy('syncedAt', 'desc')
        .limit(1)
        .get();

      if (!syncReport.empty) {
        const parts = extractDeltaSyncParts(syncReport.docs[0].data());
        if (parts.length > 0) {
          syncContext = `\n\nProfile sync detected: ${parts.join(', ')}.`;
        }
      }
    } catch {
      // Non-critical — continue without sync context
    }

    // ── Build LLM prompt ────────────────────────────────────────────────
    const promptLines = [
      `You are Agent X, the AI-powered sports assistant for NXT1. Generate a concise, hyper-personalized daily briefing.`,
      ``,
      `═══ USER PROFILE (Elite Context) ═══`,
      eliteContext,
      ``,
      `═══ USER'S GOALS ═══`,
      goalsText,
      recentActivityText,
      syncContext,
      ``,
      `Generate a briefing that feels personally crafted for this user — reference their sport, season phase, role, and goals. Never be generic.`,
      ``,
      `Return ONLY a JSON object with:`,
      `- "previewText": one sentence summary of today's focus (max 80 chars) — personalized to their role and season`,
      `- "insights": array of 2-4 insight objects, each with:`,
      `    - "id": unique string like "bi-1"`,
      `    - "text": actionable insight personalized to their profile (max 90 chars)`,
      `    - "icon": one of "trophy-outline", "mail-outline", "trending-up-outline", "alert-outline", "checkmark-circle-outline", "star-outline"`,
      `    - "type": one of "info", "warning", "success"`,
      ``,
      `Return ONLY the JSON object, no markdown fences.`,
    ]
      .filter(Boolean)
      .join('\n');

    const displayName = ((userData['displayName'] ?? '') as string).trim();
    let briefingInsights: ShellBriefingInsight[] = [];
    let briefingPreviewText = `Good morning, ${displayName || 'athlete'}. Here's your daily focus.`;

    try {
      const { OpenRouterService } = await import('../llm/openrouter.service.js');
      const llm = new OpenRouterService();
      const llmResult = await llm.complete(
        [
          {
            role: 'system',
            content:
              "You are Agent X, a hyper-personalized AI sports assistant. You deeply understand each user's role, sport, season, and goals. Return only valid JSON. Every insight must feel hand-crafted for this specific user — never generic.",
          },
          { role: 'user', content: promptLines },
        ],
        {
          tier: 'chat',
          maxTokens: 1024,
          temperature: 0.7,
          jsonMode: true,
        }
      );

      try {
        const jsonText = stripMarkdownFences(llmResult.content ?? '');
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
        if (typeof parsed['previewText'] === 'string') {
          briefingPreviewText = parsed['previewText'];
        }
        if (Array.isArray(parsed['insights'])) {
          briefingInsights = (parsed['insights'] as Record<string, unknown>[]).map((ins, idx) => ({
            id: String(ins['id'] ?? `bi-${idx + 1}`),
            text: String(ins['text'] ?? ''),
            icon: sanitizeBriefingIcon(ins['icon']),
            type: (['info', 'warning', 'success'].includes(String(ins['type']))
              ? ins['type']
              : 'info') as ShellBriefingInsight['type'],
          }));
        }
      } catch (parseErr) {
        logger.error('Failed to parse briefing JSON from LLM', { error: String(parseErr) });
      }
    } catch {
      logger.warn('OpenRouter not available for briefing generation, using fallback');
    }

    // Fallback: generate goal-based insights if LLM unavailable or parse fails
    if (briefingInsights.length === 0) {
      briefingInsights = agentGoals.slice(0, 3).map((goal, idx) => ({
        id: `bi-${idx + 1}`,
        text: `Focus today: ${goal.text.slice(0, 80)}`,
        icon: 'star-outline' as const,
        type: 'info' as const,
      }));

      if (briefingInsights.length === 0) {
        briefingInsights = [
          {
            id: 'bi-1',
            text: 'Set your goals to get personalized daily briefings.',
            icon: 'star-outline',
            type: 'info',
          },
        ];
      }
    }

    const generatedAt = new Date().toISOString();

    // ── Persist and prune briefings (keep last 7) ───────────────────────
    const briefingsRef = db.collection('Users').doc(uid).collection('agent_briefings');
    await briefingsRef.add({
      previewText: briefingPreviewText,
      insights: briefingInsights,
      generatedAt,
      role,
    });

    try {
      const allBriefings = await briefingsRef.orderBy('generatedAt', 'desc').get();
      const toDelete = allBriefings.docs.slice(7);
      await Promise.all(toDelete.map((doc) => doc.ref.delete()));
    } catch (pruneErr) {
      logger.warn('Failed to prune old briefing documents', {
        userId: uid,
        error: pruneErr instanceof Error ? pruneErr.message : String(pruneErr),
      });
    }

    logger.info('Agent briefing generated', {
      userId: uid,
      insightCount: briefingInsights.length,
    });

    return {
      previewText: briefingPreviewText,
      insights: briefingInsights,
      generatedAt,
    };
  }

  /**
   * Run both playbook and briefing generation for a user.
   * Used by the daily sync pipeline after the scraper completes.
   * Silently skips if the user has no goals set.
   */
  async generateDailyContent(uid: string): Promise<void> {
    // Check if user has goals before generating
    const userDoc = await this.db.collection('Users').doc(uid).get();
    const userData = userDoc.data() ?? {};
    const agentGoals = (userData['agentGoals'] ?? []) as AgentDashboardGoal[];

    if (agentGoals.length === 0) {
      logger.info('Skipping daily content generation — no goals set', { userId: uid });
      return;
    }

    // Dedup guard: skip if already generated within the last 20 hours
    // Prevents Cloud Scheduler retries from billing duplicate LLM calls
    const lastGeneratedAt = userData['agentLastGeneratedAt'] as Timestamp | undefined;
    if (lastGeneratedAt) {
      const hoursSinceLast = (Date.now() - lastGeneratedAt.toMillis()) / (1000 * 60 * 60);
      if (hoursSinceLast < 20) {
        logger.info('Skipping daily content generation — already generated recently', {
          userId: uid,
          hoursSinceLast: Math.round(hoursSinceLast),
        });
        return;
      }
    }

    // Stamp before generating so concurrent retries also bail out
    await this.db
      .collection('Users')
      .doc(uid)
      .update({ agentLastGeneratedAt: FieldValue.serverTimestamp() })
      .catch(() => {
        /* non-critical */
      });

    // Generate both in parallel — briefing and playbook are independent
    const [playbookResult, briefingResult] = await Promise.allSettled([
      this.generatePlaybook(uid),
      this.generateBriefing(uid, true),
    ]);

    if (playbookResult.status === 'rejected') {
      logger.error('Daily playbook generation failed', {
        userId: uid,
        error: String(playbookResult.reason),
      });
    }
    if (briefingResult.status === 'rejected') {
      logger.error('Daily briefing generation failed', {
        userId: uid,
        error: String(briefingResult.reason),
      });
    }
  }
}
