/**
 * Auth API Service - Angular Wrapper for Mobile
 *
 * Wraps the @nxt1/core Auth API for use in the mobile application.
 * Uses CapacitorHttpAdapter for native HTTP calls.
 *
 * Architecture:
 * - Uses CapacitorHttpAdapter to implement HttpAdapter interface
 * - Creates auth API instance lazily for better tree-shaking
 * - Exposes all API methods with proper typing
 * - Identical interface to web's AuthApiService
 *
 * @module @nxt1/mobile/features/auth
 */
import { Injectable, inject } from '@angular/core';
import { createAuthApi, type AuthApi, type UserProfileResponse } from '@nxt1/core';
import { CapacitorHttpAdapter } from '../../infrastructure';
import { environment } from '../../../../environments/environment';

/**
 * Angular service wrapper for @nxt1/core Auth API
 *
 * This provides the same interface as web's AuthApiService,
 * enabling code sharing between platforms.
 *
 * @example
 * ```typescript
 * export class MyComponent {
 *   private authApi = inject(AuthApiService);
 *
 *   async validateCode(code: string) {
 *     const result = await this.authApi.validateTeamCode(code);
 *     if (result.valid) {
 *       console.log('Team:', result.teamCode?.teamName);
 *     }
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(CapacitorHttpAdapter);
  private _api: AuthApi | null = null;

  private get api(): AuthApi {
    if (!this._api) {
      this._api = createAuthApi(this.http, environment.apiUrl);
    }
    return this._api;
  }

  // ============================================
  // USER PROFILE
  // ============================================

  /**
   * Get user profile by UID
   */
  async getUserProfile(uid: string): Promise<UserProfileResponse> {
    return this.api.getProfile(uid);
  }

  // ============================================
  // USER CREATION
  // ============================================

  /**
   * Create a new user in the backend after Firebase Auth signup
   */
  createUser(...args: Parameters<AuthApi['createUser']>): ReturnType<AuthApi['createUser']> {
    return this.api.createUser(...args);
  }

  // ============================================
  // TEAM CODE VALIDATION
  // ============================================

  /**
   * Validate a team code
   */
  validateTeamCode(
    ...args: Parameters<AuthApi['validateTeamCode']>
  ): ReturnType<AuthApi['validateTeamCode']> {
    return this.api.validateTeamCode(...args);
  }

  /**
   * Join a team with code
   */
  joinTeam(...args: Parameters<AuthApi['joinTeam']>): ReturnType<AuthApi['joinTeam']> {
    return this.api.joinTeam(...args);
  }

  // ============================================
  // ONBOARDING
  // ============================================

  /**
   * Save onboarding step
   */
  saveOnboardingStep(
    ...args: Parameters<AuthApi['saveOnboardingStep']>
  ): ReturnType<AuthApi['saveOnboardingStep']> {
    return this.api.saveOnboardingStep(...args);
  }

  /**
   * Save onboarding profile
   */
  saveOnboardingProfile(
    ...args: Parameters<AuthApi['saveOnboardingProfile']>
  ): ReturnType<AuthApi['saveOnboardingProfile']> {
    return this.api.saveOnboardingProfile(...args);
  }

  // ============================================
  // PROFILE UPDATES
  // ============================================

  /**
   * Update user role
   */
  updateRole(...args: Parameters<AuthApi['updateRole']>): ReturnType<AuthApi['updateRole']> {
    return this.api.updateRole(...args);
  }

  /**
   * Update personal info
   */
  updatePersonalInfo(
    ...args: Parameters<AuthApi['updatePersonalInfo']>
  ): ReturnType<AuthApi['updatePersonalInfo']> {
    return this.api.updatePersonalInfo(...args);
  }

  /**
   * Update school info
   */
  updateSchool(...args: Parameters<AuthApi['updateSchool']>): ReturnType<AuthApi['updateSchool']> {
    return this.api.updateSchool(...args);
  }

  // ============================================
  // REFERRALS
  // ============================================

  /**
   * Track referral source (how user heard about us)
   */
  saveReferralSource(
    ...args: Parameters<AuthApi['saveReferralSource']>
  ): ReturnType<AuthApi['saveReferralSource']> {
    return this.api.saveReferralSource(...args);
  }
}
