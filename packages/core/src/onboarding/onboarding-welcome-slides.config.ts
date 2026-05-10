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
  /** Ordered list of slides (3 or 5 for legacy) */
  slides: WelcomeSlide[];
  /** CTA button text on final slide */
  ctaText: string;
  /** Personalized greeting (uses firstName if available) */
  greeting: string;
  /** True if this is a legacy user migration flow (5 slides) */
  isLegacy?: boolean;
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
// ============================================
// LEGACY USER WELCOME FLOW (5 SLIDES)
// Explains the rebrand and new platform
// ============================================

/**
 * Legacy user welcome flow (5 slides)
 * Celebrates the rebrand and introduces Agent X
 *
 * Flow:
 * 1. Welcome to NXT1 2.0 - The rebrand story
 * 2. Meet Agent X - Your new AI copilot
 * 3. Everything from before but better - Data evolution
 * 4. Set your goals - Interactive (shared with new users)
 * 5. Agent ready - Launch experience (shared with new users)
 */
const createLegacySlides = (
  role: OnboardingUserType,
  goalsSlide: WelcomeSlide,
  readySlide: WelcomeSlide,
  isMigratedPaidLegacy: boolean = false
): WelcomeSlide[] => {
  const isAthlete = role === 'athlete';
  const isCoach = role === 'coach';

  const legacyStepThree: WelcomeSlide = isMigratedPaidLegacy
    ? {
        id: `${role}-legacy-billing-transition`,
        icon: '💳',
        headline: 'Your Billing Is Now Wallet-Based',
        description:
          'We moved your legacy subscription to wallet credits. Your current subscription is set to end at period close, and future usage runs from your wallet balance with no auto-renew surprise.',
        accentColor: '#06B6D4',
        gradient: ['#0c2e2e', '#0f4a4a'],
        type: 'info',
      }
    : {
        id: `${role}-legacy-data-evolved`,
        icon: '✨',
        headline: 'Everything You Built, Supercharged',
        description:
          'Your profiles, film, stats, and performance history are all here. Now they are powered by smarter AI workflows built to help you move faster.',
        accentColor: '#06B6D4',
        gradient: ['#0c2e2e', '#0f4a4a'],
        type: 'info',
      };

  return [
    {
      id: `${role}-legacy-welcome`,
      icon: '🔥',
      headline: 'Welcome to the New NXT1',
      description: isAthlete
        ? 'We completely rebuilt the platform from the ground up. Same mission, way more power—and now Agent X does the heavy lifting for you.'
        : isCoach
          ? 'We completely rebuilt the platform from the ground up. Same mission, way more power—and now your AI coordinators do the heavy lifting for you.'
          : 'We completely rebuilt the platform from the ground up. Same mission, way more power—and now your AI coordinators orchestrate everything.',
      accentColor: '#F59E0B',
      gradient: ['#331f00', '#6b4200'],
      type: 'info',
    },
    {
      id: `${role}-legacy-agent-x`,
      icon: 'agent-x',
      headline: 'Meet Your AI Team',
      description: isAthlete
        ? 'Your personal AI command center. Not just a chatbot-a real agent that handles film analysis, performance strategy, content creation, and daily execution.'
        : isCoach
          ? 'Your AI coordinators command center. Not just chatbots-real agents that handle program strategy, player development, and operational execution.'
          : 'Your AI command center. Not just chatbots-real agents that orchestrate intelligence, strategy, and operations at scale.',
      accentColor: '#8B5CF6',
      gradient: ['#1e1b4b', '#312e81'],
      type: 'info',
    },
    legacyStepThree,
    { ...goalsSlide },
    { ...readySlide },
  ];
};

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
        'Agent X is your AI-powered command center. It helps you create content, break down film, plan performance, and execute daily actions-all from one place.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
      type: 'info',
    },
    {
      id: 'athlete-goals',
      icon: '🎯',
      headline: 'Set Your Agent Goals',
      description:
        'Tell Agent X what matters most to you. Select up to three goals to focus your AI Coordinators.',
      accentColor: '#8B5CF6',
      gradient: ['#1e1b4b', '#312e81'],
      type: 'goals',
    },
    {
      id: 'athlete-ready',
      icon: '🚀',
      headline: 'Your Coordinators Are Ready to Work',
      description:
        'Agent X will now work for you based on your goals. Adjust your goals anytime, and connect more accounts to help your agent work even better.',
      accentColor: '#10B981',
      gradient: ['#0d1f17', '#1a3c2e'],
      type: 'info',
    },
  ],
};

