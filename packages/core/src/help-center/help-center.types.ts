/**
 * @fileoverview Help Center Type Definitions
 * @module @nxt1/core/help-center
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Help Center feature.
 * 100% portable - works on web, mobile, and backend.
 *
 * Features:
 * - AI-powered search and chat
 * - Knowledge base articles
 * - Video tutorials
 * - FAQ sections
 * - User type specific content
 * - Multilingual support ready
 */

// ============================================
// CATEGORY TYPES
// ============================================

/**
 * Help center content category identifiers.
 * Each category represents a content filter/section.
 */
export type HelpCategoryId =
  | 'getting-started'
  | 'athletes'
  | 'coaches'
  | 'parents'
  | 'teams'
  | 'recruiting'
  | 'profile'
  | 'videos'
  | 'subscription'
  | 'account'
  | 'privacy'
  | 'troubleshooting';

/**
 * Content format types.
 */
export type HelpContentType = 'article' | 'video' | 'faq' | 'guide' | 'tutorial';

/**
 * User types for targeted content.
 */
export type HelpUserType = 'athlete' | 'coach' | 'director' | 'team-admin' | 'all';

/**
 * Configuration for a help center category.
 */
export interface HelpCategory {
  /** Unique category identifier */
  readonly id: HelpCategoryId;
  /** Display label */
  readonly label: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Short description */
  readonly description?: string;
  /** Article count in category */
  readonly articleCount?: number;
  /** Video count in category */
  readonly videoCount?: number;
  /** Category accent color (design token reference) */
  readonly color?: string;
  /** Target user types */
  readonly targetUsers?: HelpUserType[];
  /** Sort order */
  readonly order?: number;
}

// ============================================
// ARTICLE TYPES
// ============================================

/**
 * Table of contents item for long articles.
 */
export interface ArticleTableOfContents {
  /** Section ID (used for anchor links) */
  readonly id: string;
  /** Section title */
  readonly title: string;
  /** Nesting level (1-3) */
  readonly level: 1 | 2 | 3;
}

/**
 * Related content for article recommendations.
 */
export interface RelatedContent {
  /** Content ID */
  readonly id: string;
  /** Title */
  readonly title: string;
  /** Content type */
  readonly type: HelpContentType;
  /** Thumbnail URL (for videos) */
  readonly thumbnailUrl?: string;
  /** Category */
  readonly category: HelpCategoryId;
}

/**
 * Help center article/content item.
 */
export interface HelpArticle {
  /** Unique article identifier */
  readonly id: string;
  /** URL-friendly slug */
  readonly slug: string;
  /** Article title */
  readonly title: string;
  /** Short description/excerpt */
  readonly excerpt: string;
  /** Full HTML content */
  readonly content: string;
  /** Content type */
  readonly type: HelpContentType;
  /** Primary category */
  readonly category: HelpCategoryId;
  /** Additional tags for search */
  readonly tags: string[];
  /** Target user types */
  readonly targetUsers: HelpUserType[];
  /** Hero image URL */
  readonly heroImageUrl?: string;
  /** Thumbnail URL */
  readonly thumbnailUrl?: string;
  /** Video URL (for video content) */
  readonly videoUrl?: string;
  /** Video duration in seconds */
  readonly videoDuration?: number;
  /** Estimated reading time in minutes */
  readonly readingTimeMinutes: number;
  /** Table of contents for long articles */
  readonly tableOfContents?: ArticleTableOfContents[];
  /** Related content IDs */
  readonly relatedContent?: RelatedContent[];
  /** Publication date */
  readonly publishedAt: string;
  /** Last updated date */
  readonly updatedAt: string;
  /** View count */
  readonly viewCount: number;
  /** Helpful votes count */
  readonly helpfulCount: number;
  /** Not helpful votes count */
  readonly notHelpfulCount: number;
  /** Featured/pinned status */
  readonly isFeatured?: boolean;
  /** Whether article is new (< 7 days) */
  readonly isNew?: boolean;
  /** SEO metadata */
  readonly seo?: {
    readonly metaTitle?: string;
    readonly metaDescription?: string;
    readonly keywords?: string[];
  };
}

// ============================================
// FAQ TYPES
// ============================================

/**
 * Frequently asked question item.
 */
