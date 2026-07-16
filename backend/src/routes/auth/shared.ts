/**
 * @fileoverview Auth Routes — Shared Types and Helpers
 * @module @nxt1/backend/routes/auth
 *
 * Types, interfaces, and pure helper functions shared across the auth sub-route
 * modules. No router instances or Express middleware here.
 */

import { FieldValue } from 'firebase-admin/firestore';
import type {
  UserRole,
  SportProfile,
  Location,
  UserContact,
  ConnectedEmail,
  PortableTimestamp,
} from '@nxt1/core';
import {
  USER_SCHEMA_VERSION,
  normalizeName,
  SPORT_POSITIONS,
  normalizeSportKey,
  isTeamRole,
} from '@nxt1/core';
import type {
  SignupDripHistoryEntry,
  SignupDripPaymentState,
  SignupDripRoleTrack,
  SignupDripStepKey,
  SignupDripSuppressionReason,
} from '../../services/marketing/lifecycle/signup-drip.service.js';
import type {
  PushDripHistoryEntry as RolePushDripHistoryEntry,
  PushDripPaymentState as RolePushDripPaymentState,
  PushDripRoleTrack as RolePushDripRoleTrack,
  PushDripStepKey as RolePushDripStepKey,
  PushDripSuppressionReason as RolePushDripSuppressionReason,
} from '../../services/marketing/lifecycle/push-drip.service.js';

// ── Re-export for consumers that import from this file ───────────────────────
export type { UserRole, SportProfile, Location, UserContact, ConnectedEmail };
export { USER_SCHEMA_VERSION, normalizeName, isTeamRole };

// ============================================================================
// V2 USER MODEL TYPES
// ============================================================================

/**
 * V2 User document structure for Firestore
 *
 * Design Principles:
 * - User document = Identity + Profile ONLY
 * - Credits/limits → Metered usage billing (no storage needed)
 *
 * @see @nxt1/core User model
 */
export interface UserV2Document {
  // Core identity
  email: string;
  firstName?: string;
  lastName?: string;
  profileImgs?: string[];
  aboutMe?: string;
  gender?: string;

  // V2: Single role field
  role?: UserRole;
  lastLoginAt?: PortableTimestamp;

  // V2: Sports array
  sports?: SportProfile[];
  activeSportIndex?: number;

  // V2: Nested objects
  location?: Location;
  contact?: UserContact;

  // Connected sources (all platforms - social, film, stats, recruiting)
  connectedSources?: ConnectedSourceRecord[];

  classOf?: number;

  // Coach-specific
  coach?: {
    title?: string;
    organization?: string;
    /** Unicode slugs of teams this coach/director manages */
    managedTeamCodes?: string[];
  };

  // Onboarding
  onboardingCompleted: boolean;
  onboardingCompletedAt?: PortableTimestamp;
  onboardingProgress?: Record<string, { completed: boolean; completedAt: PortableTimestamp }>;
  /** Original document ID from the legacy NXT1 system — set by migration script. */
  _legacyId?: string;
  /** Whether a legacy-migrated user has completed the 3-step intro onboarding. */
  legacyOnboardingCompleted?: boolean;

  // Team association (for team-based access)
  teamCode?: {
    teamCode: string;
    teamName: string;
    teamId: string;
  };

  // Referral tracking
  referralId?: string;
  referralSource?: string;
  referralDetails?: string | null;
  referralClubName?: string | null;
  referralOtherSpecify?: string | null;

  // Connected email accounts for campaigns/outreach.
  // SECURITY: Only metadata (ConnectedEmail) is stored here.
  // OAuth tokens live in: Users/{uid}/oauthTokens/{provider} (subcollection).
  // Firestore rules restrict that subcollection to backend/Functions only.
  connectedEmails?: ConnectedEmail[];

  // User preferences (notifications, tracking, theme, etc.)
  preferences?: Record<string, unknown>;

