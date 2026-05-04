/**
 * Auth Flow Service - Business Logic Orchestrator
 *
 * Orchestrates authentication flows by coordinating between:
 * - Firebase Auth (SDK operations)
 * - Auth API (Backend HTTP calls)
 * - Router (Angular navigation)
 * - State management (via @nxt1/core AuthStateManager)
 *
 * This is the DOMAIN layer - it knows about business rules but not UI.
 * Components should use this service, not call Firebase/API directly.
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   Components (UI Layer)                    │
 * │              LoginComponent, SignUpComponent               │
 * ├────────────────────────────────────────────────────────────┤
 * │              ⭐ AuthFlowService (THIS FILE) ⭐              │
 * │           Orchestrates business logic & state              │
 * ├────────────────────────────────────────────────────────────┤
 * │             createAuthStateManager (@nxt1/core)            │
 * │         Pure TypeScript state - same as mobile app         │
 * ├────────────────────────────────────────────────────────────┤
 * │        AuthApiService          Firebase Auth (SSR-safe)    │
 * │        (Backend API)           (Lazy-loaded on browser)    │
 * └────────────────────────────────────────────────────────────┘
 *
 * SSR Compatibility:
 * - Uses memory storage adapter on server (SSR)
 * - Uses browser storage adapter on client
 * - Lazily loads Firebase Auth only on browser
 * - Server renders with default unauthenticated state
 *
 * ⭐ PORTABLE STATE MANAGEMENT ⭐
 * Uses the same createAuthStateManager from @nxt1/core as mobile,
 * ensuring consistent auth state handling across all platforms.
 *
 * @module @nxt1/web/features/auth
 */
import {
  Injectable,
  inject,
  isDevMode,
  signal,
  computed,
  Injector,
  OnDestroy,
  runInInjectionContext,
  TransferState,
} from '@angular/core';
import { Router } from '@angular/router';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { type ILogger } from '@nxt1/core/logging';
import { Subscription } from 'rxjs';

// Type-only imports - these don't cause runtime code to execute
import type { Auth as FirebaseAuthType, User as FirebaseUser } from '@angular/fire/auth';

import { AuthApiService } from './auth-api.service';
import { AuthCookieService } from './auth-cookie.service';
import { AUTH_TRANSFER_STATE_KEY } from './ssr-tokens';
import type { TransferredAuthState } from './ssr-tokens';
import { AuthErrorHandler } from '@nxt1/ui/services/auth-error';
import { FileUploadService } from '..';
import { InviteApiService } from '@nxt1/ui/invite';
import { PENDING_REFERRAL_KEY, type PendingReferral } from '../../../features/join/join.component';
import {
  type UserRole,
  type AuthState as CoreAuthState,
  type AuthStateManager,
  type AuthUser,
  type ConnectedSource,
  normalizeRole,
  createAuthStateManager,
  createBrowserStorageAdapter,
  createMemoryStorageAdapter,
  INITIAL_AUTH_STATE,
  INVITE_TEAM_JOINED_KEY,
} from '@nxt1/core';
import {
  type IAuthFlowService,
  GOOGLE_OAUTH_SCOPES,
  type SignInCredentials,
  type SignUpCredentials,
  type OAuthOptions,
  globalAuthUserCache,
  type CachedUserProfile,
} from '@nxt1/core/auth';
import { AUTH_ROUTES, AUTH_REDIRECTS, AUTH_METHODS } from '@nxt1/core/constants';
import {
  type AnalyticsAdapter,
  createFirebaseAnalyticsAdapterSync as _createFirebaseAnalyticsAdapterSync,
  createMemoryAnalyticsAdapter,
  APP_EVENTS,
} from '@nxt1/core/analytics';
import type { CrashlyticsAdapter, CrashUser } from '@nxt1/core/crashlytics';
import { GLOBAL_CRASHLYTICS } from '@nxt1/ui/infrastructure/error-handling';
import { environment } from '../../../../environments/environment';
import { clearHttpCache } from '../../infrastructure';
import { mapBackendProfileToCachedUserProfile } from './auth-profile.mapper';

/**
 * SSR-Safe Firebase Auth Access
 *
 * We can't import Auth directly from @angular/fire/auth because it causes
 * the module to initialize on the server, which throws NG0401.
 *
 * Instead, we:
 * 1. Use type-only imports for TypeScript types
 * 2. Dynamically access Auth through the injector only on browser
 * 3. Lazily import firebase/auth functions only when needed (browser-only)
 */
type Auth = FirebaseAuthType;

function isEmailVerificationRequired(): boolean {
  // Development-only bypass to speed local auth testing.
  return !isDevMode();
}

// ============================================
// TYPES
// ============================================

// Note: We use AuthUser directly from @nxt1/core
// hasCompletedOnboarding is already included in the core type
// SignInCredentials, SignUpCredentials, OAuthOptions imported from @nxt1/core/auth

