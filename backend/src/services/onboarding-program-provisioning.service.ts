import type { Firestore } from 'firebase-admin/firestore';
import type { SportProfile, TeamTypeApi, UserRole } from '@nxt1/core';
import { RosterEntryStatus, RosterRole } from '@nxt1/core/models';
import * as teamCodeService from './team-code.service.js';
import { createOrganizationService } from './organization.service.js';
import { createRosterEntryService } from './roster-entry.service.js';
import { normalizeProgramName } from './name-normalizer.service.js';
import { logger } from '../utils/logger.js';

type ProgramType = 'high-school' | 'middle-school' | 'club' | 'college' | 'juco' | 'organization';

export interface OnboardingProgramSelection {
  id: string;
  name?: string;
  teamType?: string;
  location?: string;
  isDraft?: boolean;
  organizationId?: string;
}

export interface OnboardingCreateTeamProfile {
  programName?: string;
  teamType?: string;
  mascot?: string;
  state?: string;
  city?: string;
}

interface ProvisioningProgramRecord {
  organizationId: string;
  name: string;
  teamType: TeamTypeApi;
  city?: string;
  state?: string;
}

export interface ProvisionOnboardingProgramsInput {
  db: Firestore;
  userId: string;
  role: UserRole;
  sports: readonly SportProfile[];
  currentUser?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    contact?: { phone?: string };
    profileImgs?: string[];
  };
  updateData: {
    firstName?: string;
    lastName?: string;
    profileImgs?: string[];
    athlete?: { classOf?: number };
    location?: { city?: string; state?: string };
  };
  teamSelection?: {
    teams?: OnboardingProgramSelection[];
  };
  createTeamProfile?: OnboardingCreateTeamProfile;
}

export interface ProvisionOnboardingProgramsResult {
  teamIds: string[];
  createdTeamIds: string[];
  organizationIds: string[];
}

export function normalizeProgramType(value?: string): ProgramType {
  const normalized = (value ?? '').trim().toLowerCase();
  switch (normalized) {
    case 'high-school':
    case 'middle-school':
    case 'club':
    case 'college':
    case 'juco':
    case 'organization':
      return normalized;
    case 'school':
      return 'high-school';
    default:
      return 'organization';
  }
}

function normalizeTeamType(value?: string): TeamTypeApi {
  return normalizeProgramType(value);
}

export function parseLocationLabel(location?: string): { city?: string; state?: string } {
  if (!location?.trim()) {
    return {};
  }

  const [cityRaw, stateRaw] = location.split(',').map((part) => part.trim());
  return {
    city: cityRaw || undefined,
    state: stateRaw || undefined,
  };
}

export function buildProvisioningSelections(input: {
  teamSelection?: { teams?: OnboardingProgramSelection[] };
  createTeamProfile?: OnboardingCreateTeamProfile;
}): OnboardingProgramSelection[] {
  const deduped = new Map<string, OnboardingProgramSelection>();
  const selectedPrograms = Array.isArray(input.teamSelection?.teams)
    ? [...input.teamSelection.teams]
    : [];

  if (selectedPrograms.length === 0 && input.createTeamProfile?.programName?.trim()) {
    selectedPrograms.push({
      id: `draft_${Date.now().toString(36)}`,
      name: input.createTeamProfile.programName,
      teamType: input.createTeamProfile.teamType,
      isDraft: true,
    });
  }

  for (const selection of selectedPrograms) {
    const isDraft = Boolean(selection.isDraft) || selection.id.startsWith('draft_');
    const draftName = selection.name?.trim().toLowerCase() ?? '';
    const key = isDraft ? `draft:${draftName}` : `org:${selection.organizationId || selection.id}`;
    if (!deduped.has(key)) {
      deduped.set(key, selection);
    }
  }

  return Array.from(deduped.values());
}

export function getProvisioningSports(sports: readonly SportProfile[]): string[] {
  const uniqueSports = Array.from(
    new Set(sports.map((sport) => sport.sport).filter((sport): sport is string => Boolean(sport)))
  );
  return uniqueSports.length > 0 ? uniqueSports : ['basketball'];
}

