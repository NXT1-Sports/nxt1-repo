import axios from 'axios';
import {
  GOOGLE_OAUTH_TOKEN_DOC_ID,
  LEGACY_EMAIL_TOKEN_SUBCOLLECTION,
  OAUTH_TOKEN_SUBCOLLECTION,
} from '@nxt1/core/auth';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import type { ToolExecutionContext } from '../../base.tool.js';
import { db as defaultDb } from '../../../../../utils/firebase.js';
import { stagingDb } from '../../../../../utils/firebase-staging.js';
import { logger } from '../../../../../utils/logger.js';
import type { GoogleWorkspaceOAuthTokenDocument } from './shared.js';

const GOOGLE_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1_000;
const GOOGLE_ACCESS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1_000;

interface GoogleOAuthClientCredentials {
  readonly clientId: string;
  readonly clientSecret?: string;
}

interface LoadedGoogleTokenDocument {
  readonly ref: DocumentReference;
  readonly data: GoogleWorkspaceOAuthTokenDocument;
  readonly db: Firestore;
}

function resolveFirestore(environment?: ToolExecutionContext['environment']): Firestore {
  if (environment === 'staging') return stagingDb;
  if (environment === 'production') return defaultDb;
  return process.env['NODE_ENV'] === 'staging' ? stagingDb : defaultDb;
}

function resolveGoogleClientCredentials(
  environment?: ToolExecutionContext['environment']
): GoogleOAuthClientCredentials {
  const isStaging =
    environment === 'staging' || (!environment && process.env['NODE_ENV'] === 'staging');

  const clientId = isStaging
    ? (process.env['GOOGLE_WORKSPACE_STAGING_CLIENT_ID'] ??
      process.env['STAGING_CLIENT_ID'] ??
      process.env['GOOGLE_WORKSPACE_CLIENT_ID'] ??
      process.env['CLIENT_ID'] ??
      '')
    : (process.env['GOOGLE_WORKSPACE_CLIENT_ID'] ?? process.env['CLIENT_ID'] ?? '');

  const clientSecret = isStaging
    ? (process.env['GOOGLE_WORKSPACE_STAGING_CLIENT_SECRET'] ??
      process.env['STAGING_CLIENT_SECRET'] ??
      process.env['GOOGLE_WORKSPACE_CLIENT_SECRET'] ??
      process.env['CLIENT_SECRET'])
    : (process.env['GOOGLE_WORKSPACE_CLIENT_SECRET'] ?? process.env['CLIENT_SECRET']);

  return { clientId, clientSecret };
}

function shouldRefreshAccessToken(lastRefreshedAt?: string): boolean {
  if (!lastRefreshedAt) return true;

  const refreshedAtMs = Date.parse(lastRefreshedAt);
  if (Number.isNaN(refreshedAtMs)) return true;

  return (
    Date.now() >= refreshedAtMs + GOOGLE_ACCESS_TOKEN_TTL_MS - GOOGLE_ACCESS_TOKEN_REFRESH_BUFFER_MS
  );
}

export interface GoogleWorkspaceAccessCredentials {
  readonly accessToken: string;
  readonly email: string;
}

export class GoogleWorkspaceTokenManagerService {
  async getValidAccessToken(
    context: ToolExecutionContext
  ): Promise<GoogleWorkspaceAccessCredentials> {
    const loaded = await this.loadTokenDocument(context);
    const tokenDoc = loaded.data;
    const email = tokenDoc.email ?? '';

    if (!tokenDoc.accessToken && !tokenDoc.refreshToken) {
      throw new Error(
        'No Google Workspace token was found for this user. Reconnect Google in settings before using Google Workspace tools.'
      );
    }

    if (tokenDoc.accessToken && !shouldRefreshAccessToken(tokenDoc.lastRefreshedAt)) {
      return { accessToken: tokenDoc.accessToken, email };
    }

    if (tokenDoc.refreshToken) {
      context.onProgress?.('Refreshing Google Workspace access…');
      const accessToken = await this.refreshAccessToken(
        loaded,
        context.userId,
        context.environment
      );
      return { accessToken, email };
    }

    if (tokenDoc.accessToken && (await this.isAccessTokenStillValid(tokenDoc.accessToken))) {
      return { accessToken: tokenDoc.accessToken, email };
    }

    throw new Error(
      'The connected Google Workspace access token has expired and no refresh token is available. Reconnect Google in settings to continue.'
    );
  }

