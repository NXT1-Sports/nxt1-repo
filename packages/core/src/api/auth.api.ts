/**
 * Auth API - Pure TypeScript Functions
 *
 * ⭐ THIS FILE IS 100% PORTABLE TO MOBILE ⭐
 *
 * Contains pure functions for authentication-related backend API calls.
 * These functions have NO framework dependencies and can be used in:
 * - Angular (Web)
 * - React Native (Mobile)
 * - Node.js (Server/Testing)
 * - Any JavaScript environment
 *
 * Architecture Position:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   Components (UI Layer)                    │
 * │              SignInComponent, SignUpComponent              │
 * ├────────────────────────────────────────────────────────────┤
 * │                 AuthFlowService (Domain)                   │
 * │           Orchestrates business logic & state              │
 * ├────────────────────────────────────────────────────────────┤
 * │              ⭐ Auth API (THIS FILE) ⭐                     │
 * │        Pure functions - 100% portable to mobile            │
 * ├────────────────────────────────────────────────────────────┤
 * │               Infrastructure Layer                         │
 * │    Firebase AuthService (SDK) | ApiService (HTTP)          │
 * └────────────────────────────────────────────────────────────┘
 *
 * Note: Firebase Authentication operations (signIn, signUp, etc.)
 * remain in the infrastructure layer as they use the Firebase SDK.
 * This API layer handles backend HTTP calls that complement Firebase.
 *
 * @module @nxt1/core/api
 * @version 2.0.0
 *
 * @example
 * ```typescript
 * // Create API instance with HTTP adapter
 * const authApi = createAuthApi(httpAdapter, '/api/v1');
 *
 * // Use in any platform
 * const validation = await authApi.validateTeamCode('ABC123');
 * const profile = await authApi.updateOnboardingProfile(userId, data);
 * ```
 */

import type { HttpAdapter } from './http-adapter';
import type { TeamTypeApi } from '../models/team-code.model';

// ============================================
// TYPES - Backend API Request/Response
// ============================================

/**
 * Team code validation request
 */
export interface ValidateTeamCodeRequest {
  code: string;
}

/**
 * Team code validation response from backend
 * Note: Uses `sport` (not `sportName`) for API consistency
 * Note: Uses TeamTypeApi string type for teamType
 */
export interface ValidateTeamCodeResponse {
  valid: boolean;
  teamCode?: {
    id: string;
    code: string;
    teamName: string;
    teamType: TeamTypeApi;
    sport: string;
    isFreeTrial: boolean;
    trialDays?: number;
    memberCount?: number;
    maxMembers?: number;
    createdBy?: string;
  };
  error?: string;
}

/**
 * Validated team info extracted from ValidateTeamCodeResponse
 * Use this type for UI components displaying team information
 */
export type ValidatedTeamInfo = NonNullable<ValidateTeamCodeResponse['teamCode']>;

/**
 * Team code validation UI state
 * Use in components to track validation progress
 */
export type TeamCodeValidationState = 'idle' | 'validating' | 'success' | 'error';

/**
 * Onboarding profile data to save
 */
export interface OnboardingProfileData {
  firstName: string;
  lastName: string;
  profileImg?: string;
  bio?: string;
  userType: 'athlete' | 'coach' | 'parent' | 'scout' | 'media' | 'service' | 'fan';
  sport?: string;
  secondarySport?: string;
  positions?: string[];
  highSchool?: string;
  highSchoolSuffix?: string;
  classOf?: number;
  state?: string;
  city?: string;
  club?: string;
  organization?: string;
  coachTitle?: string;
  teamCode?: string;
  referralSource?: string;
  referralDetails?: string;
}

/**
 * Onboarding completion response
 * Field names aligned with User model (user.model.ts)
 */
export interface OnboardingCompleteResponse {
  success: boolean;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    completeSignUp: boolean;
    /** Primary sport - matches User.primarySport */
    primarySport?: string;
  };
  redirectPath: string;
}

/**
 * Referral source data for analytics
 */
export interface ReferralSourceData {
  source: string;
  details?: string;
  clubName?: string;
  otherSpecify?: string;
}

/**
 * HearAbout entry response
 */
export interface HearAboutResponse {
  success: boolean;
  id?: string;
}

/**
 * User profile response
 * Field names aligned with User model (user.model.ts)
 */
export interface UserProfileResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Profile image URL - matches User.profileImg */
  profileImg?: string;
  /** Primary sport - matches User.primarySport */
  primarySport?: string;
  isRecruit: boolean;
  isCollegeCoach: boolean;
  completeSignUp: boolean;
  lastActivatedPlan?: string;
  teamCode?: {
    teamCode: string;
    teamName: string;
    isFreeTrial: boolean;
  };
}

