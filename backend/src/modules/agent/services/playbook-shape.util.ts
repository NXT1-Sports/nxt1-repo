import type { AgentDashboardGoal, ShellWeeklyPlaybookItem } from '@nxt1/core';

export interface GeneratedPlaybookCandidateItem {
  readonly id?: string;
  readonly weekLabel?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly why?: string;
  readonly details?: string;
  readonly actionLabel?: string;
  readonly goal?: {
    readonly id?: string;
    readonly label?: string;
  };
  readonly coordinator?: {
    readonly id?: string;
    readonly label?: string;
    readonly icon?: string;
  };
}

export const PLAYBOOK_RECURRING_ITEMS_PER_PLAN = 2;
export const PLAYBOOK_GOAL_ITEMS_PER_GOAL = 2;

const PLAYBOOK_WEEKLY_TASKS_GOAL_ID = 'recurring';
const PLAYBOOK_WEEKLY_TASKS_GOAL_LABEL = 'Weekly Tasks';
const PLAYBOOK_GOAL_LABEL_MAX_LENGTH = 30;

function normalizeText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function truncateGoalLabel(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= PLAYBOOK_GOAL_LABEL_MAX_LENGTH
    ? trimmed
    : trimmed.slice(0, PLAYBOOK_GOAL_LABEL_MAX_LENGTH);
}

function isRecurringCandidate(item: GeneratedPlaybookCandidateItem): boolean {
  return (
    normalizeText(item.goal?.id) === PLAYBOOK_WEEKLY_TASKS_GOAL_ID ||
    normalizeText(item.goal?.label) === PLAYBOOK_WEEKLY_TASKS_GOAL_LABEL.toLowerCase()
  );
}

function toShellPlaybookItem(
  candidate: GeneratedPlaybookCandidateItem,
  goal: { id: string; label: string },
  fallbackWeekLabel: string
): ShellWeeklyPlaybookItem {
  return {
    id: candidate.id?.trim() || `wp-${crypto.randomUUID().slice(0, 8)}`,
    weekLabel: candidate.weekLabel?.trim() || fallbackWeekLabel,
    title: candidate.title?.trim() || 'Take action',
    summary: candidate.summary?.trim() || 'Agent X prepared a next step for you.',
    why: candidate.why?.trim() || 'This keeps momentum moving in the right direction.',
    details: candidate.details?.trim() || 'Agent X will prepare the next step for review.',
    actionLabel: candidate.actionLabel?.trim() || 'Take Action',
    status: 'pending',
    goal,
    coordinator:
      candidate.coordinator?.id && candidate.coordinator.label
        ? {
            id: candidate.coordinator.id,
            label: candidate.coordinator.label,
            icon: candidate.coordinator.icon ?? 'sparkles',
          }
        : undefined,
  };
}

function resolveCandidateGoal(
  candidate: GeneratedPlaybookCandidateItem,
  goalsById: ReadonlyMap<string, AgentDashboardGoal>,
  goalsByLabel: ReadonlyMap<string, AgentDashboardGoal>,
  activeGoals: readonly AgentDashboardGoal[]
): AgentDashboardGoal | null {
  const candidateGoalId = candidate.goal?.id?.trim();
  if (candidateGoalId && goalsById.has(candidateGoalId)) {
    return goalsById.get(candidateGoalId) ?? null;
  }

  const candidateGoalLabel = normalizeText(candidate.goal?.label);
  if (candidateGoalLabel && goalsByLabel.has(candidateGoalLabel)) {
    return goalsByLabel.get(candidateGoalLabel) ?? null;
  }

  if (activeGoals.length === 1 && !isRecurringCandidate(candidate)) {
    return activeGoals[0] ?? null;
  }

  return null;
}

export function getPlaybookTargetItemCount(goalCount: number): number {
  return PLAYBOOK_RECURRING_ITEMS_PER_PLAN + Math.max(goalCount, 0) * PLAYBOOK_GOAL_ITEMS_PER_GOAL;
}

export function getPlaybookTargetGoalItemCount(goalCount: number): number {
  return Math.max(goalCount, 0) * PLAYBOOK_GOAL_ITEMS_PER_GOAL;
}

export function normalizeGeneratedPlaybookItems(
  candidateItems: readonly GeneratedPlaybookCandidateItem[],
  activeGoals: readonly AgentDashboardGoal[]
): ShellWeeklyPlaybookItem[] | null {
  const recurringItems: ShellWeeklyPlaybookItem[] = [];
  const goalBuckets = new Map<string, ShellWeeklyPlaybookItem[]>(
    activeGoals.map((goal) => [goal.id, []])
  );

  const goalsById = new Map(activeGoals.map((goal) => [goal.id, goal]));
  const goalsByLabel = new Map(activeGoals.map((goal) => [normalizeText(goal.text), goal]));

  for (const candidate of candidateItems) {
    if (isRecurringCandidate(candidate)) {
      if (recurringItems.length < PLAYBOOK_RECURRING_ITEMS_PER_PLAN) {
        recurringItems.push(
          toShellPlaybookItem(
            candidate,
            {
              id: PLAYBOOK_WEEKLY_TASKS_GOAL_ID,
              label: PLAYBOOK_WEEKLY_TASKS_GOAL_LABEL,
            },
            'Weekly'
          )
        );
      }
      continue;
    }

    const resolvedGoal = resolveCandidateGoal(candidate, goalsById, goalsByLabel, activeGoals);
    if (!resolvedGoal) {
      continue;
    }

    const bucket = goalBuckets.get(resolvedGoal.id);
    if (!bucket || bucket.length >= PLAYBOOK_GOAL_ITEMS_PER_GOAL) {
      continue;
    }

    bucket.push(
      toShellPlaybookItem(
        candidate,
        {
          id: resolvedGoal.id,
          label: candidate.goal?.label?.trim() || truncateGoalLabel(resolvedGoal.text),
        },
        'Mon'
      )
    );
  }

  if (recurringItems.length !== PLAYBOOK_RECURRING_ITEMS_PER_PLAN) {
    return null;
  }

  const orderedGoalItems: ShellWeeklyPlaybookItem[] = [];
  for (const goal of activeGoals) {
    const bucket = goalBuckets.get(goal.id) ?? [];
    if (bucket.length !== PLAYBOOK_GOAL_ITEMS_PER_GOAL) {
      return null;
    }
    orderedGoalItems.push(...bucket);
  }

  return [...recurringItems, ...orderedGoalItems];
}
