/**
 * @fileoverview Legal Content Constants
 * @module @nxt1/core/constants
 * @version 1.0.0
 *
 * Shared legal content for About, Terms, and Privacy pages.
 * Used by both web and mobile apps via @nxt1/ui components.
 *
 * ✏️ TO UPDATE CONTENT: Edit TERMS_CONTENT or PRIVACY_CONTENT below.
 * Components automatically re-render on next build.
 */

// ─── Shared Interfaces ────────────────────────────────────────────────────────

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalContent {
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
  contactEmail: string;
}

// ─── Terms of Service ─────────────────────────────────────────────────────────

/**
 * Terms of Service content.
 * ✏️ Edit paragraphs/items/lastUpdated as needed — no component changes required.
 */
export const TERMS_CONTENT: LegalContent = {
  lastUpdated: 'March 7, 2026',
  intro:
    'Welcome to NXT1 Sports. By accessing or using our platform, you agree to be bound by these Terms of Service. Please read them carefully before using the service.',
  sections: [
    {
      id: 'acceptance',
      title: '1. Acceptance of Terms',
      paragraphs: [
        'By creating an account or using NXT1 Sports in any way, you confirm that you are at least 13 years of age and agree to these Terms of Service and our Privacy Policy.',
        'If you are using the platform on behalf of an organization, you represent that you have authority to bind that organization to these terms.',
      ],
    },
    {
      id: 'description',
      title: '2. Description of Service',
      paragraphs: [
        'NXT1 Sports is a sports networking platform that connects athletes, coaches, scouts, and recruiters. The service includes profile creation, highlight reels, messaging, and discovery tools.',
        'We reserve the right to modify, suspend, or discontinue any part of the service at any time with reasonable notice.',
      ],
    },
    {
      id: 'accounts',
      title: '3. User Accounts',
      paragraphs: [
        'You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.',
        'You must provide accurate and complete information when creating your account. Impersonating another person or entity is strictly prohibited.',
      ],
    },
    {
      id: 'user-content',
      title: '4. User Content',
      paragraphs: [
        'You retain ownership of content you post on NXT1 Sports. By posting content, you grant us a non-exclusive, worldwide, royalty-free license to use, display, and distribute your content within the platform.',
        'You are solely responsible for the content you post. Content must not violate any applicable laws or third-party rights.',
      ],
    },
    {
      id: 'prohibited',
      title: '5. Prohibited Conduct',
      paragraphs: ['You agree not to:'],
      items: [
        'Post false, misleading, or fraudulent content',
        'Harass, bully, or threaten other users',
        'Scrape, crawl, or otherwise collect data from the platform without permission',
        'Attempt to gain unauthorized access to any part of the service',
        'Use the platform to distribute spam or unsolicited messages',
        'Upload content that infringes on intellectual property rights',
      ],
    },
    {
      id: 'intellectual-property',
      title: '6. Intellectual Property',
      paragraphs: [
        'NXT1 Sports and its logos, designs, and software are the intellectual property of NXT1 Sports, Inc. You may not copy, modify, or distribute our proprietary assets without written permission.',
      ],
    },
    {
      id: 'disclaimers',
      title: '7. Disclaimers',
      paragraphs: [
        'The service is provided "as is" without warranties of any kind, either express or implied. We do not guarantee that the service will be uninterrupted, error-free, or completely secure.',
        'We do not guarantee any specific recruitment outcomes or connections made through the platform.',
      ],
    },
    {
      id: 'limitation',
      title: '8. Limitation of Liability',
      paragraphs: [
        'To the fullest extent permitted by law, NXT1 Sports shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service.',
        'Our total liability to you for any claim arising from these terms shall not exceed the amount you paid us in the 12 months preceding the claim.',
      ],
    },
    {
      id: 'termination',
      title: '9. Termination',
      paragraphs: [
        'We may suspend or terminate your account at any time if you violate these terms. You may delete your account at any time through the Settings page.',
        'Upon termination, your right to use the service ceases immediately. Provisions that by their nature should survive termination will remain in effect.',
      ],
    },
    {
      id: 'changes',
      title: '10. Changes to These Terms',
      paragraphs: [
        'We may update these Terms periodically. We will notify you of significant changes via email or an in-app notification. Continued use of the platform after changes constitutes acceptance.',
      ],
    },
    {
      id: 'contact',
      title: '11. Contact Us',
      paragraphs: [
        'If you have questions about these Terms of Service, please contact us at the email below.',
      ],
    },
  ],
  contactEmail: 'legal@nxt1sports.com',
};

