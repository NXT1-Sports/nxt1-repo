import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createTeamFilmReviewApi,
  type AddFilmReviewAnnotationRequest,
  type CreateTeamFilmReviewRequest,
  type ImportFilmReviewBreakdownResponse,
  type TeamFilmReviewDoc,
  type TeamFilmReviewPlayAnnotation,
  type TeamFilmReviewPlaySegment,
  type UpdateTeamFilmReviewRequest,
} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES } from '@nxt1/core/performance';
import type { AnalyticsAdapter } from '@nxt1/core/analytics';
import type { PerformanceAdapter } from '@nxt1/core/performance';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { PERFORMANCE_ADAPTER } from '../../services/performance';
import { AGENT_X_API_BASE_URL } from './agent-x-job.service';

@Injectable({ providedIn: 'root' })
export class AgentXFilmReviewService {
  private readonly http = inject(HttpClient);
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
  private readonly _selectedId = signal<string | null>(null);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly reviews = computed(() => this._reviews());
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

  async createFromVideo(request: CreateTeamFilmReviewRequest): Promise<TeamFilmReviewDoc> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const duplicate = this._reviews().find((review) => {
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
          () => this.api.createFilmReview(request),
          {
            attributes: {
              team_id: request.teamId,
              sport: request.sport,
            },
          }
        )) ?? (await this.api.createFilmReview(request));

