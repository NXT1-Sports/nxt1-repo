/**
 * @fileoverview Intel Service — Signal-Based State Management
 * @module @nxt1/ui/intel
 *
 * Manages AI-generated Intel report state for both athlete and team profiles.
 * - Loads existing reports from backend
 * - Triggers on-demand generation
 * - Exposes reactive signals for UI rendering
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import type { AthleteIntelReport, TeamIntelReport, IntelBriefSection } from '@nxt1/core';

function parseIntelDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'object') {
    const candidate = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
      nanoseconds?: number;
      _nanoseconds?: number;
    };

    if (typeof candidate.toDate === 'function') {
      const date = candidate.toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const seconds =
      typeof candidate.seconds === 'number'
        ? candidate.seconds
        : typeof candidate._seconds === 'number'
          ? candidate._seconds
          : null;

    if (seconds !== null) {
      const nanos =
        typeof candidate.nanoseconds === 'number'
          ? candidate.nanoseconds
          : typeof candidate._nanoseconds === 'number'
            ? candidate._nanoseconds
            : 0;

      const date = new Date(seconds * 1000 + Math.floor(nanos / 1_000_000));
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  return null;
}

import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../services/analytics';
import { PERFORMANCE_ADAPTER } from '../services/performance';
import { NxtToastService } from '../services/toast/toast.service';
import { IntelApiClient } from './intel-api.client';

@Injectable({ providedIn: 'root' })
export class IntelService {
  private readonly api = inject(IntelApiClient);
  private readonly logger = inject(NxtLoggingService).child('IntelService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PERFORMANCE_ADAPTER, { optional: true });
  private readonly toast = inject(NxtToastService);

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _athleteReport = signal<AthleteIntelReport | null>(null);
  private readonly _teamReport = signal<TeamIntelReport | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _isGenerating = signal(false);
  private readonly _isPendingGeneration = signal(false);
  private readonly _error = signal<string | null>(null);

  // ============================================
  // PUBLIC COMPUTED SIGNALS
  // ============================================

  readonly athleteReport = computed(() => this._athleteReport());
  readonly teamReport = computed(() => this._teamReport());
  readonly isLoading = computed(() => this._isLoading());
  readonly isGenerating = computed(() => this._isGenerating());
  readonly isPendingGeneration = computed(() => this._isPendingGeneration());
  readonly isAnythingGenerating = computed(
    () => this._isGenerating() || this._isPendingGeneration()
  );
  readonly error = computed(() => this._error());

  /** Ordered dossier sections from the active athlete Intel report. */
  readonly athleteSections = computed(
    (): readonly IntelBriefSection[] => this._athleteReport()?.sections ?? []
  );

  /** Ordered dossier sections from the active team Intel report. */
  readonly teamSections = computed(
    (): readonly IntelBriefSection[] => this._teamReport()?.sections ?? []
  );

  /** True when there's no Intel report loaded (athlete or team) and we're not loading. */
  readonly hasNoReport = computed(
    () => !this._athleteReport() && !this._teamReport() && !this._isLoading()
  );

  /** Formatted date of the latest report. */
  readonly reportDate = computed(() => {
    const athlete = this._athleteReport();
    const team = this._teamReport();
    const timestamp = athlete?.generatedAt ?? team?.generatedAt;
    const parsedDate = parseIntelDate(timestamp);

    if (!parsedDate) {
      return 'Recently generated';
    }

    return parsedDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  });

  // ============================================
  // TOOL STEP BRIDGE (Agent X → Intel loading state)
  // ============================================

  /**
   * Called by AgentXOperationChatComponent when a tool step fires during streaming.
   * Maps `write_intel` tool status directly to the intel loading/generating signals,
   * so the Intel tab reflects exactly what the agent is doing in real time.
   *
   * @param toolId   Tool step id (e.g. "write_intel_1")
   * @param toolName Tool step label from the SSE event
   * @param status   "running" | "done" | "error"
   * @param detail   Optional detail string (may contain entityType hint)
   */
  notifyToolStep(toolId: string, toolName: string, status: string, detail?: string): void {
    const isIntelTool =
      toolName.toLowerCase().includes('write_intel') ||
      toolName.toLowerCase().includes('intel') ||
      toolId.toLowerCase().includes('write_intel');

    if (!isIntelTool) return;

    if (status === 'active') {
      this.logger.info('Agent X write_intel tool started — showing generating state', { toolId });
      this._isGenerating.set(true);
      this._error.set(null);
    } else if (status === 'success') {
      this.logger.info('Agent X write_intel tool completed — refreshing intel', { toolId });
      // Refresh whichever report is currently active (athlete or team)
      const athleteReport = this._athleteReport();
      const teamReport = this._teamReport();
      if (athleteReport?.userId) {
        void this.loadAthleteIntel(athleteReport.userId, true).finally(() => {
          this._isGenerating.set(false);
        });
      } else if (teamReport?.teamId) {
        void this.loadTeamIntel(teamReport.teamId, true).finally(() => {
          this._isGenerating.set(false);
        });
      } else {
        this._isGenerating.set(false);
      }
    } else if (status === 'error') {
      this.logger.warn('Agent X write_intel tool errored', { toolId, detail });
      this._isGenerating.set(false);
    }
  }

  // ============================================
  // ATHLETE INTEL
  // ============================================

  async loadAthleteIntel(userId: string, forceRefresh = false): Promise<void> {
    // Skip reload if we already have the report for this user cached (no skeleton flash on tab revisit)
    const cached = this._athleteReport();
    if (!forceRefresh && cached && cached.userId === userId && !this._error()) {
      this.logger.info('Athlete Intel cache hit — skipping reload', { userId });
      return;
    }

    this._isLoading.set(true);
    this._error.set(null);
    this.logger.info('Loading athlete Intel', { userId });
    this.breadcrumb.trackStateChange('intel:loading', { userId, type: 'athlete' });

    try {
      const trace = await this.performance?.startTrace(TRACE_NAMES.INTEL_ATHLETE_LOAD);
      await trace?.putAttribute(ATTRIBUTE_NAMES.FEATURE_NAME, 'intel');
      await trace?.putAttribute('type', 'athlete');
      let report: AthleteIntelReport | null;
      try {
        report = await this.api.getAthleteIntel(userId);
        await trace?.putAttribute('success', 'true');
        await trace?.putAttribute('has_report', String(!!report));
      } catch (err) {
        await trace?.putAttribute('success', 'false');
        throw err;
      } finally {
        await trace?.stop();
      }
      this._athleteReport.set(report);
      this._teamReport.set(null);
      this.logger.info('Athlete Intel loaded', { userId, hasReport: !!report });
      this.breadcrumb.trackStateChange('intel:loaded', { userId, hasReport: !!report });
      this.analytics?.trackEvent(APP_EVENTS.INTEL_ATHLETE_VIEWED, { userId, hasReport: !!report });
    } catch (err) {
      this.logger.error('Failed to load athlete Intel', err, { userId });
      this.breadcrumb.trackStateChange('intel:error', { userId });
      this._error.set(err instanceof Error ? err.message : 'Failed to load Intel');
    } finally {
      this._isLoading.set(false);
    }
  }

  async generateAthleteIntel(userId: string): Promise<void> {
    this._isGenerating.set(true);
    this._error.set(null);
    this.logger.info('Generating athlete Intel', { userId });
    this.breadcrumb.trackStateChange('intel:generating', { userId, type: 'athlete' });

    try {
      const trace = await this.performance?.startTrace(TRACE_NAMES.INTEL_ATHLETE_GENERATE);
      await trace?.putAttribute(ATTRIBUTE_NAMES.FEATURE_NAME, 'intel');
      await trace?.putAttribute('type', 'athlete');
      let report: AthleteIntelReport;
      try {
        report = await this.api.generateAthleteIntel(userId);
        await trace?.putAttribute('success', 'true');
      } catch (err) {
        await trace?.putAttribute('success', 'false');
        throw err;
      } finally {
        await trace?.stop();
      }
      this._athleteReport.set(report);
      this.logger.info('Athlete Intel generated', { userId });
      this.breadcrumb.trackStateChange('intel:generated', { userId });
      this.analytics?.trackEvent(APP_EVENTS.INTEL_ATHLETE_GENERATED, { userId });
      this.toast.success('Intel report generated');
    } catch (err) {
      this.logger.error('Failed to generate athlete Intel', err, { userId });
      this.breadcrumb.trackStateChange('intel:generate-error', { userId });
      const msg = err instanceof Error ? err.message : 'Failed to generate Intel';
      this._error.set(msg);
      this.toast.error(msg);
    } finally {
      this._isGenerating.set(false);
    }
  }

  // ============================================
  // TEAM INTEL
  // ============================================

  async loadTeamIntel(teamId: string, forceRefresh = false): Promise<void> {
    // Skip reload if we already have the report for this team cached (no skeleton flash on tab revisit)
    const cached = this._teamReport();
    if (!forceRefresh && cached && cached.teamId === teamId && !this._error()) {
      this.logger.info('Team Intel cache hit — skipping reload', { teamId });
      return;
    }

    this._isLoading.set(true);
    this._error.set(null);
    this.logger.info('Loading team Intel', { teamId });
    this.breadcrumb.trackStateChange('intel:loading', { teamId, type: 'team' });

    try {
      const trace = await this.performance?.startTrace(TRACE_NAMES.INTEL_TEAM_LOAD);
      await trace?.putAttribute(ATTRIBUTE_NAMES.FEATURE_NAME, 'intel');
      await trace?.putAttribute('type', 'team');
      let report: TeamIntelReport | null;
      try {
        report = await this.api.getTeamIntel(teamId);
        await trace?.putAttribute('success', 'true');
        await trace?.putAttribute('has_report', String(!!report));
      } catch (err) {
        await trace?.putAttribute('success', 'false');
        throw err;
      } finally {
        await trace?.stop();
      }
      this._teamReport.set(report);
      this._athleteReport.set(null);
      this.logger.info('Team Intel loaded', { teamId, hasReport: !!report });
      this.breadcrumb.trackStateChange('intel:loaded', { teamId, hasReport: !!report });
      this.analytics?.trackEvent(APP_EVENTS.INTEL_TEAM_VIEWED, { teamId, hasReport: !!report });
    } catch (err) {
      this.logger.error('Failed to load team Intel', err, { teamId });
      this.breadcrumb.trackStateChange('intel:error', { teamId });
      this._error.set(err instanceof Error ? err.message : 'Failed to load Intel');
    } finally {
      this._isLoading.set(false);
      this._isPendingGeneration.set(false);
    }
  }

  async generateTeamIntel(teamId: string): Promise<void> {
    this._isGenerating.set(true);
    this._error.set(null);
    this.logger.info('Generating team Intel', { teamId });
    this.breadcrumb.trackStateChange('intel:generating', { teamId, type: 'team' });

    try {
      const trace = await this.performance?.startTrace(TRACE_NAMES.INTEL_TEAM_GENERATE);
      await trace?.putAttribute(ATTRIBUTE_NAMES.FEATURE_NAME, 'intel');
      await trace?.putAttribute('type', 'team');
      let report: TeamIntelReport;
      try {
        report = await this.api.generateTeamIntel(teamId);
        await trace?.putAttribute('success', 'true');
      } catch (err) {
        await trace?.putAttribute('success', 'false');
        throw err;
      } finally {
        await trace?.stop();
      }
      this._teamReport.set(report);
      this.logger.info('Team Intel generated', { teamId });
      this.breadcrumb.trackStateChange('intel:generated', { teamId });
      this.analytics?.trackEvent(APP_EVENTS.INTEL_TEAM_GENERATED, { teamId });
      this.toast.success('Team Intel report generated');
    } catch (err) {
      this.logger.error('Failed to generate team Intel', err, { teamId });
      this.breadcrumb.trackStateChange('intel:generate-error', { teamId });
      const msg = err instanceof Error ? err.message : 'Failed to generate Intel';
      this._error.set(msg);
      this.toast.error(msg);
    } finally {
      this._isGenerating.set(false);
      this._isPendingGeneration.set(false);
    }
  }

  // ============================================
  // CLEANUP
  // ============================================

  reset(): void {
    this._athleteReport.set(null);
    this._teamReport.set(null);
    this._isLoading.set(false);
    this._isGenerating.set(false);
    this._isPendingGeneration.set(false);
    this._error.set(null);
  }

  /** Mark that the user has initiated generation (e.g. opened Agent X chat) but generation hasn't started yet. */
  startPendingGeneration(): void {
    this._isPendingGeneration.set(true);
  }

  /** Clear the pending state once generation is complete or cancelled. */
  endPendingGeneration(): void {
    this._isPendingGeneration.set(false);
  }
}
