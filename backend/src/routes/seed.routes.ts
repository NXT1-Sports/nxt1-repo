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
import { appGuard } from '../middleware/auth.middleware.js';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { forbiddenError, notFoundError } from '@nxt1/core/errors';
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
async function bustProfileCache(userId: string): Promise<void> {
  const cache = getCacheService();
  await cache.del(`${PROFILE_CACHE_KEYS.BY_ID}${userId}`);
  logger.debug('[Seed] Profile cache busted', { userId });
}

// ─── Collection names ─────────────────────────────────────────────────────────
const USERS_COL = 'Users';
const FOLLOWS_COL = 'Follows';
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
  content: string;
  type: string;
  visibility: PostVisibility;
  images: string[];
  mentions: string[];
  hashtags: string[];
  isPinned: boolean;
  commentsDisabled: boolean;
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
    {
      userId: uid,
      content:
        '🏈 Big W tonight — 35-14 vs Riverside HS. Threw for 312 yards and 3 TDs. Feeling locked in. #NXT1 #QB #Football',
      type: 'update',
      visibility: PostVisibility.PUBLIC,
      images: [],
      mentions: [],
      hashtags: ['NXT1', 'QB', 'Football'],
      isPinned: false,
      commentsDisabled: false,
      createdAt: ts(7),
      updatedAt: ts(7),
      stats: { likes: 48, comments: 12, shares: 6, views: 320 },
    },
    {
      userId: uid,
      content:
        'Blessed and grateful 🙏 Received an official visit offer from VinUniversity! Hard work pays off. #Recruiting #D1 #2026',
      type: 'update',
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
    {
      userId: uid,
      content:
        "Film study Sunday 📽️ Breaking down my footwork from last week's game. The grind never stops. DM for highlight tape. #QBLife #FilmRoom",
      type: 'update',
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
  userId: string;
  sport: string;
  position?: string;
  category: string;
  rank: number;
  totalAthletes: number;
  score: number;
  classOf?: number;
  state?: string;
  source: string;
  updatedAt: string;
}

function buildRankings(uid: string): RankingDoc[] {
  return [
    {
      userId: uid,
      sport: 'football',
      position: 'QB',
      category: 'state',
      rank: 12,
      totalAthletes: 450,
      score: 87.4,
      classOf: 2026,
      state: 'Thanh Pho Ho Chi Minh',
      source: 'nxt1',
      updatedAt: new Date().toISOString(),
    },
    {
      userId: uid,
      sport: 'football',
      position: 'QB',
      category: 'national',
      rank: 247,
      totalAthletes: 12500,
      score: 87.4,
      classOf: 2026,
      source: 'nxt1',
      updatedAt: new Date().toISOString(),
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

/**
 * Seed all collections for a user.
 * POST /seed/:userId
 */
router.post(
  '/:userId',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

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
    const follows = buildFollows(userId);
    const rankings = buildRankings(userId);

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

    const userData = userDoc.data() as { sports?: SportProfile[] };
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

    // NOTE: No sports/football/stats or sports/football/metrics sub-collections.
    // Stats and metrics are embedded in sports[0] on the User doc above.

    // 5. Posts (top-level)
    for (const post of posts) {
      const ref = db
        .collection(POSTS_COLLECTIONS.POSTS)
        .doc(`seed_${userId}_post_${posts.indexOf(post)}`);
      ops.push((b) => b.set(ref, post));
    }

    // 6. Follows (top-level): Follows/{followerId}_{followingId}
    for (const follow of follows) {
      const docId = `${follow.followerId}_${follow.followingId}`;
      const ref = db.collection(FOLLOWS_COL).doc(docId);
      ops.push((b) => b.set(ref, follow));
    }

    // 7. Rankings (top-level)
    for (const ranking of rankings) {
      const ref = db
        .collection(RANKINGS_COL)
        .doc(`seed_${userId}_ranking_${rankings.indexOf(ranking)}`);
      ops.push((b) => b.set(ref, ranking));
    }

    // 8. Update User doc: denormalized sports summary + counters
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

    // Bust profile cache so next request fetches the updated User doc from Firestore
    await bustProfileCache(userId);

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
      follows: follows.length,
      rankings: rankings.length,
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
          follows: follows.length,
          rankings: rankings.length,
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
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

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
    ]);

    // Clear the embedded fields on sports[0] (football) and sports[1] (basketball)
    const userDocForDelete = await userRef.get();
    if (userDocForDelete.exists) {
      const userData2 = userDocForDelete.data() as { sports?: unknown[] };
      const existingSports = (userData2.sports ?? []) as Record<string, unknown>[];
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

    // Follows don't have userId field — delete by doc ID pattern
    const followSnap = await db.collection(FOLLOWS_COL).get();
    for (const doc of followSnap.docs) {
      if (doc.id.includes(userId)) {
        ops.push((b) => b.delete(doc.ref));
      }
    }

    await commitBatches(db, ops);

    // Bust profile cache so next request fetches fresh data from Firestore
    await bustProfileCache(userId);

    logger.info('[Seed] Seed data wiped', { userId, deletedOps: ops.length });

    res.json({ success: true, data: { userId, deletedDocs: ops.length } });
  })
);

export default router;
