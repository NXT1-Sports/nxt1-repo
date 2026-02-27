/**
 * @fileoverview Seed Routes — Staging / Dev Only
 * @module @nxt1/backend/routes/seed
 *
 * Populates comprehensive test data into Firestore for a given user.
 * Uses batch writes for efficiency (max 500 ops/batch — auto-split).
 *
 * Endpoints:
 *   POST /api/v1/staging/seed/:userId          — seed ALL collections
 *   DELETE /api/v1/staging/seed/:userId        — wipe seeded data
 *
 * Requires: Bearer token (appGuard). Users can only seed their own data.
 * Available on /api/v1/staging/* only (registered separately in index.ts).
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { Timestamp, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { notFoundError } from '@nxt1/core/errors';
import { logger } from '../utils/logger.js';
import type {
  ScheduleEvent,
  RecruitingActivity,
  VerifiedMetric,
  VerifiedStat,
  SportProfile,
} from '@nxt1/core';
import { POSTS_COLLECTIONS, PostVisibility } from '@nxt1/core/constants';
import { PROFILE_CACHE_KEYS } from '@nxt1/core';
import { getCacheService } from '../services/cache.service.js';

const router: ExpressRouter = Router();

// ─── Cache helpers ────────────────────────────────────────────────────────────
async function bustProfileCache(
  userId: string,
  username?: string | null,
  unicode?: string | null
): Promise<void> {
  const cache = getCacheService();
  const keys: string[] = [`${PROFILE_CACHE_KEYS.BY_ID}${userId}`];
  if (username) keys.push(`${PROFILE_CACHE_KEYS.BY_USERNAME}${username.toLowerCase()}`);
  if (unicode) keys.push(`${PROFILE_CACHE_KEYS.BY_UNICODE}${unicode.toLowerCase()}`);
  await Promise.all(keys.map((k) => cache.del(k)));
  logger.debug('[Seed] Profile cache busted', { userId, keys: keys.length });
}

// ─── Collection names ─────────────────────────────────────────────────────────
const USERS_COL = 'Users';
const RANKINGS_COL = 'Rankings';

// ─── Batch helper: auto-split into chunks of 499 ─────────────────────────────
async function commitBatches(
  db: Firestore,
  ops: Array<(batch: WriteBatch) => void>
): Promise<void> {
  const CHUNK = 499;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK).forEach((op) => op(batch));
    await batch.commit();
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}
function daysAgo(n: number): string {
  return daysFromNow(-n);
}

// ─── Seed data builders ───────────────────────────────────────────────────────

function buildScheduleEvents(uid: string): ScheduleEvent[] {
  return [
    // Upcoming games
    {
      id: `seed_${uid}_game_01`,
      eventType: 'game',
      title: 'vs. West Valley HS',
      date: daysFromNow(7),
      location: 'Home Field, HCMC',
      opponent: 'West Valley High School',
      source: 'manual',
    },
    {
      id: `seed_${uid}_game_02`,
      eventType: 'game',
      title: '@ North Shore HS',
      date: daysFromNow(14),
      location: 'North Shore Stadium, HCMC',
      opponent: 'North Shore High School',
      source: 'manual',
    },
    {
      id: `seed_${uid}_game_03`,
      eventType: 'game',
      title: 'Regional Playoff — vs. East River HS',
      date: daysFromNow(45),
      location: 'City Stadium, HCMC',
      opponent: 'East River High School',
      source: 'manual',
    },
    // Upcoming camp & visit
    {
      id: `seed_${uid}_camp_01`,
      eventType: 'camp',
      title: 'NXT1 Elite QB Camp',
      date: daysFromNow(21),
      endDate: daysFromNow(22),
      location: 'HCMC Sports Complex',
      url: 'https://nxt1sports.com',
      source: 'manual',
    },
    {
      id: `seed_${uid}_visit_01`,
      eventType: 'visit',
      title: 'Official Visit — VinUniversity',
      date: daysFromNow(30),
      endDate: daysFromNow(31),
      location: 'VinUniversity, Hanoi',
      source: 'manual',
    },
    // Past games with results
    {
      id: `seed_${uid}_game_past_01`,
      eventType: 'game',
      title: 'vs. Riverside HS',
      date: daysAgo(7),
      location: 'Home Field, HCMC',
      opponent: 'Riverside High School',
      result: 'W 35-14',
      source: 'manual',
    },
    {
      id: `seed_${uid}_game_past_02`,
      eventType: 'game',
      title: '@ Highland HS',
      date: daysAgo(14),
      location: 'Highland Stadium',
      opponent: 'Highland High School',
      result: 'W 21-17',
      source: 'manual',
    },
    {
      id: `seed_${uid}_game_past_03`,
      eventType: 'game',
      title: 'vs. Bayshore HS',
      date: daysAgo(21),
      location: 'Home Field, HCMC',
      opponent: 'Bayshore High School',
      result: 'L 17-24',
      source: 'manual',
    },
  ];
}

function buildRecruitingActivities(uid: string): RecruitingActivity[] {
  const now = new Date().toISOString();
  return [
    // Offers
    {
      id: `seed_${uid}_offer_01`,
      category: 'offer',
      collegeId: 'vinuniversity',
      collegeName: 'VinUniversity',
      division: 'D1',
      conference: 'VFA Conference',
      city: 'Hanoi',
      state: 'Hanoi',
      sport: 'football',
      scholarshipType: 'full',
      date: daysAgo(30),
      coachName: 'Coach Duc Nguyen',
      coachTitle: 'Head Coach',
      notes: 'Full scholarship offer for QB position',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(30),
      updatedAt: now,
    },
    {
      id: `seed_${uid}_offer_02`,
      category: 'offer',
      collegeId: 'rmit-vietnam',
      collegeName: 'RMIT Vietnam',
      division: 'D1',
      conference: 'Vietnam College League',
      city: 'Ho Chi Minh City',
      state: 'Thanh Pho Ho Chi Minh',
      sport: 'football',
      scholarshipType: 'partial',
      date: daysAgo(45),
      coachName: 'Coach Tran',
      coachTitle: 'Offensive Coordinator',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(45),
      updatedAt: now,
    },
    {
      id: `seed_${uid}_offer_03`,
      category: 'offer',
      collegeId: 'fpt-university',
      collegeName: 'FPT University',
      division: 'D2',
      city: 'Ho Chi Minh City',
      state: 'Thanh Pho Ho Chi Minh',
      sport: 'football',
      scholarshipType: 'partial',
      date: daysAgo(60),
      source: 'manual',
      verified: false,
      createdAt: daysAgo(60),
      updatedAt: now,
    },
    // Interest
    {
      id: `seed_${uid}_interest_01`,
      category: 'interest',
      collegeId: 'usth-hanoi',
      collegeName: 'Univ. of Science & Tech Hanoi',
      division: 'D1',
      city: 'Hanoi',
      state: 'Hanoi',
      sport: 'football',
      date: daysAgo(20),
      coachName: 'Coach Minh',
      coachTitle: 'Recruiting Coordinator',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(20),
      updatedAt: now,
    },
    {
      id: `seed_${uid}_interest_02`,
      category: 'interest',
      collegeId: 'hust',
      collegeName: 'Hanoi Univ. of Science & Technology',
      division: 'D1',
      city: 'Hanoi',
      state: 'Hanoi',
      sport: 'football',
      date: daysAgo(15),
      source: 'manual',
      verified: false,
      createdAt: daysAgo(15),
      updatedAt: now,
    },
    // Visit
    {
      id: `seed_${uid}_visit_01`,
      category: 'visit',
      collegeId: 'vinuniversity',
      collegeName: 'VinUniversity',
      division: 'D1',
      city: 'Hanoi',
      state: 'Hanoi',
      sport: 'football',
      visitType: 'official',
      date: daysFromNow(30),
      endDate: daysFromNow(31),
      coachName: 'Coach Duc Nguyen',
      coachTitle: 'Head Coach',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(10),
      updatedAt: now,
    },
    // Camp
    {
      id: `seed_${uid}_camp_01`,
      category: 'camp',
      collegeId: 'fpt-university',
      collegeName: 'FPT University',
      division: 'D2',
      city: 'Ho Chi Minh City',
      state: 'Thanh Pho Ho Chi Minh',
      sport: 'football',
      date: daysAgo(90),
      endDate: daysAgo(89),
      notes: 'Stood out as top QB. Received interest from coaching staff.',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(90),
      updatedAt: now,
    },
    // Contact
    {
      id: `seed_${uid}_contact_01`,
      category: 'contact',
      collegeId: 'vinuniversity',
      collegeName: 'VinUniversity',
      division: 'D1',
      city: 'Hanoi',
      state: 'Hanoi',
      sport: 'football',
      date: daysAgo(5),
      coachName: 'Coach Duc Nguyen',
      coachTitle: 'Head Coach',
      notes: 'Phone call — discussed scholarship package and team goals.',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(5),
      updatedAt: now,
    },
  ];
}

function buildVerifiedStats(uid: string): VerifiedStat[] {
  const updatedAt = new Date().toISOString();
  const season = '2025-2026';
  return [
    {
      id: `seed_${uid}_stat_passyds`,
      field: 'passing_yards',
      label: 'Passing Yards',
      value: 2847,
      unit: 'yds',
      category: 'offense',
      season,
      source: 'maxpreps',
      verified: true,
      verifiedBy: 'MaxPreps',
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_stat_passtd`,
      field: 'passing_tds',
      label: 'Passing TDs',
      value: 28,
      category: 'offense',
      season,
      source: 'maxpreps',
      verified: true,
      verifiedBy: 'MaxPreps',
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_stat_int`,
      field: 'interceptions',
      label: 'Interceptions',
      value: 5,
      category: 'offense',
      season,
      source: 'maxpreps',
      verified: true,
      verifiedBy: 'MaxPreps',
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_stat_cmp`,
      field: 'completion_pct',
      label: 'Completion %',
      value: 67.3,
      unit: '%',
      category: 'offense',
      season,
      source: 'manual',
      verified: false,
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_stat_rushyds`,
      field: 'rushing_yards',
      label: 'Rushing Yards',
      value: 612,
      unit: 'yds',
      category: 'offense',
      season,
      source: 'maxpreps',
      verified: true,
      verifiedBy: 'MaxPreps',
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_stat_rushtd`,
      field: 'rushing_tds',
      label: 'Rushing TDs',
      value: 8,
      category: 'offense',
      season,
      source: 'maxpreps',
      verified: true,
      verifiedBy: 'MaxPreps',
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_stat_rating`,
      field: 'passer_rating',
      label: 'Passer Rating',
      value: 118.4,
      category: 'offense',
      season,
      source: 'manual',
      verified: false,
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_stat_games`,
      field: 'games_played',
      label: 'Games Played',
      value: 10,
      category: 'offense',
      season,
      source: 'maxpreps',
      verified: true,
      verifiedBy: 'MaxPreps',
      dateRecorded: daysAgo(30),
      updatedAt,
    },
  ];
}

function buildVerifiedMetrics(uid: string): VerifiedMetric[] {
  const updatedAt = new Date().toISOString();
  const dateRecorded = daysAgo(60);
  return [
    {
      id: `seed_${uid}_met_forty`,
      field: '40_yard_dash',
      label: '40-Yard Dash',
      value: 4.52,
      unit: 's',
      category: 'speed',
      source: 'combine',
      verified: true,
      verifiedBy: 'NXT1 Combine',
      dateRecorded,
      updatedAt,
    },
    {
      id: `seed_${uid}_met_vertical`,
      field: 'vertical_jump',
      label: 'Vertical Jump',
      value: 34,
      unit: 'in',
      category: 'explosiveness',
      source: 'combine',
      verified: true,
      verifiedBy: 'NXT1 Combine',
      dateRecorded,
      updatedAt,
    },
    {
      id: `seed_${uid}_met_shuttle`,
      field: 'shuttle_run_5_10_5',
      label: '5-10-5 Shuttle',
      value: 4.18,
      unit: 's',
      category: 'agility',
      source: 'combine',
      verified: true,
      verifiedBy: 'NXT1 Combine',
      dateRecorded,
      updatedAt,
    },
    {
      id: `seed_${uid}_met_bench`,
      field: 'bench_press',
      label: 'Bench Press',
      value: 225,
      unit: 'lbs',
      category: 'strength',
      source: 'manual',
      verified: false,
      dateRecorded,
      updatedAt,
    },
    {
      id: `seed_${uid}_met_broad`,
      field: 'broad_jump',
      label: 'Broad Jump',
      value: 118,
      unit: 'in',
      category: 'explosiveness',
      source: 'combine',
      verified: true,
      verifiedBy: 'NXT1 Combine',
      dateRecorded,
      updatedAt,
    },
    {
      id: `seed_${uid}_met_height`,
      field: 'height',
      label: 'Height',
      value: '5\'10"',
      category: 'physical',
      source: 'manual',
      verified: false,
      dateRecorded,
      updatedAt,
    },
    {
      id: `seed_${uid}_met_weight`,
      field: 'weight',
      label: 'Weight',
      value: 175,
      unit: 'lbs',
      category: 'physical',
      source: 'manual',
      verified: false,
      dateRecorded,
      updatedAt,
    },
  ];
}

// ─── Basketball seed data builders ────────────────────────────────────────────

function buildBasketballStats(uid: string): VerifiedStat[] {
  const updatedAt = new Date().toISOString();
  const season = '2025-2026';
  return [
    {
      id: `seed_${uid}_bb_stat_pts`,
      field: 'points_per_game',
      label: 'Points Per Game',
      value: 22.4,
      unit: 'ppg',
      category: 'offense',
      season,
      source: 'maxpreps',
      verified: true,
      verifiedBy: 'MaxPreps',
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_stat_reb`,
      field: 'rebounds_per_game',
      label: 'Rebounds Per Game',
      value: 8.1,
      unit: 'rpg',
      category: 'defense',
      season,
      source: 'maxpreps',
      verified: true,
      verifiedBy: 'MaxPreps',
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_stat_ast`,
      field: 'assists_per_game',
      label: 'Assists Per Game',
      value: 6.7,
      unit: 'apg',
      category: 'playmaking',
      season,
      source: 'maxpreps',
      verified: true,
      verifiedBy: 'MaxPreps',
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_stat_stl`,
      field: 'steals_per_game',
      label: 'Steals Per Game',
      value: 2.3,
      unit: 'spg',
      category: 'defense',
      season,
      source: 'maxpreps',
      verified: true,
      verifiedBy: 'MaxPreps',
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_stat_blk`,
      field: 'blocks_per_game',
      label: 'Blocks Per Game',
      value: 1.1,
      unit: 'bpg',
      category: 'defense',
      season,
      source: 'maxpreps',
      verified: false,
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_stat_fgpct`,
      field: 'field_goal_pct',
      label: 'Field Goal %',
      value: 48.6,
      unit: '%',
      category: 'efficiency',
      season,
      source: 'maxpreps',
      verified: true,
      verifiedBy: 'MaxPreps',
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_stat_3ppct`,
      field: 'three_point_pct',
      label: '3-Point %',
      value: 37.2,
      unit: '%',
      category: 'efficiency',
      season,
      source: 'manual',
      verified: false,
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_stat_ftpct`,
      field: 'free_throw_pct',
      label: 'Free Throw %',
      value: 82.5,
      unit: '%',
      category: 'efficiency',
      season,
      source: 'manual',
      verified: false,
      dateRecorded: daysAgo(30),
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_stat_games`,
      field: 'games_played',
      label: 'Games Played',
      value: 18,
      category: 'general',
      season,
      source: 'maxpreps',
      verified: true,
      verifiedBy: 'MaxPreps',
      dateRecorded: daysAgo(30),
      updatedAt,
    },
  ];
}

function buildBasketballMetrics(uid: string): VerifiedMetric[] {
  const updatedAt = new Date().toISOString();
  const dateRecorded = daysAgo(45);
  return [
    {
      id: `seed_${uid}_bb_met_vertical`,
      field: 'vertical_jump',
      label: 'Vertical Jump',
      value: 38,
      unit: 'in',
      category: 'explosiveness',
      source: 'combine',
      verified: true,
      verifiedBy: 'NXT1 Combine',
      dateRecorded,
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_met_wingspan`,
      field: 'wingspan',
      label: 'Wingspan',
      value: '6\'4"',
      category: 'physical',
      source: 'combine',
      verified: true,
      verifiedBy: 'NXT1 Combine',
      dateRecorded,
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_met_reach`,
      field: 'standing_reach',
      label: 'Standing Reach',
      value: '8\'3"',
      category: 'physical',
      source: 'combine',
      verified: true,
      verifiedBy: 'NXT1 Combine',
      dateRecorded,
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_met_lane`,
      field: 'lane_agility',
      label: 'Lane Agility',
      value: 10.8,
      unit: 's',
      category: 'agility',
      source: 'combine',
      verified: true,
      verifiedBy: 'NXT1 Combine',
      dateRecorded,
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_met_sprint`,
      field: 'three_quarter_sprint',
      label: '3/4 Court Sprint',
      value: 3.28,
      unit: 's',
      category: 'speed',
      source: 'combine',
      verified: true,
      verifiedBy: 'NXT1 Combine',
      dateRecorded,
      updatedAt,
    },
    {
      id: `seed_${uid}_bb_met_height`,
      field: 'height',
      label: 'Height',
      value: '6\'1"',
      category: 'physical',
      source: 'manual',
      verified: false,
      dateRecorded,
      updatedAt,
    },
  ];
}

function buildBasketballScheduleEvents(uid: string): ScheduleEvent[] {
  return [
    {
      id: `seed_${uid}_bb_game_01`,
      eventType: 'game',
      title: 'vs. Riverside Hoops Academy',
      date: daysFromNow(5),
      location: 'Home Gym, HCMC',
      opponent: 'Riverside Hoops Academy',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_game_02`,
      eventType: 'game',
      title: '@ HCMC Prep Classic',
      date: daysFromNow(12),
      location: 'Nguyen Du Indoor Arena, HCMC',
      opponent: 'HCMC Prep All-Stars',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_tournament_01`,
      eventType: 'camp',
      title: '3-on-3 AAU Tournament',
      date: daysFromNow(20),
      endDate: daysFromNow(21),
      location: 'HCMC Sports Complex, Hall B',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_camp_01`,
      eventType: 'camp',
      title: 'NXT1 Elite Guard Camp',
      date: daysFromNow(35),
      endDate: daysFromNow(36),
      location: 'HCMC Sports Complex',
      url: 'https://nxt1sports.com',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_visit_01`,
      eventType: 'visit',
      title: 'Official Visit — VinUniversity Basketball',
      date: daysFromNow(48),
      endDate: daysFromNow(49),
      location: 'VinUniversity, Hanoi',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_game_past_01`,
      eventType: 'game',
      title: 'vs. North Shore HS',
      date: daysAgo(6),
      location: 'Home Gym, HCMC',
      opponent: 'North Shore High School',
      result: 'W 72-58',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_game_past_02`,
      eventType: 'game',
      title: '@ East River HS Invitational',
      date: daysAgo(13),
      location: 'East River Arena',
      opponent: 'East River High School',
      result: 'W 65-60',
      source: 'manual',
    },
  ];
}

function buildBasketballRecruitingActivities(uid: string): RecruitingActivity[] {
  const now = new Date().toISOString();
  return [
    {
      id: `seed_${uid}_bb_offer_01`,
      category: 'offer',
      collegeId: 'vinuniversity',
      collegeName: 'VinUniversity',
      division: 'D1',
      conference: 'VFA Conference',
      city: 'Hanoi',
      state: 'Hanoi',
      sport: 'basketball',
      scholarshipType: 'full',
      date: daysAgo(20),
      coachName: 'Coach Minh Tran',
      coachTitle: 'Head Basketball Coach',
      notes: 'Full scholarship — Point Guard role',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(20),
      updatedAt: now,
    },
    {
      id: `seed_${uid}_bb_offer_02`,
      category: 'offer',
      collegeId: 'rmit-vietnam',
      collegeName: 'RMIT Vietnam',
      division: 'D1',
      conference: 'Vietnam College League',
      city: 'Ho Chi Minh City',
      state: 'Thanh Pho Ho Chi Minh',
      sport: 'basketball',
      scholarshipType: 'partial',
      date: daysAgo(35),
      coachName: 'Coach Nguyen',
      coachTitle: 'Assistant Basketball Coach',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(35),
      updatedAt: now,
    },
    {
      id: `seed_${uid}_bb_contact_01`,
      category: 'contact',
      collegeId: 'fpt-university',
      collegeName: 'FPT University',
      division: 'D2',
      city: 'Ho Chi Minh City',
      state: 'Thanh Pho Ho Chi Minh',
      sport: 'basketball',
      date: daysAgo(8),
      coachName: 'Coach Le',
      coachTitle: 'Basketball Director',
      notes: 'Initial contact — interested in highlights and upcoming schedule.',
      source: 'manual',
      verified: false,
      createdAt: daysAgo(8),
      updatedAt: now,
    },
    {
      id: `seed_${uid}_bb_visit_recruit_01`,
      category: 'visit',
      collegeId: 'vinuniversity',
      collegeName: 'VinUniversity',
      division: 'D1',
      city: 'Hanoi',
      state: 'Hanoi',
      sport: 'basketball',
      date: daysFromNow(48),
      endDate: daysFromNow(49),
      coachName: 'Coach Minh Tran',
      coachTitle: 'Head Basketball Coach',
      notes: 'Official campus visit scheduled.',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(10),
      updatedAt: now,
    },
  ];
}

interface PostSeedDoc {
  userId: string;
  title?: string;
  content: string;
  type: string;
  visibility: PostVisibility;
  images: string[];
  mentions: string[];
  hashtags: string[];
  isPinned: boolean;
  commentsDisabled: boolean;
  mediaUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  createdAt: ReturnType<typeof Timestamp.now>;
  updatedAt: ReturnType<typeof Timestamp.now>;
  stats: { likes: number; comments: number; shares: number; views: number };
}

function buildPosts(uid: string): PostSeedDoc[] {
  const ts = (daysAgoNum: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgoNum);
    return Timestamp.fromDate(d);
  };
  return [
    // Pinned offer announcement
    {
      userId: uid,
      title: 'Official Visit Offer — VinUniversity 🎓',
      content:
        'Blessed and grateful 🙏 Received an official visit offer from VinUniversity! Hard work pays off. #Recruiting #D1 #2026',
      type: 'offer',
      visibility: PostVisibility.PUBLIC,
      images: [],
      mentions: [],
      hashtags: ['Recruiting', 'D1', '2026'],
      isPinned: true,
      commentsDisabled: false,
      createdAt: ts(30),
      updatedAt: ts(30),
      stats: { likes: 124, comments: 35, shares: 18, views: 890 },
    },
    // Highlight reel
    {
      userId: uid,
      title: 'Week 9 Highlights — 312yd / 3 TD',
      content:
        '🏈 Big W tonight — 35-14 vs Riverside HS. Threw for 312 yards and 3 TDs. Full highlight reel below. #NXT1 #QB #Football',
      type: 'highlight',
      visibility: PostVisibility.PUBLIC,
      images: [],
      mentions: [],
      hashtags: ['NXT1', 'QB', 'Football'],
      isPinned: false,
      commentsDisabled: false,
      thumbnailUrl: 'https://placehold.co/640x360/1a1a2e/00ff88?text=Week+9+Highlights',
      mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      duration: 142,
      createdAt: ts(7),
      updatedAt: ts(7),
      stats: { likes: 48, comments: 12, shares: 6, views: 1320 },
    },
    // Stat update
    {
      userId: uid,
      title: 'Season Stats Update 📊',
      content:
        'Through 9 games: 2,481 passing yards, 24 TDs, 4 INTs. Completion rate up to 68%. Grinding every week. #Stats #QBLife',
      type: 'stat',
      visibility: PostVisibility.PUBLIC,
      images: [],
      mentions: [],
      hashtags: ['Stats', 'QBLife'],
      isPinned: false,
      commentsDisabled: false,
      createdAt: ts(5),
      updatedAt: ts(5),
      stats: { likes: 67, comments: 8, shares: 11, views: 540 },
    },
    // Text update
    {
      userId: uid,
      title: 'Film Room Sunday 📽️',
      content:
        "Film study Sunday 📽️ Breaking down my footwork from last week's game. The grind never stops. DM for highlight tape. #QBLife #FilmRoom",
      type: 'text',
      visibility: PostVisibility.PUBLIC,
      images: [],
      mentions: [],
      hashtags: ['QBLife', 'FilmRoom'],
      isPinned: false,
      commentsDisabled: false,
      createdAt: ts(3),
      updatedAt: ts(3),
      stats: { likes: 22, comments: 4, shares: 2, views: 155 },
    },
    // Image post — training
    {
      userId: uid,
      title: 'Morning Grind 💪',
      content:
        '5am workouts hit different when you have a goal. Off-season is where champions are made. #Training #Athlete',
      type: 'image',
      visibility: PostVisibility.PUBLIC,
      images: ['https://placehold.co/640x480/0d1b2a/00ff88?text=Morning+Training'],
      thumbnailUrl: 'https://placehold.co/640x480/0d1b2a/00ff88?text=Morning+Training',
      mentions: [],
      hashtags: ['Training', 'Athlete'],
      isPinned: false,
      commentsDisabled: false,
      createdAt: ts(14),
      updatedAt: ts(14),
      stats: { likes: 89, comments: 21, shares: 7, views: 620 },
    },
    // Video post
    {
      userId: uid,
      title: 'QB Mechanics Drill 🎯',
      content:
        'Working on release point and footwork. Coach says my pocket presence has improved 40% this season. Let the film speak. #QB #Mechanics',
      type: 'video',
      visibility: PostVisibility.PUBLIC,
      images: [],
      mentions: [],
      hashtags: ['QB', 'Mechanics'],
      isPinned: false,
      commentsDisabled: false,
      thumbnailUrl: 'https://placehold.co/640x360/1a1a2e/00ff88?text=QB+Mechanics',
      mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      duration: 87,
      createdAt: ts(21),
      updatedAt: ts(21),
      stats: { likes: 103, comments: 18, shares: 14, views: 2100 },
    },
    // News
    {
      userId: uid,
      title: 'Named to All-District First Team 🏆',
      content:
        'Honoured to be named to the All-District First Team! Shoutout to my O-line and receivers. Team award. #AllDistrict #Football',
      type: 'news',
      visibility: PostVisibility.PUBLIC,
      images: [],
      mentions: [],
      hashtags: ['AllDistrict', 'Football'],
      isPinned: false,
      commentsDisabled: false,
      createdAt: ts(45),
      updatedAt: ts(45),
      stats: { likes: 201, comments: 47, shares: 33, views: 3200 },
    },
  ];
}

/**
 * Build news article seed data for users/{uid}/news/{articleId} sub-collection.
 * Each article matches the NewsArticle interface (packages/core/src/news/news.types.ts).
 */
