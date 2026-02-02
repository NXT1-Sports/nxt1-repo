/**
 * @fileoverview Create Post API Factory - Pure TypeScript
 * @module @nxt1/core/create-post
 * @version 1.0.0
 *
 * Pure functions for create post API calls.
 * 100% portable - NO platform dependencies.
 * Enterprise error handling with NxtApiError factories.
 *
 * Uses HttpAdapter pattern for cross-platform compatibility.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  CreatePostRequest,
  CreatePostResponse,
  MediaUploadRequest,
  MediaUploadResponse,
  PostDraft,
  TaggableUser,
  PostLocation,
  PostXpBreakdown,
} from './create-post.types';
import { CREATE_POST_API_ENDPOINTS } from './create-post.constants';
import { createApiError, isNxtApiError } from '../errors';

// ============================================
// API FACTORY TYPE
// ============================================

export type CreatePostApi = ReturnType<typeof createCreatePostApi>;

// ============================================
// RESPONSE TYPES
// ============================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

interface DraftListResponse {
  drafts: PostDraft[];
  total: number;
}

interface UserSearchResponse {
  users: TaggableUser[];
  total: number;
}

interface LocationSearchResponse {
  locations: PostLocation[];
  total: number;
}

interface XpPreviewResponse {
  xp: PostXpBreakdown;
}

// ============================================
// CREATE POST API FACTORY
// ============================================

/**
 * Create Post API instance.
 *
 * @param http - Platform-specific HTTP adapter
 * @param baseUrl - Base URL for API endpoints
 * @returns Create Post API methods
 *
 * @example
 * ```typescript
 * // Web (Angular)
 * const api = createCreatePostApi(angularHttpAdapter, environment.apiUrl);
 *
 * // Mobile (Capacitor)
 * const api = createCreatePostApi(capacitorHttpAdapter, API_URL);
 *
 * // Usage
 * const result = await api.createPost({ content: 'Hello!', type: 'text', ... });
 * const drafts = await api.getDrafts();
 * ```
 */
