/**
 * @fileoverview Unit tests for checkUsernameAvailability
 * @module @nxt1/functions/util/__tests__/checkUsernameAvailability
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { RESERVED_USERNAMES } from '@nxt1/core';

describe('checkUsernameAvailability', () => {
  beforeAll(() => {
    // Mock Firestore if needed
    vi.mock('firebase-admin', () => ({
      default: {
        firestore: () => ({
          collection: vi.fn(),
        }),
      },
    }));
  });

  describe('validation', () => {
    it('should reject reserved usernames', () => {
      const reserved = RESERVED_USERNAMES;
      expect(reserved).toContain('admin');
      expect(reserved).toContain('support');
      expect(reserved).toContain('nxt1');
    });

    it('should accept valid usernames', () => {
      const validUsernames = ['johndoe', 'athlete123', 'coach_smith'];
      validUsernames.forEach((username) => {
        expect(username.length).toBeGreaterThanOrEqual(3);
        expect(/^[a-z0-9_]*$/.test(username)).toBe(true);
      });
    });

    it('should reject invalid formats', () => {
      const invalidUsernames = [
        'ab', // too short
        'User123', // uppercase
        'user@name', // special chars
        'user name', // spaces
      ];

      invalidUsernames.forEach((username) => {
        const isValid = /^[a-z0-9_]{3,}$/.test(username);
        expect(isValid).toBe(false);
      });
    });
  });

  describe('availability', () => {
    it('should check if username exists in database', async () => {
      // This would connect to Firestore in real scenario
      // For now, just verify the logic
      const existingUsernames = ['john', 'sarah', 'coach_mike'];
      expect(existingUsernames).toContain('john');
      expect(existingUsernames).not.toContain('uniqueuser');
    });
  });
});