function buildNewsArticles(uid: string): object[] {
  return [
    {
      id: `seed_${uid}_news_0`,
      title: 'Named to All-District First Team 🏆',
      excerpt:
        'Local quarterback earns top honours after a record-breaking season, leading the district in passing yards and touchdowns.',
      content:
        'In a ceremony held at the district office, our athlete was named to the All-District First Team — a recognition earned through consistent elite performance across 9 games this season. The award acknowledges standout play, leadership, and character on and off the field.',
      category: 'recruiting',
      tags: ['AllDistrict', 'Football', 'Award', 'QB'],
      source: {
        id: 'nxt1-agent-x',
        name: 'Agent X',
        avatarUrl: 'https://placehold.co/40x40/00ff88/1a1a2e?text=X',
        type: 'ai-agent',
        confidenceScore: 95,
        isVerified: true,
      },
      heroImageUrl: 'https://placehold.co/800x400/1a1a2e/00ff88?text=All-District+Award',
      thumbnailUrl: 'https://placehold.co/400x200/1a1a2e/00ff88?text=All-District+Award',
      readingTimeMinutes: 2,
      publishedAt: daysAgo(45),
      isBookmarked: false,
      isRead: false,
      xpReward: 15,
      viewCount: 3200,
      shareCount: 33,
      likeCount: 201,
      sportContext: { sport: 'football', players: [] },
      isFeatured: true,
    },
    {
      id: `seed_${uid}_news_1`,
      title: 'College Coaches Take Notice After Week 9 Highlight Reel',
      excerpt:
        'Three Power-5 programs have reached out following a 312-yard, 3-TD performance against Riverside HS.',
      content:
        'After posting 312 passing yards and 3 touchdowns in a 35-14 victory, the recruitment phone has been ringing. Multiple college coaches have expressed interest and requested film. The full highlight reel is now live on the profile.',
      category: 'highlights',
      tags: ['Recruiting', 'Highlights', 'QB', 'Football'],
      source: {
        id: 'nxt1-agent-x',
        name: 'Agent X',
        avatarUrl: 'https://placehold.co/40x40/00ff88/1a1a2e?text=X',
        type: 'ai-agent',
        confidenceScore: 92,
        isVerified: true,
      },
      heroImageUrl: 'https://placehold.co/800x400/1a1a2e/00ff88?text=Week+9+Highlights',
      thumbnailUrl: 'https://placehold.co/400x200/1a1a2e/00ff88?text=Week+9+Highlights',
      readingTimeMinutes: 3,
      publishedAt: daysAgo(7),
      isBookmarked: false,
      isRead: false,
      xpReward: 20,
      viewCount: 1320,
      shareCount: 6,
      likeCount: 48,
      sportContext: { sport: 'football', colleges: ['VinUniversity', 'FPT University'] },
      isFeatured: false,
    },
    {
      id: `seed_${uid}_news_2`,
      title: 'Official Visit Offer: VinUniversity Extended 🎓',
      excerpt:
        'VinUniversity has extended an official visit offer — a major milestone in the recruiting journey.',
      content:
        'VinUniversity football program has officially extended an offer for an official visit. This is a significant step in the recruiting process, giving the program an up-close look at the athlete in an academic and athletic setting. The visit is expected in early spring.',
      category: 'recruiting',
      tags: ['OfficialVisit', 'Offer', 'D1', '2026', 'Recruiting'],
      source: {
        id: 'nxt1-agent-x',
        name: 'Agent X',
        avatarUrl: 'https://placehold.co/40x40/00ff88/1a1a2e?text=X',
        type: 'ai-agent',
        confidenceScore: 98,
        isVerified: true,
      },
      heroImageUrl: 'https://placehold.co/800x400/0d1b2a/00ff88?text=Official+Visit+Offer',
      thumbnailUrl: 'https://placehold.co/400x200/0d1b2a/00ff88?text=Official+Visit+Offer',
      readingTimeMinutes: 2,
      publishedAt: daysAgo(30),
      isBookmarked: false,
      isRead: false,
      xpReward: 25,
      viewCount: 890,
      shareCount: 18,
      likeCount: 124,
      sportContext: { sport: 'football', colleges: ['VinUniversity'] },
      isFeatured: true,
      isBreaking: true,
    },
  ];
}

