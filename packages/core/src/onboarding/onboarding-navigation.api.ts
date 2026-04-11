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
 * @module @nxt1/core/onboarding
 * @version 2.0.0
 */

// Import from source of truth
import type { Gender } from '../constants/user.constants';
import { GENDER_CONFIGS, USER_ROLES } from '../constants/user.constants';
import { getPositionsForSport } from '../constants';
import type { Location } from '../models/user';

// ============================================
// TYPES
// ============================================

/**
 * User type for onboarding - matches UserRole from constants.
 * 3 core roles supported by the platform.
 */
export type OnboardingUserType = 'athlete' | 'coach' | 'director';

/** Step IDs */
export type OnboardingStepId =
  | 'role'
  | 'profile'
  | 'link-sources'
  | 'team-link-sources'
  | 'school'
  | 'organization'
  | 'sport'
  | 'select-teams'
  | 'create-team-profile'
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
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  sport?: string;
  state?: string;
  role?: string;
}

// ============================================
// GENDER OPTIONS - Re-export from constants (source of truth)
// ============================================

/**
 * Gender option type - re-exported from user constants.
 * @see GENDERS in @nxt1/core/constants for values
 * @see GENDER_CONFIGS for display options
 */
export type GenderOption = Gender;

/**
 * Gender display labels - re-exported from user constants.
 * Use this for UI rendering (dropdowns, chips, etc.)
 * @deprecated Use GENDER_CONFIGS directly for type safety
 */
export const GENDER_OPTIONS: readonly { value: GenderOption; label: string }[] = GENDER_CONFIGS.map(
  (config) => ({ value: config.id, label: config.label })
);

// ============================================
// LOCATION DATA - Compatible with User.location
// ============================================

/**
 * Profile location data for onboarding forms.
 * Designed to be compatible with User.location interface.
 *
 * Flow: Geolocation → ProfileLocationData → User.location
 *
 * @see Location in @nxt1/core/models for the User model type
 * @see ReverseGeocodedLocation in @nxt1/core/geolocation for full geolocation data
 */
export interface ProfileLocationData {
  /** Street address (optional during onboarding) */
  address?: string;
  /** City name (required for User.location) */
  city?: string;
  /** State/Province/Region code (e.g., 'TX', 'CA') - required for User.location */
  state?: string;
  /** Postal/ZIP code */
  zipCode?: string;
  /** Country (defaults to 'US' if not provided) */
  country?: string;
  /** Full formatted address (for display only, not persisted) */
  formatted?: string;
  /** Whether location was auto-detected via geolocation (metadata, not persisted) */
  isAutoDetected?: boolean;
}

/**
 * Convert ProfileLocationData to User.location format.
 * Ensures all required fields are present.
 */
export function toUserLocation(data: ProfileLocationData): Location | undefined {
  if (!data.city || !data.state) {
    return undefined;
  }
  return {
    address: data.address,
    city: data.city,
    state: data.state,
    zipCode: data.zipCode,
    country: data.country || 'US',
  };
}

/** Profile form data */
export interface ProfileFormData {
  firstName: string;
  lastName: string;
  profileImgs?: string[] | null;
  /**
   * Gender selection (inclusive options).
   * @see Gender in @nxt1/core/constants
   */
  gender?: GenderOption | null;
  /**
   * User location (city, state).
   * Converts to User.location on save via toUserLocation()
   */
  location?: ProfileLocationData | null;
  /** Graduation year (Class of) - collected later for athletes, not in initial profile step */
  classYear?: number | null;
  /**
   * Coach title - only set when userType is 'coach'.
   * Stored as CoachData.title on the user profile.
   */
  coachTitle?: 'head-coach' | 'assistant-coach' | null;
  /**
   * Phone number (optional) - stored as contact.phone on the user profile.
   * Collected in the profile basics step for early contact info.
   */
  phoneNumber?: string;
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
  /** Team logo URL — matches Organization/Team docs */
  logoUrl?: string;
  /** @deprecated Use logoUrl */
  logo?: string | null;
  /** Primary team color (hex) — matches Organization/Team docs */
  primaryColor?: string;
  /** Secondary team color (hex) — matches Organization/Team docs */
  secondaryColor?: string;
  /** @deprecated Use primaryColor + secondaryColor */
  colors?: string[];
  /** Team document ID — used by backend to backfill organizationId */
  teamId?: string;
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
      logoUrl: undefined,
      logo: null,
      primaryColor: undefined,
      secondaryColor: undefined,
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
  /** Coach title captured in the sport step for coach onboarding */
  coachTitle?: 'head-coach' | 'assistant-coach' | null;
}

// ============================================
// TEAM SELECTION DATA MODEL (v4.1)
// After sport selection, user searches/selects up to 2 teams
// ============================================

/**
 * A team selected during onboarding team selection step.
 * Contains the display-friendly fields needed for the onboarding UI.
 */
export interface TeamSelectionEntry {
  /** Firestore document ID of the team, or `draft_{uuid}` for ghost entries */
  readonly id: string;
  /** Team display name */
  readonly name: string;
  /** Sport this team plays */
  readonly sport: string;
  /** Team type: school, club, travel, etc. */
  readonly teamType?: string;
  /** Location string (e.g. "Austin, TX") */
  readonly location?: string;
  /** Team logo URL */
  readonly logoUrl?: string;
  /** Team colors (hex values) */
  readonly colors?: readonly string[];
  /** Member count */
  readonly memberCount?: number;
  /** Whether this team is tagged as a school (High School / Middle School) */
  readonly isSchool: boolean;
  /** Whether this is a draft/ghost entry created by the user (not yet in DB) */
  readonly isDraft?: boolean;
  /** Organization ID (for existing programs) */
  readonly organizationId?: string;
}

/**
 * Team selection form data — collected in the 'select-teams' onboarding step.
 * Users can select up to 2 teams across all their sports, or create/join a program.
 *
 * Auto-population logic:
 * - If user has multiple sports and a team is tagged as a school,
 *   that school is auto-applied to all school-eligible sports.
 * - Club teams are NOT auto-populated across sports.
 */
export interface TeamSelectionFormData {
  /** Selected teams (max 2) */
  readonly teams: readonly TeamSelectionEntry[];
}

// ============================================
// TEAM CREATION DATA MODEL (for Coaches/Directors)
// ============================================

