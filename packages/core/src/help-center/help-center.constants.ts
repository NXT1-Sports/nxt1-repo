/**
 * @fileoverview Help Center Constants
 * @module @nxt1/core/help-center
 * @version 1.0.0
 *
 * Configuration constants for Help Center feature.
 * 100% portable - no platform dependencies.
 */

import type {
  HelpCategory,
  HelpCategoryId,
  HelpContentType,
  HelpUserType,
  ChatQuickAction,
} from './help-center.types';

// ============================================
// CATEGORY CONFIGURATION
// ============================================

/**
 * Available help center categories with display configuration.
 * Order determines display order in navigation.
 */
export const HELP_CATEGORIES: readonly HelpCategory[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    icon: 'rocket-outline',
    description: 'Quick guides to get you up and running',
    color: 'var(--nxt1-color-primary)',
    targetUsers: ['all'],
    order: 1,
  },
  {
    id: 'athletes',
    label: 'For Athletes',
    icon: 'fitness-outline',
    description: 'Build your recruiting profile and get noticed',
    color: 'var(--nxt1-color-feedback-success)',
    targetUsers: ['athlete'],
    order: 2,
  },
  {
    id: 'coaches',
    label: 'For Programs',
    icon: 'clipboard-outline',
    description: 'Program-focused tools for directors and athletes',
    color: 'var(--nxt1-color-secondary)',
    targetUsers: ['director', 'athlete'],
    order: 3,
  },
  {
    id: 'teams',
    label: 'Teams & Organizations',
    icon: 'shield-outline',
    description: 'Manage your team and roster',
    color: 'var(--nxt1-color-accent)',
    targetUsers: ['team-admin', 'coach'],
    order: 4,
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    icon: 'school-outline',
    description: 'Navigate the college recruiting process',
    color: 'var(--nxt1-color-feedback-warning)',
    targetUsers: ['athlete', 'parent', 'coach'],
    order: 5,
  },
  {
    id: 'subscription',
    label: 'Premium & Billing',
    icon: 'diamond-outline',
    description: 'Premium plans and payment info',
    color: 'var(--nxt1-color-secondary)',
    targetUsers: ['all'],
    order: 6,
  },
  {
    id: 'account',
    label: 'Account Settings',
    icon: 'settings-outline',
    description: 'Manage account settings, privacy, and security',
    color: 'var(--nxt1-color-text-secondary)',
    targetUsers: ['all'],
    order: 7,
  },
  {
    id: 'troubleshooting',
    label: 'Troubleshooting',
    icon: 'construct-outline',
    description: 'Fix common issues and get help',
    color: 'var(--nxt1-color-feedback-warning)',
    targetUsers: ['all'],
    order: 8,
  },
] as const;

/**
 * Default selected category on initial load.
 */
export const HELP_DEFAULT_CATEGORY: HelpCategoryId = 'getting-started';

// ============================================
// CATEGORY COLORS (CSS Classes)
// ============================================

/**
 * Color mapping for help categories.
 * Uses semantic design tokens from @nxt1/design-tokens.
 */
export const HELP_CATEGORY_COLORS: Record<HelpCategoryId, string> = {
  'getting-started': 'bg-primary text-on-primary',
  athletes: 'bg-success text-on-success',
  coaches: 'bg-secondary text-on-secondary',
  parents: 'bg-info text-on-info',
  teams: 'bg-accent text-on-accent',
  recruiting: 'bg-warning text-on-warning',
  profile: 'bg-primary text-on-primary',
  videos: 'bg-accent text-on-accent',
  subscription: 'bg-secondary text-on-secondary',
  account: 'bg-surface-300 text-secondary',
  privacy: 'bg-error text-on-error',
  troubleshooting: 'bg-warning text-on-warning',
} as const;

/**
 * Category icon background classes (gradient style).
 */
export const HELP_CATEGORY_ICON_CLASSES: Record<HelpCategoryId, string> = {
  'getting-started': 'from-primary/20 to-primary/5 text-primary',
  athletes: 'from-success/20 to-success/5 text-success',
  coaches: 'from-secondary/20 to-secondary/5 text-secondary',
  parents: 'from-info/20 to-info/5 text-info',
  teams: 'from-accent/20 to-accent/5 text-accent',
  recruiting: 'from-warning/20 to-warning/5 text-warning',
  profile: 'from-primary/20 to-primary/5 text-primary',
  videos: 'from-accent/20 to-accent/5 text-accent',
  subscription: 'from-secondary/20 to-secondary/5 text-secondary',
  account: 'from-muted/20 to-muted/5 text-muted-foreground',
  privacy: 'from-error/20 to-error/5 text-error',
  troubleshooting: 'from-warning/20 to-warning/5 text-warning',
} as const;

// ============================================
// CONTENT TYPE CONFIGURATION
// ============================================

