/**
 * @fileoverview Intel API Client
 * @module @nxt1/ui/intel/api
 *
 * HTTP client for Intel dossier report endpoints (athlete + team).
 * Normalizes raw API responses into typed `AthleteIntelReport` / `TeamIntelReport` shapes.
 * Uses direct HttpClient injection matching the dominant pattern in packages/ui.
 */

import type {
  AthleteIntelReport,
  TeamIntelReport,
  IntelReportResponse,
  IntelGenerateResponse,
  IntelCitation,
  IntelDataAvailability,
  IntelDataSource,
  IntelMissingDataPrompt,
  IntelQuickCommand,
  IntelBriefItem,
  IntelBriefSection,
} from '@nxt1/core';
import { Injectable, inject, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NxtLoggingService } from '../services/logging/logging.service';

// ── Data source validation ──────────────────────────────────────────────────

const INTEL_DATA_SOURCES = [
  'self-reported',
  'coach-verified',
  'maxpreps',
  'hudl',
  '247sports',
  'rivals',
  'on3',
  'perfect-game',
  'prep-baseball',
  'ncsa',
  'usa-football',
  'agent-x',
] as const satisfies readonly IntelDataSource[];

const INTEL_DATA_AVAILABILITY_KEYS = [
  'hasMetrics',
  'hasStats',
  'hasGameLogs',
  'hasRecruiting',
  'hasSchedule',
  'hasAcademics',
  'hasVideo',
  'hasAwards',
] as const satisfies readonly (keyof IntelDataAvailability)[];

function normalizeDataSource(value: unknown): IntelDataSource {
  return typeof value === 'string' && INTEL_DATA_SOURCES.includes(value as IntelDataSource)
    ? (value as IntelDataSource)
    : 'agent-x';
}

function normalizeMissingDataCategory(value: unknown): keyof IntelDataAvailability {
  return typeof value === 'string' &&
    INTEL_DATA_AVAILABILITY_KEYS.includes(value as keyof IntelDataAvailability)
    ? (value as keyof IntelDataAvailability)
    : 'hasMetrics';
}

// ── Field normalizers ───────────────────────────────────────────────────────

function normalizeCitations(value: unknown): readonly IntelCitation[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      platform: normalizeDataSource(item['platform']),
      label: typeof item['label'] === 'string' ? item['label'] : 'Source',
      url: typeof item['url'] === 'string' ? item['url'] : undefined,
      lastSyncedAt: typeof item['lastSyncedAt'] === 'string' ? item['lastSyncedAt'] : undefined,
      verified: typeof item['verified'] === 'boolean' ? item['verified'] : undefined,
    })) satisfies readonly IntelCitation[];
}

function normalizeMissingDataPrompts(value: unknown): readonly IntelMissingDataPrompt[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      category: normalizeMissingDataCategory(item['category']),
      title: typeof item['title'] === 'string' ? item['title'] : '',
      description: typeof item['description'] === 'string' ? item['description'] : '',
      actionLabel: typeof item['actionLabel'] === 'string' ? item['actionLabel'] : 'Update',
      actionRoute: typeof item['actionRoute'] === 'string' ? item['actionRoute'] : '',
      icon: typeof item['icon'] === 'string' ? item['icon'] : 'informationCircle',
    })) satisfies readonly IntelMissingDataPrompt[];
}

function normalizeQuickCommands(value: unknown): readonly IntelQuickCommand[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      id: typeof item['id'] === 'string' ? item['id'] : '',
      label: typeof item['label'] === 'string' ? item['label'] : '',
      description: typeof item['description'] === 'string' ? item['description'] : '',
      icon: typeof item['icon'] === 'string' ? item['icon'] : 'sparkles',
      agentPrompt: typeof item['agentPrompt'] === 'string' ? item['agentPrompt'] : '',
    })) satisfies readonly IntelQuickCommand[];
}

function normalizeBriefItems(value: unknown): readonly IntelBriefItem[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const items = value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      label: typeof item['label'] === 'string' ? item['label'] : '',
      value: typeof item['value'] === 'string' ? item['value'] : '',
      unit: typeof item['unit'] === 'string' ? item['unit'] : undefined,
      source: typeof item['source'] === 'string' ? normalizeDataSource(item['source']) : undefined,
      verified: typeof item['verified'] === 'boolean' ? item['verified'] : undefined,
      date: typeof item['date'] === 'string' ? item['date'] : undefined,
      sublabel: typeof item['sublabel'] === 'string' ? item['sublabel'] : undefined,
    })) satisfies readonly IntelBriefItem[];
  return items.length > 0 ? items : undefined;
}

function normalizeSectionSources(value: unknown): readonly IntelCitation[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const sources = normalizeCitations(value);
  return sources.length > 0 ? sources : undefined;
}

function normalizeSections(value: unknown): readonly IntelBriefSection[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      id: typeof item['id'] === 'string' ? item['id'] : '',
      title: typeof item['title'] === 'string' ? item['title'] : '',
      icon: typeof item['icon'] === 'string' ? item['icon'] : 'document',
      content: typeof item['content'] === 'string' ? item['content'] : '',
      items: normalizeBriefItems(item['items']),
      sources: normalizeSectionSources(item['sources']),
    })) satisfies readonly IntelBriefSection[];
}

function normalizeGeneratedAt(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (value && typeof value === 'object') {
    const candidate = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
      nanoseconds?: number;
      _nanoseconds?: number;
    };

    if (typeof candidate.toDate === 'function') {
      const date = candidate.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
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

      return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000)).toISOString();
    }
  }

  return new Date().toISOString();
}

