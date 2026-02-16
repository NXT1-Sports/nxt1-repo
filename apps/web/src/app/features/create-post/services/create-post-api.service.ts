/**
 * @fileoverview Create Post API Service - Web Platform with Performance Tracing
 * @module apps/web/features/create-post
 * @version 1.0.0
 *
 * Web-specific wrapper for @nxt1/ui CreatePostApiService with performance monitoring.
 * Components should inject this service instead of the base service for automatic tracing.
 */

import { Injectable, inject } from '@angular/core';
import { CreatePostApiService as BaseCreatePostApiService } from '@nxt1/ui';
import { PerformanceService } from '../../../core/services/performance.service';
import { TRACE_NAMES, ATTRIBUTE_NAMES, METRIC_NAMES } from '@nxt1/core/performance';
import type {
  CreatePostApi,
  CreatePostRequest,
  CreatePostResponse,
  PostDraft,
  TaggableUser,
  PostLocation,
  PostXpBreakdown,
  MediaUploadRequest,
  MediaUploadResponse,
} from '@nxt1/core';

/**
 * Web Create Post API Service with performance tracing
 *
 * @example
 * ```typescript
 * private readonly api = inject(CreatePostApiService);
 *
 * const result = await this.api.createPost(request);
 * const drafts = await this.api.getDrafts();
 * ```
 */
@Injectable({ providedIn: 'root' })
export class CreatePostApiService implements CreatePostApi {
  private readonly baseApi = inject(BaseCreatePostApiService);
  private readonly performance = inject(PerformanceService);

  /**
   * Create a new post with performance tracing
   */
  async createPost(request: CreatePostRequest): Promise<CreatePostResponse> {
    return this.performance.trace(TRACE_NAMES.POST_CREATE, () => this.baseApi.createPost(request), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'create_post',
        post_type: request.type,
        has_media: request.mediaIds.length > 0 ? 'true' : 'false',
        privacy: request.privacy,
      },
      onSuccess: async (result: CreatePostResponse, trace) => {
        await trace.putMetric('content_length', request.content.length);
        await trace.putMetric('media_count', request.mediaIds.length);

        if (result.xpEarned) {
          await trace.putMetric('xp_earned', result.xpEarned.totalXp);
        }
      },
    });
  }

  /**
   * Upload media with performance tracing
   */
  async uploadMedia(
    request: MediaUploadRequest,
    onProgress?: (progress: number) => void
  ): Promise<MediaUploadResponse> {
    const traceName = request.mimeType.startsWith('video/')
      ? TRACE_NAMES.VIDEO_UPLOAD
      : TRACE_NAMES.IMAGE_UPLOAD;

    return this.performance.trace(traceName, () => this.baseApi.uploadMedia(request, onProgress), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'media_upload',
        media_type: request.mimeType,
      },
      metrics: {
        file_size_bytes: (request.file as File).size || 0,
      },
    });
  }

  /**
   * Get drafts with performance tracing
   */
  async getDrafts(): Promise<PostDraft[]> {
    return this.performance.trace(TRACE_NAMES.DRAFT_LOAD, () => this.baseApi.getDrafts(), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'drafts',
      },
      onSuccess: async (drafts: PostDraft[], trace) => {
        await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, drafts.length);
      },
    });
  }

  /**
   * Save draft with performance tracing
   */
  async saveDraft(draft: Partial<PostDraft>): Promise<PostDraft> {
    return this.performance.trace(TRACE_NAMES.DRAFT_SAVE, () => this.baseApi.saveDraft(draft), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'drafts',
      },
    });
  }

  /**
   * Delete draft with performance tracing
   */
  async deleteDraft(draftId: string): Promise<void> {
    return this.performance.trace(
      TRACE_NAMES.DRAFT_DELETE,
      () => this.baseApi.deleteDraft(draftId),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'drafts',
        },
      }
    );
  }

  /**
   * Search users with performance tracing
   */
  async searchUsers(query: string): Promise<TaggableUser[]> {
    return this.performance.trace(
      TRACE_NAMES.SEARCH_EXECUTE,
      () => this.baseApi.searchUsers(query),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'user_search',
        },
        onSuccess: async (users: TaggableUser[], trace) => {
          await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, users.length);
        },
      }
    );
  }

  /**
   * Search locations with performance tracing
   */
  async searchLocations(query: string): Promise<PostLocation[]> {
    return this.performance.trace(
      TRACE_NAMES.LOCATION_SEARCH,
      () => this.baseApi.searchLocations(query),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'location_search',
        },
        onSuccess: async (locations: PostLocation[], trace) => {
          await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, locations.length);
        },
      }
    );
  }

  /**
   * Get XP preview with performance tracing
   */
  async getXpPreview(request: Partial<CreatePostRequest>): Promise<PostXpBreakdown> {
    return this.performance.trace(
      TRACE_NAMES.XP_PREVIEW_LOAD,
      () => this.baseApi.getXpPreview(request),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'xp_system',
        },
        onSuccess: async (xpBreakdown: PostXpBreakdown, trace) => {
          await trace.putMetric('xp_total', xpBreakdown.totalXp);
        },
      }
    );
  }
}
