import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createTeamFilmReviewApi,
  type AddFilmReviewAnnotationRequest,
  type CreateFilmReviewPlaylistRequest,
  type CreateTeamFilmReviewRequest,
  type DeleteFilmReviewPlaylistResponse,
  type ImportFilmReviewBreakdownResponse,
  type RefreshFilmReviewAiResponse,
  type RequestFilmReviewDownloadExportResponse,
  type TeamFilmReviewAnnotation,
  type TeamFilmReviewDoc,
  type TeamFilmReviewPlaylistDoc,
  type TeamFilmReviewPlayAnnotation,
  type TeamFilmReviewPlaySegment,
  type UniversalFileDoc,
  type UpdateFilmReviewPlaylistRequest,
  type UpdateTeamFilmReviewRequest,
} from '@nxt1/core';
import { getUniversalBinaryFilePayload, getUniversalFilmReviewPayload } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES } from '@nxt1/core/performance';
import type { AnalyticsAdapter } from '@nxt1/core/analytics';
import type { PerformanceAdapter } from '@nxt1/core/performance';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { PERFORMANCE_ADAPTER } from '../../services/performance';
import { AGENT_X_API_BASE_URL } from './agent-x-job.service';
import { AgentXFilesService } from './agent-x-files.service';

interface FileBackedFilmReviewMutationResponse {
  readonly success: boolean;
  readonly data?: {
    readonly filmReview: TeamFilmReviewDoc;
  };
  readonly error?: string;
}

interface FileBackedFilmReviewAnnotationsResponse {
  readonly success: boolean;
  readonly data?: {
    readonly annotations: readonly TeamFilmReviewAnnotation[];
  };
  readonly error?: string;
}

interface FileBackedFilmReviewBreakdownImportResponse {
  readonly success: boolean;
  readonly data?: ImportFilmReviewBreakdownResponse;
  readonly error?: string;
}

interface FileBackedFilmReviewAiRefreshResponse {
  readonly success: boolean;
  readonly data?: RefreshFilmReviewAiResponse;
  readonly error?: string;
}