/** * Legacy athlete welcome slides (5 slides)
 * Celebrates rebrand and introduces Agent X
 */
const ATHLETE_LEGACY_SLIDES: WelcomeSlidesConfig = {
  role: 'athlete',
  greeting: 'Welcome back, {name}!',
  ctaText: 'Launch Agent X',
  isLegacy: true,
  slides: createLegacySlides('athlete', ATHLETE_SLIDES.slides[1], ATHLETE_SLIDES.slides[2]),
};

/** * Coach-specific welcome slides (High School/Club)
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
        'Agent X is your AI-powered command center. It helps your staff run planning, performance workflows, player development, and daily operations.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
      type: 'info',
    },
    {
      id: 'coach-goals',
      icon: '🎯',
      headline: 'Set Your Agent Goals',
      description:
        'Tell Agent X what matters most to your program. Select up to three goals to focus your AI Coordinators.',
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

/** * Legacy coach welcome slides (5 slides)
 * Celebrates rebrand and introduces AI coordinators
 */
const COACH_LEGACY_SLIDES: WelcomeSlidesConfig = {
  role: 'coach',
  greeting: 'Welcome back, Coach!',
  ctaText: 'Launch Agent X',
  isLegacy: true,
  slides: createLegacySlides('coach', COACH_SLIDES.slides[1], COACH_SLIDES.slides[2]),
};

/** * Director-specific welcome slides
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
        'Tell Agent X what matters most to your program. Select up to three goals to focus your AI Coordinators.',
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
 * Legacy director welcome slides (5 slides)
 * Celebrates rebrand and introduces AI coordinators
 */
const DIRECTOR_LEGACY_SLIDES: WelcomeSlidesConfig = {
  role: 'director',
  greeting: 'Welcome back!',
  ctaText: 'Launch Agent X',
  isLegacy: true,
  slides: createLegacySlides('director', DIRECTOR_SLIDES.slides[1], DIRECTOR_SLIDES.slides[2]),
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
} as const;

/**
 * Map of legacy user welcome slides
 * 5-slide rebrand celebration + Agent X intro
 */
export const LEGACY_WELCOME_SLIDES_BY_ROLE: Record<OnboardingUserType, WelcomeSlidesConfig> = {
  athlete: ATHLETE_LEGACY_SLIDES,
  coach: COACH_LEGACY_SLIDES,
  director: DIRECTOR_LEGACY_SLIDES,
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get welcome slides configuration for a specific user role.
 * Falls back to athlete slides if role is not recognized.
 *
 * @param role - The user's role type
 * @param isLegacy - If true, returns the 5-slide legacy rebrand flow
 * @returns Slide configuration for the role
 */
export function getWelcomeSlidesForRole(
  role: OnboardingUserType | null,
  isLegacy: boolean = false,
  isMigratedPaidLegacy: boolean = false
): WelcomeSlidesConfig {
  if (
    !role ||
    (isLegacy && !(role in LEGACY_WELCOME_SLIDES_BY_ROLE)) ||
    (!isLegacy && !(role in WELCOME_SLIDES_BY_ROLE))
  ) {
    const defaultSlides = isLegacy ? ATHLETE_LEGACY_SLIDES : ATHLETE_SLIDES;
    return defaultSlides;
  }

  if (isLegacy) {
    const base = LEGACY_WELCOME_SLIDES_BY_ROLE[role];
    if (!isMigratedPaidLegacy) {
      return base;
    }

    return {
      ...base,
      slides: createLegacySlides(role, base.slides[3]!, base.slides[4]!, true),
    };
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
 * Total number of slides (3 for new users, 5 for legacy)
 */
export const WELCOME_SLIDES_COUNT = 3;
export const LEGACY_WELCOME_SLIDES_COUNT = 5;