async function generateUniqueTeamCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { team } = await teamCodeService.getTeamCodeByCode(db, candidate, false);
    if (!team) {
      return candidate;
    }
  }

  return `${Date.now().toString(36).slice(-6)}`.toUpperCase();
}

async function resolvePrograms(
  input: ProvisionOnboardingProgramsInput,
  selections: readonly OnboardingProgramSelection[]
): Promise<ProvisioningProgramRecord[]> {
  const organizationService = createOrganizationService(input.db);
  const programs: ProvisioningProgramRecord[] = [];

  for (const program of selections) {
    const isDraftProgram = Boolean(program.isDraft) || program.id.startsWith('draft_');
    const rawName = program.name?.trim() ?? '';
    if (isDraftProgram && !rawName) {
      continue;
    }

    const parsedLocation = parseLocationLabel(program.location);
    const state =
      parsedLocation.state ||
      input.createTeamProfile?.state ||
      input.updateData.location?.state ||
      '';
    const city =
      parsedLocation.city || input.createTeamProfile?.city || input.updateData.location?.city || '';
    const teamType = normalizeTeamType(program.teamType || input.createTeamProfile?.teamType);

    if (isDraftProgram) {
      try {
        const normalizedName = await normalizeProgramName(rawName);
        const isPrivilegedRole = input.role === 'coach' || input.role === 'director';
        const org = await organizationService.createOrganization({
          name: normalizedName,
          type: normalizeProgramType(program.teamType || input.createTeamProfile?.teamType),
          ownerId: isPrivilegedRole ? input.userId : '',
          location: {
            address: '',
            city,
            state,
            zipCode: '',
            country: 'USA',
          },
          mascot: input.createTeamProfile?.mascot,
          isClaimed: false,
          source: 'user_generated',
          skipAdmins: !isPrivilegedRole,
        });

        if (!org.id) {
          continue;
        }

        programs.push({
          organizationId: org.id,
          name: org.name,
          teamType,
          city,
          state,
        });

        logger.info('[OnboardingProgramProvisioning] Created ghost program', {
          organizationId: org.id,
          name: org.name,
        });
      } catch (err) {
        logger.error('[OnboardingProgramProvisioning] Failed to create ghost program', {
          error: err,
          name: rawName,
        });
      }
      continue;
    }

    const organizationId = program.organizationId || program.id;
    if (!organizationId) {
      continue;
    }

    programs.push({
      organizationId,
      name: rawName || 'Program',
      teamType,
      city,
      state,
    });

    if (input.role === 'coach') {
      try {
        await organizationService.addAdmin({
          organizationId,
          userId: input.userId,
          role: 'admin',
          addedBy: input.userId,
        });
      } catch (err) {
        logger.warn('[OnboardingProgramProvisioning] Failed to add coach as org admin', {
          organizationId,
          error: err,
        });
      }
    }
  }

  return programs;
}

