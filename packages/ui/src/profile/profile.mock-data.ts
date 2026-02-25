/**
 * @fileoverview Mock Profile Data for Development
 * @module @nxt1/ui/profile/mock-data
 *
 * ⚠️ TEMPORARY FILE - Delete when backend is ready
 *
 * Contains comprehensive dummy data for Profile feature during development.
 * All data here is fabricated for UI testing purposes only.
 */

import type {
  ProfileUser,
  ProfileFollowStats,
  ProfileQuickStats,
  ProfilePinnedVideo,
  ProfilePost,
  ProfileOffer,
  ProfileEvent,
  ProfileAward,
  AthleticStatsCategory,
  ProfilePageData,
  PlayerCardData,
  ProfileSeasonGameLog,
} from '@nxt1/core';

const now = Date.now();

// ============================================
// MOCK USER DATA
// ============================================

export const MOCK_PROFILE_USER: ProfileUser = {
  uid: 'user-001',
  profileCode: 'marcus-johnson-2026',
  firstName: 'Marcus',
  lastName: 'Johnson',
  displayName: 'Marcus Johnson',
  profileImg: 'https://i.pravatar.cc/300?img=68',
  bannerImg: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&h=400&fit=crop',
  gallery: [
    'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=600&h=800&fit=crop',
    'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=600&h=800&fit=crop',
    'https://images.unsplash.com/photo-1508098682722-e99c643e0edc?w=600&h=800&fit=crop',
  ],
  role: 'athlete',
  isRecruit: true,
  verificationStatus: 'verified',
  aboutMe:
    'Dedicated student-athlete with a passion for football. Team captain and honor roll student. Working hard every day to achieve my dreams of playing at the next level. 🏈 #GrindNeverStops',
  primarySport: {
    name: 'Football',
    icon: 'american-football',
    position: 'Quarterback',
    secondaryPositions: ['Wide Receiver'],
    jerseyNumber: '12',
  },
  additionalSports: [
    {
      name: 'Basketball',
      icon: 'basketball',
      position: 'Shooting Guard',
      jerseyNumber: '3',
    },
    {
      name: 'Track & Field',
      icon: 'track',
      position: '100m / 200m Sprint',
    },
  ],
  school: {
    name: 'Riverside High School',
    logoUrl: 'https://i.pravatar.cc/100?img=45',
    teamCode: 'RHS-2024',
    location: 'Austin, TX',
  },
  teamAffiliations: [
    {
      name: 'Riverside High School Varsity',
      type: 'high-school',
      logoUrl: 'https://i.pravatar.cc/100?img=45',
      teamCode: 'RHS-VARSITY',
      location: 'Austin, TX',
    },
    {
      name: 'Texas Elite 7v7',
      type: 'club',
      logoUrl: 'https://i.pravatar.cc/100?img=41',
      teamCode: 'TE7V7',
      location: 'Austin, TX',
    },
    {
      name: 'ATX QB Academy',
      type: 'academy',
      logoUrl: 'https://i.pravatar.cc/100?img=32',
      teamCode: 'ATX-QB',
      location: 'Austin, TX',
    },
    {
      name: 'Texas Elite 7v7',
      type: 'club',
      location: 'Austin, TX',
    },
  ],
  classYear: '2026',
  height: '6\'2"',
  weight: '195',
  measurablesVerifiedBy: 'Rivals',
  measurablesVerifiedUrl: 'https://www.rivals.com',
  gpa: '3.8',
  sat: '1280',
  act: '28',
  location: 'Austin, TX',
  social: {
    twitter: 'marcusj12',
    instagram: 'marcus.johnson12',
    hudl: 'marcus-johnson',
    youtube: '@marcusjohnson',
    maxpreps: 'marcus-johnson-qb',
    on3: 'marcus-johnson',
    rivals: 'marcus-johnson-12',
    espn: 'high-school/athlete/_/id/2026/marcus-johnson',
  },
  contact: {
    email: 'marcus.johnson@email.com',
    phone: '(555) 123-4567',
    preferredMethod: 'email',
    availableForContact: true,
  },
  awards: [
    {
      id: 'award-001',
      title: 'All-State First Team',
      issuer: 'Texas High School Coaches Association',
      season: '2025',
      sport: 'Football',
    },
    {
      id: 'award-002',
      title: 'District 26-6A Offensive MVP',
      issuer: 'UIL District 26-6A',
      season: '2025',
      sport: 'Football',
    },
    {
      id: 'award-003',
      title: 'Elite 11 Regional MVP',
      issuer: 'Elite 11',
      season: '2025',
      sport: 'Football',
    },
    {
      id: 'award-004',
      title: 'All-District First Team',
      issuer: 'UIL District 26-6A',
      season: '2024',
      sport: 'Football',
    },
    {
      id: 'award-005',
      title: 'Academic All-State',
      issuer: 'THSCA',
      season: '2024',
      sport: 'Football',
    },
  ],
  coachContact: {
    firstName: 'Robert',
    lastName: 'Williams',
    email: 'rwilliams@riversidehs.edu',
    phone: '(555) 987-6543',
    title: 'Head Coach',
  },
  createdAt: new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
};

