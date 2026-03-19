/**
 * @fileoverview Role-Based Welcome Slides Configuration
 * @module @nxt1/core/api/onboarding
 *
 * Pure TypeScript configuration for role-specific onboarding welcome slides.
 * Shown after user completes signup to educate about key features.
 *
 * 2026 Best Practices:
 * - Role-based content personalization
 * - Maximum 3 slides (respects user time)
 * - Minimal text per slide (headline + 1-2 sentences)
 * - Feature-focused messaging
 * - Celebration integrated into first slide
 *
 * ⭐ 100% PORTABLE - Pure TypeScript, no framework dependencies ⭐
 */

import type { OnboardingUserType } from './onboarding-persistence.api';

// ============================================
// TYPES
// ============================================

/**
 * Individual slide configuration
 */
export interface WelcomeSlide {
  /** Unique identifier for tracking */
  id: string;
  /** Icon token (emoji or special icon key such as 'agent-x') */
  icon: string;
  /** Primary headline (bold, large) */
  headline: string;
  /** Supporting description (1-2 sentences max) */
  description: string;
  /** Accent color for this slide (CSS variable or hex) */
  accentColor?: string;
  /** Background gradient colors [start, end] */
  gradient?: [string, string];
}

/**
 * Role-specific slide deck configuration
 */
export interface WelcomeSlidesConfig {
  /** User role this config applies to */
  role: OnboardingUserType;
  /** Ordered list of slides (exactly 3) */
  slides: [WelcomeSlide, WelcomeSlide, WelcomeSlide];
  /** CTA button text on final slide */
  ctaText: string;
  /** Personalized greeting (uses firstName if available) */
  greeting: string;
}

// ============================================
// SLIDE CONTENT BY ROLE
// ============================================

/**
 * Athlete-specific welcome slides
 * Focus: Getting discovered, showcasing talent, building network
 */
const ATHLETE_SLIDES: WelcomeSlidesConfig = {
  role: 'athlete',
  greeting: 'Welcome to NXT1, {name}!',
  ctaText: 'Start Your Journey',
  slides: [
    {
      id: 'athlete-celebrate',
      icon: 'agent-x',
      headline: 'Welcome to NXT 1',
      description:
        'NXT 1 is your AI agent sports platform. Agent X helps you run recruiting outreach, content, film breakdown, and daily actions from one command center.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'athlete-showcase',
      icon: '🎬',
      headline: 'Connect Accounts to Power Agent X',
      description:
        'Link your social, video, and communication accounts so Agent X can publish highlights, draft outreach, and execute tasks with your live data.',
      accentColor: '#8B5CF6',
      gradient: ['#1e1b4b', '#312e81'],
    },
    {
      id: 'athlete-discover',
      icon: '🏆',
      headline: 'Set Up Your Agent',
      description: "Now let's finalize your Agent X setup and launch your first action plan.",
      accentColor: '#F59E0B',
      gradient: ['#1c1917', '#292524'],
    },
  ],
};

/**
 * Coach-specific welcome slides (High School/Club)
 * Focus: Team management, recruiting athletes, connecting with programs
 */
const COACH_SLIDES: WelcomeSlidesConfig = {
  role: 'coach',
  greeting: 'Welcome, Coach!',
  ctaText: 'Build Your Team',
  slides: [
    {
      id: 'coach-celebrate',
      icon: 'agent-x',
      headline: 'Welcome to NXT 1',
      description:
        'NXT 1 is your AI agent sports platform. Agent X helps your staff run planning, recruiting communication, player development workflows, and daily operations.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'coach-manage',
      icon: '📋',
      headline: 'Connect Accounts to Power Agent X',
      description:
        'Connect your team communication, video, and social accounts so Agent X can coordinate tasks, publish updates, and run recruiting actions for your program.',
      accentColor: '#3B82F6',
      gradient: ['#0c1929', '#1e3a5f'],
    },
    {
      id: 'coach-connect',
      icon: '🤝',
      headline: 'Set Up Your Agent',
      description: "Now let's finalize your Agent X setup and launch your team action workflow.",
      accentColor: '#10B981',
      gradient: ['#0d1f17', '#1a3c2e'],
    },
  ],
};

/**
 * Recruiter-specific welcome slides (college coaches, scouts, recruiting services)
 * Focus: Finding recruits, evaluating talent, streamlining recruiting
 */
