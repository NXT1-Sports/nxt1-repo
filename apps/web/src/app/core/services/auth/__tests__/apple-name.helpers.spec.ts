import { describe, expect, it } from 'vitest';

import { extractAppleNameFieldsFromAuthResult } from '../apple-name.helpers';

describe('extractAppleNameFieldsFromAuthResult', () => {
  it('uses split name fields from the provider payload when available', () => {
    expect(
      extractAppleNameFieldsFromAuthResult({
        user: {
          displayName: 'john.keller-1',
          email: 'john.keller-1@privaterelay.appleid.com',
        },
        additionalUserInfo: {
          profile: {
            given_name: 'John',
            family_name: 'Keller',
          },
        },
      })
    ).toEqual({
      firstName: 'John',
      lastName: 'Keller',
      displayName: 'John Keller',
    });
  });

  it('falls back to a real displayName when split fields are absent', () => {
    expect(
      extractAppleNameFieldsFromAuthResult({
        user: {
          displayName: 'John Keller',
          email: 'john.keller@icloud.com',
        },
      })
    ).toEqual({
      firstName: 'John',
      lastName: 'Keller',
      displayName: 'John Keller',
    });
  });

  it('drops synthetic displayName fallbacks when no real names are available', () => {
    expect(
      extractAppleNameFieldsFromAuthResult({
        user: {
          displayName: 'john.keller-1',
          email: 'john.keller-1@privaterelay.appleid.com',
        },
      })
    ).toEqual({});
  });
});
