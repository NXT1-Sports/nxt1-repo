/**
 * @fileoverview Intel Generation Service — AI-Powered Profile Intelligence
 * @module @nxt1/backend/modules/agent/services
 *
 * Generates on-demand Intel reports for athletes and teams using OpenRouter LLM.
 * Reports are persisted to Firestore and re-used until manually regenerated.
 *
 * Uses `getFirestore()` directly (not req.firebase) so it works outside
 * Express request context.
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from '../../../utils/logger.js';
import { buildEliteContext, resolvePrimarySport } from './elite-context.js';

// ─── Shared Helpers ─────────────────────────────────────────────────────────

/** Strip markdown code fences from LLM JSON output. */
function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return cleaned;
}

/** Clamp a number to 0-99 range. */
function clamp99(val: unknown): number {
  const n = typeof val === 'number' ? val : Number(val) || 0;
  return Math.max(0, Math.min(99, Math.round(n)));
}

/** Clamp a number to 0-100 range. */
function clamp100(val: unknown): number {
  const n = typeof val === 'number' ? val : Number(val) || 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Safely coerce to string array. */
function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v) => typeof v === 'string' && v.length > 0).slice(0, 10);
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface RawProfileData {
  userData: Record<string, unknown>;
  stats: Record<string, unknown>[];
  metrics: Record<string, unknown>[];
  gameLogs: Record<string, unknown>[];
  recruiting: Record<string, unknown>[];
  awards: Record<string, unknown>[];
  schedule: Record<string, unknown>[];
  scoutReports: Record<string, unknown>[];
  connectedSources: Record<string, unknown>[];
}

interface RawTeamData {
  teamData: Record<string, unknown>;
  roster: Record<string, unknown>[];
  staff: Record<string, unknown>[];
  schedule: Record<string, unknown>[];
  stats: Record<string, unknown>[];
  seasonHistory: Record<string, unknown>[];
  sponsors: Record<string, unknown>[];
}

// ─── Intel Generation Service ───────────────────────────────────────────────

export class IntelGenerationService {
  private get db(): Firestore {
    return getFirestore();
  }

