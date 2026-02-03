/**
 * @fileoverview Mock News Data for Development
 * @module @nxt1/ui/news/mock-data
 *
 * ⚠️ TEMPORARY FILE - Delete when backend is ready
 *
 * Contains dummy data for News feature during development phase.
 * All data here is fabricated for UI testing purposes only.
 */

import type { NewsArticle, NewsCategoryId, ReadingStats } from '@nxt1/core';

const now = Date.now();

// ============================================
// AI SOURCE MOCK
// ============================================

const MOCK_AI_SOURCE = {
  id: 'agent-x',
  name: 'Agent X',
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=agentx&backgroundColor=ccff00',
  type: 'ai-agent' as const,
  confidenceScore: 95,
  isVerified: true,
};

const MOCK_EDITORIAL_SOURCE = {
  id: 'nxt1-editorial',
  name: 'NXT1 Editorial',
  avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=nxt1&backgroundColor=1a1a1a',
  type: 'editorial' as const,
  isVerified: true,
};

// ============================================
// MOCK ARTICLES BY CATEGORY
// ============================================

const MOCK_RECRUITING_ARTICLES: NewsArticle[] = [
  {
    id: 'rec-001',
    title: '5-Star QB Marcus Thompson Narrows Top Schools to Final 3',
    excerpt:
      "The nation's top quarterback prospect has narrowed his recruitment to Alabama, Ohio State, and Georgia ahead of his decision day.",
    content: `
      <p>Marcus Thompson, the consensus number one quarterback in the 2026 class, has officially cut his list to three schools as he prepares to make his college decision.</p>
      <p>The 6'4" signal-caller from Mater Dei High School in California has been the most sought-after recruit in the country, holding offers from virtually every major program.</p>
      <h2>The Final Three</h2>
      <p>After months of visits and deliberation, Thompson has narrowed his focus to:</p>
      <ul>
        <li><strong>Alabama</strong> - The Crimson Tide have made Thompson their top priority</li>
        <li><strong>Ohio State</strong> - The Buckeyes staff has built a strong relationship</li>
        <li><strong>Georgia</strong> - The defending champions have impressed with their development</li>
      </ul>
      <p>A decision is expected within the next two weeks.</p>
    `,
    category: 'recruiting',
    tags: ['quarterback', '5-star', 'class-of-2026'],
    source: MOCK_AI_SOURCE,
    heroImageUrl: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=400&q=80',
    readingTimeMinutes: 3,
    publishedAt: new Date(now - 1000 * 60 * 30).toISOString(), // 30 mins ago
    isBookmarked: false,
    isRead: false,
    xpReward: 15,
    viewCount: 2847,
    shareCount: 156,
    likeCount: 892,
    isFeatured: true,
    sportContext: {
      sport: 'football',
      colleges: ['Alabama', 'Ohio State', 'Georgia'],
      players: ['Marcus Thompson'],
    },
  },
  {
    id: 'rec-002',
    title: 'Top 100 Rankings Update: New Risers and Fallers for February',
    excerpt:
      'Our recruiting analysts have updated the national rankings with several big movers based on recent camp performances.',
    content: `
      <p>The February rankings update brings significant movement in the top 100, with several prospects making big jumps after impressive showings at winter camps.</p>
      <h2>Biggest Risers</h2>
      <p>Three prospects made the biggest moves this month...</p>
    `,
    category: 'recruiting',
    tags: ['rankings', 'top-100', 'camps'],
    source: MOCK_EDITORIAL_SOURCE,
    heroImageUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&q=80',
    readingTimeMinutes: 5,
    publishedAt: new Date(now - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    isBookmarked: true,
    isRead: false,
    xpReward: 20,
    viewCount: 5621,
    shareCount: 289,
    likeCount: 1456,
    sportContext: {
      sport: 'football',
    },
  },
  {
    id: 'rec-003',
    title: 'Elite 11 Finals Preview: 20 QBs Ready to Compete',
    excerpt:
      'The best high school quarterbacks in the country descend on Los Angeles this weekend for the prestigious Elite 11 Finals.',
    content: `
      <p>The Elite 11 Finals, the premier quarterback competition in high school football, kicks off this weekend in Los Angeles.</p>
      <p>Twenty of the nation's best signal-callers will compete for the coveted Elite 11 title.</p>
    `,
    category: 'recruiting',
    tags: ['elite-11', 'quarterbacks', 'competition'],
    source: MOCK_AI_SOURCE,
    heroImageUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=400&q=80',
    readingTimeMinutes: 4,
    publishedAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
    isBookmarked: false,
    isRead: true,
    readingProgress: 100,
    xpReward: 15,
    viewCount: 3892,
    shareCount: 178,
    likeCount: 967,
    sportContext: {
      sport: 'football',
    },
  },
];

const MOCK_COMMITS_ARTICLES: NewsArticle[] = [
  {
    id: 'com-001',
    title: '4-Star WR Jaylen Carter Commits to USC',
    excerpt:
      'The explosive playmaker from Texas picks the Trojans over Texas and LSU, giving Lincoln Riley another elite weapon.',
    content: `
      <p>Jaylen Carter, a 4-star wide receiver from Allen High School in Texas, has committed to USC.</p>
      <p>The 6'1" speedster chose the Trojans over finalists Texas and LSU after an official visit last weekend.</p>
      <h2>Impact on USC's Class</h2>
      <p>Carter becomes the fifth commitment in USC's 2026 class and their second wide receiver...</p>
    `,
    category: 'commits',
    tags: ['commitment', 'wide-receiver', 'usc'],
    source: MOCK_AI_SOURCE,
    heroImageUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&q=80',
    readingTimeMinutes: 2,
    publishedAt: new Date(now - 1000 * 60 * 45).toISOString(), // 45 mins ago
    isBookmarked: false,
    isRead: false,
    xpReward: 10,
    viewCount: 1523,
    shareCount: 87,
    likeCount: 445,
    isBreaking: true,
    sportContext: {
      sport: 'football',
      colleges: ['USC', 'Texas', 'LSU'],
      players: ['Jaylen Carter'],
    },
  },
  {
    id: 'com-002',
    title: 'Duke Lands Top-50 Point Guard in Major Recruiting Win',
    excerpt:
      'The Blue Devils secure their backcourt of the future with the commitment of Jordan Williams.',
    content: `
      <p>Duke basketball has landed a major commitment as Jordan Williams, a top-50 point guard, announced his decision to play for the Blue Devils.</p>
    `,
    category: 'commits',
    tags: ['commitment', 'basketball', 'duke'],
    source: MOCK_AI_SOURCE,
    heroImageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&q=80',
    readingTimeMinutes: 3,
    publishedAt: new Date(now - 1000 * 60 * 60 * 8).toISOString(), // 8 hours ago
    isBookmarked: false,
    isRead: false,
    xpReward: 15,
    viewCount: 2156,
    shareCount: 134,
    likeCount: 678,
    sportContext: {
      sport: 'basketball',
      colleges: ['Duke'],
      players: ['Jordan Williams'],
    },
  },
];

const MOCK_TRANSFERS_ARTICLES: NewsArticle[] = [
  {
    id: 'tra-001',
    title: 'Transfer Portal Tracker: Top 25 Available Players Right Now',
    excerpt: 'With the spring portal window open, we track the best players looking for new homes.',
    content: `
      <p>The spring transfer portal window has opened, and some big names are looking for new opportunities.</p>
      <p>Here are the top 25 available players in the portal right now:</p>
    `,
    category: 'transfers',
    tags: ['transfer-portal', 'tracker', 'rankings'],
    source: MOCK_EDITORIAL_SOURCE,
    heroImageUrl: 'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=400&q=80',
    readingTimeMinutes: 6,
    publishedAt: new Date(now - 1000 * 60 * 60 * 4).toISOString(), // 4 hours ago
    isBookmarked: true,
    isRead: false,
    xpReward: 25,
    viewCount: 8934,
    shareCount: 567,
    likeCount: 2341,
    isFeatured: true,
    sportContext: {
      sport: 'football',
    },
  },
  {
    id: 'tra-002',
    title: 'Former 5-Star DE Announces Transfer to Michigan',
    excerpt:
      'After two seasons at Florida, the talented pass rusher is heading north to join the Wolverines.',
    content: `
      <p>Marcus Johnson, a former 5-star defensive end, has announced his transfer to Michigan after entering the portal from Florida.</p>
    `,
    category: 'transfers',
    tags: ['transfer', 'defensive-end', 'michigan'],
    source: MOCK_AI_SOURCE,
    heroImageUrl: 'https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=400&q=80',
    readingTimeMinutes: 3,
    publishedAt: new Date(now - 1000 * 60 * 60 * 12).toISOString(), // 12 hours ago
    isBookmarked: false,
    isRead: false,
    xpReward: 15,
    viewCount: 4521,
    shareCount: 234,
    likeCount: 1123,
    sportContext: {
      sport: 'football',
      colleges: ['Michigan', 'Florida'],
      players: ['Marcus Johnson'],
    },
  },
];

const MOCK_COLLEGE_ARTICLES: NewsArticle[] = [
  {
    id: 'col-001',
    title: 'College Football Playoff Expansion: What It Means for Recruiting',
    excerpt:
      'The expanded playoff format is already changing how teams approach recruiting. We break down the impact.',
    content: `
      <p>The College Football Playoff expansion to 12 teams is reshaping the recruiting landscape in significant ways.</p>
      <h2>More Opportunities</h2>
      <p>With more teams having a realistic shot at the playoff, recruiting pitches are changing...</p>
    `,
    category: 'college',
    tags: ['cfp', 'analysis', 'recruiting-impact'],
    source: MOCK_EDITORIAL_SOURCE,
    heroImageUrl: 'https://images.unsplash.com/photo-1461896836934- voices-of-ai?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&q=80',
    readingTimeMinutes: 7,
    publishedAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    isBookmarked: false,
    isRead: true,
    readingProgress: 100,
    xpReward: 25,
    viewCount: 12456,
    shareCount: 789,
    likeCount: 3456,
    sportContext: {
      sport: 'football',
    },
  },
  {
    id: 'col-002',
    title: 'March Madness Bracket Predictions: Early Look at the Field',
    excerpt:
      'Conference tournaments are approaching. Here are our early bracket predictions for the NCAA Tournament.',
    content: `
      <p>With conference tournaments just weeks away, it's time to start thinking about March Madness seeding.</p>
    `,
    category: 'college',
    tags: ['basketball', 'march-madness', 'predictions'],
    source: MOCK_AI_SOURCE,
    heroImageUrl: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=400&q=80',
    readingTimeMinutes: 5,
    publishedAt: new Date(now - 1000 * 60 * 60 * 36).toISOString(), // 1.5 days ago
    isBookmarked: false,
    isRead: false,
    xpReward: 20,
    viewCount: 7823,
    shareCount: 456,
    likeCount: 2134,
    sportContext: {
      sport: 'basketball',
    },
  },
];

const MOCK_HIGHLIGHTS_ARTICLES: NewsArticle[] = [
  {
    id: 'hig-001',
    title: 'Top 10 Plays of the Week: Incredible Catches and Runs',
    excerpt:
      'From one-handed grabs to 99-yard touchdown runs, here are the best plays from this week in high school football.',
    content: `
      <p>Every week we compile the most impressive plays from high school fields across the country.</p>
      <p>This week's collection features some truly jaw-dropping athleticism.</p>
    `,
    category: 'highlights',
    tags: ['top-plays', 'highlights', 'weekly'],
    source: MOCK_AI_SOURCE,
    heroImageUrl: 'https://images.unsplash.com/photo-1570498839593-e565b39455fc?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1570498839593-e565b39455fc?w=400&q=80',
    readingTimeMinutes: 2,
    publishedAt: new Date(now - 1000 * 60 * 60 * 6).toISOString(), // 6 hours ago
    isBookmarked: false,
    isRead: false,
    xpReward: 10,
    viewCount: 15678,
    shareCount: 1234,
    likeCount: 5678,
    isFeatured: true,
    sportContext: {
      sport: 'football',
    },
  },
];

const MOCK_PRO_ARTICLES: NewsArticle[] = [
  {
    id: 'pro-001',
    title: 'NFL Draft: Early Mock Draft 1.0 for 2026',
    excerpt:
      "Way-too-early predictions for next year's NFL Draft, including surprise risers and projected top picks.",
    content: `
      <p>It's never too early to look ahead to the NFL Draft. Here's our first mock draft for 2026.</p>
    `,
    category: 'pro',
    tags: ['nfl-draft', 'mock-draft', 'predictions'],
    source: MOCK_EDITORIAL_SOURCE,
    heroImageUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&q=80',
    readingTimeMinutes: 8,
    publishedAt: new Date(now - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    isBookmarked: true,
    isRead: false,
    xpReward: 30,
    viewCount: 9876,
    shareCount: 654,
    likeCount: 3210,
    sportContext: {
      sport: 'football',
    },
  },
];

// ============================================
// COMBINED MOCK DATA
// ============================================

/**
 * All mock articles combined and sorted by date.
 */
function getAllMockArticles(): NewsArticle[] {
  const allArticles: NewsArticle[] = [
    ...MOCK_RECRUITING_ARTICLES,
    ...MOCK_COMMITS_ARTICLES,
    ...MOCK_TRANSFERS_ARTICLES,
    ...MOCK_COLLEGE_ARTICLES,
    ...MOCK_HIGHLIGHTS_ARTICLES,
    ...MOCK_PRO_ARTICLES,
  ];
  // Sort by publishedAt descending (most recent first)
  return allArticles.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

// ============================================
// EXPORT MOCK DATA
// ============================================

/**
 * Export all mock articles.
 */
export const MOCK_NEWS_ARTICLES: NewsArticle[] = getAllMockArticles();

/**
 * Get mock articles by category.
 */
export function getMockArticlesByCategory(category: NewsCategoryId): NewsArticle[] {
  if (category === 'for-you') {
    // Return personalized feed (all articles for demo)
    return MOCK_NEWS_ARTICLES;
  }
  if (category === 'saved') {
    // Return bookmarked articles
    return MOCK_NEWS_ARTICLES.filter((a) => a.isBookmarked);
  }
  return MOCK_NEWS_ARTICLES.filter((a) => a.category === category);
}

/**
 * Get mock article by ID.
 */
export function getMockArticleById(id: string): NewsArticle | undefined {
  return MOCK_NEWS_ARTICLES.find((a) => a.id === id);
}

/**
 * Get mock article count per category.
 */
export function getMockArticleCount(category: NewsCategoryId): number {
  return getMockArticlesByCategory(category).length;
}

/**
 * Get mock unread count per category.
 */
export function getMockUnreadCount(category: NewsCategoryId): number {
  return getMockArticlesByCategory(category).filter((a) => !a.isRead).length;
}

/**
 * Mock badge counts for each category.
 */
export const MOCK_NEWS_BADGE_COUNTS: Record<NewsCategoryId, number> = {
  'for-you': 5,
  recruiting: 3,
  college: 2,
  pro: 1,
  highlights: 1,
  transfers: 2,
  commits: 1,
  saved: 0,
};

/**
 * Mock reading stats.
 */
export const MOCK_READING_STATS: ReadingStats = {
  totalArticlesRead: 47,
  totalXpEarned: 705,
  currentStreak: 5,
  longestStreak: 12,
  totalReadingTimeMinutes: 156,
  articlesPerCategory: {
    'for-you': 15,
    recruiting: 12,
    college: 8,
    pro: 5,
    highlights: 4,
    transfers: 2,
    commits: 1,
    saved: 0,
  },
  lastReadDate: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
};

/**
 * Get mock featured articles.
 */
export function getMockFeaturedArticles(): NewsArticle[] {
  return MOCK_NEWS_ARTICLES.filter((a) => a.isFeatured);
}

/**
 * Get mock trending articles.
 */
export function getMockTrendingArticles(limit: number = 5): NewsArticle[] {
  return [...MOCK_NEWS_ARTICLES].sort((a, b) => b.viewCount - a.viewCount).slice(0, limit);
}

/**
 * Get mock related articles.
 */
export function getMockRelatedArticles(articleId: string, limit: number = 3): NewsArticle[] {
  const article = getMockArticleById(articleId);
  if (!article) return [];

  return MOCK_NEWS_ARTICLES.filter(
    (a) => a.id !== articleId && a.category === article.category
  ).slice(0, limit);
}
