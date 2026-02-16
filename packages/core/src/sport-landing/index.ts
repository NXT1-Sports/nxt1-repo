/**
 * @fileoverview Sport Vertical Landing Page Configuration
 * @module @nxt1/core/sport-landing
 *
 * Pure TypeScript config for sport-specific SEO landing pages.
 * A single component reads the route :sport param, looks up its
 * config here, and renders the correct copy/assets.
 *
 * Adding a new sport vertical is as simple as adding an entry
 * to SPORT_LANDING_CONFIGS.
 *
 * 100% portable — no framework dependencies.
 *
 * @version 1.0.0
 */

// ============================================
// TYPES
// ============================================

/** A single feature bullet on the sport landing page. */
export interface SportLandingFeature {
  readonly id: string;
  readonly icon: string;
  readonly title: string;
  readonly description: string;
}

/** An audience segment card on the sport landing page. */
export interface SportLandingAudience {
  readonly id: string;
  readonly icon: string;
  readonly title: string;
  readonly description: string;
}

/** An FAQ on the sport landing page. */
export interface SportLandingFaq {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

/** A stat bar item. */
export interface SportLandingStat {
  readonly label: string;
  readonly value: string;
}

/** Preview highlight mock data for the sport preview component. */
export interface SportLandingHighlight {
  readonly id: string;
  readonly title: string;
  readonly views: string;
  readonly duration: string;
}

/** Preview ranking entry for the sport preview component. */
export interface SportLandingRanking {
  readonly rank: number;
  readonly name: string;
  readonly position: string;
  readonly classYear: string;
  readonly rating: string;
}

/** Full config for a single sport vertical landing page. */
export interface SportLandingConfig {
  /** URL slug — must match the route param, e.g. "football" */
  readonly slug: string;

  /** Display name, e.g. "Football" */
  readonly displayName: string;

  // ---- Hero Section ----
  readonly heroTitle: string;
  readonly heroAccent: string;
  readonly heroSubtitle: string;
  readonly heroBadgeIcon: string;
  readonly heroBadgeLabel: string;

  // ---- Stats Bar ----
  readonly stats: readonly SportLandingStat[];

  // ---- Feature Showcase ----
  readonly featuresTitle: string;
  readonly featuresSubtitle: string;
  readonly features: readonly SportLandingFeature[];

  // ---- Audience Segments ----
  readonly audienceTitle: string;
  readonly audienceSubtitle: string;
  readonly audiences: readonly SportLandingAudience[];

  // ---- FAQ ----
  readonly faqTitle: string;
  readonly faqSubtitle: string;
  readonly faqs: readonly SportLandingFaq[];

  // ---- CTA Banner ----
  readonly ctaTitle: string;
  readonly ctaSubtitle: string;
  readonly ctaLabel: string;
  readonly ctaRoute: string;

  // ---- SEO ----
  readonly seoTitle: string;
  readonly seoDescription: string;

