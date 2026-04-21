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
      teamCode: {
        teamCode: 'ARG123',
        teamId: 'team-doc-1',
        slug: 'argyle',
        unicode: 'argyle',
        teamName: 'Argyle',
        sport: 'Football',
        logoUrl: 'https://cdn.example.com/argyle.png',
      },
    });

    const ctx = buildUserDisplayContext({
      displayName: mapped.displayName,
      email: mapped.email,
      role: mapped.role,
      teamCode: mapped.teamCode as
        | {
            readonly teamCode?: string;
            readonly slug?: string;
            readonly unicode?: string;
            readonly teamName?: string;
            readonly sport?: string;
            readonly logoUrl?: string | null;
          }
        | null
        | undefined,
    });

    expect(mapped.teamCode).toMatchObject({
      teamCode: 'ARG123',
      teamId: 'team-doc-1',
      slug: 'argyle',
      teamName: 'Argyle',
    });
    expect(ctx?.profileRoute).toBe('/team/argyle/ARG123');
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
      teamCode: mapped.teamCode as
        | {
            readonly teamCode?: string;
            readonly teamId?: string;
            readonly slug?: string;
            readonly unicode?: string;
            readonly teamName?: string;
            readonly sport?: string;
            readonly logoUrl?: string | null;
          }
        | null
        | undefined,
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
            };
          }>
        | undefined,
    });

    expect(mapped.teamCode).toMatchObject({
      teamCode: 'ARG123',
      teamId: 'team-doc-legacy',
      slug: 'argyle',
      teamName: 'Argyle',
    });
    expect(ctx?.profileRoute).toBe('/team/argyle/ARG123');
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

    expect(mapped.selectedSports).toEqual(['Football', 'Track & Field']);
    expect(mapped.primarySport).toBe('Football');
  });

  it('preserves connected emails for connected account sign-in state', () => {
    const mapped = mapBackendProfileToCachedUserProfile({
      id: 'user-connected-emails',
      email: 'athlete@nxt1.com',
      firstName: 'Alex',
      lastName: 'Player',
      role: 'athlete',
      connectedEmails: [
        { provider: 'gmail', isActive: true },
        { provider: 'microsoft', isActive: true },
      ],
    });

    expect(mapped.connectedEmails).toEqual([
      { provider: 'gmail', isActive: true },
      { provider: 'microsoft', isActive: true },
    ]);
  });

  it('prefers the real managed team code over a document id fallback', () => {
    const mapped = mapBackendProfileToCachedUserProfile({
      id: 'user-doc-fallback',
      email: 'coach-doc-fallback@nxt1.com',
      firstName: 'Fallback',
      lastName: 'Coach',
      role: 'coach',
      teamCode: {
        teamId: 'team-doc-999',
        teamName: 'Argyle',
      },
      coach: {
        managedTeamCodes: ['ARG123'],
      },
    });

    const ctx = buildUserDisplayContext({
      displayName: mapped.displayName,
      email: mapped.email,
      role: mapped.role,
      teamCode: mapped.teamCode as
        | {
            readonly teamCode?: string;
            readonly teamId?: string;
            readonly slug?: string;
            readonly unicode?: string;
            readonly teamName?: string;
            readonly sport?: string;
            readonly logoUrl?: string | null;
          }
        | null
        | undefined,
      managedTeamCodes: mapped.managedTeamCodes as readonly string[] | null | undefined,
    });

    expect(mapped.teamCode).toMatchObject({
      teamCode: 'ARG123',
      teamId: 'team-doc-999',
      slug: 'argyle',
      teamName: 'Argyle',
    });
    expect(ctx?.profileRoute).toBe('/team/argyle/ARG123');
  });

  it('does not let a document-style teamCode override the public team code', () => {
    const mapped = mapBackendProfileToCachedUserProfile({
      id: 'user-teamcode-doc-id',
      email: 'coach-doc-teamcode@nxt1.com',
      firstName: 'Flash',
      lastName: 'Coach',
      role: 'coach',
      teamCode: {
        teamCode: 'team-doc-999',
        teamId: 'team-doc-999',
        teamName: 'Argyle',
      },
      coach: {
        managedTeamCodes: ['ARG123'],
      },
    });

    const ctx = buildUserDisplayContext({
      displayName: mapped.displayName,
      email: mapped.email,
      role: mapped.role,
      teamCode: mapped.teamCode as
        | {
            readonly teamCode?: string;
            readonly teamId?: string;
            readonly slug?: string;
            readonly unicode?: string;
            readonly teamName?: string;
            readonly sport?: string;
            readonly logoUrl?: string | null;
          }
        | null
        | undefined,
      managedTeamCodes: mapped.managedTeamCodes as readonly string[] | null | undefined,
    });

    expect(mapped.teamCode).toMatchObject({
      teamCode: 'ARG123',
      teamId: 'team-doc-999',
      slug: 'argyle',
      teamName: 'Argyle',
    });
    expect(ctx?.profileRoute).toBe('/team/argyle/ARG123');
  });

  it('avoids using a document fallback route in the shell when no public team code exists yet', () => {
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
      teamCode: mapped.teamCode as
        | {
            readonly teamCode?: string;
            readonly teamId?: string;
            readonly slug?: string;
            readonly unicode?: string;
            readonly teamName?: string;
            readonly sport?: string;
            readonly logoUrl?: string | null;
          }
        | null
        | undefined,
      managedTeamCodes: mapped.managedTeamCodes as readonly string[] | null | undefined,
    });

    expect(ctx?.profileRoute).toBe('/team/argyle/team-doc-999');
  });

  it('derives a slug from team name for legacy managed teams while keeping the identifier', () => {
    const mapped = mapBackendProfileToCachedUserProfile({
      id: 'user-2',
      email: 'director@nxt1.com',
      firstName: 'Program',
      lastName: 'Director',
      role: 'coach',
      sports: [
        {
          sport: 'Football',
          order: 0,
          team: {
            name: 'Argyle',
            logoUrl: 'https://cdn.example.com/argyle.png',
          },
        },
      ],
      coach: {
        managedTeamCodes: ['ARG123'],
      },
    });

    const ctx = buildUserDisplayContext({
      displayName: mapped.displayName,
      email: mapped.email,
      role: mapped.role,
      teamCode: mapped.teamCode as
        | {
            readonly teamCode?: string;
            readonly slug?: string;
            readonly unicode?: string;
            readonly teamName?: string;
            readonly sport?: string;
            readonly logoUrl?: string | null;
          }
        | null
        | undefined,
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
            };
          }>
        | undefined,
    });

    expect(mapped.teamCode).toMatchObject({
      teamCode: 'ARG123',
      slug: 'argyle',
      teamName: 'Argyle',
    });
    expect(ctx?.profileRoute).toBe('/team/argyle/ARG123');
  });
});
