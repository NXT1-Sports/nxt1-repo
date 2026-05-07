/**
 * updateRoleUiOverrides.ts
 * Updates roleUiOverrides (commands + scheduledActions) for all 6 coordinators
 * across all 3 roles (director, coach, athlete) in staging Firestore.
 *
 * Run: cd backend && npx tsx --tsconfig tsconfig.scripts.json scripts/updateRoleUiOverrides.ts
 */

import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';

// MUST load dotenv before any firebase imports
// Using dynamic import ensures firebase-staging reads env vars AFTER dotenv runs
// (ESM static imports are hoisted before any code executes, so loadDotenv() would be too late)
loadDotenv({ path: resolve(process.cwd(), '.env') });

const { stagingDb } = await import('../src/utils/firebase-staging.js');

// ---------------------------------------------------------------------------
// Prompt text generators
// ---------------------------------------------------------------------------

function quickPrompt(label: string, subLabel: string, coordName: string): string {
  return `Please handle ${label} with the ${coordName}. ${subLabel}. Give me the clearest deliverable, priorities, and next steps to act on immediately.`;
}

function schedPrompt(label: string, subLabel: string, coordName: string): string {
  return `Please handle ${label} with the ${coordName} and frame it as a recurring workflow for me. ${subLabel}. Give me the execution plan, timing, checkpoints, and follow-up actions I should run with.`;
}

interface CommandEntry {
  id: string;
  label: string;
  subLabel: string;
  icon: string;
  promptText: string;
  executionPrompt: null;
}

function cmd(
  id: string,
  label: string,
  subLabel: string,
  icon: string,
  coordName: string
): CommandEntry {
  return {
    id,
    label,
    subLabel,
    icon,
    promptText: quickPrompt(label, subLabel, coordName),
    executionPrompt: null,
  };
}

function sched(
  id: string,
  label: string,
  subLabel: string,
  icon: string,
  coordName: string
): CommandEntry {
  return {
    id,
    label,
    subLabel,
    icon,
    promptText: schedPrompt(label, subLabel, coordName),
    executionPrompt: null,
  };
}

// ---------------------------------------------------------------------------
// Role UI overrides data — all 6 coordinators × 3 roles
// ---------------------------------------------------------------------------

const ROLE_OVERRIDES: Record<
  string,
  Record<string, { commands: CommandEntry[]; scheduledActions: CommandEntry[] }>