// ============================================
// MOCK FOLLOW STATS
// ============================================

export const MOCK_FOLLOW_STATS: ProfileFollowStats = {
  followersCount: 2847,
  followingCount: 156,
  isFollowing: false,
  isFollowedBy: false,
};

// ============================================
// MOCK QUICK STATS
// ============================================

export const MOCK_QUICK_STATS: ProfileQuickStats = {
  profileViews: 15420,
  videoViews: 89650,
  totalPosts: 47,
  highlightCount: 12,
  offerCount: 8,
  eventCount: 6,
  collegeInterestCount: 23,
  shareCount: 342,
};

// ============================================
// MOCK ATHLETIC STATS
// ============================================

export const MOCK_ATHLETIC_STATS: AthleticStatsCategory[] = [
  {
    name: 'Offense',
    stats: [
      { label: 'YDS', value: '5,350', verified: true },
      { label: 'YDS/G', value: '382.1', verified: true },
      { label: 'COMP', value: '293', verified: true },
      { label: 'ATT', value: '392', verified: true },
      { label: 'PCT', value: '0.747', verified: true },
      { label: 'TD', value: '60', verified: true },
      { label: 'INT', value: '20', verified: true },
      { label: 'RATE', value: '135', verified: true },
      { label: 'GP', value: '14', verified: true },
    ],
  },
  {
    name: 'Defense',
    stats: [
      { label: 'TACKLES', value: '12', verified: true },
      { label: 'SACKS', value: '0', verified: true },
      { label: 'INT', value: '0', verified: false },
      { label: 'FF', value: '1', verified: false },
    ],
  },
  {
    name: 'Special Teams',
    stats: [
      { label: 'RET YDS', value: '245', verified: true },
      { label: 'RET TD', value: '1', verified: true },
      { label: 'AVG', value: '24.5', verified: false },
    ],
  },
];

// ============================================
// MOCK GAME LOG DATA (MaxPreps-style)
// ============================================

