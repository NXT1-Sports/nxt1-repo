/**
 * @fileoverview Auth Routes — OAuth (Google, Microsoft, Yahoo) + Microsoft Custom Token
 * @module @nxt1/backend/routes/auth
 *
 * Handles:
 * - POST /microsoft/custom-token
 * - GET  /google/connect-url
 * - GET  /google/callback
 * - GET  /microsoft/connect-url
 * - GET  /microsoft/callback
 * - POST /google/connect-gmail
 * - POST /microsoft/connect-mail
 * - POST /yahoo/connect-mail
 */

import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import {
  GOOGLE_OAUTH_SCOPES,
  OAUTH_TOKEN_SUBCOLLECTION,
  LEGACY_EMAIL_TOKEN_SUBCOLLECTION,
  GOOGLE_OAUTH_TOKEN_DOC_ID,
} from '@nxt1/core/auth';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { validationError, internalError } from '@nxt1/core/errors';
import type { ConnectedEmail } from '@nxt1/core';
import { validateBody } from '../../middleware/validation/validation.middleware.js';
import { ConnectGmailDto, ConnectMicrosoftDto, ConnectYahooDto } from '../../dtos/auth.dto.js';
import { invalidateProfileCaches } from '../profile/shared.js';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import {
  isAllowedOrigin,
  getDefaultFrontendUrl,
  encodeOAuthState,
  decodeOAuthState,
  ALLOWED_MOBILE_SCHEMES,
} from './shared.js';

const router: RouterType = Router();

function getMicrosoftClientId(isStaging: boolean): string {
  return isStaging
    ? (process.env['STAGING_MICROSOFT_CLIENT_ID'] ?? process.env['MICROSOFT_CLIENT_ID'] ?? '')
    : (process.env['MICROSOFT_CLIENT_ID'] ?? '');
}

function getMicrosoftClientSecret(isStaging: boolean): string {
  return isStaging
    ? (process.env['STAGING_MICROSOFT_CLIENT_SECRET'] ??
        process.env['MICROSOFT_CLIENT_SECRET'] ??
        '')
    : (process.env['MICROSOFT_CLIENT_SECRET'] ?? '');
}

