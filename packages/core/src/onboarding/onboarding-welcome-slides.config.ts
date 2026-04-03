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
 * Slide type determines rendering behavior.
 * - 'info': Standard informational slide with hero, headline, description
 * - 'goals': Interactive slide for setting agent goals (embeds AgentOnboardingGoalsComponent)
 */
export type WelcomeSlideType = 'info' | 'goals';

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
  /**
   * Slide type determines rendering behavior.
   * Defaults to 'info' if not specified.
   * - 'info': Standard informational slide
   * - 'goals': Interactive goals selection slide
   */
  type?: WelcomeSlideType;
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
 * Focus: Setting up Agent X with goals
 *
 * New Flow (2026):
 * 1. Let's set up your agent (intro)
 * 2. Set your agent goals (interactive goals step)
 * 3. Agent will work for you + connect more accounts
 */
const ATHLETE_SLIDES: WelcomeSlidesConfig = {
  role: 'athlete',
  greeting: 'Welcome to NXT1, {name}!',
  ctaText: 'Launch Agent X',
  slides: [
    {
      id: 'athlete-setup-intro',
      icon: 'agent-x',
      headline: "Let's Set Up Your Agent",
      description:
        'Agent X is your AI-powered command center. It helps you run recruiting outreach, create content, break down film, and execute daily actions—all from one place.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
      type: 'info',
    },
    {
      id: 'athlete-goals',
      icon: '🎯',
      headline: 'Set Your Agent Goals',
      description:
        'Tell Agent X what matters most to you. Select up to three goals to focus your AI assistant.',
      accentColor: '#8B5CF6',
      gradient: ['#1e1b4b', '#312e81'],
      type: 'goals',
    },
    {
      id: 'athlete-ready',
      icon: '🚀',
      headline: 'Your Agent Is Ready to Work',
      description:
        'Agent X will now work for you based on your goals. Adjust your goals anytime, and connect more accounts to help your agent work even better.',
      accentColor: '#10B981',
      gradient: ['#0d1f17', '#1a3c2e'],
      type: 'info',
    },
  ],
};

/**
 * Coach-specific welcome slides (High School/Club)
 * Focus: Setting up Agent X with goals
 *
 * New Flow (2026):
 * 1. Let's set up your agent (intro)
 * 2. Set your agent goals (interactive goals step)
 * 3. Agent will work for you + connect more accounts
 */
const COACH_SLIDES: WelcomeSlidesConfig = {
  role: 'coach',
  greeting: 'Welcome, Coach!',
  ctaText: 'Launch Agent X',
  slides: [
    {
      id: 'coach-setup-intro',
      icon: 'agent-x',
      headline: "Let's Set Up Your Agent",
      description:
        'Agent X is your AI-powered command center. It helps your staff run planning, recruiting communication, player development workflows, and daily operations.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
      type: 'info',
    },
    {
      id: 'coach-goals',
      icon: '🎯',
      headline: 'Set Your Agent Goals',
      description:
        'Tell Agent X what matters most to your program. Select up to three goals to focus your AI assistant.',
      accentColor: '#3B82F6',
      gradient: ['#0c1929', '#1e3a5f'],
      type: 'goals',
    },
    {
      id: 'coach-ready',
      icon: '🚀',
      headline: 'Your Coordinators Are Ready to Work',
      description:
        'Your AI coordinators will now work for your program based on your goals. Adjust your goals anytime, and connect more accounts to help your coordinators work even better.',
      accentColor: '#10B981',
      gradient: ['#0d1f17', '#1a3c2e'],
      type: 'info',
    },
  ],
};

/**
 * Recruiter-specific welcome slides (college coaches, scouts, recruiting services)
 * Focus: Setting up Agent X with goals
 *
 * New Flow (2026):
 * 1. Let's set up your agent (intro)
 * 2. Set your agent goals (interactive goals step)
 * 3. Agent will work for you + connect more accounts
 */