export const MOCK_GAME_LOG: ProfileSeasonGameLog[] = [
  {
    season: '2025-2026',
    category: 'Passing',
    teamType: 'school',
    seasonRecord: '13-1',
    verified: true,
    verifiedBy: 'MaxPreps',
    columns: [
      { key: 'C', label: 'C', tooltip: 'Completions', format: 'number' },
      { key: 'ATT', label: 'Att', tooltip: 'Attempts', format: 'number' },
      { key: 'YDS', label: 'Yds', tooltip: 'Passing Yards', format: 'number' },
      { key: 'PCT', label: 'C%', tooltip: 'Completion Percentage', format: 'pct' },
      { key: 'AVG', label: 'Avg', tooltip: 'Yards per Attempt', format: 'number' },
      { key: 'TD', label: 'TD', tooltip: 'Touchdowns', format: 'number', higherIsBetter: true },
      {
        key: 'INT',
        label: 'Int',
        tooltip: 'Interceptions',
        format: 'number',
        higherIsBetter: false,
      },
      { key: 'LNG', label: 'Lng', tooltip: 'Longest Pass', format: 'number' },
    ],
    games: [
      {
        date: '08/28',
        result: 'W 44-0',
        outcome: 'win',
        opponent: 'Selma',
        stats: { C: 17, ATT: 28, YDS: 305, PCT: '.607', AVG: 17.9, TD: 5, INT: 2, LNG: 50 },
      },
      {
        date: '09/05',
        result: 'W 22-15',
        outcome: 'win',
        opponent: 'Thomasville',
        stats: { C: 25, ATT: 32, YDS: 408, PCT: '.781', AVG: 16.3, TD: 3, INT: 2, LNG: 62 },
      },
      {
        date: '09/12',
        result: 'W 74-0',
        outcome: 'win',
        opponent: 'DCHS',
        stats: { C: 17, ATT: 23, YDS: 419, PCT: '.739', AVG: 24.6, TD: 7, INT: 1, LNG: 48 },
      },
      {
        date: '09/19',
        result: 'W 62-6',
        outcome: 'win',
        opponent: 'Greensboro',
        stats: { C: 22, ATT: 26, YDS: 356, PCT: '.846', AVG: 16.2, TD: 4, INT: 1, LNG: 51 },
      },
      {
        date: '09/26',
        result: 'W 56-12',
        outcome: 'win',
        opponent: 'Keith',
        stats: { C: 23, ATT: 31, YDS: 411, PCT: '.742', AVG: 17.9, TD: 3, INT: 2, LNG: 50 },
      },
      {
        date: '10/03',
        result: 'W 34-14',
        outcome: 'win',
        opponent: 'Hale County',
        stats: { C: 25, ATT: 37, YDS: 438, PCT: '.676', AVG: 17.5, TD: 3, INT: 1, LNG: 0 },
      },
      {
        date: '10/09',
        result: 'W 66-0',
        outcome: 'win',
        opponent: 'SCHS',
        stats: { C: 21, ATT: 24, YDS: 375, PCT: '.875', AVG: 17.9, TD: 5, INT: 0, LNG: 0 },
      },
      {
        date: '10/17',
        result: 'W 66-0',
        outcome: 'win',
        opponent: 'WCHS',
        stats: { C: 11, ATT: 12, YDS: 379, PCT: '.917', AVG: 34.5, TD: 5, INT: 0, LNG: 81 },
      },
      {
        date: '10/24',
        result: 'W 74-22',
        outcome: 'win',
        opponent: 'Thorsby',
        stats: { C: 19, ATT: 24, YDS: 441, PCT: '.792', AVG: 23.2, TD: 7, INT: 1, LNG: 62 },
      },
      {
        date: '10/30',
        result: 'W 76-38',
        outcome: 'win',
        opponent: 'BCHS',
        stats: { C: 29, ATT: 35, YDS: 584, PCT: '.829', AVG: 20.1, TD: 8, INT: 1, LNG: 74 },
      },
      {
        date: '11/06',
        result: 'W 35-12',
        outcome: 'win',
        opponent: 'Dadeville',
        stats: { C: 17, ATT: 24, YDS: 303, PCT: '.708', AVG: 17.8, TD: 3, INT: 1, LNG: 70 },
      },
      {
        date: '11/14',
        result: 'W 39-22',
        outcome: 'win',
        opponent: 'CHCA',
        stats: { C: 27, ATT: 36, YDS: 382, PCT: '.750', AVG: 14.1, TD: 2, INT: 3, LNG: 30 },
      },
      {
        date: '11/21',
        result: 'W 34-21',
        outcome: 'win',
        opponent: 'Glenwood',
        stats: { C: 20, ATT: 27, YDS: 288, PCT: '.741', AVG: 14.4, TD: 3, INT: 2, LNG: 30 },
      },
      {
        date: '11/28',
        result: 'L 20-51',
        outcome: 'loss',
        opponent: 'BA',
        stats: { C: 20, ATT: 33, YDS: 261, PCT: '.606', AVG: 13.1, TD: 2, INT: 3, LNG: 0 },
      },
    ],
    totals: [
      {
        label: 'Season Totals',
        stats: { C: 293, ATT: 392, YDS: '5,350', PCT: '.748', AVG: 18.3, TD: 60, INT: 20, LNG: 81 },
      },
      {
        label: 'Per Game Avg',
        stats: {
          C: 20.9,
          ATT: 28.0,
          YDS: 382.1,
          PCT: '.748',
          AVG: 18.3,
          TD: 4.3,
          INT: 1.4,
          LNG: '-',
        },
      },
    ],
  },
  {
    season: '2025-2026',
    category: 'Rushing',
    teamType: 'school',
    seasonRecord: '13-1',
    verified: true,
    verifiedBy: 'MaxPreps',
    columns: [
      { key: 'CAR', label: 'Car', tooltip: 'Carries', format: 'number' },
      { key: 'YDS', label: 'Yds', tooltip: 'Rushing Yards', format: 'number' },
      { key: 'AVG', label: 'Avg', tooltip: 'Yards per Carry', format: 'number' },
      {
        key: 'TD',
        label: 'TD',
        tooltip: 'Rushing Touchdowns',
        format: 'number',
        higherIsBetter: true,
      },
      { key: 'LNG', label: 'Lng', tooltip: 'Longest Rush', format: 'number' },
    ],
    games: [
      {
        date: '08/28',
        result: 'W 44-0',
        outcome: 'win',
        opponent: 'Selma',
        stats: { CAR: 5, YDS: 42, AVG: 8.4, TD: 1, LNG: 22 },
      },
      {
        date: '09/05',
        result: 'W 22-15',
        outcome: 'win',
        opponent: 'Thomasville',
        stats: { CAR: 8, YDS: 67, AVG: 8.4, TD: 0, LNG: 18 },
      },
      {
        date: '09/12',
        result: 'W 74-0',
        outcome: 'win',
        opponent: 'DCHS',
        stats: { CAR: 3, YDS: 55, AVG: 18.3, TD: 2, LNG: 35 },
      },
      {
        date: '09/19',
        result: 'W 62-6',
        outcome: 'win',
        opponent: 'Greensboro',
        stats: { CAR: 6, YDS: 78, AVG: 13.0, TD: 1, LNG: 42 },
      },
      {
        date: '09/26',
        result: 'W 56-12',
        outcome: 'win',
        opponent: 'Keith',
        stats: { CAR: 4, YDS: 31, AVG: 7.8, TD: 0, LNG: 14 },
      },
      {
        date: '10/03',
        result: 'W 34-14',
        outcome: 'win',
        opponent: 'Hale County',
        stats: { CAR: 7, YDS: 52, AVG: 7.4, TD: 1, LNG: 19 },
      },
      {
        date: '10/09',
        result: 'W 66-0',
        outcome: 'win',
        opponent: 'SCHS',
        stats: { CAR: 4, YDS: 48, AVG: 12.0, TD: 2, LNG: 28 },
      },
      {
        date: '10/17',
        result: 'W 66-0',
        outcome: 'win',
        opponent: 'WCHS',
        stats: { CAR: 2, YDS: 24, AVG: 12.0, TD: 1, LNG: 20 },
      },
      {
        date: '10/24',
        result: 'W 74-22',
        outcome: 'win',
        opponent: 'Thorsby',
        stats: { CAR: 5, YDS: 63, AVG: 12.6, TD: 1, LNG: 31 },
      },
      {
        date: '10/30',
        result: 'W 76-38',
        outcome: 'win',
        opponent: 'BCHS',
        stats: { CAR: 3, YDS: 22, AVG: 7.3, TD: 0, LNG: 12 },
      },
      {
        date: '11/06',
        result: 'W 35-12',
        outcome: 'win',
        opponent: 'Dadeville',
        stats: { CAR: 6, YDS: 44, AVG: 7.3, TD: 1, LNG: 16 },
      },
      {
        date: '11/14',
        result: 'W 39-22',
        outcome: 'win',
        opponent: 'CHCA',
        stats: { CAR: 9, YDS: 88, AVG: 9.8, TD: 1, LNG: 38 },
      },
      {
        date: '11/21',
        result: 'W 34-21',
        outcome: 'win',
        opponent: 'Glenwood',
        stats: { CAR: 7, YDS: 52, AVG: 7.4, TD: 0, LNG: 15 },
      },
      {
        date: '11/28',
        result: 'L 20-51',
        outcome: 'loss',
        opponent: 'BA',
        stats: { CAR: 10, YDS: 36, AVG: 3.6, TD: 0, LNG: 11 },
      },
    ],
    totals: [
      {
        label: 'Season Totals',
        stats: { CAR: 79, YDS: 702, AVG: 8.9, TD: 11, LNG: 42 },
      },
    ],
  },
  {
    season: '2024-2025',
    category: 'Passing',
    teamType: 'school',
    seasonRecord: '10-3',
    verified: true,
    verifiedBy: 'MaxPreps',
    columns: [
      { key: 'C', label: 'C', tooltip: 'Completions', format: 'number' },
      { key: 'ATT', label: 'Att', tooltip: 'Attempts', format: 'number' },
      { key: 'YDS', label: 'Yds', tooltip: 'Passing Yards', format: 'number' },
      { key: 'PCT', label: 'C%', tooltip: 'Completion Percentage', format: 'pct' },
      { key: 'AVG', label: 'Avg', tooltip: 'Yards per Attempt', format: 'number' },
      { key: 'TD', label: 'TD', tooltip: 'Touchdowns', format: 'number', higherIsBetter: true },
      {
        key: 'INT',
        label: 'Int',
        tooltip: 'Interceptions',
        format: 'number',
        higherIsBetter: false,
      },
      { key: 'LNG', label: 'Lng', tooltip: 'Longest Pass', format: 'number' },
    ],
    games: [
      {
        date: '08/23',
        result: 'W 35-14',
        outcome: 'win',
        opponent: 'Selma',
        stats: { C: 14, ATT: 22, YDS: 245, PCT: '.636', AVG: 17.5, TD: 3, INT: 1, LNG: 48 },
      },
      {
        date: '09/06',
        result: 'W 28-21',
        outcome: 'win',
        opponent: 'Thomasville',
        stats: { C: 18, ATT: 30, YDS: 312, PCT: '.600', AVG: 17.3, TD: 2, INT: 2, LNG: 44 },
      },
      {
        date: '09/13',
        result: 'W 42-7',
        outcome: 'win',
        opponent: 'DCHS',
        stats: { C: 15, ATT: 20, YDS: 275, PCT: '.750', AVG: 18.3, TD: 4, INT: 0, LNG: 55 },
      },
      {
        date: '09/20',
        result: 'W 31-10',
        outcome: 'win',
        opponent: 'Greensboro',
        stats: { C: 16, ATT: 25, YDS: 268, PCT: '.640', AVG: 16.8, TD: 3, INT: 1, LNG: 38 },
      },
      {
        date: '09/27',
        result: 'L 14-21',
        outcome: 'loss',
        opponent: 'Keith',
        stats: { C: 12, ATT: 28, YDS: 198, PCT: '.429', AVG: 16.5, TD: 1, INT: 3, LNG: 32 },
      },
      {
        date: '10/04',
        result: 'W 48-6',
        outcome: 'win',
        opponent: 'Hale County',
        stats: { C: 20, ATT: 28, YDS: 335, PCT: '.714', AVG: 16.8, TD: 5, INT: 0, LNG: 62 },
      },
      {
        date: '10/11',
        result: 'W 55-0',
        outcome: 'win',
        opponent: 'SCHS',
        stats: { C: 13, ATT: 18, YDS: 290, PCT: '.722', AVG: 22.3, TD: 4, INT: 0, LNG: 58 },
      },
      {
        date: '10/18',
        result: 'W 41-14',
        outcome: 'win',
        opponent: 'WCHS',
        stats: { C: 17, ATT: 24, YDS: 310, PCT: '.708', AVG: 18.2, TD: 3, INT: 1, LNG: 45 },
      },
      {
        date: '10/25',
        result: 'W 38-20',
        outcome: 'win',
        opponent: 'Thorsby',
        stats: { C: 19, ATT: 27, YDS: 328, PCT: '.704', AVG: 17.3, TD: 4, INT: 1, LNG: 52 },
      },
      {
        date: '11/01',
        result: 'L 21-28',
        outcome: 'loss',
        opponent: 'BCHS',
        stats: { C: 16, ATT: 32, YDS: 265, PCT: '.500', AVG: 16.6, TD: 2, INT: 2, LNG: 36 },
      },
      {
        date: '11/08',
        result: 'W 45-17',
        outcome: 'win',
        opponent: 'Dadeville',
        stats: { C: 21, ATT: 29, YDS: 355, PCT: '.724', AVG: 16.9, TD: 4, INT: 1, LNG: 60 },
      },
      {
        date: '11/15',
        result: 'W 30-24',
        outcome: 'win',
        opponent: 'Glenwood',
        stats: { C: 18, ATT: 26, YDS: 282, PCT: '.692', AVG: 15.7, TD: 2, INT: 1, LNG: 40 },
      },
      {
        date: '11/22',
        result: 'L 17-31',
        outcome: 'loss',
        opponent: 'BA',
        stats: { C: 14, ATT: 30, YDS: 220, PCT: '.467', AVG: 15.7, TD: 1, INT: 3, LNG: 28 },
      },
    ],
    totals: [
      {
        label: 'Season Totals',
        stats: { C: 213, ATT: 339, YDS: '3,883', PCT: '.628', AVG: 17.1, TD: 38, INT: 16, LNG: 62 },
      },
      {
        label: 'Per Game Avg',
        stats: {
          C: 16.4,
          ATT: 26.1,
          YDS: 298.7,
          PCT: '.628',
          AVG: 17.1,
          TD: 2.9,
          INT: 1.2,
          LNG: '-',
        },
      },
    ],
  },
  {
    season: '2025',
    category: 'Passing',
    teamType: 'club',
    seasonRecord: '8-2',
    verified: true,
    verifiedBy: 'MaxPreps',
    columns: [
      { key: 'C', label: 'C', tooltip: 'Completions', format: 'number' },
      { key: 'ATT', label: 'Att', tooltip: 'Attempts', format: 'number' },
      { key: 'YDS', label: 'Yds', tooltip: 'Passing Yards', format: 'number' },
      { key: 'PCT', label: 'C%', tooltip: 'Completion Percentage', format: 'pct' },
      { key: 'AVG', label: 'Avg', tooltip: 'Yards per Attempt', format: 'number' },
      { key: 'TD', label: 'TD', tooltip: 'Touchdowns', format: 'number', higherIsBetter: true },
      {
        key: 'INT',
        label: 'Int',
        tooltip: 'Interceptions',
        format: 'number',
        higherIsBetter: false,
      },
      { key: 'LNG', label: 'Lng', tooltip: 'Longest Pass', format: 'number' },
    ],
    games: [
      {
        date: '06/07',
        result: 'W 28-14',
        outcome: 'win',
        opponent: 'South Elite',
        stats: { C: 18, ATT: 24, YDS: 265, PCT: '.750', AVG: 14.7, TD: 3, INT: 0, LNG: 48 },
      },
      {
        date: '06/14',
        result: 'W 35-21',
        outcome: 'win',
        opponent: 'Gulf Coast 7v7',
        stats: { C: 22, ATT: 30, YDS: 312, PCT: '.733', AVG: 14.2, TD: 4, INT: 1, LNG: 55 },
      },
      {
        date: '06/21',
        result: 'L 17-24',
        outcome: 'loss',
        opponent: 'ATL Reign',
        stats: { C: 14, ATT: 28, YDS: 198, PCT: '.500', AVG: 14.1, TD: 1, INT: 2, LNG: 34 },
      },
      {
        date: '06/28',
        result: 'W 42-7',
        outcome: 'win',
        opponent: 'Bama Elite',
        stats: { C: 20, ATT: 25, YDS: 340, PCT: '.800', AVG: 17.0, TD: 5, INT: 0, LNG: 62 },
      },
      {
        date: '07/05',
        result: 'W 31-14',
        outcome: 'win',
        opponent: 'Florida Fire',
        stats: { C: 16, ATT: 22, YDS: 245, PCT: '.727', AVG: 15.3, TD: 3, INT: 1, LNG: 44 },
      },
      {
        date: '07/12',
        result: 'W 28-21',
        outcome: 'win',
        opponent: 'MS Stallions',
        stats: { C: 19, ATT: 27, YDS: 278, PCT: '.704', AVG: 14.6, TD: 2, INT: 1, LNG: 40 },
      },
      {
        date: '07/19',
        result: 'L 14-28',
        outcome: 'loss',
        opponent: 'TX Showcase',
        stats: { C: 12, ATT: 26, YDS: 175, PCT: '.462', AVG: 13.5, TD: 1, INT: 3, LNG: 32 },
      },
      {
        date: '07/26',
        result: 'W 38-10',
        outcome: 'win',
        opponent: 'Carolina QBs',
        stats: { C: 21, ATT: 28, YDS: 325, PCT: '.750', AVG: 15.5, TD: 4, INT: 0, LNG: 58 },
      },
      {
        date: '08/02',
        result: 'W 24-17',
        outcome: 'win',
        opponent: 'VA Elite',
        stats: { C: 17, ATT: 25, YDS: 248, PCT: '.680', AVG: 14.6, TD: 2, INT: 1, LNG: 41 },
      },
      {
        date: '08/09',
        result: 'W 31-14',
        outcome: 'win',
        opponent: 'National Select',
        stats: { C: 23, ATT: 29, YDS: 356, PCT: '.793', AVG: 15.5, TD: 4, INT: 0, LNG: 52 },
      },
    ],
    totals: [
      {
        label: 'Season Totals',
        stats: { C: 182, ATT: 264, YDS: 2742, PCT: '.689', AVG: 15.0, TD: 29, INT: 9, LNG: 62 },
      },
      {
        label: 'Per Game Avg',
        stats: {
          C: 18.2,
          ATT: 26.4,
          YDS: 274.2,
          PCT: '.689',
          AVG: 15.0,
          TD: 2.9,
          INT: 0.9,
          LNG: '-',
        },
      },
    ],
  },
];