const RECRUITER_SLIDES: WelcomeSlidesConfig = {
  role: 'recruiter',
  greeting: 'Welcome to NXT1!',
  ctaText: 'Start Recruiting',
  slides: [
    {
      id: 'recruiter-celebrate',
      icon: 'agent-x',
      headline: 'Welcome to NXT 1',
      description:
        'NXT 1 is your AI agent sports platform. Agent X helps you evaluate prospects, automate communication, and keep recruiting pipelines moving.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'recruiter-search',
      icon: '🔍',
      headline: 'Connect Accounts to Power Agent X',
      description:
        'Connect your CRM, communication, and video accounts so Agent X can trigger outreach, organize intel, and execute recruiting actions from one place.',
      accentColor: '#6366F1',
      gradient: ['#1e1b4b', '#312e81'],
    },
    {
      id: 'recruiter-evaluate',
      icon: '📊',
      headline: 'Set Up Your Agent',
      description: "Now let's finalize your Agent X setup and launch your recruiting action flow.",
      accentColor: '#EC4899',
      gradient: ['#2d1f2d', '#3d2d3d'],
    },
  ],
};

/**
 * Director-specific welcome slides
 * Focus: Program oversight, staff management, analytics
 */
const DIRECTOR_SLIDES: WelcomeSlidesConfig = {
  role: 'director',
  greeting: 'Welcome to NXT1!',
  ctaText: 'View Your Program',
  slides: [
    {
      id: 'director-celebrate',
      icon: 'agent-x',
      headline: 'Welcome to NXT 1',
      description:
        'NXT 1 is your AI agent sports platform. Agent X helps your organization align strategy, automate workflows, and execute high-impact operations at scale.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'director-oversight',
      icon: '📈',
      headline: 'Connect Accounts to Power Agent X',
      description:
        'Connect your program systems, communication channels, and reporting tools so Agent X can orchestrate decisions and execution from one control center.',
      accentColor: '#0EA5E9',
      gradient: ['#0c1929', '#1e3a5f'],
    },
    {
      id: 'director-manage',
      icon: '🏫',
      headline: 'Set Up Your Agent',
      description:
        "Now let's finalize your Agent X setup and launch your program action framework.",
      accentColor: '#14B8A6',
      gradient: ['#0d1f17', '#1a3c2e'],
    },
  ],
};

/**
 * Parent/Guardian-specific welcome slides
 * Focus: Supporting athlete, tracking progress, understanding process
 */
const PARENT_SLIDES: WelcomeSlidesConfig = {
  role: 'parent',
  greeting: 'Welcome to NXT1!',
  ctaText: 'Support Your Athlete',
  slides: [
    {
      id: 'parent-celebrate',
      icon: 'agent-x',
      headline: 'Welcome to NXT 1',
      description:
        'NXT 1 is your AI agent sports platform. Agent X helps your family stay organized with recruiting tasks, milestones, and communication support.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'parent-track',
      icon: '📱',
      headline: 'Connect Accounts to Power Agent X',
      description:
        'Connect communication and scheduling accounts so Agent X can keep everyone synced, track progress, and support your athlete with real-time context.',
      accentColor: '#E879F9',
      gradient: ['#2d1f2d', '#3d2d3d'],
    },
    {
      id: 'parent-learn',
      icon: '📚',
      headline: 'Set Up Your Agent',
      description:
        "Now let's finalize your Agent X setup and launch your family support action plan.",
      accentColor: '#22D3EE',
      gradient: ['#0c1929', '#1e3a5f'],
    },
  ],
};

// ============================================
// SLIDE CONFIG MAP
// ============================================

/**
 * Map of all role-specific slide configurations
 * Keyed by OnboardingUserType for O(1) lookup
 */
export const WELCOME_SLIDES_BY_ROLE: Record<OnboardingUserType, WelcomeSlidesConfig> = {
  athlete: ATHLETE_SLIDES,
  coach: COACH_SLIDES,
  director: DIRECTOR_SLIDES,
  recruiter: RECRUITER_SLIDES,
  parent: PARENT_SLIDES,
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get welcome slides configuration for a specific user role.
 * Falls back to athlete slides if role is not recognized.
 *
 * @param role - The user's role type
 * @returns Slide configuration for the role
 */
export function getWelcomeSlidesForRole(role: OnboardingUserType | null): WelcomeSlidesConfig {
  if (!role || !(role in WELCOME_SLIDES_BY_ROLE)) {
    return ATHLETE_SLIDES; // Default fallback
  }
  return WELCOME_SLIDES_BY_ROLE[role];
}

/**
 * Get personalized greeting with user's name.
 *
 * @param config - The slides configuration
 * @param firstName - User's first name (optional)
 * @returns Personalized greeting string
 */
export function getPersonalizedGreeting(config: WelcomeSlidesConfig, firstName?: string): string {
  if (firstName && firstName.trim()) {
    return config.greeting.replace('{name}', firstName.trim());
  }
  // Remove the {name} placeholder and clean up
  return config.greeting.replace(', {name}', '').replace(' {name}', '').replace('{name}', '');
}

/**
 * Default configuration for when no role is selected
 */
export const DEFAULT_WELCOME_SLIDES = ATHLETE_SLIDES;

/**
 * Total number of slides (fixed at 3 per 2026 best practices)
 */
export const WELCOME_SLIDES_COUNT = 3;
