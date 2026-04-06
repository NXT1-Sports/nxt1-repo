/**
 * @fileoverview Intel API Client
 * @module @nxt1/ui/intel/api
 *
 * HTTP client for Intel report endpoints (athlete + team).
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
  IntelRosterProspect,
  IntelSeasonSummary,
  IntelTierClassification,
} from '@nxt1/core';
import { Injectable, inject, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NxtLoggingService } from '../services/logging/logging.service';

const INTEL_TIER_CLASSIFICATIONS = [
  'Elite',
  'Premium',
  'Rising',
  'Developing',
  'On Radar',
] as const satisfies readonly IntelTierClassification[];

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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function toNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>((acc, [key, entry]) => {
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      acc[key] = entry;
    }
    return acc;
  }, {});
}

function normalizeTierClassification(value: unknown): IntelTierClassification {
  return typeof value === 'string' &&
    INTEL_TIER_CLASSIFICATIONS.includes(value as IntelTierClassification)
    ? (value as IntelTierClassification)
    : 'Developing';
}

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

function normalizeTopProspects(value: unknown): readonly IntelRosterProspect[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      userId: typeof item['userId'] === 'string' ? item['userId'] : '',
      name: typeof item['name'] === 'string' ? item['name'] : '',
      position: typeof item['position'] === 'string' ? item['position'] : '',
      classYear: typeof item['classYear'] === 'string' ? item['classYear'] : '',
      overallScore:
        typeof item['overallScore'] === 'number' && Number.isFinite(item['overallScore'])
          ? item['overallScore']
          : 0,
      tierClassification: normalizeTierClassification(item['tierClassification']),
      profileCode: typeof item['profileCode'] === 'string' ? item['profileCode'] : undefined,
    })) satisfies readonly IntelRosterProspect[];
}

function normalizeSeasonHistory(value: unknown): readonly IntelSeasonSummary[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      season: typeof item['season'] === 'string' ? item['season'] : '',
      record: typeof item['record'] === 'string' ? item['record'] : '',
      highlights: toStringArray(item['highlights']),
      conference: typeof item['conference'] === 'string' ? item['conference'] : undefined,
    })) satisfies readonly IntelSeasonSummary[];
}

function normalizeCitations(value: unknown): readonly IntelCitation[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      platform: normalizeDataSource(item['platform']),
      label: typeof item['label'] === 'string' ? item['label'] : 'Source',
      url: typeof item['url'] === 'string' ? item['url'] : undefined,
      lastSyncedAt: typeof item['lastSyncedAt'] === 'string' ? item['lastSyncedAt'] : undefined,
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

function normalizeTeamIntelReport(report: TeamIntelReport): TeamIntelReport {
  const raw = report as Partial<TeamIntelReport> & Record<string, unknown>;

  return {
    ...report,
    teamName: typeof raw.teamName === 'string' ? raw.teamName : '',
    sport: typeof raw.sport === 'string' ? raw.sport : '',
    overallRecord: typeof raw.overallRecord === 'string' ? raw.overallRecord : '',
    seasonOutlook: typeof raw.seasonOutlook === 'string' ? raw.seasonOutlook : '',
    teamIdentity: typeof raw.teamIdentity === 'string' ? raw.teamIdentity : '',
    strengths: toStringArray(raw.strengths),
    areasForImprovement: toStringArray(raw.areasForImprovement),
    topProspects: normalizeTopProspects(raw.topProspects),
    rosterDepthSummary: typeof raw.rosterDepthSummary === 'string' ? raw.rosterDepthSummary : '',
    classBreakdown: toNumberRecord(raw.classBreakdown),
    seasonHistory: normalizeSeasonHistory(raw.seasonHistory),
    historicalNarrative: typeof raw.historicalNarrative === 'string' ? raw.historicalNarrative : '',
    recruitingPipeline: typeof raw.recruitingPipeline === 'string' ? raw.recruitingPipeline : '',
    competitiveAnalysis: typeof raw.competitiveAnalysis === 'string' ? raw.competitiveAnalysis : '',
    citations: normalizeCitations(raw.citations),
    missingDataPrompts: normalizeMissingDataPrompts(raw.missingDataPrompts),
    quickCommands: normalizeQuickCommands(raw.quickCommands),
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

      this.logger.info('Athlete Intel fetched', { userId, hasReport: !!response.data });
      return response.data ?? null;
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

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to generate athlete Intel');
      }

      this.logger.info('Athlete Intel generated', { userId, reportId: response.reportId });
      return response.data;
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

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to generate team Intel');
      }

      const report = normalizeTeamIntelReport(response.data);
      this.logger.info('Team Intel generated', { teamId, reportId: response.reportId });
      return report;
    } catch (error) {
      this.logger.error('Failed to generate team Intel', error, { teamId });
      throw error;
    }
  }
}
