import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { createProfileApi, type ProfileApi, type ApiResponse } from '@nxt1/core/profile';
import { User, type ProfilePost, type NewsArticle, type ScoutReport } from '@nxt1/core';
import type { ProfileEvent } from '@nxt1/core/profile';
import { PROFILE_CACHE_KEYS } from '@nxt1/core/profile';
import { CACHE_CONFIG } from '@nxt1/core/cache';
import { AngularHttpAdapter } from '../../../core/infrastructure';
import { PerformanceService } from '../../../core/services/performance.service';
import { TRACE_NAMES, ATTRIBUTE_NAMES, METRIC_NAMES } from '@nxt1/core/performance';

/**
 * In-memory cache entry for profile responses.
 */
interface ProfileCacheEntry {
  data: ApiResponse<User>;
  expiresAt: number;
}

/**
 * Angular Profile Service
 *
 * Wraps @nxt1/core profile API for use in Angular with RxJS Observables.
 * Uses shared core logic to avoid code duplication between platforms.
 *
 * Caching strategy:
 * - Service-level: in-memory Map keyed by PROFILE_CACHE_KEYS with MEDIUM_TTL (15 min)
 * - HTTP-level: httpCacheInterceptor matches /auth/profile/* with MEDIUM_TTL
 * Both layers work together: service cache avoids Observable creation overhead;
 * HTTP cache deduplicates in-flight requests and survives across navigations.
 */
