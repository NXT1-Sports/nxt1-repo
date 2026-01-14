/**
 * Firebase Auth Service - Low-level Firebase Operations
 *
 * Handles direct Firebase SDK operations for authentication.
 * This service is platform-specific (uses AngularFire) but provides
 * the same interface as web's browser-auth.service.ts internals.
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   Components (UI Layer)                    │
 * │              LoginPage, SignupPage, etc.                   │
 * ├────────────────────────────────────────────────────────────┤
 * │              ⭐ AuthFlowService (Business Logic) ⭐         │
 * │           Orchestrates state, navigation, analytics        │
 * ├────────────────────────────────────────────────────────────┤
 * │         ⭐ FirebaseAuthService (THIS FILE) ⭐              │
 * │           Firebase SDK operations only                     │
 * ├────────────────────────────────────────────────────────────┤
 * │               @angular/fire/auth (SDK)                     │
 * └────────────────────────────────────────────────────────────┘
 *
 * @module @nxt1/mobile/features/auth
 */
import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import {
  Auth,
  User as FirebaseUser,
  UserCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  authState,
  GoogleAuthProvider,
  signInWithPopup,
  OAuthProvider,
} from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import { NxtPlatformService } from '@nxt1/ui/services';
import type { FirebaseUserInfo } from '@nxt1/core';

/**
 * Firebase Auth Service
 *
 * Low-level service that handles all Firebase Authentication SDK operations.
 * Does NOT handle business logic, navigation, or state management.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseAuthService implements OnDestroy {
  private readonly auth = inject(Auth);
  private readonly platform = inject(NxtPlatformService);

  private authStateSubscription?: Subscription;

  // Store authState observable reference during injection context
  private readonly authState$ = authState(this.auth);

  // Firebase user state
  private readonly _firebaseUser = signal<FirebaseUser | null>(null);
  readonly firebaseUser = this._firebaseUser.asReadonly();
  readonly isAuthenticated = computed(() => this._firebaseUser() !== null);

  constructor() {
    this.initAuthStateListener();
  }

  ngOnDestroy(): void {
    this.authStateSubscription?.unsubscribe();
  }

  // ============================================
  // AUTH STATE
  // ============================================

  /**
   * Initialize Firebase auth state listener
   */
  private initAuthStateListener(): void {
    if (!this.platform.isBrowser()) return;

    this.authStateSubscription = this.authState$.subscribe((user) => {
      this._firebaseUser.set(user);
    });
  }

  /**
   * Get current Firebase user
   */
  getCurrentUser(): FirebaseUser | null {
    return this.auth.currentUser;
  }

  /**
   * Get Firebase user info in portable format
   */
  getFirebaseUserInfo(user?: FirebaseUser | null): FirebaseUserInfo | null {
    const fbUser = user ?? this._firebaseUser();
    if (!fbUser) return null;

    return {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: fbUser.displayName,
      photoURL: fbUser.photoURL,
      emailVerified: fbUser.emailVerified,
      metadata: {
        creationTime: fbUser.metadata?.creationTime,
        lastSignInTime: fbUser.metadata?.lastSignInTime,
      },
    };
  }

  // ============================================
  // EMAIL/PASSWORD AUTH
  // ============================================

  /**
   * Sign in with email and password
   */
  async signInWithEmail(email: string, password: string): Promise<UserCredential> {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  /**
   * Create user with email and password
   */
  async createUserWithEmail(email: string, password: string): Promise<UserCredential> {
    return createUserWithEmailAndPassword(this.auth, email, password);
  }

  /**
   * Update user profile
   */
  async updateUserProfile(displayName?: string, photoURL?: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No user signed in');

    const updates: { displayName?: string; photoURL?: string } = {};
    if (displayName !== undefined) updates.displayName = displayName;
    if (photoURL !== undefined) updates.photoURL = photoURL;

    await updateProfile(user, updates);
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  // ============================================
  // SOCIAL AUTH
  // ============================================

  /**
   * Sign in with Google
   */
  async signInWithGoogle(): Promise<UserCredential> {
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    return signInWithPopup(this.auth, provider);
  }

  /**
   * Sign in with Apple
   */
  async signInWithApple(): Promise<UserCredential> {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    return signInWithPopup(this.auth, provider);
  }

  /**
   * Sign in with Microsoft
   */
  async signInWithMicrosoft(): Promise<UserCredential> {
    const provider = new OAuthProvider('microsoft.com');
    provider.addScope('user.read');
    return signInWithPopup(this.auth, provider);
  }

  // ============================================
  // SIGN OUT
  // ============================================

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    return firebaseSignOut(this.auth);
  }

  // ============================================
  // TOKEN MANAGEMENT
  // ============================================

  /**
   * Get current ID token
   */
  async getIdToken(forceRefresh = false): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
    return user.getIdToken(forceRefresh);
  }

  /**
   * Get provider from Firebase user
   */
  getProviderFromUser(user?: FirebaseUser | null): 'email' | 'google' | 'apple' | 'microsoft' | 'anonymous' {
    const fbUser = user ?? this._firebaseUser();
    if (!fbUser) return 'anonymous';

    const providerId = fbUser.providerData[0]?.providerId;
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
        return fbUser.isAnonymous ? 'anonymous' : 'email';
    }
  }
}
