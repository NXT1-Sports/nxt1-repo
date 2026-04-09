/**
 * @fileoverview Feed API Service - Mobile HTTP Adapter
 * @module @nxt1/mobile/core/services
 * @version 1.0.0
 *
 * Mobile adapter for the pure TypeScript Feed API factory.
 * Uses CapacitorHttpAdapter for native HTTP with automatic auth headers.
 */

import { Injectable, inject } from '@angular/core';
import {
  createFeedApi,
  type FeedApi,
  type FeedResponse,
  type FeedPostResponse,
  type FeedActionResponse,
  type FeedFilter,
  FEED_PAGINATION_DEFAULTS,
} from '@nxt1/core';
import { TRACE_NAMES, ATTRIBUTE_NAMES, METRIC_NAMES } from '@nxt1/core/performance';
import { CapacitorHttpAdapter } from '../../infrastructure';
import { environment } from '../../../../environments/environment';
import { PerformanceService } from '../infrastructure/performance.service';

@Injectable({ providedIn: 'root' })
export class FeedApiService implements FeedApi {
  private readonly http = inject(CapacitorHttpAdapter);
  private readonly performance = inject(PerformanceService);

  private readonly api = createFeedApi(this.http, environment.apiUrl);

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
