import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { createProfileApi, type ProfileApi, type ApiResponse } from '@nxt1/core/profile';
import { User } from '@nxt1/core';
import { AngularHttpAdapter } from '../../../core/infrastructure';

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
  private readonly ssrUrl = environment.profileSsrUrl;

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
    // Try to get by username if unicode looks like a username, or id if it looks like an id.
    // Assuming unicode is the unique ID for now as per codebase convention.
    // If it fails, we might need a specific "get by unicode" endpoint if it differs from ID.
    // But usually in this project unicode == public ID.
    return from(this.api.getProfile(unicode));
  }

  /**
   * Get public SEO data for a profile
   * Some backends have specific lightweight SEO endpoints
   */
  getProfileSeoData(unicode: string): Observable<any> {
    return this.http.get(`${this.ssrUrl}/${unicode}`);
  }

  // ============================================
  // Expose additional profile API methods
  // ============================================

  /**
   * Get user profile by username
   */
  getProfileByUsername(username: string): Observable<ApiResponse<User>> {
    return from(this.api.getProfileByUsername(username));
  }

  /**
   * Update user profile
   */
  updateProfile(userId: string, data: Parameters<ProfileApi['updateProfile']>[1]) {
    return from(this.api.updateProfile(userId, data));
  }

  /**
   * Update sport profile
   */
  updateSportProfile(userId: string, data: Parameters<ProfileApi['updateSportProfile']>[1]) {
    return from(this.api.updateSportProfile(userId, data));
  }

  /**
   * Add new sport to profile
   */
  addSport(userId: string, sport: Parameters<ProfileApi['addSport']>[1]) {
    return from(this.api.addSport(userId, sport));
  }

  /**
   * Remove sport from profile
   */
  removeSport(userId: string, sportIndex: number) {
    return from(this.api.removeSport(userId, sportIndex));
  }

  /**
   * Search profiles
   */
  searchProfiles(params: Parameters<ProfileApi['searchProfiles']>[0]) {
    return from(this.api.searchProfiles(params));
  }

  /**
   * Follow a user
   */
  follow(userId: string, targetUserId: string) {
    return from(this.api.follow(userId, targetUserId));
  }

  /**
   * Unfollow a user
   */
  unfollow(userId: string, targetUserId: string) {
    return from(this.api.unfollow(userId, targetUserId));
  }

  /**
   * Get followers
   */
  getFollowers(userId: string, page?: number, limit?: number) {
    return from(this.api.getFollowers(userId, page, limit));
  }

  /**
   * Get following
   */
  getFollowing(userId: string, page?: number, limit?: number) {
    return from(this.api.getFollowing(userId, page, limit));
  }

  /**
   * Get profile analytics
   */
  getAnalytics(userId: string) {
    return from(this.api.getAnalytics(userId));
  }

  /**
   * Track profile view
   */
  trackProfileView(userId: string, viewerId?: string) {
    return from(this.api.trackProfileView(userId, viewerId));
  }

  /**
   * Upload profile image
   */
  uploadProfileImage(userId: string, imageData: string) {
    return from(this.api.uploadProfileImage(userId, imageData));
  }
}
