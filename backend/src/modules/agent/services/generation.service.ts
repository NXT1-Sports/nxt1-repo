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

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { AgentDashboardGoal, ShellWeeklyPlaybookItem, ShellBriefingInsight } from '@nxt1/core';
import { logger } from '../../../utils/logger.js';

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

  /**
   * Generate a personalized weekly playbook for a user.
   * Reads user profile + goals from Firestore, calls OpenRouter LLM,
   * persists result, and prunes old playbooks (keep 10).
   */
  async generatePlaybook(uid: string): Promise<PlaybookGenerationResult> {
    const userDoc = await this.db.collection('users').doc(uid).get();
    const userData = userDoc.data() ?? {};
    const role = (userData['role'] ?? 'athlete') as string;
    const sport = (userData['sport'] ?? '') as string;
    const displayName = (userData['displayName'] ?? '') as string;
    const agentGoals: AgentDashboardGoal[] = (userData['agentGoals'] ?? []) as AgentDashboardGoal[];

    if (agentGoals.length === 0) {
      throw new Error('Set at least one goal before generating a playbook');
    }

    const goalsText = agentGoals
      .map((g, i) => `${i + 1}. ${g.text} (category: ${g.category})`)
      .join('\n');

    // ── Gather past task context ──────────────────────────────────────────
    let pastTaskContext = '';
    try {
      const prevPlaybook = await this.db
        .collection('users')
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
      const syncReport = await this.db
        .collection('users')
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

    const prompt = [
      `You are Agent X, the AI assistant for NXT1 sports platform.`,
      `Generate a personalized weekly playbook for ${displayName || 'the user'}, a ${role}${sport ? ` in ${sport}` : ''}.`,
      `Their goals are:\n${goalsText}`,
      pastTaskContext,
      deltaContext,
      ``,
      `Return EXACTLY a JSON array of 3-5 playbook items. Each item must have:`,
      `- "id": unique string like "wp-1"`,
      `- "weekLabel": day abbreviation ("Mon", "Tue", "Wed", "Thu", "Fri")`,
      `- "title": short action title (max 50 chars)`,
      `- "summary": one-sentence description`,
      `- "details": detailed explanation of what Agent X prepared`,
      `- "actionLabel": button text (e.g., "Review Draft", "Send Emails")`,
      `- "status": always "pending"`,
      `- "goal": object with "id" and "label" matching one of the user's goals`,
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
          { role: 'system', content: 'You are a JSON generator. Return only valid JSON arrays.' },
          { role: 'user', content: prompt },
        ],
        {
          tier: 'balanced',
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
      playbookItems = agentGoals.flatMap((goal, gi) => [
        {
          id: `wp-${gi * 2 + 1}`,
          weekLabel: gi === 0 ? 'Mon' : 'Wed',
          title: `Work on: ${goal.text.slice(0, 40)}`,
          summary: `Agent X has prepared action steps for your "${goal.text}" goal.`,
          details: `Review the plan and take the first step toward achieving your goal.`,
          actionLabel: 'Review Plan',
          status: 'pending' as const,
          goal: { id: goal.id, label: goal.text.slice(0, 30) },
        },
      ]);
    }

    const generatedAt = new Date().toISOString();

    // Persist and prune old playbooks (keep last 10)
    const playbooksRef = this.db.collection('users').doc(uid).collection('agent_playbooks');
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
  async generateBriefing(uid: string, force = false): Promise<BriefingGenerationResult> {
    // ── Check if a fresh briefing already exists (skip unless forced) ────
    if (!force) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const existingBriefing = await this.db
        .collection('users')
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
    const userDoc = await this.db.collection('users').doc(uid).get();
    const userData = userDoc.data() ?? {};
    const role = (userData['role'] ?? 'athlete') as string;
    const sport = (userData['sport'] ?? '') as string;
    const displayName = (userData['displayName'] ?? '') as string;
    const agentGoals: AgentDashboardGoal[] = (userData['agentGoals'] ?? []) as AgentDashboardGoal[];

    const goalsText =
      agentGoals.length > 0 ? agentGoals.map((g) => `• ${g.text}`).join('\n') : 'No goals set yet.';

    // ── Fetch recent operations (last 24h activity) ─────────────────────
    let recentActivityText = '';
    try {
      const recentBriefings = await this.db
        .collection('users')
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
      const syncReport = await this.db
        .collection('users')
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
      `You are Agent X for NXT1 Sports. Generate a concise daily briefing for ${displayName || 'the user'}, a ${role}${sport ? ` in ${sport}` : ''}.`,
      ``,
      `Their current goals:`,
      goalsText,
      recentActivityText,
      syncContext,
      ``,
      `Return ONLY a JSON object with:`,
      `- "previewText": one sentence summary of today's focus (max 80 chars)`,
      `- "insights": array of 2-4 insight objects, each with:`,
      `    - "id": unique string like "bi-1"`,
      `    - "text": actionable insight (max 90 chars)`,
      `    - "icon": one of "trophy-outline", "mail-outline", "trending-up-outline", "alert-outline", "checkmark-circle-outline", "star-outline"`,
      `    - "type": one of "info", "warning", "success"`,
      ``,
      `Return ONLY the JSON object, no markdown fences.`,
    ]
      .filter(Boolean)
      .join('\n');

    let briefingInsights: ShellBriefingInsight[] = [];
    let briefingPreviewText = `Good morning, ${displayName || 'athlete'}. Here's your daily focus.`;

    try {
      const { OpenRouterService } = await import('../llm/openrouter.service.js');
      const llm = new OpenRouterService();
      const llmResult = await llm.complete(
        [
          {
            role: 'system',
            content: 'You are a JSON generator for a sports AI assistant. Return only valid JSON.',
          },
          { role: 'user', content: promptLines },
        ],
        {
          tier: 'balanced',
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
    const briefingsRef = this.db.collection('users').doc(uid).collection('agent_briefings');
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
    const userDoc = await this.db.collection('users').doc(uid).get();
    const agentGoals = (userDoc.data()?.['agentGoals'] ?? []) as AgentDashboardGoal[];

    if (agentGoals.length === 0) {
      logger.info('Skipping daily content generation — no goals set', { userId: uid });
      return;
    }

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
