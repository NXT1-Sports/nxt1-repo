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
  TeamFilmReviewDrawing,
  TeamFilmReviewDoc,
  TeamFilmReviewPlaylistDoc,
  TeamFilmReviewPlaySegment,
  TeamFilmReviewSourceVideo,
  TeamFilmReviewTimelineTag,
  TeamFilmReviewUploadMode,
} from '../models/team/team-film-review.model';
import type {
  TeamFilmTrackingCapability,
  TeamFilmTrackingCorrection,
  TeamFilmTrackingFrame,
  TeamFilmTrackingManifest,
  TeamFilmTrackingMode,
  TeamFilmTrackingProgress,
  TeamFilmTrackingScope,
  TeamFilmTrackingStatus,
  TeamFilmTrackingTimeRange,
} from '../models/team/team-film-tracking.model';

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
  readonly expectedRevision?: number;
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
  readonly expectedRevision?: number;
  readonly note: string;
  readonly atSec: number;
  readonly color?: string;
}

export interface RefreshFilmReviewAiResponse {
  readonly aiSummary: string;
  readonly aiTags: readonly TeamFilmReviewTimelineTag[];
  readonly keyInsights: readonly string[];
  readonly reviewRevision: number;
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

export interface ListFilmReviewDrawingsRequest {
  readonly teamId?: string;
  readonly playId: string;
  readonly sourceId?: string;
}

export interface CreateFilmReviewDrawingRequest {
  readonly teamId?: string;
  readonly playId: string;
  readonly sourceId?: string;
  readonly kind: TeamFilmReviewDrawing['kind'];
  readonly bounds: TeamFilmReviewDrawing['bounds'];
  readonly activeFromSec?: number;
  readonly activeUntilSec?: number;
  readonly strokeCount?: number;
  readonly points?: TeamFilmReviewDrawing extends infer Drawing
    ? Drawing extends { readonly points: infer Points }
      ? Points
      : never
    : never;
  readonly strokeStartIndexes?: readonly number[];
  readonly text?: string;
}

export interface UpdateFilmReviewDrawingRequest extends CreateFilmReviewDrawingRequest {
  readonly expectedRevision: number;
}

export interface RequestFilmReviewTrackingRequest {
  readonly teamId?: string;
  readonly sourceId?: string;
  readonly playIds?: readonly string[];
  readonly scope: TeamFilmTrackingScope;
  readonly mode: TeamFilmTrackingMode;
  readonly sport?: string;
  readonly force?: boolean;
}

export interface RequestFilmReviewTrackingResponse {
  readonly jobId: string;
  readonly status: TeamFilmTrackingStatus;
  readonly capability?: TeamFilmTrackingCapability;
  readonly progress?: TeamFilmTrackingProgress;
}

export interface GetFilmReviewTrackingStatusRequest {
  readonly teamId?: string;
  readonly sourceId?: string;
}

export interface GetFilmReviewTrackingStatusResponse {
  readonly status: TeamFilmTrackingStatus;
  readonly capability?: TeamFilmTrackingCapability;
  readonly progress?: TeamFilmTrackingProgress | null;
  readonly manifest?: TeamFilmTrackingManifest | null;
  readonly error?: string | null;
}

export interface GetFilmReviewTrackingWindowRequest {
  readonly teamId?: string;
  readonly sourceId?: string;
  readonly startSec: number;
  readonly endSec: number;
}

export interface FilmReviewTrackingWindowResponse {
  readonly manifest: TeamFilmTrackingManifest;
  readonly timeRange: TeamFilmTrackingTimeRange;
  readonly frames: readonly TeamFilmTrackingFrame[];
}

export interface CreateFilmReviewTrackingCorrectionRequest {
  readonly teamId?: string;
  readonly sourceId?: string;
  readonly trackId: string;
  readonly field: TeamFilmTrackingCorrection['field'];
  readonly value?: string | null;
  readonly expectedRevision: number;
}

export interface CreateFilmReviewTrackingCorrectionResponse {
  readonly correction: TeamFilmTrackingCorrection;
  readonly revision: number;
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
  const drawingsEndpoint = (fileId: string) =>
    `${baseUrl}/files/${encodeURIComponent(fileId)}/film-review/drawings`;
  const trackingEndpoint = (fileId: string) =>
    `${baseUrl}/files/${encodeURIComponent(fileId)}/film-review/tracking`;

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