interface FollowDoc {
  followerId: string;
  followingId: string;
  createdAt: string;
}

function buildFollows(uid: string): FollowDoc[] {
  // Simulated other user IDs (followers/following)
  const simulatedUsers = [
    'coach_nguyen_01',
    'athlete_tran_02',
    'scout_le_03',
    'parent_pham_04',
    'athlete_hoang_05',
  ];
  return [
    // 3 people following this user
    { followerId: simulatedUsers[0], followingId: uid, createdAt: daysAgo(90) },
    { followerId: simulatedUsers[1], followingId: uid, createdAt: daysAgo(45) },
    { followerId: simulatedUsers[2], followingId: uid, createdAt: daysAgo(7) },
    // User following 2 others
    { followerId: uid, followingId: simulatedUsers[3], createdAt: daysAgo(60) },
    { followerId: uid, followingId: simulatedUsers[4], createdAt: daysAgo(30) },
  ];
}

interface RankingDoc {
  id: string;
  name: string;
  website: string;
  logoUrl: string;
  logoFallbackUrl: string;
  nationalRank: number | null;
  stateRank: number | null;
  positionRank: number | null;
  stars: number;
  score: number | null;
  // extra seed metadata (not in RankingSource, but harmless)
  userId: string;
  sport: string;
  classOf?: number;
  updatedAt: string;
}

