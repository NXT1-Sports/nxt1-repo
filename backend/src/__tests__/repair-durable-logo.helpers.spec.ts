import { describe, expect, it } from 'vitest';
import {
  classifyLogoForDurableRepair,
  durableLogoDestinationPath,
} from '../../scripts/data-migrations/repair-durable-logo.helpers.js';

const bucketName = 'nxt-1-v2.firebasestorage.app';

describe('durableLogoDestinationPath', () => {
  it('uses the durable organization and team logo destinations', () => {
    expect(durableLogoDestinationPath('organization', 'org-1')).toBe('Organizations/org-1/logo');
    expect(durableLogoDestinationPath('team', 'team-1')).toBe('Teams/team-1/logo');
  });
});

describe('classifyLogoForDurableRepair', () => {
  it('recognizes a tokenized Firebase URL at the exact organization destination', () => {
    expect(
      classifyLogoForDurableRepair({
        bucketName,
        entity: 'organization',
        entityId: 'org-1',
        logoUrl:
          'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Organizations%2Forg-1%2Flogo?alt=media&token=download-token',
      })
    ).toEqual({ kind: 'canonical', destinationPath: 'Organizations/org-1/logo' });
  });

  it('promotes a legacy temporary Firebase object into the durable team destination', () => {
    expect(
      classifyLogoForDurableRepair({
        bucketName,
        entity: 'team',
        entityId: 'team-1',
        logoUrl:
          'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Ftmp%2Fimage%2Flogo.png?alt=media&token=download-token',
      })
    ).toEqual({
      kind: 'promote',
      sourceKind: 'firebase-url',
      sourcePath: 'Users/user-1/threads/thread-1/tmp/image/logo.png',
      destinationPath: 'Teams/team-1/logo',
    });
  });

  it('promotes a tokenless Firebase URL and signed GCS URL in the configured bucket', () => {
    expect(
      classifyLogoForDurableRepair({
        bucketName,
        entity: 'organization',
        entityId: 'org-1',
        logoUrl:
          'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Organizations%2Forg-1%2Flogo?alt=media',
      })
    ).toMatchObject({
      kind: 'promote',
      sourceKind: 'firebase-url',
      sourcePath: 'Organizations/org-1/logo',
    });

    expect(
      classifyLogoForDurableRepair({
        bucketName,
        entity: 'team',
        entityId: 'team-1',
        logoUrl:
          'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/user-1/threads/thread-1/tmp/image/logo.png?X-Goog-Algorithm=GOOG4-RSA-SHA256',
      })
    ).toMatchObject({
      kind: 'promote',
      sourceKind: 'gcs-url',
      sourcePath: 'Users/user-1/threads/thread-1/tmp/image/logo.png',
    });
  });

  it('skips external, foreign-bucket, and unsafe paths', () => {
    expect(
      classifyLogoForDurableRepair({
        bucketName,
        entity: 'organization',
        entityId: 'org-1',
        logoUrl: 'https://cdn.example.com/logo.png',
      })
    ).toEqual({ kind: 'skip', reason: 'external-url' });

    expect(
      classifyLogoForDurableRepair({
        bucketName,
        entity: 'organization',
        entityId: 'org-1',
        logoUrl:
          'https://storage.googleapis.com/another-bucket/Organizations/org-1/logo?X-Goog-Signature=abc',
      })
    ).toEqual({ kind: 'skip', reason: 'foreign-bucket' });

    expect(
      classifyLogoForDurableRepair({
        bucketName,
        entity: 'organization',
        entityId: 'org-1',
        logoUrl: 'Users/user-1/../other/logo.png',
      })
    ).toEqual({ kind: 'skip', reason: 'unsafe-storage-path' });
  });
});