const RECRUITER_SLIDES: WelcomeSlidesConfig = {
  role: 'recruiter',
  greeting: 'Welcome to NXT1!',
  ctaText: 'Launch Agent X',
  slides: [
    {
      id: 'recruiter-setup-intro',
      icon: 'agent-x',
      headline: "Let's Set Up Your Agent",
      description:
        'Agent X is your AI-powered command center. It helps you evaluate prospects, automate communication, and keep recruiting pipelines moving.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
      type: 'info',
    },
    {
      id: 'recruiter-goals',
      icon: '🎯',
      headline: 'Set Your Agent Goals',
      description:
        'Tell Agent X what matters most to your recruiting. Select up to three goals to focus your AI assistant.',
      accentColor: '#6366F1',
      gradient: ['#1e1b4b', '#312e81'],
      type: 'goals',
    },
    {
      id: 'recruiter-ready',
      icon: '🚀',
      headline: 'Your Agent Is Ready to Work',
      description:
        'Agent X will now work for you based on your goals. Adjust your goals anytime, and connect more accounts to help your agent work even better.',
      accentColor: '#10B981',
      gradient: ['#0d1f17', '#1a3c2e'],
      type: 'info',
    },
  ],
};

/**
 * Director-specific welcome slides
 * Focus: Setting up Agent X with goals
 *
 * New Flow (2026):
 * 1. Let's set up your agent (intro)
 * 2. Set your agent goals (interactive goals step)
 * 3. Agent will work for you + connect more accounts
 */
const DIRECTOR_SLIDES: WelcomeSlidesConfig = {
  role: 'director',
  greeting: 'Welcome to NXT1!',
  ctaText: 'Launch Agent X',
  slides: [
    {
      id: 'director-setup-intro',
      icon: 'agent-x',
      headline: "Let's Set Up Your Agent",
      description:
        'Agent X is your AI-powered command center. It helps your organization align strategy, automate workflows, and execute high-impact operations at scale.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
      type: 'info',
    },
    {
      id: 'director-goals',
      icon: '🎯',
      headline: 'Set Your Agent Goals',
      description:
        'Tell Agent X what matters most to your program. Select up to three goals to focus your AI assistant.',
      accentColor: '#0EA5E9',
      gradient: ['#0c1929', '#1e3a5f'],
      type: 'goals',
    },
    {
      id: 'director-ready',
      icon: '🚀',
      headline: 'Your Coordinators Are Ready to Work',
      description:
        'Your AI coordinators will now work for your program based on your goals. Adjust your goals anytime, and connect more accounts to help your coordinators work even better.',
      accentColor: '#10B981',
      gradient: ['#0d1f17', '#1a3c2e'],
      type: 'info',
    },
  ],
};

/**
 * Parent/Guardian-specific welcome slides
 * Focus: Setting up Agent X with goals
 *
 * New Flow (2026):
 * 1. Let's set up your agent (intro)
 * 2. Set your agent goals (interactive goals step)
 * 3. Agent will work for you + connect more accounts
 */
const PARENT_SLIDES: WelcomeSlidesConfig = {
  role: 'parent',
  greeting: 'Welcome to NXT1!',
  ctaText: 'Launch Agent X',
  slides: [
    {
      id: 'parent-setup-intro',
      icon: 'agent-x',
      headline: "Let's Set Up Your Agent",
      description:
        'Agent X is your AI-powered command center. It helps your family stay organized with recruiting tasks, milestones, and communication support.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
      type: 'info',
    },
    {
      id: 'parent-goals',
      icon: '🎯',
      headline: 'Set Your Agent Goals',
      description:
        'Tell Agent X what matters most to your family. Select up to three goals to focus your AI assistant.',
      accentColor: '#E879F9',
      gradient: ['#2d1f2d', '#3d2d3d'],
      type: 'goals',
    },
    {
      id: 'parent-ready',
      icon: '🚀',
      headline: 'Your Agent Is Ready to Work',
      description:
        'Agent X will now work for your family based on your goals. Adjust your goals anytime, and connect more accounts to help your agent work even better.',
      accentColor: '#10B981',
      gradient: ['#0d1f17', '#1a3c2e'],
      type: 'info',
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
