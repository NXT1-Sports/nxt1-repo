/**
 * @fileoverview Write Playbooks Tool — Atomic writer for team play diagrams and playbook data
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes structured playbook data (individual plays with full mechanics) to the
 * `TeamPlaybooks` collection. Each doc covers one team × sport × named playbook.
 *
 * Doc ID pattern: `{teamId}_{normalizedSport}_{slugifiedName}` — upserted per call.
 * Individual plays are merged by their `playKey` (`${series ?? ''}:${name.toLowerCase()}`),
 * so re-scraping the same Hudl page is always idempotent.
 *
 * Schema is 100% sport-agnostic:
 *   - Football: series="40 Series", personnel="11", formation="Shotgun", conceptTags=["RPO"]
 *   - Basketball: series="Secondary Break", formation="Horns", conceptTags=["pick-and-roll"]
 *   - Soccer: series="Corner Sequences", formation="3-4-3", conceptTags=["overload"]
 *
 * Queried by: IntelGenerationService (team intel LLM prompt context), Agent X reasoning queries.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { logger } from '../../../../../utils/logger.js';
import { resolveCreatedAt } from '../doc-date-utils.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const PLAYBOOKS_COLLECTION = 'TeamPlaybooks';
const TEAMS_COLLECTION = 'Teams';
const MAX_PLAYS_PER_CALL = 500;
const DEFAULT_PLAYBOOK_NAME = 'Main Playbook';

// ─── Schemas ────────────────────────────────────────────────────────────────

/**
 * A single positional assignment within a play.
 * Sport-agnostic: "QB" → "Read SAM linebacker, keep or throw seam" is the same
 * structure as "PG" → "Dribble hand-off to wing on action".
 */
const PlayAssignmentSchema = z
  .object({
    position: z.string().trim().min(1),
    instruction: z.string().trim().min(1),
  })
  .passthrough();

/**
 * A single play entry — the atomic unit of a playbook.
 *
 * Only `name` is required. Every other field is additive; Agent X stores whatever
 * data was available from the source (Hudl, Teamworks, MaxPreps, or manual entry).
 */
const PlayEntrySchema = z
  .object({
    /** Play name: "H SEAM", "Horns", "Corner Kick Pattern A" */
    name: z.string().trim().min(1),

    /** Series/family grouping: "40 Series", "Secondary Break", "Set Plays" */
    series: z.string().trim().min(1).optional(),

    /** Phase of game: "offense", "defense", "special_teams", "transition", "press_break" */
    category: z.string().trim().min(1).optional(),

    /** Sub-type: "pass", "run", "set_play", "zone_attack", "out_of_bounds", "late_game" */
    playType: z.string().trim().min(1).optional(),

    /**
     * Personnel grouping — sport-agnostic label:
     * Football: "11" (1 RB, 1 TE), "21", "22"
     * Basketball: "5-out", "4-out-1-in"
     * Soccer: "3-4-3", "4-2-3-1"
     */
    personnel: z.string().trim().min(1).optional(),

    /** Base formation alignment: "Shotgun", "Horns", "Diamond Press", "3-4-3 Attack" */
    formation: z.string().trim().min(1).optional(),

    /**
     * Strategy/concept tags for semantic reasoning.
     * Let Agent X answer "show all RPO looks" or "what beats Cover 2?".
     * Examples: ["RPO", "zone-read"], ["pick-and-roll", "drive-kick"], ["overload", "crossing-runs"]
     */
    conceptTags: z.array(z.string().trim().min(1)).optional(),

    /** Per-position instructions — what every player does on this play */
    assignments: z.array(PlayAssignmentSchema).optional(),

    /** Natural language summary of the play concept */
    description: z.string().trim().min(1).optional(),

    /** URL of an embedded play diagram image (Hudl diagram, Canva export, etc.) */
    diagramUrl: z.string().url().optional(),

    /** URLs to video clips showing this play in action */
    videoRefs: z.array(z.string().url()).optional(),

    /**
     * Statistical outcomes (sourced from film analysis or box score data):
     * - successRate: 0–1 probability of gaining the desired result
     * - typicalGain: avg yards (football), pts/possession (basketball), etc.
     * - strengths: defensive looks or scenarios this play is effective against
     */
    successRate: z.number().min(0).max(1).optional(),
    typicalGain: z.number().optional(),
    strengths: z.array(z.string().trim().min(1)).optional(),

    /** Free-form search/filter tags: ["red zone", "2-minute", "fourth down"] */
    tags: z.array(z.string().trim().min(1)).optional(),

    /** The source platform's own internal ID for this play (e.g. Hudl card ID) */
    sourcePlayId: z.string().trim().min(1).optional(),
  })
  .passthrough();

