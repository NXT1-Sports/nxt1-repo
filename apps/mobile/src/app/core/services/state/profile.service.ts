/**
 * @fileoverview Profile Service - User Data Management
 * @module @nxt1/mobile/core/services
 *
 * ⭐ PROFESSIONAL 2026 PATTERN: Separation of Concerns ⭐
 *
 * This service manages USER DATA (profile) separately from AUTH (session).
 * - AuthService: handles authentication (signIn, signOut, token, isAuthenticated)
 * - ProfileService: handles user data (User model, profile updates, caching)
 *
 * Single Source of Truth:
 * - Uses `User` type from @nxt1/core/models everywhere
 * - No fragmented types (AuthUser, CachedUserProfile, MergedUserProfile)
 * - Backend returns User, cache stores User, components consume User
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   Components (UI Layer)                    │
 * │              MobileShell, HomePage, ProfilePage            │
 * ├────────────────────────────────────────────────────────────┤
 * │              ⭐ ProfileService (THIS FILE) ⭐               │
 * │           Single source of truth for User data             │
 * ├────────────────────────────────────────────────────────────┤
 * │               ProfileApiService (HTTP)                     │
 * │        Calls backend, returns User type                    │
 * └────────────────────────────────────────────────────────────┘
 *
 * @example
 * ```typescript
 * export class HomeComponent {
 *   private profile = inject(ProfileService);
 *
 *   readonly user = this.profile.user;
 *   readonly sports = computed(() => this.user()?.sports ?? []);
 *
 *   async refreshProfile() {
 *     await this.profile.refresh();
 *   }
 * }
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */
import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { type User, type SportProfile, getPrimarySport } from '@nxt1/core/models';
import { type UpdateProfileRequest } from '@nxt1/core/api';
import { type UserDisplayInput } from '@nxt1/core';
import { NxtLoggingService } from '@nxt1/ui';
import { type ILogger } from '@nxt1/core/logging';
import { ProfileApiService } from '../api/profile-api.service';

// ============================================
// TYPES
// ============================================

/**
 * Profile loading state
 */
export type ProfileLoadingState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Profile service interface for testing/mocking
 */
export interface IProfileService {
  readonly user: ReturnType<typeof computed<User | null>>;
  readonly isLoading: ReturnType<typeof computed<boolean>>;
  readonly error: ReturnType<typeof computed<string | null>>;
  readonly state: ReturnType<typeof computed<ProfileLoadingState>>;

  load(uid: string): Promise<void>;
  refresh(uid?: string): Promise<void>;
  update(updates: UpdateProfileRequest): Promise<void>;
  clear(): void;
}

// ============================================
// SERVICE
// ============================================

/**
 * ProfileService - Manages User data with caching
 *
 * Professional pattern:
 * - Single `user` signal with full User type
 * - Layered caching via CapacitorHttpAdapter (memory + disk)
 * - Clear separation from auth concerns
 */
