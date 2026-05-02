import { Injectable, computed, inject, signal, OnDestroy, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AGENT_X_RUNTIME_CONFIG } from '@nxt1/core/ai';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtPlatformService } from '../../services/platform/platform.service';
import { AGENT_X_API_BASE_URL } from './agent-x-job.service';

export type AgentXControlPanelKind = 'status' | 'budget' | 'goals';
export type AgentXControlPanelPresentation = 'sheet' | 'modal';
export type AgentXBudgetDraftMode = 'current' | 'new';
export type AgentXSystemStatus = 'active' | 'degraded' | 'down';
export type AgentXSystemStatusTone = 'positive' | 'warning' | 'critical';

export interface AgentXStatusDefinition {
  readonly id: AgentXSystemStatus;
  readonly label: string;
  readonly tone: AgentXSystemStatusTone;
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
  },
  {
    id: 'degraded',
    label: 'Degraded',
    tone: 'warning',
  },
  {
    id: 'down',
    label: 'Down',
    tone: 'critical',
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

/** Health-check polling interval (60 s). */
const HEALTH_POLL_INTERVAL_MS = AGENT_X_RUNTIME_CONFIG.controlPanelHealth.pollIntervalMs;

/** Delay before a recovery check after a reported execution failure. */
const RECOVERY_DELAY_MS = AGENT_X_RUNTIME_CONFIG.controlPanelHealth.recoveryDelayMs;

/** Consecutive failures before flipping from degraded → down. */
const FAILURE_THRESHOLD = AGENT_X_RUNTIME_CONFIG.controlPanelHealth.failureThreshold;

@Injectable({ providedIn: 'root' })
export class AgentXControlPanelStateService implements OnDestroy {
  private readonly logger = inject(NxtLoggingService).child('AgentXControlPanelState');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL, { optional: true });
  private readonly platform = inject(NxtPlatformService);
  private readonly zone = inject(NgZone);

  /** Browser network-offline flag. */
  private readonly _isNetworkOffline = signal(false);

  /** Last known server health status. */
  private readonly _serverStatus = signal<AgentXSystemStatus>('active');

  /** Rolling failure counter for circuit-breaker logic. */
  private _consecutiveFailures = 0;

  /** Handle returned by setInterval — used for cleanup. */
  private _pollTimerId: ReturnType<typeof setInterval> | null = null;

  /** Handle for the one-shot recovery timer. */
  private _recoveryTimerId: ReturnType<typeof setTimeout> | null = null;

  /** Listeners to tear down on destroy. */
  private readonly _teardownFns: Array<() => void> = [];

  private readonly _monthlyBudget = signal(0);
  private readonly _autoTopOffEnabled = signal(true);
  private readonly _autoTopOffAmount = signal(50);
  private readonly _goals = signal<string[]>([]);

  /** Derived status: offline network always wins, otherwise use server health. */
  readonly status = computed<AgentXSystemStatus>(() =>
    this._isNetworkOffline() ? 'down' : this._serverStatus()
  );
  readonly monthlyBudget = computed(() => this._monthlyBudget());
  readonly autoTopOffEnabled = computed(() => this._autoTopOffEnabled());
  readonly autoTopOffAmount = computed(() => this._autoTopOffAmount());
  readonly goals = computed(() => this._goals());
  readonly goalCount = computed(() => this._goals().length);
  readonly statusDefinition = computed(
    () =>
      AGENT_X_STATUS_DEFINITIONS.find((item) => item.id === this.status()) ??
      AGENT_X_STATUS_DEFINITIONS[0]
  );
  readonly statusLabel = computed(() => this.statusDefinition().label);
  readonly statusTone = computed(() => this.statusDefinition().tone);
  readonly budgetBadgeLabel = computed(() =>
    this._monthlyBudget() > 0 ? `$${this._monthlyBudget()} Budget` : 'Budget'
  );
  readonly selectedGoalOptions = computed(() => {
    const selected = new Set(this._goals());
    return AGENT_X_GOAL_OPTIONS.filter((goal) => selected.has(goal.id));
  });

  readonly statusDefinitions = AGENT_X_STATUS_DEFINITIONS;
  readonly goalOptions = AGENT_X_GOAL_OPTIONS;

  constructor() {
    this.initializeAutonomousHealthChecks();
  }

  ngOnDestroy(): void {
    if (this._pollTimerId !== null) clearInterval(this._pollTimerId);
    if (this._recoveryTimerId !== null) clearTimeout(this._recoveryTimerId);
    this._teardownFns.forEach((fn) => fn());
  }

  /**
   * Called by job/execution services when an API call fails with a
   * network or timeout error. Bumps the failure counter and, past
   * the threshold, transitions to degraded/down. Schedules a
   * recovery check so the dot can turn green again automatically.
   */
  reportExecutionFailure(): void {
    this._consecutiveFailures++;
    const failures = this._consecutiveFailures;

    if (failures >= FAILURE_THRESHOLD) {
      this._serverStatus.set('down');
    } else {
      this._serverStatus.set('degraded');
    }

    this.logger.warn('Execution failure reported', { failures });
    this.breadcrumb.trackStateChange('agent-x-health:execution-failure', { failures });

    // Schedule a recovery probe (debounced — only the latest timer wins)
    if (this._recoveryTimerId !== null) clearTimeout(this._recoveryTimerId);
    this._recoveryTimerId = setTimeout(() => this.syncHealth(), RECOVERY_DELAY_MS);
  }

  // ── Private health infrastructure ──────────────────────────

  private initializeAutonomousHealthChecks(): void {
    if (!this.platform.isBrowser()) return;
    if (!this.baseUrl) {
      this.logger.warn('AGENT_X_API_BASE_URL not provided — health checks disabled');
      return;
    }

    // 1. Network-awareness listeners (run outside zone to avoid CD)
    this.zone.runOutsideAngular(() => {
      const onOffline = (): void => {
        this.zone.run(() => {
          this._isNetworkOffline.set(true);
          this.logger.warn('Browser went offline');
          this.breadcrumb.trackStateChange('agent-x-health:offline');
        });
      };
      const onOnline = (): void => {
        this.zone.run(() => {
          this._isNetworkOffline.set(false);
          this.logger.info('Browser came back online');
          this.breadcrumb.trackStateChange('agent-x-health:online');
          this.syncHealth(); // Immediately re-check server
        });
      };

      window.addEventListener('offline', onOffline);
      window.addEventListener('online', onOnline);
      this._teardownFns.push(
        () => window.removeEventListener('offline', onOffline),
        () => window.removeEventListener('online', onOnline)
      );

      // Seed initial network state
      if (!navigator.onLine) this._isNetworkOffline.set(true);
    });

    // 2. Initial health probe + periodic polling (outside zone)
    this.syncHealth();
    this.zone.runOutsideAngular(() => {
      this._pollTimerId = setInterval(() => this.syncHealth(), HEALTH_POLL_INTERVAL_MS);
    });
  }

  private async syncHealth(): Promise<void> {
    if (!this.baseUrl) return;

    const url = `${this.baseUrl}/agent-x/health`;

    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; data?: { status: AgentXSystemStatus } }>(url)
      );

      const serverStatus = response?.data?.status ?? 'active';

      this.zone.run(() => {
        this._serverStatus.set(serverStatus);
      });
      this._consecutiveFailures = 0;

      this.logger.debug('Health check passed', { serverStatus });
    } catch (err) {
      this._consecutiveFailures++;
      const failures = this._consecutiveFailures;

      this.zone.run(() => {
        this._serverStatus.set(failures >= FAILURE_THRESHOLD ? 'down' : 'degraded');
      });

      this.logger.warn('Health check failed', {
        failures,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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

  hydrateGoals(goalIds: readonly string[]): void {
    this._goals.set(this.normalizeGoalIds(goalIds));
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
    const normalized = this.normalizeGoalIds(goalIds);

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

  private normalizeGoalIds(goalIds: readonly string[]): string[] {
    const validPredefined = new Set(this.goalOptions.map((goal) => goal.id));
    return Array.from(
      new Set(
        goalIds.filter((goalId) => validPredefined.has(goalId) || goalId.startsWith('custom:'))
      )
    ).slice(0, 3);
  }

  private normalizeCurrency(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.round(value)));
  }
}
