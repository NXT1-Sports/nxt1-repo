/**
 * Auth Flow Service - Business Logic Orchestrator
 *
 * Orchestrates authentication flows by coordinating between:
 * - Firebase Auth (SDK operations)
 * - Auth API (Backend HTTP calls)
 * - Router (Navigation)
 * - State management
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
 * │        AuthApiService          FirebaseAuthService         │
 * │        (Backend API)           (Firebase SDK)              │
 * └────────────────────────────────────────────────────────────┘
 *
 * SSR Compatibility:
 * - Uses optional injection for Firebase Auth (not available on server)
 * - All Firebase operations are browser-only
 * - Server renders with default unauthenticated state
 *
 * @module @nxt1/web/features/auth
 */
import {
  Injectable,
  inject,
  signal,
  computed,
  PLATFORM_ID,
  InjectionToken,
  Injector,
  OnDestroy,
  runInInjectionContext,
} from '@angular/core';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';

// Type-only imports - these don't cause runtime code to execute
import type { Auth as FirebaseAuthType, User as FirebaseUser } from '@angular/fire/auth';

import { AuthApiService } from './auth-api.service';
import type { UserRole } from '@nxt1/core';

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

export interface AuthState {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  isPremium: boolean;
  hasCompletedOnboarding: boolean;
  createdAt: string;
  updatedAt: string;
}

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
 * Uses signals for reactive state management.
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
  private readonly platformId = inject(PLATFORM_ID);
  private readonly injector = inject(Injector);
  private readonly authApi = inject(AuthApiService);

  /**
   * Firebase Auth instance - lazy loaded, null on server (SSR)
   * We don't inject Auth directly because @angular/fire/auth module
   * initialization throws NG0401 on the server.
   */
  private firebaseAuth: Auth | null = null;
  private authStateSubscription?: Subscription;

  // ============================================
  // STATE SIGNALS (Private Writable)
  // ============================================
  private readonly _user = signal<AppUser | null>(null);
  private readonly _firebaseUser = signal<FirebaseUser | null>(null);
  private readonly _isLoading = signal(true);
  private readonly _error = signal<string | null>(null);
  private readonly _isInitialized = signal(false);

  // ============================================
  // PUBLIC COMPUTED SIGNALS (Read-only)
  // ============================================
  readonly user = computed(() => this._user());
  readonly firebaseUser = computed(() => this._firebaseUser());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());
  readonly isInitialized = computed(() => this._isInitialized());

  readonly isAuthenticated = computed(() => this._firebaseUser() !== null);

  readonly userRole = computed(() => this._user()?.role ?? null);
  readonly isPremium = computed(() => this._user()?.isPremium ?? false);
  readonly hasCompletedOnboarding = computed(() => this._user()?.hasCompletedOnboarding ?? false);

  // ============================================
  // INITIALIZATION
  // ============================================

  constructor() {
    // Initialize auth state listener (browser only)
    if (isPlatformBrowser(this.platformId)) {
      this.initializeOnBrowser();
    } else {
      // On server, mark as initialized with no user
      this._isLoading.set(false);
      this._isInitialized.set(true);
    }
  }

  ngOnDestroy(): void {
    this.authStateSubscription?.unsubscribe();
  }

  /**
   * Lazy-load Firebase Auth on browser only
   * This prevents @angular/fire module from initializing on the server
   */
  private async initializeOnBrowser(): Promise<void> {
    try {
      // Dynamically import the Auth token and inject it
      const { Auth } = await import('@angular/fire/auth');
      this.firebaseAuth = this.injector.get(Auth, null);

      if (this.firebaseAuth) {
        this.initAuthStateListener();
      } else {
        this._isLoading.set(false);
        this._isInitialized.set(true);
      }
    } catch (err) {
      console.error('[AuthFlowService] Failed to initialize Firebase Auth:', err);
      this._isLoading.set(false);
      this._isInitialized.set(true);
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
        this._isLoading.set(true);

        try {
          this._firebaseUser.set(firebaseUser);

          if (firebaseUser) {
            // User is signed in - fetch profile from backend
            await this.syncUserProfile(firebaseUser);
          } else {
            // User is signed out
            this._user.set(null);
          }
        } catch (err) {
          console.error('[AuthFlowService] Auth state sync failed:', err);
          this._error.set(err instanceof Error ? err.message : 'Authentication error');
        } finally {
          this._isLoading.set(false);
          this._isInitialized.set(true);
        }
      });
    });
  }

  /**
   * Sync user profile from Firebase user
   * TODO: Fetch full profile from backend API when available
   */
  private async syncUserProfile(firebaseUser: FirebaseUser): Promise<void> {
    try {
      // For now, create a basic user from Firebase data
      // TODO: Replace with backend API call when profile endpoint is ready
      this._user.set({
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        displayName: firebaseUser.displayName ?? 'User',
        photoURL: firebaseUser.photoURL ?? undefined,
        role: 'athlete' as UserRole,
        isPremium: false,
        hasCompletedOnboarding: false, // Will be determined by backend
        createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[AuthFlowService] Failed to sync user profile:', err);
      // Don't clear user on profile fetch failure - may be temporary
    }
  }

  // ============================================
  // SIGN IN METHODS
  // ============================================

  /**
   * Sign in with email and password
   */
  async signInWithEmail(credentials: SignInCredentials): Promise<boolean> {
    if (!this.firebaseAuth) {
      this._error.set('Authentication not available');
      return false;
    }

    this._isLoading.set(true);
    this._error.set(null);

    try {
      // Dynamic import for SSR safety
      const { signInWithEmailAndPassword } = await import('firebase/auth');

      await signInWithEmailAndPassword(this.firebaseAuth, credentials.email, credentials.password);

      // Navigate to home or onboarding
      const redirectPath = this.hasCompletedOnboarding() ? '/home' : '/auth/onboarding';

      await this.router.navigate([redirectPath]);
      return true;
    } catch (err) {
      const message = this.getFirebaseErrorMessage(err);
      this._error.set(message);
      return false;
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle(): Promise<boolean> {
    if (!this.firebaseAuth) {
      this._error.set('Authentication not available');
      return false;
    }

    this._isLoading.set(true);
    this._error.set(null);

    try {
      // Dynamic imports for SSR safety
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(this.firebaseAuth, provider);

      // Check if this is a new user
      // @ts-expect-error additionalUserInfo is on the result
      const isNewUser = result._tokenResponse?.isNewUser ?? false;

      if (isNewUser) {
        // Create user in backend
        await this.authApi.createUser({
          uid: result.user.uid,
          email: result.user.email!,
        });

        await this.router.navigate(['/auth/onboarding']);
      } else {
        const redirectPath = this.hasCompletedOnboarding() ? '/home' : '/auth/onboarding';

        await this.router.navigate([redirectPath]);
      }

      return true;
    } catch (err) {
      const message = this.getFirebaseErrorMessage(err);
      this._error.set(message);
      return false;
    } finally {
      this._isLoading.set(false);
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
      this._error.set('Authentication not available');
      return false;
    }

    this._isLoading.set(true);
    this._error.set(null);

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

      // Navigate to onboarding
      await this.router.navigate(['/auth/onboarding']);
      return true;
    } catch (err) {
      const message = this.getFirebaseErrorMessage(err);
      this._error.set(message);
      return false;
    } finally {
      this._isLoading.set(false);
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

    this._isLoading.set(true);

    try {
      // Dynamic import for SSR safety
      const { signOut } = await import('firebase/auth');

      await signOut(this.firebaseAuth);
      this._user.set(null);
      this._firebaseUser.set(null);
      await this.router.navigate(['/explore']);
    } catch (err) {
      console.error('[AuthFlowService] Sign out failed:', err);
      this._error.set('Failed to sign out');
    } finally {
      this._isLoading.set(false);
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
      this._error.set('Authentication not available');
      return false;
    }

    this._isLoading.set(true);
    this._error.set(null);

    try {
      // Dynamic import for SSR safety
      const { sendPasswordResetEmail } = await import('firebase/auth');

      await sendPasswordResetEmail(this.firebaseAuth, email);
      return true;
    } catch (err) {
      const message = this.getFirebaseErrorMessage(err);
      this._error.set(message);
      return false;
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Clear current error
   */
  clearError(): void {
    this._error.set(null);
  }

  /**
   * Get ID token for authenticated requests
   */
  async getIdToken(): Promise<string | null> {
    const user = this._firebaseUser();
    if (!user) return null;

    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }

  /**
   * Force refresh user profile from backend
   */
  async refreshUserProfile(): Promise<void> {
    const firebaseUser = this._firebaseUser();
    if (firebaseUser) {
      await this.syncUserProfile(firebaseUser);
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Extract user-friendly error message from Firebase error
   */
  private getFirebaseErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      // Firebase error codes
      const code = (error as { code?: string }).code;

      switch (code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          return 'Invalid email or password';
        case 'auth/email-already-in-use':
          return 'An account with this email already exists';
        case 'auth/weak-password':
          return 'Password should be at least 6 characters';
        case 'auth/invalid-email':
          return 'Please enter a valid email address';
        case 'auth/too-many-requests':
          return 'Too many attempts. Please try again later';
        case 'auth/network-request-failed':
          return 'Network error. Please check your connection';
        case 'auth/popup-closed-by-user':
          return 'Sign in was cancelled';
        default:
          return error.message || 'An unexpected error occurred';
      }
    }

    return 'An unexpected error occurred';
  }
}
