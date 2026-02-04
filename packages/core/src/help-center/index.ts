/**
 * @fileoverview Help Center Module - Barrel Export
 * @module @nxt1/core/help-center
 * @version 1.0.0
 *
 * Pure TypeScript help center module.
 * 100% portable - works on web, mobile, and backend.
 */

// ============================================
// TYPES
// ============================================

export type {
  // Category types
  HelpCategoryId,
  HelpCategory,
  HelpContentType,
  HelpUserType,
  // Article types
  ArticleTableOfContents,
  RelatedContent,
  HelpArticle,
  // FAQ types
  FaqItem,
  FaqSection,
  // Chat types
  ChatMessageRole,
  ChatAttachmentType,
  ChatAttachment,
  ChatMessage,
  ChatSession,
  ChatQuickAction,
  // Search types
  HelpSearchResult,
  HelpSearchFilter,
  // Support types
  TicketPriority,
  TicketStatus,
  TicketCategory,
  SupportTicketRequest,
  SupportTicket,
  // Feedback types
  ArticleFeedback,
  // Response types
  HelpCenterHome,
  HelpCategoryDetail,
  HelpSearchResponse,
  HelpPagination,
  HelpCenterHomeResponse,
  HelpCategoryDetailResponse,
  HelpArticleResponse,
  HelpSearchApiResponse,
  ChatMessageResponse,
  SupportTicketResponse,
  ArticleFeedbackResponse,
} from './help-center.types';

// ============================================
// CONSTANTS
// ============================================

export {
  // Categories
  HELP_CATEGORIES,
  HELP_DEFAULT_CATEGORY,
  HELP_CATEGORY_COLORS,
  HELP_CATEGORY_ICON_CLASSES,
  // Content types
  HELP_CONTENT_TYPES,
  // User types
  HELP_USER_TYPES,
  // AI Chat
  HELP_AI_CONFIG,
  HELP_QUICK_ACTIONS,
  // Search
  HELP_SEARCH_CONFIG,
  // API
  HELP_API_ENDPOINTS,
  HELP_PAGINATION_DEFAULTS,
  // Cache
  HELP_CACHE_KEYS,
  HELP_CACHE_TTL,
  // Support
  HELP_SUPPORT_CONFIG,
  // Analytics
  HELP_ANALYTICS_EVENTS,
} from './help-center.constants';

// ============================================
// API FACTORY
// ============================================

export { createHelpCenterApi, type HelpCenterApi } from './help-center.api';

// ============================================
// VALIDATION
// ============================================

export {
  validateSearchFilter,
  validateSupportTicket,
  validateArticleFeedback,
  validateChatMessage,
  sanitizeHtml,
  htmlToPlainText,
  type ValidationResult,
  type ValidationError,
} from './help-center.validation';

// ============================================
// HELPERS
// ============================================

export {
  // Category helpers
  getCategoryById,
  getCategoriesForUser,
  sortCategories,
  // Article helpers
  isArticleNew,
  isArticleUpdated,
  formatVideoDuration,
  formatReadingTime,
  getContentTypeConfig,
  calculateHelpfulnessPercent,
  filterArticlesByUserType,
  sortArticles,
  // Search helpers
  highlightSearchMatches,
  generateSearchExcerpt,
  calculateSearchScore,
  // Chat helpers
  generateMessageId,
  generateSessionId,
  createUserMessage,
  createAssistantMessage,
  createStreamingMessage,
  extractSessionTitle,
  // URL helpers
  generateSlug,
  buildArticlePath,
  buildCategoryPath,
  buildSearchPath,
  // Date helpers
  formatRelativeTime,
  formatArticleDate,
} from './help-center.helpers';
