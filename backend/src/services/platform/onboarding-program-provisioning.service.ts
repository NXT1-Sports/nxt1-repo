import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { SportProfile, TeamTypeApi, UserRole } from '@nxt1/core';
import { RosterEntryStatus } from '@nxt1/core/models';
import * as teamCodeService from '../team/team-code.service.js';
import { createOrganizationService } from '../team/organization.service.js';
import { createRosterEntryService } from '../team/roster-entry.service.js';
import { resolveRosterPositions } from '../team/roster-sport-profile.service.js';
import { normalizeProgramName } from '../core/name-normalizer.service.js';
import { logger } from '../../utils/logger.js';

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
    displayName?: string;
    unicode?: string;
    profileCode?: string;
    email?: string;
    contact?: { phone?: string };
    profileImgs?: string[];
  };
  updateData: {
    firstName?: string;
    lastName?: string;
    unicode?: string;
    profileImgs?: string[];
    coachTitle?: string;
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
  /** Maps lowercase sport name → resolved team/org for backfilling User.sports[].team */
  sportTeamMap: Map<string, { teamId: string; organizationId: string; orgName: string }>;
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

function getRosterTitleForSport(
  sports: readonly SportProfile[],
  sportName: string,
  fallbackTitle?: string
): string | undefined {
  const matchingSport = sports.find(
    (sport) => sport.sport?.toLowerCase() === sportName.toLowerCase()
  );
  const sportTitle = matchingSport?.team?.title?.trim();
  if (sportTitle) {
    return sportTitle;
  }

  const normalizedFallback = fallbackTitle?.trim();
  return normalizedFallback ? normalizedFallback : undefined;
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
    // Location comes from the draft program selection entry (user-provided in onboarding UI)
    // or from the manual createTeamProfile form. Personal geolocation is NEVER used for org location.
    const state = parsedLocation.state || input.createTeamProfile?.state || '';
    const city = parsedLocation.city || input.createTeamProfile?.city || '';
    const teamType = normalizeTeamType(program.teamType || input.createTeamProfile?.teamType);

    if (isDraftProgram) {
      try {
        const normalizedName = await normalizeProgramName(rawName, input.db);
        const isPrivilegedRole = input.role === 'coach' || input.role === 'director';
        const org = await organizationService.createOrganization({
          name: normalizedName,
          type: normalizeProgramType(program.teamType || input.createTeamProfile?.teamType),
          createdBy: input.userId,
          creatorRole: isPrivilegedRole ? (input.role as 'director' | 'coach') : undefined,
          location: {
            address: '',
            city,
            state,
            zipCode: '',
            country: 'USA',
          },
          mascot: input.createTeamProfile?.mascot,
          isClaimed: isPrivilegedRole,
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

    if (input.role === 'coach' || input.role === 'director') {
      try {
        await organizationService.addAdmin({
          organizationId,
          userId: input.userId,
          role: input.role,
          addedBy: input.userId,
        });
      } catch (err) {
        logger.warn('[OnboardingProgramProvisioning] Failed to add as org admin', {
          organizationId,
          role: input.role,
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
  // Team name is "OrgName SportName" (e.g. "Brownsburg Basketball")
  const baseName = program.name.trim();
  const teamName = sportName ? `${baseName} ${sportName}` : baseName;

  const team = await teamCodeService.createTeamCode(input.db, {
    teamCode,
    teamName,
    teamType: program.teamType,
    sport: sportName,
    createdBy: input.userId,
    creatorRole: input.role,
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
    source: 'user_generated',
    updatedAt: FieldValue.serverTimestamp(),
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
  teamId: string,
  sportName: string
): Promise<void> {
  const rosterEntryService = createRosterEntryService(input.db);
  // Directors and coaches are active immediately (they own/manage the program).
  // Only athletes start as pending (require coach approval).
  const rosterStatus =
    input.role === 'athlete' ? RosterEntryStatus.PENDING : RosterEntryStatus.ACTIVE;
  const rosterTitle = getRosterTitleForSport(input.sports, sportName, input.updateData.coachTitle);
  const rosterPositions =
    input.role === 'athlete' ? resolveRosterPositions(input.sports, sportName) : undefined;

  try {
    const existingEntry = await rosterEntryService.getActiveOrPendingRosterEntry(
      input.userId,
      teamId
    );

    if (existingEntry?.id) {
      await rosterEntryService.updateRosterEntry(existingEntry.id, {
        role: input.role,
        sport: sportName,
        status: rosterStatus,
        ...(rosterTitle ? { title: rosterTitle } : {}),
        ...(input.role === 'athlete' ? { positions: rosterPositions ?? [] } : {}),
      });
      return;
    }

    await rosterEntryService.createRosterEntry({
      userId: input.userId,
      teamId,
      organizationId: program.organizationId,
      role: input.role,
      sport: sportName,
      ...(rosterTitle ? { title: rosterTitle } : {}),
      status: rosterStatus,
      ...(input.role === 'athlete' ? { positions: rosterPositions } : {}),
      firstName: input.updateData.firstName ?? input.currentUser?.firstName ?? '',
      lastName: input.updateData.lastName ?? input.currentUser?.lastName ?? '',
      displayName:
        input.currentUser?.displayName ??
        [
          input.updateData.firstName ?? input.currentUser?.firstName ?? '',
          input.updateData.lastName ?? input.currentUser?.lastName ?? '',
        ]
          .map((value) => value.trim())
          .filter(Boolean)
          .join(' '),
      unicode:
        input.currentUser?.unicode?.trim() || input.updateData.unicode?.trim() || input.userId,
      profileCode:
        input.currentUser?.profileCode?.trim() ||
        input.currentUser?.unicode?.trim() ||
        input.updateData.unicode?.trim() ||
        input.userId,
      email: input.currentUser?.email ?? '',
      profileImgs: input.updateData.profileImgs ?? input.currentUser?.profileImgs ?? [],
      classOf: input.updateData.athlete?.classOf,
    });
  } catch (err) {
    logger.warn('[OnboardingProgramProvisioning] Failed to sync roster entry', {
      userId: input.userId,
      teamId,
      error: err,
    });
    throw err;
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
    return {
      teamIds: [],
      createdTeamIds: [],
      organizationIds: [],
      sportTeamMap: new Map(),
    };
  }

  const sportsToProvision = getProvisioningSports(input.sports);
  const programs = await resolvePrograms(input, selections);
  const linkedTeamIds = new Set<string>();
  const createdTeamIds = new Set<string>();
  const sportTeamMap = new Map<
    string,
    { teamId: string; organizationId: string; orgName: string }
  >();

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

        await ensureRosterEntry(input, program, team.teamId, sportName);

        // Track first resolved team per-sport for backfilling User.sports[].team
        const sportKey = sportName.toLowerCase();
        if (!sportTeamMap.has(sportKey)) {
          sportTeamMap.set(sportKey, {
            teamId: team.teamId,
            organizationId: program.organizationId,
            orgName: program.name,
          });
        }
      } catch (err) {
        logger.error('[OnboardingProgramProvisioning] Failed sport team pipeline step', {
          organizationId: program.organizationId,
          sportName,
          error: err,
        });
        throw err;
      }
    }
  }

  return {
    teamIds: Array.from(linkedTeamIds),
    createdTeamIds: Array.from(createdTeamIds),
    organizationIds: Array.from(new Set(programs.map((program) => program.organizationId))),
    sportTeamMap,
  };
}
