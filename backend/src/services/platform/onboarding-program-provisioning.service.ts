import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { SportProfile, TeamTypeApi, UserRole } from '@nxt1/core';
import { RosterEntryStatus } from '@nxt1/core/models';
import { buildTeamSlug } from '../team/team-code.service.js';
import { createOrganizationService } from '../team/organization.service.js';
import { createRosterEntryService } from '../team/roster-entry.service.js';
import { resolveRosterPositions } from '../team/roster-sport-profile.service.js';
import { normalizeProgramName } from '../core/name-normalizer.service.js';
import { logger } from '../../utils/logger.js';
import { initOrganizationBillingTargetForUser } from '../../modules/billing/budget.service.js';

type ProgramType = 'high-school' | 'middle-school' | 'club' | 'college' | 'juco' | 'organization';

const PROVISIONING_LOCKS_COLLECTION = 'ProvisioningLocks';

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
  membershipTransitions: Array<{
    teamId: string;
    organizationId: string;
    sport: string;
    pending: boolean;
  }>;
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

function normalizeLookupValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function getTeamSportLookupValue(data: FirebaseFirestore.DocumentData): string {
  return normalizeLookupValue(data['sport']) || normalizeLookupValue(data['sportName']);
}

function doesTeamLevelMatch(data: FirebaseFirestore.DocumentData, requestedLevel: string): boolean {
  const teamLevel = normalizeLookupValue(data['level']);
  return requestedLevel ? teamLevel === requestedLevel : teamLevel.length === 0;
}

function doesTeamMatchSportAndLevel(
  data: FirebaseFirestore.DocumentData,
  normalizedSportName: string,
  requestedLevel: string
): boolean {
  return (
    data['isActive'] === true &&
    getTeamSportLookupValue(data) === normalizedSportName &&
    doesTeamLevelMatch(data, requestedLevel)
  );
}

function buildProvisioningLockId(
  kind: 'organization' | 'team',
  parts: readonly (string | undefined)[]
): string {
  const normalized = parts.map((part) => normalizeLookupValue(part)).join('|');
  const digest = createHash('sha256').update(normalized).digest('hex');
  return `${kind}_${digest}`;
}

function getOrganizationLocationValue(
  data: FirebaseFirestore.DocumentData,
  field: 'city' | 'state'
): string {
  const location = data['location'];
  if (!location || typeof location !== 'object') {
    return '';
  }

  return normalizeLookupValue((location as Record<string, unknown>)[field]);
}

function isProvisionableOrganizationCandidate(data: FirebaseFirestore.DocumentData): boolean {
  const status = normalizeLookupValue(data['status']);
  return (
    data['isActive'] !== false &&
    status !== 'merged' &&
    status !== 'inactive' &&
    status !== 'suspended'
  );
}

function scoreOrganizationCandidate(data: FirebaseFirestore.DocumentData): number {
  let score = 0;
  if (data['isClaimed'] === true) score += 4;
  if (typeof data['ownerId'] === 'string' && data['ownerId'].trim().length > 0) score += 3;
  if (Array.isArray(data['admins']) && data['admins'].length > 0) score += 3;
  if (typeof data['teamCount'] === 'number') score += Math.min(data['teamCount'], 3);
  return score;
}

function chooseOrganizationCandidate(
  docs: readonly FirebaseFirestore.QueryDocumentSnapshot[],
  input: { nameLower: string; teamType: TeamTypeApi; city: string; state: string }
): FirebaseFirestore.QueryDocumentSnapshot | null {
  const matches = docs.filter((doc) => {
    const data = doc.data();
    if (!isProvisionableOrganizationCandidate(data)) {
      return false;
    }

    const docNameLower = normalizeLookupValue(data['nameLower'] ?? data['name']);
    if (docNameLower !== input.nameLower) {
      return false;
    }

    const docType = normalizeLookupValue(data['type'] ?? 'organization');
    if (input.teamType && docType && docType !== normalizeLookupValue(input.teamType)) {
      return false;
    }

    if (input.state && getOrganizationLocationValue(data, 'state') !== input.state) {
      return false;
    }

    if (input.city && getOrganizationLocationValue(data, 'city') !== input.city) {
      return false;
    }

    return true;
  });

  if (matches.length === 0) {
    return null;
  }

  matches.sort(
    (left, right) =>
      scoreOrganizationCandidate(right.data()) - scoreOrganizationCandidate(left.data())
  );
  return matches[0] ?? null;
}

