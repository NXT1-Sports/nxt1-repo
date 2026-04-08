/**
 * @fileoverview Agent X Constants
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Configuration constants for Agent X AI assistant.
 * 100% portable - no platform dependencies.
 */

import type {
  AgentXConfig,
  AgentXModeConfig,
  AgentXQuickTask,
  AgentXAttachmentType,
  ShellCommandCategory,
  ShellContentForRole,
} from './agent-x.types';
import { isTeamRole, USER_ROLES } from '../constants/user.constants';

// ============================================
// CONFIGURATION
// ============================================

/**
 * Default Agent X configuration.
 */
export const AGENT_X_CONFIG: AgentXConfig = {
  /** Keep last 20 messages for context */
  maxHistoryLength: 20,
  /** 1000 character input limit */
  maxInputLength: 1000,
  /** 30 second timeout */
  timeoutMs: 30_000,
  /** Enable typing dots animation */
  enableTypingAnimation: true,
  /** Rotating welcome titles */
  welcomeTitles: [
    'What can I help with?',
    'Ready to assist you',
    'Ask me anything',
    'Your AI recruiting assistant',
  ],
  /** Rotate title every 4 seconds */
  titleRotationMs: 4000,
} as const;

// ============================================
// MODE CONFIGURATIONS
// ============================================

/**
 * Available Agent X modes with display configuration.
 */
export const AGENT_X_MODES: readonly AgentXModeConfig[] = [
  {
    id: 'highlights',
    label: 'Highlights',
    description: 'AI-powered highlight reel creation and analysis',
  },
  {
    id: 'graphics',
    label: 'Graphics',
    description: 'Generate professional sports graphics',
  },
  {
    id: 'recruiting',
    label: 'Discovery',
    description: 'College matching and recruiting guidance',
  },
  {
    id: 'evaluation',
    label: 'Evaluation',
    description: 'Performance analysis and skill evaluation',
  },
] as const;

/**
 * Default selected mode.
 */
export const AGENT_X_DEFAULT_MODE = 'highlights' as const;

// ============================================
// QUICK TASKS BY CATEGORY
// ============================================

/**
 * Quick tasks for athletes.
 */
export const ATHLETE_QUICK_TASKS: readonly AgentXQuickTask[] = [
  {
    id: 'college-match',
    title: 'Find My Best College Matches',
    description: 'Get personalized college recommendations',
    icon: 'school-outline',
    prompt: 'Help me find college programs that match my athletic profile and academic goals.',
    category: 'athlete',
  },
  {
    id: 'improve-profile',
    title: 'Improve My Profile',
    description: 'Get tips to stand out to recruiters',
    icon: 'person-outline',
    prompt:
      'Analyze my profile and give me specific tips to make it more attractive to college coaches.',
    category: 'athlete',
  },
  {
    id: 'draft-email',
    title: 'Draft Recruiting Email',
    description: 'Create a professional outreach email',
    icon: 'mail-outline',
    prompt: 'Help me write a professional email to introduce myself to college coaches.',
    category: 'athlete',
  },
  {
    id: 'recruiting-timeline',
    title: 'My Recruiting Timeline',
    description: 'Create a personalized action plan',
    icon: 'stats-chart-outline',
    prompt: 'Create a recruiting timeline and action plan based on my graduation year.',
    category: 'athlete',
  },
] as const;

/**
 * Quick tasks for coaches.
 */
export const COACH_QUICK_TASKS: readonly AgentXQuickTask[] = [
  {
    id: 'find-recruits',
    title: 'Find Top Recruits',
    description: 'Discover athletes for your program',
    icon: 'search-outline',
    prompt: 'Help me find top recruits that would be a good fit for my team.',
    category: 'coach',
  },
  {
    id: 'team-analytics',
    title: 'Team Analytics',
    description: 'Analyze your roster and needs',
    icon: 'stats-chart-outline',
    prompt: 'Analyze my team roster and help identify areas where we need to recruit.',
    category: 'coach',
  },
  {
    id: 'recruiting-strategy',
    title: 'Recruiting Strategy',
    description: 'Build an effective recruiting plan',
    icon: 'football-outline',
    prompt: 'Help me develop a comprehensive recruiting strategy for the upcoming season.',
    category: 'coach',
  },
  {
    id: 'prospect-evaluation',
    title: 'Evaluate Prospects',
    description: 'Get AI-powered prospect insights',
    icon: 'people-outline',
    prompt: 'Help me evaluate and compare prospects I am considering for recruitment.',
    category: 'coach',
  },
] as const;

/**
 * Quick tasks for college programs.
 */
export const COLLEGE_QUICK_TASKS: readonly AgentXQuickTask[] = [
  {
    id: 'roster-needs',
    title: 'Roster Analysis',
    description: 'Identify gaps in your roster',
    icon: 'people-outline',
    prompt: 'Analyze our current roster and help identify position needs for next season.',
    category: 'college',
  },
  {
    id: 'transfer-portal',
    title: 'Transfer Portal Search',
    description: 'Find transfer candidates',
    icon: 'search-outline',
    prompt: 'Help me find transfer portal candidates that fit our program needs.',
    category: 'college',
  },
  {
    id: 'scholarship-planning',
    title: 'Scholarship Planning',
    description: 'Optimize scholarship allocation',
    icon: 'school-outline',
    prompt: 'Help me plan our scholarship allocation for the upcoming recruiting class.',
    category: 'college',
  },
  {
    id: 'compliance-check',
    title: 'Compliance Assistant',
    description: 'NCAA compliance guidance',
    icon: 'checkmark-circle-outline',
    prompt: 'Help me understand NCAA recruiting rules and ensure compliance.',
    category: 'college',
  },
] as const;

/**
 * All quick tasks combined.
 */