function buildRankings(uid: string): RankingDoc[] {
  const now = new Date().toISOString();
  return [
    {
      id: `seed_${uid}_ranking_nxt1`,
      name: 'NXT1',
      website: 'nxt1sports.com',
      logoUrl: '/assets/nxt1-logo-white.png',
      logoFallbackUrl: 'NXT1',
      nationalRank: 247,
      stateRank: 12,
      positionRank: 3,
      stars: 5,
      score: 87.4,
      userId: uid,
      sport: 'football',
      classOf: 2026,
      updatedAt: now,
    },
    {
      id: `seed_${uid}_ranking_on3`,
      name: 'On3',
      website: 'on3.com',
      logoUrl: '/assets/logos/on3-white.png',
      logoFallbackUrl: 'On3',
      nationalRank: 312,
      stateRank: 15,
      positionRank: 5,
      stars: 4,
      score: 84.1,
      userId: uid,
      sport: 'football',
      classOf: 2026,
      updatedAt: now,
    },
    {
      id: `seed_${uid}_ranking_247`,
      name: '247Sports',
      website: '247sports.com',
      logoUrl: '/assets/logos/247sports-white.png',
      logoFallbackUrl: '247',
      nationalRank: 290,
      stateRank: 14,
      positionRank: 4,
      stars: 4,
      score: 85.3,
      userId: uid,
      sport: 'football',
      classOf: 2026,
      updatedAt: now,
    },
  ];
}