@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly api: ProfileApi;
  private readonly ssrUrl = environment.apiURL;
  private readonly performance = inject(PerformanceService);

  /** Service-level in-memory cache — keyed by PROFILE_CACHE_KEYS prefix + unicode */
  private readonly profileCache = new Map<string, ProfileCacheEntry>();

  constructor() {
    // Create profile API instance with Angular HTTP adapter
    const httpAdapter = inject(AngularHttpAdapter);
    this.api = createProfileApi(httpAdapter, environment.apiURL);
  }

  /**
   * Build a cache key using the shared PROFILE_CACHE_KEYS constant.
   * Keeps key format consistent across web, mobile, and backend.
   */
  private cacheKey(prefix: string, id: string): string {
    return `${prefix}${id}`;
  }

  /**
   * Return a cached entry if it's still within MEDIUM_TTL, otherwise null.
   */
  private getFromCache(key: string): ApiResponse<User> | null {
    const entry = this.profileCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.profileCache.delete(key);
      return null;
    }
    return entry.data;
  }

  /**
   * Store a response in the in-memory cache with MEDIUM_TTL expiry.
   */
  private setCache(key: string, data: ApiResponse<User>): void {
    this.profileCache.set(key, {
      data,
      expiresAt: Date.now() + CACHE_CONFIG.MEDIUM_TTL,
    });
  }

  /**
   * Invalidate cached data for a specific user.
   * Call after profile updates so the next fetch reflects changes.
   */
  invalidateCache(userId: string, username?: string, unicode?: string | null): void {
    this.profileCache.delete(this.cacheKey(PROFILE_CACHE_KEYS.BY_ID, userId));
    if (username) {
      this.profileCache.delete(this.cacheKey(PROFILE_CACHE_KEYS.BY_USERNAME, username));
    }
    if (unicode) {
      this.profileCache.delete(this.cacheKey(PROFILE_CACHE_KEYS.BY_UNICODE, unicode));
    }
  }

  /**
   * Get current authenticated user's own profile.
   * Uses the /profile/me endpoint — no userId required.
   * Caches under the authenticated user's ID (from response).
   */
  getMe(): Observable<ApiResponse<User>> {
    return from(
      this.performance.trace(TRACE_NAMES.PROFILE_LOAD, () => this.api.getMe(), {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_me',
        },
      })
    ).pipe(
      tap((response) => {
        if (response.success && response.data?.id) {
          // Cache under the resolved user ID so further navigations to /:id hit cache
          const key = this.cacheKey(PROFILE_CACHE_KEYS.BY_ID, response.data.id);
          this.setCache(key, response);
        }
      })
    );
  }

  /**
   * Get user profile by unicode (shareable numeric code).
   * Checks service-level cache before hitting the network.
   */
  getProfileByUnicode(unicode: string): Observable<ApiResponse<User>> {
    const key = this.cacheKey(PROFILE_CACHE_KEYS.BY_UNICODE, unicode);
    const cached = this.getFromCache(key);
    if (cached) return of(cached);

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
    ).pipe(
      tap((response) => {
        if (response.success) this.setCache(key, response);
      })
    );
  }

  /**
   * Get user profile by user ID.
   * Checks service-level in-memory cache (MEDIUM_TTL) before hitting the network.
   * HTTP-level cache (httpCacheInterceptor) provides a second caching layer.
   */
  getProfile(userId: string): Observable<ApiResponse<User>> {
    const key = this.cacheKey(PROFILE_CACHE_KEYS.BY_ID, userId);
    const cached = this.getFromCache(key);
    if (cached) return of(cached);

    return from(
      this.performance.trace(TRACE_NAMES.PROFILE_LOAD, () => this.api.getProfile(userId), {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_view',
          profile_id: userId,
        },
      })
    ).pipe(
      tap((response) => {
        if (response.success) this.setCache(key, response);
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
   * Get user profile by username.
   * Checks service-level cache before hitting the network.
   */
  getProfileByUsername(username: string): Observable<ApiResponse<User>> {
    const key = this.cacheKey(PROFILE_CACHE_KEYS.BY_USERNAME, username);
    const cached = this.getFromCache(key);
    if (cached) return of(cached);

    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_LOAD,
        () => this.api.getProfileByUsername(username),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_view',
            username: username,
          },
        }
      )
    ).pipe(
      tap((response) => {
        if (response.success) this.setCache(key, response);
      })
    );
  }

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
   * Follow a user
   */
  follow(userId: string, targetUserId: string) {
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_FOLLOW,
        () => this.api.follow(userId, targetUserId),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_follow',
            user_id: userId,
            target_user_id: targetUserId,
          },
        }
      )
    );
  }

  /**
   * Unfollow a user
   */
  unfollow(userId: string, targetUserId: string) {
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_UNFOLLOW,
        () => this.api.unfollow(userId, targetUserId),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_follow',
            user_id: userId,
            target_user_id: targetUserId,
          },
        }
      )
    );
  }

  /**
   * Get followers
   */
  getFollowers(userId: string, page?: number, limit?: number) {
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_FOLLOWERS_LOAD,
        () => this.api.getFollowers(userId, page, limit),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_followers',
            user_id: userId,
          },
          onSuccess: async (result, trace) => {
            if (result.data) {
              await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, result.data.length);
            }
          },
        }
      )
    );
  }

  /**
   * Get following
   */
  getFollowing(userId: string, page?: number, limit?: number) {
    return from(
      this.performance.trace(
        TRACE_NAMES.PROFILE_FOLLOWING_LOAD,
        () => this.api.getFollowing(userId, page, limit),
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_following',
            user_id: userId,
          },
          onSuccess: async (result, trace) => {
            if (result.data) {
              await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, result.data.length);
            }
          },
        }
      )
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

  /**
   * Map a raw Firestore timeline document to ProfilePost.
   * The seed/backend stores `content`; ProfilePost uses `body`.
   */
  private mapTimelineDoc(raw: Record<string, unknown>): ProfilePost {
    const stats = (raw['stats'] as Record<string, number> | undefined) ?? {};
    return {
      id: (raw['id'] as string | undefined) ?? String(raw['_id'] ?? ''),
      type: (raw['type'] as ProfilePost['type']) ?? 'text',
      title: raw['title'] as string | undefined,
      body: (raw['content'] as string | undefined) ?? '',
      thumbnailUrl: raw['thumbnailUrl'] as string | undefined,
      mediaUrl: raw['mediaUrl'] as string | undefined,
      likeCount: stats['likes'] ?? 0,
      commentCount: stats['comments'] ?? 0,
      shareCount: stats['shares'] ?? 0,
      viewCount: stats['views'],
      duration: raw['duration'] as number | undefined,
      isPinned: (raw['isPinned'] as boolean | undefined) ?? false,
      createdAt: (raw['createdAt'] as string | undefined) ?? new Date().toISOString(),
    };
  }

  /**
   * Get timeline posts from the user's timeline sub-collection.
   * GET /api/v1/auth/profile/:userId/timeline
   */
  getProfileTimeline(userId: string): Observable<{ success: boolean; data: ProfilePost[] }> {
    return this.http
      .get<{
        success: boolean;
        data: Record<string, unknown>[];
      }>(`${environment.apiURL}/auth/profile/${userId}/timeline`)
      .pipe(
        map((resp) => ({
          success: resp.success,
          data: (resp.data ?? []).map((d) => this.mapTimelineDoc(d)),
        }))
      );
  }

  /**
   * Get news articles from the user's news sub-collection.
   * GET /api/v1/auth/profile/:userId/news
   */
  getProfileNews(userId: string): Observable<{ success: boolean; data: NewsArticle[] }> {
    return this.http.get<{ success: boolean; data: NewsArticle[] }>(
      `${environment.apiURL}/auth/profile/${userId}/news`
    );
  }

  /**
   * Get rankings from the user's rankings sub-collection.
   * GET /api/v1/auth/profile/:userId/rankings
   */
  getProfileRankings(
    userId: string
  ): Observable<{ success: boolean; data: Record<string, unknown>[] }> {
    return this.http.get<{ success: boolean; data: Record<string, unknown>[] }>(
      `${environment.apiURL}/auth/profile/${userId}/rankings`
    );
  }

  /**
   * Get scout reports from the user's scoutReports sub-collection.
   * GET /api/v1/auth/profile/:userId/scout-reports
   */
  getProfileScoutReports(userId: string): Observable<{ success: boolean; data: ScoutReport[] }> {
    return this.http.get<{ success: boolean; data: ScoutReport[] }>(
      `${environment.apiURL}/auth/profile/${userId}/scout-reports`
    );
  }

  /**
   * Get videos from the user's videos sub-collection.
   * Maps raw Firestore video docs to ProfilePost (type: 'video' | 'highlight').
   * GET /api/v1/auth/profile/:userId/videos
   */
  getProfileVideos(userId: string): Observable<{ success: boolean; data: ProfilePost[] }> {
    return this.http
      .get<{
        success: boolean;
        data: Record<string, unknown>[];
      }>(`${environment.apiURL}/auth/profile/${userId}/videos`)
      .pipe(
        map((resp) => ({
          success: resp.success,
          data: (resp.data ?? []).map((d) => this.mapTimelineDoc(d)),
        }))
      );
  }

  /**
   * Get scheduled events from the user's schedule sub-collection.
   * Maps raw Firestore schedule docs to ProfileEvent.
   * GET /api/v1/auth/profile/:userId/schedule?sportId=football
   */
  getProfileSchedule(
    userId: string,
    sportId?: string
  ): Observable<{ success: boolean; data: ProfileEvent[] }> {
    const SCHEDULE_TYPE_MAP: Record<string, ProfileEvent['type']> = {
      game: 'game',
      camp: 'camp',
      visit: 'visit',
      practice: 'practice',
      tournament: 'game',
      combine: 'combine',
      showcase: 'showcase',
    };
    const queryParams = sportId ? `?sportId=${encodeURIComponent(sportId)}` : '';
    return this.http
      .get<{
        success: boolean;
        data: Record<string, unknown>[];
      }>(`${environment.apiURL}/auth/profile/${userId}/schedule${queryParams}`)
      .pipe(
        map((resp) => ({
          success: resp.success,
          data: (resp.data ?? []).map((raw) => ({
            id: String(raw['id'] ?? ''),
            type: SCHEDULE_TYPE_MAP[String(raw['eventType'] ?? '')] ?? 'other',
            name: String(raw['title'] ?? raw['name'] ?? ''),
            location: String(raw['location'] ?? ''),
            startDate: raw['date'] ? String(raw['date']) : new Date().toISOString(),
            opponent: raw['opponent'] ? String(raw['opponent']) : undefined,
            result: raw['result'] ? String(raw['result']) : undefined,
          })) as ProfileEvent[],
        }))
      );
  }
}