/**
 * Auth Flow Service
 *
 * Manages all authentication flows and user state.
 * Uses createAuthStateManager from @nxt1/core for portable state management.
 * Angular signals expose the state reactively to components.
 *
 * @example
 * ```typescript
 * export class LoginComponent {
 *   private auth = inject(AuthFlowService);
 *
 *   readonly isLoading = this.auth.isLoading;
 *   readonly error = this.auth.error;
 *
 *   async onLogin(email: string, password: string) {
 *     await this.auth.signInWithEmail({ email, password });
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class AuthFlowService implements OnDestroy, IAuthFlowService {
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly injector = inject(Injector);
  private readonly authApi = inject(AuthApiService);
  private readonly authCookie = inject(AuthCookieService);
  private readonly authErrorHandler = inject(AuthErrorHandler);
  private readonly inviteApi = inject(InviteApiService);
  private readonly transferState = inject(TransferState);

  /** Structured logger for auth operations */
  private readonly logger: ILogger = inject(NxtLoggingService).child('AuthFlowService');

  /** Analytics adapter - web or memory based on platform */
  private readonly analytics: AnalyticsAdapter = this.createAnalyticsAdapter();

  /** Crashlytics adapter for crash reporting with user context */
  private readonly crashlytics: CrashlyticsAdapter = inject(GLOBAL_CRASHLYTICS);

  /**
   * Firebase Auth instance - lazy loaded, null on server (SSR)
   * We don't inject Auth directly because @angular/fire/auth module
   * initialization throws NG0401 on the server.
   */
  private firebaseAuth: Auth | null = null;
  private authStateSubscription?: Subscription;

  /**
   * Tracks whether Firebase Auth has ever emitted a non-null user in this session.
   * Firebase's authState() observable always emits null first while it resolves
   * the current session from the cookie — before confirming the real user.
   * We use this flag to distinguish that "initial null" from a genuine sign-out,
   * so we don't wipe the SSR-hydrated user on every page load.
   */
  private _firebaseAuthResolved = false;

  /**
   * ⭐ Core Auth State Manager - Same pattern as mobile app ⭐
   *
   * Uses memory storage on server (SSR) and browser storage on client.
   * This is the portable state management from @nxt1/core.
   */
  private authManager!: AuthStateManager;

  // ============================================
  // STATE SIGNAL (Synced from AuthStateManager)
  // ============================================
  private readonly _state = signal<CoreAuthState>(INITIAL_AUTH_STATE);

  /**
   * Tracks whether auth resolution is complete and the UI can trust the auth state.
   *
   * Unlike `isInitialized` (which fires when the AuthStateManager reads localStorage),
   * `isAuthReady` only becomes true when we have a **definitive** auth answer:
   *  - TransferState hydrated a user (synchronous)
   *  - localStorage restored a user (after authManager.initialize())
   *  - Firebase Auth emitted its first real result (user or confirmed null)
   *  - Server render with no user (synchronous)
   *  - 5-second safety timeout
   *
   * Use this for "show Sign In" decisions — it prevents premature flash.
   */
  private readonly _isAuthReady = signal(false);

  // ============================================
  // PUBLIC COMPUTED SIGNALS (Read-only)
  // ============================================
  readonly user = computed(() => this._state().user);
  readonly firebaseUser = computed(() => this._state().firebaseUser);
  readonly isLoading = computed(() => this._state().isLoading);
  readonly error = computed(() => this._state().error);
  readonly isInitialized = computed(() => this._state().isInitialized);
  readonly isAuthReady = computed(() => this._isAuthReady());

  readonly isAuthenticated = computed(() => this._state().user !== null);

  readonly userRole = computed(() => this._state().user?.role ?? null);
  readonly hasCompletedOnboarding = computed(
    () => this._state().user?.hasCompletedOnboarding ?? false
  );
  /** True when user was migrated from the legacy NXT1 system */
  readonly isLegacyUser = computed(() => !!this._state().user?._legacyId);
  /** True when the legacy user has completed the 3-step intro onboarding */
  readonly legacyOnboardingCompleted = computed(
    () => this._state().user?.legacyOnboardingCompleted === true
  );

  // ============================================
  // INITIALIZATION
  // ============================================

  constructor() {
    // Initialize auth state manager based on platform
    this.initializeAuthManager();
  }

  ngOnDestroy(): void {
    this.authStateSubscription?.unsubscribe();
  }

  // ============================================
  // NAVIGATION HELPERS (Angular Router)
  // ============================================

  /**
   * Navigate forward to a route
   */
  private async navigateForward(path: string): Promise<void> {
    await this.router.navigate([path]);
  }

  /**
   * Navigate back to a route
   */
  private async navigateBack(path: string): Promise<void> {
    await this.router.navigate([path]);
  }

  /**
   * Navigate to root (replaces navigation stack)
   */
  private async navigateRoot(path: string): Promise<void> {
    await this.router.navigate([path], { replaceUrl: true });
  }

  /**
   * Run an async operation with delayed loading state
   * Only shows loader if operation takes > 300ms (standard UX pattern)
   * Reduces visual noise for fast operations
   *
   * @param message - Loading message to display
   * @param operation - The async operation to run
   * @param onError - Error handler that receives the error and returns result
   */
  private async runWithDelayedLoading<T>(
    message: string,
    operation: () => Promise<T>,
    onError: (err: unknown) => T
  ): Promise<T> {
    const LOADER_DELAY_MS = 300;
    let loaderShown = false;

    // Start the operation immediately
    const operationPromise = operation();

    // Schedule loader to show after delay
    const loaderTimeout = setTimeout(() => {
      loaderShown = true;
      this.authManager.setLoading(true);
    }, LOADER_DELAY_MS);

    try {
      // Wait for operation to complete
      const result = await operationPromise;
      return result;
    } catch (err) {
      // Call error handler
      return onError(err);
    } finally {
      // Clear the timeout if operation completed before delay
      clearTimeout(loaderTimeout);
      // Only hide loader if it was actually shown
      if (loaderShown) {
        this.authManager.setLoading(false);
      }
    }
  }

  /**
   * Run an async operation with immediate loading state.
   * Used for OAuth post-selection work so loading starts right after
   * Firebase returns a selected account credential.
   */
  private async runWithLoading<T>(
    operation: () => Promise<T>,
    onError: (err: unknown) => T
  ): Promise<T> {
    this.authManager.setLoading(true);
    try {
      return await operation();
    } catch (err) {
      return onError(err);
    } finally {
      this.authManager.setLoading(false);
    }
  }

  /**
   * Store the Firebase ID token in authManager and set __session cookie.
   * Must be called BEFORE any API calls (like syncUserProfile) so the
   * auth interceptor can attach the Bearer token to outgoing requests.
   */
  private async storeTokenFromUser(firebaseUser: FirebaseUser): Promise<void> {
    const token = await firebaseUser.getIdToken();
    await this.authManager.setToken({
      token,
      expiresAt: Date.now() + 55 * 60 * 1000,
      userId: firebaseUser.uid,
    });
    this.authCookie.setAuthCookie(token);
  }

  // ============================================
  // ANALYTICS
  // ============================================

  /**
   * Create appropriate analytics adapter based on platform
   *
   * Note: auth-specific analytics here use a lightweight adapter for local
   * state coordination and debug logging.
   * The primary web analytics pipeline now relays browser events to the
   * backend-owned analytics endpoint for Mongo-backed rollups.
   *
   * This adapter is primarily for auth-specific tracking that supplements
   * the global analytics service.
   */
  private createAnalyticsAdapter(): AnalyticsAdapter {
    // Use a lightweight memory adapter for auth-local tracking and debug logging
    // Primary analytics flow is handled by the shared backend relay service
    return createMemoryAnalyticsAdapter({
      enabled: this.platform.isBrowser(),
      debug: !environment.production,
    });
  }

  /**
   * Initialize the auth state manager with appropriate storage adapter
   *
   * Uses the same pattern as mobile app:
   * - Server (SSR): memory storage
   * - Browser: localStorage
   *
   * TransferState bridge (2026 best practice):
   * On server, ServerAuthService writes the authenticated user to TransferState
   * via APP_INITIALIZER. This method reads it so that the very first render
   * (server AND client) reflects the correct authenticated state — no "Sign In" flash.
   */
  private initializeAuthManager(): void {
    // Use appropriate storage based on platform
    const storage = this.platform.isBrowser()
      ? createBrowserStorageAdapter()
      : createMemoryStorageAdapter();

    this.authManager = createAuthStateManager(storage);

    // Subscribe to state changes from the manager
    this.authManager.subscribe((state) => {
      this._state.set(state);
    });

    // ── TransferState hydration (server + browser) ─────────────────────────
    // On server: reads what ServerAuthService.initialize() just wrote.
    // On browser: reads the JSON serialized into the HTML by SSR.
    // Either way, sets the user synchronously on the first tick.
    const transferred = this.transferState.get<TransferredAuthState>(AUTH_TRANSFER_STATE_KEY, {
      user: null,
      firebaseUser: null,
    });

    if (transferred.user) {
      const authUser: AuthUser = {
        uid: transferred.user.uid,
        email: transferred.user.email,
        displayName: transferred.user.displayName,
        profileImg: transferred.user.profileImg,
        role: (transferred.user.role as UserRole) ?? 'athlete',

        hasCompletedOnboarding: transferred.user.hasCompletedOnboarding,
        provider: 'email', // default for SSR transfer
        emailVerified: transferred.firebaseUser?.emailVerified ?? true,
        createdAt: transferred.user.createdAt,
        updatedAt: transferred.user.updatedAt,
        connectedEmails: transferred.user.connectedEmails as AuthUser['connectedEmails'],
      };

      // Set user synchronously so the first render is authenticated
      void this.authManager.setUser(authUser);

      if (transferred.firebaseUser) {
        this.authManager.setFirebaseUser({
          uid: transferred.firebaseUser.uid,
          email: transferred.firebaseUser.email,
          displayName: transferred.firebaseUser.displayName,
          photoURL: transferred.firebaseUser.photoURL,
          emailVerified: transferred.firebaseUser.emailVerified,
          metadata: transferred.firebaseUser.metadata,
          providerData: transferred.firebaseUser.providerData,
        });
      }

      this.authManager.setLoading(false);
      this.authManager.setInitialized(true);
      this._isAuthReady.set(true); // TransferState user — trust the server's auth check

      this.logger.info('Auth state hydrated from TransferState', {
        uid: authUser.uid,
        hasCompletedOnboarding: authUser.hasCompletedOnboarding,
      });
    }

    // Initialize manager and Firebase Auth
    if (this.platform.isBrowser()) {
      this.initializeOnBrowser();
    } else if (!transferred.user) {
      // Server can't see browser IndexedDB — "no cookie" ≠ "no user".
      // Leave isAuthReady=false so SSR renders a neutral state (no Sign In flash).
      // The client resolves the real auth state from Firebase after hydration.
      this.authManager.setLoading(false);
      this.authManager.setInitialized(true);
    }
  }

  /**
   * Lazy-load Firebase Auth on browser only
   * This prevents @angular/fire module from initializing on the server
   */
  private async initializeOnBrowser(): Promise<void> {
    // Force initialization after 5 seconds to prevent infinite loading
    const forceInitTimeout = setTimeout(() => {
      if (!this.authManager.getState().isInitialized) {
        this.logger.warn('Force initializing after timeout');
        this.authManager.setLoading(false);
        this.authManager.setInitialized(true);
      }
      if (!this._isAuthReady()) {
        this.logger.warn('Force auth ready after timeout');
        this._isAuthReady.set(true);
      }
    }, 5000);

    try {
      // Initialize from storage (restore persisted state)
      await this.authManager.initialize();

      // If localStorage had a valid user, trust it immediately.
      // This prevents a blank/loading state when we already know the user is authenticated.
      // Firebase will confirm (or invalidate) shortly via authState().
      if (this.authManager.getState().user) {
        this._isAuthReady.set(true);
      }

      // Dynamically import the Auth token and inject it
      const { Auth } = await import('@angular/fire/auth');
      this.firebaseAuth = this.injector.get(Auth, null);

      if (this.firebaseAuth) {
        await this.initAuthStateListener();
      } else {
        this.authManager.setLoading(false);
        this.authManager.setInitialized(true);
        this._isAuthReady.set(true);
      }
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Auth', err);
      this.authManager.setLoading(false);
      this.authManager.setInitialized(true);
      this._isAuthReady.set(true);
    } finally {
      clearTimeout(forceInitTimeout);
    }
  }

  /**
   * Initialize Firebase auth state listener
   * Syncs Firebase user with backend user profile
   *
   * Uses AngularFire's authState observable which is zone-aware
   * and properly handles injection context.
   */
  private async initAuthStateListener(): Promise<void> {
    if (!this.firebaseAuth) return;

    // Dynamically import authState (the zone-aware observable)
    const { authState } = await import('@angular/fire/auth');

    // CRITICAL: Use runInInjectionContext to maintain Angular's injection context
    // This prevents the "Firebase API called outside injection context" warning
    runInInjectionContext(this.injector, () => {
      this.authStateSubscription = authState(this.firebaseAuth!).subscribe(async (firebaseUser) => {
        // If we already have a user perfectly setup (SSR hydration), don't show loading spinner
        // just to sync the token under the hood. Avoid the flash!
        const isAlreadyHydrated = this._state().user !== null && this._state().isInitialized;
        if (!isAlreadyHydrated) {
          this.authManager.setLoading(true);
        }

        try {
          if (firebaseUser) {
            // Mark Firebase as having resolved at least once with a real user.
            // Used below to distinguish genuine sign-out from initial null emission.
            this._firebaseAuthResolved = true;

            // Set Firebase user info in manager
            this.authManager.setFirebaseUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              emailVerified: firebaseUser.emailVerified,
              metadata: {
                creationTime: firebaseUser.metadata?.creationTime,
                lastSignInTime: firebaseUser.metadata?.lastSignInTime,
              },
              providerData: (firebaseUser.providerData ?? []).map((provider) => ({
                providerId: provider.providerId,
              })),
            });

            // Store token for API calls
            const token = await firebaseUser.getIdToken();
            await this.authManager.setToken({
              token,
              expiresAt: Date.now() + 55 * 60 * 1000, // ~55 min
              userId: firebaseUser.uid,
            });

            // Skip sync if signup is in progress - the signup method will handle it
            // after creating the backend user to avoid race conditions
            if (this.authManager.isSignupInProgress()) {
              this.logger.debug('Signup in progress, skipping auth state sync');
              return;
            }

            // User is signed in - sync profile (state only, no navigation side-effects)
            await this.syncUserProfile(firebaseUser);
            this.authManager.setLoading(false);
            this.authManager.setInitialized(true);
            this._isAuthReady.set(true);

            // State sync complete. Navigation is the responsibility of the explicit
            // sign-in/OAuth methods (signInWithEmail, processGoogleAuthResult, etc.)
            // which call navigateRoot/navigateForward after a successful auth flow.
            // This listener must NEVER navigate — doing so causes spurious redirects
            // when a 401 sends the user to /auth while their Firebase session is still valid:
            //   401 → /auth → Firebase still valid → listener fires → isOnAuthPage=true → /agent
            // This matches the mobile pattern (setupFirebaseAuthSync is a one-time check, not reactive).
            this.logger.info('User authenticated (state synced)', {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              hasCompletedOnboarding: this.hasCompletedOnboarding(),
            });
          } else {
            // Firebase emits null in two situations:
            // 1. Initial emission before it resolves the session from the cookie (not a real sign-out)
            // 2. Genuine sign-out after a user was previously confirmed
            // Only reset state for case 2 — if Firebase has already confirmed a user in this
            // session, OR if there is no SSR-hydrated user to protect.
            const isHydrated = this._state().user !== null && this._state().isInitialized;
            if (!this._firebaseAuthResolved && isHydrated) {
              this.logger.debug(
                'Skipping initial Firebase null emission — keeping SSR-hydrated user'
              );

              // Safety net: if Firebase never resolves a real user within 10s,
              // the SSR-hydrated state is stale — clear it and show signed-out state.
              setTimeout(async () => {
                if (!this._firebaseAuthResolved) {
                  this.logger.warn(
                    'Firebase auth never resolved after SSR hydration — clearing stale auth state'
                  );
                  this.authCookie.clearAuthCookie();
                  await this.authManager.reset();
                  this.authManager.setInitialized(true);
                  this._isAuthReady.set(true);
                }
              }, 10_000);
              return;
            }

            // User is signed out - reset state
            await this.authManager.reset();
            // Make sure we mark as initialized even when no user
            this.authManager.setInitialized(true);
            this.authManager.setLoading(false);
            this._isAuthReady.set(true);
          }
        } catch (err) {
          this.logger.error('Auth state sync failed', err);
          this.authManager.setError(err instanceof Error ? err.message : 'Authentication error');
          this.authManager.setLoading(false);
          this.authManager.setInitialized(true);
          this._isAuthReady.set(true);
        }
      });
    });
  }

  /**
   * Sync user profile from Firebase user and set analytics identity
   *
   * SINGLE RESPONSIBILITY: This method ONLY syncs profile to local state.
   * It does NOT create users - that's the job of signup methods.
   *
   * This method:
   * 1. Fetches user profile from backend API
   * 2. Maps backend profile to AuthUser
   * 3. Sets analytics user ID and properties
   *
   * If profile fetch fails, uses Firebase data with safe defaults.
   * This matches the mobile pattern for consistency across platforms.
   *
   * @param firebaseUser Firebase user object
   * @param throwOnNotFound If true, throws error when backend user not found (for OAuth flows that need to detect new users)
   */
  private async syncUserProfile(
    firebaseUser: FirebaseUser,
    throwOnNotFound = false,
    forceFresh = false
  ): Promise<void> {
    try {
      // Fetch profile from backend (with caching)
      let backendProfile: CachedUserProfile | null = null;

      try {
        // Use globalAuthUserCache for efficient caching
        // Map User type to CachedUserProfile (id -> uid)
        backendProfile = await globalAuthUserCache.getOrFetch(firebaseUser.uid, async () => {
          const user = await this.authApi.getUserProfile(firebaseUser.uid, {
            noCache: forceFresh,
          });
          return mapBackendProfileToCachedUserProfile(user);
        });
        this.logger.debug('Backend profile fetched (cached)', {
          uid: firebaseUser.uid,
          onboardingCompleted: backendProfile?.onboardingCompleted,
          completeSignUp: backendProfile?.completeSignUp,
          cacheStats: globalAuthUserCache.getStats(),
        });
      } catch (err) {
        this.logger.warn('Failed to fetch backend profile', { error: err });

        // CRITICAL FIX: Try to get cached profile even on error
        // This prevents redirecting to onboarding when backend is temporarily unavailable
        const cachedProfile = await globalAuthUserCache.get(firebaseUser.uid);
        if (cachedProfile) {
          this.logger.info('Using cached profile after backend failure', {
            uid: firebaseUser.uid,
            onboardingCompleted: cachedProfile.onboardingCompleted,
          });
          backendProfile = cachedProfile;
        } else {
          // Also check if current user state already has onboarding completed
          // This preserves state across page reloads when backend is down
          const currentUser = this.user();
          if (currentUser?.hasCompletedOnboarding) {
            this.logger.info('Preserving existing onboarding status from state', {
              uid: firebaseUser.uid,
              hasCompletedOnboarding: currentUser.hasCompletedOnboarding,
            });
            // Create minimal profile to preserve onboarding status
            backendProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email ?? '',
              firstName: currentUser.displayName?.split(' ')[0] ?? '',
              lastName: currentUser.displayName?.split(' ').slice(1).join(' ') ?? '',
              displayName: currentUser.displayName ?? 'User',
              role: currentUser.role ?? null,
              onboardingCompleted: true, // Preserve the completed status
              completeSignUp: true,
              profileImg: currentUser.profileImg ?? null,
              sports: [],
            };
          }
        }

        // If caller needs to know about missing profile (OAuth new user detection), throw
        if (throwOnNotFound && !backendProfile) {
          throw new Error(`Backend user not found for uid: ${firebaseUser.uid}`, {
            cause: err,
          });
        }
        // Otherwise continue with null profile - use Firebase data with defaults
      }

      // Use onboardingCompletedAt (never set by migration) as the reliable completion signal.
      // Migration always sets onboardingCompleted: true, so we cannot rely on that field.
      // legacyOnboardingCompleted is set when a legacy user completes the 3-step intro.
      const hasCompletedOnboarding =
        !!backendProfile?.onboardingCompletedAt ||
        backendProfile?.legacyOnboardingCompleted === true;

      this.logger.debug('Onboarding status determined', { hasCompletedOnboarding });

      // Build AuthUser from Firebase + backend data
      // Build display name: prefer backend-sourced firstName/lastName over
      // Firebase displayName (which may be a third-party name from Google/Apple)
      const backendDisplayName = [backendProfile?.firstName, backendProfile?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();

      const authUser: AuthUser = {
        ...(backendProfile ?? {}),
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        displayName: backendDisplayName || firebaseUser.displayName || 'User',
        profileImg: backendProfile?.profileImg ?? undefined,
        role: this.getUserRole(
          backendProfile
            ? {
                role: backendProfile.role as UserRole | null | undefined,
              }
            : null
        ),
        // Premium status — metered billing only, no plan tiers
        hasCompletedOnboarding,
        _legacyId: backendProfile?._legacyId,
        legacyOnboardingCompleted: backendProfile?.legacyOnboardingCompleted,
        provider: this.getProviderFromFirebase(firebaseUser),
        emailVerified: firebaseUser.emailVerified,
        createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        connectedSources: Array.isArray(backendProfile?.['connectedSources'])
          ? [...(backendProfile['connectedSources'] as ConnectedSource[])]
          : undefined,
      };

      await this.authManager.setUser(authUser);

      // Set analytics identity
      this.analytics.setUserId(authUser.uid);
      this.analytics.setUserProperties({
        user_type: authUser.role,

        auth_provider: authUser.provider,
      });

      // Set crashlytics user context for crash attribution
      const crashUser: CrashUser = {
        userId: authUser.uid,
        email: authUser.email,
        displayName: authUser.displayName,
      };
      await this.crashlytics.setUser(crashUser);
      await this.crashlytics.setCustomKeys({
        user_role: authUser.role,

        auth_provider: authUser.provider,
      });

      this.logger.info('User state synced', {
        uid: authUser.uid,
        hasCompletedOnboarding: authUser.hasCompletedOnboarding,
      });
    } catch (err) {
      this.logger.error('Failed to sync user profile', err);
      // Re-throw if caller needs to handle it
      throw err;
    }
  }

  /**
   * Get auth provider from Firebase user
   */
  private getProviderFromFirebase(
    user: FirebaseUser
  ): 'email' | 'google' | 'apple' | 'microsoft' | 'anonymous' {
    const providerId = user.providerData[0]?.providerId;
    switch (providerId) {
      case 'google.com':
        return 'google';
      case 'apple.com':
        return 'apple';
      case 'microsoft.com':
        return 'microsoft';
      case 'password':
        return 'email';
      default:
        return user.isAnonymous ? 'anonymous' : 'email';
    }
  }

  /**
   * Get user role from V2 model with legacy fallback
   * @param user - User profile (V2 or legacy format)
   * @returns UserRole - The determined user role
   */
  private getUserRole(
    user: {
      role?: string | null;
    } | null
  ): UserRole {
    return user?.role ? normalizeRole(user.role) : 'athlete';
  }

  // ============================================
  // SIGN IN METHODS
  // ============================================

  /**
   * Sign in with email and password
   *
   * Enterprise-grade authentication flow:
   * 1. Validates Firebase is available
   * 2. Sets loading state for UI feedback (with 300ms delay)
   * 3. Attempts Firebase authentication
   * 4. Tracks success/failure analytics
   * 5. Properly handles and displays errors
   */
  async signInWithEmail(credentials: SignInCredentials): Promise<boolean> {
    if (!this.firebaseAuth) {
      this.authManager.setError('Authentication not available. Please refresh and try again.');
      return false;
    }

    // Clear previous errors
    this.authManager.setError(null);

    return this.runWithDelayedLoading(
      'Signing in...',
      async () => {
        // Dynamic import for SSR safety
        const { signInWithEmailAndPassword } = await import('@angular/fire/auth');

        const result = await signInWithEmailAndPassword(
          this.firebaseAuth!,
          credentials.email,
          credentials.password
        );

        // Track successful sign in
        this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN, { method: AUTH_METHODS.EMAIL });
        this.analytics.setUserId(result.user.uid);

        // Auth state listener handles profile sync and navigation
        return true;
      },
      (err) => {
        this.logger.error('Sign in failed', err);

        // Use centralized auth error handler
        const handledError = this.authErrorHandler.handle(err);

        // Track error for analytics
        this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
          method: AUTH_METHODS.EMAIL,
          error_code: handledError.code,
          recovery_action: handledError.recovery?.type,
        });

        // Set user-friendly error message
        this.authManager.setError(handledError.message);
        return false;
      }
    );
  }

  // ============================================
  // OAUTH HELPERS
  // ============================================

  /**
   * Process Microsoft authentication result (both popup and redirect)
   */
  private async processMicrosoftAuthResult(
    result: {
      user: FirebaseUser;
      _tokenResponse?: { isNewUser?: boolean };
    },
    teamCode?: string,
    referralId?: string
  ): Promise<boolean> {
    // Check if this is a new user (Firebase detection can be unreliable)
    const isNewUser = result._tokenResponse?.isNewUser ?? false;

    this.logger.debug('🔍 Firebase detected isNewUser (Microsoft)', { isNewUser });

    // Track analytics
    this.analytics.trackEvent(isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN, {
      method: AUTH_METHODS.MICROSOFT,
    });
    this.analytics.setUserId(result.user.uid);
    this.analytics.setUserProperties({ user_type: this.user()?.role });

    // Set flag to prevent auth state listener from racing with user setup (via core state manager)
    this.authManager.setSignupInProgress(true);

    // Store token BEFORE any API calls so the auth interceptor can attach it
    const __dbgMsInnerT0 = performance.now();
    await this.storeTokenFromUser(result.user);
    this.logger.info(
      `⏱️ [DEBUG] Microsoft processMicrosoftAuthResult: storeToken took ${(performance.now() - __dbgMsInnerT0).toFixed(0)}ms`
    );

    try {
      // ALWAYS try to sync existing user first (Firebase isNewUser can be unreliable)
      const __dbgMsSyncStart = performance.now();
      this.logger.info('⏱️ [DEBUG] Microsoft: syncing existing user profile...');
      await this.syncUserProfile(result.user, true);
      this.logger.info(
        `⏱️ [DEBUG] Microsoft: syncUserProfile took ${(performance.now() - __dbgMsSyncStart).toFixed(0)}ms`
      );

      // Check if user needs onboarding
      const currentUser = this.user();
      const needsOnboarding = !currentUser?.hasCompletedOnboarding;

      const __dbgMsNavStart = performance.now();
      if (needsOnboarding) {
        if (currentUser?._legacyId) {
          this.logger.info('🚀 Legacy user: navigating directly to congratulations (Microsoft)');
          await this.navigateForward('/auth/onboarding/congratulations');
        } else {
          this.logger.info('🚀 Navigating to onboarding (existing user, incomplete) (Microsoft)');
          await this.navigateForward(AUTH_ROUTES.ONBOARDING);
        }
      } else {
        this.logger.info('🏠 User already completed onboarding, navigating to /home (Microsoft)');
        await this.navigateRoot(AUTH_REDIRECTS.DEFAULT);
      }
      this.logger.info(
        `⏱️ [DEBUG] Microsoft: navigation took ${(performance.now() - __dbgMsNavStart).toFixed(0)}ms`
      );
    } catch (syncError: unknown) {
      const errorObj = syncError as { message?: string };
      this.logger.warn('❌ User sync failed, attempting to create new user (Microsoft)', {
        error: errorObj?.message,
      });

      try {
        // User doesn't exist in backend, create new user
        const __dbgMsCreateStart = performance.now();
        this.logger.info('⏱️ [DEBUG] Microsoft: creating new backend user...');
        const createResult = await this.authApi.createUser({
          uid: result.user.uid,
          email: result.user.email!,
          teamCode: teamCode || undefined,
          referralId: referralId || undefined,
        });
        this.logger.info(
          `⏱️ [DEBUG] Microsoft: createUser took ${(performance.now() - __dbgMsCreateStart).toFixed(0)}ms`
        );

        this.logger.info('✅ New user created successfully (Microsoft)', { createResult });

        // Sync the newly created user to local state
        const __dbgMsSync2Start = performance.now();
        await this.syncUserProfile(result.user);
        this.logger.info(
          `⏱️ [DEBUG] Microsoft: post-create syncUserProfile took ${(performance.now() - __dbgMsSync2Start).toFixed(0)}ms`
        );

        // Navigate to onboarding for new users
        this.logger.info('🚀 Navigating to onboarding (new user) (Microsoft)');
        await this.navigateForward(AUTH_ROUTES.ONBOARDING);
      } catch (createError: unknown) {
        this.logger.error('❌ Failed to create new user (Microsoft)', createError);
        throw createError; // Re-throw to be handled by outer catch
      }
    } finally {
      // Always clear flag to prevent state leaks (via core state manager)
      this.authManager.setSignupInProgress(false);
    }

    return true;
  }

  /**
   * Centralized OAuth error handling with specific Firebase service error detection
   */
  private handleOAuthError(err: unknown, provider: string): string {
    const authErr = err as { code?: string; message?: string };
    // Check for specific Firebase service unavailable errors
    const isServiceUnavailable =
      authErr?.code === 'auth/error-code:-47' ||
      authErr?.code === 'auth/internal-error' ||
      authErr?.message?.includes('503') ||
      authErr?.message?.includes('Service Unavailable');

    if (isServiceUnavailable) {
      return `${provider} sign-in service is temporarily unavailable due to Firebase server issues (Error -47). This usually resolves within 5-10 minutes. Please try again later or use an alternative sign-in method.`;
    } else if (authErr?.code === 'auth/popup-closed-by-user') {
      return 'Sign-in was cancelled. Please try again.';
    } else if (authErr?.code === 'auth/popup-blocked') {
      return 'Pop-up was blocked by your browser. Please allow pop-ups and try again.';
    } else {
      // Use centralized auth error handler for other errors
      const handledError = this.authErrorHandler.handle(err);
      return handledError.message;
    }
  }

  /**
   * Accept a pending invite at the end of onboarding with the selected role.
   *
   * Reads the referral code stored in sessionStorage by the /join/:code route,
   * calls POST /invite/accept, and clears storage regardless of outcome.
   * Failures are logged but do not block the onboarding completion flow.
   * @param roleOverride - Role selected by user during onboarding (overrides stored role)
   */
  async acceptPendingInvite(roleOverride?: string): Promise<void> {
    if (!this.platform.isBrowser) return;

    try {
      const raw = sessionStorage.getItem(PENDING_REFERRAL_KEY);
      if (!raw) return;

      const referral = JSON.parse(raw) as PendingReferral;
      if (!referral.code) return;

      this.logger.info('Accepting pending invite', {
        code: referral.code,
        teamCode: referral.teamCode,
        role: referral.role,
        inviterUid: referral.inviterUid,
      });
      // Pass inviterUid so backend can track referral even for team invites
      // isNewUser=true signals backend to credit the $5 referral reward (Flow B only)
      await this.inviteApi.acceptInvite(
        referral.code,
        referral.teamCode,
        roleOverride ?? referral.role,
        referral.inviterUid,
        true
      );
      this.logger.info('Invite accepted successfully', { code: referral.code });

      // Signal onboarding to skip the team-selection step
      sessionStorage.setItem(INVITE_TEAM_JOINED_KEY, 'true');
    } catch (err) {
      // Non-blocking — invite acceptance failure should not break signup
      this.logger.warn('Failed to accept pending invite', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      try {
        sessionStorage.removeItem(PENDING_REFERRAL_KEY);
      } catch {
        // Ignore
      }
    }
  }

  // ============================================
  // OAUTH AUTHENTICATION
  // ============================================

  /**
   * Sign in with Google with improved error handling
   * Supports optional team code for new user registration
   */
  async signInWithGoogle(options?: OAuthOptions): Promise<boolean> {
    const teamCode = options?.teamCode;
    const referralId = options?.referralId;
    if (!this.firebaseAuth) {
      this.authManager.setError('Authentication not available');
      return false;
    }

    this.authManager.setError(null);

    // ⏱️ DEBUG: Total social login timing
    const __dbgT0 = performance.now();
    this.logger.info('🎯 [DEBUG] Starting Google OAuth (popup)', { ts: __dbgT0.toFixed(0) });

    try {
      // Dynamic imports for SSR safety
      const { GoogleAuthProvider, signInWithPopup } = await import('@angular/fire/auth');

      const provider = new GoogleAuthProvider();
      for (const scope of GOOGLE_OAUTH_SCOPES) {
        provider.addScope(scope);
      }

      // CRITICAL: Request offline access to get refresh token
      provider.setCustomParameters({
        access_type: 'offline',
        prompt: 'consent', // Force consent screen to ensure refresh token
      });

      // ⏱️ DEBUG: Time the popup (user picks account)
      const __dbgPopupStart = performance.now();
      this.logger.info('⏱️ [DEBUG] Google popup opening...');
      // UX boundary: popup/account selection happens here without loading state.
      const result = await signInWithPopup(this.firebaseAuth, provider);
      const __dbgPopupMs = performance.now() - __dbgPopupStart;
      this.logger.info(`⏱️ [DEBUG] Google popup resolved in ${__dbgPopupMs.toFixed(0)}ms`, {
        uid: result.user.uid,
      });

      return this.runWithLoading(
        async () => {
          // Check if this is a new user (Firebase detection can be unreliable)
          // @ts-expect-error additionalUserInfo is on the result
          const isNewUser = result._tokenResponse?.isNewUser ?? false;

          this.logger.debug('🔍 Firebase detected isNewUser', { isNewUser });

          // Track analytics
          this.analytics.trackEvent(
            isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN,
            {
              method: AUTH_METHODS.GOOGLE,
            }
          );
          this.analytics.setUserId(result.user.uid);
          this.analytics.setUserProperties({ user_type: this.user()?.role });

          // Set flag to prevent auth state listener from racing with user setup (via core state manager)
          this.authManager.setSignupInProgress(true);

          // Store token BEFORE any API calls so the auth interceptor can attach it
          await this.storeTokenFromUser(result.user);

          let isNewlyCreated = false;

          try {
            const persistedUser = this.authManager.getState().user;
            const canNavigateOptimistically =
              !isNewUser &&
              persistedUser?.uid === result.user.uid &&
              persistedUser?.hasCompletedOnboarding === true &&
              // Force a full sync for legacy users — their cached hasCompletedOnboarding
              // may be stale (old code derived it from onboardingCompleted which migration
              // always sets to true). Only skip sync once legacyOnboardingCompleted is set.
              !(persistedUser?._legacyId && !persistedUser?.legacyOnboardingCompleted);

            if (canNavigateOptimistically) {
              const __dbgNavStart = performance.now();
              this.logger.info(
                '🏠 [OPTIMISTIC] User already completed onboarding, navigating to /home immediately'
              );
              await this.navigateRoot(AUTH_REDIRECTS.DEFAULT);
              this.logger.info(
                `⏱️ [DEBUG] Google: navigation took ${(performance.now() - __dbgNavStart).toFixed(0)}ms`
              );
              this.logger.info(
                `⏱️ [DEBUG] Google: TOTAL sign-in time ${(performance.now() - __dbgT0).toFixed(0)}ms (excludes user interaction with popup)`
              );

              // Sync profile in background — signals update reactively so the app sees
              // fresh data as soon as it arrives without blocking the user
              void this.syncUserProfile(result.user, true)
                .then(() => {
                  this.logger.info('⏱️ [DEBUG] Google: background syncUserProfile complete');
                  const user = this.user();
                  if (user) {
                    this.analytics.setUserProperties({
                      user_type: user.role,
                      auth_provider: AUTH_METHODS.GOOGLE,
                    });
                  }
                })
                .catch((err: unknown) => {
                  this.logger.warn('Google background profile sync failed', {
                    error: err instanceof Error ? err.message : String(err),
                  });
                });

              return true;
            }

            try {
              // ⏱️ DEBUG: Time backend profile sync
              const __dbgSyncStart = performance.now();
              this.logger.info('⏱️ [DEBUG] Google: syncing existing user profile...');
              await this.syncUserProfile(result.user, true);
              this.logger.info(
                `⏱️ [DEBUG] Google: syncUserProfile took ${(performance.now() - __dbgSyncStart).toFixed(0)}ms`
              );
            } catch (syncError: unknown) {
              const errorObj = syncError as { message?: string };
              this.logger.warn('❌ User sync failed, attempting to create new user', {
                error: errorObj?.message,
              });

              // ⏱️ DEBUG: Time new user creation
              const __dbgCreateStart = performance.now();
              this.logger.info('⏱️ [DEBUG] Google: creating new backend user...');
              const createResult = await this.authApi.createUser({
                uid: result.user.uid,
                email: result.user.email!,
                teamCode: teamCode || undefined,
                referralId: referralId || undefined,
              });
              this.logger.info(
                `⏱️ [DEBUG] Google: createUser took ${(performance.now() - __dbgCreateStart).toFixed(0)}ms`
              );

              if (createResult.success) {
                this.logger.info('✅ New user created successfully (OAuth)');
                isNewlyCreated = true;
              } else {
                this.logger.warn(
                  '⚠️ createUser returned failure, user already exists — retrying sync',
                  {
                    code: (createResult as { error?: { code?: string } }).error?.code,
                  }
                );
              }

              // ⏱️ DEBUG: Time second sync after create
              const __dbgSync2Start = performance.now();
              this.logger.info('⏱️ [DEBUG] Google: syncing profile after create...');
              await this.syncUserProfile(result.user);
              this.logger.info(
                `⏱️ [DEBUG] Google: post-create syncUserProfile took ${(performance.now() - __dbgSync2Start).toFixed(0)}ms`
              );
            }

            // Refresh token capture: the `beforeUserCreate` blocking Cloud Function
            // captures the Google refresh token (offline access was requested on the
            // provider above) and writes it to Users/{uid}/oauthTokens/google during
            // account creation. No post-signup popup or backend token exchange is
            // required here — a second popup would force another Google consent and
            // double-write to the legacy emailTokens collection.
            if (isNewUser || isNewlyCreated) {
              this.logger.info(
                'New Google account — refresh token persisted by beforeUserCreate Cloud Function',
                { uid: result.user.uid }
              );
            }

            // Step 2: Navigate — outside the sync/create try/catch so nav errors propagate cleanly
            const currentUser = this.user();
            const needsOnboarding = isNewlyCreated || !currentUser?.hasCompletedOnboarding;

            // ⏱️ DEBUG: Time navigation
            const __dbgNavStart = performance.now();
            if (needsOnboarding) {
              if (!isNewlyCreated && currentUser?._legacyId) {
                this.logger.info('🚀 Legacy user: navigating directly to congratulations (Google)');
                await this.navigateForward('/auth/onboarding/congratulations');
              } else {
                this.logger.info(
                  `🚀 Navigating to onboarding (${isNewlyCreated ? 'new user' : 'existing user, incomplete'})`
                );
                await this.navigateForward(AUTH_ROUTES.ONBOARDING);
              }
            } else {
              this.logger.info('🏠 User already completed onboarding, navigating to /home');
              await this.navigateRoot(AUTH_REDIRECTS.DEFAULT);
            }
            this.logger.info(
              `⏱️ [DEBUG] Google: navigation took ${(performance.now() - __dbgNavStart).toFixed(0)}ms`
            );
            this.logger.info(
              `⏱️ [DEBUG] Google: TOTAL sign-in time ${(performance.now() - __dbgT0).toFixed(0)}ms (excludes user interaction with popup)`
            );

            return true;
          } finally {
            // Always clear flag to prevent state leaks (via core state manager)
            this.authManager.setSignupInProgress(false);
          }
        },
        (err: unknown) => {
          const authErr = err as { code?: string; message?: string; customData?: unknown };
          this.logger.error('Google OAuth failed', err, {
            code: authErr?.code,
            message: authErr?.message,
            customData: authErr?.customData,
          });

          // Check for specific Firebase service unavailable errors
          const isServiceUnavailable =
            authErr?.code === 'auth/error-code:-47' ||
            authErr?.code === 'auth/internal-error' ||
            authErr?.message?.includes('503') ||
            authErr?.message?.includes('Service Unavailable');

          let errorMessage: string;

          if (isServiceUnavailable) {
            errorMessage =
              'Google sign-in service is temporarily unavailable due to Firebase server issues (Error -47). This usually resolves within 5-10 minutes. Please try again later or use Microsoft/Email sign-in as an alternative.';
          } else if (authErr?.code === 'auth/popup-closed-by-user') {
            errorMessage = 'Sign-in was cancelled. Please try again.';
          } else if (authErr?.code === 'auth/popup-blocked') {
            errorMessage =
              'Pop-up was blocked by your browser. Please allow pop-ups and try again.';
          } else {
            // Use centralized auth error handler for other errors
            const handledError = this.authErrorHandler.handle(err);
            errorMessage = handledError.message;
          }

          this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
            method: AUTH_METHODS.GOOGLE,
            error_code: authErr?.code || 'unknown',
            recovery_action: isServiceUnavailable ? 'retry_later' : 'unknown',
          });

          this.authManager.setError(errorMessage);
          return false;
        }
      );
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string; customData?: unknown };
      this.logger.error('Google OAuth failed', err, {
        code: authErr?.code,
        message: authErr?.message,
        customData: authErr?.customData,
      });

      // Check for specific Firebase service unavailable errors
      const isServiceUnavailable =
        authErr?.code === 'auth/error-code:-47' ||
        authErr?.code === 'auth/internal-error' ||
        authErr?.message?.includes('503') ||
        authErr?.message?.includes('Service Unavailable');

      let errorMessage: string;

      if (isServiceUnavailable) {
        errorMessage =
          'Google sign-in service is temporarily unavailable due to Firebase server issues (Error -47). This usually resolves within 5-10 minutes. Please try again later or use Microsoft/Email sign-in as an alternative.';
      } else if (authErr?.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in was cancelled. Please try again.';
      } else if (authErr?.code === 'auth/popup-blocked') {
        errorMessage = 'Pop-up was blocked by your browser. Please allow pop-ups and try again.';
      } else {
        // Use centralized auth error handler for other errors
        const handledError = this.authErrorHandler.handle(err);
        errorMessage = handledError.message;
      }

      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
        method: AUTH_METHODS.GOOGLE,
        error_code: authErr?.code || 'unknown',
        recovery_action: isServiceUnavailable ? 'retry_later' : 'unknown',
      });

      this.authManager.setError(errorMessage);
      return false;
    }
  }

  /**
   * Sign in with Microsoft with improved error handling
   * Supports optional team code for new user registration
   */
  async signInWithMicrosoft(options?: OAuthOptions): Promise<boolean> {
    const teamCode = options?.teamCode;
    const referralId = options?.referralId;
    if (!this.firebaseAuth) {
      this.authManager.setError('Authentication not available');
      return false;
    }

    this.authManager.setError(null);

    try {
      // Dynamic imports for SSR safety
      const { OAuthProvider, signInWithPopup } = await import('@angular/fire/auth');

      // Microsoft OAuth Provider
      const provider = new OAuthProvider('microsoft.com');

      provider.setCustomParameters({
        prompt: 'consent', // Changed from 'select_account' to 'consent' to get refresh token
        // tenant: 'common',
      });

      // CRITICAL: Request offline access and mail scopes to get refresh token
      provider.addScope('offline_access'); // Required for refresh token
      provider.addScope('Mail.Send'); // Required for sending emails
      provider.addScope('Mail.Read'); // Required for reading emails
      provider.addScope('Calendars.ReadWrite'); // Required for calendar Agent X actions
      provider.addScope('Files.ReadWrite'); // Required for OneDrive Agent X actions

      this.logger.info('🚀 Starting Microsoft OAuth (popup)');
      // ⏱️ DEBUG: Total Microsoft sign-in timing
      const __dbgMsT0 = performance.now();

      // ⏱️ DEBUG: Time the popup (user picks account)
      const __dbgMsPopupStart = performance.now();
      this.logger.info('⏱️ [DEBUG] Microsoft popup opening...');
      // UX boundary: popup/account selection happens here without loading state.
      const result = await signInWithPopup(this.firebaseAuth, provider);
      const __dbgMsPopupMs = performance.now() - __dbgMsPopupStart;
      this.logger.info(`⏱️ [DEBUG] Microsoft popup resolved in ${__dbgMsPopupMs.toFixed(0)}ms`, {
        uid: result.user.uid,
      });

      return this.runWithLoading(
        async () => {
          // Extract the Microsoft access token from the credential
          const microsoftCredential = OAuthProvider.credentialFromResult(result);
          const popupAccessToken =
            microsoftCredential?.accessToken ??
            (result as { _tokenResponse?: { oauthAccessToken?: string } })._tokenResponse
              ?.oauthAccessToken ??
            null;

          this.logger.info('✅ Microsoft OAuth popup success', {
            uid: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName,
            hasAccessToken: !!popupAccessToken,
          });

          // ⏱️ DEBUG: Time the full auth result processing
          const __dbgMsProcessStart = performance.now();
          this.logger.info(
            '⏱️ [DEBUG] Microsoft: processing auth result (sync/create/navigate)...'
          );
          // Process result using helper method
          const success = await this.processMicrosoftAuthResult(result, teamCode, referralId);
          this.logger.info(
            `⏱️ [DEBUG] Microsoft: processMicrosoftAuthResult took ${(performance.now() - __dbgMsProcessStart).toFixed(0)}ms`
          );
          this.logger.info(
            `⏱️ [DEBUG] Microsoft: TOTAL sign-in time ${(performance.now() - __dbgMsT0).toFixed(0)}ms (excludes user interaction with popup)`
          );

          // Persist the access token to backend after successful auth
          if (success && popupAccessToken) {
            await this.persistMicrosoftAccessToken(popupAccessToken);
          } else if (success && !popupAccessToken) {
            this.logger.warn(
              'Microsoft OAuth completed without an access token for backend connect',
              {
                uid: result.user.uid,
              }
            );
          }

          return success;
        },
        (err: unknown) => {
          const authErr = err as { code?: string; message?: string; customData?: unknown };
          this.logger.error('Microsoft sign in failed', err, {
            code: authErr?.code,
            message: authErr?.message,
            customData: authErr?.customData,
          });

          const errorMessage = this.handleOAuthError(err, 'Microsoft');

          // this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
          //   method: AUTH_METHODS.MICROSOFT,
          //   error_code: err?.code || 'unknown',
          //   recovery_action: err?.code === 'auth/error-code:-47' ? 'retry_later' : 'unknown',
          // });

          this.authManager.setError(errorMessage);
          return false;
        }
      );
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string; customData?: unknown };
      this.logger.error('Microsoft sign in failed', err, {
        code: authErr?.code,
        message: authErr?.message,
        customData: authErr?.customData,
      });

      const errorMessage = this.handleOAuthError(err, 'Microsoft');

      // this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
      //   method: AUTH_METHODS.MICROSOFT,
      //   error_code: err?.code || 'unknown',
      //   recovery_action: err?.code === 'auth/error-code:-47' ? 'retry_later' : 'unknown',
      // });

      this.authManager.setError(errorMessage);
      return false;
    }
  }

  /**
   * Sign in with Apple with improved error handling
   * Supports optional team code for new user registration
   */
  async signInWithApple(options?: OAuthOptions): Promise<boolean> {
    const teamCode = options?.teamCode;
    const referralId = options?.referralId;
    if (!this.firebaseAuth) {
      this.authManager.setError('Authentication not available');
      return false;
    }

    this.authManager.setError(null);

    this.logger.info('🍎 Starting Apple OAuth (popup)');

    try {
      // Dynamic imports for SSR safety
      const { OAuthProvider, signInWithPopup } = await import('@angular/fire/auth');

      // Apple OAuth Provider
      const provider = new OAuthProvider('apple.com');
      // Request common scopes for Apple
      provider.addScope('email');
      provider.addScope('name');

      // UX boundary: popup/account selection happens here without loading state.
      const result = await signInWithPopup(this.firebaseAuth, provider);

      return this.runWithLoading(
        async () => {
          // Check if this is a new user (Firebase detection can be unreliable)
          // @ts-expect-error additionalUserInfo is on the result
          const isNewUser = result._tokenResponse?.isNewUser ?? false;

          this.logger.debug('🔍 Firebase detected isNewUser (Apple)', { isNewUser });

          // Track analytics
          this.analytics.trackEvent(
            isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN,
            {
              method: AUTH_METHODS.APPLE,
            }
          );
          this.analytics.setUserId(result.user.uid);
          this.analytics.setUserProperties({ user_type: this.user()?.role });

          // Set flag to prevent auth state listener from racing with user setup (via core state manager)
          this.authManager.setSignupInProgress(true);

          // Store token BEFORE any API calls so the auth interceptor can attach it
          await this.storeTokenFromUser(result.user);

          try {
            // ALWAYS try to sync existing user first (Firebase isNewUser can be unreliable)
            this.logger.debug('📡 Attempting to sync existing user profile (Apple)');
            await this.syncUserProfile(result.user);
            this.logger.info('✅ User profile sync successful - existing user (Apple)');

            // Check if user needs onboarding
            const currentUser = this.user();
            const needsOnboarding = !currentUser?.hasCompletedOnboarding;

            if (needsOnboarding) {
              if (currentUser?._legacyId) {
                this.logger.info('🚀 Legacy user: navigating directly to congratulations (Apple)');
                await this.navigateForward('/auth/onboarding/congratulations');
              } else {
                this.logger.info('🚀 Navigating to onboarding (existing user, incomplete) (Apple)');
                await this.navigateForward(AUTH_ROUTES.ONBOARDING);
              }
            } else {
              this.logger.info('🏠 User already completed onboarding, navigating to /home (Apple)');
              await this.navigateRoot(AUTH_REDIRECTS.DEFAULT);
            }
          } catch (syncError: unknown) {
            const errorObj = syncError as { message?: string };
            this.logger.warn('❌ User sync failed, attempting to create new user (Apple)', {
              error: errorObj?.message,
            });

            try {
              // User doesn't exist in backend, create new user
              this.logger.debug('📝 Creating new user via Apple OAuth', {
                uid: result.user.uid,
                email: result.user.email!,
                teamCode: teamCode || 'none',
                referralId: referralId || 'none',
              });

              const createResult = await this.authApi.createUser({
                uid: result.user.uid,
                email: result.user.email!,
                teamCode: teamCode || undefined,
                referralId: referralId || undefined,
              });

              this.logger.info('✅ New user created successfully (Apple)', { createResult });

              // Sync the newly created user to local state
              await this.syncUserProfile(result.user);

              // Navigate to onboarding for new users
              this.logger.info('🚀 Navigating to onboarding (new user) (Apple)');
              await this.navigateForward(AUTH_ROUTES.ONBOARDING);
            } catch (createError: unknown) {
              this.logger.error('❌ Failed to create new user (Apple)', createError);
              throw createError; // Re-throw to be handled by outer catch
            }
          } finally {
            // Always clear flag to prevent state leaks (via core state manager)
            this.authManager.setSignupInProgress(false);
          }

          return true;
        },
        (err: unknown) => {
          const authErr = err as { code?: string; message?: string; customData?: unknown };
          this.logger.error('Apple sign in failed', err, {
            code: authErr?.code,
            message: authErr?.message,
            customData: authErr?.customData,
          });

          const errorMessage = this.handleOAuthError(err, 'Apple');

          this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
            method: AUTH_METHODS.APPLE,
            error_code: authErr?.code || 'unknown',
            recovery_action: authErr?.code === 'auth/error-code:-47' ? 'retry_later' : 'unknown',
          });

          this.authManager.setError(errorMessage);
          return false;
        }
      );
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string; customData?: unknown };
      this.logger.error('Apple sign in failed', err, {
        code: authErr?.code,
        message: authErr?.message,
        customData: authErr?.customData,
      });

      const errorMessage = this.handleOAuthError(err, 'Apple');

      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
        method: AUTH_METHODS.APPLE,
        error_code: authErr?.code || 'unknown',
        recovery_action: authErr?.code === 'auth/error-code:-47' ? 'retry_later' : 'unknown',
      });

      this.authManager.setError(errorMessage);
      return false;
    }
  }

  // ============================================
  // SIGN UP METHODS
  // ============================================

  /**
   * Sign up with email and password
   */
  async signUpWithEmail(credentials: SignUpCredentials): Promise<boolean> {
    if (!this.firebaseAuth) {
      this.authManager.setError('Authentication not available');
      return false;
    }

    // Set flag to prevent auth state listener from calling syncUserProfile
    // before we create the backend user (via core state manager)
    this.authManager.setSignupInProgress(true);
    this.authManager.setError(null);

    return this.runWithDelayedLoading(
      'Creating account...',
      async () => {
        // Dynamic import for SSR safety
        const { createUserWithEmailAndPassword } = await import('@angular/fire/auth');

        // Create Firebase user
        const result = await createUserWithEmailAndPassword(
          this.firebaseAuth!,
          credentials.email,
          credentials.password
        );

        try {
          // Create user in backend
          this.logger.debug('📝 Creating new user via Email signup', {
            uid: result.user.uid,
            email: credentials.email,
            teamCode: credentials.teamCode || 'none',
            referralId: credentials.referralId || 'none',
          });

          const createResult = await this.authApi.createUser({
            uid: result.user.uid,
            email: credentials.email,
            teamCode: credentials.teamCode,
            referralId: credentials.referralId,
          });

          this.logger.info('✅ Email signup user created', { createResult });

          if (!createResult.success) {
            throw new Error(
              'error' in createResult ? createResult.error.message : 'Failed to create user'
            );
          }

          // Track successful sign up
          this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, {
            method: AUTH_METHODS.EMAIL,
            team_code: credentials.teamCode,
            referral_source: credentials.referralId,
          });
          this.analytics.setUserId(result.user.uid);

          // Sync user state BEFORE navigating (required for onboarding page)
          await this.syncUserProfile(result.user);

          if (isEmailVerificationRequired()) {
            // Send verification email for email/password signups
            // OAuth users (Google/Apple/Microsoft) are pre-verified
            try {
              await this.sendVerificationEmail();
              this.logger.info('📧 Verification email sent after signup');
            } catch (verifyError: unknown) {
              this.logger.warn('Failed to send verification email', {
                error: verifyError instanceof Error ? verifyError.message : String(verifyError),
              });
              // Continue anyway - user can resend from verify page
            }

            // Navigate to email verification page (not onboarding yet)
            await this.navigateForward(AUTH_ROUTES.VERIFY_EMAIL);
          } else {
            this.logger.info('Skipping email verification in development mode');
            await this.navigateForward(AUTH_ROUTES.ONBOARDING);
          }
          return true;
        } finally {
          // Always clear flag to prevent state leaks (via core state manager)
          this.authManager.setSignupInProgress(false);
        }
      },
      (err) => {
        this.logger.error('Sign up failed', err);

        // Use centralized auth error handler
        const handledError = this.authErrorHandler.handle(err);

        this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNUP_ERROR, {
          method: AUTH_METHODS.EMAIL,
          error_code: handledError.code,
          recovery_action: handledError.recovery?.type,
        });
        this.authManager.setError(handledError.message);
        return false;
      }
    );
  }

  // ============================================
  // SIGN OUT
  // ============================================

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    if (!this.firebaseAuth) return;

    this.authManager.setLoading(true);

    try {
      // Dynamic import for SSR safety
      const { signOut } = await import('@angular/fire/auth');

      // Clear __session cookie FIRST so SSR won't re-hydrate as authenticated
      this.authCookie.clearAuthCookie();

      // Track sign out before clearing user
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_OUT);
      this.analytics.clearUser();

      // Clear crashlytics user context
      await this.crashlytics.clearUser();

      // Clear user profile cache
      await globalAuthUserCache.clear();

      await signOut(this.firebaseAuth);
      await this.authManager.reset();
      await this.navigateRoot(AUTH_ROUTES.ROOT);
    } catch (err) {
      this.logger.error('Sign out failed', err);
      this.authManager.setError('Failed to sign out');
    } finally {
      this.authManager.setLoading(false);
    }
  }

  // ============================================
  // PASSWORD RESET
  // ============================================

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string): Promise<boolean> {
    if (!this.firebaseAuth) {
      this.authManager.setError('Authentication not available');
      return false;
    }

    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      // Dynamic import for SSR safety
      const { sendPasswordResetEmail } = await import('@angular/fire/auth');

      await sendPasswordResetEmail(this.firebaseAuth, email);

      // Track password reset request
      this.analytics.trackEvent(APP_EVENTS.AUTH_PASSWORD_RESET, {
        success: true,
      });

      return true;
    } catch (err) {
      this.logger.error('Password reset failed', err);

      // Use centralized auth error handler
      const handledError = this.authErrorHandler.handle(err);

      this.analytics.trackEvent(APP_EVENTS.AUTH_PASSWORD_RESET, {
        success: false,
        error_code: handledError.code,
      });
      this.authManager.setError(handledError.message);
      return false;
    } finally {
      this.authManager.setLoading(false);
    }
  }

  // ============================================
  // EMAIL VERIFICATION
  // ============================================

  /**
   * Send email verification to current user
   *
   * Called after email/password signup to verify the user's email address.
   * Professional apps require email verification before accessing the app.
   *
   * @returns Promise<boolean> - true if email sent successfully
   */
  async sendVerificationEmail(): Promise<boolean> {
    if (!this.firebaseAuth?.currentUser) {
      this.logger.warn('Cannot send verification email - no current user');
      return false;
    }

    try {
      // Dynamic import for SSR safety
      const { sendEmailVerification } = await import('@angular/fire/auth');

      await sendEmailVerification(this.firebaseAuth.currentUser);

      this.analytics.trackEvent(APP_EVENTS.AUTH_VERIFICATION_EMAIL_SENT, {
        userId: this.firebaseAuth.currentUser.uid,
      });

      this.logger.info('Verification email sent', {
        email: this.firebaseAuth.currentUser.email,
      });

      return true;
    } catch (err) {
      this.logger.error('Failed to send verification email', err);
      throw err;
    }
  }

  /**
   * Check if current user's email is verified
   *
   * Reloads the Firebase user to get fresh emailVerified status.
   * Called periodically by the verify-email page to auto-detect verification.
   *
   * @returns Promise<boolean> - true if email is verified
   */
  async checkEmailVerified(): Promise<boolean> {
    if (!this.firebaseAuth?.currentUser) {
      return false;
    }

    try {
      // Dynamic import for SSR safety
      const { reload } = await import('@angular/fire/auth');

      // Reload user to get fresh data from Firebase
      await reload(this.firebaseAuth.currentUser);

      const isVerified = this.firebaseAuth.currentUser.emailVerified;

      if (isVerified) {
        // Update local state
        const currentUser = this._state().user;
        if (currentUser) {
          await this.authManager.setUser({
            ...currentUser,
            emailVerified: true,
          });
        }

        this.analytics.trackEvent(APP_EVENTS.AUTH_EMAIL_VERIFIED, {
          userId: this.firebaseAuth.currentUser.uid,
        });

        this.logger.info('Email verified successfully');
      }

      return isVerified;
    } catch (err) {
      this.logger.error('Failed to check email verification', err);
      return false;
    }
  }

  /**
   * Get current user's email address
   */
  getCurrentUserEmail(): string | null {
    return this.firebaseAuth?.currentUser?.email ?? this._state().user?.email ?? null;
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Clear current error
   */
  clearError(): void {
    this.authManager.setError(null);
  }

  private async persistMicrosoftAccessToken(accessToken: string): Promise<void> {
    const idToken = await this.getIdToken();

    if (!idToken) {
      this.logger.warn('Skipping Microsoft token persistence: no Firebase ID token');
      return;
    }

    try {
      const response = await fetch(`${environment.apiURL}/auth/microsoft/connect-mail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ accessToken }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        this.logger.warn('Backend Microsoft connect-mail call failed after OAuth sign-in', {
          status: response.status,
          errorText,
        });
        return;
      }

      this.logger.info('Persisted Microsoft access token after OAuth sign-in');
    } catch (err) {
      this.logger.warn('Failed to persist Microsoft access token after OAuth sign-in', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Get ID token for authenticated requests
   */
  async getIdToken(): Promise<string | null> {
    // First try to get from auth manager (cached)
    const storedToken = await this.authManager.getToken();
    if (storedToken && (await this.authManager.isTokenValid())) {
      return storedToken.token;
    }

    // If no valid cached token, get fresh from Firebase
    const firebaseUser = this._state().firebaseUser;
    if (!firebaseUser?.uid) return null;

    // Need to get fresh token from Firebase Auth
    if (this.firebaseAuth?.currentUser) {
      try {
        const freshToken = await this.firebaseAuth.currentUser.getIdToken();
        // Update stored token
        await this.authManager.setToken({
          token: freshToken,
          expiresAt: Date.now() + 55 * 60 * 1000,
          userId: firebaseUser.uid,
        });
        return freshToken;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Patch arbitrary fields onto the current auth user signal synchronously.
   *
   * Used for optimistic UI updates (e.g. the global sport/team switcher)
   * where we need the `user()` signal to reflect a change immediately,
   * before `refreshUserProfile()` completes its backend round-trip.
   * A no-op if there is no current user.
   */
  patchUser(patch: Partial<AuthUser>): void {
    const current = this.user();
    if (!current) return;
    const patched: AuthUser = { ...current, ...patch };
    // Fire-and-forget — authManager.setUser is async but we don't need to
    // await it here. The signal update propagates synchronously.
    void this.authManager.setUser(patched);
    void globalAuthUserCache.set(current.uid, patched as unknown as CachedUserProfile);
  }

  /**
   * Apply onboarding completion result directly to user state.
   *
   * Called immediately after POST /profile/onboarding succeeds so the user
   * state reflects the new role, name, and onboardingCompleted flag WITHOUT
   * needing a separate GET fetch (which can be lost to race conditions).
   */
  async applyOnboardingResult(result: {
    role?: string;
    firstName?: string;
    lastName?: string;
    onboardingCompleted?: boolean;
    primarySport?: string;
  }): Promise<void> {
    const current = this.user();
    if (!current) {
      this.logger.warn('applyOnboardingResult: no current user');
      return;
    }

    const displayName = [result.firstName, result.lastName].filter(Boolean).join(' ').trim();

    const patched: AuthUser = {
      ...current,
      role: (result.role as UserRole) || current.role,
      displayName: displayName || current.displayName,
      hasCompletedOnboarding: result.onboardingCompleted ?? current.hasCompletedOnboarding,
    };

    await this.authManager.setUser(patched);
    this.logger.info('Applied onboarding result to user state', {
      uid: current.uid,
      role: patched.role,
      displayName: patched.displayName,
      hasCompletedOnboarding: patched.hasCompletedOnboarding,
    });
  }

  async applyResolvedTeamIdentity(input: {
    teamCode: string;
    teamId?: string;
    slug?: string;
    teamName?: string;
    sport?: string;
    logoUrl?: string | null;
  }): Promise<void> {
    const current = this.user();
    if (!current?.uid || !input.teamCode.trim()) {
      return;
    }

    const existingTeamCode =
      current.teamCode && typeof current.teamCode === 'object' ? current.teamCode : null;
    const nextTeamCode = {
      teamCode: input.teamCode.trim(),
      teamId: input.teamId?.trim() || existingTeamCode?.teamId,
      slug: input.slug?.trim() || existingTeamCode?.slug,
      unicode: input.teamCode.trim(),
      teamName: input.teamName?.trim() || existingTeamCode?.teamName,
      sport: input.sport?.trim() || existingTeamCode?.sport || current.primarySport,
      logoUrl: input.logoUrl ?? existingTeamCode?.logoUrl ?? current.profileImg ?? null,
    };

    const alreadySynced =
      existingTeamCode?.teamCode === nextTeamCode.teamCode &&
      existingTeamCode?.slug === nextTeamCode.slug &&
      existingTeamCode?.teamName === nextTeamCode.teamName;
    if (alreadySynced) {
      return;
    }

    const mergedManagedTeamCodes = Array.from(
      new Set(
        [
          nextTeamCode.teamCode,
          ...(Array.isArray(current.managedTeamCodes) ? current.managedTeamCodes : []),
        ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      )
    );

    const patched: AuthUser = {
      ...current,
      teamCode: nextTeamCode,
      managedTeamCodes: mergedManagedTeamCodes,
    };

    await this.authManager.setUser(patched);
    await globalAuthUserCache.set(current.uid, patched as unknown as CachedUserProfile);

    this.logger.info('Applied resolved team identity to auth state', {
      uid: current.uid,
      teamCode: nextTeamCode.teamCode,
      slug: nextTeamCode.slug,
    });
  }

  /**
   * Mark a legacy-migrated user as having completed the intro welcome screen.
   *
   * Called once when a legacy user arrives at /agent-x for the first time.
   * Sets legacyOnboardingCompleted: true in Firestore (via the backend) and
   * patches the local auth state so hasCompletedOnboarding becomes true —
   * preventing the congratulations redirect on all future logins.
   *
   * Fire-and-forget safe: errors are logged but never rethrow.
   */
  async completeLegacyOnboarding(): Promise<void> {
    const user = this.user();
    if (!user?._legacyId || user.legacyOnboardingCompleted) {
      return; // Not a legacy user, or already marked done
    }

    this.logger.info('Marking legacy onboarding complete', { uid: user.uid });
    try {
      await this.authApi.saveOnboardingProfile(user.uid, { isLegacyOnboardingUpdate: true });
      // Patch local state immediately so the signal reflects the change
      this.patchUser({ legacyOnboardingCompleted: true, hasCompletedOnboarding: true });
      // Invalidate cache so the next cold-start fetches fresh data
      void globalAuthUserCache.invalidate(user.uid);
      this.logger.info('Legacy onboarding marked complete', { uid: user.uid });
    } catch (err) {
      this.logger.error('Failed to mark legacy onboarding complete', err, { uid: user.uid });
    }
  }

  /**
   * Force refresh user profile from backend (bypasses cache)
   * Call after completing onboarding to update hasCompletedOnboarding flag
   *
   * ⚠️ IMPORTANT: This invalidates the cache first to ensure fresh data
   */
  async refreshUserProfile(): Promise<void> {
    const currentUser = this.firebaseAuth?.currentUser;
    this.logger.debug('refreshUserProfile called', {
      hasFirebaseAuth: !!this.firebaseAuth,
      hasCurrentUser: !!currentUser,
      uid: currentUser?.uid,
    });

    if (currentUser) {
      const uid = currentUser.uid;
      // Invalidate cache to force fresh fetch from backend
      // This is critical after onboarding completion
      await globalAuthUserCache.invalidate(uid);
      await clearHttpCache('*auth/profile*');
      await this.syncUserProfile(currentUser, false, true);
    } else {
      this.logger.warn('refreshUserProfile: no Firebase currentUser — skipping GET fetch');
    }
  }

  /**
   * Upload profile photo via backend API
   *
   * ⭐ 2026 BEST PRACTICE: Backend-First Pattern ⭐
   * - Frontend validates and sends file to backend
   * - Backend handles Firebase Storage upload, optimization, thumbnails
   * - Backend returns CDN URL
   *
   * This ensures:
   * - Security: Frontend never has direct storage access
   * - Consistency: Same logic works on web and mobile
   * - Performance: Backend can optimize images
   *
   * @param file - Image file to upload
   * @param userId - User's Firebase UID
   * @returns Download URL of uploaded image
   */
  async uploadProfilePhoto(file: File, userId: string): Promise<string> {
    if (!this.platform.isBrowser()) {
      throw new Error('File upload only available in browser');
    }

    // Use FileUploadService (backend-first pattern)
    const fileUploadService = this.injector.get(FileUploadService);

    try {
      const result = await fileUploadService.uploadProfilePhoto(userId, file);

      if (!result) {
        throw new Error(fileUploadService.error() ?? 'Failed to upload photo');
      }

      this.logger.info('Profile photo uploaded via backend', {
        userId,
        url: result.url,
        thumbnailUrl: result.thumbnailUrl,
      });

      return result.url;
    } catch (error) {
      this.logger.error('Photo upload failed', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to upload photo. Please try again.',
        {
          cause: error,
        }
      );
    }
  }
}