  private async loadTokenDocument(
    context: ToolExecutionContext
  ): Promise<LoadedGoogleTokenDocument> {
    const firestore = resolveFirestore(context.environment);
    const userRef = firestore.collection('Users').doc(context.userId);
    const ref = userRef.collection(OAUTH_TOKEN_SUBCOLLECTION).doc(GOOGLE_OAUTH_TOKEN_DOC_ID);
    const legacyRef = userRef.collection(LEGACY_EMAIL_TOKEN_SUBCOLLECTION).doc('gmail');

    const snapshot = await ref.get();
    if (snapshot.exists) {
      return {
        ref,
        db: firestore,
        data: snapshot.data() as GoogleWorkspaceOAuthTokenDocument,
      };
    }

    const legacySnapshot = await legacyRef.get();
    if (!legacySnapshot.exists) {
      throw new Error(
        'This user does not have Google Workspace connected yet. Ask them to connect Google in settings first.'
      );
    }

    const legacyData = legacySnapshot.data() as Partial<GoogleWorkspaceOAuthTokenDocument>;
    const migratedData: GoogleWorkspaceOAuthTokenDocument = {
      provider: GOOGLE_OAUTH_TOKEN_DOC_ID,
      ...(legacyData.accessToken ? { accessToken: legacyData.accessToken } : {}),
      ...(legacyData.refreshToken ? { refreshToken: legacyData.refreshToken } : {}),
      ...(legacyData.email ? { email: legacyData.email } : {}),
      ...(legacyData.grantedScopes ? { grantedScopes: legacyData.grantedScopes } : {}),
      ...(legacyData.lastRefreshedAt ? { lastRefreshedAt: legacyData.lastRefreshedAt } : {}),
    };

    try {
      const batch = firestore.batch();
      batch.set(ref, migratedData, { merge: true });
      batch.delete(legacyRef);
      await batch.commit();
      logger.info('[GoogleWorkspaceTokenManager] Migrated legacy Gmail token doc to oauthTokens', {
        userId: context.userId,
        environment:
          context.environment ?? (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'production'),
      });
      return {
        ref,
        db: firestore,
        data: migratedData,
      };
    } catch (error) {
      logger.warn('[GoogleWorkspaceTokenManager] Failed to migrate legacy Gmail token doc', {
        userId: context.userId,
        environment:
          context.environment ?? (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'production'),
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        ref: legacyRef,
        db: firestore,
        data: migratedData,
      };
    }
  }

  private async refreshAccessToken(
    loaded: LoadedGoogleTokenDocument,
    userId: string,
    environment?: ToolExecutionContext['environment']
  ): Promise<string> {
    const refreshToken = loaded.data.refreshToken;
    if (!refreshToken) {
      throw new Error(
        'Cannot refresh Google Workspace access because the refresh token is missing.'
      );
    }

    const credentials = resolveGoogleClientCredentials(environment);
    if (!credentials.clientId) {
      throw new Error(
        'Google Workspace OAuth client credentials are not configured on the backend.'
      );
    }

    const params = new URLSearchParams({
      client_id: credentials.clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    if (credentials.clientSecret) {
      params.set('client_secret', credentials.clientSecret);
    }

    const { data } = await axios.post('https://oauth2.googleapis.com/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const nextAccessToken = data['access_token'];
    const nextRefreshToken = data['refresh_token'];
    if (typeof nextAccessToken !== 'string' || nextAccessToken.length === 0) {
      throw new Error('Google did not return a valid access token during refresh.');
    }

    const now = new Date().toISOString();
    await loaded.ref.set(
      {
        accessToken: nextAccessToken,
        lastRefreshedAt: now,
        ...(typeof nextRefreshToken === 'string' && nextRefreshToken.length > 0
          ? { refreshToken: nextRefreshToken }
          : {}),
      },
      { merge: true }
    );

    logger.info('[GoogleWorkspaceTokenManager] Refreshed Google Workspace token', {
      userId,
      environment:
        environment ?? (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'production'),
      hasRotatedRefreshToken: typeof nextRefreshToken === 'string' && nextRefreshToken.length > 0,
    });

    return nextAccessToken;
  }

  private async isAccessTokenStillValid(accessToken: string): Promise<boolean> {
    try {
      await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return true;
    } catch (error) {
      logger.warn('[GoogleWorkspaceTokenManager] Existing Google access token is no longer valid', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
