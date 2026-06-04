import { describe, expect, it } from 'vitest';
import { USER_ROLES, type User } from '@nxt1/core';

import { userToProfilePageData } from './profile-mappers';

function createUser(sports: unknown, activeSportIndex = 0): User {
  return {
    id: 'user-1',
    email: 'athlete@nxt1sports.com',
    firstName: 'Bryson',
    lastName: 'Ealem',
    role: USER_ROLES.ATHLETE,
    sports: sports as User['sports'],
    activeSportIndex,
  } as User;
}

describe('userToProfilePageData', () => {
  it('normalizes numeric jersey numbers to strings', () => {
    const result = userToProfilePageData(
      createUser([
        {
          sport: 'Football',
          positions: ['Quarterback'],
          jerseyNumber: 12,
        },
      ]),
      false
    );

    expect(result.user.primarySport?.jerseyNumber).toBe('12');
  });

  it('drops malformed jersey numbers instead of leaking objects into the UI model', () => {
    const result = userToProfilePageData(
      createUser([
        {
          sport: 'Football',
          positions: ['Quarterback'],
          jerseyNumber: { value: 12 },
        },
      ]),
      false
    );

    expect(result.user.primarySport?.jerseyNumber).toBeUndefined();
  });

  it('deduplicates repeated sport entries while preserving the active selection data', () => {
    const result = userToProfilePageData(
      createUser(
        [
          {
            sport: 'Football',
            positions: ['Running Back'],
            jerseyNumber: '2',
          },
          {
            sport: 'Football',
            positions: ['Quarterback'],
            jerseyNumber: '7',
          },
          {
            sport: 'Track',
            positions: ['Sprinter'],
          },
        ],
        1
      ),
      false
    );

    expect(result.user.primarySport?.name).toBe('Football');
    expect(result.user.primarySport?.position).toBe('QB');
    expect(result.user.primarySport?.jerseyNumber).toBe('7');
    expect(result.user.additionalSports?.map((sport) => sport.name)).toEqual(['Track']);
  });
});
