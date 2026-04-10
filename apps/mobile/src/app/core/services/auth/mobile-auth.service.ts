/**
 * @fileoverview Mobile Auth Service
 *
 * Ionic/Capacitor auth service that wraps @nxt1/core auth infrastructure.
 * Uses native storage adapter with static imports for iOS/Android compatibility.
 *
 * Architecture:
 * - Uses createAuthStateManager from @nxt1/core
 * - Uses createNativeStorageAdapter for native storage (static imports)
 * - Provides Angular signals for reactive UI binding
 * - Handles Firebase auth operations (sign in, sign up, etc.)
 */

import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular/standalone';
import { NxtPlatformService } from '@nxt1/ui';
import {
  createAuthStateManager,
  createBrowserStorageAdapter,
  createMemoryStorageAdapter,
  isCapacitor,
  type AuthStateManager,
  type AuthUser,
  type AuthState,
  type SignInCredentials,
  type SignUpCredentials,
  getAuthErrorMessage,
  INITIAL_AUTH_STATE,
} from '@nxt1/core';
import { createNativeStorageAdapter } from '../../../core/infrastructure/native-storage.adapter';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  authState,
  sendPasswordResetEmail,
  updateProfile,
  type User as FirebaseUser,
} from '@angular/fire/auth';
import { Subscription } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MobileAuthService implements OnDestroy {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly navController = inject(NavController);
  private readonly platform = inject(NxtPlatformService);

  private authManager!: AuthStateManager;
  private authStateSubscription?: Subscription;

  // Store authState observable reference during injection context
  private readonly authState$ = authState(this.auth);

  // Angular signals derived from auth state
  private readonly _state = signal<AuthState>(INITIAL_AUTH_STATE);

  // Public readonly signals
  readonly state = this._state.asReadonly();
  readonly user = computed(() => this._state().user);
  readonly isAuthenticated = computed(() => this._state().user !== null);
  readonly isLoading = computed(() => this._state().isLoading);
  readonly isInitialized = computed(() => this._state().isInitialized);
  readonly error = computed(() => this._state().error);

  // Additional computed signals
  readonly displayName = computed(() => this.user()?.displayName ?? 'User');
  readonly profileImg = computed(() => this.user()?.profileImg);

  constructor() {
    this.initializeAuthManager();
  }

  ngOnDestroy(): void {
    this.authStateSubscription?.unsubscribe();
  }

  /**
   * Initialize the auth state manager with appropriate storage adapter
   */
  private async initializeAuthManager(): Promise<void> {
    // Use appropriate storage based on platform:
    // - Server (SSR): memory storage
    // - Native (Capacitor): Native storage with static imports (iOS-safe)
    // - Browser: localStorage
    let storage;
    if (!this.platform.isBrowser()) {
      storage = createMemoryStorageAdapter();
    } else if (isCapacitor()) {
      storage = createNativeStorageAdapter();
    } else {
      storage = createBrowserStorageAdapter();
    }

    this.authManager = createAuthStateManager(storage);

    // Subscribe to state changes from manager
    this.authManager.subscribe((state) => {
      this._state.set(state);
    });

    // Initialize manager (restore persisted state)
    await this.authManager.initialize();

    // Listen to Firebase auth state changes
    this.setupFirebaseAuthListener();
  }

  /**
   * Listen to Firebase auth state and sync with our state manager
   * Uses AngularFire's authState observable which is zone-aware
   */
  private setupFirebaseAuthListener(): void {
    if (!this.platform.isBrowser()) return;

    // Use AngularFire's authState observable (created in injection context)
    this.authStateSubscription = this.authState$.subscribe(async (firebaseUser) => {
      if (firebaseUser) {
        // User signed in - sync with our state
        await this.syncFirebaseUser(firebaseUser);
      } else {
        // User signed out
        await this.authManager.reset();
      }
    });
  }

  /**
   * Sync Firebase user to our auth state
   */
  private async syncFirebaseUser(firebaseUser: FirebaseUser): Promise<void> {
    // Map Firebase user to our AuthUser type
    // ⭐ profileImg: NEVER use Firebase/Google photoURL — only backend profile images.
    const authUser: AuthUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      displayName: firebaseUser.displayName ?? 'User',
      profileImg: undefined,
      role: 'athlete', // Default role - should come from backend
      hasCompletedOnboarding: false, // Should come from backend
      provider: this.getProviderFromFirebase(firebaseUser),
      emailVerified: firebaseUser.emailVerified,
      createdAt: firebaseUser.metadata?.creationTime ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Set Firebase user info for token operations
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
      providerData: (firebaseUser.providerData ?? []).map((p) => ({ providerId: p.providerId })),
    });

    // Note: Token injection is handled per-request by CapacitorHttpAdapter's
    // tokenProvider. No need to store a static token snapshot here.

    await this.authManager.setUser(authUser);
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

  // ============================================
  // PUBLIC AUTH METHODS
  // ============================================

  /**
   * Sign in with email and password
   */
  async signIn(credentials: SignInCredentials): Promise<void> {
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      await signInWithEmailAndPassword(this.auth, credentials.email, credentials.password);
      // Firebase listener will handle state update
      await this.navController.navigateRoot('/home');
    } catch (error) {
      const message = getAuthErrorMessage(error);
      this.authManager.setError(message);
      throw new Error(message);
    } finally {
      this.authManager.setLoading(false);
    }
  }

  /**
   * Sign up with email and password
   */
  async signUp(credentials: SignUpCredentials): Promise<void> {
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      const result = await createUserWithEmailAndPassword(
        this.auth,
        credentials.email,
        credentials.password
      );

      // Update profile with display name
      if (credentials.firstName || credentials.lastName) {
        const displayName = [credentials.firstName, credentials.lastName].filter(Boolean).join(' ');
        await updateProfile(result.user, { displayName });
      }

      // Firebase listener will handle state update
      await this.navController.navigateRoot('/home');
    } catch (error) {
      const message = getAuthErrorMessage(error);
      this.authManager.setError(message);
      throw new Error(message);
    } finally {
      this.authManager.setLoading(false);
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    this.authManager.setLoading(true);

    try {
      await firebaseSignOut(this.auth);
      await this.authManager.reset();
      await this.navController.navigateRoot('/auth');
    } catch (error) {
      const message = getAuthErrorMessage(error);
      this.authManager.setError(message);
      throw new Error(message);
    } finally {
      this.authManager.setLoading(false);
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email: string): Promise<void> {
    this.authManager.setLoading(true);
    this.authManager.setError(null);

    try {
      await sendPasswordResetEmail(this.auth, email);
    } catch (error) {
      const message = getAuthErrorMessage(error);
      this.authManager.setError(message);
      throw new Error(message);
    } finally {
      this.authManager.setLoading(false);
    }
  }

  /**
   * Get current Firebase ID token
   */
  async getIdToken(): Promise<string | null> {
    const firebaseUser = this.auth.currentUser;
    if (!firebaseUser) return null;
    return firebaseUser.getIdToken();
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.authManager.setError(null);
  }
}
