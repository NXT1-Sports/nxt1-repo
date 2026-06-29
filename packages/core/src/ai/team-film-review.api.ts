/**
 * @fileoverview Team Film Review API Factory
 * @module @nxt1/core/ai
 *
 * Pure TypeScript API for Agent X film review workflows.
 * Portable across web, mobile, and backend runtimes.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type { AgentXAttachment } from './agent-x.types';
import type {
  TeamFilmReviewDownloadExport,
  TeamFilmReviewDoc,
  TeamFilmReviewPlaylistDoc,
  TeamFilmReviewPlaySegment,
  TeamFilmReviewSourceVideo,
  TeamFilmReviewTimelineTag,
  TeamFilmReviewUploadMode,
} from '../models/team/team-film-review.model';

interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

export interface ListTeamFilmReviewsRequest {
  readonly teamId?: string;
  readonly sport?: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
}

export interface ListTeamFilmReviewsResponse {
  readonly filmReviews: readonly TeamFilmReviewDoc[];
  readonly count: number;
}

export interface ListFilmReviewPlaylistsRequest {
  readonly teamId?: string;
}

export interface ListFilmReviewPlaylistsResponse {
  readonly playlists: readonly TeamFilmReviewPlaylistDoc[];
  readonly count: number;
}

export interface CreateFilmReviewPlaylistRequest {
  readonly id?: string;
  readonly teamId?: string;
  readonly name: string;
  readonly parentId?: string | null;
  readonly sortOrder?: number;
}

export interface UpdateFilmReviewPlaylistRequest {
  readonly name?: string;
  readonly parentId?: string | null;
  readonly sortOrder?: number;
}

export interface DeleteFilmReviewPlaylistResponse {
  readonly message: string;
  readonly unassignedReviewCount?: number;
  readonly reparentedChildCount?: number;
}

export interface CreateTeamFilmReviewRequest {
  readonly teamId?: string;
  readonly sport: string;
  readonly title: string;
  readonly fileId?: string;
  readonly attachment?: AgentXAttachment;
  readonly videoUrl?: string;
  readonly uploadMode?: TeamFilmReviewUploadMode;
  readonly sources?: readonly TeamFilmReviewSourceVideo[];
  readonly storagePath?: string;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly source?: string;
  readonly sourceUrl?: string;
  readonly thumbnailUrl?: string;
  readonly opponentName?: string;
  readonly gameDate?: string;
  readonly playlistId?: string | null;
  readonly playlistName?: string | null;
  readonly perspective?: TeamFilmReviewDoc['perspective'];
  readonly durationSec?: number;
  readonly keyInsights?: readonly string[];
  readonly tags?: readonly string[];
  readonly timeline?: readonly TeamFilmReviewPlaySegment[];
}

export interface UpdateTeamFilmReviewRequest {
  readonly title?: string;
  readonly sport?: string;
  readonly opponentName?: string;
  readonly gameDate?: string;
  readonly playlistId?: string | null;
  readonly playlistName?: string | null;
  readonly status?: TeamFilmReviewDoc['status'];
  readonly perspective?: TeamFilmReviewDoc['perspective'];
  readonly videoUrl?: string;
  readonly storagePath?: string;
  readonly thumbnailUrl?: string;
  readonly durationSec?: number;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly sourceUrl?: string;
  readonly uploadMode?: TeamFilmReviewUploadMode;
  readonly sources?: readonly TeamFilmReviewSourceVideo[];
  readonly aiSummary?: string;
  readonly keyInsights?: readonly string[];
  readonly tags?: readonly string[];
  readonly timeline?: readonly TeamFilmReviewPlaySegment[];
}

export interface AddFilmReviewAnnotationRequest {
  readonly note: string;
  readonly atSec: number;
  readonly color?: string;
}

export interface RefreshFilmReviewAiResponse {
  readonly aiSummary: string;
  readonly aiTags: readonly TeamFilmReviewTimelineTag[];
  readonly keyInsights: readonly string[];
}

export interface ImportFilmReviewBreakdownResponse {
  readonly filmReview: TeamFilmReviewDoc;
  readonly playCount: number;
  readonly rowCount: number;
  readonly sheetName?: string;
  readonly warnings: readonly string[];
}

export interface RequestFilmReviewDownloadExportResponse {
  readonly exportState?: TeamFilmReviewDownloadExport;
  readonly downloadUrl?: string;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && `${value}`.trim().length > 0) {
      query.set(key, String(value));
    }
  }
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

function ensureSuccess<T>(response: ApiResponse<T>, fallbackMessage: string): T {
  if (!response.success || !response.data) {
    throw new Error(response.error ?? fallbackMessage);
  }
  return response.data;
}

export function createTeamFilmReviewApi(http: HttpAdapter, baseUrl: string) {
  const playlistsEndpoint = `${baseUrl}/film-review-playlists`;

  return {
    async listPlaylistsPage(
      request: ListFilmReviewPlaylistsRequest
    ): Promise<ListFilmReviewPlaylistsResponse> {
      const query = buildQuery({ teamId: request.teamId });
      const response = await http.get<ApiResponse<ListFilmReviewPlaylistsResponse>>(
        `${playlistsEndpoint}${query}`
      );
      return ensureSuccess(response, 'Failed to load film review playlists');
    },

    async listPlaylists(
      request: ListFilmReviewPlaylistsRequest
    ): Promise<readonly TeamFilmReviewPlaylistDoc[]> {
      return (await this.listPlaylistsPage(request)).playlists;
    },

    async createPlaylist(
      request: CreateFilmReviewPlaylistRequest
    ): Promise<TeamFilmReviewPlaylistDoc> {
      const response = await http.post<ApiResponse<{ playlist: TeamFilmReviewPlaylistDoc }>>(
        playlistsEndpoint,
        request
      );
      return ensureSuccess(response, 'Failed to create film review playlist').playlist;
    },

    async updatePlaylist(
      playlistId: string,
      request: UpdateFilmReviewPlaylistRequest
    ): Promise<TeamFilmReviewPlaylistDoc> {
      const response = await http.patch<ApiResponse<{ playlist: TeamFilmReviewPlaylistDoc }>>(
        `${playlistsEndpoint}/${encodeURIComponent(playlistId)}`,
        request
      );
      return ensureSuccess(response, 'Failed to update film review playlist').playlist;
    },

    async deletePlaylist(playlistId: string): Promise<DeleteFilmReviewPlaylistResponse> {
      const response = await http.delete<ApiResponse<DeleteFilmReviewPlaylistResponse>>(
        `${playlistsEndpoint}/${encodeURIComponent(playlistId)}`
      );
      return ensureSuccess(response, 'Failed to delete film review playlist');
    },
  } as const;
}

export type TeamFilmReviewApi = ReturnType<typeof createTeamFilmReviewApi>;