// ============================================================================
// POST /auth/microsoft/custom-token
// Validates Microsoft MSAL tokens from mobile app and creates Firebase custom token.
// ============================================================================
router.post(
  '/microsoft/custom-token',
  asyncHandler(async (req: Request, res: Response) => {
    const { idToken, accessToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      const error = validationError([
        { field: 'idToken', message: 'Missing or invalid ID token', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    logger.debug('[Microsoft Custom Token] Processing Microsoft token');

    try {
      const base64Url = idToken.split('.')[1];
      if (!base64Url) throw new Error('Invalid token format');

      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(base64, 'base64').toString());

      const microsoftUid = payload.sub || payload.oid;
      let email: string | undefined = payload.preferred_username || payload.email;
      let name: string | undefined = payload.name;

      if (!microsoftUid) {
        const error = validationError([
          { field: 'idToken', message: 'Invalid token: missing sub/oid', rule: 'invalid' },
        ]);
        sendError(res, error);
        return;
      }

      // Fetch email from Graph API if not in token and access token provided
      if (!email && accessToken && typeof accessToken === 'string') {
        logger.debug(
          '[Microsoft Custom Token] Email missing from idToken, fetching from Graph API'
        );
        try {
          const graphRes = await fetch(
            'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName',
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (graphRes.ok) {
            const graphUser = (await graphRes.json()) as {
              mail?: string;
              userPrincipalName?: string;
              displayName?: string;
            };
            email = graphUser.mail || graphUser.userPrincipalName;
            name = name || graphUser.displayName;
          }
        } catch (graphError) {
          logger.warn('[Microsoft Custom Token] Graph API call failed', { graphError });
        }
      }

      if (!microsoftUid || !email) {
        const error = validationError([
          { field: 'idToken', message: 'Invalid token: missing user info', rule: 'invalid' },
        ]);
        sendError(res, error);
        return;
      }

      logger.debug('[Microsoft Custom Token] Token decoded', { email, name });

      const firebaseUid = `${microsoftUid}`;

      try {
        const existingUser = await req.firebase!.auth.getUser(firebaseUid);
        if ((!existingUser.email && email) || (!existingUser.displayName && name)) {
          try {
            await req.firebase!.auth.updateUser(firebaseUid, {
              ...(email && !existingUser.email ? { email, emailVerified: true } : {}),
              ...(name && !existingUser.displayName ? { displayName: name } : {}),
            });
          } catch (updateErr) {
            logger.warn('[Microsoft Custom Token] Could not update user email/name', { updateErr });
          }
        }
      } catch (error: unknown) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'auth/user-not-found'
        ) {
          logger.debug('[Microsoft Custom Token] Creating new Firebase user');
          try {
            await req.firebase!.auth.createUser({
              uid: firebaseUid,
              email,
              displayName: name,
              emailVerified: true,
            });
          } catch (createWithEmailErr: unknown) {
            const code =
              createWithEmailErr &&
              typeof createWithEmailErr === 'object' &&
              'code' in createWithEmailErr
                ? (createWithEmailErr as { code: string }).code
                : '';
            if (code === 'auth/email-already-exists') {
              logger.warn('[Microsoft Custom Token] Email already taken, creating without email', {
                email,
              });
              await req.firebase!.auth.createUser({
                uid: firebaseUid,
                displayName: name,
                emailVerified: false,
              });
            } else {
              throw createWithEmailErr;
            }
          }
        } else {
          throw error;
        }
      }

      // Link microsoft.com provider
      try {
        await req.firebase!.auth.updateUser(firebaseUid, {
          providerToLink: {
            uid: microsoftUid,
            providerId: 'microsoft.com',
            ...(email ? { email } : {}),
            ...(name ? { displayName: name } : {}),
          },
        });
      } catch (linkErr) {
        logger.warn('[Microsoft Custom Token] Could not link microsoft.com provider', { linkErr });
      }

      const firebaseToken = await req.firebase!.auth.createCustomToken(firebaseUid, {
        provider: 'microsoft.com',
        email,
        name,
      });

      logger.info('[Microsoft Custom Token] Success', { uid: firebaseUid, email });
      res.json({ firebaseToken, email: email ?? null, displayName: name ?? null });
    } catch (error: unknown) {
      logger.error('[Microsoft Custom Token] Error', { error });
      const errorDetail = error instanceof Error ? error.message : String(error);
      const validError = validationError([
        {
          field: 'idToken',
          message: `Failed to process Microsoft token: ${errorDetail}`,
          rule: 'invalid',
        },
      ]);
      sendError(res, validError);
    }
  })
);

// ============================================================================
// GET /auth/google/connect-url
// Returns a Google OAuth2 authorization URL. Requires appGuard.
// ============================================================================
router.get(
  '/google/connect-url',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;
    const origin = (req.query['origin'] as string | undefined)?.trim();
    const mobileScheme = (req.query['mobileScheme'] as string | undefined)?.trim();

    if (origin && !isAllowedOrigin(origin, req.isStaging)) {
      sendError(
        res,
        validationError([{ field: 'origin', message: 'Origin not allowed', rule: 'invalid' }])
      );
      return;
    }

    if (mobileScheme && !ALLOWED_MOBILE_SCHEMES.has(mobileScheme)) {
      sendError(
        res,
        validationError([
          { field: 'mobileScheme', message: 'Unknown mobile scheme', rule: 'invalid' },
        ])
      );
      return;
    }

    const googleClientId = req.isStaging
      ? (process.env['STAGING_CLIENT_ID'] ?? process.env['CLIENT_ID'] ?? '')
      : (process.env['CLIENT_ID'] ?? '');

    const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
    const pathPrefix = req.isStaging ? '/api/v1/staging' : '/api/v1';
    const redirectUri = `${backendUrl}${pathPrefix}/auth/google/callback`;

    const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    oauthUrl.searchParams.set('client_id', googleClientId);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '));
    oauthUrl.searchParams.set('access_type', 'offline');
    oauthUrl.searchParams.set('prompt', 'select_account consent');
    const statePayload = mobileScheme
      ? encodeOAuthState(uid, '', mobileScheme)
      : origin
        ? encodeOAuthState(uid, origin)
        : uid;
    oauthUrl.searchParams.set('state', statePayload);

    logger.debug('[Google Connect URL] Generated OAuth URL', {
      uid: uid.substring(0, 8) + '...',
      redirectUri,
      origin,
      mobileScheme,
      isStaging: req.isStaging,
    });

    res.json({ url: oauthUrl.toString() });
  })
);

