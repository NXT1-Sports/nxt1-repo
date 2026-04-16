/**
 * @fileoverview Seed Data Factories
 * @module @nxt1/backend/utils/seed-factories
 *
 * Pure data-factory functions that build structured seed payloads for Firestore.
 * These factories are consumed by the seed router and must NOT contain any
 * framework / HTTP / Firestore import — they are plain TypeScript utilities.
 *
 * Usage:
 *   import { buildPosts, ... } from '../utils/seed-factories.js';
 *
 * Adding a new factory:
 *   1. Define a return-type interface below the factory (or in firestore.models.ts).
 *   2. Export the factory function.
 *   3. Import it in seed.routes.ts.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Timestamp } from 'firebase-admin/firestore';
import {
  type ScheduleEvent,
  type RecruitingActivity,
  type VerifiedMetric,
  type VerifiedStat,
  type ProfileSeasonGameLog,
} from '@nxt1/core';

// Use plain string instead of importing the enum so this file has zero
// framework/build-tool dependencies and can run directly with tsx.
const PUBLIC = 'public' as const;

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

export function daysAgo(n: number): string {
  return daysFromNow(-n);
}

// ─── Return-type interfaces ───────────────────────────────────────────────────

export interface PostSeedDoc {
  userId: string;
  sport: string; // e.g. 'football' | 'basketball'
  sportId: string; // same value — used for Firestore queries when switching sport profile
  title?: string;
  content: string;
  type: string;
  visibility: string;
  images: string[];
  mentions: string[];
  isPinned: boolean;
  mediaUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  createdAt: ReturnType<typeof Timestamp.now>;
  updatedAt: ReturnType<typeof Timestamp.now>;
  stats: { likes: number; shares: number; views: number };
}

export interface RankingSeedDoc {
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
  userId: string;
  sport: string;
  sportId: string;
  classOf?: number;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Football factories
// ─────────────────────────────────────────────────────────────────────────────

export function buildScheduleEvents(uid: string): ScheduleEvent[] {
  return [
    // Upcoming games
    {
      id: `seed_${uid}_game_01`,
      eventType: 'game',
      title: 'vs. West Valley HS',
      date: daysFromNow(7),
      location: 'Home Field, Riverside',

      opponent: 'West Valley High School',
      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_game_02`,
      eventType: 'game',
      title: '@ North Shore HS',
      date: daysFromNow(14),
      location: 'North Shore Stadium, Riverside',

      opponent: 'North Shore High School',
      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_game_03`,
      eventType: 'game',
      title: 'Regional Playoff — vs. East River HS',
      date: daysFromNow(45),
      location: 'City Stadium, Riverside',

      opponent: 'East River High School',
      sport: 'football',
      source: 'manual',
    },
    // Upcoming camp & visit
    {
      id: `seed_${uid}_camp_01`,
      eventType: 'camp',
      title: 'NXT1 Elite QB Camp',
      date: daysFromNow(21),
      endDate: daysFromNow(22),
      location: 'Riverside Sports Complex',

      url: 'https://nxt1sports.com',
      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_camp_02`,
      eventType: 'camp',
      title: 'West Coast Football Academy Summer Camp',
      date: daysFromNow(35),
      endDate: daysFromNow(38),
      location: 'Pacific University Sports Center, Los Angeles, CA',
      url: 'https://nxt1sports.com',

      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_camp_03`,
      eventType: 'camp',
      title: 'West Coast QB Skills Camp',
      date: daysFromNow(50),
      endDate: daysFromNow(51),
      location: 'Los Angeles Sports Complex, CA',

      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_camp_past_01`,
      eventType: 'camp',
      title: 'Nike Football Training Camp',
      date: daysAgo(45),
      endDate: daysAgo(43),
      location: 'Riverside Sports Complex',

      result: 'Top 10 QB Performance',
      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_visit_01`,
      eventType: 'visit',
      title: 'Official Visit — Pacific University',
      date: daysFromNow(30),
      endDate: daysFromNow(31),
      location: 'Pacific University, Los Angeles, CA',

      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_visit_02`,
      eventType: 'visit',
      title: 'Unofficial Visit — Westside College',
      date: daysFromNow(18),
      location: 'Westside College Campus, CA',

      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_visit_03`,
      eventType: 'visit',
      title: 'Official Visit — Harbor University',
      date: daysFromNow(40),
      endDate: daysFromNow(41),
      location: 'Harbor University, CA',

      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_visit_past_01`,
      eventType: 'visit',
      title: 'Campus Tour — Riverside State University',
      date: daysAgo(20),
      location: 'Riverside State University Campus, CA',

      result: 'Met with coaching staff',
      sport: 'football',
      source: 'manual',
    },
    // Past games with results
    {
      id: `seed_${uid}_game_past_01`,
      eventType: 'game',
      title: 'vs. Riverside HS',
      date: daysAgo(7),
      location: 'Home Field, Riverside',

      opponent: 'Riverside High School',
      result: 'W 35-14',
      sport: 'football',
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
      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_game_past_03`,
      eventType: 'game',
      title: 'vs. Bayshore HS',
      date: daysAgo(21),
      location: 'Home Field, Riverside',

      opponent: 'Bayshore High School',
      result: 'L 17-24',
      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_combine_01`,
      eventType: 'combine',
      title: 'NXT1 Spring QB Combine',
      date: daysFromNow(25),
      location: 'Riverside National Stadium',

      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_combine_02`,
      eventType: 'combine',
      title: 'West Coast Elite Athlete Combine',
      date: daysAgo(40),
      location: 'Riverside Sports Complex, Field A',

      sport: 'football',
      source: 'manual',
    },
    {
      id: `seed_${uid}_showcase_01`,
      eventType: 'other',
      title: 'West Coast Elite Prospect Showcase',
      date: daysFromNow(42),
      endDate: daysFromNow(43),
      location: 'Riverside Sports Complex, Main Arena',

      url: 'https://nxt1sports.com',
      sport: 'football',
      source: 'manual',
    },
  ];
}

export function buildRecruitingActivities(uid: string): RecruitingActivity[] {
  const now = new Date().toISOString();
  return [
    // Offers
    {
      id: `seed_${uid}_offer_01`,
      category: 'offer',
      collegeId: 'pacific-university',
      collegeName: 'Pacific University',
      division: 'D1',
      conference: 'Pacific Athletic Conference',
      city: 'Los Angeles',
      state: 'CA',
      sport: 'football',
      scholarshipType: 'full',
      date: daysAgo(30),
      coachName: 'Coach Daniel Rivera',
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
      collegeId: 'westside-college',
      collegeName: 'Westside College',
      division: 'D1',
      conference: 'West Coast Conference',
      city: 'Los Angeles',
      state: 'CA',
      sport: 'football',
      scholarshipType: 'partial',
      date: daysAgo(45),
      coachName: 'Coach Martinez',
      coachTitle: 'Offensive Coordinator',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(45),
      updatedAt: now,
    },
    {
      id: `seed_${uid}_offer_03`,
      category: 'offer',
      collegeId: 'harbor-university',
      collegeName: 'Harbor University',
      division: 'D2',
      city: 'Los Angeles',
      state: 'CA',
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
      collegeId: 'riverside-state',
      collegeName: 'Riverside State University',
      division: 'D1',
      city: 'Riverside',
      state: 'CA',
      sport: 'football',
      date: daysAgo(20),
      coachName: 'Coach Collins',
      coachTitle: 'Recruiting Coordinator',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(20),
      updatedAt: now,
    },
    {
      id: `seed_${uid}_interest_02`,
      category: 'interest',
      collegeId: 'inland-empire-u',
      collegeName: 'Inland Empire University',
      division: 'D1',
      city: 'San Bernardino',
      state: 'CA',
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
      collegeId: 'pacific-university',
      collegeName: 'Pacific University',
      division: 'D1',
      city: 'Los Angeles',
      state: 'CA',
      sport: 'football',
      visitType: 'official',
      date: daysFromNow(30),
      endDate: daysFromNow(31),
      coachName: 'Coach Daniel Rivera',
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
      collegeId: 'harbor-university',
      collegeName: 'Harbor University',
      division: 'D2',
      city: 'Los Angeles',
      state: 'CA',
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
      collegeId: 'pacific-university',
      collegeName: 'Pacific University',
      division: 'D1',
      city: 'Los Angeles',
      state: 'CA',
      sport: 'football',
      date: daysAgo(5),
      coachName: 'Coach Daniel Rivera',
      coachTitle: 'Head Coach',
      notes: 'Phone call — discussed scholarship package and team goals.',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(5),
      updatedAt: now,
    },
  ];
}

export function buildVerifiedStats(uid: string): VerifiedStat[] {
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

export function buildVerifiedMetrics(uid: string): VerifiedMetric[] {
  const updatedAt = new Date().toISOString();
  const dateRecorded = daysAgo(60);
  return [
    {
      id: `seed_${uid}_met_forty`,
      field: '40_yard_dash',
      label: '40-Yard Dash',
      value: 4.52,
      unit: 's',
      category: 'combine results',
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
      category: 'combine results',
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
      category: 'combine results',
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
      category: 'combine results',
      source: 'combine',
      verified: true,
      verifiedBy: 'NXT1 Combine',
      dateRecorded,
      updatedAt,
    },
    {
      id: `seed_${uid}_met_broad`,
      field: 'broad_jump',
      label: 'Broad Jump',
      value: 118,
      unit: 'in',
      category: 'combine results',
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
      category: 'measurables',
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
      category: 'measurables',
      source: 'manual',
      verified: false,
      dateRecorded,
      updatedAt,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Basketball factories
// ─────────────────────────────────────────────────────────────────────────────

export function buildBasketballStats(uid: string): VerifiedStat[] {
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

export function buildBasketballMetrics(uid: string): VerifiedMetric[] {
  const updatedAt = new Date().toISOString();
  const dateRecorded = daysAgo(45);
  return [
    {
      id: `seed_${uid}_bb_met_vertical`,
      field: 'vertical_jump',
      label: 'Vertical Jump',
      value: 38,
      unit: 'in',
      category: 'combine results',
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
      category: 'measurables',
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
      category: 'measurables',
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
      category: 'combine results',
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
      category: 'combine results',
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
      category: 'measurables',
      source: 'manual',
      verified: false,
      dateRecorded,
      updatedAt,
    },
  ];
}

export function buildBasketballScheduleEvents(uid: string): ScheduleEvent[] {
  return [
    {
      id: `seed_${uid}_bb_game_01`,
      eventType: 'game',
      title: 'vs. Riverside Hoops Academy',
      date: daysFromNow(5),
      location: 'Home Gym, Riverside',

      opponent: 'Riverside Hoops Academy',
      sport: 'basketball',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_game_02`,
      eventType: 'game',
      title: '@ Riverside Prep Classic',
      date: daysFromNow(12),
      location: 'Riverside Prep Arena',
      opponent: 'Riverside Prep All-Stars',

      sport: 'basketball',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_tournament_01`,
      eventType: 'camp',
      title: '3-on-3 AAU Tournament',
      date: daysFromNow(20),
      endDate: daysFromNow(21),
      location: 'Riverside Sports Complex, Hall B',

      sport: 'basketball',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_camp_01`,
      eventType: 'camp',
      title: 'NXT1 Elite Guard Camp',
      date: daysFromNow(35),
      endDate: daysFromNow(36),
      location: 'Riverside Sports Complex',

      url: 'https://nxt1sports.com',
      sport: 'basketball',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_visit_01`,
      eventType: 'visit',
      title: 'Official Visit — Pacific University Basketball',
      date: daysFromNow(48),
      endDate: daysFromNow(49),
      location: 'Pacific University, Los Angeles, CA',

      sport: 'basketball',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_game_past_01`,
      eventType: 'game',
      title: 'vs. North Shore HS',
      date: daysAgo(6),
      location: 'Home Gym, Riverside',

      opponent: 'North Shore High School',
      result: 'W 72-58',
      sport: 'basketball',
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
      sport: 'basketball',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_combine_01`,
      eventType: 'combine',
      title: 'NXT1 Elite Guard Combine',
      date: daysFromNow(28),
      location: 'Riverside Sports Complex, Hall B',

      sport: 'basketball',
      source: 'manual',
    },
    {
      id: `seed_${uid}_bb_showcase_01`,
      eventType: 'other',
      title: 'Southern California Basketball Showcase',
      date: daysAgo(50),
      location: 'Riverside Indoor Stadium',

      sport: 'basketball',
      source: 'manual',
    },
  ];
}

export function buildBasketballRecruitingActivities(uid: string): RecruitingActivity[] {
  const now = new Date().toISOString();
  return [
    {
      id: `seed_${uid}_bb_offer_01`,
      category: 'offer',
      collegeId: 'pacific-university',
      collegeName: 'Pacific University',
      division: 'D1',
      conference: 'Pacific Athletic Conference',
      city: 'Los Angeles',
      state: 'CA',
      sport: 'basketball',
      scholarshipType: 'full',
      date: daysAgo(20),
      coachName: 'Coach Marcus Allen',
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
      collegeId: 'westside-college',
      collegeName: 'Westside College',
      division: 'D1',
      conference: 'West Coast Conference',
      city: 'Los Angeles',
      state: 'CA',
      sport: 'basketball',
      scholarshipType: 'partial',
      date: daysAgo(35),
      coachName: 'Coach Davis',
      coachTitle: 'Assistant Basketball Coach',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(35),
      updatedAt: now,
    },
    {
      id: `seed_${uid}_bb_contact_01`,
      category: 'contact',
      collegeId: 'harbor-university',
      collegeName: 'Harbor University',
      division: 'D2',
      city: 'Los Angeles',
      state: 'CA',
      sport: 'basketball',
      date: daysAgo(8),
      coachName: 'Coach Lee',
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
      collegeId: 'pacific-university',
      collegeName: 'Pacific University',
      division: 'D1',
      city: 'Los Angeles',
      state: 'CA',
      sport: 'basketball',
      date: daysFromNow(48),
      endDate: daysFromNow(49),
      coachName: 'Coach Marcus Allen',
      coachTitle: 'Head Basketball Coach',
      notes: 'Official campus visit scheduled.',
      source: 'manual',
      verified: true,
      createdAt: daysAgo(10),
      updatedAt: now,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Posts factory
// ─────────────────────────────────────────────────────────────────────────────

export function buildPosts(uid: string): PostSeedDoc[] {
  const ts = (daysAgoNum: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgoNum);
    return Timestamp.fromDate(d);
  };
  return [
    // ── FOOTBALL posts ─────────────────────────────────────────────────────
    // Pinned offer announcement
    {
      userId: uid,
      sport: 'football',
      sportId: 'football',
      title: 'Official Visit Offer — Pacific University 🎓',
      content:
        'Blessed and grateful 🙏 Received an official visit offer from Pacific University! Hard work pays off. #Recruiting #D1 #2026',
      type: 'offer',
      visibility: PUBLIC,
      images: [],
      mentions: [],
      isPinned: true,
      createdAt: ts(30),
      updatedAt: ts(30),
      stats: { likes: 124, shares: 18, views: 890 },
    },
    // Highlight reel
    {
      userId: uid,
      sport: 'football',
      sportId: 'football',
      title: 'Week 9 Highlights — 312yd / 3 TD',
      content:
        '🏈 Big W tonight — 35-14 vs Riverside HS. Threw for 312 yards and 3 TDs. Full highlight reel below. #NXT1 #QB #Football',
      type: 'highlight',
      visibility: PUBLIC,
      images: [],
      mentions: [],
      isPinned: false,
      thumbnailUrl: 'https://placehold.co/640x360/1a1a2e/00ff88?text=Week+9+Highlights',
      mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      duration: 142,
      createdAt: ts(7),
      updatedAt: ts(7),
      stats: { likes: 48, shares: 6, views: 1320 },
    },
    // Stat update
    {
      userId: uid,
      sport: 'football',
      sportId: 'football',
      title: 'Season Stats Update 📊',
      content:
        'Through 9 games: 2,481 passing yards, 24 TDs, 4 INTs. Completion rate up to 68%. Grinding every week. #Stats #QBLife',
      type: 'stat',
      visibility: PUBLIC,
      images: [],
      mentions: [],
      isPinned: false,
      createdAt: ts(5),
      updatedAt: ts(5),
      stats: { likes: 67, shares: 11, views: 540 },
    },
    // Text update
    {
      userId: uid,
      sport: 'football',
      sportId: 'football',
      title: 'Film Room Sunday 📽️',
      content:
        "Film study Sunday 📽️ Breaking down my footwork from last week's game. The grind never stops. DM for highlight tape. #QBLife #FilmRoom",
      type: 'text',
      visibility: PUBLIC,
      images: [],
      mentions: [],
      isPinned: false,
      createdAt: ts(3),
      updatedAt: ts(3),
      stats: { likes: 22, shares: 2, views: 155 },
    },
    // Image post — training
    {
      userId: uid,
      sport: 'football',
      sportId: 'football',
      title: 'Morning Grind 💪',
      content:
        '5am workouts hit different when you have a goal. Off-season is where champions are made. #Training #Athlete',
      type: 'image',
      visibility: PUBLIC,
      images: ['https://placehold.co/640x480/0d1b2a/00ff88?text=Morning+Training'],
      thumbnailUrl: 'https://placehold.co/640x480/0d1b2a/00ff88?text=Morning+Training',
      mentions: [],
      isPinned: false,
      createdAt: ts(14),
      updatedAt: ts(14),
      stats: { likes: 89, shares: 7, views: 620 },
    },
    // Video post
    {
      userId: uid,
      sport: 'football',
      sportId: 'football',
      title: 'QB Mechanics Drill 🎯',
      content:
        'Working on release point and footwork. Coach says my pocket presence has improved 40% this season. Let the film speak. #QB #Mechanics',
      type: 'video',
      visibility: PUBLIC,
      images: [],
      mentions: [],
      isPinned: false,
      thumbnailUrl: 'https://placehold.co/640x360/1a1a2e/00ff88?text=QB+Mechanics',
      mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      duration: 87,
      createdAt: ts(21),
      updatedAt: ts(21),
      stats: { likes: 103, shares: 14, views: 2100 },
    },
    // Award post
    {
      userId: uid,
      sport: 'football',
      sportId: 'football',
      title: 'Named to All-District First Team 🏆',
      content:
        'Honoured to be named to the All-District First Team! Shoutout to my O-line and receivers. Team award. #AllDistrict #Football',
      type: 'news',
      visibility: PUBLIC,
      images: [],
      mentions: [],
      isPinned: false,
      createdAt: ts(45),
      updatedAt: ts(45),
      stats: { likes: 201, shares: 33, views: 3200 },
    },
    // ── BASKETBALL posts ────────────────────────────────────────────────────
    // Highlight
    {
      userId: uid,
      sport: 'basketball',
      sportId: 'basketball',
      title: 'Triple-Double Night 🏀',
      content:
        '18 pts, 11 reb, 10 ast tonight. First triple-double of the season! Team W 72-58. #Basketball #PointGuard #NXT1',
      type: 'highlight',
      visibility: PUBLIC,
      images: [],
      mentions: [],
      isPinned: true,
      thumbnailUrl: 'https://placehold.co/640x360/0d1b2a/ff6b35?text=Triple+Double',
      mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      duration: 98,
      createdAt: ts(10),
      updatedAt: ts(10),
      stats: { likes: 156, shares: 28, views: 2400 },
    },
    // Stat update
    {
      userId: uid,
      sport: 'basketball',
      sportId: 'basketball',
      title: 'Basketball Season Stats 📊',
      content:
        'Averaging 17.4 PPG, 8.2 APG, 6.1 RPG through 12 games. Shooting 43% from 3. Hard work showing up in the numbers. #Basketball #PG',
      type: 'stat',
      visibility: PUBLIC,
      images: [],
      mentions: [],
      isPinned: false,
      createdAt: ts(4),
      updatedAt: ts(4),
      stats: { likes: 44, shares: 5, views: 380 },
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// News articles factory
// ─────────────────────────────────────────────────────────────────────────────

export function buildNewsArticles(uid: string): object[] {
  const now = new Date().toISOString();
  return [
    {
      id: `seed_${uid}_news_0`,
      userId: uid,
      sportId: 'football',
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
      type: 'user',
      createdAt: daysAgo(45),
      updatedAt: now,
    },
    {
      id: `seed_${uid}_news_1`,
      userId: uid,
      sportId: 'football',
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
      sportContext: { sport: 'football', colleges: ['Pacific University', 'Harbor University'] },
      type: 'user',
      createdAt: daysAgo(7),
      updatedAt: now,
    },
    {
      id: `seed_${uid}_news_2`,
      userId: uid,
      sportId: 'football',
      title: 'Official Visit Offer: Pacific University Extended 🎓',
      excerpt:
        'Pacific University has extended an official visit offer — a major milestone in the recruiting journey.',
      content:
        'Pacific University football program has officially extended an offer for an official visit. This is a significant step in the recruiting process, giving the program an up-close look at the athlete in an academic and athletic setting. The visit is expected in early spring.',
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
      sportContext: { sport: 'football', colleges: ['Pacific University'] },
      isBreaking: true,
      type: 'user',
      createdAt: daysAgo(30),
      updatedAt: now,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Team News Articles factory (stored in News collection with type='team')
// ─────────────────────────────────────────────────────────────────────────────

export function buildTeamNewsArticles(teamId: string): object[] {
  const now = new Date().toISOString();
  const agentSource = {
    id: 'nxt1-agent-x',
    name: 'Agent X',
    avatarUrl: 'https://placehold.co/40x40/d4ff00/0a0a0a?text=X',
    type: 'ai-agent',
    confidenceScore: 96,
    isVerified: true,
  };
  return [
    {
      id: `seed_${teamId}_tnews_0`,
      teamId,
      type: 'team',
      sportId: 'basketball',
      title: '🏆 Northern Conference Champions 2024-2025!',
      excerpt:
        'Riverside Phoenix clinches the Northern Conference title with an 18-3 record — the best in program history.',
      content: `After a dominant season-long run, Riverside Phoenix secured the Northern Conference Championship. Led by standout performances and elite coaching, the team posted an 18-3 record. This marks the program's first title and signals a new era of competitive basketball in Southern California.`,
      category: 'highlights',
      tags: ['Champions', 'NorthernConference', 'Basketball', '2025', 'RiversidePhoenix'],
      source: agentSource,
      heroImageUrl: 'https://placehold.co/800x400/1a1a2e/d4ff00?text=Conference+Champions',
      thumbnailUrl: 'https://placehold.co/400x200/1a1a2e/d4ff00?text=Conference+Champions',
      readingTimeMinutes: 3,
      publishedAt: daysAgo(28),
      isBookmarked: false,
      isRead: false,
      xpReward: 20,
      viewCount: 5400,
      shareCount: 88,
      likeCount: 312,
      sportContext: { sport: 'basketball' },
      createdAt: daysAgo(28),
      updatedAt: now,
    },
    {
      id: `seed_${teamId}_tnews_1`,
      teamId,
      type: 'team',
      sportId: 'basketball',
      title: 'Tyler Johnson (#23) Named All-Conference 1st Team 🌟',
      excerpt:
        'Guard Tyler Johnson earns All-Conference first-team honors after averaging 22 pts and 6 ast per game this season.',
      content: `Tyler Johnson, the Phoenix's starting shooting guard, was officially recognized as an All-Conference First Team selection after a breakout season. His 22-point-per-game average and 6 assists led the Northern Conference in combined impact scoring, drawing significant interest from college programs.`,
      category: 'recruiting',
      tags: ['AllConference', 'TylerJohnson', 'Award', 'Basketball', 'RiversidePhoenix'],
      source: agentSource,
      heroImageUrl: 'https://placehold.co/800x400/0d1b2a/d4ff00?text=All-Conference+Award',
      thumbnailUrl: 'https://placehold.co/400x200/0d1b2a/d4ff00?text=All-Conference+Award',
      readingTimeMinutes: 2,
      publishedAt: daysAgo(14),
      isBookmarked: false,
      isRead: false,
      xpReward: 15,
      viewCount: 2880,
      shareCount: 44,
      likeCount: 178,
      sportContext: { sport: 'basketball' },
      createdAt: daysAgo(14),
      updatedAt: now,
    },
    {
      id: `seed_${teamId}_tnews_2`,
      teamId,
      type: 'team',
      sportId: 'basketball',
      title: '📋 Spring 2026 Tryout Announcement — Open Roster Spots Available',
      excerpt:
        'Riverside Phoenix opens registration for Spring 2026 tryouts. Three roster spots available for the upcoming season.',
      content:
        'Riverside Phoenix Basketball is pleased to announce open tryouts for Spring 2026. Three spots are available across guard and forward positions for the Class of 2027-2028. Interested athletes must register by April 15, 2026. Contact the coaching staff at contact@riverside-phoenix.com for details.',
      category: 'recruiting',
      tags: ['Tryouts', 'Spring2026', 'OpenRoster', 'Basketball', 'RiversidePhoenix'],
      source: agentSource,
      heroImageUrl: 'https://placehold.co/800x400/1a1a2e/d4ff00?text=Spring+Tryouts',
      thumbnailUrl: 'https://placehold.co/400x200/1a1a2e/d4ff00?text=Spring+Tryouts',
      readingTimeMinutes: 2,
      publishedAt: daysAgo(5),
      isBookmarked: false,
      isRead: false,
      xpReward: 10,
      viewCount: 1240,
      shareCount: 22,
      likeCount: 89,
      sportContext: { sport: 'basketball' },
      isBreaking: false,
      createdAt: daysAgo(5),
      updatedAt: now,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Team stats categories factory
// ─────────────────────────────────────────────────────────────────────────────

export function buildTeamStatsCategories(_teamId: string): object[] {
  return [
    {
      name: 'Offense',
      season: '2024-2025',
      stats: [
        { key: 'ppg', label: 'Points Per Game', value: 78.4, trend: 'up', trendValue: 3.2 },
        { key: 'apg', label: 'Assists Per Game', value: 18.7, trend: 'up', trendValue: 1.1 },
        { key: 'rpg', label: 'Rebounds Per Game', value: 34.2, trend: 'neutral' },
        { key: 'fg_pct', label: 'FG %', value: '48.3%', trend: 'up', trendValue: 2.1 },
        { key: 'three_pct', label: '3PT %', value: '36.7%', trend: 'up', trendValue: 1.4 },
        { key: 'ft_pct', label: 'FT %', value: '74.2%', trend: 'down', trendValue: -1.8 },
      ],
    },
    {
      name: 'Defense',
      season: '2024-2025',
      stats: [
        { key: 'opp_ppg', label: 'Opp Pts / Game', value: 62.1, trend: 'down', trendValue: -4.3 },
        { key: 'spg', label: 'Steals Per Game', value: 8.4, trend: 'up', trendValue: 0.9 },
        { key: 'bpg', label: 'Blocks Per Game', value: 4.1, trend: 'up', trendValue: 0.6 },
        { key: 'opp_fg_pct', label: 'Opp FG %', value: '38.9%', trend: 'down', trendValue: -2.7 },
        { key: 'to_forced', label: 'TOs Forced / Gm', value: 16.2, trend: 'up', trendValue: 1.8 },
      ],
    },
    {
      name: 'Season Record',
      season: '2024-2025',
      stats: [
        { key: 'wins', label: 'Wins', value: 18 },
        { key: 'losses', label: 'Losses', value: 3 },
        { key: 'home_record', label: 'Home Record', value: '11-1' },
        { key: 'away_record', label: 'Away Record', value: '7-2' },
        { key: 'conf_record', label: 'Conference', value: '10-2' },
        { key: 'streak', label: 'Current Streak', value: 'W4', trend: 'up' },
      ],
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Team recruiting activities factory (team-perspective)
// ─────────────────────────────────────────────────────────────────────────────

export function buildTeamRecruitingActivities(_teamId: string): object[] {
  return [
    // Commitments (shown on Commitments tab)
    {
      id: `${_teamId}_recruit_commit_001`,
      category: 'commitment-received',
      athleteName: 'Marcus Johnson',
      athleteProfileCode: 'MJOHN26',
      position: 'PG',
      classYear: '2026',
      highSchool: 'Lincoln High School',
      state: 'CA',
      sport: 'Basketball',
      date: '2025-01-15T00:00:00.000Z',
      verified: true,
      notes: 'Verbal commitment – National Signing Day pending.',
    },
    {
      id: `${_teamId}_recruit_commit_002`,
      category: 'commitment-received',
      athleteName: 'DeShawn Williams',
      athleteProfileCode: 'DWILL25',
      position: 'SF',
      classYear: '2025',
      highSchool: 'Westview Academy',
      state: 'TX',
      sport: 'Basketball',
      date: '2024-11-20T00:00:00.000Z',
      verified: true,
    },
    {
      id: `${_teamId}_recruit_commit_003`,
      category: 'commitment-received',
      athleteName: 'Tyler Brooks',
      position: 'C',
      classYear: '2026',
      highSchool: 'Riverside Prep',
      state: 'FL',
      sport: 'Basketball',
      date: '2024-10-08T00:00:00.000Z',
      verified: false,
    },
    // Offers (shown on Offers tab)
    {
      id: `${_teamId}_recruit_offer_001`,
      category: 'offer-sent',
      athleteName: 'Jaylen Carter',
      position: 'SG',
      classYear: '2026',
      highSchool: 'Oak Park High',
      state: 'GA',
      sport: 'Basketball',
      date: '2025-02-01T00:00:00.000Z',
      scholarshipType: 'Full Scholarship',
    },
    {
      id: `${_teamId}_recruit_offer_002`,
      category: 'offer-sent',
      athleteName: 'Isaiah Thomas',
      position: 'PF',
      classYear: '2025',
      highSchool: 'East Bay Prep',
      state: 'CA',
      sport: 'Basketball',
      date: '2025-01-22T00:00:00.000Z',
      scholarshipType: 'Full Scholarship',
    },
    {
      id: `${_teamId}_recruit_offer_003`,
      category: 'offer-sent',
      athleteName: 'Kevin Durant Jr',
      position: 'SF',
      classYear: '2027',
      highSchool: 'National Academy',
      state: 'AZ',
      sport: 'Basketball',
      date: '2024-12-10T00:00:00.000Z',
      scholarshipType: 'Partial Scholarship',
    },
    // Camp & visit events (shown on Timeline only)
    {
      id: `${_teamId}_recruit_camp_001`,
      category: 'camp-hosted',
      athleteName: 'Jordan Davis',
      position: 'PG',
      classYear: '2026',
      highSchool: 'Summit High',
      state: 'OR',
      sport: 'Basketball',
      date: '2024-09-14T00:00:00.000Z',
    },
    {
      id: `${_teamId}_recruit_visit_001`,
      category: 'visit-hosted',
      athleteName: 'Andre Thompson',
      position: 'C',
      classYear: '2025',
      highSchool: 'Lakewood Prep',
      state: 'WA',
      sport: 'Basketball',
      date: '2024-08-28T00:00:00.000Z',
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Rankings factory
// ─────────────────────────────────────────────────────────────────────────────

export function buildRankings(uid: string): RankingSeedDoc[] {
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
      sportId: 'football',
      classOf: 2026,
      createdAt: now,
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
      sportId: 'football',
      classOf: 2026,
      createdAt: now,
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
      sportId: 'football',
      classOf: 2026,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Scout reports factory
// ─────────────────────────────────────────────────────────────────────────────

export function buildScoutReports(uid: string): object[] {
  const now = new Date();
  const dAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  return [
    {
      id: `seed_${uid}_scout_0`,
      userId: uid,
      sportId: 'football',
      athlete: {
        id: uid,
        name: 'Alex Rivera',
        position: 'QB',
        secondaryPosition: null,
        sport: 'football',
        classOf: 2026,
        gradYear: 2026,
        school: 'Riverside High School',
        state: 'CA',
        profileImageUrl: 'https://placehold.co/80x80/1a1a2e/00ff88?text=QB',
        height: '6\'1"',
        weight: '185 lbs',
      },
      rating: { overall: 4.3, physical: 4.2, technical: 4.5, mental: 4.4, potential: 4.6 },
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
      isBookmarked: false,
      viewCount: 1842,
      bookmarkCount: 47,
      publishedAt: dAgo(14),
      updatedAt: dAgo(14),
      xpReward: 25,
      hasViewed: false,
      tags: ['QB', 'Football', '2026', 'Elite'],
      source: 'nxt1',
      createdAt: dAgo(14),
    },
    {
      id: `seed_${uid}_scout_1`,
      userId: uid,
      sportId: 'football',
      athlete: {
        id: uid,
        name: 'Alex Rivera',
        position: 'QB',
        secondaryPosition: null,
        sport: 'football',
        classOf: 2026,
        gradYear: 2026,
        school: 'Riverside High School',
        state: 'CA',
        profileImageUrl: 'https://placehold.co/80x80/1a1a2e/00ff88?text=QB',
        height: '6\'1"',
        weight: '185 lbs',
      },
      rating: { overall: 4.1, physical: 4.0, technical: 4.3, mental: 4.2, potential: 4.4 },
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
        title: 'Regional Scout – West Coast',
        avatarUrl: 'https://placehold.co/40x40/4a90e2/fff?text=DC',
        isVerified: true,
        credentials: ['Certified Evaluator', 'AFCA Member'],
      },
      isVerified: true,
      isBookmarked: false,
      viewCount: 724,
      bookmarkCount: 19,
      publishedAt: dAgo(30),
      updatedAt: dAgo(30),
      xpReward: 50,
      hasViewed: false,
      tags: ['QB', 'Football', '2026', 'Premium'],
      source: 'partner',
      createdAt: dAgo(30),
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Videos factory
// ─────────────────────────────────────────────────────────────────────────────

export function buildVideos(uid: string): object[] {
  const now = new Date();
  const dAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  return [
    // Football videos
    {
      id: `seed_${uid}_video_0`,
      userId: uid,
      sport: 'football',
      sportId: 'football',
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
      sport: 'football',
      sportId: 'football',
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
      sport: 'football',
      sportId: 'football',
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
    // Basketball video
    {
      id: `seed_${uid}_video_3`,
      userId: uid,
      sport: 'basketball',
      sportId: 'basketball',
      title: 'Triple-Double Highlights 🏀',
      description: 'Full highlights from the triple-double game — 18 pts, 11 reb, 10 ast.',
      mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      thumbnailUrl: 'https://placehold.co/800x450/0d1b2a/ff6b35?text=Triple+Double',
      duration: 134,
      type: 'highlight',
      tags: ['Basketball', 'PointGuard', 'TripleDouble'],
      stats: { views: 2400, likes: 156, shares: 28 },
      isPinned: true,
      createdAt: dAgo(10),
      updatedAt: dAgo(10),
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Log factories (MaxPreps-style per-game stat tables)
// ─────────────────────────────────────────────────────────────────────────────

export function buildFootballGameLog(_uid: string): ProfileSeasonGameLog[] {
  const GAMES = [
    {
      date: '08/30',
      result: 'W 35-14',
      outcome: 'win' as const,
      opp: 'Central HS',
      pass: [18, 25, 224, 3, 0],
      rush: [8, 45, 1, 5.6],
    },
    {
      date: '09/06',
      result: 'W 28-21',
      outcome: 'win' as const,
      opp: 'North Prep',
      pass: [15, 22, 187, 2, 1],
      rush: [10, 67, 1, 6.7],
    },
    {
      date: '09/13',
      result: 'W 42-7',
      outcome: 'win' as const,
      opp: 'East River Acad.',
      pass: [22, 28, 312, 4, 0],
      rush: [7, 41, 0, 5.9],
    },
    {
      date: '09/20',
      result: 'L 17-24',
      outcome: 'loss' as const,
      opp: 'Westside Tech',
      pass: [14, 24, 156, 1, 2],
      rush: [9, 34, 0, 3.8],
    },
    {
      date: '09/27',
      result: 'W 31-10',
      outcome: 'win' as const,
      opp: 'Riverside HS',
      pass: [20, 27, 245, 3, 0],
      rush: [11, 88, 2, 8.0],
    },
    {
      date: '10/04',
      result: 'W 41-17',
      outcome: 'win' as const,
      opp: 'Southern Acad.',
      pass: [21, 30, 287, 3, 1],
      rush: [8, 53, 1, 6.6],
    },
    {
      date: '10/11',
      result: 'W 27-20',
      outcome: 'win' as const,
      opp: 'Valley Prep',
      pass: [16, 23, 198, 2, 0],
      rush: [7, 39, 0, 5.6],
    },
    {
      date: '10/18',
      result: 'L 14-28',
      outcome: 'loss' as const,
      opp: 'Mountain View HS',
      pass: [11, 20, 112, 1, 2],
      rush: [6, 22, 0, 3.7],
    },
  ];

  const passingLog: ProfileSeasonGameLog = {
    season: '2025-2026',
    category: 'Passing',
    teamType: 'school',
    seasonRecord: '6-2',
    verified: true,
    verifiedBy: 'MaxPreps',
    columns: [
      { key: 'C', label: 'C', tooltip: 'Completions' },
      { key: 'ATT', label: 'ATT', tooltip: 'Attempts' },
      { key: 'YDS', label: 'YDS', tooltip: 'Passing Yards', higherIsBetter: true },
      { key: 'TD', label: 'TD', tooltip: 'Touchdowns', higherIsBetter: true },
      { key: 'INT', label: 'INT', tooltip: 'Interceptions', higherIsBetter: false },
    ],
    games: GAMES.map((g) => ({
      date: g.date,
      result: g.result,
      outcome: g.outcome,
      opponent: g.opp,
      stats: { C: g.pass[0]!, ATT: g.pass[1]!, YDS: g.pass[2]!, TD: g.pass[3]!, INT: g.pass[4]! },
    })),
    totals: [
      {
        label: 'Season Totals',
        stats: { C: 137, ATT: 199, YDS: 1721, TD: 19, INT: 6 },
      },
    ],
  };

  const rushingLog: ProfileSeasonGameLog = {
    season: '2025-2026',
    category: 'Rushing',
    teamType: 'school',
    seasonRecord: '6-2',
    verified: true,
    verifiedBy: 'MaxPreps',
    columns: [
      { key: 'CAR', label: 'CAR', tooltip: 'Carries' },
      { key: 'YDS', label: 'YDS', tooltip: 'Rushing Yards', higherIsBetter: true },
      { key: 'TD', label: 'TD', tooltip: 'Touchdowns', higherIsBetter: true },
      {
        key: 'AVG',
        label: 'AVG',
        tooltip: 'Yards per Carry',
        higherIsBetter: true,
        format: 'number',
      },
    ],
    games: GAMES.map((g) => ({
      date: g.date,
      result: g.result,
      outcome: g.outcome,
      opponent: g.opp,
      stats: { CAR: g.rush[0]!, YDS: g.rush[1]!, TD: g.rush[2]!, AVG: g.rush[3]! },
    })),
    totals: [
      {
        label: 'Season Totals',
        stats: { CAR: 66, YDS: 389, TD: 5, AVG: 5.9 },
      },
    ],
  };

  return [passingLog, rushingLog];
}

export function buildBasketballGameLog(_uid: string): ProfileSeasonGameLog[] {
  const GAMES = [
    {
      date: '11/08',
      result: 'W 72-58',
      outcome: 'win' as const,
      opp: 'Riverside Hoops',
      pts: 24,
      reb: 8,
      ast: 7,
      stl: 3,
      blk: 1,
    },
    {
      date: '11/15',
      result: 'W 65-47',
      outcome: 'win' as const,
      opp: 'North Shore HS',
      pts: 22,
      reb: 10,
      ast: 5,
      stl: 2,
      blk: 1,
    },
    {
      date: '11/22',
      result: 'L 58-63',
      outcome: 'loss' as const,
      opp: 'Riverside Prep Stars',
      pts: 18,
      reb: 7,
      ast: 9,
      stl: 1,
      blk: 0,
    },
    {
      date: '11/29',
      result: 'W 79-55',
      outcome: 'win' as const,
      opp: 'Valley Lions',
      pts: 28,
      reb: 6,
      ast: 8,
      stl: 4,
      blk: 2,
    },
    {
      date: '12/06',
      result: 'W 61-54',
      outcome: 'win' as const,
      opp: 'East River HS',
      pts: 20,
      reb: 9,
      ast: 6,
      stl: 2,
      blk: 1,
    },
    {
      date: '12/13',
      result: 'W 84-67',
      outcome: 'win' as const,
      opp: 'Harbor Prep',
      pts: 31,
      reb: 11,
      ast: 10,
      stl: 3,
      blk: 2,
    },
    {
      date: '12/20',
      result: 'L 44-51',
      outcome: 'loss' as const,
      opp: 'Western Acad.',
      pts: 15,
      reb: 5,
      ast: 4,
      stl: 1,
      blk: 0,
    },
    {
      date: '01/10',
      result: 'W 73-60',
      outcome: 'win' as const,
      opp: 'Southern HS',
      pts: 25,
      reb: 8,
      ast: 7,
      stl: 2,
      blk: 1,
    },
  ];

  const perGameLog: ProfileSeasonGameLog = {
    season: '2025-2026',
    category: 'Per-Game',
    teamType: 'school',
    seasonRecord: '6-2',
    verified: true,
    verifiedBy: 'MaxPreps',
    columns: [
      { key: 'PTS', label: 'PTS', tooltip: 'Points', higherIsBetter: true },
      { key: 'REB', label: 'REB', tooltip: 'Rebounds', higherIsBetter: true },
      { key: 'AST', label: 'AST', tooltip: 'Assists', higherIsBetter: true },
      { key: 'STL', label: 'STL', tooltip: 'Steals', higherIsBetter: true },
      { key: 'BLK', label: 'BLK', tooltip: 'Blocks', higherIsBetter: true },
    ],
    games: GAMES.map((g) => ({
      date: g.date,
      result: g.result,
      outcome: g.outcome,
      opponent: g.opp,
      stats: { PTS: g.pts, REB: g.reb, AST: g.ast, STL: g.stl, BLK: g.blk },
    })),
    totals: [
      {
        label: 'Per-Game Avg',
        stats: { PTS: 22.9, REB: 8.0, AST: 7.0, STL: 2.3, BLK: 1.0 },
      },
    ],
  };

  return [perGameLog];
}

// ─────────────────────────────────────────────────────────────────────────────
// Denormalized sport summaries
// ─────────────────────────────────────────────────────────────────────────────

export function buildDenormalizedSportUpdates(
  stats: VerifiedStat[],
  metrics: VerifiedMetric[],
  events: ScheduleEvent[]
): {
  featuredStats: VerifiedStat[];
  featuredMetrics: VerifiedMetric[];
  upcomingEvents: ScheduleEvent[];
} {
  const featuredStats = stats.filter((s) =>
    ['passing_yards', 'passing_tds', 'completion_pct', 'rushing_yards'].includes(s.field)
  );
  const featuredMetrics = metrics.filter((m) => m.verified).slice(0, 3);
  const now = new Date();
  const upcomingEvents = events
    .filter((e) => new Date(e.date as string) > now)
    .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())
    .slice(0, 3);
  return { featuredStats, featuredMetrics, upcomingEvents };
}

// ─────────────────────────────────────────────────────────────────────────────
// User-doc profile fields (Overview tab: Player History, Awards, Academic,
// Contact, Coach Contact)
// ─────────────────────────────────────────────────────────────────────────────

export interface UserProfileFields {
  teamHistory: {
    name: string;
    type: string;
    logoUrl?: string | null;
    sport?: string;
    location?: { city?: string; state?: string };
    record?: { wins?: number; losses?: number; ties?: number };
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
  }[];
  awards: {
    title: string;
    category?: string;
    sport?: string;
    season?: string;
    issuer?: string;
    date?: string;
  }[];
  contact: {
    email: string;
    phone?: string;
  };
  /** Written into user.athlete.academics — use dot-notation update in Firestore */
  academics: {
    gpa: number;
    satScore: number;
    actScore: number;
    intendedMajor?: string;
  };
  /** Coach contact embedded in the active sport entry */
  coachContact: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    title?: string;
  };
  /** Basic identity fields written to the User doc (firstName, lastName, etc.) */
  basicProfile: {
    firstName: string;
    lastName: string;
    displayName: string;
    classOf: number;
    location: { city: string; state: string; country: string };
    height: string;
    weight: number;
    verificationStatus: string;
  };
}

