import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { createProfileApi, type ProfileApi, type ApiResponse } from '@nxt1/core/profile';
import { User } from '@nxt1/core';
import { AngularHttpAdapter } from '../../../core/infrastructure';
import { PerformanceService } from '../../../core/services/performance.service';
import { TRACE_NAMES, ATTRIBUTE_NAMES, METRIC_NAMES } from '@nxt1/core/performance';

/**
 * Angular Profile Service
 *
 * Wraps @nxt1/core profile API for use in Angular with RxJS Observables.
 * Uses shared core logic to avoid code duplication between platforms.
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
   * Get user profile by unicode (public access)
   * This is used for SEO and public profile viewing
   */
  getProfile(unicode: string): Observable<ApiResponse<User>> {
    return from(
      this.performance.trace(TRACE_NAMES.PROFILE_LOAD, () => this.api.getProfile(unicode), {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'profile_view',
          profile_id: unicode,
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
   * Get user profile by username
   */
  getProfileByUsername(username: string): Observable<ApiResponse<User>> {
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
    );
  }

  /**
   * Update user profile
   */
  updateProfile(userId: string, data: Parameters<ProfileApi['updateProfile']>[1]) {
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
