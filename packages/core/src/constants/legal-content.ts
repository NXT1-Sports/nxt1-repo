/**
 * @fileoverview Legal Content Constants
 * @module @nxt1/core/constants
 * @version 1.0.0
 *
 * Shared legal content for About page and external legal document URLs.
 * Used by both web and mobile apps via @nxt1/ui components.
 */

/**
 * External Legal Document URLs (Termly)
 * Terms and Privacy are embedded via iframe from these URLs.
 */
export const LEGAL_URLS = {
  TERMS:
    'https://app.termly.io/document/terms-of-use-for-saas/15feca2e-250a-4fea-bab4-f975aa666eca',
  PRIVACY: 'https://app.termly.io/document/privacy-policy/e603559c-9483-42d0-ab85-58249660e18a',
} as const;

/**
 * About page value card interface
 */
export interface ValueCard {
  title: string;
  description: string;
}

/**
 * About page content (self-hosted)
 */
export const ABOUT_CONTENT = {
  mission: {
    title: 'Our Mission',
    content:
      'NXT1 Sports is the ultimate platform connecting athletes, coaches, and recruiters. We empower the next generation of sports stars by providing tools to showcase talent, build their brand, and connect with opportunities.',
  },
  whatWeDo: {
    title: 'What We Do',
    items: [
      'Help athletes create compelling digital profiles',
      'Connect recruiters with top talent across all sports',
      'Provide analytics and insights for performance tracking',
      'Build a community of sports enthusiasts',
      'Empower athletes with tools to control their narrative',
    ],
  },
  values: {
    title: 'Our Values',
    cards: [
      {
        title: 'Athlete First',
        description: "Every decision we make prioritizes the athlete's success and well-being.",
      },
      {
        title: 'Innovation',
        description: 'We continuously push boundaries to deliver cutting-edge sports technology.',
      },
      {
        title: 'Community',
        description:
          'Building connections and fostering relationships within the sports ecosystem.',
      },
      {
        title: 'Integrity',
        description: 'Operating with transparency, fairness, and respect for all users.',
      },
    ] as ValueCard[],
  },
  contact: {
    title: 'Get in Touch',
    content: 'Have questions or want to learn more? Contact us at info@nxt1sports.com',
    email: 'info@nxt1sports.com',
  },
} as const;