export interface CreateTeamProfileFormData {
  programName: string;
  teamType: OnboardingTeamType;
  mascot?: string;
  state?: string;
  city?: string;
  level?: string;
  gender?: 'boys' | 'girls' | 'co-ed';
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

/** Link sources (connected accounts) form data */
export interface LinkSourcesFormData {
  /** Social media / athletic profile links */
  links: LinkSourceEntry[];
}

/** Single connected source entry */
export interface LinkSourceEntry {
  /** Platform identifier (e.g., 'twitter', 'instagram', 'hudl') */
  platform: string;
  /** Whether the platform is connected */
  connected: boolean;
  /** How this connection was made: 'link' = pasted URL/username, 'signin' = OAuth */
  connectionType?: PlatformConnectionType;
  /** Username/handle */
  username?: string;
  /** Profile URL */
  url?: string;
  /**
   * Scope of this entry:
   * - 'global' — applies to all sports/teams (e.g., Instagram, Twitter)
   * - 'sport'  — specific to one sport (e.g., Hudl Football profile)
   * - 'team'   — specific to one team (coach's program-specific profile)
   * Omitted = 'global' (backward compatible)
   */
  scopeType?: 'global' | 'sport' | 'team';
  /** Sport key or team ID when scoped */
  scopeId?: string;
  /** Display name of the person who originally added this link (seeded from existing team data) */
  addedBy?: string;
  /** User ID of the person who originally added this link */
  addedById?: string;
  /** True when this link was seeded from an existing team source and is immutable during onboarding */
  locked?: boolean;
}

// ============================================
// PLATFORM REGISTRY — Sport-aware link sources
// ============================================

/** Connection method: 'link' = paste URL/username, 'signin' = OAuth sign-in */
export type PlatformConnectionType = 'link' | 'signin';

/**
 * Platform scope — determines whether a platform's links are global
 * or scoped to a specific sport/team.
 *
 * - 'global' — One link applies everywhere (Instagram, Twitter, YouTube)
 * - 'sport'  — Per-sport profiles (Hudl, MaxPreps, Perfect Game)
 * - 'team'   — Per-team profiles (mostly for coaches managing multiple programs)
 */
export type PlatformScope = 'global' | 'sport' | 'team';

/** Platform category for grouping in the UI */
export type PlatformCategory =
  | 'social'
  | 'film'
  | 'recruiting'
  | 'metrics'
  | 'stats'
  | 'academic'
  | 'schedule'
  | 'contact'
  | 'signin';

/** Platform definition for connected accounts */
export interface PlatformDefinition {
  /** Unique platform identifier */
  readonly platform: string;
  /** Display label */
  readonly label: string;
  /** Icon name from icon registry */
  readonly icon: string;
  /** How the user connects: paste link/username or sign in */
  readonly connectionType: PlatformConnectionType;
  /** Category for section grouping */
  readonly category: PlatformCategory;
  /**
   * Whether this platform's links are global or per-sport/team.
   * - 'global' — One link across all sports (social media)
   * - 'sport'  — User links separately per sport (film, stats, recruiting)
   * - 'team'   — User links separately per team (coach programs)
   */
  readonly scope: PlatformScope;
  /** Sports this platform is relevant for (empty = all sports) */
  readonly sports: readonly string[];
  /** Input placeholder text */
  readonly placeholder: string;
  /**
   * Login URL for Firecrawl-based sign-in platforms.
   * When present, Agent X opens an interactive browser session at this URL
   * so the user can authenticate. The session is persisted via Firecrawl
   * Persistent Profiles for future autonomous access.
   *
   * Only used when `connectionType === 'signin'`.
   */
  readonly loginUrl?: string;
}

/**
 * All available platforms, categorized and sport-aware.
 * Sports use base names (e.g. 'football' not 'Football').
 * Empty sports array = available for all sports.
 *
 * ⭐ PURE DATA - No dependencies
 */
export const PLATFORM_REGISTRY: readonly PlatformDefinition[] = [
  // ---- Social (global — one link across all sports) ----
  {
    platform: 'instagram',
    label: 'Instagram',
    icon: 'link',
    connectionType: 'link',
    category: 'social',
    scope: 'global',
    sports: [],
    placeholder: 'username',
  },
  {
    platform: 'twitter',
    label: 'X',
    icon: 'link',
    connectionType: 'link',
    category: 'social',
    scope: 'global',
    sports: [],
    placeholder: '@username',
  },
  {
    platform: 'tiktok',
    label: 'TikTok',
    icon: 'link',
    connectionType: 'link',
    category: 'social',
    scope: 'global',
    sports: [],
    placeholder: '@username',
  },
  {
    platform: 'youtube',
    label: 'YouTube',
    icon: 'link',
    connectionType: 'link',
    category: 'social',
    scope: 'global',
    sports: [],
    placeholder: 'Channel URL',
  },
  {
    platform: 'facebook',
    label: 'Facebook',
    icon: 'link',
    connectionType: 'link',
    category: 'social',
    scope: 'global',
    sports: [],
    placeholder: 'Profile URL',
  },

  // ---- Film & Highlights (sport-scoped — different per sport) ----
  {
    platform: 'hudl',
    label: 'Hudl',
    icon: 'link',
    connectionType: 'link',
    category: 'film',
    scope: 'sport',
    sports: [
      'football',
      'basketball',
      'soccer',
      'lacrosse',
      'volleyball',
      'field_hockey',
      'baseball',
      'softball',
      'wrestling',
      'ice_hockey',
    ],
    placeholder: 'Hudl profile URL',
  },
  {
    platform: 'krossover',
    label: 'Krossover',
    icon: 'link',
    connectionType: 'link',
    category: 'film',
    scope: 'sport',
    sports: ['basketball', 'soccer', 'volleyball', 'lacrosse', 'ice_hockey', 'field_hockey'],
    placeholder: 'Krossover profile URL',
  },
  {
    platform: 'veo',
    label: 'Veo',
    icon: 'link',
    connectionType: 'link',
    category: 'film',
    scope: 'sport',
    sports: ['soccer', 'lacrosse', 'field_hockey', 'basketball', 'volleyball'],
    placeholder: 'Veo profile URL',
  },
  {
    platform: 'ballertv',
    label: 'BallerTV',
    icon: 'link',
    connectionType: 'link',
    category: 'film',
    scope: 'sport',
    sports: ['basketball', 'volleyball', 'wrestling', 'baseball', 'softball'],
    placeholder: 'BallerTV profile URL',
  },
  {
    platform: 'nfhsnetwork',
    label: 'NFHS Network',
    icon: 'link',
    connectionType: 'link',
    category: 'film',
    scope: 'sport',
    sports: [],
    placeholder: 'NFHS Network profile URL',
  },
  {
    platform: 'sportsengineplay',
    label: 'SportsEngine Play',
    icon: 'link',
    connectionType: 'link',
    category: 'film',
    scope: 'sport',
    sports: [],
    placeholder: 'SportsEngine Play profile URL',
  },
  {
    platform: 'vimeo',
    label: 'Vimeo',
    icon: 'link',
    connectionType: 'link',
    category: 'film',
    scope: 'global',
    sports: [],
    placeholder: 'Vimeo video or profile URL',
  },

  // ---- Recruiting (sport-scoped) ----
  {
    platform: 'ncsa',
    label: 'NCSA',
    icon: 'link',
    connectionType: 'link',
    category: 'recruiting',
    scope: 'sport',
    sports: [],
    placeholder: 'NCSA profile URL',
  },
  {
    platform: 'fieldlevel',
    label: 'FieldLevel',
    icon: 'link',
    connectionType: 'link',
    category: 'recruiting',
    scope: 'sport',
    sports: [],
    placeholder: 'FieldLevel profile URL',
  },
  {
    platform: 'captainu',
    label: 'CaptainU',
    icon: 'link',
    connectionType: 'link',
    category: 'recruiting',
    scope: 'sport',
    sports: [],
    placeholder: 'CaptainU profile URL',
  },
  {
    platform: 'sportsrecruits',
    label: 'SportsRecruits',
    icon: 'link',
    connectionType: 'link',
    category: 'recruiting',
    scope: 'sport',
    sports: [],
    placeholder: 'SportsRecruits profile URL',
  },
  {
    platform: 'streamlineathletes',
    label: 'Streamline Athletes',
    icon: 'link',
    connectionType: 'link',
    category: 'recruiting',
    scope: 'sport',
    sports: [],
    placeholder: 'Streamline Athletes profile URL',
  },
  {
    platform: 'recruitlook',
    label: 'RecruitLook',
    icon: 'link',
    connectionType: 'link',
    category: 'recruiting',
    scope: 'sport',
    sports: [],
    placeholder: 'RecruitLook profile URL',
  },
  {
    platform: 'collegeathtrack',
    label: 'College Ath Track',
    icon: 'link',
    connectionType: 'link',
    category: 'recruiting',
    scope: 'sport',
    sports: ['track_field', 'cross_country'],
    placeholder: 'College Athletic Track profile URL',
  },
  {
    platform: 'connectlax',
    label: 'ConnectLAX',
    icon: 'link',
    connectionType: 'link',
    category: 'recruiting',
    scope: 'sport',
    sports: ['lacrosse'],
    placeholder: 'ConnectLAX profile URL',
  },
  {
    platform: 'imlcarecruits',
    label: 'IMLCA Recruits',
    icon: 'link',
    connectionType: 'link',
    category: 'recruiting',
    scope: 'sport',
    sports: ['lacrosse'],
    placeholder: 'IMLCA Recruits profile URL',
  },
  {
    platform: 'berecruited',
    label: 'BeRecruited',
    icon: 'link',
    connectionType: 'link',
    category: 'recruiting',
    scope: 'sport',
    sports: [],
    placeholder: 'BeRecruited profile URL',
  },

  // ---- Stats (sport-scoped — different profiles per sport) ----
  {
    platform: 'maxpreps',
    label: 'MaxPreps',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: [
      'football',
      'basketball',
      'baseball',
      'softball',
      'soccer',
      'volleyball',
      'lacrosse',
      'wrestling',
      'track_field',
      'cross_country',
      'tennis',
      'golf',
      'swimming_diving',
      'field_hockey',
      'water_polo',
    ],
    placeholder: 'MaxPreps profile URL',
  },
  {
    platform: 'perfectgame',
    label: 'Perfect Game',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['baseball', 'softball'],
    placeholder: 'Perfect Game profile URL',
  },
  {
    platform: 'prepbaseballreport',
    label: 'Prep Baseball Report',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['baseball'],
    placeholder: 'PBR profile URL',
  },
  {
    platform: '247sports',
    label: '247Sports',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['football', 'basketball'],
    placeholder: '247Sports profile URL',
  },
  {
    platform: 'rivals',
    label: 'Rivals',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['football', 'basketball'],
    placeholder: 'Rivals profile URL',
  },
  {
    platform: 'on3',
    label: 'On3',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['football', 'basketball', 'baseball'],
    placeholder: 'On3 profile URL',
  },
  {
    platform: 'gamechanger',
    label: 'GameChanger',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['baseball', 'softball', 'basketball', 'volleyball'],
    placeholder: 'GameChanger team or profile URL',
  },
  {
    platform: 'scorebooklive',
    label: 'Scorebook Live',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['football', 'basketball', 'baseball', 'softball', 'soccer', 'volleyball'],
    placeholder: 'Scorebook Live profile URL',
  },
  {
    platform: 'maxpreps',
    label: 'MaxPreps',
    icon: 'link',
    connectionType: 'link',
    category: 'schedule',
    scope: 'sport',
    sports: [
      'football',
      'basketball',
      'baseball',
      'softball',
      'soccer',
      'volleyball',
      'lacrosse',
      'wrestling',
      'track_field',
      'cross_country',
      'tennis',
      'golf',
      'swimming_diving',
      'field_hockey',
      'water_polo',
    ],
    placeholder: 'MaxPreps team or schedule URL',
  },
  {
    platform: 'gamechanger',
    label: 'GameChanger',
    icon: 'link',
    connectionType: 'link',
    category: 'schedule',
    scope: 'sport',
    sports: ['baseball', 'softball', 'basketball', 'volleyball'],
    placeholder: 'GameChanger team or schedule URL',
  },
  {
    platform: 'scorebooklive',
    label: 'Scorebook Live',
    icon: 'link',
    connectionType: 'link',
    category: 'schedule',
    scope: 'sport',
    sports: ['football', 'basketball', 'baseball', 'softball', 'soccer', 'volleyball'],
    placeholder: 'Scorebook Live team or schedule URL',
  },
  {
    platform: 'sportsengine',
    label: 'SportsEngine',
    icon: 'link',
    connectionType: 'link',
    category: 'schedule',
    scope: 'team',
    sports: [],
    placeholder: 'SportsEngine team page URL',
  },
  {
    platform: 'sidearm',
    label: 'SIDEARM Sports',
    icon: 'link',
    connectionType: 'link',
    category: 'schedule',
    scope: 'team',
    sports: [],
    placeholder: 'SIDEARM team schedule URL',
  },
  {
    platform: 'athletic',
    label: 'Athletic.net',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['track_field', 'cross_country'],
    placeholder: 'Athletic.net profile URL',
  },
  {
    platform: 'milesplit',
    label: 'MileSplit',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['track_field', 'cross_country'],
    placeholder: 'MileSplit profile URL',
  },
  {
    platform: 'swimcloud',
    label: 'SwimCloud',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['swimming_diving'],
    placeholder: 'SwimCloud profile URL',
  },
  {
    platform: 'trackwrestling',
    label: 'TrackWrestling',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['wrestling'],
    placeholder: 'TrackWrestling profile URL',
  },
  {
    platform: 'tennisrecruiting',
    label: 'TennisRecruiting.net',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['tennis'],
    placeholder: 'TennisRecruiting profile URL',
  },
  {
    platform: 'usta',
    label: 'USTA',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['tennis'],
    placeholder: 'USTA profile URL',
  },
  {
    platform: 'utr',
    label: 'UTR Sports',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['tennis'],
    placeholder: 'UTR Sports profile URL',
  },
  {
    platform: 'prepsoccer',
    label: 'PrepSoccer',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['soccer'],
    placeholder: 'PrepSoccer profile URL',
  },
  {
    platform: 'usyouthsoccer',
    label: 'US Youth Soccer',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['soccer'],
    placeholder: 'US Youth Soccer profile URL',
  },
  {
    platform: 'golfstat',
    label: 'Golfstat',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['golf'],
    placeholder: 'Golfstat profile URL',
  },
  {
    platform: 'juniorgolf',
    label: 'Junior Golf Scoreboard',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['golf'],
    placeholder: 'Junior Golf profile URL',
  },
  {
    platform: 'prephoops',
    label: 'PrepHoops',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['basketball'],
    placeholder: 'PrepHoops player profile URL',
  },
  {
    platform: 'prepfootball',
    label: 'Prep Football',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['football'],
    placeholder: 'Prep Football player profile URL',
  },
  {
    platform: 'topdrawersoccer',
    label: 'TopDrawerSoccer',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['soccer'],
    placeholder: 'TopDrawerSoccer player profile URL',
  },
  {
    platform: 'prepvolleyball',
    label: 'PrepVolleyball',
    icon: 'link',
    connectionType: 'link',
    category: 'stats',
    scope: 'sport',
    sports: ['volleyball'],
    placeholder: 'PrepVolleyball player profile URL',
  },

  // ---- Metrics (mirrors athlete profile metrics surface) ----
  {
    platform: 'hudl',
    label: 'Hudl',
    icon: 'link',
    connectionType: 'link',
    category: 'metrics',
    scope: 'sport',
    sports: [
      'football',
      'basketball',
      'soccer',
      'lacrosse',
      'volleyball',
      'field_hockey',
      'baseball',
      'softball',
      'wrestling',
      'ice_hockey',
    ],
    placeholder: 'Hudl profile URL',
  },
  {
    platform: '247sports',
    label: '247Sports',
    icon: 'link',
    connectionType: 'link',
    category: 'metrics',
    scope: 'sport',
    sports: ['football', 'basketball'],
    placeholder: '247Sports profile URL',
  },
  {
    platform: 'rivals',
    label: 'Rivals',
    icon: 'link',
    connectionType: 'link',
    category: 'metrics',
    scope: 'sport',
    sports: ['football', 'basketball'],
    placeholder: 'Rivals profile URL',
  },
  {
    platform: 'on3',
    label: 'On3',
    icon: 'link',
    connectionType: 'link',
    category: 'metrics',
    scope: 'sport',
    sports: ['football', 'basketball', 'baseball'],
    placeholder: 'On3 profile URL',
  },
  {
    platform: 'athletic',
    label: 'Athletic.net',
    icon: 'link',
    connectionType: 'link',
    category: 'metrics',
    scope: 'sport',
    sports: ['track_field', 'cross_country'],
    placeholder: 'Athletic.net profile URL',
  },
  {
    platform: 'milesplit',
    label: 'MileSplit',
    icon: 'link',
    connectionType: 'link',
    category: 'metrics',
    scope: 'sport',
    sports: ['track_field', 'cross_country'],
    placeholder: 'MileSplit profile URL',
  },
  {
    platform: 'swimcloud',
    label: 'SwimCloud',
    icon: 'link',
    connectionType: 'link',
    category: 'metrics',
    scope: 'sport',
    sports: ['swimming_diving'],
    placeholder: 'SwimCloud profile URL',
  },
  {
    platform: 'trackwrestling',
    label: 'TrackWrestling',
    icon: 'link',
    connectionType: 'link',
    category: 'metrics',
    scope: 'sport',
    sports: ['wrestling'],
    placeholder: 'TrackWrestling profile URL',
  },
  {
    platform: 'utr',
    label: 'UTR Sports',
    icon: 'link',
    connectionType: 'link',
    category: 'metrics',
    scope: 'sport',
    sports: ['tennis'],
    placeholder: 'UTR Sports profile URL',
  },
  {
    platform: 'catapult',
    label: 'Catapult',
    icon: 'link',
    connectionType: 'link',
    category: 'metrics',
    scope: 'sport',
    sports: ['football', 'basketball', 'soccer', 'lacrosse', 'ice_hockey', 'field_hockey', 'rugby'],
    placeholder: 'Catapult profile or session URL',
  },

  // ---- Academic (mirrors athlete profile academic surface) ----
  {
    platform: 'ncaaeligibility',
    label: 'NCAA Eligibility Center',
    icon: 'link',
    connectionType: 'signin',
    category: 'academic',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to NCAA Eligibility Center',
    loginUrl: 'https://web3.ncaa.org/ecwr3/',
  },
  {
    platform: 'naiaeligibility',
    label: 'NAIA Eligibility Center',
    icon: 'link',
    connectionType: 'signin',
    category: 'academic',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to NAIA Eligibility Center',
    loginUrl: 'https://play.mynaia.org/',
  },
  {
    platform: 'parchment',
    label: 'Parchment',
    icon: 'link',
    connectionType: 'signin',
    category: 'academic',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Parchment',
    loginUrl: 'https://www.parchment.com/u/auth/login',
  },
  {
    platform: 'collegeboard',
    label: 'College Board',
    icon: 'link',
    connectionType: 'signin',
    category: 'academic',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to College Board',
    loginUrl: 'https://account.collegeboard.org/login/login',
  },
  {
    platform: 'act',
    label: 'ACT',
    icon: 'link',
    connectionType: 'signin',
    category: 'academic',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to ACT',
    loginUrl: 'https://my.act.org/account/signin',
  },

  // ---- Contact / Website surfaces (mirrors contact/official profile surfaces) ----
  {
    platform: 'linktree',
    label: 'Linktree',
    icon: 'link',
    connectionType: 'link',
    category: 'contact',
    scope: 'global',
    sports: [],
    placeholder: 'Linktree URL',
  },
  {
    platform: 'beacons',
    label: 'Beacons',
    icon: 'link',
    connectionType: 'link',
    category: 'contact',
    scope: 'global',
    sports: [],
    placeholder: 'Beacons URL',
  },
  {
    platform: 'campsite',
    label: 'Campsite',
    icon: 'link',
    connectionType: 'link',
    category: 'contact',
    scope: 'global',
    sports: [],
    placeholder: 'Campsite URL',
  },
  {
    platform: 'sportsengine',
    label: 'SportsEngine',
    icon: 'link',
    connectionType: 'link',
    category: 'contact',
    scope: 'team',
    sports: [],
    placeholder: 'SportsEngine team page URL',
  },
  {
    platform: 'sidearm',
    label: 'SIDEARM Sports',
    icon: 'link',
    connectionType: 'link',
    category: 'contact',
    scope: 'team',
    sports: [],
    placeholder: 'SIDEARM athletics page URL',
  },

  // ---- Sign-In (global — OAuth-connected accounts) ----
  {
    platform: 'google',
    label: 'Google',
    icon: 'google',
    connectionType: 'signin',
    category: 'signin',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in with Google',
  },
  {
    platform: 'microsoft',
    label: 'Microsoft',
    icon: 'microsoft',
    connectionType: 'signin',
    category: 'signin',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in with Microsoft',
  },

  // ---- Sign-In (Firecrawl Persistent Profile — browser-based authentication) ----
  {
    platform: 'instagram_signin',
    label: 'Instagram',
    icon: 'link',
    connectionType: 'signin',
    category: 'social',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Instagram',
    loginUrl: 'https://www.instagram.com/accounts/login/',
  },
  {
    platform: 'twitter_signin',
    label: 'X',
    icon: 'link',
    connectionType: 'signin',
    category: 'social',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to X',
    loginUrl: 'https://x.com/i/flow/login',
  },
  {
    platform: 'tiktok_signin',
    label: 'TikTok',
    icon: 'link',
    connectionType: 'signin',
    category: 'social',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to TikTok',
    loginUrl: 'https://www.tiktok.com/login',
  },
  {
    platform: 'youtube_signin',
    label: 'YouTube',
    icon: 'link',
    connectionType: 'signin',
    category: 'social',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to YouTube',
    loginUrl: 'https://accounts.google.com/ServiceLogin?service=youtube',
  },
  {
    platform: 'facebook_signin',
    label: 'Facebook',
    icon: 'link',
    connectionType: 'signin',
    category: 'social',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Facebook',
    loginUrl: 'https://www.facebook.com/login/',
  },
  {
    platform: 'hudl_signin',
    label: 'Hudl',
    icon: 'link',
    connectionType: 'signin',
    category: 'film',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Hudl',
    loginUrl: 'https://www.hudl.com/login',
  },
  {
    platform: 'maxpreps_signin',
    label: 'MaxPreps',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to MaxPreps',
    loginUrl: 'https://www.maxpreps.com/',
  },
  {
    platform: 'ncsa_signin',
    label: 'NCSA',
    icon: 'link',
    connectionType: 'signin',
    category: 'recruiting',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to NCSA',
    loginUrl: 'https://www.ncsasports.org/login',
  },
  {
    platform: 'fieldlevel_signin',
    label: 'FieldLevel',
    icon: 'link',
    connectionType: 'signin',
    category: 'recruiting',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to FieldLevel',
    loginUrl: 'https://www.fieldlevel.com/signin',
  },
  {
    platform: 'sportsrecruits_signin',
    label: 'SportsRecruits',
    icon: 'link',
    connectionType: 'signin',
    category: 'recruiting',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to SportsRecruits',
    loginUrl: 'https://my.sportsrecruits.com/athlete/user/login',
  },
  {
    platform: 'perfectgame_signin',
    label: 'Perfect Game',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Perfect Game',
    loginUrl: 'https://www.perfectgame.org/MyPg/signin.aspx',
  },
  {
    platform: '247sports_signin',
    label: '247Sports',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to 247Sports',
    loginUrl: 'https://247sports.com/Account/LogIn/',
  },
  {
    platform: 'rivals_signin',
    label: 'Rivals',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Rivals',
    loginUrl: 'https://www.on3.com/login/',
  },
  {
    platform: 'on3_signin',
    label: 'On3',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to On3',
    loginUrl: 'https://www.on3.com/login/',
  },
  {
    platform: 'gamechanger_signin',
    label: 'GameChanger',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to GameChanger',
    loginUrl: 'https://app.gc.com/login',
  },
  {
    platform: 'prepbaseballreport_signin',
    label: 'Prep Baseball Report',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Prep Baseball Report',
    loginUrl: 'https://www.prepbaseballreport.com/login',
  },
  {
    platform: 'scorebooklive_signin',
    label: 'Scorebook Live',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Scorebook Live',
    loginUrl: 'https://www.si.com/high-school/stats/login',
  },
  {
    platform: 'athletic_signin',
    label: 'Athletic.net',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Athletic.net',
    loginUrl: 'https://www.athletic.net/account/login',
  },
  {
    platform: 'milesplit_signin',
    label: 'MileSplit',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to MileSplit',
    loginUrl: 'https://www.milesplit.com/login',
  },
  {
    platform: 'swimcloud_signin',
    label: 'SwimCloud',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to SwimCloud',
    loginUrl: 'https://www.swimcloud.com/login/',
  },
  {
    platform: 'trackwrestling_signin',
    label: 'TrackWrestling',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to TrackWrestling',
    loginUrl: 'https://www.trackwrestling.com/login',
  },
  {
    platform: 'tennisrecruiting_signin',
    label: 'TennisRecruiting.net',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to TennisRecruiting.net',
    loginUrl: 'https://www.tennisrecruiting.net/',
  },
  {
    platform: 'usta_signin',
    label: 'USTA',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to USTA',
    loginUrl: 'https://member.usta.com/login',
  },
  {
    platform: 'utr_signin',
    label: 'UTR Sports',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to UTR Sports',
    loginUrl: 'https://app.utrsports.net/sign-in',
  },
  {
    platform: 'prepsoccer_signin',
    label: 'PrepSoccer',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to PrepSoccer',
    loginUrl: 'https://www.prepsoccer.com/login',
  },
  {
    platform: 'usyouthsoccer_signin',
    label: 'US Youth Soccer',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to US Youth Soccer',
    loginUrl: 'https://www.usyouthsoccer.org/login',
  },
  {
    platform: 'golfstat_signin',
    label: 'Golfstat',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Golfstat',
    loginUrl: 'https://www.golfstat.com/login',
  },
  {
    platform: 'juniorgolf_signin',
    label: 'Junior Golf Scoreboard',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Junior Golf Scoreboard',
    loginUrl: 'https://www.juniorgolfscoreboard.com/login-accounts.asp',
  },

  {
    platform: 'prephoops_signin',
    label: 'PrepHoops',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to PrepHoops',
    loginUrl: 'https://prephoops.com/login',
  },
  {
    platform: 'prepfootball_signin',
    label: 'Prep Football',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Prep Football',
    loginUrl: 'https://www.prepfootball.com/login',
  },
  {
    platform: 'topdrawersoccer_signin',
    label: 'TopDrawerSoccer',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to TopDrawerSoccer',
    loginUrl: 'https://www.topdrawersoccer.com/login',
  },
  {
    platform: 'prepvolleyball_signin',
    label: 'PrepVolleyball',
    icon: 'link',
    connectionType: 'signin',
    category: 'stats',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to PrepVolleyball',
    loginUrl: 'https://prepvolleyball.com/login',
  },
  {
    platform: 'catapult_signin',
    label: 'Catapult',
    icon: 'link',
    connectionType: 'signin',
    category: 'metrics',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Catapult',
    loginUrl: 'https://connect.catapultsports.com/login',
  },

  // ---- Sign-In: Film (remaining) ----
  {
    platform: 'krossover_signin',
    label: 'Krossover (Hudl)',
    icon: 'link',
    connectionType: 'signin',
    category: 'film',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in via Hudl (formerly Krossover)',
    loginUrl: 'https://www.hudl.com/login',
  },
  {
    platform: 'veo_signin',
    label: 'Veo',
    icon: 'link',
    connectionType: 'signin',
    category: 'film',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Veo',
    loginUrl: 'https://app.veo.co/accounts/login/',
  },
  {
    platform: 'ballertv_signin',
    label: 'BallerTV',
    icon: 'link',
    connectionType: 'signin',
    category: 'film',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to BallerTV',
    loginUrl: 'https://www.ballertv.com/users/login',
  },
  {
    platform: 'nfhsnetwork_signin',
    label: 'NFHS Network',
    icon: 'link',
    connectionType: 'signin',
    category: 'film',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to NFHS Network',
    loginUrl: 'https://www.nfhsnetwork.com/users/sign_in',
  },
  {
    platform: 'sportsengineplay_signin',
    label: 'SportsEngine Play',
    icon: 'link',
    connectionType: 'signin',
    category: 'film',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to SportsEngine Play',
    loginUrl: 'https://app.sportsengineplay.com/login',
  },
  {
    platform: 'vimeo_signin',
    label: 'Vimeo',
    icon: 'link',
    connectionType: 'signin',
    category: 'film',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Vimeo',
    loginUrl: 'https://vimeo.com/log_in',
  },

  // ---- Sign-In: Recruiting (remaining) ----
  {
    platform: 'captainu_signin',
    label: 'Stack Athlete (CaptainU)',
    icon: 'link',
    connectionType: 'signin',
    category: 'recruiting',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Stack Athlete (formerly CaptainU)',
    loginUrl: 'https://app.stackathlete.com/login',
  },
  {
    platform: 'recruitlook_signin',
    label: 'RecruitLook',
    icon: 'link',
    connectionType: 'signin',
    category: 'recruiting',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to RecruitLook',
    loginUrl: 'https://www.recruitlook.com/login',
  },
  {
    platform: 'collegeathtrack_signin',
    label: 'College Ath Track',
    icon: 'link',
    connectionType: 'signin',
    category: 'recruiting',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to College Athletic Track',
    loginUrl: 'https://www.collegeathtrack.com/login',
  },
  {
    platform: 'connectlax_signin',
    label: 'ConnectLAX',
    icon: 'link',
    connectionType: 'signin',
    category: 'recruiting',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to ConnectLAX',
    loginUrl: 'https://www.connectlax.com/login',
  },
  {
    platform: 'berecruited_signin',
    label: 'BeRecruited',
    icon: 'link',
    connectionType: 'signin',
    category: 'recruiting',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to BeRecruited',
    loginUrl: 'https://www.berecruited.com/login',
  },

  // ---- Sign-In: Metrics (mirrors link-mode metrics surfaces) ----
  {
    platform: 'hudl_signin',
    label: 'Hudl',
    icon: 'link',
    connectionType: 'signin',
    category: 'metrics',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Hudl',
    loginUrl: 'https://www.hudl.com/login',
  },
  {
    platform: '247sports_signin',
    label: '247Sports',
    icon: 'link',
    connectionType: 'signin',
    category: 'metrics',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to 247Sports',
    loginUrl: 'https://247sports.com/Account/LogIn/',
  },
  {
    platform: 'rivals_signin',
    label: 'Rivals',
    icon: 'link',
    connectionType: 'signin',
    category: 'metrics',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Rivals',
    loginUrl: 'https://www.on3.com/login/',
  },
  {
    platform: 'on3_signin',
    label: 'On3',
    icon: 'link',
    connectionType: 'signin',
    category: 'metrics',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to On3',
    loginUrl: 'https://www.on3.com/login/',
  },
  {
    platform: 'athletic_signin',
    label: 'Athletic.net',
    icon: 'link',
    connectionType: 'signin',
    category: 'metrics',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Athletic.net',
    loginUrl: 'https://www.athletic.net/account/login',
  },
  {
    platform: 'milesplit_signin',
    label: 'MileSplit',
    icon: 'link',
    connectionType: 'signin',
    category: 'metrics',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to MileSplit',
    loginUrl: 'https://www.milesplit.com/login',
  },
  {
    platform: 'swimcloud_signin',
    label: 'SwimCloud',
    icon: 'link',
    connectionType: 'signin',
    category: 'metrics',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to SwimCloud',
    loginUrl: 'https://www.swimcloud.com/login/',
  },
  {
    platform: 'trackwrestling_signin',
    label: 'TrackWrestling',
    icon: 'link',
    connectionType: 'signin',
    category: 'metrics',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to TrackWrestling',
    loginUrl: 'https://www.trackwrestling.com/login',
  },
  {
    platform: 'utr_signin',
    label: 'UTR Sports',
    icon: 'link',
    connectionType: 'signin',
    category: 'metrics',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to UTR Sports',
    loginUrl: 'https://app.utrsports.net/sign-in',
  },

  // ---- Sign-In: Schedule (mirrors link-mode schedule surfaces) ----
  {
    platform: 'maxpreps_signin',
    label: 'MaxPreps',
    icon: 'link',
    connectionType: 'signin',
    category: 'schedule',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to MaxPreps',
    loginUrl: 'https://www.maxpreps.com/',
  },
  {
    platform: 'gamechanger_signin',
    label: 'GameChanger',
    icon: 'link',
    connectionType: 'signin',
    category: 'schedule',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to GameChanger',
    loginUrl: 'https://app.gc.com/login',
  },
  {
    platform: 'scorebooklive_signin',
    label: 'Scorebook Live',
    icon: 'link',
    connectionType: 'signin',
    category: 'schedule',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Scorebook Live',
    loginUrl: 'https://www.si.com/high-school/stats/login',
  },
  {
    platform: 'sportsengine_signin',
    label: 'SportsEngine',
    icon: 'link',
    connectionType: 'signin',
    category: 'schedule',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to SportsEngine',
    loginUrl: 'https://user.sportngin.com/users/sign_in',
  },

  // ---- Sign-In: Contact & Websites ----
  {
    platform: 'linktree_signin',
    label: 'Linktree',
    icon: 'link',
    connectionType: 'signin',
    category: 'contact',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Linktree',
    loginUrl: 'https://linktr.ee/login',
  },
  {
    platform: 'beacons_signin',
    label: 'Beacons',
    icon: 'link',
    connectionType: 'signin',
    category: 'contact',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Beacons',
    loginUrl: 'https://app.beacons.ai/',
  },
  {
    platform: 'campsite_signin',
    label: 'Campsite',
    icon: 'link',
    connectionType: 'signin',
    category: 'contact',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to Campsite',
    loginUrl: 'https://app.campsite.bio/login',
  },
  {
    platform: 'sportsengine_signin',
    label: 'SportsEngine',
    icon: 'link',
    connectionType: 'signin',
    category: 'contact',
    scope: 'global',
    sports: [],
    placeholder: 'Sign in to SportsEngine',
    loginUrl: 'https://user.sportngin.com/users/sign_in',
  },
] as const;

/** Category display info */
export const PLATFORM_CATEGORIES: readonly {
  readonly category: PlatformCategory;
  readonly label: string;
}[] = [
  { category: 'social', label: 'Social Links' },
  { category: 'film', label: 'Videos & Highlights' },
  { category: 'recruiting', label: 'Recruiting Profiles' },
  { category: 'metrics', label: 'Metrics' },
  { category: 'stats', label: 'Stats & Rankings' },
  { category: 'academic', label: 'Academic & Eligibility' },
  { category: 'schedule', label: 'Schedule' },
  { category: 'contact', label: 'Contact & Websites' },
  { category: 'signin', label: 'Sign-In Accounts' },
] as const;

/**
 * Maps every platform ID to its canonical domain.
 * Used to resolve real favicons via Google's free Favicon API.
 *
 * ⭐ PURE DATA - No dependencies
 */
export const PLATFORM_FAVICON_DOMAINS: Readonly<Record<string, string>> = {
  // Social
  instagram: 'instagram.com',
  twitter: 'x.com',
  tiktok: 'tiktok.com',
  youtube: 'youtube.com',
  facebook: 'facebook.com',
  // Film
  hudl: 'hudl.com',
  krossover: 'krossover.com',
  veo: 'veo.co',
  ballertv: 'ballertv.com',
  nfhsnetwork: 'nfhsnetwork.com',
  sportsengineplay: 'app.sportsengineplay.com',
  vimeo: 'vimeo.com',
  // Recruiting
  ncsa: 'ncsasports.org',
  fieldlevel: 'fieldlevel.com',
  captainu: 'captainu.com',
  sportsrecruits: 'sportsrecruits.com',
  streamlineathletes: 'streamlineathletes.com',
  recruitlook: 'recruitlook.com',
  connectlax: 'connectlax.com',
  collegeathtrack: 'collegeathtrack.com',
  imlcarecruits: 'imlcarecruits.com',
  berecruited: 'berecruited.com',
  // Stats & Metrics
  maxpreps: 'maxpreps.com',
  perfectgame: 'perfectgame.org',
  prepbaseballreport: 'prepbaseballreport.com',
  '247sports': '247sports.com',
  rivals: 'rivals.com',
  on3: 'on3.com',
  gamechanger: 'gc.com',
  scorebooklive: 'scorebooklive.com',
  athletic: 'athletic.net',
  milesplit: 'milesplit.com',
  swimcloud: 'swimcloud.com',
  trackwrestling: 'trackwrestling.com',
  tennisrecruiting: 'tennisrecruiting.net',
  usta: 'usta.com',
  utr: 'utrsports.com',
  usyouthsoccer: 'usyouthsoccer.org',
  golfstat: 'golfstat.com',
  prepsoccer: 'prepsoccer.com',
  juniorgolf: 'jgaa.com',
  prephoops: 'prephoops.com',
  prepfootball: 'prepfootball.com',
  topdrawersoccer: 'topdrawersoccer.com',
  prepvolleyball: 'prepvolleyball.com',
  catapult: 'catapultsports.com',
  // Schedule
  sportsengine: 'sportsengine.com',
  sidearm: 'sidearmsports.com',
  // Academic
  ncaaeligibility: 'eligibilitycenter.org',
  naiaeligibility: 'naia.org',
  parchment: 'parchment.com',
  collegeboard: 'collegeboard.org',
  act: 'act.org',
  // Contact
  linktree: 'linktr.ee',
  beacons: 'beacons.ai',
  campsite: 'campsite.bio',
  // Sign-in
  google: 'google.com',
  microsoft: 'microsoft.com',
  // Sign-in (Firecrawl — same domains as link counterparts)
  instagram_signin: 'instagram.com',
  twitter_signin: 'x.com',
  tiktok_signin: 'tiktok.com',
  youtube_signin: 'youtube.com',
  facebook_signin: 'facebook.com',
  hudl_signin: 'hudl.com',
  krossover_signin: 'krossover.com',
  veo_signin: 'veo.co',
  ballertv_signin: 'ballertv.com',
  nfhsnetwork_signin: 'nfhsnetwork.com',
  sportsengineplay_signin: 'app.sportsengineplay.com',
  vimeo_signin: 'vimeo.com',
  maxpreps_signin: 'maxpreps.com',
  ncsa_signin: 'ncsasports.org',
  fieldlevel_signin: 'fieldlevel.com',
  captainu_signin: 'captainu.com',
  sportsrecruits_signin: 'sportsrecruits.com',
  streamlineathletes_signin: 'streamlineathletes.com',
  recruitlook_signin: 'recruitlook.com',
  collegeathtrack_signin: 'collegeathtrack.com',
  connectlax_signin: 'connectlax.com',
  imlcarecruits_signin: 'imlcarecruits.com',
  berecruited_signin: 'berecruited.com',
  perfectgame_signin: 'perfectgame.org',
  prepbaseballreport_signin: 'prepbaseballreport.com',
  '247sports_signin': '247sports.com',
  rivals_signin: 'rivals.com',
  on3_signin: 'on3.com',
  gamechanger_signin: 'gc.com',
  scorebooklive_signin: 'scorebooklive.com',
  athletic_signin: 'athletic.net',
  milesplit_signin: 'milesplit.com',
  swimcloud_signin: 'swimcloud.com',
  trackwrestling_signin: 'trackwrestling.com',
  tennisrecruiting_signin: 'tennisrecruiting.net',
  usta_signin: 'usta.com',
  utr_signin: 'utrsports.com',
  prepsoccer_signin: 'prepsoccer.com',
  usyouthsoccer_signin: 'usyouthsoccer.org',
  golfstat_signin: 'golfstat.com',
  juniorgolf_signin: 'jgaa.com',
  prephoops_signin: 'prephoops.com',
  prepfootball_signin: 'prepfootball.com',
  topdrawersoccer_signin: 'topdrawersoccer.com',
  prepvolleyball_signin: 'prepvolleyball.com',
  catapult_signin: 'catapultsports.com',
  sportsengine_signin: 'sportsengine.com',
  sidearm_signin: 'sidearmsports.com',
  linktree_signin: 'linktr.ee',
  beacons_signin: 'beacons.ai',
  campsite_signin: 'campsite.bio',
} as const;

/**
 * Returns the Google Favicon API URL for a given platform ID.
 * Returns null when no domain mapping exists.
 *
 * Uses Google's free, no-auth favicon service (sz=64 for retina quality).
 *
 * ⭐ PURE FUNCTION - No dependencies
 */
export function getPlatformFaviconUrl(platformId: string): string | null {
  const domain = (PLATFORM_FAVICON_DOMAINS as Record<string, string>)[platformId];
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null;
}

/**
 * Recommended platform identifiers per onboarding role.
 * These platforms are surfaced in a "Recommended" section at the top
 * of the connected accounts step.
 *
 * ⭐ PURE DATA - No dependencies
 */
export const RECOMMENDED_PLATFORMS_BY_ROLE: Readonly<
  Record<OnboardingUserType, readonly string[]>
> = {
  athlete: ['twitter', 'hudl', 'maxpreps', 'sportsrecruits'],
  coach: ['twitter', 'hudl', 'maxpreps', 'gamechanger'],
  director: ['twitter', 'hudl', 'maxpreps', 'gamechanger'],
} as const;

/**
 * Returns the recommended PlatformDefinitions for a given role,
 * filtered to only platforms available for the user's selected sports.
 *
 * @param role - The user's onboarding role
 * @param selectedSports - Sport display names (e.g. ["Football"])
 * @param connectionType - Optional filter: only return 'link' or 'signin' platforms
 * @returns Array of recommended PlatformDefinitions
 *
 * ⭐ PURE FUNCTION - No dependencies
 */
export function getRecommendedPlatforms(
  role: OnboardingUserType,
  selectedSports: readonly string[],
  connectionType?: PlatformConnectionType
): PlatformDefinition[] {
  const recommendedIds = RECOMMENDED_PLATFORMS_BY_ROLE[role] ?? [];
  const sportKeys = selectedSports.map(sportNameToBaseKey);

  return recommendedIds
    .map((id) => {
      // For signin mode, look up the _signin variant of each recommended platform
      const lookupId = connectionType === 'signin' ? `${id}_signin` : id;
      return PLATFORM_REGISTRY.find((p) => p.platform === lookupId);
    })
    .filter((p): p is PlatformDefinition => {
      if (!p) return false;
      // Filter by connection type if specified
      if (connectionType && p.connectionType !== connectionType) return false;
      // Keep if platform is sport-agnostic
      if (p.sports.length === 0) return true;
      // Keep if no sports selected (show all)
      if (sportKeys.length === 0) return true;
      // Keep if any selected sport matches
      return p.sports.some((ps) => sportKeys.some((sk) => sk.startsWith(ps) || ps.startsWith(sk)));
    });
}

/**
 * Normalize a sport display name to a base key for platform matching.
 * e.g. "Basketball Mens" → "basketball", "Track & Field Womens" → "track_field"
 *
 * ⭐ PURE FUNCTION - No dependencies
 */
function sportNameToBaseKey(sportName: string): string {
  return sportName
    .toLowerCase()
    .replace(/\s*(mens|womens)$/i, '')
    .trim()
    .replace(/\s*&\s*/g, '_')
    .replace(/\s+/g, '_');
}

/**
 * Returns platforms filtered by the user's selected sports, grouped by category.
 * If no sports are selected, returns all platforms.
 * Always includes all social platforms (they're sport-agnostic).
 *
 * @param selectedSports - Sport display names (e.g. ["Football", "Basketball Mens"])
 * @param excludePlatformIds - Platform IDs to exclude (e.g. recommended section)
 * @param connectionType - Optional filter: only return 'link' or 'signin' platforms
 * @returns Platforms grouped by category with a recommended section
 *
 * ⭐ PURE FUNCTION - No dependencies
 */
export function getPlatformsForSports(
  selectedSports: readonly string[],
  excludePlatformIds: readonly string[] = [],
  connectionType?: PlatformConnectionType
): { category: PlatformCategory; label: string; platforms: PlatformDefinition[] }[] {
  const sportKeys = selectedSports.map(sportNameToBaseKey);
  const excludeSet = new Set(excludePlatformIds);

  const filtered = PLATFORM_REGISTRY.filter((p) => {
    // Exclude platforms already shown in recommended section
    if (excludeSet.has(p.platform)) return false;
    // Filter by connection type if specified
    if (connectionType && p.connectionType !== connectionType) return false;
    // Platforms with empty sports array are available for all sports
    if (p.sports.length === 0) return true;
    // If no sports selected, show all
    if (sportKeys.length === 0) return true;
    // Show if any selected sport matches
    return p.sports.some((ps) => sportKeys.some((sk) => sk.startsWith(ps) || ps.startsWith(sk)));
  });

  return PLATFORM_CATEGORIES.map((cat) => ({
    category: cat.category,
    label: cat.label,
    platforms: filtered.filter((p) => p.category === cat.category),
  })).filter((group) => group.platforms.length > 0);
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
   * Team selection data (v4.1)
   * Users search and select up to 2 teams after choosing sports
   */
  teamSelection?: TeamSelectionFormData;
  /**
   * Team creation data for coaches/directors
   */
  createTeamProfile?: CreateTeamProfileFormData;
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
  linkSources?: LinkSourcesFormData;
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

/** Role selection step - shown FIRST to personalize the experience */
export const ROLE_SELECTION_STEP: OnboardingStep = {
  id: 'role',
  title: 'Select Your Role',
  subtitle: 'Personalize your experience',
  required: true,
  order: 1,
};

/** Shared role step config (DRY - used in all user type step arrays) */
const ROLE_STEP: OnboardingStep = {
  id: 'role',
  title: 'Select Your Role',
  subtitle: 'Personalize your experience',
  required: true,
  order: 1,
};

/** Shared link sources step config (DRY) */
const LINK_SOURCES_STEP: OnboardingStep = {
  id: 'link-sources',
  title: 'Link Data Sources',
  subtitle: 'Add the sites that power your profile',
  required: false,
  order: 5,
};

/** Shared referral step config (DRY) */
const REFERRAL_STEP: OnboardingStep = {
  id: 'referral-source',
  title: 'Before We Begin',
  subtitle: 'How did you hear about us?',
  required: false,
  order: 6,
};

/** Shared organization/program selection step config (DRY) */
const SELECT_TEAMS_STEP: OnboardingStep = {
  id: 'select-teams',
  title: 'Select Program',
  subtitle: 'Find your program or create a new one',
  required: false,
  order: 4,
};

/** Step configuration per user type */
export const ONBOARDING_STEPS: Record<OnboardingUserType, OnboardingStep[]> = {
  athlete: [
    ROLE_STEP,
    {
      id: 'profile',
      title: 'Get Started',
      subtitle: "Let's get to know you",
      required: true,
      order: 2,
    },
    {
      id: 'sport',
      title: 'Your Sports',
      subtitle: 'What sports do you play?',
      required: true,
      order: 3,
    },
    { ...SELECT_TEAMS_STEP, required: false },
    LINK_SOURCES_STEP,
    REFERRAL_STEP,
  ],
  coach: [
    ROLE_STEP,
    {
      id: 'profile',
      title: 'Get Started',
      subtitle: "Let's get to know you",
      required: true,
      order: 2,
    },
    {
      id: 'sport',
      title: 'Your Sports',
      subtitle: 'What sports do you coach?',
      required: true,
      order: 3,
    },
    { ...SELECT_TEAMS_STEP, required: false },
    LINK_SOURCES_STEP,
    REFERRAL_STEP,
  ],
  director: [
    ROLE_STEP,
    {
      id: 'profile',
      title: 'Get Started',
      subtitle: "Let's get to know you",
      required: true,
      order: 2,
    },
    {
      id: 'sport',
      title: 'Your Sports',
      subtitle: 'What sports does your program offer?',
      required: true,
      order: 3,
    },
    { ...SELECT_TEAMS_STEP, required: false },
    LINK_SOURCES_STEP,
    REFERRAL_STEP,
  ],
};

// ============================================
// AGENT X ONBOARDING MESSAGES
// ============================================

/**
 * Agent X typewriter messages shown below the logo during each onboarding step.
 * These create a guided, AI-host feel without requiring free-text chat.
 *
 * Default messages are used when no role is selected yet, or as fallbacks.
 *
 * ⭐ PURE DATA - No dependencies
 */
export const AGENT_X_ONBOARDING_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  role: "Hey — I'm Agent X, your AI coordinator. I'm built to help you get things done. Let's start by picking your role.",
  profile: "Let's build your profile.",
  'link-sources':
    'These links are how I work for you — syncing your data, updating your profile, and executing tasks automatically.',
  sport: 'Pick your sports.',
  'select-teams': "Search for your program. If it's missing, you can add it.",
  'referral-source': 'Last one — how did you find us?',
  school: 'Tell me about your school.',
  organization: 'Tell me about your organization.',
  complete: "You're all set. Let's go.",
});

