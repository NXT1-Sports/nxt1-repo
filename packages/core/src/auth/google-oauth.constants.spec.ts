import { describe, expect, it } from 'vitest';

import {
  GOOGLE_GMAIL_CONNECT_SCOPES,
  GOOGLE_IDENTITY_SCOPES,
  GOOGLE_OAUTH_SCOPES,
  GOOGLE_WORKSPACE_PERMISSION_SCOPES,
  hasGrantedGoogleWorkspaceScopes,
} from './google-oauth.constants';

describe('google oauth constants', () => {
  it('defines the canonical workspace scope bundle used by sign-up flows', () => {
    expect(GOOGLE_OAUTH_SCOPES).toEqual([
      ...GOOGLE_IDENTITY_SCOPES,
      ...GOOGLE_WORKSPACE_PERMISSION_SCOPES,
    ]);
  });

  it('keeps the gmail-only connect flow narrower than the full workspace bundle', () => {
    expect(GOOGLE_GMAIL_CONNECT_SCOPES).toEqual(['https://www.googleapis.com/auth/gmail.modify']);
  });

  it('recognizes new canonical workspace grants', () => {
    expect(
      hasGrantedGoogleWorkspaceScopes(
        'openid https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.readonly'
      )
    ).toBe(true);
  });

  it('returns false for unrelated scopes', () => {
    expect(hasGrantedGoogleWorkspaceScopes('openid profile')).toBe(false);
  });
});
