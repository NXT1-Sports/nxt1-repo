/**
 * @fileoverview Mock Missions Data for Development
 * @module @nxt1/ui/missions/mock-data
 *
 * ⚠️ TEMPORARY FILE - Delete when backend is ready
 *
 * Contains realistic mock data for Missions feature during development phase.
 * All data here is fabricated for UI testing purposes only.
 *
 * Includes:
 * - Athlete missions across all categories
 * - Coach missions across all categories
 * - User progress data
 * - Badge data
 */

import type {
  Mission,
  MissionProgress,
  MissionCategoryConfig,
  MissionUserRole,
  MissionCategory,
  EarnedBadge,
  Streak,
} from '@nxt1/core';
import { ATHLETE_CATEGORIES, COACH_CATEGORIES, MISSION_LEVELS, MISSION_BADGES } from '@nxt1/core';

// ============================================
// HELPER FUNCTIONS
// ============================================

const now = Date.now();

function hoursAgo(hours: number): string {
  return new Date(now - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function daysFromNow(days: number): string {
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

// ============================================
// ATHLETE MISSIONS
// ============================================

/**
 * Profile Building missions for athletes.
 */
const ATHLETE_PROFILE_MISSIONS: Mission[] = [
  {
    id: 'ath-profile-1',
    category: 'profile-building',
    targetRole: 'athlete',
    title: 'Add profile photo & cover image',
    description:
      'Upload a professional headshot and an action shot as your cover image to make a great first impression.',
    hint: 'Action shots from games perform best as cover images',
    status: 'completed',
    priority: 'critical',
    recurrence: 'once',
    icon: 'camera-outline',
    reward: { points: 50, xp: 50 },
    quickAction: { label: 'Upload Photo', route: '/settings/profile', icon: 'camera' },
    estimatedMinutes: 5,
    socialProof: '92% of recruited athletes have profile photos',
    order: 1,
    completedAt: daysAgo(5),
  },
  {
    id: 'ath-profile-2',
    category: 'profile-building',
    targetRole: 'athlete',
    title: 'Complete bio with personal story',
    description:
      'Write a compelling bio that showcases your personality, goals, and what makes you unique as an athlete.',
    hint: 'Include your playing style, leadership qualities, and academic interests',
    status: 'completed',
    priority: 'high',
    recurrence: 'once',
    icon: 'create-outline',
    reward: { points: 40, xp: 40 },
    quickAction: { label: 'Edit Bio', route: '/settings/profile' },
    estimatedMinutes: 15,
    socialProof: '78% of coaches read athlete bios before reaching out',
    order: 2,
    completedAt: daysAgo(4),
  },
  {
    id: 'ath-profile-3',
    category: 'profile-building',
    targetRole: 'athlete',
    title: 'Add primary sport & positions',
    description: 'Select your primary sport and the positions you play to help coaches find you.',
    status: 'completed',
    priority: 'critical',
    recurrence: 'once',
    icon: 'football-outline',
    reward: { points: 30, xp: 30 },
    quickAction: { label: 'Add Sport', route: '/settings/sports' },
    estimatedMinutes: 3,
    order: 3,
    completedAt: daysAgo(6),
  },
  {
    id: 'ath-profile-4',
    category: 'profile-building',
    targetRole: 'athlete',
    title: 'Upload athletic stats',
    description:
      'Add your measurables: height, weight, 40-yard dash, vertical jump, and other relevant stats.',
    hint: 'Update these after each testing period',
    status: 'available',
    priority: 'high',
    recurrence: 'once',
    icon: 'speedometer-outline',
    reward: { points: 45, xp: 45 },
    quickAction: { label: 'Add Stats', route: '/settings/stats' },
    estimatedMinutes: 10,
    socialProof: '85% of college coaches check athletic metrics first',
    order: 4,
    progress: 60,
  },
  {
    id: 'ath-profile-5',
    category: 'profile-building',
    targetRole: 'athlete',
    title: 'Upload 3+ highlight videos',
    description:
      'Share your best plays and game highlights to showcase your skills to college coaches.',
    hint: 'Quality over quantity - show your best 8-10 plays per video',
    status: 'in-progress',
    priority: 'critical',
    recurrence: 'once',
    icon: 'videocam-outline',
    reward: { points: 75, xp: 75, badgeId: 'media-master' },
    quickAction: { label: 'Upload Video', route: '/media/upload' },
    estimatedMinutes: 20,
    socialProof: '95% of recruited athletes have highlight videos',
    order: 5,
    progress: 33,
    featured: true,
  },
  {
    id: 'ath-profile-6',
    category: 'profile-building',
    targetRole: 'athlete',
    title: 'Add academic info',
    description: 'Include your GPA, test scores, graduation year, and intended major.',
    hint: 'Coaches look for student-athletes who excel in the classroom',
    status: 'available',
    priority: 'high',
    recurrence: 'once',
    icon: 'school-outline',
    reward: { points: 40, xp: 40 },
    quickAction: { label: 'Add Academics', route: '/settings/academics' },
    estimatedMinutes: 8,
    socialProof: '88% of D1 athletes meet NCAA academic requirements',
    order: 6,
  },
  {
    id: 'ath-profile-7',
    category: 'profile-building',
    targetRole: 'athlete',
    title: 'List achievements & awards',
    description: 'Add your athletic honors, all-conference selections, and other achievements.',
    status: 'available',
    priority: 'normal',
    recurrence: 'once',
    icon: 'trophy-outline',
    reward: { points: 30, xp: 30 },
    quickAction: { label: 'Add Awards', route: '/settings/achievements' },
    estimatedMinutes: 10,
    order: 7,
  },
  {
    id: 'ath-profile-8',
    category: 'profile-building',
    targetRole: 'athlete',
    title: 'Add coach references',
    description:
      'Include contact information for coaches who can speak to your character and abilities.',
    status: 'available',
    priority: 'normal',
    recurrence: 'once',
    icon: 'people-outline',
    reward: { points: 35, xp: 35 },
    quickAction: { label: 'Add References', route: '/settings/references' },
    estimatedMinutes: 10,
    socialProof: '72% of coaches contact references before offering',
    order: 8,
  },
];

/**
 * Visibility & Engagement missions for athletes.
 */
const ATHLETE_ENGAGEMENT_MISSIONS: Mission[] = [
  {
    id: 'ath-engage-1',
    category: 'visibility-engagement',
    targetRole: 'athlete',
    title: 'Share profile on social media',
    description: 'Share your NXT1 profile link on Twitter, Instagram, or other social platforms.',
    status: 'available',
    priority: 'normal',
    recurrence: 'once',
    icon: 'share-social-outline',
    reward: { points: 25, xp: 25 },
    quickAction: { label: 'Share Profile', route: '/profile/share' },
    estimatedMinutes: 3,
    order: 1,
  },
  {
    id: 'ath-engage-2',
    category: 'visibility-engagement',
    targetRole: 'athlete',
    title: 'Follow 5 college programs',
    description:
      "Start following colleges you're interested in to stay updated on their activities.",
    status: 'in-progress',
    priority: 'high',
    recurrence: 'once',
    icon: 'school-outline',
    reward: { points: 30, xp: 30 },
    quickAction: { label: 'Explore Colleges', route: '/explore/colleges' },
    estimatedMinutes: 5,
    socialProof: 'Athletes who follow programs are 3x more likely to be noticed',
    order: 2,
    progress: 60,
    featured: true,
  },
  {
    id: 'ath-engage-3',
    category: 'visibility-engagement',
    targetRole: 'athlete',
    title: 'Post weekly update',
    description: 'Share a photo or video update about your training, games, or achievements.',
    status: 'available',
    priority: 'normal',
    recurrence: 'weekly',
    icon: 'images-outline',
    reward: { points: 15, xp: 15 },
    quickAction: { label: 'Create Post', route: '/post/create' },
    estimatedMinutes: 5,
    expiresAt: daysFromNow(3),
    order: 3,
  },
  {
    id: 'ath-engage-4',
    category: 'visibility-engagement',
    targetRole: 'athlete',
    title: 'Respond to coach messages within 24h',
    description: "Stay responsive to show coaches you're serious about your recruiting journey.",
    status: 'available',
    priority: 'critical',
    recurrence: 'daily',
    icon: 'mail-outline',
    reward: { points: 20, xp: 20 },
    quickAction: { label: 'Check Inbox', route: '/inbox' },
    estimatedMinutes: 5,
    socialProof: 'Quick responders are 4x more likely to receive offers',
    order: 4,
  },
  {
    id: 'ath-engage-5',
    category: 'visibility-engagement',
    targetRole: 'athlete',
    title: 'Connect with teammates',
    description: 'Add your teammates to build your network and support each other.',
    status: 'available',
    priority: 'low',
    recurrence: 'once',
    icon: 'people-outline',
    reward: { points: 20, xp: 20 },
    quickAction: { label: 'Find Teammates', route: '/explore/athletes' },
    estimatedMinutes: 5,
    order: 5,
  },
  {
    id: 'ath-engage-6',
    category: 'visibility-engagement',
    targetRole: 'athlete',
    title: 'Engage with posts daily',
    description: 'Like and comment on posts from coaches, colleges, and fellow athletes.',
    status: 'available',
    priority: 'low',
    recurrence: 'daily',
    icon: 'heart-outline',
    reward: { points: 10, xp: 10 },
    quickAction: { label: 'View Feed', route: '/home' },
    estimatedMinutes: 3,
    order: 6,
  },
];

/**
 * Recruiting Goals missions for athletes.
 */
const ATHLETE_RECRUITING_MISSIONS: Mission[] = [
  {
    id: 'ath-recruit-1',
    category: 'recruiting-goals',
    targetRole: 'athlete',
    title: 'Add 5+ target colleges',
    description: "Create your initial target list of schools you'd like to play for.",
    status: 'available',
    priority: 'high',
    recurrence: 'once',
    icon: 'list-outline',
    reward: { points: 35, xp: 35 },
    quickAction: { label: 'Add Targets', route: '/recruiting/targets' },
    estimatedMinutes: 10,
    socialProof: '80% of successful recruits had a target list',
    order: 1,
    featured: true,
  },
  {
    id: 'ath-recruit-2',
    category: 'recruiting-goals',
    targetRole: 'athlete',
    title: 'Update camp availability',
    description: "Let coaches know when you'll be at camps and showcases.",
    status: 'available',
    priority: 'normal',
    recurrence: 'seasonal',
    icon: 'calendar-outline',
    reward: { points: 20, xp: 20 },
    quickAction: { label: 'Update Availability', route: '/settings/availability' },
    estimatedMinutes: 5,
    order: 2,
  },
  {
    id: 'ath-recruit-3',
    category: 'recruiting-goals',
    targetRole: 'athlete',
    title: 'Complete NCAA eligibility checklist',
    description: 'Ensure you meet all NCAA academic and amateurism requirements.',
    status: 'available',
    priority: 'critical',
    recurrence: 'once',
    icon: 'checkmark-circle-outline',
    reward: { points: 100, xp: 100, badgeId: 'recruit-ready' },
    quickAction: { label: 'View Checklist', route: '/recruiting/eligibility' },
    estimatedMinutes: 30,
    socialProof: 'Required for all NCAA Division I and II athletes',
    order: 3,
  },
  {
    id: 'ath-recruit-4',
    category: 'recruiting-goals',
    targetRole: 'athlete',
    title: 'Submit video to coaches',
    description: 'Send your highlight video directly to at least 5 college coaches.',
    status: 'locked',
    priority: 'high',
    recurrence: 'once',
    icon: 'send-outline',
    reward: { points: 50, xp: 50 },
    quickAction: { label: 'Send Video', route: '/recruiting/outreach' },
    estimatedMinutes: 15,
    order: 4,
    prerequisites: ['ath-profile-5'],
  },
  {
    id: 'ath-recruit-5',
    category: 'recruiting-goals',
    targetRole: 'athlete',
    title: 'Get verified badge',
    description: 'Complete identity verification to earn the trusted verified badge.',
    status: 'available',
    priority: 'normal',
    recurrence: 'once',
    icon: 'shield-checkmark-outline',
    reward: { points: 75, xp: 75, badgeId: 'verified' },
    quickAction: { label: 'Get Verified', route: '/settings/verification' },
    estimatedMinutes: 10,
    socialProof: 'Verified athletes get 2x more coach views',
    order: 5,
  },
  {
    id: 'ath-recruit-6',
    category: 'recruiting-goals',
    targetRole: 'athlete',
    title: 'Schedule campus visit',
    description: 'Set up an official or unofficial visit to a target school.',
    status: 'available',
    priority: 'high',
    recurrence: 'once',
    icon: 'location-outline',
    reward: { points: 60, xp: 60 },
    quickAction: { label: 'Plan Visit', route: '/recruiting/visits' },
    estimatedMinutes: 20,
    order: 6,
  },
];

/**
 * Seasonal Tasks missions for athletes.
 */
const ATHLETE_SEASONAL_MISSIONS: Mission[] = [
  {
    id: 'ath-season-1',
    category: 'seasonal-tasks',
    targetRole: 'athlete',
    title: 'Update stats after season',
    description: 'Add your latest season statistics and personal bests.',
    status: 'available',
    priority: 'high',
    recurrence: 'seasonal',
    icon: 'stats-chart-outline',
    reward: { points: 40, xp: 40, badgeId: 'stat-tracker' },
    quickAction: { label: 'Update Stats', route: '/settings/stats' },
    estimatedMinutes: 15,
    expiresAt: daysFromNow(14),
    order: 1,
    featured: true,
  },
  {
    id: 'ath-season-2',
    category: 'seasonal-tasks',
    targetRole: 'athlete',
    title: 'Add new highlight after big game',
    description: 'Upload a fresh highlight clip from your recent standout performance.',
    status: 'available',
    priority: 'normal',
    recurrence: 'event',
    icon: 'film-outline',
    reward: { points: 25, xp: 25 },
    quickAction: { label: 'Upload Highlight', route: '/media/upload' },
    estimatedMinutes: 10,
    order: 2,
  },
  {
    id: 'ath-season-3',
    category: 'seasonal-tasks',
    targetRole: 'athlete',
    title: 'Respond to college interest',
    description: 'Follow up with any coaches who have reached out recently.',
    status: 'available',
    priority: 'critical',
    recurrence: 'event',
    icon: 'chatbubbles-outline',
    reward: { points: 30, xp: 30 },
    quickAction: { label: 'View Interest', route: '/recruiting/interest' },
    estimatedMinutes: 15,
    order: 3,
  },
  {
    id: 'ath-season-4',
    category: 'seasonal-tasks',
    targetRole: 'athlete',
    title: 'Register for showcases',
    description: 'Sign up for upcoming camps and showcases in your area.',
    status: 'available',
    priority: 'normal',
    recurrence: 'seasonal',
    icon: 'ticket-outline',
    reward: { points: 25, xp: 25 },
    quickAction: { label: 'Find Events', route: '/events' },
    estimatedMinutes: 10,
    order: 4,
  },
];

// ============================================
// COACH MISSIONS
// ============================================

/**
 * Team Setup missions for coaches.
 */
const COACH_TEAM_SETUP_MISSIONS: Mission[] = [
  {
    id: 'coach-team-1',
    category: 'team-setup',
    targetRole: 'coach',
    title: 'Complete team profile & logo',
    description: 'Add your team name, colors, and upload your official logo.',
    status: 'completed',
    priority: 'critical',
    recurrence: 'once',
    icon: 'shield-outline',
    reward: { points: 50, xp: 50 },
    quickAction: { label: 'Edit Team', route: '/team/settings' },
    estimatedMinutes: 10,
    order: 1,
    completedAt: daysAgo(10),
  },
  {
    id: 'coach-team-2',
    category: 'team-setup',
    targetRole: 'coach',
    title: 'Add assistant coaches/staff',
    description: 'Invite your coaching staff to help manage the team.',
    status: 'available',
    priority: 'normal',
    recurrence: 'once',
    icon: 'people-outline',
    reward: { points: 30, xp: 30 },
    quickAction: { label: 'Invite Staff', route: '/team/staff' },
    estimatedMinutes: 10,
    order: 2,
  },
  {
    id: 'coach-team-3',
    category: 'team-setup',
    targetRole: 'coach',
    title: 'Upload team schedule & roster',
    description: 'Add your current season schedule and complete roster.',
    status: 'in-progress',
    priority: 'high',
    recurrence: 'seasonal',
    icon: 'calendar-outline',
    reward: { points: 45, xp: 45 },
    quickAction: { label: 'Add Schedule', route: '/team/schedule' },
    estimatedMinutes: 20,
    order: 3,
    progress: 50,
    featured: true,
  },
  {
    id: 'coach-team-4',
    category: 'team-setup',
    targetRole: 'coach',
    title: 'List team achievements',
    description: "Showcase your program's championships, titles, and honors.",
    status: 'available',
    priority: 'normal',
    recurrence: 'once',
    icon: 'trophy-outline',
    reward: { points: 35, xp: 35 },
    quickAction: { label: 'Add Achievements', route: '/team/achievements' },
    estimatedMinutes: 15,
    order: 4,
  },
  {
    id: 'coach-team-5',
    category: 'team-setup',
    targetRole: 'coach',
    title: 'Add team contact info',
    description: 'Make it easy for college coaches to reach your program.',
    status: 'completed',
    priority: 'high',
    recurrence: 'once',
    icon: 'call-outline',
    reward: { points: 25, xp: 25 },
    quickAction: { label: 'Update Contact', route: '/team/contact' },
    estimatedMinutes: 5,
    order: 5,
    completedAt: daysAgo(9),
  },
  {
    id: 'coach-team-6',
    category: 'team-setup',
    targetRole: 'coach',
    title: 'Upload team highlight reel',
    description: "Create a showcase video of your team's best moments.",
    status: 'available',
    priority: 'normal',
    recurrence: 'seasonal',
    icon: 'film-outline',
    reward: { points: 50, xp: 50, badgeId: 'team-builder' },
    quickAction: { label: 'Upload Video', route: '/team/media' },
    estimatedMinutes: 30,
    order: 6,
  },
];

/**
 * Supporting Athletes missions for coaches.
 */
const COACH_SUPPORTING_MISSIONS: Mission[] = [
  {
    id: 'coach-support-1',
    category: 'supporting-athletes',
    targetRole: 'coach',
    title: 'Add 5+ athletes to roster',
    description: 'Invite your players to join your team on NXT1.',
    status: 'in-progress',
    priority: 'critical',
    recurrence: 'once',
    icon: 'person-add-outline',
    reward: { points: 50, xp: 50 },
    quickAction: { label: 'Add Athletes', route: '/team/roster' },
    estimatedMinutes: 15,
    socialProof: 'Teams with complete rosters get 5x more visibility',
    order: 1,
    progress: 80,
    featured: true,
  },
  {
    id: 'coach-support-2',
    category: 'supporting-athletes',
    targetRole: 'coach',
    title: 'Review athlete profiles',
    description: 'Help your athletes improve their profiles with feedback.',
    status: 'available',
    priority: 'high',
    recurrence: 'weekly',
    icon: 'eye-outline',
    reward: { points: 25, xp: 25 },
    quickAction: { label: 'Review Profiles', route: '/team/athletes' },
    estimatedMinutes: 20,
    order: 2,
  },
  {
    id: 'coach-support-3',
    category: 'supporting-athletes',
    targetRole: 'coach',
    title: 'Write recommendation letters',
    description: 'Provide official recommendations for your top recruits.',
    status: 'available',
    priority: 'high',
    recurrence: 'once',
    icon: 'document-text-outline',
    reward: { points: 75, xp: 75, badgeId: 'mentor' },
    quickAction: { label: 'Write Letter', route: '/team/recommendations' },
    estimatedMinutes: 30,
    socialProof: 'Coach recommendations increase offer rates by 40%',
    order: 3,
  },
  {
    id: 'coach-support-4',
    category: 'supporting-athletes',
    targetRole: 'coach',
    title: 'Help athletes set goals',
    description: 'Work with athletes to establish their recruiting targets.',
    status: 'available',
    priority: 'normal',
    recurrence: 'seasonal',
    icon: 'flag-outline',
    reward: { points: 30, xp: 30 },
    quickAction: { label: 'Set Goals', route: '/team/athletes/goals' },
    estimatedMinutes: 20,
    order: 4,
  },
  {
    id: 'coach-support-5',
    category: 'supporting-athletes',
    targetRole: 'coach',
    title: 'Share recruiting best practices',
    description: 'Post tips and advice to help your athletes navigate recruiting.',
    status: 'available',
    priority: 'low',
    recurrence: 'weekly',
    icon: 'bulb-outline',
    reward: { points: 15, xp: 15 },
    quickAction: { label: 'Share Tips', route: '/post/create' },
    estimatedMinutes: 10,
    order: 5,
  },
  {
    id: 'coach-support-6',
    category: 'supporting-athletes',
    targetRole: 'coach',
    title: 'Connect athletes with colleges',
    description: 'Facilitate introductions between your players and college coaches.',
    status: 'available',
    priority: 'high',
    recurrence: 'once',
    icon: 'git-network-outline',
    reward: { points: 60, xp: 60, badgeId: 'athlete-advocate' },
    quickAction: { label: 'Make Connections', route: '/recruiting/connections' },
    estimatedMinutes: 25,
    order: 6,
  },
];

/**
 * Team Content missions for coaches.
 */
const COACH_CONTENT_MISSIONS: Mission[] = [
  {
    id: 'coach-content-1',
    category: 'team-content',
    targetRole: 'coach',
    title: 'Post team update weekly',
    description: 'Share news, results, and updates about your program.',
    status: 'available',
    priority: 'normal',
    recurrence: 'weekly',
    icon: 'newspaper-outline',
    reward: { points: 15, xp: 15 },
    quickAction: { label: 'Post Update', route: '/post/create' },
    estimatedMinutes: 10,
    expiresAt: daysFromNow(4),
    order: 1,
  },
  {
    id: 'coach-content-2',
    category: 'team-content',
    targetRole: 'coach',
    title: 'Share athlete spotlight',
    description: "Highlight an athlete's achievements or recruiting success.",
    status: 'available',
    priority: 'normal',
    recurrence: 'weekly',
    icon: 'star-outline',
    reward: { points: 20, xp: 20 },
    quickAction: { label: 'Create Spotlight', route: '/post/create?type=spotlight' },
    estimatedMinutes: 15,
    order: 2,
    featured: true,
  },
  {
    id: 'coach-content-3',
    category: 'team-content',
    targetRole: 'coach',
    title: 'Upload game highlights',
    description: 'Share video highlights from recent games.',
    status: 'available',
    priority: 'normal',
    recurrence: 'weekly',
    icon: 'videocam-outline',
    reward: { points: 25, xp: 25 },
    quickAction: { label: 'Upload Video', route: '/team/media' },
    estimatedMinutes: 15,
    order: 3,
  },
  {
    id: 'coach-content-4',
    category: 'team-content',
    targetRole: 'coach',
    title: 'Post team achievements',
    description: 'Celebrate wins, championships, and milestones.',
    status: 'available',
    priority: 'low',
    recurrence: 'event',
    icon: 'trophy-outline',
    reward: { points: 20, xp: 20 },
    quickAction: { label: 'Share Achievement', route: '/post/create?type=achievement' },
    estimatedMinutes: 10,
    order: 4,
  },
  {
    id: 'coach-content-5',
    category: 'team-content',
    targetRole: 'coach',
    title: 'Share training tips',
    description: 'Post practice drills or training advice for your athletes.',
    status: 'available',
    priority: 'low',
    recurrence: 'weekly',
    icon: 'fitness-outline',
    reward: { points: 15, xp: 15 },
    quickAction: { label: 'Share Tip', route: '/post/create' },
    estimatedMinutes: 10,
    order: 5,
  },
  {
    id: 'coach-content-6',
    category: 'team-content',
    targetRole: 'coach',
    title: 'Update schedule & results',
    description: "Keep your team's schedule and game results current.",
    status: 'available',
    priority: 'normal',
    recurrence: 'weekly',
    icon: 'calendar-outline',
    reward: { points: 15, xp: 15 },
    quickAction: { label: 'Update Schedule', route: '/team/schedule' },
    estimatedMinutes: 5,
    order: 6,
  },
];

/**
 * Recruiting Support missions for coaches.
 */
const COACH_RECRUITING_MISSIONS: Mission[] = [
  {
    id: 'coach-recruit-1',
    category: 'recruiting-support',
    targetRole: 'coach',
    title: 'Respond to college inquiries',
    description: 'Answer college coach questions within 48 hours.',
    status: 'available',
    priority: 'critical',
    recurrence: 'daily',
    icon: 'mail-outline',
    reward: { points: 30, xp: 30 },
    quickAction: { label: 'Check Inbox', route: '/inbox' },
    estimatedMinutes: 15,
    socialProof: 'Quick responses lead to 60% more athlete opportunities',
    order: 1,
  },
  {
    id: 'coach-recruit-2',
    category: 'recruiting-support',
    targetRole: 'coach',
    title: 'Schedule college coach visits',
    description: 'Coordinate visits from college coaches to your program.',
    status: 'available',
    priority: 'high',
    recurrence: 'seasonal',
    icon: 'calendar-outline',
    reward: { points: 40, xp: 40 },
    quickAction: { label: 'Schedule Visit', route: '/team/visits' },
    estimatedMinutes: 20,
    order: 2,
  },
  {
    id: 'coach-recruit-3',
    category: 'recruiting-support',
    targetRole: 'coach',
    title: 'Organize showcase participation',
    description: 'Help athletes register for and prepare for showcases.',
    status: 'available',
    priority: 'normal',
    recurrence: 'seasonal',
    icon: 'people-circle-outline',
    reward: { points: 35, xp: 35 },
    quickAction: { label: 'Plan Showcases', route: '/events' },
    estimatedMinutes: 30,
    order: 3,
  },
  {
    id: 'coach-recruit-4',
    category: 'recruiting-support',
    targetRole: 'coach',
    title: 'Track athlete progress',
    description: 'Monitor and update recruiting status for each athlete.',
    status: 'available',
    priority: 'normal',
    recurrence: 'weekly',
    icon: 'analytics-outline',
    reward: { points: 20, xp: 20 },
    quickAction: { label: 'View Progress', route: '/team/recruiting' },
    estimatedMinutes: 15,
    order: 4,
  },
  {
    id: 'coach-recruit-5',
    category: 'recruiting-support',
    targetRole: 'coach',
    title: 'Send athlete updates',
    description: 'Share athlete achievements and updates with interested colleges.',
    status: 'available',
    priority: 'high',
    recurrence: 'weekly',
    icon: 'send-outline',
    reward: { points: 25, xp: 25 },
    quickAction: { label: 'Send Updates', route: '/team/outreach' },
    estimatedMinutes: 20,
    order: 5,
  },
  {
    id: 'coach-recruit-6',
    category: 'recruiting-support',
    targetRole: 'coach',
    title: 'Coordinate campus visits',
    description: 'Help athletes plan and prepare for campus visits.',
    status: 'available',
    priority: 'normal',
    recurrence: 'event',
    icon: 'map-outline',
    reward: { points: 30, xp: 30 },
    quickAction: { label: 'Plan Visits', route: '/team/visits' },
    estimatedMinutes: 25,
    order: 6,
  },
];

/**
 * Professional Development missions for coaches.
 */
const COACH_DEVELOPMENT_MISSIONS: Mission[] = [
  {
    id: 'coach-dev-1',
    category: 'professional-development',
    targetRole: 'coach',
    title: 'Complete NXT1 coach certification',
    description: 'Get certified as an NXT1 recruiting coach.',
    status: 'available',
    priority: 'high',
    recurrence: 'once',
    icon: 'ribbon-outline',
    reward: { points: 150, xp: 150, badgeId: 'certified-coach' },
    quickAction: { label: 'Get Certified', route: '/coach/certification' },
    estimatedMinutes: 60,
    socialProof: 'Certified coaches have 3x more successful placements',
    order: 1,
    featured: true,
  },
  {
    id: 'coach-dev-2',
    category: 'professional-development',
    targetRole: 'coach',
    title: 'Attend recruiting webinar',
    description: 'Join an educational session on recruiting best practices.',
    status: 'available',
    priority: 'normal',
    recurrence: 'once',
    icon: 'desktop-outline',
    reward: { points: 40, xp: 40 },
    quickAction: { label: 'View Webinars', route: '/education/webinars' },
    estimatedMinutes: 45,
    order: 2,
  },
  {
    id: 'coach-dev-3',
    category: 'professional-development',
    targetRole: 'coach',
    title: 'Update coaching credentials',
    description: 'Keep your certifications and qualifications current.',
    status: 'available',
    priority: 'normal',
    recurrence: 'once',
    icon: 'document-outline',
    reward: { points: 25, xp: 25 },
    quickAction: { label: 'Update Credentials', route: '/settings/credentials' },
    estimatedMinutes: 15,
    order: 3,
  },
  {
    id: 'coach-dev-4',
    category: 'professional-development',
    targetRole: 'coach',
    title: 'Share resources with athletes',
    description: 'Provide recruiting resources and guides to your players.',
    status: 'available',
    priority: 'low',
    recurrence: 'weekly',
    icon: 'book-outline',
    reward: { points: 15, xp: 15 },
    quickAction: { label: 'Share Resources', route: '/team/resources' },
    estimatedMinutes: 10,
    order: 4,
  },
  {
    id: 'coach-dev-5',
    category: 'professional-development',
    targetRole: 'coach',
    title: 'Network with other coaches',
    description: 'Connect with fellow coaches to share insights and opportunities.',
    status: 'available',
    priority: 'low',
    recurrence: 'once',
    icon: 'people-outline',
    reward: { points: 20, xp: 20 },
    quickAction: { label: 'Find Coaches', route: '/explore/coaches' },
    estimatedMinutes: 15,
    order: 5,
  },
];

// ============================================
// COMBINED DATA
// ============================================

/**
 * All athlete missions.
 */
export const MOCK_ATHLETE_MISSIONS: Mission[] = [
  ...ATHLETE_PROFILE_MISSIONS,
  ...ATHLETE_ENGAGEMENT_MISSIONS,
  ...ATHLETE_RECRUITING_MISSIONS,
  ...ATHLETE_SEASONAL_MISSIONS,
];

/**
 * All coach missions.
 */
export const MOCK_COACH_MISSIONS: Mission[] = [
  ...COACH_TEAM_SETUP_MISSIONS,
  ...COACH_SUPPORTING_MISSIONS,
  ...COACH_CONTENT_MISSIONS,
  ...COACH_RECRUITING_MISSIONS,
  ...COACH_DEVELOPMENT_MISSIONS,
];

// ============================================
// MOCK PROGRESS DATA
// ============================================

/**
 * Mock athlete streak.
 */
const MOCK_ATHLETE_STREAK: Streak = {
  current: 5,
  longest: 12,
  lastActivityAt: hoursAgo(18),
  status: 'active',
  expiresInHours: 6,
  bonusMultiplier: 1.0,
};

/**
 * Mock athlete earned badges.
 */
const MOCK_ATHLETE_BADGES: EarnedBadge[] = [
  {
    ...MISSION_BADGES['first-completion'],
    earnedAt: daysAgo(6),
    isNew: false,
  },
  {
    ...MISSION_BADGES['streak-starter'],
    earnedAt: daysAgo(2),
    isNew: true,
  },
];

/**
 * Mock athlete progress data.
 */
export const MOCK_ATHLETE_PROGRESS: MissionProgress = {
  userId: 'athlete-001',
  role: 'athlete',
  totalPoints: 245,
  currentXp: 245,
  xpToNextLevel: 255,
  level: MISSION_LEVELS[0], // Rookie
  completionPercentage: 28,
  profileStrength: 65,
  missionsCompleted: 7,
  totalMissions: 25,
  streak: MOCK_ATHLETE_STREAK,
  badges: MOCK_ATHLETE_BADGES,
  categoryProgress: {
    'profile-building': {
      category: 'profile-building',
      completed: 3,
      total: 8,
      percentage: 38,
      pointsEarned: 120,
    },
    'visibility-engagement': {
      category: 'visibility-engagement',
      completed: 1,
      total: 6,
      percentage: 17,
      pointsEarned: 25,
    },
    'recruiting-goals': {
      category: 'recruiting-goals',
      completed: 2,
      total: 6,
      percentage: 33,
      pointsEarned: 75,
    },
    'seasonal-tasks': {
      category: 'seasonal-tasks',
      completed: 1,
      total: 4,
      percentage: 25,
      pointsEarned: 25,
    },
    // Coach categories (empty for athletes)
    'team-setup': {
      category: 'team-setup',
      completed: 0,
      total: 0,
      percentage: 0,
      pointsEarned: 0,
    },
    'supporting-athletes': {
      category: 'supporting-athletes',
      completed: 0,
      total: 0,
      percentage: 0,
      pointsEarned: 0,
    },
    'team-content': {
      category: 'team-content',
      completed: 0,
      total: 0,
      percentage: 0,
      pointsEarned: 0,
    },
    'recruiting-support': {
      category: 'recruiting-support',
      completed: 0,
      total: 0,
      percentage: 0,
      pointsEarned: 0,
    },
    'professional-development': {
      category: 'professional-development',
      completed: 0,
      total: 0,
      percentage: 0,
      pointsEarned: 0,
    },
  },
};

/**
 * Mock coach streak.
 */
const MOCK_COACH_STREAK: Streak = {
  current: 14,
  longest: 14,
  lastActivityAt: hoursAgo(3),
  status: 'active',
  expiresInHours: 21,
  bonusMultiplier: 1.25,
};

/**
 * Mock coach earned badges.
 */
const MOCK_COACH_BADGES: EarnedBadge[] = [
  {
    ...MISSION_BADGES['first-completion'],
    earnedAt: daysAgo(14),
    isNew: false,
  },
  {
    ...MISSION_BADGES['streak-starter'],
    earnedAt: daysAgo(7),
    isNew: false,
  },
  {
    ...MISSION_BADGES['streak-champion'],
    earnedAt: daysAgo(0),
    isNew: true,
  },
];

/**
 * Mock coach progress data.
 */
export const MOCK_COACH_PROGRESS: MissionProgress = {
  userId: 'coach-001',
  role: 'coach',
  totalPoints: 780,
  currentXp: 780,
  xpToNextLevel: 720,
  level: MISSION_LEVELS[1], // Rising Star
  completionPercentage: 42,
  profileStrength: 85,
  missionsCompleted: 12,
  totalMissions: 29,
  streak: MOCK_COACH_STREAK,
  badges: MOCK_COACH_BADGES,
  categoryProgress: {
    // Athlete categories (empty for coaches)
    'profile-building': {
      category: 'profile-building',
      completed: 0,
      total: 0,
      percentage: 0,
      pointsEarned: 0,
    },
    'visibility-engagement': {
      category: 'visibility-engagement',
      completed: 0,
      total: 0,
      percentage: 0,
      pointsEarned: 0,
    },
    'recruiting-goals': {
      category: 'recruiting-goals',
      completed: 0,
      total: 0,
      percentage: 0,
      pointsEarned: 0,
    },
    'seasonal-tasks': {
      category: 'seasonal-tasks',
      completed: 0,
      total: 0,
      percentage: 0,
      pointsEarned: 0,
    },
    // Coach categories
    'team-setup': {
      category: 'team-setup',
      completed: 3,
      total: 6,
      percentage: 50,
      pointsEarned: 105,
    },
    'supporting-athletes': {
      category: 'supporting-athletes',
      completed: 2,
      total: 6,
      percentage: 33,
      pointsEarned: 80,
    },
    'team-content': {
      category: 'team-content',
      completed: 3,
      total: 6,
      percentage: 50,
      pointsEarned: 60,
    },
    'recruiting-support': {
      category: 'recruiting-support',
      completed: 2,
      total: 6,
      percentage: 33,
      pointsEarned: 55,
    },
    'professional-development': {
      category: 'professional-development',
      completed: 2,
      total: 5,
      percentage: 40,
      pointsEarned: 65,
    },
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get missions by user role.
 */
export function getMockMissions(role: MissionUserRole): Mission[] {
  return role === 'athlete' ? MOCK_ATHLETE_MISSIONS : MOCK_COACH_MISSIONS;
}

/**
 * Get progress by user role.
 */
export function getMockProgress(role: MissionUserRole): MissionProgress {
  return role === 'athlete' ? MOCK_ATHLETE_PROGRESS : MOCK_COACH_PROGRESS;
}

/**
 * Get categories by user role.
 */
export function getMockCategories(role: MissionUserRole): readonly MissionCategoryConfig[] {
  return role === 'athlete' ? ATHLETE_CATEGORIES : COACH_CATEGORIES;
}

/**
 * Get missions by category.
 */
export function getMockMissionsByCategory(
  role: MissionUserRole,
  category: MissionCategory
): Mission[] {
  const missions = getMockMissions(role);
  return missions.filter((m) => m.category === category);
}

/**
 * Get featured missions.
 */
export function getMockFeaturedMissions(role: MissionUserRole): Mission[] {
  const missions = getMockMissions(role);
  return missions.filter((m) => m.featured && m.status !== 'completed');
}
