/**
 * @fileoverview Team Profile API Service — Mobile Capacitor Adapter
 * @module @nxt1/mobile/core/services
 * @version 1.0.0
 *
 * Wraps @nxt1/core team profile API for native HTTP calls via CapacitorHttpAdapter.
 *
 * Caching strategy:
 * - Handled uniformly at the transport layer by CapacitorHttpAdapter
 *   delivering true L1 (memory) and L2 (disk) network-level caching.
 */
import { Injectable, inject } from '@angular/core';
import {
  createTeamProfileApi,
  type TeamProfileApi,
  type TeamProfileApiResponse,
  type TeamProfilePageData,
} from '@nxt1/core';
import { CACHE_KEYS } from '@nxt1/core/cache';
import { CapacitorHttpAdapter } from '../../infrastructure';
import { MobileCacheService } from '../infrastructure/cache.service';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TeamProfileApiService {
  private readonly api: TeamProfileApi;
  private readonly mobileCache = inject(MobileCacheService);
  private readonly httpCacheKeyPrefix = `${CACHE_KEYS.API_RESPONSE}mobile-http:`;

  constructor() {
    const http = inject(CapacitorHttpAdapter);
    this.api = createTeamProfileApi(http, environment.apiUrl);
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Fetch full team profile data by slug.
   */
  async getTeamBySlug(slug: string): Promise<TeamProfileApiResponse<TeamProfilePageData>> {
    return this.api.getTeamBySlug(slug);
  }

  /**
   * Fetch team profile by short team code (e.g. "57L791").
   * Use this when routing via /team/:slug/:teamCode — never pass a teamCode
   * to getTeamById(), which expects a Firestore document ID.
   */
  async getTeamByTeamCode(teamCode: string): Promise<TeamProfileApiResponse<TeamProfilePageData>> {
    return this.api.getTeamByTeamCode(teamCode);
  }

  /**
   * Fetch team profile data by Firestore document ID.
   * Use only when you have an explicit Firestore doc ID, NOT a short team code.
   */
  async getTeamById(id: string): Promise<TeamProfileApiResponse<TeamProfilePageData>> {
    return this.api.getTeamById(id);
  }

  /**
   * Track a page view.
   */
  async trackPageView(teamId: string, viewerId?: string): Promise<TeamProfileApiResponse<void>> {
    return this.api.trackPageView(teamId, viewerId);
  }

  async invalidateCache(key: string): Promise<void> {
    await this.mobileCache.clear(`${this.httpCacheKeyPrefix}*teams*${key}*`);
  }
}
