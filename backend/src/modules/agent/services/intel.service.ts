/**
 * @fileoverview Intel Generation Service — AI-Powered Profile Intelligence
 * @module @nxt1/backend/modules/agent/services
 *
 * Generates on-demand Intel reports for athletes and teams using OpenRouter LLM.
 * Agent X is the athlete's advocate — it tells their story, not their score.
 * Reports are persisted to Firestore and re-used until manually regenerated.
 *
 * Data sources: root Firestore collections only (PlayerStats, PlayerMetrics,
 * Recruiting, Events, Awards, RosterEntries, TeamStats).
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from '../../../utils/logger.js';
import { getSeasonInfo, resolvePrimarySport, ContextBuilder } from '../memory/context-builder.js';
import { VectorMemoryService } from '../memory/vector.service.js';
import { OpenRouterService } from '../llm/openrouter.service.js';

// ─── Section Order Constants ─────────────────────────────────────────────────

const ATHLETE_SECTION_ORDER = [
  'agent_x_brief',
  'athletic_measurements',
  'season_stats',
  'recruiting_activity',
  'academic_profile',
  'awards_honors',
] as const;

type AthleteSectionId = (typeof ATHLETE_SECTION_ORDER)[number];

const TEAM_SECTION_ORDER = ['agent_overview', 'team', 'stats', 'recruiting', 'schedule'] as const;

type TeamSectionId = (typeof TEAM_SECTION_ORDER)[number];

// ─── Section Metadata ────────────────────────────────────────────────────────

const ATHLETE_SECTION_META: Readonly<Record<AthleteSectionId, { title: string; icon: string }>> = {
  agent_x_brief: { title: 'Overview', icon: 'sparkles' },
  athletic_measurements: { title: 'Metrics', icon: 'body' },
  season_stats: { title: 'Stats', icon: 'stats-chart' },
  recruiting_activity: { title: 'Recruiting', icon: 'school' },
  academic_profile: { title: 'Academic', icon: 'book' },
  awards_honors: { title: 'Awards & Honors', icon: 'trophy' },
};

const TEAM_SECTION_META: Readonly<Record<TeamSectionId, { title: string; icon: string }>> = {
  agent_overview: { title: 'Agent Overview', icon: 'sparkles' },
  team: { title: 'Team', icon: 'people' },
  stats: { title: 'Stats', icon: 'stats-chart' },
  recruiting: { title: 'Recruiting', icon: 'school' },
  schedule: { title: 'Schedule', icon: 'calendar' },
};

// ─── Shared Helpers ─────────────────────────────────────────────────────────

/** Strip markdown code fences from LLM JSON output. */
function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return cleaned;
}

/** Compute staleAt timestamp 30 days from now. */
function computeStaleAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface RawProfileData {
  userData: Record<string, unknown>;
  stats: Record<string, unknown>[];
  metrics: Record<string, unknown>[];
  events: Record<string, unknown>[];
  recruiting: Record<string, unknown>[];
  awards: Record<string, unknown>[];
  scoutReports: Record<string, unknown>[];
  connectedSources: Record<string, unknown>[];
}

interface RawTeamData {
  teamData: Record<string, unknown>;
  roster: Record<string, unknown>[];
  staff: Record<string, unknown>[];
  events: Record<string, unknown>[];
  teamStats: Record<string, unknown>[];
  playerStats: Record<string, unknown>[];
  recruiting: Record<string, unknown>[];
}

interface NormalizedSection {
  id: string;
  title: string;
  icon: string;
  content: string;
  items?: Array<{
    label: string;
    value: string;
    unit?: string;
    source?: string;
    verified?: boolean;
    faviconUrl?: string;
    date?: string;
    sublabel?: string;
  }>;
  sources?: Array<{
    platform: string;
    label: string;
    url?: string;
    verified?: boolean;
    faviconUrl?: string;
  }>;
}

// ─── Intel Generation Service ───────────────────────────────────────────────

export class IntelGenerationService {
  private readonly llmService?: OpenRouterService;
  private ownedLlmService?: OpenRouterService;
  private contextBuilder?: ContextBuilder;

  constructor(llmService?: OpenRouterService, contextBuilder?: ContextBuilder) {
    this.llmService = llmService;
    this.contextBuilder = contextBuilder;
  }

  private get db(): Firestore {
    return getFirestore();
  }

  private resolveDb(dbOverride?: Firestore): Firestore {
    return dbOverride ?? this.db;
  }

  private getOrCreateLlmService(): OpenRouterService {
    if (this.llmService) return this.llmService;
    if (!this.ownedLlmService) {
      this.ownedLlmService = new OpenRouterService();
    }
    return this.ownedLlmService;
  }

  private getOrCreateContextBuilder(): ContextBuilder {
    if (this.contextBuilder) return this.contextBuilder;
    this.contextBuilder = new ContextBuilder(new VectorMemoryService(this.getOrCreateLlmService()));
    return this.contextBuilder;
  }

  private buildAthleteScaffolding(sport: string, now: Date = new Date()): string {
    const lines: string[] = [];
    const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const season = sport ? getSeasonInfo(sport, now) : null;

    if (season && sport) {
      lines.push(
        `Calendar Context: It is currently ${monthYear}. For ${sport}, this is the ${season.phase} period. Focus areas: ${season.focus}.`
      );
    } else {
      lines.push(`Calendar Context: It is currently ${monthYear}.`);
    }

    lines.push(
      'Context: Use season timing to understand recruiting urgency and development stage, but never invent data that is not present in the profile.'
    );

    return lines.join('\n');
  }

