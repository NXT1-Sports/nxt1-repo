import { describe, expect, it } from 'vitest';

import { buildUserDisplayContext } from '../../../../../../../../packages/core/src/models/user/user-display-context';
import { mapBackendProfileToCachedUserProfile } from '../auth-profile.mapper';

describe('mapBackendProfileToCachedUserProfile', () => {
  it('preserves the canonical team identifier for coach team routes', () => {
    const mapped = mapBackendProfileToCachedUserProfile({
      id: 'user-1',
      email: 'coach@nxt1.com',
      firstName: 'Coach',
      lastName: 'Taylor',
      role: 'coach',
      onboardingCompleted: true,
      sports: [
        {
          sport: 'Football',
          order: 0,
          team: {
            name: 'Argyle',
            teamId: 'team-doc-1',
            slug: 'argyle',
            logoUrl: 'https://cdn.example.com/argyle.png',
            organizationId: 'org-argyle',
            primaryColor: '#5f259f',
            secondaryColor: '#ffffff',
          },
        },
      ],
    });

    const ctx = buildUserDisplayContext({
      displayName: mapped.displayName,
      email: mapped.email,
      role: mapped.role,
      sports: mapped.sports as
        | ReadonlyArray<{
            readonly sport: string;
            readonly positions?: string[];
            readonly isPrimary?: boolean;
            readonly order?: number;
            readonly team?: {
              readonly name?: string;
              readonly logoUrl?: string | null;
              readonly logo?: string | null;
              readonly teamId?: string;
              readonly organizationId?: string;
              readonly slug?: string;
            };
          }>
        | undefined,
    });

    expect(mapped.sports?.[0]?.team).toMatchObject({
      teamId: 'team-doc-1',
      organizationId: 'org-argyle',
      primaryColor: '#5f259f',
      secondaryColor: '#ffffff',
      slug: 'argyle',
      name: 'Argyle',
    });
    expect(ctx?.profileRoute).toBe('/team/argyle/team-doc-1');
  });

  it('supports legacy string team codes and still builds the canonical team route', () => {
    const mapped = mapBackendProfileToCachedUserProfile({
      id: 'user-legacy-code',
      email: 'coach-legacy@nxt1.com',
      firstName: 'Legacy',
      lastName: 'Coach',
      role: 'coach',
      teamCode: 'ARG123',
      sports: [
        {
          sport: 'Football',
          order: 0,
          team: {
            name: 'Argyle',
            teamId: 'team-doc-legacy',
          },
        },
      ],
    });

    const ctx = buildUserDisplayContext({
      displayName: mapped.displayName,
      email: mapped.email,
      role: mapped.role,
      sports: mapped.sports as
        | ReadonlyArray<{
            readonly sport: string;
            readonly positions?: string[];
            readonly isPrimary?: boolean;
            readonly order?: number;
            readonly team?: {
              readonly name?: string;
              readonly logoUrl?: string | null;
              readonly logo?: string | null;
              readonly teamId?: string;
              readonly organizationId?: string;
              readonly slug?: string;
            };
          }>
        | undefined,
    });

    expect(mapped['teamCode']).toMatchObject({
      teamCode: 'ARG123',
      teamId: 'team-doc-legacy',
      slug: 'argyle',
      teamName: 'Argyle',
    });
    expect(ctx?.profileRoute).toBe('/team/argyle/team-doc-legacy');
  });

  it('derives selectedSports from normalized backend sports', () => {
    const mapped = mapBackendProfileToCachedUserProfile({
      id: 'user-selected-sports',
      email: 'athlete@nxt1.com',
      firstName: 'Alex',
      lastName: 'Player',
      role: 'athlete',
      sports: [
        {
          sport: 'Football',
          order: 0,
        },
        {
          sport: 'Track & Field',
          order: 1,
        },
      ],
    });

    expect(mapped['selectedSports']).toEqual(['Football', 'Track & Field']);
    expect(mapped['primarySport']).toBe('Football');
  });

  it('preserves connected emails for connected account sign-in state', () => {
    const mapped = mapBackendProfileToCachedUserProfile({
      id: 'user-connected-emails',
      email: 'athlete@nxt1.com',
      firstName: 'Alex',
      lastName: 'Player',
      role: 'athlete',
      connectedEmails: [
        {
          provider: 'gmail',
          email: 'alex@gmail.com',
          isActive: true,
          connectedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          provider: 'microsoft',
          email: 'alex@outlook.com',
          isActive: true,
          connectedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(mapped['connectedEmails']).toEqual([
      expect.objectContaining({ provider: 'gmail', isActive: true }),
      expect.objectContaining({ provider: 'microsoft', isActive: true }),
    ]);
  });

  it('ignores the top-level compatibility teamCode when no sport affiliation exists', () => {
    const mapped = mapBackendProfileToCachedUserProfile({
      id: 'user-doc-only-fallback',
      email: 'coach-doc-only@nxt1.com',
      firstName: 'Doc',
      lastName: 'Only',
      role: 'coach',
      teamCode: {
        teamCode: 'team-doc-999',
        teamId: 'team-doc-999',
        slug: 'argyle',
        teamName: 'Argyle',
      },
    });

    const ctx = buildUserDisplayContext({
      displayName: mapped.displayName,
      email: mapped.email,
      role: mapped.role,
      sports: mapped.sports as
        | ReadonlyArray<{
            readonly sport: string;
            readonly positions?: string[];
            readonly isPrimary?: boolean;
            readonly order?: number;
            readonly team?: {
              readonly name?: string;
              readonly teamId?: string;
              readonly organizationId?: string;
              readonly slug?: string;
            };
          }>
        | undefined,
    });

    expect(ctx?.isOnTeam).toBe(false);
    expect(ctx?.profileRoute).toBe('/team');
  });

  it('blocks add profile actions for governed organization members who are not admins', () => {
    const ctx = buildUserDisplayContext({
      displayName: 'Alex Player',
      email: 'alex@nxt1.com',
      role: 'athlete',
      organizationAccess: [{ organizationId: 'org-1', isClaimed: true, isAdmin: false }],
    });

    expect(ctx?.canAddProfile).toBe(false);
  });

  it('allows add profile actions for organization admins', () => {
    const ctx = buildUserDisplayContext({
      displayName: 'Program Director',
      email: 'director@nxt1.com',
      role: 'coach',
      organizationAccess: [{ organizationId: 'org-1', isClaimed: true, isAdmin: true }],
      sports: [
        {
          sport: 'Football',
          order: 0,
          team: {
            name: 'Argyle',
            teamId: 'team-1',
            organizationId: 'org-1',
          },
        },
      ],
    });

    expect(ctx?.canAddProfile).toBe(true);
  });

  it('keeps Add Team as the primary action until a coach has a real team association', () => {
    const ctx = buildUserDisplayContext({
      displayName: 'Coach Without Team',
      email: 'coach-without-team@nxt1.com',
      role: 'coach',
      sports: [
        {
          sport: 'Football',
          order: 0,
        },
      ],
    });

    expect(ctx?.isOnTeam).toBe(false);
    expect(ctx?.sportProfiles).toEqual([]);
    expect(ctx?.actionLabel).toBe('Add Team');
    expect(ctx?.canAddProfile).toBe(true);
  });

  it('does not treat slug or unicode remnants as a real team association for team roles', () => {
    const ctx = buildUserDisplayContext({
      displayName: 'Bbb Bb',
      email: 'jkellerr8@gmail.com',
      role: 'director',
      sports: [
        {
          sport: 'Football',
          order: 0,
        },
      ],
    });

    expect(ctx?.isOnTeam).toBe(false);
    expect(ctx?.name).toBe('Bbb Bb');
    expect(ctx?.sportLabel).toBeUndefined();
    expect(ctx?.sportProfiles).toEqual([]);
    expect(ctx?.actionLabel).toBe('Add Team');
    expect(ctx?.profileRoute).toBe('/team');
  });
});