export function createCreatePostApi(http: HttpAdapter, baseUrl: string) {
  const buildUrl = (
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string => {
    const url = `${baseUrl}${path}`;
    if (!params) return url;

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });

    const queryString = searchParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  };

  return {
    /**
     * Create a new post.
     *
     * @param request - Post creation data
     * @returns Created post response with XP earned
     * @throws NxtApiError on failure
     */
    async createPost(request: CreatePostRequest): Promise<CreatePostResponse> {
      try {
        const url = buildUrl(CREATE_POST_API_ENDPOINTS.CREATE);
        const response = await http.post<ApiResponse<CreatePostResponse>>(url, request);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to create post',
          });
        }

        return response.data ?? { success: false, error: 'No response data' };
      } catch (err) {
        if (isNxtApiError(err)) throw err;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: err instanceof Error ? err.message : 'Failed to create post',
          cause: err,
        });
      }
    },

    /**
     * Upload media file.
     *
     * @param request - Media upload data
     * @param onProgress - Progress callback (0-100)
     * @returns Upload response with media ID and URL
     * @throws NxtApiError on failure
     */
    async uploadMedia(
      request: MediaUploadRequest,
      onProgress?: (progress: number) => void
    ): Promise<MediaUploadResponse> {
      try {
        const url = buildUrl(CREATE_POST_API_ENDPOINTS.UPLOAD_MEDIA);

        // Create FormData for file upload
        const formData = new FormData();
        formData.append('file', request.file, request.fileName);
        formData.append('mimeType', request.mimeType);
        if (request.altText) {
          formData.append('altText', request.altText);
        }

        // Note: Progress tracking depends on HTTP adapter implementation
        const response = await http.post<ApiResponse<MediaUploadResponse>>(url, formData);

        if (!response.success || !response.data) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to upload media',
          });
        }

        // Call progress callback with 100% on success
        onProgress?.(100);

        return response.data;
      } catch (err) {
        if (isNxtApiError(err)) throw err;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: err instanceof Error ? err.message : 'Failed to upload media',
          cause: err,
        });
      }
    },

    /**
     * Get user's draft posts.
     *
     * @returns List of draft posts
     * @throws NxtApiError on failure
     */
    async getDrafts(): Promise<PostDraft[]> {
      try {
        const url = buildUrl(CREATE_POST_API_ENDPOINTS.DRAFTS);
        const response = await http.get<ApiResponse<DraftListResponse>>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch drafts',
          });
        }

        return response.data?.drafts ?? [];
      } catch (err) {
        if (isNxtApiError(err)) throw err;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: err instanceof Error ? err.message : 'Failed to fetch drafts',
          cause: err,
        });
      }
    },

    /**
     * Save or update a draft post.
     *
     * @param draft - Draft data to save
     * @returns Saved draft with ID
     * @throws NxtApiError on failure
     */
    async saveDraft(draft: Partial<PostDraft>): Promise<PostDraft> {
      try {
        const url = buildUrl(CREATE_POST_API_ENDPOINTS.SAVE_DRAFT);
        const response = await http.post<ApiResponse<PostDraft>>(url, draft);

        if (!response.success || !response.data) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to save draft',
          });
        }

        return response.data;
      } catch (err) {
        if (isNxtApiError(err)) throw err;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: err instanceof Error ? err.message : 'Failed to save draft',
          cause: err,
        });
      }
    },

    /**
     * Delete a draft post.
     *
     * @param draftId - Draft ID to delete
     * @throws NxtApiError on failure
     */
    async deleteDraft(draftId: string): Promise<void> {
      try {
        const url = buildUrl(CREATE_POST_API_ENDPOINTS.DELETE_DRAFT.replace(':id', draftId));
        const response = await http.delete<ApiResponse<void>>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to delete draft',
          });
        }
      } catch (err) {
        if (isNxtApiError(err)) throw err;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: err instanceof Error ? err.message : 'Failed to delete draft',
          cause: err,
        });
      }
    },

    /**
     * Search users for tagging.
     *
     * @param query - Search query
     * @param limit - Maximum results
     * @returns List of matching users
     * @throws NxtApiError on failure
     */
    async searchUsers(query: string, limit = 10): Promise<TaggableUser[]> {
      try {
        const url = buildUrl(CREATE_POST_API_ENDPOINTS.SEARCH_USERS, {
          q: query,
          limit,
        });
        const response = await http.get<ApiResponse<UserSearchResponse>>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to search users',
          });
        }

        return response.data?.users ?? [];
      } catch (err) {
        if (isNxtApiError(err)) throw err;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: err instanceof Error ? err.message : 'Failed to search users',
          cause: err,
        });
      }
    },

    /**
     * Search locations for geotagging.
     *
     * @param query - Search query
     * @param limit - Maximum results
     * @returns List of matching locations
     * @throws NxtApiError on failure
     */
    async searchLocations(query: string, limit = 10): Promise<PostLocation[]> {
      try {
        const url = buildUrl(CREATE_POST_API_ENDPOINTS.SEARCH_LOCATIONS, {
          q: query,
          limit,
        });
        const response = await http.get<ApiResponse<LocationSearchResponse>>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to search locations',
          });
        }

        return response.data?.locations ?? [];
      } catch (err) {
        if (isNxtApiError(err)) throw err;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: err instanceof Error ? err.message : 'Failed to search locations',
          cause: err,
        });
      }
    },

    /**
     * Get XP preview for a post before submission.
     *
     * @param request - Partial post data
     * @returns XP breakdown preview
     * @throws NxtApiError on failure
     */
    async getXpPreview(request: Partial<CreatePostRequest>): Promise<PostXpBreakdown> {
      try {
        const url = buildUrl(CREATE_POST_API_ENDPOINTS.XP_PREVIEW);
        const response = await http.post<ApiResponse<XpPreviewResponse>>(url, request);

        if (!response.success || !response.data) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to get XP preview',
          });
        }

        return response.data.xp;
      } catch (err) {
        if (isNxtApiError(err)) throw err;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: err instanceof Error ? err.message : 'Failed to get XP preview',
          cause: err,
        });
      }
    },
  } as const;
}
