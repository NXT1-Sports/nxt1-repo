/**
 * Onboarding Navigation API - Pure TypeScript Functions
 *
 * ⭐ THIS FILE IS 100% PORTABLE TO MOBILE ⭐
 *
 * Contains pure functions for step navigation and validation.
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
 * │              OnboardingNavigationService (Domain)          │
 * │              Wraps this API with Angular signals           │
 * ├────────────────────────────────────────────────────────────┤
 * │             ⭐ Navigation API (THIS FILE) ⭐                │
 * │        Pure functions - 100% portable to mobile            │
 * └────────────────────────────────────────────────────────────┘
 *
 * @module @nxt1/core/api/onboarding
 * @version 2.0.0
 */

// ============================================
// TYPES
// ============================================

/** User type for onboarding */
export type OnboardingUserType =
  | 'athlete'
  | 'coach'
  | 'parent'
  | 'scout'
  | 'media'
  | 'service'
  | 'fan';

/** Step IDs */
export type OnboardingStepId =
  | 'role'
  | 'profile'
  | 'school'
  | 'organization'
  | 'sport'
  | 'positions'
  | 'contact'
  | 'social'
  | 'referral-source'
  | 'complete';

/** Step configuration */
export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  subtitle: string;
  required: boolean;
  order: number;
}

/** Team code prefill data */
export interface TeamCodePrefillData {
  teamCode: string;
  teamName?: string;
  teamType?: string;
  teamColor1?: string;
  teamColor2?: string;
  teamLogoImg?: string;
  sport?: string;
  state?: string;
  role?: string;
}

/** Profile form data */
export interface ProfileFormData {
  firstName: string;
  lastName: string;
  profileImg?: string | null;
  bio?: string;
}

