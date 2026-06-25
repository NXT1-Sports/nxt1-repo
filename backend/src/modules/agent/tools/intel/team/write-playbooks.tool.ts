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
import {
  buildPlayIndexes,
  createPlayKey,
  ensurePlayId,
  sanitizePlayBreakdown,
} from './playbook-play.utils.js';
import { assessPlaybookExtractionQuality } from './playbook-extraction-quality.util.js';
import { syncPlaybookDiagramAsset } from './playbook-diagram-asset.util.js';
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

    /** Rich breakdown of reads, assignments, and concept mechanics */
    playBreakdown: z.string().trim().min(1).optional(),

    /** URL of an embedded play diagram image (Hudl diagram, Canva export, etc.) */
    diagramUrl: z.string().url().optional(),

    /** Stable DiagramAssets record ID when the play is linked to a first-class diagram. */
    diagramAssetId: z.string().trim().min(1).optional(),

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

    /** Stable ID used for per-play atomic mutations */
    playId: z.string().trim().min(1).optional(),

    // ─── AI-NATIVE INSTALL LAYER ──────────────────────────────────────────────
    /** Install stage: "install" (teaching), "rep" (repetition), "game-ready" */
    installStage: z.enum(['install', 'rep', 'game-ready']).optional(),

    /** Key coaching points for this play — teaching moments coaches emphasize */
    coachingPoints: z.array(z.string().trim().min(1)).optional(),

    /** Common breakdowns or mistakes to watch for during installation */
    commonBusts: z.array(z.string().trim().min(1)).optional(),

    /** Correction cues — short, callout-friendly phrases for live corrections */
    correctionCues: z.array(z.string().trim().min(1)).optional(),

    /** Drill progression — drills that build toward this play installation */
    drillProgression: z.array(z.string().trim().min(1)).optional(),

    // ─── AI-NATIVE SITUATION LAYER ────────────────────────────────────────────
    /**
     * Situational contexts where this play excels. Agent X uses these to recommend plays.
     * Examples: "1st & 10", "1st & long", "2nd & short", "2nd & medium", "2nd & long",
     * "3rd & short", "3rd & medium", "3rd & long", "red zone", "2-minute",
     * "4th & short", "backed up", "empty", "goal line", "two-minute warning"
     */
    situations: z.array(z.string().trim().min(1)).optional(),
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
  plays: z.array(PlayEntrySchema).min(1).max(MAX_PLAYS_PER_CALL).optional(),
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
  const playBreakdown = sanitizePlayBreakdown(raw.playBreakdown);
  if (playBreakdown) entry['playBreakdown'] = playBreakdown;
  if (raw.diagramUrl) entry['diagramUrl'] = raw.diagramUrl;
  if (raw.diagramAssetId) entry['diagramAssetId'] = raw.diagramAssetId.trim();
  if (raw.videoRefs?.length) entry['videoRefs'] = raw.videoRefs;
  if (typeof raw.successRate === 'number') entry['successRate'] = raw.successRate;
  if (typeof raw.typicalGain === 'number') entry['typicalGain'] = raw.typicalGain;
  if (raw.strengths?.length) entry['strengths'] = raw.strengths.map((s) => s.trim().toLowerCase());
  if (raw.tags?.length) entry['tags'] = raw.tags.map((t) => t.trim().toLowerCase());
  if (raw.sourcePlayId) entry['sourcePlayId'] = raw.sourcePlayId.trim();
  if (raw.playId) entry['playId'] = raw.playId.trim();

  // AI-native install layer
  if (raw.installStage) entry['installStage'] = raw.installStage;
  if (raw.coachingPoints?.length) entry['coachingPoints'] = raw.coachingPoints.map((p) => p.trim());
  if (raw.commonBusts?.length) entry['commonBusts'] = raw.commonBusts.map((b) => b.trim());
  if (raw.correctionCues?.length) entry['correctionCues'] = raw.correctionCues.map((c) => c.trim());
  if (raw.drillProgression?.length)
    entry['drillProgression'] = raw.drillProgression.map((d) => d.trim());

  // AI-native situation layer
  if (raw.situations?.length) entry['situations'] = raw.situations.map((s) => s.trim());

  return entry;
}

function shouldGenerateSeedPlays(input: {
  readonly source: string;
  readonly name?: string;
}): boolean {
  if (input.source.trim().toLowerCase() !== 'manual') return false;
  const normalizedName = (input.name ?? '').trim().toLowerCase();
  if (!normalizedName) return false;
  return /(seed|full data|complete playbook|test one)/i.test(normalizedName);
}