export interface FaqItem {
  /** Unique FAQ identifier */
  readonly id: string;
  /** Question text */
  readonly question: string;
  /** Answer HTML content */
  readonly answer: string;
  /** Category */
  readonly category: HelpCategoryId;
  /** Target user types */
  readonly targetUsers: HelpUserType[];
  /** Sort order within category */
  readonly order: number;
  /** Helpful votes */
  readonly helpfulCount: number;
  /** Related article IDs */
  readonly relatedArticles?: string[];
}

/**
 * FAQ section grouping.
 */
export interface FaqSection {
  /** Section title */
  readonly title: string;
  /** Section description */
  readonly description?: string;
  /** Category ID */
  readonly category: HelpCategoryId;
  /** FAQ items in this section */
  readonly items: FaqItem[];
}

// ============================================
// AI CHAT TYPES
// ============================================

/**
 * Chat message role.
 */
export type ChatMessageRole = 'user' | 'assistant' | 'system';

/**
 * Chat message attachment type.
 */
export type ChatAttachmentType = 'article' | 'video' | 'faq' | 'link';

/**
 * Chat message attachment/suggestion.
 */
export interface ChatAttachment {
  /** Attachment type */
  readonly type: ChatAttachmentType;
  /** Content ID (if applicable) */
  readonly contentId?: string;
  /** Display title */
  readonly title: string;
  /** Description/excerpt */
  readonly description?: string;
  /** URL to navigate */
  readonly url?: string;
  /** Thumbnail URL */
  readonly thumbnailUrl?: string;
}

/**
 * AI chat message.
 */
export interface ChatMessage {
  /** Unique message ID */
  readonly id: string;
  /** Message role */
  readonly role: ChatMessageRole;
  /** Message content */
  readonly content: string;
  /** Timestamp */
  readonly timestamp: string;
  /** Attached content suggestions */
  readonly attachments?: ChatAttachment[];
  /** Whether message is being typed (streaming) */
  readonly isStreaming?: boolean;
  /** Error if message failed */
  readonly error?: string;
}

/**
 * AI chat session.
 */
export interface ChatSession {
  /** Session ID */
  readonly id: string;
  /** Session title (derived from first message) */
  readonly title: string;
  /** Messages in session */
  readonly messages: ChatMessage[];
  /** Creation timestamp */
  readonly createdAt: string;
  /** Last activity timestamp */
  readonly updatedAt: string;
  /** User context */
  readonly userContext?: {
    readonly userType?: HelpUserType;
    readonly currentPage?: string;
  };
}

/**
 * Quick action/suggestion for AI chat.
 */
export interface ChatQuickAction {
  /** Action ID */
  readonly id: string;
  /** Display label */
  readonly label: string;
  /** Icon name */
  readonly icon?: string;
  /** Pre-filled message when clicked */
  readonly message: string;
  /** Target user types */
  readonly targetUsers?: HelpUserType[];
}

// ============================================
// SEARCH TYPES
// ============================================

/**
 * Search result item.
 */
export interface HelpSearchResult {
  /** Content ID */
  readonly id: string;
  /** Content type */
  readonly type: HelpContentType;
  /** Title */
  readonly title: string;
  /** Excerpt with highlighted matches */
  readonly excerpt: string;
  /** Category */
  readonly category: HelpCategoryId;
  /** URL/slug */
  readonly slug: string;
  /** Relevance score (0-100) */
  readonly score: number;
  /** Thumbnail URL */
  readonly thumbnailUrl?: string;
  /** Video duration (for videos) */
  readonly videoDuration?: number;
}

/**
 * Search filter options.
 */
export interface HelpSearchFilter {
  /** Search query */
  readonly query?: string;
  /** Filter by categories */
  readonly categories?: HelpCategoryId[];
  /** Filter by content types */
  readonly types?: HelpContentType[];
  /** Filter by user type */
  readonly userType?: HelpUserType;
  /** Sort by field */
  readonly sortBy?: 'relevance' | 'date' | 'popularity';
  /** Sort direction */
  readonly sortOrder?: 'asc' | 'desc';
  /** Pagination */
  readonly page?: number;
  readonly limit?: number;
}

// ============================================
// CONTACT/SUPPORT TYPES
// ============================================

/**
 * Support ticket priority.
 */
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Support ticket status.
 */
export type TicketStatus = 'open' | 'in-progress' | 'pending' | 'resolved' | 'closed';

/**
 * Support ticket category.
 */
export type TicketCategory =
  | 'account'
  | 'billing'
  | 'technical'
  | 'feature-request'
  | 'bug-report'
  | 'other';