/**
 * Role-specific Agent X messages per step.
 * Only entries that differ from the default need to be listed.
 */
const ROLE_MESSAGES: Readonly<
  Partial<Record<OnboardingUserType, Readonly<Record<string, string>>>>
> = Object.freeze({
  athlete: Object.freeze({
    profile: "Let's get to know you — just the basics.",
    'link-sources':
      'These links are how I work for you — pulling in your stats and film, updating your profile, and executing tasks automatically.',
    sport: 'Choose one sport for now. You can add more later.',
    'select-teams': "Search for your program. If it's missing, you can add it.",
    'referral-source': 'Last one — how did you hear about NXT1?',
    complete: "You're set. Time to get recruited.",
  }),
  coach: Object.freeze({
    profile: "Let's get to know you — just the basics.",
    'link-sources':
      'Link your program accounts so I can keep your team profile current, sync your data, and execute tasks across every program you coach.',
    sport: 'Choose the sport you coach, then select your title.',
    'select-teams': 'Search for your program or create a new one.',
    'referral-source': 'Last one — how did you discover NXT1?',
    complete: "You're in. Let's find your next prospect.",
  }),
  director: Object.freeze({
    profile: "Let's get to know you — just the basics.",
    'link-sources':
      'Link your organization accounts so I can keep your team profile current, sync your data, and handle tasks automatically.',
    sport: 'Choose one sport for now. You can add more later.',
    'select-teams': 'Search for your organization or create a new one.',
    'referral-source': 'Last one — how did you find NXT1?',
    complete: "All set. Let's manage your program.",
  }),
});