// ─── Denormalized sport summaries to update on the User doc ───────────────────
function buildDenormalizedSportUpdates(
  stats: VerifiedStat[],
  metrics: VerifiedMetric[],
  events: ScheduleEvent[]
): {
  featuredStats: VerifiedStat[];
  featuredMetrics: VerifiedMetric[];
  upcomingEvents: ScheduleEvent[];
} {
  // Top 4 stats by category importance
  const featuredStats = stats.filter((s) =>
    ['passing_yards', 'passing_tds', 'completion_pct', 'rushing_yards'].includes(s.field)
  );
  // Top 3 verified metrics
  const featuredMetrics = metrics.filter((m) => m.verified).slice(0, 3);
  // Next 3 upcoming events
  const now = new Date();
  const upcomingEvents = events
    .filter((e) => new Date(e.date as string) > now)
    .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())
    .slice(0, 3);
  return { featuredStats, featuredMetrics, upcomingEvents };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** Build seed scout reports for users/{uid}/scoutReports/{reportId} sub-collection. */
function buildScoutReports(uid: string): object[] {
  const now = new Date();
  const dAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  return [
    {
      id: `seed_${uid}_scout_0`,
      athlete: {
        id: uid,
        name: 'Nguyễn Văn An',
        position: 'QB',
        secondaryPosition: null,
        sport: 'football',
        classOf: 2026,
        gradYear: 2026,
        school: 'Hanoi National High School',
        state: 'Hanoi',
        profileImageUrl: 'https://placehold.co/80x80/1a1a2e/00ff88?text=QBan',
        height: '6\'1"',
        weight: '185 lbs',
      },
      rating: {
        overall: 4.3,
        physical: 4.2,
        technical: 4.5,
        mental: 4.4,
        potential: 4.6,
      },
      summary:
        'Elite pocket passer with exceptional field vision and strong arm. Demonstrates command of complex route trees and pre-snap reads well above peer level for a 2026 prospect.',
      highlights: [
        'Outstanding footwork in the pocket',
        'Quick release with accurate deep ball',
        'High football IQ and exceptional pre-snap reads',
      ],
      concerns: [
        'Needs to improve scramble and mobility',
        'Consistency under heavy blitz pressure',
      ],
      scout: {
        id: 'scout_nxt1_001',
        name: 'Marcus Reynolds',
        organization: 'NXT1 Sports',
        title: 'Senior Evaluator',
        avatarUrl: 'https://placehold.co/40x40/00ff88/1a1a2e?text=MR',
        isVerified: true,
        credentials: ['D1 Scout', 'Former College Coach'],
      },
      isVerified: true,
      isPremium: false,
      isBookmarked: false,
      viewCount: 1842,
      bookmarkCount: 47,
      publishedAt: dAgo(14),
      updatedAt: dAgo(14),
      xpReward: 25,
      hasViewed: false,
      tags: ['QB', 'Football', '2026', 'Elite'],
      source: 'nxt1',
    },
    {
      id: `seed_${uid}_scout_1`,
      athlete: {
        id: uid,
        name: 'Nguyễn Văn An',
        position: 'QB',
        secondaryPosition: null,
        sport: 'football',
        classOf: 2026,
        gradYear: 2026,
        school: 'Hanoi National High School',
        state: 'Hanoi',
        profileImageUrl: 'https://placehold.co/80x80/1a1a2e/00ff88?text=QBan',
        height: '6\'1"',
        weight: '185 lbs',
      },
      rating: {
        overall: 4.1,
        physical: 4.0,
        technical: 4.3,
        mental: 4.2,
        potential: 4.4,
      },
      summary:
        'Polished signal-caller who commands the huddle with natural leadership. Shows advanced understanding of defensive coverages and consistently makes the right check at the line.',
      highlights: [
        'Elite leadership and composure under pressure',
        'Excellent touch on intermediate routes',
        'Strong academic performer — 3.9 GPA',
      ],
      concerns: [
        'Frame needs to add functional strength',
        'Could benefit from reps in no-huddle offense',
      ],
      scout: {
        id: 'scout_partner_002',
        name: 'David Chen',
        organization: 'ProspectsHub',
        title: 'Regional Scout – Southeast Asia',
        avatarUrl: 'https://placehold.co/40x40/4a90e2/fff?text=DC',
        isVerified: true,
        credentials: ['Certified Evaluator', 'AFCA Member'],
      },
      isVerified: true,
      isPremium: true,
      isBookmarked: false,
      viewCount: 724,
      bookmarkCount: 19,
      publishedAt: dAgo(30),
      updatedAt: dAgo(30),
      xpReward: 50,
      hasViewed: false,
      tags: ['QB', 'Football', '2026', 'Premium'],
      source: 'partner',
    },
  ];
}