/** Deterministic name pool — pick by uid hash so each seeded user gets a unique name */
const SEED_ATHLETE_NAMES: readonly { first: string; last: string }[] = [
  { first: 'Marcus', last: 'Johnson' },
  { first: 'Tyler', last: 'Williams' },
  { first: 'Jordan', last: 'Davis' },
  { first: 'Cameron', last: 'Brown' },
  { first: 'Malik', last: 'Thompson' },
  { first: 'Darius', last: 'Mitchell' },
  { first: 'Ethan', last: 'Clarke' },
  { first: 'Noah', last: 'Anderson' },
];

export function buildUserProfileFields(uid: string): UserProfileFields {
  // Pick a deterministic name from the pool based on uid hash
  const hashIndex = uid.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const { first, last } = SEED_ATHLETE_NAMES[hashIndex % SEED_ATHLETE_NAMES.length]!;
  return {
    teamHistory: [
      {
        name: 'Riverside High School',
        type: 'high-school',
        logoUrl: null,
        sport: 'football',
        location: { city: 'Riverside', state: 'CA' },
        record: { wins: 10, losses: 2, ties: 0 },
        startDate: '2022-08-01',
        endDate: '2024-05-31',
        isCurrent: false,
      },
      {
        name: 'Inland Empire Panthers AAU',
        type: 'aau',
        logoUrl: null,
        sport: 'football',
        location: { city: 'San Bernardino', state: 'CA' },
        record: { wins: 14, losses: 4 },
        startDate: '2024-06-01',
        isCurrent: true,
      },
      {
        name: 'Valley Academy',
        type: 'club',
        logoUrl: null,
        sport: 'basketball',
        location: { city: 'Riverside', state: 'CA' },
        record: { wins: 9, losses: 5 },
        startDate: '2021-09-01',
        endDate: '2022-06-30',
        isCurrent: false,
      },
    ],
    awards: [
      {
        title: 'All-District First Team',
        category: 'athletic',
        sport: 'football',
        season: '2024-2025',
        issuer: 'Inland Empire District Athletic Association',
        date: '2025-01-15',
      },
      {
        title: 'MVP — NXT1 Elite QB Camp',
        category: 'athletic',
        sport: 'football',
        season: 'June 2025',
        issuer: 'NXT1 Sports',
        date: '2025-06-10',
      },
      {
        title: 'Academic All-Star',
        category: 'academic',
        season: '2024-2025',
        issuer: 'California High School Athletic League',
        date: '2025-05-20',
      },
    ],
    contact: {
      email: `athlete_${uid.slice(0, 6)}@nxt1sports.com`,
      phone: '+1-310-123-4567',
    },
    academics: {
      gpa: 3.9,
      satScore: 1380,
      actScore: 29,
      intendedMajor: 'Sports Management',
    },
    coachContact: {
      firstName: 'Daniel',
      lastName: 'Rivera',
      email: 'coach.rivera@pacific-university.edu',
      phone: '+1-310-234-5678',
      title: 'Head Coach',
    },
    basicProfile: {
      firstName: first,
      lastName: last,
      displayName: `${first} ${last}`,
      classOf: 2026,
      location: { city: 'Riverside', state: 'CA', country: 'US' },
      height: '6\'1"',
      weight: 185,
      verificationStatus: 'verified',
    },
  };
}