  lifecycle?: {
    signup?: {
      completedSlackAlertSentAt?: PortableTimestamp;
      welcomeEmailSentAt?: PortableTimestamp;
      notionDashboard?: {
        status?: 'queued' | 'processing' | 'created' | 'failed' | 'dead_letter' | 'skipped';
        idempotencyKey?: string;
        environment?: 'staging' | 'production';
        queuedAt?: PortableTimestamp;
        processingStartedAt?: PortableTimestamp;
        leaseExpiresAt?: PortableTimestamp;
        lastAttemptAt?: PortableTimestamp;
        nextAttemptAt?: PortableTimestamp;
        attemptCount?: number;
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        failedPermanentAt?: PortableTimestamp;
      };
      drip?: {
        campaignKey?: string;
        enrolledAt?: PortableTimestamp;
        roleTrack?: SignupDripRoleTrack;
        paymentState?: SignupDripPaymentState;
        currentStepKey?: SignupDripStepKey;
        lastSentStepKey?: SignupDripStepKey;
        lastSentAt?: PortableTimestamp;
        nextEligibleAt?: PortableTimestamp;
        completedAt?: PortableTimestamp;
        pausedAt?: PortableTimestamp;
        suppressionReason?: SignupDripSuppressionReason;
        history?: Array<
          Omit<SignupDripHistoryEntry, 'sentAt'> & {
            sentAt: PortableTimestamp;
          }
        >;
      };
    };
    b2cUsers?: {
      accountStarted?: {
        status?: 'created' | 'failed' | 'skipped';
        environment?: 'staging' | 'production';
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
      };
      usageStarted?: {
        status?: 'created' | 'failed' | 'skipped';
        environment?: 'staging' | 'production';
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        amountCents?: number;
        feature?: string;
        operationId?: string;
      };
      closedWon?: {
        status?: 'created' | 'failed' | 'skipped';
        environment?: 'staging' | 'production';
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        amountCents?: number;
        source?: string;
      };
      expansionPricing?: {
        status?: 'created' | 'failed' | 'skipped';
        environment?: 'staging' | 'production';
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        amountCents?: number;
        source?: string;
      };
      organizationMode?: {
        status?: 'created' | 'failed' | 'skipped' | 'inactive';
        environment?: 'staging' | 'production';
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        organizationId?: string;
      };
      closedLost?: {
        status?: 'created' | 'failed' | 'skipped';
        environment?: 'staging' | 'production';
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        anchorAt?: PortableTimestamp;
        lastActivityAt?: PortableTimestamp;
        eligibleAt?: PortableTimestamp;
        decisionWindowDays?: number;
        inactivityDays?: number;
        reasonCode?: string;
        balanceCents?: number;
      };
      churned?: {
        status?: 'created' | 'failed' | 'skipped';
        environment?: 'staging' | 'production';
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        lastPaidAt?: PortableTimestamp;
        zeroBalanceSinceAt?: PortableTimestamp;
        eligibleAt?: PortableTimestamp;
        graceDays?: number;
        balanceCents?: number;
      };
    };
    usage?: {
      notionDashboard?: {
        status?: 'queued' | 'processing' | 'created' | 'failed' | 'skipped';
        environment?: 'staging' | 'production';
        queuedAt?: PortableTimestamp;
        processingStartedAt?: PortableTimestamp;
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        qualifiedSpendCents?: number;
        qualifiedUsageCount?: number;
        thresholdCents?: number;
        firstQualifiedOperationId?: string;
        firstQualifiedFeature?: string;
      };
      trialCreditsFinished?: {
        status?: 'queued' | 'processing' | 'created' | 'failed' | 'skipped';
        environment?: 'staging' | 'production';
        queuedAt?: PortableTimestamp;
        processingStartedAt?: PortableTimestamp;
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        baselineCents?: number;
        depletedAt?: PortableTimestamp;
        zeroBalanceOperationId?: string;
        zeroBalanceFeature?: string;
      };
    };
    sales?: {
      closedWon?: {
        status?: 'queued' | 'processing' | 'created' | 'failed' | 'skipped';
        environment?: 'staging' | 'production';
        queuedAt?: PortableTimestamp;
        processingStartedAt?: PortableTimestamp;
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        organizationId?: string;
        amountCents?: number;
        source?: string;
        initiatedByUserId?: string;
      };
      expansionPricing?: {
        status?: 'queued' | 'processing' | 'created' | 'failed' | 'skipped';
        environment?: 'staging' | 'production';
        queuedAt?: PortableTimestamp;
        processingStartedAt?: PortableTimestamp;
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        organizationId?: string;
        amountCents?: number;
        source?: string;
        initiatedByUserId?: string;
      };
      closedLost?: {
        status?: 'queued' | 'processing' | 'created' | 'failed' | 'skipped';
        environment?: 'staging' | 'production';
        queuedAt?: PortableTimestamp;
        processingStartedAt?: PortableTimestamp;
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        organizationId?: string;
        anchorAt?: PortableTimestamp;
        lastActivityAt?: PortableTimestamp;
        eligibleAt?: PortableTimestamp;
        decisionWindowDays?: number;
        inactivityDays?: number;
        reasonCode?: string;
        balanceCents?: number;
      };
      churned?: {
        status?: 'queued' | 'processing' | 'created' | 'failed' | 'skipped';
        environment?: 'staging' | 'production';
        queuedAt?: PortableTimestamp;
        processingStartedAt?: PortableTimestamp;
        createdAt?: PortableTimestamp;
        pageId?: string;
        pageUrl?: string;
        lastError?: string;
        organizationId?: string;
        lastPaidAt?: PortableTimestamp;
        zeroBalanceSinceAt?: PortableTimestamp;
        eligibleAt?: PortableTimestamp;
        graceDays?: number;
        balanceCents?: number;
        initiatedByUserId?: string;
      };
    };
    push?: {
      drip?: {
        campaignKey?: string;
        enrolledAt?: PortableTimestamp;
        roleTrack?: RolePushDripRoleTrack;
        paymentState?: RolePushDripPaymentState;
        currentStepKey?: RolePushDripStepKey;
        lastSentStepKey?: RolePushDripStepKey;
        lastSentAt?: PortableTimestamp;
        nextEligibleAt?: PortableTimestamp;
        completedAt?: PortableTimestamp;
        pausedAt?: PortableTimestamp;
        suppressionReason?: RolePushDripSuppressionReason;
        history?: Array<
          Omit<RolePushDripHistoryEntry, 'sentAt'> & {
            sentAt: PortableTimestamp;
          }
        >;
      };
      delivery?: {
        dayKey?: string;
        dailyCount?: number;
        marketingDayKey?: string;
        marketingDailyCount?: number;
        lastSentAt?: PortableTimestamp;
        lastMarketingSentAt?: PortableTimestamp;
      };
    };
  };