> = {
  // =========================================================================
  // ADMIN COORDINATOR
  // =========================================================================
  admin: {
    director: {
      commands: [
        cmd(
          'admin-calendar-builder',
          'Department Calendar Builder',
          'Create and manage key dates across all sports',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-eligibility-tracker',
          'Eligibility Requirements Tracker',
          'Track athlete compliance and eligibility',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-reports-hub',
          'Program Reports Hub',
          'View all teams in clean, shareable reports',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-recruiting-schedule',
          'Recruiting Period Schedule',
          'Map key recruiting windows',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-profile-report',
          'Athlete Profile Report',
          'View all athlete profiles in one place',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-ops-standardizer',
          'Operations Standardizer',
          'Align workflows across programs',
          'clipboard-list',
          'Admin Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'admin-calendar-sync',
          'Weekly Calendar Sync',
          'Update schedules and key dates',
          'clipboard-list',
          'Admin Coordinator'
        ),
        sched(
          'admin-eligibility-chk',
          'Eligibility Status Check',
          'Track athlete compliance weekly',
          'clipboard-list',
          'Admin Coordinator'
        ),
        sched(
          'admin-report-refresh',
          'Program Report Refresh',
          'Update team and roster reports',
          'clipboard-list',
          'Admin Coordinator'
        ),
        sched(
          'admin-ops-audit',
          'Operations Audit',
          'Ensure all teams stay organized',
          'clipboard-list',
          'Admin Coordinator'
        ),
      ],
    },
    coach: {
      commands: [
        cmd(
          'admin-recruit-night-sheet',
          'Recruit Night Sheet Builder',
          'Organize player data into a recruit night sheet include QR codes',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-roster-organizer',
          'Roster Organizer',
          'Clean player data',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-depth-chart',
          'Depth Chart Creator',
          'Build a depth chart for my team',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-player-profile-gen',
          'Player Profile Generator',
          'Give me a list & pdf of which athletes are missing key profile info',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-season-schedule',
          'Season Schedule Planner',
          'Create a season schedule with key dates',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-team-checklist',
          'Team Checklist Manager',
          'Build a checklist for managing my team this season',
          'clipboard-list',
          'Admin Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'admin-roster-update',
          'Weekly Roster Update',
          'Keep player info current',
          'clipboard-list',
          'Admin Coordinator'
        ),
        sched(
          'admin-recruit-sheet-update',
          'Weekly Recruit Sheet Update',
          'Refresh player sheets',
          'clipboard-list',
          'Admin Coordinator'
        ),
        sched(
          'admin-schedule-sync',
          'Weekly Schedule Sync',
          'Update team calendar',
          'clipboard-list',
          'Admin Coordinator'
        ),
        sched(
          'admin-team-checklist-wk',
          'Weekly Team Checklist',
          'Track task completion',
          'clipboard-list',
          'Admin Coordinator'
        ),
      ],
    },
    athlete: {
      commands: [
        cmd(
          'admin-season-checklist',
          'Season Checklist Builder',
          'Create a checklist of what I need to do this season',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-weekly-schedule',
          'Weekly Schedule Planner',
          'Build my weekly schedule for school, training, and games',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-profile-builder',
          'Athlete Profile Builder',
          'What should I have in my NXT1 profile',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-eligibility-track',
          'Eligibility Tracker',
          'Track everything I need to stay eligible',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-org-plan',
          'Organization Plan',
          'Create a simple plan to stay organized',
          'clipboard-list',
          'Admin Coordinator'
        ),
        cmd(
          'admin-season-progress',
          'Season Progress Tracker',
          'Track your season',
          'clipboard-list',
          'Admin Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'admin-schedule-update',
          'Weekly Schedule Update',
          'Keep plan current',
          'clipboard-list',
          'Admin Coordinator'
        ),
        sched(
          'admin-eligibility-wk',
          'Weekly Eligibility Check',
          'Stay on track',
          'clipboard-list',
          'Admin Coordinator'
        ),
        sched(
          'admin-profile-update',
          'Weekly Profile Update',
          'Keep info fresh',
          'clipboard-list',
          'Admin Coordinator'
        ),
        sched(
          'admin-task-tracker',
          'Weekly Task Tracker',
          'Stay organized',
          'clipboard-list',
          'Admin Coordinator'
        ),
      ],
    },
  },

  // =========================================================================
  // BRAND COORDINATOR
  // =========================================================================
  brand: {
    director: {
      commands: [
        cmd(
          'brand-overview-graphic',
          'Program Overview Graphic',
          'Create a recruiting-ready program graphic',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-top-highlight',
          'Top Athlete Highlight Video',
          'Showcase your best athletes',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-athlete-promo',
          'Athlete Promo Graphics',
          'Create graphics for top performers',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-dept-content-plan',
          'Department Content Plan',
          'Build a promotion strategy',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-exposure-campaign',
          'Exposure Campaign Builder',
          'Launch a visibility campaign',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-content-ideas',
          'Program Content Ideas',
          'Give me 10 content ideas to promote our programs',
          'sparkles',
          'Brand Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'brand-weekly-graphics',
          'Weekly Athlete Graphics',
          'Create graphics for top performers',
          'sparkles',
          'Brand Coordinator'
        ),
        sched(
          'brand-content-push',
          'Weekly Content Push',
          'Promote programs on social',
          'sparkles',
          'Brand Coordinator'
        ),
        sched(
          'brand-highlight-video',
          'Weekly Highlight Video',
          'Create/update athlete highlights',
          'sparkles',
          'Brand Coordinator'
        ),
        sched(
          'brand-exposure-campaign-wk',
          'Weekly Exposure Campaign',
          'Run program promotion',
          'sparkles',
          'Brand Coordinator'
        ),
      ],
    },
    coach: {
      commands: [
        cmd(
          'brand-athlete-graphic',
          'Athlete Graphic Creator',
          'Create a graphic for a player',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-athlete-highlight',
          'Athlete Highlight Video',
          'Build a highlight video',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-team-highlight',
          'Team Highlight Video',
          'Showcase your team',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-player-spotlight',
          'Player Spotlight Posts',
          'Help me promote my players online',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-player-promo',
          'Player Promotion Tools',
          'Design player spotlight posts',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-team-branding',
          'Team Branding',
          'Develop plan to enhance our team brand',
          'sparkles',
          'Brand Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'brand-player-graphics',
          'Weekly Player Graphics',
          'Promote top performers',
          'sparkles',
          'Brand Coordinator'
        ),
        sched(
          'brand-highlight-videos',
          'Weekly Highlight Videos',
          'Update player highlights',
          'sparkles',
          'Brand Coordinator'
        ),
        sched(
          'brand-spotlight-posts',
          'Weekly Spotlight Posts',
          'Highlight athletes',
          'sparkles',
          'Brand Coordinator'
        ),
        sched(
          'brand-team-content',
          'Weekly Team Content Push',
          'Promote your team',
          'sparkles',
          'Brand Coordinator'
        ),
      ],
    },
    athlete: {
      commands: [
        cmd(
          'brand-highlight-creator',
          'Highlight Video Creator',
          'Build your highlight video',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-graphic-maker',
          'Graphic Maker',
          'Create a graphic',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-bio-writer',
          'Athlete Bio Writer',
          'Write my bio that will stand out to coaches',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-posting-plan',
          'Weekly Posting Plan',
          'Plan content for the week',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-caption-gen',
          'Highlight Caption Generator',
          'Write captions',
          'sparkles',
          'Brand Coordinator'
        ),
        cmd(
          'brand-content-ideas',
          'Content Idea Generator',
          'Give me content ideas to grow my exposure',
          'sparkles',
          'Brand Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'brand-weekly-graphics',
          'Weekly Graphics',
          'Post performance graphics',
          'sparkles',
          'Brand Coordinator'
        ),
        sched(
          'brand-weekly-content',
          'Weekly Content Plan',
          'Stay consistent',
          'sparkles',
          'Brand Coordinator'
        ),
        sched(
          'brand-highlight-update',
          'Weekly Highlight Update',
          'Add new clips',
          'sparkles',
          'Brand Coordinator'
        ),
        sched(
          'brand-brand-growth',
          'Weekly Brand Growth',
          'Increase exposure',
          'sparkles',
          'Brand Coordinator'
        ),
      ],
    },
  },

  // =========================================================================
  // STRATEGY COORDINATOR
  // =========================================================================
  strategy: {
    director: {
      commands: [
        cmd(
          'strategy-performance-plan',
          'Program Performance Plan',
          'Improve overall team performance',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-play-style-trends',
          'Play Style Trends Analysis',
          'Analyze team tendencies',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-benchmark-review',
          'Competitive Benchmark Review',
          "What are successful programs doing that we're not",
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-competitiveness-check',
          'Program Competitiveness Check',
          'Evaluate how competitive our teams are overall',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-dev-system',
          'Development System Builder',
          'Improve athlete development',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-improvement-plan',
          'Strategic Improvement Plan',
          'Set program priorities',
          'lightbulb',
          'Strategy Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'strategy-performance-review',
          'Weekly Performance Review',
          'Track program progress',
          'lightbulb',
          'Strategy Coordinator'
        ),
        sched(
          'strategy-trend-analysis',
          'Weekly Trend Analysis',
          'Monitor team tendencies',
          'lightbulb',
          'Strategy Coordinator'
        ),
        sched(
          'strategy-adjustments',
          'Weekly Strategy Adjustments',
          'Refine development plans',
          'lightbulb',
          'Strategy Coordinator'
        ),
        sched(
          'strategy-competitiveness-weekly',
          'Weekly Competitiveness Check',
          'Track improvement vs others',
          'lightbulb',
          'Strategy Coordinator'
        ),
      ],
    },
    coach: {
      commands: [
        cmd(
          'strategy-game-breakdown',
          'Game Breakdown Report',
          'Watch film & Break down our last game and key takeaways',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-opponent-scout',
          'Opponent Scouting Report',
          'Watch film & Break down next opponent',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-game-plan',
          'Game Plan Builder',
          'Watch film. Give me a game plan for this matchup',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-weakness-analysis',
          'Team Weakness Analysis',
          'Watch film. What are our biggest weaknesses as a team?',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-system-adjustment',
          'System Adjustment Plan',
          'Suggest adjustments for our offense/defense',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-player-positioning',
          'Player Positioning Strategy',
          'How can I put my players in better positions to succeed',
          'lightbulb',
          'Strategy Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'strategy-game-review',
          'Weekly Game Review',
          'Analyze performance',
          'lightbulb',
          'Strategy Coordinator'
        ),
        sched(
          'strategy-opponent-weekly',
          'Weekly Opponent Scout',
          'Prepare for next game',
          'lightbulb',
          'Strategy Coordinator'
        ),
        sched(
          'strategy-update',
          'Weekly Strategy Update',
          'Adjust game plan',
          'lightbulb',
          'Strategy Coordinator'
        ),
        sched(
          'strategy-weakness-check',
          'Weekly Weakness Check',
          'Track improvements',
          'lightbulb',
          'Strategy Coordinator'
        ),
      ],
    },
    athlete: {
      commands: [
        cmd(
          'strategy-film-breakdown',
          'Film Breakdown Report',
          'Break down my film & Analyze performance',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-weakness-finder',
          'Weakness Finder',
          'Breakdown film & Identify what to improve',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-position-improvement',
          'Position Improvement Plan',
          'Get better at your role',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-weekly-focus',
          'Weekly Focus Plan',
          'What should I focus on this week',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-player-type',
          'Player Type Analysis',
          'Understand your play style',
          'lightbulb',
          'Strategy Coordinator'
        ),
        cmd(
          'strategy-game-iq',
          'Game IQ Builder',
          'Improve decision making',
          'lightbulb',
          'Strategy Coordinator'
        ),
      ],
      // Athlete has NO scheduled strategy actions
      scheduledActions: [],
    },
  },

  // =========================================================================
  // RECRUITING COORDINATOR
  // =========================================================================
  recruiting: {
    director: {
      commands: [
        cmd(
          'recruiting-performance-report',
          'Recruiting Performance Report',
          'Show me how our programs are performing in recruiting',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-exposure-gap',
          'Exposure Gap Finder',
          'Identify which sports need more recruiting attention',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-dept-plan',
          'Department Recruiting Plan',
          'Improve recruiting systems',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-strategy-audit',
          'Recruiting Strategy Audit',
          'Identify gaps',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-athlete-exposure',
          'Athlete Exposure Booster',
          'Plan How we increase college exposure for our athletes',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-coach-framework',
          'Coach Outreach Framework',
          'Build a recruiting outreach framework for our coach',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'recruiting-weekly-report',
          'Weekly Recruiting Report',
          'Track engagement across teams',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        sched(
          'recruiting-exposure-alerts',
          'Weekly Exposure Alerts',
          'Highlight athletes needing visibility',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        sched(
          'recruiting-outreach-opt',
          'Weekly Outreach Optimization',
          'Improve recruiting strategy',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        sched(
          'recruiting-weekly-audit',
          'Weekly Recruiting Audit',
          'Track progress and gaps',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
      ],
    },
    coach: {
      commands: [
        cmd(
          'recruiting-email-campaign',
          'Recruiting Email Campaign',
          'Send emails to coaches',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-coach-email-gen',
          'Coach Email Generator',
          'Create emails I can send for my athletes',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-player-exposure',
          'Player Exposure Boost',
          'Help me get my players in front of college coaches',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-athlete-plan',
          'Top Athlete Recruiting Plan',
          'Build a recruiting plan for my top athletes',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-college-match',
          'College match',
          'Match my juniors & seniors to colleges that fit their profile',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-social-dms',
          "Social media DM's",
          'Provide a list of clickable social media accounts for college coaches in our area',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'recruiting-email-campaigns',
          'Weekly Email Campaigns',
          'Send athlete emails',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        sched(
          'recruiting-engagement-tracking',
          'Weekly Engagement Tracking',
          'Monitor coach responses',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        sched(
          'recruiting-followups',
          'Weekly Follow-Ups',
          'Continue outreach',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        sched(
          'recruiting-weekly-update',
          'Weekly Recruiting Update',
          'Track progress',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
      ],
    },
    athlete: {
      commands: [
        cmd(
          'recruiting-email-campaign',
          'Email Campaign to Coaches',
          'Send emails to coaches include my NXT1 profile link',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-college-match',
          'College Match Finder',
          'Find matching schools that fit me',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-coach-email',
          'Coach Email Writer',
          'Write an email to a college coach for me',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-coach-social',
          'Coach social links',
          'Provide social media links to college coaches in my area & Create a DM',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-plan-builder',
          'Recruiting Plan Builder',
          'Build strategy to get offers',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        cmd(
          'recruiting-feedback-report',
          'Recruiting Feedback Report',
          'What am I missing',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'recruiting-email-campaigns',
          'Weekly Email Campaigns',
          'Send outreach',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        sched(
          'recruiting-match-updates',
          'Weekly Match Updates',
          'Add new schools',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        sched(
          'recruiting-followups',
          'Weekly Follow-Ups',
          'Stay consistent',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
        sched(
          'recruiting-weekly-check',
          'Weekly Recruiting Check',
          'Track progress',
          'paper-airplane',
          'Recruiting Coordinator'
        ),
      ],
    },
  },

  // =========================================================================
  // PERFORMANCE COORDINATOR
  // =========================================================================
  performance: {
    director: {
      commands: [
        cmd(
          'perf-training-framework',
          'Training Framework Builder',
          'Create a standard training framework for all teams',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-gap-analysis',
          'Athlete Gap Analysis',
          'Identify physical weaknesses',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-benchmarks',
          'Performance Benchmarks',
          'Set standards by sport',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-dev-plan',
          'Development System Plan',
          'Build a strength and conditioning guideline for programs',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-offseason',
          'Offseason Program Builder',
          'Plan offseason training',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-standards-guide',
          'Performance Standards Guide',
          'Recommend performance benchmarks by sport',
          'bolt',
          'Performance Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'perf-weekly-review',
          'Weekly Performance Review',
          'Track athlete development',
          'bolt',
          'Performance Coordinator'
        ),
        sched(
          'perf-gap-weekly',
          'Weekly Gap Analysis',
          'Identify weaknesses',
          'bolt',
          'Performance Coordinator'
        ),
        sched(
          'perf-training-adj',
          'Weekly Training Adjustments',
          'Update programs',
          'bolt',
          'Performance Coordinator'
        ),
        sched(
          'perf-benchmark-tracking',
          'Weekly Benchmark Tracking',
          'Monitor progress',
          'bolt',
          'Performance Coordinator'
        ),
      ],
    },
    coach: {
      commands: [
        cmd(
          'perf-weekly-plan',
          'Weekly Training Plan',
          'Create a weekly training plan for my team',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-drill-planner',
          'Drill Focus Planner',
          'Set weekly drills for each position',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-conditioning',
          'Conditioning Plan',
          'Design plan to Improve athlete endurance',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-lifting-plan',
          'Team lifting plan',
          'Design a lifting plan & schedule to improve team strength',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-practice-dev',
          'Practice Development Plan',
          'Build a practice plan focused on development',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-offseason-plan',
          'Offseason Training Plan',
          'Plan long-term off season plan for overall improvement',
          'bolt',
          'Performance Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'perf-training-update',
          'Weekly Training Update',
          'Adjust workouts',
          'bolt',
          'Performance Coordinator'
        ),
        sched(
          'perf-conditioning-check',
          'Weekly Conditioning Check',
          'Track fitness',
          'bolt',
          'Performance Coordinator'
        ),
        sched(
          'perf-weekly-review',
          'Weekly Performance Review',
          'Monitor progress',
          'bolt',
          'Performance Coordinator'
        ),
        sched(
          'perf-practice-plan',
          'Weekly Practice Plan',
          'Update focus',
          'bolt',
          'Performance Coordinator'
        ),
      ],
    },
    athlete: {
      commands: [
        cmd(
          'perf-workout-plan',
          'Workout Plan Builder',
          'Create training plan for my position',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-drill-plan',
          'Daily Drill Plan',
          'Plan drills I should I do every day for my position suggest videos',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-speed-strength',
          'Speed & Strength Builder',
          'Improve athleticism & suggest videos',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-tracker',
          'Performance Tracker',
          'Track my performance and progress',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-conditioning',
          'Conditioning Plan',
          'Build a plan to improve endurance',
          'bolt',
          'Performance Coordinator'
        ),
        cmd(
          'perf-trainer-finder',
          'Trainer Finder',
          'Find personal coaches or trainers in my area for my position',
          'bolt',
          'Performance Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'perf-workout-update',
          'Weekly Workout Update',
          'Adjust training',
          'bolt',
          'Performance Coordinator'
        ),
        sched(
          'perf-track',
          'Weekly Performance Track',
          'Monitor progress',
          'bolt',
          'Performance Coordinator'
        ),
        sched(
          'perf-conditioning-check',
          'Weekly Conditioning Check',
          'Track endurance',
          'bolt',
          'Performance Coordinator'
        ),
        sched(
          'perf-weekly-plan',
          'Weekly Training Plan',
          'Stay consistent',
          'bolt',
          'Performance Coordinator'
        ),
      ],
    },
  },

  // =========================================================================
  // DATA COORDINATOR
  // =========================================================================
  data: {
    director: {
      commands: [
        cmd(
          'data-engagement-report',
          'Department Engagement Report',
          'Give me a full report on athlete engagement across the app',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-top-program',
          'Top Program Performance',
          'Which of our teams are performing best in recruiting metrics',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-opportunity-track',
          'Opportunity Loss Tracker',
          'Find missed exposure',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-trend-analysis',
          'Athlete Trend Analysis',
          'Track engagement trends',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-comparison-tool',
          'Program Comparison Tool',
          'Compare our programs to similar schools',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-dashboard',
          'Department Dashboard',
          'View full performance summary',
          'chart-bar',
          'Data Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'data-weekly-engagement',
          'Weekly Engagement Report',
          'Track athlete visibility',
          'chart-bar',
          'Data Coordinator'
        ),
        sched(
          'data-weekly-rankings',
          'Weekly Performance Rankings',
          'Rank teams by engagement',
          'chart-bar',
          'Data Coordinator'
        ),
        sched(
          'data-opportunity-alerts',
          'Weekly Opportunity Alerts',
          'Find missed chances',
          'chart-bar',
          'Data Coordinator'
        ),
        sched(
          'data-weekly-summary',
          'Weekly Data Summary',
          'Quick department overview',
          'chart-bar',
          'Data Coordinator'
        ),
      ],
    },
    coach: {
      commands: [
        cmd(
          'data-player-engagement',
          'Player Engagement Tracker',
          "Show me engagement on my players' profiles",
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-top-attention',
          'Top Attention Players',
          'Find most viewed',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-player-progress',
          'Player Progress Tracker',
          'Track how my athletes are improving',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-team-insights',
          'Team Performance Insights',
          "See what's working",
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-roster-analytics',
          'Roster Analytics Report',
          'Analyze team',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-player-comparison',
          'Player Comparison Tool',
          'How do my players compare to others',
          'chart-bar',
          'Data Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'data-engagement-report',
          'Weekly Engagement Report',
          'Track exposure',
          'chart-bar',
          'Data Coordinator'
        ),
        sched(
          'data-player-rankings',
          'Weekly Player Rankings',
          'Top performers',
          'chart-bar',
          'Data Coordinator'
        ),
        sched(
          'data-progress-report',
          'Weekly Progress Report',
          'Track growth',
          'chart-bar',
          'Data Coordinator'
        ),
        sched(
          'data-weekly-insights',
          'Weekly Data Insights',
          'Summarize team',
          'chart-bar',
          'Data Coordinator'
        ),
      ],
    },
    athlete: {
      commands: [
        cmd(
          'data-profile-views',
          'Profile View Tracker',
          'See coaches who viewed you',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-highlight-engagement',
          'Highlight Engagement Check',
          'Track video performance',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-improvement-insights',
          'Improvement Insights',
          'What should I improve based on my data to get recruited',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-comparison-tool',
          'Athlete Comparison Tool',
          'How do I compare to other High school athletes?',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-performance-breakdown',
          'Performance Breakdown',
          'Analyze results',
          'chart-bar',
          'Data Coordinator'
        ),
        cmd(
          'data-engagement-fix',
          'Engagement Fix Finder',
          'Improve visibility',
          'chart-bar',
          'Data Coordinator'
        ),
      ],
      scheduledActions: [
        sched(
          'data-view-report',
          'Weekly View Report',
          'Track exposure',
          'chart-bar',
          'Data Coordinator'
        ),
        sched(
          'data-engagement-report',
          'Weekly Engagement Report',
          'Monitor activity',
          'chart-bar',
          'Data Coordinator'
        ),
        sched(
          'data-comparison-update',
          'Weekly Comparison Update',
          'See progress',
          'chart-bar',
          'Data Coordinator'
        ),
        sched(
          'data-improvement-plan',
          'Weekly Improvement Plan',
          'Adjust strategy',
          'chart-bar',
          'Data Coordinator'
        ),
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// Main update logic
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  console.log('Fetching AppConfig/agentConfig from staging Firestore...');
  const docRef = stagingDb.collection('AppConfig').doc('agentConfig');
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new Error('AppConfig/agentConfig document not found in staging Firestore!');
  }

  const data = snap.data()!;
  const coordinators: any[] = data['coordinators'] ?? [];

  console.log(`Found ${coordinators.length} coordinators.`);

  const updatedCoordinators = coordinators.map((coordinator: any) => {
    const coordId: string = coordinator.id ?? coordinator.coordinatorId;
    const newOverrides = ROLE_OVERRIDES[coordId.replace('_coordinator', '')];

    if (!newOverrides) {
      console.log(`  [SKIP] No override data for coordinator: ${coordId}`);
      return coordinator;
    }

    console.log(`  [UPDATE] Coordinator: ${coordId}`);
    const existingRoleUiOverrides: Record<string, any> = coordinator.roleUiOverrides ?? {};
    const updatedRoleUiOverrides: Record<string, any> = { ...existingRoleUiOverrides };

    for (const [role, roleData] of Object.entries(newOverrides)) {
      console.log(
        `    Role: ${role} — ${roleData.commands.length} commands, ${roleData.scheduledActions.length} scheduled actions`
      );
      updatedRoleUiOverrides[role] = {
        // Keep existing fields (e.g. description) if present
        ...(existingRoleUiOverrides[role] ?? {}),
        commands: roleData.commands,
        scheduledActions: roleData.scheduledActions,
      };
    }

    return { ...coordinator, roleUiOverrides: updatedRoleUiOverrides };
  });

  console.log('\nWriting updated coordinators back to Firestore...');
  await docRef.update({ coordinators: updatedCoordinators });
  console.log('✅ Done! All roleUiOverrides updated successfully.');
}

run().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