/**
 * Content type display configuration.
 */
export const HELP_CONTENT_TYPES: Record<
  HelpContentType,
  { label: string; icon: string; color: string }
> = {
  article: {
    label: 'Article',
    icon: 'document-text-outline',
    color: 'var(--nxt1-color-text-primary)',
  },
  video: {
    label: 'Video',
    icon: 'play-circle-outline',
    color: 'var(--nxt1-color-accent)',
  },
  faq: {
    label: 'FAQ',
    icon: 'help-circle-outline',
    color: 'var(--nxt1-color-feedback-info)',
  },
  guide: {
    label: 'Guide',
    icon: 'book-outline',
    color: 'var(--nxt1-color-secondary)',
  },
  tutorial: {
    label: 'Tutorial',
    icon: 'school-outline',
    color: 'var(--nxt1-color-feedback-success)',
  },
} as const;

// ============================================
// USER TYPE CONFIGURATION
// ============================================

/**
 * User type display configuration.
 */
export const HELP_USER_TYPES: Record<
  HelpUserType,
  { label: string; icon: string; description: string }
> = {
  athlete: {
    label: 'Athlete',
    icon: 'fitness-outline',
    description: 'High school and club athletes building their recruiting profiles',
  },
  coach: {
    label: 'Coach',
    icon: 'clipboard-outline',
    description: 'College and high school coaches discovering and evaluating talent',
  },
  parent: {
    label: 'Parent',
    icon: 'people-outline',
    description: "Parents supporting their athlete's journey",
  },
  recruiter: {
    label: 'Recruiter',
    icon: 'eye-outline',
    description: 'College coaches, scouts, and recruiting professionals',
  },
  director: {
    label: 'Director',
    icon: 'briefcase-outline',
    description: 'Athletic directors and program directors',
  },
  'team-admin': {
    label: 'Team Admin',
    icon: 'shield-outline',
    description: 'Team managers and administrators',
  },
  all: {
    label: 'Everyone',
    icon: 'globe-outline',
    description: 'General content for all users',
  },
} as const;

// ============================================
// AI CHAT CONFIGURATION
// ============================================

/**
 * AI assistant configuration.
 */
export const HELP_AI_CONFIG = {
  /** Assistant name */
  name: 'NXT1 Assistant',
  /** Avatar URL */
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=nxt1helper&backgroundColor=ccff00',
  /** Welcome message */
  welcomeMessage:
    "Hi! 👋 I'm your NXT1 Assistant. I can help you find articles, answer questions about the platform, or guide you through any feature. What can I help you with today?",
  /** Typing indicator text */
  typingText: 'NXT1 Assistant is thinking...',
  /** Error message */
  errorMessage: "I'm having trouble connecting right now. Please try again in a moment.",
  /** Max messages per session */
  maxMessages: 50,
  /** Session timeout (ms) */
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
} as const;

/**
 * Default quick actions for AI chat.
 */
export const HELP_QUICK_ACTIONS: readonly ChatQuickAction[] = [
  {
    id: 'getting-started',
    label: 'How do I get started?',
    icon: 'rocket-outline',
    message: 'How do I get started with NXT1?',
    targetUsers: ['all'],
  },
  {
    id: 'create-profile',
    label: 'Create my profile',
    icon: 'person-add-outline',
    message: 'How do I create and optimize my recruiting profile?',
    targetUsers: ['athlete'],
  },
  {
    id: 'upload-highlights',
    label: 'Upload highlights',
    icon: 'videocam-outline',
    message: 'How do I upload highlight videos to my profile?',
    targetUsers: ['athlete', 'team-admin'],
  },
  {
    id: 'find-athletes',
    label: 'Find athletes',
    icon: 'search-outline',
    message: 'How can I search for and discover athletes on NXT1?',
    targetUsers: ['coach', 'recruiter'],
  },
  {
    id: 'recruiting-tips',
    label: 'Recruiting tips',
    icon: 'school-outline',
    message: 'What are the best practices for getting recruited?',
    targetUsers: ['athlete', 'parent'],
  },
  {
    id: 'subscription-info',
    label: 'Premium features',
    icon: 'diamond-outline',
    message: 'What premium features are available and how do I upgrade?',
    targetUsers: ['all'],
  },
  {
    id: 'contact-support',
    label: 'Contact support',
    icon: 'chatbubbles-outline',
    message: 'I need to contact customer support for help with my account.',
    targetUsers: ['all'],
  },
  {
    id: 'report-issue',
    label: 'Report an issue',
    icon: 'bug-outline',
    message: 'I want to report a bug or technical issue.',
    targetUsers: ['all'],
  },
] as const;

// ============================================
// SEARCH CONFIGURATION
// ============================================

/**
 * Search configuration defaults.
 */
