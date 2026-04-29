/**
 * @fileoverview Help Center Service
 * @module @nxt1/backend/services/help-center
 *
 * Business logic for help center: articles, FAQs, search, feedback.
 * Uses MongoDB via Mongoose + Redis caching via @nxt1/cache.
 *
 * ✅ Redis caching with HELP_CACHE_KEYS / HELP_CACHE_TTL from @nxt1/core
 * ✅ Structured logging
 * ✅ Input validation via @nxt1/core validators
 */

import { getCacheService, generateCacheKey } from '../core/cache.service.js';
import { logger } from '../../utils/logger.js';
import {
  HELP_CATEGORIES,
  HELP_QUICK_ACTIONS,
  HELP_CACHE_KEYS,
  HELP_CACHE_TTL,
  HELP_PAGINATION_DEFAULTS,
  HELP_SUPPORT_CONFIG,
  validateSupportTicket,
} from '@nxt1/core';
import type {
  HelpCategoryId,
  HelpContentType,
  HelpArticle,
  FaqItem,
  HelpCenterHome,
  HelpCategoryDetail,
  HelpSearchResponse,
  HelpSearchResult,
  HelpSearchFilter,
  HelpPagination,
  SupportTicket,
  SupportTicketRequest,
} from '@nxt1/core';
import { getHelpArticleModel } from '../../models/help-center/help-article.model.js';
import { getHelpFaqModel } from '../../models/help-center/help-faq.model.js';
import { getArticleFeedbackModel } from '../../models/help-center/article-feedback.model.js';
import { getSupportTicketModel } from '../../models/help-center/support-ticket.model.js';
import { sendPlatformEmail } from '../communications/platform-email.service.js';

// ============================================
// CACHE CONFIG
// ============================================

const getCache = () => getCacheService();

/** Convert ms TTL to seconds for Redis */
function ttlSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

// ============================================
// HELPERS
// ============================================

/** Convert Mongoose document to HelpArticle */
function toArticle(doc: unknown): HelpArticle {
  const obj =
    typeof (doc as { toObject?: () => unknown }).toObject === 'function'
      ? (doc as { toObject: () => Record<string, unknown> }).toObject()
      : (doc as Record<string, unknown>);
  const { _id, isPublished: _isPublished, __v, ...rest } = obj;
  return { id: String(_id), ...rest } as HelpArticle;
}

/** Convert Mongoose document to FaqItem */
function toFaq(doc: unknown): FaqItem {
  const obj =
    typeof (doc as { toObject?: () => unknown }).toObject === 'function'
      ? (doc as { toObject: () => Record<string, unknown> }).toObject()
      : (doc as Record<string, unknown>);
  const { _id, isPublished: _isPublished2, __v, ...rest } = obj;
  return { id: String(_id), ...rest } as FaqItem;
}

/** Build user-type filter for MongoDB queries */
// Role filtering removed — all content is open and public.
function userTypeFilter(_userType?: string): Record<string, unknown> {
  return {};
}

function formatSupportEmailHtml(ticket: SupportTicket): string {
  const attachmentsHtml = (ticket.attachments ?? [])
    .map((url) => `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></li>`)
    .join('');

  return [
    '<h2>New NXT1 Support Ticket</h2>',
    `<p><strong>Ticket:</strong> ${ticket.ticketNumber}</p>`,
    `<p><strong>Status:</strong> ${ticket.status}</p>`,
    `<p><strong>Priority:</strong> ${ticket.priority}</p>`,
    `<p><strong>Category:</strong> ${ticket.category}</p>`,
    `<p><strong>From:</strong> ${ticket.name} (${ticket.email})</p>`,
    `<p><strong>Subject:</strong> ${ticket.subject}</p>`,
    `<p><strong>Submitted:</strong> ${ticket.createdAt}</p>`,
    `<p><strong>Description:</strong></p>`,
    `<pre style="white-space:pre-wrap;font-family:inherit">${ticket.description}</pre>`,
    attachmentsHtml ? `<p><strong>Attachments:</strong></p><ul>${attachmentsHtml}</ul>` : '',
  ].join('');
}

function formatSupportAckHtml(ticket: SupportTicket): string {
  return [
    `<p>Hi ${ticket.name},</p>`,
    '<p>We received your support request and created a ticket for our team.</p>',
    '<ul>',
    `<li><strong>Ticket Number:</strong> ${ticket.ticketNumber}</li>`,
    `<li><strong>Subject:</strong> ${ticket.subject}</li>`,
    `<li><strong>Priority:</strong> ${ticket.priority}</li>`,
    `<li><strong>Estimated Response Time:</strong> ${ticket.estimatedResponseTime ?? '1-2 business days'}</li>`,
    '</ul>',
    '<p>You can reply to this email with any additional context.</p>',
    '<p>Team NXT1 Support</p>',
  ].join('');
}

