/**
 * @fileoverview Posts Validation
 * @module @nxt1/core/validation/posts
 *
 * Pure TypeScript validation for posts and comments.
 * 100% portable - works on web, mobile, and backend.
 */

import type { ValidationResult, ValidationError } from './schemas';
import { POST_LIMITS, COMMENT_LIMITS } from '../constants/posts.constants';

// Minimal local type for post creation validation (backend-owned full type)
interface CreatePostRequest {
  content?: string;
  type?: string;
  privacy?: string;
  mediaIds?: unknown[];
  taggedUserIds?: unknown[];
  poll?: { question?: string; options?: unknown[]; durationHours?: number };
  scheduledFor?: string;
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate create post request
 */
export function validateCreatePost(data: unknown): ValidationResult<CreatePostRequest> {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Invalid request body', code: 'INVALID_DATA' }],
    };
  }

  const request = data as Partial<CreatePostRequest>;

  // Content validation
  if (!request.content || typeof request.content !== 'string') {
    errors.push({
      field: 'content',
      message: 'Content is required',
      code: 'REQUIRED',
    });
  } else {
    const trimmed = request.content.trim();
    if (trimmed.length < POST_LIMITS.CONTENT_MIN) {
      errors.push({
        field: 'content',
        message: `Content must be at least ${POST_LIMITS.CONTENT_MIN} character`,
        code: 'TOO_SHORT',
      });
    }
    if (trimmed.length > POST_LIMITS.CONTENT_MAX) {
      errors.push({
        field: 'content',
        message: `Content must not exceed ${POST_LIMITS.CONTENT_MAX} characters`,
        code: 'TOO_LONG',
      });
    }
  }

  // Type validation
  if (
    request.type &&
    ![
      'text',
      'photo',
      'video',
      'highlight',
      'stats',
      'achievement',
      'announcement',
      'poll',
    ].includes(request.type)
  ) {
    errors.push({
      field: 'type',
      message: 'Invalid post type',
      code: 'INVALID_ENUM',
    });
  }

  // Privacy validation
  if (
    request.privacy &&
    !['public', 'followers', 'team', 'coaches', 'private'].includes(request.privacy)
  ) {
    errors.push({
      field: 'privacy',
      message: 'Invalid privacy setting',
      code: 'INVALID_ENUM',
    });
  }

  // Media IDs validation
  if (request.mediaIds) {
    if (!Array.isArray(request.mediaIds)) {
      errors.push({
        field: 'mediaIds',
        message: 'Media IDs must be an array',
        code: 'INVALID_TYPE',
      });
    } else if (request.mediaIds.length > POST_LIMITS.MEDIA_MAX) {
      errors.push({
        field: 'mediaIds',
        message: `Cannot attach more than ${POST_LIMITS.MEDIA_MAX} media items`,
        code: 'TOO_MANY',
      });
    }
  }

  // Tagged users validation
  if (request.taggedUserIds) {
    if (!Array.isArray(request.taggedUserIds)) {
      errors.push({
        field: 'taggedUserIds',
        message: 'Tagged user IDs must be an array',
        code: 'INVALID_TYPE',
      });
    } else if (request.taggedUserIds.length > POST_LIMITS.MENTIONS_MAX) {
      errors.push({
        field: 'taggedUserIds',
        message: `Cannot tag more than ${POST_LIMITS.MENTIONS_MAX} users`,
        code: 'TOO_MANY',
      });
    }
  }

  // Poll validation
  if (request.poll) {
    if (!request.poll.question || typeof request.poll.question !== 'string') {
      errors.push({
        field: 'poll.question',
        message: 'Poll question is required',
        code: 'REQUIRED',
      });
    }

    if (
      !Array.isArray(request.poll.options) ||
      request.poll.options.length < POST_LIMITS.POLL_OPTIONS_MIN ||
      request.poll.options.length > POST_LIMITS.POLL_OPTIONS_MAX
    ) {
      errors.push({
        field: 'poll.options',
        message: `Poll must have ${POST_LIMITS.POLL_OPTIONS_MIN}-${POST_LIMITS.POLL_OPTIONS_MAX} options`,
        code: 'INVALID_LENGTH',
      });
    }

    if (
      typeof request.poll.durationHours !== 'number' ||
      request.poll.durationHours < POST_LIMITS.POLL_DURATION_MIN_HOURS ||
      request.poll.durationHours > POST_LIMITS.POLL_DURATION_MAX_HOURS
    ) {
      errors.push({
        field: 'poll.durationHours',
        message: `Poll duration must be ${POST_LIMITS.POLL_DURATION_MIN_HOURS}-${POST_LIMITS.POLL_DURATION_MAX_HOURS} hours`,
        code: 'OUT_OF_RANGE',
      });
    }
  }

  // Scheduled date validation
  if (request.scheduledFor) {
    const scheduledDate = new Date(request.scheduledFor);
    if (isNaN(scheduledDate.getTime())) {
      errors.push({
        field: 'scheduledFor',
        message: 'Invalid date format',
        code: 'INVALID_FORMAT',
      });
    } else if (scheduledDate.getTime() < Date.now()) {
      errors.push({
        field: 'scheduledFor',
        message: 'Scheduled date must be in the future',
        code: 'INVALID_VALUE',
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: request as CreatePostRequest,
    errors: [],
  };
}

/**
 * Validate comment content
 */
export function validateComment(content: unknown): ValidationResult<{ content: string }> {
  const errors: ValidationError[] = [];

  if (!content || typeof content !== 'string') {
    return {
      success: false,
      errors: [{ field: 'content', message: 'Content is required', code: 'REQUIRED' }],
    };
  }

  const trimmed = content.trim();

  if (trimmed.length < COMMENT_LIMITS.CONTENT_MIN) {
    errors.push({
      field: 'content',
      message: `Comment must be at least ${COMMENT_LIMITS.CONTENT_MIN} character`,
      code: 'TOO_SHORT',
    });
  }

  if (trimmed.length > COMMENT_LIMITS.CONTENT_MAX) {
    errors.push({
      field: 'content',
      message: `Comment must not exceed ${COMMENT_LIMITS.CONTENT_MAX} characters`,
      code: 'TOO_LONG',
    });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: { content: trimmed },
    errors: [],
  };
}

/**
 * Sanitize content (basic XSS prevention)
 * Note: For server-side, use more robust sanitization libraries
 */
export function sanitizeContent(content: string): string {
  return content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Extract hashtags from content
 */
export function extractHashtags(content: string): string[] {
  const hashtagRegex = /#[\w]+/g;
  const matches = content.match(hashtagRegex);
  if (!matches) return [];

  // Remove duplicates and # symbol
  return [...new Set(matches.map((tag) => tag.slice(1)))];
}

/**
 * Extract mentions from content
 */
export function extractMentions(content: string): string[] {
  const mentionRegex = /@[\w]+/g;
  const matches = content.match(mentionRegex);
  if (!matches) return [];

  // Remove duplicates and @ symbol
  return [...new Set(matches.map((mention) => mention.slice(1)))];
}