  // ---- Preview mockups ----
  readonly previewSportLabel: string;
  readonly previewHighlights: readonly SportLandingHighlight[];
  readonly previewRankings: readonly SportLandingRanking[];
}

// ============================================
// FOOTBALL CONFIG
// ============================================

const FOOTBALL_CONFIG: SportLandingConfig = {
  slug: 'football',
  displayName: 'Football',

  heroBadgeIcon: 'football-outline',
  heroBadgeLabel: 'Football Recruiting',
  heroTitle: 'The #1 Football',
  heroAccent: 'Recruiting Platform',
  heroSubtitle:
    'Build your football recruiting profile, upload game film and highlights, track analytics, and connect with college coaches — all in one platform built for football players.',

  stats: [
    { label: 'Football Athletes', value: '65K+' },
    { label: 'Game Film Uploads', value: '320K+' },
    { label: 'College Programs', value: '900+' },
    { label: 'Scholarships Matched', value: '4.2K+' },
  ],

  featuresTitle: 'Built for Football Recruiting',
  featuresSubtitle:
    'Every tool football players and coaches need — from highlight reels and measurables to direct messaging and scouting reports.',
  features: [
    {
      id: 'fb-profile',
      icon: 'person-outline',
      title: 'Football Recruiting Profile',
      description:
        'Showcase your position, stats, measurables, 40-time, GPA, and film. College coaches search NXT1 profiles every day.',
    },
    {
      id: 'fb-film',
      icon: 'videocam-outline',
      title: 'Game Film & Highlights',
      description:
        'Upload full-game film or create highlight reels with our built-in editor. Tag plays by type — rushes, catches, tackles, and more.',
    },
    {
      id: 'fb-analytics',
      icon: 'bar-chart-outline',
      title: 'Recruiting Analytics',
      description:
        'See which coaches viewed your profile, how many times your film was watched, and how your stock is trending week over week.',
    },
    {
      id: 'fb-exposure',
      icon: 'shield-outline',
      title: 'Verified Exposure',
      description:
        "Get your profile in front of verified D1, D2, D3, NAIA, and JUCO coaches through NXT1's curated exposure network.",
    },
    {
      id: 'fb-college',
      icon: 'school-outline',
      title: 'College Search',
      description:
        'Filter 4,000+ college football programs by division, conference, location, academic standards, and scholarship availability.',
    },
    {
      id: 'fb-messaging',
      icon: 'mail-outline',
      title: 'Coach Messaging',
      description:
        'Send and receive compliant messages with college coaching staffs directly inside NXT1. No more missed DMs or lost emails.',
    },
  ],

  audienceTitle: 'Every Level of Football',
  audienceSubtitle:
    "Whether you're a Pop Warner standout or a college transfer, NXT1 is your recruiting home.",
  audiences: [
    {
      id: 'fb-hs',
      icon: 'football-outline',
      title: 'High School Football',
      description:
        'Start building your recruiting profile as a freshman. Track development through your senior season and get noticed by college programs.',
    },
    {
      id: 'fb-7v7',
      icon: 'trophy-outline',
      title: '7-on-7 & Camp Athletes',
      description:
        'Showcase your off-season combine results, camp performances, and 7-on-7 highlights to complement your varsity film.',
    },
    {
      id: 'fb-transfer',
      icon: 'school-outline',
      title: 'Transfer Portal',
      description:
        'Already in college? Manage your transfer portal profile, connect with new programs, and find your next opportunity through NXT1.',
    },
  ],

  faqTitle: 'Football Recruiting FAQs',
  faqSubtitle: 'Common questions from football athletes and families.',
  faqs: [
    {
      id: 'fb-faq-free',
      question: 'Is NXT1 free for football players?',
      answer:
        'Yes! Every football athlete gets a free recruiting profile with unlimited highlight uploads. Premium tiers add advanced analytics, priority coach visibility, and AI scouting reports.',
    },
    {
      id: 'fb-faq-find',
      question: 'How do college football coaches find me?',
      answer:
        "Coaches use NXT1's search tools to filter athletes by position, class year, location, measurables, and film. A complete profile with highlights dramatically increases your visibility.",
    },
    {
      id: 'fb-faq-film',
      question: 'What game film formats can I upload?',
      answer:
        'NXT1 accepts MP4, MOV, and most standard video formats. You can also import links from Hudl, YouTube, and Vimeo. Our editor lets you trim, tag, and compile highlight reels.',
    },
    {
      id: 'fb-faq-start',
      question: 'When should I start my football recruiting profile?',
      answer:
        'The earlier the better — many successful recruits create their profiles in 8th grade or freshman year. College coaches evaluate talent earlier every year.',
    },
    {
      id: 'fb-faq-divisions',
      question: 'Does NXT1 cover all college divisions?',
      answer:
        'Absolutely. NXT1 includes D1 FBS, D1 FCS, D2, D3, NAIA, and JUCO programs. Our college search lets you find the best academic and athletic fit at any level.',
    },
  ],

  ctaTitle: 'Ready to Get Recruited for Football?',
  ctaSubtitle:
    'Join 65,000+ football athletes already using NXT1 to build their recruiting profile and connect with college coaches.',
  ctaLabel: 'Create Free Profile',
  ctaRoute: '/auth/register',

  seoTitle: 'Football Recruiting — Build Your Profile | NXT1',
  seoDescription:
    'The #1 football recruiting platform. Build a free recruiting profile, upload game film, track analytics, and connect with 900+ college football programs on NXT1.',

  previewSportLabel: 'Football',
  previewHighlights: [
    { id: 'fb-h1', title: 'Junior Season Highlights', views: '4.1K', duration: '3:42' },
    { id: 'fb-h2', title: 'Combine & Pro Day', views: '1.8K', duration: '2:15' },
  ],
  previewRankings: [
    { rank: 1, name: 'Jaylen Carter', position: 'QB', classYear: '2026', rating: '97' },
    { rank: 2, name: 'DeMarcus Williams', position: 'RB', classYear: '2026', rating: '95' },
    { rank: 3, name: 'Aiden Brooks', position: 'WR', classYear: '2027', rating: '94' },
    { rank: 4, name: 'Marcus Thompson', position: 'LB', classYear: '2026', rating: '93' },
    { rank: 5, name: 'Chris Davis', position: 'DB', classYear: '2027', rating: '92' },
  ],
};

// ============================================
// BASKETBALL CONFIG
// ============================================

const BASKETBALL_CONFIG: SportLandingConfig = {
  slug: 'basketball',
  displayName: 'Basketball',

  heroBadgeIcon: 'basketball-outline',
  heroBadgeLabel: 'Basketball Recruiting',
  heroTitle: 'The #1 Basketball',
  heroAccent: 'Recruiting Platform',
  heroSubtitle:
    'Build your basketball recruiting profile, upload game film and mixtapes, track analytics, and connect with college coaches — all in one platform built for basketball players.',

  stats: [
    { label: 'Basketball Athletes', value: '40K+' },
    { label: 'Highlight Uploads', value: '185K+' },
    { label: 'College Programs', value: '1,100+' },
    { label: 'Scholarships Matched', value: '2.8K+' },
  ],

  featuresTitle: 'Built for Basketball Recruiting',
  featuresSubtitle:
    'Film breakdown, measurables, coach connections, and analytics — everything basketball players need to get recruited.',
  features: [
    {
      id: 'bb-profile',
      icon: 'person-outline',
      title: 'Basketball Recruiting Profile',
      description:
        'Showcase your position, stats, measurables, vertical leap, GPA, and film. College coaches search NXT1 profiles every day.',
    },
    {
      id: 'bb-film',
      icon: 'videocam-outline',
      title: 'Game Film & Mixtapes',
      description:
        'Upload full-game film or create mixtapes with our built-in editor. Tag plays by type — dunks, assists, blocks, three-pointers, and more.',
    },
    {
      id: 'bb-analytics',
      icon: 'bar-chart-outline',
      title: 'Recruiting Analytics',
      description:
        'See which coaches viewed your profile, how many times your film was watched, and how your stock is trending week over week.',
    },
    {
      id: 'bb-exposure',
      icon: 'shield-outline',
      title: 'AAU & Showcase Exposure',
      description:
        "Get your profile in front of college coaches through NXT1's AAU, showcase, and camp network — year-round exposure beyond your school season.",
    },
    {
      id: 'bb-college',
      icon: 'school-outline',
      title: 'College Search',
      description:
        'Filter 1,100+ college basketball programs by division, conference, play style, location, and academic fit.',
    },
    {
      id: 'bb-messaging',
      icon: 'mail-outline',
      title: 'Coach Messaging',
      description:
        'Send and receive compliant messages with college coaching staffs directly inside NXT1. No more missed DMs or lost emails.',
    },
  ],

  audienceTitle: 'Every Level of Basketball',
  audienceSubtitle:
    'From middle school prospects to college transfers, NXT1 is your basketball recruiting home.',
  audiences: [
    {
      id: 'bb-hs',
      icon: 'basketball-outline',
      title: 'High School Basketball',
      description:
        "Build your recruiting profile starting freshman year. Track your development from JV to varsity and get on college coaches' radars.",
    },
    {
      id: 'bb-aau',
      icon: 'trophy-outline',
      title: 'AAU & Travel Ball',
      description:
        'Showcase your AAU, travel, and showcase performances alongside your school season. College coaches want to see your year-round game.',
    },
    {
      id: 'bb-transfer',
      icon: 'school-outline',
      title: 'Transfer Portal',
      description:
        'Already in college? Manage your transfer portal profile and connect with programs looking for experienced players ready to contribute.',
    },
  ],

  faqTitle: 'Basketball Recruiting FAQs',
  faqSubtitle: 'Common questions from basketball athletes and families.',
  faqs: [
    {
      id: 'bb-faq-free',
      question: 'Is NXT1 free for basketball players?',
      answer:
        'Yes! Every basketball athlete gets a free recruiting profile with unlimited highlight uploads. Premium tiers add advanced analytics, priority coach visibility, and AI scouting reports.',
    },
    {
      id: 'bb-faq-find',
      question: 'How do college basketball coaches find me?',
      answer:
        "Coaches use NXT1's search tools to filter athletes by position, class year, location, measurables, and film. A complete profile with highlights dramatically increases your chances.",
    },
    {
      id: 'bb-faq-film',
      question: 'Can I upload AAU and travel ball film?',
      answer:
        'Absolutely. Upload film from any league, tournament, or camp. NXT1 accepts MP4, MOV, and links from YouTube, Hudl, and Vimeo.',
    },
    {
      id: 'bb-faq-start',
      question: 'When should I start my basketball recruiting profile?',
      answer:
        'Many successful recruits start in 7th or 8th grade. The earlier you build your profile and upload film, the more data coaches have when they start evaluating your class.',
    },
    {
      id: 'bb-faq-girls',
      question: "Does NXT1 support women's basketball recruiting?",
      answer:
        "Yes — NXT1 is for all basketball athletes regardless of gender. Our search tools let coaches filter by boys' and girls' basketball programs separately.",
    },
  ],

  ctaTitle: 'Ready to Get Recruited for Basketball?',
  ctaSubtitle:
    'Join 40,000+ basketball athletes already using NXT1 to build their recruiting profile and connect with college coaches.',
  ctaLabel: 'Create Free Profile',
  ctaRoute: '/auth/register',

  seoTitle: 'Basketball Recruiting — Build Your Profile | NXT1',
  seoDescription:
    'The #1 basketball recruiting platform. Build a free recruiting profile, upload game film, track analytics, and connect with 1,100+ college basketball programs on NXT1.',

  previewSportLabel: 'Basketball',
  previewHighlights: [
    { id: 'bb-h1', title: 'AAU Season Mixtape', views: '3.2K', duration: '4:05' },
    { id: 'bb-h2', title: 'Varsity Highlights', views: '2.1K', duration: '2:48' },
  ],
  previewRankings: [
    { rank: 1, name: 'Malik Jefferson', position: 'PG', classYear: '2026', rating: '98' },
    { rank: 2, name: 'Andre Mitchell', position: 'SG', classYear: '2026', rating: '96' },
    { rank: 3, name: 'Devon Harris', position: 'SF', classYear: '2027', rating: '95' },
    { rank: 4, name: 'Isaiah Stewart', position: 'PF', classYear: '2026', rating: '93' },
    { rank: 5, name: 'Tyrone Williams', position: 'C', classYear: '2027', rating: '92' },
  ],
};

// ============================================
// REGISTRY
// ============================================

/** All sport landing configs keyed by slug. */
export const SPORT_LANDING_CONFIGS: Readonly<Record<string, SportLandingConfig>> = {
  football: FOOTBALL_CONFIG,
  basketball: BASKETBALL_CONFIG,
};

/** Ordered list of supported sport slugs (for sitemap/nav). */
export const SPORT_LANDING_SLUGS: readonly string[] = Object.keys(SPORT_LANDING_CONFIGS);

/**
 * Look up a sport landing config by slug.
 * Returns `undefined` for unknown slugs so the caller can 404.
 */
export function getSportLandingConfig(slug: string): SportLandingConfig | undefined {
  return SPORT_LANDING_CONFIGS[slug.toLowerCase()];
}
