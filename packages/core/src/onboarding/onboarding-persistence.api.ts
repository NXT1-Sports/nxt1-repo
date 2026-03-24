/**
 * Onboarding Persistence API - Pure TypeScript Functions
 *
 * ⭐ THIS FILE IS 100% PORTABLE TO MOBILE ⭐
 *
 * Contains pure functions for Firestore persistence operations.
 * These functions have NO framework dependencies and can be used in:
 * - Angular (Web)
 * - React Native (Mobile)
 * - Node.js (Server/Testing)
 * - Any JavaScript environment
 *
 * Architecture Position:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   Components (UI Layer)                    │
 * │                  OnboardingWizardComponent                 │
 * ├────────────────────────────────────────────────────────────┤
 * │              OnboardingPersistenceService (Domain)         │
 * │              Wraps this API with Angular signals           │
 * ├────────────────────────────────────────────────────────────┤
 * │            ⭐ Persistence API (THIS FILE) ⭐                │
 * │        Pure functions - 100% portable to mobile            │
 * ├────────────────────────────────────────────────────────────┤
 * │                  Firestore Adapter                         │
 * │    Platform-specific Firestore implementation              │
 * └────────────────────────────────────────────────────────────┘
 *
 * @module @nxt1/core/api/onboarding
 * @version 2.0.0
 */

import type { LinkSourcesFormData, SportEntry } from './onboarding-navigation.api';
import { USER_ROLES } from '../constants/user.constants';

// ============================================
// ADAPTER INTERFACE
// ============================================

/**
 * Firestore adapter interface - implemented differently per platform
 *
 * @example Angular (Web)
 * ```typescript
 * const adapter: FirestoreAdapter = {
 *   update: (collection, id, data) => firestoreService.update(collection, id, data),
 *   add: (collection, data) => firestoreService.add(collection, data),
 * };
 * ```
 *
 * @example React Native (Mobile)
 * ```typescript
 * const adapter: FirestoreAdapter = {
 *   update: (collection, id, data) => firestore().collection(collection).doc(id).update(data),
 *   add: (collection, data) => firestore().collection(collection).add(data).then(ref => ref.id),
 * };
 * ```
 */
export interface FirestoreAdapter {
  /**
   * Update a document
   * @param collection - Collection path
   * @param docId - Document ID
   * @param data - Data to update
   */
  update(collection: string, docId: string, data: Record<string, unknown>): Promise<void>;

  /**
   * Add a new document
   * @param collection - Collection path
   * @param data - Document data
   * @returns Document ID
   */
  add(collection: string, data: Record<string, unknown>): Promise<string>;

  /**
   * Set a document (create or overwrite)
   * @param collection - Collection path
   * @param docId - Document ID
   * @param data - Document data
   * @param merge - Whether to merge with existing data
   */
  set(
    collection: string,
    docId: string,
    data: Record<string, unknown>,
    merge?: boolean
  ): Promise<void>;
}

// ============================================
// TYPES
// ============================================

/** Retry configuration */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

/** Operation result */
export interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: Error;
  retryCount?: number;
}

/** Retry error types */
export type RetryErrorType =
  | 'network' // Network-related, should retry
  | 'permission' // Auth/permission, don't retry
  | 'validation' // Data validation, don't retry
  | 'rate_limit' // Rate limited, retry with backoff
  | 'unknown'; // Unknown, retry cautiously

/** User type for onboarding */
export type OnboardingUserType = 'athlete' | 'coach' | 'director' | 'recruiter' | 'parent';

/** Team code prefill data */
export interface TeamCodePrefillData {
  teamCode: string;
  teamName?: string;
  teamType?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  /** @deprecated Use primaryColor */ teamColor1?: string;
  /** @deprecated Use secondaryColor */ teamColor2?: string;
  /** @deprecated Use logoUrl */ teamLogoImg?: string;
  sport?: string;
  state?: string;
  role?: string;
}