/** School form data */
export interface SchoolFormData {
  schoolName: string;
  schoolType?: 'High School' | 'Middle School' | 'Club' | 'Juco';
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

/** Sport form data */
export interface SportFormData {
  primarySport: string;
  secondarySport?: string;
  thirdSport?: string;
  selectedSports?: string[];
}

/** Positions form data */
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

/** Referral source data */
export interface ReferralSourceData {
  source: string;
  clubName?: string;
  otherSpecify?: string;
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
  referralSource?: ReferralSourceData;
}

/** Navigation state */
export interface NavigationState {
  currentStepIndex: number;
  totalSteps: number;
  steps: OnboardingStep[];
  formData: Partial<OnboardingFormData>;
  userType: OnboardingUserType;
}

/** Initial state options */
export interface InitialStateOptions {
  userType?: OnboardingUserType;
  teamCode?: TeamCodePrefillData;
}

/** User data for type detection */
export interface UserDataForDetection {
  isRecruit?: boolean;
  isCollegeCoach?: boolean;
  isFan?: boolean;
  highSchool?: string;
  primarySport?: string;
  organization?: string;
  coachTitle?: string;
}

// ============================================
// CONSTANTS
// ============================================

/** Role selection step - shown first when user type is unknown */
export const ROLE_SELECTION_STEP: OnboardingStep = {
  id: 'role',
  title: 'Who are you?',
  subtitle: 'Select your role to personalize your experience',
  required: true,
  order: 0,
};

/** Step configuration per user type */
export const ONBOARDING_STEPS: Record<OnboardingUserType, OnboardingStep[]> = {
  athlete: [
    {
      id: 'profile',
      title: 'Your Profile',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'school',
      title: 'Your School',
      subtitle: 'Where do you play?',
      required: true,
      order: 2,
    },
    {
      id: 'sport',
      title: 'Your Sport',
      subtitle: 'What sport do you play?',
      required: true,
      order: 3,
    },
    {
      id: 'positions',
      title: 'Your Positions',
      subtitle: 'What positions do you play?',
      required: true,
      order: 4,
    },
    {
      id: 'contact',
      title: 'Contact Info',
      subtitle: 'How can coaches reach you?',
      required: false,
      order: 5,
    },
    {
      id: 'referral-source',
      title: 'One Last Thing',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 6,
    },
  ],
  coach: [
    {
      id: 'profile',
      title: 'Your Profile',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'organization',
      title: 'Your Organization',
      subtitle: 'Where do you coach?',
      required: true,
      order: 2,
    },
    {
      id: 'sport',
      title: 'Your Sport',
      subtitle: 'What sport do you coach?',
      required: true,
      order: 3,
    },
    {
      id: 'contact',
      title: 'Contact Info',
      subtitle: 'How can athletes reach you?',
      required: false,
      order: 4,
    },
    {
      id: 'referral-source',
      title: 'One Last Thing',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 5,
    },
  ],
  parent: [
    {
      id: 'profile',
      title: 'Your Profile',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'referral-source',
      title: 'One Last Thing',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 2,
    },
  ],
  scout: [
    {
      id: 'profile',
      title: 'Your Profile',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'organization',
      title: 'Your Organization',
      subtitle: 'Who do you scout for?',
      required: true,
      order: 2,
    },
    {
      id: 'sport',
      title: 'Your Sport',
      subtitle: 'What sport do you scout?',
      required: true,
      order: 3,
    },
    {
      id: 'referral-source',
      title: 'One Last Thing',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 4,
    },
  ],
  media: [
    {
      id: 'profile',
      title: 'Your Profile',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'organization',
      title: 'Your Organization',
      subtitle: 'Who do you work for?',
      required: false,
      order: 2,
    },
    {
      id: 'referral-source',
      title: 'One Last Thing',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 3,
    },
  ],
  service: [
    {
      id: 'profile',
      title: 'Your Profile',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'organization',
      title: 'Your Organization',
      subtitle: 'Tell us about your service',
      required: true,
      order: 2,
    },
    {
      id: 'referral-source',
      title: 'One Last Thing',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 3,
    },
  ],
  fan: [
    {
      id: 'profile',
      title: 'Your Profile',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'referral-source',
      title: 'One Last Thing',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 2,
    },
  ],
};

// ============================================
// PURE VALIDATION FUNCTIONS
// ============================================

/**
 * Validate profile step data
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateProfile(data?: ProfileFormData): boolean {
  if (!data) return false;
  return !!(data.firstName?.trim() && data.lastName?.trim());
}

/**
 * Validate school step data
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateSchool(data?: SchoolFormData): boolean {
  if (!data) return false;
  return !!(data.schoolName?.trim() && data.classYear);
}

/**
 * Validate organization step data
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateOrganization(data?: OrganizationFormData): boolean {
  if (!data) return false;
  return !!data.organizationName?.trim();
}

/**
 * Validate sport step data
 * Accepts either primarySport or selectedSports array with at least one item
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateSport(data?: SportFormData): boolean {
  if (!data) return false;
  // Check selectedSports array first (new multi-select system)
  if (data.selectedSports && data.selectedSports.length > 0) {
    return true;
  }
  // Fallback to primarySport (backwards compatibility)
  return !!data.primarySport?.trim();
}

/**
 * Validate positions step data
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validatePositions(data?: PositionsFormData): boolean {
  if (!data) return false;
  return data.positions?.length > 0;
}

/**
 * Validate contact step data (always valid - optional step)
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateContact(_data?: ContactFormData): boolean {
  return true;
}

/**
 * Validate a specific step
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateStep(
  stepId: OnboardingStepId,
  formData: Partial<OnboardingFormData>,
  pendingRole?: OnboardingUserType | null
): boolean {
  switch (stepId) {
    case 'role':
      return pendingRole !== null || !!formData.userType;
    case 'profile':
      return validateProfile(formData.profile);
    case 'school':
      return validateSchool(formData.school);
    case 'organization':
      return validateOrganization(formData.organization);
    case 'sport':
      return validateSport(formData.sport);
    case 'positions':
      return validatePositions(formData.positions);
    case 'contact':
      return validateContact(formData.contact);
    case 'referral-source':
    case 'social':
    case 'complete':
      return true;
    default:
      return true;
  }
}

// ============================================
// PURE NAVIGATION FUNCTIONS
// ============================================

/**
 * Check if can navigate to next step
 * ⭐ PURE FUNCTION - No dependencies
 */
export function canNavigateNext(
  state: NavigationState,
  pendingRole?: OnboardingUserType | null
): boolean {
  const currentStep = state.steps[state.currentStepIndex];
  if (!currentStep) return false;
  return validateStep(currentStep.id, state.formData, pendingRole);
}

/**
 * Check if can navigate to previous step
 * ⭐ PURE FUNCTION - No dependencies
 */
export function canNavigatePrevious(state: NavigationState): boolean {
  return state.currentStepIndex > 0;
}

/**
 * Get next step index
 * ⭐ PURE FUNCTION - No dependencies
 */
export function getNextStepIndex(state: NavigationState): number {
  return Math.min(state.currentStepIndex + 1, state.totalSteps - 1);
}

/**
 * Get previous step index
 * ⭐ PURE FUNCTION - No dependencies
 */
export function getPreviousStepIndex(state: NavigationState): number {
  return Math.max(state.currentStepIndex - 1, 0);
}

/**
 * Check if can navigate to a specific step
 * ⭐ PURE FUNCTION - No dependencies
 */
export function canNavigateToStep(
  state: NavigationState,
  stepIndex: number,
  pendingRole?: OnboardingUserType | null
): boolean {
  if (stepIndex < 0 || stepIndex >= state.totalSteps) return false;

  // Can always go back
  if (stepIndex < state.currentStepIndex) return true;

  // Can only go forward if all previous steps valid
  for (let i = state.currentStepIndex; i < stepIndex; i++) {
    const step = state.steps[i];
    if (step.required && !validateStep(step.id, state.formData, pendingRole)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if on last step
 * ⭐ PURE FUNCTION - No dependencies
 */
export function isLastStep(state: NavigationState): boolean {
  return state.currentStepIndex === state.totalSteps - 1;
}

/**
 * Check if on first step
 * ⭐ PURE FUNCTION - No dependencies
 */
export function isFirstStep(state: NavigationState): boolean {
  return state.currentStepIndex === 0;
}

/**
 * Calculate progress percentage
 * ⭐ PURE FUNCTION - No dependencies
 */
export function calculateProgress(state: NavigationState): number {
  if (state.totalSteps <= 1) return 100;
  return Math.round((state.currentStepIndex / (state.totalSteps - 1)) * 100);
}

// ============================================
// PURE USER TYPE DETECTION FUNCTIONS
// ============================================

/**
 * Map team code role string to OnboardingUserType
 * ⭐ PURE FUNCTION - No dependencies
 */
export function mapTeamCodeRole(role: string): OnboardingUserType {
  const roleMap: Record<string, OnboardingUserType> = {
    athlete: 'athlete',
    coach: 'coach',
    admin: 'coach',
    media: 'media',
    parent: 'parent',
    scout: 'scout',
    service: 'service',
  };
  return roleMap[role.toLowerCase()] ?? 'athlete';
}

/**
 * Detect user type from team code
 * ⭐ PURE FUNCTION - No dependencies
 */
export function detectUserTypeFromTeamCode(
  teamCode: string
): OnboardingUserType {
  const roleCode = teamCode.slice(-2);
  if (roleCode === '01') return 'athlete';
  if (roleCode === '02') return 'coach';
  if (roleCode === '03') return 'media';
  return 'athlete';
}

/**
 * Detect user type from user data
 * ⭐ PURE FUNCTION - No dependencies
 */
export function detectUserTypeFromUserData(
  userData: UserDataForDetection
): OnboardingUserType | null {
  if (userData.isRecruit === true) return 'athlete';
  if (userData.isCollegeCoach === true) return 'coach';
  if (userData.isFan === true) return 'fan';
  if (userData.highSchool || userData.primarySport) return 'athlete';
  if (userData.organization || userData.coachTitle) return 'coach';
  return null;
}

/**
 * Map team type string to school type
 * ⭐ PURE FUNCTION - No dependencies
 */
export function mapTeamType(
  teamType?: string
): 'High School' | 'Middle School' | 'Club' | 'Juco' {
  if (!teamType) return 'High School';
  const type = teamType.toLowerCase();
  if (type.includes('club')) return 'Club';
  if (type.includes('middle')) return 'Middle School';
  if (type.includes('juco')) return 'Juco';
  return 'High School';
}

// ============================================
// PURE STEP CONFIGURATION FUNCTIONS
// ============================================

/**
 * Get steps for user type
 * ⭐ PURE FUNCTION - No dependencies
 */
export function getStepsForUserType(
  userType: OnboardingUserType,
  teamCode?: TeamCodePrefillData
): OnboardingStep[] {
  let steps = [...ONBOARDING_STEPS[userType]];

  // Skip sport step if pre-filled from team code
  if (teamCode?.sport) {
    steps = steps.filter((s) => s.id !== 'sport');
  }

  return steps.sort((a, b) => a.order - b.order);
}

/**
 * Configure steps when user type changes (includes role selection)
 * ⭐ PURE FUNCTION - No dependencies
 */
export function configureStepsForUserType(
  userType: OnboardingUserType,
  teamCode?: TeamCodePrefillData
): OnboardingStep[] {
  const typeSteps = getStepsForUserType(userType, teamCode);
  return [ROLE_SELECTION_STEP, ...typeSteps];
}

/**
 * Build initial form data from team code
 * ⭐ PURE FUNCTION - No dependencies
 */
export function buildInitialFormDataFromTeamCode(
  userType: OnboardingUserType,
  teamCode: TeamCodePrefillData
): Partial<OnboardingFormData> {
  const formData: Partial<OnboardingFormData> = { userType };

  if (userType === 'athlete') {
    formData.school = {
      schoolName: teamCode.teamName ?? '',
      schoolType: mapTeamType(teamCode.teamType),
      classYear: null,
      state: teamCode.state,
    };
  } else {
    formData.organization = {
      organizationName: teamCode.teamName ?? '',
      organizationType: teamCode.teamType,
    };
  }

  if (teamCode.sport) {
    formData.sport = {
      primarySport: teamCode.sport,
    };
  }

  return formData;
}

/**
 * Build initial form data from user data
 * ⭐ PURE FUNCTION - No dependencies
 *
 * @param userData - User data with field names matching User model
 */
export function buildInitialFormDataFromUser(userData: {
  firstName?: string;
  lastName?: string;
  /** Profile image URL - matches User.profileImg */
  profileImg?: string | null;
}): Partial<OnboardingFormData> {
  return {
    profile: {
      firstName: userData.firstName ?? '',
      lastName: userData.lastName ?? '',
      profileImg: userData.profileImg ?? null,
    },
  };
}

/**
 * Get redirect path based on user type
 * ⭐ PURE FUNCTION - No dependencies
 */
export function getRedirectPath(_userType: OnboardingUserType): string {
  return '/explore';
}

// ============================================
// API FACTORY
// ============================================

/**
 * Create Onboarding Navigation API
 * ⭐ Works on Web (Angular), Mobile (React Native), or any JS environment
 *
 * This is a stateless API - state is managed by the wrapping service
 *
 * @example
 * ```typescript
 * const navigationApi = createOnboardingNavigationApi();
 *
 * // Check if can proceed
 * const canProceed = navigationApi.canNavigateNext(state);
 *
 * // Get steps for user type
 * const steps = navigationApi.getStepsForUserType('athlete', teamCode);
 * ```
 */
export function createOnboardingNavigationApi() {
  return {
    // Validation
    validateStep,
    validateProfile,
    validateSchool,
    validateOrganization,
    validateSport,
    validatePositions,
    validateContact,

    // Navigation
    canNavigateNext,
    canNavigatePrevious,
    canNavigateToStep,
    getNextStepIndex,
    getPreviousStepIndex,
    isLastStep,
    isFirstStep,
    calculateProgress,

    // User type detection
    mapTeamCodeRole,
    detectUserTypeFromTeamCode,
    detectUserTypeFromUserData,
    mapTeamType,

    // Step configuration
    getStepsForUserType,
    configureStepsForUserType,
    buildInitialFormDataFromTeamCode,
    buildInitialFormDataFromUser,
    getRedirectPath,

    // Constants
    ROLE_SELECTION_STEP,
    ONBOARDING_STEPS,
  };
}

// Type export for the API
export type OnboardingNavigationApi = ReturnType<
  typeof createOnboardingNavigationApi
>;
