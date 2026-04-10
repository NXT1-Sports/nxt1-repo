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
import { createAuthApi, type AuthApi, type User } from '@nxt1/core';
import { AngularHttpAdapter } from '../../infrastructure';
import { environment } from '../../../../environments/environment';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { ILogger } from '@nxt1/core/logging';
import { PerformanceService } from '..';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';

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
  private readonly logger: ILogger = inject(NxtLoggingService).child('AuthApiService');
  private readonly performance = inject(PerformanceService);
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
  createUser(...args: Parameters<AuthApi['createUser']>): ReturnType<AuthApi['createUser']> {
    return this.performance.trace(
      TRACE_NAMES.AUTH_USER_CREATE,
      () => this.api.createUser(...args),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'auth_signup',
        },
      }
    );
  }

  /**
   * Get user profile by UID
   */
  async getUserProfile(uid: string): Promise<User> {
    return this.performance.trace(
      TRACE_NAMES.PROFILE_LOAD,
      async () => {
        try {
          const response = await this.http.get(`${environment.apiURL}/auth/profile/${uid}`, {
            timeout: 3000, // 3 second timeout for faster failure when backend is down
          });
          const wrapped = response as { success?: boolean; data?: User };
          const profile = wrapped?.data ?? (response as unknown as User);
          return profile;
        } catch (error) {
          this.logger.error('Failed to fetch user profile', error, { uid });
          throw error;
        }
      },
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'auth_profile',
          user_id: uid,
        },
      }
    );
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
    return this.performance.trace('team_code_validate', () => this.api.validateTeamCode(...args), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'team_code',
      },
    });
  }

  /**
   * Join a team with code
   */
  joinTeam(...args: Parameters<AuthApi['joinTeam']>): ReturnType<AuthApi['joinTeam']> {
    return this.performance.trace(TRACE_NAMES.TEAM_JOIN, () => this.api.joinTeam(...args), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'team_code',
      },
    });
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
    return this.performance.trace(
      TRACE_NAMES.ONBOARDING_STEP_SAVE,
      () => this.api.saveOnboardingStep(...args),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'onboarding',
        },
      }
    );
  }

  /**
   * Save onboarding profile
   */
  saveOnboardingProfile(
    ...args: Parameters<AuthApi['saveOnboardingProfile']>
  ): ReturnType<AuthApi['saveOnboardingProfile']> {
    return this.performance.trace(
      TRACE_NAMES.ONBOARDING_PROFILE_SAVE,
      () => this.api.saveOnboardingProfile(...args),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'onboarding',
        },
      }
    );
  }

  // ============================================
  // PRELOAD SCRAPE
  // ============================================

  /**
   * Preload scrape — fires the scraping pipeline early during onboarding Step 5.
   */
  preloadScrape(
    ...args: Parameters<AuthApi['preloadScrape']>
  ): ReturnType<AuthApi['preloadScrape']> {
    return this.performance.trace(
      TRACE_NAMES.ONBOARDING_PRELOAD_SCRAPE,
      () => this.api.preloadScrape(...args),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'onboarding',
        },
      }
    );
  }

  // ============================================
  // PROFILE UPDATES
  // ============================================

  /**
   * Update user role
   */
  updateRole(...args: Parameters<AuthApi['updateRole']>): ReturnType<AuthApi['updateRole']> {
    return this.performance.trace(
      TRACE_NAMES.AUTH_ROLE_UPDATE,
      () => this.api.updateRole(...args),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'auth_profile_update',
        },
      }
    );
  }

  /**
   * Update personal info
   */
  updatePersonalInfo(
    ...args: Parameters<AuthApi['updatePersonalInfo']>
  ): ReturnType<AuthApi['updatePersonalInfo']> {
    return this.performance.trace(
      TRACE_NAMES.AUTH_PERSONAL_INFO_UPDATE,
      () => this.api.updatePersonalInfo(...args),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'auth_profile_update',
        },
      }
    );
  }

  /**
   * Update school info
   */
  updateSchool(...args: Parameters<AuthApi['updateSchool']>): ReturnType<AuthApi['updateSchool']> {
    return this.performance.trace(
      TRACE_NAMES.AUTH_SCHOOL_UPDATE,
      () => this.api.updateSchool(...args),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'auth_profile_update',
        },
      }
    );
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
    return this.performance.trace(
      TRACE_NAMES.REFERRAL_SOURCE_SAVE,
      () => this.api.saveReferralSource(...args),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'referrals',
        },
      }
    );
  }
}
