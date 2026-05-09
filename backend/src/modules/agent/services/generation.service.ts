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
import type {
  AgentDashboardGoal,
  AgentIdentifier,
  ShellActionChip,
  ShellBriefingInsight,
  ShellWeeklyPlaybookItem,
} from '@nxt1/core';
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
import type { LLMCompletionOptions, LLMMessage } from '../llm/llm.types.js';
import { resolveStructuredOutput } from '../llm/structured-output.js';
import { z } from 'zod';
import {
  getAgentAppConfig,
  resolveConfiguredCoordinatorsForRole,
} from '../config/agent-app-config.js';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';
import { dispatchAgentPush } from './agent-push-adapter.service.js';
import { getAgentToolPolicy } from '../agents/tool-policy.js';
import {
  getPlaybookTargetGoalItemCount,
  getPlaybookTargetItemCount,
  normalizeGeneratedPlaybookItems,
} from './playbook-shape.util.js';

// ─── Shared Helpers ─────────────────────────────────────────────────────────

const playbookGoalSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
});

const playbookCoordinatorSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  icon: z.string().optional(),
});

const playbookItemSchema = z.object({
  id: z.string().optional(),
  weekLabel: z.string().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  why: z.string().optional(),
  details: z.string().optional(),
  actionLabel: z.string().optional(),
  goal: playbookGoalSchema.optional(),
  coordinator: playbookCoordinatorSchema.optional(),
});

const playbookResponseSchema = z.object({
  notificationTitle: z.string().optional(),
  notificationBody: z.string().optional(),
  items: z.array(playbookItemSchema),
});

const briefingInsightSchema = z.object({
  id: z.string().optional(),
  text: z.string().optional(),
  icon: z.string().optional(),
  type: z.enum(['info', 'warning', 'success']).optional(),
});

const briefingResponseSchema = z.object({
  previewText: z.string().optional(),
  insights: z.array(briefingInsightSchema).optional(),
});

const playbookNudgeResponseSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
});

const suggestedActionItemSchema = z.object({
  actionId: z.string().optional(),
  label: z.string().optional(),
  subLabel: z.string().optional(),
  icon: z.string().optional(),
  promptText: z.string().optional(),
});

const suggestedActionCoordinatorSchema = z.object({
  coordinatorId: z.string().optional(),
  actions: z.array(suggestedActionItemSchema).optional(),
});

const suggestedActionsResponseSchema = z.object({
  coordinators: z.array(suggestedActionCoordinatorSchema).optional(),
});

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

interface SuggestedActionsGenerationResult {
  coordinators: ReadonlyArray<{
    coordinatorId: string;
    actions: readonly ShellActionChip[];
  }>;
  generatedAt: string;
}