/** Build seed video highlights for users/{uid}/videos/{videoId} sub-collection. */
function buildVideos(uid: string): object[] {
  const now = new Date();
  const dAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  return [
    {
      id: `seed_${uid}_video_0`,
      userId: uid,
      title: 'Week 9 Highlights — 312 Yards / 3 TDs',
      description: 'Complete highlight film from our Week 9 victory over Riverside HS.',
      mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      thumbnailUrl: 'https://placehold.co/800x450/1a1a2e/00ff88?text=Week+9+Highlights',
      duration: 187,
      type: 'highlight',
      tags: ['Football', 'QB', 'Highlights', 'Week9'],
      stats: { views: 3200, likes: 201, shares: 33 },
      isPinned: true,
      createdAt: dAgo(7),
      updatedAt: dAgo(7),
    },
    {
      id: `seed_${uid}_video_1`,
      userId: uid,
      title: 'Season Mixtape 2024 — Quarterback Film',
      description: 'Full season mixtape showcasing passing, rushing, and leadership plays.',
      mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      thumbnailUrl: 'https://placehold.co/800x450/0d1b2a/00ff88?text=Season+Mixtape+2024',
      duration: 342,
      type: 'video',
      tags: ['Football', 'QB', 'Mixtape', '2024Season'],
      stats: { views: 1540, likes: 87, shares: 12 },
      isPinned: false,
      createdAt: dAgo(45),
      updatedAt: dAgo(45),
    },
    {
      id: `seed_${uid}_video_2`,
      userId: uid,
      title: 'State Championship — Clutch 4th Quarter Drive',
      description: '4-minute film of the game-winning drive in the state championship.',
      mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      thumbnailUrl: 'https://placehold.co/800x450/1a1a2e/ffcc00?text=State+Championship',
      duration: 248,
      type: 'highlight',
      tags: ['Football', 'QB', 'StateChampionship', 'Clutch'],
      stats: { views: 5100, likes: 324, shares: 78 },
      isPinned: false,
      createdAt: dAgo(90),
      updatedAt: dAgo(90),
    },
  ];
}

