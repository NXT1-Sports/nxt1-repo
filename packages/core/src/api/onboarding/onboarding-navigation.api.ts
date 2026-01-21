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
  /** Graduation year (Class of) - required for athletes */
  classYear?: number | null;
}

/**
 * Team type options for onboarding UI
 * Uses display-friendly values (vs constants/TeamType which uses kebab-case)
 */
export type OnboardingTeamType = 'High School' | 'Middle School' | 'Club' | 'JUCO';

// ============================================
// SPORT-CENTRIC DATA MODEL (v3.0)
// Each sport has its own team and positions
// ============================================

/**
 * Team info for a specific sport
 * Captures team details associated with one sport
 */
export interface SportTeamInfo {
  /** Team name (e.g., "Lincoln High School", "Texas Elite FC") */
  name: string;
  /** Type of team */
  type?: OnboardingTeamType;
  /** State/Region (optional) */
  state?: string;
  /** City (optional) */
  city?: string;
  /** Team logo URL or base64 data URI */
  logo?: string | null;
  /** Team colors array (hex values, e.g., ["#000000", "#CCFF00"]) */
  colors?: string[];
}

/**
 * Sport entry - bundles sport + team + positions together
 * This is the core unit of the sport-centric architecture
 *
 * @example
 * ```typescript
 * const footballEntry: SportEntry = {
 *   sport: 'Football',
 *   isPrimary: true,
 *   team: { name: 'Lincoln High School', type: 'High School', colors: ['#000000', '#FFD700'] },
 *   positions: ['QB', 'WR']
 * };
 * ```
 */
export interface SportEntry {
  /** Sport identifier (matches DEFAULT_SPORTS values) */
  sport: string;
  /** Whether this is the primary sport (first added = primary) */
  isPrimary: boolean;
  /** Team information for this sport */
  team: SportTeamInfo;
  /** Positions played in this sport */
  positions: string[];
}

/**
 * Creates an empty sport entry with default values
 */
export function createEmptySportEntry(sport: string, isPrimary = false): SportEntry {
  return {
    sport,
    isPrimary,
    team: {
      name: '',
      type: undefined,
      logo: null,
      colors: [],
    },
    positions: [],
  };
}

/**
 * Sport form data - array of sport entries (v3.0)
 * Each entry contains sport + team + positions as a unit
 *
 * This consolidates the old separate team/positions steps into
 * a single sport-centric data structure.
 *
 * @example
 * ```typescript
 * const sportData: SportFormData = {
 *   sports: [
 *     { sport: 'Football', isPrimary: true, team: { name: 'Lincoln HS' }, positions: ['QB'] },
 *     { sport: 'Track', isPrimary: false, team: { name: 'Lincoln HS' }, positions: ['100m', '200m'] }
 *   ]
 * };
 * ```
 */
export interface SportFormData {
  /** Array of sport entries (1-3 sports supported) */
  sports: SportEntry[];
}

// ============================================
// LEGACY INTERFACES (deprecated, kept for migration)
// ============================================

/**
 * Team form data - for athletes to identify their team
 * @deprecated Use SportFormData.sports[].team instead (v3.0)
 */
export interface TeamFormData {
  /** Team name (e.g., "Lincoln High School", "Texas Elite FC") */
  teamName: string;
  /** Type of team */
  teamType?: OnboardingTeamType;
  /**
   * @deprecated Moved to ProfileFormData. Kept for backward compatibility.
   */
  classYear?: number | null;
  /** State/Region (optional) */
  state?: string;
  /** City (optional) */
  city?: string;
  /** Team logo URL or base64 data URI */
  teamLogo?: string | null;
  /** Team colors array (hex values, e.g., ["#000000", "#CCFF00"]) */
  teamColors?: string[];
  /** Second team name (optional - for athletes on multiple teams) */
  secondTeamName?: string;
  /** Second team type (optional) */
  secondTeamType?: OnboardingTeamType;
  /** Second team logo URL or base64 data URI */
  secondTeamLogo?: string | null;
  /** Second team colors array (hex values) */
  secondTeamColors?: string[];
}

/**
 * School form data
 * @deprecated Use SportFormData.sports[].team instead (v3.0)
 */
export interface SchoolFormData extends TeamFormData {
  /** @deprecated Use teamName instead */
  schoolName: string;
  /** @deprecated Use teamType instead */
  schoolType?: OnboardingTeamType;
  /** @deprecated Club field no longer needed */
  club?: string;
}

/**
 * Positions form data
 * @deprecated Use SportFormData.sports[].positions instead (v3.0)
 */
export interface PositionsFormData {
  positions: string[];
}

/** Organization form data */
export interface OrganizationFormData {
  organizationName: string;
  organizationType?: string;
  title?: string;
  secondOrganization?: string;
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
  details?: string;
  clubName?: string;
  otherSpecify?: string;
}