export const ALL_QUICK_TASKS: readonly AgentXQuickTask[] = [
  ...ATHLETE_QUICK_TASKS,
  ...COACH_QUICK_TASKS,
  ...COLLEGE_QUICK_TASKS,
] as const;

// ============================================
// SHELL CONTENT BY ROLE CATEGORY
// ============================================

/**
 * Shell coordinator categories for ATHLETE-based roles (athlete, parent).
 * Displayed in the 2×2 grid on the Agent X command center.
 */
export const ATHLETE_COORDINATORS: readonly ShellCommandCategory[] = [
  {
    id: 'coord-recruiting',
    label: 'Recruiting Coordinator',
    icon: 'graduationCap',
    description:
      "I'm your Recruiting Coordinator. I help you find the right programs, draft coach outreach, and stay on top of your recruiting timeline.",
    commands: [
      {
        id: 'cmd-colleges',
        label: 'Find Programs',
        subLabel: 'Matched to your GPA & film',
        icon: 'search',
      },
      { id: 'cmd-email', label: 'Draft Coach Email', subLabel: 'Templates ready', icon: 'mail' },
      {
        id: 'cmd-timeline',
        label: 'My Timeline',
        subLabel: 'Next: NCAA Dead Period',
        icon: 'calendar',
      },
      {
        id: 'cmd-eligibility',
        label: 'Eligibility Check',
        subLabel: 'Verify NCAA/NAIA status',
        icon: 'shieldCheck',
      },
      {
        id: 'cmd-target-list',
        label: 'Target List',
        subLabel: 'Prioritize best-fit schools',
        icon: 'list',
      },
      {
        id: 'cmd-compare-schools',
        label: 'Compare Schools',
        subLabel: 'Stack campus, roster, and level',
        icon: 'gitCompare',
      },
      {
        id: 'cmd-camp-plan',
        label: 'Camp Finder',
        subLabel: 'Pick exposure camps worth attending',
        icon: 'search',
      },
      {
        id: 'cmd-follow-up-plan',
        label: 'Follow-Up Plan',
        subLabel: 'Know who to contact next',
        icon: 'mail',
      },
      {
        id: 'cmd-coach-fit',
        label: 'Coach Fit',
        subLabel: 'See which staffs match your game',
        icon: 'people',
      },
      {
        id: 'cmd-email-followups',
        label: 'Email Follow-Ups',
        subLabel: 'Write the next touch fast',
        icon: 'mail',
      },
      {
        id: 'cmd-visit-checklist',
        label: 'Visit Checklist',
        subLabel: 'Prepare questions before campus visits',
        icon: 'clipboard',
      },
      {
        id: 'cmd-roster-opportunity',
        label: 'Roster Opportunity',
        subLabel: 'Spot rooms with early playing time',
        icon: 'analytics',
      },
      {
        id: 'cmd-division-match',
        label: 'Division Match',
        subLabel: 'Find the right level for your profile',
        icon: 'school',
      },
      {
        id: 'cmd-contact-calendar',
        label: 'Contact Calendar',
        subLabel: 'Map outreach around key recruiting dates',
        icon: 'calendar',
      },
      {
        id: 'cmd-showcase-strategy',
        label: 'Showcase Strategy',
        subLabel: 'Choose camps and showcases wisely',
        icon: 'rocket',
      },
      {
        id: 'cmd-recruiting-notes',
        label: 'Recruiting Notes',
        subLabel: 'Keep school-by-school context organized',
        icon: 'document',
      },
    ],
  },
  {
    id: 'coord-media',
    label: 'Media Coordinator',
    icon: 'sparkles',
    description:
      "I'm your Media Coordinator. I can help you create posts, build highlight reels, and develop your brand strategy.",
    commands: [
      { id: 'cmd-post', label: 'Create Post', subLabel: 'Trending: #GameDay', icon: 'plus' },
      {
        id: 'cmd-highlight',
        label: 'Highlight Reel',
        subLabel: 'New clips ready',
        icon: 'videocam',
      },
      {
        id: 'cmd-brand',
        label: 'Brand Strategy',
        subLabel: 'AI-powered growth plan',
        icon: 'rocket',
      },
      {
        id: 'cmd-gameday-graphic',
        label: 'Gameday Graphic',
        subLabel: 'Sharable lineup or stat card',
        icon: 'image',
      },
      {
        id: 'cmd-commitment-edit',
        label: 'Commitment Edit',
        subLabel: 'Polished announcement concept',
        icon: 'sparkles',
      },
      {
        id: 'cmd-caption-pack',
        label: 'Caption Pack',
        subLabel: 'Three angles for your next drop',
        icon: 'document',
      },
      {
        id: 'cmd-profile-audit',
        label: 'Profile Audit',
        subLabel: 'What to sharpen across socials',
        icon: 'analytics',
      },
      {
        id: 'cmd-content-plan',
        label: 'Weekly Content Plan',
        subLabel: 'Map seven days of posts',
        icon: 'calendar',
      },
      {
        id: 'cmd-media-day-shotlist',
        label: 'Media Day Shotlist',
        subLabel: 'Plan the photos and clips you need',
        icon: 'image',
      },
      {
        id: 'cmd-short-form-clips',
        label: 'Short Form Clips',
        subLabel: 'Turn film into quick social cuts',
        icon: 'videocam',
      },
      {
        id: 'cmd-offer-announcement',
        label: 'Offer Announcement',
        subLabel: 'Create a polished commitment or offer post',
        icon: 'sparkles',
      },
      {
        id: 'cmd-photo-selects',
        label: 'Photo Selects',
        subLabel: 'Choose the strongest images to publish',
        icon: 'image',
      },
      {
        id: 'cmd-story-sequence',
        label: 'Story Sequence',
        subLabel: 'Build an IG story flow that feels intentional',
        icon: 'plus',
      },
      {
        id: 'cmd-brand-voice',
        label: 'Brand Voice',
        subLabel: 'Define how you should sound online',
        icon: 'document',
      },
      {
        id: 'cmd-highlight-hook',
        label: 'Highlight Hook',
        subLabel: 'Lead your reel with the right first clip',
        icon: 'play',
      },
      {
        id: 'cmd-post-schedule',
        label: 'Post Schedule',
        subLabel: 'Pick the best days to publish',
        icon: 'calendar',
      },
    ],
  },
  {
    id: 'coord-scout',
    label: 'Scout Coordinator',
    icon: 'barChart',
    description:
      "I'm your Scout Coordinator. I generate scout reports, analyze game film, and track your stat trends over time.",
    commands: [
      { id: 'cmd-scout', label: 'Scout Report', subLabel: 'Updated recently', icon: 'clipboard' },
      { id: 'cmd-analyze', label: 'Analyze Film', subLabel: 'Upload Hudl link', icon: 'play' },
      {
        id: 'cmd-trends',
        label: 'Stat Trends',
        subLabel: 'Week-over-week growth',
        icon: 'trendingUp',
      },
      {
        id: 'cmd-position-benchmark',
        label: 'Position Benchmark',
        subLabel: 'See how you compare to peers',
        icon: 'barChart',
      },
      {
        id: 'cmd-strengths-snapshot',
        label: 'Strengths Snapshot',
        subLabel: 'Top traits recruiters notice',
        icon: 'clipboard',
      },
      {
        id: 'cmd-improvement-plan',
        label: 'Improvement Plan',
        subLabel: 'Focus areas for the next month',
        icon: 'rocket',
      },
      {
        id: 'cmd-opponent-breakdown',
        label: 'Opponent Breakdown',
        subLabel: 'Prep notes from recent film',
        icon: 'play',
      },
      {
        id: 'cmd-season-progress',
        label: 'Season Progress',
        subLabel: 'Track growth across the year',
        icon: 'trendingUp',
      },
      {
        id: 'cmd-metric-breakdown',
        label: 'Metric Breakdown',
        subLabel: 'See which measurables move your grade',
        icon: 'analytics',
      },
      {
        id: 'cmd-film-cutups',
        label: 'Film Cutups',
        subLabel: 'Separate your best reps by trait',
        icon: 'videocam',
      },
      {
        id: 'cmd-trait-ranking',
        label: 'Trait Ranking',
        subLabel: 'Order your strengths from best to worst',
        icon: 'list',
      },
      {
        id: 'cmd-game-grades',
        label: 'Game Grades',
        subLabel: 'Score each performance week by week',
        icon: 'clipboard',
      },
      {
        id: 'cmd-recruiter-summary',
        label: 'Recruiter Summary',
        subLabel: 'Get a concise coach-facing evaluation',
        icon: 'document',
      },
      {
        id: 'cmd-athletic-profile',
        label: 'Athletic Profile',
        subLabel: 'Combine movement, frame, and upside',
        icon: 'barChart',
      },
      {
        id: 'cmd-consistency-report',
        label: 'Consistency Report',
        subLabel: 'See where your game slips or holds',
        icon: 'trendingUp',
      },
      {
        id: 'cmd-next-game-focus',
        label: 'Next Game Focus',
        subLabel: 'Know what to emphasize this week',
        icon: 'rocket',
      },
    ],
  },
  {
    id: 'coord-academics',
    label: 'Academics Coordinator',
    icon: 'book',
    description:
      "I'm your Academics Coordinator. I help you track your GPA, check eligibility requirements, and find test prep resources.",
    commands: [
      {
        id: 'cmd-gpa',
        label: 'GPA Tracker',
        subLabel: 'Keep eligibility current',
        icon: 'clipboard',
      },
      {
        id: 'cmd-eligibility-check',
        label: 'Eligibility',
        subLabel: 'NCAA/NAIA status',
        icon: 'shieldCheck',
      },
      { id: 'cmd-test-prep', label: 'Test Prep', subLabel: 'SAT/ACT resources', icon: 'document' },
      {
        id: 'cmd-course-planner',
        label: 'Course Planner',
        subLabel: 'Map classes to core requirements',
        icon: 'calendar',
      },
      {
        id: 'cmd-transcript-review',
        label: 'Transcript Review',
        subLabel: 'Spot missing credits fast',
        icon: 'clipboard',
      },
      {
        id: 'cmd-core-courses',
        label: 'Core Courses',
        subLabel: 'Verify approved NCAA classes',
        icon: 'book',
      },
      {
        id: 'cmd-study-plan',
        label: 'Study Plan',
        subLabel: 'Weekly schedule for better grades',
        icon: 'analytics',
      },
      {
        id: 'cmd-tutor-finder',
        label: 'Tutor Finder',
        subLabel: 'Get support in weak subjects',
        icon: 'search',
      },
      {
        id: 'cmd-credit-check',
        label: 'Credit Check',
        subLabel: 'See whether you are on pace to graduate',
        icon: 'clipboard',
      },
      {
        id: 'cmd-semester-roadmap',
        label: 'Semester Roadmap',
        subLabel: 'Plan the next term around eligibility',
        icon: 'calendar',
      },
      {
        id: 'cmd-eligibility-deadlines',
        label: 'Eligibility Deadlines',
        subLabel: 'Track registration and submission dates',
        icon: 'shieldCheck',
      },
      {
        id: 'cmd-ap-study-plan',
        label: 'AP Study Plan',
        subLabel: 'Balance hard classes with your season',
        icon: 'book',
      },
      {
        id: 'cmd-testing-calendar',
        label: 'Testing Calendar',
        subLabel: 'Map SAT and ACT prep windows',
        icon: 'calendar',
      },
      {
        id: 'cmd-grade-recovery',
        label: 'Grade Recovery',
        subLabel: 'Build a plan for weak classes now',
        icon: 'analytics',
      },
      {
        id: 'cmd-academic-resume',
        label: 'Academic Resume',
        subLabel: 'Summarize academics for coaches clearly',
        icon: 'document',
      },
      {
        id: 'cmd-advisor-questions',
        label: 'Advisor Questions',
        subLabel: 'Know what to ask your counselor next',
        icon: 'mail',
      },
    ],
  },
];