@Injectable({ providedIn: 'root' })
export class AgentXFilmReviewService {
  private readonly http = inject(HttpClient);
  private readonly filesService = inject(AgentXFilesService);
  private readonly logger = inject(NxtLoggingService).child('AgentXFilmReviewService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, {
    optional: true,
  }) as AnalyticsAdapter | null;
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PERFORMANCE_ADAPTER, {
    optional: true,
  }) as PerformanceAdapter | null;
  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;

  private readonly api = createTeamFilmReviewApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    this.baseUrl
  );

  private readonly _reviews = signal<readonly TeamFilmReviewDoc[]>([]);
  private readonly _playlists = signal<readonly TeamFilmReviewPlaylistDoc[]>([]);
  private readonly _totalReviewCount = signal(0);
  private readonly _selectedId = signal<string | null>(null);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _error = signal<string | null>(null);
  private loadedTeamId: string | null = null;
  private readonly hydratedReviewIds = new Set<string>();
  private readonly detailRequests = new Map<string, Promise<void>>();

  readonly reviews = computed(() => this._reviews());
  readonly playlists = computed(() => this._playlists());
  readonly totalReviewCount = computed(() => this._totalReviewCount());
  readonly selectedId = computed(() => this._selectedId());
  readonly loading = computed(() => this._loading());
  readonly saving = computed(() => this._saving());
  readonly error = computed(() => this._error());
  readonly isEmpty = computed(() => this._reviews().length === 0);
  readonly selectedReview = computed(() => {
    const selectedId = this._selectedId();
    if (!selectedId) return null;
    return this._reviews().find((review) => review.id === selectedId) ?? null;
  });

  private toUserFacingTimelineError(message: string): string {
    const normalized = message.trim().toLowerCase();

    if (normalized.includes('no valid play segments')) {
      return 'Agent X could not detect clear play segments in this clip. Try a longer clip or retry timeline generation.';
    }

    if (normalized.includes('empty timeline content')) {
      return 'Agent X returned an empty timeline response. Please retry timeline generation.';
    }

    if (normalized.includes('duration is required')) {
      return 'This video is missing duration metadata. Re-upload the clip, then try generating the timeline again.';
    }

    if (normalized.includes('batch clip film reviews')) {
      return 'Timeline generation is not available for batch clip sessions yet. Use the imported breakdown rows or upload full footage for AI timeline generation.';
    }

    if (normalized.includes('timed out')) {
      return 'Timeline generation is taking longer than expected. Please retry in a moment.';
    }

    if (normalized.includes('failed to start timeline generation')) {
      return 'Agent X could not start timeline generation. Please try again.';
    }

    if (normalized.includes('not configured')) {
      return 'Timeline generation is temporarily unavailable. Please try again shortly.';
    }

    if (normalized.includes('gemini')) {
      return message.replace(/gemini/gi, 'Agent X').trim();
    }

    return message.trim().length > 0 ? message : 'Failed to generate timeline';
  }

  private normalizeReviewTimelineError(review: TeamFilmReviewDoc): TeamFilmReviewDoc {
    if (!review.timelineError) return review;
    return {
      ...review,
      timelineError: this.toUserFacingTimelineError(review.timelineError),
    };
  }

  private buildFilmReviewSourceIdentity(source: {
    readonly cloudflareVideoId?: string;
    readonly storagePath?: string;
    readonly videoUrl?: string;
  }): string | null {
    const cloudflareVideoId = source.cloudflareVideoId?.trim();
    if (cloudflareVideoId) return `cf:${cloudflareVideoId}`;

    const storagePath = source.storagePath?.trim();
    if (storagePath) return `storage:${storagePath}`;

    const videoUrl = source.videoUrl?.trim();
    if (videoUrl) return `url:${videoUrl}`;

    return null;
  }

  private buildFilmReviewSourceIdentityList(
    reviewOrRequest:
      | Pick<
          CreateTeamFilmReviewRequest,
          'sources' | 'cloudflareVideoId' | 'storagePath' | 'videoUrl'
        >
      | Pick<TeamFilmReviewDoc, 'sources' | 'cloudflareVideoId' | 'storagePath' | 'videoUrl'>
  ): readonly string[] {
    const sourceIdentities = (reviewOrRequest.sources ?? [])
      .map((source) => this.buildFilmReviewSourceIdentity(source))
      .filter((identity): identity is string => identity !== null);

    if (sourceIdentities.length > 0) {
      return sourceIdentities;
    }

    const primaryIdentity = this.buildFilmReviewSourceIdentity(reviewOrRequest);
    return primaryIdentity ? [primaryIdentity] : [];
  }

  private sortPlaylists(
    playlists: readonly TeamFilmReviewPlaylistDoc[]
  ): readonly TeamFilmReviewPlaylistDoc[] {
    return [...playlists].sort((left, right) => {
      const leftOrder =
        typeof left.sortOrder === 'number' ? left.sortOrder : Number.MAX_SAFE_INTEGER;
      const rightOrder =
        typeof right.sortOrder === 'number' ? right.sortOrder : Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
    });
  }

  private upsertPlaylist(playlist: TeamFilmReviewPlaylistDoc): void {
    this._playlists.update((playlists) =>
      this.sortPlaylists([...playlists.filter((existing) => existing.id !== playlist.id), playlist])
    );
  }

  private updateReviewDownloadExportState(
    reviewId: string,
    exportState: TeamFilmReviewDoc['downloadExport'] | undefined
  ): void {
    this._reviews.update((reviews) =>
      reviews.map((review) =>
        review.id === reviewId
          ? {
              ...review,
              ...(exportState ? { downloadExport: exportState } : {}),
            }
          : review
      )
    );
  }

  private upsertReview(review: TeamFilmReviewDoc): void {
    const normalized = this.normalizeReviewTimelineError(review);
    this._reviews.update((reviews) => {
      const existingIndex = reviews.findIndex((item) => item.id === normalized.id);
      if (existingIndex === -1) {
        return [normalized, ...reviews];
      }

      return reviews.map((item) => (item.id === normalized.id ? normalized : item));
    });
  }

  private resolveReviewTeamId(reviewId: string): string | null {
    return this._reviews().find((review) => review.id === reviewId)?.teamId ?? this.loadedTeamId;
  }

  private toFilmReviewDocFromUniversalFile(file: UniversalFileDoc): TeamFilmReviewDoc | null {
    const payload = getUniversalFilmReviewPayload(file.payload);
    if (!payload || file.type !== 'file' || file.payloadKind === 'pointer') {
      return null;
    }

    const asset = getUniversalBinaryFilePayload(file.payload);
    const primarySource = payload.sources?.[0];
    const videoUrl =
      asset?.url?.trim() || payload.videoUrl?.trim() || primarySource?.videoUrl?.trim() || '';
    if (!videoUrl) {
      return null;
    }

    return {
      id: file.id,
      teamId: file.teamId,
      organizationId: file.organizationId ?? undefined,
      fileId: file.id,
      sport: file.sport ?? 'unknown',
      title: file.title,
      status: file.status as TeamFilmReviewDoc['status'],
      uploadMode: payload.uploadMode,
      perspective: payload.perspective,
      gameDate: payload.gameDate,
      opponentName: payload.opponentName,
      playlistId: payload.playlistId,
      playlistName: payload.playlistName,
      videoUrl,
      sources: payload.sources,
      storagePath: payload.storagePath ?? asset?.storagePath,
      cloudflareVideoId: payload.cloudflareVideoId ?? asset?.cloudflareVideoId,
      cloudflareStatus: payload.cloudflareStatus ?? asset?.cloudflareStatus,
      readyToStream: payload.readyToStream ?? asset?.readyToStream,
      thumbnailUrl: payload.thumbnailUrl ?? file.thumbnailUrl ?? asset?.thumbnailUrl,
      durationSec: payload.durationSec ?? asset?.durationSec,
      aiSummary: payload.aiSummary,
      aiTags: payload.aiTags,
      clips: payload.clips,
      annotations: payload.annotations,
      keyInsights: payload.keyInsights,
      tags: file.tags,
      source: payload.source ?? 'team_files',
      sourceUrl: payload.sourceUrl,
      schemaVersion: payload.schemaVersion ?? 2,
      readAccessKeys: file.readAccessKeys,
      writeAccessKeys: file.writeAccessKeys,
      createdBy: file.createdByUserId ?? file.ownerUserId ?? file.updatedByUserId ?? '',
      updatedBy: file.updatedByUserId ?? file.createdByUserId ?? file.ownerUserId ?? '',
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      timelineState: payload.timelineState,
      timeline: payload.timeline,
      breakdownSource: payload.breakdownSource,
      timelineGeneratedAt: payload.timelineGeneratedAt,
      timelineError: payload.timelineError,
      timelineProgress: payload.timelineProgress,
      downloadPrewarm: payload.downloadPrewarm,
      downloadExport: payload.downloadExport,
    };
  }

  private async createLinkedFileReview(
    request: CreateTeamFilmReviewRequest
  ): Promise<TeamFilmReviewDoc | null> {
    const fileId = request.fileId?.trim();
    const response = fileId
      ? await firstValueFrom(
          this.http.post<FileBackedFilmReviewMutationResponse>(
            `${this.baseUrl}/files/${encodeURIComponent(fileId)}/film-review`,
            request
          )
        )
      : await firstValueFrom(
          this.http.post<FileBackedFilmReviewMutationResponse>(
            `${this.baseUrl}/film-reviews`,
            request
          )
        );

    if (!response.success || !response.data?.filmReview) {
      throw new Error(response.error ?? 'Failed to create film review');
    }

    return response.data.filmReview;
  }

  private async updateLinkedFileReview(
    reviewId: string,
    request: UpdateTeamFilmReviewRequest & { readonly teamId?: string }
  ): Promise<TeamFilmReviewDoc | null> {
    const response = await firstValueFrom(
      this.http.patch<FileBackedFilmReviewMutationResponse>(
        `${this.baseUrl}/files/${encodeURIComponent(reviewId)}/film-review`,
        request
      )
    );

    if (!response.success || !response.data?.filmReview) {
      throw new Error(response.error ?? 'Failed to update film review');
    }

    return response.data.filmReview;
  }

  private async addLinkedFileReviewAnnotation(
    reviewId: string,
    request: AddFilmReviewAnnotationRequest & { readonly teamId: string }
  ): Promise<readonly TeamFilmReviewAnnotation[] | null> {
    const response = await firstValueFrom(
      this.http.post<FileBackedFilmReviewAnnotationsResponse>(
        `${this.baseUrl}/files/${encodeURIComponent(reviewId)}/film-review/annotations`,
        request
      )
    );

    if (!response.success || !response.data?.annotations) {
      throw new Error(response.error ?? 'Failed to add annotation');
    }

    return response.data.annotations;
  }

  private async importLinkedFileReviewBreakdown(
    reviewId: string,
    teamId: string,
    formData: FormData
  ): Promise<ImportFilmReviewBreakdownResponse | null> {
    formData.set('teamId', teamId);

    const response = await firstValueFrom(
      this.http.post<FileBackedFilmReviewBreakdownImportResponse>(
        `${this.baseUrl}/files/${encodeURIComponent(reviewId)}/film-review/breakdown-import`,
        formData
      )
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to import film review breakdown');
    }

    return response.data;
  }

  private async deleteLinkedFileReview(reviewId: string, teamId: string): Promise<boolean> {
    const response = await firstValueFrom(
      this.http.delete<{ readonly success: boolean; readonly error?: string }>(
        `${this.baseUrl}/files/${encodeURIComponent(reviewId)}`,
        { params: { teamId } }
      )
    );

    if (!response.success) {
      throw new Error(response.error ?? 'Failed to delete film review');
    }

    return true;
  }

  private async refreshLinkedFileReviewAi(
    reviewId: string,
    teamId: string
  ): Promise<RefreshFilmReviewAiResponse | null> {
    const response = await firstValueFrom(
      this.http.post<FileBackedFilmReviewAiRefreshResponse>(
        `${this.baseUrl}/files/${encodeURIComponent(reviewId)}/film-review/ai-refresh`,
        { teamId }
      )
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to refresh AI film review');
    }

    return response.data;
  }

  private async listNativeFilmReviews(
    teamId?: string | null,
    sport?: string
  ): Promise<readonly TeamFilmReviewDoc[]> {
    const files = await this.filesService.listUniversalFileDocuments(teamId, {
      classification: 'film_review',
    });

    return files
      .map((file) => this.toFilmReviewDocFromUniversalFile(file))
      .filter((review): review is TeamFilmReviewDoc => review !== null)
      .filter((review) => !sport || review.sport === sport);
  }

  private async getNativeFilmReview(reviewId: string, teamId?: string): Promise<TeamFilmReviewDoc> {
    const file = await this.filesService.getUniversalFileDocument(reviewId, teamId);
    const review = this.toFilmReviewDocFromUniversalFile(file);
    if (!review) {
      throw new Error('Film review not found');
    }

    return review;
  }

  private async updateNativeFilmReview(
    reviewId: string,
    request: UpdateTeamFilmReviewRequest
  ): Promise<TeamFilmReviewDoc> {
    const teamId = this.resolveReviewTeamId(reviewId);
    const updated = await this.updateLinkedFileReview(reviewId, {
      ...(teamId ? { teamId } : {}),
      ...request,
    });
    if (!updated) {
      throw new Error('Film review not found');
    }

    return updated;
  }

  async createFromVideo(request: CreateTeamFilmReviewRequest): Promise<TeamFilmReviewDoc> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const requestSourceIds = this.buildFilmReviewSourceIdentityList(request);
      const duplicate = this._reviews().find((review) => {
        const reviewSourceIds = this.buildFilmReviewSourceIdentityList(review);
        if (requestSourceIds.length > 0 && reviewSourceIds.length > 0) {
          return (
            requestSourceIds.length === reviewSourceIds.length &&
            requestSourceIds.every((identity, index) => reviewSourceIds[index] === identity)
          );
        }

        if (request.cloudflareVideoId && review.cloudflareVideoId) {
          return review.cloudflareVideoId === request.cloudflareVideoId;
        }
        if (request.storagePath && review.storagePath) {
          return review.storagePath === request.storagePath;
        }
        return review.videoUrl === request.videoUrl;
      });

      if (duplicate) {
        this.select(duplicate.id);
        return duplicate;
      }

      const created =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_CREATE,
          () => this.createLinkedFileReview(request),
          {
            attributes: {
              team_id: request.teamId ?? 'user_scope',
              sport: request.sport,
            },
          }
        )) ?? (await this.createLinkedFileReview(request));

      if (!created) {
        throw new Error('Film review requires a linked native file');
      }

      this._reviews.update((reviews) => [
        this.normalizeReviewTimelineError(created),
        ...reviews.filter((review) => review.id !== created.id),
      ]);
      this._selectedId.set(created.id);

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_CREATED, {
        review_id: created.id,
        team_id: request.teamId ?? 'user_scope',
        sport: request.sport,
      });
      this.breadcrumb.trackStateChange('film_review_created', {
        reviewId: created.id,
        teamId: request.teamId,
        sport: request.sport,
      });
      this.logger.info('Film review created from video', {
        reviewId: created.id,
        teamId: request.teamId,
        sport: request.sport,
      });

      return created;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create film review';
      this._error.set(message);
      this.logger.error('Failed to create film review', err, {
        teamId: request.teamId,
        sport: request.sport,
      });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async importBreakdown(reviewId: string, file: File): Promise<ImportFilmReviewBreakdownResponse> {
    this._saving.set(true);
    this._error.set(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const teamId = this.resolveReviewTeamId(reviewId);
      if (!teamId) {
        throw new Error('Film review must be loaded before importing a breakdown');
      }

      const result =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_BREAKDOWN_IMPORT,
          () => this.importLinkedFileReviewBreakdown(reviewId, teamId, formData),
          {
            attributes: {
              review_id: reviewId,
              file_name: file.name,
              mime_type: file.type || 'unknown',
            },
          }
        )) ?? (await this.importLinkedFileReviewBreakdown(reviewId, teamId, formData));

      if (!result) {
        throw new Error('Failed to import film review breakdown');
      }

      this._reviews.update((reviews) =>
        reviews.map((review) =>
          review.id === reviewId ? this.normalizeReviewTimelineError(result.filmReview) : review
        )
      );
      this._selectedId.set(reviewId);

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_BREAKDOWN_IMPORTED, {
        review_id: reviewId,
        play_count: result.playCount,
        row_count: result.rowCount,
        mime_type: file.type || null,
      });
      this.breadcrumb.trackStateChange('film_review_breakdown_imported', {
        reviewId,
        fileName: file.name,
        playCount: result.playCount,
      });
      this.logger.info('Film review breakdown imported', {
        reviewId,
        fileName: file.name,
        playCount: result.playCount,
        rowCount: result.rowCount,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import film breakdown';
      this._error.set(message);
      this.logger.error('Failed to import film review breakdown', err, {
        reviewId,
        fileName: file.name,
        mimeType: file.type,
      });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async load(teamId?: string | null, sport?: string, limit: number = 20): Promise<void> {
    this._loading.set(true);
    this._error.set(null);

    const normalizedTeamId = teamId?.trim() || null;
    this.loadedTeamId = normalizedTeamId;

    this.logger.info('Loading film reviews', { teamId: normalizedTeamId, sport });
    this.breadcrumb.trackStateChange('film_review_loading', {
      teamId: normalizedTeamId,
      sport: sport ?? null,
    });

    try {
      const response =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_LIST,
          () => this.listNativeFilmReviews(normalizedTeamId, sport),
          {
            attributes: {
              team_id: normalizedTeamId ?? 'user_scope',
              sport: sport ?? 'all',
            },
          }
        )) ?? (await this.listNativeFilmReviews(normalizedTeamId, sport));

      const reviews = response.slice(0, limit);

      this._reviews.set(reviews.map((review) => this.normalizeReviewTimelineError(review)));
      this._playlists.set([]);
      this._totalReviewCount.set(response.length);
      this.hydratedReviewIds.clear();

      if (!this._selectedId() || !reviews.some((review) => review.id === this._selectedId())) {
        this._selectedId.set(reviews[0]?.id ?? null);
      }

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_LIST_LOADED, {
        team_id: normalizedTeamId ?? 'user_scope',
        sport: sport ?? null,
        review_count: reviews.length,
      });
      this.logger.info('Film reviews loaded', { teamId: normalizedTeamId, count: reviews.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load film reviews';
      this._error.set(message);
      this.logger.error('Failed to load film reviews', err, {
        teamId: normalizedTeamId,
        sport,
      });
    } finally {
      this._loading.set(false);
    }
  }

  async createPlaylistFolder(
    request: CreateFilmReviewPlaylistRequest
  ): Promise<TeamFilmReviewPlaylistDoc> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const created =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_CREATE,
          () => this.api.createPlaylist(request),
          {
            attributes: {
              team_id: request.teamId ?? 'user_scope',
              operation: 'playlist_create',
              playlist_id: request.id ?? 'generated',
            },
          }
        )) ?? (await this.api.createPlaylist(request));

      this.upsertPlaylist(created);
      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_CREATED, {
        team_id: request.teamId ?? 'user_scope',
        playlist_id: created.id,
        created_kind: 'playlist',
      });
      this.breadcrumb.trackStateChange('film_review_playlist_created', {
        teamId: request.teamId,
        playlistId: created.id,
        parentId: created.parentId ?? null,
      });
      this.logger.info('Film review playlist created', {
        teamId: request.teamId,
        playlistId: created.id,
        parentId: created.parentId ?? null,
      });

      return created;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create film review playlist';
      this._error.set(message);
      this.logger.error('Failed to create film review playlist', err, {
        teamId: request.teamId,
        playlistId: request.id ?? null,
      });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async updatePlaylistFolder(
    playlistId: string,
    request: UpdateFilmReviewPlaylistRequest
  ): Promise<TeamFilmReviewPlaylistDoc> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const updated =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_UPDATE,
          () => this.api.updatePlaylist(playlistId, request),
          {
            attributes: {
              playlist_id: playlistId,
              operation: 'playlist_update',
            },
          }
        )) ?? (await this.api.updatePlaylist(playlistId, request));

      this.upsertPlaylist(updated);
      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_UPDATED, {
        playlist_id: playlistId,
        fields_updated: 'playlist_folder',
      });
      this.breadcrumb.trackStateChange('film_review_playlist_updated', {
        playlistId,
        parentId: updated.parentId ?? null,
      });
      this.logger.info('Film review playlist updated', {
        playlistId,
        parentId: updated.parentId ?? null,
      });

      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update film review playlist';
      this._error.set(message);
      this.logger.error('Failed to update film review playlist', err, {
        playlistId,
      });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async deletePlaylistFolder(playlistId: string): Promise<DeleteFilmReviewPlaylistResponse> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const result =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_DELETE,
          () => this.api.deletePlaylist(playlistId),
          {
            attributes: {
              playlist_id: playlistId,
              operation: 'playlist_delete',
            },
          }
        )) ?? (await this.api.deletePlaylist(playlistId));

      this._playlists.update((playlists) =>
        this.sortPlaylists(playlists.filter((playlist) => playlist.id !== playlistId))
      );
      this._reviews.update((reviews) =>
        reviews.map((review) =>
          review.playlistId === playlistId
            ? { ...review, playlistId: null, playlistName: null }
            : review
        )
      );

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_DELETED, {
        playlist_id: playlistId,
        deleted_kind: 'playlist',
      });
      this.breadcrumb.trackStateChange('film_review_playlist_deleted', { playlistId });
      this.logger.info('Film review playlist deleted', {
        playlistId,
        unassignedReviewCount: result.unassignedReviewCount ?? 0,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete film review playlist';
      this._error.set(message);
      this.logger.error('Failed to delete film review playlist', err, { playlistId });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async ensureReviewDetails(reviewId: string, teamId?: string): Promise<void> {
    if (!reviewId.trim()) return;
    if (this.hydratedReviewIds.has(reviewId)) return;

    const activeRequest = this.detailRequests.get(reviewId);
    if (activeRequest) {
      await activeRequest;
      return;
    }

    const request = (async () => {
      try {
        const updated =
          (await this.performance?.trace(
            TRACE_NAMES.FILM_REVIEW_DETAIL,
            () => this.getNativeFilmReview(reviewId, teamId),
            {
              attributes: {
                review_id: reviewId,
                team_id: teamId ?? 'unknown',
              },
            }
          )) ?? (await this.getNativeFilmReview(reviewId, teamId));

        this.upsertReview(updated);

        this.hydratedReviewIds.add(reviewId);
      } catch (err) {
        this.logger.warn('Failed to hydrate film review detail; keeping list payload data', {
          reviewId,
          teamId,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        this.detailRequests.delete(reviewId);
      }
    })();

    this.detailRequests.set(reviewId, request);
    await request;
  }

  async requestDownloadExport(reviewId: string): Promise<RequestFilmReviewDownloadExportResponse> {
    this._error.set(null);

    try {
      const teamId = this.resolveReviewTeamId(reviewId);
      if (!teamId) {
        throw new Error('Film review must be loaded before requesting download export');
      }

      const result =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_DOWNLOAD_EXPORT,
          () => this.filesService.requestFilmReviewDownloadExport(reviewId, teamId),
          {
            attributes: {
              review_id: reviewId,
            },
          }
        )) ?? (await this.filesService.requestFilmReviewDownloadExport(reviewId, teamId));

      this.updateReviewDownloadExportState(reviewId, result.exportState);

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_DOWNLOAD_EXPORT_REQUESTED, {
        review_id: reviewId,
        status: result.exportState?.status ?? null,
      });
      if (result.exportState?.status === 'ready' && result.downloadUrl) {
        this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_DOWNLOAD_EXPORT_READY, {
          review_id: reviewId,
          format: result.exportState.format ?? 'mp4',
        });
      }

      this.breadcrumb.trackStateChange('film_review_download_export', {
        reviewId,
        status: result.exportState?.status ?? null,
        percentComplete: result.exportState?.percentComplete ?? null,
        hasDownloadUrl: !!result.downloadUrl,
      });
      this.logger.info('Film review download export status updated', {
        reviewId,
        status: result.exportState?.status ?? null,
        percentComplete: result.exportState?.percentComplete ?? null,
        hasDownloadUrl: !!result.downloadUrl,
      });

      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to prepare film review download export';
      this._error.set(message);
      this.logger.error('Failed to prepare film review download export', err, {
        reviewId,
      });
      throw err;
    }
  }

  select(reviewId: string | null): void {
    this._selectedId.set(reviewId);
    if (reviewId) {
      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_OPENED, { review_id: reviewId });
      this.breadcrumb.trackStateChange('film_review_opened', { reviewId });
    } else {
      this.breadcrumb.trackStateChange('film_review_closed', {});
    }
  }

  async renameReview(reviewId: string, title: string): Promise<void> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;

    this._saving.set(true);
    this._error.set(null);

    try {
      const request: UpdateTeamFilmReviewRequest = { title: normalizedTitle };
      const updated =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_UPDATE,
          () => this.updateNativeFilmReview(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
              operation: 'rename',
            },
          }
        )) ?? (await this.updateNativeFilmReview(reviewId, request));

      this._reviews.update((reviews) =>
        reviews.map((review) => (review.id === reviewId ? updated : review))
      );

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_UPDATED, {
        review_id: reviewId,
        fields_updated: 'title',
      });

      this.breadcrumb.trackStateChange('film_review_renamed', {
        reviewId,
        title: normalizedTitle,
      });

      this.logger.info('Film review renamed', {
        reviewId,
        title: normalizedTitle,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rename film review';
      this._error.set(message);
      this.logger.error('Failed to rename film review', err, {
        reviewId,
        title: normalizedTitle,
      });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async updateReviewPlaylist(
    reviewId: string,
    playlistId: string | null,
    playlistName: string | null
  ): Promise<void> {
    const normalizedPlaylistId = playlistId?.trim() || null;
    const normalizedPlaylistName = playlistName?.trim() || null;
    const existing = this._reviews().find((review) => review.id === reviewId) ?? null;

    if (
      (existing?.playlistId ?? null) === normalizedPlaylistId &&
      (existing?.playlistName ?? null) === normalizedPlaylistName
    ) {
      return;
    }

    this._saving.set(true);
    this._error.set(null);

    try {
      const request: UpdateTeamFilmReviewRequest = {
        playlistId: normalizedPlaylistId,
        playlistName: normalizedPlaylistId ? normalizedPlaylistName : null,
      };
      const updated =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_UPDATE,
          () => this.updateNativeFilmReview(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
              operation: 'playlist_assignment',
              playlist_id: normalizedPlaylistId ?? 'unassigned',
            },
          }
        )) ?? (await this.updateNativeFilmReview(reviewId, request));

      this._reviews.update((reviews) =>
        reviews.map((review) =>
          review.id === reviewId ? this.normalizeReviewTimelineError(updated) : review
        )
      );

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_UPDATED, {
        review_id: reviewId,
        fields_updated: 'playlist',
        playlist_id: normalizedPlaylistId,
      });

      this.breadcrumb.trackStateChange('film_review_playlist_updated', {
        reviewId,
        playlistId: normalizedPlaylistId,
        playlistName: normalizedPlaylistName,
      });

      this.logger.info('Film review playlist updated', {
        reviewId,
        playlistId: normalizedPlaylistId,
        playlistName: normalizedPlaylistName,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update film review playlist';
      this._error.set(message);
      this.logger.error('Failed to update film review playlist', err, {
        reviewId,
        playlistId: normalizedPlaylistId,
      });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async syncReviewSport(reviewId: string, sport: string): Promise<void> {
    const normalizedSport = sport.trim().toLowerCase();
    if (!normalizedSport) return;

    const existing = this._reviews().find((review) => review.id === reviewId) ?? null;
    if (existing?.sport?.trim().toLowerCase() === normalizedSport) return;

    this._saving.set(true);
    this._error.set(null);

    try {
      const request: UpdateTeamFilmReviewRequest = { sport: normalizedSport };
      const updated =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_UPDATE,
          () => this.updateNativeFilmReview(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
              operation: 'sport_sync',
              sport: normalizedSport,
            },
          }
        )) ?? (await this.updateNativeFilmReview(reviewId, request));

      this._reviews.update((reviews) =>
        reviews.map((review) =>
          review.id === reviewId ? this.normalizeReviewTimelineError(updated) : review
        )
      );

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_UPDATED, {
        review_id: reviewId,
        fields_updated: 'sport',
      });

      this.breadcrumb.trackStateChange('film_review_sport_synced', {
        reviewId,
        sport: normalizedSport,
      });

      this.logger.info('Film review sport synced', {
        reviewId,
        sport: normalizedSport,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sync film review sport';
      this._error.set(message);
      this.logger.error('Failed to sync film review sport', err, {
        reviewId,
        sport: normalizedSport,
      });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async renameTimelinePlay(reviewId: string, playIndex: number, label: string): Promise<void> {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) return;

    const review = this._reviews().find((item) => item.id === reviewId);
    if (!review?.timeline || playIndex < 0 || playIndex >= review.timeline.length) {
      return;
    }

    const currentPlay = review.timeline[playIndex];
    if (!currentPlay || currentPlay.label === normalizedLabel) {
      return;
    }

    await this.updateTimelinePlay(
      reviewId,
      playIndex,
      {
        ...currentPlay,
        label: normalizedLabel,
      },
      'rename_timeline_play'
    );
  }

  async updateTimelinePlay(
    reviewId: string,
    playIndex: number,
    nextPlay: TeamFilmReviewPlaySegment,
    operation = 'update_timeline_play'
  ): Promise<void> {
    const review = this._reviews().find((item) => item.id === reviewId);
    if (!review?.timeline || playIndex < 0 || playIndex >= review.timeline.length) {
      return;
    }

    const currentPlay = review.timeline[playIndex];
    if (!currentPlay) {
      return;
    }

    if (JSON.stringify(currentPlay) === JSON.stringify(nextPlay)) {
      return;
    }

    const timeline: readonly TeamFilmReviewPlaySegment[] = review.timeline.map((play, index) =>
      index === playIndex ? nextPlay : play
    );

    this._saving.set(true);
    this._error.set(null);

    try {
      const request: UpdateTeamFilmReviewRequest = { timeline };
      const updated =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_UPDATE,
          () => this.updateNativeFilmReview(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
              operation,
              play_index: String(playIndex),
            },
          }
        )) ?? (await this.updateNativeFilmReview(reviewId, request));

      this._reviews.update((reviews) =>
        reviews.map((item) =>
          item.id === reviewId ? this.normalizeReviewTimelineError(updated) : item
        )
      );

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_UPDATED, {
        review_id: reviewId,
        fields_updated: 'timeline',
      });

      this.breadcrumb.trackStateChange('film_review_timeline_play_updated', {
        reviewId,
        playIndex,
        playId: currentPlay.id,
        operation,
      });

      this.logger.info('Film review timeline play updated', {
        reviewId,
        playIndex,
        playId: currentPlay.id,
        operation,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update film review play';
      this._error.set(message);
      this.logger.error('Failed to update film review timeline play', err, {
        reviewId,
        playIndex,
        playId: currentPlay.id,
        operation,
      });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async reorderTimelinePlay(
    reviewId: string,
    sourceIndex: number,
    targetIndex: number
  ): Promise<TeamFilmReviewDoc | null> {
    const review = this._reviews().find((item) => item.id === reviewId);
    if (!review?.timeline?.length) {
      return null;
    }

    if (
      sourceIndex < 0 ||
      sourceIndex >= review.timeline.length ||
      targetIndex < 0 ||
      targetIndex >= review.timeline.length ||
      sourceIndex === targetIndex
    ) {
      return review;
    }

    const timeline = [...review.timeline];
    const [movedPlay] = timeline.splice(sourceIndex, 1);
    if (!movedPlay) {
      return review;
    }

    timeline.splice(targetIndex, 0, movedPlay);
    const previousReviews = this._reviews();

    this._saving.set(true);
    this._error.set(null);
    this._reviews.update((reviews) =>
      reviews.map((item) => (item.id === reviewId ? { ...item, timeline } : item))
    );

    try {
      const request: UpdateTeamFilmReviewRequest = { timeline };
      const updated =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_UPDATE,
          () => this.updateNativeFilmReview(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
              operation: 'reorder_timeline_play',
              source_index: String(sourceIndex),
              target_index: String(targetIndex),
            },
          }
        )) ?? (await this.updateNativeFilmReview(reviewId, request));
      const normalized = this.normalizeReviewTimelineError(updated);

      this._reviews.update((reviews) =>
        reviews.map((item) => (item.id === reviewId ? normalized : item))
      );

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_UPDATED, {
        review_id: reviewId,
        fields_updated: 'timeline_order',
      });

      this.breadcrumb.trackStateChange('film_review_timeline_reordered', {
        reviewId,
        playId: movedPlay.id,
        sourceIndex,
        targetIndex,
      });

      this.logger.info('Film review timeline reordered', {
        reviewId,
        playId: movedPlay.id,
        sourceIndex,
        targetIndex,
      });

      return normalized;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reorder film review plays';
      this._reviews.set(previousReviews);
      this._error.set(message);
      this.logger.error('Failed to reorder film review timeline', err, {
        reviewId,
        playId: movedPlay.id,
        sourceIndex,
        targetIndex,
      });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async saveTimelinePlayAnnotations(
    reviewId: string,
    playIndex: number,
    annotations: readonly TeamFilmReviewPlayAnnotation[]
  ): Promise<void> {
    const review = this._reviews().find((item) => item.id === reviewId);
    if (!review?.timeline || playIndex < 0 || playIndex >= review.timeline.length) {
      return;
    }

    const currentPlay = review.timeline[playIndex];
    if (!currentPlay) {
      return;
    }

    const currentAnnotations = currentPlay.annotations?.length
      ? currentPlay.annotations
      : currentPlay.annotation
        ? [currentPlay.annotation]
        : [];
    if (JSON.stringify(currentAnnotations) === JSON.stringify(annotations)) {
      return;
    }

    const nextAnnotation = annotations.length
      ? (annotations[annotations.length - 1] ?? null)
      : null;

    const timeline: readonly TeamFilmReviewPlaySegment[] = review.timeline.map((play, index) =>
      index === playIndex
        ? {
            ...play,
            annotation: nextAnnotation,
            annotations: annotations.length ? annotations : null,
          }
        : play
    );

    this._saving.set(true);
    this._error.set(null);

    try {
      const request: UpdateTeamFilmReviewRequest = { timeline };
      const updated =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_UPDATE,
          () => this.updateNativeFilmReview(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
              operation: 'save_timeline_play_annotation',
              play_index: String(playIndex),
              annotation_state: annotations.length ? 'present' : 'cleared',
            },
          }
        )) ?? (await this.updateNativeFilmReview(reviewId, request));

      this._reviews.update((reviews) =>
        reviews.map((item) => (item.id === reviewId ? updated : item))
      );

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_UPDATED, {
        review_id: reviewId,
        fields_updated: 'timeline_annotation',
      });

      this.breadcrumb.trackStateChange('film_review_timeline_play_annotation_saved', {
        reviewId,
        playIndex,
        playId: currentPlay.id,
        annotationState: annotations.length ? 'present' : 'cleared',
      });

      this.logger.info('Film review timeline play annotation saved', {
        reviewId,
        playIndex,
        playId: currentPlay.id,
        annotationState: annotations.length ? 'present' : 'cleared',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save film review play annotation';
      this._error.set(message);
      this.logger.error('Failed to save film review timeline play annotation', err, {
        reviewId,
        playIndex,
        playId: currentPlay.id,
        annotationState: annotations.length ? 'present' : 'cleared',
      });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async deleteReview(reviewId: string): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const teamId = this.resolveReviewTeamId(reviewId);
      if (!teamId) {
        throw new Error('Film review must be loaded before it can be deleted');
      }

      await ((await this.performance?.trace(
        TRACE_NAMES.FILM_REVIEW_DELETE,
        () => this.deleteLinkedFileReview(reviewId, teamId),
        {
          attributes: {
            review_id: reviewId,
          },
        }
      )) ?? this.deleteLinkedFileReview(reviewId, teamId));

      this._reviews.update((reviews) => reviews.filter((review) => review.id !== reviewId));
      this._totalReviewCount.update((count) => Math.max(0, count - 1));

      if (this._selectedId() === reviewId) {
        this._selectedId.set(this._reviews()[0]?.id ?? null);
      }

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_DELETED, {
        review_id: reviewId,
      });

      this.breadcrumb.trackStateChange('film_review_deleted', {
        reviewId,
      });

      this.logger.info('Film review deleted', { reviewId });
    } catch (err) {
      if (this.isDeleteNotFoundError(err)) {
        this._reviews.update((reviews) => reviews.filter((review) => review.id !== reviewId));
        this._totalReviewCount.update((count) => Math.max(0, count - 1));

        if (this._selectedId() === reviewId) {
          this._selectedId.set(this._reviews()[0]?.id ?? null);
        }

        this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_DELETED, {
          review_id: reviewId,
        });

        this.breadcrumb.trackStateChange('film_review_deleted', {
          reviewId,
        });

        this.logger.warn('Film review delete returned not found; treating as deleted', {
          reviewId,
        });
        return;
      }

      const message = err instanceof Error ? err.message : 'Failed to delete film review';
      this._error.set(message);
      this.logger.error('Failed to delete film review', err, { reviewId });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  private isDeleteNotFoundError(error: unknown): boolean {
    if (error instanceof HttpErrorResponse) {
      return error.status === 404;
    }

    return (
      error instanceof Error &&
      (error.message.includes('404') || error.message.includes('Film review not found'))
    );
  }

  async addAnnotation(reviewId: string, request: AddFilmReviewAnnotationRequest): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const teamId = this.resolveReviewTeamId(reviewId);
      if (!teamId) {
        throw new Error('Film review must be loaded before adding annotations');
      }

      const annotations =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_ANNOTATION_CREATE,
          () => this.addLinkedFileReviewAnnotation(reviewId, { ...request, teamId }),
          {
            attributes: {
              review_id: reviewId,
            },
          }
        )) ?? (await this.addLinkedFileReviewAnnotation(reviewId, { ...request, teamId }));

      if (!annotations) {
        throw new Error('Failed to add annotation');
      }

      this._reviews.update((reviews) =>
        reviews.map((review) =>
          review.id === reviewId
            ? {
                ...review,
                annotations,
              }
            : review
        )
      );

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_ANNOTATION_ADDED, {
        review_id: reviewId,
        at_sec: request.atSec,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add annotation';
      this._error.set(message);
      this.logger.error('Failed to add film review annotation', err, { reviewId });
    } finally {
      this._saving.set(false);
    }
  }

  async refreshAi(reviewId: string): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const teamId = this.resolveReviewTeamId(reviewId);
      if (!teamId) {
        throw new Error('Film review must be loaded before refreshing AI');
      }

      const ai =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_AI_REFRESH,
          () => this.refreshLinkedFileReviewAi(reviewId, teamId),
          {
            attributes: {
              review_id: reviewId,
            },
          }
        )) ?? (await this.refreshLinkedFileReviewAi(reviewId, teamId));

      if (!ai) {
        throw new Error('Failed to refresh AI film review');
      }

      this._reviews.update((reviews) =>
        reviews.map((review) =>
          review.id === reviewId
            ? {
                ...review,
                aiSummary: ai.aiSummary,
                aiTags: ai.aiTags,
                keyInsights: ai.keyInsights,
              }
            : review
        )
      );

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_AI_REFRESHED, {
        review_id: reviewId,
        tag_count: ai.aiTags.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh AI film review';
      this._error.set(message);
      this.logger.error('Failed to refresh film review AI', err, { reviewId });
    } finally {
      this._saving.set(false);
    }
  }

  skipToPlay(reviewId: string, playSegment: { startSec: number; label: string }): void {
    this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_PLAY_SKIPPED, {
      review_id: reviewId,
      play_label: playSegment.label,
      start_sec: playSegment.startSec,
    });

    this.breadcrumb.trackStateChange('film_review_play_skipped', {
      reviewId,
      playLabel: playSegment.label,
      startSec: playSegment.startSec,
    });

    this.logger.info('Play skipped in timeline', {
      reviewId,
      playLabel: playSegment.label,
      startSec: playSegment.startSec,
    });
  }
}
