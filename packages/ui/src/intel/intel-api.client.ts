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
} from '@nxt1/core';
import { Injectable, inject, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NxtLoggingService } from '../services/logging/logging.service';

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

      this.logger.info('Team Intel fetched', { teamId, hasReport: !!response.data });
      return response.data ?? null;
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

      this.logger.info('Team Intel generated', { teamId, reportId: response.reportId });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to generate team Intel', error, { teamId });
      throw error;
    }
  }
}
