/**
 * @fileoverview Settings Routes Tests
 * @module @nxt1/backend/routes/__tests__/settings
 */

import 'reflect-metadata';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { expectExpressRouter } from './route-test.utils.js';
import app, {
  __getMockFirestoreWrites,
  __resetMockFirestore,
  __seedMockFirestoreDocument,
} from '../../test-app.js';
import { RosterEntryService } from '../../services/team/roster-entry.service.js';

const AUTH_HEADER = 'Bearer test-token';

describe('Settings Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/core/settings.routes.js');
    router = module.default;
  }, 15_000);

  beforeEach(() => {
    __resetMockFirestore();
    vi.restoreAllMocks();
  });

  it('should register the settings endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/preferences', method: 'get' },
        { path: '/preferences/:key', method: 'patch' },
        { path: '/preferences', method: 'patch' },
        { path: '/password', method: 'post' },
        { path: '/account', method: 'delete' },
      ],
      5
    );
  });

  it('does not pre-delete roster entries before the user deletion trigger runs', async () => {
    __seedMockFirestoreDocument('Users/test-user', {
      id: 'test-user',
      email: 'test@example.com',
      unicode: 'test-user',
    });

    const getUserTeamsSpy = vi
      .spyOn(RosterEntryService.prototype, 'getUserTeams')
      .mockResolvedValue([
        {
          id: 'roster-entry-1',
          userId: 'test-user',
          teamId: 'team-1',
          organizationId: 'org-1',
          role: 'director',
          sport: 'Football',
          status: 'active',
          firstName: 'Test',
          lastName: 'User',
          displayName: 'Test User',
          email: 'test@example.com',
          phoneNumber: '',
          profileImgs: [],
          joinedAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

    const response = await request(app)
      .delete('/api/v1/settings/account')
      .set('Authorization', AUTH_HEADER);

    expect(response.status).toBe(200);
    expect(getUserTeamsSpy).not.toHaveBeenCalled();

    const rosterDeletes = __getMockFirestoreWrites().filter(
      (write) => write.operation === 'delete' && write.path.startsWith('RosterEntries/')
    );

    expect(rosterDeletes).toHaveLength(0);
  });
});