router.post(
  '/:userId',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };

    const db = req.firebase!.db;
    const now = new Date().toISOString();

    // Build all seed data — football (sports[0])
    const scheduleEvents = buildScheduleEvents(userId);
    const recruitingActivities = buildRecruitingActivities(userId);
    const verifiedStats = buildVerifiedStats(userId);
    const verifiedMetrics = buildVerifiedMetrics(userId);

    // Build all seed data — basketball (sports[1])
    const bbStats = buildBasketballStats(userId);
    const bbMetrics = buildBasketballMetrics(userId);
    const bbScheduleEvents = buildBasketballScheduleEvents(userId);
    const bbRecruitingActivities = buildBasketballRecruitingActivities(userId);

    const posts = buildPosts(userId);
    const newsArticles = buildNewsArticles(userId);
    const follows = buildFollows(userId);
    const rankings = buildRankings(userId);
    const scoutReports = buildScoutReports(userId);
    const videos = buildVideos(userId);

    // Denormalized summaries for User doc sports[0]
    const { featuredStats, featuredMetrics } = buildDenormalizedSportUpdates(
      verifiedStats,
      verifiedMetrics,
      scheduleEvents
    );

    // Denormalized summaries for User doc sports[1] (basketball)
    const { featuredStats: bbFeaturedStats, featuredMetrics: bbFeaturedMetrics } =
      buildDenormalizedSportUpdates(bbStats, bbMetrics, bbScheduleEvents);

    const userRef = db.collection(USERS_COL).doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      sendError(res, notFoundError('user'));
      return;
    }

    const userData = userDoc.data() as {
      sports?: SportProfile[];
      username?: string;
      unicode?: string;
    };
    const sports: SportProfile[] = userData.sports ?? [];

    // Default basketball sport profile (added if sports[1] doesn't exist yet)
    const defaultBasketballSport: SportProfile = {
      sport: 'basketball',
      order: 1,
      accountType: 'athlete',
      positions: ['Point Guard'],
    };

    // Embed ALL data directly on the User doc in sports[0] (football) and sports[1] (basketball).
    // Max 3 sports → no need for deep sub-collections; keeps the profile
    // GET fast (single doc read, zero sub-collection fetches).
    const footballSport = sports[0] ?? { sport: 'football', order: 0, accountType: 'athlete' };
    const basketballSport = sports[1] ?? defaultBasketballSport;

    const updatedSports: SportProfile[] = [
      {
        ...footballSport,
        // Full arrays — readable by profile mapper immediately
        verifiedStats,
        verifiedMetrics,
        upcomingEvents: scheduleEvents, // all events, not just upcoming
        recruitingActivities, // full recruiting list
        // Curated summaries (Agent X pattern)
        featuredStats,
        featuredMetrics,
      } as SportProfile,
      {
        ...basketballSport,
        verifiedStats: bbStats,
        verifiedMetrics: bbMetrics,
        upcomingEvents: bbScheduleEvents,
        recruitingActivities: bbRecruitingActivities,
        featuredStats: bbFeaturedStats,
        featuredMetrics: bbFeaturedMetrics,
      } as SportProfile,
      // Keep additional sports beyond index 1 unchanged
      ...sports.slice(2),
    ];

    // Collect all batch operations
    type BatchOp = (batch: WriteBatch) => void;
    const ops: BatchOp[] = [];

    // 1. Schedule events: also kept in sub-collection for future querying (football)
    const scheduleCol = userRef.collection('schedule');
    for (const event of scheduleEvents) {
      const ref = scheduleCol.doc(event.id);
      ops.push((b) => b.set(ref, { ...event, updatedAt: now }));
    }

    // 1b. Basketball schedule events
    for (const event of bbScheduleEvents) {
      const ref = scheduleCol.doc(event.id);
      ops.push((b) => b.set(ref, { ...event, updatedAt: now }));
    }

    // 2. Recruiting activities: also kept in sub-collection for future querying (football)
    const recruitingCol = userRef.collection('recruiting');
    for (const activity of recruitingActivities) {
      const ref = recruitingCol.doc(activity.id);
      ops.push((b) => b.set(ref, { ...activity }));
    }

    // 2b. Basketball recruiting activities
    for (const activity of bbRecruitingActivities) {
      const ref = recruitingCol.doc(activity.id);
      ops.push((b) => b.set(ref, { ...activity }));
    }

    // 3. Stats sub-collections — users/{uid}/sports/{sportId}/stats/{statId} (architecture: user.model.ts)
    const fbStatsCol = userRef.collection('sports').doc('football').collection('stats');
    for (const stat of verifiedStats) {
      ops.push((b) => b.set(fbStatsCol.doc(stat.id), stat));
    }
    const bbStatsCol = userRef.collection('sports').doc('basketball').collection('stats');
    for (const stat of bbStats) {
      ops.push((b) => b.set(bbStatsCol.doc(stat.id), stat));
    }

    // 4. Metrics sub-collections — users/{uid}/sports/{sportId}/metrics/{metricId} (architecture: user.model.ts)
    const fbMetricsCol = userRef.collection('sports').doc('football').collection('metrics');
    for (const metric of verifiedMetrics) {
      ops.push((b) => b.set(fbMetricsCol.doc(metric.id), metric));
    }
    const bbMetricsCol = userRef.collection('sports').doc('basketball').collection('metrics');
    for (const metric of bbMetrics) {
      ops.push((b) => b.set(bbMetricsCol.doc(metric.id), metric));
    }

    // 5. Timeline posts — users/{uid}/timeline/{postId} sub-collection (architecture: user.model.ts)
    const timelineCol = userRef.collection('timeline');
    for (let i = 0; i < posts.length; i++) {
      const docId = `seed_${userId}_post_${i}`;
      const post = posts[i]!;
      // Store createdAt as ISO string for the frontend mapper
      const createdAtIso = (post.createdAt as unknown as { toDate(): Date }).toDate().toISOString();
      // Build the doc and strip undefined fields (Firestore rejects them)
      const timelineDoc: Record<string, unknown> = {
        id: docId,
        userId: post.userId,
        content: post.content,
        type: post.type,
        isPinned: post.isPinned,
        images: post.images,
        hashtags: post.hashtags,
        createdAt: createdAtIso,
        updatedAt: createdAtIso,
        stats: post.stats,
      };
      if (post.title !== undefined) timelineDoc['title'] = post.title;
      if (post.mediaUrl !== undefined) timelineDoc['mediaUrl'] = post.mediaUrl;
      if (post.thumbnailUrl !== undefined) timelineDoc['thumbnailUrl'] = post.thumbnailUrl;
      if (post.duration !== undefined) timelineDoc['duration'] = post.duration;
      ops.push((b) => b.set(timelineCol.doc(docId), timelineDoc));
    }

    // 5b. News articles — users/{uid}/news/{articleId} sub-collection (architecture: user.model.ts)
    const newsCol = userRef.collection('news');
    for (const article of newsArticles) {
      const a = article as { id: string };
      ops.push((b) => b.set(newsCol.doc(a.id), article));
    }

    // 6. Follows — sub-collections only (no top-level Follows collection needed)
    for (const follow of follows) {
      // users/{uid}/followers/{followerId} — who follows this user
      if (follow.followingId === userId) {
        const followerRef = userRef.collection('followers').doc(follow.followerId);
        ops.push((b) =>
          b.set(followerRef, {
            userId: follow.followerId,
            followedAt: follow.createdAt,
          })
        );
      }

      // users/{uid}/following/{followingId} — who this user follows
      if (follow.followerId === userId) {
        const followingRef = userRef.collection('following').doc(follow.followingId);
        ops.push((b) =>
          b.set(followingRef, {
            userId: follow.followingId,
            followedAt: follow.createdAt,
          })
        );
      }
    }

    // 7. Rankings — users/{uid}/rankings/{rankingId} sub-collection (architecture: user.model.ts)
    const rankingsCol = userRef.collection('rankings');
    for (const ranking of rankings) {
      ops.push((b) => b.set(rankingsCol.doc(ranking.id), ranking));
    }

    // 8. Scout reports — users/{uid}/scoutReports/{reportId} sub-collection
    const scoutReportsCol = userRef.collection('scoutReports');
    for (const report of scoutReports) {
      const r = report as { id: string };
      ops.push((b) => b.set(scoutReportsCol.doc(r.id), report));
    }

    // 9. Videos — users/{uid}/videos/{videoId} sub-collection
    const videosCol = userRef.collection('videos');
    for (const video of videos) {
      const v = video as { id: string };
      ops.push((b) => b.set(videosCol.doc(v.id), video));
    }

    // 8. Update User doc: denormalized sports summary + counters only
    // recentPosts is NO LONGER embedded — timeline data lives in the
    // users/{uid}/timeline sub-collection per SUB-COLLECTIONS ARCHITECTURE in user.model.ts
    const followersCount = follows.filter((f) => f.followingId === userId).length;
    const followingCount = follows.filter((f) => f.followerId === userId).length;

    ops.push((b) =>
      b.update(userRef, {
        sports: updatedSports,
        '_counters.followersCount': followersCount,
        '_counters.followingCount': followingCount,
        '_counters.postsCount': posts.length,
        updatedAt: now,
      })
    );

    // Commit in chunks
    await commitBatches(db, ops);

    // Bust ALL profile cache keys so next request always re-fetches from Firestore
    await bustProfileCache(userId, userData.username, userData.unicode);

    logger.info('[Seed] Seed completed', {
      userId,
      football: {
        scheduleEvents: scheduleEvents.length,
        recruitingActivities: recruitingActivities.length,
        verifiedStats: verifiedStats.length,
        verifiedMetrics: verifiedMetrics.length,
      },
      basketball: {
        scheduleEvents: bbScheduleEvents.length,
        recruitingActivities: bbRecruitingActivities.length,
        verifiedStats: bbStats.length,
        verifiedMetrics: bbMetrics.length,
      },
      posts: posts.length,
      news: newsArticles.length,
      follows: follows.length,
      rankings: rankings.length,
      scoutReports: scoutReports.length,
      videos: videos.length,
    });

    res.json({
      success: true,
      data: {
        userId,
        seeded: {
          football: {
            scheduleEvents: scheduleEvents.length,
            recruitingActivities: recruitingActivities.length,
            verifiedStats: verifiedStats.length,
            verifiedMetrics: verifiedMetrics.length,
          },
          basketball: {
            scheduleEvents: bbScheduleEvents.length,
            recruitingActivities: bbRecruitingActivities.length,
            verifiedStats: bbStats.length,
            verifiedMetrics: bbMetrics.length,
          },
          posts: posts.length,
          news: newsArticles.length,
          follows: follows.length,
          rankings: rankings.length,
          scoutReports: scoutReports.length,
          videos: videos.length,
        },
      },
    });
  })
);

