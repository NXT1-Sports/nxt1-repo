/**
 * @fileoverview Help Center Validation Schemas
 * @module @nxt1/core/help-center
 * @version 1.0.0
 *
 * Pure TypeScript validation functions for Help Center data.
 * 100% portable - works on web, mobile, and backend.
 */

import type { HelpSearchFilter, SupportTicketRequest, ArticleFeedback } from './help-center.types';
import { HELP_SEARCH_CONFIG, HELP_SUPPORT_CONFIG } from './help-center.constants';

// ============================================
// VALIDATION RESULT TYPE
// ============================================

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: ValidationError[];
}

export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly code: string;
}

// ============================================
// SEARCH VALIDATION
// ============================================

/**
 * Validate search filter input.
 */
export function validateSearchFilter(filter: HelpSearchFilter): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate query length
  if (filter.query !== undefined) {
    if (filter.query.length > 0 && filter.query.length < HELP_SEARCH_CONFIG.minQueryLength) {
      errors.push({
        field: 'query',
        message: `Search query must be at least ${HELP_SEARCH_CONFIG.minQueryLength} characters`,
        code: 'QUERY_TOO_SHORT',
      });
    }
    if (filter.query.length > HELP_SEARCH_CONFIG.maxQueryLength) {
      errors.push({
        field: 'query',
        message: `Search query cannot exceed ${HELP_SEARCH_CONFIG.maxQueryLength} characters`,
        code: 'QUERY_TOO_LONG',
      });
    }
  }

  // Validate pagination
  if (filter.page !== undefined && filter.page < 1) {
    errors.push({
      field: 'page',
      message: 'Page number must be at least 1',
      code: 'INVALID_PAGE',
    });
  }

  if (filter.limit !== undefined) {
    if (filter.limit < 1) {
      errors.push({
        field: 'limit',
        message: 'Limit must be at least 1',
        code: 'INVALID_LIMIT',
      });
    }
    if (filter.limit > HELP_SEARCH_CONFIG.maxLimit) {
      errors.push({
        field: 'limit',
        message: `Limit cannot exceed ${HELP_SEARCH_CONFIG.maxLimit}`,
        code: 'LIMIT_TOO_HIGH',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================
// SUPPORT TICKET VALIDATION
// ============================================

/**
 * Validate support ticket request.
 */
export function validateSupportTicket(ticket: SupportTicketRequest): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate email
  if (!ticket.email || !isValidEmail(ticket.email)) {
    errors.push({
      field: 'email',
      message: 'Valid email address is required',
      code: 'INVALID_EMAIL',
    });
  }

  // Validate name
  if (!ticket.name || ticket.name.trim().length < 2) {
    errors.push({
      field: 'name',
      message: 'Name must be at least 2 characters',
      code: 'INVALID_NAME',
    });
  }

  // Validate subject
  if (!ticket.subject || ticket.subject.trim().length < 5) {
    errors.push({
      field: 'subject',
      message: 'Subject must be at least 5 characters',
      code: 'SUBJECT_TOO_SHORT',
    });
  }
  if (ticket.subject && ticket.subject.length > HELP_SUPPORT_CONFIG.maxSubjectLength) {
    errors.push({
      field: 'subject',
      message: `Subject cannot exceed ${HELP_SUPPORT_CONFIG.maxSubjectLength} characters`,
      code: 'SUBJECT_TOO_LONG',
    });
  }

  // Validate description
  if (!ticket.description || ticket.description.trim().length < 20) {
    errors.push({
      field: 'description',
      message: 'Description must be at least 20 characters',
      code: 'DESCRIPTION_TOO_SHORT',
    });
  }
  if (ticket.description && ticket.description.length > HELP_SUPPORT_CONFIG.maxDescriptionLength) {
    errors.push({
      field: 'description',
      message: `Description cannot exceed ${HELP_SUPPORT_CONFIG.maxDescriptionLength} characters`,
      code: 'DESCRIPTION_TOO_LONG',
    });
  }

  // Validate category
  const validCategories = [
    'account',
    'billing',
    'technical',
    'feature-request',
    'bug-report',
    'other',
  ];
  if (!ticket.category || !validCategories.includes(ticket.category)) {
    errors.push({
      field: 'category',
      message: 'Valid category is required',
      code: 'INVALID_CATEGORY',
    });
  }

  // Validate attachments count
  if (ticket.attachments && ticket.attachments.length > HELP_SUPPORT_CONFIG.maxAttachments) {
    errors.push({
      field: 'attachments',
      message: `Maximum ${HELP_SUPPORT_CONFIG.maxAttachments} attachments allowed`,
      code: 'TOO_MANY_ATTACHMENTS',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================
// FEEDBACK VALIDATION
// ============================================

/**
 * Validate article feedback.
 */
export function validateArticleFeedback(feedback: ArticleFeedback): ValidationResult {
  const errors: ValidationError[] = [];

  if (!feedback.articleId || feedback.articleId.trim().length === 0) {
    errors.push({
      field: 'articleId',
      message: 'Article ID is required',
      code: 'MISSING_ARTICLE_ID',
    });
  }

  if (typeof feedback.isHelpful !== 'boolean') {
    errors.push({
      field: 'isHelpful',
      message: 'Helpfulness rating is required',
      code: 'MISSING_RATING',
    });
  }

  // Optional feedback text validation
  if (feedback.feedback && feedback.feedback.length > 1000) {
    errors.push({
      field: 'feedback',
      message: 'Feedback cannot exceed 1000 characters',
      code: 'FEEDBACK_TOO_LONG',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================
// CHAT MESSAGE VALIDATION
// ============================================

/**
 * Validate chat message.
 */
export function validateChatMessage(message: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (!message || message.trim().length === 0) {
    errors.push({
      field: 'message',
      message: 'Message cannot be empty',
      code: 'EMPTY_MESSAGE',
    });
  }

  if (message && message.length > 2000) {
    errors.push({
      field: 'message',
      message: 'Message cannot exceed 2000 characters',
      code: 'MESSAGE_TOO_LONG',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Simple email validation.
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize HTML content (basic XSS prevention).
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Extract plain text from HTML content.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