function scoreTeamCandidate(data: FirebaseFirestore.DocumentData): number {
  let score = 0;
  if (typeof data['panelMember'] === 'number') score += data['panelMember'];
  if (typeof data['athleteMember'] === 'number') score += data['athleteMember'];
  if (Array.isArray(data['memberIds'])) score += data['memberIds'].length;
  if (typeof data['slug'] === 'string' && data['slug'].trim().length > 0) score += 1;
  return score;
}

function chooseTeamCandidate(
  docs: readonly FirebaseFirestore.QueryDocumentSnapshot[],
  normalizedSportName: string,
  requestedLevel: string
): FirebaseFirestore.QueryDocumentSnapshot | null {
  const matches = docs.filter((doc) =>
    doesTeamMatchSportAndLevel(doc.data(), normalizedSportName, requestedLevel)
  );

  if (matches.length === 0) {
    return null;
  }

  matches.sort((left, right) => scoreTeamCandidate(right.data()) - scoreTeamCandidate(left.data()));
  return matches[0] ?? null;
}

async function generateUniqueTeamCodeInTransaction(
  db: Firestore,
  transaction: FirebaseFirestore.Transaction
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
    const existing = await transaction.get(
      db.collection('Teams').where('teamCode', '==', candidate).limit(1)
    );
    if (existing.empty) {
      return candidate;
    }
  }

  return `${Date.now().toString(36).slice(-6)}`.toUpperCase();
}

