/**
 * @fileoverview Help Center Service - State Management
 * @module @nxt1/ui/help-center
 * @version 2.0.0
 *
 * Signal-based state management for Help Center feature.
 * Clean, minimal implementation following 2026 patterns.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, signal, computed } from '@angular/core';
import type { HelpCategory, HelpArticle, FaqItem, HelpCategoryId } from '@nxt1/core';
import { HELP_CATEGORIES } from '@nxt1/core';

// ============================================
// MOCK DATA - Professional placeholder content
// ============================================

const MOCK_ARTICLES: HelpArticle[] = [
  {
    id: 'getting-started-1',
    slug: 'how-to-create-your-profile',
    title: 'How to Create Your Profile',
    excerpt: 'Learn how to set up your NXT1 profile and start your recruiting journey.',
    content: '<p>Getting started with NXT1 is easy...</p>',
    type: 'guide',
    category: 'getting-started',
    tags: ['profile', 'setup', 'beginner'],
    targetUsers: ['athlete', 'coach', 'parent'],
    readingTimeMinutes: 5,
    publishedAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
    viewCount: 1250,
    helpfulCount: 89,
    notHelpfulCount: 3,
    isFeatured: true,
  },
  {
    id: 'getting-started-2',
    slug: 'uploading-your-first-video',
    title: 'Uploading Your First Highlight Video',
    excerpt: 'Step-by-step guide to uploading and showcasing your best highlights.',
    content: '<p>Videos are essential for recruiting...</p>',
    type: 'tutorial',
    category: 'videos',
    tags: ['video', 'upload', 'highlights'],
    targetUsers: ['athlete'],
    readingTimeMinutes: 3,
    publishedAt: '2026-01-10T00:00:00Z',
    updatedAt: '2026-01-12T00:00:00Z',
    viewCount: 980,
    helpfulCount: 76,
    notHelpfulCount: 2,
    isFeatured: true,
  },
  {
    id: 'recruiting-1',
    slug: 'understanding-ncaa-rules',
    title: 'Understanding NCAA Recruiting Rules',
    excerpt: 'Everything you need to know about NCAA recruiting guidelines and timelines.',
    content: '<p>NCAA recruiting has specific rules...</p>',
    type: 'article',
    category: 'recruiting',
    tags: ['ncaa', 'rules', 'recruiting'],
    targetUsers: ['athlete', 'parent', 'coach'],
    readingTimeMinutes: 8,
    publishedAt: '2026-01-08T00:00:00Z',
    updatedAt: '2026-01-08T00:00:00Z',
    viewCount: 2100,
    helpfulCount: 156,
    notHelpfulCount: 5,
    isFeatured: true,
  },
  {
    id: 'profile-1',
    slug: 'optimizing-your-athlete-profile',
    title: 'Optimizing Your Athlete Profile',
    excerpt: 'Tips and best practices for making your profile stand out to coaches.',
    content: '<p>Your profile is your digital first impression...</p>',
    type: 'guide',
    category: 'profile',
    tags: ['profile', 'optimization', 'tips'],
    targetUsers: ['athlete'],
    readingTimeMinutes: 6,
    publishedAt: '2026-01-05T00:00:00Z',
    updatedAt: '2026-01-05T00:00:00Z',
    viewCount: 1850,
    helpfulCount: 134,
    notHelpfulCount: 4,
  },
  {
    id: 'subscription-1',
    slug: 'premium-features-explained',
    title: 'Premium Features Explained',
    excerpt: 'Discover all the benefits included with your NXT1 Premium subscription.',
    content: '<p>NXT1 Premium unlocks powerful features...</p>',
    type: 'article',
    category: 'subscription',
    tags: ['premium', 'subscription', 'features'],
    targetUsers: ['all'],
    readingTimeMinutes: 4,
    publishedAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-01-03T00:00:00Z',
    viewCount: 890,
    helpfulCount: 67,
    notHelpfulCount: 2,
  },
  {
    id: 'coaches-1',
    slug: 'coach-recruitment-tools',
    title: 'Using Coach Recruitment Tools',
    excerpt: 'How to effectively use NXT1 to find and evaluate potential recruits.',
    content: '<p>Our coach tools make recruiting easier...</p>',
    type: 'guide',
    category: 'coaches',
    tags: ['coach', 'recruiting', 'tools'],
    targetUsers: ['coach'],
    readingTimeMinutes: 7,
    publishedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    viewCount: 650,
    helpfulCount: 48,
    notHelpfulCount: 1,
  },
];

const MOCK_FAQS: FaqItem[] = [
  {
    id: 'faq-1',
    question: 'How do I reset my password?',
    answer:
      '<p>Go to Settings > Account > Change Password. You can also use the "Forgot Password" link on the login screen.</p>',
    category: 'account',
    targetUsers: ['all'],
    order: 1,
    helpfulCount: 234,
  },
  {
    id: 'faq-2',
    question: 'Can coaches see my profile without Premium?',
    answer:
      '<p>Yes, coaches can view basic profile information. Premium unlocks enhanced visibility, priority placement in search results, and direct messaging.</p>',
    category: 'recruiting',
    targetUsers: ['athlete', 'parent'],
    order: 2,
    helpfulCount: 189,
  },
  {
    id: 'faq-3',
    question: 'What video formats are supported?',
    answer:
      '<p>We support MP4, MOV, and WebM formats. Maximum file size is 500MB, and videos should be under 10 minutes for best results.</p>',
    category: 'videos',
    targetUsers: ['athlete'],
    order: 3,
    helpfulCount: 156,
  },
  {
    id: 'faq-4',
    question: 'How do I cancel my subscription?',
    answer:
      '<p>Go to Settings > Subscription > Manage Subscription. You can cancel anytime and retain access until the end of your billing period.</p>',
    category: 'subscription',
    targetUsers: ['all'],
    order: 4,
    helpfulCount: 98,
  },
  {
    id: 'faq-5',
    question: 'Is my personal information secure?',
    answer:
      '<p>Yes, we use industry-standard encryption and never share your personal information with third parties without your consent.</p>',
    category: 'privacy',
    targetUsers: ['all'],
    order: 5,
    helpfulCount: 167,
  },
  {
    id: 'faq-6',
    question: 'How do I add team members?',
    answer:
      '<p>Go to your Team page > Settings > Invite Members. You can invite coaches, staff, and athletes via email.</p>',
    category: 'teams',
    targetUsers: ['coach', 'team-admin'],
    order: 6,
    helpfulCount: 78,
  },
];

@Injectable({ providedIn: 'root' })
export class HelpCenterService {
  // ============================================
  // Private Signals (Never expose directly)
  // ============================================
  private readonly _loading = signal(false);
  private readonly _searchQuery = signal('');
  private readonly _selectedCategory = signal<HelpCategoryId | null>(null);
  private readonly _articles = signal<HelpArticle[]>(MOCK_ARTICLES);
  private readonly _faqs = signal<FaqItem[]>(MOCK_FAQS);

  // ============================================
  // Public Computed Signals
  // ============================================
  readonly loading = computed(() => this._loading());
  readonly searchQuery = computed(() => this._searchQuery());
  readonly selectedCategory = computed(() => this._selectedCategory());

  /** All categories from constants */
  readonly categories = computed<readonly HelpCategory[]>(() => HELP_CATEGORIES);

  /** Featured articles (top 3) */
  readonly featuredArticles = computed(() =>
    this._articles()
      .filter((a) => a.isFeatured)
      .slice(0, 3)
  );

  /** All articles */
  readonly articles = computed(() => this._articles());

  /** All FAQs */
  readonly faqs = computed(() => this._faqs());

  /** Filtered articles based on search and category */
  readonly filteredArticles = computed(() => {
    const query = this._searchQuery().toLowerCase().trim();
    const category = this._selectedCategory();
    let results = this._articles();

    if (category) {
      results = results.filter((a) => a.category === category);
    }

    if (query) {
      results = results.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.excerpt.toLowerCase().includes(query) ||
          a.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    return results;
  });

  /** Filtered FAQs based on search and category */
  readonly filteredFaqs = computed(() => {
    const query = this._searchQuery().toLowerCase().trim();
    const category = this._selectedCategory();
    let results = this._faqs();

    if (category) {
      results = results.filter((f) => f.category === category);
    }

    if (query) {
      results = results.filter(
        (f) => f.question.toLowerCase().includes(query) || f.answer.toLowerCase().includes(query)
      );
    }

    return results;
  });

  /** Popular FAQs (sorted by helpful count) */
  readonly popularFaqs = computed(() =>
    [...this._faqs()].sort((a, b) => b.helpfulCount - a.helpfulCount).slice(0, 5)
  );

  /** Whether there are search results */
  readonly hasResults = computed(
    () => this.filteredArticles().length > 0 || this.filteredFaqs().length > 0
  );

  /** Whether search is active */
  readonly isSearching = computed(() => this._searchQuery().trim().length > 0);

  // ============================================
  // Actions
  // ============================================

  setSearchQuery(query: string): void {
    this._searchQuery.set(query);
  }

  setCategory(categoryId: HelpCategoryId | null): void {
    this._selectedCategory.set(categoryId);
  }

  clearSearch(): void {
    this._searchQuery.set('');
  }

  clearFilters(): void {
    this._searchQuery.set('');
    this._selectedCategory.set(null);
  }

  getArticleById(id: string): HelpArticle | undefined {
    return this._articles().find((a) => a.id === id);
  }

  getArticleBySlug(slug: string): HelpArticle | undefined {
    return this._articles().find((a) => a.slug === slug);
  }

  getCategoryById(id: HelpCategoryId): HelpCategory | undefined {
    return HELP_CATEGORIES.find((c) => c.id === id);
  }

  getArticlesByCategory(categoryId: HelpCategoryId): HelpArticle[] {
    return this._articles().filter((a) => a.category === categoryId);
  }

  getFaqsByCategory(categoryId: HelpCategoryId): FaqItem[] {
    return this._faqs().filter((f) => f.category === categoryId);
  }
}
