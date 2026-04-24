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
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from '@angular/fire/auth';
import { environment } from '../../../../environments/environment';
import { Subscription } from 'rxjs';
import { NxtPlatformService, NxtLoggingService } from '@nxt1/ui';
import { type ILogger } from '@nxt1/core/logging';
import { GOOGLE_OAUTH_SCOPES } from '@nxt1/core/auth';
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

  /** Structured logger for Firebase auth operations */
  private readonly logger: ILogger = inject(NxtLoggingService).child('FirebaseAuthService');

  private authStateSubscription?: Subscription;

  // Store authState observable reference during injection context
  private readonly authState$ = authState(this.auth);

  // Firebase user state — private writeable, public computed (2026 pattern)
  private readonly _firebaseUser = signal<FirebaseUser | null>(null);
  readonly firebaseUser = computed(() => this._firebaseUser());
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
      this.logger.debug('Checking for OAuth redirect result...');
      const result = await runInInjectionContext(this.injector, () => getRedirectResult(this.auth));

      if (result) {
        this.logger.debug('OAuth redirect success:', {
          uid: result.user.uid,
          email: result.user.email,
          providerId: result.providerId,
        });
      } else {
        this.logger.debug('No pending OAuth redirect result');
      }
    } catch (error: unknown) {
      const authError = error as { code?: string; message?: string };
      if (authError?.code !== 'auth/no-auth-event') {
        this.logger.error('OAuth redirect error:', {
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
   * Wait for Firebase Auth to finish initializing.
   * Resolves once Firebase has restored the session from persistence (IndexedDB).
   * MUST be called before getCurrentUser() on app startup to avoid stale null.
   */
  async waitForAuthReady(): Promise<void> {
    await this.auth.authStateReady();
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
      providerData: (fbUser.providerData ?? []).map((p) => ({ providerId: p.providerId })),
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
  async signInWithGoogle(onAccountSelected?: () => void): Promise<UserCredential> {
    // Use native auth on iOS/Android
    if (this.nativeAuth.isNativeAvailable) {
      this.logger.debug('Using native Google Sign-In via @capacitor-firebase/authentication');

      try {
        const nativeResult = await this.nativeAuth.signInWithGoogle();

        // User cancelled
        if (!nativeResult) {
          this.logger.debug('User cancelled Google Sign-In');
          throw new Error('Sign-in was cancelled');
        }

        // Native account has been chosen. Signal the caller so UI can show loading
        // while Firebase auth state sync / token work continues.
        onAccountSelected?.();

        // @capacitor-firebase/authentication should have signed in to Firebase automatically
        // But sometimes auth state hasn't synced yet. Wait a bit and check again.
        let currentUser = this.auth.currentUser;

        if (!currentUser) {
          this.logger.debug('Waiting for Firebase auth state to sync...');
          // Wait up to 2 seconds for auth state to update
          for (let i = 0; i < 20; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            currentUser = this.auth.currentUser;
            if (currentUser) {
              this.logger.debug('Firebase auth state synced', { delayMs: (i + 1) * 100 });
              break;
            }
          }
        }

        if (!currentUser) {
          this.logger.error('No Firebase user after waiting for auth state', {
            hasIdToken: !!nativeResult.idToken,
            hasServerAuthCode: !!nativeResult.serverAuthCode,
          });

          // Last resort: manually sign in with the credential if we have idToken
          if (nativeResult.idToken) {
            this.logger.debug('Attempting manual sign-in with credential...');
            const credential = GoogleAuthProvider.credential(nativeResult.idToken);
            const result = await runInInjectionContext(this.injector, () =>
              signInWithCredential(this.auth, credential)
            );
            this.logger.debug('Manual sign-in successful');
            if (nativeResult.serverAuthCode) {
              void this.exchangeGmailServerAuthCode(result.user, nativeResult.serverAuthCode);
            }
            return result;
          }

          throw new Error('Google Sign-In succeeded but no Firebase user found. Please try again.');
        }

        this.logger.debug('Firebase sign-in successful:', {
          uid: currentUser.uid,
          email: currentUser.email,
        });

        // If a serverAuthCode was returned, exchange it for a Gmail refresh token
        // so the backend can send emails on behalf of this user.
        // This is fire-and-forget — sign-in succeeds regardless.
        if (nativeResult.serverAuthCode) {
          void this.exchangeGmailServerAuthCode(currentUser, nativeResult.serverAuthCode);
        } else {
          this.logger.debug(
            'No serverAuthCode returned — Gmail send permission not granted or already connected'
          );
        }

        return {
          user: currentUser,
          providerId: 'google.com',
          operationType: 'signIn',
        } as UserCredential;
      } catch (error) {
        this.logger.error('Google Sign-In error:', error);
        throw error;
      }
    }

    // Web fallback (development/PWA)
    this.logger.debug('Using web Google Sign-In (fallback)');
    const webResult = await runInInjectionContext(this.injector, () => {
      const provider = new GoogleAuthProvider();
      for (const scope of GOOGLE_OAUTH_SCOPES) {
        provider.addScope(scope);
      }
      return signInWithPopup(this.auth, provider);
    });

    // Extract Google access token from the popup result and store it in the
    // backend so emails can be sent on behalf of the user (web/PWA path).
    // Fire-and-forget — sign-in succeeds regardless.
    const googleCredential = GoogleAuthProvider.credentialFromResult(webResult);
    if (googleCredential?.accessToken) {
      void this.storeGmailWebAccessToken(webResult.user, googleCredential.accessToken);
    } else {
      this.logger.debug('No Google accessToken in web credential — Gmail not connected');
    }

    return webResult;
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
  async signInWithApple(onAccountSelected?: () => void): Promise<UserCredential> {
    // Use native auth on iOS/Android
    if (this.nativeAuth.isNativeAvailable) {
      this.logger.debug('Using native Apple Sign-In');

      try {
        const nativeResult = await this.nativeAuth.signInWithApple();

        // User cancelled
        if (!nativeResult) {
          throw new Error('Sign-in was cancelled');
        }

        // Native account has been chosen. Signal the caller so UI can show loading.
        onAccountSelected?.();

        // @capacitor-community/apple-sign-in does NOT auto-sign into Firebase
        // (unlike @capacitor-firebase/authentication for Google).
        // Go straight to signInWithCredential — no polling needed.
        if (nativeResult.idToken && nativeResult.rawNonce) {
          this.logger.debug('Signing into Firebase with Apple credential');
          const appleProvider = new OAuthProvider('apple.com');
          const credential = appleProvider.credential({
            idToken: nativeResult.idToken,
            rawNonce: nativeResult.rawNonce,
          });
          return await runInInjectionContext(this.injector, () =>
            signInWithCredential(this.auth, credential)
          );
        }

        throw new Error('Apple Sign-In succeeded but no tokens returned. Please try again.');
      } catch (error) {
        this.logger.error('Apple Sign-In error:', error);
        throw error;
      }
    }

    // Web fallback (development/PWA)
    this.logger.debug('Using web Apple Sign-In (fallback)');
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
  async signInWithMicrosoft(onAccountSelected?: () => void): Promise<UserCredential | null> {
    this.logger.debug('Starting Microsoft Sign-In');

    if (this.nativeAuth.isNativeAvailable) {
      this.logger.debug('Using native Microsoft OAuth via MSAL + backend custom token exchange');
      try {
        // NativeAuthService uses MSAL to get a native idToken.
        // signInWithNativeCredential handles the backend exchange:
        //   MSAL idToken → POST /auth/microsoft/custom-token → Firebase custom token
        //   → signInWithCustomToken()
        // This avoids both:
        // - signInWithCredential 400 (requestUri mismatch in WebView)
        // - @capacitor-firebase/authentication "missing initial state" redirect error
        const result = await this.nativeAuth.signInWithMicrosoft();

        // User cancelled
        if (!result) {
          this.logger.debug('User cancelled Microsoft Sign-In');
          return null;
        }

        // Native account has been chosen. Signal the caller so UI can show loading.
        onAccountSelected?.();

        const userCredential = await this.signInWithNativeCredential(result);

        // Capture accessToken for Microsoft Mail so backend can send emails on
        // behalf of this user (fire-and-forget — sign-in succeeds regardless).
        if (result.accessToken) {
          void this.storeMicrosoftAccessToken(userCredential.user, result.accessToken);
        } else {
          this.logger.debug('No Microsoft accessToken returned — Mail not connected');
        }

        return userCredential;
      } catch (error) {
        this.logger.error('Native Microsoft sign-in failed:', error);
        throw error;
      }
    }

    this.logger.debug('Using Firebase OAuth popup (web)');
    const webResult = await runInInjectionContext(this.injector, () => {
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

    // Extract Microsoft accessToken and store for Mail integration (fire-and-forget).
    const msCredential = OAuthProvider.credentialFromResult(webResult);
    if (msCredential?.accessToken) {
      void this.storeMicrosoftAccessToken(webResult.user, msCredential.accessToken);
    } else {
      this.logger.debug('No Microsoft accessToken in web credential — Mail not connected');
    }

    return webResult;
  }

  /**
   * Exchange a Google serverAuthCode for a Gmail refresh token on the backend.
   *
   * Called after native Google Sign-In when a serverAuthCode is present.
   * The backend exchanges the one-time code for a long-lived refresh token
   * and stores it in Users/{uid}/oauthTokens/google so emails can be sent
   * on behalf of the user.
   *
   * Fire-and-forget — callers should not await this. A failure here must
   * never block sign-in.
   */
  private async exchangeGmailServerAuthCode(
    user: import('@angular/fire/auth').User,
    serverAuthCode: string
  ): Promise<void> {
    try {
      const idToken = await user.getIdToken();

      const response = await fetch(`${environment.apiUrl}/auth/google/connect-gmail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ serverAuthCode }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        this.logger.warn('[Gmail Connect] Backend exchange failed', {
          status: response.status,
          error: errorText,
        });
        return;
      }

      const result = (await response.json()) as { success?: boolean; email?: string };
      this.logger.info('[Gmail Connect] Refresh token saved successfully', {
        email: result.email,
      });
    } catch (err) {
      // Non-blocking — log and continue
      this.logger.warn('[Gmail Connect] Failed to exchange serverAuthCode', { error: err });
    }
  }

  /** Store Microsoft accessToken so backend can send mail on behalf of the user. */
  private async storeMicrosoftAccessToken(
    user: import('@angular/fire/auth').User,
    accessToken: string
  ): Promise<void> {
    try {
      const idToken = await user.getIdToken();

      const response = await fetch(`${environment.apiUrl}/auth/microsoft/connect-mail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ accessToken }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        this.logger.warn('[Microsoft Connect] Backend store failed', {
          status: response.status,
          error: errorText,
        });
        return;
      }

      const result = (await response.json()) as { success?: boolean; email?: string };
      this.logger.info('[Microsoft Connect] accessToken saved successfully', {
        email: result.email,
      });
    } catch (err) {
      // Non-blocking — log and continue
      this.logger.warn('[Microsoft Connect] Failed to store accessToken', { error: err });
    }
  }

  /** Web/PWA path — store the Google accessToken directly (refreshed on each login). */
  private async storeGmailWebAccessToken(
    user: import('@angular/fire/auth').User,
    accessToken: string
  ): Promise<void> {
    try {
      const idToken = await user.getIdToken();

      const response = await fetch(`${environment.apiUrl}/auth/google/connect-gmail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ accessToken }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        this.logger.warn('[Gmail Connect] Backend store failed (web)', {
          status: response.status,
          error: errorText,
        });
        return;
      }

      const result = (await response.json()) as { success?: boolean; email?: string };
      this.logger.info('[Gmail Connect] Web accessToken saved successfully', {
        email: result.email,
      });
    } catch (err) {
      // Non-blocking — log and continue
      this.logger.warn('[Gmail Connect] Failed to store web accessToken', { error: err });
    }
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
    this.logger.debug('Converting native credential to Firebase', {
      provider: nativeResult.provider,
      idTokenLength: nativeResult.idToken?.length,
    });

    return runInInjectionContext(this.injector, async () => {
      let credential: OAuthCredential;

      switch (nativeResult.provider) {
        case 'google':
          this.logger.debug('Creating Google credential with:', {
            hasIdToken: !!nativeResult.idToken,
            idTokenLength: nativeResult.idToken?.length,
            hasAccessToken: !!nativeResult.accessToken,
            accessTokenLength: nativeResult.accessToken?.length,
          });
          // For Google, we only need the idToken. accessToken is optional.
          // The idToken must be from an OAuth client that's linked to this Firebase project
          credential = GoogleAuthProvider.credential(nativeResult.idToken);
          this.logger.debug('Google credential created, calling signInWithCredential');
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
          // signInWithCredential is NOT used for MSAL native tokens because
          // the MSAL idToken's `aud` claim equals the native app client ID
          // (aaceb7d3-...), not the OAuth client Firebase Console expects.
          // Firebase rejects it with auth/invalid-credential-or-provider-id.
          // Instead: exchange via backend custom-token endpoint, which validates
          // the MSAL token server-side and returns a proper Firebase custom token.
          const msResponse = await fetch(`${environment.apiUrl}/auth/microsoft/custom-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken: nativeResult.idToken,
              accessToken: nativeResult.accessToken,
            }),
          });

          if (!msResponse.ok) {
            const errorText = await msResponse.text();
            throw new Error(`Backend token exchange failed: ${errorText}`);
          }

          const {
            firebaseToken,
            email: msEmail,
            displayName: msDisplayName,
          } = await msResponse.json();

          const { signInWithCustomToken } = await import('@angular/fire/auth');
          const userCred = await signInWithCustomToken(this.auth, firebaseToken);

          await userCred.user.reload();

          if (msEmail) nativeResult.user.email = msEmail;
          if (msDisplayName) nativeResult.user.displayName = msDisplayName;

          return userCred;
        }

        default:
          throw new Error(`Unsupported provider: ${nativeResult.provider}`);
      }

      // Sign in to Firebase with the OAuth credential
      try {
        this.logger.debug('Calling signInWithCredential...');
        const result = await signInWithCredential(this.auth, credential);
        this.logger.debug('signInWithCredential SUCCESS:', {
          uid: result.user.uid,
          email: result.user.email,
        });
        return result;
      } catch (error: unknown) {
        // Log detailed error info for debugging
        this.logger.error('signInWithCredential FAILED:', {
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
   * Get current ID token.
   *
   * Strategy (in order):
   * 1. JS SDK (`auth.currentUser`) — accurate after any sign-in because
   *    `authStateReady()` was already awaited by `checkAuth()` before the
   *    `firebaseReadyPromise` resolves (i.e. before this can be called).
   * 2. Native Keychain fallback — `@capacitor-firebase/authentication` reads
   *    from the iOS Keychain, which survives WKWebView IndexedDB clears.
   *    Used when JS SDK has no user (e.g. app restart after storage clear).
   */
  async getIdToken(forceRefresh = false): Promise<string | null> {
    // ⭐ Strategy:
    // 1. JS SDK first — after any sign-in (email, Google via signInWithCredential, etc.)
    //    auth.currentUser is immediately available. By the time this method is called,
    //    firebaseReadyPromise has resolved, meaning authStateReady() was already awaited
    //    in checkAuth(). So auth.currentUser is accurate — no need to await it again.
    // 2. Native Keychain fallback — handles app restart where WKWebView IndexedDB was
    //    cleared but the native iOS Firebase SDK still has a session in Keychain.
    const jsUser = this.auth.currentUser;
    if (jsUser) {
      try {
        const token = await jsUser.getIdToken(forceRefresh);
        return token;
      } catch (jsErr) {
        console.warn('[NXT1:getIdToken] JS SDK path failed, trying native', jsErr);
      }
    } else {
      console.warn('[NXT1:getIdToken] JS SDK auth.currentUser is null');
    }

    // Native Keychain fallback: survives WKWebView IndexedDB clears between sessions.
    if (this.platform.isNative()) {
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        const result = await FirebaseAuthentication.getIdToken({ forceRefresh });
        if (result.token) {
          console.warn('[NXT1:getIdToken] native Keychain path succeeded');
          return result.token;
        }
        console.warn('[NXT1:getIdToken] native path returned empty token');
      } catch (nativeErr) {
        console.warn('[NXT1:getIdToken] native path failed', nativeErr);
      }
    }

    console.warn('[NXT1:getIdToken] both paths failed — returning null (not authenticated)');
    return null;
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

  // ============================================
  // ACCOUNT DELETION
  // ============================================

  /**
   * Re-authenticate the current user with email + password.
   * Required before deleteCurrentUser() for email/password accounts.
   *
   * @returns true on success, false on wrong password / not authenticated
   */
  async reauthenticateWithPassword(email: string, password: string): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) return false;

    try {
      const credential = EmailAuthProvider.credential(email, password);
      await runInInjectionContext(this.injector, () =>
        reauthenticateWithCredential(user, credential)
      );
      return true;
    } catch (err) {
      this.logger.warn('Re-authentication failed', { error: err });
      return false;
    }
  }

  /**
   * Delete the currently signed-in Firebase user.
   * Call reauthenticateWithPassword() first for email/password users
   * to satisfy Firebase's recent-login requirement.
   */
  async deleteCurrentUser(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No authenticated user');
    await runInInjectionContext(this.injector, () => deleteUser(user));
  }
}