/**
 * Support contact form submission.
 */
export interface SupportTicketRequest {
  /** User's email */
  readonly email: string;
  /** User's name */
  readonly name: string;
  /** Ticket subject */
  readonly subject: string;
  /** Ticket category */
  readonly category: TicketCategory;
  /** Priority level */
  readonly priority?: TicketPriority;
  /** Detailed description */
  readonly description: string;
  /** Attachment URLs */
  readonly attachments?: string[];
  /** Related article ID (if coming from article) */
  readonly relatedArticleId?: string;
  /** User's device/browser info */
  readonly deviceInfo?: string;
}

/**
 * Support ticket response.
 */
export interface SupportTicket {
  /** Ticket ID */
  readonly id: string;
  /** Ticket number for display */
  readonly ticketNumber: string;
  /** Status */
  readonly status: TicketStatus;
  /** All fields from request */
  readonly email: string;
  readonly name: string;
  readonly subject: string;
  readonly category: TicketCategory;
  readonly priority: TicketPriority;
  readonly description: string;
  readonly attachments?: string[];
  /** Creation timestamp */
  readonly createdAt: string;
  /** Last updated timestamp */
  readonly updatedAt: string;
  /** Estimated response time */
  readonly estimatedResponseTime?: string;
}

// ============================================
// FEEDBACK TYPES
// ============================================

/**
 * Article feedback submission.
 */
export interface ArticleFeedback {
  /** Article ID */
  readonly articleId: string;
  /** Was it helpful? */
  readonly isHelpful: boolean;
  /** Optional feedback text */
  readonly feedback?: string;
  /** User ID (if authenticated) */
  readonly userId?: string;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Help center home/landing data.
 */
export interface HelpCenterHome {
  /** Featured articles */
  readonly featuredArticles: HelpArticle[];
  /** Popular articles */
  readonly popularArticles: HelpArticle[];
  /** Latest video tutorials */
  readonly latestVideos: HelpArticle[];
  /** All categories with counts */
  readonly categories: HelpCategory[];
  /** Top FAQs */
  readonly topFaqs: FaqItem[];
  /** AI chat quick actions */
  readonly quickActions: ChatQuickAction[];
}

/**
 * Category detail response.
 */
export interface HelpCategoryDetail {
  /** Category info */
  readonly category: HelpCategory;
  /** Articles in category */
  readonly articles: HelpArticle[];
  /** FAQs in category */
  readonly faqs: FaqItem[];
  /** Total article count */
  readonly totalArticles: number;
  /** Pagination info */
  readonly pagination: HelpPagination;
}

/**
 * Search response.
 */
export interface HelpSearchResponse {
  /** Search results */
  readonly results: HelpSearchResult[];
  /** Total result count */
  readonly total: number;
  /** Search query */
  readonly query: string;
  /** Applied filters */
  readonly filters: HelpSearchFilter;
  /** Suggested queries */
  readonly suggestions?: string[];
  /** Pagination */
  readonly pagination: HelpPagination;
}

/**
 * Pagination info.
 */
export interface HelpPagination {
  /** Current page (1-indexed) */
  readonly page: number;
  /** Items per page */
  readonly limit: number;
  /** Total items */
  readonly total: number;
  /** Total pages */
  readonly totalPages: number;
  /** Has more items */
  readonly hasMore: boolean;
}

// ============================================
// API WRAPPER RESPONSES
// ============================================

export interface HelpCenterHomeResponse {
  readonly success: boolean;
  readonly data?: HelpCenterHome;
  readonly error?: string;
}

export interface HelpCategoryDetailResponse {
  readonly success: boolean;
  readonly data?: HelpCategoryDetail;
  readonly error?: string;
}

export interface HelpArticleResponse {
  readonly success: boolean;
  readonly data?: HelpArticle;
  readonly error?: string;
}

export interface HelpSearchApiResponse {
  readonly success: boolean;
  readonly data?: HelpSearchResponse;
  readonly error?: string;
}

export interface ChatMessageResponse {
  readonly success: boolean;
  readonly data?: ChatMessage;
  readonly error?: string;
}

export interface SupportTicketResponse {
  readonly success: boolean;
  readonly data?: SupportTicket;
  readonly error?: string;
}

export interface ArticleFeedbackResponse {
  readonly success: boolean;
  readonly data?: { readonly updated: boolean };
  readonly error?: string;
}