function buildFootballSeedPlays(): PlayEntry[] {
  return [
    {
      name: 'Gun Doubles 60 Mesh',
      series: '60 Series',
      category: 'offense',
      playType: 'pass',
      personnel: '10',
      formation: 'Gun Doubles',
      conceptTags: ['mesh', 'man-beater', '3rd-down'],
      assignments: [
        { position: 'QB', instruction: 'Read mesh to sit, then check rail.' },
        { position: 'X', instruction: '12-yard sit over Mike leverage.' },
        { position: 'H', instruction: 'Shallow cross, settle vs zone.' },
      ],
      playBreakdown:
        'Primary concept for medium downs. Use pre-snap motion to identify man/zone and take first crosser with leverage.',
      situations: ['2nd & medium', '3rd & medium', '2-minute'],
      coachingPoints: ['Keep mesh at 5 yards', 'QB hitch once and throw on rhythm'],
    },
    {
      name: 'Gun Trips RPO Stick',
      series: 'RPO Package',
      category: 'offense',
      playType: 'pass',
      personnel: '11',
      formation: 'Gun Trips',
      conceptTags: ['rpo', 'stick', 'box-count'],
      assignments: [
        { position: 'QB', instruction: 'Read apex. Throw stick if box count favorable.' },
        { position: 'RB', instruction: 'Inside zone footwork and mesh timing.' },
      ],
      playBreakdown:
        'Conflict defender RPO. If apex expands, hand zone. If apex inserts, throw stick to #2 immediately.',
      situations: ['1st & 10', '2nd & short'],
      coachingPoints: ['Decide pre-third-step', 'No drift at mesh point'],
    },
    {
      name: 'Pistol 40 Power',
      series: '40 Series',
      category: 'offense',
      playType: 'run',
      personnel: '21',
      formation: 'Pistol Strong',
      conceptTags: ['power', 'gap-scheme'],
      playBreakdown:
        'Down-block front side, pull backside guard to kick EMOL, fullback wraps through B-gap for linebacker.',
      situations: ['2nd & short', 'goal line', '4th & short'],
      coachingPoints: ['Guard pull depth at 4.5 yards', 'Back press A-gap then bounce to C-gap'],
    },
    {
      name: 'Under Center Outside Zone',
      series: 'Zone Family',
      category: 'offense',
      playType: 'run',
      personnel: '12',
      formation: 'Ace',
      conceptTags: ['outside-zone', 'stretch'],
      playBreakdown:
        'Horizontal stretch with front-side reach and backside cutoff. Back reads helmet placement and makes one cut.',
      situations: ['1st & 10', 'backed up'],
      coachingPoints: ['Take width first', 'One cut and vertical'],
    },
    {
      name: 'Nickel Cover 3 Buzz',
      series: 'Coverage Package',
      category: 'defense',
      playType: 'coverage',
      personnel: '4-2-5',
      formation: 'Nickel',
      conceptTags: ['cover-3', 'buzz-rotation'],
      playBreakdown:
        'Strong safety rotates to hook/curl, corners play deep thirds, post safety holds middle third with eyes on #2 seams.',
      situations: ['1st & 10', '2nd & long'],
      coachingPoints: ['Disguise shell until cadence', 'Hook players collision #2'],
    },
    {
      name: 'Over Front Fire Zone 3',
      series: 'Pressure Package',
      category: 'defense',
      playType: 'blitz',
      personnel: '4-2-5',
      formation: 'Over',
      conceptTags: ['fire-zone', '5-man-pressure'],
      playBreakdown:
        'Boundary nickel and Mike pressure with 3-under/3-deep replacement coverage. End peels if back releases wide.',
      situations: ['3rd & long', '2-minute'],
      coachingPoints: ['Pressure track through near shoulder', 'Seam-curl defenders relate to #2'],
    },
    {
      name: 'Kickoff Return Middle',
      series: 'Special Teams Return',
      category: 'special_teams',
      playType: 'return',
      personnel: 'KR Unit',
      formation: 'Middle Return',
      conceptTags: ['kick-return', 'wedge-illusion'],
      playBreakdown:
        'Sell left/right with first two steps then vertical insertion between hash and numbers based on leverage.',
      situations: ['kickoff'],
      coachingPoints: ['Secure first contact', 'Returner presses landmark at +15'],
    },
    {
      name: 'Punt Safe Shield',
      series: 'Special Teams Punt',
      category: 'special_teams',
      playType: 'punt',
      personnel: 'Punt Unit',
      formation: 'Shield',
      conceptTags: ['punt', 'shield-protection'],
      playBreakdown:
        'Three-man shield sets depth at 7 yards with personal protector ID calls and directional punt rules.',
      situations: ['4th down', 'backed up'],
      coachingPoints: ['Snap-to-kick under 2.0s', 'Gunners release with stack avoidance'],
    },
  ];
}