// ============================================================================
// GET /auth/google/callback
// Google OAuth2 redirect — no auth guard (called by Google).
// ============================================================================
router.get(
  '/google/callback',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { code, state: rawState, error: oauthError } = req.query as Record<string, string>;
    const { uid, origin: stateOrigin, mobileScheme } = decodeOAuthState(rawState ?? '');

    const renderResult = (success: boolean, message: string, provider = 'google') => {
      const params = new URLSearchParams({ provider, success: String(success), message });
      if (mobileScheme && ALLOWED_MOBILE_SCHEMES.has(mobileScheme)) {
        res.redirect(`${mobileScheme}://oauth/callback?${params.toString()}`);
      } else {
        const frontendUrl =
          stateOrigin && isAllowedOrigin(stateOrigin, req.isStaging)
            ? stateOrigin
            : getDefaultFrontendUrl(req.isStaging);
        res.redirect(`${frontendUrl}/oauth/success?${params.toString()}`);
      }
    };

    if (oauthError) {
      logger.warn('[Google Callback] OAuth error returned by Google', { error: oauthError, uid });
      renderResult(
        false,
        oauthError === 'access_denied' ? 'Connection cancelled' : `Error: ${oauthError}`
      );
      return;
    }

    if (!code || !uid) {
      renderResult(false, 'Invalid callback — missing code or state');
      return;
    }

    const { db } = req.firebase!;

    const googleClientId = req.isStaging
      ? (process.env['STAGING_CLIENT_ID'] ?? process.env['CLIENT_ID'] ?? '')
      : (process.env['CLIENT_ID'] ?? '');
    const googleClientSecret = req.isStaging
      ? (process.env['STAGING_CLIENT_SECRET'] ?? process.env['CLIENT_SECRET'] ?? '')
      : (process.env['CLIENT_SECRET'] ?? '');
    const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
    const pathPrefix = req.isStaging ? '/api/v1/staging' : '/api/v1';
    const redirectUri = `${backendUrl}${pathPrefix}/auth/google/callback`;

    try {
      const params = new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      });

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string;
        refresh_token?: string;
        id_token?: string;
        error?: string;
        error_description?: string;
      };

      if (tokenData.error || !tokenData.refresh_token) {
        const errMsg = tokenData.error_description ?? tokenData.error ?? 'Token exchange failed';
        logger.warn('[Google Callback] Token exchange failed', {
          uid,
          error: tokenData.error,
          description: errMsg,
        });
        renderResult(false, errMsg);
        return;
      }

      let connectedEmail: string | undefined;
      if (tokenData.id_token) {
        try {
          const base64Url = tokenData.id_token.split('.')[1];
          if (base64Url) {
            const payload = JSON.parse(Buffer.from(base64Url, 'base64url').toString()) as {
              email?: string;
            };
            connectedEmail = payload.email;
          }
        } catch {
          /* ignore */
        }
      }

      const userRef = db.collection('Users').doc(uid);
      const tokenRef = userRef.collection(OAUTH_TOKEN_SUBCOLLECTION).doc(GOOGLE_OAUTH_TOKEN_DOC_ID);
      const legacyTokenRef = userRef.collection(LEGACY_EMAIL_TOKEN_SUBCOLLECTION).doc('gmail');
      const now = new Date().toISOString();

      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const userData = userDoc.data() as
          | { connectedEmails?: Array<{ provider: string; email?: string }> }
          | undefined;
        const existing = userData?.connectedEmails ?? [];
        const filtered = existing.filter((e) => e.provider !== 'gmail');
        const batch = db.batch();
        batch.set(
          tokenRef,
          {
            provider: GOOGLE_OAUTH_TOKEN_DOC_ID,
            refreshToken: tokenData.refresh_token,
            updatedAt: now,
            ...(connectedEmail && { email: connectedEmail }),
          },
          { merge: true }
        );
        batch.update(userRef, {
          connectedEmails: [
            ...filtered,
            {
              provider: 'gmail',
              isActive: true,
              connectedAt: now,
              ...(connectedEmail && { email: connectedEmail }),
            },
          ],
          updatedAt: now,
        });
        batch.delete(legacyTokenRef);
        await batch.commit();
        await invalidateProfileCaches(uid).catch((err) =>
          logger.warn('[Google Callback] Failed to invalidate profile cache', { uid, err })
        );
      } else {
        await tokenRef.set(
          {
            provider: GOOGLE_OAUTH_TOKEN_DOC_ID,
            refreshToken: tokenData.refresh_token,
            updatedAt: now,
            ...(connectedEmail && { email: connectedEmail }),
          },
          { merge: true }
        );
        await legacyTokenRef.delete().catch((error) => {
          logger.warn('[Google Callback] Failed to delete legacy Gmail token doc', {
            uid,
            error,
          });
        });
      }

      logger.info('[Google Callback] Gmail token saved', {
        uid: uid.substring(0, 8) + '...',
        email: connectedEmail,
      });
      renderResult(
        true,
        connectedEmail ? `Gmail connected (${connectedEmail})` : 'Gmail connected!'
      );
    } catch (err) {
      logger.error('[Google Callback] Unexpected error', { uid, error: err });
      renderResult(false, 'Connection failed. Please try again.');
    }
  })
);

