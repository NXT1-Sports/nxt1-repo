import type { AuthUser } from '@nxt1/core/auth';
import {
  TEAM_TYPES,
  type User,
  type ConnectedSource,
  type SportProfile,
  type VerifiedMetric,
} from '@nxt1/core';
import type {
  EditProfileAcademics,
  EditProfileBasicInfo,
  EditProfileContact,
  EditProfilePhysical,
  EditProfilePhotos,
  EditProfileSectionId,
  EditProfileSportsInfo,
} from '@nxt1/core/edit-profile';

export interface ProfileLiveUpdateMutation {
  readonly userId: string;
  readonly sectionId: EditProfileSectionId;
  readonly data: Record<string, unknown>;
  readonly sportIndex?: number;
}

function cloneArray<T>(value: readonly T[] | undefined): T[] | undefined {
  if (!value) return undefined;
  return JSON.parse(JSON.stringify(value)) as T[];
}

function buildDisplayName(firstName?: string, lastName?: string): string | undefined {
  const displayName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ').trim();
  return displayName || undefined;
}

function resolveSportIndex(
  requestedSportIndex: number | undefined,
  activeSportIndex: number | undefined
): number {
  return requestedSportIndex ?? activeSportIndex ?? 0;
}

function asConnectedSources(value: unknown): ConnectedSource[] | undefined {
  return Array.isArray(value)
    ? (value.map((entry) => ({
        ...(entry as Record<string, unknown>),
      })) as unknown as ConnectedSource[])
    : undefined;
}

function patchBasicInfo(user: User, data: EditProfileBasicInfo): User {
  const nextUser: User = { ...user };

  if (data.firstName !== undefined) {
    nextUser.firstName = data.firstName;
  }

  if (data.lastName !== undefined) {
    nextUser.lastName = data.lastName;
  }

  if (data.displayName !== undefined) {
    const trimmed = data.displayName.trim();
    nextUser.displayName = trimmed || undefined;
  } else if (data.firstName !== undefined || data.lastName !== undefined) {
    nextUser.displayName = buildDisplayName(nextUser.firstName, nextUser.lastName);
  }

  if (data.bio !== undefined) {
    nextUser.aboutMe = data.bio.trim() || undefined;
  }

  if (data.location !== undefined) {
    const trimmed = data.location.trim();
    if (!trimmed) {
      nextUser.location = undefined;
    } else {
      const [city = '', state = ''] = trimmed.split(',').map((part) => part.trim());
      nextUser.location = {
        ...nextUser.location,
        city,
        state,
        country: nextUser.location?.country ?? '',
      };
    }
  }

  if (data.classYear !== undefined) {
    const nextClassOf = Number.parseInt(data.classYear, 10);
    nextUser.classOf = Number.isFinite(nextClassOf) ? nextClassOf : undefined;
  }

  return nextUser;
}

function patchPhotos(user: User, data: EditProfilePhotos): User {
  if (!('profileImgs' in data)) return user;

  return {
    ...user,
    profileImgs: Array.isArray(data.profileImgs) ? [...data.profileImgs] : [],
  };
}

function patchSportsInfo(
  user: User,
  data: EditProfileSportsInfo,
  requestedSportIndex?: number
): User {
  if (!Array.isArray(user.sports) || user.sports.length === 0) {
    return user;
  }

  const targetIndex = resolveSportIndex(requestedSportIndex, user.activeSportIndex);
  if (!user.sports[targetIndex]) {
    return user;
  }

  const updatedSports = cloneArray(user.sports) as SportProfile[];
  const targetSport = { ...updatedSports[targetIndex] };

  if (data.jerseyNumber !== undefined) {
    const trimmed =
      typeof data.jerseyNumber === 'number'
        ? String(data.jerseyNumber).trim()
        : data.jerseyNumber.trim();
    targetSport.jerseyNumber = trimmed || undefined;
  }

  if (data.positions !== undefined) {
    targetSport.positions = data.positions.map((position) => position.trim()).filter(Boolean);
  }

  if (data.teamName !== undefined) {
    const trimmed = data.teamName.trim();
    if (!trimmed) {
      delete targetSport.team;
    } else {
      targetSport.team = {
        ...(targetSport.team ?? {}),
        name: trimmed,
        type: targetSport.team?.type ?? TEAM_TYPES.HIGH_SCHOOL,
      };
    }
  }

  if (targetSport.team && data.teamType !== undefined) {
    targetSport.team = {
      ...targetSport.team,
      type: (data.teamType || TEAM_TYPES.HIGH_SCHOOL) as NonNullable<SportProfile['team']>['type'],
    };
  }

  if (targetSport.team && data.teamOrganizationId !== undefined) {
    targetSport.team = {
      ...targetSport.team,
      organizationId: data.teamOrganizationId || undefined,
    };
  }

  updatedSports[targetIndex] = targetSport;

  return {
    ...user,
    sports: updatedSports,
  };
}

