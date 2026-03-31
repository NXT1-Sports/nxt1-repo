/**
 * Auth Flow Service - Business Logic Orchestrator (Mobile)
 *
 * ⭐ 2026 PROFESSIONAL PATTERN: Separation of Concerns ⭐
 *
 * AuthFlowService handles AUTHENTICATION:
 * - Firebase sign in/out/up operations
 * - Token management
 * - Auth state (isAuthenticated, uid)
 *
 * ProfileService handles USER DATA:
 * - User profile (uses User type from @nxt1/core/models)
 * - Profile caching
 * - Profile updates
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   Components (UI Layer)                    │
 * │              LoginPage, SignupPage, HomePage               │
 * ├─────────────────────────┬──────────────────────────────────┤
 * │   AuthFlowService       │     ProfileService               │
 * │   (Auth operations)     │     (User data - User model)     │
 * ├─────────────────────────┴──────────────────────────────────┤
 * │        AuthApiService          FirebaseAuthService         │
 * │        (Backend API)           (Firebase SDK)              │
 * └────────────────────────────────────────────────────────────┘
 *
 * @module @nxt1/mobile/features/auth
 */
import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { NavController } from '@ionic/angular/standalone';
import { NxtPlatformService, HapticsService, NxtLoggingService } from '@nxt1/ui';
import { type ILogger } from '@nxt1/core/logging';
import {
  type UserRole,
  type AuthState as CoreAuthState,
  type AuthStateManager,
  type AuthUser,
  createAuthStateManager,
  createBrowserStorageAdapter,
  createMemoryStorageAdapter,
  getAuthErrorMessage,
  getAuthErrorCode,
  isCapacitor,
  isIOS,
  isAndroid,
  INITIAL_AUTH_STATE,
} from '@nxt1/core';
import { getErrorMessage } from '@nxt1/core/errors';
import {
  type IAuthFlowService,
  type FlowSignInCredentials as SignInCredentials,
  type FlowSignUpCredentials as SignUpCredentials,
} from '@nxt1/core/auth';
import { createNativeStorageAdapter } from '../../../core/infrastructure/native-storage.adapter';
import { AUTH_ROUTES, AUTH_REDIRECTS, AUTH_METHODS } from '@nxt1/core/constants';
import { INVITE_TEAM_JOINED_KEY } from '@nxt1/core/api';
import { PENDING_REFERRAL_KEY, type PendingReferral } from '../../join/join.component';
import { InviteApiService } from '@nxt1/ui/invite';
import {
  type AnalyticsAdapter,
  createMobileAnalyticsAdapterSync,
  createMemoryAnalyticsAdapter,
  APP_EVENTS,
} from '@nxt1/core/analytics';
import type { CrashlyticsAdapter, CrashUser } from '@nxt1/core/crashlytics';
import { GLOBAL_CRASHLYTICS } from '@nxt1/ui';
import { CapacitorHttpAdapter } from '../../../core/infrastructure';
import { ProfileService, FcmRegistrationService } from '../../../core/services';
import { BiometricService } from './biometric.service';
import { AuthApiService } from './auth-api.service';
import { FirebaseAuthService } from './firebase-auth.service';
import { environment } from '../../../../environments/environment';

// ============================================
// TYPES (Imported from @nxt1/core/auth)
// SignInCredentials, SignUpCredentials, OAuthOptions are now shared
// ============================================

