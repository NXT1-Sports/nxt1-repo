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
  /** Emoji icon (rendered as large visual) */
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
      icon: '🎉',
      headline: "You're In!",
      description:
        'Your profile is ready. College coaches are waiting to discover talent like you.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'athlete-showcase',
      icon: '🎬',
      headline: 'Showcase Your Skills',
      description:
        'Upload highlights, stats, and achievements. Stand out with a professional profile.',
      accentColor: '#8B5CF6',
      gradient: ['#1e1b4b', '#312e81'],
    },
    {
      id: 'athlete-discover',
      icon: '🏆',
      headline: 'Get Recruited',
      description: 'Connect directly with college coaches. Your next chapter starts here.',
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
      icon: '🎉',
      headline: "You're In!",
      description: 'Your coaching profile is set up. Time to build your team.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'coach-manage',
      icon: '📋',
      headline: 'Manage Your Roster',
      description: 'Invite athletes, track progress, and keep your team organized in one place.',
      accentColor: '#3B82F6',
      gradient: ['#0c1929', '#1e3a5f'],
    },
    {
      id: 'coach-connect',
      icon: '🤝',
      headline: 'Connect Athletes to Colleges',
      description: 'Help your athletes get discovered by college programs nationwide.',
      accentColor: '#10B981',
      gradient: ['#0d1f17', '#1a3c2e'],
    },
  ],
};

/**
 * College Coach-specific welcome slides
 * Focus: Finding recruits, evaluating talent, streamlining recruiting
 */
const COLLEGE_COACH_SLIDES: WelcomeSlidesConfig = {
  role: 'college-coach',
  greeting: 'Welcome, Coach!',
  ctaText: 'Start Recruiting',
  slides: [
    {
      id: 'college-celebrate',
      icon: '🎉',
      headline: "You're In!",
      description: 'Access thousands of verified athlete profiles ready for evaluation.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'college-search',
      icon: '🔍',
      headline: 'Find Your Recruits',
      description:
        'Search by position, stats, location, and academics. Filter to find the perfect fit.',
      accentColor: '#6366F1',
      gradient: ['#1e1b4b', '#312e81'],
    },
    {
      id: 'college-evaluate',
      icon: '📊',
      headline: 'Evaluate Efficiently',
      description:
        'Watch highlights, compare stats, and connect with top prospects—all in one platform.',
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
      icon: '🎉',
      headline: "You're In!",
      description: 'Your program dashboard is ready. Get full visibility across all your teams.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'director-oversight',
      icon: '📈',
      headline: 'Program Analytics',
      description: 'Track athlete development, team performance, and recruiting success metrics.',
      accentColor: '#0EA5E9',
      gradient: ['#0c1929', '#1e3a5f'],
    },
    {
      id: 'director-manage',
      icon: '🏫',
      headline: 'Unified Management',
      description: 'Oversee all teams, coaches, and athletes from one powerful dashboard.',
      accentColor: '#14B8A6',
      gradient: ['#0d1f17', '#1a3c2e'],
    },
  ],
};

/**
 * Recruiting Service-specific welcome slides
 * Focus: Client management, athlete evaluation, placement success
 */
const RECRUITING_SERVICE_SLIDES: WelcomeSlidesConfig = {
  role: 'recruiting-service',
  greeting: 'Welcome to NXT1!',
  ctaText: 'Manage Clients',
  slides: [
    {
      id: 'recruiting-celebrate',
      icon: '🎉',
      headline: "You're In!",
      description: 'Your professional recruiting tools are ready.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'recruiting-clients',
      icon: '👥',
      headline: 'Manage Your Roster',
      description:
        'Track all your athlete clients, their progress, and college interests in one place.',
      accentColor: '#8B5CF6',
      gradient: ['#1e1b4b', '#312e81'],
    },
    {
      id: 'recruiting-connect',
      icon: '🎯',
      headline: 'Place Athletes Faster',
      description: 'Connect clients with matching programs. Streamline your placement process.',
      accentColor: '#F97316',
      gradient: ['#1c1917', '#292524'],
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
      icon: '🎉',
      headline: "You're In!",
      description: "Stay connected to your athlete's recruiting journey.",
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'parent-track',
      icon: '📱',
      headline: 'Stay Informed',
      description: "Follow your athlete's profile updates, college interest, and key milestones.",
      accentColor: '#E879F9',
      gradient: ['#2d1f2d', '#3d2d3d'],
    },
    {
      id: 'parent-learn',
      icon: '📚',
      headline: 'Navigate Recruiting',
      description:
        'Access guides, timelines, and resources to support the college recruiting process.',
      accentColor: '#22D3EE',
      gradient: ['#0c1929', '#1e3a5f'],
    },
  ],
};