  private async buildAthletePromptContext(
    userId: string,
    userData: Record<string, unknown>,
    db: Firestore
  ): Promise<{ promptContextText: string; sport: string; primaryPosition: string }> {
    const fallbackSport = resolvePrimarySport(userData) || 'General';
    const sports = (userData['sports'] as Record<string, unknown>[] | undefined) ?? [];
    const activeSportIndex =
      typeof userData['activeSportIndex'] === 'number' ? userData['activeSportIndex'] : 0;
    const activeSport = sports[activeSportIndex] ?? sports[0];
    const fallbackPosition =
      (Array.isArray(activeSport?.['positions']) && activeSport['positions'].length > 0
        ? String(activeSport['positions'][0])
        : undefined) ||
      (activeSport?.['position'] as string | undefined) ||
      (userData['position'] as string | undefined) ||
      'Unknown';
    const query = [
      'athlete intel report',
      `sport: ${fallbackSport}`,
      `position: ${fallbackPosition}`,
      'retrieve performance data, recruiting context, awards, profile updates, measurables, and durable memory',
    ].join(' | ');

    try {
      const builder = this.getOrCreateContextBuilder();
      const promptContext = await builder.buildPromptContext(userId, query, db);
      const sport = promptContext.profile.sport || fallbackSport;
      return {
        promptContextText: [
          builder.compressToPrompt(
            promptContext.profile,
            promptContext.memories,
            promptContext.recentSyncSummaries ?? []
          ),
          this.buildAthleteScaffolding(sport),
        ].join('\n'),
        sport,
        primaryPosition: promptContext.profile.position || fallbackPosition,
      };
    } catch (err) {
      logger.warn('[IntelGenerationService] Failed to build vector-backed prompt context', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });

      const fallbackBuilder = new ContextBuilder();
      const profile = await fallbackBuilder.buildContext(userId, db);
      const sport = profile.sport || fallbackSport;
      return {
        promptContextText: [
          fallbackBuilder.compressToPrompt(profile),
          this.buildAthleteScaffolding(sport),
        ].join('\n'),
        sport,
        primaryPosition: profile.position || fallbackPosition,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ATHLETE INTEL
  // ═══════════════════════════════════════════════════════════════════════════

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

  async generateAthleteIntel(
    userId: string,
    dbOverride?: Firestore
  ): Promise<Record<string, unknown>> {
    const db = this.resolveDb(dbOverride);
    const userDoc = await db.collection('Users').doc(userId).get();
    if (!userDoc.exists) throw new Error('User not found');

    const userData = userDoc.data() ?? {};

    // ── Gather all raw profile data in parallel from root collections ──
    const raw = await this.gatherAthleteData(userId, userData, db);

    // ── Build citations from connected sources ──
    const citations = this.buildCitations(raw.connectedSources);

    // ── Determine data availability ──
    const dataAvailability = {
      hasMetrics: raw.metrics.length > 0,
      hasStats: raw.stats.length > 0,
      hasGameLogs: false,
      hasRecruiting: raw.recruiting.length > 0,
      hasSchedule: raw.events.length > 0,
      hasAcademics: !!(
        (userData['academics'] as Record<string, unknown> | undefined)?.['gpa'] ||
        userData['gpa'] ||
        userData['satScore'] ||
        userData['actScore']
      ),
      hasVideo: !!(userData['highlightVideoUrl'] || userData['profileVideoUrl']),
      hasAwards: raw.awards.length > 0,
    };

    // ── Build missing data prompts ──
    const missingDataPrompts = this.buildMissingDataPrompts(dataAvailability);

    // ── Build LLM prompt from vector-backed prompt context ──
    const { promptContextText, sport, primaryPosition } = await this.buildAthletePromptContext(
      userId,
      userData,
      db
    );

    const prompt = this.buildAthleteIntelPrompt(
      promptContextText,
      sport,
      primaryPosition,
      raw,
      dataAvailability,
      citations
    );

    // ── Call OpenRouter ──
    let parsed: Record<string, unknown>;
    try {
      const llm = this.getOrCreateLlmService();
      const result = await llm.complete(
        [
          {
            role: 'system',
            content:
              'You are Agent X — the AI sports intelligence engine powering NXT1. ' +
              'You generate PUBLIC scouting and recruiting intel reports written in the THIRD PERSON. ' +
              'These reports are read by coaches, scouts, and recruiting programs — NOT addressed to the athlete. ' +
              'Do NOT use "you", "your", or address the athlete directly at any point. ' +
              'Refer to the athlete by name or as "the athlete" or "the prospect". ' +
              'You never produce evaluation ratings, tier labels, or numeric scores. ' +
              'ABSOLUTE RULE: Do NOT invent, hallucinate, or fabricate any data. ' +
              "If a data field is 'NONE', write factual absence text only. " +
              'Never invent stats, school names, offers, measurables, or awards. ' +
              'Output valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        {
          tier: 'copywriting',
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
      citations,
      missingDataPrompts,
      dataAvailability
    );

    // ── Persist to Firestore ──
    const docRef = db.collection('Users').doc(userId).collection('intel_reports').doc();

    await docRef.set({
      ...report,
      id: docRef.id,
      generatedAt: FieldValue.serverTimestamp(),
    });

    logger.info('[IntelGenerationService] Athlete Intel report generated', {
      userId,
      reportId: docRef.id,
      sectionCount: (report['sections'] as unknown[]).length,
    });

    return { ...report, id: docRef.id, generatedAt: new Date().toISOString() };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM INTEL
  // ═══════════════════════════════════════════════════════════════════════════

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

  async generateTeamIntel(
    teamId: string,
    dbOverride?: Firestore
  ): Promise<Record<string, unknown>> {
    const db = this.resolveDb(dbOverride);
    const teamDoc = await db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists) throw new Error('Team not found');

    const teamData = teamDoc.data() ?? {};

    // ── Gather all raw team data in parallel from root collections ──
    const raw = await this.gatherTeamData(teamId, teamData, db);

    // ── Build citations ──
    const citations = this.buildCitations(
      (teamData['connectedSources'] as Record<string, unknown>[] | undefined) ?? []
    );

    // ── Build team context via RAG + vector memory (mirrors athlete path) ──
    let teamContextText = '';
    try {
      const builder = this.getOrCreateContextBuilder();
      const query = [
        'team intel report',
        `sport: ${(teamData['teamName'] as string) || 'unknown'}`,
        'retrieve roster, staff, stats, recruiting, schedule, program identity',
      ].join(' | ');
      teamContextText = await builder.buildTeamPromptContext(teamId, teamData, query);
    } catch (err) {
      logger.warn('[IntelGenerationService] Failed to build team prompt context', {
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Build LLM prompt ──
    const prompt = this.buildTeamIntelPrompt(teamData, raw, teamContextText);

    // ── Call OpenRouter ──
    let parsed: Record<string, unknown>;
    try {
      const llm = this.getOrCreateLlmService();
      const result = await llm.complete(
        [
          {
            role: 'system',
            content:
              'You are Agent X — the AI sports intelligence engine powering NXT1. ' +
              'You generate PUBLIC program intel reports written in the THIRD PERSON. ' +
              'These reports are read by recruits, scouts, and opposing programs — NOT addressed to the coaching staff or athletes. ' +
              'Do NOT use "you", "your", or address the team or coaches directly at any point. ' +
              'Refer to the program by its team name. ' +
              'You never produce evaluation ratings or numeric scores for athletes. ' +
              'ABSOLUTE RULE: Do NOT invent, hallucinate, or fabricate any data. ' +
              "If a data field is 'NONE', write factual absence text only. " +
              'Never invent athlete names, win-loss records, commitments, or school names. ' +
              'Output valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        {
          tier: 'copywriting',
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

    const report = this.normalizeTeamReport(teamId, teamName, sport, parsed, citations);

    const docRef = db.collection('Teams').doc(teamId).collection('intel_reports').doc();

    await docRef.set({
      ...report,
      id: docRef.id,
      generatedAt: FieldValue.serverTimestamp(),
    });

    logger.info('[IntelGenerationService] Team Intel report generated', {
      teamId,
      reportId: docRef.id,
      sectionCount: (report['sections'] as unknown[]).length,
    });

    return { ...report, id: docRef.id, generatedAt: new Date().toISOString() };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA GATHERING — ROOT COLLECTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private async gatherAthleteData(
    userId: string,
    userData: Record<string, unknown>,
    db: Firestore
  ): Promise<RawProfileData> {
    const [statsSnap, metricsSnap, recruitingSnap, eventsSnap, awardsSnap, scoutSnap] =
      await Promise.all([
        // PlayerStats root collection — equality only, no composite index needed
        db.collection('PlayerStats').where('userId', '==', userId).get(),
        // PlayerMetrics root collection — equality only, sort in-memory (index may not be deployed yet)
        db.collection('PlayerMetrics').where('userId', '==', userId).get(),
        // Recruiting root collection — equality only, sort in-memory (index may not be deployed yet)
        db.collection('Recruiting').where('userId', '==', userId).get(),
        // Events root collection (camps, showcases, games) — composite index exists
        db
          .collection('Events')
          .where('ownerType', '==', 'user')
          .where('userId', '==', userId)
          .orderBy('date', 'desc')
          .limit(30)
          .get(),
        // Awards root collection — equality only, no composite index needed
        db.collection('Awards').where('userId', '==', userId).get(),
        // Scout reports (subcollection — kept for AI memory)
        db
          .collection('Users')
          .doc(userId)
          .collection('scout_reports')
          .orderBy('createdAt', 'desc')
          .limit(5)
          .get(),
      ]);

    const connectedSources =
      (userData['connectedSources'] as Record<string, unknown>[] | undefined) ?? [];

    // Sort in-memory for collections without deployed composite indexes
    const sortedMetrics = metricsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>)
      .sort((a, b) => {
        const aDate = String(a['dateRecorded'] ?? '');
        const bDate = String(b['dateRecorded'] ?? '');
        return bDate.localeCompare(aDate);
      })
      .slice(0, 20);

    const sortedRecruiting = recruitingSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>)
      .sort((a, b) => {
        const aDate = String(a['createdAt'] ?? '');
        const bDate = String(b['createdAt'] ?? '');
        return bDate.localeCompare(aDate);
      })
      .slice(0, 30);

    const awardsFromCollection = awardsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Transition fallback: if Awards collection is empty, check Users.awards[]
    // TODO: remove once awards backfill migration has run in production
    const legacyAwards =
      awardsFromCollection.length === 0 && Array.isArray(userData['awards'])
        ? (userData['awards'] as Record<string, unknown>[])
        : [];
    const awards = awardsFromCollection.length > 0 ? awardsFromCollection : legacyAwards;

    return {
      userData,
      stats: statsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      metrics: sortedMetrics,
      recruiting: sortedRecruiting,
      events: eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      awards,
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

    const [rosterSnap, staffSnap, eventsSnap, teamStatsSnap, playerStatsSnap, recruitingSnap] =
      await Promise.all([
        // RosterEntries root collection — N:N junction
        db.collection('RosterEntries').where('teamId', '==', teamId).get(),
        // Staff subcollection (kept — team-owned)
        teamRef.collection('staff').get(),
        // Events root collection (team events)
        db
          .collection('Events')
          .where('ownerType', '==', 'team')
          .where('userId', '==', teamId)
          .orderBy('date', 'desc')
          .limit(30)
          .get(),
        // TeamStats root collection — equality only, sort in-memory
        db.collection('TeamStats').where('teamId', '==', teamId).get(),
        // PlayerStats for team members — equality only, sort in-memory
        db.collection('PlayerStats').where('teamId', '==', teamId).limit(50).get(),
        // Recruiting prospects associated with this team
        db.collection('Recruiting').where('teamId', '==', teamId).limit(30).get(),
      ]);

    // Sort in-memory for TeamStats without deployed composite index
    const sortedTeamStats = teamStatsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>)
      .sort((a, b) => {
        const aSeason = String(a['season'] ?? '');
        const bSeason = String(b['season'] ?? '');
        return bSeason.localeCompare(aSeason);
      })
      .slice(0, 5);

    return {
      teamData,
      roster: rosterSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      staff: staffSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      events: eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      teamStats: sortedTeamStats,
      playerStats: playerStatsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      recruiting: recruitingSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROMPT BUILDING
  // ═══════════════════════════════════════════════════════════════════════════

  private buildAthleteIntelPrompt(
    promptContextText: string,
    sport: string,
    position: string,
    raw: RawProfileData,
    _availability: Record<string, boolean>,
    citations: Array<{ platform: string; label: string; url?: string; verified?: boolean }>
  ): string {
    const userData = raw.userData;
    const academic = (userData['academics'] as Record<string, unknown> | undefined) ?? {};
    const gpa = academic['gpa'] ?? userData['gpa'];
    const classOf = userData['classOf'];
    const satScore = academic['satScore'] ?? userData['satScore'];
    const actScore = academic['actScore'] ?? userData['actScore'];

    const metricsJson =
      raw.metrics.length > 0
        ? JSON.stringify(raw.metrics.slice(0, 50))
        : 'NONE — athlete has not added measurables yet';

    const statsJson =
      raw.stats.length > 0
        ? JSON.stringify(raw.stats.slice(0, 50))
        : 'NONE — athlete has not added stats yet';

    const recruitingJson =
      raw.recruiting.length > 0
        ? JSON.stringify(raw.recruiting.slice(0, 30))
        : 'NONE — no recruiting activity recorded';

    const eventsJson = raw.events.length > 0 ? JSON.stringify(raw.events.slice(0, 20)) : 'NONE';

    const awardsJson = raw.awards.length > 0 ? JSON.stringify(raw.awards.slice(0, 20)) : 'NONE';

    const academicJson = JSON.stringify({ gpa, classOf, satScore, actScore });

    const sourcesStr =
      citations.length > 0
        ? citations.map((c) => `${c.platform}${c.verified ? ' ✓' : ''}: ${c.label}`).join(', ')
        : 'Self-reported only';

    return `
═══ ATHLETE CONTEXT (RAG PROFILE + MEMORY) ═══
${promptContextText}

═══ RAW DATA FOR INTEL REPORT GENERATION ═══

SPORT: ${sport}
PRIMARY POSITION: ${position}

MEASURABLES (PlayerMetrics):
${metricsJson}

SEASON STATS (PlayerStats):
${statsJson}

RECRUITING ACTIVITY (Recruiting):
${recruitingJson}

CAMPS & EVENTS (Events):
${eventsJson}

AWARDS & HONORS (Awards):
${awardsJson}

ACADEMICS:
${academicJson}

DATA SOURCES CONNECTED: ${sourcesStr}

═══ TASK ═══
You are Agent X. Generate a 6-section athlete Intel report in JSON.
This is a PUBLIC scouting report — write in the THIRD PERSON throughout. Do NOT address the athlete directly. Do NOT use 'I', 'you', or 'your' when referring to the athlete. NXT1 tells the athlete's story objectively to recruiters and coaches, not to the athlete themselves.
Do NOT produce ratings, tier labels, or overall scores.
ABSOLUTE RULE: Base ALL content ONLY on the ACTUAL data provided above.
- If MEASURABLES data is 'NONE': for the athletic_measurements section, write only "No measurables have been added yet. Add your height, weight, and combine numbers to generate this section of your Intel report." Do NOT invent heights, weights, or combine numbers.
- If SEASON STATS data is 'NONE': for the season_stats section, write only "No stats have been recorded yet. Add your season stats to generate a full statistical breakdown in your Intel report." Do NOT invent statistics, records, or performance numbers.
- If RECRUITING ACTIVITY data is 'NONE': for the recruiting_activity section, write only "No recruiting activity has been recorded yet. Add your offers, campus visits, and school interest to generate your recruiting Intel." Do NOT invent offers, school names, or interest levels.
- If CAMPS & EVENTS data is 'NONE': mention only that no events have been logged yet, and encourage the athlete to add their camps and events to generate this section.
- If AWARDS & HONORS data is 'NONE': for the awards_honors section, write only "No awards have been recorded yet. Add your honors and accolades to generate this section of your Intel report." Do NOT invent accolades or recognition.
- If ACADEMICS data fields are null/undefined: write only "No academic information has been added yet. Add your GPA, test scores, and graduation year to generate your academic Intel." Do NOT invent GPA, test scores, or class year.

Output this EXACT JSON structure with all 6 sections:

{
  "sections": [
    {
      "id": "agent_x_brief",
      "title": "Agent X Brief",
      "icon": "sparkles",
      "content": "<2-4 paragraph third-person narrative written as a public scouting/intel report — describe who this athlete is, what defines them, and what their story looks like right now. Write as a professional report viewed by coaches, scouts, and recruiters. Do NOT address the athlete directly. Do NOT use 'I', 'you', or 'your'. Refer to the athlete by name or as 'this athlete' or 'the prospect'.",
      "sources": [{"platform": "<source>", "label": "<label>", "verified": <true|false>}]
    },
    {
      "id": "athletic_measurements",
      "title": "Athletic Measurements",
      "icon": "body",
      "content": "<1-2 paragraph third-person narrative on the athlete's physical profile. Do NOT use 'you' or 'your'. Refer to the athlete by name or as 'the athlete' or 'the prospect'.>",
      "items": [
        {"label": "<e.g. Height>", "value": "<6'2\\">", "source": "<self-reported|maxpreps>", "verified": false},
        {"label": "<e.g. 40-Yard Dash>", "value": "<4.52>", "unit": "sec", "source": "<self-reported>", "verified": false}
      ]
    },
    {
      "id": "season_stats",
      "title": "Season Stats",
      "icon": "stats-chart",
      "content": "<1-3 paragraph third-person narrative on season performance. Do NOT use 'you' or 'your'. Refer to the athlete by name or as 'the athlete'.",
      "items": [
        {"label": "<stat label>", "value": "<value>", "sublabel": "<season or category>", "source": "<maxpreps|self-reported>", "verified": <true|false>}
      ]
    },
    {
      "id": "recruiting_activity",
      "title": "Recruiting Activity",
      "icon": "school",
      "content": "<1-3 paragraph third-person narrative on recruiting status, camps attended, and interest received. Do NOT use 'you' or 'your'. Refer to the athlete by name or as 'the prospect'.",
      "items": [
        {"label": "<e.g. Offers>", "value": "<N>"},
        {"label": "<e.g. Camps Attended>", "value": "<N>"},
        {"label": "<e.g. Top Division Interest>", "value": "<D1/D2/NAIA/etc>"}
      ]
    },
    {
      "id": "academic_profile",
      "title": "Academic Profile",
      "icon": "book",
      "content": "<1-2 paragraph third-person narrative on academic standing, eligibility, and class year. Do NOT use 'you' or 'your'. Refer to the athlete by name or as 'the athlete'.",
      "items": [
        {"label": "GPA", "value": "<gpa or Not provided>"},
        {"label": "Class Of", "value": "<year or Not provided>"},
        {"label": "SAT", "value": "<score or Not provided>"},
        {"label": "ACT", "value": "<score or Not provided>"}
      ]
    },
    {
      "id": "awards_honors",
      "title": "Awards & Honors",
      "icon": "trophy",
      "content": "<1-2 paragraph third-person narrative on accolades, recognition, and milestones. Do NOT use 'you' or 'your'. Refer to the athlete by name or as 'the athlete'.",
      "items": [
        {"label": "<award title>", "value": "<year or org>", "source": "<source>", "verified": <true|false>}
      ]
    }
  ],
  "quickCommands": [
    {"id": "build-target-list", "label": "Build College Target List", "description": "Find programs that match this profile", "icon": "school", "agentPrompt": "Build a target list of colleges based on my Intel report"},
    {"id": "draft-intro-email", "label": "Draft Introduction Email", "description": "Write an email showcasing these strengths to coaches", "icon": "mail", "agentPrompt": "Draft a recruiting email to coaches highlighting my Intel strengths"}
  ]
}
`.trim();
  }

  private buildTeamIntelPrompt(
    teamData: Record<string, unknown>,
    raw: RawTeamData,
    teamContextText = ''
  ): string {
    const teamName = (teamData['teamName'] as string) || 'Unknown';
    const sport = (teamData['sport'] as string) || 'Unknown';
    const teamType = (teamData['teamType'] as string) || 'high-school';
    const location = [teamData['city'], teamData['state']].filter(Boolean).join(', ') || 'Unknown';
    const record = teamData['record'] as Record<string, unknown> | undefined;
    const branding = teamData['branding'] as Record<string, unknown> | undefined;

    const rosterJson =
      raw.roster.length > 0
        ? JSON.stringify(raw.roster.slice(0, 50))
        : 'NONE — no roster entries recorded yet';
    const staffJson =
      raw.staff.length > 0
        ? JSON.stringify(raw.staff.slice(0, 20))
        : 'NONE — no coaching staff added yet';
    const playerStatsJson =
      raw.playerStats.length > 0
        ? JSON.stringify(raw.playerStats.slice(0, 30))
        : 'NONE — no player stats recorded yet';
    const teamStatsJson =
      raw.teamStats.length > 0
        ? JSON.stringify(raw.teamStats.slice(0, 10))
        : 'NONE — no team stats recorded yet';
    const eventsJson =
      raw.events.length > 0
        ? JSON.stringify(raw.events.slice(0, 20))
        : 'NONE — no schedule or events added yet';
    const recruitingJson =
      raw.recruiting.length > 0
        ? JSON.stringify(raw.recruiting.slice(0, 30))
        : 'NONE — no recruiting activity recorded';

    return `
${teamContextText ? `═══ TEAM CONTEXT (RAG + MEMORY) ═══\n${teamContextText}\n\n` : ''}═══ TEAM PROFILE ═══
Team: ${teamName}
Team ID: ${raw.teamData['id'] ?? 'unknown'}
Sport: ${sport}
Type: ${teamType}
Location: ${location}
Record: ${record ? JSON.stringify(record) : 'Not set'}
Mascot: ${branding?.['mascot'] ?? 'Not set'}

═══ RAW DATA ═══

ROSTER (${raw.roster.length} members from RosterEntries):
${rosterJson}

COACHING STAFF (${raw.staff.length} staff members):
${staffJson}

PLAYER STATS (PlayerStats by teamId):
${playerStatsJson}

TEAM STATS (TeamStats):
${teamStatsJson}

EVENTS & SCHEDULE (${raw.events.length} events):
${eventsJson}

RECRUITING ACTIVITY (Recruiting by teamId):
${recruitingJson}

═══ TASK ═══
You are Agent X. Generate a 5-section team Intel report in JSON.
This is a PUBLIC program intel report — write in the THIRD PERSON throughout. Do NOT address the coaching staff or athletes directly. Do NOT use 'I', 'you', or 'your' when referring to the team or program. Write as a professional report viewed by recruits, scouts, and opposing programs.
Do NOT produce player scores, tier labels, or ratings.
ABSOLUTE RULE: Base ALL content ONLY on ACTUAL data provided above.
- If ROSTER data is 'NONE': write only "No roster data has been added yet. Add your players to generate this section of your Intel report." — do NOT invent player names.
- If STAFF data is 'NONE': write only "No coaching staff has been added yet. Add your coaches to generate this section of your Intel report." — do NOT invent coaches.
- If PLAYER STATS, GAME STATS, or TEAM STATS data is 'NONE': write only "No stats have been recorded yet. Add your team and player stats to generate a full statistical breakdown in your Intel report." — do NOT invent stats, records, or scores.
- If RECRUITING data is 'NONE': write only "No recruiting activity has been recorded yet. Add your prospects and recruiting pipeline to generate your recruiting Intel." — do NOT invent commits or prospects.
- If EVENTS data is 'NONE': write only "No schedule or events have been added yet. Add your games and events to generate this section of your Intel report." — do NOT invent games or opponents.

Output this EXACT JSON structure with all 5 sections:

{
  "sections": [
    {
      "id": "agent_overview",
      "title": "Agent Overview",
      "icon": "sparkles",
      "content": "<2-3 paragraph third-person narrative written as a public program intel report — describe the program's identity, what defines this team, and where they stand right now. Write as a professional report viewed by recruits, scouts, and opposing programs. Do NOT address the coaching staff or athletes directly. Do NOT use 'I', 'you', or 'your'. If description is empty, state that the program has not yet added a bio.>",
      "sources": [{"platform": "agent-x", "label": "Agent X Analysis", "verified": false}]
    },
    {
      "id": "team",
      "title": "Team",
      "icon": "people",
      "content": "<1-2 paragraph third-person narrative on roster composition and coaching staff. Do NOT use 'you', 'your', or address the team directly. If ROSTER is NONE write: 'No roster data has been added yet.' If STAFF is NONE write: 'No coaching staff has been added yet.' Do NOT invent names.>",
      "items": [
        {"label": "Roster Size", "value": "${raw.roster.length > 0 ? raw.roster.length.toString() : 'Not recorded'}"},
        {"label": "Coaching Staff", "value": "${raw.staff.length > 0 ? raw.staff.length.toString() : 'Not recorded'}"}
      ]
    },
    {
      "id": "stats",
      "title": "Stats",
      "icon": "stats-chart",
      "content": "<1-2 paragraph third-person narrative on the team's statistical profile. Do NOT use 'you' or 'your'. If ALL stats data is NONE write: 'No stats have been recorded yet. Add your team and player stats to generate a full statistical breakdown in your Intel report.' Do NOT invent scores, records, or statistical values.>",
      "items": [
        {"label": "<stat label from actual data>", "value": "<actual value>", "sublabel": "<season>"}
      ]
    },
    {
      "id": "recruiting",
      "title": "Recruiting",
      "icon": "school",
      "content": "<1-2 paragraph third-person narrative on the program's recruiting pipeline. Do NOT use 'you' or 'your'. If RECRUITING is NONE write: 'No recruiting activity has been recorded yet. Add your prospects and pipeline to generate your recruiting Intel.' Do NOT invent prospect names or college commitments.>",
      "items": [
        {"label": "Team ID", "value": "${String(raw.teamData['id'] ?? 'unknown')}"},
        {"label": "<recruiting label from actual data>", "value": "<actual value>"}
      ]
    },
    {
      "id": "schedule",
      "title": "Schedule",
      "icon": "calendar",
      "content": "<1-2 paragraph third-person narrative on upcoming games or recent results. Do NOT use 'you' or 'your'. If EVENTS is NONE write: 'No schedule or events have been added yet.' Do NOT invent opponents, dates, or results.>",
      "items": [
        {"label": "<opponent from actual data>", "value": "<result or date from actual data>", "sublabel": "<home/away>"}
      ]
    }
  ],
  "quickCommands": [
    {"id": "scout-roster", "label": "Scout Full Roster", "description": "Generate individual Intel for all athletes", "icon": "people", "agentPrompt": "Generate Intel reports for all athletes on my team roster"},
    {"id": "recruiting-outreach", "label": "Build Recruiting Outreach", "description": "Create a campaign to promote top prospects", "icon": "mail", "agentPrompt": "Build a recruiting outreach plan for my team's top prospects"}
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
    citations: Array<{
      platform: string;
      label: string;
      url?: string;
      lastSyncedAt?: string;
      verified?: boolean;
    }>,
    missingDataPrompts: Array<Record<string, string>>,
    availability: Record<string, boolean>
  ): Record<string, unknown> {
    // Short canonical fallbacks for sections with no source data.
    // These replace whatever the LLM wrote when the underlying data is absent,
    // preventing long speculative narratives from appearing on the profile.
    const NO_DATA_OVERRIDES: Partial<Record<AthleteSectionId, string>> = {
      athletic_measurements: availability['hasMetrics']
        ? undefined
        : 'No measurables have been added yet. Add your height, weight, and combine numbers to generate this section of your Intel report.',
      season_stats: availability['hasStats']
        ? undefined
        : 'No stats have been recorded yet. Add your season stats to generate a full statistical breakdown in your Intel report.',
      recruiting_activity: availability['hasRecruiting']
        ? undefined
        : 'No recruiting activity has been recorded yet. Add your offers, campus visits, and school interest to generate your recruiting Intel.',
      awards_honors: availability['hasAwards']
        ? undefined
        : 'No awards have been recorded yet. Add your honors and accolades to generate this section of your Intel report.',
      academic_profile: availability['hasAcademics']
        ? undefined
        : 'No academic information has been added yet. Add your GPA, test scores, and graduation year to generate your academic Intel.',
    };

    const rawSections = this.normalizeSections(
      parsed['sections'],
      ATHLETE_SECTION_ORDER,
      ATHLETE_SECTION_META
    ).map((section) => {
      const override = NO_DATA_OVERRIDES[section.id as AthleteSectionId];
      if (!override) return section;
      return {
        ...section,
        content: override,
        // Also clear any LLM-invented items for empty sections
        items: undefined,
      };
    });

    const sections = this.enrichSectionsWithFavicons(rawSections, citations);

    return {
      userId,
      sportName: sport,
      primaryPosition: position,
      status: 'ready',
      generatedBy: 'agent-x',
      sections,
      citations,
      missingDataPrompts,
      quickCommands: this.normalizeQuickCommands(parsed['quickCommands']),
      staleAt: computeStaleAt(),
    };
  }

  private normalizeTeamReport(
    teamId: string,
    teamName: string,
    sport: string,
    parsed: Record<string, unknown>,
    citations: Array<{
      platform: string;
      label: string;
      url?: string;
      lastSyncedAt?: string;
      verified?: boolean;
    }>
  ): Record<string, unknown> {
    return {
      teamId,
      teamName,
      sport,
      status: 'ready',
      generatedBy: 'agent-x',

      sections: this.enrichSectionsWithFavicons(
        this.normalizeSections(parsed['sections'], TEAM_SECTION_ORDER, TEAM_SECTION_META),
        citations
      ),
      citations,
      missingDataPrompts: [],
      quickCommands: this.normalizeQuickCommands(parsed['quickCommands']),
      staleAt: computeStaleAt(),
    };
  }

  /**
   * Validates and orders sections from LLM output.
   * Guarantees canonical ordering regardless of LLM output order.
   * Missing sections are filled with a placeholder so every section always renders.
   */
  private normalizeSections(
    val: unknown,
    order: readonly string[],
    meta: Readonly<Record<string, { title: string; icon: string }>>
  ): NormalizedSection[] {
    const raw = Array.isArray(val)
      ? val.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      : [];

    // Index raw sections by id for O(1) lookup
    const byId = new Map<string, Record<string, unknown>>();
    for (const section of raw) {
      if (typeof section['id'] === 'string') {
        byId.set(section['id'], section);
      }
    }

    return order.map((id) => {
      const section = byId.get(id);
      const fallbackMeta = meta[id as keyof typeof meta] ?? { title: id, icon: 'document' };

      return {
        id,
        // Always use canonical meta title — never trust the LLM-returned title string
        title: fallbackMeta.title,
        icon: typeof section?.['icon'] === 'string' ? section['icon'] : fallbackMeta.icon,
        content: (() => {
          const raw = typeof section?.['content'] === 'string' ? section['content'].trim() : '';
          if (!raw) return 'No data available for this section yet.';
          // Normalize single newlines between text → double newlines so markdown
          // renders distinct <p> tags instead of one collapsed paragraph.
          return raw.replace(/([^\n])\n([^\n])/g, '$1\n\n$2');
        })(),
        items: this.normalizeBriefItems(section?.['items']),
        sources: this.normalizeSectionSources(section?.['sources']),
      };
    });
  }

  private normalizeBriefItems(val: unknown): NormalizedSection['items'] {
    if (!Array.isArray(val) || val.length === 0) return undefined;
    const items = val
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .slice(0, 20)
      .map((item) => ({
        label: typeof item['label'] === 'string' ? item['label'] : '',
        value: typeof item['value'] === 'string' ? item['value'] : '',
        unit: typeof item['unit'] === 'string' ? item['unit'] : undefined,
        source: typeof item['source'] === 'string' ? item['source'] : undefined,
        verified: typeof item['verified'] === 'boolean' ? item['verified'] : undefined,
        faviconUrl: typeof item['faviconUrl'] === 'string' ? item['faviconUrl'] : undefined,
        date: typeof item['date'] === 'string' ? item['date'] : undefined,
        sublabel: typeof item['sublabel'] === 'string' ? item['sublabel'] : undefined,
      }));
    return items.length > 0 ? items : undefined;
  }

  private normalizeSectionSources(val: unknown): NormalizedSection['sources'] {
    if (!Array.isArray(val) || val.length === 0) return undefined;
    const sources = val
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        platform: typeof item['platform'] === 'string' ? item['platform'] : 'agent-x',
        label: typeof item['label'] === 'string' ? item['label'] : '',
        url: typeof item['url'] === 'string' ? item['url'] : undefined,
        verified: typeof item['verified'] === 'boolean' ? item['verified'] : false,
        faviconUrl: typeof item['faviconUrl'] === 'string' ? item['faviconUrl'] : undefined,
      }));
    return sources.length > 0 ? sources : undefined;
  }

  /**
   * Enriches section sources and item source chips with faviconUrl from top-level citations.
   * The LLM doesn't know favicon URLs — this seeds them by matching on platform name.
   */
  private enrichSectionsWithFavicons(
    sections: NormalizedSection[],
    citations: Array<{ platform: string; faviconUrl?: string; url?: string }>
  ): NormalizedSection[] {
    if (citations.length === 0) return sections;

    // Build a lookup: platform → { faviconUrl, url }
    const faviconByPlatform = new Map<string, { faviconUrl?: string; url?: string }>();
    for (const c of citations) {
      if (c.platform) {
        faviconByPlatform.set(c.platform.toLowerCase(), {
          faviconUrl: c.faviconUrl,
          url: c.url,
        });
      }
    }
    if (faviconByPlatform.size === 0) return sections;

    return sections.map((section) => ({
      ...section,
      sources: section.sources?.map((src) => {
        if (src.faviconUrl) return src; // already has one
        const match = faviconByPlatform.get(src.platform.toLowerCase());
        return match?.faviconUrl ? { ...src, faviconUrl: match.faviconUrl } : src;
      }),
      items: section.items?.map((item) => {
        if (!item.source || item.faviconUrl) return item;
        const match = faviconByPlatform.get(item.source.toLowerCase());
        return match?.faviconUrl ? { ...item, faviconUrl: match.faviconUrl } : item;
      }),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED FIELD NORMALIZERS
  // ═══════════════════════════════════════════════════════════════════════════

  private buildCitations(connectedSources: Record<string, unknown>[]): Array<{
    platform: string;
    label: string;
    url?: string;
    lastSyncedAt?: string;
    verified?: boolean;
  }> {
    const VERIFIED_PLATFORMS = new Set([
      'maxpreps',
      'hudl',
      '247sports',
      'rivals',
      'on3',
      'perfect-game',
      'prep-baseball',
      'ncsa',
      'usa-football',
    ]);

    return connectedSources.map((src) => {
      const platform = (src['platform'] as string) || 'unknown';
      return {
        platform,
        label: (src['profileUrl'] as string) || (src['platform'] as string) || 'Connected source',
        url: (src['profileUrl'] as string) || undefined,
        lastSyncedAt: (src['lastSyncedAt'] as string) || undefined,
        verified: VERIFIED_PLATFORMS.has(platform),
        faviconUrl: (src['faviconUrl'] as string) || undefined,
      };
    });
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
          'Agent X needs your height, weight, 40-yard dash, and other measurables to build your Athletic Measurements section.',
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
          'Upload your season statistics so Agent X can build your Season Stats section.',
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
          'Track your offers, visits, and camps so Agent X can tell your recruiting story.',
        actionLabel: 'Add Activity',
        actionRoute: '/edit-profile/recruiting',
        icon: 'school',
      });
    }
    if (!availability['hasAcademics']) {
      prompts.push({
        category: 'hasAcademics',
        title: 'Add Academic Info',
        description: 'GPA, class year, and test scores complete your Academic Profile section.',
        actionLabel: 'Add Academics',
        actionRoute: '/edit-profile/academics',
        icon: 'book',
      });
    }
    if (!availability['hasAwards']) {
      prompts.push({
        category: 'hasAwards',
        title: 'Add Awards & Honors',
        description:
          'All-conference selections, MVP awards, and academic honors belong in your Intel report.',
        actionLabel: 'Add Awards',
        actionRoute: '/edit-profile/awards',
        icon: 'trophy',
      });
    }

    return prompts;
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

  // ═══════════════════════════════════════════════════════════════════════════
  // TARGETED SECTION UPDATE — ATHLETE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Re-generates a single section of an existing athlete Intel report and
   * merges it back into Firestore, preserving all other sections unchanged.
   *
   * @returns The updated full report document.
   */
  async updateAthleteIntelSection(
    userId: string,
    sectionId: AthleteSectionId,
    dbOverride?: Firestore
  ): Promise<Record<string, unknown>> {
    const db = this.resolveDb(dbOverride);

    // ── Load the most-recent existing report ──
    const snap = await db
      .collection('Users')
      .doc(userId)
      .collection('intel_reports')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    if (snap.empty) {
      throw new Error(
        'No existing Intel report found. Use /generate to create the full report first.'
      );
    }

    const reportDoc = snap.docs[0];
    const existingReport = reportDoc.data() as Record<string, unknown>;
    const existingSections = (existingReport['sections'] as NormalizedSection[] | undefined) ?? [];

    // ── Load user doc ──
    const userDoc = await db.collection('Users').doc(userId).get();
    if (!userDoc.exists) throw new Error('User not found');
    const userData = userDoc.data() ?? {};

    // ── Gather only the data relevant to this section ──
    const sectionRaw = await this.gatherAthleteSectionData(userId, userData, sectionId, db);

    // ── Determine section data availability ──
    const sectionAvailability = this.computeAthleteSectionAvailability(
      sectionId,
      userData,
      sectionRaw
    );

    // ── Build targeted prompt for just this section ──
    const { promptContextText, sport, primaryPosition } = await this.buildAthletePromptContext(
      userId,
      userData,
      db
    );

    const prompt = this.buildAthleteSectionPrompt(
      sectionId,
      promptContextText,
      sport,
      primaryPosition,
      sectionRaw,
      userData
    );

    // ── Call OpenRouter for single-section output ──
    let parsedSection: Record<string, unknown>;
    try {
      const llm = this.getOrCreateLlmService();
      const result = await llm.complete(
        [
          {
            role: 'system',
            content:
              'You are Agent X — the AI sports intelligence engine powering NXT1. ' +
              'You generate PUBLIC scouting and recruiting intel reports written in the THIRD PERSON. ' +
              'These reports are read by coaches, scouts, and recruiting programs — NOT addressed to the athlete. ' +
              'Do NOT use "you", "your", or address the athlete directly at any point. ' +
              'You never produce evaluation ratings, tier labels, or numeric scores. ' +
              'ABSOLUTE RULE: Do NOT invent, hallucinate, or fabricate any data. ' +
              "If a data field is 'NONE', write factual absence text only. " +
              'Output valid JSON only — a single section object.',
          },
          { role: 'user', content: prompt },
        ],
        {
          tier: 'copywriting',
          maxTokens: 1200,
          temperature: 0.6,
          jsonMode: true,
        }
      );

      if (!result.content) throw new Error('Empty LLM response');
      parsedSection = JSON.parse(stripMarkdownFences(result.content));
    } catch (err) {
      logger.error('[IntelGenerationService] Section LLM call failed for athlete', {
        userId,
        sectionId,
        err,
      });
      throw new Error(`Section update failed for ${sectionId} — please try again`, { cause: err });
    }

    // ── Normalize the single updated section ──
    const [normalizedSection] = this.normalizeSections(
      [parsedSection],
      [sectionId] as readonly string[],
      ATHLETE_SECTION_META
    );

    // Apply NO_DATA_OVERRIDE for the updated section if applicable
    const noDataOverride = this.getAthleteNoDataOverride(sectionId, sectionAvailability);
    const finalSection: NormalizedSection = noDataOverride
      ? { ...normalizedSection, content: noDataOverride, items: undefined }
      : normalizedSection;

    // ── Merge: replace only the target section, preserve all others ──
    const updatedSections = existingSections.map((s) => (s.id === sectionId ? finalSection : s));

    // If the section didn't exist in the old report (edge case), append it in correct order
    if (!updatedSections.some((s) => s.id === sectionId)) {
      const insertIdx = ATHLETE_SECTION_ORDER.indexOf(sectionId as AthleteSectionId);
      updatedSections.splice(insertIdx, 0, finalSection);
    }

    // ── Persist: update the existing report doc in-place ──
    await reportDoc.ref.update({
      sections: updatedSections,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info('[IntelGenerationService] Athlete Intel section updated', {
      userId,
      reportId: reportDoc.id,
      sectionId,
    });

    return {
      ...existingReport,
      id: reportDoc.id,
      sections: updatedSections,
      updatedAt: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TARGETED SECTION UPDATE — TEAM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Re-generates a single section of an existing team Intel report and
   * merges it back into Firestore, preserving all other sections unchanged.
   *
   * @returns The updated full report document.
   */
  async updateTeamIntelSection(
    teamId: string,
    sectionId: TeamSectionId,
    dbOverride?: Firestore
  ): Promise<Record<string, unknown>> {
    const db = this.resolveDb(dbOverride);

    // ── Load the most-recent existing report ──
    const snap = await db
      .collection('Teams')
      .doc(teamId)
      .collection('intel_reports')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    if (snap.empty) {
      throw new Error(
        'No existing team Intel report found. Use /generate to create the full report first.'
      );
    }

    const reportDoc = snap.docs[0];
    const existingReport = reportDoc.data() as Record<string, unknown>;
    const existingSections = (existingReport['sections'] as NormalizedSection[] | undefined) ?? [];

    // ── Load team doc ──
    const teamDoc = await db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists) throw new Error('Team not found');
    const teamData = teamDoc.data() ?? {};

    // ── Gather only the data relevant to this section ──
    const sectionRaw = await this.gatherTeamSectionData(teamId, teamData, sectionId, db);

    // ── Build targeted prompt for just this section ──
    const prompt = this.buildTeamSectionPrompt(sectionId, teamData, sectionRaw);

    // ── Call OpenRouter for single-section output ──
    let parsedSection: Record<string, unknown>;
    try {
      const llm = this.getOrCreateLlmService();
      const result = await llm.complete(
        [
          {
            role: 'system',
            content:
              'You are Agent X — the AI sports intelligence engine powering NXT1. ' +
              'You generate PUBLIC program intel reports written in the THIRD PERSON. ' +
              'These reports are read by recruits, scouts, and opposing programs — NOT addressed to the coaching staff or athletes. ' +
              'Do NOT use "you", "your", or address the team or coaches directly at any point. ' +
              'You never produce evaluation ratings or numeric scores for athletes. ' +
              'ABSOLUTE RULE: Do NOT invent, hallucinate, or fabricate any data. ' +
              "If a data field is 'NONE', write factual absence text only. " +
              'Output valid JSON only — a single section object.',
          },
          { role: 'user', content: prompt },
        ],
        {
          tier: 'copywriting',
          maxTokens: 1200,
          temperature: 0.6,
          jsonMode: true,
        }
      );

      if (!result.content) throw new Error('Empty LLM response');
      parsedSection = JSON.parse(stripMarkdownFences(result.content));
    } catch (err) {
      logger.error('[IntelGenerationService] Section LLM call failed for team', {
        teamId,
        sectionId,
        err,
      });
      throw new Error(`Section update failed for ${sectionId} — please try again`, { cause: err });
    }

    // ── Normalize the single updated section ──
    const [normalizedSection] = this.normalizeSections(
      [parsedSection],
      [sectionId] as readonly string[],
      TEAM_SECTION_META
    );

    // Apply NO_DATA_OVERRIDE for the updated section if applicable
    const noDataOverride = this.getTeamNoDataOverride(sectionId, sectionRaw);
    const finalSection: NormalizedSection = noDataOverride
      ? { ...normalizedSection, content: noDataOverride, items: undefined }
      : normalizedSection;

    // ── Merge: replace only the target section, preserve all others ──
    const updatedSections = existingSections.map((s) => (s.id === sectionId ? finalSection : s));

    // If the section didn't exist in the old report (edge case), append it in correct order
    if (!updatedSections.some((s) => s.id === sectionId)) {
      const insertIdx = TEAM_SECTION_ORDER.indexOf(sectionId as TeamSectionId);
      updatedSections.splice(insertIdx, 0, finalSection);
    }

    // ── Persist: update the existing report doc in-place ──
    await reportDoc.ref.update({
      sections: updatedSections,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info('[IntelGenerationService] Team Intel section updated', {
      teamId,
      reportId: reportDoc.id,
      sectionId,
    });

    return {
      ...existingReport,
      id: reportDoc.id,
      sections: updatedSections,
      updatedAt: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION-SCOPED DATA GATHERING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gathers only the Firestore collections needed to regenerate a specific athlete section.
   * Avoids fetching all 6 collections when only 1-2 are needed.
   */
  private async gatherAthleteSectionData(
    userId: string,
    userData: Record<string, unknown>,
    sectionId: AthleteSectionId,
    db: Firestore
  ): Promise<Partial<RawProfileData>> {
    switch (sectionId) {
      case 'agent_x_brief': {
        // Brief needs a holistic view — fetch everything
        const full = await this.gatherAthleteData(userId, userData, db);
        return full;
      }

      case 'athletic_measurements': {
        const metricsSnap = await db
          .collection('PlayerMetrics')
          .where('userId', '==', userId)
          .get();
        const metrics = metricsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>)
          .sort((a, b) =>
            String(b['dateRecorded'] ?? '').localeCompare(String(a['dateRecorded'] ?? ''))
          )
          .slice(0, 20);
        return { userData, metrics };
      }

      case 'season_stats': {
        const statsSnap = await db.collection('PlayerStats').where('userId', '==', userId).get();
        return {
          userData,
          stats: statsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        };
      }

      case 'recruiting_activity': {
        const [recruitingSnap, eventsSnap] = await Promise.all([
          db.collection('Recruiting').where('userId', '==', userId).get(),
          db
            .collection('Events')
            .where('ownerType', '==', 'user')
            .where('userId', '==', userId)
            .orderBy('date', 'desc')
            .limit(30)
            .get(),
        ]);
        const recruiting = recruitingSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>)
          .sort((a, b) => String(b['createdAt'] ?? '').localeCompare(String(a['createdAt'] ?? '')))
          .slice(0, 30);
        return {
          userData,
          recruiting,
          events: eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        };
      }

      case 'academic_profile': {
        // Academic data lives entirely on the user document — no separate collection
        return { userData };
      }

      case 'awards_honors': {
        const awardsSnap = await db.collection('Awards').where('userId', '==', userId).get();
        // Transition fallback: if Awards collection is empty, check Users.awards[]
        // TODO: remove once awards backfill migration has run in production
        const awardDocs = awardsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const legacyAwards =
          awardDocs.length === 0 && Array.isArray(userData['awards'])
            ? (userData['awards'] as Record<string, unknown>[])
            : [];
        return {
          userData,
          awards: awardDocs.length > 0 ? awardDocs : legacyAwards,
        };
      }

      default:
        return { userData };
    }
  }

  /**
   * Gathers only the Firestore collections needed to regenerate a specific team section.
   */
  private async gatherTeamSectionData(
    teamId: string,
    teamData: Record<string, unknown>,
    sectionId: TeamSectionId,
    db: Firestore
  ): Promise<Partial<RawTeamData>> {
    const teamRef = db.collection('Teams').doc(teamId);

    switch (sectionId) {
      case 'agent_overview': {
        // Overview needs the whole picture
        const full = await this.gatherTeamData(teamId, teamData, db);
        return full;
      }

      case 'team': {
        const [rosterSnap, staffSnap] = await Promise.all([
          db.collection('RosterEntries').where('teamId', '==', teamId).get(),
          teamRef.collection('staff').get(),
        ]);
        return {
          teamData,
          roster: rosterSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          staff: staffSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        };
      }

      case 'stats': {
        const [teamStatsSnap, playerStatsSnap] = await Promise.all([
          db.collection('TeamStats').where('teamId', '==', teamId).get(),
          db.collection('PlayerStats').where('teamId', '==', teamId).limit(50).get(),
        ]);
        const teamStats = teamStatsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>)
          .sort((a, b) => String(b['season'] ?? '').localeCompare(String(a['season'] ?? '')))
          .slice(0, 5);
        return {
          teamData,
          teamStats,
          playerStats: playerStatsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        };
      }

      case 'recruiting': {
        const recruitingSnap = await db
          .collection('Recruiting')
          .where('teamId', '==', teamId)
          .limit(30)
          .get();
        return {
          teamData,
          recruiting: recruitingSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        };
      }

      case 'schedule': {
        const eventsSnap = await db
          .collection('Events')
          .where('ownerType', '==', 'team')
          .where('userId', '==', teamId)
          .orderBy('date', 'desc')
          .limit(30)
          .get();
        return {
          teamData,
          events: eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        };
      }

      default:
        return { teamData };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION-SCOPED PROMPT BUILDING
  // ═══════════════════════════════════════════════════════════════════════════

  private buildAthleteSectionPrompt(
    sectionId: AthleteSectionId,
    promptContextText: string,
    sport: string,
    position: string,
    raw: Partial<RawProfileData>,
    userData: Record<string, unknown>
  ): string {
    const sectionMeta = ATHLETE_SECTION_META[sectionId];
    const header = `
═══ ATHLETE CONTEXT (RAG PROFILE + MEMORY) ═══
${promptContextText}

SPORT: ${sport}
PRIMARY POSITION: ${position}
`.trim();

    let dataBlock: string;

    switch (sectionId) {
      case 'agent_x_brief': {
        const r = raw as RawProfileData;
        dataBlock = `
MEASURABLES: ${r.metrics?.length ? JSON.stringify(r.metrics.slice(0, 20)) : 'NONE'}
SEASON STATS: ${r.stats?.length ? JSON.stringify(r.stats.slice(0, 20)) : 'NONE'}
RECRUITING: ${r.recruiting?.length ? JSON.stringify(r.recruiting.slice(0, 15)) : 'NONE'}
AWARDS: ${r.awards?.length ? JSON.stringify(r.awards.slice(0, 10)) : 'NONE'}
EVENTS: ${r.events?.length ? JSON.stringify(r.events.slice(0, 10)) : 'NONE'}
`.trim();
        break;
      }
      case 'athletic_measurements': {
        dataBlock = `MEASURABLES (PlayerMetrics): ${raw.metrics?.length ? JSON.stringify(raw.metrics.slice(0, 50)) : 'NONE — athlete has not added measurables yet'}`;
        break;
      }
      case 'season_stats': {
        dataBlock = `SEASON STATS (PlayerStats): ${raw.stats?.length ? JSON.stringify(raw.stats.slice(0, 50)) : 'NONE — athlete has not added stats yet'}`;
        break;
      }
      case 'recruiting_activity': {
        dataBlock = `
RECRUITING ACTIVITY (Recruiting): ${raw.recruiting?.length ? JSON.stringify(raw.recruiting.slice(0, 30)) : 'NONE — no recruiting activity recorded'}
CAMPS & EVENTS: ${raw.events?.length ? JSON.stringify(raw.events.slice(0, 20)) : 'NONE'}
`.trim();
        break;
      }
      case 'academic_profile': {
        const academic = (userData['academics'] as Record<string, unknown> | undefined) ?? {};
        dataBlock = `ACADEMICS: ${JSON.stringify({
          gpa: academic['gpa'] ?? userData['gpa'],
          classOf: userData['classOf'],
          satScore: academic['satScore'] ?? userData['satScore'],
          actScore: academic['actScore'] ?? userData['actScore'],
        })}`;
        break;
      }
      case 'awards_honors': {
        dataBlock = `AWARDS & HONORS (Awards): ${raw.awards?.length ? JSON.stringify(raw.awards.slice(0, 20)) : 'NONE — no awards recorded'}`;
        break;
      }
    }

    const sectionSchemas: Record<AthleteSectionId, string> = {
      agent_x_brief: `{
  "id": "agent_x_brief",
  "title": "Agent X Brief",
  "icon": "sparkles",
  "content": "<2-4 paragraph first-person Agent X narrative — who is this athlete, what defines them, what is their story right now>",
  "sources": [{"platform": "agent-x", "label": "Agent X Analysis", "verified": false}]
}`,
      athletic_measurements: `{
  "id": "athletic_measurements",
  "title": "Athletic Measurements",
  "icon": "body",
  "content": "<1-2 paragraph narrative on the athlete's physical profile>",
  "items": [{"label": "<e.g. Height>", "value": "<value>", "source": "<source>", "verified": false}]
}`,
      season_stats: `{
  "id": "season_stats",
  "title": "Season Stats",
  "icon": "stats-chart",
  "content": "<1-3 paragraph narrative on season performance>",
  "items": [{"label": "<stat label>", "value": "<value>", "sublabel": "<season>", "source": "<source>", "verified": false}]
}`,
      recruiting_activity: `{
  "id": "recruiting_activity",
  "title": "Recruiting Activity",
  "icon": "school",
  "content": "<1-3 paragraph narrative on recruiting status, camps attended, interest received>",
  "items": [{"label": "<e.g. Offers>", "value": "<N>"}, {"label": "<e.g. Camps Attended>", "value": "<N>"}]
}`,
      academic_profile: `{
  "id": "academic_profile",
  "title": "Academic Profile",
  "icon": "book",
  "content": "<1-2 paragraph narrative on academic standing, eligibility, class year>",
  "items": [{"label": "GPA", "value": "<value>"}, {"label": "Class Of", "value": "<value>"}, {"label": "SAT", "value": "<value>"}, {"label": "ACT", "value": "<value>"}]
}`,
      awards_honors: `{
  "id": "awards_honors",
  "title": "Awards & Honors",
  "icon": "trophy",
  "content": "<1-2 paragraph narrative on accolades, recognition, milestones>",
  "items": [{"label": "<award title>", "value": "<year or org>", "source": "<source>", "verified": false}]
}`,
    };

    return `
${header}

═══ DATA FOR SECTION UPDATE ═══
${dataBlock}

═══ TASK ═══
Regenerate ONLY the "${sectionMeta.title}" section (id: "${sectionId}") of the athlete Intel report.
NXT1 is the athlete's advocate — TELL THEIR STORY, not score them.
ABSOLUTE RULE: Base ALL content ONLY on the ACTUAL data provided above. Do NOT invent data.
If data is NONE or missing, write a short factual absence statement only.

Return a single JSON section object matching this schema:
${sectionSchemas[sectionId]}
`.trim();
  }

  private buildTeamSectionPrompt(
    sectionId: TeamSectionId,
    teamData: Record<string, unknown>,
    raw: Partial<RawTeamData>
  ): string {
    const sectionMeta = TEAM_SECTION_META[sectionId];
    const teamName = (teamData['teamName'] as string) || 'Unknown';
    const sport = (teamData['sport'] as string) || 'Unknown';
    const location = [teamData['city'], teamData['state']].filter(Boolean).join(', ') || 'Unknown';

    const header = `
TEAM: ${teamName}
SPORT: ${sport}
LOCATION: ${location}
`.trim();

    let dataBlock: string;

    switch (sectionId) {
      case 'agent_overview': {
        const r = raw as RawTeamData;
        dataBlock = `
ROSTER SIZE: ${r.roster?.length ?? 0}
STAFF SIZE: ${r.staff?.length ?? 0}
DESCRIPTION: ${(teamData['description'] as string) || 'Not provided'}
RECORD: ${teamData['record'] ? JSON.stringify(teamData['record']) : 'Not set'}
TEAM STATS: ${r.teamStats?.length ? JSON.stringify(r.teamStats.slice(0, 5)) : 'NONE'}
RECRUITING: ${r.recruiting?.length ? JSON.stringify(r.recruiting.slice(0, 10)) : 'NONE'}
`.trim();
        break;
      }
      case 'team': {
        dataBlock = `
ROSTER (${raw.roster?.length ?? 0} members): ${raw.roster?.length ? JSON.stringify(raw.roster.slice(0, 50)) : 'NONE — no roster entries recorded yet'}
COACHING STAFF (${raw.staff?.length ?? 0}): ${raw.staff?.length ? JSON.stringify(raw.staff.slice(0, 20)) : 'NONE — no coaching staff added yet'}
`.trim();
        break;
      }
      case 'stats': {
        dataBlock = `
PLAYER STATS: ${raw.playerStats?.length ? JSON.stringify(raw.playerStats.slice(0, 30)) : 'NONE — no player stats recorded yet'}
TEAM STATS: ${raw.teamStats?.length ? JSON.stringify(raw.teamStats.slice(0, 10)) : 'NONE — no team stats recorded yet'}
`.trim();
        break;
      }
      case 'recruiting': {
        dataBlock = `RECRUITING ACTIVITY: ${raw.recruiting?.length ? JSON.stringify(raw.recruiting.slice(0, 30)) : 'NONE — no recruiting activity recorded'}`;
        break;
      }
      case 'schedule': {
        dataBlock = `EVENTS & SCHEDULE (${raw.events?.length ?? 0} events): ${raw.events?.length ? JSON.stringify(raw.events.slice(0, 20)) : 'NONE — no schedule or events added yet'}`;
        break;
      }
    }

    const sectionSchemas: Record<TeamSectionId, string> = {
      agent_overview: `{
  "id": "agent_overview",
  "title": "Agent Overview",
  "icon": "sparkles",
  "content": "<2-3 paragraph Agent X narrative on program identity. Based ONLY on provided data.>",
  "sources": [{"platform": "agent-x", "label": "Agent X Analysis", "verified": false}]
}`,
      team: `{
  "id": "team",
  "title": "Team",
  "icon": "people",
  "content": "<1-2 paragraph narrative on roster composition and coaching staff.>",
  "items": [{"label": "Roster Size", "value": "${String(raw.roster?.length ?? 0)}"}, {"label": "Coaching Staff", "value": "${String(raw.staff?.length ?? 0)}"}]
}`,
      stats: `{
  "id": "stats",
  "title": "Stats",
  "icon": "stats-chart",
  "content": "<1-2 paragraph narrative on team statistical profile. If all stats NONE write: 'No stats have been recorded yet. Add your team and player stats to generate a full statistical breakdown in your Intel report.'>",
  "items": [{"label": "<stat from actual data>", "value": "<actual value>", "sublabel": "<season>"}]
}`,
      recruiting: `{
  "id": "recruiting",
  "title": "Recruiting",
  "icon": "school",
  "content": "<1-2 paragraph narrative on recruiting pipeline. If NONE write: 'No recruiting activity has been recorded yet. Add your prospects and pipeline to generate your recruiting Intel.'>",
  "items": [{"label": "<recruiting label>", "value": "<actual value>"}]
}`,
      schedule: `{
  "id": "schedule",
  "title": "Schedule",
  "icon": "calendar",
  "content": "<1-2 paragraph narrative on upcoming games or recent results. If NONE write: 'No schedule or events have been added yet.'>",
  "items": [{"label": "<opponent from actual data>", "value": "<result or date>", "sublabel": "<home/away>"}]
}`,
    };

    return `
${header}

═══ DATA FOR SECTION UPDATE ═══
${dataBlock}

═══ TASK ═══
Regenerate ONLY the "${sectionMeta.title}" section (id: "${sectionId}") of the team Intel report.
You are the program's advocate — TELL THE PROGRAM'S STORY.
ABSOLUTE RULE: Base ALL content ONLY on ACTUAL data provided above. Do NOT invent data.
If data is NONE or missing, write a short factual absence statement only.

Return a single JSON section object matching this schema:
${sectionSchemas[sectionId]}
`.trim();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NO-DATA OVERRIDE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private computeAthleteSectionAvailability(
    _sectionId: AthleteSectionId,
    userData: Record<string, unknown>,
    raw: Partial<RawProfileData>
  ): Record<string, boolean> {
    const academic = (userData['academics'] as Record<string, unknown> | undefined) ?? {};
    return {
      hasMetrics: (raw.metrics?.length ?? 0) > 0,
      hasStats: (raw.stats?.length ?? 0) > 0,
      hasRecruiting: (raw.recruiting?.length ?? 0) > 0,
      hasAwards: (raw.awards?.length ?? 0) > 0,
      hasAcademics: !!(
        academic['gpa'] ||
        userData['gpa'] ||
        userData['satScore'] ||
        userData['actScore']
      ),
    };
  }

  private getAthleteNoDataOverride(
    sectionId: AthleteSectionId,
    availability: Record<string, boolean>
  ): string | undefined {
    const overrides: Partial<Record<AthleteSectionId, string>> = {
      athletic_measurements: availability['hasMetrics']
        ? undefined
        : 'No measurables have been added yet. Add your height, weight, and combine numbers to generate this section of your Intel report.',
      season_stats: availability['hasStats']
        ? undefined
        : 'No stats have been recorded yet. Add your season stats to generate a full statistical breakdown in your Intel report.',
      recruiting_activity: availability['hasRecruiting']
        ? undefined
        : 'No recruiting activity has been recorded yet. Add your offers, campus visits, and school interest to generate your recruiting Intel.',
      awards_honors: availability['hasAwards']
        ? undefined
        : 'No awards have been recorded yet. Add your honors and accolades to generate this section of your Intel report.',
      academic_profile: availability['hasAcademics']
        ? undefined
        : 'No academic information has been added yet. Add your GPA, test scores, and graduation year to generate your academic Intel.',
    };
    return overrides[sectionId];
  }

  private getTeamNoDataOverride(
    sectionId: TeamSectionId,
    raw: Partial<RawTeamData>
  ): string | undefined {
    switch (sectionId) {
      case 'team':
        return (raw.roster?.length ?? 0) === 0 && (raw.staff?.length ?? 0) === 0
          ? 'No roster or coaching staff data has been added yet. Add your players and staff to generate this section of your Intel report.'
          : undefined;
      case 'stats':
        return (raw.teamStats?.length ?? 0) === 0 && (raw.playerStats?.length ?? 0) === 0
          ? 'No stats have been recorded yet. Add your team and player stats to generate a full statistical breakdown in your Intel report.'
          : undefined;
      case 'recruiting':
        return (raw.recruiting?.length ?? 0) === 0
          ? 'No recruiting activity has been recorded yet. Add your prospects and recruiting pipeline to generate your recruiting Intel.'
          : undefined;
      case 'schedule':
        return (raw.events?.length ?? 0) === 0
          ? 'No schedule or events have been added yet. Add your games and events to generate this section of your Intel report.'
          : undefined;
      default:
        return undefined;
    }
  }
}
