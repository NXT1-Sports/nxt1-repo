/**
 * Auth Flow Service - Business Logic Orchestrator (Mobile)
 *
 * Orchestrates authentication flows by coordinating between:
 * - FirebaseAuthService (SDK operations)
 * - AuthApiService (Backend HTTP calls)
 * - NavController (Ionic navigation with animations)
 * - State management (via @nxt1/core AuthStateManager)
 * - Analytics (via @nxt1/core/analytics)
 *
 * This is the DOMAIN layer - it knows about business rules but not UI.
 * Components should use this service, not call Firebase/API directly.
 *
 * ⭐ IDENTICAL INTERFACE TO WEB'S AuthFlowService ⭐
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   Components (UI Layer)                    │
 * │              LoginPage, SignupPage, etc.                   │
 * ├────────────────────────────────────────────────────────────┤
 * │              ⭐ AuthFlowService (THIS FILE) ⭐              │
 * │           Orchestrates business logic & state              │
 * ├────────────────────────────────────────────────────────────┤
 * │             createAuthStateManager (@nxt1/core)            │
 * │         Pure TypeScript state - same as web app            │
 * ├────────────────────────────────────────────────────────────┤
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
  type UserProfileResponse,
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
import { createNativeStorageAdapter } from '../../../core/infrastructure/native-storage.adapter';
import { AUTH_ROUTES, AUTH_REDIRECTS, AUTH_METHODS } from '@nxt1/core/constants';
import {
  type AnalyticsAdapter,
  createMobileAnalyticsAdapterSync,
  createMemoryAnalyticsAdapter,
  APP_EVENTS,
} from '@nxt1/core/analytics';
import { CapacitorHttpAdapter } from '../../../core/infrastructure';
import { AuthApiService } from './auth-api.service';
import { FirebaseAuthService } from './firebase-auth.service';
import { environment } from '../../../../environments/environment';

// ============================================
// TYPES (Matching web's auth-flow.service.ts)
// ============================================

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface SignUpCredentials {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  teamCode?: string;
  referralId?: string;
}

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
export class AuthFlowService implements OnDestroy {
  private readonly navController = inject(NavController);
  private readonly platform = inject(NxtPlatformService);
  private readonly haptics = inject(HapticsService);
  private readonly httpAdapter = inject(CapacitorHttpAdapter);
  private readonly authApi = inject(AuthApiService);
  private readonly firebaseAuth = inject(FirebaseAuthService);

  /** Structured logger for auth operations */
  private readonly logger: ILogger = inject(NxtLoggingService).child('AuthFlowService');

  /** Analytics adapter - mobile or memory based on platform */
  private readonly analytics: AnalyticsAdapter = this.createAnalyticsAdapter();

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
  // Same interface as web's AuthFlowService
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
  readonly photoURL = computed(() => this.user()?.photoURL);

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
   * Sync Firebase auth state with our state manager
   */
  private setupFirebaseAuthSync(): void {
    if (!this.platform.isBrowser()) {
      this.authManager.setLoading(false);
      this.authManager.setInitialized(true);
      return;
    }

    // Listen for Firebase user changes via FirebaseAuthService's signal
    // This is called whenever Firebase auth state changes
    const checkAuth = async () => {
      this.authManager.setLoading(true);

      try {
        const firebaseUser = this.firebaseAuth.getCurrentUser();

        if (firebaseUser) {
          // Get token and update HTTP adapter
          const token = await this.firebaseAuth.getIdToken();
          if (token) {
            this.httpAdapter.setAuthToken(token);
            await this.authManager.setToken({
              token,
              expiresAt: Date.now() + 55 * 60 * 1000, // ~55 min
              userId: firebaseUser.uid,
            });
          }

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

          // Sync profile
          await this.syncUserProfile(firebaseUser.uid);
        } else {
          // No Firebase user - check if we have a persisted user
          // On page reload, Firebase might not have synced yet, but we have persisted state
          const currentState = this._state();
          if (!currentState.user) {
            // No persisted user either - reset state
            this.logger.debug('No Firebase user and no persisted user, resetting');
            this.httpAdapter.setAuthToken(null);
            await this.authManager.reset();
          } else {
            // We have persisted user but Firebase returned null
            // This is normal on initial app startup - Firebase hasn't fully initialized
            this.logger.debug('Persisted user found, keeping state despite Firebase null');
            // Re-sync profile to ensure it's fresh
            await this.syncUserProfile(currentState.user.uid);
          }
        }
      } catch (err) {
        this.logger.error('Auth state sync failed', err);
        this.authManager.setError(err instanceof Error ? err.message : 'Authentication error');
      } finally {
        this.authManager.setLoading(false);
        this.authManager.setInitialized(true);
      }
    };

    // Initial check - await to ensure auth is fully initialized before app routes
    void checkAuth();
  }

  /**
   * Sync user profile from backend
   */
  private async syncUserProfile(_uid: string): Promise<void> {
    try {
      const firebaseUser = this.firebaseAuth.getCurrentUser();
      if (!firebaseUser) return;

      // Map Microsoft to email for AuthProvider compatibility
      const rawProvider = this.firebaseAuth.getProviderFromUser(firebaseUser);
      const provider = rawProvider === 'microsoft' ? 'email' : rawProvider;

      // Fetch full profile data from backend with timeout
      let backendProfile: UserProfileResponse | null = null;
      try {
        backendProfile = await this.authApi.getUserProfile(firebaseUser.uid);
        this.logger.debug('Backend profile fetched', {
          uid: firebaseUser.uid,
          completeSignUp: backendProfile.completeSignUp,
        });
      } catch (err) {
        this.logger.warn('Failed to fetch backend profile, using defaults', { error: err });
      }

      // Map backend completeSignUp -> frontend hasCompletedOnboarding
      // V2: Prefer onboardingCompleted, fallback to legacy completeSignUp
      const hasCompletedOnboarding =
        backendProfile?.onboardingCompleted === true || backendProfile?.completeSignUp === true;

      this.logger.debug('Onboarding status determined', { hasCompletedOnboarding });

      // Create AuthUser from Firebase + backend data
      const authUser: AuthUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        displayName:
          firebaseUser.displayName ??
          (backendProfile?.firstName && backendProfile?.lastName
            ? `${backendProfile.firstName} ${backendProfile.lastName}`
            : 'User'),
        photoURL: firebaseUser.photoURL ?? backendProfile?.profileImg ?? undefined,
        role: this.getUserRole(backendProfile),
        isPremium: !!backendProfile?.planTier && backendProfile.planTier !== 'free',
        hasCompletedOnboarding,
        provider,
        emailVerified: firebaseUser.emailVerified,
        createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.authManager.setUser(authUser);
      this.logger.info('User state synced', {
        uid: authUser.uid,
        hasCompletedOnboarding: authUser.hasCompletedOnboarding,
      });
    } catch (err) {
      this.logger.error('Failed to sync user profile', err);
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
      console.log('[AuthFlowService] Starting email sign in for:', credentials.email);
      const result = await this.firebaseAuth.signInWithEmail(
        credentials.email,
        credentials.password
      );
      console.log('[AuthFlowService] Firebase sign in successful, uid:', result.user.uid);

      // Track successful sign in
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN, { method: AUTH_METHODS.EMAIL });
      this.analytics.setUserId(result.user.uid);

      // Get token and update HTTP adapter
      const token = await result.user.getIdToken();
      console.log('[AuthFlowService] Got ID token for user');
      this.httpAdapter.setAuthToken(token);
      await this.authManager.setToken({
        token,
        expiresAt: Date.now() + 55 * 60 * 1000,
        userId: result.user.uid,
      });

      // Sync profile
      console.log('[AuthFlowService] Syncing user profile...');
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

      // Navigate to appropriate screen using constants
      const redirectPath = this.hasCompletedOnboarding()
        ? AUTH_REDIRECTS.DEFAULT
        : AUTH_REDIRECTS.ONBOARDING;
      if (this.hasCompletedOnboarding()) {
        await this.navigateRoot(redirectPath);
      } else {
        await this.navigateForward(redirectPath);
      }

      console.log('[AuthFlowService] Email sign in completed successfully');
      return true;
    } catch (err) {
      // Track sign-in error
      console.error('[AuthFlowService] Email sign in failed:', err);
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
   * Sign in with Google
   */
  async signInWithGoogle(): Promise<boolean> {
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      const result = await this.firebaseAuth.signInWithGoogle();

      // Check if new user
      // @ts-expect-error additionalUserInfo is on the result
      const isNewUser = result._tokenResponse?.isNewUser ?? false;

      // Track analytics
      this.analytics.trackEvent(isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN, {
        method: AUTH_METHODS.GOOGLE,
      });
      this.analytics.setUserId(result.user.uid);

      // Get token
      const token = await result.user.getIdToken();
      this.httpAdapter.setAuthToken(token);
      await this.authManager.setToken({
        token,
        expiresAt: Date.now() + 55 * 60 * 1000,
        userId: result.user.uid,
      });

      if (isNewUser) {
        // Create user in backend
        await this.authApi.createUser({
          uid: result.user.uid,
          email: result.user.email!,
        });
        // Set user state BEFORE navigating (required for onboarding page)
        await this.syncUserProfile(result.user.uid);
        await this.navigateForward(AUTH_REDIRECTS.ONBOARDING);
      } else {
        await this.syncUserProfile(result.user.uid);
        // Set user properties after sync
        const user = this.user();
        if (user) {
          this.analytics.setUserProperties({
            user_type: user.role,
            is_premium: user.isPremium,
            auth_provider: AUTH_METHODS.GOOGLE,
          });
        }
        const redirectPath = this.hasCompletedOnboarding()
          ? AUTH_REDIRECTS.DEFAULT
          : AUTH_REDIRECTS.ONBOARDING;
        if (this.hasCompletedOnboarding()) {
          await this.navigateRoot(redirectPath);
        } else {
          await this.navigateForward(redirectPath);
        }
      }

      return true;
    } catch (err) {
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
        method: AUTH_METHODS.GOOGLE,
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
   * Sign in with Apple
   */
  async signInWithApple(): Promise<boolean> {
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      const result = await this.firebaseAuth.signInWithApple();

      // @ts-expect-error additionalUserInfo is on the result
      const isNewUser = result._tokenResponse?.isNewUser ?? false;

      // Track analytics
      this.analytics.trackEvent(isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN, {
        method: AUTH_METHODS.APPLE,
      });
      this.analytics.setUserId(result.user.uid);

      const token = await result.user.getIdToken();
      this.httpAdapter.setAuthToken(token);
      await this.authManager.setToken({
        token,
        expiresAt: Date.now() + 55 * 60 * 1000,
        userId: result.user.uid,
      });

      if (isNewUser) {
        await this.authApi.createUser({
          uid: result.user.uid,
          email: result.user.email!,
        });
        // Set user state BEFORE navigating (required for onboarding page)
        await this.syncUserProfile(result.user.uid);
        await this.navigateForward(AUTH_REDIRECTS.ONBOARDING);
      } else {
        await this.syncUserProfile(result.user.uid);
        const user = this.user();
        if (user) {
          this.analytics.setUserProperties({
            user_type: user.role,
            is_premium: user.isPremium,
            auth_provider: AUTH_METHODS.APPLE,
          });
        }
        const redirectPath = this.hasCompletedOnboarding()
          ? AUTH_REDIRECTS.DEFAULT
          : AUTH_REDIRECTS.ONBOARDING;
        if (this.hasCompletedOnboarding()) {
          await this.navigateRoot(redirectPath);
        } else {
          await this.navigateForward(redirectPath);
        }
      }

      return true;
    } catch (err) {
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
        method: AUTH_METHODS.APPLE,
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
   * Sign in with Microsoft
   */
  async signInWithMicrosoft(): Promise<boolean> {
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      const result = await this.firebaseAuth.signInWithMicrosoft();

      // @ts-expect-error additionalUserInfo is on the result
      const isNewUser = result._tokenResponse?.isNewUser ?? false;

      // Track analytics
      this.analytics.trackEvent(isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN, {
        method: AUTH_METHODS.MICROSOFT,
      });
      this.analytics.setUserId(result.user.uid);

      const token = await result.user.getIdToken();
      this.httpAdapter.setAuthToken(token);
      await this.authManager.setToken({
        token,
        expiresAt: Date.now() + 55 * 60 * 1000,
        userId: result.user.uid,
      });

      if (isNewUser) {
        await this.authApi.createUser({
          uid: result.user.uid,
          email: result.user.email!,
        });
        // Set user state BEFORE navigating (required for onboarding page)
        await this.syncUserProfile(result.user.uid);
        await this.navigateForward(AUTH_REDIRECTS.ONBOARDING);
      } else {
        await this.syncUserProfile(result.user.uid);
        const user = this.user();
        if (user) {
          this.analytics.setUserProperties({
            user_type: user.role,
            is_premium: user.isPremium,
            auth_provider: AUTH_METHODS.MICROSOFT,
          });
        }
        const redirectPath = this.hasCompletedOnboarding()
          ? AUTH_REDIRECTS.DEFAULT
          : AUTH_REDIRECTS.ONBOARDING;
        if (this.hasCompletedOnboarding()) {
          await this.navigateRoot(redirectPath);
        } else {
          await this.navigateForward(redirectPath);
        }
      }

      return true;
    } catch (err) {
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
        method: AUTH_METHODS.MICROSOFT,
        error_code: getAuthErrorCode(err) ?? 'unknown',
      });
      const message = getAuthErrorMessage(err);
      this.authManager.setError(message);
      return false;
    } finally {
      this.authManager.setLoading(false);
    }
  }

  // ============================================
  // SIGN UP METHODS (Same interface as web)
  // ============================================

  /**
   * Sign up with email and password
   */
  async signUpWithEmail(credentials: SignUpCredentials): Promise<boolean> {
    console.log('[AuthFlowService] signUpWithEmail starting', { email: credentials.email });
    // Set flag to prevent auth state listener from calling syncUserProfile
    // before we create the backend user (via core state manager)
    this.authManager.setSignupInProgress(true);
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      // Create Firebase user
      console.log('[AuthFlowService] Creating Firebase user...');
      const result = await this.firebaseAuth.createUserWithEmail(
        credentials.email,
        credentials.password
      );
      console.log('[AuthFlowService] Firebase user created', { uid: result.user.uid });

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
          console.log('[AuthFlowService] Updating display name', { displayName });
          await this.firebaseAuth.updateUserProfile(displayName);
        }

        // Get token
        console.log('[AuthFlowService] Getting Firebase ID token...');
        const token = await result.user.getIdToken();
        console.log('[AuthFlowService] Got token, setting on HTTP adapter');
        this.httpAdapter.setAuthToken(token);
        await this.authManager.setToken({
          token,
          expiresAt: Date.now() + 55 * 60 * 1000,
          userId: result.user.uid,
        });

        // Create user in backend
        console.log('[AuthFlowService] Creating backend user...', {
          uid: result.user.uid,
          email: credentials.email,
          teamCode: credentials.teamCode,
        });
        const createResult = await this.authApi.createUser({
          uid: result.user.uid,
          email: credentials.email,
          teamCode: credentials.teamCode,
          referralId: credentials.referralId,
        });
        console.log('[AuthFlowService] Backend user created', { createResult });

        if (!createResult.success) {
          throw new Error(
            'error' in createResult ? createResult.error.message : 'Failed to create user'
          );
        }

        // Set user state BEFORE navigating (required for onboarding page)
        console.log('[AuthFlowService] Syncing user profile...');
        await this.syncUserProfile(result.user.uid);

        // Navigate to onboarding
        console.log('[AuthFlowService] Navigating to onboarding');
        await this.navigateForward(AUTH_REDIRECTS.ONBOARDING);
        console.log('[AuthFlowService] signUpWithEmail success');
        return true;
      } finally {
        // Always clear flag to prevent state leaks (via core state manager)
        this.authManager.setSignupInProgress(false);
      }
    } catch (err) {
      console.error('[AuthFlowService] signUpWithEmail failed', err);
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

      await this.firebaseAuth.signOut();
      this.httpAdapter.setAuthToken(null);
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
   * Refresh user profile from Firebase
   * Call after completing onboarding to update hasCompletedOnboarding flag
   */
  async refreshUserProfile(): Promise<void> {
    const firebaseUser = this.firebaseAuth.getCurrentUser();
    if (!firebaseUser) return;

    await this.syncUserProfile(firebaseUser.uid);
  }
}
