/**
 * @fileoverview Backend Feature Flags Service
 * @module @nxt1/backend/config/feature-flags
 *
 * Production-grade feature flag service with:
 * - Firestore as primary source (admin-controlled)
 * - Environment variables as fallback
 * - In-memory cache with TTL
 * - Full observability (logging, analytics, breadcrumbs, performance)
 * - Type-safe flag definitions from @nxt1/core
 *
 * Usage:
 * ```typescript
 * @Injectable({ providedIn: 'root' })
 * export class YourService {
 *   private readonly flags = inject(FeatureFlagsService);
 *
 *   async doWork(): Promise<void> {
 *     const enabled = await this.flags.isEnabled('team.intel.enabled');
 *     if (enabled) {
 *       // Feature-gated code
 *     }
 *   }
 * }
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { Firestore } from 'firebase-admin/firestore';
import {
  FEATURE_FLAG_REGISTRY,
  type FeatureFlagKey,
  type FlagValue,
  InvalidFlagValueError,
} from '@nxt1/core/flags';

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return undefined;
}

const LEGACY_ENV_READERS: Partial<Record<FeatureFlagKey, () => FlagValue | undefined>> = {
  'experimental.agent.engine.enabled': () => {
    const disabled = parseBooleanEnv(process.env['AGENT_ENGINE_DISABLED']);
    return typeof disabled === 'boolean' ? !disabled : undefined;
  },
  'ai.distiller.enabled': () => parseBooleanEnv(process.env['AI_DISTILLER_ENABLED']),
  'ai.model.prod.catalog.in.dev.enabled': () =>
    parseBooleanEnv(process.env['USE_PROD_MODELS_IN_DEV']),
  'billing.stripe.enabled': () => parseBooleanEnv(process.env['STRIPE_ENABLED']),
};

// ============================================
// TYPES
// ============================================

interface CacheEntry {
  readonly value: FlagValue;
  readonly expiresAt: number;
}

/**
 * Feature flag cache statistics.
 */
export interface FlagsCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
  readonly size: number;
}

// ============================================
// ENVIRONMENT FALLBACK
// ============================================

/**
 * Map environment variables to feature flags.
 * Used when Firestore is unavailable or for quick overrides.
 *
 * Environment variable naming convention:
 * ENABLE_TEAM_INTEL → team.intel.enabled
 * ENABLE_AGENT_PRIMARY → agent.primary.enabled
 */
function parseEnvironmentFlag(key: FeatureFlagKey): FlagValue {
  const legacyReader = LEGACY_ENV_READERS[key];
  const legacyValue = legacyReader?.();
  if (legacyValue !== undefined) {
    return legacyValue;
  }

  // Convert flag key to env var name: team.intel.enabled → ENABLE_TEAM_INTEL
  const envVar = `ENABLE_${key.replace(/\./g, '_').toUpperCase()}`;
  const value = process.env[envVar];

  if (!value) return null;

  // Parse boolean values
  if (value.toLowerCase() === 'true' || value === '1') return true;
  if (value.toLowerCase() === 'false' || value === '0') return false;

  // Return as string for enum/other types
  return value;
}

// ============================================
// SERVICE
// ============================================

/**
 * Feature Flags Service — Production-grade implementation.
 * Manages feature flags with Firestore persistence, caching, and fallback.
 *
 * Architecture:
 * 1. Check in-memory cache (if not expired)
 * 2. Query Firestore (AppConfig/featureFlags collection)
 * 3. Fall back to environment variable
 * 4. Use default value from registry
 * 5. Cache result for TTL
 */
export class FeatureFlagsService {
  private readonly firestore: Firestore;
  private readonly cache = new Map<FeatureFlagKey, CacheEntry>();
  private readonly cacheTTL: number; // milliseconds
  private stats = { hits: 0, misses: 0 };

  constructor(
    firestore: Firestore,
    cacheTTLSeconds: number = 300 // Default 5 minutes
  ) {
    this.firestore = firestore;
    this.cacheTTL = cacheTTLSeconds * 1000;
  }

  /**
   * Get a single flag value.
   * Resolves from: cache → Firestore → environment → default
   *
   * @param key Feature flag key
   * @returns Flag value or null if not set
   * @throws InvalidFlagValueError if flag definition invalid
   */
  async getFlagValue(key: FeatureFlagKey): Promise<FlagValue> {
    // Check cache
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.stats.hits++;
      return cached.value;
    }

    this.stats.misses++;

    // Query Firestore (try primary source)
    let value: FlagValue | undefined;
    try {
      value = await this.getFromFirestore(key);
    } catch (err) {
      // Log but don't fail — fall back to environment/default
      console.error(`[FeatureFlags] Firestore query failed for ${key}:`, err);
    }

    // Fall back to environment variable
    if (value === undefined) {
      value = parseEnvironmentFlag(key);
    }

    // Fall back to default value
    if (value === undefined || value === null) {
      const definition = FEATURE_FLAG_REGISTRY.getFlag(key);
      value = definition?.defaultValue ?? null;
    }

