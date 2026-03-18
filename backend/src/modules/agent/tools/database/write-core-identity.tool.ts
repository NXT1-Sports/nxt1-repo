/**
 * @fileoverview Write Core Identity Tool — Atomic profile writer for identity data
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Focused database tool that writes distilled identity data to the User doc.
 * Designed to receive data from `read_distilled_section` after a distiller has
 * pre-processed the raw platform JSON.
 *
 * Handles: identity (name, bio, height, weight, classOf, location), academics,
 * sportInfo (positions, jersey, side), team, clubTeam, coach, awards, teamHistory.
 *
 * All data is merged — never overwrites existing data that wasn't provided.
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { TeamTypeApi } from '@nxt1/core';
import { BaseTool, type ToolResult } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import { normalizeProgramType } from '../../../../services/onboarding-program-provisioning.service.js';
import { createOrganizationService } from '../../../../services/organization.service.js';
import { invalidateTeamCache } from '../../../../services/team-code.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { ContextBuilder } from '../../memory/context-builder.js';
import { invalidateProfileCaches } from '../../../../routes/profile.routes.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const USERS_COLLECTION = 'Users';

const VALIDATION = {
  MIN_GRADUATION_YEAR: new Date().getFullYear() - 2,
  MAX_GRADUATION_YEAR: new Date().getFullYear() + 8,
  MAX_ABOUT_ME_LENGTH: 2000,
  MAX_NAME_LENGTH: 100,
  MAX_POSITIONS: 5,
  MAX_AWARDS: 50,
  MAX_TEAM_HISTORY: 30,
} as const;

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteCoreIdentityTool extends BaseTool {
  readonly name = 'write_core_identity';

  readonly description =
    "Writes distilled identity data to the athlete's Firestore profile. " +
    'Call this after reading identity, academics, sportInfo, team, coach, and awards ' +
    'sections via read_distilled_section.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID.\n' +
    '- source (required): Platform slug (e.g. "maxpreps", "hudl").\n' +
    '- profileUrl (required): The URL that was scraped.\n' +
    '- faviconUrl (optional): Favicon URL for the platform icon.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- identity (optional): { firstName, lastName, displayName, aboutMe, height, weight, classOf, city, state, country, school }.\n' +
    '- academics (optional): { gpa, weightedGpa, satScore, actScore, classRank, classSize, intendedMajor }.\n' +
    '- sportInfo (optional): { positions, jerseyNumber, side }.\n' +
    '- team (optional): { name, type, mascot, conference, division, logoUrl, primaryColor, secondaryColor }.\n' +
    '- clubTeam (optional): Same shape as team.\n' +
    '- coach (optional): { firstName, lastName, email, phone, title }.\n' +
    '- awards (optional): Array of { title, category, sport, season, issuer, date }.\n' +
    '- teamHistory (optional): Array of { name, type, sport, location, record, startDate, endDate, isCurrent }.';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      source: { type: 'string' },
      profileUrl: { type: 'string' },
      faviconUrl: { type: 'string' },
      targetSport: { type: 'string' },
      identity: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          displayName: { type: 'string' },
          aboutMe: { type: 'string' },
          height: { type: 'string' },
          weight: { type: 'string' },
          classOf: { type: 'number' },
          city: { type: 'string' },
          state: { type: 'string' },
          country: { type: 'string' },
          school: { type: 'string' },
        },
      },
      academics: {
        type: 'object',
        properties: {
          gpa: { type: 'number' },
          weightedGpa: { type: 'number' },
          satScore: { type: 'number' },
          actScore: { type: 'number' },
          classRank: { type: 'number' },
          classSize: { type: 'number' },
          intendedMajor: { type: 'string' },
        },
      },
      sportInfo: {
        type: 'object',
        properties: {
          positions: { type: 'array', items: { type: 'string' } },
          jerseyNumber: { type: ['number', 'string'] },
          side: { type: 'string' },
        },
      },
      team: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          mascot: { type: 'string' },
          conference: { type: 'string' },
          division: { type: 'string' },
          logoUrl: { type: 'string' },
          primaryColor: { type: 'string' },
          secondaryColor: { type: 'string' },
        },
      },
      clubTeam: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          mascot: { type: 'string' },
          conference: { type: 'string' },
          division: { type: 'string' },
          logoUrl: { type: 'string' },
          primaryColor: { type: 'string' },
          secondaryColor: { type: 'string' },
        },
      },
      coach: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['firstName', 'lastName'],
      },
      awards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            category: { type: 'string' },
            sport: { type: 'string' },
            season: { type: 'string' },
            issuer: { type: 'string' },
            date: { type: 'string' },
          },
          required: ['title'],
        },
      },
      teamHistory: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            sport: { type: 'string' },
            location: { type: 'string' },
            record: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            isCurrent: { type: 'boolean' },
          },
          required: ['name'],
        },
      },
    },
    required: ['userId', 'source', 'profileUrl', 'targetSport'],
  } as const;

  override readonly allowedAgents = ['data_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  // ─── Execute ────────────────────────────────────────────────────────────

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');
    const source = this.str(input, 'source');
    if (!source) return this.paramError('source');
    const profileUrl = this.str(input, 'profileUrl');
    if (!profileUrl) return this.paramError('profileUrl');
    const targetSport = this.str(input, 'targetSport');
    if (!targetSport) return this.paramError('targetSport');

    const faviconUrl = this.str(input, 'faviconUrl') ?? undefined;
    const identity = this.obj(input, 'identity');
    const academics = this.obj(input, 'academics');
    const sportInfo = this.obj(input, 'sportInfo');
    const team = this.obj(input, 'team');
    const clubTeam = this.obj(input, 'clubTeam');
    const coach = this.obj(input, 'coach');
    const awards = this.arr(input, 'awards');
    const teamHistory = this.arr(input, 'teamHistory');

    // At least one data section must be provided
    if (
      !identity &&
      !academics &&
      !sportInfo &&
      !team &&
      !clubTeam &&
      !coach &&
      !awards &&
      !teamHistory
    ) {
      return {
        success: false,
        error:
          'At least one data section (identity, academics, sportInfo, team, coach, awards, teamHistory) is required.',
      };
    }

    const userRef = this.db.collection(USERS_COLLECTION).doc(userId);

    try {
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return { success: false, error: `User "${userId}" not found.` };
      }

      const userData = userDoc.data() as Record<string, unknown>;
      const rawSports = userData['sports'];
      const existingSports: Record<string, unknown>[] = Array.isArray(rawSports)
        ? (rawSports as Record<string, unknown>[])
        : rawSports && typeof rawSports === 'object'
          ? (Object.values(rawSports) as Record<string, unknown>[])
          : [];
      const now = new Date().toISOString();

      const payload: Record<string, unknown> = {};
      const writtenSections: string[] = [];

      // ── Identity fields ──────────────────────────────────────────────
      if (identity) {
        this.mergeIdentity(identity, payload, writtenSections);
      }

      // ── Academics ────────────────────────────────────────────────────
      if (academics) {
        const existingAcademics = (userData['academics'] ?? {}) as Record<string, unknown>;
        const sanitized = this.sanitizeAcademics(academics);
        if (Object.keys(sanitized).length > 0) {
          payload['academics'] = { ...existingAcademics, ...sanitized };
          writtenSections.push('academics');
        }
      }

      // ── Sport-scoped data ────────────────────────────────────────────
      const sportIndex = this.resolveSportIndex(existingSports, targetSport);
      const isNewSport = sportIndex >= existingSports.length;

      if (isNewSport) {
        const newSport = this.buildNewSportProfile(
          targetSport,
          sportInfo,
          team,
          clubTeam,
          coach,
          now,
          existingSports.length
        );
        payload['sports'] = [...existingSports, newSport];
        writtenSections.push(`sports[NEW:${targetSport}]`);
      } else if (sportInfo || team || clubTeam || coach) {
        const updatedSports = existingSports.map((s) => ({ ...s }));
        const sportObj = { ...(updatedSports[sportIndex] ?? {}) } as Record<string, unknown>;

        if (sportInfo) {
          const positions = this.arr(sportInfo, 'positions');
          if (positions?.length) sportObj['positions'] = positions;
          const jersey = sportInfo['jerseyNumber'];
          if (jersey !== undefined && jersey !== null) sportObj['jerseyNumber'] = jersey;
          const side = this.str(sportInfo, 'side');
          if (side) sportObj['side'] = side;
          writtenSections.push('sportInfo');
        }

        if (team) {
          const existingTeam = (sportObj['team'] ?? {}) as Record<string, unknown>;
          sportObj['team'] = this.mergeTeamRef(existingTeam, team);
          writtenSections.push('team');
        }

        if (clubTeam) {
          const existingClub = (sportObj['clubTeam'] ?? {}) as Record<string, unknown>;
          sportObj['clubTeam'] = this.mergeTeamRef(existingClub, clubTeam);
          writtenSections.push('clubTeam');
        }

        if (coach) {
          sportObj['coach'] = this.sanitizeCoach(coach);
          writtenSections.push('coach');
        }

        sportObj['updatedAt'] = now;
        updatedSports[sportIndex] = sportObj;
        payload['sports'] = updatedSports;
      }

      // ── Awards ───────────────────────────────────────────────────────
      if (awards?.length) {
        const existingAwards = (userData['awards'] ?? []) as Record<string, unknown>[];
        payload['awards'] = this.mergeAwards(
          existingAwards,
          awards as Record<string, unknown>[],
          targetSport
        );
        writtenSections.push('awards');
      }

      // ── Team History ─────────────────────────────────────────────────
      if (teamHistory?.length) {
        const existingHistory = (userData['teamHistory'] ?? []) as Record<string, unknown>[];
        payload['teamHistory'] = this.mergeTeamHistory(
          existingHistory,
          teamHistory as Record<string, unknown>[],
          targetSport
        );
        writtenSections.push('teamHistory');
      }

      // ── Connected source sync record ─────────────────────────────────
      payload['connectedSources'] = this.buildConnectedSourcesUpdate(
        (userData['connectedSources'] ?? []) as Record<string, unknown>[],
        source,
        profileUrl,
        targetSport,
        now,
        faviconUrl
      );

      // Clean up legacy flat fields if team data was written
      if (team || clubTeam) {
        payload['conference'] = FieldValue.delete();
        payload['division'] = FieldValue.delete();
        payload['level'] = FieldValue.delete();
      }

      payload['updatedAt'] = FieldValue.serverTimestamp();

      if (writtenSections.length === 0) {
        return { success: false, error: 'No actionable fields were provided.' };
      }

      // ── Sync Team/Organization metadata ──────────────────────────────
      const resolvedSportIndex = isNewSport ? existingSports.length : sportIndex;
      const nextSports = Array.isArray(payload['sports'])
        ? (payload['sports'] as Record<string, unknown>[])
        : existingSports;
      const resolvedSport = nextSports[resolvedSportIndex] as Record<string, unknown> | undefined;

      if (team) {
        await this.syncTeamMetadata(
          resolvedSport?.['team'] as Record<string, unknown> | undefined,
          team,
          'team'
        );
      }
      if (clubTeam) {
        await this.syncTeamMetadata(
          resolvedSport?.['clubTeam'] as Record<string, unknown> | undefined,
          clubTeam,
          'clubTeam'
        );
      }

      // ── Write ────────────────────────────────────────────────────────
      await userRef.update(payload);

      // ── Cache invalidation ───────────────────────────────────────────
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
          invalidateProfileCaches(
            userId,
            typeof userData['username'] === 'string' ? userData['username'] : undefined,
            typeof userData['unicode'] === 'string' ? userData['unicode'] : null
          ),
        ]);
        const contextBuilder = new ContextBuilder();
        await contextBuilder.invalidateContext(userId);
      } catch {
        // Best-effort
      }

      return {
        success: true,
        data: {
          userId,
          source,
          profileUrl,
          targetSport,
          sportIndex: resolvedSportIndex,
          isNewSport,
          writtenSections,
          sectionCount: writtenSections.length,
          message: `Wrote ${writtenSections.length} section(s) for "${targetSport}" from "${source}": ${writtenSections.join(', ')}.`,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write core identity',
      };
    }
  }

  // ─── Merge Helpers ──────────────────────────────────────────────────────

  private mergeIdentity(
    id: Record<string, unknown>,
    payload: Record<string, unknown>,
    written: string[]
  ): void {
    const fields: Array<[string, string]> = [
      ['firstName', 'firstName'],
      ['lastName', 'lastName'],
      ['displayName', 'displayName'],
      ['aboutMe', 'aboutMe'],
      ['height', 'height'],
      ['weight', 'weight'],
    ];
    for (const [src, dst] of fields) {
      const val = this.str(id, src);
      if (val && val.length <= VALIDATION.MAX_NAME_LENGTH) {
        payload[dst] = val;
        written.push(dst);
      }
    }
    // aboutMe has a longer limit
    const aboutMe = this.str(id, 'aboutMe');
    if (aboutMe && aboutMe.length <= VALIDATION.MAX_ABOUT_ME_LENGTH) {
      payload['aboutMe'] = aboutMe;
      if (!written.includes('aboutMe')) written.push('aboutMe');
    }

    const classOf = id['classOf'];
    if (
      typeof classOf === 'number' &&
      Number.isInteger(classOf) &&
      classOf >= VALIDATION.MIN_GRADUATION_YEAR &&
      classOf <= VALIDATION.MAX_GRADUATION_YEAR
    ) {
      payload['classOf'] = classOf;
      written.push('classOf');
    }

    // Location
    const city = this.str(id, 'city');
    const state = this.str(id, 'state');
    const country = this.str(id, 'country');
    if (city || state || country) {
      const loc: Record<string, string> = {};
      if (city) loc['city'] = city;
      if (state) loc['state'] = state;
      if (country) loc['country'] = country;
      payload['location'] = loc;
      written.push('location');
    }
  }

  private sanitizeAcademics(a: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const numField = (key: string, min: number, max: number) => {
      const val = a[key];
      if (typeof val === 'number' && val >= min && val <= max) result[key] = val;
    };
    numField('gpa', 0, 5);
    numField('weightedGpa', 0, 6);
    numField('satScore', 400, 1600);
    numField('actScore', 1, 36);
    numField('classRank', 1, 10000);
    numField('classSize', 1, 10000);
    const major = this.str(a, 'intendedMajor');
    if (major) result['intendedMajor'] = major;
    return result;
  }

  private buildNewSportProfile(
    targetSport: string,
    sportInfo: Record<string, unknown> | null,
    team: Record<string, unknown> | null,
    clubTeam: Record<string, unknown> | null,
    coach: Record<string, unknown> | null,
    now: string,
    order: number
  ): Record<string, unknown> {
    const profile: Record<string, unknown> = {
      sport: targetSport,
      order,
      accountType: 'free',
      createdAt: now,
      updatedAt: now,
    };

    if (sportInfo) {
      const positions = this.arr(sportInfo, 'positions');
      if (positions?.length) profile['positions'] = positions;
      const jersey = sportInfo['jerseyNumber'];
      if (jersey !== undefined && jersey !== null) profile['jerseyNumber'] = jersey;
      const side = this.str(sportInfo, 'side');
      if (side) profile['side'] = side;
    }

    if (team) profile['team'] = this.mergeTeamRef(undefined, team);
    if (clubTeam) profile['clubTeam'] = this.mergeTeamRef(undefined, clubTeam);
    if (coach) profile['coach'] = this.sanitizeCoach(coach);

    return profile;
  }

  private resolveSportIndex(
    existingSports: Record<string, unknown>[],
    targetSport: string
  ): number {
    const normalized = targetSport.toLowerCase().trim();
    for (let i = 0; i < existingSports.length; i++) {
      if (
        typeof existingSports[i]['sport'] === 'string' &&
        (existingSports[i]['sport'] as string).toLowerCase().trim() === normalized
      ) {
        return i;
      }
    }
    return existingSports.length;
  }

  private mergeTeamRef(
    existing: Record<string, unknown> | undefined,
    team: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    // Preserve existing IDs
    for (const key of ['teamId', 'organizationId', 'teamCode', 'updatedAt']) {
      const val = existing?.[key];
      if (val !== undefined && val !== null && val !== '') result[key] = val;
    }
    // Write only the lightweight fields to the User doc
    const name = this.str(team, 'name');
    if (name) result['name'] = name;
    const type = this.str(team, 'type');
    if (type) result['type'] = type;
    return result;
  }

  private sanitizeCoach(coach: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const first = this.str(coach, 'firstName');
    const last = this.str(coach, 'lastName');
    if (first) result['firstName'] = first;
    if (last) result['lastName'] = last;
    const email = this.str(coach, 'email');
    if (email) result['email'] = email;
    const phone = this.str(coach, 'phone');
    if (phone) result['phone'] = phone;
    const title = this.str(coach, 'title');
    if (title) result['title'] = title;
    return result;
  }

  private mergeAwards(
    existing: Record<string, unknown>[],
    incoming: Record<string, unknown>[],
    defaultSport: string
  ): Record<string, unknown>[] {
    if (incoming.length > VALIDATION.MAX_AWARDS) return existing;
    const merged = [...existing];
    const keyOf = (a: Record<string, unknown>) => {
      const title = String(a['title'] ?? '')
        .toLowerCase()
        .trim();
      const sport = String(a['sport'] ?? defaultSport)
        .toLowerCase()
        .trim();
      const season = String(a['season'] ?? '')
        .toLowerCase()
        .trim();
      return `${title}::${sport}::${season}`;
    };
    const indexMap = new Map<string, number>();
    for (let i = 0; i < merged.length; i++) indexMap.set(keyOf(merged[i]), i);

    for (const entry of incoming) {
      const title = this.str(entry, 'title');
      if (!title) continue;
      const record: Record<string, unknown> = {
        title,
        sport: this.str(entry, 'sport') ?? defaultSport,
      };
      for (const f of ['category', 'season', 'issuer', 'date']) {
        const v = this.str(entry, f);
        if (v) record[f] = v;
      }
      const key = keyOf(record);
      const idx = indexMap.get(key);
      if (idx !== undefined) {
        merged[idx] = { ...merged[idx], ...record };
      } else {
        indexMap.set(key, merged.length);
        merged.push(record);
      }
    }
    return merged;
  }

  private mergeTeamHistory(
    existing: Record<string, unknown>[],
    incoming: Record<string, unknown>[],
    defaultSport: string
  ): Record<string, unknown>[] {
    if (incoming.length > VALIDATION.MAX_TEAM_HISTORY) return existing;
    const merged = [...existing];
    const keyOf = (t: Record<string, unknown>) => {
      const name = String(t['name'] ?? '')
        .toLowerCase()
        .trim();
      const sport = String(t['sport'] ?? defaultSport)
        .toLowerCase()
        .trim();
      const start = String(t['startDate'] ?? '')
        .toLowerCase()
        .trim();
      return `${name}::${sport}::${start}`;
    };
    const indexMap = new Map<string, number>();
    for (let i = 0; i < merged.length; i++) indexMap.set(keyOf(merged[i]), i);

    for (const entry of incoming) {
      const name = this.str(entry, 'name');
      if (!name) continue;
      const record: Record<string, unknown> = {
        name,
        sport: this.str(entry, 'sport') ?? defaultSport,
      };
      for (const f of ['type', 'location', 'record', 'startDate', 'endDate']) {
        const v = this.str(entry, f);
        if (v) record[f] = v;
      }
      if (entry['isCurrent'] !== undefined) record['isCurrent'] = !!entry['isCurrent'];
      const key = keyOf(record);
      const idx = indexMap.get(key);
      if (idx !== undefined) {
        merged[idx] = { ...merged[idx], ...record };
      } else {
        indexMap.set(key, merged.length);
        merged.push(record);
      }
    }
    return merged;
  }

  private buildConnectedSourcesUpdate(
    existing: Record<string, unknown>[],
    platform: string,
    profileUrl: string,
    scopeId: string,
    now: string,
    faviconUrl?: string
  ): Record<string, unknown>[] {
    const updated = [...existing];
    const matchIndex = updated.findIndex(
      (cs) => cs['platform'] === platform && cs['scopeId'] === scopeId
    );
    const record: Record<string, unknown> = {
      platform,
      profileUrl,
      lastSyncedAt: now,
      syncStatus: 'success',
      scopeType: 'sport',
      scopeId,
      ...(faviconUrl && { faviconUrl }),
    };
    if (matchIndex >= 0) {
      updated[matchIndex] = { ...updated[matchIndex], ...record };
    } else {
      updated.push(record);
    }
    return updated;
  }

  // ─── Team/Org Metadata Sync ─────────────────────────────────────────────

  private async syncTeamMetadata(
    teamRef: Record<string, unknown> | undefined,
    teamInput: Record<string, unknown>,
    relationKind: 'team' | 'clubTeam'
  ): Promise<void> {
    const teamId = this.str(teamRef ?? {}, 'teamId');
    const orgIdFromRef = this.str(teamRef ?? {}, 'organizationId');
    let organizationId = orgIdFromRef;
    let existingTeamType: string | undefined;

    if (teamId) {
      const teamDoc = await this.db.collection('Teams').doc(teamId).get();
      if (teamDoc.exists) {
        const data = teamDoc.data() ?? {};
        const teamCode = typeof data['teamCode'] === 'string' ? data['teamCode'] : undefined;
        const teamUnicode = typeof data['unicode'] === 'string' ? data['unicode'] : undefined;
        existingTeamType = typeof data['teamType'] === 'string' ? data['teamType'] : undefined;
        organizationId ||=
          typeof data['organizationId'] === 'string' ? data['organizationId'] : null;

        const programType = this.inferProgramType(teamInput, relationKind, existingTeamType);
        const updateData: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
        if (programType !== existingTeamType) updateData['teamType'] = programType;
        const conf = this.str(teamInput, 'conference');
        if (conf) updateData['conference'] = conf;
        const div = this.str(teamInput, 'division');
        if (div) updateData['division'] = div;

        if (Object.keys(updateData).length > 1) {
          await this.db.collection('Teams').doc(teamId).update(updateData);
          await invalidateTeamCache(teamId, teamCode, teamUnicode);
        }

        await this.syncOrganizationMetadata(organizationId, teamInput, programType);
        return;
      }
    }

    await this.syncOrganizationMetadata(
      organizationId,
      teamInput,
      this.inferProgramType(teamInput, relationKind, existingTeamType)
    );
  }

  private async syncOrganizationMetadata(
    organizationId: string | null,
    teamInput: Record<string, unknown>,
    programType: TeamTypeApi
  ): Promise<void> {
    if (!organizationId) return;

    const branding: Record<string, unknown> = {};
    for (const key of ['mascot', 'logoUrl', 'primaryColor', 'secondaryColor']) {
      const val = this.str(teamInput, key);
      if (val) branding[key] = val;
    }

    const updateData: Record<string, unknown> = { type: programType, ...branding };
    if (Object.keys(updateData).length === 0) return;

    const organizationService = createOrganizationService(this.db);
    await organizationService.updateOrganization(organizationId, updateData, 'agent-x-scraper');
  }

  private inferProgramType(
    team: Record<string, unknown>,
    relationKind: 'team' | 'clubTeam',
    existingType?: string
  ): TeamTypeApi {
    const explicit = this.parseProgramType(this.str(team, 'programType') ?? this.str(team, 'type'));
    if (explicit) return normalizeProgramType(explicit);

    const name = `${team['name'] ?? ''} ${team['type'] ?? ''}`.toLowerCase();
    if (relationKind === 'clubTeam' || /(travel|aau|academy|elite|club)/.test(name)) return 'club';
    if (/(high school|\bhs\b|varsity|junior varsity|\bjv\b|freshman|prep)/.test(name))
      return 'high-school';
    if (/(middle school|\bms\b)/.test(name)) return 'middle-school';
    if (/(juco|junior college|community college)/.test(name)) return 'juco';
    if (/(college|university|ncaa|naia)/.test(name)) return 'college';

    return this.parseProgramType(existingType) ?? 'organization';
  }

  private parseProgramType(value?: string | null): TeamTypeApi | null {
    if (!value) return null;
    const n = value.trim().toLowerCase();
    const map: Record<string, TeamTypeApi> = {
      'high-school': 'high-school',
      'high school': 'high-school',
      school: 'high-school',
      hs: 'high-school',
      'middle-school': 'middle-school',
      'middle school': 'middle-school',
      ms: 'middle-school',
      club: 'club',
      travel: 'club',
      'travel-ball': 'club',
      aau: 'club',
      academy: 'club',
      elite: 'club',
      college: 'college',
      university: 'college',
      ncaa: 'college',
      naia: 'college',
      juco: 'juco',
      'junior college': 'juco',
      'community college': 'juco',
      organization: 'organization',
    };
    return map[n] ?? null;
  }
}
