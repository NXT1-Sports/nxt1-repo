/**
 * @fileoverview User Model Tests
 * @module @nxt1/core/models
 *
 * Tests for user model type guards and helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  isAthlete,
  isCoach,
  isCollegeCoach,
  isRecruiter,
  isDirector,
  isOnboarded,
  getPrimarySport,
  getActiveSport,
  getSportByName,
  playsSport,
  getTotalOffers,
  getAllAwards,
  isMultiSport,
  isCommitted,
  type User,
  type SportProfile,
  type AthleteData,
  type CoachData,
  type RecruiterData,
} from '.';

// ============================================
// TEST FIXTURES
// ============================================

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    uid: 'test-uid-123',
    email: 'test@example.com',
    role: 'athlete',
    displayName: 'John Doe',
    onboardingCompleted: false,
    completeSignUp: false,
    isCommitted: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  } as User;
}

function createMockSportProfile(overrides: Partial<SportProfile> = {}): SportProfile {
  return {
    sport: 'Football',
    order: 0,
    jerseyNumber: '12',
    positions: ['Quarterback'],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  } as SportProfile;
}

// ============================================
// TYPE GUARD TESTS
// ============================================

describe('User Model Type Guards', () => {
  describe('isAthlete', () => {
    it('should return true for athlete role with athlete data', () => {
      const user = createMockUser({
        role: 'athlete',
        athlete: { classOf: 2025, academics: { gpa: 3.5 } } as unknown as AthleteData,
      });
      expect(isAthlete(user)).toBe(true);
    });

    it('should return false for athlete role without athlete data', () => {
      const user = createMockUser({ role: 'athlete' });
      expect(isAthlete(user)).toBe(false);
    });

    it('should return false for non-athlete role', () => {
      const user = createMockUser({ role: 'coach', coach: {} as CoachData });
      expect(isAthlete(user)).toBe(false);
    });
  });

  describe('isCoach', () => {
    it('should return true for coach role with coach data', () => {
      const user = createMockUser({
        role: 'coach',
        coach: { title: 'Head Coach' } as CoachData,
      });
      expect(isCoach(user)).toBe(true);
    });

    it('should return false for coach role without coach data', () => {
      const user = createMockUser({ role: 'coach' });
      expect(isCoach(user)).toBe(false);
    });

    it('should return false for non-coach role', () => {
      const user = createMockUser({ role: 'athlete' });
      expect(isCoach(user)).toBe(false);
    });
  });

  describe('isCollegeCoach (deprecated — wraps isRecruiter)', () => {
    it('should return true for coach role with recruiter data (legacy)', () => {
      const user = createMockUser({
        role: 'coach',
        recruiter: {
          recruiterType: 'college_coach',
          title: 'Assistant Coach',
          institution: 'State U',
        } as RecruiterData,
      });
      expect(isCollegeCoach(user)).toBe(true);
    });

    it('should return false for coach role without recruiter data', () => {
      const user = createMockUser({ role: 'coach' });
      expect(isCollegeCoach(user)).toBe(false);
    });
  });

  describe('isRecruiter', () => {
    it('should return true for coach role with recruiter data (legacy)', () => {
      const user = createMockUser({
        role: 'coach',
        recruiter: { recruiterType: 'college_coach', institution: 'State U' } as RecruiterData,
      });
      expect(isRecruiter(user)).toBe(true);
    });

    it('should return false for coach role without recruiter data', () => {
      const user = createMockUser({ role: 'coach' });
      expect(isRecruiter(user)).toBe(false);
    });

    it('should return false for non-coach role', () => {
      const user = createMockUser({ role: 'athlete' });
      expect(isRecruiter(user)).toBe(false);
    });
  });

  describe('isDirector', () => {
    it('should return true for director role with director data', () => {
      const user = createMockUser({
        role: 'director',
        director: { title: 'Athletic Director', organization: 'State High School' },
      });
      expect(isDirector(user)).toBe(true);
    });

    it('should return false for director role without data', () => {
      const user = createMockUser({ role: 'director' });
      expect(isDirector(user)).toBe(false);
    });

    it('should return false for non-director role', () => {
      const user = createMockUser({ role: 'coach' });
      expect(isDirector(user)).toBe(false);
    });
  });

  describe('isOnboarded', () => {
    it('should return true when onboardingCompleted is true', () => {
      const user = createMockUser({ onboardingCompleted: true });
      expect(isOnboarded(user)).toBe(true);
    });

    it('should return false when flag is not set', () => {
      const user = createMockUser();
      expect(isOnboarded(user)).toBe(false);
    });
  });
});

// ============================================
// HELPER FUNCTION TESTS
// ============================================

describe('User Model Helper Functions', () => {
  describe('getPrimarySport', () => {
    it('should return sport with order 0', () => {
      const primary = createMockSportProfile({ sport: 'Football', order: 0 });
      const secondary = createMockSportProfile({ sport: 'Basketball', order: 1 });
      const user = createMockUser({ sports: [secondary, primary] });

      expect(getPrimarySport(user)).toEqual(primary);
    });

    it('should return first sport if no order 0', () => {
      const sport1 = createMockSportProfile({ sport: 'Football', order: 1 });
      const sport2 = createMockSportProfile({ sport: 'Basketball', order: 2 });
      const user = createMockUser({ sports: [sport1, sport2] });

      expect(getPrimarySport(user)).toEqual(sport1);
    });

    it('should return undefined when no sports', () => {
      const user = createMockUser({ sports: [] });
      expect(getPrimarySport(user)).toBeUndefined();
    });

    it('should return undefined when sports is undefined', () => {
      const user = createMockUser();
      expect(getPrimarySport(user)).toBeUndefined();
    });
  });

  describe('getActiveSport', () => {
    it('should return sport at activeSportIndex', () => {
      const sport1 = createMockSportProfile({ sport: 'Football', order: 0 });
      const sport2 = createMockSportProfile({ sport: 'Basketball', order: 1 });
      const user = createMockUser({ sports: [sport1, sport2], activeSportIndex: 1 });

      expect(getActiveSport(user)).toEqual(sport2);
    });

    it('should default to first sport when no index set', () => {
      const sport1 = createMockSportProfile({ sport: 'Football', order: 0 });
      const user = createMockUser({ sports: [sport1] });

      expect(getActiveSport(user)).toEqual(sport1);
    });

    it('should fall back to first sport for out-of-bounds index', () => {
      const sport1 = createMockSportProfile({ sport: 'Football', order: 0 });
      const user = createMockUser({ sports: [sport1], activeSportIndex: 5 });

      expect(getActiveSport(user)).toEqual(sport1);
    });

    it('should return undefined when no sports', () => {
      const user = createMockUser({ sports: [] });
      expect(getActiveSport(user)).toBeUndefined();
    });
  });

  describe('getSportByName', () => {
    it('should find sport by exact name', () => {
      const football = createMockSportProfile({ sport: 'Football' });
      const user = createMockUser({ sports: [football] });

      expect(getSportByName(user, 'Football')).toEqual(football);
    });

    it('should be case-insensitive', () => {
      const football = createMockSportProfile({ sport: 'Football' });
      const user = createMockUser({ sports: [football] });

      expect(getSportByName(user, 'football')).toEqual(football);
      expect(getSportByName(user, 'FOOTBALL')).toEqual(football);
    });

    it('should return undefined for non-existent sport', () => {
      const user = createMockUser({ sports: [createMockSportProfile()] });
      expect(getSportByName(user, 'Basketball')).toBeUndefined();
    });
  });

  describe('playsSport', () => {
    it('should return true for sport in sports array', () => {
      const user = createMockUser({
        sports: [createMockSportProfile({ sport: 'Football' })],
      });
      expect(playsSport(user, 'Football')).toBe(true);
      expect(playsSport(user, 'football')).toBe(true);
    });

    it('should return false for sport not played', () => {
      const user = createMockUser({
        sports: [createMockSportProfile({ sport: 'Football' })],
      });
      expect(playsSport(user, 'Basketball')).toBe(false);
    });
  });

  describe('getTotalOffers', () => {
    it('should sum offers across all sports', () => {
      const user = createMockUser({
        sports: [
          createMockSportProfile({
            sport: 'Football',
            recruiting: {
              offerCount: 2,
            },
          }),
          createMockSportProfile({
            sport: 'Basketball',
            recruiting: {
              offerCount: 1,
            },
          }),
        ],
      });
      expect(getTotalOffers(user)).toBe(3);
    });

    it('should return 0 for no sports', () => {
      const user = createMockUser();
      expect(getTotalOffers(user)).toBe(0);
    });

    it('should return 0 for sports without offers', () => {
      const user = createMockUser({ sports: [createMockSportProfile()] });
      expect(getTotalOffers(user)).toBe(0);
    });
  });

  describe('getAllAwards', () => {
    it('should collect awards from user top-level', () => {
      const user = createMockUser({
        awards: [
          { title: 'MVP', category: 'athletic', sport: 'Football' },
          { title: 'All-State', category: 'athletic', sport: 'Football' },
          { title: 'Best Player', category: 'athletic', sport: 'Basketball' },
        ],
      });
      const awards = getAllAwards(user);
      expect(awards.length).toBe(3);
      expect(awards[0].title).toBe('MVP');
      expect(awards[1].title).toBe('All-State');
      expect(awards[2].title).toBe('Best Player');
    });

    it('should return empty array when no awards', () => {
      const user = createMockUser();
      const awards = getAllAwards(user);
      expect(awards.length).toBe(0);
    });
  });

  describe('isMultiSport', () => {
    it('should return true when user has multiple sports', () => {
      const user = createMockUser({
        sports: [
          createMockSportProfile({ sport: 'Football', order: 0 }),
          createMockSportProfile({ sport: 'Basketball', order: 1 }),
        ],
      });
      expect(isMultiSport(user)).toBe(true);
    });

    it('should return false when user has one sport', () => {
      const user = createMockUser({ sports: [createMockSportProfile()] });
      expect(isMultiSport(user)).toBe(false);
    });
  });

  describe('isCommitted', () => {
    it('should return true when sport has commitment', () => {
      const user = createMockUser({
        sports: [
          createMockSportProfile({
            recruiting: {
              isCommitted: true,
              committedTo: 'State U',
              committedAt: '2024-06-01',
              commitmentStatus: 'verbal',
            },
          }),
        ],
      });
      expect(isCommitted(user)).toBe(true);
    });

    it('should return false when not committed', () => {
      const user = createMockUser({ sports: [createMockSportProfile()] });
      expect(isCommitted(user)).toBe(false);
    });
  });
});
