import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { createProfileApi, type ProfileApi, type ApiResponse } from '@nxt1/core/profile';
import { User } from '@nxt1/core';
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
   * Invalidate cached data for a specific unicode.
   * Call after profile updates so the next fetch reflects changes.
   */
  invalidateCache(unicode: string): void {
    this.profileCache.delete(this.cacheKey(PROFILE_CACHE_KEYS.BY_ID, unicode));
    this.profileCache.delete(this.cacheKey(PROFILE_CACHE_KEYS.BY_USERNAME, unicode));
  }

  /**
   * Get user profile by unicode (public access).
   * Checks service-level in-memory cache (MEDIUM_TTL) before hitting the network.
   * HTTP-level cache (httpCacheInterceptor) provides a second caching layer.
   */
  getProfile(unicode: string): Observable<ApiResponse<User>> {
    const key = this.cacheKey(PROFILE_CACHE_KEYS.BY_ID, unicode);
    const cached = this.getFromCache(key);
    if (cached) return of(cached);

    return from(
      this.performance.trace(TRACE_NAMES.PROFILE_LOAD, () => this.api.getProfile(unicode), {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_view',
          profile_id: unicode,
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
}
