/**
 * @fileoverview Unit tests for mutation-policy.ts
 */
import { describe, it, expect } from 'vitest';
import { getMutationPolicy, ALLOWED_MUTATION_COLLECTIONS } from '../mutation-policy.js';

describe('getMutationPolicy', () => {
  // ── Allow-listed collections ─────────────────────────────────────────────

  describe('athlete-scoped collections', () => {
    it('returns policy for Awards', () => {
      const p = getMutationPolicy('Awards');
      expect(p).toBeDefined();
      expect(p!.ownershipPath).toBe('userId');
      expect(p!.softDelete).toBe(false);
      expect(p!.allowedOperations).toContain('update');
      expect(p!.allowedOperations).toContain('delete');
    });

    it('returns policy for CombineMetrics', () => {
      const p = getMutationPolicy('CombineMetrics');
      expect(p).toBeDefined();
      expect(p!.ownershipPath).toBe('userId');
      expect(p!.softDelete).toBe(false);
    });

    it('returns Intel policy with hard delete (softDelete: false)', () => {
      const p = getMutationPolicy('Intel');
      expect(p).toBeDefined();
      expect(p!.softDelete).toBe(false);
      expect(p!.ownershipPath).toBe('userId');
      // Intel only allows delete — no update
      expect(p!.allowedOperations).toContain('delete');
      expect(p!.allowedOperations).not.toContain('update');
    });

    it('returns policy for Rankings', () => {
      const p = getMutationPolicy('Rankings');
      expect(p).toBeDefined();
      expect(p!.ownershipPath).toBe('userId');
      expect(p!.allowedPatchFields).toContain('service');
      expect(p!.allowedPatchFields).toContain('rank');
    });

    it('returns policy for Recruiting', () => {
      const p = getMutationPolicy('Recruiting');
      expect(p).toBeDefined();
      expect(p!.ownershipPath).toBe('userId');
      expect(p!.allowedPatchFields).toContain('college');
      expect(p!.allowedPatchFields).toContain('status');
    });

    it('returns policy for PlayerStats', () => {
      const p = getMutationPolicy('PlayerStats');
      expect(p).toBeDefined();
      expect(p!.ownershipPath).toBe('userId');
      expect(p!.allowedPatchFields).toContain('season');
      expect(p!.allowedPatchFields).toContain('stats');
    });

    it('returns policy for PlayerMetrics', () => {
      const p = getMutationPolicy('PlayerMetrics');
      expect(p).toBeDefined();
      expect(p!.ownershipPath).toBe('userId');
      expect(p!.allowedPatchFields).toContain('height');
      expect(p!.allowedPatchFields).toContain('weight');
    });
  });

  describe('team-scoped collections', () => {
    it('returns Schedule policy with __schedule_owner (dual-owner)', () => {
      const p = getMutationPolicy('Schedule');
      expect(p).toBeDefined();
      expect(p!.ownershipPath).toBe('__schedule_owner');
      expect(p!.softDelete).toBe(false);
      expect(p!.allowedPatchFields).toContain('opponent');
      expect(p!.allowedPatchFields).toContain('date');
    });

    it('returns Calendar policy with __team_owner', () => {
      const p = getMutationPolicy('Calendar');
      expect(p).toBeDefined();
      expect(p!.ownershipPath).toBe('__team_owner');
      expect(p!.allowedPatchFields).toContain('title');
    });

    it('returns TeamNews policy with soft delete', () => {
      const p = getMutationPolicy('TeamNews');
      expect(p).toBeDefined();
      expect(p!.ownershipPath).toBe('__team_owner');
      expect(p!.softDelete).toBe(true);
    });

    it('returns TeamStats policy with __team_owner', () => {
      const p = getMutationPolicy('TeamStats');
      expect(p).toBeDefined();
      expect(p!.ownershipPath).toBe('__team_owner');
      expect(p!.allowedPatchFields).toContain('wins');
      expect(p!.allowedPatchFields).toContain('losses');
    });

    it('returns Roster policy with __team_owner', () => {
      const p = getMutationPolicy('Roster');
      expect(p).toBeDefined();
      expect(p!.ownershipPath).toBe('__team_owner');
      expect(p!.allowedPatchFields).toContain('position');
      expect(p!.allowedPatchFields).toContain('number');
    });

    it('returns Events policy with __team_owner', () => {
      const p = getMutationPolicy('Events');
      expect(p).toBeDefined();
      expect(p!.ownershipPath).toBe('__team_owner');
      expect(p!.allowedPatchFields).toContain('title');
    });
  });

  // ── Reject non-allowed collections ──────────────────────────────────────

  describe('blocked collections', () => {
    it('returns undefined for Users (too sensitive)', () => {
      expect(getMutationPolicy('Users')).toBeUndefined();
    });

    it('returns undefined for Posts (handled by dedicated tools)', () => {
      expect(getMutationPolicy('Posts')).toBeUndefined();
    });

    it('returns undefined for Teams', () => {
      expect(getMutationPolicy('Teams')).toBeUndefined();
    });

    it('returns undefined for unknown collection', () => {
      expect(getMutationPolicy('SomeMadeUpCollection')).toBeUndefined();
    });

    it('is case-sensitive (lowercase fails)', () => {
      expect(getMutationPolicy('awards')).toBeUndefined();
      expect(getMutationPolicy('roster')).toBeUndefined();
    });
  });

  // ── ALLOWED_MUTATION_COLLECTIONS export ──────────────────────────────────

  describe('ALLOWED_MUTATION_COLLECTIONS', () => {
    it('contains all expected collections', () => {
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('Awards');
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('CombineMetrics');
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('Intel');
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('Rankings');
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('Recruiting');
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('PlayerStats');
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('PlayerMetrics');
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('Schedule');
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('Calendar');
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('TeamNews');
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('TeamStats');
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('Roster');
      expect(ALLOWED_MUTATION_COLLECTIONS).toContain('Events');
    });

    it('does NOT contain blocked collections', () => {
      expect(ALLOWED_MUTATION_COLLECTIONS).not.toContain('Users');
      expect(ALLOWED_MUTATION_COLLECTIONS).not.toContain('Posts');
      expect(ALLOWED_MUTATION_COLLECTIONS).not.toContain('Teams');
    });

    it('each entry round-trips through getMutationPolicy', () => {
      for (const col of ALLOWED_MUTATION_COLLECTIONS) {
        expect(getMutationPolicy(col)).toBeDefined();
      }
    });
  });

  // ── Allowed patch fields never include immutable fields ──────────────────

  describe('allowedPatchFields safety', () => {
    const IMMUTABLE_FIELDS = ['userId', 'teamId', 'ownerId', 'organizationId', 'createdAt', 'id'];

    it('no policy allows patching userId', () => {
      for (const col of ALLOWED_MUTATION_COLLECTIONS) {
        const p = getMutationPolicy(col);
        if (p?.allowedPatchFields) {
          expect(p.allowedPatchFields).not.toContain('userId');
        }
      }
    });

    it('no policy allows patching any immutable field', () => {
      for (const col of ALLOWED_MUTATION_COLLECTIONS) {
        const p = getMutationPolicy(col);
        if (p?.allowedPatchFields) {
          for (const immutable of IMMUTABLE_FIELDS) {
            expect(p.allowedPatchFields).not.toContain(immutable);
          }
        }
      }
    });
  });
});
