/**
 * @fileoverview User Model Tests
 * @module @nxt1/core/models
 *
 * Comprehensive tests for user model type guards and helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  isAthlete,
  isCoach,
  isCollegeCoach,
  isOnboarded,
  isMultiSport,
  isCommitted,
  getPrimarySport,
  getActiveSport,
  getSportByName,
  playsSport,
  getTotalOffers,
  getAllAwards,
  addSport,
  updateSport,
  removeSport,
  setPrimarySport,
  setActiveSport,
  toUserSummary,
  createDefaultPreferences,
  createDefaultCounters,
  createEmptySportProfile,
  type User,
  type SportProfile,
  type AthleteData,
  type CoachData,
  type CollegeCoachData,
} from './user.model';

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
    isPremium: false,
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

function createMockAthleteData(overrides: Partial<AthleteData> = {}): AthleteData {
  return {
    graduationYear: 2025,
    gpa: 3.5,
    ...overrides,
  } as AthleteData;
}

// ============================================
// TYPE GUARD TESTS
// ============================================

describe('User Model Type Guards', () => {
  describe('isAthlete', () => {
    it('should return true for athlete role with athlete data', () => {
      const user = createMockUser({
        role: 'athlete',
        athlete: createMockAthleteData(),
      });
      expect(isAthlete(user)).toBe(true);
    });

    it('should return false for athlete role without athlete data', () => {
      const user = createMockUser({ role: 'athlete' });
      expect(isAthlete(user)).toBe(false);
    });

    it('should return false for non-athlete role', () => {
      const user = createMockUser({
        role: 'coach',
        coach: {} as CoachData,
      });
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

  describe('isCollegeCoach', () => {
    it('should return true for college-coach role with college coach data', () => {
      const user = createMockUser({
        role: 'college-coach',
        collegeCoach: {
          title: 'Assistant Coach',
          institution: 'State University',
        } as CollegeCoachData,
      });
      expect(isCollegeCoach(user)).toBe(true);
    });

    it('should return false for college-coach role without data', () => {
      const user = createMockUser({ role: 'college-coach' });
      expect(isCollegeCoach(user)).toBe(false);
    });
  });

  describe('isOnboarded', () => {
    it('should return true when onboardingCompleted is true', () => {
      const user = createMockUser({ onboardingCompleted: true });
      expect(isOnboarded(user)).toBe(true);
    });

    it('should return true when completeSignUp is true (legacy)', () => {
      const user = createMockUser({ completeSignUp: true });
      expect(isOnboarded(user)).toBe(true);
    });

    it('should return false when neither flag is set', () => {
      const user = createMockUser();
      expect(isOnboarded(user)).toBe(false);
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
      const user = createMockUser({
        sports: [createMockSportProfile()],
      });
      expect(isMultiSport(user)).toBe(false);
    });

    it('should return true with legacy primary and secondary sport', () => {
      const user = createMockUser({
        primarySport: 'Football',
        secondarySport: 'Basketball',
      });
      expect(isMultiSport(user)).toBe(true);
    });

    it('should return false with only primary sport', () => {
      const user = createMockUser({
        primarySport: 'Football',
      });
      expect(isMultiSport(user)).toBe(false);
    });
  });

  describe('isCommitted', () => {
    it('should return true when sport has commitment', () => {
      const user = createMockUser({
        sports: [
          createMockSportProfile({
            recruiting: {
              offers: [],
              interactions: [],
              commitment: {
                collegeId: 'college-1',
                collegeName: 'State U',
                committedAt: '2024-06-01',
                sport: 'Football',
                status: 'verbal',
              },
            },
          }),
        ],
      });
      expect(isCommitted(user)).toBe(true);
    });

    it('should return true when legacy isCommitted is true', () => {
      const user = createMockUser({ isCommitted: true });
      expect(isCommitted(user)).toBe(true);
    });

    it('should return false when not committed', () => {
      const user = createMockUser({
        sports: [createMockSportProfile()],
      });
      expect(isCommitted(user)).toBe(false);
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
      const user = createMockUser({
        sports: [sport1, sport2],
        activeSportIndex: 1,
      });

      expect(getActiveSport(user)).toEqual(sport2);
    });

    it('should default to first sport when no index set', () => {
      const sport1 = createMockSportProfile({ sport: 'Football', order: 0 });
      const user = createMockUser({ sports: [sport1] });

      expect(getActiveSport(user)).toEqual(sport1);
    });

    it('should fall back to first sport for invalid index', () => {
      const sport1 = createMockSportProfile({ sport: 'Football', order: 0 });
      const user = createMockUser({
        sports: [sport1],
        activeSportIndex: 5,
      });

      expect(getActiveSport(user)).toEqual(sport1);
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

    it('should return true for legacy primarySport', () => {
      const user = createMockUser({ primarySport: 'Football' });

      expect(playsSport(user, 'Football')).toBe(true);
    });

    it('should return true for legacy secondarySport', () => {
      const user = createMockUser({ secondarySport: 'Basketball' });

      expect(playsSport(user, 'Basketball')).toBe(true);
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
              offers: [
                { collegeId: 'c1', collegeName: 'U1', sport: 'Football' },
                { collegeId: 'c2', collegeName: 'U2', sport: 'Football' },
              ],
              interactions: [],
            },
          }),
          createMockSportProfile({
            sport: 'Basketball',
            recruiting: {
              offers: [{ collegeId: 'c3', collegeName: 'U3', sport: 'Basketball' }],
              interactions: [],
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
      const user = createMockUser({
        sports: [createMockSportProfile()],
      });
      expect(getTotalOffers(user)).toBe(0);
    });
  });

  describe('getAllAwards', () => {
    it('should collect awards from all sports', () => {
      const user = createMockUser({
        sports: [
          createMockSportProfile({
            sport: 'Football',
            awards: ['MVP', 'All-State'],
          }),
          createMockSportProfile({
            sport: 'Basketball',
            awards: ['Best Player'],
          }),
        ],
      });

      const awards = getAllAwards(user);
      expect(awards).toContain('MVP');
      expect(awards).toContain('All-State');
      expect(awards).toContain('Best Player');
    });

    it('should include legacy awards', () => {
      const user = createMockUser({
        awards: [{ award: 'Legacy Award' }],
      });

      expect(getAllAwards(user)).toContain('Legacy Award');
    });

    it('should deduplicate awards', () => {
      const user = createMockUser({
        sports: [createMockSportProfile({ awards: ['MVP'] })],
        awards: [{ award: 'MVP' }],
      });

      const awards = getAllAwards(user);
      expect(awards.filter((a) => a === 'MVP').length).toBe(1);
    });
  });
});

// ============================================
// SPORT MANAGEMENT TESTS
// ============================================

describe('Sport Management Functions', () => {
  describe('addSport', () => {
    it('should add new sport to user', () => {
      const user = createMockUser({ sports: [] });
      const newSport = createMockSportProfile({ sport: 'Football' });

      const updated = addSport(user, newSport);

      expect(updated.sports).toHaveLength(1);
      expect(updated.sports![0].sport).toBe('Football');
    });

    it('should not add duplicate sport', () => {
      const existing = createMockSportProfile({ sport: 'Football' });
      const user = createMockUser({ sports: [existing] });

      const updated = addSport(user, createMockSportProfile({ sport: 'Football' }));

      expect(updated.sports).toHaveLength(1);
    });

    it('should set correct order for new sport', () => {
      const existing = createMockSportProfile({ sport: 'Football', order: 0 });
      const user = createMockUser({ sports: [existing] });

      const updated = addSport(user, createMockSportProfile({ sport: 'Basketball' }));

      expect(updated.sports![1].order).toBe(1);
    });

    it('should initialize sports array if undefined', () => {
      const user = createMockUser();
      const newSport = createMockSportProfile({ sport: 'Football' });

      const updated = addSport(user, newSport);

      expect(updated.sports).toBeDefined();
      expect(updated.sports).toHaveLength(1);
    });
  });

  describe('updateSport', () => {
    it('should update existing sport', () => {
      const sport = createMockSportProfile({ sport: 'Football', aboutMe: 'Original bio' });
      const user = createMockUser({ sports: [sport] });

      const updated = updateSport(user, 'Football', { aboutMe: 'Updated bio' });

      expect(updated.sports![0].aboutMe).toBe('Updated bio');
    });

    it('should not modify other sports', () => {
      const football = createMockSportProfile({ sport: 'Football', aboutMe: 'Football bio' });
      const basketball = createMockSportProfile({ sport: 'Basketball', aboutMe: 'Basketball bio' });
      const user = createMockUser({ sports: [football, basketball] });

      const updated = updateSport(user, 'Football', { aboutMe: 'Updated bio' });

      expect(updated.sports![1].aboutMe).toBe('Basketball bio');
    });

    it('should update the updatedAt timestamp', () => {
      const sport = createMockSportProfile({
        sport: 'Football',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      const user = createMockUser({ sports: [sport] });

      const updated = updateSport(user, 'Football', { aboutMe: 'New bio' });

      expect(updated.sports![0].updatedAt).not.toBe('2024-01-01T00:00:00.000Z');
    });

    it('should return unchanged user if sport not found', () => {
      const user = createMockUser({ sports: [createMockSportProfile()] });

      const updated = updateSport(user, 'Basketball', { aboutMe: 'New bio' });

      expect(updated.sports).toEqual(user.sports);
    });
  });

  describe('removeSport', () => {
    it('should remove sport by name', () => {
      const football = createMockSportProfile({ sport: 'Football', order: 0 });
      const basketball = createMockSportProfile({ sport: 'Basketball', order: 1 });
      const user = createMockUser({ sports: [football, basketball] });

      const updated = removeSport(user, 'Football');

      expect(updated.sports).toHaveLength(1);
      expect(updated.sports![0].sport).toBe('Basketball');
    });

    it('should reorder remaining sports', () => {
      const football = createMockSportProfile({ sport: 'Football', order: 0 });
      const basketball = createMockSportProfile({ sport: 'Basketball', order: 1 });
      const baseball = createMockSportProfile({ sport: 'Baseball', order: 2 });
      const user = createMockUser({ sports: [football, basketball, baseball] });

      const updated = removeSport(user, 'Basketball');

      expect(updated.sports![0].order).toBe(0);
      expect(updated.sports![1].order).toBe(1);
    });

    it('should return unchanged user if sport not found', () => {
      const user = createMockUser({ sports: [createMockSportProfile()] });

      const updated = removeSport(user, 'Basketball');

      expect(updated.sports).toEqual(user.sports);
    });
  });

  describe('setPrimarySport', () => {
    it('should set sport as primary (order 0)', () => {
      const football = createMockSportProfile({ sport: 'Football', order: 0 });
      const basketball = createMockSportProfile({ sport: 'Basketball', order: 1 });
      const user = createMockUser({ sports: [football, basketball] });

      const updated = setPrimarySport(user, 'Basketball');

      expect(updated.sports!.find((s) => s.sport === 'Basketball')!.order).toBe(0);
      expect(updated.sports!.find((s) => s.sport === 'Football')!.order).toBe(1);
    });
  });

  describe('setActiveSport', () => {
    it('should set activeSportIndex', () => {
      const football = createMockSportProfile({ sport: 'Football', order: 0 });
      const basketball = createMockSportProfile({ sport: 'Basketball', order: 1 });
      const user = createMockUser({ sports: [football, basketball] });

      // setActiveSport takes an index, not a sport name
      const updated = setActiveSport(user, 1);

      expect(updated.activeSportIndex).toBe(1);
    });

    it('should return unchanged user for invalid index', () => {
      const user = createMockUser({ sports: [createMockSportProfile()], activeSportIndex: 0 });

      // Negative index is invalid
      const updated = setActiveSport(user, -1);

      expect(updated.activeSportIndex).toBe(0);
    });

    it('should return unchanged user for out-of-bounds index', () => {
      const user = createMockUser({ sports: [createMockSportProfile()], activeSportIndex: 0 });

      // Index 5 is out of bounds for 1 sport
      const updated = setActiveSport(user, 5);

      expect(updated.activeSportIndex).toBe(0);
    });
  });
});

// ============================================
// FACTORY FUNCTION TESTS
// ============================================

describe('Factory Functions', () => {
  describe('toUserSummary', () => {
    it('should create user summary with required fields', () => {
      const user = createMockUser({
        id: 'uid-123',
        firstName: 'John',
        lastName: 'Doe',
        profileImg: 'https://example.com/photo.jpg',
        role: 'athlete',
        city: 'Los Angeles',
        state: 'CA',
      });

      const summary = toUserSummary(user);

      expect(summary.id).toBe('uid-123');
      expect(summary.firstName).toBe('John');
      expect(summary.lastName).toBe('Doe');
      expect(summary.profileImg).toBe('https://example.com/photo.jpg');
      expect(summary.role).toBe('athlete');
    });

    it('should include location from user', () => {
      const user = createMockUser({
        city: 'Los Angeles',
        state: 'CA',
      });

      const summary = toUserSummary(user);

      expect(summary.location.city).toBe('Los Angeles');
      expect(summary.location.state).toBe('CA');
    });

    it('should include primary sport info', () => {
      const user = createMockUser({
        sports: [
          createMockSportProfile({
            sport: 'Football',
            positions: ['Quarterback'],
          }),
        ],
        athlete: { classOf: 2025 },
      });

      const summary = toUserSummary(user);

      expect(summary.primarySport).toBe('Football');
      expect(summary.primaryPosition).toBe('Quarterback');
      expect(summary.classOf).toBe(2025);
    });
  });

  describe('createDefaultPreferences', () => {
    it('should create default notification preferences', () => {
      const prefs = createDefaultPreferences();

      expect(prefs.notifications).toBeDefined();
      expect(typeof prefs.notifications.push).toBe('boolean');
      expect(typeof prefs.notifications.email).toBe('boolean');
    });
  });

  describe('createDefaultCounters', () => {
    it('should create counters initialized to 0', () => {
      const counters = createDefaultCounters();

      // Actual property names from the implementation
      expect(counters.profileViews).toBe(0);
      expect(counters.videoViews).toBe(0);
      expect(counters.followersCount).toBe(0);
      expect(counters.followingCount).toBe(0);
      expect(counters.postsCount).toBe(0);
      expect(counters.sharesCount).toBe(0);
    });
  });

  describe('createEmptySportProfile', () => {
    it('should create sport profile with sport name', () => {
      const profile = createEmptySportProfile('Football');

      expect(profile.sport).toBe('Football');
      expect(profile.order).toBe(0);
      // createEmptySportProfile creates minimal profile without timestamps
      expect(profile.positions).toEqual([]);
      expect(profile.metrics).toEqual({});
      expect(profile.seasonStats).toEqual([]);
      expect(profile.team).toBeDefined();
      expect(profile.accountType).toBe('athlete');
    });

    it('should accept custom order', () => {
      const profile = createEmptySportProfile('Basketball', 2);

      expect(profile.order).toBe(2);
    });

    it('should include default team structure', () => {
      const profile = createEmptySportProfile('Football');

      expect(profile.team!.name).toBe('');
      expect(profile.team!.type).toBe('high-school');
    });
  });
});