/**
 * Shell coordinator categories for TEAM-based roles (coach, director).
 * Coach/director users see team management, roster, and scouting tools
 * instead of the athlete-centric recruiting/academics coordinators.
 */
export const TEAM_COORDINATORS: readonly ShellCommandCategory[] = [
  {
    id: 'coord-roster',
    label: 'Roster Manager',
    icon: 'people',
    description:
      "I'm your Roster Manager. I help you manage your roster, identify gaps, and build your depth chart.",
    commands: [
      { id: 'cmd-roster', label: 'View Roster', subLabel: 'Manage team athletes', icon: 'people' },
      {
        id: 'cmd-add-athlete',
        label: 'Add Athlete',
        subLabel: 'Invite or create profile',
        icon: 'personAdd',
      },
      {
        id: 'cmd-roster-gaps',
        label: 'Roster Gaps',
        subLabel: 'AI-identified needs',
        icon: 'analytics',
      },
      { id: 'cmd-depth-chart', label: 'Depth Chart', subLabel: 'Position analysis', icon: 'list' },
      {
        id: 'cmd-graduation-risk',
        label: 'Graduation Risk',
        subLabel: 'See who you may lose soon',
        icon: 'calendar',
      },
      {
        id: 'cmd-position-needs',
        label: 'Position Needs',
        subLabel: 'Shortlist priority recruiting gaps',
        icon: 'search',
      },
      {
        id: 'cmd-lineup-planner',
        label: 'Lineup Planner',
        subLabel: 'Project starters and rotations',
        icon: 'analytics',
      },
      {
        id: 'cmd-player-notes',
        label: 'Player Notes',
        subLabel: 'Capture development notes by athlete',
        icon: 'document',
      },
      {
        id: 'cmd-returners-board',
        label: 'Returners Board',
        subLabel: 'See who anchors next season now',
        icon: 'people',
      },
      {
        id: 'cmd-redshirt-plan',
        label: 'Redshirt Plan',
        subLabel: 'Project who should develop longer',
        icon: 'calendar',
      },
      {
        id: 'cmd-position-battles',
        label: 'Position Battles',
        subLabel: 'Track the tightest competitions on roster',
        icon: 'gitCompare',
      },
      {
        id: 'cmd-leadership-group',
        label: 'Leadership Group',
        subLabel: 'Identify team leaders by role and class',
        icon: 'people',
      },
      {
        id: 'cmd-practice-units',
        label: 'Practice Units',
        subLabel: 'Organize travel, scout, and practice groups',
        icon: 'list',
      },
      {
        id: 'cmd-scholarship-balance',
        label: 'Scholarship Balance',
        subLabel: 'Review roster allocation by position',
        icon: 'school',
      },
      {
        id: 'cmd-roster-summary',
        label: 'Roster Summary',
        subLabel: 'Get a fast snapshot of your whole team',
        icon: 'clipboard',
      },
      {
        id: 'cmd-development-trackers',
        label: 'Development Trackers',
        subLabel: 'Monitor progress plans across the roster',
        icon: 'analytics',
      },
    ],
  },
  {
    id: 'coord-scouting',
    label: 'Scouting Coordinator',
    icon: 'search',
    description:
      "I'm your Scouting Coordinator. I help you discover recruits, manage your prospect board, and generate AI evaluations.",
    commands: [
      {
        id: 'cmd-find-recruits',
        label: 'Find Recruits',
        subLabel: 'Search athlete database',
        icon: 'search',
      },
      {
        id: 'cmd-prospect-board',
        label: 'Prospect Board',
        subLabel: 'Tracked prospects',
        icon: 'clipboard',
      },
      {
        id: 'cmd-evaluate',
        label: 'Evaluate Prospect',
        subLabel: 'AI scout report',
        icon: 'barChart',
      },
      {
        id: 'cmd-watchlist-update',
        label: 'Watchlist Update',
        subLabel: 'Refresh priority prospects',
        icon: 'clipboard',
      },
      {
        id: 'cmd-region-search',
        label: 'Region Search',
        subLabel: 'Scan recruits by market or state',
        icon: 'search',
      },
      {
        id: 'cmd-compare-prospects',
        label: 'Compare Prospects',
        subLabel: 'Rank fit side by side',
        icon: 'gitCompare',
      },
      {
        id: 'cmd-fit-score',
        label: 'Fit Score',
        subLabel: 'Roster need and scheme match',
        icon: 'analytics',
      },
      {
        id: 'cmd-contact-queue',
        label: 'Contact Queue',
        subLabel: 'Who needs outreach this week',
        icon: 'mail',
      },
      {
        id: 'cmd-scouting-board',
        label: 'Scouting Board',
        subLabel: 'Organize every target in one view',
        icon: 'list',
      },
      {
        id: 'cmd-evaluation-queue',
        label: 'Evaluation Queue',
        subLabel: 'See who still needs film or reports',
        icon: 'clipboard',
      },
      {
        id: 'cmd-transfer-watch',
        label: 'Transfer Watch',
        subLabel: 'Track portal names worth early attention',
        icon: 'people',
      },
      {
        id: 'cmd-character-check',
        label: 'Character Check',
        subLabel: 'Capture off-field context before offers',
        icon: 'document',
      },
      {
        id: 'cmd-live-viewing-plan',
        label: 'Live Viewing Plan',
        subLabel: 'Prioritize where coaches should travel',
        icon: 'calendar',
      },
      {
        id: 'cmd-recruit-map',
        label: 'Recruit Map',
        subLabel: 'See target density by region quickly',
        icon: 'search',
      },
      {
        id: 'cmd-offer-readiness',
        label: 'Offer Readiness',
        subLabel: 'Know who is ready for the next step',
        icon: 'analytics',
      },
      {
        id: 'cmd-scheme-fits',
        label: 'Scheme Fits',
        subLabel: 'Match prospects to your systems',
        icon: 'barChart',
      },
    ],
  },
  {
    id: 'coord-team-media',
    label: 'Media Coordinator',
    icon: 'sparkles',
    description:
      "I'm your Media Coordinator. I help you create team posts, generate branded graphics, and compile highlight reels.",
    commands: [
      { id: 'cmd-team-post', label: 'Team Post', subLabel: 'Share team updates', icon: 'plus' },
      {
        id: 'cmd-team-graphics',
        label: 'Team Graphics',
        subLabel: 'Branded visuals',
        icon: 'image',
      },
      {
        id: 'cmd-team-highlight',
        label: 'Team Highlights',
        subLabel: 'Compile reels',
        icon: 'videocam',
      },
      {
        id: 'cmd-schedule-graphic',
        label: 'Schedule Graphic',
        subLabel: 'Weekly slate ready for posting',
        icon: 'calendar',
      },
      {
        id: 'cmd-commitment-post',
        label: 'Commitment Post',
        subLabel: 'Celebrate offers and signings',
        icon: 'sparkles',
      },
      {
        id: 'cmd-gameday-hype',
        label: 'Gameday Hype',
        subLabel: 'Prebuilt story and feed assets',
        icon: 'rocket',
      },
      {
        id: 'cmd-recap-carousel',
        label: 'Recap Carousel',
        subLabel: 'Postgame stats and moments',
        icon: 'image',
      },
      {
        id: 'cmd-season-brand-kit',
        label: 'Season Brand Kit',
        subLabel: 'Keep all visuals on-brand',
        icon: 'document',
      },
      {
        id: 'cmd-recruit-edit-pack',
        label: 'Recruit Edit Pack',
        subLabel: 'Create assets for top targets fast',
        icon: 'sparkles',
      },
      {
        id: 'cmd-player-feature',
        label: 'Player Feature',
        subLabel: 'Spotlight one athlete with polish',
        icon: 'image',
      },
      {
        id: 'cmd-visit-content',
        label: 'Visit Content',
        subLabel: 'Prep assets for recruiting weekends',
        icon: 'videocam',
      },
      {
        id: 'cmd-practice-recap',
        label: 'Practice Recap',
        subLabel: 'Share clean updates from training',
        icon: 'plus',
      },
      {
        id: 'cmd-signed-graphic',
        label: 'Signed Graphic',
        subLabel: 'Celebrate commitments and NLIs',
        icon: 'image',
      },
      {
        id: 'cmd-content-calendar-team',
        label: 'Content Calendar',
        subLabel: 'Plan posts for the next two weeks',
        icon: 'calendar',
      },
      {
        id: 'cmd-photo-day-plan',
        label: 'Photo Day Plan',
        subLabel: 'Map scenes, setups, and priority shots',
        icon: 'camera',
      },
      {
        id: 'cmd-brand-approvals',
        label: 'Brand Approvals',
        subLabel: 'Keep team media aligned with standards',
        icon: 'document',
      },
    ],
  },
  {
    id: 'coord-recruiting',
    label: 'Recruiting Coordinator',
    icon: 'graduationCap',
    description:
      "I'm your Recruiting Coordinator. I help you build recruiting plans, draft outreach, and manage compliance.",
    commands: [
      {
        id: 'cmd-recruiting-plan',
        label: 'Recruiting Plan',
        subLabel: 'Build season strategy',
        icon: 'calendar',
      },
      {
        id: 'cmd-contact-recruits',
        label: 'Contact Recruits',
        subLabel: 'Draft outreach messages',
        icon: 'mail',
      },
      {
        id: 'cmd-target-class',
        label: 'Target Class',
        subLabel: 'Set class targets',
        icon: 'people',
      },
      {
        id: 'cmd-compliance',
        label: 'Compliance Check',
        subLabel: 'NCAA/NAIA contact rules',
        icon: 'shieldCheck',
      },
      {
        id: 'cmd-visit-tracker',
        label: 'Visit Tracker',
        subLabel: 'Monitor unofficial and official visits',
        icon: 'calendar',
      },
      {
        id: 'cmd-offer-board',
        label: 'Offer Board',
        subLabel: 'See where offers stand now',
        icon: 'list',
      },
      {
        id: 'cmd-pipeline-review',
        label: 'Pipeline Review',
        subLabel: 'Sort hot, warm, and cold leads',
        icon: 'funnel',
      },
      {
        id: 'cmd-weekly-priorities',
        label: 'Weekly Priorities',
        subLabel: 'Top recruiting moves for this week',
        icon: 'analytics',
      },
      {
        id: 'cmd-visit-weekend-plan',
        label: 'Visit Weekend Plan',
        subLabel: 'Structure every touchpoint on campus',
        icon: 'calendar',
      },
      {
        id: 'cmd-board-by-position',
        label: 'Board By Position',
        subLabel: 'Rank targets room by room',
        icon: 'list',
      },
      {
        id: 'cmd-outreach-sequences',
        label: 'Outreach Sequences',
        subLabel: 'Build repeatable message flows',
        icon: 'mail',
      },
      {
        id: 'cmd-decision-watch',
        label: 'Decision Watch',
        subLabel: 'Track who may move soon',
        icon: 'analytics',
      },
      {
        id: 'cmd-coach-assignments',
        label: 'Coach Assignments',
        subLabel: 'Divide the board across staff members',
        icon: 'people',
      },
      {
        id: 'cmd-recruiting-calendar-team',
        label: 'Recruiting Calendar',
        subLabel: 'Organize camps, calls, and visits',
        icon: 'calendar',
      },
      {
        id: 'cmd-visit-feedback',
        label: 'Visit Feedback',
        subLabel: 'Capture staff notes right after visits',
        icon: 'clipboard',
      },
      {
        id: 'cmd-commitment-forecast',
        label: 'Commitment Forecast',
        subLabel: 'Estimate where the class may land',
        icon: 'trendingUp',
      },
    ],
  },
];