/**
 * Returns the Agent X message for a given step and optional user role.
 * Falls back to the default (role-agnostic) message if no role-specific
 * copy exists.
 *
 * ⭐ PURE FUNCTION - No dependencies
 */
export function getAgentXMessage(stepId: string, userType?: OnboardingUserType | null): string {
  if (userType) {
    const roleMsg = ROLE_MESSAGES[userType]?.[stepId];
    if (roleMsg) return roleMsg;
  }
  return AGENT_X_ONBOARDING_MESSAGES[stepId] ?? '';
}

// ============================================
// PURE VALIDATION FUNCTIONS
// ============================================

/**
 * Validate profile step data.
 * Athletes must provide first name, last name, and class year.
 * Other roles only require first name and last name.
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateProfile(
  data?: ProfileFormData,
  userType?: OnboardingUserType | null
): boolean {
  if (!data) return false;

  const hasName = !!(data.firstName?.trim() && data.lastName?.trim());
  if (!hasName) return false;

  if (userType === USER_ROLES.ATHLETE) {
    return typeof data.classYear === 'number' && Number.isInteger(data.classYear);
  }

  return true;
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
 * Validate a single sport entry for the active onboarding role.
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateSportEntry(
  entry: SportEntry,
  userType?: OnboardingUserType | null
): boolean {
  if (!entry) return false;

  if (!entry.sport?.trim()) return false;

  if (userType === USER_ROLES.ATHLETE) {
    const availablePositions = getPositionsForSport(entry.sport);
    if (availablePositions.length > 0) {
      return Array.isArray(entry.positions) && entry.positions.length > 0;
    }
  }

  return true;
}

/**
 * Validate sport step data.
 * Athletes and parents require position selection when that sport exposes positions.
 * Coaches require a title in addition to the selected sport.
 *
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateSport(data?: SportFormData, userType?: OnboardingUserType | null): boolean {
  if (!data) return false;
  if (!data.sports || data.sports.length === 0) return false;

  if (userType === USER_ROLES.COACH && !data.coachTitle?.trim()) {
    return false;
  }

  return data.sports.every((entry) => validateSportEntry(entry, userType));
}

/**
 * Validate team selection step data
 * At least one program must be selected.
 * ⭐ PURE FUNCTION - No dependencies
 */