function patchAcademics(user: User, data: EditProfileAcademics): User {
  const nextAcademics = { ...(user.academics ?? {}) };

  if (data.gpa !== undefined) {
    const parsed = Number.parseFloat(data.gpa);
    nextAcademics.gpa = Number.isFinite(parsed) ? parsed : undefined;
  }

  if (data.sat !== undefined) {
    const parsed = Number.parseInt(data.sat, 10);
    nextAcademics.satScore = Number.isFinite(parsed) ? parsed : undefined;
  }

  if (data.act !== undefined) {
    const parsed = Number.parseInt(data.act, 10);
    nextAcademics.actScore = Number.isFinite(parsed) ? parsed : undefined;
  }

  if (data.intendedMajor !== undefined) {
    nextAcademics.intendedMajor = data.intendedMajor.trim() || undefined;
  }

  return {
    ...user,
    academics: nextAcademics,
  };
}

function upsertMeasurable(
  measurables: VerifiedMetric[],
  field: 'height' | 'weight',
  value: string | undefined,
  unit: string
): VerifiedMetric[] {
  const next = [...measurables];
  const index = next.findIndex((metric) => metric.field === field);
  const trimmed = value?.trim() ?? '';

  if (!trimmed) {
    if (index >= 0) {
      next.splice(index, 1);
    }
    return next;
  }

  const entry: VerifiedMetric = {
    id: field,
    field,
    label: field === 'height' ? 'Height' : 'Weight',
    value: trimmed,
    unit,
    category: 'physical',
    source: 'self_reported',
    verified: false,
    updatedAt: new Date().toISOString(),
  };

  if (index >= 0) {
    next[index] = entry;
  } else {
    next.push(entry);
  }

  return next;
}

function patchPhysical(user: User, data: EditProfilePhysical, requestedSportIndex?: number): User {
  let nextUser: User = { ...user };

  if (data.height !== undefined || data.weight !== undefined) {
    const measurables = cloneArray(user.measurables) ?? [];
    const heightPatched =
      data.height !== undefined
        ? upsertMeasurable(measurables, 'height', data.height, 'ft')
        : measurables;
    const weightPatched =
      data.weight !== undefined
        ? upsertMeasurable(heightPatched, 'weight', data.weight, 'lbs')
        : heightPatched;
    nextUser = {
      ...nextUser,
      measurables: weightPatched,
    };
  }

  if (
    data.wingspan === undefined ||
    !Array.isArray(nextUser.sports) ||
    nextUser.sports.length === 0
  ) {
    return nextUser;
  }

  const targetIndex = resolveSportIndex(requestedSportIndex, nextUser.activeSportIndex);
  if (!nextUser.sports[targetIndex]) {
    return nextUser;
  }

  const updatedSports = cloneArray(nextUser.sports) as SportProfile[];
  const targetSport = { ...updatedSports[targetIndex] };
  const verifiedMetrics = cloneArray(targetSport.verifiedMetrics) ?? [];
  const wingspanIndex = verifiedMetrics.findIndex((metric) => metric.field === 'wingspan');
  const trimmed = data.wingspan.trim();

  if (!trimmed) {
    if (wingspanIndex >= 0) {
      verifiedMetrics.splice(wingspanIndex, 1);
    }
  } else {
    const entry: VerifiedMetric = {
      id: 'wingspan',
      field: 'wingspan',
      label: 'Wingspan',
      value: trimmed,
      unit: 'ft',
      category: 'physical',
      source: 'self_reported',
      verified: false,
      updatedAt: new Date().toISOString(),
    };
    if (wingspanIndex >= 0) {
      verifiedMetrics[wingspanIndex] = entry;
    } else {
      verifiedMetrics.push(entry);
    }
  }

  targetSport.verifiedMetrics = verifiedMetrics;
  updatedSports[targetIndex] = targetSport;

  return {
    ...nextUser,
    sports: updatedSports,
  };
}