/**
 * Shell coordinator categories for RECRUITER role.
 * Recruiter users see prospect discovery and evaluation tools.
 */
export const RECRUITER_COORDINATORS: readonly ShellCommandCategory[] = [
  {
    id: 'coord-prospect-search',
    label: 'Prospect Search',
    icon: 'search',
    description:
      "I'm your Prospect Search coordinator. I help you search athletes, explore the transfer portal, and discover hidden gems.",
    commands: [
      {
        id: 'cmd-search-athletes',
        label: 'Search Athletes',
        subLabel: 'Filter by position & stats',
        icon: 'search',
      },
      {
        id: 'cmd-transfer-portal',
        label: 'Transfer Portal',
        subLabel: 'Available transfers',
        icon: 'people',
      },
      {
        id: 'cmd-hidden-gems',
        label: 'Hidden Gems',
        subLabel: 'AI-discovered talent',
        icon: 'diamond',
      },
      {
        id: 'cmd-position-board',
        label: 'Position Board',
        subLabel: 'Rank athletes by room or need',
        icon: 'list',
      },
      {
        id: 'cmd-regional-search',
        label: 'Regional Search',
        subLabel: 'Focus on key recruiting territories',
        icon: 'search',
      },
      {
        id: 'cmd-stat-filters',
        label: 'Stat Filters',
        subLabel: 'Surface players by production',
        icon: 'analytics',
      },
      {
        id: 'cmd-new-risers',
        label: 'New Risers',
        subLabel: 'Fast movers worth a fresh look',
        icon: 'trendingUp',
      },
      {
        id: 'cmd-saved-searches',
        label: 'Saved Searches',
        subLabel: 'Reopen your best pipelines quickly',
        icon: 'document',
      },
      {
        id: 'cmd-verified-measurables',
        label: 'Verified Measurables',
        subLabel: 'Filter for confirmed size and testing',
        icon: 'clipboard',
      },
      {
        id: 'cmd-academic-filters',
        label: 'Academic Filters',
        subLabel: 'Find prospects who clear academic bars',
        icon: 'book',
      },
      {
        id: 'cmd-video-ready',
        label: 'Video Ready',
        subLabel: 'Surface athletes with useful film now',
        icon: 'play',
      },
      {
        id: 'cmd-sleepers-board',
        label: 'Sleepers Board',
        subLabel: 'Track underrated names before they pop',
        icon: 'diamond',
      },
      {
        id: 'cmd-transfer-fit-search',
        label: 'Transfer Fit Search',
        subLabel: 'Find portal players by immediate role',
        icon: 'people',
      },
      {
        id: 'cmd-injury-returners',
        label: 'Injury Returners',
        subLabel: 'Spot prospects bouncing back this season',
        icon: 'analytics',
      },
      {
        id: 'cmd-local-targets',
        label: 'Local Targets',
        subLabel: 'Search your region first and faster',
        icon: 'search',
      },
      {
        id: 'cmd-late-bloomers',
        label: 'Late Bloomers',
        subLabel: 'Find upside names still climbing',
        icon: 'trendingUp',
      },
    ],
  },
  {
    id: 'coord-evaluation',
    label: 'Evaluation Center',
    icon: 'barChart',
    description:
      "I'm your Evaluation Center coordinator. I generate scout reports, run side-by-side comparisons, and analyze game film.",
    commands: [
      {
        id: 'cmd-scout-report',
        label: 'Scout Reports',
        subLabel: 'AI evaluations',
        icon: 'clipboard',
      },
      {
        id: 'cmd-compare',
        label: 'Compare Athletes',
        subLabel: 'Side-by-side analysis',
        icon: 'gitCompare',
      },
      { id: 'cmd-film-review', label: 'Film Review', subLabel: 'Analyze game film', icon: 'play' },
      {
        id: 'cmd-trait-grades',
        label: 'Trait Grades',
        subLabel: 'Break down measurable strengths',
        icon: 'barChart',
      },
      {
        id: 'cmd-projection-summary',
        label: 'Projection Summary',
        subLabel: 'Ceiling, floor, and timeline',
        icon: 'clipboard',
      },
      {
        id: 'cmd-needs-match',
        label: 'Needs Match',
        subLabel: 'See roster fit against team demand',
        icon: 'analytics',
      },
      {
        id: 'cmd-background-notes',
        label: 'Background Notes',
        subLabel: 'Organize intel before offers',
        icon: 'document',
      },
      {
        id: 'cmd-ranking-board',
        label: 'Ranking Board',
        subLabel: 'Stack players into tiers',
        icon: 'list',
      },
      {
        id: 'cmd-athlete-stack',
        label: 'Athlete Stack',
        subLabel: 'Group comparable prospects quickly',
        icon: 'gitCompare',
      },
      {
        id: 'cmd-film-tags',
        label: 'Film Tags',
        subLabel: 'Organize clips by trait and rep type',
        icon: 'play',
      },
      {
        id: 'cmd-athletic-comps',
        label: 'Athletic Comps',
        subLabel: 'Compare movement profiles to similar athletes',
        icon: 'barChart',
      },
      {
        id: 'cmd-grade-sheet',
        label: 'Grade Sheet',
        subLabel: 'Build a clean category-by-category eval',
        icon: 'clipboard',
      },
      {
        id: 'cmd-risk-flags',
        label: 'Risk Flags',
        subLabel: 'Spot concerns before the next move',
        icon: 'shieldCheck',
      },
      {
        id: 'cmd-offer-summary',
        label: 'Offer Summary',
        subLabel: 'Condense why a player is offer-worthy',
        icon: 'document',
      },
      {
        id: 'cmd-live-eval-notes',
        label: 'Live Eval Notes',
        subLabel: 'Log in-person takeaways quickly',
        icon: 'mail',
      },
      {
        id: 'cmd-position-ceiling',
        label: 'Position Ceiling',
        subLabel: 'Project long-term upside by role',
        icon: 'trendingUp',
      },
    ],
  },
  {
    id: 'coord-outreach',
    label: 'Outreach Coordinator',
    icon: 'mail',
    description:
      "I'm your Outreach Coordinator. I help you draft outreach messages, plan scholarship allocations, and manage your recruiting pipeline.",
    commands: [
      {
        id: 'cmd-draft-offer',
        label: 'Draft Outreach',
        subLabel: 'Contact athletes',
        icon: 'mail',
      },
      {
        id: 'cmd-scholarship',
        label: 'Scholarship Planning',
        subLabel: 'Allocation analysis',
        icon: 'school',
      },
      {
        id: 'cmd-pipeline',
        label: 'Recruiting Pipeline',
        subLabel: 'Track prospects',
        icon: 'funnel',
      },
      {
        id: 'cmd-follow-up-cadence',
        label: 'Follow-Up Cadence',
        subLabel: 'Plan the next touch for each lead',
        icon: 'calendar',
      },
      {
        id: 'cmd-visit-invitations',
        label: 'Visit Invitations',
        subLabel: 'Draft personalized visit outreach',
        icon: 'mail',
      },
      {
        id: 'cmd-coach-notes',
        label: 'Coach Notes',
        subLabel: 'Capture context from each touchpoint',
        icon: 'document',
      },
      {
        id: 'cmd-priority-board',
        label: 'Priority Board',
        subLabel: 'Sort top targets by urgency',
        icon: 'list',
      },
      {
        id: 'cmd-reply-tracker',
        label: 'Reply Tracker',
        subLabel: 'See who responded and who stalled',
        icon: 'analytics',
      },
      {
        id: 'cmd-sequence-builder',
        label: 'Sequence Builder',
        subLabel: 'Design a complete outreach cadence',
        icon: 'mail',
      },
      {
        id: 'cmd-personalization-notes',
        label: 'Personalization Notes',
        subLabel: 'Store details that improve every message',
        icon: 'document',
      },
      {
        id: 'cmd-engagement-score',
        label: 'Engagement Score',
        subLabel: 'See which prospects are leaning in',
        icon: 'analytics',
      },
      {
        id: 'cmd-offer-letter-draft',
        label: 'Offer Letter Draft',
        subLabel: 'Write a cleaner formal outreach note',
        icon: 'mail',
      },
      {
        id: 'cmd-visit-reminders',
        label: 'Visit Reminders',
        subLabel: 'Queue messages ahead of campus visits',
        icon: 'calendar',
      },
      {
        id: 'cmd-parent-outreach',
        label: 'Parent Outreach',
        subLabel: 'Draft respectful family-facing messages',
        icon: 'people',
      },
      {
        id: 'cmd-next-best-action',
        label: 'Next Best Action',
        subLabel: 'Know the right move for each target',
        icon: 'rocket',
      },
      {
        id: 'cmd-pipeline-summary',
        label: 'Pipeline Summary',
        subLabel: 'Condense the whole board into one view',
        icon: 'clipboard',
      },
    ],
  },
  {
    id: 'coord-compliance',
    label: 'Compliance',
    icon: 'shieldCheck',
    description:
      "I'm your Compliance coordinator. I help you navigate contact rules, verify eligibility, and stay current on NIL guidelines.",
    commands: [
      {
        id: 'cmd-contact-rules',
        label: 'Contact Rules',
        subLabel: 'Dead period checks',
        icon: 'calendar',
      },
      {
        id: 'cmd-eligibility-verify',
        label: 'Eligibility',
        subLabel: 'Verify prospect eligibility',
        icon: 'checkmarkCircle',
      },
      {
        id: 'cmd-nil-rules',
        label: 'NIL Guidelines',
        subLabel: 'Current regulations',
        icon: 'document',
      },
      {
        id: 'cmd-visit-rules',
        label: 'Visit Rules',
        subLabel: 'Know what is allowed on campus',
        icon: 'school',
      },
      {
        id: 'cmd-transfer-windows',
        label: 'Transfer Windows',
        subLabel: 'Track portal timing by season',
        icon: 'calendar',
      },
      {
        id: 'cmd-communication-log',
        label: 'Communication Log',
        subLabel: 'Audit recruiting touches quickly',
        icon: 'clipboard',
      },
      {
        id: 'cmd-offer-timing',
        label: 'Offer Timing',
        subLabel: 'Check if outreach timing is clean',
        icon: 'analytics',
      },
      {
        id: 'cmd-dead-period-alerts',
        label: 'Dead Period Alerts',
        subLabel: 'Flag dates that change outreach rules',
        icon: 'shieldCheck',
      },
      {
        id: 'cmd-unofficial-visit-check',
        label: 'Unofficial Visit Check',
        subLabel: 'Confirm what is allowed before the trip',
        icon: 'school',
      },
      {
        id: 'cmd-official-visit-check',
        label: 'Official Visit Check',
        subLabel: 'Validate rules for hosted visits',
        icon: 'calendar',
      },
      {
        id: 'cmd-messaging-audit',
        label: 'Messaging Audit',
        subLabel: 'Review if outreach stayed inside policy',
        icon: 'mail',
      },
      {
        id: 'cmd-signing-calendar',
        label: 'Signing Calendar',
        subLabel: 'Track every key compliance date ahead',
        icon: 'calendar',
      },
      {
        id: 'cmd-transfer-rule-check',
        label: 'Transfer Rule Check',
        subLabel: 'Review portal and movement constraints',
        icon: 'shieldCheck',
      },
      {
        id: 'cmd-nil-disclosure',
        label: 'NIL Disclosure',
        subLabel: 'Keep NIL conversations documented correctly',
        icon: 'document',
      },
      {
        id: 'cmd-contact-window',
        label: 'Contact Window',
        subLabel: 'See when coaches can reach out next',
        icon: 'analytics',
      },
      {
        id: 'cmd-document-checklist',
        label: 'Document Checklist',
        subLabel: 'Make sure every required item is covered',
        icon: 'clipboard',
      },
    ],
  },
];

