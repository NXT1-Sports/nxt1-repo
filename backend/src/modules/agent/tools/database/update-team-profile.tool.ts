/**
 * @fileoverview Update Team Profile Tool — Comprehensive team data writer
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes distilled team profile data from external platform scrapes
 * (MaxPreps, Hudl, etc.) to the Team document and related collections.
 *
 * - Team branding (logo, colors, mascot, description) → Teams/{teamId}
 * - Season record & competitive info → Teams/{teamId}
 * - Social links & contact info → Teams/{teamId}
 * - Location (city, state) → Teams/{teamId}
 * - Roster members → RosterEntries collection (NOT the deprecated Team.members array)
 * - Connected source sync status → Teams/{teamId}.connectedSources
 *
 * Also propagates branding changes (logo, colors, mascot) to the parent
 * Organization document when `organizationId` is present on the Team.
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult } from '../base.tool.js';
import { RosterEntryStatus, RosterRole } from '@nxt1/core/models';
import { getCacheService } from '../../../../services/cache.service.js';
import { invalidateTeamCache } from '../../../../services/team-code.service.js';
import { logger } from '../../../../utils/logger.js';
import { rosterDedupeKey } from './dedup-utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const TEAMS_COLLECTION = 'Teams';
const ORGANIZATIONS_COLLECTION = 'Organizations';
const ROSTER_ENTRIES_COLLECTION = 'RosterEntries';
const MAX_ROSTER_SIZE = 200;

/** Match roster-entry.service.ts cache key format */
const ROSTER_CACHE_KEYS = {
  TEAM_ROSTER: (teamId: string) => `roster:team:${teamId}:members`,
  ORG_MEMBERS: (orgId: string) => `roster:org:${orgId}:members`,
} as const;

// ─── Input Interfaces ──────────────────────────────────────────────────────

