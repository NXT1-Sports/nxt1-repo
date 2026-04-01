/**
 * @fileoverview Feed API Service - Angular HTTP Adapter
 * @module @nxt1/web/core/services
 * @version 1.0.0
 *
 * Angular adapter for the pure TypeScript Feed API factory.
 * Wraps createFeedApi with HttpClient and performance tracing.
 *
 * Following the ExploreApiService pattern exactly.
 */

import { Injectable, inject, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createFeedApi,
  type FeedApi,
  type FeedResponse,
  type FeedPostResponse,
  type FeedActionResponse,
  type FeedFilter,
  FEED_PAGINATION_DEFAULTS,
} from '@nxt1/core';
import { environment } from '../../../environments/environment';
import { PerformanceService } from './performance.service';
import { TRACE_NAMES, ATTRIBUTE_NAMES, METRIC_NAMES } from '@nxt1/core/performance';

/**
 * Injection token for Feed API base URL.
 */
export const FEED_API_BASE_URL = new InjectionToken<string>('FEED_API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiURL,
});

/**
 * Feed API Service.
 * Angular adapter for the pure TypeScript Feed API.
 * All methods include Firebase Performance tracing.
 */
@Injectable({ providedIn: 'root' })
export class FeedApiService implements FeedApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(FEED_API_BASE_URL);
  private readonly performance = inject(PerformanceService);

  private readonly api = createFeedApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    this.baseUrl
  );

  getFeed(
    filter?: FeedFilter,
    page: number = FEED_PAGINATION_DEFAULTS.INITIAL_PAGE,
    limit: number = FEED_PAGINATION_DEFAULTS.LIMIT
  ): Promise<FeedResponse> {
    return this.performance.trace(
      TRACE_NAMES.FEED_LOAD,
      () => this.api.getFeed(filter, page, limit),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'feed',
          feed_page: page.toString(),
        },
        onSuccess: async (response, trace) => {
          await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, response.data?.length ?? 0);
        },
      }
    );
  }

  getUserFeed(
    uid: string,
    page: number = FEED_PAGINATION_DEFAULTS.INITIAL_PAGE,
    limit: number = FEED_PAGINATION_DEFAULTS.LIMIT
  ): Promise<FeedResponse> {
    return this.performance.trace(
      TRACE_NAMES.FEED_USER_LOAD,
      () => this.api.getUserFeed(uid, page, limit),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'feed_user',
          user_id: uid,
        },
        onSuccess: async (response, trace) => {
          await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, response.data?.length ?? 0);
        },
      }
    );
  }

  getTeamFeed(
    teamCode: string,
    page: number = FEED_PAGINATION_DEFAULTS.INITIAL_PAGE,
    limit: number = FEED_PAGINATION_DEFAULTS.LIMIT
  ): Promise<FeedResponse> {
    return this.performance.trace(
      TRACE_NAMES.FEED_TEAM_LOAD,
      () => this.api.getTeamFeed(teamCode, page, limit),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'feed_team',
          team_code: teamCode,
        },
        onSuccess: async (response, trace) => {
          await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, response.data?.length ?? 0);
        },
      }
    );
  }

  getPost(postId: string): Promise<FeedPostResponse> {
    return this.performance.trace(TRACE_NAMES.FEED_POST_LOAD, () => this.api.getPost(postId), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'feed_post',
        post_id: postId,
      },
    });
  }

  toggleLike(postId: string): Promise<FeedActionResponse> {
    return this.performance.trace(TRACE_NAMES.FEED_LIKE_TOGGLE, () => this.api.toggleLike(postId), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'feed_engagement',
        post_id: postId,
      },
    });
  }

  sharePost(postId: string): Promise<FeedActionResponse> {
    return this.performance.trace(TRACE_NAMES.FEED_SHARE, () => this.api.sharePost(postId), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'feed_engagement',
        post_id: postId,
      },
    });
  }

  reportPost(postId: string, reason: string): Promise<FeedActionResponse> {
    return this.performance.trace(
      TRACE_NAMES.FEED_REPORT,
      () => this.api.reportPost(postId, reason),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'feed_moderation',
          post_id: postId,
        },
      }
    );
  }
}
