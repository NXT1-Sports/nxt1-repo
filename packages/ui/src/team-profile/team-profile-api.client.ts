/**
 * @fileoverview Team Profile API Client
 * @module @nxt1/ui/team-profile/api
 *
 * HTTP client for team profile endpoints with:
 * - Type-safe requests/responses
 * - Error handling
 * - Loading states
 * - Cache integration
 */

import type { TeamProfilePageData } from '@nxt1/core';
import { Injectable, inject, InjectionToken } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NxtLoggingService } from '../services/logging/logging.service';

// ============================================
// INJECTION TOKENS
// ============================================

/**
 * Injection token for Team Profile API base URL.
 * Apps should provide this in their config:
 *
 * ```typescript
 * { provide: TEAM_PROFILE_API_BASE_URL, useValue: environment.apiURL }
 * ```
 */
export const TEAM_PROFILE_API_BASE_URL = new InjectionToken<string>('TEAM_PROFILE_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1', // Default fallback
});

// ============================================
// TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    cached?: boolean;
    timestamp?: string;
  };
  error?: string;
}

export interface TeamProfileApiError {
  message: string;
  code?: string;
  status?: number;
}

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class TeamProfileApiClient {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(NxtLoggingService).child('TeamProfileApiClient');
  private readonly baseUrl = inject(TEAM_PROFILE_API_BASE_URL);

  /**
   * Get team profile by slug
   * GET /api/v1/teams/by-slug/:slug
   */
  async getTeamBySlug(slug: string): Promise<TeamProfilePageData> {
    if (!slug) {
      throw new Error('Team slug is required');
    }

    this.logger.debug('Fetching team profile', { slug });

    try {
      const url = `${this.baseUrl}/teams/by-slug/${encodeURIComponent(slug)}`;

      const response = await firstValueFrom(this.http.get<ApiResponse<TeamProfilePageData>>(url));

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch team profile');
      }

      const cached = response.meta?.cached || false;

      this.logger.info('Team profile fetched', {
        slug,
        teamId: response.data.team.id,
        cached,
        rosterCount: response.data.roster.length,
      });

      return response.data;
    } catch (error) {
      const apiError = this.handleError(error);
      this.logger.error('Failed to fetch team profile', error, {
        slug,
        status: apiError.status,
        code: apiError.code,
      });
      throw apiError;
    }
  }

  /**
   * Get team profile by Firestore document ID
   * GET /api/v1/teams/by-id/:id
   * Prefer this over getTeamBySlug when you have the exact team ID —
   * avoids ambiguity when multiple teams share the same name/slug.
   */
  async getTeamById(teamId: string): Promise<TeamProfilePageData> {
    if (!teamId) {
      throw new Error('Team ID is required');
    }

    this.logger.debug('Fetching team profile by ID', { teamId });

    try {
      const url = `${this.baseUrl}/teams/by-id/${encodeURIComponent(teamId)}`;

      const response = await firstValueFrom(this.http.get<ApiResponse<TeamProfilePageData>>(url));

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch team profile');
      }

      const cached = response.meta?.cached || false;

      this.logger.info('Team profile fetched by ID', {
        teamId,
        cached,
        rosterCount: response.data.roster.length,
      });

      return response.data;
    } catch (error) {
      const apiError = this.handleError(error);
      this.logger.error('Failed to fetch team profile by ID', error, {
        teamId,
        status: apiError.status,
        code: apiError.code,
      });
      throw apiError;
    }
  }

  /**
   * Increment team page view
   * POST /api/v1/teams/:id/view
   */
  async incrementTeamView(teamId: string): Promise<void> {
    if (!teamId) return;

    try {
      const url = `${this.baseUrl}/teams/${teamId}/view`;

      await firstValueFrom(this.http.post<ApiResponse<{ message: string }>>(url, {}));

      this.logger.debug('Team view incremented', { teamId });
    } catch (error) {
      // Don't throw - view tracking is non-critical
      this.logger.warn('Failed to increment team view', { teamId, error });
    }
  }

  /**
   * Handle API errors
   */
  private handleError(error: unknown): TeamProfileApiError {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.error || error.message || 'Unknown error occurred';
      return {
        message,
        code: error.error?.code,
        status: error.status,
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
      };
    }

    return {
      message: 'An unexpected error occurred',
    };
  }
}