/**
 * Resolve the correct coordinators for a given user role.
 * Briefing insights, playbooks, and operations are fetched from the backend
 * (AI-generated, stored in Firestore) — not hardcoded.
 */
export function getShellContentForRole(role: string | null | undefined): ShellContentForRole {
  const isTeam = isTeamRole(role);
  const isRecruiterRole = role === USER_ROLES.RECRUITER;

  return {
    coordinators: isTeam
      ? TEAM_COORDINATORS
      : isRecruiterRole
        ? RECRUITER_COORDINATORS
        : ATHLETE_COORDINATORS,
  };
}

// ============================================
// FILE ATTACHMENT CONSTANTS
// ============================================

/**
 * Allowed MIME types for Agent X file attachments.
 */
export const AGENT_X_ALLOWED_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

/** Maximum number of attachments per message. */
export const AGENT_X_MAX_ATTACHMENTS = 5;

/** Maximum single file size in bytes (20 MB). */
export const AGENT_X_MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Resolve a MIME type to the high-level `AgentXAttachmentType`.
 */
export function resolveAttachmentType(mimeType: string): AgentXAttachmentType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'text/csv' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
    return 'csv';
  return 'doc';
}

// ============================================
// API CONFIGURATION
// ============================================

/**
 * Agent X API endpoints (relative to base URL).
 */