/**
 * Auth Flow Service - Mobile
 *
 * Manages all authentication flows and user state.
 * Uses createAuthStateManager from @nxt1/core for portable state management.
 * Angular signals expose the state reactively to components.
 *
 * ⭐ SAME INTERFACE AS WEB'S AuthFlowService ⭐
 *
 * @example
 * ```typescript
 * export class LoginPage {
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
  private readonly navController = inject(NavController);
  private readonly platform = inject(NxtPlatformService);
  private readonly haptics = inject(HapticsService);
  private readonly httpAdapter = inject(CapacitorHttpAdapter);
  private readonly authApi = inject(AuthApiService);
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly fcmRegistration = inject(FcmRegistrationService);
  private readonly biometricService = inject(BiometricService);
  private readonly inviteApi = inject(InviteApiService);

  /**
   * ⭐ ProfileService - Manages User data (Single Source of Truth) ⭐
   * Use profileService.user() for user data, not auth signals.
   */
  readonly profileService = inject(ProfileService);

  /** Structured logger for auth operations */
  private readonly logger: ILogger = inject(NxtLoggingService).child('AuthFlowService');

  /** Analytics adapter - mobile or memory based on platform */
  private readonly analytics: AnalyticsAdapter = this.createAnalyticsAdapter();

  /** Crashlytics adapter for crash reporting with user context */
  private readonly crashlytics: CrashlyticsAdapter = inject(GLOBAL_CRASHLYTICS);

  /**
   * Core Auth State Manager - Same pattern as web app
   * Uses Capacitor storage on native, browser storage on web
   */
  private authManager!: AuthStateManager;

  // ============================================
  // STATE SIGNAL (Synced from AuthStateManager)
  // ============================================
  private readonly _state = signal<CoreAuthState>(INITIAL_AUTH_STATE);

  // ============================================
  // PUBLIC COMPUTED SIGNALS (Read-only)
  // Auth state only - use ProfileService for user data
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

  // Additional mobile-specific computed
  readonly displayName = computed(() => this.user()?.displayName ?? 'User');
  readonly profileImg = computed(() => this.user()?.profileImg);

  /**
   * ⭐ USER PROFILE (delegated to ProfileService) ⭐
   *
   * Professional 2026 pattern: ProfileService is the single source of truth
   * for user data using the `User` type from @nxt1/core/models.
   *
   * @deprecated Use profileService.user() directly in components
   * @example
   * ```typescript
   * // In component - inject ProfileService directly
   * private readonly profile = inject(ProfileService);
   * readonly user = this.profile.user;
   *
   * // In template
   * @if (user(); as u) {
   *   <span>{{ u.displayName }}</span>
   *   <span>{{ u.sports[0]?.sport }}</span>
   * }
   * ```
   */
  readonly profile = this.profileService.user;

  constructor() {
    // Initialize auth manager immediately and start listening to Firebase
    // Note: This is async but we don't await it here because:
    // 1. Constructor can't be async
    // 2. app.component.ts waits for isInitialized signal before navigating
    // 3. isInitialized is set to true when auth check completes
    this.initializeAuthManager().catch((err) => {
      this.logger.error('Failed to initialize auth', err);
      this.authManager?.setInitialized(true);
    });
  }

  ngOnDestroy(): void {
    // Cleanup handled by auth manager
  }

  // ============================================
  // NAVIGATION HELPERS (Ionic NavController)
  // ============================================

  /**
   * Navigate forward with Ionic slide animation
   * Uses NavController for proper ion-router-outlet animations
   */
  private async navigateForward(path: string): Promise<void> {
    await this.navController.navigateForward(path, {
      animated: true,
      animationDirection: 'forward',
    });
  }

  /**
   * Navigate back with Ionic slide animation
   * Uses NavController for proper ion-router-outlet animations
   */
  private async navigateBack(path: string): Promise<void> {
    await this.navController.navigateBack(path, {
      animated: true,
      animationDirection: 'back',
    });
  }

  /**
   * Navigate to root (replaces navigation stack)
   * Uses NavController for proper ion-router-outlet animations
   */
  private async navigateRoot(path: string): Promise<void> {
    await this.navController.navigateRoot(path, {
      animated: true,
      animationDirection: 'forward',
    });
  }

  /**
   * Navigate to the appropriate post-auth destination
   * Call this after showing biometric enrollment prompt
   */
  async navigateToPostAuthDestination(): Promise<void> {
    const redirectPath = this.hasCompletedOnboarding()
      ? AUTH_REDIRECTS.DEFAULT
      : AUTH_REDIRECTS.ONBOARDING;
    if (this.hasCompletedOnboarding()) {
      await this.navigateRoot(redirectPath);
    } else {
      await this.navigateForward(redirectPath);
    }
  }

  // ============================================
  // ANALYTICS
  // ============================================

  /**
   * Create appropriate analytics adapter based on platform
   * Uses Firebase Analytics on native (same as web), memory adapter otherwise
   */
  private createAnalyticsAdapter(): AnalyticsAdapter {
    if (this.platform.isBrowser() || isCapacitor()) {
      // Determine the correct platform type for analytics
      const platform = isIOS() ? 'ios' : isAndroid() ? 'android' : 'web';

      return createMobileAnalyticsAdapterSync({
        debug: !environment.production,
        platform,
        appVersion: environment.appVersion,
      });
    }
    return createMemoryAnalyticsAdapter({ enabled: false });
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize the auth state manager with appropriate storage adapter
   * Uses the same pattern as web app for consistency
   */
  private async initializeAuthManager(): Promise<void> {
    // Use appropriate storage based on platform:
    // - Non-browser (server/prerender): memory storage
    // - Native (Capacitor): Native storage with static Capacitor Preferences import
    // - Browser: localStorage
    let storage;
    if (!this.platform.isBrowser()) {
      storage = createMemoryStorageAdapter();
    } else if (isCapacitor()) {
      // Use native storage adapter with static imports (no dynamic import issues on iOS)
      storage = createNativeStorageAdapter();
    } else {
      storage = createBrowserStorageAdapter();
    }

    this.authManager = createAuthStateManager(storage);

    // Subscribe to state changes from the manager
    this.authManager.subscribe((state) => {
      this._state.set(state);
    });

    // Initialize manager (restore persisted state)
    await this.authManager.initialize();

    // Setup Firebase auth state listener
    this.setupFirebaseAuthSync();
  }

  /**
   * Ensure token provider is wired to HTTP adapter.
   * Called after successful login to fix logout → login flow.
   */
  private ensureTokenProvider(): void {
    this.httpAdapter.setTokenProvider(() => this.firebaseAuth.getIdToken());
  }

  /**
   * Sync Firebase auth state with our state manager
   *
   * ⭐ 2026 Token Pattern: Wires up a tokenProvider function on the HTTP adapter
   * instead of storing a static token string. The provider calls
   * firebaseAuth.getIdToken() per-request — Firebase SDK handles caching
   * internally and auto-refreshes expired tokens (~60 min).
   */
  private setupFirebaseAuthSync(): void {
    if (!this.platform.isBrowser()) {
      this.authManager.setLoading(false);
      this.authManager.setInitialized(true);
      return;
    }

    // ⭐ Create a promise that resolves ONLY after Firebase has restored the session
    // (authStateReady). The token provider awaits this — not the full checkAuth() —
    // to avoid a deadlock where syncUserProfile() makes an HTTP request that itself
    // needs a token, which would wait on checkAuth(), which is waiting on syncUserProfile().
    let resolveFirebaseReady!: () => void;
    const firebaseReadyPromise = new Promise<void>((resolve) => {
      resolveFirebaseReady = resolve;
    });

    this.httpAdapter.setTokenProvider(async () => {
      await firebaseReadyPromise;
      return this.firebaseAuth.getIdToken();
    });

    const checkAuth = async () => {
      this.authManager.setLoading(true);

      try {
        // Wait for Firebase to finish restoring session from IndexedDB/native storage.
        await this.firebaseAuth.waitForAuthReady();

        // ⭐ Resolve here — BEFORE syncUserProfile() — so that any HTTP requests
        // made inside syncUserProfile() can get a valid token without deadlocking.
        resolveFirebaseReady();

        const firebaseUser = this.firebaseAuth.getCurrentUser();

        if (firebaseUser) {
          // Set Firebase user info
          const userInfo = this.firebaseAuth.getFirebaseUserInfo(firebaseUser);
          if (userInfo) {
            this.authManager.setFirebaseUser(userInfo);
          }

          // Skip sync if signup is in progress - the signup method will handle it
          // after creating the backend user to avoid race conditions
          if (this.authManager.isSignupInProgress()) {
            this.logger.debug('Signup in progress, skipping auth state sync');
            this.authManager.setLoading(false);
            this.authManager.setInitialized(true);
            return;
          }

          // Sync profile (may make authenticated HTTP requests — safe now that
          // firebaseReadyPromise is resolved and tokenProvider can return a token)
          await this.syncUserProfile(firebaseUser.uid);
        } else {
          // No Firebase user AFTER authStateReady() — session genuinely doesn't exist.
          this.logger.debug('No Firebase user after auth ready, resetting state');
          await this.authManager.reset();
        }
      } catch (err) {
        // Resolve on error too — unblock any pending HTTP requests so they can
        // proceed (they will get null token and receive 401, which is correct).
        resolveFirebaseReady();
        this.logger.error('Auth state sync failed', err);
        this.authManager.setError(err instanceof Error ? err.message : 'Authentication error');
      } finally {
        this.authManager.setLoading(false);
        this.authManager.setInitialized(true);
      }
    };

    void checkAuth();
  }

  /**
   * Sync user profile from backend (with caching)
   *
   * ⭐ Delegates to ProfileService for user data management.
   * AuthFlowService handles auth state (AuthUser), ProfileService handles User data.
   */
  private async syncUserProfile(uid: string): Promise<void> {
    try {
      const firebaseUser = this.firebaseAuth.getCurrentUser();
      if (!firebaseUser) return;

      // Map Microsoft to email for AuthProvider compatibility
      const rawProvider = this.firebaseAuth.getProviderFromUser(firebaseUser);
      const provider = rawProvider === 'microsoft' ? 'email' : rawProvider;

      // ⭐ Load user profile via ProfileService (single source of truth)
      await this.profileService.load(uid);

      // Get the loaded profile to derive auth state fields
      const userProfile = this.profileService.user();

      // Map backend onboardingCompleted -> frontend hasCompletedOnboarding
      const hasCompletedOnboarding = userProfile?.onboardingCompleted === true;

      this.logger.debug('Onboarding status determined', {
        onboardingCompleted: userProfile?.onboardingCompleted,
        hasCompletedOnboarding,
      });

      // Derive displayName from User model (firstName + lastName)
      const userDisplayName = userProfile
        ? `${userProfile.firstName} ${userProfile.lastName}`.trim()
        : undefined;

      // Extract email from multiple sources (Firebase sometimes doesn't populate firebaseUser.email)
      const userEmail =
        firebaseUser.email || firebaseUser.providerData?.[0]?.email || userProfile?.email || '';

      // Create AuthUser from Firebase + backend data (minimal auth state)
      // ⭐ profileImg: ONLY use backend profileImgs — never fall back to Firebase/Google photoURL.
      const authUser: AuthUser = {
        uid: firebaseUser.uid,
        email: userEmail,
        displayName: firebaseUser.displayName ?? userDisplayName ?? 'User',
        profileImg: userProfile?.profileImgs?.[0] ?? undefined,
        role: this.profileService.role() ?? 'athlete',
        isPremium: this.profileService.isPremium(),
        hasCompletedOnboarding,
        provider,
        emailVerified: firebaseUser.emailVerified,
        createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        connectedEmails: Array.isArray(userProfile?.connectedEmails)
          ? userProfile.connectedEmails
          : [],
      };

      await this.authManager.setUser(authUser);

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

      this.logger.info('✅ User state synced successfully', {
        uid: authUser.uid,
        hasCompletedOnboarding: authUser.hasCompletedOnboarding,
        displayName: authUser.displayName,
        role: authUser.role,
      });
    } catch (err) {
      this.logger.error('❌ Failed to sync user profile', err);

      // Don't throw - allow auth to continue with existing persisted state
      // ProfileService will remain empty, but AuthUser will be available
      // This handles cases like network timeout on app resume gracefully
      this.logger.warn('⚠️ Continuing with persisted auth state despite profile sync failure');
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
  // SIGN IN METHODS (Same interface as web)
  // ============================================

  /**
   * Sign in with email and password
   */
  async signInWithEmail(credentials: SignInCredentials): Promise<boolean> {
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      const result = await this.firebaseAuth.signInWithEmail(
        credentials.email,
        credentials.password
      );

      // Track successful sign in
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN, { method: AUTH_METHODS.EMAIL });
      this.analytics.setUserId(result.user.uid);

      // Re-wire token provider (fixes logout → login flow)
      this.ensureTokenProvider();

      // Sync profile
      await this.syncUserProfile(result.user.uid);

      // Set analytics user properties after sync
      const user = this.user();
      if (user) {
        this.analytics.setUserProperties({
          user_type: user.role,
          is_premium: user.isPremium,
          auth_provider: AUTH_METHODS.EMAIL,
        });
      }

      // Navigate to appropriate screen (unless skipNavigation is set)
      if (!credentials.skipNavigation) {
        await this.navigatePostAuth();
      }

      // Register FCM token for push notifications (non-blocking)
      void this.fcmRegistration.registerToken();

      return true;
    } catch (err) {
      // Track sign-in error
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
        method: AUTH_METHODS.EMAIL,
        error_code: getAuthErrorCode(err) ?? 'unknown',
      });

      const message = getAuthErrorMessage(err);
      this.authManager.setError(message);
      return false;
    } finally {
      this.authManager.setLoading(false);
    }
  }

  /**
   * Navigate to the correct destination based on onboarding status.
   * Reusable across all sign-in methods.
   */
  private async navigatePostAuth(): Promise<void> {
    if (this.hasCompletedOnboarding()) {
      await this.navigateRoot(AUTH_REDIRECTS.DEFAULT);
    } else {
      await this.navigateForward(AUTH_REDIRECTS.ONBOARDING);
    }
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle(): Promise<boolean> {
    return this.handleOAuthSignIn(AUTH_METHODS.GOOGLE, () => this.firebaseAuth.signInWithGoogle());
  }

  /**
   * Sign in with Apple
   */
  async signInWithApple(): Promise<boolean> {
    return this.handleOAuthSignIn(AUTH_METHODS.APPLE, () => this.firebaseAuth.signInWithApple());
  }

  /**
   * Sign in with Microsoft
   */
  async signInWithMicrosoft(): Promise<boolean> {
    return this.handleOAuthSignIn(
      AUTH_METHODS.MICROSOFT,
      () => this.firebaseAuth.signInWithMicrosoft(),
      { nullable: true }
    );
  }

  // ============================================
  // SHARED OAUTH HANDLER (DRY — eliminates duplication)
  // ============================================

  /**
   * Shared OAuth sign-in handler for all social providers.
   *
   * Orchestrates the full post-OAuth flow:
   * 1. Detect new vs. existing user (backend lookup)
   * 2. Create backend user if new
   * 3. Sync profile + analytics
   * 4. Navigate to home or onboarding
   *
   * @param method - Auth method constant (GOOGLE, APPLE, MICROSOFT)
   * @param signInFn - Provider-specific sign-in function from FirebaseAuthService
   * @param options.nullable - If true, a null result means user cancelled (e.g. Microsoft)
   */
  private async handleOAuthSignIn(
    method: string,
    signInFn: () => Promise<import('@angular/fire/auth').UserCredential | null>,
    options?: { nullable?: boolean }
  ): Promise<boolean> {
    this.logger.debug(`${method} sign-in started`);
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      const result = await signInFn();

      // User cancelled (applicable to providers that return null)
      if (!result && options?.nullable) {
        this.authManager.setLoading(false);
        return false;
      }

      if (!result) {
        throw new Error(`${method} sign-in returned no result`);
      }

      // Extract email from multiple sources:
      // 1. user.email (standard OAuth providers — Google, Apple)
      // 2. providerData (linked provider, set after providerToLink backend call)
      // 3. ID token custom claims (Microsoft custom-token auth stores email in claims)
      let userEmail = result.user.email || result.user.providerData?.[0]?.email || null;
      if (!userEmail) {
        try {
          const tokenResult = await result.user.getIdTokenResult();
          userEmail = (tokenResult.claims['email'] as string | undefined) ?? null;
        } catch {
          // Non-fatal: proceed without email from claims
        }
      }

      this.logger.debug(`${method} Firebase sign-in successful`, {
        uid: result.user.uid,
        email: userEmail,
      });

      // Detect new vs. existing user by checking backend profile
      const isNewUser = await this.isNewBackendUser(result.user.uid);

      // Track analytics
      this.analytics.trackEvent(isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN, {
        method,
      });
      this.analytics.setUserId(result.user.uid);

      // Re-wire token provider (fixes logout → login flow)
      this.ensureTokenProvider();

      if (isNewUser) {
        this.logger.info(`${method} new user — creating backend profile`, { uid: result.user.uid });
        await this.authApi.createUser({ uid: result.user.uid, email: userEmail! });
        await this.syncUserProfile(result.user.uid);
        await this.navigateForward(AUTH_REDIRECTS.ONBOARDING);
      } else {
        this.logger.debug(`${method} existing user — syncing profile`, { uid: result.user.uid });
        await this.syncUserProfile(result.user.uid);

        // Set analytics user properties after sync
        const user = this.user();
        if (user) {
          this.analytics.setUserProperties({
            user_type: user.role,
            is_premium: user.isPremium,
            auth_provider: method,
          });
        }

        await this.navigatePostAuth();
      }

      // Register FCM token for push notifications (non-blocking)
      void this.fcmRegistration.registerToken();

      this.logger.info(`${method} sign-in complete`);
      return true;
    } catch (err: unknown) {
      // Microsoft-specific: redirect in progress is not an error
      const authError = err as { message?: string; code?: string };
      if (authError?.message === 'REDIRECT_IN_PROGRESS') {
        this.logger.debug(`${method} OAuth redirect in progress`);
        return true;
      }

      this.logger.error(`${method} sign-in failed`, err);
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
        method,
        error_code: getAuthErrorCode(err) ?? 'unknown',
      });
      const message = getAuthErrorMessage(err);
      this.authManager.setError(message);
      return false;
    } finally {
      this.authManager.setLoading(false);
    }
  }

  /**
   * Check if a user exists in the backend.
   * Returns true if the user is NOT found (new user).
   *
   * @param uid - Firebase UID to check
   */
  private async isNewBackendUser(uid: string): Promise<boolean> {
    try {
      await this.authApi.getUserProfile(uid);
      return false; // User exists
    } catch (error: unknown) {
      const apiError = error as { status?: number; message?: string | { message?: string } };
      const errorMessage =
        typeof apiError?.message === 'string'
          ? apiError.message
          : typeof apiError?.message === 'object'
            ? apiError.message?.message
            : '';
      if (apiError?.status === 404 || errorMessage?.includes('not found')) {
        return true; // User not found → new user
      }
      // On unknown errors, assume existing user to avoid duplicate creation
      this.logger.warn('Error checking user existence, assuming existing', { uid, error });
      return false;
    }
  }

  // ============================================
  // SIGN UP METHODS (Same interface as web)
  // ============================================

  /**
   * Sign up with email and password
   */
  async signUpWithEmail(credentials: SignUpCredentials): Promise<boolean> {
    // Set flag to prevent auth state listener from calling syncUserProfile
    // before we create the backend user (via core state manager)
    this.authManager.setSignupInProgress(true);
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      // Create Firebase user
      const result = await this.firebaseAuth.createUserWithEmail(
        credentials.email,
        credentials.password
      );

      try {
        // Track signup analytics
        this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, {
          method: AUTH_METHODS.EMAIL,
          team_code: credentials.teamCode,
          referral_source: credentials.referralId,
        });
        this.analytics.setUserId(result.user.uid);

        // Update profile with display name
        if (credentials.firstName || credentials.lastName) {
          const displayName = [credentials.firstName, credentials.lastName]
            .filter(Boolean)
            .join(' ');
          await this.firebaseAuth.updateUserProfile(displayName);
        }

        // Re-wire token provider (fixes logout → signup flow)
        this.ensureTokenProvider();

        // Create user in backend
        const createResult = await this.authApi.createUser({
          uid: result.user.uid,
          email: credentials.email,
          teamCode: credentials.teamCode,
          referralId: credentials.referralId,
        });

        if (!createResult.success) {
          throw new Error(
            'error' in createResult ? createResult.error.message : 'Failed to create user'
          );
        }

        // Flag that this user joined a team via invite so onboarding can skip team selection
        if (credentials.teamCode) {
          await createNativeStorageAdapter().set(INVITE_TEAM_JOINED_KEY, 'true');
        }

        // Set user state BEFORE navigating (required for onboarding page)
        await this.syncUserProfile(result.user.uid);

        // Navigate to onboarding (unless skipNavigation is set)
        if (!credentials.skipNavigation) {
          await this.navigateForward(AUTH_REDIRECTS.ONBOARDING);
        }

        // Register FCM token for push notifications (non-blocking)
        void this.fcmRegistration.registerToken();

        return true;
      } finally {
        // Always clear flag to prevent state leaks (via core state manager)
        this.authManager.setSignupInProgress(false);
      }
    } catch (err) {
      this.logger.error('signUpWithEmail failed', err);
      // Track signup error
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNUP_ERROR, {
        method: AUTH_METHODS.EMAIL,
        error_code: getAuthErrorCode(err) ?? 'unknown',
      });
      const message = getAuthErrorMessage(err);
      this.authManager.setError(message);
      return false;
    } finally {
      this.authManager.setLoading(false);
    }
  }

  /**
   * @param roleOverride - Role selected by user during onboarding (overrides stored role)
   */
  async acceptPendingInvite(roleOverride?: string): Promise<void> {
    try {
      let raw: string | null = null;
      try {
        const nativeRaw = await createNativeStorageAdapter().get(PENDING_REFERRAL_KEY);
        if (nativeRaw) raw = nativeRaw;
      } catch {
        // fallback below
      }

      if (!raw && this.platform.isBrowser()) {
        raw = sessionStorage.getItem(PENDING_REFERRAL_KEY);
      }

      if (!raw) {
        this.logger.debug('No pending invite to accept');
        return;
      }

      const referral = JSON.parse(raw) as PendingReferral;
      if (!referral.code) {
        this.logger.warn('Pending referral missing code');
        return;
      }

      this.logger.info('Accepting pending invite', {
        code: referral.code,
        type: referral.type,
        teamCode: referral.teamCode,
        role: referral.role,
        inviterUid: referral.inviterUid,
      });

      await this.inviteApi.acceptInvite(
        referral.code,
        referral.teamCode,
        roleOverride ?? referral.role,
        referral.inviterUid
      );

      this.logger.info('Invite accepted successfully', {
        code: referral.code,
        teamCode: referral.teamCode,
      });
      try {
        await createNativeStorageAdapter().set(INVITE_TEAM_JOINED_KEY, 'true');
        if (this.platform.isBrowser()) {
          sessionStorage.setItem(INVITE_TEAM_JOINED_KEY, 'true');
        }
      } catch (storageErr) {
        this.logger.warn('Failed to set invite team joined flag', { error: storageErr });
      }

      this.logger.debug('Marked invite team joined flag');
    } catch (err) {
      this.logger.warn('Failed to accept pending invite', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      try {
        await createNativeStorageAdapter().remove(PENDING_REFERRAL_KEY);
      } catch {
        /* ignore */
      }
      try {
        if (this.platform.isBrowser()) {
          sessionStorage.removeItem(PENDING_REFERRAL_KEY);
        }
      } catch {
        /* ignore */
      }
    }
  }

  // ============================================
  // PASSWORD RESET (Same interface as web)
  // ============================================

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string): Promise<boolean> {
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      await this.firebaseAuth.sendPasswordReset(email);

      // Track password reset request
      this.analytics.trackEvent(APP_EVENTS.AUTH_PASSWORD_RESET, {
        success: true,
      });

      return true;
    } catch (err) {
      const errorCode = getAuthErrorCode(err);
      const message = getAuthErrorMessage(err);
      this.analytics.trackEvent(APP_EVENTS.AUTH_PASSWORD_RESET, {
        success: false,
        error_code: errorCode ?? 'unknown',
      });
      this.authManager.setError(message);
      return false;
    } finally {
      this.authManager.setLoading(false);
    }
  }

  // ============================================
  // SIGN OUT (Same interface as web)
  // ============================================

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    this.authManager.setLoading(true);

    try {
      // Track sign out before clearing user
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_OUT);
      this.analytics.clearUser();

      // Clear crashlytics user context
      await this.crashlytics.clearUser();

      // Unregister FCM token (non-blocking)
      void this.fcmRegistration.unregisterToken();

      // ⭐ Clear profile via ProfileService (single source of truth)
      await this.profileService.clear();

      await this.firebaseAuth.signOut();
      this.httpAdapter.setTokenProvider(null);
      await this.authManager.reset();
      await this.navigateRoot(AUTH_ROUTES.ROOT);
    } catch (err) {
      const message = getAuthErrorMessage(err);
      this.authManager.setError(message);
      throw err;
    } finally {
      this.authManager.setLoading(false);
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Clear error state
   */
  clearError(): void {
    this.authManager.setError(null);
  }

  /**
   * Get current ID token
   */
  async getIdToken(): Promise<string | null> {
    return this.firebaseAuth.getIdToken();
  }

  /**
   * Refresh user profile from backend (bypasses cache)
   *
   * Call after completing onboarding to update hasCompletedOnboarding flag.
   * Invalidates cache first to ensure fresh data from backend.
   *
   * ⭐ Delegates to ProfileService for user data management.
   */
  async refreshUserProfile(): Promise<void> {
    const firebaseUser = this.firebaseAuth.getCurrentUser();
    if (!firebaseUser) {
      this.logger.debug('Cannot refresh profile: no Firebase user');
      return;
    }

    // Refresh profile with explicit uid (handles case where profile wasn't loaded yet)
    await this.profileService.refresh(firebaseUser.uid);
    this.logger.debug('Profile refreshed via ProfileService', { uid: firebaseUser.uid });

    // Re-sync auth state with new profile data
    await this.syncUserProfile(firebaseUser.uid);
  }

  // ============================================
  // ACCOUNT DELETION
  // ============================================

  /**
   * Re-authenticate the current user with email + password.
   * Required before deleteAccount() for email/password users.
   *
   * @returns true on success, false on wrong password / not authenticated
   */
  async reauthenticateWithPassword(password: string): Promise<boolean> {
    const user = this.user();
    if (!user?.email) return false;

    try {
      return await this.firebaseAuth.reauthenticateWithPassword(user.email, password);
    } catch (err) {
      this.logger.warn('Re-authentication failed', { error: err });
      return false;
    }
  }

  /**
   * Delete the current user's account.
   *
   * Calls the backend to remove Firestore data, then deletes the Firebase Auth user.
   * For email/password users, call reauthenticateWithPassword() first.
   *
   * @returns { success: true } on success or { success: false, error } on failure
   */
  async deleteAccount(): Promise<{ success: boolean; error?: string }> {
    const firebaseUser = this.firebaseAuth.getCurrentUser();
    if (!firebaseUser) {
      return { success: false, error: 'Not authenticated' };
    }

    // Step 1 — Backend deletion (determines success/failure return value)
    let backendError: string | undefined;
    try {
      this.logger.debug('Calling delete account API');
      await this.httpAdapter.delete(`${environment.apiUrl}/settings/account`);
      this.logger.debug('Delete account API success');
    } catch (err) {
      const message = getErrorMessage(err);
      this.logger.error('Account deletion failed', {
        error: err,
        message,
        status: (err as any)?.status,
      });
      backendError = message;
    }

    // Step 2 — Profile & analytics (always runs)
    try {
      await this.profileService.clear();
      this.analytics.clearUser();
      await this.crashlytics.clearUser();
    } catch (profileError) {
      this.logger.warn('Profile/analytics clear failed during account deletion', {
        error: profileError,
      });
    }

    // Step 3 — Auth state & token provider (always runs)
    try {
      await this.authManager.reset();
      this.httpAdapter.setTokenProvider(null);
    } catch (authError) {
      this.logger.warn('Auth state reset failed during account deletion', { error: authError });
    }

    // Step 4 — Biometric enrollment (always runs — prevents stale Face ID on next user)
    try {
      await this.biometricService.clearEnrollment();
    } catch (bioError) {
      this.logger.warn('Biometric clear failed during account deletion', { error: bioError });
    }

    // Step 5 — FCM token unregister (always runs — stops push to deleted account)
    try {
      await this.fcmRegistration.unregisterToken();
    } catch (fcmError) {
      this.logger.warn('FCM unregister failed during account deletion', { error: fcmError });
    }

    // Step 6 — Preferences cleanup: onboarding, referral, invite keys (always runs)
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const keysToRemove = [
        'nxt1_onboarding_session',
        'nxt1_onboarding_step',
        'nxt1_onboarding_form_data',
        'nxt1_onboarding_selected_role',
        'nxt1_onboarding_completed',
        PENDING_REFERRAL_KEY,
        'nxt1:invite_team_joined',
      ];
      await Promise.all(keysToRemove.map((key) => Preferences.remove({ key })));
    } catch (prefsError) {
      this.logger.warn('Preferences cleanup failed during account deletion', { error: prefsError });
    }

    // Step 7 — Firebase sign out (always runs — purges local IndexedDB/SQLite session)
    try {
      await this.firebaseAuth.signOut();
    } catch (signOutError) {
      this.logger.debug('SignOut error ignored (expected if user already deleted on backend)', {
        error: signOutError,
      });
    }

    if (backendError) {
      return { success: false, error: backendError };
    }

    this.logger.info('Account deleted successfully');
    return { success: true };
  }
}