function buildSeedPlays(sport: string): PlayEntry[] {
  const normalizedSport = sport.trim().toLowerCase();
  if (normalizedSport.includes('football')) return buildFootballSeedPlays();
  return [
    {
      name: 'Baseline Set 1',
      category: 'offense',
      playType: 'set_play',
      conceptTags: ['seed', 'baseline'],
      playBreakdown: 'Seed baseline play generated for manual full-data initialization.',
    },
  ];
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

  override readonly allowedAgents = ['router', 'data_coordinator', 'strategy_coordinator'] as const;
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
    const seedRequested = shouldGenerateSeedPlays({ source, name: parsed.data.name });
    const rawPlays = parsed.data.plays ?? (seedRequested ? buildSeedPlays(sport) : undefined);

    if (!rawPlays || rawPlays.length === 0) {
      return {
        success: false,
        error:
          'plays is required and must be a non-empty array. For manual seed initialization, include a seed-style playbook name (for example: "Seed Test One") or provide full play entries.',
      };
    }

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
        const play = buildPlayEntry(p, now);
        const syncedDiagram = await syncPlaybookDiagramAsset({
          db: this.db,
          userId: context.userId,
          sport: normalizedSport,
          title: typeof play['name'] === 'string' ? play['name'] : p.name,
          description:
            typeof play['playBreakdown'] === 'string'
              ? play['playBreakdown']
              : typeof play['description'] === 'string'
                ? play['description']
                : undefined,
          diagramUrl: typeof play['diagramUrl'] === 'string' ? play['diagramUrl'] : undefined,
          diagramAssetId:
            typeof play['diagramAssetId'] === 'string' ? play['diagramAssetId'] : undefined,
        });
        if (syncedDiagram.diagramUrl) play['diagramUrl'] = syncedDiagram.diagramUrl;
        if (syncedDiagram.diagramAssetId) play['diagramAssetId'] = syncedDiagram.diagramAssetId;
        validPlays.push(play);
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
      for (let index = 0; index < existingPlays.length; index += 1) {
        const existing = existingPlays[index] as Record<string, unknown>;
        const key = createPlayKey(existing);
        ensurePlayId(existing, `${docId}:${index}:${key}`);
        mergeMap.set(key, existing);
      }
      for (let index = 0; index < validPlays.length; index += 1) {
        const incoming = validPlays[index] as Record<string, unknown>;
        const key = createPlayKey(incoming);
        // Preserve createdAt from existing if it exists
        const existing = mergeMap.get(key);
        if (existing?.['createdAt']) {
          incoming['createdAt'] = existing['createdAt'];
        } else {
          incoming['createdAt'] = now;
        }
        if (existing?.['playId']) {
          incoming['playId'] = existing['playId'];
        }
        ensurePlayId(incoming, `${docId}:incoming:${index}:${key}`);
        mergeMap.set(key, incoming);
      }

      const mergedPlays = Array.from(mergeMap.values()).map((play, index) => {
        ensurePlayId(play, `${docId}:merged:${index}:${createPlayKey(play)}`);
        return play;
      });

      const indexes = buildPlayIndexes(mergedPlays);
      const quality = assessPlaybookExtractionQuality(normalizedSport, mergedPlays);

      if (quality.disposition === 'reject') {
        logger.warn('[WritePlaybooksTool] Rejected low-quality playbook extraction', {
          teamId,
          sport: normalizedSport,
          playbookName,
          docId,
          playCount: mergedPlays.length,
          qualityScore: quality.score,
          qualitySummary: quality.summary,
        });
        return {
          success: false,
          error: `Playbook extraction quality is too low to save. ${quality.summary}`,
          data: {
            teamId,
            sport: normalizedSport,
            name: playbookName,
            docId,
            quality,
          },
        };
      }

      const docData: Record<string, unknown> = {
        id: docId,
        teamId,
        sport: normalizedSport,
        name: playbookName,
        plays: mergedPlays,
        playCount: mergedPlays.length,
        // Aggregate indexes — allow Agent X to quickly filter without scanning every play
        ...indexes,
        source,
        verified: false,
        extractedAt: now,
        updatedAt: now,
        extractionQuality: quality,
        extractionQualityDisposition: quality.disposition,
        extractionQualityScore: quality.score,
        extractionQualityVersion: quality.version,
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
        seedGenerated: seedRequested && parsed.data.plays === undefined,
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
          seedGenerated: seedRequested && parsed.data.plays === undefined,
          extractionQuality: quality,
          reviewRequired: quality.disposition === 'review_required',
          conceptTagIndex: indexes['conceptTagIndex'],
          formationIndex: indexes['formationIndex'],
          message:
            `Wrote ${validPlays.length} play(s) to "${playbookName}" for team "${teamId}" (${normalizedSport}). ` +
            `Total plays in book: ${mergedPlays.length}${skipped > 0 ? `. Skipped ${skipped} invalid entries.` : ''}. ` +
            `${quality.disposition === 'review_required' ? `Review required: ${quality.summary}` : quality.summary}`,
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