  private resolveDb(dbOverride?: Firestore): Firestore {
    return dbOverride ?? this.db;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ATHLETE INTEL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch the stored athlete Intel report.
   */
  async getAthleteIntel(
    userId: string,
    dbOverride?: Firestore
  ): Promise<Record<string, unknown> | null> {
    const db = this.resolveDb(dbOverride);
    const snap = await db
      .collection('Users')
      .doc(userId)
      .collection('intel_reports')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  /**
   * Generate a full athlete Intel report using OpenRouter LLM.
   */
  async generateAthleteIntel(
    userId: string,
    dbOverride?: Firestore
  ): Promise<Record<string, unknown>> {
    const db = this.resolveDb(dbOverride);
    const userDoc = await db.collection('Users').doc(userId).get();
    if (!userDoc.exists) throw new Error('User not found');

    const userData = userDoc.data() ?? {};

    // ── Gather all raw profile data in parallel ──
    const raw = await this.gatherAthleteData(userId, userData, db);

    // ── Build citations from connected sources ──
    const citations = this.buildCitations(raw.connectedSources);

    // ── Determine data availability ──
    const dataAvailability = {
      hasMetrics: raw.metrics.length > 0,
      hasStats: raw.stats.length > 0,
      hasGameLogs: raw.gameLogs.length > 0,
      hasRecruiting: raw.recruiting.length > 0,
      hasSchedule: raw.schedule.length > 0,
      hasAcademics: !!(userData['gpa'] || userData['satScore'] || userData['actScore']),
      hasVideo: !!(userData['highlightVideoUrl'] || userData['profileVideoUrl']),
      hasAwards: raw.awards.length > 0,
    };

    // ── Build missing data prompts ──
    const missingDataPrompts = this.buildMissingDataPrompts(dataAvailability);

    // ── Build LLM prompt ──
    const eliteContext = buildEliteContext(userData);
    const sport = resolvePrimarySport(userData) || 'General';
    const sports = (userData['sports'] as Record<string, unknown>[] | undefined) ?? [];
    const primaryPosition = (sports[0]?.['position'] as string) || 'Unknown';

    const prompt = this.buildAthleteIntelPrompt(
      eliteContext,
      sport,
      primaryPosition,
      raw,
      dataAvailability,
      citations
    );

    // ── Call OpenRouter ──
    let parsed: Record<string, unknown>;
    try {
      const { OpenRouterService } = await import('../llm/openrouter.service.js');
      const llm = new OpenRouterService();
      const result = await llm.complete(
        [
          {
            role: 'system',
            content:
              'You are Agent X, the AI-powered sports intelligence analyst for NXT1. ' +
              'You produce structured, data-backed athlete scouting reports. ' +
              'Be authoritative, specific, and cite sources when possible. ' +
              'Output valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        {
          tier: 'evaluator',
          maxTokens: 4096,
          temperature: 0.6,
          jsonMode: true,
        }
      );

      if (!result.content) throw new Error('Empty LLM response');
      parsed = JSON.parse(stripMarkdownFences(result.content));
    } catch (err) {
      logger.error('[IntelGenerationService] LLM call failed for athlete', { userId, err });
      throw new Error('Intel generation failed — please try again', { cause: err });
    }

    // ── Normalize and validate output ──
    const report = this.normalizeAthleteReport(
      userId,
      sport,
      primaryPosition,
      parsed,
      dataAvailability,
      citations,
      missingDataPrompts
    );

    // ── Persist to Firestore ──
    const docRef = db.collection('Users').doc(userId).collection('intel_reports').doc();

    await docRef.set({
      ...report,
      id: docRef.id,
      generatedAt: FieldValue.serverTimestamp(),
    });

    logger.info('[IntelGenerationService] Athlete intel generated', {
      userId,
      reportId: docRef.id,
      overallScore: report['overallScore'],
    });

    return { ...report, id: docRef.id, generatedAt: new Date().toISOString() };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM INTEL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch the stored team Intel report.
   */
  async getTeamIntel(
    teamId: string,
    dbOverride?: Firestore
  ): Promise<Record<string, unknown> | null> {
    const db = this.resolveDb(dbOverride);
    const snap = await db
      .collection('Teams')
      .doc(teamId)
      .collection('intel_reports')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  /**
   * Generate a full team Intel report using OpenRouter LLM.
   */
  async generateTeamIntel(
    teamId: string,
    dbOverride?: Firestore
  ): Promise<Record<string, unknown>> {
    const db = this.resolveDb(dbOverride);
    const teamDoc = await db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists) throw new Error('Team not found');

    const teamData = teamDoc.data() ?? {};

    // ── Gather all raw team data in parallel ──
    const raw = await this.gatherTeamData(teamId, teamData, db);

    // ── Build LLM prompt ──
    const prompt = this.buildTeamIntelPrompt(teamData, raw);

    // ── Call OpenRouter ──
    let parsed: Record<string, unknown>;
    try {
      const { OpenRouterService } = await import('../llm/openrouter.service.js');
      const llm = new OpenRouterService();
      const result = await llm.complete(
        [
          {
            role: 'system',
            content:
              'You are Agent X, the AI-powered sports intelligence analyst for NXT1. ' +
              'You produce structured, data-backed team scouting reports. ' +
              'Be authoritative and specific. Output valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        {
          tier: 'evaluator',
          maxTokens: 4096,
          temperature: 0.6,
          jsonMode: true,
        }
      );

      if (!result.content) throw new Error('Empty LLM response');
      parsed = JSON.parse(stripMarkdownFences(result.content));
    } catch (err) {
      logger.error('[IntelGenerationService] LLM call failed for team', { teamId, err });
      throw new Error('Intel generation failed — please try again', { cause: err });
    }

    // ── Normalize and persist ──
    const teamName = (teamData['teamName'] as string) || 'Unknown';
    const sport = (teamData['sport'] as string) || 'General';

    const report = this.normalizeTeamReport(teamId, teamName, sport, parsed);

    const docRef = db.collection('Teams').doc(teamId).collection('intel_reports').doc();

    await docRef.set({
      ...report,
      id: docRef.id,
      generatedAt: FieldValue.serverTimestamp(),
    });

    logger.info('[IntelGenerationService] Team intel generated', {
      teamId,
      reportId: docRef.id,
    });

    return { ...report, id: docRef.id, generatedAt: new Date().toISOString() };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA GATHERING
  // ═══════════════════════════════════════════════════════════════════════════

  private async gatherAthleteData(
    userId: string,
    userData: Record<string, unknown>,
    db: Firestore
  ): Promise<RawProfileData> {
    const userRef = db.collection('Users').doc(userId);

    const [
      statsSnap,
      metricsSnap,
      gameLogsSnap,
      recruitingSnap,
      awardsSnap,
      scheduleSnap,
      scoutSnap,
    ] = await Promise.all([
      userRef.collection('verified_stats').get(),
      userRef.collection('verified_metrics').get(),
      userRef.collection('game_logs').get(),
      userRef.collection('recruiting_activities').get(),
      userRef.collection('awards').get(),
      userRef.collection('schedule_events').get(),
      userRef.collection('scout_reports').orderBy('createdAt', 'desc').limit(5).get(),
    ]);

    const connectedSources =
      (userData['connectedSources'] as Record<string, unknown>[] | undefined) ?? [];

    return {
      userData,
      stats: statsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      metrics: metricsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      gameLogs: gameLogsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      recruiting: recruitingSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      awards: awardsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      schedule: scheduleSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      scoutReports: scoutSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      connectedSources,
    };
  }

  private async gatherTeamData(
    teamId: string,
    teamData: Record<string, unknown>,
    db: Firestore
  ): Promise<RawTeamData> {
    const teamRef = db.collection('Teams').doc(teamId);

    const [rosterSnap, staffSnap, scheduleSnap, statsSnap] = await Promise.all([
      teamRef.collection('roster').get(),
      teamRef.collection('staff').get(),
      teamRef.collection('schedule_events').get(),
      teamRef.collection('stats').get(),
    ]);

    return {
      teamData,
      roster: rosterSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      staff: staffSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      schedule: scheduleSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      stats: statsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      seasonHistory: (teamData['seasonHistory'] as Record<string, unknown>[] | undefined) ?? [],
      sponsors: (teamData['sponsors'] as Record<string, unknown>[] | undefined) ?? [],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROMPT BUILDING
  // ═══════════════════════════════════════════════════════════════════════════

  private buildAthleteIntelPrompt(
    eliteContext: string,
    sport: string,
    position: string,
    raw: RawProfileData,
    _availability: Record<string, boolean>,
    citations: Array<{ platform: string; label: string; url?: string }>
  ): string {
    const metricsJson =
      raw.metrics.length > 0
        ? JSON.stringify(raw.metrics.slice(0, 50))
        : 'NONE — athlete has not added measurables yet';

    const statsJson =
      raw.stats.length > 0
        ? JSON.stringify(raw.stats.slice(0, 50))
        : 'NONE — athlete has not added stats yet';

    const gameLogsJson =
      raw.gameLogs.length > 0 ? JSON.stringify(raw.gameLogs.slice(0, 30)) : 'NONE';

    const recruitingJson =
      raw.recruiting.length > 0
        ? JSON.stringify(raw.recruiting.slice(0, 30))
        : 'NONE — no recruiting activity recorded';

    const awardsJson = raw.awards.length > 0 ? JSON.stringify(raw.awards.slice(0, 20)) : 'NONE';

    const sourcesStr =
      citations.length > 0
        ? citations.map((c) => `${c.platform}: ${c.label}`).join(', ')
        : 'Self-reported only';

    return `
═══ ATHLETE PROFILE (Elite Context) ═══
${eliteContext}

═══ RAW DATA FOR INTEL GENERATION ═══

SPORT: ${sport}
PRIMARY POSITION: ${position}

MEASURABLES:
${metricsJson}

SEASON STATS:
${statsJson}

GAME LOGS:
${gameLogsJson}

RECRUITING ACTIVITY:
${recruitingJson}

AWARDS/HONORS:
${awardsJson}

DATA SOURCES CONNECTED: ${sourcesStr}

═══ TASK ═══
Analyze this athlete's complete profile data and produce a structured JSON scouting/intel report.

CRITICAL RULES:
1. Base ALL ratings and projections on the ACTUAL data provided. Do NOT invent stats.
2. If a data category is "NONE", acknowledge the gap and lower confidence accordingly.
3. Cite which data source (e.g., "maxpreps", "hudl", "self-reported") was used for key claims.
4. Be brutally honest but encouraging — real coaches will read this.

Output this exact JSON structure:
{
  "overallScore": <0-99 integer>,
  "tierClassification": "<Elite|Premium|Rising|Developing|On Radar>",
  "ratings": {
    "physical": <0-99>,
    "technical": <0-99>,
    "mental": <0-99>,
    "potential": <0-99>
  },
  "percentileRankings": {
    "overall": <0-100>,
    "position": <0-100>,
    "state": <0-100>,
    "measurableFit": <0-100>
  },
  "levelProjections": {
    "d1": <0-100 probability>,
    "d2": <0-100>,
    "d3": <0-100>,
    "naia": <0-100>,
    "juco": <0-100>
  },
  "aiBrief": "<2-4 paragraph narrative scouting report>",
  "strengths": ["<strength 1>", "<strength 2>", ...up to 5],
  "areasForImprovement": ["<area 1>", "<area 2>", ...up to 5],
  "measurableHighlights": [
    {"label": "<e.g. 40-Yard Dash>", "value": "<4.52>", "unit": "<sec>", "percentile": <85>, "source": "<self-reported|maxpreps|etc>", "trend": "<up|down|stable>"}
    ...up to 6
  ],
  "statHighlights": [
    {"label": "<e.g. Passing Yards>", "value": "<2,847>", "season": "<2025-26>", "category": "<Passing>", "source": "<maxpreps|self-reported>"}
    ...up to 6
  ],
  "recruitingSummary": ${
    raw.recruiting.length > 0
      ? '{"totalOffers":<N>,"totalVisits":<N>,"totalCamps":<N>,"topDivision":"<D1/D2/etc>","topPrograms":["<school1>",...],"narrative":"<1-2 sentence summary>"}'
      : 'null'
  },
  "quickCommands": [
    {"id":"build-target-list","label":"Build College Target List","description":"Find programs that match this profile","icon":"school","agentPrompt":"Build a target list of colleges based on my Intel report"},
    {"id":"draft-intro-email","label":"Draft Introduction Email","description":"Write an email showcasing these strengths to coaches","icon":"mail","agentPrompt":"Draft a recruiting email to coaches highlighting my Intel strengths"}
  ]
}
`.trim();
  }

  private buildTeamIntelPrompt(teamData: Record<string, unknown>, raw: RawTeamData): string {
    const teamName = (teamData['teamName'] as string) || 'Unknown';
    const sport = (teamData['sport'] as string) || 'Unknown';
    const teamType = (teamData['teamType'] as string) || 'high-school';
    const location = [teamData['city'], teamData['state']].filter(Boolean).join(', ') || 'Unknown';
    const description = (teamData['description'] as string) || '';
    const record = teamData['record'] as Record<string, unknown> | undefined;
    const branding = teamData['branding'] as Record<string, unknown> | undefined;

    const rosterJson = raw.roster.length > 0 ? JSON.stringify(raw.roster.slice(0, 50)) : 'NONE';

    const staffJson = raw.staff.length > 0 ? JSON.stringify(raw.staff.slice(0, 20)) : 'NONE';

    const statsJson = raw.stats.length > 0 ? JSON.stringify(raw.stats.slice(0, 30)) : 'NONE';

    const historyJson =
      raw.seasonHistory.length > 0 ? JSON.stringify(raw.seasonHistory.slice(0, 10)) : 'NONE';

    return `
═══ TEAM PROFILE ═══
Team: ${teamName}
Sport: ${sport}
Type: ${teamType}
Location: ${location}
Description: ${description}
Record: ${record ? JSON.stringify(record) : 'Not set'}
Mascot: ${branding?.['mascot'] ?? 'Not set'}

═══ RAW DATA ═══

ROSTER (${raw.roster.length} members):
${rosterJson}

COACHING STAFF:
${staffJson}

SEASON STATS:
${statsJson}

SEASON HISTORY:
${historyJson}

═══ TASK ═══
Analyze this team's complete data and produce a structured JSON intel report.

CRITICAL RULES:
1. Base ALL analysis on ACTUAL data provided. Do NOT invent players or stats.
2. If a data category is "NONE", acknowledge the gap.
3. For top prospects, only list actual roster members from the data provided.
4. Be specific and actionable.

Output this exact JSON structure:
{
  "seasonOutlook": "<2-3 paragraph analysis of team's current season and direction>",
  "teamIdentity": "<1 paragraph on what defines this program>",
  "strengths": ["<strength 1>", ...up to 5],
  "areasForImprovement": ["<area 1>", ...up to 5],
  "topProspects": [
    {"userId":"<id from roster>","name":"<full name>","position":"<pos>","classYear":"<year>","overallScore":<0-99>,"tierClassification":"<Elite|Premium|Rising|Developing|On Radar>","profileCode":"<if available>"}
    ...up to 5
  ],
  "rosterDepthSummary": "<1-2 paragraph analysis of roster composition, depth, class distribution>",
  "classBreakdown": {"2025": <count>, "2026": <count>, ...},
  "seasonHistory": [
    {"season":"<2024-25>","record":"<12-3>","highlights":["<highlight>"],"conference":"<if known>"}
  ],
  "overallRecord": "<overall W-L-T or 'Not available'>",
  "historicalNarrative": "<1-2 paragraph on the program's trajectory over recent seasons>",
  "recruitingPipeline": "<1 paragraph on where athletes are going / college placements>",
  "competitiveAnalysis": "<1 paragraph on conference standing and competitive position>",
  "quickCommands": [
    {"id":"scout-roster","label":"Scout Full Roster","description":"Generate individual Intel for all athletes","icon":"people","agentPrompt":"Generate Intel reports for all athletes on my team roster"},
    {"id":"recruiting-outreach","label":"Build Recruiting Outreach","description":"Create a campaign to promote top prospects","icon":"mail","agentPrompt":"Build a recruiting outreach plan for my team's top prospects"}
  ]
}
`.trim();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALIZATION & VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  private normalizeAthleteReport(
    userId: string,
    sport: string,
    position: string,
    parsed: Record<string, unknown>,
    dataAvailability: Record<string, boolean>,
    citations: Array<{ platform: string; label: string; url?: string; lastSyncedAt?: string }>,
    missingDataPrompts: Array<Record<string, string>>
  ): Record<string, unknown> {
    const ratings = (parsed['ratings'] ?? {}) as Record<string, unknown>;
    const percentiles = (parsed['percentileRankings'] ?? {}) as Record<string, unknown>;
    const projections = (parsed['levelProjections'] ?? {}) as Record<string, unknown>;

    return {
      userId,
      sportName: sport,
      primaryPosition: position,
      status: 'ready',
      generatedBy: 'agent-x',

      overallScore: clamp99(parsed['overallScore']),
      tierClassification: this.validateTier(parsed['tierClassification']),

      ratings: {
        physical: clamp99(ratings['physical']),
        technical: clamp99(ratings['technical']),
        mental: clamp99(ratings['mental']),
        potential: clamp99(ratings['potential']),
      },

      percentileRankings: {
        overall: clamp100(percentiles['overall']),
        position: clamp100(percentiles['position']),
        state: clamp100(percentiles['state']),
        measurableFit: clamp100(percentiles['measurableFit']),
      },

      levelProjections: {
        d1: clamp100(projections['d1']),
        d2: clamp100(projections['d2']),
        d3: clamp100(projections['d3']),
        naia: clamp100(projections['naia']),
        juco: clamp100(projections['juco']),
      },

      aiBrief: typeof parsed['aiBrief'] === 'string' ? parsed['aiBrief'] : '',
      strengths: toStringArray(parsed['strengths']),
      areasForImprovement: toStringArray(parsed['areasForImprovement']),

      measurableHighlights: this.normalizeHighlights(parsed['measurableHighlights']),
      statHighlights: this.normalizeStatHighlights(parsed['statHighlights']),
      recruitingSummary: this.normalizeRecruitingSummary(parsed['recruitingSummary']),

      dataAvailability,
      citations,
      missingDataPrompts,
      quickCommands: this.normalizeQuickCommands(parsed['quickCommands']),
    };
  }

  private normalizeTeamReport(
    teamId: string,
    teamName: string,
    sport: string,
    parsed: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      teamId,
      teamName,
      sport,
      status: 'ready',
      generatedBy: 'agent-x',

      seasonOutlook: typeof parsed['seasonOutlook'] === 'string' ? parsed['seasonOutlook'] : '',
      teamIdentity: typeof parsed['teamIdentity'] === 'string' ? parsed['teamIdentity'] : '',
      strengths: toStringArray(parsed['strengths']),
      areasForImprovement: toStringArray(parsed['areasForImprovement']),

      topProspects: this.normalizeTopProspects(parsed['topProspects']),
      rosterDepthSummary:
        typeof parsed['rosterDepthSummary'] === 'string' ? parsed['rosterDepthSummary'] : '',
      classBreakdown:
        typeof parsed['classBreakdown'] === 'object' ? (parsed['classBreakdown'] ?? {}) : {},

      seasonHistory: this.normalizeSeasonHistory(parsed['seasonHistory']),
      overallRecord: typeof parsed['overallRecord'] === 'string' ? parsed['overallRecord'] : '',
      historicalNarrative:
        typeof parsed['historicalNarrative'] === 'string' ? parsed['historicalNarrative'] : '',

      recruitingPipeline:
        typeof parsed['recruitingPipeline'] === 'string' ? parsed['recruitingPipeline'] : '',
      competitiveAnalysis:
        typeof parsed['competitiveAnalysis'] === 'string' ? parsed['competitiveAnalysis'] : '',

      citations: [],
      missingDataPrompts: [],
      quickCommands: this.normalizeQuickCommands(parsed['quickCommands']),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIELD NORMALIZERS
  // ═══════════════════════════════════════════════════════════════════════════

  private validateTier(val: unknown): string {
    const valid = ['Elite', 'Premium', 'Rising', 'Developing', 'On Radar'];
    const str = typeof val === 'string' ? val : 'Developing';
    return valid.includes(str) ? str : 'Developing';
  }

  private buildCitations(
    connectedSources: Record<string, unknown>[]
  ): Array<{ platform: string; label: string; url?: string; lastSyncedAt?: string }> {
    return connectedSources.map((src) => ({
      platform: (src['platform'] as string) || 'unknown',
      label: (src['profileUrl'] as string) || (src['platform'] as string) || 'Connected source',
      url: (src['profileUrl'] as string) || undefined,
      lastSyncedAt: (src['lastSyncedAt'] as string) || undefined,
    }));
  }

  private buildMissingDataPrompts(
    availability: Record<string, boolean>
  ): Array<Record<string, string>> {
    const prompts: Array<Record<string, string>> = [];

    if (!availability['hasMetrics']) {
      prompts.push({
        category: 'hasMetrics',
        title: 'Add Your Measurables',
        description:
          'Agent X needs your height, weight, 40-yard dash, and other measurables to accurately project your recruiting level.',
        actionLabel: 'Add Metrics',
        actionRoute: '/edit-profile/metrics',
        icon: 'body',
      });
    }
    if (!availability['hasStats']) {
      prompts.push({
        category: 'hasStats',
        title: 'Add Season Stats',
        description:
          'Upload your season statistics so Agent X can evaluate your on-field production and compare against position benchmarks.',
        actionLabel: 'Add Stats',
        actionRoute: '/edit-profile/stats',
        icon: 'stats-chart',
      });
    }
    if (!availability['hasVideo']) {
      prompts.push({
        category: 'hasVideo',
        title: 'Upload Highlight Video',
        description:
          'Coaches want to see you play. Add your highlight reel to strengthen your Intel report.',
        actionLabel: 'Add Video',
        actionRoute: '/edit-profile/media',
        icon: 'videocam',
      });
    }
    if (!availability['hasRecruiting']) {
      prompts.push({
        category: 'hasRecruiting',
        title: 'Log Recruiting Activity',
        description:
          'Track your offers, visits, and camps so Agent X can map your recruiting market.',
        actionLabel: 'Add Activity',
        actionRoute: '/edit-profile/recruiting',
        icon: 'school',
      });
    }
    if (!availability['hasAcademics']) {
      prompts.push({
        category: 'hasAcademics',
        title: 'Add Academic Info',
        description:
          'GPA and test scores are critical for eligibility projections and program matching.',
        actionLabel: 'Add Academics',
        actionRoute: '/edit-profile/academics',
        icon: 'school',
      });
    }

    return prompts;
  }

  private normalizeHighlights(val: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(val)) return [];
    return val.slice(0, 6).map((h) => ({
      label: String(h?.['label'] ?? ''),
      value: String(h?.['value'] ?? ''),
      unit: h?.['unit'] ? String(h['unit']) : undefined,
      percentile: typeof h?.['percentile'] === 'number' ? clamp100(h['percentile']) : undefined,
      source: String(h?.['source'] ?? 'self-reported'),
      trend: ['up', 'down', 'stable'].includes(h?.['trend']) ? h['trend'] : undefined,
    }));
  }

  private normalizeStatHighlights(val: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(val)) return [];
    return val.slice(0, 6).map((s) => ({
      label: String(s?.['label'] ?? ''),
      value: String(s?.['value'] ?? ''),
      season: String(s?.['season'] ?? ''),
      category: String(s?.['category'] ?? ''),
      source: String(s?.['source'] ?? 'self-reported'),
    }));
  }

  private normalizeRecruitingSummary(val: unknown): Record<string, unknown> | null {
    if (!val || typeof val !== 'object') return null;
    const v = val as Record<string, unknown>;
    return {
      totalOffers: typeof v['totalOffers'] === 'number' ? v['totalOffers'] : 0,
      totalVisits: typeof v['totalVisits'] === 'number' ? v['totalVisits'] : 0,
      totalCamps: typeof v['totalCamps'] === 'number' ? v['totalCamps'] : 0,
      topDivision: String(v['topDivision'] ?? ''),
      topPrograms: toStringArray(v['topPrograms']),
      narrative: String(v['narrative'] ?? ''),
    };
  }

  private normalizeTopProspects(val: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(val)) return [];
    return val.slice(0, 5).map((p) => ({
      userId: String(p?.['userId'] ?? ''),
      name: String(p?.['name'] ?? ''),
      position: String(p?.['position'] ?? ''),
      classYear: String(p?.['classYear'] ?? ''),
      overallScore: clamp99(p?.['overallScore']),
      tierClassification: this.validateTier(p?.['tierClassification']),
      profileCode: p?.['profileCode'] ? String(p['profileCode']) : undefined,
    }));
  }

  private normalizeSeasonHistory(val: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(val)) return [];
    return val.slice(0, 10).map((s) => ({
      season: String(s?.['season'] ?? ''),
      record: String(s?.['record'] ?? ''),
      highlights: toStringArray(s?.['highlights']),
      conference: s?.['conference'] ? String(s['conference']) : undefined,
    }));
  }

  private normalizeQuickCommands(val: unknown): Array<Record<string, string>> {
    if (!Array.isArray(val)) return [];
    return val.slice(0, 4).map((c) => ({
      id: String(c?.['id'] ?? ''),
      label: String(c?.['label'] ?? ''),
      description: String(c?.['description'] ?? ''),
      icon: String(c?.['icon'] ?? 'flash'),
      agentPrompt: String(c?.['agentPrompt'] ?? ''),
    }));
  }
}
