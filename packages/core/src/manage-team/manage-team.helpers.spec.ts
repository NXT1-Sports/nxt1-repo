import { describe, expect, it } from 'vitest';
import { buildManageTeamUpdatePayload } from './manage-team.helpers.js';
import type { ManageTeamFormData } from './manage-team.types.js';

describe('buildManageTeamUpdatePayload', () => {
  it('uses organizationLogoUrl without emitting legacy team logo fields', () => {
    const formData: ManageTeamFormData = {
      basicInfo: {
        name: 'NXT1 Bears',
        sport: 'football',
        level: 'varsity',
        gender: 'boys',
      },
      branding: {
        logo: 'Teams/team-1/logo/upload.png',
        primaryColor: '#111111',
        secondaryColor: '#eeeeee',
      },
      contact: {},
      record: { wins: 8, losses: 2 },
      roster: [],
      schedule: [],
      staff: [],
      sponsors: [],
    };

    const payload = buildManageTeamUpdatePayload(formData);

    expect(payload.organizationLogoUrl).toBe('Teams/team-1/logo/upload.png');
    expect(payload).not.toHaveProperty('logoUrl');
    expect(payload).not.toHaveProperty('teamLogoImg');
  });
});
