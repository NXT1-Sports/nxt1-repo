import { describe, expect, it } from 'vitest';

import {
  extractProviderNameFields,
  getNameFields,
  isLikelySyntheticProviderDisplayName,
} from '../beforeUserCreate.helpers';

describe('beforeUserCreate helpers', () => {
  it('treats Apple-style relay aliases as synthetic provider display names', () => {
    expect(
      isLikelySyntheticProviderDisplayName(
        'john.keller-1',
        'john.keller-1@privaterelay.appleid.com'
      )
    ).toBe(true);
  });

  it('preserves real names returned by the provider', () => {
    expect(getNameFields('John Keller', 'john.keller@icloud.com')).toEqual({
      firstName: 'John',
      lastName: 'Keller',
      displayName: 'John Keller',
    });
  });

  it('drops placeholder names instead of persisting them to Firestore', () => {
    expect(getNameFields('john.keller-1', 'john.keller-1@privaterelay.appleid.com')).toEqual({});
  });

  it('extracts split provider names from Apple-style profile payloads', () => {
    expect(
      extractProviderNameFields({
        given_name: 'John',
        family_name: 'Keller',
      })
    ).toEqual({
      firstName: 'John',
      lastName: 'Keller',
      displayName: 'John Keller',
    });
  });

  it('prefers explicit split names over a synthetic display name fallback', () => {
    expect(
      getNameFields('john.keller-1', 'john.keller-1@privaterelay.appleid.com', {
        firstName: 'John',
        lastName: 'Keller',
      })
    ).toEqual({
      firstName: 'John',
      lastName: 'Keller',
      displayName: 'John Keller',
    });
  });
});
