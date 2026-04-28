import axios from 'axios';
import { LEGACY_EMAIL_TOKEN_SUBCOLLECTION, OAUTH_TOKEN_SUBCOLLECTION } from '@nxt1/core/auth';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import type { ToolExecutionContext } from '../../base.tool.js';
import { db as defaultDb } from '../../../../../utils/firebase.js';
import { stagingDb } from '../../../../../utils/firebase-staging.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';
import { resolveMicrosoftOAuthCredentials } from './microsoft-365-env.js';
import type { MicrosoftOAuthTokenDocument } from './shared.js';

const MICROSOFT_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1_000;
const MICROSOFT_ACCESS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1_000;

interface LoadedMicrosoftTokenDocument {
  readonly ref: DocumentReference;
  readonly data: MicrosoftOAuthTokenDocument;
}

function resolveFirestore(environment?: ToolExecutionContext['environment']): Firestore {
  if (environment === 'staging') return stagingDb;
  if (environment === 'production') return defaultDb;
  return process.env['NODE_ENV'] === 'staging' ? stagingDb : defaultDb;
}

function shouldRefreshAccessToken(lastRefreshedAt?: string): boolean {
  if (!lastRefreshedAt) return true;

  const refreshedAtMs = Date.parse(lastRefreshedAt);
  if (Number.isNaN(refreshedAtMs)) return true;

  return (
    Date.now() >=
    refreshedAtMs + MICROSOFT_ACCESS_TOKEN_TTL_MS - MICROSOFT_ACCESS_TOKEN_REFRESH_BUFFER_MS
  );
}

export interface Microsoft365AccessCredentials {
  readonly accessToken: string;
  readonly email: string;
}

export class Microsoft365TokenManagerService {
  async getValidAccessToken(context: ToolExecutionContext): Promise<Microsoft365AccessCredentials> {
    const loaded = await this.loadTokenDocument(context);
    const tokenDoc = loaded.data;

    if (!tokenDoc.accessToken && !tokenDoc.refreshToken) {
      throw new AgentEngineError(
        'MICROSOFT_365_AUTH_REQUIRED',
        'No Microsoft OAuth token was found for this user. Reconnect Microsoft in settings before using Microsoft tools.'
      );
    }

    if (tokenDoc.accessToken && !shouldRefreshAccessToken(tokenDoc.lastRefreshedAt)) {
      return {
        accessToken: tokenDoc.accessToken,
        email: tokenDoc.email ?? '',
      };
    }

    if (tokenDoc.refreshToken) {
      const refreshed = await this.refreshAccessToken(loaded, context.environment);
      return {
        accessToken: refreshed.accessToken,
        email: refreshed.email,
      };
    }

    if (tokenDoc.accessToken && (await this.isAccessTokenStillValid(tokenDoc.accessToken))) {
      return {
        accessToken: tokenDoc.accessToken,
        email: tokenDoc.email ?? '',
      };
    }

    throw new AgentEngineError(
      'MICROSOFT_365_AUTH_REQUIRED',
      'The connected Microsoft access token has expired and no refresh token is available. Reconnect Microsoft in settings to continue.'
    );
  }

  private async loadTokenDocument(
    context: ToolExecutionContext
  ): Promise<LoadedMicrosoftTokenDocument> {
    const firestore = resolveFirestore(context.environment);
    const userRef = firestore.collection('Users').doc(context.userId);
    const ref = userRef.collection(OAUTH_TOKEN_SUBCOLLECTION).doc('microsoft');
    const legacyRef = userRef.collection(LEGACY_EMAIL_TOKEN_SUBCOLLECTION).doc('microsoft');

    const snapshot = await ref.get();
    if (snapshot.exists) {
      return {
        ref,
        data: snapshot.data() as MicrosoftOAuthTokenDocument,
      };
    }

    const legacySnapshot = await legacyRef.get();
    if (!legacySnapshot.exists) {
      throw new AgentEngineError(
        'MICROSOFT_365_AUTH_REQUIRED',
        'This user does not have Microsoft connected yet. Ask them to connect Outlook in settings first.'
      );
    }

    const legacyData = legacySnapshot.data() as Partial<MicrosoftOAuthTokenDocument>;
    const migratedData: MicrosoftOAuthTokenDocument = {
      provider: 'microsoft',
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
    } catch {
      // Soft-fail migration to avoid blocking user actions.
    }

    return {
      ref,
      data: migratedData,
    };
  }

  private async refreshAccessToken(
    loaded: LoadedMicrosoftTokenDocument,
    environment?: ToolExecutionContext['environment']
  ): Promise<{ accessToken: string; email: string }> {
    const refreshToken = loaded.data.refreshToken;
    if (!refreshToken) {
      throw new AgentEngineError(
        'MICROSOFT_365_AUTH_REQUIRED',
        'Cannot refresh Microsoft access because the refresh token is missing.'
      );
    }

    const credentials = resolveMicrosoftOAuthCredentials(environment);
    if (!credentials.clientId || !credentials.clientSecret) {
      throw new AgentEngineError(
        'MICROSOFT_365_CONFIG_INVALID',
        'Microsoft OAuth credentials are missing on the backend. Configure MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.'
      );
    }

    try {
      const params = new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope:
          'https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/Files.ReadWrite offline_access',
      });

      const response = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        params.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 20_000,
        }
      );

      const accessToken = response.data?.['access_token'];
      const nextRefreshToken = response.data?.['refresh_token'];
      if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
        throw new AgentEngineError(
          'MICROSOFT_365_REQUEST_FAILED',
          'Microsoft token refresh succeeded without a valid access token.'
        );
      }

      const email = (await this.resolveEmail(accessToken)) ?? loaded.data.email ?? '';

      await loaded.ref.set(
        {
          provider: 'microsoft',
          accessToken,
          ...(typeof nextRefreshToken === 'string' && nextRefreshToken.length > 0
            ? { refreshToken: nextRefreshToken }
            : {}),
          ...(email ? { email } : {}),
          lastRefreshedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return { accessToken, email };
    } catch (error) {
      if (error instanceof AgentEngineError) throw error;
      throw new AgentEngineError(
        'MICROSOFT_365_REQUEST_FAILED',
        error instanceof Error
          ? `Failed to refresh Microsoft access token: ${error.message}`
          : 'Failed to refresh Microsoft access token.',
        { cause: error }
      );
    }
  }

  private async isAccessTokenStillValid(accessToken: string): Promise<boolean> {
    try {
      await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10_000,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async resolveEmail(accessToken: string): Promise<string | null> {
    try {
      const response = await axios.get(
        'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10_000,
        }
      );

      const mail = response.data?.['mail'];
      const upn = response.data?.['userPrincipalName'];

      if (typeof mail === 'string' && mail.trim().length > 0) return mail;
      if (typeof upn === 'string' && upn.trim().length > 0) return upn;
      return null;
    } catch {
      return null;
    }
  }
}
