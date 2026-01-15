/**
 * Firebase Auth Service - Low-level Firebase Operations
 *
 * Handles direct Firebase SDK operations for authentication.
 * Uses native Capacitor plugins for social auth on iOS/Android,
 * with web SDK fallback for development/PWA.
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
 * │           Firebase SDK + Native Auth integration           │
 * ├────────────────────────────────────────────────────────────┤
 * │      NativeAuthService          @angular/fire/auth         │
 * │      (Capacitor plugins)        (Web SDK fallback)         │
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
  signInWithCredential,
  OAuthProvider,
  OAuthCredential,
} from '@angular/fire/auth';
import { Capacitor } from '@capacitor/core';
import { Subscription } from 'rxjs';
import { NxtPlatformService } from '@nxt1/ui/services';
import type { FirebaseUserInfo, NativeAuthResult } from '@nxt1/core';
import { NativeAuthService } from './native-auth.service';

/**
 * Firebase Auth Service
 *
 * Low-level service that handles all Firebase Authentication SDK operations.
 * Does NOT handle business logic, navigation, or state management.
 *
 * Uses native Capacitor plugins for social auth on iOS/Android for:
 * - Native system UI (better UX)
 * - App Store compliance (required for Apple Sign-In on iOS)
 * - Better security (no web popup/redirect)
 */
@Injectable({ providedIn: 'root' })
export class FirebaseAuthService implements OnDestroy {
  private readonly auth = inject(Auth);
  private readonly platform = inject(NxtPlatformService);
  private readonly nativeAuth = inject(NativeAuthService);

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
  // SOCIAL AUTH (Native + Web Fallback)
  // ============================================

  /**
   * Check if native auth is available (iOS/Android)
   */
  get isNativeAuthAvailable(): boolean {
    return this.nativeAuth.isNativeAvailable;
  }

  /**
   * Sign in with Google
   *
   * - Native (iOS/Android): Uses Google Sign-In SDK via Capacitor
   * - Web fallback: Uses Firebase signInWithPopup
   *
   * @returns UserCredential from Firebase Auth
   * @throws Error on failure (cancellation returns null internally, but this throws)
   */
  async signInWithGoogle(): Promise<UserCredential> {
    // Use native auth on iOS/Android
    if (this.nativeAuth.isNativeAvailable) {
      console.debug('[FirebaseAuthService] Using native Google Sign-In');
      const nativeResult = await this.nativeAuth.signInWithGoogle();

      // User cancelled
      if (!nativeResult) {
        throw new Error('Sign-in was cancelled');
      }

      // Convert native result to Firebase credential
      return this.signInWithNativeCredential(nativeResult);
    }

    // Web fallback (development/PWA)
    console.debug('[FirebaseAuthService] Using web Google Sign-In (fallback)');
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    return signInWithPopup(this.auth, provider);
  }

  /**
   * Sign in with Apple
   *
   * - Native (iOS): Uses ASAuthorizationController via Capacitor (REQUIRED by App Store)
   * - Web fallback: Uses Firebase signInWithPopup
   *
   * Note: Apple Sign-In is required on iOS if you offer any social login.
   *
   * @returns UserCredential from Firebase Auth
   * @throws Error on failure
   */
  async signInWithApple(): Promise<UserCredential> {
    // Use native auth on iOS/Android
    if (this.nativeAuth.isNativeAvailable) {
      console.debug('[FirebaseAuthService] Using native Apple Sign-In');
      const nativeResult = await this.nativeAuth.signInWithApple();

      // User cancelled
      if (!nativeResult) {
        throw new Error('Sign-in was cancelled');
      }

      // Convert native result to Firebase credential
      return this.signInWithNativeCredential(nativeResult);
    }

    // Web fallback (development/PWA)
    console.debug('[FirebaseAuthService] Using web Apple Sign-In (fallback)');
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    return signInWithPopup(this.auth, provider);
  }

  /**
   * Sign in with Microsoft
   *
   * - Native (iOS/Android): Uses OAuth flow via Capacitor
   * - Web fallback: Uses Firebase signInWithPopup
   *
   * @returns UserCredential from Firebase Auth
   * @throws Error on failure
   */
  async signInWithMicrosoft(): Promise<UserCredential> {
    // Use native auth on iOS/Android
    if (this.nativeAuth.isNativeAvailable) {
      console.debug('[FirebaseAuthService] Using native Microsoft Sign-In');
      const nativeResult = await this.nativeAuth.signInWithMicrosoft();

      // User cancelled
      if (!nativeResult) {
        throw new Error('Sign-in was cancelled');
      }

      // Convert native result to Firebase credential
      return this.signInWithNativeCredential(nativeResult);
    }

    // Web fallback (development/PWA)
    console.debug('[FirebaseAuthService] Using web Microsoft Sign-In (fallback)');
    const provider = new OAuthProvider('microsoft.com');
    provider.addScope('user.read');
    return signInWithPopup(this.auth, provider);
  }

  /**
   * Convert native auth result to Firebase credential and sign in
   *
   * This bridges the Capacitor native plugins with Firebase Auth.
   * The native plugins return OAuth tokens, which we use to create
   * Firebase credentials.
   */
  private async signInWithNativeCredential(
    nativeResult: NativeAuthResult
  ): Promise<UserCredential> {
    console.debug('[FirebaseAuthService] Converting native credential to Firebase:', nativeResult.provider);
    let credential: OAuthCredential;

    switch (nativeResult.provider) {
      case 'google':
        credential = GoogleAuthProvider.credential(
          nativeResult.idToken,
          nativeResult.accessToken
        );
        break;

      case 'apple': {
        const appleProvider = new OAuthProvider('apple.com');
        credential = appleProvider.credential({
          idToken: nativeResult.idToken,
          rawNonce: nativeResult.rawNonce,
        });
        break;
      }

      case 'microsoft': {
        const msProvider = new OAuthProvider('microsoft.com');
        credential = msProvider.credential({
          idToken: nativeResult.idToken,
          accessToken: nativeResult.accessToken,
        });
        break;
      }

      default:
        throw new Error(`Unsupported provider: ${nativeResult.provider}`);
    }

    // Sign in to Firebase with the OAuth credential
    return signInWithCredential(this.auth, credential);
  }

  // ============================================
  // SIGN OUT
  // ============================================

  /**
   * Sign out current user
   * Clears both Firebase and native auth state
   */
  async signOut(): Promise<void> {
    // Sign out from native providers (clears cached credentials)
    await this.nativeAuth.signOut();

    // Sign out from Firebase
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
