import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { createProfileApi, type ProfileApi, type ApiResponse } from '@nxt1/core/profile';
import {
  User,
  type ProfilePost,
  type ProfileSeasonGameLog,
  type VerifiedStat,
  type VerifiedMetric,
} from '@nxt1/core';
import { type FeedItemResponse } from '@nxt1/core/posts';
import { AngularHttpAdapter } from '../../infrastructure';
import { clearHttpCache } from '../../infrastructure/http/cache.interceptor';
import { PerformanceService } from '..';
import { TRACE_NAMES, ATTRIBUTE_NAMES, METRIC_NAMES } from '@nxt1/core/performance';

/**
 * Angular Profile Service
 *
 * Wraps @nxt1/core profile API for use in Angular with RxJS Observables.
 * Uses shared core logic to avoid code duplication between platforms.
 *
 * Caching strategy:
 * - Transport-level only: httpCacheInterceptor matches /auth/profile/* with MEDIUM_TTL
 * - Manual refresh paths clear transport cache via clearHttpCache()
 */
@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly api: ProfileApi;
  private readonly ssrUrl = environment.apiURL;
  private readonly performance = inject(PerformanceService);

  constructor() {
    // Create profile API instance with Angular HTTP adapter
    const httpAdapter = inject(AngularHttpAdapter);
    this.api = createProfileApi(httpAdapter, environment.apiURL);
  }

  /**
   * Invalidate transport-level cached data for a specific user.
   * Call after profile updates so the next fetch reflects changes immediately.
   */
  invalidateCache(userId: string, unicode?: string | null): void {
    const patterns = [`*auth/profile/${userId}*`, '*auth/profile/me*'];
    if (unicode) {
      patterns.push(`*auth/profile/unicode/${unicode}*`);
    }

    void Promise.all(patterns.map((pattern) => clearHttpCache(pattern)));
  }

  /**
   * Clear all cached profile data from the shared HTTP interceptor cache so
   * reloadProfile() always fetches fresh data.
   * Used after Agent X profile generation to ensure fresh data is fetched.
   */
  invalidateAllProfileCache(): void {
    void Promise.all([clearHttpCache('*auth/profile*'), clearHttpCache('*profile*')]);
  }

  /**
   * Get current authenticated user's own profile.
   * Uses the /profile/me endpoint — no userId required.
   */
  getMe(): Observable<ApiResponse<User>> {
    return from(
      this.performance.trace(TRACE_NAMES.PROFILE_LOAD, () => this.api.getMe(), {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_me',
        },
      })
    );
  }

  /**
   * Get user profile by unicode (shareable numeric code).
   */
  getProfileByUnicode(unicode: string): Observable<ApiResponse<User>> {
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_LOAD,
        () => this.api.getProfileByUnicode(unicode),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_view',
            unicode,
          },
        }
      )
    );
  }

  /**
   * Get user profile by user ID.
   * HTTP-level cache (httpCacheInterceptor) provides the shared transport cache.
   */
  getProfile(userId: string): Observable<ApiResponse<User>> {
    return from(
      this.performance.trace(TRACE_NAMES.PROFILE_LOAD, () => this.api.getProfile(userId), {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_view',
          profile_id: userId,
        },
      })
    );
  }

  /**
   * Get public SEO data for a profile.
   * Some backends have specific lightweight SEO endpoints.
   */
  getProfileSeoData(unicode: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.ssrUrl}/${unicode}`);
  }

  // ============================================
  // Expose additional profile API methods
  // ============================================

  /**
   * Update user profile
   */
  updateProfile(userId: string, data: Parameters<ProfileApi['updateProfile']>[1]) {
    this.invalidateCache(userId);
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_UPDATE,
        () => this.api.updateProfile(userId, data),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_edit',
            user_id: userId,
          },
        }
      )
    );
  }

  /**
   * Update sport profile
   */
  updateSportProfile(userId: string, data: Parameters<ProfileApi['updateSportProfile']>[1]) {
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_SPORT_UPDATE,
        () => this.api.updateSportProfile(userId, data),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_sport_edit',
            user_id: userId,
          },
        }
      )
    );
  }

  /**
   * Add new sport to profile
   */
  addSport(userId: string, sport: Parameters<ProfileApi['addSport']>[1]) {
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_SPORT_ADD,
        () => this.api.addSport(userId, sport),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_sport_edit',
            user_id: userId,
          },
        }
      )
    );
  }

  /**
   * Remove sport from profile
   */
  removeSport(userId: string, sportIndex: number) {
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_SPORT_REMOVE,
        () => this.api.removeSport(userId, sportIndex),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_sport_edit',
            user_id: userId,
          },
        }
      )
    );
  }

  /**
   * Search profiles
   */
  searchProfiles(params: Parameters<ProfileApi['searchProfiles']>[0]) {
    return from(
      this.performance.trace(TRACE_NAMES.SEARCH_EXECUTE, () => this.api.searchProfiles(params), {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_search',
        },
        onSuccess: async (result, trace) => {
          if (result.data) {
            await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, result.data.length);
          }
        },
      })
    );
  }

  /**
   * Get profile analytics
   */
  getAnalytics(userId: string) {
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_ANALYTICS_LOAD,
        () => this.api.getAnalytics(userId),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_analytics',
            user_id: userId,
          },
        }
      )
    );
  }

  /**
   * Track profile view
   */
  trackProfileView(userId: string, viewerId?: string) {
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_VIEW_TRACK,
        () => this.api.trackProfileView(userId, viewerId),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_analytics',
            user_id: userId,
            has_viewer_id: viewerId ? 'true' : 'false',
          },
        }
      )
    );
  }

  /**
   * Upload profile image
   */
  uploadProfileImage(userId: string, imageData: string) {
    return from(
      this.performance.trace(
        TRACE_NAMES.IMAGE_UPLOAD,
        () => this.api.uploadProfileImage(userId, imageData),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_image_upload',
            user_id: userId,
          },
          onSuccess: async (result, trace) => {
            await trace.putMetric('image_size_bytes', imageData.length);
          },
        }
      )
    );
  }

  pinPost(userId: string, postId: string, isPinned: boolean) {
    this.invalidateCache(userId);
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_UPDATE,
        () => this.api.pinPost(userId, postId, isPinned),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_timeline_post',
            user_id: userId,
            post_id: postId,
            action: isPinned ? 'pin' : 'unpin',
          },
        }
      )
    );
  }

  deletePost(userId: string, postId: string) {
    this.invalidateCache(userId);
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_UPDATE,
        () => this.api.deletePost(userId, postId),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_timeline_post',
            user_id: userId,
            post_id: postId,
            action: 'delete',
          },
        }
      )
    );
  }

  /**
   * Map a raw Firestore timeline document to ProfilePost.
   * The seed/backend stores `content`; ProfilePost uses `body`.
   */
  private mapTimelineDoc(raw: Record<string, unknown>): ProfilePost {
    // Backend returns FeedItemPost (polymorphic): engagement replaces legacy stats,
    // postType replaces type, and media URLs live inside the media[] array.
    const engagement = (raw['engagement'] as Record<string, number> | undefined) ?? {};

    // FeedItemPost stores all URLs inside media[]. Pick the first media item.
    const mediaArr = Array.isArray(raw['media'])
      ? (raw['media'] as Array<Record<string, unknown>>)
      : [];
    const firstMedia = mediaArr[0] ?? null;
    const mediaUrl = firstMedia?.['url'] as string | undefined;
    const postType = (raw['postType'] as ProfilePost['type']) ?? 'text';

    // For video use the explicit thumbnail; for images the url IS the display url
    const thumbnailUrl =
      (firstMedia?.['thumbnailUrl'] as string | undefined) ??
      (postType === 'video' ? undefined : mediaUrl);

    return {
      id: (raw['id'] as string | undefined) ?? String(raw['_id'] ?? ''),
      type: postType,
      title: raw['title'] as string | undefined,
      body: (raw['content'] as string | undefined) ?? '',
      thumbnailUrl,
      mediaUrl,
      likeCount: engagement['likeCount'] ?? 0,
      shareCount: engagement['shareCount'] ?? 0,
      viewCount: engagement['viewCount'],
      duration: firstMedia?.['duration'] as number | undefined,
      isPinned: (raw['isPinned'] as boolean | undefined) ?? false,
      createdAt: (raw['createdAt'] as string | undefined) ?? new Date().toISOString(),
    };
  }

  /**
   * Get the polymorphic timeline feed for a user.
   * Returns all FeedItem types (POST, EVENT, STAT, METRIC, OFFER, COMMITMENT,
   * VISIT, CAMP, AWARD, etc.) sorted chronologically by the backend.
   * Optionally filter by sportId: GET /auth/profile/:userId/timeline?sportId=football
   */
  getProfileTimeline(
    userId: string,
    sportId?: string,
    cursor?: string
  ): Observable<FeedItemResponse> {
    const params = new URLSearchParams();
    if (sportId) params.set('sportId', sportId);
    if (cursor) params.set('cursor', cursor);
    const queryString = params.toString();
    const queryParams = queryString ? `?${queryString}` : '';
    return this.http.get<FeedItemResponse>(
      `${environment.apiURL}/auth/profile/${userId}/timeline${queryParams}`
    );
  }

  getProfileStats(
    userId: string,
    sportId: string
  ): Observable<{ success: boolean; data: VerifiedStat[] }> {
    return this.http.get<{ success: boolean; data: VerifiedStat[] }>(
      `${environment.apiURL}/auth/profile/${userId}/sports/${encodeURIComponent(sportId)}/stats`
    );
  }

  getProfileGameLogs(
    userId: string,
    sportId: string
  ): Observable<{ success: boolean; data: ProfileSeasonGameLog[] }> {
    return this.http.get<{ success: boolean; data: ProfileSeasonGameLog[] }>(
      `${environment.apiURL}/auth/profile/${userId}/sports/${encodeURIComponent(sportId)}/game-logs`
    );
  }

  getProfileMetrics(
    userId: string,
    sportId: string
  ): Observable<{ success: boolean; data: VerifiedMetric[] }> {
    return this.http.get<{ success: boolean; data: VerifiedMetric[] }>(
      `${environment.apiURL}/auth/profile/${userId}/sports/${encodeURIComponent(sportId)}/metrics`
    );
  }
}
