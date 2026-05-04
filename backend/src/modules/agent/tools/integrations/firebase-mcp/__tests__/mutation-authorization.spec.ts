import { describe, expect, it } from 'vitest';

import { canManageOrganizationMutation } from '../mutation-authorization.js';

function makeFirestore(teamDocs: readonly Array<Record<string, unknown>>) {
  return {
    collection(collectionName: string) {
      if (collectionName !== 'Teams') {
        throw new Error(`Unexpected collection ${collectionName}`);
      }

      return {
        where(field: string, operator: string, value: string) {
          expect(field).toBe('organizationId');
          expect(operator).toBe('==');

          const filteredDocs = teamDocs
            .filter((teamDoc) => teamDoc['organizationId'] === value)
            .map((teamDoc) => ({
              data: () => teamDoc,
            }));

          return {
            async get() {
              return { docs: filteredDocs };
            },
          };
        },
      };
    },
  } as never;
}

describe('canManageOrganizationMutation', () => {
  it('allows the organization owner', async () => {
    const allowed = await canManageOrganizationMutation(makeFirestore([]), 'owner-1', 'org-1', {
      ownerId: 'owner-1',
      admins: [],
    });

    expect(allowed).toBe(true);
  });

  it('allows an organization admin', async () => {
    const allowed = await canManageOrganizationMutation(makeFirestore([]), 'director-1', 'org-1', {
      ownerId: 'owner-1',
      admins: [{ userId: 'director-1', role: 'director' }],
    });

    expect(allowed).toBe(true);
  });

  it('allows a team admin on a team inside the organization', async () => {
    const allowed = await canManageOrganizationMutation(
      makeFirestore([
        {
          organizationId: 'org-1',
          adminIds: ['coach-1'],
        },
      ]),
      'coach-1',
      'org-1',
      { ownerId: 'owner-1', admins: [] }
    );

    expect(allowed).toBe(true);
  });

  it('rejects a user who is not an org admin or team admin for the organization', async () => {
    const allowed = await canManageOrganizationMutation(
      makeFirestore([
        {
          organizationId: 'org-1',
          adminIds: ['coach-1'],
        },
      ]),
      'user-2',
      'org-1',
      { ownerId: 'owner-1', admins: [] }
    );

    expect(allowed).toBe(false);
  });
});
