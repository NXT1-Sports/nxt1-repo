/**
 * Auth Flow Service - Business Logic Orchestrator
 *
 * Orchestrates authentication flows by coordinating between:
 * - Firebase Auth (SDK operations)
 * - Auth API (Backend HTTP calls)
 * - Router (Navigation)
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
import { NxtPlatformService } from '@nxt1/ui/services';
import { Subscription } from 'rxjs';

// Type-only imports - these don't cause runtime code to execute
import type { Auth as FirebaseAuthType, User as FirebaseUser } from '@angular/fire/auth';

import { AuthApiService } from './auth-api.service';
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
  INITIAL_AUTH_STATE,
} from '@nxt1/core';
import { AUTH_ROUTES, AUTH_REDIRECTS, AUTH_METHODS } from '@nxt1/core/constants';
import {
  type AnalyticsAdapter,
  createFirebaseAnalyticsAdapterSync,
  createMemoryAnalyticsAdapter,
  APP_EVENTS,
} from '@nxt1/core/analytics';
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
export class AuthFlowService implements OnDestroy {
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly injector = inject(Injector);
  private readonly authApi = inject(AuthApiService);

  /** Analytics adapter - web or memory based on platform */
  private readonly analytics: AnalyticsAdapter = this.createAnalyticsAdapter();

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

  /**
   * Create appropriate analytics adapter based on platform
   * Uses Firebase SDK on browser (same as mobile), memory adapter on server (SSR)
   */
  private createAnalyticsAdapter(): AnalyticsAdapter {
    if (this.platform.isBrowser()) {
      return createFirebaseAnalyticsAdapterSync({
        firebaseConfig: environment.firebase,
        debug: !environment.production,
        platform: 'web',
        appVersion: environment.appVersion,
      });
    }
    return createMemoryAnalyticsAdapter({ enabled: false });
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
      console.error('[AuthFlowService] Failed to initialize Firebase Auth:', err);
      this.authManager.setLoading(false);
      this.authManager.setInitialized(true);
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

            // User is signed in - sync profile
            await this.syncUserProfile(firebaseUser);
            this.authManager.setLoading(false);
            this.authManager.setInitialized(true);
            const currentUrl = this.router.url;
            if (currentUrl.includes(AUTH_ROUTES.ROOT)) {
              await this.router.navigate([AUTH_REDIRECTS.DEFAULT]);
            }
          } else {
            // User is signed out - reset state
            await this.authManager.reset();
          }
        } catch (err) {
          console.error('[AuthFlowService] Auth state sync failed:', err);
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
   * This method:
   * 1. Fetches user profile from backend API
   * 2. Sets analytics user ID and properties for tracking
   *
   * Analytics user properties allow you to segment users in GA4:
   * - user_type: 'athlete' | 'coach' | 'parent' | etc.
   * - is_premium: boolean for subscription status
   * - auth_provider: how they signed in
   * These persist across sessions until explicitly changed.
   */
  private async syncUserProfile(firebaseUser: FirebaseUser): Promise<void> {
    try {
      const backendProfile = await this.authApi.getUserProfile(firebaseUser.uid);
      const authUser: AuthUser = {
        ...backendProfile,
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        displayName:
          firebaseUser.displayName ??
          (backendProfile?.firstName && backendProfile?.lastName
            ? `${backendProfile.firstName} ${backendProfile.lastName}`
            : 'User'),
        photoURL: firebaseUser.photoURL ?? backendProfile?.profileImg ?? undefined,
        role: this.getUserRole(backendProfile),
        isPremium: backendProfile?.lastActivatedPlan !== 'free',
        hasCompletedOnboarding: true,
        provider: this.getProviderFromFirebase(firebaseUser),
        emailVerified: firebaseUser.emailVerified,
        createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      console.log(authUser);

      await this.authManager.setUser(authUser);

      // Set analytics user identity and properties
      // These properties persist in GA4 and allow audience segmentation
      this.analytics.setUserId(authUser.uid);
      this.analytics.setUserProperties({
        user_type: authUser.role,
        is_premium: authUser.isPremium,
        auth_provider: authUser.provider,
      });
    } catch (err) {
      console.error('[AuthFlowService] Failed to sync user profile:', err);
      // Fallback to basic Firebase data
      const authUser: AuthUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        displayName: firebaseUser.displayName ?? 'User',
        photoURL: firebaseUser.photoURL ?? undefined,
        role: 'athlete' as UserRole,
        isPremium: false,
        hasCompletedOnboarding: false,
        provider: this.getProviderFromFirebase(firebaseUser),
        emailVerified: firebaseUser.emailVerified,
        createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.authManager.setUser(authUser);
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
   * Get user role from legacy User model
   */
  private getUserRole(user: any): UserRole {
    if (user?.isCollegeCoach) return 'coach' as UserRole; // Map college-coach to coach
    if (user?.isRecruit) return 'athlete' as UserRole;
    if (user?.isFan) return 'fan' as UserRole;
    if (user?.athleteOrParentOrCoach === 'Coach') return 'coach' as UserRole;
    return 'athlete' as UserRole; // default
  }

  // ============================================
  // SIGN IN METHODS
  // ============================================

  /**
   * Sign in with email and password
   */
  async signInWithEmail(credentials: SignInCredentials): Promise<boolean> {
    if (!this.firebaseAuth) {
      this.authManager.setError('Authentication not available');
      return false;
    }

    // this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      // Dynamic import for SSR safety
      const { signInWithEmailAndPassword } = await import('firebase/auth');

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
      console.error('[AuthFlowService] Sign in failed:', err);
      const errorCode = getAuthErrorCode(err);
      const message = getAuthErrorMessage(err);
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
        method: AUTH_METHODS.EMAIL,
        error_code: errorCode,
      });
      this.authManager.setError(message);
      return false;
    }
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle(): Promise<boolean> {
    if (!this.firebaseAuth) {
      this.authManager.setError('Authentication not available');
      return false;
    }

    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      // Dynamic imports for SSR safety
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(this.firebaseAuth, provider);

      // Check if this is a new user
      // @ts-expect-error additionalUserInfo is on the result
      const isNewUser = result._tokenResponse?.isNewUser ?? false;

      // Track analytics
      this.analytics.trackEvent(isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN, {
        method: AUTH_METHODS.GOOGLE,
      });
      this.analytics.setUserId(result.user.uid);
      this.analytics.setUserProperties({ user_type: this.user()?.role });

      if (isNewUser) {
        // Create user in backend
        await this.authApi.createUser({
          uid: result.user.uid,
          email: result.user.email!,
        });

        await this.router.navigate([AUTH_ROUTES.ONBOARDING]);
      } else {
        // const redirectPath = this.hasCompletedOnboarding() ? AUTH_REDIRECTS.DEFAULT : AUTH_ROUTES.ONBOARDING;
        // await this.router.navigate([redirectPath]);
      }

      return true;
    } catch (err) {
      const errorCode = getAuthErrorCode(err);
      const message = getAuthErrorMessage(err);
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
        method: AUTH_METHODS.GOOGLE,
        error_code: errorCode,
      });
      this.authManager.setError(message);
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

    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      // Dynamic import for SSR safety
      const { createUserWithEmailAndPassword } = await import('firebase/auth');

      // Create Firebase user
      const result = await createUserWithEmailAndPassword(
        this.firebaseAuth,
        credentials.email,
        credentials.password
      );

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

      // Track successful sign up
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, {
        method: AUTH_METHODS.EMAIL,
        team_code: credentials.teamCode,
        referral_source: credentials.referralId,
      });
      this.analytics.setUserId(result.user.uid);

      // Navigate to onboarding
      await this.router.navigate([AUTH_ROUTES.ONBOARDING]);
      return true;
    } catch (err) {
      const errorCode = getAuthErrorCode(err);
      const message = getAuthErrorMessage(err);
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNUP_ERROR, {
        method: AUTH_METHODS.EMAIL,
        error_code: errorCode,
      });
      this.authManager.setError(message);
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
      const { signOut } = await import('firebase/auth');

      // Track sign out before clearing user
      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_OUT);
      this.analytics.clearUser();

      await signOut(this.firebaseAuth);
      await this.authManager.reset();
      await this.router.navigate([AUTH_ROUTES.ROOT]);
    } catch (err) {
      console.error('[AuthFlowService] Sign out failed:', err);
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
      const { sendPasswordResetEmail } = await import('firebase/auth');

      await sendPasswordResetEmail(this.firebaseAuth, email);

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
        error_code: errorCode,
      });
      this.authManager.setError(message);
      return false;
    } finally {
      this.authManager.setLoading(false);
    }
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
   * Force refresh user profile from backend
   */
  async refreshUserProfile(): Promise<void> {
    if (this.firebaseAuth?.currentUser) {
      await this.syncUserProfile(this.firebaseAuth.currentUser);
    }
  }
}
