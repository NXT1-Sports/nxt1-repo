/**
 * @fileoverview Intel Generation Service — AI-Powered Profile Intelligence
 * @module @nxt1/backend/modules/agent/services
 *
 * Generates on-demand Intel dossier reports for athletes and teams using OpenRouter LLM.
 * Agent X is the athlete's advocate — it tells their story, not their score.
 * Reports are persisted to Firestore and re-used until manually regenerated.
 *
 * Data sources: root Firestore collections only (PlayerStats, PlayerMetrics,
 * Recruiting, Events, Awards, RosterEntries, TeamStats).
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from '../../../utils/logger.js';
import { getSeasonInfo, resolvePrimarySport } from './elite-context.js';
import { ContextBuilder } from '../memory/context-builder.js';
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
  gameStats: Record<string, unknown>[];
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
    date?: string;
    sublabel?: string;
  }>;
  sources?: Array<{ platform: string; label: string; url?: string; verified?: boolean }>;
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
      'athlete intel dossier',
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
              "You are the athlete's advocate. Your job is to TELL THEIR STORY, not score them. " +
              'You never produce evaluation ratings, tier labels, or numeric scores. ' +
              "You produce a professional, narrative-first dossier that showcases the athlete's " +
              'journey, achievements, measurables, recruiting activity, and academic profile. ' +
              'ABSOLUTE RULE: Do NOT invent, hallucinate, or fabricate any data. ' +
              "If a data field is 'NONE', write factual absence text only. " +
              'Never invent stats, school names, offers, measurables, or awards. ' +
              'Be specific and data-driven using only the provided context. ' +
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

    logger.info('[IntelGenerationService] Athlete intel dossier generated', {
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

    // ── Build LLM prompt ──
    const prompt = this.buildTeamIntelPrompt(teamData, raw);

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
              "You are the program's advocate. Your job is to TELL THE PROGRAM'S STORY. " +
              'You never produce evaluation ratings or numeric scores for athletes. ' +
              "You produce a professional, narrative-first team dossier that covers the program's " +
              'identity, roster composition, performance stats, recruiting pipeline, and schedule. ' +
              'ABSOLUTE RULE: Do NOT invent, hallucinate, or fabricate any data. ' +
              "If a data field is 'NONE', write factual absence text only. " +
              'Never invent athlete names, win-loss records, commitments, or school names. ' +
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

    logger.info('[IntelGenerationService] Team intel dossier generated', {
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

    return {
      userData,
      stats: statsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      metrics: sortedMetrics,
      recruiting: sortedRecruiting,
      events: eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      awards: awardsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
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

    const [
      rosterSnap,
      staffSnap,
      eventsSnap,
      teamStatsSnap,
      playerStatsSnap,
      gameStatsSnap,
      recruitingSnap,
    ] = await Promise.all([
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
      // GameStats per-game records — returns empty gracefully if collection doesn't exist
      db.collection('GameStats').where('teamId', '==', teamId).limit(30).get(),
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
      gameStats: gameStatsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
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

═══ RAW DATA FOR DOSSIER GENERATION ═══

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
You are Agent X. Generate a 6-section athlete dossier in JSON.
NXT1 is the athlete's advocate — you TELL THEIR STORY, not score them.
Do NOT produce ratings, tier labels, or overall scores.
ABSOLUTE RULE: Base ALL content ONLY on the ACTUAL data provided above.
- If MEASURABLES data is 'NONE': for the athletic_measurements section, write only "No measurables have been added yet." Do NOT invent heights, weights, or combine numbers.
- If SEASON STATS data is 'NONE': for the season_stats section, write only "No stats have been added yet." Do NOT invent statistics, records, or performance numbers.
- If RECRUITING ACTIVITY data is 'NONE': for the recruiting_activity section, write only "No recruiting activity has been recorded yet." Do NOT invent offers, school names, or interest levels.
- If CAMPS & EVENTS data is 'NONE': mention only that no events have been logged yet.
- If AWARDS & HONORS data is 'NONE': for the awards_honors section, write only "No awards have been recorded yet." Do NOT invent accolades or recognition.
- If ACADEMICS data fields are null/undefined: write only "Not provided" for those fields. Do NOT invent GPA, test scores, or class year.

Output this EXACT JSON structure with all 6 sections:

{
  "sections": [
    {
      "id": "agent_x_brief",
      "title": "Agent X Brief",
      "icon": "sparkles",
      "content": "<2-4 paragraph first-person Agent X narrative — who is this athlete, what defines them, what's their story right now>",
      "sources": [{"platform": "<source>", "label": "<label>", "verified": <true|false>}]
    },
    {
      "id": "athletic_measurements",
      "title": "Athletic Measurements",
      "icon": "body",
      "content": "<1-2 paragraph narrative on the athlete's physical profile>",
      "items": [
        {"label": "<e.g. Height>", "value": "<6'2\\">", "source": "<self-reported|maxpreps>", "verified": false},
        {"label": "<e.g. 40-Yard Dash>", "value": "<4.52>", "unit": "sec", "source": "<self-reported>", "verified": false}
      ]
    },
    {
      "id": "season_stats",
      "title": "Season Stats",
      "icon": "stats-chart",
      "content": "<1-3 paragraph narrative on season performance>",
      "items": [
        {"label": "<stat label>", "value": "<value>", "sublabel": "<season or category>", "source": "<maxpreps|self-reported>", "verified": <true|false>}
      ]
    },
    {
      "id": "recruiting_activity",
      "title": "Recruiting Activity",
      "icon": "school",
      "content": "<1-3 paragraph narrative on recruiting status, camps attended, interest received>",
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
      "content": "<1-2 paragraph narrative on academic standing, eligibility, class year>",
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
      "content": "<1-2 paragraph narrative on accolades, recognition, milestones>",
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

  private buildTeamIntelPrompt(teamData: Record<string, unknown>, raw: RawTeamData): string {
    const teamName = (teamData['teamName'] as string) || 'Unknown';
    const sport = (teamData['sport'] as string) || 'Unknown';
    const teamType = (teamData['teamType'] as string) || 'high-school';
    const location = [teamData['city'], teamData['state']].filter(Boolean).join(', ') || 'Unknown';
    const description = (teamData['description'] as string) || '';
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
    const gameStatsJson =
      raw.gameStats.length > 0
        ? JSON.stringify(raw.gameStats.slice(0, 20))
        : 'NONE — no game stats recorded yet';
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
═══ TEAM PROFILE ═══
Team: ${teamName}
Team ID: ${raw.teamData['id'] ?? 'unknown'}
Sport: ${sport}
Type: ${teamType}
Location: ${location}
Description: ${description}
Record: ${record ? JSON.stringify(record) : 'Not set'}
Mascot: ${branding?.['mascot'] ?? 'Not set'}

═══ RAW DATA ═══

ROSTER (${raw.roster.length} members from RosterEntries):
${rosterJson}

COACHING STAFF (${raw.staff.length} staff members):
${staffJson}

PLAYER STATS (PlayerStats by teamId):
${playerStatsJson}

GAME STATS (GameStats by teamId):
${gameStatsJson}

TEAM STATS (TeamStats):
${teamStatsJson}

EVENTS & SCHEDULE (${raw.events.length} events):
${eventsJson}

RECRUITING ACTIVITY (Recruiting by teamId):
${recruitingJson}

═══ TASK ═══
You are Agent X. Generate a 5-section team dossier in JSON.
You are the program's advocate — TELL THE PROGRAM'S STORY.
Do NOT produce player scores, tier labels, or ratings.
ABSOLUTE RULE: Base ALL content ONLY on ACTUAL data provided above.
- If ROSTER data is 'NONE': write only "No roster data has been added yet." — do NOT invent player names.
- If STAFF data is 'NONE': write only "No coaching staff has been added yet." — do NOT invent coaches.
- If PLAYER STATS, GAME STATS, or TEAM STATS data is 'NONE': write only "No [type] stats available yet." — do NOT invent stats, records, or scores.
- If RECRUITING data is 'NONE': write only "No recruiting activity has been recorded yet." — do NOT invent commits or prospects.
- If EVENTS data is 'NONE': write only "No schedule or events have been added yet." — do NOT invent games or opponents.

Output this EXACT JSON structure with all 5 sections:

{
  "sections": [
    {
      "id": "agent_overview",
      "title": "Agent Overview",
      "icon": "sparkles",
      "content": "<2-3 paragraph Agent X narrative — program identity, what defines this team, where they are right now. Based ONLY on provided profile data. If description is empty, state that the program has not yet added a bio.>",
      "sources": [{"platform": "agent-x", "label": "Agent X Analysis", "verified": false}]
    },
    {
      "id": "team",
      "title": "Team",
      "icon": "people",
      "content": "<1-2 paragraph narrative on roster composition and coaching staff. If ROSTER is NONE write: 'No roster data has been added yet.' If STAFF is NONE write: 'No coaching staff has been added yet.' Do NOT invent names.>",
      "items": [
        {"label": "Roster Size", "value": "${raw.roster.length > 0 ? raw.roster.length.toString() : 'Not recorded'}"},
        {"label": "Coaching Staff", "value": "${raw.staff.length > 0 ? raw.staff.length.toString() : 'Not recorded'}"}
      ]
    },
    {
      "id": "stats",
      "title": "Stats",
      "icon": "stats-chart",
      "content": "<1-2 paragraph narrative on team statistical profile. If ALL stats data is NONE write: 'No stats have been recorded yet.' Do NOT invent scores, records, or statistical values.>",
      "items": [
        {"label": "<stat label from actual data>", "value": "<actual value>", "sublabel": "<season>"}
      ]
    },
    {
      "id": "recruiting",
      "title": "Recruiting",
      "icon": "school",
      "content": "<1-2 paragraph narrative on recruiting pipeline. If RECRUITING is NONE write: 'No recruiting activity has been recorded yet.' Do NOT invent prospect names or college commitments.>",
      "items": [
        {"label": "Team ID", "value": "${String(raw.teamData['id'] ?? 'unknown')}"},
        {"label": "<recruiting label from actual data>", "value": "<actual value>"}
      ]
    },
    {
      "id": "schedule",
      "title": "Schedule",
      "icon": "calendar",
      "content": "<1-2 paragraph narrative on upcoming games or recent results. If EVENTS is NONE write: 'No schedule or events have been added yet.' Do NOT invent opponents, dates, or results.>",
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
    missingDataPrompts: Array<Record<string, string>>
  ): Record<string, unknown> {
    return {
      userId,
      sportName: sport,
      primaryPosition: position,
      status: 'ready',
      generatedBy: 'agent-x',

      sections: this.normalizeSections(
        parsed['sections'],
        ATHLETE_SECTION_ORDER,
        ATHLETE_SECTION_META
      ),
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

      sections: this.normalizeSections(parsed['sections'], TEAM_SECTION_ORDER, TEAM_SECTION_META),
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
        title: typeof section?.['title'] === 'string' ? section['title'] : fallbackMeta.title,
        icon: typeof section?.['icon'] === 'string' ? section['icon'] : fallbackMeta.icon,
        content: (() => {
          const raw = typeof section?.['content'] === 'string' ? section['content'].trim() : '';
          return raw || 'No data available for this section yet.';
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
      }));
    return sources.length > 0 ? sources : undefined;
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
          'Coaches want to see you play. Add your highlight reel to strengthen your dossier.',
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
          'All-conference selections, MVP awards, and academic honors belong in your dossier.',
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
}
