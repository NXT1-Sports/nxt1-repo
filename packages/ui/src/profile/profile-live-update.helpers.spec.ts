import { describe, expect, it } from 'vitest';
import type { AuthUser, User } from '@nxt1/core';
import {
  applyProfileLiveUpdateToAuthUser,
  applyProfileLiveUpdateToUser,
  type ProfileLiveUpdateMutation,
} from './profile-live-update.helpers';

const baseUser = (): User => ({
  id: 'user-1',
  email: 'old@example.com',
  firstName: 'Ngoc',
  lastName: 'Son',
  displayName: 'Ngoc Son',
  aboutMe: 'Old bio',
  classOf: 2026,
  profileImgs: ['https://img.old/1.jpg'],
  location: { city: 'Ho Chi Minh', state: 'VN', country: 'Vietnam' },
  sports: [
    {
      sport: 'Football',
      positions: ['QB'],
      team: {
        name: 'Old Team',
        type: 'high-school',
        organizationId: 'org-old',
      },
      jerseyNumber: '12',
      verifiedMetrics: [],
    },
  ],
  academics: {
    gpa: 3.2,
    satScore: 1100,
    actScore: 21,
    intendedMajor: 'Business',
  },
  measurables: [
    {
      id: 'height',
      field: 'height',
      label: 'Height',
      value: '5-10',
      unit: 'ft',
      category: 'physical',
      source: 'self_reported',
      verified: false,
    },
  ],
  contact: {
    phone: '111-111',
  },
  connectedSources: [
    {
      platform: 'hudl',
      profileUrl: 'https://hudl.com/old',
      connected: true,
    },
  ],
  activeSportIndex: 0,
});

const baseAuthUser = (): AuthUser => ({
  uid: 'user-1',
  email: 'old@example.com',
  displayName: 'Ngoc Son',
  profileImg: 'https://img.old/1.jpg',
  role: 'athlete',
  hasCompletedOnboarding: true,
  provider: 'email',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sports: [
    {
      sport: 'Football',
      positions: ['QB'],
      team: {
        name: 'Old Team',
        organizationId: 'org-old',
      },
    },
  ],
  connectedSources: [
    {
      platform: 'hudl',
      profileUrl: 'https://hudl.com/old',
      connected: true,
    },
  ],
  activeSportIndex: 0,
});

function mutation(
  overrides: Partial<ProfileLiveUpdateMutation> & Pick<ProfileLiveUpdateMutation, 'sectionId'>
): ProfileLiveUpdateMutation {
  return {
    userId: 'user-1',
    data: {},
    ...overrides,
  };
}

describe('profile-live-update.helpers', () => {
  it('patches user identity, contact, connected sources, and photos', () => {
    const updated = applyProfileLiveUpdateToUser(
      applyProfileLiveUpdateToUser(
        applyProfileLiveUpdateToUser(
          applyProfileLiveUpdateToUser(
            baseUser(),
            mutation({
              sectionId: 'basic-info',
              data: {
                firstName: 'ngoc123',
                displayName: 'ngoc123 Son',
                bio: 'New bio',
                location: 'Austin, TX',
                classYear: '2027',
              },
            })
          ),
          mutation({
            sectionId: 'contact',
            data: { email: 'new@example.com', phone: '222-222' },
          })
        ),
        mutation({
          sectionId: 'connected-sources',
          data: {
            connectedSources: [
              {
                platform: 'instagram',
                profileUrl: 'https://instagram.com/ngoc123',
                connected: true,
              },
            ],
          },
        })
      ),
      mutation({
        sectionId: 'photos',
        data: { profileImgs: ['https://img.new/1.jpg', 'https://img.new/2.jpg'] },
      })
    );

    expect(updated.firstName).toBe('ngoc123');
    expect(updated.displayName).toBe('ngoc123 Son');
    expect(updated.aboutMe).toBe('New bio');
    expect(updated.location).toEqual({ city: 'Austin', state: 'TX', country: 'Vietnam' });
    expect(updated.classOf).toBe(2027);
    expect(updated.email).toBe('new@example.com');
    expect(updated.contact?.phone).toBe('222-222');
    expect(updated.profileImgs).toEqual(['https://img.new/1.jpg', 'https://img.new/2.jpg']);
    expect(updated.connectedSources?.[0]?.platform).toBe('instagram');
  });

  it('patches user sports, academics, and physical metrics', () => {
    const updated = applyProfileLiveUpdateToUser(
      applyProfileLiveUpdateToUser(
        applyProfileLiveUpdateToUser(
          baseUser(),
          mutation({
            sectionId: 'sports-info',
            sportIndex: 0,
            data: {
              positions: ['WR', 'ATH'],
              teamName: 'New Team',
              teamType: 'college',
              teamOrganizationId: 'org-new',
              jerseyNumber: '7',
            },
          })
        ),
        mutation({
          sectionId: 'academics',
          data: {
            gpa: '3.8',
            sat: '1280',
            act: '28',
            intendedMajor: 'Computer Science',
          },
        })
      ),
      mutation({
        sectionId: 'physical',
        sportIndex: 0,
        data: {
          height: '6-1',
          weight: '190',
          wingspan: '6-4',
        },
      })
    );

    expect(updated.sports?.[0]?.positions).toEqual(['WR', 'ATH']);
    expect(updated.sports?.[0]?.team).toMatchObject({
      name: 'New Team',
      type: 'college',
      organizationId: 'org-new',
    });
    expect(updated.sports?.[0]?.jerseyNumber).toBe('7');
    expect(updated.academics).toMatchObject({
      gpa: 3.8,
      satScore: 1280,
      actScore: 28,
      intendedMajor: 'Computer Science',
    });
    expect(updated.measurables?.find((metric) => metric.field === 'height')?.value).toBe('6-1');
    expect(updated.measurables?.find((metric) => metric.field === 'weight')?.value).toBe('190');
    expect(
      updated.sports?.[0]?.verifiedMetrics?.find((metric) => metric.field === 'wingspan')?.value
    ).toBe('6-4');
  });

  it('patches auth user fields used by global navigation immediately', () => {
    const updated = applyProfileLiveUpdateToAuthUser(
      applyProfileLiveUpdateToAuthUser(
        applyProfileLiveUpdateToAuthUser(
          applyProfileLiveUpdateToAuthUser(
            baseAuthUser(),
            mutation({
              sectionId: 'basic-info',
              data: { displayName: 'ngoc123 Son' },
            })
          ),
          mutation({
            sectionId: 'photos',
            data: { profileImgs: ['https://img.new/1.jpg'] },
          })
        ),
        mutation({
          sectionId: 'sports-info',
          sportIndex: 0,
          data: {
            positions: ['WR'],
            teamName: 'New Team',
            teamOrganizationId: 'org-new',
          },
        })
      ),
      mutation({
        sectionId: 'connected-sources',
        data: {
          connectedSources: [
            {
              platform: 'instagram',
              profileUrl: 'https://instagram.com/ngoc123',
              connected: true,
            },
          ],
        },
      })
    );

    expect(updated.displayName).toBe('ngoc123 Son');
    expect(updated.profileImg).toBe('https://img.new/1.jpg');
    expect(updated.sports?.[0]?.positions).toEqual(['WR']);
    expect(updated.sports?.[0]?.team).toMatchObject({
      name: 'New Team',
      organizationId: 'org-new',
    });
    expect(updated.connectedSources?.[0]?.platform).toBe('instagram');
  });
});