/**
 * Wipe seeded data for a user (safe to re-run seed after this).
 * DELETE /seed/:userId
 */
router.delete(
  '/:userId',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COL).doc(userId);

    type BatchOp = (batch: WriteBatch) => void;
    const ops: BatchOp[] = [];

    // Helper: delete all docs in a sub-collection query
    async function collectDeletions(
      col: FirebaseFirestore.CollectionReference,
      prefix: string
    ): Promise<void> {
      const snap = await col
        .where('id', '>=', prefix)
        .where('id', '<', prefix + '\uffff')
        .get();
      for (const doc of snap.docs) {
        ops.push((b) => b.delete(doc.ref));
      }
    }

    await Promise.all([
      collectDeletions(userRef.collection('schedule'), `seed_${userId}`),
      collectDeletions(userRef.collection('recruiting'), `seed_${userId}`),
      collectDeletions(userRef.collection('timeline'), `seed_${userId}`),
      collectDeletions(userRef.collection('news'), `seed_${userId}`),
      collectDeletions(userRef.collection('rankings'), `seed_${userId}`),
      collectDeletions(userRef.collection('scoutReports'), `seed_${userId}`),
      collectDeletions(userRef.collection('videos'), `seed_${userId}`),
      collectDeletions(
        userRef.collection('sports').doc('football').collection('stats'),
        `seed_${userId}`
      ),
      collectDeletions(
        userRef.collection('sports').doc('basketball').collection('stats'),
        `seed_${userId}`
      ),
      collectDeletions(
        userRef.collection('sports').doc('football').collection('metrics'),
        `seed_${userId}`
      ),
      collectDeletions(
        userRef.collection('sports').doc('basketball').collection('metrics'),
        `seed_${userId}`
      ),
    ]);

    // Delete all docs in followers/following sub-collections (no seed prefix on those doc IDs)
    async function deleteAllDocs(col: FirebaseFirestore.CollectionReference): Promise<void> {
      const snap = await col.limit(200).get();
      for (const doc of snap.docs) {
        ops.push((b) => b.delete(doc.ref));
      }
    }
    await Promise.all([
      deleteAllDocs(userRef.collection('followers')),
      deleteAllDocs(userRef.collection('following')),
    ]);

    // Clear the embedded fields on sports[0] (football) and sports[1] (basketball)
    const userDocForDelete = await userRef.get();
    const deleteUserData = userDocForDelete.data() as
      | {
          sports?: unknown[];
          username?: string;
          unicode?: string;
        }
      | undefined;
    if (userDocForDelete.exists && deleteUserData) {
      const existingSports = (deleteUserData.sports ?? []) as Record<string, unknown>[];
      if (existingSports.length > 0) {
        const fieldsToRemove = [
          'verifiedStats',
          'verifiedMetrics',
          'recruitingActivities',
          'featuredStats',
          'featuredMetrics',
          'upcomingEvents',
          'upcomingEventsPreview',
        ];
        const cleanedSports = existingSports.map((sp, i) => {
          // Clean embedded seed data from football (index 0) and basketball (index 1)
          if (i === 0 || i === 1) {
            const clean = { ...sp };
            for (const field of fieldsToRemove) delete clean[field];
            return clean;
          }
          return sp;
        });
        ops.push((b) => b.update(userRef, { sports: cleanedSports }));
      }
    }

    // Top-level collections by doc ID prefix
    async function collectTopLevelDeletions(colName: string, prefix: string): Promise<void> {
      const snap = await db.collection(colName).where('userId', '==', userId).get();
      for (const doc of snap.docs) {
        if (doc.id.startsWith(prefix)) {
          ops.push((b) => b.delete(doc.ref));
        }
      }
    }

    await Promise.all([
      collectTopLevelDeletions(POSTS_COLLECTIONS.POSTS, `seed_${userId}`),
      collectTopLevelDeletions(RANKINGS_COL, `seed_${userId}`),
    ]);

    await commitBatches(db, ops);

    // Bust ALL profile cache keys so next request re-fetches fresh data from Firestore
    await bustProfileCache(userId, deleteUserData?.username, deleteUserData?.unicode);

    logger.info('[Seed] Seed data wiped', { userId, deletedOps: ops.length });

    res.json({ success: true, data: { userId, deletedDocs: ops.length } });
  })
);

export default router;
