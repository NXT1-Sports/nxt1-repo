/**
 * @fileoverview Release Notes API Factory
 * @module @nxt1/core/release-notes
 * @version 1.0.0
 *
 * Pure TypeScript API factory for fetching system release notes and changelogs.
 * 100% portable — zero platform dependencies.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  SystemReleaseNote,
  ReleaseNotesHistoryQuery,
  LatestReleaseNoteResponse,
  ReleaseNotesHistoryResponse,
} from './release-notes.types';

/**
 * Release Notes API interface.
 */
export interface ReleaseNotesApi {
  /**
   * Fetch the latest published release note.
   * Returns null if no release note is published.
   */
  getLatest(): Promise<SystemReleaseNote | null>;

  /**
   * Fetch paginated history of published release notes.
   */
  getHistory(query?: ReleaseNotesHistoryQuery): Promise<ReleaseNotesHistoryResponse>;
}

/**
 * Factory function to create a ReleaseNotesApi instance.
 *
 * @param http - Platform-agnostic HTTP adapter
 * @param baseUrl - API base URL (e.g. "https://api.nxt1sports.com" or "/api/v1")
 */
export function createReleaseNotesApi(http: HttpAdapter, baseUrl: string): ReleaseNotesApi {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const endpoint = `${cleanBaseUrl}/system/release-notes`;

  return {
    async getLatest(): Promise<SystemReleaseNote | null> {
      try {
        const response = await http.get<LatestReleaseNoteResponse>(`${endpoint}/latest`);
        if (!response.success) {
          throw new Error(response.error ?? 'Failed to fetch latest release note');
        }
        return response.data ?? null;
      } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
      }
    },

    async getHistory(query?: ReleaseNotesHistoryQuery): Promise<ReleaseNotesHistoryResponse> {
      try {
        const params: Record<string, string | number> = {};
        if (query?.limit !== undefined) params['limit'] = query.limit;
        if (query?.cursor !== undefined) params['cursor'] = query.cursor;

        const response = await http.get<ReleaseNotesHistoryResponse>(`${endpoint}/history`, {
          params,
        });

        if (!response.success) {
          throw new Error(response.error ?? 'Failed to fetch release notes history');
        }

        return response;
      } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  };
}