/** Referral source data */
export interface ReferralSourceData {
  source: string;
  details?: string;
  clubName?: string;
  otherSpecify?: string;
}

/** Profile form data */
export interface ProfileFormData {
  firstName: string;
  lastName: string;
  profileImg?: string | null;
  bio?: string;
  /** Graduation year (Class of) - required for athletes */
  classYear?: number | null;
  /** Gender selection */
  gender?: string | null;
  /** Location data */
  location?: {
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  } | null;
  /** Phone number (optional) — saved to contact.phone */
  phoneNumber?: string;
}

/** School form data */
export interface SchoolFormData {
  schoolName: string;
  schoolType?: 'High School' | 'Middle School' | 'Club' | 'Juco';
  /**
   * @deprecated Moved to ProfileFormData. Kept for backward compatibility.
   */
  classYear?: number | null;
  state?: string;
  city?: string;
  club?: string;
}

/** Organization form data */
export interface OrganizationFormData {
  organizationName: string;
  organizationType?: string;
  title?: string;
  secondOrganization?: string;
}

/**
 * Sport form data - v3.0 format with full SportEntry objects
 * @see SportEntry from onboarding-navigation.api.ts
 */
export interface SportFormData {
  /** Array of sport entries (1-3 sports supported) */
  sports: SportEntry[];
  /** Coach title captured in the sport step for coach onboarding */
  coachTitle?: 'head-coach' | 'assistant-coach' | null;
}

/**
 * Positions form data
 * @deprecated Use SportFormData.sports[].positions instead (v3.0)
 */
export interface PositionsFormData {
  positions: string[];
}

/** Contact form data */
export interface ContactFormData {
  // Contact
  contactEmail?: string;
  phoneNumber?: string;

  // Address
  address?: string;
  city?: string;
  state?: string;
  country?: string;

  // Social Media
  instagram?: string;
  twitter?: string;
  tiktok?: string;

  // Platform Links
  hudlAccountLink?: string;
  youtubeAccountLink?: string;
  sportsAccountLink?: string;
}

/** Complete onboarding form data */
export interface OnboardingFormData {
  userType: OnboardingUserType;
  profile?: ProfileFormData;
  school?: SchoolFormData;
  organization?: OrganizationFormData;
  sport?: SportFormData;
  positions?: PositionsFormData;
  contact?: ContactFormData;
  linkSources?: LinkSourcesFormData;
  referralSource?: ReferralSourceData;
}

/** Onboarding state for persistence */
export interface OnboardingPersistenceState {
  userType: OnboardingUserType;
  formData: Partial<OnboardingFormData>;
  teamCodeData: TeamCodePrefillData | null;
}

// ============================================
// DEFAULT CONFIGURATION
// ============================================

/** Default retry configuration */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

// ============================================
// PURE UTILITY FUNCTIONS
// ============================================

/**
 * Categorize error type for retry decision
 * ⭐ PURE FUNCTION - No dependencies
 */
export function categorizeError(error: Error): RetryErrorType {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Permission errors
  if (
    message.includes('permission') ||
    message.includes('unauthorized') ||
    message.includes('unauthenticated') ||
    message.includes('missing or insufficient permissions')
  ) {
    return 'permission';
  }

  // Validation errors
  if (
    message.includes('invalid') ||
    message.includes('validation') ||
    message.includes('required')
  ) {
    return 'validation';
  }

  // Rate limit errors
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('quota exceeded')
  ) {
    return 'rate_limit';
  }

  // Network errors
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('unavailable') ||
    message.includes('failed to fetch') ||
    name.includes('network')
  ) {
    return 'network';
  }

  return 'unknown';
}

/**
 * Calculate delay with exponential backoff and jitter
 * ⭐ PURE FUNCTION - No dependencies
 */
export function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs);
  // Add jitter (±25%)
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

