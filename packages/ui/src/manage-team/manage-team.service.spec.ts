import { describe, expect, it } from 'vitest';
import {
  applyManageTeamFieldChange,
  buildManageTeamUpdatePayload,
  type ManageTeamFormData,
} from '@nxt1/core';

describe('ManageTeam helpers', () => {
  const sampleFormData: ManageTeamFormData = {
    basicInfo: {
      name: 'Falcons',
      mascot: 'Falcons',
      sport: 'Football',
      level: 'varsity',
      gender: 'coed',
    },
    branding: {
      logo: 'https://example.com/logo.png',
      galleryImages: ['https://example.com/logo.png'],
      primaryColor: '#112233',
      secondaryColor: '#445566',
    },
    contact: {
      email: 'old@example.com',
      phone: '111-111-1111',
      city: 'Austin',
      state: 'TX',
    },
    record: {
      wins: 8,
      losses: 2,
      ties: 1,
    },
    roster: [],
    schedule: [],
    staff: [],
    sponsors: [],
  };

  it('updates nested form fields immutably for visible manage team edits', () => {
    const updated = applyManageTeamFieldChange(sampleFormData, {
      sectionId: 'about',
      fieldId: 'name',
      value: 'Updated Falcons',
    });

    const withContact = applyManageTeamFieldChange(updated, {
      sectionId: 'contact',
      fieldId: 'email',
      value: 'coach@example.com',
    });

    const withStats = applyManageTeamFieldChange(withContact, {
      sectionId: 'stats',
      fieldId: 'wins',
      value: 11,
    });

    expect(withStats.basicInfo.name).toBe('Updated Falcons');
    expect(withStats.contact.email).toBe('coach@example.com');
    expect(withStats.record.wins).toBe(11);
    expect(sampleFormData.basicInfo.name).toBe('Falcons');
  });

  it('builds a complete API payload for the visible manage team fields', () => {
    const updated = applyManageTeamFieldChange(sampleFormData, {
      sectionId: 'about',
      fieldId: 'mascot',
      value: 'Hawks',
    });

    const payload = buildManageTeamUpdatePayload({
      ...updated,
      contact: {
        ...updated.contact,
        email: 'coach@example.com',
        phone: '222-333-4444',
        city: 'Dallas',
        state: 'TX',
      },
      record: {
        wins: 11,
        losses: 1,
        ties: 0,
      },
    });

    expect(payload).toEqual({
      teamName: 'Falcons',
      teamType: 'varsity',
      sportName: 'Football',
      mascot: 'Hawks',
      email: 'coach@example.com',
      phone: '222-333-4444',
      website: '',
      address: '',
      city: 'Dallas',
      state: 'TX',
      wins: 11,
      losses: 1,
      ties: 0,
      season: '',
      logoUrl: 'https://example.com/logo.png',
      galleryImages: ['https://example.com/logo.png'],
      primaryColor: '#112233',
      secondaryColor: '#445566',
      accentColor: '',
    });
  });
});
