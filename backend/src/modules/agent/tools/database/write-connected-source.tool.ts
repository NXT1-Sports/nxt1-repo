/**
 * @fileoverview Write Connected Source Tool — Lightweight link registration
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Registers a URL as a connected source on the user's profile (or their
 * linked team doc for coaches/directors) WITHOUT running the full scrape
 * + distill + write pipeline.
 *
 * Use this when a user drops a link and says "connect this" or "add my
 * Hudl profile" — you just want to record the source so it appears in the
 * Connected Sources panel and can be synced later on demand.
 *
 * For athletes → writes to `Users/{userId}.connectedSources[]`
 * For coaches / directors → writes to `Teams/{teamId}.connectedSources[]`
 *
 * @example
 * User says: "Here's my MaxPreps page: https://maxpreps.com/athlete/..."
 * Agent calls:
 *   write_connected_source({
 *     userId: "abc123",
 *     url: "https://maxpreps.com/athlete/...",
 *     platform: "maxpreps",
 *     scopeId: "football"
 *   })
 * → Returns confirmation and offers to run a full data sync.
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { isTeamRole } from '@nxt1/core';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const USERS_COLLECTION = 'Users';
const TEAMS_COLLECTION = 'Teams';

const WriteConnectedSourceInputSchema = z.object({
  userId: z.string().trim().min(1),
  url: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  scopeId: z.string().trim().min(1).optional(),
  faviconUrl: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1).optional(),
});

/** Platforms the agent knows by slug — used for validation and favicon fallback. */
const KNOWN_PLATFORMS: Record<string, { displayName: string; faviconUrl: string }> = {
  maxpreps: {
    displayName: 'MaxPreps',
    faviconUrl: 'https://www.maxpreps.com/favicon.ico',
  },
  hudl: {
    displayName: 'Hudl',
    faviconUrl: 'https://www.hudl.com/favicon.ico',
  },
  instagram: {
    displayName: 'Instagram',
    faviconUrl: 'https://www.instagram.com/favicon.ico',
  },
  twitter: {
    displayName: 'X (Twitter)',
    faviconUrl: 'https://twitter.com/favicon.ico',
  },
  x: {
    displayName: 'X (Twitter)',
    faviconUrl: 'https://x.com/favicon.ico',
  },
  facebook: {
    displayName: 'Facebook',
    faviconUrl: 'https://www.facebook.com/favicon.ico',
  },
  youtube: {
    displayName: 'YouTube',
    faviconUrl: 'https://www.youtube.com/favicon.ico',
  },
  tiktok: {
    displayName: 'TikTok',
    faviconUrl: 'https://www.tiktok.com/favicon.ico',
  },
  on3: {
    displayName: 'On3',
    faviconUrl: 'https://www.on3.com/favicon.ico',
  },
  '247sports': {
    displayName: '247Sports',
    faviconUrl: 'https://247sports.com/favicon.ico',
  },
  rivals: {
    displayName: 'Rivals',
    faviconUrl: 'https://rivals.com/favicon.ico',
  },
  ncsasports: {
    displayName: 'NCSA Sports',
    faviconUrl: 'https://www.ncsasports.org/favicon.ico',
  },
  athleticnet: {
    displayName: 'Athletic.net',
    faviconUrl: 'https://www.athletic.net/favicon.ico',
  },
  milesplit: {
    displayName: 'MileSplit',
    faviconUrl: 'https://www.milesplit.com/favicon.ico',
  },
  usashooting: {
    displayName: 'USA Shooting',
    faviconUrl: 'https://www.usashooting.org/favicon.ico',
  },
  linkedin: {
    displayName: 'LinkedIn',
    faviconUrl: 'https://www.linkedin.com/favicon.ico',
  },
};

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteConnectedSourceTool extends BaseTool {
  readonly name = 'write_connected_source';

  readonly description =
    "Registers a URL as a connected source on the user's profile WITHOUT running a full data sync. " +
    'Use this when the user drops a profile link (e.g. "here\'s my Hudl: https://…") and wants it ' +
    'saved to their Connected Sources panel. After registering, offer to run a full data sync ' +
    'via scrape_and_index_profile if the user wants their data imported.\n\n' +
    'For athletes — written to Users/{userId}.connectedSources[]\n' +
    'For coaches / directors — written to Teams/{teamId}.connectedSources[]\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID of the target user.\n' +
    '- url (required): The full profile URL to register.\n' +
    '- platform (required): Platform slug (e.g. "maxpreps", "hudl", "instagram", "twitter").\n' +
    '- scopeId (optional): Sport slug the source belongs to (e.g. "football"). Falls back to the user\'s primary sport.\n' +
    '- faviconUrl (optional): Override favicon URL. Auto-resolved for known platforms if omitted.\n' +
    '- teamId (optional): Firestore Team ID. Required for coach/director accounts lacking a pre-set teamId.';

  readonly parameters = WriteConnectedSourceInputSchema;

  override readonly allowedAgents = [
    'strategy_coordinator',
    'data_coordinator',
    'recruiting_coordinator',
    'performance_coordinator',
    'admin_coordinator',
    'brand_coordinator',
  ] as const;

  readonly isMutation = true;
  readonly category = 'database' as const;

  readonly entityGroup = 'organization_tools' as const;
  private readonly db: Firestore;

  constructor(db: Firestore) {
    super();
    this.db = db;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = WriteConnectedSourceInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues
          .map((issue) =>
            issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
          )
          .join(', '),
      };
    }

    const { userId, url } = parsed.data;

    if (!this.isValidUrl(url)) {
      return { success: false, error: `"${url}" is not a valid URL.` };
    }

    const platform = parsed.data.platform.toLowerCase();
    const scopeId = parsed.data.scopeId ?? null;
    const explicitFaviconUrl = parsed.data.faviconUrl ?? null;
    const explicitTeamId = parsed.data.teamId ?? null;

    // ── Resolve favicon URL ─────────────────────────────────────────────
    const faviconUrl = explicitFaviconUrl ?? KNOWN_PLATFORMS[platform]?.faviconUrl ?? undefined;

    // ── Load user document ──────────────────────────────────────────────
    let userData: Record<string, unknown>;
    try {
      const userDoc = await this.db.collection(USERS_COLLECTION).doc(userId).get();
      if (!userDoc.exists) {
        return { success: false, error: `User "${userId}" not found.` };
      }
      userData = userDoc.data() ?? {};
    } catch (err) {
      logger.error('[WriteConnectedSource] Failed to fetch user doc', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: `Failed to load user profile: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // ── Resolve sport scope ─────────────────────────────────────────────
    const resolvedScopeId = scopeId ?? this.resolvePrimarySport(userData);

    // ── Determine if this is a team-role account ────────────────────────
    const userRole = typeof userData['role'] === 'string' ? userData['role'] : 'athlete';
    const isTeamAccount = isTeamRole(userRole);

    const now = new Date().toISOString();

    if (isTeamAccount) {
      return await this.writeToTeamDoc(
        userId,
        url,
        platform,
        resolvedScopeId,
        now,
        userData,
        explicitTeamId,
        faviconUrl,
        context
      );
    }

    return await this.writeToUserDoc(
      userId,
      url,
      platform,
      resolvedScopeId,
      now,
      userData,
      faviconUrl,
      context
    );
  }

  // ─── Private: write to Users/{userId} ─────────────────────────────────

  private async writeToUserDoc(
    userId: string,
    url: string,
    platform: string,
    scopeId: string,
    now: string,
    userData: Record<string, unknown>,
    faviconUrl: string | undefined,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const existing = Array.isArray(userData['connectedSources'])
      ? (userData['connectedSources'] as Record<string, unknown>[])
      : [];

    const updated = this.upsertConnectedSource(existing, platform, url, scopeId, now, faviconUrl);
    const isNew = updated.length > existing.length;

    try {
      await this.db.collection('Users').doc(userId).set(
        {
          connectedSources: updated,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.info('[WriteConnectedSource] Wrote to user doc', {
        userId,
        platform,
        url,
        scopeId,
        isNew,
      });

      const platformLabel = KNOWN_PLATFORMS[platform]?.displayName ?? platform;
      return {
        success: true,
        data: {
          target: 'user',
          userId,
          platform,
          url,
          scopeId,
          isNew,
          message: isNew
            ? `${platformLabel} profile registered as a connected source (sport: ${scopeId}). ` +
              `Would you like me to run a full data sync now to import your stats and profile info from ${platformLabel}?`
            : `${platformLabel} connected source updated (sport: ${scopeId}). ` +
              `Would you like me to run a fresh data sync from ${platformLabel}?`,
        },
      };
    } catch (err) {
      logger.error('[WriteConnectedSource] Failed to write to user doc', {
        userId,
        platform,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: `Failed to save connected source: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ─── Private: write to Teams/{teamId} ─────────────────────────────────

  private async writeToTeamDoc(
    userId: string,
    url: string,
    platform: string,
    scopeId: string,
    now: string,
    userData: Record<string, unknown>,
    explicitTeamId: string | null,
    faviconUrl: string | undefined,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    // Resolve teamId: explicit param → user doc field
    const teamId =
      explicitTeamId ?? (typeof userData['teamId'] === 'string' ? userData['teamId'] : null);

    if (!teamId) {
      return {
        success: false,
        error:
          'This user is a coach or director. Provide the "teamId" parameter to specify ' +
          'which team document the connected source should be written to.',
      };
    }

    let existingTeamData: Record<string, unknown>;
    try {
      const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(teamId).get();
      if (!teamDoc.exists) {
        return {
          success: false,
          error: `Team document "${teamId}" not found.`,
        };
      }
      existingTeamData = teamDoc.data() ?? {};
    } catch (err) {
      logger.error('[WriteConnectedSource] Failed to fetch team doc', {
        userId,
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: `Failed to load team document: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const existing = Array.isArray(existingTeamData['connectedSources'])
      ? (existingTeamData['connectedSources'] as Record<string, unknown>[])
      : [];

    const updated = this.upsertConnectedSource(existing, platform, url, scopeId, now, faviconUrl);
    const isNew = updated.length > existing.length;

    try {
      await this.db.collection(TEAMS_COLLECTION).doc(teamId).set(
        {
          connectedSources: updated,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.info('[WriteConnectedSource] Wrote to team doc', {
        userId,
        teamId,
        platform,
        url,
        scopeId,
        isNew,
      });

      const platformLabel = KNOWN_PLATFORMS[platform]?.displayName ?? platform;
      return {
        success: true,
        data: {
          target: 'team',
          userId,
          teamId,
          platform,
          url,
          scopeId,
          isNew,
          message: isNew
            ? `${platformLabel} profile registered as a connected source for your team (sport: ${scopeId}). ` +
              `Would you like me to run a full data sync now to import team info from ${platformLabel}?`
            : `${platformLabel} team connected source updated (sport: ${scopeId}). ` +
              `Would you like me to run a fresh data sync from ${platformLabel}?`,
        },
      };
    } catch (err) {
      logger.error('[WriteConnectedSource] Failed to write to team doc', {
        userId,
        teamId,
        platform,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: `Failed to save connected source to team: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────

  /**
   * Upserts a connected source record into an existing array.
   * Matches on (platform, scopeId) — updates the record in place if found,
   * appends a new entry otherwise. Mirrors the logic in WriteCoreIdentityTool.
   */
  private upsertConnectedSource(
    existing: Record<string, unknown>[],
    platform: string,
    profileUrl: string,
    scopeId: string,
    lastSyncedAt: string,
    faviconUrl?: string
  ): Record<string, unknown>[] {
    const updated = [...existing];
    const matchIndex = updated.findIndex(
      (cs) => cs['platform'] === platform && cs['scopeId'] === scopeId
    );
    const record: Record<string, unknown> = {
      platform,
      profileUrl,
      lastSyncedAt,
      syncStatus: 'pending',
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

  /**
   * Resolves the user's primary sport from their sports array or legacy field.
   * Falls back to 'general' so the record is always written.
   */
  private resolvePrimarySport(userData: Record<string, unknown>): string {
    const sports = userData['sports'];
    if (Array.isArray(sports) && sports.length > 0) {
      const first = sports[0] as Record<string, unknown>;
      const sport = typeof first['sport'] === 'string' ? first['sport'] : null;
      if (sport) return sport;
    }
    // Legacy scalar field
    if (typeof userData['sport'] === 'string' && userData['sport']) {
      return userData['sport'];
    }
    return 'general';
  }

  /** Basic URL validation — must start with http:// or https://. */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