/**
 * Email verification request
 */
export interface SendVerificationEmailRequest {
  email: string;
  redirectUrl?: string;
}

/**
 * Email verification response
 */
export interface SendVerificationEmailResponse {
  success: boolean;
  message?: string;
}

/**
 * Check username availability
 */
export interface UsernameCheckResponse {
  available: boolean;
  suggestions?: string[];
}

/**
 * Referral validation response
 */
export interface ReferralValidationResponse {
  valid: boolean;
  referrerId?: string;
  referrerName?: string;
  creditAmount?: number;
  error?: string;
  meta?: ApiMeta;
}

/**
 * Standard API error response
 */
export interface ApiError {
  code: string;
  message: string;
  requestId: string;
  timestamp: number;
}

/**
 * Standard API response metadata
 */
export interface ApiMeta {
  requestId: string;
  timestamp: number;
}

/**
 * Create user request data
 */
export interface CreateUserRequest {
  /** Firebase Auth UID (20-128 alphanumeric characters) */
  uid: string;
  /** User's email address */
  email: string;
  /** Optional team code for subscription access */
  teamCode?: string;
  /** Optional referrer's user ID for credit tracking */
  referralId?: string;
}

/**
 * Create user response - successful case
 */
export interface CreateUserResponse {
  success: true;
  data: {
    user: {
      id: string;
      email: string;
      credits: number;
      featureCredits: number;
      lastActivatedPlan: 'trial' | 'subscription' | 'free';
      completeSignUp: boolean;
      /** True if user already existed (idempotent request) */
      alreadyExists?: boolean;
    };
  };
  meta: ApiMeta;
}

/**
 * Create user error response
 */
export interface CreateUserErrorResponse {
  success: false;
  error: ApiError;
}

/**
 * Union type for create user API response
 */
export type CreateUserResult = CreateUserResponse | CreateUserErrorResponse;

/**
 * Type guard to check if response is successful
 */
export function isCreateUserSuccess(response: CreateUserResult): response is CreateUserResponse {
  return response.success === true;
}

/**
 * Onboarding step save response
 */
export interface OnboardingStepResponse {
  success: boolean;
  stepId?: string;
  savedFields?: string[];
  error?: string;
}

// ============================================
// API FACTORY
// ============================================

/**
 * Type for the Auth API instance
 * Use this to type variables holding the API
 */
export type AuthApi = ReturnType<typeof createAuthApi>;

/**
 * Create Auth API with injected HTTP adapter
 *
 * This factory function creates an auth API instance that works
 * on any platform by accepting a platform-specific HTTP adapter.
 *
 * @param http - Platform-specific HTTP adapter implementation
 * @param baseUrl - Base URL for API endpoints (e.g., '/api/v1' or 'https://api.nxt1.com/v1')
 * @returns Auth API object with all available methods
 *
 * @example Angular
 * ```typescript
 * const authApi = createAuthApi(angularHttpAdapter, environment.apiUrl);
 * ```
 *
 * @example React Native
 * ```typescript
 * const authApi = createAuthApi(fetchAdapter, 'https://api.nxt1.com/v1');
 * ```
 */