// ============================================================================
// GET /auth/microsoft/connect-url
// Returns a Microsoft OAuth2 authorization URL. Requires appGuard.
// ============================================================================
router.get(
  '/microsoft/connect-url',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;

    const clientId = getMicrosoftClientId(req.isStaging);
    if (!clientId) {
      sendError(res, internalError(new Error('Microsoft client ID not configured')));
      return;
    }

    const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
    const pathPrefix = req.isStaging ? '/api/v1/staging' : '/api/v1';
    const redirectUri = `${backendUrl}${pathPrefix}/auth/microsoft/callback`;

    const oauthUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    oauthUrl.searchParams.set('client_id', clientId);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('response_mode', 'query');
    oauthUrl.searchParams.set(
      'scope',
      'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/Files.ReadWrite offline_access openid email https://graph.microsoft.com/User.Read'
    );
    oauthUrl.searchParams.set('prompt', 'consent');

    const origin = (req.query['origin'] as string | undefined)?.trim();
    const mobileScheme = (req.query['mobileScheme'] as string | undefined)?.trim();

    if (origin && !isAllowedOrigin(origin, req.isStaging)) {
      sendError(
        res,
        validationError([{ field: 'origin', message: 'Origin not allowed', rule: 'invalid' }])
      );
      return;
    }
    if (mobileScheme && !ALLOWED_MOBILE_SCHEMES.has(mobileScheme)) {
      sendError(
        res,
        validationError([
          { field: 'mobileScheme', message: 'Unknown mobile scheme', rule: 'invalid' },
        ])
      );
      return;
    }
    const statePayload = mobileScheme
      ? encodeOAuthState(uid, '', mobileScheme)
      : origin
        ? encodeOAuthState(uid, origin)
        : uid;
    oauthUrl.searchParams.set('state', statePayload);

    logger.debug('[Microsoft Connect URL] Generated OAuth URL', {
      uid: uid.substring(0, 8) + '...',
      redirectUri,
      origin,
      mobileScheme,
    });

    res.json({ url: oauthUrl.toString() });
  })
);

// ============================================================================
// GET /auth/microsoft/callback
// Microsoft OAuth2 redirect — no auth guard (called by Microsoft).
// ============================================================================
router.get(
  '/microsoft/callback',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const {
      code,
      state: rawState,
      error: oauthError,
      error_description: errorDescription,
    } = req.query as Record<string, string>;
    const { uid, origin: stateOrigin, mobileScheme } = decodeOAuthState(rawState ?? '');

    const renderResult = (success: boolean, message: string) => {
      const params = new URLSearchParams({
        provider: 'microsoft',
        success: String(success),
        message,
      });
      if (mobileScheme && ALLOWED_MOBILE_SCHEMES.has(mobileScheme)) {
        res.redirect(`${mobileScheme}://oauth/callback?${params.toString()}`);
      } else {
        const frontendUrl =
          stateOrigin && isAllowedOrigin(stateOrigin, req.isStaging)
            ? stateOrigin
            : getDefaultFrontendUrl(req.isStaging);
        res.redirect(`${frontendUrl}/oauth/success?${params.toString()}`);
      }
    };

    if (oauthError) {
      logger.warn('[Microsoft Callback] OAuth error', { error: oauthError, uid });
      if (oauthError === 'server_error' && uid) {
        try {
          const { db: checkDb } = req.firebase!;
          const tokenDoc = await checkDb
            .collection('Users')
            .doc(uid)
            .collection(OAUTH_TOKEN_SUBCOLLECTION)
            .doc('microsoft')
            .get();
          const existingTokenDoc = tokenDoc.exists
            ? tokenDoc
            : await checkDb
                .collection('Users')
                .doc(uid)
                .collection(LEGACY_EMAIL_TOKEN_SUBCOLLECTION)
                .doc('microsoft')
                .get();
          if (existingTokenDoc.exists) {
            logger.info(
              '[Microsoft Callback] server_error but token exists — treating as success',
              { uid: uid.substring(0, 8) + '...' }
            );
            renderResult(true, 'Microsoft connected!');
            return;
          }
        } catch {
          /* ignore */
        }
      }
      renderResult(
        false,
        oauthError === 'access_denied' ? 'Connection cancelled' : (errorDescription ?? oauthError)
      );
      return;
    }

    if (!code || !uid) {
      renderResult(false, 'Invalid callback — missing code or state');
      return;
    }

    const { db } = req.firebase!;

    const clientId = getMicrosoftClientId(req.isStaging);
    const clientSecret = getMicrosoftClientSecret(req.isStaging);
    const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
    const pathPrefix = req.isStaging ? '/api/v1/staging' : '/api/v1';
    const redirectUri = `${backendUrl}${pathPrefix}/auth/microsoft/callback`;

    try {
      const payload = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      });

      const tokenResponse = await fetch(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: payload.toString(),
        }
      );

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string;
        refresh_token?: string;
        id_token?: string;
        error?: string;
        error_description?: string;
      };

      if (tokenData.error || !tokenData.refresh_token) {
        const errMsg = tokenData.error_description ?? tokenData.error ?? 'Token exchange failed';
        logger.warn('[Microsoft Callback] Token exchange failed', {
          uid,
          error: tokenData.error,
          description: errMsg,
        });
        renderResult(false, errMsg);
        return;
      }

      let connectedEmail: string | undefined;
      try {
        const graphResponse = await fetch(
          'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
          { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
        );
        const graphData = (await graphResponse.json()) as {
          mail?: string;
          userPrincipalName?: string;
        };
        connectedEmail = graphData.mail ?? graphData.userPrincipalName;
      } catch {
        /* ignore */
      }

      const userRef = db.collection('Users').doc(uid);
      const tokenRef = userRef.collection(OAUTH_TOKEN_SUBCOLLECTION).doc('microsoft');
      const legacyTokenRef = userRef.collection(LEGACY_EMAIL_TOKEN_SUBCOLLECTION).doc('microsoft');
      const now = new Date().toISOString();

      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const userData = userDoc.data() as
          | { connectedEmails?: Array<{ provider: string; email?: string }> }
          | undefined;
        const existing = userData?.connectedEmails ?? [];
        const filtered = existing.filter((e) => e.provider !== 'microsoft');
        const batch = db.batch();
        batch.set(
          tokenRef,
          {
            provider: 'microsoft',
            refreshToken: tokenData.refresh_token,
            accessToken: tokenData.access_token,
            updatedAt: now,
            ...(connectedEmail && { email: connectedEmail }),
          },
          { merge: true }
        );
        batch.update(userRef, {
          connectedEmails: [
            ...filtered,
            {
              provider: 'microsoft',
              isActive: true,
              connectedAt: now,
              ...(connectedEmail && { email: connectedEmail }),
            },
          ],
          updatedAt: now,
        });
        batch.delete(legacyTokenRef);
        await batch.commit();
        await invalidateProfileCaches(uid).catch((err) =>
          logger.warn('[Microsoft Callback] Failed to invalidate profile cache', { uid, err })
        );
      } else {
        await tokenRef.set(
          {
            provider: 'microsoft',
            refreshToken: tokenData.refresh_token,
            accessToken: tokenData.access_token,
            updatedAt: now,
            ...(connectedEmail && { email: connectedEmail }),
          },
          { merge: true }
        );
        await legacyTokenRef.delete().catch((error) => {
          logger.warn('[Microsoft Callback] Failed to delete legacy Microsoft token doc', {
            uid,
            error,
          });
        });
      }

      logger.info('[Microsoft Callback] Microsoft token saved', {
        uid: uid.substring(0, 8) + '...',
        email: connectedEmail,
      });
      renderResult(
        true,
        connectedEmail ? `Microsoft connected (${connectedEmail})` : 'Microsoft connected!'
      );
    } catch (err) {
      logger.error('[Microsoft Callback] Unexpected error', { uid, error: err });
      renderResult(false, 'Connection failed. Please try again.');
    }
  })
);

