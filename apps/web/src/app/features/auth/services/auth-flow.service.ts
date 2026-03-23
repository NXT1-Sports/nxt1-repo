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
  signal,
  computed,
  Injector,
  OnDestroy,
  runInInjectionContext,
} from '@angular/core';
import { Router } from '@angular/router';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { type ILogger } from '@nxt1/core/logging';
import { Subscription } from 'rxjs';

// Type-only imports - these don't cause runtime code to execute
import type { Auth as FirebaseAuthType, User as FirebaseUser } from '@angular/fire/auth';

import { AuthApiService } from './auth-api.service';
import { AuthErrorHandler } from '@nxt1/ui/services/auth-error';
import { FileUploadService } from '../../../core/services';
import { InviteApiService } from '@nxt1/ui/invite';
import { PENDING_REFERRAL_KEY, type PendingReferral } from '../../join/join.component';
import {
  type UserRole,
  type AuthState as CoreAuthState,
  type AuthStateManager,
  type AuthUser,
  USER_ROLES,
  createAuthStateManager,
  createBrowserStorageAdapter,
  createMemoryStorageAdapter,
  INITIAL_AUTH_STATE,
  INVITE_TEAM_JOINED_KEY,
} from '@nxt1/core';
import {
  type IAuthFlowService,
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
  private readonly authErrorHandler = inject(AuthErrorHandler);
  private readonly inviteApi = inject(InviteApiService);

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

  // ============================================
  // PUBLIC COMPUTED SIGNALS (Read-only)
  // ============================================
  readonly user = computed(() => this._state().user);
  readonly firebaseUser = computed(() => this._state().firebaseUser);
  readonly isLoading = computed(() => this._state().isLoading);
  readonly error = computed(() => this._state().error);
  readonly isInitialized = computed(() => this._state().isInitialized);

  readonly isAuthenticated = computed(() => this._state().user !== null);

  readonly userRole = computed(() => this._state().user?.role ?? null);
  readonly isPremium = computed(() => this._state().user?.isPremium ?? false);
  readonly hasCompletedOnboarding = computed(
    () => this._state().user?.hasCompletedOnboarding ?? false
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

  // ============================================
  // ANALYTICS
  // ============================================

  /**
   * Create appropriate analytics adapter based on platform
   *
   * Note: Firebase Analytics via dynamic import has issues with Vite bundler.
   * For now, use memory adapter which logs events in debug mode.
   * The main Firebase Analytics is handled by @angular/fire/analytics
   * which is properly configured in app.config.ts.
   *
   * This adapter is primarily for auth-specific tracking that supplements
   * the global analytics.
   */
  private createAnalyticsAdapter(): AnalyticsAdapter {
    // Use memory adapter that logs in debug mode
    // Main analytics is handled by @angular/fire/analytics globally
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

    // Initialize manager and Firebase Auth
    if (this.platform.isBrowser()) {
      this.initializeOnBrowser();
    } else {
      // On server, mark as initialized with no user
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
    }, 5000);

    try {
      // Initialize from storage (restore persisted state)
      await this.authManager.initialize();

      // Dynamically import the Auth token and inject it
      const { Auth } = await import('@angular/fire/auth');
      this.firebaseAuth = this.injector.get(Auth, null);

      if (this.firebaseAuth) {
        await this.initAuthStateListener();
      } else {
        this.authManager.setLoading(false);
        this.authManager.setInitialized(true);
      }
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Auth', err);
      this.authManager.setLoading(false);
      this.authManager.setInitialized(true);
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
        this.authManager.setLoading(true);

        try {
          if (firebaseUser) {
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

            // User is signed in - sync profile
            await this.syncUserProfile(firebaseUser);
            this.authManager.setLoading(false);
            this.authManager.setInitialized(true);

            // Check onboarding status AFTER sync
            const completedOnboarding = this.hasCompletedOnboarding();
            const currentUser = this.user();

            this.logger.info('User authenticated', {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              hasDisplayName: !!currentUser?.displayName && currentUser.displayName !== 'User',
              hasCompletedOnboarding: completedOnboarding,
              currentUrl: this.router.url,
            });

            // Navigate based on onboarding status
            // IMPORTANT: Only redirect if on auth pages or root, don't interrupt user on other pages
            const currentUrl = this.router.url;
            const isOnAuthPage = currentUrl.includes(AUTH_ROUTES.ROOT);
            const isOnRootPage = currentUrl === '/';
            const isOnOnboardingPage = currentUrl.includes('/onboarding');

            // Only redirect to onboarding if:
            // 1. User hasn't completed onboarding AND
            // 2. User is on auth pages or root (not already navigating somewhere else)
            if (!completedOnboarding && !isOnOnboardingPage && (isOnAuthPage || isOnRootPage)) {
              this.logger.info('⚠️ Onboarding not complete, redirecting to onboarding');
              await this.navigateForward(AUTH_ROUTES.ONBOARDING);
            }
            // If completed and on auth/root page → redirect to home
            else if (completedOnboarding && (isOnAuthPage || isOnRootPage)) {
              this.logger.info('✅ Onboarding complete, redirecting to home');
              await this.navigateRoot(AUTH_REDIRECTS.DEFAULT);
            }
            // Otherwise: stay on current page (e.g., /home, /profile, etc.)
            else {
              this.logger.info('ℹ️ Staying on current page', { currentUrl, completedOnboarding });
            }
          } else {
            // User is signed out - reset state
            await this.authManager.reset();
            // Make sure we mark as initialized even when no user
            this.authManager.setInitialized(true);
            this.authManager.setLoading(false);
          }
        } catch (err) {
          this.logger.error('Auth state sync failed', err);
          this.authManager.setError(err instanceof Error ? err.message : 'Authentication error');
          this.authManager.setLoading(false);
          this.authManager.setInitialized(true);
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
    throwOnNotFound = false
  ): Promise<void> {
    try {
      // Fetch profile from backend (with caching)
      let backendProfile: CachedUserProfile | null = null;

      try {
        // Use globalAuthUserCache for efficient caching
        // Map User type to CachedUserProfile (id -> uid)
        backendProfile = await globalAuthUserCache.getOrFetch(firebaseUser.uid, async () => {
          const user = await this.authApi.getUserProfile(firebaseUser.uid);
          return {
            uid: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImg: user.profileImgs?.[0] ?? null,
            displayName: `${user.firstName} ${user.lastName}`.trim(),
            role: user.role ?? null,
            planTier: user.planTier ?? null,
            onboardingCompleted: user.onboardingCompleted,
            // Normalise: Firestore dot-notation writes can convert sports array
            // to a plain map {"0": {...}}. Convert back before array methods.
            ...(() => {
              const sportsArr = Array.isArray(user.sports)
                ? user.sports
                : user.sports
                  ? (Object.values(user.sports) as typeof user.sports)
                  : undefined;
              return {
                primarySport: sportsArr?.find((s) => s.order === 0)?.sport,
                sports: sportsArr?.map((s) => ({
                  sport: s.sport,
                  positions: s.positions,
                  isPrimary: s.order === 0,
                })),
              };
            })(),
          };
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
              planTier: currentUser.isPremium ? 'premium' : null,
              onboardingCompleted: true, // Preserve the completed status
              completeSignUp: true,
              isCollegeCoach: currentUser.role === USER_ROLES.RECRUITER,
              isRecruit: currentUser.role === USER_ROLES.ATHLETE,
              profileImg: currentUser.profileImg ?? null,
              sports: [],
            };
          }
        }

        // If caller needs to know about missing profile (OAuth new user detection), throw
        if (throwOnNotFound && !backendProfile) {
          throw new Error(`Backend user not found for uid: ${firebaseUser.uid}`);
        }
        // Otherwise continue with null profile - use Firebase data with defaults
      }

      // V2: Use onboardingCompleted field only (no legacy fallback)
      const hasCompletedOnboarding = backendProfile?.onboardingCompleted === true;

      this.logger.debug('Onboarding status determined', { hasCompletedOnboarding });

      // Build AuthUser from Firebase + backend data
      const authUser: AuthUser = {
        ...(backendProfile ?? {}),
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        // Backend displayName is source of truth; Firebase displayName is fallback
        displayName:
          (backendProfile?.firstName && backendProfile?.lastName
            ? `${backendProfile.firstName} ${backendProfile.lastName}`.trim()
            : undefined) ??
          firebaseUser.displayName ??
          'User',
        profileImg: backendProfile?.profileImg ?? firebaseUser.photoURL ?? undefined,
        role: this.getUserRole(
          backendProfile
            ? {
                role: backendProfile.role as UserRole | null | undefined,
                isCollegeCoach: backendProfile.isCollegeCoach,
                isRecruit: backendProfile.isRecruit,
              }
            : null
        ),
        // Premium status: Check planTier (cached from Subscriptions collection)
        // Free users have no planTier or planTier === 'free'
        isPremium: !!backendProfile?.planTier && backendProfile.planTier !== 'free',
        hasCompletedOnboarding,
        provider: this.getProviderFromFirebase(firebaseUser),
        emailVerified: firebaseUser.emailVerified,
        createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.authManager.setUser(authUser);

      // Set analytics identity
      this.analytics.setUserId(authUser.uid);
      this.analytics.setUserProperties({
        user_type: authUser.role,
        is_premium: authUser.isPremium,
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
        is_premium: authUser.isPremium,
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
  private getProviderFromFirebase(user: FirebaseUser): 'email' | 'google' | 'apple' | 'anonymous' {
    const providerId = user.providerData[0]?.providerId;
    switch (providerId) {
      case 'google.com':
        return 'google';
      case 'apple.com':
        return 'apple';
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
      role?: UserRole | null;
      isCollegeCoach?: boolean | null;
      isRecruit?: boolean | null;
    } | null
  ): UserRole {
    if (!user) return 'athlete';

    // V2: Use role field directly if present
    if (user.role) return user.role;

    // Legacy fallback: Map boolean flags to role
    if (user.isCollegeCoach) return 'coach';
    if (user.isRecruit) return 'athlete';

    return 'athlete';
  }

  // ============================================
  // SIGN IN METHODS
  // ============================================

  /**
   * Sign in with email and password
   *
   * Enterprise-grade authentication flow:
   * 1. Validates Firebase is available
   * 2. Sets loading state for UI feedback
   * 3. Attempts Firebase authentication
   * 4. Tracks success/failure analytics
   * 5. Properly handles and displays errors
   */
  async signInWithEmail(credentials: SignInCredentials): Promise<boolean> {
    if (!this.firebaseAuth) {
      this.authManager.setError('Authentication not available. Please refresh and try again.');
      return false;
    }

    // Set loading state and clear previous errors
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      // Dynamic import for SSR safety
      const { signInWithEmailAndPassword } = await import('@angular/fire/auth');

      const result = await signInWithEmailAndPassword(
        this.firebaseAuth,
        credentials.email,
        credentials.password
      );

      // Track successful sign in
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN, { method: AUTH_METHODS.EMAIL });
      this.analytics.setUserId(result.user.uid);

      // Auth state listener handles profile sync and navigation
      return true;
    } catch (err) {
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
    } finally {
      // Always clear loading state
      this.authManager.setLoading(false);
    }
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

    try {
      // ALWAYS try to sync existing user first (Firebase isNewUser can be unreliable)
      this.logger.debug('📡 Attempting to sync existing user profile (Microsoft)');
      await this.syncUserProfile(result.user);
      this.logger.info('✅ User profile sync successful - existing user (Microsoft)');

      // Check if user needs onboarding
      const currentUser = this.user();
      const needsOnboarding = !currentUser?.hasCompletedOnboarding;

      if (needsOnboarding) {
        this.logger.info('🚀 Navigating to onboarding (existing user, incomplete) (Microsoft)');
        await this.navigateForward(AUTH_ROUTES.ONBOARDING);
      } else {
        this.logger.info('🏠 User already completed onboarding, navigating to /home (Microsoft)');
        await this.navigateRoot(AUTH_REDIRECTS.DEFAULT);
      }
    } catch (syncError: unknown) {
      const errorObj = syncError as { message?: string };
      this.logger.warn('❌ User sync failed, attempting to create new user (Microsoft)', {
        error: errorObj?.message,
      });

      try {
        // User doesn't exist in backend, create new user
        this.logger.debug('📝 Creating new user via Microsoft OAuth', {
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

        this.logger.info('✅ New user created successfully (Microsoft)', { createResult });

        // Sync the newly created user to local state
        await this.syncUserProfile(result.user);

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
      await this.inviteApi.acceptInvite(
        referral.code,
        referral.teamCode,
        roleOverride ?? referral.role,
        referral.inviterUid
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

    this.authManager.setLoading(true);
    this.authManager.setError(null);

    this.logger.info('🎯 Starting Google OAuth (popup)');

    try {
      // Dynamic imports for SSR safety
      const { GoogleAuthProvider, signInWithPopup } = await import('@angular/fire/auth');

      const provider = new GoogleAuthProvider();
      // Request email scope explicitly
      provider.addScope('email');
      provider.addScope('profile');
      provider.addScope('https://www.googleapis.com/auth/gmail.send');
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');

      // CRITICAL: Request offline access to get refresh token
      provider.setCustomParameters({
        access_type: 'offline',
        prompt: 'consent', // Force consent screen to ensure refresh token
      });

      const result = await signInWithPopup(this.firebaseAuth, provider);

      // Check if this is a new user (Firebase detection can be unreliable)
      // @ts-expect-error additionalUserInfo is on the result
      const isNewUser = result._tokenResponse?.isNewUser ?? false;

      this.logger.debug('🔍 Firebase detected isNewUser', { isNewUser });

      // Track analytics
      this.analytics.trackEvent(isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN, {
        method: AUTH_METHODS.GOOGLE,
      });
      this.analytics.setUserId(result.user.uid);
      this.analytics.setUserProperties({ user_type: this.user()?.role });

      // Set flag to prevent auth state listener from racing with user setup (via core state manager)
      this.authManager.setSignupInProgress(true);

      try {
        // ALWAYS try to sync existing user first (Firebase isNewUser can be unreliable)
        this.logger.debug('📡 Attempting to sync existing user profile');
        await this.syncUserProfile(result.user);
        this.logger.info('✅ User profile sync successful - existing user');

        // Check if user needs onboarding
        const currentUser = this.user();
        const needsOnboarding = !currentUser?.hasCompletedOnboarding;

        if (needsOnboarding) {
          this.logger.info('🚀 Navigating to onboarding (existing user, incomplete)');
          await this.navigateForward(AUTH_ROUTES.ONBOARDING);
        } else {
          this.logger.info('🏠 User already completed onboarding, navigating to /home');
          await this.navigateRoot(AUTH_REDIRECTS.DEFAULT);
        }
      } catch (syncError: unknown) {
        const errorObj = syncError as { message?: string };
        this.logger.warn('❌ User sync failed, attempting to create new user', {
          error: errorObj?.message,
        });

        try {
          // User doesn't exist in backend, create new user
          this.logger.debug('📝 Creating new user via OAuth', {
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

          this.logger.info('✅ New user created successfully (OAuth)', { createResult });

          // Sync the newly created user to local state
          await this.syncUserProfile(result.user);

          // Navigate to onboarding for new users
          this.logger.info('🚀 Navigating to onboarding (new user)');
          await this.navigateForward(AUTH_ROUTES.ONBOARDING);
        } catch (createError: unknown) {
          this.logger.error('❌ Failed to create new user', createError);
          throw createError; // Re-throw to be handled by outer catch
        }
      } finally {
        // Always clear flag to prevent state leaks (via core state manager)
        this.authManager.setSignupInProgress(false);
      }

      return true;
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
    } finally {
      this.authManager.setLoading(false);
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

    this.authManager.setLoading(true);
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

      this.logger.info('🚀 Starting Microsoft OAuth (popup)');
      const result = await signInWithPopup(this.firebaseAuth, provider);

      this.logger.info('✅ Microsoft OAuth popup success', {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
      });

      // Process result using helper method
      return await this.processMicrosoftAuthResult(result, teamCode, referralId);
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
    } finally {
      this.authManager.setLoading(false);
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

    this.authManager.setLoading(true);
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

      const result = await signInWithPopup(this.firebaseAuth, provider);

      // Check if this is a new user (Firebase detection can be unreliable)
      // @ts-expect-error additionalUserInfo is on the result
      const isNewUser = result._tokenResponse?.isNewUser ?? false;

      this.logger.debug('🔍 Firebase detected isNewUser (Apple)', { isNewUser });

      // Track analytics
      this.analytics.trackEvent(isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN, {
        method: AUTH_METHODS.APPLE,
      });
      this.analytics.setUserId(result.user.uid);
      this.analytics.setUserProperties({ user_type: this.user()?.role });

      // Set flag to prevent auth state listener from racing with user setup (via core state manager)
      this.authManager.setSignupInProgress(true);

      try {
        // ALWAYS try to sync existing user first (Firebase isNewUser can be unreliable)
        this.logger.debug('📡 Attempting to sync existing user profile (Apple)');
        await this.syncUserProfile(result.user);
        this.logger.info('✅ User profile sync successful - existing user (Apple)');

        // Check if user needs onboarding
        const currentUser = this.user();
        const needsOnboarding = !currentUser?.hasCompletedOnboarding;

        if (needsOnboarding) {
          this.logger.info('🚀 Navigating to onboarding (existing user, incomplete) (Apple)');
          await this.navigateForward(AUTH_ROUTES.ONBOARDING);
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
    } finally {
      this.authManager.setLoading(false);
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
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      // Dynamic import for SSR safety
      const { createUserWithEmailAndPassword } = await import('@angular/fire/auth');

      // Create Firebase user
      const result = await createUserWithEmailAndPassword(
        this.firebaseAuth,
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
        return true;
      } finally {
        // Always clear flag to prevent state leaks (via core state manager)
        this.authManager.setSignupInProgress(false);
      }
    } catch (err) {
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
    } finally {
      this.authManager.setLoading(false);
    }
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
   * Force refresh user profile from backend (bypasses cache)
   * Call after completing onboarding to update hasCompletedOnboarding flag
   *
   * ⚠️ IMPORTANT: This invalidates the cache first to ensure fresh data
   */
  async refreshUserProfile(): Promise<void> {
    if (this.firebaseAuth?.currentUser) {
      const uid = this.firebaseAuth.currentUser.uid;
      // Invalidate cache to force fresh fetch from backend
      // This is critical after onboarding completion
      await globalAuthUserCache.invalidate(uid);
      await this.syncUserProfile(this.firebaseAuth.currentUser);
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
        error instanceof Error ? error.message : 'Failed to upload photo. Please try again.'
      );
    }
  }
}
