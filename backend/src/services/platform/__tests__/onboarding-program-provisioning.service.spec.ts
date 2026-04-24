/**
 * @fileoverview Onboarding Program Provisioning Service – Pure Function Tests
 * @module @nxt1/backend/services/__tests__/onboarding-program-provisioning
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeProgramType,
  parseLocationLabel,
  buildProvisioningSelections,
  getProvisioningSports,
} from '../onboarding-program-provisioning.service.js';

// ============================================
// normalizeProgramType
// ============================================

describe('normalizeProgramType', () => {
  it('should return known program types as-is', () => {
    expect(normalizeProgramType('high-school')).toBe('high-school');
    expect(normalizeProgramType('middle-school')).toBe('middle-school');
    expect(normalizeProgramType('club')).toBe('club');
    expect(normalizeProgramType('college')).toBe('college');
    expect(normalizeProgramType('juco')).toBe('juco');
    expect(normalizeProgramType('organization')).toBe('organization');
  });

  it('should normalize "school" to "high-school"', () => {
    expect(normalizeProgramType('school')).toBe('high-school');
  });

  it('should default unknown values to "organization"', () => {
    expect(normalizeProgramType('random')).toBe('organization');
    expect(normalizeProgramType('')).toBe('organization');
    expect(normalizeProgramType(undefined)).toBe('organization');
  });

  it('should handle whitespace and casing', () => {
    expect(normalizeProgramType('  Club  ')).toBe('club');
    expect(normalizeProgramType('HIGH-SCHOOL')).toBe('high-school');
  });
});

// ============================================
// parseLocationLabel
// ============================================

describe('parseLocationLabel', () => {
  it('should parse "City, State" format', () => {
    expect(parseLocationLabel('Houston, TX')).toEqual({ city: 'Houston', state: 'TX' });
  });

  it('should handle city only (no comma)', () => {
    expect(parseLocationLabel('Houston')).toEqual({ city: 'Houston', state: undefined });
  });

  it('should return empty object for falsy input', () => {
    expect(parseLocationLabel(undefined)).toEqual({});
    expect(parseLocationLabel('')).toEqual({});
    expect(parseLocationLabel('   ')).toEqual({});
  });

  it('should trim whitespace', () => {
    expect(parseLocationLabel('  Dallas ,  TX  ')).toEqual({ city: 'Dallas', state: 'TX' });
  });
});

// ============================================
// buildProvisioningSelections
// ============================================

describe('buildProvisioningSelections', () => {
  it('should return selections from teamSelection.teams', () => {
    const result = buildProvisioningSelections({
      teamSelection: {
        teams: [
          { id: 'org1', name: 'Program A', organizationId: 'org1' },
          { id: 'org2', name: 'Program B', organizationId: 'org2' },
        ],
      },
    });

    expect(result).toHaveLength(2);
  });

  it('should deduplicate by organization ID', () => {
    const result = buildProvisioningSelections({
      teamSelection: {
        teams: [
          { id: 'org1', name: 'Program A', organizationId: 'org1' },
          { id: 'org1-dup', name: 'Program A duplicate', organizationId: 'org1' },
        ],
      },
    });

    expect(result).toHaveLength(1);
  });

  it('should deduplicate draft programs by lowercase name', () => {
    const result = buildProvisioningSelections({
      teamSelection: {
        teams: [
          { id: 'draft_1', name: 'My Program', isDraft: true },
          { id: 'draft_2', name: 'my program', isDraft: true },
        ],
      },
    });

    expect(result).toHaveLength(1);
  });

  it('should fall back to createTeamProfile when no teams selected', () => {
    const result = buildProvisioningSelections({
      teamSelection: { teams: [] },
      createTeamProfile: { programName: 'New Program', teamType: 'high-school' },
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('New Program');
    expect(result[0].isDraft).toBe(true);
  });

  it('should return empty when no teams and no createTeamProfile', () => {
    const result = buildProvisioningSelections({});
    expect(result).toHaveLength(0);
  });

  it('should return empty when createTeamProfile has no programName', () => {
    const result = buildProvisioningSelections({
      createTeamProfile: { teamType: 'club' },
    });
    expect(result).toHaveLength(0);
  });
});

// ============================================
// getProvisioningSports
// ============================================

describe('getProvisioningSports', () => {
  it('should extract unique sport names', () => {
    const result = getProvisioningSports([
      { sport: 'Basketball', isPrimary: true, positions: [] },
      { sport: 'Football', isPrimary: false, positions: [] },
    ]);

    expect(result).toEqual(['Basketball', 'Football']);
  });

  it('should deduplicate sports', () => {
    const result = getProvisioningSports([
      { sport: 'Basketball', isPrimary: true, positions: [] },
      { sport: 'Basketball', isPrimary: false, positions: ['PG'] },
    ]);

    expect(result).toEqual(['Basketball']);
  });

  it('should default to basketball when no sports provided', () => {
    const result = getProvisioningSports([]);
    expect(result).toEqual(['basketball']);
  });

  it('should filter out falsy sport values', () => {
    const result = getProvisioningSports([
      { sport: '', isPrimary: true, positions: [] },
      { sport: 'Football', isPrimary: false, positions: [] },
    ]);

    expect(result).toEqual(['Football']);
  });
});