  // Timestamps
  createdAt: PortableTimestamp;
  updatedAt: PortableTimestamp;

  // Schema version for migrations
  _schemaVersion: number;

  // ============================================
  // MINIMAL LEGACY FIELDS (being phased out)
  // ============================================
  highSchool?: string; // For backward compat only
  state?: string; // For backward compat only
  city?: string; // For backward compat only
  organization?: string; // For coaches backward compat
}

export interface ConnectedSourceRecord {
  platform: string;
  profileUrl: string;
  faviconUrl?: string;
  syncStatus: 'idle';
  scopeType?: string;
  scopeId?: string;
  displayOrder?: number;
  /** Display name of the person who added this link */
  addedBy?: string;
  /** User ID of the person who added this link */
  addedById?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map frontend userType to V2 role (3 core roles).
 * Handles legacy role strings from existing Firestore documents.
 */
export function mapUserTypeToRole(userType: string): UserRole {
  const roleMap: Record<string, UserRole> = {
    athlete: 'athlete',
    coach: 'coach',
    director: 'director' as UserRole,
    // Legacy aliases → 3 core roles
    parent: 'athlete',
    'college-coach': 'coach' as UserRole,
    'recruiting-service': 'coach' as UserRole,
    scout: 'coach' as UserRole,
    media: 'coach' as UserRole,
    fan: 'athlete',
    service: 'coach' as UserRole,
  };
  return roleMap[userType as keyof typeof roleMap] ?? 'athlete';
}

export function clearLegacyLocationFields(target: Record<string, unknown>): void {
  target['city'] = FieldValue.delete();
  target['state'] = FieldValue.delete();
}

export function sanitizeStoredTeam(team?: SportProfile['team']): SportProfile['team'] | undefined {
  const hasTeamAffiliation = Boolean(team?.name?.trim() || team?.organizationId || team?.teamId);
  if (!team?.type || !hasTeamAffiliation) return undefined;

  return {
    type: team.type,
    ...(team.name ? { name: team.name } : {}),
    ...(team.title ? { title: team.title } : {}),
    ...(team.organizationId ? { organizationId: team.organizationId } : {}),
    ...(team.teamId ? { teamId: team.teamId } : {}),
    ...(team.city ? { city: team.city } : {}),
    ...(team.state ? { state: team.state } : {}),
  };
}

export function getLegacyCoachTitle(user?: UserV2Document): string | undefined {
  const rootCoachTitle = (user as Record<string, unknown> | undefined)?.['coachTitle'];
  if (typeof rootCoachTitle === 'string' && rootCoachTitle.trim().length > 0) {
    return rootCoachTitle.trim();
  }

  const nestedCoachTitle = user?.coach?.title;
  if (typeof nestedCoachTitle === 'string' && nestedCoachTitle.trim().length > 0) {
    return nestedCoachTitle.trim();
  }

  const existingSportTitle = user?.sports?.find((sport) => sport.team?.title)?.team?.title;
  if (typeof existingSportTitle === 'string' && existingSportTitle.trim().length > 0) {
    return existingSportTitle.trim();
  }

  return undefined;
}

export function sanitizeSportsForStorage(sports?: SportProfile[]): SportProfile[] | undefined {
  if (!Array.isArray(sports)) return undefined;

  return sports.map((sport) => {
    const { team: _team, ...sportWithoutTeam } = sport;
    const sanitizedTeam = sport.team ? sanitizeStoredTeam(sport.team) : undefined;

    return {
      ...sportWithoutTeam,
      ...(sanitizedTeam ? { team: sanitizedTeam } : {}),
    };
  });
}

/**
 * Normalize positions to Title Case using SPORT_POSITIONS as the canonical source.
 * Looks up each position (case-insensitive) in SPORT_POSITIONS for the given sport.
 * Falls back to regex title-casing if no canonical match is found.
 */
export function normalizePositions(positions: readonly string[], sport: string): string[] {
  if (!positions || positions.length === 0) return [];

  const sportKey = normalizeSportKey(sport);
  const canonical = SPORT_POSITIONS[sportKey] ?? [];

  // Build lowercase → Title Case lookup from SPORT_POSITIONS
  const canonicalMap = new Map<string, string>();
  for (const p of canonical) {
    canonicalMap.set(p.toLowerCase(), p);
  }

  const normalized = new Set<string>();
  for (const p of positions) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    const match = canonicalMap.get(trimmed.toLowerCase());
    normalized.add(match ?? trimmed.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  return Array.from(normalized);
}

export function createSportProfile(
  sport: string,
  order: number,
  options?: {
    readonly positions?: string[];
    readonly teamName?: string;
    readonly title?: string;
    readonly teamType?: string;
    readonly city?: string;
    readonly state?: string;
    readonly teamId?: string;
    readonly organizationId?: string;
  }
): SportProfile {
  const VALID_TEAM_TYPES = [
    'high-school',
    'club',
    'college',
    'middle-school',
    'juco',
    'organization',
  ] as const;
  type ValidTeamType = (typeof VALID_TEAM_TYPES)[number];

  const teamType: ValidTeamType =
    options?.teamType && VALID_TEAM_TYPES.includes(options.teamType as ValidTeamType)
      ? (options.teamType as ValidTeamType)
      : 'high-school';

  const normalizedPositions = options?.positions
    ? normalizePositions(options.positions, sport)
    : [];

  const profile: SportProfile = {
    sport,
    order,
    team: {
      type: teamType,
      name: '',
    },
  };

  if (normalizedPositions.length > 0) {
    profile.positions = normalizedPositions;
  }

  if (options?.teamName || options?.teamType) {
    profile.team = {
      type: teamType,
      name: options?.teamName || '',
      ...(options?.title ? { title: options.title } : {}),
      ...(options?.teamId ? { teamId: options.teamId } : {}),
      ...(options?.organizationId ? { organizationId: options.organizationId } : {}),
    };
  } else if (options?.teamId || options?.organizationId || options?.title) {
    profile.team = {
      ...profile.team!,
      ...(options?.teamId ? { teamId: options.teamId } : {}),
      ...(options?.organizationId ? { organizationId: options.organizationId } : {}),
      ...(options?.title ? { title: options.title } : {}),
    };
  }
  return profile;
}

export function getPrimarySport(sports?: SportProfile[]): string | undefined {
  if (!sports?.length) return undefined;
  const primary = sports.find((s) => s.order === 0) ?? sports[0];
  return primary?.sport;
}

// ── OAuth Helpers ────────────────────────────────────────────────────────────

/** Known mobile app URI schemes allowed as OAuth callback targets */
export const ALLOWED_MOBILE_SCHEMES = new Set(['nxt1sports', 'nxt1app', 'nxt1']);

const DEFAULT_LOCAL_FRONTEND_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:4201',
  'http://127.0.0.1:4201',
  'http://localhost:4300',
  'http://127.0.0.1:4300',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
] as const;

const DEFAULT_PRODUCTION_FRONTEND_ORIGINS = [
  'https://nxt1sports.com',
  'https://www.nxt1sports.com',
  'https://nxt-1-v2.web.app',
  'https://nxt-1-v2.firebaseapp.com',
] as const;

const DEFAULT_STAGING_FRONTEND_ORIGINS = [
  'https://nxt-1-staging-v2.web.app',
  'https://nxt-1-staging-v2.firebaseapp.com',
  'https://staging.nxt1sports.com',
  'https://nxt1-repo--nxt-1-staging-v2.us-east4.hosted.app',
  'https://nxt1-repo--nxt-1-staging-v2.us-central1.hosted.app',
] as const;

/**
 * Returns allowed frontend origins for the current environment.
 */
export function getAllowedOrigins(isStaging: boolean): string[] {
  const key = isStaging ? 'STAGING_ALLOWED_FRONTEND_ORIGINS' : 'ALLOWED_FRONTEND_ORIGINS';
  const envOrigins =
    process.env[key]
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  const defaults = isStaging
    ? [...DEFAULT_STAGING_FRONTEND_ORIGINS, ...DEFAULT_LOCAL_FRONTEND_ORIGINS]
    : [...DEFAULT_PRODUCTION_FRONTEND_ORIGINS, ...DEFAULT_LOCAL_FRONTEND_ORIGINS];

  return [...new Set([...envOrigins, ...defaults])];
}

export function isAllowedOrigin(origin: string, isStaging: boolean): boolean {
  return getAllowedOrigins(isStaging).includes(origin);
}

export function getDefaultFrontendUrl(isStaging: boolean): string {
  return getAllowedOrigins(isStaging)[0] ?? 'http://localhost:4200';
}

/** Encode state payload as base64url JSON: { uid, origin?, mobileScheme?, oauthStateId? } */
export function encodeOAuthState(
  uid: string,
  origin: string,
  mobileScheme?: string,
  oauthStateId?: string
): string {
  return Buffer.from(
    JSON.stringify({ uid, origin, ...(mobileScheme && { mobileScheme }), oauthStateId })
  ).toString('base64url');
}

/**
 * Build a minimal HTML page that redirects the mobile browser (SFSafariViewController on iOS,
 * Chrome Custom Tab on Android) back to the app after OAuth completes.
 *
 * Strategy:
 * - Immediately tries `window.location.href = 'nxt1sports://...'`.
 *   On Android Chrome Custom Tab (after the nxt1sports intent-filter is registered in
 *   AndroidManifest.xml) this fires an intent, brings the app to the foreground, and our
 *   `appUrlOpen` listener closes the Custom Tab programmatically.
 * - On iOS 12+ SFSafariViewController, Apple blocks ALL navigation to custom URL schemes
 *   (HTTP 302 redirects AND JavaScript).  The JS call above silently fails, so after 1.5 s
 *   the page switches to a plain-language instruction: "Tap Done to return to NXT1."
 *   The user taps the native "Done" button → SFSafariViewController closes →
 *   `browserFinished` fires → our fallback handler refreshes the profile and resolves.
 */
export function buildMobileOAuthCallbackHtml(deepLink: string, success: boolean): string {
  // Escape for safe embedding inside a JS string literal (no template injection)
  const escaped = deepLink
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  const titleText = success ? 'Connected!' : 'Authentication failed';
  const bodyText = success
    ? 'Your account has been connected. Tap <strong>Done</strong> (iOS) or <strong>✕</strong> (Android) to return to NXT1.'
    : 'Authentication was not completed. Tap <strong>Done</strong> or <strong>✕</strong> to close this window and try again.';
  const iconColor = success ? '#22c55e' : '#ef4444';
  const icon = success ? '✓' : '✕';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${titleText}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{display:flex;align-items:center;justify-content:center;min-height:100vh;
         font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#fff;
         padding:24px;text-align:center}
    .card{max-width:340px;width:100%}
    .icon{width:56px;height:56px;border-radius:50%;background:${iconColor};
          display:flex;align-items:center;justify-content:center;
          font-size:28px;font-weight:700;margin:0 auto 20px}
    h1{font-size:1.25rem;font-weight:700;margin-bottom:12px}
    p{font-size:.95rem;line-height:1.5;opacity:.8}
    .spinner{width:40px;height:40px;border:3px solid rgba(255,255,255,.15);
             border-top-color:#fff;border-radius:50%;
             animation:spin .8s linear infinite;margin:0 auto 16px}
    @keyframes spin{to{transform:rotate(360deg)}}
    #auto{transition:opacity .3s}
    #manual{display:none;animation:fadein .4s ease}
    @keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  </style>
</head>
<body>
  <div class="card">
    <div id="auto">
      <div class="spinner"></div>
      <p>Returning to NXT1&hellip;</p>
    </div>
    <div id="manual">
      <div class="icon">${icon}</div>
      <h1>${titleText}</h1>
      <p>${bodyText}</p>
    </div>
  </div>
  <script>
    // Try JS-initiated navigation first.
    // Android Chrome Custom Tab: fires an intent, app opens, Custom Tab closes.
    // iOS SFSafariViewController: silently blocked — page stays here.
    window.location.href = '${escaped}';

    // If we are still on this page after 1.5 s the custom-scheme navigation was
    // blocked (iOS SFSafariViewController).  Show the manual-close instruction so
    // the user knows to tap the native "Done" button to return to the app.
    setTimeout(function() {
      var auto = document.getElementById('auto');
      var manual = document.getElementById('manual');
      if (auto) auto.style.display = 'none';
      if (manual) manual.style.display = 'block';
    }, 1500);
  </script>
</body>
</html>`;
}

/** Decode state — supports both legacy plain-uid and new base64url JSON. */
export function decodeOAuthState(state: string): {
  uid: string;
  origin?: string;
  mobileScheme?: string;
  oauthStateId?: string;
} {
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString()) as {
      uid?: string;
      origin?: string;
      mobileScheme?: string;
      oauthStateId?: string;
    };
    if (decoded.uid)
      return {
        uid: decoded.uid,
        origin: decoded.origin,
        mobileScheme: decoded.mobileScheme,
        oauthStateId: decoded.oauthStateId,
      };
  } catch {
    // legacy: state was just the uid string
  }
  return { uid: state };
}
