/**
 * Shared Google OAuth and token-storage constants.
 * Pure TypeScript so web, mobile, backend, and functions stay aligned.
 */

export const GOOGLE_IDENTITY_SCOPES = ['openid', 'email', 'profile'] as const;

export const GOOGLE_WORKSPACE_PERMISSION_SCOPES = [
  // `gmail.modify` satisfies read/send/compose flows via Google's scope hierarchy.
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
] as const;

export const GOOGLE_OAUTH_SCOPES = [
  ...GOOGLE_IDENTITY_SCOPES,
  ...GOOGLE_WORKSPACE_PERMISSION_SCOPES,
] as const;

export const GOOGLE_GMAIL_CONNECT_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
] as const;

export const OAUTH_TOKEN_SUBCOLLECTION = 'oauthTokens' as const;
export const LEGACY_EMAIL_TOKEN_SUBCOLLECTION = 'emailTokens' as const;
export const GOOGLE_OAUTH_TOKEN_DOC_ID = 'google' as const;

export type OAuthEmailProviderId = 'gmail' | 'microsoft' | 'yahoo';
export type OAuthTokenDocId = 'google' | 'microsoft' | 'yahoo';

export function getOAuthTokenDocId(provider: OAuthEmailProviderId): OAuthTokenDocId {
  return provider === 'gmail' ? GOOGLE_OAUTH_TOKEN_DOC_ID : provider;
}

export function hasGrantedGoogleWorkspaceScopes(grantedScopes: string): boolean {
  return GOOGLE_WORKSPACE_PERMISSION_SCOPES.some((scope) => grantedScopes.includes(scope));
}
