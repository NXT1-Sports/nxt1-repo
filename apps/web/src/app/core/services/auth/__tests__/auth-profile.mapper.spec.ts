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

  it('inherits organization logo on top-nav and switcher when a coach creates a new team under the organization', () => {
    // Coach already had Football with the organization logo.
    // They just added Basketball (index 1 is active), which doesn't have its own logoUrl yet.
    const orgLogo = 'https://firebasestorage.googleapis.com/v0/b/test/o/Organizations%2Forg-1%2Flogo?alt=media&token=tok';
    const ctx = buildUserDisplayContext({
      displayName: 'Coach Smith',
      email: 'coach@example.com',
      role: 'coach',
      activeSportIndex: 1, // active sport is the new team (Basketball)
      sports: [
        {
          sport: 'Football',
          order: 0,
          team: {
            name: 'Westlake Football',
            teamId: 'team-fb',
            organizationId: 'org-1',
            logoUrl: orgLogo,
          },
        },
        {
          sport: 'Basketball',
          order: 1,
          team: {
            name: 'Westlake Basketball',
            teamId: 'team-bb',
            organizationId: 'org-1',
            // No direct logoUrl on the newly added team!
          },
        },
      ],
    });

    expect(ctx?.isTeamRole).toBe(true);
    expect(ctx?.isOnTeam).toBe(true);
    // Top-bar logo should NOT disappear: it should inherit from the organization/sibling team
    expect(ctx?.profileImg).toContain('Organizations%2Forg-1%2Flogo');
    // Switcher profiles should all have the logo populated
    expect(ctx?.sportProfiles.length).toBe(2);
    expect(ctx?.sportProfiles[0]?.profileImg).toContain('Organizations%2Forg-1%2Flogo');
    expect(ctx?.sportProfiles[1]?.profileImg).toContain('Organizations%2Forg-1%2Flogo');
  });

  it('maps organization logo to new sport entries in mapBackendProfileToCachedUserProfile', () => {
    const orgLogo = 'https://cdn.example.com/org-logo.png';
    const mapped = mapBackendProfileToCachedUserProfile({
      id: 'coach-1',
      email: 'coach@example.com',
      firstName: 'John',
      lastName: 'Coach',
      role: 'coach',
      sports: [
        {
          sport: 'Football',
          order: 0,
          team: {
            name: 'Tigers Football',
            teamId: 'team-1',
            organizationId: 'org-tigers',
            logoUrl: orgLogo,
          },
        },
        {
          sport: 'Track',
          order: 1,
          team: {
            name: 'Tigers Track',
            teamId: 'team-2',
            organizationId: 'org-tigers',
            // Missing direct logoUrl
          },
        },
      ],
    });

    // The second team under the same organization should inherit the logo
    expect(mapped.sports?.[1]?.team?.logoUrl).toBe(orgLogo);
  });
});