@Injectable({ providedIn: 'root' })
export class ProfileService implements OnDestroy, IProfileService {
  private readonly api = inject(ProfileApiService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('ProfileService');

  // ============================================
  // PRIVATE STATE
  // ============================================

  /** Current user profile */
  private readonly _user = signal<User | null>(null);

  /** Loading state */
  private readonly _state = signal<ProfileLoadingState>('idle');

  /** Error message */
  private readonly _error = signal<string | null>(null);

  /** Current user ID (for refresh) */
  private currentUid: string | null = null;

  // ============================================
  // PUBLIC SIGNALS (Read-only)
  // ============================================

  /**
   * Current user profile - THE single source of truth
   * Components should use this for ALL user data needs.
   */
  readonly user = computed(() => this._user());

  /**
   * Loading state
   */
  readonly isLoading = computed(() => this._state() === 'loading');

  /**
   * Error message (null if no error)
   */
  readonly error = computed(() => this._error());

  /**
   * Current state
   */
  readonly state = computed(() => this._state());

  // ============================================
  // DERIVED COMPUTED (Convenience)
  // ============================================

  /**
   * Primary sport profile
   */
  readonly primarySport = computed<SportProfile | undefined>(() => {
    const user = this._user();
    return user ? getPrimarySport(user) : undefined;
  });

  /**
   * All sports
   */
  readonly sports = computed<SportProfile[]>(() => this._user()?.sports ?? []);

  /**
   * Display name
   */
  readonly displayName = computed(() => {
    const user = this._user();
    if (!user) return 'User';
    return `${user.firstName} ${user.lastName}`.trim() || 'User';
  });

  /**
   * Profile image URL
   */
  readonly profileImg = computed(() => this._user()?.profileImgs?.[0] ?? null);

  /**
   * Has completed onboarding
   */
  readonly hasCompletedOnboarding = computed(() => this._user()?.onboardingCompleted ?? false);

  /**
   * User role
   */
  readonly role = computed(() => this._user()?.role ?? null);

  /**
   * User mapped to UserDisplayInput — the canonical shape consumed by
   * `buildUserDisplayContext()` and footer/sidenav display surfaces.
   *
   * Flattens `coach.managedTeamCodes` to the top-level `managedTeamCodes`
   * field that `resolveCanonicalTeamRoute` needs to pick the short team
   * code over any Firestore document ID stored in `teamCode.teamCode`.
   */
  readonly userAsDisplayInput = computed<UserDisplayInput | null>(() => {
    const user = this._user();
    if (!user) return null;
    return {
      ...(user as unknown as UserDisplayInput),
      managedTeamCodes: user.coach?.managedTeamCodes ?? null,
    };
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnDestroy(): void {
    // handled natively
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Load user profile by UID
   *
   * Fetches from backend. CapacitorHttpAdapter handles all caching.
   *
   * @param uid - User ID to load
   */
  async load(uid: string): Promise<void> {
    this.currentUid = uid;
    await this.fetchProfile(uid);
  }

  /**
   * Refresh user profile (bypass cache)
   *
   * @param uid - Optional user ID. If not provided, uses the last loaded user.
   *              Pass uid explicitly when refreshing before initial load.
   */
  async refresh(uid?: string): Promise<void> {
    const targetUid = uid ?? this.currentUid;

    if (!targetUid) {
      this.logger.warn('Cannot refresh: no user loaded and no uid provided');
      return;
    }

    // Invalidate transport-level profile cache before the refetch.
    await this.api.invalidateCache(targetUid);
    await this.fetchProfile(targetUid);
  }

  /**
   * Update user profile
   *
   * @param updates - Profile updates (subset of User fields allowed by API)
   */
  async update(updates: UpdateProfileRequest): Promise<void> {
    const uid = this.currentUid;
    if (!uid) {
      throw new Error('Cannot update: no user loaded');
    }

    this._state.set('loading');
    this._error.set(null);

    try {
      const response = await this.api.updateProfile(uid, updates);

      if (response.success && response.data) {
        this._user.set(response.data);
        this._state.set('loaded');
        this.logger.info('Profile updated', { uid });
      } else {
        throw new Error(response.error ?? 'Failed to update profile');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update profile';
      this._error.set(message);
      this._state.set('error');
      this.logger.error('Profile update failed', err, { uid });
      throw err;
    }
  }

  /**
   * Clear user profile and cache
   *
   * Call this on sign-out.
   */
  clear(): void {
    this._user.set(null);
    this._state.set('idle');
    this._error.set(null);
    this.currentUid = null;
    this.logger.debug('Profile cleared');
  }

  /**
   * Set user directly (for optimistic updates)
   *
   * @internal Use with caution - prefer update() for persistence
   */
  setUser(user: User): void {
    this._user.set(user);
    if (user.id) {
      this.currentUid = user.id;
    }
    this._state.set('loaded');
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Fetch profile from backend
   */
  private async fetchProfile(uid: string): Promise<void> {
    this._state.set('loading');
    this._error.set(null);

    try {
      const response = await this.api.getProfile(uid);

      this.logger.debug('Profile API response', {
        hasSuccess: 'success' in response,
        hasData: 'data' in response,
        hasId: 'id' in response,
        keys: Object.keys(response),
      });

      // Handle wrapped response: { success: true, data: User }
      if ('success' in response && 'data' in response) {
        if (response.success && response.data) {
          this._user.set(response.data);
          this._state.set('loaded');
          this.logger.info('✅ Profile loaded from backend (wrapped format)', { uid });
        } else {
          throw new Error(response.error ?? 'Failed to load profile');
        }
      }
      // Handle unwrapped response: User directly
      else if ('id' in response || 'email' in response) {
        const user = response as unknown as User;
        this._user.set(user);
        this._state.set('loaded');
        this.logger.info('✅ Profile loaded from backend (unwrapped format)', { uid });
      }
      // Unknown response format
      else {
        throw new Error('Invalid response format: missing success/data or user fields');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load profile';
      this._error.set(message);
      this._state.set('error');
      this.logger.error('❌ Profile load failed', err, {
        uid,
      });
      throw err;
    }
  }
}