function patchContact(user: User, data: EditProfileContact): User {
  const nextUser: User = { ...user };

  if (data.email !== undefined) {
    nextUser.email = data.email;
  }

  if (data.phone !== undefined) {
    nextUser.contact = {
      ...(nextUser.contact ?? {}),
      email: nextUser.contact?.email ?? nextUser.email,
      phone: data.phone.trim() || undefined,
    };
  }

  return nextUser;
}

function patchConnectedSources(user: User, data: Record<string, unknown>): User {
  if (!('connectedSources' in data)) return user;

  return {
    ...user,
    connectedSources: asConnectedSources(data['connectedSources']) ?? [],
  };
}

export function applyProfileLiveUpdateToUser(
  user: User,
  mutation: ProfileLiveUpdateMutation
): User {
  switch (mutation.sectionId) {
    case 'basic-info':
      return patchBasicInfo(user, mutation.data as unknown as EditProfileBasicInfo);
    case 'photos':
      return patchPhotos(user, mutation.data as EditProfilePhotos);
    case 'sports-info':
      return patchSportsInfo(user, mutation.data as EditProfileSportsInfo, mutation.sportIndex);
    case 'academics':
      return patchAcademics(user, mutation.data as EditProfileAcademics);
    case 'physical':
      return patchPhysical(user, mutation.data as EditProfilePhysical, mutation.sportIndex);
    case 'contact':
      return patchContact(user, mutation.data as EditProfileContact);
    case 'connected-sources':
      return patchConnectedSources(user, mutation.data);
    default:
      return user;
  }
}

export function applyProfileLiveUpdateToAuthUser(
  user: AuthUser,
  mutation: ProfileLiveUpdateMutation
): AuthUser {
  switch (mutation.sectionId) {
    case 'basic-info': {
      const data = mutation.data as unknown as EditProfileBasicInfo;
      const nextDisplayName =
        data.displayName !== undefined ? data.displayName.trim() || user.displayName : undefined;

      return nextDisplayName !== undefined ? { ...user, displayName: nextDisplayName } : user;
    }
    case 'photos': {
      const data = mutation.data as EditProfilePhotos;
      if (!('profileImgs' in data)) return user;

      return {
        ...user,
        profileImg: Array.isArray(data.profileImgs) ? data.profileImgs[0] : undefined,
      };
    }
    case 'sports-info': {
      if (!Array.isArray(user.sports) || user.sports.length === 0) {
        return user;
      }

      const targetIndex = resolveSportIndex(mutation.sportIndex, user.activeSportIndex);
      if (!user.sports[targetIndex]) {
        return user;
      }

      const data = mutation.data as EditProfileSportsInfo;
      const updatedSports = cloneArray(user.sports) ?? [];
      const targetSport = { ...updatedSports[targetIndex] };

      if (data.positions !== undefined) {
        targetSport.positions = data.positions.map((position) => position.trim()).filter(Boolean);
      }

      if (data.teamName !== undefined) {
        const trimmed = data.teamName.trim();
        if (!trimmed) {
          delete targetSport.team;
        } else {
          targetSport.team = {
            ...(targetSport.team ?? {}),
            name: trimmed,
          };
        }
      }

      if (targetSport.team && data.teamOrganizationId !== undefined) {
        targetSport.team = {
          ...targetSport.team,
          organizationId: data.teamOrganizationId || undefined,
        };
      }

      updatedSports[targetIndex] = targetSport;

      return {
        ...user,
        sports: updatedSports,
      };
    }
    case 'contact': {
      const data = mutation.data as EditProfileContact;
      return data.email !== undefined ? { ...user, email: data.email } : user;
    }
    case 'connected-sources': {
      if (!('connectedSources' in mutation.data)) return user;

      return {
        ...user,
        connectedSources: asConnectedSources(mutation.data['connectedSources']) ?? [],
      };
    }
    default:
      return user;
  }
}
