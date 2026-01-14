/**
 * Auth Flow Service - Business Logic Orchestrator (Mobile)
 *
 * Orchestrates authentication flows by coordinating between:
 * - FirebaseAuthService (SDK operations)
 * - AuthApiService (Backend HTTP calls)
 * - Router (Navigation)
 * - State management (via @nxt1/core AuthStateManager)
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
import { Router } from '@angular/router';
import { NxtPlatformService, HapticsService } from '@nxt1/ui/services';
import {
  type UserRole,
  type AuthState as CoreAuthState,
  type AuthStateManager,
  type AuthUser,
  createAuthStateManager,
  createCapacitorStorageAdapter,
  createBrowserStorageAdapter,
  createMemoryStorageAdapter,
  getAuthErrorMessage,
  isCapacitor,
  INITIAL_AUTH_STATE,
} from '@nxt1/core';
import { CapacitorHttpAdapter } from '../../../core/infrastructure';
import { AuthApiService } from './auth-api.service';
import { FirebaseAuthService } from './firebase-auth.service';

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
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly haptics = inject(HapticsService);
  private readonly httpAdapter = inject(CapacitorHttpAdapter);
  private readonly authApi = inject(AuthApiService);
  private readonly firebaseAuth = inject(FirebaseAuthService);

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
  readonly hasCompletedOnboarding = computed(() => this._state().user?.hasCompletedOnboarding ?? false);

  // Additional mobile-specific computed
  readonly displayName = computed(() => this.user()?.displayName ?? 'User');
  readonly photoURL = computed(() => this.user()?.photoURL);

  constructor() {
    this.initializeAuthManager();
  }

  ngOnDestroy(): void {
    // Cleanup handled by auth manager
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
    // - Native (Capacitor): Capacitor Preferences (secure storage)
    // - Browser: localStorage
    let storage;
    if (!this.platform.isBrowser()) {
      storage = createMemoryStorageAdapter();
    } else if (isCapacitor()) {
      storage = await createCapacitorStorageAdapter();
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

          // Sync profile
          await this.syncUserProfile(firebaseUser.uid);
        } else {
          // No user - reset state
          this.httpAdapter.setAuthToken(null);
          await this.authManager.reset();
        }
      } catch (err) {
        console.error('[AuthFlowService] Auth state sync failed:', err);
        this.authManager.setError(err instanceof Error ? err.message : 'Authentication error');
      } finally {
        this.authManager.setLoading(false);
        this.authManager.setInitialized(true);
      }
    };

    // Initial check
    checkAuth();
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

      // Create AuthUser from Firebase data
      // Note: Full profile data will be fetched from backend API
      const authUser: AuthUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        displayName: firebaseUser.displayName ?? 'User',
        photoURL: firebaseUser.photoURL ?? undefined,
        role: 'athlete' as UserRole, // Default - should come from backend
        isPremium: false, // Should come from backend
        hasCompletedOnboarding: false, // Should come from backend
        provider,
        emailVerified: firebaseUser.emailVerified,
        createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.authManager.setUser(authUser);
    } catch (err) {
      console.error('[AuthFlowService] Failed to sync user profile:', err);
    }
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

      // Get token and update HTTP adapter
      const token = await result.user.getIdToken();
      this.httpAdapter.setAuthToken(token);
      await this.authManager.setToken({
        token,
        expiresAt: Date.now() + 55 * 60 * 1000,
        userId: result.user.uid,
      });

      // Sync profile
      await this.syncUserProfile(result.user.uid);

      // Navigate to appropriate screen
      const redirectPath = this.hasCompletedOnboarding() ? '/home' : '/auth/onboarding';
      await this.router.navigate([redirectPath]);

      return true;
    } catch (err) {
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
        await this.router.navigate(['/auth/onboarding']);
      } else {
        await this.syncUserProfile(result.user.uid);
        const redirectPath = this.hasCompletedOnboarding() ? '/home' : '/auth/onboarding';
        await this.router.navigate([redirectPath]);
      }

      return true;
    } catch (err) {
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
        await this.router.navigate(['/auth/onboarding']);
      } else {
        await this.syncUserProfile(result.user.uid);
        const redirectPath = this.hasCompletedOnboarding() ? '/home' : '/auth/onboarding';
        await this.router.navigate([redirectPath]);
      }

      return true;
    } catch (err) {
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
        await this.router.navigate(['/auth/onboarding']);
      } else {
        await this.syncUserProfile(result.user.uid);
        const redirectPath = this.hasCompletedOnboarding() ? '/home' : '/auth/onboarding';
        await this.router.navigate([redirectPath]);
      }

      return true;
    } catch (err) {
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
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      // Create Firebase user
      const result = await this.firebaseAuth.createUserWithEmail(
        credentials.email,
        credentials.password
      );

      // Update profile with display name
      if (credentials.firstName || credentials.lastName) {
        const displayName = [credentials.firstName, credentials.lastName]
          .filter(Boolean)
          .join(' ');
        await this.firebaseAuth.updateUserProfile(displayName);
      }

      // Get token
      const token = await result.user.getIdToken();
      this.httpAdapter.setAuthToken(token);
      await this.authManager.setToken({
        token,
        expiresAt: Date.now() + 55 * 60 * 1000,
        userId: result.user.uid,
      });

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

      // Navigate to onboarding
      await this.router.navigate(['/auth/onboarding']);
      return true;
    } catch (err) {
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
      return true;
    } catch (err) {
      const message = getAuthErrorMessage(err);
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
      await this.firebaseAuth.signOut();
      this.httpAdapter.setAuthToken(null);
      await this.authManager.reset();
      await this.router.navigate(['/auth/login']);
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
}