export const HELP_SEARCH_CONFIG = {
  /** Minimum query length */
  minQueryLength: 2,
  /** Maximum query length */
  maxQueryLength: 200,
  /** Default results per page */
  defaultLimit: 10,
  /** Maximum results per page */
  maxLimit: 50,
  /** Debounce delay (ms) for live search */
  debounceMs: 300,
  /** Maximum suggestions to show */
  maxSuggestions: 5,
  /** Recent searches to store */
  maxRecentSearches: 10,
  /** Popular search suggestions */
  suggestions: [
    'How to create my profile',
    'Upload highlight video',
    'Connect with college coaches',
    'Premium subscription benefits',
    'Privacy settings',
    'Edit my stats',
    'Share my profile',
    'Recruiting timeline',
  ] as readonly string[],
} as const;

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Help center API endpoint paths.
 * Use with HttpAdapter pattern.
 */
export const HELP_API_ENDPOINTS = {
  /** Get home/landing page data */
  HOME: '/api/v1/help-center',
  /** Get category detail */
  CATEGORY: '/api/v1/help-center/categories/:id',
  /** Get single article */
  ARTICLE: '/api/v1/help-center/articles/:slug',
  /** Search endpoint */
  SEARCH: '/api/v1/help-center/search',
  /** Get FAQs */
  FAQS: '/api/v1/help-center/faqs',
  /** Submit article feedback */
  FEEDBACK: '/api/v1/help-center/articles/:id/feedback',
  /** AI chat endpoint */
  CHAT: '/api/v1/help-center/chat',
  /** Submit support ticket */
  SUPPORT: '/api/v1/help-center/support',
} as const;

// ============================================
// PAGINATION DEFAULTS
// ============================================

/**
 * Pagination configuration.
 */
export const HELP_PAGINATION_DEFAULTS = {
  /** Initial page number */
  INITIAL_PAGE: 1,
  /** Default items per page */
  LIMIT: 12,
  /** Maximum items per request */
  MAX_LIMIT: 50,
} as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

/**
 * Cache keys for help center data.
 */
export const HELP_CACHE_KEYS = {
  HOME: 'help:home',
  CATEGORY: 'help:category:',
  ARTICLE: 'help:article:',
  SEARCH: 'help:search:',
  FAQS: 'help:faqs',
  RECENT_SEARCHES: 'help:recent-searches',
} as const;

/**
 * Cache TTLs (in milliseconds).
 */
export const HELP_CACHE_TTL = {
  /** Home page data - 15 minutes */
  HOME: 15 * 60 * 1000,
  /** Category data - 10 minutes */
  CATEGORY: 10 * 60 * 1000,
  /** Article data - 30 minutes */
  ARTICLE: 30 * 60 * 1000,
  /** Search results - 5 minutes */
  SEARCH: 5 * 60 * 1000,
  /** FAQs - 1 hour */
  FAQS: 60 * 60 * 1000,
} as const;

// ============================================
// SUPPORT TICKET CONFIGURATION
// ============================================

/**
 * Support ticket configuration.
 */
export const HELP_SUPPORT_CONFIG = {
  /** Maximum subject length */
  maxSubjectLength: 100,
  /** Maximum description length */
  maxDescriptionLength: 5000,
  /** Maximum attachments */
  maxAttachments: 5,
  /** Maximum attachment size (bytes) */
  maxAttachmentSize: 10 * 1024 * 1024, // 10MB
  /** Allowed attachment types */
  allowedAttachmentTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'video/mp4'],
  /** Response time estimates by priority */
  responseTimeEstimates: {
    low: '3-5 business days',
    medium: '1-2 business days',
    high: '24 hours',
    urgent: '4-8 hours',
  },
} as const;

// ============================================
// ANALYTICS EVENTS
// ============================================

/**
 * Analytics event names for help center.
 */
export const HELP_ANALYTICS_EVENTS = {
  /** Page views */
  VIEW_HOME: 'help_center_view_home',
  VIEW_CATEGORY: 'help_center_view_category',
  VIEW_ARTICLE: 'help_center_view_article',
  /** Search */
  SEARCH: 'help_center_search',
  SEARCH_NO_RESULTS: 'help_center_search_no_results',
  /** AI Chat */
  CHAT_START: 'help_center_chat_start',
  CHAT_MESSAGE: 'help_center_chat_message',
  CHAT_SUGGESTION_CLICK: 'help_center_chat_suggestion_click',
  /** Feedback */
  ARTICLE_HELPFUL: 'help_center_article_helpful',
  ARTICLE_NOT_HELPFUL: 'help_center_article_not_helpful',
  /** Support */
  SUPPORT_TICKET_SUBMIT: 'help_center_support_submit',
  /** Navigation */
  QUICK_ACTION_CLICK: 'help_center_quick_action_click',
  RELATED_ARTICLE_CLICK: 'help_center_related_click',
} as const;