// ─── Privacy Policy ───────────────────────────────────────────────────────────

/**
 * Privacy Policy content.
 * ✏️ Edit paragraphs/items/lastUpdated as needed — no component changes required.
 */
export const PRIVACY_CONTENT: LegalContent = {
  lastUpdated: 'March 7, 2026',
  intro:
    'Your privacy is important to us. This Privacy Policy explains how NXT1 Sports collects, uses, and protects your personal information when you use our platform.',
  sections: [
    {
      id: 'information-collect',
      title: '1. Information We Collect',
      paragraphs: ['We collect the following types of information:'],
      items: [
        'Account information: name, email, date of birth, sport, and profile details you provide',
        'Content you upload: photos, videos, highlight reels, and posts',
        'Usage data: pages visited, features used, and interactions within the app',
        'Device information: IP address, browser type, operating system, and device identifiers',
        'Location data: if you grant permission, we may collect approximate location for discovery features',
      ],
    },
    {
      id: 'how-we-use',
      title: '2. How We Use Your Information',
      paragraphs: ['We use your information to:'],
      items: [
        'Provide, maintain, and improve the NXT1 Sports platform',
        'Personalize your experience and surface relevant content and connections',
        'Send you notifications, updates, and promotional communications (you can opt out)',
        'Analyze usage trends to improve the product',
        'Comply with legal obligations and enforce our Terms of Service',
        'Detect and prevent fraud, abuse, and security incidents',
      ],
    },
    {
      id: 'sharing',
      title: '3. Information Sharing',
      paragraphs: [
        'We do not sell your personal information to third parties.',
        'We may share your information with:',
      ],
      items: [
        'Service providers who help us operate the platform (hosting, analytics, email delivery)',
        'Other users, as part of your public profile visible on the platform',
        'Law enforcement or regulators when required by law or to protect our rights',
        'A successor entity in the event of a merger, acquisition, or sale of assets',
      ],
    },
    {
      id: 'security',
      title: '4. Data Security',
      paragraphs: [
        'We use industry-standard security measures including encryption in transit (TLS) and at rest to protect your data.',
        'No method of transmission over the internet is 100% secure. We encourage you to use a strong, unique password and to contact us immediately if you suspect unauthorized access.',
      ],
    },
    {
      id: 'retention',
      title: '5. Data Retention',
      paragraphs: [
        'We retain your personal data for as long as your account is active or as needed to provide the service. If you delete your account, we will delete or anonymize your data within 30 days, except where retention is required by law.',
      ],
    },
    {
      id: 'your-rights',
      title: '6. Your Rights',
      paragraphs: ['Depending on your location, you may have the right to:'],
      items: [
        'Access the personal data we hold about you',
        'Correct inaccurate or incomplete data',
        'Request deletion of your data (right to be forgotten)',
        'Object to or restrict certain processing of your data',
        'Port your data to another service',
        'Withdraw consent at any time where processing is based on consent',
      ],
    },
    {
      id: 'cookies',
      title: '7. Cookies & Tracking',
      paragraphs: [
        'We use cookies and similar technologies to keep you logged in, remember your preferences, and analyze how the platform is used.',
        'You can control cookie settings through your browser. Disabling certain cookies may affect platform functionality.',
      ],
    },
    {
      id: 'children',
      title: "8. Children's Privacy",
      paragraphs: [
        'NXT1 Sports is not directed to children under 13. We do not knowingly collect personal information from children under 13. If we become aware that a child under 13 has provided us information, we will delete it promptly.',
      ],
    },
    {
      id: 'changes',
      title: '9. Changes to This Policy',
      paragraphs: [
        'We may update this Privacy Policy from time to time. We will notify you of material changes via email or an in-app notification. The "Last Updated" date at the top reflects the most recent revision.',
      ],
    },
    {
      id: 'contact',
      title: '10. Contact Us',
      paragraphs: [
        'If you have questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact us at the email below.',
      ],
    },
  ],
  contactEmail: 'privacy@nxt1sports.com',
};

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
