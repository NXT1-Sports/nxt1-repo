/**
 * Auth API Service - Angular Wrapper
 *
 * Wraps the @nxt1/core Auth API for use in Angular applications.
 * Provides singleton access to the auth API with proper dependency injection.
 *
 * Architecture:
 * - Uses AngularHttpAdapter to implement HttpAdapter interface
 * - Creates auth API instance lazily for better tree-shaking
 * - Exposes all API methods with proper typing
 *
 * @module @nxt1/web/features/auth
 */
import { Injectable, inject } from '@angular/core';
import { createAuthApi, type AuthApi } from '@nxt1/core';
import { AngularHttpAdapter } from '../../../core/infrastructure';
import { environment } from '../../../../environments/environment';

/**
 * Angular service wrapper for @nxt1/core Auth API
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
  private readonly http = inject(AngularHttpAdapter);
  private _api: AuthApi | null = null;

  private get api(): AuthApi {
    if (!this._api) {
      this._api = createAuthApi(this.http, environment.apiURL);
    }
    return this._api;
  }

  // ============================================
  // USER CREATION
  // ============================================

  /**
   * Create a new user in the backend after Firebase Auth signup
   */
  createUser(
    ...args: Parameters<AuthApi['createUser']>
  ): ReturnType<AuthApi['createUser']> {
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
  joinTeam(
    ...args: Parameters<AuthApi['joinTeam']>
  ): ReturnType<AuthApi['joinTeam']> {
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

  /**
   * Complete onboarding flow
   */
  completeOnboarding(
    ...args: Parameters<AuthApi['completeOnboarding']>
  ): ReturnType<AuthApi['completeOnboarding']> {
    return this.api.completeOnboarding(...args);
  }

  // ============================================
  // PROFILE UPDATES
  // ============================================

  /**
   * Update user role
   */
  updateRole(
    ...args: Parameters<AuthApi['updateRole']>
  ): ReturnType<AuthApi['updateRole']> {
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
  updateSchool(
    ...args: Parameters<AuthApi['updateSchool']>
  ): ReturnType<AuthApi['updateSchool']> {
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