interface RosterMemberInput {
  firstName: string;
  lastName: string;
  jerseyNumber?: string;
  positions?: string[];
  primaryPosition?: string;
  classOf?: number;
  height?: string;
  weight?: string;
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class UpdateTeamProfileTool extends BaseTool {
  readonly name = 'update_team_profile';

  readonly description =
    'Update a Team profile with data extracted from an external platform (MaxPreps, Hudl, etc.).\n\n' +
    'Writes team branding, season record, social links, contact info, and location to the Team document.\n' +
    'Roster members are written to the RosterEntries collection (NOT the deprecated Team.members array).\n' +
    'If the team has an organizationId, branding fields are propagated to the parent Organization.\n\n' +
    'Parameters:\n' +
    '- userId (required): Coach user ID who owns the team.\n' +
    '- teamId (required): Team document ID to update.\n' +
    '- source (required): Platform slug (e.g., "maxpreps", "hudl").\n' +
    '- profileUrl (required): URL of the scraped page.\n' +
    '- faviconUrl (optional): Favicon URL of the scraped platform.\n' +
    '- targetSport (required): Sport context (e.g., "football").\n' +
    '- fields (required): Object with extracted data:\n' +
    '  • description, mascot, logoUrl, primaryColor, secondaryColor\n' +
    '  • conference, division, city, state\n' +
    '  • seasonRecord: { wins, losses, ties?, season? }\n' +
    '  • socialLinks: { twitter?, instagram?, facebook?, website?, hudl?, maxpreps? }\n' +
    '  • contactInfo: { email?, phone?, address? }\n' +
    '  • roster: Array of { firstName, lastName, jerseyNumber?, positions?, primaryPosition?, classOf?, height?, weight? }';

  override readonly allowedAgents = ['data_coordinator'] as const;

  readonly isMutation = true;
  readonly category = 'database' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'Coach user ID who owns the team' },
      teamId: { type: 'string', description: 'Team document ID to update' },
      source: { type: 'string', description: 'Platform slug (e.g., "maxpreps", "hudl")' },
      profileUrl: { type: 'string', description: 'URL of the scraped page' },
      faviconUrl: { type: 'string', description: 'Favicon URL of the scraped platform' },
      targetSport: { type: 'string', description: 'Sport context (e.g., "football")' },
      fields: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          mascot: { type: 'string' },
          logoUrl: { type: 'string', description: 'Team logo image URL' },
          primaryColor: { type: 'string', description: 'Hex color (e.g., "#1A2B3C")' },
          secondaryColor: { type: 'string', description: 'Hex color' },
          conference: { type: 'string' },
          division: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          seasonRecord: {
            type: 'object',
            properties: {
              wins: { type: 'number' },
              losses: { type: 'number' },
              ties: { type: 'number' },
              season: { type: 'string' },
            },
          },
          socialLinks: {
            type: 'object',
            properties: {
              twitter: { type: 'string' },
              instagram: { type: 'string' },
              facebook: { type: 'string' },
              website: { type: 'string' },
              hudl: { type: 'string' },
              maxpreps: { type: 'string' },
            },
          },
          contactInfo: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              phone: { type: 'string' },
              address: { type: 'string' },
            },
          },
          roster: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                jerseyNumber: { type: 'string' },
                positions: { type: 'array', items: { type: 'string' } },
                primaryPosition: { type: 'string' },
                classOf: { type: 'number' },
                height: { type: 'string' },
                weight: { type: 'string' },
              },
              required: ['firstName', 'lastName'],
            },
          },
        },
      },
    },
    required: ['userId', 'teamId', 'source', 'profileUrl', 'targetSport', 'fields'],
  } as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    // ── Validate required params ──────────────────────────────────────────
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');
    const teamId = this.str(input, 'teamId');
    if (!teamId) return this.paramError('teamId');
    const source = this.str(input, 'source');
    if (!source) return this.paramError('source');
    const profileUrl = this.str(input, 'profileUrl');
    if (!profileUrl) return this.paramError('profileUrl');
    const targetSport = this.str(input, 'targetSport');
    if (!targetSport) return this.paramError('targetSport');
    const faviconUrl = this.str(input, 'faviconUrl') ?? undefined;

    const fieldsRaw = this.obj(input, 'fields');
    if (!fieldsRaw) return this.paramError('fields');

    try {
      // ── 0. Verify team exists ─────────────────────────────────────────
      const teamRef = this.db.collection(TEAMS_COLLECTION).doc(teamId);
      const teamDoc = await teamRef.get();

      if (!teamDoc.exists) {
        return { success: false, error: `Team "${teamId}" not found.` };
      }

      const teamData = teamDoc.data()!;
      const organizationId =
        typeof teamData['organizationId'] === 'string' ? teamData['organizationId'] : null;
      const now = new Date().toISOString();

      logger.info('[UpdateTeamProfile] Starting team update', { teamId, source, profileUrl });

      // ── 1. Build Team document update ────────────────────────────────
      const teamUpdate = this.buildTeamUpdate(fieldsRaw, now);

      // ── 2. Update connectedSources ───────────────────────────────────
      const existingConnected = (teamData['connectedSources'] as Record<string, unknown>[]) || [];
      teamUpdate['connectedSources'] = this.updateConnectedSources(
        existingConnected,
        source,
        profileUrl,
        faviconUrl,
        fieldsRaw,
        now
      );

      // ── 3. Write Team update ─────────────────────────────────────────
      await teamRef.update(teamUpdate);
      logger.info('[UpdateTeamProfile] Team document updated', {
        teamId,
        fields: Object.keys(teamUpdate).filter((k) => k !== 'connectedSources'),
      });

      // ── 4. Propagate branding to Organization ────────────────────────
      if (organizationId) {
        await this.propagateBrandingToOrg(organizationId, fieldsRaw);
      }

      // ── 5. Write roster to RosterEntries collection ──────────────────
      let rosterWritten = 0;
      const roster = this.arr(fieldsRaw, 'roster') as RosterMemberInput[] | null;
      if (roster && roster.length > 0) {
        rosterWritten = await this.writeRosterEntries(teamId, organizationId ?? '', roster, now);
      }

      // ── 6. Cache invalidation ────────────────────────────────────────
      await this.invalidateCaches(teamId, organizationId, teamData);

      const summary = [
        `Team "${teamId}" updated from ${source}.`,
        teamUpdate['description'] ? 'description' : null,
        teamUpdate['mascot'] ? 'mascot' : null,
        teamUpdate['logoUrl'] ? 'logo' : null,
        teamUpdate['primaryColor'] ? 'colors' : null,
        teamUpdate['seasonRecord'] ? 'season record' : null,
        teamUpdate['socialLinks'] ? 'social links' : null,
        teamUpdate['contactInfo'] ? 'contact info' : null,
        teamUpdate['conference'] || teamUpdate['division'] ? 'classification' : null,
        teamUpdate['city'] || teamUpdate['state'] ? 'location' : null,
        rosterWritten > 0 ? `${rosterWritten} roster members` : null,
      ].filter(Boolean);

      return {
        success: true,
        data: { message: summary.join(' | '), rosterWritten },
      };
    } catch (err) {
      logger.error('[UpdateTeamProfile] Failed', {
        teamId,
        source,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  /**
   * Build the flat update payload for the Team document.
   * Only includes fields that are present and non-empty.
   */
  private buildTeamUpdate(fields: Record<string, unknown>, now: string): Record<string, unknown> {
    const update: Record<string, unknown> = { lastUpdatedStat: now };

    // Direct string fields
    const stringFields: [string, string][] = [
      ['description', 'description'],
      ['mascot', 'mascot'],
      ['logoUrl', 'logoUrl'],
      ['primaryColor', 'primaryColor'],
      ['secondaryColor', 'secondaryColor'],
      ['conference', 'conference'],
      ['division', 'division'],
      ['city', 'city'],
      ['state', 'state'],
    ];

    for (const [inputKey, docKey] of stringFields) {
      const val =
        typeof fields[inputKey] === 'string' && (fields[inputKey] as string).trim()
          ? (fields[inputKey] as string).trim()
          : null;
      if (val) update[docKey] = val;
    }

    // Season record
    const record = fields['seasonRecord'];
    if (record && typeof record === 'object' && !Array.isArray(record)) {
      const r = record as Record<string, unknown>;
      const wins = typeof r['wins'] === 'number' ? r['wins'] : null;
      const losses = typeof r['losses'] === 'number' ? r['losses'] : null;
      if (wins !== null && losses !== null) {
        update['seasonRecord'] = {
          wins,
          losses,
          ties: typeof r['ties'] === 'number' ? r['ties'] : 0,
          ...(typeof r['season'] === 'string' && r['season'] && { season: r['season'] }),
        };
      }
    }

    // Social links
    const social = fields['socialLinks'];
    if (social && typeof social === 'object' && !Array.isArray(social)) {
      const s = social as Record<string, unknown>;
      const links: Record<string, string> = {};
      for (const key of ['twitter', 'instagram', 'facebook', 'website', 'hudl', 'maxpreps']) {
        if (typeof s[key] === 'string' && (s[key] as string).trim()) {
          links[key] = (s[key] as string).trim();
        }
      }
      if (Object.keys(links).length > 0) update['socialLinks'] = links;
    }

    // Contact info
    const contact = fields['contactInfo'];
    if (contact && typeof contact === 'object' && !Array.isArray(contact)) {
      const c = contact as Record<string, unknown>;
      const info: Record<string, string> = {};
      for (const key of ['email', 'phone', 'address']) {
        if (typeof c[key] === 'string' && (c[key] as string).trim()) {
          info[key] = (c[key] as string).trim();
        }
      }
      if (Object.keys(info).length > 0) update['contactInfo'] = info;
    }

    return update;
  }

  /** Update or append connectedSources with sync status. */
  private updateConnectedSources(
    existing: Record<string, unknown>[],
    source: string,
    profileUrl: string,
    faviconUrl: string | undefined,
    fields: Record<string, unknown>,
    now: string
  ): Record<string, unknown>[] {
    const updated = [...existing];
    const sourceLower = source.toLowerCase();
    const idx = updated.findIndex(
      (s) =>
        (typeof s['platform'] === 'string' ? s['platform'].toLowerCase() : '') === sourceLower &&
        s['profileUrl'] === profileUrl
    );

    const syncEntry = {
      platform: source,
      profileUrl,
      syncStatus: 'synced',
      lastSyncedAt: now,
      syncedFields: Object.keys(fields).filter(
        (k) => fields[k] !== undefined && fields[k] !== null
      ),
      ...(faviconUrl && { faviconUrl }),
    };

    if (idx >= 0) {
      updated[idx] = { ...updated[idx], ...syncEntry };
    } else {
      updated.push(syncEntry);
    }

    return updated;
  }

  /**
   * Propagate branding fields (logo, colors, mascot, description, location)
   * to the parent Organization. Only updates fields present in scraped data.
   */
  private async propagateBrandingToOrg(
    orgId: string,
    fields: Record<string, unknown>
  ): Promise<void> {
    const orgUpdate: Record<string, unknown> = {};

    for (const key of ['logoUrl', 'primaryColor', 'secondaryColor', 'mascot', 'description']) {
      if (typeof fields[key] === 'string' && (fields[key] as string).trim()) {
        orgUpdate[key] = (fields[key] as string).trim();
      }
    }

    // Location
    if (typeof fields['city'] === 'string' || typeof fields['state'] === 'string') {
      const location: Record<string, string> = {};
      if (typeof fields['city'] === 'string' && (fields['city'] as string).trim()) {
        location['city'] = (fields['city'] as string).trim();
      }
      if (typeof fields['state'] === 'string' && (fields['state'] as string).trim()) {
        location['state'] = (fields['state'] as string).trim();
      }
      if (Object.keys(location).length > 0) orgUpdate['location'] = location;
    }

    if (Object.keys(orgUpdate).length === 0) return;

    try {
      const orgRef = this.db.collection(ORGANIZATIONS_COLLECTION).doc(orgId);
      const orgDoc = await orgRef.get();
      if (orgDoc.exists) {
        orgUpdate['updatedAt'] = new Date().toISOString();
        await orgRef.update(orgUpdate);
        logger.info('[UpdateTeamProfile] Organization branding propagated', {
          orgId,
          fields: Object.keys(orgUpdate).filter((k) => k !== 'updatedAt'),
        });
      }
    } catch (err) {
      // Non-fatal — org update is best-effort
      logger.warn('[UpdateTeamProfile] Failed to propagate branding to org', { orgId, err });
    }
  }

  /**
   * Write scraped roster members to the RosterEntries collection.
   * Deduplicates by first+last name against existing active/pending entries.
   * Returns count of newly created entries.
   */
  private async writeRosterEntries(
    teamId: string,
    organizationId: string,
    roster: RosterMemberInput[],
    now: string
  ): Promise<number> {
    // Cap roster size to prevent runaway writes
    let capped = roster;
    if (roster.length > MAX_ROSTER_SIZE) {
      logger.warn('[UpdateTeamProfile] Roster exceeds max, truncating', {
        teamId,
        received: roster.length,
        max: MAX_ROSTER_SIZE,
      });
      capped = roster.slice(0, MAX_ROSTER_SIZE);
    }

    // Validate + sanitize LLM-provided roster data
    const validated = capped.filter((m): m is RosterMemberInput => {
      const fn = typeof m.firstName === 'string' ? m.firstName.trim() : '';
      const ln = typeof m.lastName === 'string' ? m.lastName.trim() : '';
      return fn.length > 0 && ln.length > 0;
    });

    if (validated.length === 0) {
      logger.info('[UpdateTeamProfile] No valid roster members after validation', { teamId });
      return 0;
    }

    // Query existing entries for dedup (name-based)
    const existingSnap = await this.db
      .collection(ROSTER_ENTRIES_COLLECTION)
      .where('teamId', '==', teamId)
      .where('status', 'in', [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING])
      .get();

    const existingByName = new Set<string>();
    for (const doc of existingSnap.docs) {
      const d = doc.data();
      const fn = typeof d['firstName'] === 'string' ? d['firstName'] : '';
      const ln = typeof d['lastName'] === 'string' ? d['lastName'] : '';
      const co = typeof d['classOf'] === 'number' ? d['classOf'] : null;
      const jn = typeof d['jerseyNumber'] === 'string' ? d['jerseyNumber'] : null;
      if (fn.trim() || ln.trim()) existingByName.add(rosterDedupeKey(fn, ln, co, jn));
    }

    const newMembers = validated.filter((m) => {
      const key = rosterDedupeKey(
        m.firstName,
        m.lastName,
        typeof m.classOf === 'number' ? m.classOf : null,
        typeof m.jerseyNumber === 'string' ? m.jerseyNumber : null
      );
      return !existingByName.has(key);
    });

    if (newMembers.length === 0) {
      logger.info('[UpdateTeamProfile] All roster members already exist', { teamId });
      return 0;
    }

    // Firestore batches have a 500-write limit. Chunk if needed.
    const BATCH_LIMIT = 500;
    for (let i = 0; i < newMembers.length; i += BATCH_LIMIT) {
      const chunk = newMembers.slice(i, i + BATCH_LIMIT);
      const batch = this.db.batch();
      for (const member of chunk) {
        const entryRef = this.db.collection(ROSTER_ENTRIES_COLLECTION).doc();
        batch.set(entryRef, {
          userId: '', // Unverified — no linked user yet
          teamId,
          organizationId,
          role: RosterRole.ATHLETE,
          status: RosterEntryStatus.PENDING,
          jerseyNumber: member.jerseyNumber ?? null,
          positions: Array.isArray(member.positions) ? member.positions : [],
          primaryPosition:
            typeof member.primaryPosition === 'string' ? member.primaryPosition.trim() : null,
          classOf: typeof member.classOf === 'number' ? member.classOf : null,
          joinedAt: now,
          updatedAt: now,
          firstName: member.firstName.trim(),
          lastName: member.lastName.trim(),
          email: '',
          phoneNumber: '',
          profileImg: null,
          height: typeof member.height === 'string' ? member.height.trim() : null,
          weight: typeof member.weight === 'string' ? member.weight.trim() : null,
          source: 'scraper',
          verified: false,
        });
      }
      await batch.commit();
    }

    // Increment athleteMember counter on the Team document
    try {
      await this.db
        .collection(TEAMS_COLLECTION)
        .doc(teamId)
        .update({ athleteMember: FieldValue.increment(newMembers.length) });
    } catch {
      // Best-effort counter update
    }

    logger.info('[UpdateTeamProfile] Roster entries created', {
      teamId,
      newCount: newMembers.length,
      existingCount: existingSnap.size,
    });

    return newMembers.length;
  }

  /** Invalidate all relevant caches after team update. */
  private async invalidateCaches(
    teamId: string,
    organizationId: string | null,
    teamData: Record<string, unknown>
  ): Promise<void> {
    try {
      const cache = getCacheService();
      const promises: Promise<unknown>[] = [
        invalidateTeamCache(
          teamId,
          typeof teamData['teamCode'] === 'string' ? teamData['teamCode'] : undefined,
          typeof teamData['unicode'] === 'string' ? teamData['unicode'] : undefined
        ),
        cache.del(ROSTER_CACHE_KEYS.TEAM_ROSTER(teamId)),
      ];

      if (organizationId) {
        promises.push(cache.del(ROSTER_CACHE_KEYS.ORG_MEMBERS(organizationId)));
      }

      await Promise.all(promises);
    } catch {
      // Best-effort cache invalidation
    }
  }
}