/**
 * Delay helper
 * ⭐ PURE FUNCTION - No dependencies
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an operation with exponential backoff retry
 * ⭐ PURE FUNCTION - No framework dependencies
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  operationName: string = 'operation',
  logger?: { warn: (msg: string) => void; error: (msg: string) => void }
): Promise<OperationResult<T>> {
  const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  let retryCount = 0;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      const data = await operation();
      return {
        success: true,
        data,
        retryCount,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorType = categorizeError(lastError);

      // Don't retry permission or validation errors
      if (errorType === 'permission' || errorType === 'validation') {
        logger?.error(
          `[OnboardingPersistence] ${operationName} failed (non-retryable): ${lastError.message}`
        );
        return {
          success: false,
          error: lastError,
          retryCount,
        };
      }

      // If we have retries left, wait and retry
      if (attempt < finalConfig.maxRetries) {
        const delayMs = calculateBackoffDelay(attempt, finalConfig);
        logger?.warn(
          `[OnboardingPersistence] ${operationName} failed, retrying in ${delayMs}ms (attempt ${
            attempt + 1
          }/${finalConfig.maxRetries}): ${lastError.message}`
        );
        await delay(delayMs);
        retryCount++;
      }
    }
  }

  logger?.error(
    `[OnboardingPersistence] ${operationName} failed after ${finalConfig.maxRetries} retries: ${lastError?.message}`
  );
  return {
    success: false,
    error: lastError,
    retryCount,
  };
}

// ============================================
// PAYLOAD BUILDERS (Pure Functions)
// ============================================

/**
 * Map onboarding user type to User role
 */
function mapUserTypeToRole(userType: OnboardingUserType): string {
  switch (userType) {
    case 'athlete':
      return 'athlete';
    case 'coach':
      return 'coach';
    case 'director':
      return 'director';
    case 'recruiter':
      return 'recruiter';
    case 'parent':
      return 'parent';
    default:
      return 'athlete';
  }
}

/**
 * Build user update payload from onboarding state
 * ⭐ PURE FUNCTION - No framework dependencies
 *
 * This builds the payload in User model structure:
 * - location: { city, state, country }
 * - contact: { email, phone }
 * - social: { twitter, instagram, ... }
 * - sports: [{ sport, positions, team, ... }]
 * - athlete: { classOf, ... } (role-specific)
 */