function getSundayWeekKey(now: Date = new Date()): string {
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  return weekStart.toISOString().slice(0, 10);
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildSuggestedActionPromptText(params: {
  readonly coordinatorLabel: string;
  readonly coordinatorDescription: string;
  readonly actionLabel: string;
  readonly actionDescription?: string;
}): string {
  const detail = trimToNull(params.actionDescription) ?? params.coordinatorDescription;
  return [
    `Please handle ${params.actionLabel} with the ${params.coordinatorLabel}.`,
    detail,
    'Give me the clearest deliverable, priorities, and next steps to act on immediately.',
  ]
    .filter(Boolean)
    .join(' ');
}

// ─── Generation Service ─────────────────────────────────────────────────────

export class AgentGenerationService {
  /**
   * Optional telemetry-wired LLM instance injected from bootstrap.
   * When provided, all LLM calls accumulate cost in the job-cost-tracker
   * (keyed by operationId) so billing deduction can pick them up.
   * When absent, falls back to creating a blind instance (legacy behavior).
   */
  private readonly firestore?: Firestore;
  private readonly llmService?: OpenRouterService;
  private readonly injectedContextBuilder?: ContextBuilder;
  private ownedLlmService?: OpenRouterService;
  private ownedLlmServiceFirestore?: Firestore;
  private ownedContextBuilder?: ContextBuilder;
  private ownedContextBuilderFirestore?: Firestore;

  constructor(
    llmService?: OpenRouterService,
    contextBuilder?: ContextBuilder,
    firestore?: Firestore
  ) {
    this.firestore = firestore;
    this.llmService = llmService;
    this.injectedContextBuilder = contextBuilder;
  }

  private get db(): Firestore {
    return this.firestore ?? getFirestore();
  }

  /** Return a Firestore reference, preferring an explicit override. */
  private resolveDb(dbOverride?: Firestore): Firestore {
    return dbOverride ?? this.db;
  }

  private getOrCreateLlmService(dbOverride?: Firestore): OpenRouterService {
    if (this.llmService) return this.llmService;
    const db = this.resolveDb(dbOverride);
    if (!this.ownedLlmService || this.ownedLlmServiceFirestore !== db) {
      this.ownedLlmService = new OpenRouterService({ firestore: db });
      this.ownedLlmServiceFirestore = db;
    }
    return this.ownedLlmService;
  }

  private getOrCreateContextBuilder(dbOverride?: Firestore): ContextBuilder {
    if (this.injectedContextBuilder) return this.injectedContextBuilder;
    const db = this.resolveDb(dbOverride);
    if (!this.ownedContextBuilder || this.ownedContextBuilderFirestore !== db) {
      this.ownedContextBuilder = new ContextBuilder(
        new VectorMemoryService(this.getOrCreateLlmService(db))
      );
      this.ownedContextBuilderFirestore = db;
    }
    return this.ownedContextBuilder;
  }

  private async buildPromptContextText(uid: string, query: string, db: Firestore): Promise<string> {
    try {
      const builder = this.getOrCreateContextBuilder(db);
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
    mode: 'playbook' | 'briefing' | 'suggested-actions',
    role: string,
    primarySport: string | null,
    goals: readonly AgentDashboardGoal[]
  ): string {
    const goalText = goals
      .map((goal) => goal.text.trim())
      .filter(Boolean)
      .join(' | ');

    return [
      mode === 'playbook'
        ? 'weekly playbook planning'
        : mode === 'briefing'
          ? 'daily briefing planning'
          : 'weekly suggested actions planning',
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

  private async generateStructuredPayload<T>(
    messages: readonly LLMMessage[],
    options: LLMCompletionOptions<T>,
    schema: z.ZodType<T>,
    label: string,
    dbOverride?: Firestore
  ): Promise<{ parsed: T; rawContent: string | null }> {
    const llmResult = await this.getOrCreateLlmService(dbOverride).complete(messages, options);
    return {
      parsed: resolveStructuredOutput(llmResult, schema, `${label} generation`),
      rawContent: llmResult.content ?? null,
    };
  }

  private async saveGeneratedPlaybook(
    uid: string,
    db: Firestore,
    payload: {
      readonly items: ShellWeeklyPlaybookItem[];
      readonly goals: AgentDashboardGoal[];
      readonly generatedAt: string;
      readonly role: string;
    }
  ): Promise<void> {
    const playbooksRef = db.collection('Users').doc(uid).collection('agent_playbooks');
    const playbookRef = playbooksRef.doc();
    await playbookRef.set({
      items: payload.items,
      goals: payload.goals,
      generatedAt: payload.generatedAt,
      role: payload.role,
      source: 'llm',
    });

    try {
      const goalHistoryRef = db.collection('Users').doc(uid).collection('goal_history');
      const goalBatch = db.batch();
      for (const goal of payload.goals) {
        const historyDocRef = goalHistoryRef.doc(goal.id);
        const existing = await historyDocRef.get();
        if (existing.exists) {
          goalBatch.update(historyDocRef, {
            text: goal.text,
            category: goal.category,
            ...(goal.icon ? { icon: goal.icon } : {}),
            latestPlaybookId: playbookRef.id,
            lastSeenAt: payload.generatedAt,
            playbookCount: (existing.data()?.['playbookCount'] ?? 0) + 1,
            itemsTotal: payload.items.filter((item) => item.goal?.id === goal.id).length,
            itemsCompleted: 0,
            isCompleted: false,
            completedAt: null,
          });
        } else {
          const itemsForGoal = payload.items.filter((item) => item.goal?.id === goal.id).length;
          goalBatch.set(historyDocRef, {
            id: goal.id,
            goalId: goal.id,
            text: goal.text,
            category: goal.category,
            ...(goal.icon ? { icon: goal.icon } : {}),
            createdAt: goal.createdAt ?? payload.generatedAt,
            latestPlaybookId: playbookRef.id,
            firstSeenAt: payload.generatedAt,
            lastSeenAt: payload.generatedAt,
            playbookCount: 1,
            itemsTotal: itemsForGoal,
            itemsCompleted: 0,
            role: payload.role,
            isCompleted: false,
          });
        }

        const cycleRef = historyDocRef.collection('cycles').doc(playbookRef.id);
        const goalItemsThisCycle = payload.items.filter((item) => item.goal?.id === goal.id);
        goalBatch.set(cycleRef, {
          playbookId: playbookRef.id,
          generatedAt: payload.generatedAt,
          itemsTotal: goalItemsThisCycle.length,
          itemsCompleted: 0,
          isCompleted: false,
          completedAt: null,
          completedItems: [],
          pendingItems: goalItemsThisCycle.map((item) => ({ id: item.id, title: item.title })),
        });
      }
      await goalBatch.commit();
      logger.info('Goal history auto-archived', { userId: uid, goalCount: payload.goals.length });
    } catch (historyErr) {
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
  }

  private async saveGeneratedBriefing(
    uid: string,
    db: Firestore,
    payload: {
      readonly previewText: string;
      readonly insights: ShellBriefingInsight[];
      readonly generatedAt: string;
      readonly role: string;
    }
  ): Promise<void> {
    const briefingsRef = db.collection('Users').doc(uid).collection('agent_briefings');
    await briefingsRef.add({
      previewText: payload.previewText,
      insights: payload.insights,
      generatedAt: payload.generatedAt,
      role: payload.role,
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
  }

  private async saveGeneratedSuggestedActions(
    uid: string,
    db: Firestore,
    payload: {
      readonly generatedAt: string;
      readonly role: string;
      readonly weekKey: string;
      readonly coordinators: ReadonlyArray<{
        coordinatorId: string;
        actions: readonly ShellActionChip[];
      }>;
      readonly source: 'llm' | 'fallback';
    }
  ): Promise<void> {
    const suggestedActionsRef = db
      .collection('Users')
      .doc(uid)
      .collection('agent_suggested_actions');
    await suggestedActionsRef.doc(payload.weekKey).set({
      generatedAt: payload.generatedAt,
      role: payload.role,
      weekKey: payload.weekKey,
      source: payload.source,
      coordinators: payload.coordinators,
    });

    try {
      const allDocs = await suggestedActionsRef.orderBy('generatedAt', 'desc').get();
      const toDelete = allDocs.docs.slice(8);
      await Promise.all(toDelete.map((doc) => doc.ref.delete()));
    } catch (pruneErr) {
      logger.warn('Failed to prune old suggested action documents', {
        userId: uid,
        error: pruneErr instanceof Error ? pruneErr.message : String(pruneErr),
      });
    }
  }

  async generateWeeklySuggestedActions(
    uid: string,
    force = false,
    dbOverride?: Firestore
  ): Promise<SuggestedActionsGenerationResult | null> {
    const db = this.resolveDb(dbOverride);
    const userDoc = await db.collection('Users').doc(uid).get();
    const userData = userDoc.data() ?? {};
    const role = String(userData['role'] ?? 'athlete');

    if (!['athlete', 'coach', 'director'].includes(role)) {
      logger.info('Skipping weekly suggested actions generation — unsupported role', {
        userId: uid,
        role,
      });
      return null;
    }

    if (!force) {
      const lastActiveAt = userData['agentXLastActiveAt'] as Timestamp | undefined;
      if (!lastActiveAt) {
        logger.info('Skipping weekly suggested actions generation — no recent Agent X activity', {
          userId: uid,
        });
        return null;
      }

      const activityAgeHours = (Date.now() - lastActiveAt.toMillis()) / (1000 * 60 * 60);
      if (activityAgeHours > 24 * 7) {
        logger.info('Skipping weekly suggested actions generation — activity is stale', {
          userId: uid,
          activityAgeHours: Math.round(activityAgeHours),
        });
        return null;
      }

      const lastGeneratedAt = userData['agentSuggestedActionsGeneratedAt'] as Timestamp | undefined;
      if (lastGeneratedAt) {
        const hoursSinceLast = (Date.now() - lastGeneratedAt.toMillis()) / (1000 * 60 * 60);
        if (hoursSinceLast < 144) {
          logger.info('Skipping weekly suggested actions generation — already generated recently', {
            userId: uid,
            hoursSinceLast: Math.round(hoursSinceLast),
          });
          return null;
        }
      }
    }

    await db
      .collection('Users')
      .doc(uid)
      .set({ agentSuggestedActionsGeneratedAt: FieldValue.serverTimestamp() }, { merge: true })
      .catch(() => {
        /* non-critical */
      });

    const agentGoals = (userData['agentGoals'] ?? []) as AgentDashboardGoal[];
    const primarySport = resolvePrimarySport(userData);
    const planningScaffolding = this.buildPlanningScaffolding(primarySport, userData);
    const appConfig = await getAgentAppConfig(db);
    const coordinators = resolveConfiguredCoordinatorsForRole(role, appConfig);

    if (coordinators.length === 0) {
      logger.info('Skipping weekly suggested actions generation — no coordinators resolved', {
        userId: uid,
        role,
      });
      return null;
    }

    const [promptContextText, latestPlaybookText, latestBriefingText] = await Promise.all([
      this.buildPromptContextText(
        uid,
        this.buildPlanningMemoryQuery('suggested-actions', role, primarySport, agentGoals),
        db
      ),
      (async (): Promise<string> => {
        try {
          const latestPlaybook = await db
            .collection('Users')
            .doc(uid)
            .collection('agent_playbooks')
            .orderBy('generatedAt', 'desc')
            .limit(1)
            .get();

          if (latestPlaybook.empty) return '';
          const items = (latestPlaybook.docs[0].data()['items'] ?? []) as ShellWeeklyPlaybookItem[];
          if (items.length === 0) return '';
          return `Recent weekly playbook tasks:\n${items
            .slice(0, 5)
            .map((item) => `- ${item.title}: ${item.summary}`)
            .join('\n')}`;
        } catch {
          return '';
        }
      })(),
      (async (): Promise<string> => {
        try {
          const latestBriefing = await db
            .collection('Users')
            .doc(uid)
            .collection('agent_briefings')
            .orderBy('generatedAt', 'desc')
            .limit(1)
            .get();

          if (latestBriefing.empty) return '';
          const previewText = trimToNull(latestBriefing.docs[0].data()['previewText']);
          return previewText ? `Latest daily briefing focus: ${previewText}` : '';
        } catch {
          return '';
        }
      })(),
    ]);

    const coordinatorPrompt = coordinators
      .map((coordinator) => {
        const tools = getAgentToolPolicy(coordinator.id as AgentIdentifier);
        const quickPrompts = coordinator.commands
          .map((action) => `${action.label}${action.subLabel ? ` — ${action.subLabel}` : ''}`)
          .join(' | ');
        const scheduled = (coordinator.scheduledActions ?? [])
          .map((action) => `${action.label}${action.subLabel ? ` — ${action.subLabel}` : ''}`)
          .join(' | ');

        return [
          `Coordinator: ${coordinator.label} (${coordinator.id})`,
          `Description: ${coordinator.description}`,
          `Available tools: ${tools.length > 0 ? tools.join(', ') : 'No special tools'}`,
          `Existing quick prompts: ${quickPrompts || 'None'}`,
          `Existing scheduled actions: ${scheduled || 'None'}`,
        ].join('\n');
      })
      .join('\n\n');

    const goalsText =
      agentGoals.length > 0
        ? agentGoals.map((goal) => `- ${goal.text}`).join('\n')
        : '- No goals set yet';

    const prompt = [
      'You are Agent X creating weekly personalized suggested actions for coordinator panels.',
      'Generate custom actions for the next 7 days only.',
      "Every action must feel personalized to the user's real context, goals, recent activity, role, and season.",
      'Do not output generic placeholder ideas.',
      '',
      'USER CONTEXT',
      promptContextText,
      planningScaffolding,
      latestPlaybookText,
      latestBriefingText,
      '',
      'ACTIVE GOALS',
      goalsText,
      '',
      'COORDINATORS',
      coordinatorPrompt,
      '',
      'OUTPUT RULES',
      `Return a JSON object with a "coordinators" array containing EXACTLY ${coordinators.length} entries, one per coordinator listed above.`,
      'For each coordinator entry:',
      '- Set "coordinatorId" to the exact coordinator id from the prompt.',
      '- Return EXACTLY 3 actions in "actions".',
      '- Each action must include:',
      '  - "actionId": a unique slug-like id',
      '  - "label": a concise title under 42 characters',
      '  - "subLabel": one-sentence explanation under 90 characters',
      '  - "icon": a relevant icon name',
      '  - "promptText": a full ready-to-run request written as if the user is asking Agent X directly',
      "- The promptText must align with the coordinator's available tools and never claim work is already complete.",
      '- Avoid simply copying the static quick prompt labels unless the user context clearly demands it.',
      'Return only JSON. No markdown fences.',
    ]
      .filter(Boolean)
      .join('\n');

    let source: 'llm' | 'fallback' = 'fallback';
    let parsedResult: z.infer<typeof suggestedActionsResponseSchema> | null = null;

    try {
      const { parsed } = await this.generateStructuredPayload(
        [
          {
            role: 'system',
            content:
              'You are Agent X. Return only valid JSON. Build weekly suggested actions that are deeply personalized, tool-aware, and immediately actionable.',
          },
          { role: 'user', content: prompt },
        ],
        {
          tier: 'extraction',
          maxTokens: 2400,
          temperature: 0.4,
          outputSchema: {
            name: 'agent_weekly_suggested_actions',
            schema: suggestedActionsResponseSchema,
          },
        },
        suggestedActionsResponseSchema,
        'Suggested actions',
        db
      );
      parsedResult = parsed;
      source = 'llm';
    } catch (error) {
      logger.warn('Weekly suggested action generation fell back to config-backed prompts', {
        userId: uid,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const parsedByCoordinator = new Map<
      string,
      readonly z.infer<typeof suggestedActionItemSchema>[]
    >();
    for (const entry of parsedResult?.coordinators ?? []) {
      const coordinatorId = trimToNull(entry.coordinatorId);
      if (!coordinatorId) continue;
      parsedByCoordinator.set(coordinatorId, entry.actions ?? []);
    }

    const normalizedCoordinators = coordinators.map((coordinator) => {
      const parsedActions = parsedByCoordinator.get(coordinator.id) ?? [];
      const actionPool = [...coordinator.commands, ...(coordinator.scheduledActions ?? [])];
      const selectedActions: ShellActionChip[] = [];
      const seenLabels = new Set<string>();

      for (let index = 0; index < parsedActions.length && selectedActions.length < 3; index += 1) {
        const item = parsedActions[index];
        const label = trimToNull(item.label);
        const promptText = trimToNull(item.promptText);
        if (!label || !promptText) continue;

        const normalizedLabel = label.toLowerCase();
        if (seenLabels.has(normalizedLabel)) continue;
        seenLabels.add(normalizedLabel);

        selectedActions.push({
          id:
            trimToNull(item.actionId) ??
            `${coordinator.id}-suggested-${selectedActions.length + 1}`,
          label,
          subLabel: trimToNull(item.subLabel) ?? undefined,
          icon: trimToNull(item.icon) ?? coordinator.icon,
          promptText,
        });
      }

      for (const fallbackAction of actionPool) {
        if (selectedActions.length >= 3) break;
        const normalizedLabel = fallbackAction.label.trim().toLowerCase();
        if (seenLabels.has(normalizedLabel)) continue;
        seenLabels.add(normalizedLabel);

        selectedActions.push({
          id: `${coordinator.id}-suggested-${selectedActions.length + 1}`,
          label: fallbackAction.label,
          subLabel: fallbackAction.subLabel,
          icon: fallbackAction.icon,
          promptText:
            fallbackAction.promptText ??
            buildSuggestedActionPromptText({
              coordinatorLabel: coordinator.label,
              coordinatorDescription: coordinator.description,
              actionLabel: fallbackAction.label,
              actionDescription: fallbackAction.subLabel,
            }),
        });
      }

      return {
        coordinatorId: coordinator.id,
        actions: selectedActions.slice(0, 3),
      };
    });

    const generatedAt = new Date().toISOString();
    const weekKey = getSundayWeekKey();

    await this.saveGeneratedSuggestedActions(uid, db, {
      generatedAt,
      role,
      weekKey,
      coordinators: normalizedCoordinators,
      source,
    });

    logger.info('Weekly suggested actions generated', {
      userId: uid,
      role,
      coordinatorCount: normalizedCoordinators.length,
      source,
    });

    return {
      coordinators: normalizedCoordinators,
      generatedAt,
    };
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
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        'Set at least one goal before generating a playbook'
      );
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

    const agentConfig = await getAgentAppConfig(db);
    const coordinatorsList = agentConfig.coordinators
      .map((c) => `- id: "${c.id}", label: "${c.name}", icon: "${c.icon ?? 'sparkles'}"`)
      .join('\n');
    const totalPlaybookItems = getPlaybookTargetItemCount(agentGoals.length);
    const totalGoalItems = getPlaybookTargetGoalItemCount(agentGoals.length);

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
      `Return a JSON object (no markdown fences) with three keys:`,
      `- "notificationTitle": A short, exciting push notification title (max 60 chars) the user will receive when their playbook is ready. Personalize it — reference their primary goal or sport. Example: "Your Film Study plan is ready" or "Your recruiting push starts now".`,
      `- "notificationBody": A preview body for the notification (max 100 chars). Tease the top 1-2 tasks by name separated by " · ". Example: "Film review session · Send 3 coach emails".`,
      `- "items": a JSON array of EXACTLY ${totalPlaybookItems} playbook items split into TWO categories:`,
      ``,
      `CATEGORY 1 — RECURRING HABITS (exactly 2 items):`,
      `  These are routine maintenance tasks from the habits menu above.`,
      `  Set "goal" to: { "id": "recurring", "label": "Weekly Tasks" }`,
      `  Set "weekLabel" to "Weekly".`,
      ``,
      `CATEGORY 2 — GOAL EXECUTION (exactly ${totalGoalItems} items):`,
      `  These are unique, high-impact strategic tasks tied to the user's specific goals.`,
      `  For EACH active user goal listed above, return EXACTLY 2 items tied to that goal.`,
      `  Set "goal" to: { "id": "<real goal id>", "label": "<goal text (max 30 chars)>" }`,
      `  Set "weekLabel" to a specific day ("Mon", "Tue", "Wed", "Thu", "Fri").`,
      ``,
      `Each item must have:`,
      `- "id": unique string like "wp-1"`,
      `- "weekLabel": "Weekly" for recurring habits, or a day abbreviation for goal tasks`,
      `- "title": short action title (max 50 chars)`,
      `- "summary": one-sentence description of the task`,
      `- "why": a compelling, hyper-personal reason WHY this matters — reference their specific profile data (class year, position, sport, season, team, location). Example: "As a Class of 2026 PG heading into summer AAU, this exposure window closes in 8 weeks."`,
      `- "details": detailed execution request for what Agent X should do next (future tense, action-oriented)`,
      `- "actionLabel": button text (e.g., "Review Draft", "Send Emails", "Sync Now")`,
      `- "status": always "pending"`,
      `- "goal": object with "id" and "label" as described above`,
      `- "coordinator": object with "id", "label", and "icon" from the available coordinators list above`,
      ``,
      `IMPORTANT: Return the 2 recurring items FIRST. Then return goal-execution items grouped by the active goal order shown above, with EXACTLY 2 items for each goal. Within each goal pair, order the most time-sensitive item first. The "why" field is critical — hook the user emotionally. Never produce generic advice — always ground it in their reality using their profile data. Never write "details" as if work is already completed (avoid phrases like "has prepared", "already created", "already generated").`,
      ``,
      `Return ONLY the JSON object, no markdown fences, no explanation.`,
    ]
      .filter(Boolean)
      .join('\n');

    let playbookItems: ShellWeeklyPlaybookItem[] = [];
    let llmRawContent: string | null | undefined;
    let parsedPlaybookResult: z.infer<typeof playbookResponseSchema> | null = null;

    try {
      const { parsed, rawContent } = await this.generateStructuredPayload(
        [
          {
            role: 'system',
            content:
              "You are Agent X, a hyper-personalized AI sports assistant. You deeply understand each user's role, sport, season, and goals. Return only valid JSON (object with notificationTitle, notificationBody, items array). Every task you generate must feel hand-crafted for this specific user — never generic.",
          },
          { role: 'user', content: prompt },
        ],
        {
          // Weekly playbooks are generated asynchronously and should route through
          // the automation tier rather than the interactive chat tier.
          tier: 'task_automation',
          maxTokens: 2048,
          temperature: 0.7,
          outputSchema: {
            name: 'agent_playbook_response',
            schema: playbookResponseSchema,
          },
          ...(operationId
            ? {
                telemetryContext: {
                  operationId,
                  userId: uid,
                  agentId: 'strategy_coordinator' as const,
                },
              }
            : {}),
        },
        playbookResponseSchema,
        'Playbook',
        db
      );
      llmRawContent = rawContent;
      parsedPlaybookResult = parsed;
      playbookItems = normalizeGeneratedPlaybookItems(parsed.items, agentGoals) ?? [];
    } catch (error) {
      logger.warn('OpenRouter not available for playbook generation', {
        userId: uid,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (playbookItems.length === 0) {
      logger.warn('Playbook generation returned invalid item counts; refusing template fallback', {
        userId: uid,
        goalCount: agentGoals.length,
        targetItemCount: totalPlaybookItems,
        rawLlmOutput: (llmRawContent ?? '').slice(0, 500),
      });
      throw new AgentEngineError('AGENT_SERVICE_UNAVAILABLE', 'AI playbook generation unavailable');
    }

    const generatedAt = new Date().toISOString();

    await this.saveGeneratedPlaybook(uid, db, {
      items: playbookItems,
      goals: agentGoals,
      generatedAt,
      role,
    });

    logger.info('Agent playbook generated', {
      userId: uid,
      itemCount: playbookItems.length,
      goalCount: agentGoals.length,
    });

    // Notify user that their Action Plan / Playbook is ready
    // Prefer AI-generated title/body from the LLM response; fall back to
    // goal-derived copy if the model omitted the fields.
    try {
      const llmTitle = parsedPlaybookResult?.notificationTitle;
      const llmBody = parsedPlaybookResult?.notificationBody;

      // Fallback title: derive from goal with most items
      const fallbackTitle = (() => {
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
        return primaryGoal
          ? `Your ${primaryGoal.text} plan is ready`
          : '🗂 Your Weekly Playbook is Ready';
      })();

      // Fallback body: teaser of top 2 task titles
      const fallbackBody = (() => {
        const topActions = playbookItems.slice(0, 2).map((i) => i.title);
        return topActions.length > 0
          ? topActions.join(' · ') +
              (playbookItems.length > 2 ? ` +${playbookItems.length - 2} more` : '')
          : `${playbookItems.length} action items ready`;
      })();

      await dispatchAgentPush(db, {
        kind: 'agent_playbook_ready',
        userId: uid,
        operationId: operationId || 'playbook-gen',
        title: llmTitle?.trim() || fallbackTitle,
        body: llmBody?.trim() || fallbackBody,
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
    const planningScaffolding = this.buildPlanningScaffolding(primarySport, userData);
    const goalsText =
      agentGoals.length > 0 ? agentGoals.map((g) => `• ${g.text}`).join('\n') : 'No goals set yet.';
    const [promptContextText, recentActivityText, syncContext, completedGoalsText] =
      await Promise.all([
        this.buildPromptContextText(
          uid,
          this.buildPlanningMemoryQuery('briefing', role, primarySport, agentGoals),
          db
        ),
        (async (): Promise<string> => {
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

            if (!recentRealPlaybook) {
              return '';
            }

            const items = (recentRealPlaybook.data()['items'] ?? []) as ShellWeeklyPlaybookItem[];
            const completed = items.filter((item) => item.status === 'complete').slice(0, 5);
            return completed.length > 0
              ? `\n\nRecently completed tasks:\n${completed.map((task) => `• ${task.title}`).join('\n')}`
              : '';
          } catch {
            return '';
          }
        })(),
        (async (): Promise<string> => {
          try {
            const syncReport = await db
              .collection('Users')
              .doc(uid)
              .collection('agent_sync_reports')
              .orderBy('syncedAt', 'desc')
              .limit(1)
              .get();

            if (syncReport.empty) {
              return '';
            }

            const parts = extractDeltaSyncParts(syncReport.docs[0].data());
            return parts.length > 0 ? `\n\nProfile sync detected: ${parts.join(', ')}.` : '';
          } catch {
            return '';
          }
        })(),
        (async (): Promise<string> => {
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

            if (completedGoalsSnap.empty) {
              return '';
            }

            const names = completedGoalsSnap.docs.map(
              (doc) => `• ${String(doc.data()['text'] ?? '')}`
            );
            return `\n\nRecently completed goals:\n${names.join('\n')}`;
          } catch {
            return '';
          }
        })(),
      ]);

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
      agentGoals.length > 0
        ? `Generate a briefing that feels personally crafted for this user — reference their sport, season phase, role, and goals. Never be generic.`
        : `Since this user has no goals set, focus the insights on welcoming them to Agent X, encouraging them to set goals, exploring the platform, or connecting accounts. Be helpful and onboarding-focused.`,
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
      const { parsed } = await this.generateStructuredPayload(
        [
          {
            role: 'system',
            content:
              "You are Agent X, a hyper-personalized AI sports assistant. You deeply understand each user's role, sport, season, and goals. Return only valid JSON. Every insight must feel hand-crafted for this specific user — never generic.",
          },
          { role: 'user', content: promptLines },
        ],
        {
          // Daily briefings are a scheduled/background planning surface, not a
          // raw parsing task, so they should use the automation tier.
          tier: 'task_automation',
          maxTokens: 1024,
          temperature: 0.7,
          outputSchema: {
            name: 'agent_briefing',
            schema: briefingResponseSchema,
          },
          ...(operationId
            ? {
                telemetryContext: {
                  operationId,
                  userId: uid,
                  agentId: 'strategy_coordinator' as const,
                },
              }
            : {}),
        },
        briefingResponseSchema,
        'Briefing',
        db
      );
      if (parsed.previewText) {
        briefingPreviewText = parsed.previewText;
      }
      briefingInsights = (parsed.insights ?? []).map((ins, idx) => ({
        id: ins.id ?? `bi-${idx + 1}`,
        text: ins.text ?? '',
        icon: sanitizeBriefingIcon(ins.icon),
        type: ins.type ?? 'info',
      }));
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

    await this.saveGeneratedBriefing(uid, db, {
      previewText: briefingPreviewText,
      insights: briefingInsights,
      generatedAt,
      role,
    });

    logger.info('Agent briefing generated', {
      userId: uid,
      insightCount: briefingInsights.length,
    });

    // Notify user that their Daily Briefing is ready
    try {
      await dispatchAgentPush(db, {
        kind: 'agent_briefing_ready',
        userId: uid,
        operationId: operationId || 'briefing-gen',
        title: 'Your Daily Briefing is Ready',
        body:
          briefingPreviewText ||
          `Agent X prepared ${briefingInsights.length} insights for your day.`,
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
      const { parsed } = await this.generateStructuredPayload(
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
          outputSchema: {
            name: 'agent_playbook_nudge',
            schema: playbookNudgeResponseSchema,
          },
        },
        playbookNudgeResponseSchema,
        'Playbook nudge'
      );

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
