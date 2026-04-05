/**
 * @fileoverview Intel API Factory — Pure TypeScript
 * @module @nxt1/core/intel
 *
 * 100% portable HttpAdapter-based API factory for Intel reports.
 * Works on web (Angular HttpClient), mobile (CapacitorHttp), and backend.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  AthleteIntelReport,
  TeamIntelReport,
  IntelReportResponse,
  IntelGenerateResponse,
} from './intel.types';

/**
 * Create the Intel API client.
 *
 * @param http - Platform-agnostic HTTP adapter
 * @param baseUrl - API base URL (e.g. `https://api.nxt1sports.com/api/v1`)
 */
export function createIntelApi(http: HttpAdapter, baseUrl: string) {
  return {
    // ── Athlete Intel ──

    /** Fetch the stored athlete Intel report. */
    async getAthleteIntel(userId: string): Promise<AthleteIntelReport | null> {
      const res = await http.get<IntelReportResponse<AthleteIntelReport>>(
        `${baseUrl}/auth/profile/${userId}/intel`
      );
      if (!res.success) return null;
      return res.data ?? null;
    },

    /** Trigger a new athlete Intel generation (manual, on-demand). */
    async generateAthleteIntel(userId: string): Promise<IntelGenerateResponse> {
      const res = await http.post<IntelGenerateResponse>(
        `${baseUrl}/auth/profile/${userId}/intel/generate`,
        {}
      );
      if (!res.success) {
        throw new Error(res.error ?? 'Failed to generate athlete intel');
      }
      return res;
    },

    // ── Team Intel ──

    /** Fetch the stored team Intel report. */
    async getTeamIntel(teamId: string): Promise<TeamIntelReport | null> {
      const res = await http.get<IntelReportResponse<TeamIntelReport>>(
        `${baseUrl}/teams/${teamId}/intel`
      );
      if (!res.success) return null;
      return res.data ?? null;
    },

    /** Trigger a new team Intel generation (manual, on-demand). */
    async generateTeamIntel(teamId: string): Promise<IntelGenerateResponse> {
      const res = await http.post<IntelGenerateResponse>(
        `${baseUrl}/teams/${teamId}/intel/generate`,
        {}
      );
      if (!res.success) {
        throw new Error(res.error ?? 'Failed to generate team intel');
      }
      return res;
    },
  } as const;
}

export type IntelApi = ReturnType<typeof createIntelApi>;