    async listDrawings(
      fileId: string,
      request: ListFilmReviewDrawingsRequest
    ): Promise<readonly TeamFilmReviewDrawing[]> {
      const query = buildQuery({
        teamId: request.teamId,
        playId: request.playId,
        sourceId: request.sourceId,
      });
      const response = await http.get<ApiResponse<{ drawings: readonly TeamFilmReviewDrawing[] }>>(
        `${drawingsEndpoint(fileId)}${query}`
      );
      return ensureSuccess(response, 'Failed to load film review drawings').drawings;
    },

    async createDrawing(
      fileId: string,
      request: CreateFilmReviewDrawingRequest
    ): Promise<TeamFilmReviewDrawing> {
      const response = await http.post<ApiResponse<{ drawing: TeamFilmReviewDrawing }>>(
        drawingsEndpoint(fileId),
        request
      );
      return ensureSuccess(response, 'Failed to create film review drawing').drawing;
    },

    async updateDrawing(
      fileId: string,
      drawingId: string,
      request: UpdateFilmReviewDrawingRequest
    ): Promise<TeamFilmReviewDrawing> {
      const response = await http.patch<ApiResponse<{ drawing: TeamFilmReviewDrawing }>>(
        `${drawingsEndpoint(fileId)}/${encodeURIComponent(drawingId)}`,
        request
      );
      return ensureSuccess(response, 'Failed to update film review drawing').drawing;
    },

    async deleteDrawing(
      fileId: string,
      drawingId: string,
      request: Pick<ListFilmReviewDrawingsRequest, 'teamId'> & { readonly expectedRevision: number }
    ): Promise<void> {
      const query = buildQuery({
        teamId: request.teamId,
        expectedRevision: request.expectedRevision,
      });
      const response = await http.delete<ApiResponse<Record<string, never>>>(
        `${drawingsEndpoint(fileId)}/${encodeURIComponent(drawingId)}${query}`
      );
      ensureSuccess(response, 'Failed to delete film review drawing');
    },

    async requestTracking(
      fileId: string,
      request: RequestFilmReviewTrackingRequest
    ): Promise<RequestFilmReviewTrackingResponse> {
      const response = await http.post<ApiResponse<RequestFilmReviewTrackingResponse>>(
        trackingEndpoint(fileId),
        request
      );
      return ensureSuccess(response, 'Failed to request film tracking');
    },

    async getTrackingStatus(
      fileId: string,
      request: GetFilmReviewTrackingStatusRequest = {}
    ): Promise<GetFilmReviewTrackingStatusResponse> {
      const query = buildQuery({ teamId: request.teamId, sourceId: request.sourceId });
      const response = await http.get<ApiResponse<GetFilmReviewTrackingStatusResponse>>(
        `${trackingEndpoint(fileId)}${query}`
      );
      return ensureSuccess(response, 'Failed to load film tracking status');
    },

    async getTrackingWindow(
      fileId: string,
      request: GetFilmReviewTrackingWindowRequest
    ): Promise<FilmReviewTrackingWindowResponse> {
      const query = buildQuery({
        teamId: request.teamId,
        sourceId: request.sourceId,
        startSec: request.startSec,
        endSec: request.endSec,
      });
      const response = await http.get<ApiResponse<FilmReviewTrackingWindowResponse>>(
        `${trackingEndpoint(fileId)}/window${query}`
      );
      return ensureSuccess(response, 'Failed to load film tracking window');
    },

    async createTrackingCorrection(
      fileId: string,
      request: CreateFilmReviewTrackingCorrectionRequest
    ): Promise<CreateFilmReviewTrackingCorrectionResponse> {
      const response = await http.post<ApiResponse<CreateFilmReviewTrackingCorrectionResponse>>(
        `${trackingEndpoint(fileId)}/corrections`,
        request
      );
      return ensureSuccess(response, 'Failed to save film tracking correction');
    },
  } as const;
}

export type TeamFilmReviewApi = ReturnType<typeof createTeamFilmReviewApi>;