// ── Report normalizers ──────────────────────────────────────────────────────

function normalizeAthleteIntelReport(report: AthleteIntelReport): AthleteIntelReport {
  const raw = report as Partial<AthleteIntelReport> & Record<string, unknown>;

  return {
    ...report,
    sportName: typeof raw.sportName === 'string' ? raw.sportName : '',
    primaryPosition: typeof raw.primaryPosition === 'string' ? raw.primaryPosition : '',
    sections: normalizeSections(raw.sections),
    generatedAt: normalizeGeneratedAt(raw.generatedAt),
    citations: normalizeCitations(raw.citations),
    missingDataPrompts: normalizeMissingDataPrompts(raw.missingDataPrompts),
    quickCommands: normalizeQuickCommands(raw.quickCommands),
    staleAt: typeof raw.staleAt === 'string' ? raw.staleAt : undefined,
  };
}

function normalizeTeamIntelReport(report: TeamIntelReport): TeamIntelReport {
  const raw = report as Partial<TeamIntelReport> & Record<string, unknown>;

  return {
    ...report,
    teamName: typeof raw.teamName === 'string' ? raw.teamName : '',
    sport: typeof raw.sport === 'string' ? raw.sport : '',
    sections: normalizeSections(raw.sections),
    generatedAt: normalizeGeneratedAt(raw.generatedAt),
    citations: normalizeCitations(raw.citations),
    missingDataPrompts: normalizeMissingDataPrompts(raw.missingDataPrompts),
    quickCommands: normalizeQuickCommands(raw.quickCommands),
    staleAt: typeof raw.staleAt === 'string' ? raw.staleAt : undefined,
  };
}

// ============================================
// INJECTION TOKENS
// ============================================

export const INTEL_API_BASE_URL = new InjectionToken<string>('INTEL_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class IntelApiClient {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(NxtLoggingService).child('IntelApiClient');
  private readonly baseUrl = inject(INTEL_API_BASE_URL);

  // ── Athlete Intel ──────────────────────────────────────────────────────

  async getAthleteIntel(userId: string): Promise<AthleteIntelReport | null> {
    this.logger.debug('Fetching athlete Intel', { userId });

    try {
      const url = `${this.baseUrl}/auth/profile/${encodeURIComponent(userId)}/intel`;
      const response = await firstValueFrom(
        this.http.get<IntelReportResponse<AthleteIntelReport>>(url)
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to fetch athlete Intel');
      }

      const report = response.data ? normalizeAthleteIntelReport(response.data) : null;
      this.logger.info('Athlete Intel fetched', { userId, hasReport: !!report });
      return report;
    } catch (error) {
      this.logger.error('Failed to fetch athlete Intel', error, { userId });
      throw error;
    }
  }

  async generateAthleteIntel(userId: string): Promise<AthleteIntelReport> {
    this.logger.info('Generating athlete Intel', { userId });

    try {
      const url = `${this.baseUrl}/auth/profile/${encodeURIComponent(userId)}/intel/generate`;
      const response = await firstValueFrom(
        this.http.post<IntelGenerateResponse<AthleteIntelReport>>(url, {})
      );

      const responseData = response.data as unknown;
      const payload =
        responseData &&
        typeof responseData === 'object' &&
        'data' in (responseData as Record<string, unknown>)
          ? ((responseData as Record<string, unknown>)['data'] as AthleteIntelReport | undefined)
          : (responseData as AthleteIntelReport | undefined);

      if (!response.success || !payload) {
        throw new Error(response.error ?? 'Failed to generate athlete Intel');
      }

      const report = normalizeAthleteIntelReport(payload);
      this.logger.info('Athlete Intel generated', { userId, reportId: response.reportId });
      return report;
    } catch (error) {
      this.logger.error('Failed to generate athlete Intel', error, { userId });
      throw error;
    }
  }

  // ── Team Intel ─────────────────────────────────────────────────────────

  async getTeamIntel(teamId: string): Promise<TeamIntelReport | null> {
    this.logger.debug('Fetching team Intel', { teamId });

    try {
      const url = `${this.baseUrl}/teams/${encodeURIComponent(teamId)}/intel`;
      const response = await firstValueFrom(
        this.http.get<IntelReportResponse<TeamIntelReport>>(url)
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to fetch team Intel');
      }

      const report = response.data ? normalizeTeamIntelReport(response.data) : null;
      this.logger.info('Team Intel fetched', { teamId, hasReport: !!report });
      return report;
    } catch (error) {
      this.logger.error('Failed to fetch team Intel', error, { teamId });
      throw error;
    }
  }

  async generateTeamIntel(teamId: string): Promise<TeamIntelReport> {
    this.logger.info('Generating team Intel', { teamId });

    try {
      const url = `${this.baseUrl}/teams/${encodeURIComponent(teamId)}/intel/generate`;
      const response = await firstValueFrom(
        this.http.post<IntelGenerateResponse<TeamIntelReport>>(url, {})
      );

      const responseData = response.data as unknown;
      const payload =
        responseData &&
        typeof responseData === 'object' &&
        'data' in (responseData as Record<string, unknown>)
          ? ((responseData as Record<string, unknown>)['data'] as TeamIntelReport | undefined)
          : (responseData as TeamIntelReport | undefined);

      if (!response.success || !payload) {
        throw new Error(response.error ?? 'Failed to generate team Intel');
      }

      const report = normalizeTeamIntelReport(payload);
      this.logger.info('Team Intel generated', { teamId, reportId: response.reportId });
      return report;
    } catch (error) {
      this.logger.error('Failed to generate team Intel', error, { teamId });
      throw error;
    }
  }
}
