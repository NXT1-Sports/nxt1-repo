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
import { AuthErrorHandler } from '@nxt1/ui/auth-services';
import {
  type UserRole,
  type AuthState as CoreAuthState,
  type AuthStateManager,
  type AuthUser,
  createAuthStateManager,
  createBrowserStorageAdapter,
  createMemoryStorageAdapter,
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
  private readonly authErrorHandler = inject(AuthErrorHandler);

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
   * Flag to prevent auth state listener from calling syncUserProfile
   * during signup flow. The signup methods handle this manually after
   * creating the backend user to avoid race conditions.
   */
  private signupInProgress = false;

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
        console.warn('[AuthFlowService] Force initializing after timeout');
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
      console.error('[AuthFlowService] Failed to initialize Firebase Auth:', err);
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
            if (this.signupInProgress) {
              console.log('[AuthFlowService] Signup in progress, skipping auth state sync');
              return;
            }

            // User is signed in - sync profile
            await this.syncUserProfile(firebaseUser);
            this.authManager.setLoading(false);
            this.authManager.setInitialized(true);

            // Check onboarding status AFTER sync
            const completedOnboarding = this.hasCompletedOnboarding();
            const currentUser = this.user();

            console.log('[AuthFlowService] User authenticated:', {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              hasDisplayName: !!currentUser?.displayName && currentUser.displayName !== 'User',
              hasCompletedOnboarding: completedOnboarding,
              currentUrl: this.router.url,
            });

            // Navigate based on onboarding status
            // IMPORTANT: If user hasn't completed onboarding, ALWAYS redirect to onboarding
            // (except if already on onboarding page)
            const currentUrl = this.router.url;
            const isOnAuthPage = currentUrl.includes(AUTH_ROUTES.ROOT);
            const isOnHomepage = currentUrl === '/' || currentUrl === '/home';
            const isOnOnboardingPage = currentUrl.includes('/onboarding');

            // If not completed onboarding and not already on onboarding page → force redirect
            if (!completedOnboarding && !isOnOnboardingPage) {
              console.log(
                '[AuthFlowService] ⚠️  Onboarding not complete, redirecting to onboarding'
              );
              await this.router.navigate([AUTH_ROUTES.ONBOARDING]);
            }
            // If completed and on auth/home page → redirect to home
            else if (completedOnboarding && (isOnAuthPage || isOnHomepage)) {
              console.log('[AuthFlowService] ✅ Onboarding complete, redirecting to home');
              await this.router.navigate([AUTH_REDIRECTS.DEFAULT]);
            }
          } else {
            // User is signed out - reset state
            await this.authManager.reset();
            // Make sure we mark as initialized even when no user
            this.authManager.setInitialized(true);
            this.authManager.setLoading(false);
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
   *
   * @param firebaseUser Firebase user object
   * @param throwOnNotFound If true, throws error when backend user not found (for OAuth signup flows)
   */
  private async syncUserProfile(
    firebaseUser: FirebaseUser,
    throwOnNotFound = false
  ): Promise<void> {
    try {
      const backendProfile = await this.authApi.getUserProfile(firebaseUser.uid);

      // Check if backend user exists
      if (!backendProfile || !backendProfile.email) {
        console.warn('[AuthFlowService] No backend profile found for user:', firebaseUser.uid);

        // If throwOnNotFound is true (OAuth signup), throw error so OAuth method can handle user creation
        if (throwOnNotFound) {
          throw new Error(`Backend user not found for uid: ${firebaseUser.uid}`);
        }

        console.warn('[AuthFlowService] Attempting to create backend user document...');

        // Try to create backend user (in case createUser was never called)
        try {
          await this.authApi.createUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email!,
          });
          console.log('[AuthFlowService] ✅ Backend user created successfully');

          // Retry fetching profile after creation
          const newProfile = await this.authApi.getUserProfile(firebaseUser.uid);
          if (newProfile) {
            // Continue with normal flow using new profile
            const hasCompletedOnboarding = Boolean(newProfile?.completeSignUp);
            const authUser: AuthUser = {
              ...newProfile,
              uid: firebaseUser.uid,
              email: firebaseUser.email ?? '',
              displayName:
                firebaseUser.displayName ??
                (newProfile?.firstName && newProfile?.lastName
                  ? `${newProfile.firstName} ${newProfile.lastName}`
                  : 'User'),
              photoURL: firebaseUser.photoURL ?? newProfile?.profileImg ?? undefined,
              role: this.getUserRole(newProfile),
              isPremium: newProfile?.lastActivatedPlan !== 'free',
              hasCompletedOnboarding,
              provider: this.getProviderFromFirebase(firebaseUser),
              emailVerified: firebaseUser.emailVerified,
              createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            await this.authManager.setUser(authUser);
            this.analytics.setUserId(authUser.uid);
            this.analytics.setUserProperties({
              user_type: authUser.role,
              is_premium: authUser.isPremium,
              auth_provider: authUser.provider,
            });
            return;
          }
        } catch (createError) {
          console.error('[AuthFlowService] Failed to auto-create backend user:', createError);
        }

        // Fallback: Set basic user with hasCompletedOnboarding: false
        const authUser: AuthUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? '',
          displayName: firebaseUser.displayName ?? 'User',
          photoURL: firebaseUser.photoURL ?? undefined,
          role: 'athlete' as UserRole,
          isPremium: false,
          hasCompletedOnboarding: false, // No backend profile = not completed
          provider: this.getProviderFromFirebase(firebaseUser),
          emailVerified: firebaseUser.emailVerified,
          createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await this.authManager.setUser(authUser);
        return;
      }

      // Determine hasCompletedOnboarding from backend profile
      // Backend uses 'completeSignUp' field to track onboarding completion
      const hasCompletedOnboarding = Boolean(backendProfile?.completeSignUp);

      console.log('[AuthFlowService] Backend profile found:', {
        uid: firebaseUser.uid,
        hasFirstName: !!backendProfile.firstName,
        completeSignUp: backendProfile.completeSignUp,
        hasCompletedOnboarding,
      });

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
        hasCompletedOnboarding,
        provider: this.getProviderFromFirebase(firebaseUser),
        emailVerified: firebaseUser.emailVerified,
        createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

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
      // Fallback to basic Firebase data - new user hasn't completed onboarding
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
  private async processMicrosoftAuthResult(result: any, teamCode?: string): Promise<boolean> {
    // Check if this is a new user (Firebase detection can be unreliable)
    const isNewUser = result._tokenResponse?.isNewUser ?? false;

    console.log(`[AuthFlowService] 🔍 Firebase detected isNewUser: ${isNewUser} (Microsoft)`);

    // Track analytics
    this.analytics.trackEvent(isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN, {
      method: AUTH_METHODS.MICROSOFT,
    });
    this.analytics.setUserId(result.user.uid);
    this.analytics.setUserProperties({ user_type: this.user()?.role });

    // Set flag to prevent auth state listener from racing with user setup
    this.signupInProgress = true;

    try {
      // ALWAYS try to sync existing user first (Firebase isNewUser can be unreliable)
      console.log(`[AuthFlowService] 📡 Attempting to sync existing user profile... (Microsoft)`);
      await this.syncUserProfile(result.user);
      console.log(`[AuthFlowService] ✅ User profile sync successful - existing user (Microsoft)`);

      // Check if user needs onboarding
      const currentUser = this.user();
      const needsOnboarding = !currentUser?.hasCompletedOnboarding;

      if (needsOnboarding) {
        console.log(
          `[AuthFlowService] 🚀 Navigating to onboarding (existing user, incomplete) (Microsoft)`
        );
        await this.router.navigate([AUTH_ROUTES.ONBOARDING]);
      } else {
        console.log(
          `[AuthFlowService] 🏠 User already completed onboarding, navigating to /home (Microsoft)`
        );
        await this.router.navigate([AUTH_REDIRECTS.DEFAULT]);
      }
    } catch (syncError: any) {
      console.log(
        `[AuthFlowService] ❌ User sync failed, attempting to create new user (Microsoft):`,
        syncError
      );

      try {
        // User doesn't exist in backend, create new user
        console.log(`[AuthFlowService] 📝 Creating new user via Microsoft OAuth:`, {
          uid: result.user.uid,
          email: result.user.email!,
          teamCode: teamCode || 'none',
          referralId: 'none (OAuth - no referral code)',
        });

        const createResult = await this.authApi.createUser({
          uid: result.user.uid,
          email: result.user.email!,
          teamCode: teamCode || undefined,
          // Don't pass referralId for OAuth (same as email signup when no referral)
        });

        console.log(
          `[AuthFlowService] ✅ New user created successfully (Microsoft):`,
          createResult
        );

        // Now sync the newly created user
        await this.syncUserProfile(result.user);

        // Navigate to onboarding for new users
        console.log(`[AuthFlowService] 🚀 Navigating to onboarding (new user) (Microsoft)`);
        await this.router.navigate([AUTH_ROUTES.ONBOARDING]);
      } catch (createError: any) {
        console.error(`[AuthFlowService] ❌ Failed to create new user (Microsoft):`, createError);
        throw createError; // Re-throw to be handled by outer catch
      }
    } finally {
      // Always clear flag to prevent state leaks
      this.signupInProgress = false;
    }

    return true;
  }

  /**
   * Centralized OAuth error handling with specific Firebase service error detection
   */
  private handleOAuthError(err: any, provider: string): string {
    // Check for specific Firebase service unavailable errors
    const isServiceUnavailable =
      err?.code === 'auth/error-code:-47' ||
      err?.code === 'auth/internal-error' ||
      err?.message?.includes('503') ||
      err?.message?.includes('Service Unavailable');

    if (isServiceUnavailable) {
      return `${provider} sign-in service is temporarily unavailable due to Firebase server issues (Error -47). This usually resolves within 5-10 minutes. Please try again later or use an alternative sign-in method.`;
    } else if (err?.code === 'auth/popup-closed-by-user') {
      return 'Sign-in was cancelled. Please try again.';
    } else if (err?.code === 'auth/popup-blocked') {
      return 'Pop-up was blocked by your browser. Please allow pop-ups and try again.';
    } else {
      // Use centralized auth error handler for other errors
      const handledError = this.authErrorHandler.handle(err);
      return handledError.message;
    }
  }

  // ============================================
  // OAUTH AUTHENTICATION
  // ============================================

  /**
   * Sign in with Google with improved error handling
   * Supports optional team code for new user registration
   */
  async signInWithGoogle(teamCode?: string): Promise<boolean> {
    if (!this.firebaseAuth) {
      this.authManager.setError('Authentication not available');
      return false;
    }

    this.authManager.setLoading(true);
    this.authManager.setError(null);

    console.log('[AuthFlowService] 🎯 Starting Google OAuth (popup)...');

    try {
      // Dynamic imports for SSR safety
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');

      const provider = new GoogleAuthProvider();
      // Request email scope explicitly
      provider.addScope('email');
      provider.addScope('profile');

      const result = await signInWithPopup(this.firebaseAuth, provider);

      // Check if this is a new user (Firebase detection can be unreliable)
      // @ts-expect-error additionalUserInfo is on the result
      const isNewUser = result._tokenResponse?.isNewUser ?? false;

      console.log(`[AuthFlowService] 🔍 Firebase detected isNewUser: ${isNewUser}`);

      // Track analytics
      this.analytics.trackEvent(isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN, {
        method: AUTH_METHODS.GOOGLE,
      });
      this.analytics.setUserId(result.user.uid);
      this.analytics.setUserProperties({ user_type: this.user()?.role });

      // Set flag to prevent auth state listener from racing with user setup
      this.signupInProgress = true;

      try {
        // ALWAYS try to sync existing user first (Firebase isNewUser can be unreliable)
        console.log(`[AuthFlowService] 📡 Attempting to sync existing user profile...`);
        await this.syncUserProfile(result.user);
        console.log(`[AuthFlowService] ✅ User profile sync successful - existing user`);

        // Check if user needs onboarding
        const currentUser = this.user();
        const needsOnboarding = !currentUser?.hasCompletedOnboarding;

        if (needsOnboarding) {
          console.log(`[AuthFlowService] 🚀 Navigating to onboarding (existing user, incomplete)`);
          await this.router.navigate([AUTH_ROUTES.ONBOARDING]);
        } else {
          console.log(
            `[AuthFlowService] 🏠 User already completed onboarding, navigating to /home`
          );
          await this.router.navigate([AUTH_REDIRECTS.DEFAULT]);
        }
      } catch (syncError: any) {
        console.log(
          `[AuthFlowService] ❌ User sync failed, attempting to create new user:`,
          syncError
        );

        try {
          // User doesn't exist in backend, create new user
          console.log(`[AuthFlowService] 📝 Creating new user via OAuth:`, {
            uid: result.user.uid,
            email: result.user.email!,
            teamCode: teamCode || 'none',
            referralId: 'none (OAuth - no referral code)',
            apiEndpoint: 'http://localhost:3000/api/v1/staging/auth/create-user',
          });

          const createResult = await this.authApi.createUser({
            uid: result.user.uid,
            email: result.user.email!,
            teamCode: teamCode || undefined,
            // Don't pass referralId for OAuth (same as email signup when no referral)
          });

          console.log(`[AuthFlowService] ✅ New user created successfully (OAuth):`, createResult);

          // Now sync the newly created user
          await this.syncUserProfile(result.user);

          // Navigate to onboarding for new users
          console.log(`[AuthFlowService] 🚀 Navigating to onboarding (new user)`);
          await this.router.navigate([AUTH_ROUTES.ONBOARDING]);
        } catch (createError: any) {
          console.error(`[AuthFlowService] ❌ Failed to create new user:`, createError);
          throw createError; // Re-throw to be handled by outer catch
        }
      } finally {
        // Always clear flag to prevent state leaks
        this.signupInProgress = false;
      }

      return true;
    } catch (err: any) {
      console.error('[AuthFlowService] Google OAuth failed:', err);
      console.error('[AuthFlowService] Google OAuth Error details:', {
        code: err?.code,
        message: err?.message,
        customData: err?.customData,
      });

      // Check for specific Firebase service unavailable errors
      const isServiceUnavailable =
        err?.code === 'auth/error-code:-47' ||
        err?.code === 'auth/internal-error' ||
        err?.message?.includes('503') ||
        err?.message?.includes('Service Unavailable');

      let errorMessage: string;

      if (isServiceUnavailable) {
        errorMessage =
          'Google sign-in service is temporarily unavailable due to Firebase server issues (Error -47). This usually resolves within 5-10 minutes. Please try again later or use Microsoft/Email sign-in as an alternative.';
      } else if (err?.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in was cancelled. Please try again.';
      } else if (err?.code === 'auth/popup-blocked') {
        errorMessage = 'Pop-up was blocked by your browser. Please allow pop-ups and try again.';
      } else {
        // Use centralized auth error handler for other errors
        const handledError = this.authErrorHandler.handle(err);
        errorMessage = handledError.message;
      }

      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
        method: AUTH_METHODS.GOOGLE,
        error_code: err?.code || 'unknown',
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
  async signInWithMicrosoft(teamCode?: string): Promise<boolean> {
    if (!this.firebaseAuth) {
      this.authManager.setError('Authentication not available');
      return false;
    }

    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      // Dynamic imports for SSR safety
      const { OAuthProvider, signInWithPopup } = await import('firebase/auth');

      // Microsoft OAuth Provider
      const provider = new OAuthProvider('microsoft.com');

      provider.setCustomParameters({
        prompt: 'select_account',
        // tenant: 'common',
      });
      // Request common scopes
      // provider.addScope('email');
      // provider.addScope('profile');
      // provider.addScope('openid');

      console.log('[AuthFlowService] 🚀 Starting Microsoft OAuth (popup)...');
      const result = await signInWithPopup(this.firebaseAuth, provider);

      console.log('[AuthFlowService] ✅ Microsoft OAuth popup success:', {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
      });

      // Process result using helper method
      return await this.processMicrosoftAuthResult(result, teamCode);
    } catch (err: any) {
      console.error('[AuthFlowService] Microsoft sign in failed:', err);
      console.error('[AuthFlowService] Microsoft OAuth Error details:', {
        code: err?.code,
        message: err?.message,
        customData: err?.customData,
      });

      const errorMessage = this.handleOAuthError(err, 'Microsoft');

      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
        method: AUTH_METHODS.MICROSOFT,
        error_code: err?.code || 'unknown',
        recovery_action: err?.code === 'auth/error-code:-47' ? 'retry_later' : 'unknown',
      });

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
  async signInWithApple(teamCode?: string): Promise<boolean> {
    if (!this.firebaseAuth) {
      this.authManager.setError('Authentication not available');
      return false;
    }

    this.authManager.setLoading(true);
    this.authManager.setError(null);

    console.log('[AuthFlowService] 🍎 Starting Apple OAuth (popup)...');

    try {
      // Dynamic imports for SSR safety
      const { OAuthProvider, signInWithPopup } = await import('firebase/auth');

      // Apple OAuth Provider
      const provider = new OAuthProvider('apple.com');
      // Request common scopes for Apple
      provider.addScope('email');
      provider.addScope('name');

      const result = await signInWithPopup(this.firebaseAuth, provider);

      // Check if this is a new user (Firebase detection can be unreliable)
      // @ts-expect-error additionalUserInfo is on the result
      const isNewUser = result._tokenResponse?.isNewUser ?? false;

      console.log(`[AuthFlowService] 🔍 Firebase detected isNewUser: ${isNewUser} (Apple)`);

      // Track analytics
      this.analytics.trackEvent(isNewUser ? APP_EVENTS.AUTH_SIGNED_UP : APP_EVENTS.AUTH_SIGNED_IN, {
        method: AUTH_METHODS.APPLE,
      });
      this.analytics.setUserId(result.user.uid);
      this.analytics.setUserProperties({ user_type: this.user()?.role });

      // Set flag to prevent auth state listener from racing with user setup
      this.signupInProgress = true;

      try {
        // ALWAYS try to sync existing user first (Firebase isNewUser can be unreliable)
        console.log(`[AuthFlowService] 📡 Attempting to sync existing user profile... (Apple)`);
        await this.syncUserProfile(result.user);
        console.log(`[AuthFlowService] ✅ User profile sync successful - existing user (Apple)`);

        // Check if user needs onboarding
        const currentUser = this.user();
        const needsOnboarding = !currentUser?.hasCompletedOnboarding;

        if (needsOnboarding) {
          console.log(
            `[AuthFlowService] 🚀 Navigating to onboarding (existing user, incomplete) (Apple)`
          );
          await this.router.navigate([AUTH_ROUTES.ONBOARDING]);
        } else {
          console.log(
            `[AuthFlowService] 🏠 User already completed onboarding, navigating to /home (Apple)`
          );
          await this.router.navigate([AUTH_REDIRECTS.DEFAULT]);
        }
      } catch (syncError: any) {
        console.log(
          `[AuthFlowService] ❌ User sync failed, attempting to create new user (Apple):`,
          syncError
        );

        try {
          // User doesn't exist in backend, create new user
          console.log(`[AuthFlowService] 📝 Creating new user via Apple OAuth:`, {
            uid: result.user.uid,
            email: result.user.email!,
            teamCode: teamCode || 'none',
            referralId: 'none (OAuth - no referral code)',
          });

          const createResult = await this.authApi.createUser({
            uid: result.user.uid,
            email: result.user.email!,
            teamCode: teamCode || undefined,
            // Don't pass referralId for OAuth (same as email signup when no referral)
          });

          console.log(`[AuthFlowService] ✅ New user created successfully (Apple):`, createResult);

          // Now sync the newly created user
          await this.syncUserProfile(result.user);

          // Navigate to onboarding for new users
          console.log(`[AuthFlowService] 🚀 Navigating to onboarding (new user) (Apple)`);
          await this.router.navigate([AUTH_ROUTES.ONBOARDING]);
        } catch (createError: any) {
          console.error(`[AuthFlowService] ❌ Failed to create new user (Apple):`, createError);
          throw createError; // Re-throw to be handled by outer catch
        }
      } finally {
        // Always clear flag to prevent state leaks
        this.signupInProgress = false;
      }

      return true;
    } catch (err: any) {
      console.error('[AuthFlowService] Apple sign in failed:', err);
      console.error('[AuthFlowService] Apple OAuth Error details:', {
        code: err?.code,
        message: err?.message,
        customData: err?.customData,
      });

      const errorMessage = this.handleOAuthError(err, 'Apple');

      this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNIN_ERROR, {
        method: AUTH_METHODS.APPLE,
        error_code: err?.code || 'unknown',
        recovery_action: err?.code === 'auth/error-code:-47' ? 'retry_later' : 'unknown',
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
    // before we create the backend user
    this.signupInProgress = true;
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

      try {
        // Create user in backend
        console.log(`[AuthFlowService] 📝 Creating new user via Email signup:`, {
          uid: result.user.uid,
          email: credentials.email,
          teamCode: credentials.teamCode || 'none',
          referralId: credentials.referralId || 'none',
          apiEndpoint: 'http://localhost:3000/api/v1/staging/auth/create-user',
        });

        const createResult = await this.authApi.createUser({
          uid: result.user.uid,
          email: credentials.email,
          teamCode: credentials.teamCode,
          referralId: credentials.referralId,
        });

        console.log(`[AuthFlowService] ✅ Email signup user created:`, createResult);

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

        // Set user state BEFORE navigating (required for onboarding page)
        await this.syncUserProfile(result.user);

        // Navigate to onboarding
        await this.router.navigate([AUTH_ROUTES.ONBOARDING]);
        return true;
      } finally {
        // Always clear flag to prevent state leaks
        this.signupInProgress = false;
      }
    } catch (err) {
      console.error('[AuthFlowService] Sign up failed:', err);

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
      console.error('[AuthFlowService] Password reset failed:', err);

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

  /**
   * Upload profile photo to Firebase Storage
   * @param file - Image file to upload
   * @param userId - User's Firebase UID
   * @returns Download URL of uploaded image
   */
  async uploadProfilePhoto(file: File, userId: string): Promise<string> {
    if (!this.platform.isBrowser()) {
      throw new Error('File upload only available in browser');
    }

    try {
      // Dynamically import Firebase Storage
      const { Storage } = await import('@angular/fire/storage');
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');

      const storage = this.injector.get(Storage);

      // Create reference to user's profile photo
      const fileName = `profile_${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `users/${userId}/profile/${fileName}`);

      // Upload file
      await uploadBytes(storageRef, file);

      // Get download URL
      const downloadURL = await getDownloadURL(storageRef);

      return downloadURL;
    } catch (error) {
      console.error('[AuthFlowService] Photo upload failed:', error);
      throw new Error('Failed to upload photo. Please try again.');
    }
  }
}