export const AGENT_X_ENDPOINTS = {
  /** Chat completion endpoint */
  CHAT: '/agent-x/chat',
  /** Upload file attachment for chat */
  UPLOAD: '/agent-x/upload',
  /** Get quick tasks endpoint */
  TASKS: '/agent-x/tasks',
  /** Get conversation history */
  HISTORY: '/agent-x/history',
  /** Clear conversation */
  CLEAR: '/agent-x/clear',
  /** Aggregated dashboard (briefing + playbook + operations) */
  DASHBOARD: '/agent-x/dashboard',
  /** Set or update user goals */
  GOALS: '/agent-x/goals',
  /** Generate or regenerate the weekly playbook */
  PLAYBOOK_GENERATE: '/agent-x/playbook/generate',
  /** Update the status of a single playbook item */
  PLAYBOOK_ITEM_STATUS: '/agent-x/playbook/item',
  /** Generate or refresh the AI daily briefing */
  BRIEFING_GENERATE: '/agent-x/briefing/generate',
  /** Operations activity log (paginated job history) */
  OPERATIONS_LOG: '/agent-x/operations-log',
  /** Get messages for a specific thread */
  THREAD_MESSAGES: '/agent-x/threads',
  /** System health probe (unauthenticated, cached) */
  HEALTH: '/agent-x/health',
  /** Start a live-view browser session */
  LIVE_VIEW_START: '/agent-x/live-view/start',
  /** Navigate a live-view session to a new URL */
  LIVE_VIEW_NAVIGATE: '/agent-x/live-view/navigate',
  /** Refresh the active live-view session page */
  LIVE_VIEW_REFRESH: '/agent-x/live-view/refresh',
  /** Close and clean up a live-view session */
  LIVE_VIEW_CLOSE: '/agent-x/live-view/close',
  /** Execute a user-approved email draft (HITL) */
  SEND_DRAFT: '/agent-x/chat/send-draft',
} as const;

/**
 * Rate limiting configuration.
 */
export const AGENT_X_RATE_LIMITS = {
  /** Free tier: requests per minute */
  FREE_RPM: 5,
  /** Premium tier: requests per minute */
  PREMIUM_RPM: 30,
  /** Free tier: requests per day */
  FREE_RPD: 50,
  /** Premium tier: requests per day */
  PREMIUM_RPD: 500,
} as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

/**
 * Cache key prefixes for Agent X.
 */
export const AGENT_X_CACHE_KEYS = {
  /** Conversation history cache prefix */
  HISTORY: 'agent-x:history:',
  /** Quick tasks cache key */
  TASKS: 'agent-x:tasks:',
  /** User session cache */
  SESSION: 'agent-x:session:',
} as const;

/**
 * Cache TTL values (in milliseconds).
 */
export const AGENT_X_CACHE_TTL = {
  /** History: 1 minute (frequently updated) */
  HISTORY: 60_000,
  /** Tasks: 15 minutes (rarely changes per role) */
  TASKS: 15 * 60_000,
  /** Session: 5 minutes */
  SESSION: 5 * 60_000,
} as const;
