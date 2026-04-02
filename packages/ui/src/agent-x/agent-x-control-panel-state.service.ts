import { Injectable, computed, inject, signal } from '@angular/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { NxtLoggingService } from '../services/logging/logging.service';

export type AgentXControlPanelKind = 'status' | 'budget' | 'goals';
export type AgentXControlPanelPresentation = 'sheet' | 'modal';
export type AgentXSystemStatus = 'active' | 'degraded' | 'down';
export type AgentXSystemStatusTone = 'positive' | 'warning' | 'critical';

export interface AgentXStatusDefinition {
  readonly id: AgentXSystemStatus;
  readonly label: string;
  readonly tone: AgentXSystemStatusTone;
  readonly summary: string;
  readonly detail: string;
}

export interface AgentXGoalOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

export interface AgentXBudgetSettings {
  readonly monthlyBudget: number;
  readonly autoTopOffEnabled: boolean;
  readonly autoTopOffAmount: number;
}

export const AGENT_X_STATUS_DEFINITIONS: readonly AgentXStatusDefinition[] = [
  {
    id: 'active',
    label: 'Active',
    tone: 'positive',
    summary: 'Agent X is live and actively monitoring opportunities.',
    detail: 'Automations, monitoring, and recommended actions are available right now.',
  },
  {
    id: 'degraded',
    label: 'Degraded',
    tone: 'warning',
    summary: 'Agent X is online, but some workflows may move slower than normal.',
    detail:
      'Use this state for partial outages, queue delays, or reduced recommendation freshness.',
  },
  {
    id: 'down',
    label: 'Down',
    tone: 'critical',
    summary: 'Agent X is temporarily offline and execution is paused.',
    detail:
      'Use the red state when automations are unavailable so athletes know not to expect live actions.',
  },
] as const;

export const AGENT_X_GOAL_OPTIONS: readonly AgentXGoalOption[] = [
  {
    id: 'coach-outreach',
    label: 'Send smarter coach outreach',
    description: 'Prioritize the best-fit programs and draft outreach each week.',
  },
  {
    id: 'highlight-graphics',
    label: 'Create weekly highlight graphics',
    description: 'Turn performances into social-ready creative after games.',
  },
  {
    id: 'profile-optimization',
    label: 'Keep my profile recruitment-ready',
    description: 'Surface missing fields, stale stats, and profile gaps to fix fast.',
  },
  {
    id: 'lead-tracking',
    label: 'Track warm recruiting leads',
    description: 'Watch coach views, clicks, and replies so I know who is warming up.',
  },
  {
    id: 'weekly-plan',
    label: 'Build my weekly game plan',
    description: 'Package my next best recruiting and content actions into one plan.',
  },
  {
    id: 'brand-growth',
    label: 'Grow my personal brand',
    description: 'Use momentum spikes to plan content, captions, and publishing windows.',
  },
] as const;

@Injectable({ providedIn: 'root' })
export class AgentXControlPanelStateService {
  private readonly logger = inject(NxtLoggingService).child('AgentXControlPanelState');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  private readonly _status = signal<AgentXSystemStatus>('active');
  private readonly _monthlyBudget = signal(150);
  private readonly _autoTopOffEnabled = signal(true);
  private readonly _autoTopOffAmount = signal(50);
  private readonly _goals = signal<string[]>([]);

  readonly status = computed(() => this._status());
  readonly monthlyBudget = computed(() => this._monthlyBudget());
  readonly autoTopOffEnabled = computed(() => this._autoTopOffEnabled());
  readonly autoTopOffAmount = computed(() => this._autoTopOffAmount());
  readonly goals = computed(() => this._goals());
  readonly goalCount = computed(() => this._goals().length);
  readonly statusDefinition = computed(
    () =>
      AGENT_X_STATUS_DEFINITIONS.find((item) => item.id === this._status()) ??
      AGENT_X_STATUS_DEFINITIONS[0]
  );
  readonly statusLabel = computed(() => this.statusDefinition().label);
  readonly statusTone = computed(() => this.statusDefinition().tone);
  readonly budgetBadgeLabel = computed(() => `$${this._monthlyBudget()} Budget`);
  readonly selectedGoalOptions = computed(() => {
    const selected = new Set(this._goals());
    return AGENT_X_GOAL_OPTIONS.filter((goal) => selected.has(goal.id));
  });

  readonly statusDefinitions = AGENT_X_STATUS_DEFINITIONS;
  readonly goalOptions = AGENT_X_GOAL_OPTIONS;

  notePanelOpened(
    panel: AgentXControlPanelKind,
    presentation: AgentXControlPanelPresentation
  ): void {
    this.logger.info('Agent X briefing panel opened', { panel, presentation });
    this.breadcrumb.trackStateChange('agent-x-control-panel:opened', {
      panel,
      presentation,
    });
  }

  saveBudget(settings: AgentXBudgetSettings): void {
    const monthlyBudget = this.normalizeCurrency(settings.monthlyBudget, 25, 5000);
    const autoTopOffAmount = this.normalizeCurrency(settings.autoTopOffAmount, 25, 5000);

    this._monthlyBudget.set(monthlyBudget);
    this._autoTopOffEnabled.set(settings.autoTopOffEnabled);
    this._autoTopOffAmount.set(autoTopOffAmount);

    this.logger.info('Agent X budget updated', {
      monthlyBudget,
      autoTopOffEnabled: settings.autoTopOffEnabled,
      autoTopOffAmount,
    });
    this.breadcrumb.trackStateChange('agent-x-budget:updated', {
      monthlyBudget,
      autoTopOffEnabled: settings.autoTopOffEnabled,
      autoTopOffAmount,
    });
    this.analytics?.trackEvent(APP_EVENTS.USAGE_BUDGET_UPDATED, {
      source: 'agent-x-control-panel',
      monthlyBudget,
      autoTopOffEnabled: settings.autoTopOffEnabled,
      autoTopOffAmount,
    });
  }

  saveGoals(goalIds: readonly string[]): void {
    const validPredefined = new Set(this.goalOptions.map((g) => g.id));
    const normalized = Array.from(
      new Set(
        goalIds.filter((goalId) => validPredefined.has(goalId) || goalId.startsWith('custom:'))
      )
    ).slice(0, 3);

    this._goals.set(normalized);

    this.logger.info('Agent X goals updated', {
      goalCount: normalized.length,
      goalIds: normalized,
    });
    this.breadcrumb.trackStateChange('agent-x-goals:updated', {
      goalCount: normalized.length,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_GOALS_SET, {
      source: 'agent-x-control-panel',
      goalCount: normalized.length,
      goals: normalized,
    });
  }

  private normalizeCurrency(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.round(value)));
  }
}