// ============================================================================
// POST /auth/google/connect-gmail
// Exchanges Google serverAuthCode (native mobile) for refresh token.
// ============================================================================
router.post(
  '/google/connect-gmail',
  appGuard,
  validateBody(ConnectGmailDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const uid = req.user!.uid;
    const {
      serverAuthCode,
      accessToken: webAccessToken,
      redirectUri,
    } = req.body as ConnectGmailDto;

    if (!serverAuthCode && !webAccessToken) {
      sendError(
        res,
        validationError([
          {
            field: 'serverAuthCode',
            message: 'Either serverAuthCode (native/mobile) or accessToken (web) is required',
            rule: 'required',
          },
        ])
      );
      return;
    }

    const googleClientId = req.isStaging
      ? (process.env['STAGING_CLIENT_ID'] ?? process.env['CLIENT_ID'] ?? '')
      : (process.env['CLIENT_ID'] ?? '');
    const googleClientSecret = req.isStaging
      ? (process.env['STAGING_CLIENT_SECRET'] ?? process.env['CLIENT_SECRET'] ?? '')
      : (process.env['CLIENT_SECRET'] ?? '');

    logger.debug('[Google Connect Gmail] Environment config', {
      isStaging: req.isStaging,
      clientId: googleClientId.substring(0, 20) + '...',
    });

    /**
     * Write Gmail token + connectedEmails with retry.
     * Handles race condition where connect-gmail fires before create-user completes.
     */
    const writeWithRetry = async (
      tokenFields: Record<string, unknown>,
      email: string | undefined
    ): Promise<void> => {
      const MAX_RETRIES = 4;
      const BASE_DELAY_MS = 500;
      const userRef = db.collection('Users').doc(uid);
      const tokenRef = userRef.collection(OAUTH_TOKEN_SUBCOLLECTION).doc(GOOGLE_OAUTH_TOKEN_DOC_ID);
      const legacyTokenRef = userRef.collection(LEGACY_EMAIL_TOKEN_SUBCOLLECTION).doc('gmail');

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.debug('[Google Connect Gmail] User doc not ready — retrying Firestore write', {
            uid: uid.substring(0, 8) + '...',
            attempt,
            delayMs: delay,
          });
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }

        try {
          const now = new Date().toISOString();
          const snap = await userRef.get();
          const existing = (snap.data()?.['connectedEmails'] as ConnectedEmail[] | undefined) ?? [];
          const filtered = existing.filter((e) => e.provider !== 'gmail');

          const meta: ConnectedEmail = {
            email: email ?? '',
            provider: 'gmail',
            isActive: true,
            connectedAt: now,
          };

          const batch = db.batch();
          batch.update(userRef, {
            connectedEmails: [...filtered, meta],
            updatedAt: now,
          });
          batch.set(
            tokenRef,
            {
              ...tokenFields,
              email: email ?? '',
              lastRefreshedAt: now,
              updatedAt: now,
            },
            { merge: true }
          );
          batch.delete(legacyTokenRef);
          await batch.commit();
          return;
        } catch (err) {
          const e = err as { code?: number; message?: string };
          const isNotFound =
            e.code === 5 || (typeof e.message === 'string' && e.message.includes('NOT_FOUND'));
          if (!isNotFound || attempt === MAX_RETRIES) throw err;
        }
      }
    };

    // Web/PWA path: store accessToken directly (no code exchange)
    if (!serverAuthCode && webAccessToken) {
      logger.debug('[Google Connect Gmail] Storing web accessToken directly', {
        uid: uid.substring(0, 8) + '...',
      });
      const connectedEmail = req.user!.email;
      await writeWithRetry(
        { provider: GOOGLE_OAUTH_TOKEN_DOC_ID, accessToken: webAccessToken },
        connectedEmail
      );
      logger.info('[Google Connect Gmail] Web accessToken saved', {
        uid: uid.substring(0, 8) + '...',
        email: connectedEmail,
      });
      await invalidateProfileCaches(uid).catch((err) =>
        logger.warn('[Google Connect Gmail] Cache invalidation failed', { uid, err })
      );
      res.json({ success: true, email: connectedEmail });
      return;
    }

    // Native/Browser path: exchange serverAuthCode for refresh_token
    logger.debug('[Google Connect Gmail] Exchanging authorization code', {
      uid: uid.substring(0, 8) + '...',
      hasRedirectUri: !!redirectUri,
    });

    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams({
      code: serverAuthCode!,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri ?? '',
    });

    let tokenData: {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
      error?: string;
      error_description?: string;
    };

    try {
      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      tokenData = (await tokenResponse.json()) as typeof tokenData;
    } catch (fetchErr) {
      logger.error('[Google Connect Gmail] Network error contacting Google token endpoint', {
        uid,
        error: fetchErr,
      });
      sendError(res, internalError(fetchErr));
      return;
    }

    if (tokenData.error || !tokenData.refresh_token) {
      logger.warn('[Google Connect Gmail] Token exchange failed', {
        uid,
        googleError: tokenData.error,
        googleErrorDescription: tokenData.error_description,
        hasRefreshToken: !!tokenData.refresh_token,
        clientIdUsed: googleClientId.substring(0, 30) + '...',
        isStaging: req.isStaging,
      });
      const googleErrMsg = tokenData.error
        ? `[${tokenData.error}] ${tokenData.error_description ?? 'Token exchange failed'}`
        : 'No refresh_token returned — check GIDServerClientID matches STAGING_CLIENT_ID';
      sendError(
        res,
        validationError([{ field: 'serverAuthCode', message: googleErrMsg, rule: 'invalid' }])
      );
      return;
    }

    let connectedEmail = req.user!.email;
    if (tokenData.id_token) {
      try {
        const base64Url = tokenData.id_token.split('.')[1];
        if (base64Url) {
          const payload = JSON.parse(Buffer.from(base64Url, 'base64url').toString()) as {
            email?: string;
          };
          if (payload.email) connectedEmail = payload.email;
        }
      } catch {
        /* use req.user.email fallback */
      }
    }

    await writeWithRetry(
      { provider: GOOGLE_OAUTH_TOKEN_DOC_ID, refreshToken: tokenData.refresh_token },
      connectedEmail
    );

    logger.info('[Google Connect Gmail] Gmail token saved successfully', {
      uid: uid.substring(0, 8) + '...',
      email: connectedEmail,
    });

    res.json({ success: true, email: connectedEmail });
  })
);