/**
 * Scout-specific welcome slides
 * Focus: Evaluating talent, creating reports, sharing insights
 */
const SCOUT_SLIDES: WelcomeSlidesConfig = {
  role: 'scout',
  greeting: 'Welcome to NXT1!',
  ctaText: 'Start Scouting',
  slides: [
    {
      id: 'scout-celebrate',
      icon: '🎉',
      headline: "You're In!",
      description: 'Your scouting toolkit is ready. Discover and evaluate top talent.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'scout-evaluate',
      icon: '👁️',
      headline: 'Evaluate Talent',
      description: 'Watch highlights, analyze stats, and create professional scouting reports.',
      accentColor: '#F59E0B',
      gradient: ['#1c1917', '#292524'],
    },
    {
      id: 'scout-share',
      icon: '📤',
      headline: 'Share Your Insights',
      description:
        'Connect with coaches and programs. Your evaluations help athletes get discovered.',
      accentColor: '#10B981',
      gradient: ['#0d1f17', '#1a3c2e'],
    },
  ],
};

/**
 * Media-specific welcome slides
 * Focus: Content creation, athlete features, building audience
 */
const MEDIA_SLIDES: WelcomeSlidesConfig = {
  role: 'media',
  greeting: 'Welcome to NXT1!',
  ctaText: 'Create Content',
  slides: [
    {
      id: 'media-celebrate',
      icon: '🎉',
      headline: "You're In!",
      description: 'Your media credentials are set. Start telling athlete stories.',
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'media-discover',
      icon: '🎥',
      headline: 'Find Great Stories',
      description: 'Discover rising athletes, trending highlights, and breaking recruiting news.',
      accentColor: '#EF4444',
      gradient: ['#1c1917', '#292524'],
    },
    {
      id: 'media-create',
      icon: '✨',
      headline: 'Build Your Audience',
      description:
        'Share content, feature athletes, and grow your following in the sports community.',
      accentColor: '#A855F7',
      gradient: ['#1e1b4b', '#312e81'],
    },
  ],
};

/**
 * Fan-specific welcome slides
 * Focus: Following athletes, staying updated, community engagement
 */
const FAN_SLIDES: WelcomeSlidesConfig = {
  role: 'fan',
  greeting: 'Welcome to NXT1!',
  ctaText: 'Start Exploring',
  slides: [
    {
      id: 'fan-celebrate',
      icon: '🎉',
      headline: "You're In!",
      description: "You're part of the NXT1 community. Discover amazing athletes.",
      accentColor: 'var(--nxt1-color-primary)',
      gradient: ['#0f172a', '#1e293b'],
    },
    {
      id: 'fan-follow',
      icon: '⭐',
      headline: 'Follow Your Favorites',
      description: 'Track athletes, teams, and recruiting updates. Never miss a highlight.',
      accentColor: '#F59E0B',
      gradient: ['#1c1917', '#292524'],
    },
    {
      id: 'fan-engage',
      icon: '💬',
      headline: 'Join the Community',
      description: 'Like, comment, and engage with the sports recruiting community.',
      accentColor: '#3B82F6',
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
  'college-coach': COLLEGE_COACH_SLIDES,
  director: DIRECTOR_SLIDES,
  'recruiting-service': RECRUITING_SERVICE_SLIDES,
  parent: PARENT_SLIDES,
  scout: SCOUT_SLIDES,
  media: MEDIA_SLIDES,
  fan: FAN_SLIDES,
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