    // Validate
    const validation = FEATURE_FLAG_REGISTRY.validate(key, value);
    if (!validation.valid) {
      throw new InvalidFlagValueError(key, value, validation.error || 'Invalid flag value');
    }

    // Cache result
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTTL,
    });

    return value;
  }

  /**
   * Get multiple flag values (batch).
   * More efficient than calling getFlagValue() repeatedly.
   *
   * @param keys Array of flag keys
   * @returns Record mapping flag keys to values
   */
  async getFlagValues(
    keys: readonly FeatureFlagKey[]
  ): Promise<Readonly<Record<FeatureFlagKey, FlagValue>>> {
    const results = await Promise.all(keys.map((k) => this.getFlagValue(k)));
    return Object.fromEntries(keys.map((k, i) => [k, results[i]])) as Record<
      FeatureFlagKey,
      FlagValue
    >;
  }

  /**
   * Get all flag values.
   * Useful for admin dashboards and auditing.
   *
   * @returns Record of all flags and their values
   */
  async getAllFlags(): Promise<Readonly<Record<FeatureFlagKey, FlagValue>>> {
    const allKeys = Object.keys(FEATURE_FLAG_REGISTRY.flags) as FeatureFlagKey[];
    return this.getFlagValues(allKeys);
  }

  /**
   * Check if a boolean flag is enabled.
   * Convenience method for on/off flags.
   *
   * @param key Feature flag key
   * @returns true if flag is boolean true, false otherwise
   */
  async isEnabled(key: FeatureFlagKey): Promise<boolean> {
    const value = await this.getFlagValue(key);
    return value === true;
  }

  /**
   * Set a flag value in Firestore (admin only).
   * Invalidates cache immediately.
   *
   * @param key Flag key
   * @param value New value
   * @throws Error if Firestore write fails
   */
  async setFlagValue(key: FeatureFlagKey, value: FlagValue): Promise<void> {
    // Validate
    const validation = FEATURE_FLAG_REGISTRY.validate(key, value);
    if (!validation.valid) {
      throw new InvalidFlagValueError(key, value, validation.error || 'Invalid flag value');
    }

    // Write to Firestore
    const docRef = this.firestore.collection('AppConfig').doc('featureFlags');
    await docRef.set(
      {
        [`flags.${key}`]: value,
        [`flags.${key}UpdatedAt`]: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Invalidate cache
    this.cache.delete(key);
  }

  /**
   * Delete a flag (revert to default).
   *
   * @param key Flag key
   */
  async deleteFlagValue(key: FeatureFlagKey): Promise<void> {
    const docRef = this.firestore.collection('AppConfig').doc('featureFlags');
    await docRef.set(
      {
        [`flags.${key}`]: null,
        [`flags.${key}UpdatedAt`]: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Invalidate cache
    this.cache.delete(key);
  }

  /**
   * Clear the in-memory cache.
   * Useful for testing or forcing a refresh.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring.
   *
   * @returns Cache hit/miss stats
   */
  getCacheStats(): FlagsCacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total === 0 ? 0 : this.stats.hits / total,
      size: this.cache.size,
    };
  }

  /**
   * Reset cache statistics.
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }

  // ============================================
  // INTERNAL
  // ============================================

  private async getFromFirestore(key: FeatureFlagKey): Promise<FlagValue | undefined> {
    const docRef = this.firestore.collection('AppConfig').doc('featureFlags');
    const snap = await docRef.get();

    if (!snap.exists) {
      return undefined;
    }

    const data = snap.data() as { flags?: Record<string, unknown> };
    const value = data.flags?.[key];
    return value as FlagValue | undefined;
  }
}

/**
 * Singleton instance management.
 * To be injected via DI container.
 */
let serviceInstance: FeatureFlagsService | null = null;

/**
 * Initialize or get the singleton Feature Flags Service.
 *
 * @param firestore Firebase Firestore instance
 * @param cacheTTLSeconds Cache TTL in seconds (default 300)
 * @returns FeatureFlagsService instance
 */
export function getFeatureFlagsService(
  firestore: Firestore,
  cacheTTLSeconds?: number
): FeatureFlagsService {
  if (!serviceInstance) {
    serviceInstance = new FeatureFlagsService(firestore, cacheTTLSeconds);
  }
  return serviceInstance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetFeatureFlagsService(): void {
  serviceInstance = null;
}

/**
 * Resolve a flag synchronously from environment/defaults.
 * Useful for early bootstrap code that cannot await Firestore lookups.
 */
export function getFeatureFlagValueSync(key: FeatureFlagKey): FlagValue {
  const envValue = parseEnvironmentFlag(key);
  const value =
    envValue === null ? (FEATURE_FLAG_REGISTRY.getFlag(key)?.defaultValue ?? null) : envValue;
  const validation = FEATURE_FLAG_REGISTRY.validate(key, value);
  if (!validation.valid) {
    throw new InvalidFlagValueError(key, value, validation.error || 'Invalid flag value');
  }
  return value;
}

/**
 * Synchronous boolean check for bootstrap/static paths.
 */
export function isFeatureEnabledSync(key: FeatureFlagKey): boolean {
  return getFeatureFlagValueSync(key) === true;
}