export function createAuthApi(http: HttpAdapter, baseUrl: string) {
  // Normalize base URL (remove trailing slash)
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  return {
    // ============================================
    // USER CREATION
    // ============================================

    /**
     * Create a new user in the backend
     * Called after Firebase Authentication signup
     *
     * This is the ONLY way to create users - direct Firestore writes are not allowed.
     * The backend handles:
     * - Input validation
     * - Credit configuration
     * - Team code validation and association
     * - Referral tracking
     * - Audit logging
     *
     * @param data - User creation data
     * @returns Created user data with initial credits
     * @throws Error if request fails
     */
    async createUser(data: CreateUserRequest): Promise<CreateUserResult> {
      try {
        const response = await http.post<CreateUserResult>(`${base}/auth/create-user`, data);
        return response;
      } catch (error) {
        // Return structured error response
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create user',
            requestId: `client_${Date.now()}`,
            timestamp: Date.now(),
          },
        };
      }
    },

    // ============================================
    // TEAM CODE OPERATIONS
    // ============================================

    /**
     * Validate a team code
     * Checks if the code exists and returns team details
     *
     * @param code - Team code to validate
     * @returns Validation result with team details if valid
     */
    async validateTeamCode(code: string): Promise<ValidateTeamCodeResponse> {
      try {
        return await http.get<ValidateTeamCodeResponse>(
          `${base}/auth/team-code/validate/${encodeURIComponent(code)}`
        );
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : 'Failed to validate team code',
        };
      }
    },

    /**
     * Join a team using a team code
     * Associates the user with the team
     *
     * @param userId - User's ID
     * @param code - Team code to join
     * @returns Updated user profile
     */
    async joinTeam(
      userId: string,
      code: string
    ): Promise<{ success: boolean; teamName?: string; error?: string }> {
      return http.post(`${base}/auth/team-code/join`, { userId, code });
    },

    // ============================================
    // ONBOARDING OPERATIONS
    // ============================================

    /**
     * Save individual onboarding step data (V2 Resource-based)
     * Routes to specific endpoint based on step type for better
     * maintainability and reusability.
     *
     * This ensures Firebase has current data for downstream features
     * like welcome graphic generation and analytics tracking.
     *
     * @param userId - User's Firebase UID
     * @param stepId - Step identifier (role, profile, school, etc.)
     * @param stepData - Data specific to the step
     * @returns Success status with saved fields
     */
    async saveOnboardingStep(
      userId: string,
      stepId: string,
      stepData: Record<string, unknown>
    ): Promise<OnboardingStepResponse> {
      try {
        // V2 Resource-based routing - each step has its own endpoint
        const v2Base = base.replace('/v1', '/v2');

        // Type for backend response format
        type BackendStepResponse = {
          success?: boolean;
          data?: { stepId?: string; savedFields?: string[] };
          error?: { message?: string };
        };

        // Helper to unwrap V2 backend response format
        // Backend returns: { success, data: { stepId, savedFields, ... }, meta }
        // Frontend expects: { success, stepId, savedFields, ... }
        const unwrapResponse = (response: BackendStepResponse): OnboardingStepResponse => {
          if (response && response.success && response.data) {
            return {
              success: true,
              stepId: response.data.stepId,
              savedFields: response.data.savedFields,
            };
          }
          return {
            success: response?.success ?? false,
            error: response?.error?.message || 'Unknown error',
          };
        };

        let response: BackendStepResponse;
        switch (stepId) {
          case 'role':
            response = await http.patch<BackendStepResponse>(`${v2Base}/auth/profile/role`, {
              userId,
              userType: stepData['userType'],
            });
            return unwrapResponse(response);

          case 'profile':
            response = await http.patch<BackendStepResponse>(`${v2Base}/auth/profile/personal`, {
              userId,
              firstName: stepData['firstName'],
              lastName: stepData['lastName'],
              profileImg: stepData['profileImg'],
              bio: stepData['bio'],
            });
            return unwrapResponse(response);

          case 'school':
            response = await http.patch<BackendStepResponse>(`${v2Base}/auth/profile/school`, {
              userId,
              highSchool: stepData['highSchool'],
              highSchoolSuffix: stepData['highSchoolSuffix'],
              classOf: stepData['classOf'],
              state: stepData['state'],
              city: stepData['city'],
              club: stepData['club'],
            });
            return unwrapResponse(response);

          case 'organization':
            response = await http.patch<BackendStepResponse>(
              `${v2Base}/auth/profile/organization`,
              {
                userId,
                organization: stepData['organization'],
                secondOrganization: stepData['secondOrganization'],
                coachTitle: stepData['coachTitle'],
                state: stepData['state'],
                city: stepData['city'],
              }
            );
            return unwrapResponse(response);

          case 'sport':
            response = await http.patch<BackendStepResponse>(`${v2Base}/auth/profile/sport`, {
              userId,
              primarySport: stepData['primarySport'],
              secondarySport: stepData['secondarySport'],
            });
            return unwrapResponse(response);

          case 'positions':
            response = await http.patch<BackendStepResponse>(`${v2Base}/auth/profile/positions`, {
              userId,
              positions: stepData['positions'],
            });
            return unwrapResponse(response);

          case 'contact':
            response = await http.patch<BackendStepResponse>(`${v2Base}/auth/profile/contact`, {
              userId,
              contactEmail: stepData['contactEmail'],
              phoneNumber: stepData['phoneNumber'],
              instagram: stepData['instagram'],
              twitter: stepData['twitter'],
              tiktok: stepData['tiktok'],
              hudlAccountLink: stepData['hudlAccountLink'],
              youtubeAccountLink: stepData['youtubeAccountLink'],
            });
            return unwrapResponse(response);

          case 'referral-source':
            response = await http.post<BackendStepResponse>(`${v2Base}/auth/profile/referral`, {
              userId,
              source: stepData['source'],
              details: stepData['details'],
              clubName: stepData['clubName'],
              otherSpecify: stepData['otherSpecify'],
            });
            return unwrapResponse(response);

          default:
            // Fallback to legacy endpoint for unknown steps
            response = await http.post<BackendStepResponse>(
              `${base}/auth/profile/onboarding-step`,
              {
                userId,
                stepId,
                stepData,
              }
            );
            return unwrapResponse(response);
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save onboarding step',
        };
      }
    },

    // ============================================
    // V2 PROFILE OPERATIONS (Resource-based)
    // These can be used directly outside of onboarding
    // ============================================

    /**
     * Update user role type
     * PATCH /v2/auth/profile/role
     */
    async updateRole(
      userId: string,
      userType: 'athlete' | 'coach' | 'parent' | 'scout' | 'media' | 'service' | 'fan'
    ): Promise<OnboardingStepResponse> {
      const v2Base = base.replace('/v1', '/v2');
      return http.patch(`${v2Base}/auth/profile/role`, { userId, userType });
    },

    /**
     * Update personal information
     * PATCH /v2/auth/profile/personal
     */
    async updatePersonalInfo(
      userId: string,
      data: {
        firstName?: string;
        lastName?: string;
        profileImg?: string;
        bio?: string;
      }
    ): Promise<OnboardingStepResponse> {
      const v2Base = base.replace('/v1', '/v2');
      return http.patch(`${v2Base}/auth/profile/personal`, { userId, ...data });
    },

    /**
     * Update school information
     * PATCH /v2/auth/profile/school
     */
    async updateSchool(
      userId: string,
      data: {
        highSchool?: string;
        highSchoolSuffix?: string;
        classOf?: number;
        state?: string;
        city?: string;
        club?: string;
      }
    ): Promise<OnboardingStepResponse> {
      const v2Base = base.replace('/v1', '/v2');
      return http.patch(`${v2Base}/auth/profile/school`, { userId, ...data });
    },

    /**
     * Update organization information
     * PATCH /v2/auth/profile/organization
     */
    async updateOrganization(
      userId: string,
      data: {
        organization?: string;
        secondOrganization?: string;
        coachTitle?: string;
        state?: string;
        city?: string;
      }
    ): Promise<OnboardingStepResponse> {
      const v2Base = base.replace('/v1', '/v2');
      return http.patch(`${v2Base}/auth/profile/organization`, {
        userId,
        ...data,
      });
    },

    /**
     * Update sport selections
     * PATCH /v2/auth/profile/sport
     */
    async updateSport(
      userId: string,
      data: { primarySport: string; secondarySport?: string }
    ): Promise<OnboardingStepResponse> {
      const v2Base = base.replace('/v1', '/v2');
      return http.patch(`${v2Base}/auth/profile/sport`, { userId, ...data });
    },

    /**
     * Update playing positions
     * PATCH /v2/auth/profile/positions
     */
    async updatePositions(userId: string, positions: string[]): Promise<OnboardingStepResponse> {
      const v2Base = base.replace('/v1', '/v2');
      return http.patch(`${v2Base}/auth/profile/positions`, {
        userId,
        positions,
      });
    },

    /**
     * Update contact information
     * PATCH /v2/auth/profile/contact
     */
    async updateContact(
      userId: string,
      data: {
        contactEmail?: string;
        phoneNumber?: string;
        instagram?: string;
        twitter?: string;
        tiktok?: string;
        hudlAccountLink?: string;
        youtubeAccountLink?: string;
      }
    ): Promise<OnboardingStepResponse> {
      const v2Base = base.replace('/v1', '/v2');
      return http.patch(`${v2Base}/auth/profile/contact`, { userId, ...data });
    },

    /**
     * Save referral source (how user heard about NXT1)
     * POST /v2/auth/profile/referral
     */
    async saveReferralSourceV2(
      userId: string,
      data: {
        source: string;
        details?: string;
        clubName?: string;
        otherSpecify?: string;
      }
    ): Promise<{
      success: boolean;
      stepId?: string;
      id?: string;
      error?: string;
    }> {
      const v2Base = base.replace('/v1', '/v2');
      return http.post(`${v2Base}/auth/profile/referral`, { userId, ...data });
    },

    /**
     * Save onboarding profile data
     * Called during onboarding wizard completion
     *
     * @param userId - User's Firebase UID
     * @param data - Onboarding profile data
     * @returns Completion response with redirect path
     */
    async saveOnboardingProfile(
      userId: string,
      data: OnboardingProfileData
    ): Promise<OnboardingCompleteResponse> {
      return http.post(`${base}/auth/profile/onboarding`, { userId, ...data });
    },

    /**
     * Save referral source for analytics
     * Records how the user heard about NXT1
     *
     * @param userId - User's ID
     * @param data - Referral source information
     * @returns Success status
     */
    async saveReferralSource(userId: string, data: ReferralSourceData): Promise<HearAboutResponse> {
      return http.post(`${base}/auth/analytics/hear-about`, {
        userId,
        ...data,
      });
    },

    /**
     * Mark onboarding as complete
     * Updates user's completeSignUp flag
     *
     * @param userId - User's ID
     * @returns Updated user data
     */
    async completeOnboarding(userId: string): Promise<OnboardingCompleteResponse> {
      return http.post(`${base}/auth/profile/complete-onboarding`, { userId });
    },

    // ============================================
    // PROFILE OPERATIONS
    // ============================================

    /**
     * Get user profile by ID
     * Fetches current user's profile data
     *
     * @param userId - User's ID
     * @returns User profile data
     */
    async getProfile(userId: string): Promise<UserProfileResponse> {
      return http.get(`${base}/auth/profile/${encodeURIComponent(userId)}`);
    },

    /**
     * Update user profile
     * Partial update of profile fields
     *
     * @param userId - User's ID
     * @param data - Fields to update
     * @returns Updated profile
     */
    async updateProfile(
      userId: string,
      data: Partial<OnboardingProfileData>
    ): Promise<UserProfileResponse> {
      return http.patch(`${base}/auth/profile/${encodeURIComponent(userId)}`, data);
    },

    /**
     * Check username availability
     *
     * @param username - Desired username
     * @returns Availability status with suggestions if taken
     */
    async checkUsername(username: string): Promise<UsernameCheckResponse> {
      return http.get(`${base}/auth/profile/check-username/${encodeURIComponent(username)}`);
    },

    // ============================================
    // VERIFICATION OPERATIONS
    // ============================================

    /**
     * Request email verification
     * Sends verification email to user
     *
     * @param request - Email and redirect URL
     * @returns Success status
     */
    async sendVerificationEmail(
      request: SendVerificationEmailRequest
    ): Promise<SendVerificationEmailResponse> {
      return http.post(`${base}/auth/send-verification`, request);
    },

    /**
     * Verify email with token
     *
     * @param token - Verification token from email
     * @returns Verification result
     */
    async verifyEmail(token: string): Promise<{ success: boolean; message?: string }> {
      return http.post(`${base}/auth/verify-email`, { token });
    },

    // ============================================
    // REFERRAL OPERATIONS
    // ============================================

    /**
     * Validate a referral code/link
     *
     * @param referralId - Referral ID or code
     * @returns Validation result with referrer info
     */
    async validateReferral(referralId: string): Promise<ReferralValidationResponse> {
      return http.get(`${base}/auth/referral/validate/${encodeURIComponent(referralId)}`);
    },

    /**
     * Apply referral credit after signup
     *
     * @param userId - New user's ID
     * @param referralId - Referrer's ID
     * @returns Credit application result
     */
    async applyReferralCredit(
      userId: string,
      referralId: string
    ): Promise<{ success: boolean; creditsApplied: number }> {
      return http.post(`${base}/auth/referral/apply`, { userId, referralId });
    },

    // ============================================
    // SESSION OPERATIONS
    // ============================================

    /**
     * Record login session
     * Creates session entry for analytics
     *
     * @param userId - User's ID
     * @param metadata - Session metadata (device, browser, etc.)
     * @returns Session ID
     */
    async recordSession(
      userId: string,
      metadata: Record<string, unknown>
    ): Promise<{ sessionId: string }> {
      return http.post(`${base}/auth/session`, { userId, ...metadata });
    },

    /**
     * End current session
     *
     * @param sessionId - Session to end
     * @returns Success status
     */
    async endSession(sessionId: string): Promise<{ success: boolean }> {
      return http.post(`${base}/auth/session/${sessionId}/end`, {});
    },

    // ============================================
    // ACCOUNT OPERATIONS
    // ============================================

    /**
     * Request account deletion
     * Initiates account deletion process
     *
     * @param userId - User's ID
     * @param reason - Optional deletion reason
     * @returns Confirmation with deletion timeline
     */
    async requestAccountDeletion(
      userId: string,
      reason?: string
    ): Promise<{ success: boolean; deletionDate: string }> {
      return http.post(`${base}/auth/delete-account`, { userId, reason });
    },

    /**
     * Cancel account deletion request
     *
     * @param userId - User's ID
     * @returns Cancellation result
     */
    async cancelAccountDeletion(userId: string): Promise<{ success: boolean }> {
      return http.post(`${base}/auth/cancel-deletion`, { userId });
    },
  };
}
