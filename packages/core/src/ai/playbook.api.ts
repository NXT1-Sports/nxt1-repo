/**
 * @fileoverview Team Playbook API Factory
 * @module @nxt1/core/ai/playbook.api
 *
 * 100% portable pure TypeScript API factory for Team Playbooks and Plays.
 * Works across web, mobile, and backend without framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { HttpAdapter } from '../api/http-adapter.js';

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Standard API response wrapper.
 */
interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

/**
 * Play structure (matches backend data model)
 */
export interface PlayItem {
  readonly name: string;
  readonly series?: string;
  readonly category?: string;
  readonly formation?: string;
  readonly personnel?: string;
  readonly downDistance?: string;
  readonly objective?: string;
  readonly playBreakdown?: string;
  readonly installNotes?: string;
  readonly diagramUrl?: string;
  readonly diagramAssetId?: string;
  readonly videoUrl?: string;
  readonly conceptTags?: readonly string[];
  readonly tags?: readonly string[];
  readonly installStage?: 'install' | 'rep' | 'game-ready';
  readonly coachingPoints?: readonly string[];
  readonly commonBusts?: readonly string[];
  readonly correctionCues?: readonly string[];
  readonly drillProgression?: readonly string[];
  readonly situations?: readonly string[];
}

/**
 * Request type for creating a play
 */
export type CreatePlayRequest = PlayItem;

/**
 * Response type for play creation
 */
export interface CreatePlayResponse {
  readonly play: PlayItem;
  readonly playCount: number;
  readonly playbookId: string;
}

/**
 * Request type for updating a play
 */
export type UpdatePlayRequest = Partial<PlayItem>;

/**
 * Response type for play update
 */
export interface UpdatePlayResponse {
  readonly play: PlayItem;
  readonly playbookId: string;
}

/**
 * Response type for play deletion
 */
export interface DeletePlayResponse {
  readonly playCount: number;
  readonly playbookId: string;
}

/**
 * Creates a portable API for Team Playbooks and Plays.
 * Intended to be used with HttpAdapter implementations across web, mobile, and backend.
 *
 * @param http HttpAdapter for making HTTP requests
 * @param baseUrl Base URL for the API endpoint (e.g., https://api.example.com)
 * @returns Object with methods for play CRUD operations
 *
 * @example
 * // Web (with Angular HttpClient)
 * const httpAdapter = {
 *   get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
 *   post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
 *   put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
 *   patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
 *   delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
 * };
 * const playbookApi = createPlaybookApi(httpAdapter, environment.apiUrl);
 *
 * // Mobile (with Capacitor)
 * const httpAdapter = {
 *   get: async <T>(url: string) => (await CapacitorHttp.get({ url })).data as T,
 *   post: async <T>(url: string, data: unknown) => (await CapacitorHttp.post({ url, data: data as object })).data as T,
 *   patch: async <T>(url: string, data: unknown) => (await CapacitorHttp.patch({ url, data: data as object })).data as T,
 *   delete: async <T>(url: string) => (await CapacitorHttp.delete({ url })).data as T,
 * };
 * const playbookApi = createPlaybookApi(httpAdapter, baseUrl);
 */
export function createPlaybookApi(http: HttpAdapter, baseUrl: string) {
  const playbooksEndpoint = `${baseUrl}/playbooks`;

  return {
    /**
     * Create a new play in a playbook
     * POST /playbooks/:playbookId/plays
     */
    async createPlay(playbookId: string, playData: CreatePlayRequest): Promise<PlayItem> {
      const endpoint = `${playbooksEndpoint}/${playbookId}/plays`;
      const response = await http.post<ApiResponse<CreatePlayResponse>>(endpoint, playData);

      if (!response.success || !response.data?.play) {
        throw new Error(response.error ?? 'Failed to create play');
      }

      return response.data.play;
    },

    /**
     * Update an existing play in a playbook
     * PATCH /playbooks/:playbookId/plays/:playIndex
     */
    async updatePlay(
      playbookId: string,
      playIndex: number,
      playData: UpdatePlayRequest
    ): Promise<PlayItem> {
      const endpoint = `${playbooksEndpoint}/${playbookId}/plays/${playIndex}`;
      const response = await http.patch<ApiResponse<UpdatePlayResponse>>(endpoint, playData);

      if (!response.success || !response.data?.play) {
        throw new Error(response.error ?? 'Failed to update play');
      }

      return response.data.play;
    },

    /**
     * Delete a play from a playbook
     * DELETE /playbooks/:playbookId/plays/:playIndex
     */
    async deletePlay(playbookId: string, playIndex: number): Promise<void> {
      const endpoint = `${playbooksEndpoint}/${playbookId}/plays/${playIndex}`;
      const response = await http.delete<ApiResponse<DeletePlayResponse>>(endpoint);

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to delete play');
      }
    },
  } as const;
}

export type PlaybookApi = ReturnType<typeof createPlaybookApi>;
