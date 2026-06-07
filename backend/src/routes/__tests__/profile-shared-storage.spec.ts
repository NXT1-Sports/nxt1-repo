import { afterEach, describe, expect, it } from 'vitest';

import { docToUser, resolvePublicStorageBucket, type UserFirestoreDoc } from '../profile/shared.js';

const ENV_KEYS = [
  'NODE_ENV',
  'APP_ENV',
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'STAGING_FIREBASE_STORAGE_BUCKET',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

function userWithProfileImgs(profileImgs: string[]): UserFirestoreDoc {
  return {
    firstName: 'Sophia',
    lastName: 'Green',
    profileImgs,
  };
}

describe('profile storage URL normalization', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('preserves tokenized Firebase Storage download URLs', () => {
    const downloadUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fabc%2Fprofile%2Favatar.jpg?alt=media&token=secret-token';

    const user = docToUser('abc', userWithProfileImgs([downloadUrl]));

    expect(user.profileImgs).toEqual([downloadUrl]);
  });

  it('uses the production bucket for legacy raw paths in production', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['FIREBASE_STORAGE_BUCKET'] = 'nxt-1-v2.firebasestorage.app';
    process.env['STAGING_FIREBASE_STORAGE_BUCKET'] = 'nxt-1-staging-v2.firebasestorage.app';

    const user = docToUser('abc', userWithProfileImgs(['Users/abc_1776310955568']));

    expect(resolvePublicStorageBucket()).toBe('nxt-1-v2.firebasestorage.app');
    expect(user.profileImgs).toEqual([
      'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/abc_1776310955568',
    ]);
  });

  it('uses the staging bucket for legacy raw paths in staging', () => {
    process.env['NODE_ENV'] = 'staging';
    process.env['FIREBASE_STORAGE_BUCKET'] = 'nxt-1-v2.firebasestorage.app';
    process.env['STAGING_FIREBASE_STORAGE_BUCKET'] = 'nxt-1-staging-v2.firebasestorage.app';

    const user = docToUser('abc', userWithProfileImgs(['Users/abc/profile/avatar.jpg']));

    expect(resolvePublicStorageBucket()).toBe('nxt-1-staging-v2.firebasestorage.app');
    expect(user.profileImgs).toEqual([
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/abc/profile/avatar.jpg',
    ]);
  });

  it('converts gs URLs to encoded raw GCS URLs without changing the bucket', () => {
    const user = docToUser(
      'abc',
      userWithProfileImgs(['gs://nxt-1-v2.firebasestorage.app/Users/abc/profile/avatar one.jpg'])
    );

    expect(user.profileImgs).toEqual([
      'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/abc/profile/avatar%20one.jpg',
    ]);
  });
});