// ============================================================================
// POST /auth/microsoft/connect-mail
// Store Microsoft credentials via authorization code or direct token flow.
// ============================================================================
router.post(
  '/microsoft/connect-mail',
  appGuard,
  validateBody(ConnectMicrosoftDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const uid = req.user!.uid;
    const { code, redirectUri, accessToken, refreshToken } = req.body as ConnectMicrosoftDto;

    if (!code && !accessToken) {
      res.status(400).json({
        error: 'invalid_request',
        message: 'Either code+redirectUri or accessToken must be provided',
      });
      return;
    }

    logger.debug('[Microsoft Connect Mail] Processing request', {
      uid: uid.substring(0, 8) + '...',
      flow: code ? 'authorization_code' : 'direct_token',
      hasRefreshToken: !!refreshToken,
    });

    let finalAccessToken: string;
    let finalRefreshToken: string | undefined;
    let email: string | undefined;

    if (code && redirectUri) {
      logger.debug('[Microsoft Connect Mail] Exchanging authorization code');

      const isMobileRedirect =
        redirectUri.startsWith('nxt1sports://') || redirectUri.startsWith('nxt1app://');
      logger.debug('[Microsoft Connect Mail] Token exchange config', {
        redirectUri,
        isMobileRedirect,
        sendingClientSecret: !isMobileRedirect,
      });

      const tokenParams: Record<string, string> = {
        client_id: getMicrosoftClientId(req.isStaging),
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      };
      if (!isMobileRedirect) {
        tokenParams['client_secret'] = getMicrosoftClientSecret(req.isStaging);
      }

      try {
        const tokenResponse = await fetch(
          'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(tokenParams),
          }
        );

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json().catch(() => ({}));
          logger.error('[Microsoft Connect Mail] Token exchange failed', {
            status: tokenResponse.status,
            error: errorData,
          });
          res.status(tokenResponse.status).json({
            error: 'token_exchange_failed',
            message: `Failed to exchange Microsoft authorization code: ${(errorData as Record<string, unknown>)['error_description'] || tokenResponse.statusText}`,
          });
          return;
        }

        const tokenData = await tokenResponse.json();
        finalAccessToken = tokenData.access_token;
        finalRefreshToken = tokenData.refresh_token;

        const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${finalAccessToken}` },
        });
        if (graphResponse.ok) {
          const userData = await graphResponse.json();
          email = userData.mail || userData.userPrincipalName;
        }
      } catch (err) {
        logger.error('[Microsoft Connect Mail] Token exchange error', { error: err });
        throw err;
      }
    } else {
      finalAccessToken = accessToken!;
      finalRefreshToken = refreshToken;
      email = req.user!.email;
      logger.debug('[Microsoft Connect Mail] Using direct token flow');
    }

    const writeWithRetry = async (userEmail: string | undefined): Promise<void> => {
      const MAX_RETRIES = 4;
      const BASE_DELAY_MS = 500;
      const userRef = db.collection('Users').doc(uid);
      const tokenRef = userRef.collection(OAUTH_TOKEN_SUBCOLLECTION).doc('microsoft');
      const legacyTokenRef = userRef.collection(LEGACY_EMAIL_TOKEN_SUBCOLLECTION).doc('microsoft');

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.debug('[Microsoft Connect Mail] User doc not ready — retrying', {
            uid: uid.substring(0, 8) + '...',
            attempt,
            delayMs: delay,
          });
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }

        try {
          const now = new Date().toISOString();
          const snap = await userRef.get();
          const existing = (snap.data()?.['connectedEmails'] as ConnectedEmail[] | undefined) ?? [];
          const filtered = existing.filter((e) => e.provider !== 'microsoft');

          const meta: ConnectedEmail = {
            email: userEmail ?? '',
            provider: 'microsoft',
            isActive: true,
            connectedAt: now,
          };

          const tokenData: Record<string, unknown> = {
            provider: 'microsoft',
            accessToken: finalAccessToken,
            email: userEmail ?? '',
            lastRefreshedAt: now,
            updatedAt: now,
          };

          if (finalRefreshToken) {
            tokenData['refreshToken'] = finalRefreshToken;
            logger.debug('[Microsoft Connect Mail] ✅ Storing refreshToken for long-term access');
          } else {
            logger.warn(
              '[Microsoft Connect Mail] ⚠️ No refreshToken - accessToken will expire in 1 hour'
            );
          }

          const batch = db.batch();
          batch.update(userRef, { connectedEmails: [...filtered, meta], updatedAt: now });
          batch.set(tokenRef, tokenData, { merge: true });
          batch.delete(legacyTokenRef);
          await batch.commit();
          return;
        } catch (err) {
          const e = err as { code?: number; message?: string };
          const isNotFound =
            e.code === 5 || (typeof e.message === 'string' && e.message.includes('NOT_FOUND'));
          if (!isNotFound || attempt === MAX_RETRIES) throw err;
        }
      }
    };

    await writeWithRetry(email || req.user!.email);

    logger.info('[Microsoft Connect Mail] Token saved successfully', {
      uid: uid.substring(0, 8) + '...',
      email: email || req.user!.email,
      hasRefreshToken: !!finalRefreshToken,
    });

    await invalidateProfileCaches(uid).catch((err) =>
      logger.warn('[Microsoft Connect Mail] Cache invalidation failed', { uid, err })
    );

    res.json({ success: true, email: email || req.user!.email });
  })
);

// ============================================================================
// POST /auth/yahoo/connect-mail
// Exchange Yahoo authorization code for refresh token.
// ============================================================================
router.post(
  '/yahoo/connect-mail',
  appGuard,
  validateBody(ConnectYahooDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const uid = req.user!.uid;
    const { code, redirectUri } = req.body as ConnectYahooDto;

    logger.debug('[Yahoo Connect Mail] Exchanging authorization code', {
      uid: uid.substring(0, 8) + '...',
      redirectUri,
    });

    const writeWithRetry = async (
      tokenFields: Record<string, unknown>,
      email: string | undefined
    ): Promise<void> => {
      const MAX_RETRIES = 4;
      const BASE_DELAY_MS = 500;
      const userRef = db.collection('Users').doc(uid);
      const tokenRef = userRef.collection(OAUTH_TOKEN_SUBCOLLECTION).doc('yahoo');
      const legacyTokenRef = userRef.collection(LEGACY_EMAIL_TOKEN_SUBCOLLECTION).doc('yahoo');

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.debug('[Yahoo Connect Mail] User doc not ready — retrying', {
            uid: uid.substring(0, 8) + '...',
            attempt,
            delayMs: delay,
          });
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }

        try {
          const now = new Date().toISOString();
          const snap = await userRef.get();
          const existing = (snap.data()?.['connectedEmails'] as ConnectedEmail[] | undefined) ?? [];
          const filtered = existing.filter((e) => e.provider !== 'yahoo');

          const meta: ConnectedEmail = {
            email: email ?? '',
            provider: 'yahoo',
            isActive: true,
            connectedAt: now,
          };

          const batch = db.batch();
          batch.update(userRef, { connectedEmails: [...filtered, meta], updatedAt: now });
          batch.set(
            tokenRef,
            {
              ...tokenFields,
              email: email ?? '',
              lastRefreshedAt: now,
              updatedAt: now,
            },
            { merge: true }
          );
          batch.delete(legacyTokenRef);
          await batch.commit();
          return;
        } catch (err) {
          const e = err as { code?: number; message?: string };
          const isNotFound =
            e.code === 5 || (typeof e.message === 'string' && e.message.includes('NOT_FOUND'));
          if (!isNotFound || attempt === MAX_RETRIES) throw err;
        }
      }
    };

    const tokenEndpoint = 'https://api.login.yahoo.com/oauth2/get_token';
    const params = new URLSearchParams({
      code,
      client_id: process.env['YAHOO_CLIENT_ID'] ?? '',
      client_secret: process.env['YAHOO_CLIENT_SECRET'] ?? '',
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    let tokenData: {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    try {
      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      tokenData = (await tokenResponse.json()) as typeof tokenData;
    } catch (fetchErr) {
      logger.error('[Yahoo Connect Mail] Network error contacting Yahoo token endpoint', {
        uid,
        error: fetchErr,
      });
      sendError(res, internalError(fetchErr));
      return;
    }

    if (tokenData.error || !tokenData.refresh_token) {
      logger.warn('[Yahoo Connect Mail] Token exchange failed', {
        uid,
        error: tokenData.error,
        description: tokenData.error_description,
        hasRefreshToken: !!tokenData.refresh_token,
      });
      sendError(
        res,
        validationError([
          {
            field: 'code',
            message:
              tokenData.error_description ??
              'Failed to exchange code — code may be expired or already used',
            rule: 'invalid',
          },
        ])
      );
      return;
    }

    let connectedEmail = req.user!.email;
    if (tokenData.access_token) {
      try {
        const userinfoResponse = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userinfo = (await userinfoResponse.json()) as { email?: string };
        if (userinfo.email) connectedEmail = userinfo.email;
      } catch {
        /* fallback to req.user.email */
      }
    }

    await writeWithRetry(
      { provider: 'yahoo', refreshToken: tokenData.refresh_token },
      connectedEmail
    );

    logger.info('[Yahoo Connect Mail] Yahoo token saved successfully', {
      uid: uid.substring(0, 8) + '...',
      email: connectedEmail,
    });

    await invalidateProfileCaches(uid).catch((err) =>
      logger.warn('[Yahoo Connect Mail] Cache invalidation failed', { uid, err })
    );

    res.json({ success: true, email: connectedEmail });
  })
);

export default router;
