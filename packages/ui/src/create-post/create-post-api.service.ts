/**
 * @fileoverview Create Post API Service
 * @module @nxt1/ui/create-post
 * @version 1.0.0
 *
 * Angular HTTP adapter wrapping the pure @nxt1/core API factory.
 *
 * ⭐ WEB PLATFORM ONLY ⭐
 *
 * This service provides the Angular-specific HTTP adapter for the
 * Create Post API. Mobile apps should use the Capacitor HTTP adapter
 * with the same core API factory.
 *
 * @example
 * ```typescript
 * private readonly api = inject(CreatePostApiService);
 *
 * const result = await this.api.createPost(request);
 * const drafts = await this.api.getDrafts();
 * ```
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createCreatePostApi,
  type CreatePostApi,
  type CreatePostRequest,
  type CreatePostResponse,
  type PostDraft,
  type TaggableUser,
  type PostLocation,
  type PostXpBreakdown,
  type MediaUploadRequest,
  type MediaUploadResponse,
} from '@nxt1/core';

// Environment would normally come from config
const API_BASE_URL = '/api/v1';

@Injectable({ providedIn: 'root' })
export class CreatePostApiService implements CreatePostApi {
  private readonly http = inject(HttpClient);

  /**
   * Angular HTTP adapter for the pure API factory.
   */
  private readonly api = createCreatePostApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    API_BASE_URL
  );

  // Delegate to pure API

  /**
   * Create a new post.
   */
  readonly createPost = (request: CreatePostRequest): Promise<CreatePostResponse> =>
    this.api.createPost(request);

  /**
   * Upload media file.
   */
  readonly uploadMedia = (
    request: MediaUploadRequest,
    onProgress?: (progress: number) => void
  ): Promise<MediaUploadResponse> => this.api.uploadMedia(request, onProgress);

  /**
   * Get user's drafts.
   */
  readonly getDrafts = (): Promise<PostDraft[]> => this.api.getDrafts();

  /**
   * Save draft.
   */
  readonly saveDraft = (draft: Partial<PostDraft>): Promise<PostDraft> => this.api.saveDraft(draft);

  /**
   * Delete draft.
   */
  readonly deleteDraft = (draftId: string): Promise<void> => this.api.deleteDraft(draftId);

  /**
   * Search for users to tag.
   */
  readonly searchUsers = (query: string): Promise<TaggableUser[]> => this.api.searchUsers(query);

  /**
   * Search for locations.
   */
  readonly searchLocations = (query: string): Promise<PostLocation[]> =>
    this.api.searchLocations(query);

  /**
   * Get XP preview for post.
   */
  readonly getXpPreview = (request: Partial<CreatePostRequest>): Promise<PostXpBreakdown> =>
    this.api.getXpPreview(request);
}