export function validateTeamSelection(data?: TeamSelectionFormData): boolean {
  return Boolean(data?.teams?.length && data.teams.length > 0);
}

export function validateCreateTeamProfile(data?: CreateTeamProfileFormData): boolean {
  if (!data) return false;
  // If programName exists and is not empty, it's valid
  return !!data.programName && data.programName.trim().length > 0;
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
      return validateProfile(formData.profile, pendingRole ?? formData.userType ?? null);
    case 'school':
      // Legacy support - use validateSport for new v3.0 flow
      return validateTeam(formData.team) || validateSchool(formData.school);
    case 'organization':
      return validateOrganization(formData.organization);
    case 'sport':
      return validateSport(formData.sport, pendingRole ?? formData.userType ?? null);

    case 'select-teams':
      return validateTeamSelection(formData.teamSelection);
    case 'create-team-profile':
      // If it is strictly required, validate it. But it returns true in UI if they skip?
      // Since `required: false` in step config, the state machine allows skipping even if validateStep returns false.
      return validateCreateTeamProfile(formData.createTeamProfile);
    case 'team-link-sources':
    case 'link-sources':
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
    director: 'director',
    admin: 'director',
    // Legacy aliases → 3 core roles
    recruiter: 'coach',
    parent: 'athlete',
    'college-coach': 'coach',
    'recruiting-service': 'coach',
    service: 'coach',
    scout: 'coach',
    media: 'coach',
    fan: 'athlete',
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
 * Configure steps when user type changes (includes role selection at end)
 * ⭐ PURE FUNCTION - No dependencies
 *
 * NOTE: Role selection is the LAST step (optional), not first.
 * Flow: Profile → Sports → Referral → Role (optional)
 */
export function configureStepsForUserType(
  userType: OnboardingUserType,
  teamCode?: TeamCodePrefillData
): OnboardingStep[] {
  // Steps from ONBOARDING_STEPS already include role at the end (order: 4)
  return getStepsForUserType(userType, teamCode);
}

// ============================================
// INVITE TEAM-SKIP HELPERS
// ============================================

/**
 * Step IDs that should be removed from the onboarding flow when the user
 * has already joined a team via an invite link (before reaching onboarding).
 *
 * - Athletes & Parents see `select-teams` → skip it
 * - Coaches & Directors see `create-team-profile` + `team-link-sources` → skip both
 * - If `includeSport` is true, also skips `sport` step (when full team data is available)
 *
 * ⭐ PURE FUNCTION - No dependencies
 */
export function getSkipStepIdsForInviteUser(
  role?: OnboardingUserType | null,
  includeSport = false
): OnboardingStepId[] {
  let skipIds: OnboardingStepId[] = [];

  if (!role) {
    // When role is unknown, skip both athlete and coach team steps.
    // The state machine will re-apply the filter when selectRole() is called.
    skipIds = ['select-teams', 'create-team-profile', 'team-link-sources'];
  } else {
    switch (role) {
      case 'athlete':
        skipIds = ['select-teams'];
        break;
      case 'coach':
      case 'director':
        skipIds = ['create-team-profile', 'team-link-sources'];
        break;
      default:
        skipIds = ['select-teams'];
    }
  }

  // If we have full team data with sport, also skip sport selection
  if (includeSport) {
    skipIds = [...skipIds, 'sport'];
  }

  return skipIds;
}

/** SessionStorage / Capacitor Preferences key for the invite-team-joined flag */
export const INVITE_TEAM_JOINED_KEY = 'nxt1:invite_team_joined' as const;

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

  if (userType === USER_ROLES.ATHLETE) {
    // Build sport entry with team info from team code
    if (teamCode.sport) {
      const sportEntry: SportEntry = {
        sport: teamCode.sport,
        isPrimary: true,
        team: {
          name: teamCode.teamName ?? '',
          type: mapTeamType(teamCode.teamType),
          state: teamCode.state,
          logo: teamCode.logoUrl ?? null,
          colors: [teamCode.primaryColor, teamCode.secondaryColor].filter(Boolean) as string[],
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
      profileImgs: userData.profileImg ? [userData.profileImg] : null,
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