// ============================================
// MOCK PINNED VIDEO
// ============================================

export const MOCK_PINNED_VIDEO: ProfilePinnedVideo = {
  id: 'vid-001',
  name: 'Junior Season Highlights 2024',
  previewImage: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=800&h=450&fit=crop',
  videoUrl: 'https://example.com/video/highlights-2024',
  duration: 245,
  viewCount: 12450,
};

// ============================================
// MOCK POSTS
// ============================================

export const MOCK_POSTS: ProfilePost[] = [
  {
    id: 'post-001',
    type: 'video',
    title: 'Game-winning touchdown pass! 🏈🔥',
    body: 'Incredible final drive against Central High. 47 yards in 32 seconds. This team never gives up!',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1508098682722-e99c643e0edc?w=400&h=300&fit=crop',
    mediaUrl: 'https://example.com/video/game-winner',
    likeCount: 847,
    commentCount: 156,
    shareCount: 89,
    viewCount: 15600,
    duration: 45,
    isLiked: false,
    isPinned: true,
    createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-002',
    type: 'offer',
    title: 'Blessed to receive an offer from Texas State! 🙏',
    body: 'Extremely grateful for this opportunity. Thank you Coach Williams for believing in me. Hard work pays off! #GoJackets',
    thumbnailUrl: 'https://i.pravatar.cc/200?img=70',
    likeCount: 1234,
    commentCount: 287,
    shareCount: 156,
    isLiked: true,
    isPinned: false,
    createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-003',
    type: 'image',
    title: 'Camp MVP at Elite 11 Regional! 💪',
    body: 'Competed against the best quarterbacks in the state. Earned MVP honors. The grind never stops.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=400&h=300&fit=crop',
    mediaUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=1200',
    likeCount: 567,
    commentCount: 98,
    shareCount: 45,
    isLiked: false,
    isPinned: false,
    createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-004',
    type: 'video',
    title: 'Spring Practice Film - Route Running',
    body: 'Working on my footwork and release. Getting better every day.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&h=300&fit=crop',
    mediaUrl: 'https://example.com/video/spring-practice',
    likeCount: 234,
    commentCount: 45,
    shareCount: 23,
    viewCount: 4500,
    duration: 120,
    isLiked: false,
    isPinned: false,
    createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-005',
    type: 'text',
    title: 'Grateful for my team',
    body: "None of this would be possible without my teammates, coaches, and family. We're building something special at Riverside. Championship mindset every single day. Let's get it! 🏆",
    likeCount: 456,
    commentCount: 78,
    shareCount: 34,
    isLiked: true,
    isPinned: false,
    createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-006',
    type: 'highlight',
    title: 'Full Junior Season Highlights',
    body: '2024 Season: 2,847 passing yards, 28 TDs, 68.5% completion rate. Ready for senior year!',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=400&h=300&fit=crop',
    mediaUrl: 'https://example.com/video/junior-highlights',
    likeCount: 2156,
    commentCount: 456,
    shareCount: 234,
    viewCount: 45600,
    duration: 245,
    isLiked: true,
    isPinned: true,
    createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-007',
    type: 'video',
    title: 'Workout Wednesday 💪',
    body: 'Putting in the work in the weight room. Speed, strength, and agility training.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop',
    mediaUrl: 'https://example.com/video/workout',
    likeCount: 178,
    commentCount: 34,
    shareCount: 12,
    viewCount: 2300,
    duration: 60,
    isLiked: false,
    isPinned: false,
    createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-008',
    type: 'stat',
    title: 'Week 8 Stats Update',
    body: '21/28 passing, 312 yards, 4 TDs, 0 INTs. Team W 42-14! 🔥',
    likeCount: 389,
    commentCount: 67,
    shareCount: 45,
    isLiked: false,
    isPinned: false,
    createdAt: new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ============================================
// MOCK OFFERS
// ============================================

export const MOCK_OFFERS: ProfileOffer[] = [
  {
    id: 'offer-001',
    type: 'scholarship',
    collegeName: 'Texas State University',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=70',
    graphicUrl: 'https://picsum.photos/seed/txstate/600/300',
    division: 'FBS',
    conference: 'Sun Belt',
    sport: 'Football',
    coachName: 'Coach Williams',
    offeredAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
  },
  {
    id: 'offer-002',
    type: 'scholarship',
    collegeName: 'UTSA',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=71',
    division: 'FBS',
    conference: 'American',
    sport: 'Football',
    coachName: 'Coach Thompson',
    offeredAt: new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
  },
  {
    id: 'offer-003',
    type: 'scholarship',
    collegeName: 'Texas Tech University',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=72',
    graphicUrl: 'https://picsum.photos/seed/texastech/600/300',
    division: 'FBS',
    conference: 'Big 12',
    sport: 'Football',
    coachName: 'Coach Davis',
    offeredAt: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
  },
  {
    id: 'offer-004',
    type: 'scholarship',
    collegeName: 'University of Texas',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=73',
    division: 'FBS',
    conference: 'SEC',
    sport: 'Football',
    coachName: 'Coach Martinez',
    offeredAt: new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
    notes: 'Official Visit - June 15-17',
  },
  {
    id: 'offer-005',
    type: 'preferred_walk_on',
    collegeName: 'Baylor University',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=74',
    division: 'FBS',
    conference: 'Big 12',
    sport: 'Football',
    coachName: 'Coach Anderson',
    offeredAt: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
  },
  {
    id: 'offer-006',
    type: 'scholarship',
    collegeName: 'TCU',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=75',
    division: 'FBS',
    conference: 'Big 12',
    sport: 'Football',
    coachName: 'Coach Brown',
    offeredAt: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
    notes: 'Official Visit - March 8-10',
  },
  {
    id: 'offer-007',
    type: 'interest',
    collegeName: 'Oklahoma State',
    collegeLogoUrl: 'https://i.pravatar.cc/100?img=76',
    division: 'FBS',
    conference: 'Big 12',
    sport: 'Football',
    coachName: 'Coach Wilson',
    offeredAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
    isCommitted: false,
  },
];

// ============================================
// MOCK EVENTS
// ============================================

export const MOCK_EVENTS: ProfileEvent[] = [
  {
    id: 'event-001',
    type: 'visit',
    name: 'TCU Official Visit',
    description: 'Official campus visit and meeting with coaching staff',
    location: 'Fort Worth, TX',
    startDate: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(now + 16 * 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: true,
    url: 'https://tcu.edu/football',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2628.png',
    graphicUrl: 'https://images.unsplash.com/photo-1562774053-701939374585?w=600&h=300&fit=crop',
  },
  {
    id: 'event-002',
    type: 'visit',
    name: 'Alabama Unofficial Visit',
    description: 'Unofficial campus tour and meeting with position coach',
    location: 'Tuscaloosa, AL',
    startDate: new Date(now + 21 * 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: true,
    url: 'https://rolltide.com/football',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/333.png',
  },
  {
    id: 'event-003',
    type: 'camp',
    name: 'Elite 11 Regional',
    description: 'Elite 11 quarterback competition regional finals',
    location: 'Dallas, TX',
    startDate: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: true,
  },
  {
    id: 'event-004',
    type: 'combine',
    name: 'Texas Showcase Combine',
    description: '40-yard dash, vertical jump, agility drills, position drills',
    location: 'Houston, TX',
    startDate: new Date(now + 45 * 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: true,
  },
  {
    id: 'event-005',
    type: 'showcase',
    name: 'Under Armour All-America Camp',
    description: 'Invitation-only showcase for top prospects',
    location: 'Atlanta, GA',
    startDate: new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(now + 92 * 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: true,
  },
  {
    id: 'event-006',
    type: 'camp',
    name: 'Nike Football Camp',
    description: 'Position-specific training with college coaches',
    location: 'Austin, TX',
    startDate: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: true,
  },
];

// ============================================
// MOCK PLAYER CARD DATA (Agent X / Madden-style)
// ============================================

export const MOCK_PLAYER_CARD: PlayerCardData = {
  prospectGrade: {
    overall: 80,
    tier: 'blue-chip',
    starRating: 4,
    confidence: 87,
    generatedAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  archetypes: [
    { name: 'Arm Strength', rating: 82, icon: 'flash' },
    { name: 'Accuracy', rating: 79, icon: 'locate' },
    { name: 'Athleticism', rating: 76, icon: 'fitness' },
    { name: 'Football IQ', rating: 84, icon: 'bulb' },
  ],
  trait: {
    name: 'Field General',
    category: 'hidden',
    description: 'Continue developing to unlock full potential as a leader on the field',
    icon: 'diamond',
    progressCurrent: 192,
    progressTotal: 500,
  },
  agentXSummary:
    'Elite pocket passer with advanced pre-snap reads and above-average arm talent. Projects as a Power 5 starter with continued development.',
};

// ============================================
// MOCK METRICS (Combine/Measurables)
// ============================================

export const MOCK_METRICS: AthleticStatsCategory[] = [
  {
    name: 'Combine Results',
    measuredAt: '2026-01-15T00:00:00Z',
    source: 'PrepSports Regional Combine',
    stats: [
      { label: '40 YARD', value: '4.52', unit: 's', verified: true },
      { label: 'BENCH', value: '225', unit: 'lbs', verified: true },
      { label: 'VERTICAL', value: '34', unit: 'in', verified: true },
      { label: 'BROAD', value: '118', unit: 'in', verified: true },
      { label: 'SHUTTLE', value: '4.12', unit: 's', verified: true },
      { label: '3-CONE', value: '6.95', unit: 's', verified: true },
    ],
  },
  {
    name: 'Measurables',
    measuredAt: '2026-02-03T00:00:00Z',
    source: 'School Physical',
    stats: [
      { label: 'HEIGHT', value: '6\'2"', verified: true },
      { label: 'WEIGHT', value: '215', unit: 'lbs', verified: true },
      { label: 'WINGSPAN', value: '76', unit: 'in', verified: true },
      { label: 'HAND', value: '9.5', unit: 'in', verified: true },
      { label: 'ARM', value: '32', unit: 'in', verified: true },
    ],
  },
];

// ============================================
// COMBINED MOCK PAGE DATA
// ============================================

export const MOCK_PROFILE_PAGE_DATA: ProfilePageData = {
  user: MOCK_PROFILE_USER,
  followStats: MOCK_FOLLOW_STATS,
  quickStats: MOCK_QUICK_STATS,
  athleticStats: MOCK_ATHLETIC_STATS,
  gameLog: MOCK_GAME_LOG,
  metrics: MOCK_METRICS,
  pinnedVideo: MOCK_PINNED_VIDEO,
  recentPosts: MOCK_POSTS,
  offers: MOCK_OFFERS,
  events: MOCK_EVENTS,
  isOwnProfile: false,
  canEdit: false,
  playerCard: MOCK_PLAYER_CARD,
};

/**
 * Get mock data for own profile view (editable).
 */
export function getMockOwnProfileData(): ProfilePageData {
  return {
    ...MOCK_PROFILE_PAGE_DATA,
    isOwnProfile: true,
    canEdit: true,
  };
}

/**
 * Get mock data with different user for variety.
 */
export function getMockOtherProfileData(): ProfilePageData {
  return {
    ...MOCK_PROFILE_PAGE_DATA,
    user: {
      ...MOCK_PROFILE_USER,
      uid: 'user-002',
      profileCode: 'sarah-williams-2025',
      firstName: 'Sarah',
      lastName: 'Williams',
      profileImg: 'https://i.pravatar.cc/300?img=47',
      bannerImg: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&h=400&fit=crop',
      primarySport: {
        name: 'Basketball',
        icon: 'basketball',
        position: 'Point Guard',
        jerseyNumber: '23',
      },
      classYear: '2025',
      height: '5\'9"',
      weight: '145',
      aboutMe:
        'Team captain and two-time All-District selection. Averaging 18.5 PPG this season. Committed to excellence on and off the court. 🏀',
    },
    followStats: {
      ...MOCK_FOLLOW_STATS,
      followersCount: 1523,
      isFollowing: true,
    },
    isOwnProfile: false,
    canEdit: false,
  };
}

// ============================================
// EMPTY PROFILE DATA (for testing empty states)
// ============================================

export const MOCK_EMPTY_PROFILE_DATA: ProfilePageData = {
  user: {
    ...MOCK_PROFILE_USER,
    uid: 'user-new',
    aboutMe: undefined,
    bannerImg: undefined,
  },
  followStats: {
    followersCount: 0,
    followingCount: 0,
    isFollowing: false,
    isFollowedBy: false,
  },
  quickStats: {
    profileViews: 0,
    videoViews: 0,
    totalPosts: 0,
    highlightCount: 0,
    offerCount: 0,
    eventCount: 0,
    collegeInterestCount: 0,
    shareCount: 0,
  },
  athleticStats: [],
  pinnedVideo: undefined,
  recentPosts: [],
  offers: [],
  events: [],
  isOwnProfile: true,
  canEdit: true,
};