async function ensureTeamForSport(
  input: ProvisionOnboardingProgramsInput,
  program: ProvisioningProgramRecord,
  sportName: string
): Promise<{ teamId: string; created: boolean } | null> {
  // Resolve the level for this sport from the user's sport profile so that
  // Varsity Football and JV Football resolve to distinct team documents.
  const sport = input.sports.find((s) => s.sport?.toLowerCase() === sportName.toLowerCase());
  const level = sport?.level;

  // Build the uniqueness query: org + sport + level (when present)
  let query = input.db
    .collection('Teams')
    .where('organizationId', '==', program.organizationId)
    .where('sport', '==', sportName)
    .where('isActive', '==', true);

  if (level) {
    query = query.where('level', '==', level) as typeof query;
  }

  let existingTeamSnapshot = await query.limit(1).get();

  if (existingTeamSnapshot.empty) {
    let legacyQuery = input.db
      .collection('Teams')
      .where('organizationId', '==', program.organizationId)
      .where('sportName', '==', sportName)
      .where('isActive', '==', true);

    if (level) {
      legacyQuery = legacyQuery.where('level', '==', level) as typeof legacyQuery;
    }

    existingTeamSnapshot = await legacyQuery.limit(1).get();
  }

  const existingDoc = existingTeamSnapshot.docs[0];
  if (existingDoc) {
    return { teamId: existingDoc.id, created: false };
  }

  const teamCode = await generateUniqueTeamCode(input.db);
  const teamName = program.name.trim();

  const team = await teamCodeService.createTeamCode(input.db, {
    teamCode,
    teamName,
    teamType: program.teamType,
    sport: sportName,
    createdBy: input.userId,
    creatorRole: input.role === 'recruiter' ? 'coach' : input.role,
    creatorName:
      [input.updateData.firstName, input.updateData.lastName].filter(Boolean).join(' ') ||
      undefined,
    creatorEmail: input.currentUser?.email?.trim() || undefined,
    creatorPhoneNumber: input.currentUser?.contact?.phone?.trim() || undefined,
    level: level ?? '',
  });

  if (!team.id) {
    throw new Error('Created team is missing an id');
  }

  await input.db.collection('Teams').doc(team.id).update({
    organizationId: program.organizationId,
    isClaimed: false,
    source: 'user_generated',
    updatedAt: new Date().toISOString(),
  });

  await createOrganizationService(input.db)
    .incrementTeamCount(program.organizationId)
    .catch(() => {
      logger.warn('[OnboardingProgramProvisioning] Failed to increment org team count', {
        organizationId: program.organizationId,
      });
    });

  logger.info('[OnboardingProgramProvisioning] Created ghost sport team', {
    teamId: team.id,
    organizationId: program.organizationId,
    sportName,
  });

  return { teamId: team.id, created: true };
}

async function ensureRosterEntry(
  input: ProvisionOnboardingProgramsInput,
  program: ProvisioningProgramRecord,
  teamId: string
): Promise<void> {
  const rosterEntryService = createRosterEntryService(input.db);
  const rosterRole =
    input.role === 'director'
      ? RosterRole.OWNER
      : input.role === 'coach'
        ? RosterRole.HEAD_COACH
        : RosterRole.ATHLETE;

  const rosterStatus =
    input.role === 'director' ? RosterEntryStatus.ACTIVE : RosterEntryStatus.PENDING;

  try {
    await rosterEntryService.createRosterEntry({
      userId: input.userId,
      teamId,
      organizationId: program.organizationId,
      role: rosterRole,
      status: rosterStatus,
      firstName: input.updateData.firstName ?? input.currentUser?.firstName ?? '',
      lastName: input.updateData.lastName ?? input.currentUser?.lastName ?? '',
      email: input.currentUser?.email ?? '',
      profileImg: input.updateData.profileImgs?.[0] ?? input.currentUser?.profileImgs?.[0] ?? '',
      classOf: input.updateData.athlete?.classOf,
    });
  } catch (err) {
    logger.warn('[OnboardingProgramProvisioning] Failed to create roster entry', {
      userId: input.userId,
      teamId,
      error: err,
    });
  }
}

export async function provisionOnboardingPrograms(
  input: ProvisionOnboardingProgramsInput
): Promise<ProvisionOnboardingProgramsResult> {
  const selections = buildProvisioningSelections({
    teamSelection: input.teamSelection,
    createTeamProfile: input.createTeamProfile,
  });

  if (selections.length === 0) {
    return { teamIds: [], createdTeamIds: [], organizationIds: [] };
  }

  const sportsToProvision = getProvisioningSports(input.sports);
  const programs = await resolvePrograms(input, selections);
  const linkedTeamIds = new Set<string>();
  const createdTeamIds = new Set<string>();

  for (const program of programs) {
    for (const sportName of sportsToProvision) {
      try {
        const team = await ensureTeamForSport(input, program, sportName);
        if (!team) {
          continue;
        }

        linkedTeamIds.add(team.teamId);
        if (team.created) {
          createdTeamIds.add(team.teamId);
        }

        await ensureRosterEntry(input, program, team.teamId);
      } catch (err) {
        logger.error('[OnboardingProgramProvisioning] Failed sport team pipeline step', {
          organizationId: program.organizationId,
          sportName,
          error: err,
        });
      }
    }
  }

  return {
    teamIds: Array.from(linkedTeamIds),
    createdTeamIds: Array.from(createdTeamIds),
    organizationIds: Array.from(new Set(programs.map((program) => program.organizationId))),
  };
}