/** Complete onboarding form data */
export interface OnboardingFormData {
  userType: OnboardingUserType;
  profile?: ProfileFormData;
  /**
   * Sport data for athletes (v3.0)
   * Contains array of sport entries, each with team and positions
   */
  sport?: SportFormData;
  /**
   * @deprecated Use sport.sports[].team instead (v3.0)
   */
  team?: TeamFormData;
  /**
   * @deprecated Use sport instead (v3.0)
   */
  school?: SchoolFormData;
  organization?: OrganizationFormData;
  /**
   * @deprecated Use sport.sports[].positions instead (v3.0)
   */
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

/** Role selection step - shown at the END as optional enhancement */
export const ROLE_SELECTION_STEP: OnboardingStep = {
  id: 'role',
  title: 'Enhance Your Experience',
  subtitle: 'How do you want to use NXT1? (Optional)',
  required: false,
  order: 999, // End of flow
};

/** Step configuration per user type */
export const ONBOARDING_STEPS: Record<OnboardingUserType, OnboardingStep[]> = {
  athlete: [
    {
      id: 'profile',
      title: 'Get Started',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'sport',
      title: 'Your Sports',
      subtitle: 'What sports do you follow?',
      required: true,
      order: 2,
    },
    {
      id: 'referral-source',
      title: 'Almost Done',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 3,
    },
    {
      id: 'role',
      title: 'Enhance Your Experience',
      subtitle: 'Want to unlock more features? (Optional)',
      required: false,
      order: 4,
    },
  ],
  coach: [
    {
      id: 'profile',
      title: 'Get Started',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'sport',
      title: 'Your Sports',
      subtitle: 'What sports do you follow?',
      required: true,
      order: 2,
    },
    {
      id: 'referral-source',
      title: 'Almost Done',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 3,
    },
    {
      id: 'role',
      title: 'Enhance Your Experience',
      subtitle: 'Want to unlock more features? (Optional)',
      required: false,
      order: 4,
    },
  ],
  parent: [
    {
      id: 'profile',
      title: 'Get Started',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'sport',
      title: 'Your Sports',
      subtitle: 'What sports do you follow?',
      required: true,
      order: 2,
    },
    {
      id: 'referral-source',
      title: 'Almost Done',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 3,
    },
    {
      id: 'role',
      title: 'Enhance Your Experience',
      subtitle: 'Want to unlock more features? (Optional)',
      required: false,
      order: 4,
    },
  ],
  scout: [
    {
      id: 'profile',
      title: 'Get Started',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'sport',
      title: 'Your Sports',
      subtitle: 'What sports do you follow?',
      required: true,
      order: 2,
    },
    {
      id: 'referral-source',
      title: 'Almost Done',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 3,
    },
    {
      id: 'role',
      title: 'Enhance Your Experience',
      subtitle: 'Want to unlock more features? (Optional)',
      required: false,
      order: 4,
    },
  ],
  media: [
    {
      id: 'profile',
      title: 'Get Started',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'sport',
      title: 'Your Sports',
      subtitle: 'What sports do you follow?',
      required: true,
      order: 2,
    },
    {
      id: 'referral-source',
      title: 'Almost Done',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 3,
    },
    {
      id: 'role',
      title: 'Enhance Your Experience',
      subtitle: 'Want to unlock more features? (Optional)',
      required: false,
      order: 4,
    },
  ],
  service: [
    {
      id: 'profile',
      title: 'Get Started',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'sport',
      title: 'Your Sports',
      subtitle: 'What sports do you follow?',
      required: true,
      order: 2,
    },
    {
      id: 'referral-source',
      title: 'Almost Done',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 3,
    },
    {
      id: 'role',
      title: 'Enhance Your Experience',
      subtitle: 'Want to unlock more features? (Optional)',
      required: false,
      order: 4,
    },
  ],
  fan: [
    {
      id: 'profile',
      title: 'Get Started',
      subtitle: "Let's get to know you",
      required: true,
      order: 1,
    },
    {
      id: 'sport',
      title: 'Your Sports',
      subtitle: 'What sports do you follow?',
      required: true,
      order: 2,
    },
    {
      id: 'referral-source',
      title: 'Almost Done',
      subtitle: 'How did you hear about us?',
      required: false,
      order: 3,
    },
    {
      id: 'role',
      title: 'Enhance Your Experience',
      subtitle: 'Want to unlock more features? (Optional)',
      required: false,
      order: 4,
    },
  ],
};

// ============================================
// PURE VALIDATION FUNCTIONS
// ============================================

/**
 * Validate profile step data
 * Requires first name, last name, and class year (for athletes)
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateProfile(data?: ProfileFormData, requireClassYear = true): boolean {
  if (!data) return false;
  const hasNames = !!(data.firstName?.trim() && data.lastName?.trim());
  // Class year is required for athletes (default), optional for other roles
  if (requireClassYear) {
    return hasNames && data.classYear !== null && data.classYear !== undefined;
  }
  return hasNames;
}

/**
 * Validate team step data
 * Requires team name only (class year moved to profile step)
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateTeam(data?: TeamFormData): boolean {
  if (!data) return false;
  return !!data.teamName?.trim();
}

/**
 * Validate school step data
 * @deprecated Use validateTeam instead
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateSchool(data?: SchoolFormData): boolean {
  if (!data) return false;
  // Support both old schoolName and new teamName
  const teamName = data.teamName || data.schoolName;
  return !!teamName?.trim();
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
 * Validate a single sport entry
 * Requires sport name, team name, and at least one position
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateSportEntry(entry: SportEntry): boolean {
  if (!entry) return false;

  // Must have sport selected
  if (!entry.sport?.trim()) return false;

  // Must have team name
  if (!entry.team?.name?.trim()) return false;

  // Must have at least one position
  if (!entry.positions || entry.positions.length === 0) return false;
  if (!entry.positions.every((p) => p.trim().length > 0)) return false;

  return true;
}

/**
 * Validate sport step data (v3.0)
 * Requires at least one complete sport entry with team and positions
 * ⭐ PURE FUNCTION - No dependencies
 *
 * @example
 * ```typescript
 * // Valid - has complete sport entry
 * validateSport({ sports: [{ sport: 'Football', team: { name: 'Lincoln HS' }, positions: ['QB'] }] })
 * // => true
 *
 * // Invalid - missing positions
 * validateSport({ sports: [{ sport: 'Football', team: { name: 'Lincoln HS' }, positions: [] }] })
 * // => false
 * ```
 */
export function validateSport(data?: SportFormData): boolean {
  if (!data) return false;
  if (!data.sports || data.sports.length === 0) return false;

  // All entries must be valid
  return data.sports.every((entry) => validateSportEntry(entry));
}

/**
 * Validate positions step data
 * @deprecated Positions are now validated as part of validateSport (v3.0)
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
  // Determine if class year is required (only for athletes)
  const userType = pendingRole ?? formData.userType;
  const requireClassYear = userType === 'athlete';

  switch (stepId) {
    case 'role':
      return pendingRole !== null || !!formData.userType;
    case 'profile':
      return validateProfile(formData.profile, requireClassYear);
    case 'school':
      // Legacy support - use validateSport for new v3.0 flow
      return validateTeam(formData.team) || validateSchool(formData.school);
    case 'organization':
      return validateOrganization(formData.organization);
    case 'sport':
      return validateSport(formData.sport);
    case 'positions':
      // Legacy support - positions are now part of sport entries
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
export function detectUserTypeFromTeamCode(teamCode: string): OnboardingUserType {
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
 * Map team type string to OnboardingTeamType
 * ⭐ PURE FUNCTION - No dependencies
 */
export function mapTeamType(teamType?: string): OnboardingTeamType {
  if (!teamType) return 'High School';
  const type = teamType.toLowerCase();
  if (type.includes('club')) return 'Club';
  if (type.includes('middle')) return 'Middle School';
  if (type.includes('juco')) return 'JUCO';
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
 * Build initial form data from team code (v3.0)
 * Uses the new sport-centric model
 * ⭐ PURE FUNCTION - No dependencies
 */
export function buildInitialFormDataFromTeamCode(
  userType: OnboardingUserType,
  teamCode: TeamCodePrefillData
): Partial<OnboardingFormData> {
  const formData: Partial<OnboardingFormData> = { userType };

  if (userType === 'athlete') {
    // Build sport entry with team info from team code
    if (teamCode.sport) {
      const sportEntry: SportEntry = {
        sport: teamCode.sport,
        isPrimary: true,
        team: {
          name: teamCode.teamName ?? '',
          type: mapTeamType(teamCode.teamType),
          state: teamCode.state,
          logo: teamCode.teamLogoImg ?? null,
          colors: [teamCode.teamColor1, teamCode.teamColor2].filter(Boolean) as string[],
        },
        positions: [],
      };
      formData.sport = {
        sports: [sportEntry],
      };
    }

    // Also set legacy school field for backward compatibility
    const teamName = teamCode.teamName ?? '';
    formData.school = {
      teamName,
      teamType: mapTeamType(teamCode.teamType),
      classYear: null,
      state: teamCode.state,
      // Backward compatibility aliases
      schoolName: teamName,
      schoolType: mapTeamType(teamCode.teamType),
    };
  } else {
    formData.organization = {
      organizationName: teamCode.teamName ?? '',
      organizationType: teamCode.teamType,
    };

    // Non-athletes use simple sport selection
    // (Coaches still need to select sport, but without team/positions)
    if (teamCode.sport) {
      formData.sport = {
        sports: [createEmptySportEntry(teamCode.sport, true)],
      };
    }
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
    validateTeam,
    validateSchool, // @deprecated - use validateTeam
    validateOrganization,
    validateSport,
    validateSportEntry,
    validatePositions, // @deprecated - use validateSport
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

    // Helper functions
    createEmptySportEntry,

    // Constants
    ROLE_SELECTION_STEP,
    ONBOARDING_STEPS,
  };
}

// Type export for the API
export type OnboardingNavigationApi = ReturnType<typeof createOnboardingNavigationApi>;
