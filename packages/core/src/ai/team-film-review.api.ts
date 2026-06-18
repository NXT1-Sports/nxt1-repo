/**
 * @fileoverview Team Film Review API Factory
 * @module @nxt1/core/ai
 *
 * Pure TypeScript API for Agent X film review workflows.
 * Portable across web, mobile, and backend runtimes.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  TeamFilmReviewAnnotation,
  TeamFilmReviewDoc,
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

export interface CreateTeamFilmReviewRequest {
  readonly teamId: string;
  readonly sport: string;
  readonly title: string;
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

export interface GenerateTimelineRequest {
  readonly durationSec?: number;
}

export interface GenerateTimelineResponse {
  readonly status: 'queued' | 'processing' | 'ready' | 'error';
  readonly timelineState: string;
  readonly message?: string;
}

export interface ImportFilmReviewBreakdownResponse {
  readonly filmReview: TeamFilmReviewDoc;
  readonly playCount: number;
  readonly rowCount: number;
  readonly sheetName?: string;
  readonly warnings: readonly string[];
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
  const endpoint = `${baseUrl}/film-reviews`;

  return {
    async listFilmReviewsPage(
      request: ListTeamFilmReviewsRequest = {}
    ): Promise<ListTeamFilmReviewsResponse> {
      const query = buildQuery({
        teamId: request.teamId,
        sport: request.sport,
        includeArchived: request.includeArchived,
        limit: request.limit,
      });

      const response = await http.get<ApiResponse<ListTeamFilmReviewsResponse>>(
        `${endpoint}${query}`
      );
      return ensureSuccess(response, 'Failed to load film reviews');
    },

    async listFilmReviews(
      request: ListTeamFilmReviewsRequest = {}
    ): Promise<readonly TeamFilmReviewDoc[]> {
      return (await this.listFilmReviewsPage(request)).filmReviews;
    },

    async getFilmReview(reviewId: string, teamId?: string): Promise<TeamFilmReviewDoc> {
      const query = buildQuery({ teamId });
      const response = await http.get<ApiResponse<{ filmReview: TeamFilmReviewDoc }>>(
        `${endpoint}/${encodeURIComponent(reviewId)}${query}`
      );
      return ensureSuccess(response, 'Failed to load film review').filmReview;
    },

    async createFilmReview(request: CreateTeamFilmReviewRequest): Promise<TeamFilmReviewDoc> {
      const response = await http.post<ApiResponse<{ filmReview: TeamFilmReviewDoc }>>(
        endpoint,
        request
      );
      return ensureSuccess(response, 'Failed to create film review').filmReview;
    },

    async updateFilmReview(
      reviewId: string,
      request: UpdateTeamFilmReviewRequest
    ): Promise<TeamFilmReviewDoc> {
      const response = await http.patch<ApiResponse<{ filmReview: TeamFilmReviewDoc }>>(
        `${endpoint}/${encodeURIComponent(reviewId)}`,
        request
      );
      return ensureSuccess(response, 'Failed to update film review').filmReview;
    },

    async deleteFilmReview(reviewId: string): Promise<void> {
      const response = await http.delete<ApiResponse<{ message: string }>>(
        `${endpoint}/${encodeURIComponent(reviewId)}`
      );
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to delete film review');
      }
    },

    async addAnnotation(
      reviewId: string,
      request: AddFilmReviewAnnotationRequest
    ): Promise<readonly TeamFilmReviewAnnotation[]> {
      const response = await http.post<
        ApiResponse<{ annotations: readonly TeamFilmReviewAnnotation[] }>
      >(`${endpoint}/${encodeURIComponent(reviewId)}/annotations`, request);
      return ensureSuccess(response, 'Failed to add annotation').annotations;
    },

    async deleteAnnotation(
      reviewId: string,
      annotationId: string
    ): Promise<readonly TeamFilmReviewAnnotation[]> {
      const response = await http.delete<
        ApiResponse<{ annotations: readonly TeamFilmReviewAnnotation[] }>
      >(
        `${endpoint}/${encodeURIComponent(reviewId)}/annotations/${encodeURIComponent(annotationId)}`
      );
      return ensureSuccess(response, 'Failed to delete annotation').annotations;
    },

    async refreshAi(reviewId: string): Promise<RefreshFilmReviewAiResponse> {
      const response = await http.post<ApiResponse<RefreshFilmReviewAiResponse>>(
        `${endpoint}/${encodeURIComponent(reviewId)}/ai-refresh`,
        {}
      );
      return ensureSuccess(response, 'Failed to refresh AI film review');
    },

    async generateTimeline(
      reviewId: string,
      request: GenerateTimelineRequest = {}
    ): Promise<GenerateTimelineResponse> {
      const response = await http.post<ApiResponse<GenerateTimelineResponse>>(
        `${endpoint}/${encodeURIComponent(reviewId)}/timeline-generate`,
        request
      );
      return ensureSuccess(response, 'Failed to generate film review timeline');
    },

    async importBreakdown(
      reviewId: string,
      requestBody: unknown
    ): Promise<ImportFilmReviewBreakdownResponse> {
      const response = await http.post<ApiResponse<ImportFilmReviewBreakdownResponse>>(
        `${endpoint}/${encodeURIComponent(reviewId)}/breakdown-import`,
        requestBody
      );
      return ensureSuccess(response, 'Failed to import film review breakdown');
    },
  } as const;
}

export type TeamFilmReviewApi = ReturnType<typeof createTeamFilmReviewApi>;