      this._reviews.update((reviews) => [
        this.normalizeReviewTimelineError(created),
        ...reviews.filter((review) => review.id !== created.id),
      ]);
      this._selectedId.set(created.id);

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_CREATED, {
        review_id: created.id,
        team_id: request.teamId,
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
      const result =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_BREAKDOWN_IMPORT,
          () => this.api.importBreakdown(reviewId, formData),
          {
            attributes: {
              review_id: reviewId,
              file_name: file.name,
              mime_type: file.type || 'unknown',
            },
          }
        )) ?? (await this.api.importBreakdown(reviewId, formData));

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

  async load(teamId: string, sport?: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);

    this.logger.info('Loading film reviews', { teamId, sport });
    this.breadcrumb.trackStateChange('film_review_loading', { teamId, sport: sport ?? null });

    try {
      const reviews =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_LIST,
          () => this.api.listFilmReviews({ teamId, sport, limit: 30 }),
          {
            attributes: {
              team_id: teamId,
              sport: sport ?? 'all',
            },
          }
        )) ?? (await this.api.listFilmReviews({ teamId, sport, limit: 30 }));

      this._reviews.set(reviews.map((review) => this.normalizeReviewTimelineError(review)));

      if (!this._selectedId() || !reviews.some((review) => review.id === this._selectedId())) {
        this._selectedId.set(reviews[0]?.id ?? null);
      }

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_LIST_LOADED, {
        team_id: teamId,
        sport: sport ?? null,
        review_count: reviews.length,
      });
      this.logger.info('Film reviews loaded', { teamId, count: reviews.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load film reviews';
      this._error.set(message);
      this.logger.error('Failed to load film reviews', err, { teamId, sport });
    } finally {
      this._loading.set(false);
    }
  }

  select(reviewId: string): void {
    this._selectedId.set(reviewId);
    this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_OPENED, { review_id: reviewId });
    this.breadcrumb.trackStateChange('film_review_opened', { reviewId });
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
          () => this.api.updateFilmReview(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
              operation: 'rename',
            },
          }
        )) ?? (await this.api.updateFilmReview(reviewId, request));

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
          () => this.api.updateFilmReview(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
              operation: 'playlist_assignment',
              playlist_id: normalizedPlaylistId ?? 'unassigned',
            },
          }
        )) ?? (await this.api.updateFilmReview(reviewId, request));

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
          () => this.api.updateFilmReview(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
              operation: 'sport_sync',
              sport: normalizedSport,
            },
          }
        )) ?? (await this.api.updateFilmReview(reviewId, request));

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
          () => this.api.updateFilmReview(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
              operation,
              play_index: String(playIndex),
            },
          }
        )) ?? (await this.api.updateFilmReview(reviewId, request));

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
          () => this.api.updateFilmReview(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
              operation: 'reorder_timeline_play',
              source_index: String(sourceIndex),
              target_index: String(targetIndex),
            },
          }
        )) ?? (await this.api.updateFilmReview(reviewId, request));
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

  async saveTimelinePlayAnnotation(
    reviewId: string,
    playIndex: number,
    annotation: TeamFilmReviewPlayAnnotation | null
  ): Promise<void> {
    const review = this._reviews().find((item) => item.id === reviewId);
    if (!review?.timeline || playIndex < 0 || playIndex >= review.timeline.length) {
      return;
    }

    const currentPlay = review.timeline[playIndex];
    if (!currentPlay) {
      return;
    }

    const currentAnnotation = currentPlay.annotation ?? null;
    if (JSON.stringify(currentAnnotation) === JSON.stringify(annotation)) {
      return;
    }

    const timeline: readonly TeamFilmReviewPlaySegment[] = review.timeline.map((play, index) =>
      index === playIndex
        ? {
            ...play,
            annotation,
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
          () => this.api.updateFilmReview(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
              operation: 'save_timeline_play_annotation',
              play_index: String(playIndex),
              annotation_state: annotation ? 'present' : 'cleared',
            },
          }
        )) ?? (await this.api.updateFilmReview(reviewId, request));

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
        annotationState: annotation ? 'present' : 'cleared',
      });

      this.logger.info('Film review timeline play annotation saved', {
        reviewId,
        playIndex,
        playId: currentPlay.id,
        annotationState: annotation ? 'present' : 'cleared',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save film review play annotation';
      this._error.set(message);
      this.logger.error('Failed to save film review timeline play annotation', err, {
        reviewId,
        playIndex,
        playId: currentPlay.id,
        annotationState: annotation ? 'present' : 'cleared',
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
      await ((await this.performance?.trace(
        TRACE_NAMES.FILM_REVIEW_DELETE,
        () => this.api.deleteFilmReview(reviewId),
        {
          attributes: {
            review_id: reviewId,
          },
        }
      )) ?? this.api.deleteFilmReview(reviewId));

      this._reviews.update((reviews) => reviews.filter((review) => review.id !== reviewId));

      if (this._selectedId() === reviewId) {
        this._selectedId.set(this._reviews()[0]?.id ?? null);
      }

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_ARCHIVED, {
        review_id: reviewId,
      });

      this.breadcrumb.trackStateChange('film_review_deleted', {
        reviewId,
      });

      this.logger.info('Film review deleted', { reviewId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete film review';
      this._error.set(message);
      this.logger.error('Failed to delete film review', err, { reviewId });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async addAnnotation(reviewId: string, request: AddFilmReviewAnnotationRequest): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const annotations =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_ANNOTATION_CREATE,
          () => this.api.addAnnotation(reviewId, request),
          {
            attributes: {
              review_id: reviewId,
            },
          }
        )) ?? (await this.api.addAnnotation(reviewId, request));

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
      const ai =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_AI_REFRESH,
          () => this.api.refreshAi(reviewId),
          {
            attributes: {
              review_id: reviewId,
            },
          }
        )) ?? (await this.api.refreshAi(reviewId));

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

  async generateTimeline(
    reviewId: string,
    maxPollingAttempts: number = 300,
    durationSec?: number
  ): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    // Optimistically mark review as generating so UI reflects loading immediately on tap.
    this._reviews.update((reviews) =>
      reviews.map((review) =>
        review.id === reviewId
          ? {
              ...review,
              timelineState: 'generating',
              timelineError: undefined,
            }
          : review
      )
    );

    this.logger.info('Initiating timeline generation', { reviewId, maxPollingAttempts });
    this.breadcrumb.trackStateChange('film_review_timeline_generating', { reviewId });

    const startTime = performance.now();

    try {
      const normalizedDuration = Number.isFinite(durationSec)
        ? Math.max(0, Math.floor(durationSec as number))
        : undefined;

      // Initiate timeline generation
      const initiateResponse =
        (await this.performance?.trace(
          TRACE_NAMES.FILM_REVIEW_TIMELINE_GENERATE,
          () => this.api.generateTimeline(reviewId, { durationSec: normalizedDuration }),
          {
            attributes: {
              review_id: reviewId,
              action: 'initiate',
            },
          }
        )) ?? (await this.api.generateTimeline(reviewId, { durationSec: normalizedDuration }));

      if (initiateResponse.status !== 'queued' && initiateResponse.status !== 'processing') {
        throw new Error(initiateResponse.message ?? 'Failed to start timeline generation');
      }

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_TIMELINE_GENERATE_INITIATED, {
        review_id: reviewId,
      });
      this.logger.info('Timeline generation initiated', { reviewId });

      // Full-game film can take several minutes; keep the UI attached to backend progress.
      let attempt = 0;
      let isComplete = false;

      while (attempt < maxPollingAttempts && !isComplete) {
        attempt++;

        // Wait before polling
        if (attempt > 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        try {
          // Fetch updated review to check timeline state
          const updated = await this.api.getFilmReview(reviewId);

          if (updated.timelineState === 'ready') {
            this.logger.info('Timeline generation completed', {
              reviewId,
              playCount: updated.timeline?.length ?? 0,
              pollingAttempts: attempt,
              durationMs: Math.round(performance.now() - startTime),
            });

            // Update reviews with timeline data
            this._reviews.update((reviews) =>
              reviews.map((review) =>
                review.id === reviewId
                  ? {
                      ...review,
                      timelineState: 'ready',
                      timeline: updated.timeline,
                      timelineGeneratedAt: updated.timelineGeneratedAt,
                      timelineError: undefined,
                    }
                  : review
              )
            );

            this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_TIMELINE_GENERATE_COMPLETE, {
              review_id: reviewId,
              play_count: updated.timeline?.length ?? 0,
              polling_attempts: attempt,
              generation_time_ms: Math.round(performance.now() - startTime),
            });

            isComplete = true;
            break;
          } else if (updated.timelineState === 'generating' && updated.timeline?.length) {
            this._reviews.update((reviews) =>
              reviews.map((review) =>
                review.id === reviewId
                  ? {
                      ...review,
                      timelineState: 'generating',
                      timeline: updated.timeline,
                      timelineProgress: updated.timelineProgress,
                      timelineError: undefined,
                    }
                  : review
              )
            );
          } else if (updated.timelineState === 'error') {
            throw new Error(updated.timelineError ?? 'Timeline generation failed on backend');
          }
        } catch (pollErr) {
          this.logger.debug('Polling attempt failed', {
            reviewId,
            attempt,
            error: pollErr instanceof Error ? pollErr.message : String(pollErr),
          });
        }
      }

      if (!isComplete) {
        throw new Error(
          `Timeline generation timed out after ${maxPollingAttempts} polling attempts`
        );
      }
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Failed to generate timeline';
      const userMessage = this.toUserFacingTimelineError(rawMessage);
      this._error.set(userMessage);

      this._reviews.update((reviews) =>
        reviews.map((review) =>
          review.id === reviewId
            ? {
                ...review,
                timelineState: 'error',
                timelineError: userMessage,
              }
            : review
        )
      );

      this.logger.error('Film review timeline generation failed', err, {
        reviewId,
        durationMs: Math.round(performance.now() - startTime),
      });

      this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_TIMELINE_GENERATE_ERROR, {
        review_id: reviewId,
        error_message: rawMessage,
        user_error_message: userMessage,
        generation_time_ms: Math.round(performance.now() - startTime),
      });

      throw err;
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