function buildTicketNumber(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `NXT-${year}${month}${day}-${rand}`;
}

export class SupportTicketValidationError extends Error {
  readonly details: readonly string[];

  constructor(details: readonly string[]) {
    super(details.join(', '));
    this.name = 'SupportTicketValidationError';
    this.details = details;
  }
}

// ============================================
// SERVICE FUNCTIONS
// ============================================

/**
 * Get help center home/landing page data.
 * Returns popular articles, categories with counts, top FAQs, quick actions.
 */
export async function getHome(): Promise<HelpCenterHome> {
  const HelpArticleModel = getHelpArticleModel();
  const HelpFaqModel = getHelpFaqModel();
  const cacheKey = HELP_CACHE_KEYS.HOME;

  // Try cache
  const cache = getCache();
  const cached = await cache.get<HelpCenterHome>(cacheKey);
  if (cached) {
    logger.info('[HelpCenter] ✅ Home cache HIT');
    return cached;
  }

  logger.info('[HelpCenter] ❌ Home cache MISS');

  const baseFilter = { isPublished: true };

  // Fetch in parallel
  const [popularDocs, featuredDocs, faqDocs, categoryCounts] = await Promise.all([
    HelpArticleModel.find(baseFilter).sort({ viewCount: -1 }).limit(6).lean(),
    HelpArticleModel.find({ ...baseFilter, isFeatured: true })
      .sort({ publishedAt: -1 })
      .limit(3)
      .lean(),
    HelpFaqModel.find({ isPublished: true }).sort({ order: 1 }).limit(10).lean(),
    HelpArticleModel.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
  ]);

  const countMap = new Map(
    categoryCounts.map((c: { _id: string; count: number }) => [c._id, c.count])
  );

  const home: HelpCenterHome = {
    featuredArticles: featuredDocs.map(toArticle),
    popularArticles: popularDocs.map(toArticle),
    latestVideos: [],
    categories: HELP_CATEGORIES.map((cat) => ({
      ...cat,
      articleCount: (countMap.get(cat.id) as number) ?? 0,
    })),
    topFaqs: faqDocs.map(toFaq),
    quickActions: [...HELP_QUICK_ACTIONS],
  };

  await cache.set(cacheKey, home, { ttl: ttlSeconds(HELP_CACHE_TTL.HOME) });
  logger.debug('[HelpCenter] ✅ Home cached');

  return home;
}

/**
 * Get category detail with paginated articles and FAQs.
 */
export async function getCategoryDetail(
  categoryId: HelpCategoryId,
  page: number = HELP_PAGINATION_DEFAULTS.INITIAL_PAGE,
  limit: number = HELP_PAGINATION_DEFAULTS.LIMIT
): Promise<HelpCategoryDetail | null> {
  const HelpArticleModel = getHelpArticleModel();
  const HelpFaqModel = getHelpFaqModel();
  const category = HELP_CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return null;

  const cacheKey = generateCacheKey(`${HELP_CACHE_KEYS.CATEGORY}${categoryId}`, { page, limit });

  const cache = getCache();
  const cached = await cache.get<HelpCategoryDetail>(cacheKey);
  if (cached) {
    logger.info('[HelpCenter] ✅ Category cache HIT', { categoryId });
    return cached;
  }

  logger.info('[HelpCenter] ❌ Category cache MISS', { categoryId });

  const baseFilter = { category: categoryId, isPublished: true };
  const skip = (page - 1) * limit;

  const [articles, totalArticles, faqs] = await Promise.all([
    HelpArticleModel.find(baseFilter).sort({ publishedAt: -1 }).skip(skip).limit(limit).lean(),
    HelpArticleModel.countDocuments(baseFilter),
    HelpFaqModel.find({ category: categoryId, isPublished: true }).sort({ order: 1 }).lean(),
  ]);

  const totalPages = Math.ceil(totalArticles / limit);

  const pagination: HelpPagination = {
    page,
    limit,
    total: totalArticles,
    totalPages,
    hasMore: page < totalPages,
  };

  const detail: HelpCategoryDetail = {
    category: { ...category, articleCount: totalArticles },
    articles: articles.map(toArticle),
    faqs: faqs.map(toFaq),
    totalArticles,
    pagination,
  };

  await cache.set(cacheKey, detail, { ttl: ttlSeconds(HELP_CACHE_TTL.CATEGORY) });
  return detail;
}

/**
 * Get a single article by slug. Increments view count.
 */