const WritePlaybooksInputSchema = z.object({
  /** Team document ID in Firestore */
  teamId: z.string().trim().min(1),

  /**
   * Sport key — case-insensitive, normalized on write.
   * Examples: "football", "basketball_boys", "soccer_girls", "lacrosse"
   */
  sport: z.string().trim().min(1),

  /**
   * Playbook name (the container, not an individual play).
   * Defaults to "Main Playbook". Use this to separate offense/defense books:
   * "Offensive Playbook", "Defensive Playbook", "Special Teams Playbook".
   */
  name: z.string().trim().min(1).optional(),

  /**
   * Season label — optional, since playbooks are often perennial.
   * Format: "2025-2026" or "2025".
   */
  season: z.string().trim().min(1).optional(),

  /**
   * Source platform slug (e.g. "hudl", "teamworks", "maxpreps", "manual").
   * Required for provenance tracking.
   */
  source: z.string().trim().min(1),

  /** The URL that was read to extract this playbook data */
  sourceUrl: z.string().url().optional(),

  /** Individual play entries — the actual playbook content */
  plays: z.array(PlayEntrySchema).min(1).max(MAX_PLAYS_PER_CALL),
});

// ─── Types ───────────────────────────────────────────────────────────────────

type PlayEntry = z.infer<typeof PlayEntrySchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Stable slug: lowercase + replace non-alphanumeric runs with dash */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Build a clean, stored play entry — strip undefined fields for Firestore */
function buildPlayEntry(raw: PlayEntry, now: string): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    name: raw.name.trim(),
    extractedAt: now,
    updatedAt: now,
  };

  if (raw.series) entry['series'] = raw.series.trim();
  if (raw.category) entry['category'] = raw.category.trim().toLowerCase();
  if (raw.playType) entry['playType'] = raw.playType.trim().toLowerCase();
  if (raw.personnel) entry['personnel'] = raw.personnel.trim();
  if (raw.formation) entry['formation'] = raw.formation.trim();
  if (raw.conceptTags?.length)
    entry['conceptTags'] = raw.conceptTags.map((t) => t.trim().toLowerCase());
  if (raw.assignments?.length) {
    entry['assignments'] = raw.assignments.map((a) => ({
      position: a.position.trim().toUpperCase(),
      instruction: a.instruction.trim(),
    }));
  }
  if (raw.description) entry['description'] = raw.description.trim();
  if (raw.diagramUrl) entry['diagramUrl'] = raw.diagramUrl;
  if (raw.videoRefs?.length) entry['videoRefs'] = raw.videoRefs;
  if (typeof raw.successRate === 'number') entry['successRate'] = raw.successRate;
  if (typeof raw.typicalGain === 'number') entry['typicalGain'] = raw.typicalGain;
  if (raw.strengths?.length) entry['strengths'] = raw.strengths.map((s) => s.trim().toLowerCase());
  if (raw.tags?.length) entry['tags'] = raw.tags.map((t) => t.trim().toLowerCase());
  if (raw.sourcePlayId) entry['sourcePlayId'] = raw.sourcePlayId.trim();

  return entry;
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export class WritePlaybooksTool extends BaseTool {
  readonly name = 'write_playbooks';

  readonly description =
    'Writes a team playbook (individual play mechanics) to the TeamPlaybooks collection.\n\n' +
    'Call this AFTER reading a playbook page from Hudl, HUDL Playbook, Teamworks, MaxPreps,\n' +
    'or any team play management platform. Also call it when a coach manually describes plays.\n\n' +
    'Works for ANY sport:\n' +
    '  • Football — series (40 Series), personnel (11), formation (Shotgun), concept tags (RPO, zone-read)\n' +
    '  • Basketball — formation (Horns), concept tags (pick-and-roll, drive-kick)\n' +
    '  • Soccer — formation (3-4-3 attack), concept tags (overload, crossing-runs)\n' +
    '  • Lacrosse, volleyball, baseball, etc. — same structure\n\n' +
    'Doc ID: {teamId}_{sport}_{playbookName} — upserted per call. Individual plays are merged\n' +
    'by their stable key (series + name), so re-scraping the same page is always idempotent.\n\n' +
    'Parameters:\n' +
    '- teamId (required): Team document ID.\n' +
    '- sport (required): Sport key (e.g. "football", "basketball_boys", "soccer_girls").\n' +
    '- name (optional): Playbook container name, defaults to "Main Playbook".\n' +
    '  Use "Offensive Playbook", "Defensive Playbook", "Special Teams Playbook" to separate books.\n' +
    '- season (optional): Season label e.g. "2025-2026". Omit if plays are perennial.\n' +
    '- source (required): Platform slug (e.g. "hudl", "teamworks", "maxpreps", "manual").\n' +
    '- sourceUrl (optional): The URL that was read to extract this data.\n' +
    '- plays (required): Array of play entries (min 1, max 500 per call).\n' +
    '  Each play entry:\n' +
    '  • name (required): Play name (e.g. "H SEAM", "Horns", "Corner Kick Pattern A").\n' +
    '  • series (optional): Family grouping (e.g. "40 Series", "Secondary Break").\n' +
    '  • category (optional): Phase (e.g. "offense", "defense", "special_teams").\n' +
    '  • playType (optional): Sub-type (e.g. "pass", "run", "set_play", "late_game").\n' +
    '  • personnel (optional): Grouping on field (e.g. "11", "5-out", "3-4-3").\n' +
    '  • formation (optional): Base alignment (e.g. "Shotgun", "Horns", "Diamond Press").\n' +
    '  • conceptTags (optional): Strategy/concept tags for reasoning\n' +
    '    (e.g. ["RPO", "zone-read"], ["pick-and-roll", "drive-kick"]).\n' +
    '  • assignments (optional): Per-position instructions\n' +
    '    (e.g. [{position: "QB", instruction: "Read SAM, keep or throw seam"}]).\n' +
    '  • description (optional): Natural language summary of the play.\n' +
    '  • diagramUrl (optional): URL of play diagram image.\n' +
    '  • videoRefs (optional): Array of film clip URLs for this play.\n' +
    '  • successRate (optional): 0–1 probability from film data (e.g. 0.72 = 72% success).\n' +
    '  • typicalGain (optional): Average result — yards (football), pts/possession (basketball).\n' +
    '  • strengths (optional): What this play beats (e.g. ["Cover 2", "Tampa 2"]).\n' +
    '  • tags (optional): Free-form search tags (e.g. ["red zone", "2-minute", "fourth down"]).\n' +
    "  • sourcePlayId (optional): The source platform's internal ID for this play.";

  readonly parameters = WritePlaybooksInputSchema;

  override readonly allowedAgents = ['data_coordinator', 'strategy_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'team_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = WritePlaybooksInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { teamId, sport, source } = parsed.data;
    const playbookName = (parsed.data.name ?? DEFAULT_PLAYBOOK_NAME).trim();
    const season = parsed.data.season?.trim();
    const sourceUrl = parsed.data.sourceUrl;
    const rawPlays = parsed.data.plays;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      // ── Auth: verify actor is team owner or manager ───────────────────
      const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(teamId).get();
      if (!teamDoc.exists) {
        return { success: false, error: `Team ${teamId} not found.` };
      }
      const teamData = teamDoc.data() ?? {};
      const isAuthorized = await canManageTeamMutationForUser(
        this.db,
        context.userId,
        teamId,
        teamData
      );
      if (!isAuthorized) {
        return { success: false, error: 'Not authorized to write playbooks for this team.' };
      }

      const now = new Date().toISOString();
      const normalizedSport = sport.trim().toLowerCase();
      const docId = `${teamId}_${normalizedSport}_${slugify(playbookName)}`;

      // ── Validate and build play entries ───────────────────────────────
      const validPlays: Record<string, unknown>[] = [];
      let skipped = 0;

      for (const rawPlay of rawPlays) {
        if (!rawPlay || typeof rawPlay !== 'object') {
          skipped++;
          continue;
        }
        const p = rawPlay as PlayEntry;
        if (!p.name?.trim()) {
          skipped++;
          continue;
        }
        validPlays.push(buildPlayEntry(p, now));
      }

      if (validPlays.length === 0) {
        return { success: false, error: 'No valid play entries after validation.' };
      }

      context?.emitStage?.('submitting_job', {
        icon: 'database',
        playCount: validPlays.length,
        sport: normalizedSport,
        phase: 'write_playbooks',
      });

      // ── Upsert: merge incoming plays with existing by stable playKey ──
      const docRef = this.db.collection(PLAYBOOKS_COLLECTION).doc(docId);
      const existingDoc = await docRef.get();

      const existingPlays: Record<string, unknown>[] = existingDoc.exists
        ? ((existingDoc.data()!['plays'] as Record<string, unknown>[]) ?? [])
        : [];

      // Build merge map keyed on playKey (series:name slug)
      const mergeMap = new Map<string, Record<string, unknown>>();
      for (const existing of existingPlays) {
        const series = typeof existing['series'] === 'string' ? existing['series'] : '';
        const name = typeof existing['name'] === 'string' ? existing['name'] : '';
        const key = `${slugify(series)}:${slugify(name)}`;
        mergeMap.set(key, existing);
      }
      for (const incoming of validPlays) {
        const series = typeof incoming['series'] === 'string' ? incoming['series'] : '';
        const name = typeof incoming['name'] === 'string' ? incoming['name'] : '';
        const key = `${slugify(series)}:${slugify(name)}`;
        // Preserve createdAt from existing if it exists
        const existing = mergeMap.get(key);
        if (existing?.['createdAt']) {
          incoming['createdAt'] = existing['createdAt'];
        } else {
          incoming['createdAt'] = now;
        }
        mergeMap.set(key, incoming);
      }

      const mergedPlays = Array.from(mergeMap.values());

      // ── Build aggregate concept index for fast querying ───────────────
      const allConceptTags = new Set<string>();
      const allFormations = new Set<string>();
      const allPersonnel = new Set<string>();
      const allCategories = new Set<string>();

      for (const play of mergedPlays) {
        if (Array.isArray(play['conceptTags'])) {
          for (const t of play['conceptTags']) allConceptTags.add(String(t));
        }
        if (typeof play['formation'] === 'string') allFormations.add(play['formation'] as string);
        if (typeof play['personnel'] === 'string') allPersonnel.add(play['personnel'] as string);
        if (typeof play['category'] === 'string') allCategories.add(play['category'] as string);
      }

      const docData: Record<string, unknown> = {
        id: docId,
        teamId,
        sport: normalizedSport,
        name: playbookName,
        plays: mergedPlays,
        playCount: mergedPlays.length,
        // Aggregate indexes — allow Agent X to quickly filter without scanning every play
        conceptTagIndex: Array.from(allConceptTags).sort(),
        formationIndex: Array.from(allFormations).sort(),
        personnelIndex: Array.from(allPersonnel).sort(),
        categoryIndex: Array.from(allCategories).sort(),
        source,
        verified: false,
        extractedAt: now,
        updatedAt: now,
      };

      if (season) docData['season'] = season;
      if (sourceUrl) docData['sourceUrl'] = sourceUrl;
      docData['createdAt'] = resolveCreatedAt(existingDoc.data()?.['createdAt'], undefined, now);

      await docRef.set(docData, { merge: true });

      // ── Cache invalidation ────────────────────────────────────────────
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(`intel:team:${teamId}`),
          cache.del(`team:playbooks:${teamId}:${normalizedSport}`),
          cache.del(`team:profile:${teamId}`),
        ]);
      } catch {
        // Best-effort — cache miss is acceptable
      }

      logger.info('[WritePlaybooksTool] Plays written', {
        teamId,
        sport: normalizedSport,
        playbookName,
        docId,
        written: validPlays.length,
        total: mergedPlays.length,
        skipped,
      });

      return {
        success: true,
        data: {
          teamId,
          sport: normalizedSport,
          name: playbookName,
          docId,
          source,
          written: validPlays.length,
          total: mergedPlays.length,
          skipped,
          conceptTagIndex: Array.from(allConceptTags).sort(),
          formationIndex: Array.from(allFormations).sort(),
          message: `Wrote ${validPlays.length} play(s) to "${playbookName}" for team "${teamId}" (${normalizedSport}). Total plays in book: ${mergedPlays.length}${skipped > 0 ? `. Skipped ${skipped} invalid entries.` : ''}.`,
        },
      };
    } catch (err) {
      logger.error('[WritePlaybooksTool] Failed to write playbooks', {
        teamId,
        sport,
        source,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write playbooks',
      };
    }
  }
}
