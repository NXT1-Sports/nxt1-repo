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
      headline: 'Meet Agent X',
      description:
        'Your all-around sports assistant in your pocket. Set your goals and let Agent X get to work.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'athlete-showcase',
      icon: '🎬',
      headline: 'Your Everyday Advantage',
      description: 'From videos to analysis, Agent X handles whatever you need help with.',
      accentColor: '#8B5CF6',
      gradient: ['#1e1b4b', '#312e81'],
    },
    {
      id: 'athlete-discover',
      icon: '🏆',
      headline: 'Set Up Your Agent',
      description: "Now let's set up your Agent X experience and actions.",
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
      headline: 'Meet Agent X',
      description:
        'Your all-around sports assistant in your pocket. Set your goals and let Agent X get to work.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'coach-manage',
      icon: '📋',
      headline: 'Delegate the Busywork',
      description:
        'From planning to operations, Agent X handles whatever your program needs help with.',
      accentColor: '#3B82F6',
      gradient: ['#0c1929', '#1e3a5f'],
    },
    {
      id: 'coach-connect',
      icon: '🤝',
      headline: 'Set Up Your Agent',
      description: "Now let's set up your Agent X experience and actions.",
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
      headline: 'Meet Agent X',
      description:
        'Your all-around sports assistant in your pocket. Set your goals and let Agent X get to work.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'recruiter-search',
      icon: '🔍',
      headline: 'Operate Smarter, Faster',
      description: 'From analysis to communications, Agent X handles whatever you need help with.',
      accentColor: '#6366F1',
      gradient: ['#1e1b4b', '#312e81'],
    },
    {
      id: 'recruiter-evaluate',
      icon: '📊',
      headline: 'Set Up Your Agent',
      description: "Now let's set up your Agent X experience and actions.",
      accentColor: '#EC4899',
      gradient: ['#2d1f2d', '#3d2d3d'],
    },
  ],
};

/**
 * Athletic Director-specific welcome slides
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
      headline: 'Meet Agent X',
      description:
        'Your all-around sports assistant in your pocket. Set your goals and let Agent X get to work.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'director-oversight',
      icon: '📈',
      headline: 'Lead with Clarity',
      description:
        'From analytics to execution, Agent X handles whatever your department needs help with.',
      accentColor: '#0EA5E9',
      gradient: ['#0c1929', '#1e3a5f'],
    },
    {
      id: 'director-manage',
      icon: '🏫',
      headline: 'Set Up Your Agent',
      description: "Now let's set up your Agent X experience and actions.",
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
      headline: 'Meet Agent X',
      description:
        'Your all-around sports assistant in your pocket. Set your goals and let Agent X get to work.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'parent-track',
      icon: '📱',
      headline: 'Support with Confidence',
      description:
        'From progress updates to planning, Agent X handles whatever support your family needs.',
      accentColor: '#E879F9',
      gradient: ['#2d1f2d', '#3d2d3d'],
    },
    {
      id: 'parent-learn',
      icon: '📚',
      headline: 'Set Up Your Agent',
      description: "Now let's set up your Agent X experience and actions.",
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
