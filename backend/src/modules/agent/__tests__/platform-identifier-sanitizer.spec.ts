import { describe, expect, it } from 'vitest';
import {
  sanitizeAgentOutputText,
  sanitizeAgentPayload,
} from '../utils/platform-identifier-sanitizer.js';

describe('platform identifier sanitizer', () => {
  it('removes sensitive identifier fields from structured payloads', () => {
    const sanitized = sanitizeAgentPayload({
      id: 'user-123',
      userId: 'user-123',
      teamId: 'team-456',
      organizationId: 'org-789',
      route: '/profile/123456',
      unicode: '123456',
      name: 'Jordan Miles',
      nested: {
        postId: 'post-1',
        title: 'Senior Tape',
      },
    });

    expect(sanitized).toEqual({
      name: 'Jordan Miles',
      nested: {
        title: 'Senior Tape',
      },
    });
  });

  it('redacts identifier-like text and profile routes', () => {
    const sanitized = sanitizeAgentOutputText(
      'User id user-123 can be viewed at /profile/123456 and team code FBN123.'
    );

    expect(sanitized).not.toContain('user-123');
    expect(sanitized).not.toContain('/profile/123456');
    expect(sanitized).not.toContain('FBN123');
    expect(sanitized).toContain('[redacted]');
  });

  it('redacts compact ID labels used in conversational responses', () => {
    const sanitized = sanitizeAgentOutputText(
      'UserID 19oowBH8EfZ6AYrU4fNuRSreonO2, TeamID mC3D9qg5d9amvcO0otvi, OrgID nB8n9iNsm5M5KBxfGUC9'
    );

    expect(sanitized).not.toContain('19oowBH8EfZ6AYrU4fNuRSreonO2');
    expect(sanitized).not.toContain('mC3D9qg5d9amvcO0otvi');
    expect(sanitized).not.toContain('nB8n9iNsm5M5KBxfGUC9');
    expect(sanitized).toContain('[redacted]');
  });
});
