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
 * IMPORTANT: All Firebase API calls must run within Angular's injection context
 * to prevent "Firebase APIs outside of an Injection context" errors.
 * This is achieved by using runInInjectionContext() for async operations
 * that are called from outside the constructor.
 *
 * @module @nxt1/mobile/features/auth
 */
import {
  Injectable,
  inject,
  signal,
  computed,
  OnDestroy,
  Injector,
  runInInjectionContext,
} from '@angular/core';
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
  OAuthCredential,
  signInWithCredential,
  getRedirectResult,
} from '@angular/fire/auth';
import { environment } from '../../../../environments/environment';
import { Subscription } from 'rxjs';
import { NxtPlatformService } from '@nxt1/ui';
import { NativeAuthService } from './native-auth.service';
import { FirebaseUserInfo, NativeAuthResult } from '@nxt1/core';

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
  private readonly injector = inject(Injector);

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

    // Skip redirect check on mobile - not used in Capacitor native auth
    // this.checkRedirectResult();
  }

  /**
   * Check for OAuth redirect result (Microsoft, Apple web fallback)
   * Called on app startup to handle returning from OAuth redirect
   */
  private async checkRedirectResult(): Promise<void> {
    try {
      console.debug('[FirebaseAuthService] Checking for OAuth redirect result...');
      const result = await runInInjectionContext(this.injector, () => getRedirectResult(this.auth));

      if (result) {
        console.debug('[FirebaseAuthService] OAuth redirect success:', {
          uid: result.user.uid,
          email: result.user.email,
          providerId: result.providerId,
        });
      } else {
        console.debug('[FirebaseAuthService] No pending OAuth redirect result');
      }
    } catch (error: unknown) {
      const authError = error as { code?: string; message?: string };
      if (authError?.code !== 'auth/no-auth-event') {
        console.error('[FirebaseAuthService] OAuth redirect error:', {
          code: authError?.code,
          message: authError?.message,
        });
      }
    }
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
   *
   * Uses runInInjectionContext to ensure Firebase APIs
   * are called within Angular's injection context.
   */
  async signInWithEmail(email: string, password: string): Promise<UserCredential> {
    return runInInjectionContext(this.injector, () =>
      signInWithEmailAndPassword(this.auth, email, password)
    );
  }

  /**
   * Create user with email and password
   *
   * Uses runInInjectionContext to ensure Firebase APIs
   * are called within Angular's injection context.
   */
  async createUserWithEmail(email: string, password: string): Promise<UserCredential> {
    return runInInjectionContext(this.injector, () =>
      createUserWithEmailAndPassword(this.auth, email, password)
    );
  }

  /**
   * Update user profile
   *
   * Uses runInInjectionContext to ensure Firebase APIs
   * are called within Angular's injection context.
   */
  async updateUserProfile(displayName?: string, photoURL?: string): Promise<void> {
    return runInInjectionContext(this.injector, async () => {
      const user = this.auth.currentUser;
      if (!user) throw new Error('No user signed in');

      const updates: { displayName?: string; photoURL?: string } = {};
      if (displayName !== undefined) updates.displayName = displayName;
      if (photoURL !== undefined) updates.photoURL = photoURL;

      await updateProfile(user, updates);
    });
  }

  /**
   * Send password reset email
   *
   * Uses runInInjectionContext to ensure Firebase APIs
   * are called within Angular's injection context.
   */
  async sendPasswordReset(email: string): Promise<void> {
    return runInInjectionContext(this.injector, () => sendPasswordResetEmail(this.auth, email));
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
   * Uses runInInjectionContext to ensure Firebase APIs
   * are called within Angular's injection context.
   *
   * @returns UserCredential from Firebase Auth
   * @throws Error on failure (cancellation returns null internally, but this throws)
   */
  async signInWithGoogle(): Promise<UserCredential> {
    // Use native auth on iOS/Android
    if (this.nativeAuth.isNativeAvailable) {
      console.debug(
        '[FirebaseAuthService] Using native Google Sign-In via @capacitor-firebase/authentication'
      );

      try {
        const nativeResult = await this.nativeAuth.signInWithGoogle();

        // User cancelled
        if (!nativeResult) {
          console.debug('[FirebaseAuthService] User cancelled Google Sign-In');
          throw new Error('Sign-in was cancelled');
        }

        // @capacitor-firebase/authentication should have signed in to Firebase automatically
        // But sometimes auth state hasn't synced yet. Wait a bit and check again.
        let currentUser = this.auth.currentUser;

        if (!currentUser) {
          console.debug('[FirebaseAuthService] Waiting for Firebase auth state to sync...');
          // Wait up to 2 seconds for auth state to update
          for (let i = 0; i < 20; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            currentUser = this.auth.currentUser;
            if (currentUser) {
              console.debug(
                '[FirebaseAuthService] Firebase auth state synced after',
                (i + 1) * 100,
                'ms'
              );
              break;
            }
          }
        }

        if (!currentUser) {
          console.error('[FirebaseAuthService] No Firebase user after waiting for auth state', {
            hasIdToken: !!nativeResult.idToken,
            hasServerAuthCode: !!nativeResult.serverAuthCode,
          });

          // Last resort: manually sign in with the credential if we have idToken
          if (nativeResult.idToken) {
            console.debug('[FirebaseAuthService] Attempting manual sign-in with credential...');
            const credential = GoogleAuthProvider.credential(nativeResult.idToken);
            const result = await runInInjectionContext(this.injector, () =>
              signInWithCredential(this.auth, credential)
            );
            console.debug('[FirebaseAuthService] Manual sign-in successful');
            return result;
          }

          throw new Error('Google Sign-In succeeded but no Firebase user found. Please try again.');
        }

        console.debug('[FirebaseAuthService] Firebase sign-in successful:', {
          uid: currentUser.uid,
          email: currentUser.email,
        });

        return {
          user: currentUser,
          providerId: 'google.com',
          operationType: 'signIn',
        } as UserCredential;
      } catch (error) {
        console.error('[FirebaseAuthService] Google Sign-In error:', error);
        throw error;
      }
    }

    // Web fallback (development/PWA)
    console.debug('[FirebaseAuthService] Using web Google Sign-In (fallback)');
    return runInInjectionContext(this.injector, () => {
      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.addScope('https://www.googleapis.com/auth/gmail.send');
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
      return signInWithPopup(this.auth, provider);
    });
  }

  /**
   * Sign in with Apple
   *
   * - Native (iOS): Uses ASAuthorizationController via Capacitor (REQUIRED by App Store)
   * - Web fallback: Uses Firebase signInWithPopup
   *
   * Note: Apple Sign-In is required on iOS if you offer any social login.
   * Uses runInInjectionContext to ensure Firebase APIs
   * are called within Angular's injection context.
   *
   * @returns UserCredential from Firebase Auth
   * @throws Error on failure
   */
  async signInWithApple(): Promise<UserCredential> {
    // Use native auth on iOS/Android
    if (this.nativeAuth.isNativeAvailable) {
      console.debug('[FirebaseAuthService] Using native Apple Sign-In');

      try {
        const nativeResult = await this.nativeAuth.signInWithApple();

        // User cancelled
        if (!nativeResult) {
          throw new Error('Sign-in was cancelled');
        }

        // @capacitor-firebase/authentication should have signed in to Firebase automatically
        // But sometimes auth state hasn't synced yet. Wait a bit and check again.
        let currentUser = this.auth.currentUser;

        if (!currentUser) {
          console.debug('[FirebaseAuthService] Waiting for Firebase auth state to sync...');
          // Wait up to 2 seconds for auth state to update
          for (let i = 0; i < 20; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            currentUser = this.auth.currentUser;
            if (currentUser) {
              console.debug(
                '[FirebaseAuthService] Firebase auth state synced after',
                (i + 1) * 100,
                'ms'
              );
              break;
            }
          }
        }

        if (!currentUser) {
          // Last resort: manually sign in with the credential if we have tokens
          if (nativeResult.idToken && nativeResult.rawNonce) {
            const appleProvider = new OAuthProvider('apple.com');
            const credential = appleProvider.credential({
              idToken: nativeResult.idToken,
              rawNonce: nativeResult.rawNonce,
            });
            const result = await runInInjectionContext(this.injector, () =>
              signInWithCredential(this.auth, credential)
            );
            return result;
          }

          throw new Error('Apple Sign-In succeeded but no Firebase user found. Please try again.');
        }

        return {
          user: currentUser,
          providerId: 'apple.com',
          operationType: 'signIn',
        } as UserCredential;
      } catch (error) {
        console.error('[FirebaseAuthService] Apple Sign-In error:', error);
        throw error;
      }
    }

    // Web fallback (development/PWA)
    console.debug('[FirebaseAuthService] Using web Apple Sign-In (fallback)');
    return runInInjectionContext(this.injector, () => {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      return signInWithPopup(this.auth, provider);
    });
  }

  /**
   * Sign in with Microsoft
   *
   * IMPORTANT: Microsoft OAuth only works on web platform.
   * Firebase does not support Microsoft on native (no native credential like Google/Apple).
   *
   * Native: Returns null (disabled) - user should use Google or Apple instead
   * Web: Uses Firebase signInWithPopup (works, has icon in Console)
   *
   * @returns UserCredential from Firebase Auth or null if not available
   * @throws Error on failure
   */
  async signInWithMicrosoft(): Promise<UserCredential | null> {
    console.debug('[FirebaseAuthService] Starting Microsoft Sign-In');

    if (this.nativeAuth.isNativeAvailable) {
      console.debug(
        '[FirebaseAuthService] Using native Microsoft OAuth via @capacitor-firebase/authentication'
      );
      try {
        const result = await this.nativeAuth.signInWithMicrosoft();

        // User cancelled
        if (!result) {
          console.debug('[FirebaseAuthService] User cancelled Microsoft Sign-In');
          return null;
        }

        // @capacitor-firebase/authentication should have signed in to Firebase automatically
        // But sometimes auth state hasn't synced yet. Wait longer and also listen to auth state.
        let currentUser = this.auth.currentUser;

        if (!currentUser) {
          // Try waiting with polling AND listening to auth state changes
          const authStatePromise = new Promise<void>((resolve) => {
            const unsubscribe = this.authState$.subscribe((user) => {
              if (user) {
                console.debug('[FirebaseAuthService] Auth state changed, user detected');
                unsubscribe.unsubscribe();
                resolve();
              }
            });

            // Also unsubscribe after timeout
            setTimeout(() => {
              unsubscribe.unsubscribe();
              resolve();
            }, 5000);
          });

          // Wait up to 5 seconds with both polling and subscription
          const startTime = Date.now();
          while (Date.now() - startTime < 5000) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            currentUser = this.auth.currentUser;
            if (currentUser) {
              break;
            }
          }

          // Final check after waiting
          if (!currentUser) {
            await authStatePromise;
            currentUser = this.auth.currentUser;
          }
        }

        if (!currentUser) {
          throw new Error(
            'Microsoft Sign-In is not fully supported on iOS. Please use Google or Apple sign-in for a better experience.'
          );
        }

        // Return as UserCredential for consistency
        return {
          user: currentUser,
          providerId: 'microsoft.com',
          operationType: 'signIn',
        } as UserCredential;
      } catch (error) {
        console.error('[FirebaseAuthService] Native Microsoft sign-in failed:', error);
        throw error;
      }
    }

    console.debug('[FirebaseAuthService] Using Firebase OAuth popup (web)');
    return runInInjectionContext(this.injector, () => {
      const provider = new OAuthProvider('microsoft.com');
      provider.setCustomParameters({ prompt: 'select_account' });
      provider.addScope('openid');
      provider.addScope('profile');
      provider.addScope('email');
      provider.addScope('offline_access');
      provider.addScope('Mail.Send');
      provider.addScope('Mail.Read');
      provider.addScope('User.Read');
      return signInWithPopup(this.auth, provider);
    });
  }

  /**
   * Convert native auth result to Firebase credential and sign in
   *
   * This bridges the Capacitor native plugins with Firebase Auth.
   * The native plugins return OAuth tokens, which we use to create
   * Firebase credentials.
   *
   * Uses runInInjectionContext to ensure Firebase APIs
   * are called within Angular's injection context.
   */
  private async signInWithNativeCredential(
    nativeResult: NativeAuthResult
  ): Promise<UserCredential> {
    console.debug(
      '[FirebaseAuthService] Converting native credential to Firebase:',
      nativeResult.provider,
      'idToken length:',
      nativeResult.idToken?.length
    );

    return runInInjectionContext(this.injector, async () => {
      let credential: OAuthCredential;

      switch (nativeResult.provider) {
        case 'google':
          console.debug('[FirebaseAuthService] Creating Google credential with:', {
            hasIdToken: !!nativeResult.idToken,
            idTokenLength: nativeResult.idToken?.length,
            hasAccessToken: !!nativeResult.accessToken,
            accessTokenLength: nativeResult.accessToken?.length,
          });
          // For Google, we only need the idToken. accessToken is optional.
          // The idToken must be from an OAuth client that's linked to this Firebase project
          credential = GoogleAuthProvider.credential(nativeResult.idToken);
          console.debug(
            '[FirebaseAuthService] Google credential created, calling signInWithCredential...'
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
          console.debug(
            '[FirebaseAuthService] Exchanging Microsoft token for Firebase custom token'
          );

          const response = await fetch(`${environment.apiUrl}/auth/microsoft/custom-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken: nativeResult.idToken,
              accessToken: nativeResult.accessToken,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Backend token exchange failed: ${errorText}`);
          }

          const { firebaseToken } = await response.json();

          // Sign in with custom token
          const { signInWithCustomToken } = await import('@angular/fire/auth');
          return await signInWithCustomToken(this.auth, firebaseToken);
        }

        default:
          throw new Error(`Unsupported provider: ${nativeResult.provider}`);
      }

      // Sign in to Firebase with the OAuth credential
      try {
        console.debug('[FirebaseAuthService] Calling signInWithCredential...');
        const result = await signInWithCredential(this.auth, credential);
        console.debug('[FirebaseAuthService] signInWithCredential SUCCESS:', {
          uid: result.user.uid,
          email: result.user.email,
        });
        return result;
      } catch (error: unknown) {
        // Log detailed error info for debugging
        console.error('[FirebaseAuthService] signInWithCredential FAILED:', {
          error,
          errorCode: (error as { code?: string })?.code,
          errorMessage: (error as { message?: string })?.message,
          provider: nativeResult.provider,
          idTokenPrefix: nativeResult.idToken?.substring(0, 50) + '...',
        });
        throw error;
      }
    });
  }

  // ============================================
  // SIGN OUT
  // ============================================

  /**
   * Sign out current user
   * Clears both Firebase and native auth state
   *
   * Uses runInInjectionContext to ensure Firebase APIs
   * are called within Angular's injection context.
   */
  async signOut(): Promise<void> {
    // Sign out from native providers (clears cached credentials)
    await this.nativeAuth.signOut();

    // Sign out from Firebase
    return runInInjectionContext(this.injector, () => firebaseSignOut(this.auth));
  }

  // ============================================
  // TOKEN MANAGEMENT
  // ============================================

  /**
   * Get current ID token
   *
   * Uses runInInjectionContext to ensure Firebase APIs
   * are called within Angular's injection context.
   */
  async getIdToken(forceRefresh = false): Promise<string | null> {
    return runInInjectionContext(this.injector, async () => {
      const user = this.auth.currentUser;
      if (!user) return null;
      return user.getIdToken(forceRefresh);
    });
  }

  /**
   * Get provider from Firebase user
   */
  getProviderFromUser(
    user?: FirebaseUser | null
  ): 'email' | 'google' | 'apple' | 'microsoft' | 'anonymous' {
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
