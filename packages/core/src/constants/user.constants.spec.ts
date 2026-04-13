/**
 * @fileoverview User Constants Tests
 * @module @nxt1/core/constants
 *
 * Tests for normalizeRole() and role constant integrity.
 */

import { describe, it, expect } from 'vitest';
import {
  USER_ROLES,
  ROLE_CONFIGS,
  normalizeRole,
  isTeamRole,
  isAthleteRole,
  type UserRole,
} from './user.constants';

// ============================================
// USER_ROLES INTEGRITY
// ============================================

describe('USER_ROLES', () => {
  it('should have exactly 3 core roles', () => {
    const coreRoles: UserRole[] = ['athlete', 'coach', 'director'];
    coreRoles.forEach((role) => {
      expect(Object.values(USER_ROLES)).toContain(role);
    });
  });

  it('should have deprecated aliases pointing to correct values', () => {
    expect(USER_ROLES.COLLEGE_COACH).toBe('coach');
    expect(USER_ROLES.SCOUT).toBe('coach');
    expect(USER_ROLES.RECRUITING_SERVICE).toBe('coach');
    expect(USER_ROLES.MEDIA).toBe('coach');
    expect(USER_ROLES.FAN).toBe('athlete');
    expect(USER_ROLES.RECRUITER).toBe('coach');
    expect(USER_ROLES.PARENT).toBe('athlete');
  });
});

// ============================================
// ROLE_CONFIGS INTEGRITY
// ============================================

describe('ROLE_CONFIGS', () => {
  it('should have exactly 3 entries matching core roles', () => {
    expect(ROLE_CONFIGS).toHaveLength(3);

    const configIds = ROLE_CONFIGS.map((c) => c.id);
    expect(configIds).toContain('athlete');
    expect(configIds).toContain('coach');
    expect(configIds).toContain('director');
  });

  it('should have required fields on every config', () => {
    ROLE_CONFIGS.forEach((config) => {
      expect(config.id).toBeTruthy();
      expect(config.label).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.icon).toBeTruthy();
    });
  });

  it('should mark coach and director as canManageAthletes', () => {
    const coach = ROLE_CONFIGS.find((c) => c.id === 'coach');
    expect(coach?.canManageAthletes).toBe(true);
    const director = ROLE_CONFIGS.find((c) => c.id === 'director');
    expect(director?.canManageAthletes).toBe(true);
  });
});

// ============================================
// normalizeRole()
// ============================================

describe('normalizeRole', () => {
  it('should return core roles unchanged', () => {
    expect(normalizeRole('athlete')).toBe('athlete');
    expect(normalizeRole('coach')).toBe('coach');
    expect(normalizeRole('director')).toBe('director');
  });

  it('should map legacy recruiter and parent to core roles', () => {
    expect(normalizeRole('recruiter')).toBe('coach');
    expect(normalizeRole('parent')).toBe('athlete');
  });

  it('should map college-coach to coach', () => {
    expect(normalizeRole('college-coach')).toBe('coach');
  });

  it('should map scout to coach', () => {
    expect(normalizeRole('scout')).toBe('coach');
  });

  it('should map recruiting-service to coach', () => {
    expect(normalizeRole('recruiting-service')).toBe('coach');
  });

  it('should map media to coach', () => {
    expect(normalizeRole('media')).toBe('coach');
  });

  it('should map service to coach', () => {
    expect(normalizeRole('service')).toBe('coach');
  });

  it('should map fan to athlete', () => {
    expect(normalizeRole('fan')).toBe('athlete');
  });

  it('should default unknown roles to athlete', () => {
    expect(normalizeRole('unknown')).toBe('athlete');
    expect(normalizeRole('')).toBe('athlete');
    expect(normalizeRole('admin')).toBe('athlete');
  });
});

describe('role helpers', () => {
  it('should treat normalized coach aliases as team roles', () => {
    expect(isTeamRole('coach')).toBe(true);
    expect(isTeamRole('director')).toBe(true);
    expect(isTeamRole('college-coach')).toBe(true);
    expect(isTeamRole('scout')).toBe(true);
  });

  it('should treat normalized athlete aliases as athlete roles', () => {
    expect(isAthleteRole('athlete')).toBe(true);
    expect(isAthleteRole('parent')).toBe(true);
    expect(isAthleteRole('fan')).toBe(true);
  });

  it('should return false for nullish role helper checks', () => {
    expect(isTeamRole(undefined)).toBe(false);
    expect(isTeamRole(null)).toBe(false);
    expect(isAthleteRole(undefined)).toBe(false);
    expect(isAthleteRole(null)).toBe(false);
  });
});
