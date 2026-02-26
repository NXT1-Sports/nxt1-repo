/**
 * @fileoverview Profile Mappers — Platform-agnostic data transformers
 * @module @nxt1/ui/profile
 *
 * Converts raw API types (from @nxt1/core) into the UI types consumed by
 * ProfileService and the shell components.
 *
 * Shared between web and mobile apps — no platform code here.
 */

import type { User, ProfilePageData, ProfileUser, ProfileUserRole, ProfileSport } from '@nxt1/core';

/**
 * Transform a raw API `User` object into the `ProfilePageData` shape
 * expected by UIProfileService / ProfileShellComponent.
 *
 * @param user        - Raw User from the backend API
 * @param isOwnProfile - Whether the viewer owns this profile
 *
 * @example
 * ```typescript
 * // Web
 * const data = userToProfilePageData(apiUser, isOwnProfile);
 * uiProfileService.loadFromExternalData(data);
 *
 * // Mobile
 * const data = userToProfilePageData(apiUser, isOwnProfile);
 * uiProfileService.loadFromExternalData(data);
 * ```
 */
export function userToProfilePageData(user: User, isOwnProfile: boolean): ProfilePageData {
  const activeSportIndex = user.activeSportIndex ?? 0;
  const activeSport = user.sports?.[activeSportIndex];

  const primarySport: ProfileSport | undefined = activeSport
    ? {
        name: activeSport.sport ?? 'Sport',
        icon: (activeSport.sport ?? 'sport').toLowerCase().replace(/\s+/g, '-'),
        position: activeSport.positions?.[0],
        secondaryPositions: activeSport.positions?.slice(1),
        jerseyNumber: activeSport.jerseyNumber,
      }
    : undefined;

  const additionalSports: ProfileSport[] = (user.sports ?? [])
    .filter((_, i) => i !== activeSportIndex)
    .map((s) => ({
      name: s.sport ?? 'Sport',
      icon: (s.sport ?? 'sport').toLowerCase().replace(/\s+/g, '-'),
      position: s.positions?.[0],
      secondaryPositions: s.positions?.slice(1),
      jerseyNumber: s.jerseyNumber,
    }));

  const location = user.location
    ? [user.location.city, user.location.state].filter(Boolean).join(', ')
    : undefined;

  const now = new Date().toISOString();
  const uid = (user as unknown as { uid?: string }).uid ?? user.id;

  const profileUser: ProfileUser = {
    uid,
    profileCode: user.unicode ?? uid,
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    displayName: user.displayName,
    // profileImg: user.userImgs?.profileImg ?? user.profileImg ?? undefined,
    // bannerImg: user.userImgs?.bannerImg ?? undefined,
    // gallery: (user.userImgs?.gallery ?? []) as readonly string[],
    role: (user.role ?? 'athlete') as unknown as ProfileUserRole,
    isRecruit: (user.role ?? 'athlete') === 'athlete',
    verificationStatus: user.verificationStatus ?? 'unverified',
    aboutMe: user.aboutMe ?? activeSport?.aboutMe,
    primarySport,
    additionalSports: additionalSports.length ? additionalSports : undefined,
    classYear: user.classOf?.toString(),
    height: user.height,
    weight: user.weight,
    location,
    createdAt: (user as unknown as { createdAt?: string }).createdAt ?? now,
    updatedAt: (user as unknown as { updatedAt?: string }).updatedAt ?? now,
  };

  return {
    user: profileUser,
    followStats: {
      followersCount: 0,
      followingCount: 0,
      isFollowing: false,
      isFollowedBy: false,
    },
    quickStats: {
      profileViews: 0,
      videoViews: 0,
      totalPosts: 0,
      highlightCount: 0,
      offerCount: 0,
      eventCount: 0,
      collegeInterestCount: 0,
      shareCount: 0,
    },
    recentPosts: [],
    isOwnProfile,
    canEdit: isOwnProfile,
  };
}