export function buildUserUpdatePayload(state: OnboardingPersistenceState): Record<string, unknown> {
  const { formData, userType, teamCodeData } = state;
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    // Onboarding completion flags
    signupCompleted: true,
    onboardingCompleted: true,
    updatedAt: now,
  };

  // =========== PROFILE ===========
  if (formData.profile) {
    payload['firstName'] = formData.profile.firstName;
    payload['lastName'] = formData.profile.lastName;
    if (formData.profile.profileImg) {
      payload['profileImgs'] = [formData.profile.profileImg];
    }
    if (formData.profile.bio) {
      payload['aboutMe'] = formData.profile.bio;
    }
  }

  // =========== ROLE ===========
  payload['role'] = mapUserTypeToRole(userType);

  // =========== LOCATION (nested object) ===========
  const location: Record<string, string> = {
    country: 'USA',
  };
  if (formData.school?.state || formData.contact?.state) {
    location['state'] = formData.school?.state || formData.contact?.state || '';
  }
  if (formData.school?.city || formData.contact?.city) {
    location['city'] = formData.school?.city || formData.contact?.city || '';
  }
  if (formData.contact?.address) {
    location['address'] = formData.contact.address;
  }
  if (formData.contact?.country) {
    location['country'] = formData.contact.country;
  }
  payload['location'] = location;

  // =========== CONTACT (nested object) ===========
  const contact: Record<string, string | undefined> = {};
  if (formData.contact?.contactEmail) {
    contact['email'] = formData.contact.contactEmail;
  }
  // Phone can come from profile step (basics) or contact step
  const phoneNumber = formData.contact?.phoneNumber || formData.profile?.phoneNumber;
  if (phoneNumber) {
    contact['phone'] = phoneNumber;
  }
  if (Object.keys(contact).length > 0) {
    payload['contact'] = contact;
  }

  // =========== SOCIAL & CONNECTED SOURCES ===========
  // Social platforms (instagram, twitter, tiktok, youtube) → social{}
  // Data platforms (hudl, maxpreps, etc.) → connectedSources[]
  const socialData: Record<string, string | undefined> = {};
  const connectedSourcesList: Array<{
    platform: string;
    profileUrl: string;
    syncStatus: 'idle';
    scopeType?: 'global' | 'sport' | 'team';
    scopeId?: string;
  }> = [];

  const hasModernLinkSources = !!formData.linkSources?.links?.length;
  const socialPlatformIds = new Set([
    'instagram',
    'twitter',
    'tiktok',
    'youtube',
    'snapchat',
    'facebook',
    'linkedin',
    'threads',
  ]);

  if (hasModernLinkSources) {
    for (const link of formData.linkSources?.links ?? []) {
      if (!link.connected || link.connectionType === 'signin') continue;

      const value = link.url?.trim() || link.username?.trim();
      if (!value) continue;

      if (socialPlatformIds.has(link.platform)) {
        socialData[link.platform] = value;
        continue;
      }

      connectedSourcesList.push({
        platform: link.platform,
        profileUrl: value.startsWith('http') ? value : `https://${value}`,
        syncStatus: 'idle',
        scopeType: link.scopeType,
        scopeId: link.scopeId,
      });
    }
  }

  if (!hasModernLinkSources && formData.contact?.instagram) {
    socialData['instagram'] = formData.contact.instagram;
  }
  if (!hasModernLinkSources && formData.contact?.twitter) {
    socialData['twitter'] = formData.contact.twitter;
  }
  if (!hasModernLinkSources && formData.contact?.tiktok) {
    socialData['tiktok'] = formData.contact.tiktok;
  }
  if (!hasModernLinkSources && formData.contact?.youtubeAccountLink) {
    socialData['youtube'] = formData.contact.youtubeAccountLink;
  }
  // Hudl is a film/data platform, not social
  if (!hasModernLinkSources && formData.contact?.hudlAccountLink) {
    const url = formData.contact.hudlAccountLink;
    connectedSourcesList.push({
      platform: 'hudl',
      profileUrl: url.startsWith('http') ? url : `https://hudl.com/${url}`,
      syncStatus: 'idle',
    });
  }
  if (Object.keys(socialData).length > 0) {
    payload['social'] = socialData;
  }
  if (connectedSourcesList.length > 0) {
    payload['connectedSources'] = connectedSourcesList;
  }

  // =========== SPORTS ARRAY ===========
  // V3.0 format: sports is an array of SportEntry objects
  const sportEntries = formData.sport?.sports || [];
  if (sportEntries.length > 0) {
    const sports = sportEntries.map((entry, index) => {
      const isAthlete = userType === USER_ROLES.ATHLETE;
      const teamName =
        entry.team || formData.school?.schoolName || formData.organization?.organizationName || '';
      const teamType = formData.school?.schoolType === 'Club' ? 'club' : 'high-school';

      const sportData: Record<string, unknown> = {
        sport: entry.sport,
        order: index,
        positions: entry.positions || [],
        // Only athletes get legacy seasonStats here; metrics now live in sport-scoped records.
        ...(isAthlete ? { seasonStats: [] } : {}),
        team: {
          name: teamName,
          type: teamType,
        },
      };

      // Add team code data to primary sport if available
      if (index === 0 && teamCodeData) {
        sportData['team'] = {
          name: teamCodeData.teamName || entry.team || formData.school?.schoolName || '',
          type: teamCodeData.teamType || 'high-school',
        };
      }

      return sportData;
    });

    payload['sports'] = sports;
    payload['activeSportIndex'] = 0;
  }

  // =========== ROLE-SPECIFIC DATA ===========
  // Class year is now in profile (with backward compat for school.classYear)
  const classYear = formData.profile?.classYear ?? formData.school?.classYear;
  if (userType === USER_ROLES.ATHLETE && classYear) {
    payload['classOf'] = classYear;
  }

  const coachTitle = formData.sport?.coachTitle ?? formData.organization?.title;

  if (userType === USER_ROLES.COACH && coachTitle) {
    payload['coach'] = {
      title: coachTitle,
    };
  }

  if (userType === USER_ROLES.DIRECTOR && formData.organization) {
    payload['director'] = {
      title: formData.organization.title || '',
    };
  }

  if (userType === USER_ROLES.RECRUITER) {
    payload['recruiter'] = {
      recruiterType: 'college_coach', // Default; Agent X can refine later
      ...(formData.organization?.title ? { title: formData.organization.title } : {}),
    };
  }

  // =========== SUBSCRIPTION (team code) ===========
  if (teamCodeData) {
    payload['subscription'] = {
      plan: 'free',
      status: 'none',
      credits: 0,
      teamCode: {
        id: teamCodeData.teamCode,
        teamCode: teamCodeData.teamCode,
        teamName: teamCodeData.teamName,
        teamType: teamCodeData.teamType,
        logoUrl: teamCodeData.logoUrl || teamCodeData.teamLogoImg || '',
        teamLogoImg: teamCodeData.logoUrl || teamCodeData.teamLogoImg || '',
        state: teamCodeData.state || '',
        role: teamCodeData.role || '',
        isActive: true,
      },
    };
  }

  // =========== PREFERENCES ===========
  payload['preferences'] = {
    notifications: {
      push: true,
      email: true,
      sms: false,
      marketing: false,
    },
    activityTracking: true,
    dismissedPrompts: formData.referralSource?.source ? ['hear-about'] : [],
    defaultSportIndex: 0,
    theme: 'system',
  };

  return payload;
}