async function generateUniqueTeamSlugInTransaction(
  db: Firestore,
  transaction: FirebaseFirestore.Transaction,
  teamName: string
): Promise<string> {
  const base = buildTeamSlug(teamName);
  if (!base) {
    throw new Error('Team name produces an empty slug');
  }

  const existingBase = await transaction.get(
    db.collection('Teams').where('slug', '==', base).limit(1)
  );
  if (existingBase.empty) {
    return base;
  }

  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${base}-${index}`;
    const existing = await transaction.get(
      db.collection('Teams').where('slug', '==', candidate).limit(1)
    );
    if (existing.empty) {
      return candidate;
    }
  }

  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

async function ensureDraftProgramOrganization(
  input: ProvisionOnboardingProgramsInput,
  program: OnboardingProgramSelection,
  teamType: TeamTypeApi,
  city: string,
  state: string,
  rawName: string
): Promise<(ProvisioningProgramRecord & { created: boolean }) | null> {
  const normalizedName = await normalizeProgramName(rawName, input.db);
  const nameLower = normalizeLookupValue(normalizedName);
  const cityLower = normalizeLookupValue(city);
  const stateLower = normalizeLookupValue(state);
  const isPrivilegedRole = input.role === 'coach' || input.role === 'director';
  const lockRef = input.db
    .collection(PROVISIONING_LOCKS_COLLECTION)
    .doc(buildProvisioningLockId('organization', [nameLower, teamType, cityLower, stateLower]));

  let resolved: (ProvisioningProgramRecord & { created: boolean }) | null = null;

  await input.db.runTransaction(async (transaction) => {
    const lockSnap = await transaction.get(lockRef);
    const lockedOrganizationId = normalizeLookupValue(lockSnap.data()?.['organizationId']);

    if (lockedOrganizationId) {
      const lockedOrgRef = input.db.collection('Organizations').doc(lockedOrganizationId);
      const lockedOrgSnap = await transaction.get(lockedOrgRef);
      if (lockedOrgSnap.exists) {
        const data = lockedOrgSnap.data() ?? {};
        resolved = {
          organizationId: lockedOrgSnap.id,
          name: (data['name'] as string) ?? normalizedName,
          teamType,
          city,
          state,
          created: false,
        };
        return;
      }
    }

    const existingOrganizations = await transaction.get(
      input.db.collection('Organizations').where('nameLower', '==', nameLower).limit(20)
    );
    const existingOrg = chooseOrganizationCandidate(existingOrganizations.docs, {
      nameLower,
      teamType,
      city: cityLower,
      state: stateLower,
    });

    if (existingOrg) {
      const data = existingOrg.data();
      transaction.set(lockRef, {
        kind: 'organization',
        organizationId: existingOrg.id,
        nameLower,
        teamType,
        city: cityLower,
        state: stateLower,
        updatedAt: FieldValue.serverTimestamp(),
      });

      resolved = {
        organizationId: existingOrg.id,
        name: (data['name'] as string) ?? normalizedName,
        teamType,
        city,
        state,
        created: false,
      };
      return;
    }

    const organizationRef = input.db.collection('Organizations').doc();
    const admins =
      !input.role || !isPrivilegedRole || !input.userId || program.isDraft === false
        ? []
        : [
            {
              userId: input.userId,
              role: input.role,
              addedAt: new Date(),
            },
          ];

    transaction.set(organizationRef, {
      name: normalizedName,
      nameLower,
      type: normalizeProgramType(program.teamType || input.createTeamProfile?.teamType),
      status: 'active',
      location: {
        address: '',
        city,
        state,
        zipCode: '',
        country: 'USA',
      },
      logoUrl: null,
      primaryColor: null,
      secondaryColor: null,
      mascot: input.createTeamProfile?.mascot ?? null,
      level: null,
      admins,
      ownerId: admins.length > 0 ? input.userId : '',
      isClaimed: isPrivilegedRole,
      source: 'user_generated',
      teamCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: input.userId || '',
    });

    transaction.set(lockRef, {
      kind: 'organization',
      organizationId: organizationRef.id,
      nameLower,
      teamType,
      city: cityLower,
      state: stateLower,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    resolved = {
      organizationId: organizationRef.id,
      name: normalizedName,
      teamType,
      city,
      state,
      created: true,
    };
  });

  if (!resolved) {
    return null;
  }

  const resolvedProgram = resolved as ProvisioningProgramRecord & { created: boolean };

  if (isPrivilegedRole) {
    if (!resolvedProgram.created) {
      try {
        await createOrganizationService(input.db).addAdmin({
          organizationId: resolvedProgram.organizationId,
          userId: input.userId,
          role: input.role as 'director' | 'coach',
          addedBy: input.userId,
        });
      } catch (err) {
        logger.warn('[OnboardingProgramProvisioning] Failed to add as org admin after org reuse', {
          organizationId: resolvedProgram.organizationId,
          role: input.role,
          error: err,
        });
      }
    }

    try {
      await initOrganizationBillingTargetForUser(
        input.db,
        input.userId,
        resolvedProgram.organizationId
      );
    } catch (billingErr) {
      logger.warn(
        '[OnboardingProgramProvisioning] Failed to set org billing target after org provisioning',
        {
          error: billingErr,
          userId: input.userId,
          organizationId: resolvedProgram.organizationId,
        }
      );
    }
  }

  if (resolvedProgram.created) {
    logger.info('[OnboardingProgramProvisioning] Created ghost program', {
      organizationId: resolvedProgram.organizationId,
      name: resolvedProgram.name,
    });
  }

  return resolvedProgram;
}

async function ensureProvisionedTeamForSport(
  input: ProvisionOnboardingProgramsInput,
  program: ProvisioningProgramRecord,
  sportName: string,
  level?: string
): Promise<{ teamId: string; created: boolean } | null> {
  const normalizedSportName = normalizeLookupValue(sportName);
  const requestedLevel = normalizeLookupValue(level);

  if (!normalizedSportName) {
    return null;
  }

  const lockRef = input.db
    .collection(PROVISIONING_LOCKS_COLLECTION)
    .doc(
      buildProvisioningLockId('team', [program.organizationId, normalizedSportName, requestedLevel])
    );

  let resolved: { teamId: string; created: boolean } | null = null;

  await input.db.runTransaction(async (transaction) => {
    const lockSnap = await transaction.get(lockRef);
    const lockedTeamId = normalizeLookupValue(lockSnap.data()?.['teamId']);

    if (lockedTeamId) {
      const lockedTeamRef = input.db.collection('Teams').doc(lockedTeamId);
      const lockedTeamSnap = await transaction.get(lockedTeamRef);
      if (lockedTeamSnap.exists) {
        resolved = { teamId: lockedTeamSnap.id, created: false };
        return;
      }
    }

    const teamsSnapshot = await transaction.get(
      input.db.collection('Teams').where('organizationId', '==', program.organizationId)
    );
    const existingTeam = chooseTeamCandidate(
      teamsSnapshot.docs,
      normalizedSportName,
      requestedLevel
    );

    if (existingTeam) {
      transaction.set(lockRef, {
        kind: 'team',
        organizationId: program.organizationId,
        teamId: existingTeam.id,
        sport: normalizedSportName,
        level: requestedLevel,
        updatedAt: FieldValue.serverTimestamp(),
      });
      resolved = { teamId: existingTeam.id, created: false };
      return;
    }

    const baseName = program.name.trim();
    const teamName = sportName ? `${baseName} ${sportName}` : baseName;
    const teamRef = input.db.collection('Teams').doc();
    const teamCode = await generateUniqueTeamCodeInTransaction(input.db, transaction);
    const slug = await generateUniqueTeamSlugInTransaction(input.db, transaction, teamName);

    transaction.set(teamRef, {
      teamCode: teamCode.toUpperCase(),
      teamName,
      teamType: program.teamType,
      sport: sportName,
      slug,
      athleteMember: 0,
      panelMember: 0,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      level: level ?? '',
      division: '',
      conference: '',
      organizationId: program.organizationId,
      source: 'user_generated',
      createdBy: input.userId,
    });

    transaction.update(input.db.collection('Organizations').doc(program.organizationId), {
      teamCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.set(lockRef, {
      kind: 'team',
      organizationId: program.organizationId,
      teamId: teamRef.id,
      sport: normalizedSportName,
      level: requestedLevel,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    resolved = { teamId: teamRef.id, created: true };
  });

  const resolvedTeam = resolved as { teamId: string; created: boolean } | null;

  if (resolvedTeam?.created) {
    logger.info('[OnboardingProgramProvisioning] Created ghost sport team', {
      teamId: resolvedTeam.teamId,
      organizationId: program.organizationId,
      sportName,
    });
  }

  return resolvedTeam;
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
        const org = await ensureDraftProgramOrganization(
          input,
          program,
          teamType,
          city,
          state,
          rawName
        );

        if (!org?.organizationId) {
          continue;
        }

        programs.push({
          organizationId: org.organizationId,
          name: org.name,
          teamType,
          city,
          state,
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

      // Set the joined org as the active billing target so that any
      // onboarding-triggered AI jobs (link scrape) are charged to the org
      // wallet instead of the coach/director's personal wallet.
      try {
        await initOrganizationBillingTargetForUser(input.db, input.userId, organizationId);
      } catch (billingErr) {
        logger.warn(
          '[OnboardingProgramProvisioning] Failed to set org billing target after org join',
          { error: billingErr, userId: input.userId, organizationId }
        );
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

  return ensureProvisionedTeamForSport(input, program, sportName, level);
}

async function ensureRosterEntry(
  input: ProvisionOnboardingProgramsInput,
  program: ProvisioningProgramRecord,
  teamId: string,
  sportName: string
): Promise<{ created: boolean; pending: boolean }> {
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
      return {
        created: false,
        pending: rosterStatus === RosterEntryStatus.PENDING,
      };
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
    return {
      created: true,
      pending: rosterStatus === RosterEntryStatus.PENDING,
    };
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
      membershipTransitions: [],
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
  const membershipTransitions: ProvisionOnboardingProgramsResult['membershipTransitions'] = [];

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

        const rosterTransition = await ensureRosterEntry(input, program, team.teamId, sportName);
        if (rosterTransition.created) {
          membershipTransitions.push({
            teamId: team.teamId,
            organizationId: program.organizationId,
            sport: sportName,
            pending: rosterTransition.pending,
          });
        }

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
    membershipTransitions,
  };
}
