/**
 * @fileoverview User Constants Tests
 * @module @nxt1/core/constants
 *
 * Tests for normalizeRole() and role constant integrity.
 */

import { describe, it, expect } from 'vitest';
import { USER_ROLES, ROLE_CONFIGS, normalizeRole, type UserRole } from './user.constants';

// ============================================
// USER_ROLES INTEGRITY
// ============================================

describe('USER_ROLES', () => {
  it('should have exactly 5 core roles', () => {
    const coreRoles: UserRole[] = ['athlete', 'coach', 'director', 'recruiter', 'parent'];
    coreRoles.forEach((role) => {
      expect(Object.values(USER_ROLES)).toContain(role);
    });
  });

  it('should have deprecated aliases pointing to correct values', () => {
    expect(USER_ROLES.COLLEGE_COACH).toBe('recruiter');
    expect(USER_ROLES.SCOUT).toBe('recruiter');
    expect(USER_ROLES.RECRUITING_SERVICE).toBe('recruiter');
    expect(USER_ROLES.MEDIA).toBe('recruiter');
    expect(USER_ROLES.FAN).toBe('athlete');
  });
});

// ============================================
// ROLE_CONFIGS INTEGRITY
// ============================================

describe('ROLE_CONFIGS', () => {
  it('should have exactly 5 entries matching core roles', () => {
    expect(ROLE_CONFIGS).toHaveLength(5);

    const configIds = ROLE_CONFIGS.map((c) => c.id);
    expect(configIds).toContain('athlete');
    expect(configIds).toContain('coach');
    expect(configIds).toContain('director');
    expect(configIds).toContain('recruiter');
    expect(configIds).toContain('parent');
  });

  it('should have required fields on every config', () => {
    ROLE_CONFIGS.forEach((config) => {
      expect(config.id).toBeTruthy();
      expect(config.label).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.icon).toBeTruthy();
    });
  });

  it('should mark recruiter as canRecruit', () => {
    const recruiter = ROLE_CONFIGS.find((c) => c.id === 'recruiter');
    expect(recruiter?.canRecruit).toBe(true);
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
    expect(normalizeRole('recruiter')).toBe('recruiter');
    expect(normalizeRole('parent')).toBe('parent');
  });

  it('should map college-coach to recruiter', () => {
    expect(normalizeRole('college-coach')).toBe('recruiter');
  });

  it('should map scout to recruiter', () => {
    expect(normalizeRole('scout')).toBe('recruiter');
  });

  it('should map recruiting-service to recruiter', () => {
    expect(normalizeRole('recruiting-service')).toBe('recruiter');
  });

  it('should map media to recruiter', () => {
    expect(normalizeRole('media')).toBe('recruiter');
  });

  it('should map service to recruiter', () => {
    expect(normalizeRole('service')).toBe('recruiter');
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
