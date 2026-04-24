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
});