export async function getArticle(slug: string): Promise<HelpArticle | null> {
  const HelpArticleModel = getHelpArticleModel();
  if (!slug) return null;

  const cacheKey = `${HELP_CACHE_KEYS.ARTICLE}${slug}`;
  const cache = getCache();
  const cached = await cache.get<HelpArticle>(cacheKey);
  if (cached) {
    // Increment view count in background (don't block response)
    HelpArticleModel.updateOne({ slug }, { $inc: { viewCount: 1 } }).catch((err) =>
      logger.error('[HelpCenter] Failed to increment view count', { slug, error: String(err) })
    );
    logger.info('[HelpCenter] ✅ Article cache HIT', { slug });
    return cached;
  }

  logger.info('[HelpCenter] ❌ Article cache MISS', { slug });

  const doc = await HelpArticleModel.findOneAndUpdate(
    { slug, isPublished: true },
    { $inc: { viewCount: 1 } },
    { returnDocument: 'after' }
  ).lean();

  if (!doc) return null;

  const article = toArticle(doc);
  await cache.set(cacheKey, article, { ttl: ttlSeconds(HELP_CACHE_TTL.ARTICLE) });
  return article;
}

/**
 * Search help center content (articles + FAQs).
 */
export async function search(filter: HelpSearchFilter): Promise<HelpSearchResponse> {
  const HelpArticleModel = getHelpArticleModel();
  const HelpFaqModel = getHelpFaqModel();
  const { query, categories, types, page, limit } = {
    page: HELP_PAGINATION_DEFAULTS.INITIAL_PAGE,
    limit: HELP_PAGINATION_DEFAULTS.LIMIT,
    ...filter,
  };

  if (!query || query.trim().length < 2) {
    return {
      results: [],
      total: 0,
      query: query ?? '',
      filters: filter,
      pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
    };
  }

  const skip = (page - 1) * limit;

  // Build article query
  const articleQuery: Record<string, unknown> = {
    $text: { $search: query },
    isPublished: true,
  };

  if (categories?.length) {
    articleQuery['category'] = { $in: categories };
  }
  if (types?.length) {
    articleQuery['type'] = { $in: types };
  }

  // Build FAQ query
  const faqQuery: Record<string, unknown> = {
    $text: { $search: query },
    isPublished: true,
  };
  if (categories?.length) {
    faqQuery['category'] = { $in: categories };
  }

  const [articleDocs, faqDocs] = await Promise.all([
    HelpArticleModel.find(articleQuery, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean(),
    HelpFaqModel.find(faqQuery, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean(),
  ]);

  // Merge results, articles first
  const results: HelpSearchResult[] = [
    ...articleDocs.map((doc) => {
      const article = toArticle(doc);
      const docScore = (doc as unknown as Record<string, number>)['score'] ?? 0;
      return {
        id: article.id,
        title: article.title,
        excerpt: article.excerpt,
        type: article.type,
        category: article.category,
        slug: article.slug,
        score: docScore,
        thumbnailUrl: article.thumbnailUrl,
      } satisfies HelpSearchResult;
    }),
    ...faqDocs.map((doc) => {
      const faq = toFaq(doc);
      const docScore = (doc as unknown as Record<string, number>)['score'] ?? 0;
      return {
        id: faq.id,
        title: faq.question,
        excerpt: faq.answer.replace(/<[^>]+>/g, '').slice(0, 150),
        type: 'faq' as HelpContentType,
        category: faq.category,
        slug: `faq-${faq.id}`,
        score: docScore,
      } satisfies HelpSearchResult;
    }),
  ];

  // Sort by relevance
  results.sort((a, b) => b.score - a.score);

  const paged = results.slice(skip, skip + limit);
  const total = results.length;
  const totalPages = Math.ceil(total / limit);

  return {
    results: paged,
    total,
    query,
    filters: filter,
    suggestions: [],
    pagination: { page, limit, total, totalPages, hasMore: page < totalPages },
  };
}

/**
 * Submit article feedback (helpful / not helpful).
 * Upserts feedback and updates article counters atomically.
 */
export async function submitFeedback(
  articleId: string,
  userId: string,
  isHelpful: boolean,
  feedback?: string
): Promise<{ updated: boolean }> {
  const ArticleFeedbackModel = getArticleFeedbackModel();
  const HelpArticleModel = getHelpArticleModel();
  logger.info('[HelpCenter] Submitting feedback', { articleId, userId, isHelpful });

  // Upsert user feedback
  const existing = await ArticleFeedbackModel.findOne({ articleId, userId });
  const previousWasHelpful = existing?.isHelpful;

  await ArticleFeedbackModel.findOneAndUpdate(
    { articleId, userId },
    { isHelpful, feedback, createdAt: new Date().toISOString() },
    { upsert: true }
  );

  // Update article counters
  if (existing) {
    // Changing vote: decrement old, increment new
    if (previousWasHelpful !== isHelpful) {
      await HelpArticleModel.updateOne(
        { _id: articleId },
        {
          $inc: {
            helpfulCount: isHelpful ? 1 : -1,
            notHelpfulCount: isHelpful ? -1 : 1,
          },
        }
      );
    }
  } else {
    // New vote
    await HelpArticleModel.updateOne(
      { _id: articleId },
      { $inc: isHelpful ? { helpfulCount: 1 } : { notHelpfulCount: 1 } }
    );
  }

  // Invalidate article cache
  const article = await HelpArticleModel.findById(articleId).select('slug').lean();
  if (article?.slug) {
    const cache = getCache();
    await cache.del(`${HELP_CACHE_KEYS.ARTICLE}${article.slug}`);
  }

  logger.info('[HelpCenter] ✅ Feedback submitted', { articleId, userId, isHelpful });
  return { updated: true };
}

/**
 * Get FAQs, optionally filtered by category and user type.
 */
export async function getFaqs(categoryId?: HelpCategoryId, userType?: string): Promise<FaqItem[]> {
  const HelpFaqModel = getHelpFaqModel();
  const cacheKey = generateCacheKey(HELP_CACHE_KEYS.FAQS, { categoryId, userType });

  const cache = getCache();
  const cached = await cache.get<FaqItem[]>(cacheKey);
  if (cached) {
    logger.info('[HelpCenter] ✅ FAQs cache HIT', { categoryId });
    return cached;
  }

  const filter: Record<string, unknown> = { isPublished: true, ...userTypeFilter(userType) };
  if (categoryId) filter['category'] = categoryId;

  const docs = await HelpFaqModel.find(filter).sort({ order: 1 }).lean();
  const faqs = docs.map(toFaq);

  await cache.set(cacheKey, faqs, { ttl: ttlSeconds(HELP_CACHE_TTL.FAQS) });
  return faqs;
}

/**
 * Create a support ticket and notify support inbox.
 */
export async function submitSupportTicket(
  input: SupportTicketRequest & { readonly userId?: string }
): Promise<SupportTicket> {
  const SupportTicketModel = getSupportTicketModel();
  const now = new Date();
  const createdAt = now.toISOString();

  const normalized: SupportTicketRequest = {
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    subject: input.subject.trim(),
    category: input.category,
    priority: input.priority,
    description: input.description.trim(),
    attachments: (input.attachments ?? []).map((url) => url.trim()),
    relatedArticleId: input.relatedArticleId?.trim() || undefined,
    deviceInfo: input.deviceInfo?.trim() || undefined,
  };

  const validation = validateSupportTicket(normalized);
  if (!validation.isValid) {
    throw new SupportTicketValidationError(validation.errors.map((error) => error.message));
  }

  const priority = normalized.priority ?? 'medium';
  const estimatedResponseTime = HELP_SUPPORT_CONFIG.responseTimeEstimates[priority];
  const ticketNumber = buildTicketNumber(now);

  const createdDoc = await SupportTicketModel.create({
    ticketNumber,
    status: 'open',
    email: normalized.email,
    name: normalized.name,
    subject: normalized.subject,
    category: normalized.category,
    priority,
    description: normalized.description,
    attachments: normalized.attachments ?? [],
    estimatedResponseTime,
    createdAt,
    updatedAt: createdAt,
    userId: input.userId,
    relatedArticleId: normalized.relatedArticleId,
    deviceInfo: normalized.deviceInfo,
  });

  const ticket: SupportTicket = {
    id: String(createdDoc._id),
    ticketNumber,
    status: 'open',
    email: normalized.email,
    name: normalized.name,
    subject: normalized.subject,
    category: normalized.category,
    priority,
    description: normalized.description,
    attachments: normalized.attachments,
    createdAt,
    updatedAt: createdAt,
    estimatedResponseTime,
  };

  const supportEmail = process.env['SUPPORT_EMAIL']?.trim() || 'support@nxt1sports.com';

  try {
    await sendPlatformEmail(
      supportEmail,
      `[Support Ticket ${ticket.ticketNumber}] ${ticket.subject}`,
      formatSupportEmailHtml(ticket),
      ticket.email
    );
  } catch (error) {
    logger.error('[HelpCenter] Failed to dispatch support ticket email to support inbox', {
      ticketNumber: ticket.ticketNumber,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await sendPlatformEmail(
      ticket.email,
      `We received your request (${ticket.ticketNumber})`,
      formatSupportAckHtml(ticket),
      supportEmail
    );
  } catch (error) {
    logger.warn('[HelpCenter] Failed to dispatch support acknowledgment email', {
      ticketNumber: ticket.ticketNumber,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info('[HelpCenter] ✅ Support ticket created', {
    ticketNumber: ticket.ticketNumber,
    category: ticket.category,
    priority: ticket.priority,
    userId: input.userId,
  });

  return ticket;
}
