/**
 * @fileoverview Live Update (OTA) Module Barrel Export
 * @module @nxt1/core/live-update
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Self-hosted Over-The-Air (OTA) update types for the NXT1 mobile app.
 *
 * Architecture:
 * - Bundle ZIPs are stored in Firebase Storage at `app-bundles/{channel}/{platform}/{version}/bundle.zip`
 * - Manifest documents live in Firestore at `AppUpdates/{platform}_{channel}`
 * - Mobile app reads the manifest on launch, downloads the bundle, verifies
 *   the SHA-256 hash, and swaps the active web bundle.
 *
 * Native version compatibility is enforced via `minNativeVersion` — if the
 * installed native shell is older than the bundle requires, the OTA is
 * skipped and the user is asked to update through the App Store.
 */

/** Supported mobile platforms for OTA updates. */
export type LiveUpdatePlatform = 'ios' | 'android';

/** Supported deployment channels (mirrors environment configs). */
export type LiveUpdateChannel = 'production' | 'staging';

/** Manifest document stored in Firestore at `AppUpdates/{platform}_{channel}`. */
export interface LiveUpdateManifest {
  /** Target platform. */
  readonly platform: LiveUpdatePlatform;
  /** Deployment channel. */
  readonly channel: LiveUpdateChannel;
  /** Semantic version of the web bundle (e.g. `1.4.2`). */
  readonly version: string;
  /** Public HTTPS download URL for the bundle ZIP. */
  readonly bundleUrl: string;
  /** SHA-256 hex digest of the bundle ZIP for integrity verification. */
  readonly bundleHash: string;
  /** Bundle size in bytes. */
  readonly bundleSize: number;
  /**
   * Minimum native shell version required to apply this OTA bundle.
   * If the installed native version is lower, the OTA is skipped.
   */
  readonly minNativeVersion: string;
  /** ISO-8601 timestamp when the bundle was published. */
  readonly publishedAt: string;
  /** Whether this update is currently being served to clients. */
  readonly enabled: boolean;
  /**
   * Rollout percentage (0–100). Clients hash their install ID and only
   * apply the update if their hash falls under this threshold.
   */
  readonly rolloutPercentage: number;
  /** Optional human-readable changelog. */
  readonly releaseNotes?: string;
  /** Git commit SHA the bundle was built from (for traceability). */
  readonly gitSha?: string;
}

/** Local persisted state for the mobile client. */
export interface LiveUpdateState {
  /** Last applied OTA bundle version. `null` means running native shell bundle. */
  readonly currentVersion: string | null;
  /** Last successful update check (ISO-8601). */
  readonly lastCheckedAt: string | null;
  /**
   * Number of consecutive failed application attempts.
   * After 3 failures we fall back to the native bundle and disable OTA
   * until the next native shell update.
   */
  readonly failureCount: number;
}

/** Result of an OTA update check. */
export type LiveUpdateCheckResult =
  | { readonly status: 'up-to-date'; readonly currentVersion: string | null }
  | { readonly status: 'skipped'; readonly reason: LiveUpdateSkipReason }
  | {
      readonly status: 'available';
      readonly manifest: LiveUpdateManifest;
      readonly currentVersion: string | null;
    }
  | { readonly status: 'error'; readonly error: string };

/** Reasons an OTA update may be skipped. */
export type LiveUpdateSkipReason =
  | 'disabled'
  | 'rollout-excluded'
  | 'native-too-old'
  | 'not-native'
  | 'already-current'
  | 'previous-failures';

/** Storage path helpers (used by both backend deploy script and client). */
export const LIVE_UPDATE_PATHS = {
  /** Firestore doc id for a given platform + channel. */
  manifestDocId: (platform: LiveUpdatePlatform, channel: LiveUpdateChannel): string =>
    `${platform}_${channel}`,
  /** Storage object path for a given bundle. */
  storagePath: (
    channel: LiveUpdateChannel,
    platform: LiveUpdatePlatform,
    version: string
  ): string => `app-bundles/${channel}/${platform}/${version}/bundle.zip`,
  /** Firestore collection name. */
  COLLECTION: 'AppUpdates' as const,
} as const;

/** Maximum failures before disabling OTA until next native release. */
export const LIVE_UPDATE_MAX_FAILURES = 3;

/**
 * Deterministic rollout check — returns true if the install should receive
 * the bundle given a `rolloutPercentage` between 0 and 100.
 *
 * Uses a simple FNV-1a hash of the install ID so the same device gets a
 * stable result across checks.
 */
export function isInRollout(installId: string, rolloutPercentage: number): boolean {
  if (rolloutPercentage >= 100) return true;
  if (rolloutPercentage <= 0) return false;

  // FNV-1a 32-bit hash
  let hash = 2166136261;
  for (let i = 0; i < installId.length; i++) {
    hash ^= installId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Map to 0–99
  const bucket = Math.abs(hash) % 100;
  return bucket < rolloutPercentage;
}

/**
 * Compare two semver-like version strings ("1.2.3").
 * Returns -1 if a<b, 0 if equal, 1 if a>b. Non-numeric segments compare lexicographically.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const aParts = a.split('.');
  const bParts = b.split('.');
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aRaw = aParts[i] ?? '0';
    const bRaw = bParts[i] ?? '0';
    const aNum = Number(aRaw);
    const bNum = Number(bRaw);
    const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);
    if (bothNumeric) {
      if (aNum < bNum) return -1;
      if (aNum > bNum) return 1;
    } else {
      if (aRaw < bRaw) return -1;
      if (aRaw > bRaw) return 1;
    }
  }
  return 0;
}
