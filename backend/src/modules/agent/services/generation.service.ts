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
  getRecurringHabitsPrompt,
  getRolePromptScaffolding,
  getSeasonInfo,
  resolvePrimarySport,
  ContextBuilder,
} from '../memory/context-builder.js';
import { VectorMemoryService } from '../memory/vector.service.js';
import { OpenRouterService } from '../llm/openrouter.service.js';

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

const LEGACY_FALLBACK_PLAYBOOK_IDS = new Set([
  'wp-recurring-1',
  'wp-recurring-2',
  'wp-goal-1',
  'wp-goal-2',
  'wp-goal-3',
]);

export function isLegacyFallbackPlaybook(items: readonly ShellWeeklyPlaybookItem[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => LEGACY_FALLBACK_PLAYBOOK_IDS.has(item.id));
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
  /**
   * Optional telemetry-wired LLM instance injected from bootstrap.
   * When provided, all LLM calls accumulate cost in the job-cost-tracker
   * (keyed by operationId) so billing deduction can pick them up.
   * When absent, falls back to creating a blind instance (legacy behavior).
   */
  private readonly llmService?: OpenRouterService;
  private ownedLlmService?: OpenRouterService;
  private contextBuilder?: ContextBuilder;

  constructor(llmService?: OpenRouterService, contextBuilder?: ContextBuilder) {
    this.llmService = llmService;
    this.contextBuilder = contextBuilder;
  }

  private get db(): Firestore {
    return getFirestore();
  }

  /** Return a Firestore reference, preferring an explicit override. */
  private resolveDb(dbOverride?: Firestore): Firestore {
    return dbOverride ?? this.db;
  }

  private getOrCreateLlmService(): OpenRouterService {
    if (this.llmService) return this.llmService;
    if (!this.ownedLlmService) {
      this.ownedLlmService = new OpenRouterService();
    }
    return this.ownedLlmService;
  }

  private getOrCreateContextBuilder(): ContextBuilder {
    if (this.contextBuilder) return this.contextBuilder;
    this.contextBuilder = new ContextBuilder(new VectorMemoryService(this.getOrCreateLlmService()));
    return this.contextBuilder;
  }

  private async buildPromptContextText(uid: string, query: string, db: Firestore): Promise<string> {
    try {
      const builder = this.getOrCreateContextBuilder();
      const promptContext = await builder.buildPromptContext(uid, query, db);
      return builder.compressToPrompt(
        promptContext.profile,
        promptContext.memories,
        promptContext.recentSyncSummaries ?? []
      );
    } catch (err) {
      logger.warn('[AgentGenerationService] Failed to build vector-backed prompt context', {
        userId: uid,
        error: err instanceof Error ? err.message : String(err),
      });

      const fallbackBuilder = new ContextBuilder();
      const profile = await fallbackBuilder.buildContext(uid, db);
      return fallbackBuilder.compressToPrompt(profile);
    }
  }

  private buildPlanningMemoryQuery(
    mode: 'playbook' | 'briefing',
    role: string,
    primarySport: string | null,
    goals: readonly AgentDashboardGoal[]
  ): string {
    const goalText = goals
      .map((goal) => goal.text.trim())
      .filter(Boolean)
      .join(' | ');

    return [
      mode === 'playbook' ? 'weekly playbook planning' : 'daily briefing planning',
      `role: ${role}`,
      primarySport ? `sport: ${primarySport}` : '',
      goalText ? `goals: ${goalText}` : 'goals: none set',
      'retrieve recruiting priorities, performance context, preferences, recent sync changes, and durable memory',
    ]
      .filter(Boolean)
      .join(' | ');
  }

  private buildPlanningScaffolding(
    primarySport: string | null,
    userData: Record<string, unknown>,
    now: Date = new Date()
  ): string {
    const lines: string[] = [];
    const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const season = primarySport ? getSeasonInfo(primarySport, now) : null;

    if (season && primarySport) {
      lines.push(
        `Calendar Context: It is currently ${monthYear}. For ${primarySport}, this is the ${season.phase} period. Focus areas: ${season.focus}.`
      );
    } else {
      lines.push(`Calendar Context: It is currently ${monthYear}.`);
    }

    const roleScaffolding = getRolePromptScaffolding(userData);
    if (roleScaffolding) lines.push(roleScaffolding);
    lines.push(
      `Goal Mandate: The user's stated goals are the top priority. Use season timing and profile context as the environment for execution, but never override their goals with generic seasonal advice.`
    );

    return lines.join('\n');
  }

  /**
   * Generate a personalized weekly playbook for a user.
   * Reads user profile + goals from Firestore, calls OpenRouter LLM,
   * persists result, and prunes old playbooks (keep 10).
   */
  async generatePlaybook(
    uid: string,
    dbOverride?: Firestore,
    operationId?: string
  ): Promise<PlaybookGenerationResult> {
    const db = this.resolveDb(dbOverride);
    const userDoc = await db.collection('Users').doc(uid).get();
    const userData = userDoc.data() ?? {};
    const role = (userData['role'] ?? 'athlete') as string;
    const agentGoals: AgentDashboardGoal[] = (userData['agentGoals'] ?? []) as AgentDashboardGoal[];

    // ── Resolve primary sport for habit menu ──────────────────────────────
    const primarySport = resolvePrimarySport(userData);
    const recurringHabitsBlock = getRecurringHabitsPrompt(
      role,
      primarySport || undefined,
      new Date(),
      userData
    );

    if (agentGoals.length === 0) {
      throw new Error('Set at least one goal before generating a playbook');
    }

    const promptContextText = await this.buildPromptContextText(
      uid,
      this.buildPlanningMemoryQuery('playbook', role, primarySport, agentGoals),
      db
    );
    const planningScaffolding = this.buildPlanningScaffolding(primarySport, userData);

    const goalsText = agentGoals
      .map((g, i) => `${i + 1}. [id: "${g.id}"] ${g.text} (category: ${g.category})`)
      .join('\n');

    const goalsForPrompt = agentGoals
      .map((g) => `- id: "${g.id}", label: "${g.text.slice(0, 40)}"`)
      .join('\n');

    // ── Gather completed goal history context ─────────────────────────────
    let completedGoalsContext = '';
    try {
      const historySnap = await db
        .collection('Users')
        .doc(uid)
        .collection('goal_history')
        .orderBy('completedAt', 'desc')
        .limit(3)
        .get();

      if (!historySnap.empty) {
        const completedEntries = historySnap.docs
          .map((d) => {
            const rec = d.data() as {
              text: string;
              category: string;
              completedAt: string;
              daysToComplete: number;
            };
            const dateStr = rec.completedAt
              ? new Date(rec.completedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : '';
            return `- ${rec.text} (${rec.category})${dateStr ? ` — completed ${dateStr}` : ''}${rec.daysToComplete ? ` in ${rec.daysToComplete}d` : ''}`;
          })
          .join('\n');
        completedGoalsContext = `\n\nPreviously completed goals (do NOT repeat these; build on this progress):\n${completedEntries}`;
      }
    } catch {
      // Completed goal context is non-critical — continue without it
    }

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
      `You are Agent X, the AI-powered sports assistant for the NXT1 platform — The Ultimate AI Sports Coordinators. You are not just a recruiting tool; you are an intelligent sports operations agent that helps athletes develop, coaches strategize, parents navigate, directors manage, and scouts evaluate.`,
      ``,
      `═══ USER CONTEXT (RAG PROFILE + MEMORY) ═══`,
      promptContextText,
      planningScaffolding,
      ``,
      `═══ USER'S GOALS (Your #1 Priority) ═══`,
      goalsText,
      completedGoalsContext,
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
      `  Set "goal" to: { "id": "recurring", "label": "Weekly Tasks" }`,
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
    let llmRawContent: string | null | undefined;

    try {
      const llm = this.getOrCreateLlmService();
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
          ...(operationId
            ? { telemetryContext: { operationId, userId: uid, agentId: 'general' as const } }
            : {}),
        }
      );

      try {
        const jsonText = stripMarkdownFences(llmResult.content ?? '');
        const parsed = JSON.parse(jsonText) as unknown;
        // Handle both bare array and wrapped object e.g. { "items": [...] } or { "playbook": [...] }
        let itemArray: unknown = parsed;
        if (!Array.isArray(parsed) && parsed !== null && typeof parsed === 'object') {
          const obj = parsed as Record<string, unknown>;
          itemArray = obj['items'] ?? obj['playbook'] ?? obj['tasks'] ?? obj['data'] ?? null;
          if (!Array.isArray(itemArray)) {
            // Last resort: grab the first array-valued key
            itemArray = Object.values(obj).find((v) => Array.isArray(v)) ?? null;
          }
        }
        if (Array.isArray(itemArray)) {
          playbookItems = (itemArray as Record<string, unknown>[]).map((item) => ({
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
    } catch (error) {
      logger.warn('OpenRouter not available for playbook generation', {
        userId: uid,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (playbookItems.length === 0) {
      logger.warn('Playbook generation returned no AI items; refusing template fallback', {
        userId: uid,
        goalCount: agentGoals.length,
        rawLlmOutput: (llmRawContent ?? '').slice(0, 500),
      });
      throw new Error('AI playbook generation unavailable');
    }

    const generatedAt = new Date().toISOString();

    // Persist and prune old playbooks (keep last 10)
    const playbooksRef = db.collection('Users').doc(uid).collection('agent_playbooks');
    const playbookRef = playbooksRef.doc(); // pre-allocate ID so goal_history can reference it
    await playbookRef.set({
      items: playbookItems,
      goals: agentGoals,
      generatedAt,
      role,
      source: 'llm',
    });

    // ── Auto-archive active goals to goal_history ─────────────────────────
    // Each time a new playbook is generated we snapshot the goals that drove
    // it.  If a goal_history record already exists for this goal ID we update
    // it with the latest playbookId so the history stays current without
    // duplicating.  We do NOT remove the goal from agentGoals here — users
    // keep their goals active across multiple playbook cycles.
    try {
      const goalHistoryRef = db.collection('Users').doc(uid).collection('goal_history');
      const goalBatch = db.batch();
      for (const goal of agentGoals) {
        const historyDocRef = goalHistoryRef.doc(goal.id);
        const existing = await historyDocRef.get();
        if (existing.exists) {
          // Update the latest playbook reference and bump lastSeenAt
          goalBatch.update(historyDocRef, {
            // Keep metadata in sync if user edited the goal label/category
            text: goal.text,
            category: goal.category,
            ...(goal.icon ? { icon: goal.icon } : {}),
            latestPlaybookId: playbookRef.id,
            lastSeenAt: generatedAt,
            playbookCount: (existing.data()?.['playbookCount'] ?? 0) + 1,
            // Reset item counters for the new playbook cycle
            itemsTotal: playbookItems.filter((item) => item.goal?.id === goal.id).length,
            itemsCompleted: 0,
            isCompleted: false,
            completedAt: null,
          });
        } else {
          // First time this goal has driven a playbook — create the record
          const itemsForGoal = playbookItems.filter((item) => item.goal?.id === goal.id).length;
          goalBatch.set(historyDocRef, {
            id: goal.id,
            goalId: goal.id,
            text: goal.text,
            category: goal.category,
            ...(goal.icon ? { icon: goal.icon } : {}),
            createdAt: goal.createdAt ?? generatedAt,
            latestPlaybookId: playbookRef.id,
            firstSeenAt: generatedAt,
            lastSeenAt: generatedAt,
            playbookCount: 1,
            itemsTotal: itemsForGoal,
            itemsCompleted: 0,
            role,
            isCompleted: false,
          });
        }

        // ── Append immutable cycle record ──────────────────────────────────
        // One doc per playbook generation — never overwritten, gives full
        // audit trail of exactly which items ran toward this goal each cycle.
        const cycleRef = historyDocRef.collection('cycles').doc(playbookRef.id);
        const goalItemsThisCycle = playbookItems.filter((item) => item.goal?.id === goal.id);
        goalBatch.set(cycleRef, {
          playbookId: playbookRef.id,
          generatedAt,
          itemsTotal: goalItemsThisCycle.length,
          itemsCompleted: 0,
          isCompleted: false,
          completedAt: null,
          completedItems: [],
          pendingItems: goalItemsThisCycle.map((i) => ({ id: i.id, title: i.title })),
        });
      }
      await goalBatch.commit();
      logger.info('Goal history auto-archived', { userId: uid, goalCount: agentGoals.length });
    } catch (historyErr) {
      // Non-critical — playbook was already saved, just log the warning
      logger.warn('Failed to auto-archive goal history', {
        userId: uid,
        error: historyErr instanceof Error ? historyErr.message : String(historyErr),
      });
    }

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

    // Notify user that their Action Plan / Playbook is ready
    try {
      const { dispatch } = await import('../../../services/notification.service.js');
      const { NOTIFICATION_TYPES } = await import('@nxt1/core');

      // ── Build personalized notification copy ──────────────────────────
      // Derive the primary goal name from whichever goal has the most items
      const goalItemCounts = new Map<string, { text: string; count: number }>();
      for (const item of playbookItems) {
        if (item.goal?.id && item.goal?.label) {
          const existing = goalItemCounts.get(item.goal.id);
          goalItemCounts.set(item.goal.id, {
            text: item.goal.label,
            count: (existing?.count ?? 0) + 1,
          });
        }
      }
      const primaryGoal = [...goalItemCounts.values()].sort((a, b) => b.count - a.count)[0];

      // Notification title: goal-aware or fallback
      const notifTitle = primaryGoal
        ? `Your ${primaryGoal.text} plan is ready`
        : '🗂 Your Weekly Playbook is Ready';

      // Body: top 2 action titles as a teaser + total count
      const topActions = playbookItems.slice(0, 2).map((i) => i.title);
      const teaser =
        topActions.length > 0
          ? topActions.join(' · ') +
            (playbookItems.length > 2 ? ` +${playbookItems.length - 2} more` : '')
          : `${playbookItems.length} action items ready`;

      await dispatch(db, {
        userId: uid,
        type: NOTIFICATION_TYPES.AGENT_ACTION,
        title: notifTitle,
        body: teaser,
        deepLink: '/agent-x?tab=playbook',
        data: {
          operationId: operationId || 'playbook-gen',
          tab: 'playbook',
        },
        source: { userName: 'Agent X' },
        metadata: {
          agentId: 'playbook_planner',
          resultTitle: notifTitle,
          resultSummary: teaser,
          operationId: operationId || 'playbook-gen',
          mode: 'playbook',
        },
      });
    } catch (notifErr) {
      logger.warn('Failed to dispatch playbook generation notification', {
        userId: uid,
        error: notifErr instanceof Error ? notifErr.message : String(notifErr),
      });
    }

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
    dbOverride?: Firestore,
    operationId?: string
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
    const primarySport = resolvePrimarySport(userData);
    const promptContextText = await this.buildPromptContextText(
      uid,
      this.buildPlanningMemoryQuery('briefing', role, primarySport, agentGoals),
      db
    );
    const planningScaffolding = this.buildPlanningScaffolding(primarySport, userData);

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
        .limit(5)
        .get();

      const recentRealPlaybook = recentBriefings.docs.find((doc) => {
        const items = (doc.data()['items'] ?? []) as ShellWeeklyPlaybookItem[];
        return !isLegacyFallbackPlaybook(items);
      });

      if (recentRealPlaybook) {
        const items = (recentRealPlaybook.data()['items'] ?? []) as ShellWeeklyPlaybookItem[];
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

    // ── Fetch recently completed goals (last 7 days) ─────────────────────
    let completedGoalsText = '';
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const completedGoalsSnap = await db
        .collection('Users')
        .doc(uid)
        .collection('goal_history')
        .where('isCompleted', '==', true)
        .where('completedAt', '>=', sevenDaysAgo)
        .orderBy('completedAt', 'desc')
        .limit(3)
        .get();

      if (!completedGoalsSnap.empty) {
        const names = completedGoalsSnap.docs.map((d) => `• ${String(d.data()['text'] ?? '')}`);
        completedGoalsText = `\n\nRecently completed goals:\n${names.join('\n')}`;
      }
    } catch {
      // Non-critical — continue without completed goals
    }

    // ── Build LLM prompt ────────────────────────────────────────────────
    const promptLines = [
      `You are Agent X, the AI-powered sports assistant for NXT1. Generate a concise, hyper-personalized daily briefing.`,
      ``,
      `═══ USER CONTEXT (RAG PROFILE + MEMORY) ═══`,
      promptContextText,
      planningScaffolding,
      ``,
      `═══ USER'S GOALS ═══`,
      goalsText,
      recentActivityText,
      completedGoalsText,
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
      const llm = this.getOrCreateLlmService();
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
          ...(operationId
            ? { telemetryContext: { operationId, userId: uid, agentId: 'general' as const } }
            : {}),
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

    // Notify user that their Daily Briefing is ready
    try {
      const { dispatch } = await import('../../../services/notification.service.js');
      const { NOTIFICATION_TYPES } = await import('@nxt1/core');
      await dispatch(db, {
        userId: uid,
        type: NOTIFICATION_TYPES.AGENT_ACTION,
        title: 'Your Daily Briefing is Ready',
        body:
          briefingPreviewText ||
          `Agent X prepared ${briefingInsights.length} insights for your day.`,
        deepLink: '/agent-x',
        data: {
          operationId: 'briefing-gen',
        },
        source: { userName: 'Agent X' },
        metadata: {
          agentId: 'daily_briefing',
          resultTitle: 'Your Daily Briefing is Ready',
          resultSummary:
            briefingPreviewText ||
            `Agent X prepared ${briefingInsights.length} insights for your day.`,
          operationId: 'briefing-gen',
          mode: 'briefing',
        },
      });
    } catch (notifErr) {
      logger.warn('Failed to dispatch briefing generation notification', {
        userId: uid,
        error: notifErr instanceof Error ? notifErr.message : String(notifErr),
      });
    }

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
  /**
   * Generate a fresh daily briefing for a user.
   * Called by the 8 AM daily cron and after a profile sync delta.
   * Skips if a briefing was already generated within the last 20 hours
   * (prevents Cloud Scheduler retries from billing duplicate LLM calls).
   */
  async generateDailyBriefing(uid: string): Promise<void> {
    const userDoc = await this.db.collection('Users').doc(uid).get();
    const userData = userDoc.data() ?? {};
    const agentGoals = (userData['agentGoals'] ?? []) as AgentDashboardGoal[];

    if (agentGoals.length === 0) {
      logger.info('Skipping daily briefing generation — no goals set', { userId: uid });
      return;
    }

    // Dedup guard: skip if briefing already generated within the last 20 hours
    const lastBriefingAt = userData['agentBriefingGeneratedAt'] as Timestamp | undefined;
    if (lastBriefingAt) {
      const hoursSinceLast = (Date.now() - lastBriefingAt.toMillis()) / (1000 * 60 * 60);
      if (hoursSinceLast < 20) {
        logger.info('Skipping daily briefing generation — already generated recently', {
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
      .update({ agentBriefingGeneratedAt: FieldValue.serverTimestamp() })
      .catch(() => {
        /* non-critical */
      });

    try {
      await this.generateBriefing(uid, true);
    } catch (err) {
      logger.error('Daily briefing generation failed', {
        userId: uid,
        error: String(err),
      });
    }
  }

  /**
   * Generate a fresh weekly action plan (playbook) for a user.
   * Called by the Monday 8 AM cron, when goals change, or when
   * the user completes all current playbook tasks.
   *
   * @param force - Skip the 144h dedup guard (used for goal-change and
   *                all-tasks-complete triggers where we always want a fresh plan)
   */
  async generateWeeklyPlaybook(uid: string, force = false): Promise<void> {
    const userDoc = await this.db.collection('Users').doc(uid).get();
    const userData = userDoc.data() ?? {};
    const agentGoals = (userData['agentGoals'] ?? []) as AgentDashboardGoal[];

    if (agentGoals.length === 0) {
      logger.info('Skipping weekly playbook generation — no goals set', { userId: uid });
      return;
    }

    if (!force) {
      // Dedup guard: skip if playbook was generated within the last 6 days (144h).
      // The 24h buffer under 168h accounts for scheduler jitter across timezones.
      const lastPlaybookAt = userData['agentPlaybookGeneratedAt'] as Timestamp | undefined;
      if (lastPlaybookAt) {
        const hoursSinceLast = (Date.now() - lastPlaybookAt.toMillis()) / (1000 * 60 * 60);
        if (hoursSinceLast < 144) {
          logger.info('Skipping weekly playbook generation — already generated recently', {
            userId: uid,
            hoursSinceLast: Math.round(hoursSinceLast),
          });
          return;
        }
      }
    }

    // Stamp before generating so concurrent retries also bail out
    await this.db
      .collection('Users')
      .doc(uid)
      .update({ agentPlaybookGeneratedAt: FieldValue.serverTimestamp() })
      .catch(() => {
        /* non-critical */
      });

    try {
      await this.generatePlaybook(uid);
    } catch (err) {
      logger.error('Weekly playbook generation failed', {
        userId: uid,
        error: String(err),
      });
    }
  }

  /**
   * Generate a personalized playbook progress nudge notification copy for a user.
   *
   * Agent X reads the user's compressed context (goals, profile, season) plus their
   * live playbook progress and writes a short, punchy push notification — no hardcoded
   * templates. Uses the `fast` LLM tier (cheap, ~200ms) since it's just two strings.
   *
   * @returns `{ title, body }` strings for the push notification, or null if the user
   *          has no active playbook this week.
   */
  async generatePlaybookNudge(
    uid: string,
    db: Firestore
  ): Promise<{ title: string; body: string } | null> {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const weekAgoIso = new Date(Date.now() - WEEK_MS).toISOString();

    // ── 1. Load latest playbook for this week ──────────────────────────
    const playbookSnap = await db
      .collection('Users')
      .doc(uid)
      .collection('agent_playbooks')
      .where('generatedAt', '>=', weekAgoIso)
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    if (playbookSnap.empty) return null;

    const items = (playbookSnap.docs[0].data()['items'] ?? []) as Array<{
      status?: string;
      title?: string;
      goal?: { label?: string };
    }>;

    if (items.length === 0) return null;

    // ── 2. Compute live progress ────────────────────────────────────────
    const done = items.filter((i) => i.status === 'complete').length;
    const snoozed = items.filter((i) => i.status === 'snoozed').length;
    const remaining = items.filter((i) => i.status !== 'complete' && i.status !== 'snoozed').length;
    const total = items.length;

    const nextTask = items.find((i) => i.status !== 'complete' && i.status !== 'snoozed');
    const goalLabels = [
      ...new Set(items.map((i) => i.goal?.label).filter((l): l is string => Boolean(l))),
    ].slice(0, 3);

    // ── 3. Build compressed user context (goals, profile, season) ──────
    let profileContext = '';
    try {
      profileContext = await this.buildPromptContextText(uid, 'playbook progress nudge', db);
    } catch {
      // Non-critical — continue with just playbook data
    }

    // ── 4. Call LLM at fast tier ────────────────────────────────────────
    const prompt = [
      `You are Agent X — a relentless AI sports assistant. Your job is to send a short push notification to a user to re-engage them with their weekly action plan.`,
      ``,
      `USER CONTEXT:`,
      profileContext || '(profile not available)',
      ``,
      `PLAYBOOK PROGRESS THIS WEEK:`,
      `- Total tasks: ${total}`,
      `- Done: ${done}`,
      `- Remaining: ${remaining}`,
      `- Snoozed: ${snoozed}`,
      goalLabels.length > 0 ? `- Goals in focus: ${goalLabels.join(', ')}` : '',
      nextTask?.title ? `- Next pending task: "${nextTask.title}"` : '',
      ``,
      `Write a push notification that sounds exactly like Agent X checking in on them personally — not a generic reminder. Reference their actual goal or next task. Be direct, motivating, action-oriented. Max 60 chars for title, max 100 chars for body.`,
      ``,
      `Return ONLY valid JSON: { "title": "...", "body": "..." }`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const llm = this.getOrCreateLlmService();
      const llmResult = await llm.complete(
        [
          {
            role: 'system',
            content:
              'You are Agent X, a hyper-personalized AI sports assistant. Return only valid JSON. Be specific to this user — never generic.',
          },
          { role: 'user', content: prompt },
        ],
        {
          tier: 'copywriting',
          maxTokens: 120,
          temperature: 0.8,
          jsonMode: true,
        }
      );

      const parsed = JSON.parse(stripMarkdownFences(llmResult.content ?? '')) as {
        title?: string;
        body?: string;
      };

      const title = String(parsed.title ?? '')
        .trim()
        .slice(0, 80);
      const body = String(parsed.body ?? '')
        .trim()
        .slice(0, 150);

      if (title && body) return { title, body };
    } catch (err) {
      logger.warn('generatePlaybookNudge: LLM failed, skipping user', {
        userId: uid,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return null;
  }
}