// ============================================
// API FACTORY
// ============================================

/**
 * Create Onboarding Persistence API with injected Firestore adapter
 * ⭐ Works on Web (Angular), Mobile (React Native), or any JS environment
 *
 * @example
 * ```typescript
 * const persistenceApi = createOnboardingPersistenceApi(firestoreAdapter);
 *
 * // Update user profile with retry
 * const result = await persistenceApi.updateUserProfile(userId, payload);
 * if (result.success) {
 *   console.log('Profile updated');
 * }
 * ```
 */
export function createOnboardingPersistenceApi(
  firestore: FirestoreAdapter,
  logger?: { warn: (msg: string) => void; error: (msg: string) => void }
) {
  return {
    /**
     * Update user profile with retry logic
     */
    async updateUserProfile(
      userId: string,
      payload: Record<string, unknown>,
      config?: Partial<RetryConfig>
    ): Promise<OperationResult> {
      return withRetry(
        () => firestore.update('users', userId, payload),
        { ...DEFAULT_RETRY_CONFIG, maxRetries: 3, ...config },
        'updateUserProfile',
        logger
      );
    },

    /**
     * Save user profile from onboarding state
     */
    async saveOnboardingProfile(
      userId: string,
      state: OnboardingPersistenceState,
      config?: Partial<RetryConfig>
    ): Promise<OperationResult> {
      const payload = buildUserUpdatePayload(state);
      return withRetry(
        () => firestore.update('users', userId, payload),
        { ...DEFAULT_RETRY_CONFIG, maxRetries: 3, ...config },
        'saveOnboardingProfile',
        logger
      );
    },

    // ============================================
    // UTILITY EXPORTS
    // ============================================

    /** Build user update payload */
    buildUserUpdatePayload,

    /** Execute with retry */
    withRetry: <T>(
      operation: () => Promise<T>,
      config?: Partial<RetryConfig>,
      operationName?: string
    ) => withRetry(operation, config, operationName, logger),

    /** Error categorization */
    categorizeError,

    /** Backoff calculation */
    calculateBackoffDelay,
  };
}

// Type export for the API
export type OnboardingPersistenceApi = ReturnType<typeof createOnboardingPersistenceApi>;
