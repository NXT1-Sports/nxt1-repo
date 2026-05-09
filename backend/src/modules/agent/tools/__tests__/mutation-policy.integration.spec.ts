/**
 * @fileoverview AgentMutationPolicyService — Real MongoDB Integration Test
 *
 * Uses mongodb-memory-server to spin up a real Mongoose connection.
 * Verifies that EVERY write tool routes through the correct policy pipeline
 * steps (analytics → sync_delta → memory) and writes completed outbox rows.
 *
 * External I/O (analytics HTTP, sync-delta event recording, LLM/vector memory)
 * is mocked because those are separate system boundaries. The DB layer is real.
 *
 * Expected step counts per tool class:
 *   SYNC_MEMORY_PROFILED_TOOLS  → 3 steps (analytics + sync_delta + memory)
 *   TEAM_ANALYTICS_ONLY_TOOLS   → 1 step  (analytics only)
 *   Everything else             → 1 step  (analytics only — not yet profiled)
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { Connection } from 'mongoose';

// ─── Test connection — populated in beforeAll ─────────────────────────────────
let testConnection: Connection;

// ─── Mock: database.config — redirect outbox to in-memory Mongo ──────────────
vi.mock('../../../../config/database.config.js', () => ({
  getMongoEnvironmentConnection: () => testConnection,
  getMongoGlobalConnection: () => testConnection,
  getMongoEnvironmentScope: () => 'staging',
}));

// ─── Mock: Firebase (appDb) — used for team/org hydration in resolveScope ────
vi.mock('../../../../utils/firebase.js', () => ({
  db: {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => undefined }),
      }),
      where: () => ({
        limit: () => ({
          get: async () => ({ empty: true, docs: [] }),
        }),
      }),
    }),
  },
}));

// ─── Mock: Analytics logger — external write, not under test here ─────────────
vi.mock('../../../../services/core/analytics-logger.service.js', () => ({
  getAnalyticsLoggerService: () => ({
    safeTrack: vi.fn(async () => undefined),
  }),
}));

// ─── Mock: Sync-delta event service — external write, not under test here ─────
vi.mock('../../../../services/core/sync-delta-event.service.js', () => ({
  getSyncDeltaEventService: () => ({
    record: vi.fn(async () => ({ eventId: 'evt_integration_test', promptSummary: 'ok' })),
  }),
}));

// ─── Mock: LLM / Vector memory stack ─────────────────────────────────────────
vi.mock('../../llm/openrouter.service.js', () => ({
  OpenRouterService: class OpenRouterService {},
}));
vi.mock('../../memory/vector.service.js', () => ({
  VectorMemoryService: class VectorMemoryService {
    constructor(_llm: unknown) {}
  },
}));
vi.mock('../../memory/context-builder.js', () => ({
  ContextBuilder: class ContextBuilder {
    constructor(_vector: unknown) {}
  },
}));
vi.mock('../../memory/sync-memory-extractor.service.js', () => ({
  SyncMemoryExtractorService: class SyncMemoryExtractorService {
    async storeDeltaMemories(_delta: unknown) {
      return 1;
    }
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOutboxRows(userId: string) {
  const { getAgentMutationPolicyOutboxModel } =
    await import('../../../../models/agent/agent-mutation-policy-outbox.model.js');
  return getAgentMutationPolicyOutboxModel(testConnection).find({ userId }).lean().exec();
}

function printRows(
  label: string,
  rows: { step: string; status: string; toolName?: string }[],
  expected: number
) {
  console.log(`\n  ${label}`);
  for (const r of rows) {
    console.log(`    step=${r.step.padEnd(12)}  status=${r.status}`);
  }
  const pass = rows.length === expected ? '✅' : '❌';
  console.log(`    ${pass} rows=${rows.length}  expected=${expected}`);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AgentMutationPolicyService — All Write Tools Integration (real MongoDB)', () => {
  let mongoServer: MongoMemoryServer;
  let service: { apply: (input: unknown) => Promise<void> };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    testConnection = mongoose.createConnection(mongoServer.getUri());
    await testConnection.asPromise();
    const mod = await import('../mutation-policy.service.js');
    service = new mod.AgentMutationPolicyService();
  });

  afterAll(async () => {
    await testConnection.close();
    await mongoServer.stop();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GROUP A — SYNC_MEMORY_PROFILED_TOOLS (expect 3 steps each)
  // ────────────────────────────────────────────────────────────────────────────

  it('write_schedule → 3 steps', async () => {
    await service.apply({
      toolName: 'write_schedule',
      input: {
        userId: 'u_schedule',
        sport: 'basketball',
        source: 'hudl',
        schedule: [
          { date: '2026-11-01', opponent: 'North High', location: 'Home' },
          { date: '2026-11-08', opponent: 'South High', location: 'Away' },
        ],
      },
      context: { userId: 'u_schedule', operationId: 'op_schedule' },
    });
    const rows = await getOutboxRows('u_schedule');
    printRows('write_schedule', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.step).sort()).toEqual(['analytics', 'memory', 'sync_delta']);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('write_calendar_events → 3 steps', async () => {
    await service.apply({
      toolName: 'write_calendar_events',
      input: {
        userId: 'u_calendar',
        sport: 'soccer',
        source: 'manual',
        events: [
          { date: '2026-10-15', opponent: 'West High', location: 'Away' },
          { date: '2026-10-22', opponent: 'Central High', location: 'Home' },
        ],
      },
      context: { userId: 'u_calendar', operationId: 'op_calendar' },
    });
    const rows = await getOutboxRows('u_calendar');
    printRows('write_calendar_events', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.step).sort()).toEqual(['analytics', 'memory', 'sync_delta']);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('write_core_identity → 3 steps', async () => {
    await service.apply({
      toolName: 'write_core_identity',
      input: {
        userId: 'u_identity',
        firstName: 'Jordan',
        lastName: 'Hayes',
        school: 'Lincoln High',
        sport: 'basketball',
      },
      context: { userId: 'u_identity', operationId: 'op_identity' },
    });
    const rows = await getOutboxRows('u_identity');
    printRows('write_core_identity', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.step).sort()).toEqual(['analytics', 'memory', 'sync_delta']);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('write_season_stats → 3 steps', async () => {
    await service.apply({
      toolName: 'write_season_stats',
      input: {
        userId: 'u_season_stats',
        sport: 'football',
        source: 'maxpreps',
        stats: [
          { season: '2025-2026', category: 'passing', field: 'touchdowns', value: 24 },
          { season: '2025-2026', category: 'passing', field: 'yards', value: 2850 },
        ],
      },
      context: { userId: 'u_season_stats', operationId: 'op_season_stats' },
    });
    const rows = await getOutboxRows('u_season_stats');
    printRows('write_season_stats', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.step).sort()).toEqual(['analytics', 'memory', 'sync_delta']);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('write_rankings → 3 steps', async () => {
    await service.apply({
      toolName: 'write_rankings',
      input: {
        userId: 'u_rankings',
        sport: 'football',
        source: 'rivals',
        rankings: [
          { rankingSystem: 'Rivals', rank: 47, nationalRank: 47 },
          { rankingSystem: '247Sports', rank: 52, nationalRank: 52 },
        ],
      },
      context: { userId: 'u_rankings', operationId: 'op_rankings' },
    });
    const rows = await getOutboxRows('u_rankings');
    printRows('write_rankings', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.step).sort()).toEqual(['analytics', 'memory', 'sync_delta']);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('write_combine_metrics → 3 steps', async () => {
    await service.apply({
      toolName: 'write_combine_metrics',
      input: {
        userId: 'u_combine',
        sport: 'football',
        source: 'nfl_combine',
        metrics: [
          { metricName: '40yd_dash', value: 4.38, unit: 'seconds' },
          { metricName: 'vertical_jump', value: 38.5, unit: 'inches' },
          { metricName: 'bench_press', value: 22, unit: 'reps' },
        ],
      },
      context: { userId: 'u_combine', operationId: 'op_combine' },
    });
    const rows = await getOutboxRows('u_combine');
    printRows('write_combine_metrics', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.step).sort()).toEqual(['analytics', 'memory', 'sync_delta']);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('write_recruiting_activity → 3 steps', async () => {
    await service.apply({
      toolName: 'write_recruiting_activity',
      input: {
        userId: 'u_recruiting',
        sport: 'basketball',
        source: 'verbal_commits',
        activities: [
          {
            activityType: 'offer',
            schoolName: 'Duke University',
            date: '2026-01-15',
            coachName: 'Coach K',
          },
          { activityType: 'visit', schoolName: 'UNC Chapel Hill', date: '2026-02-10' },
          { activityType: 'commitment', schoolName: 'Duke University', date: '2026-03-01' },
        ],
      },
      context: { userId: 'u_recruiting', operationId: 'op_recruiting' },
    });
    const rows = await getOutboxRows('u_recruiting');
    printRows('write_recruiting_activity', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.step).sort()).toEqual(['analytics', 'memory', 'sync_delta']);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('write_awards → 3 steps', async () => {
    await service.apply({
      toolName: 'write_awards',
      input: {
        userId: 'u_awards',
        sport: 'basketball',
        source: 'maxpreps',
        awards: [
          {
            awardName: 'All-State First Team',
            category: 'academic',
            awardedBy: 'State Athletic Assoc',
            year: '2025',
          },
          {
            awardName: 'Player of the Year',
            category: 'performance',
            awardedBy: 'City Conference',
            year: '2025',
          },
        ],
      },
      context: { userId: 'u_awards', operationId: 'op_awards' },
    });
    const rows = await getOutboxRows('u_awards');
    printRows('write_awards', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.step).sort()).toEqual(['analytics', 'memory', 'sync_delta']);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('write_athlete_videos → 3 steps', async () => {
    await service.apply({
      toolName: 'write_athlete_videos',
      input: {
        userId: 'u_videos',
        sport: 'football',
        source: 'hudl',
        videos: [
          { url: 'https://hudl.com/v/abc123', platform: 'hudl', title: '2025 Highlights' },
          { url: 'https://youtu.be/xyz456', platform: 'youtube', title: 'Junior Year Film' },
        ],
      },
      context: { userId: 'u_videos', operationId: 'op_videos' },
    });
    const rows = await getOutboxRows('u_videos');
    printRows('write_athlete_videos', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.step).sort()).toEqual(['analytics', 'memory', 'sync_delta']);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('write_playbooks → 3 steps', async () => {
    await service.apply({
      toolName: 'write_playbooks',
      input: {
        userId: 'u_playbooks',
        sport: 'football',
        source: 'agent_x',
        playbooks: [
          {
            name: 'Wing T Offense',
            sport: 'football',
            playCount: 48,
            formationTypes: ['wing-t', 'I-formation'],
          },
          { name: '4-3 Defense', sport: 'football', playCount: 32, formationTypes: ['4-3', '3-4'] },
        ],
      },
      context: { userId: 'u_playbooks', operationId: 'op_playbooks' },
    });
    const rows = await getOutboxRows('u_playbooks');
    printRows('write_playbooks', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.step).sort()).toEqual(['analytics', 'memory', 'sync_delta']);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('write_team_stats → 3 steps', async () => {
    await service.apply({
      toolName: 'write_team_stats',
      input: {
        userId: 'u_team_stats',
        teamId: 'team_xyz',
        sportId: 'football',
        season: '2025-2026',
        stats: [
          { field: 'wins', label: 'Wins', value: 11, category: 'record' },
          { field: 'losses', label: 'Losses', value: 2, category: 'record' },
          { field: 'ppg', label: 'Points Per Game', value: 34.2, unit: 'pts', category: 'offense' },
        ],
      },
      context: { userId: 'u_team_stats', operationId: 'op_team_stats' },
    });
    const rows = await getOutboxRows('u_team_stats');
    printRows('write_team_stats', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.step).sort()).toEqual(['analytics', 'memory', 'sync_delta']);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GROUP B — TEAM_ANALYTICS_ONLY_TOOLS (expect 1 step: analytics only)
  // ────────────────────────────────────────────────────────────────────────────

  it('write_team_news → 1 step (analytics only)', async () => {
    await service.apply({
      toolName: 'write_team_news',
      input: {
        userId: 'u_team_news',
        teamId: 'team_news_abc',
        sport: 'football',
        articles: [
          { title: 'Eagles Win State Championship', url: 'https://example.com/news/1' },
          { title: 'Coach Named Coach of the Year', url: 'https://example.com/news/2' },
        ],
      },
      context: { userId: 'u_team_news', operationId: 'op_team_news' },
    });
    const rows = await getOutboxRows('u_team_news');
    printRows('write_team_news', rows, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.step).toBe('analytics');
    expect(rows[0]!.status).toBe('completed');
  });

  it('write_team_post → 1 step (analytics only)', async () => {
    await service.apply({
      toolName: 'write_team_post',
      input: {
        userId: 'u_team_post',
        teamId: 'team_post_abc',
        sport: 'basketball',
        posts: [{ content: 'Big game Friday night! Come support the team!' }],
      },
      context: { userId: 'u_team_post', operationId: 'op_team_post' },
    });
    const rows = await getOutboxRows('u_team_post');
    printRows('write_team_post', rows, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.step).toBe('analytics');
    expect(rows[0]!.status).toBe('completed');
  });

  it('write_roster_entries → 1 step (analytics only)', async () => {
    await service.apply({
      toolName: 'write_roster_entries',
      input: {
        userId: 'u_roster',
        teamId: 'team_roster_abc',
        sport: 'soccer',
        entries: [
          {
            userId: 'player_1',
            sport: 'soccer',
            positions: ['midfielder'],
            jerseyNumber: '10',
            status: 'active',
          },
          {
            userId: 'player_2',
            sport: 'soccer',
            positions: ['goalkeeper'],
            jerseyNumber: '1',
            status: 'active',
          },
        ],
      },
      context: { userId: 'u_roster', operationId: 'op_roster' },
    });
    const rows = await getOutboxRows('u_roster');
    printRows('write_roster_entries', rows, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.step).toBe('analytics');
    expect(rows[0]!.status).toBe('completed');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GROUP C — Unclassified tools (expect 1 step: analytics only)
  // ────────────────────────────────────────────────────────────────────────────

  it('write_timeline_post → 1 step (analytics only — not yet profiled)', async () => {
    await service.apply({
      toolName: 'write_timeline_post',
      input: {
        userId: 'u_timeline',
        sport: 'basketball',
        content: 'Just hit a new PR in the weight room. Season is looking 🔥',
      },
      context: { userId: 'u_timeline', operationId: 'op_timeline' },
    });
    const rows = await getOutboxRows('u_timeline');
    printRows('write_timeline_post', rows, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.step).toBe('analytics');
    expect(rows[0]!.status).toBe('completed');
  });

  it('write_athlete_images → 1 step (analytics only — not yet profiled)', async () => {
    await service.apply({
      toolName: 'write_athlete_images',
      input: {
        userId: 'u_images',
        targetSport: 'football',
        source: 'instagram',
        images: [
          { url: 'https://cdn.example.com/action1.jpg', caption: 'Game action shot' },
          { url: 'https://cdn.example.com/action2.jpg', caption: 'Touchdown celebration' },
        ],
      },
      context: { userId: 'u_images', operationId: 'op_images' },
    });
    const rows = await getOutboxRows('u_images');
    printRows('write_athlete_images', rows, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.step).toBe('analytics');
    expect(rows[0]!.status).toBe('completed');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // CROSS-CUTTING: Dedupe guarantee
  // ────────────────────────────────────────────────────────────────────────────

  it('dedupe: same payload called twice writes exactly 3 rows (not 6)', async () => {
    const payload = {
      toolName: 'write_combine_metrics',
      input: {
        userId: 'u_dedupe',
        sport: 'football',
        metrics: [{ metricName: '40yd_dash', value: 4.45, unit: 'seconds' }],
      },
      context: { userId: 'u_dedupe', operationId: 'op_dedupe_combine' },
    };
    await service.apply(payload);
    await service.apply(payload); // Second call — must be a no-op
    const rows = await getOutboxRows('u_dedupe');
    printRows('dedupe (write_combine_metrics x2)', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.attempts === 1)).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // CROSS-CUTTING: Synthetic fallback guarantee
  // ────────────────────────────────────────────────────────────────────────────

  it('synthetic fallback: bad adapter input still writes 3 completed rows', async () => {
    await service.apply({
      toolName: 'write_rankings',
      input: {
        userId: 'u_fallback_rankings',
        sport: 'football',
        // rankings[] intentionally omitted → adapter errors → synthetic kicks in
      },
      context: { userId: 'u_fallback_rankings', operationId: 'op_fallback_rankings' },
    });
    const rows = await getOutboxRows('u_fallback_rankings');
    printRows('synthetic fallback (write_rankings, no rankings[])', rows, 3);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });
});
