/**
 * @fileoverview Create Post Validation - Pure TypeScript
 * @module @nxt1/core/create-post
 * @version 1.0.0
 *
 * Validation functions for post creation.
 * 100% portable - works on web, mobile, and backend.
 */

import type {
  PostDraft,
  PostMedia,
  PostValidationResult,
  PostValidationError,
  PostType,
  CreatePostRequest,
} from './create-post.types';
import {
  POST_MAX_CHARACTERS,
  POST_MIN_CHARACTERS,
  POST_MAX_MEDIA,
  POST_MAX_TAGS,
  POST_MAX_POLL_OPTIONS,
  POST_MIN_POLL_OPTIONS,
  POST_MAX_POLL_DURATION,
  IMAGE_UPLOAD_CONFIG,
  VIDEO_UPLOAD_CONFIG,
  POST_TYPE_OPTIONS,
} from './create-post.constants';

// ============================================
// VALIDATION ERROR CODES
// ============================================

export const VALIDATION_ERROR_CODES = {
  // Content errors
  CONTENT_REQUIRED: 'CONTENT_REQUIRED',
  CONTENT_TOO_SHORT: 'CONTENT_TOO_SHORT',
  CONTENT_TOO_LONG: 'CONTENT_TOO_LONG',

  // Media errors
  MEDIA_REQUIRED: 'MEDIA_REQUIRED',
  MEDIA_TOO_MANY: 'MEDIA_TOO_MANY',
  MEDIA_INVALID_TYPE: 'MEDIA_INVALID_TYPE',
  MEDIA_TOO_LARGE: 'MEDIA_TOO_LARGE',
  MEDIA_UPLOAD_FAILED: 'MEDIA_UPLOAD_FAILED',
  MEDIA_DIMENSIONS_EXCEEDED: 'MEDIA_DIMENSIONS_EXCEEDED',
  VIDEO_TOO_LONG: 'VIDEO_TOO_LONG',

  // Tag errors
  TAGS_TOO_MANY: 'TAGS_TOO_MANY',

  // Poll errors
  POLL_QUESTION_REQUIRED: 'POLL_QUESTION_REQUIRED',
  POLL_OPTIONS_REQUIRED: 'POLL_OPTIONS_REQUIRED',
  POLL_OPTIONS_TOO_FEW: 'POLL_OPTIONS_TOO_FEW',
  POLL_OPTIONS_TOO_MANY: 'POLL_OPTIONS_TOO_MANY',
  POLL_OPTION_EMPTY: 'POLL_OPTION_EMPTY',
  POLL_DURATION_INVALID: 'POLL_DURATION_INVALID',

  // Privacy errors
  PRIVACY_REQUIRED: 'PRIVACY_REQUIRED',

  // Type errors
  TYPE_REQUIRED: 'TYPE_REQUIRED',
  TYPE_INVALID: 'TYPE_INVALID',
} as const;

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Create a validation error object.
 */
function createError(field: string, code: string, message: string): PostValidationError {
  return { field, code, message };
}

/**
 * Check if a post type requires media.
 */
function requiresMedia(type: PostType): boolean {
  const option = POST_TYPE_OPTIONS.find((opt) => opt.id === type);
  return option?.requiresMedia ?? false;
}

// ============================================
// CONTENT VALIDATION
// ============================================

/**
 * Validate post content text.
 */
export function validatePostContent(content: string, type: PostType): PostValidationError[] {
  const errors: PostValidationError[] = [];
  const trimmedContent = content.trim();

  // For text-only posts, content is required
  if (type === 'text' && trimmedContent.length === 0) {
    errors.push(
      createError('content', VALIDATION_ERROR_CODES.CONTENT_REQUIRED, 'Post content is required')
    );
    return errors;
  }

  // Check minimum length for text posts
  if (type === 'text' && trimmedContent.length < POST_MIN_CHARACTERS) {
    errors.push(
      createError(
        'content',
        VALIDATION_ERROR_CODES.CONTENT_TOO_SHORT,
        `Content must be at least ${POST_MIN_CHARACTERS} character`
      )
    );
  }

  // Check maximum length
  if (trimmedContent.length > POST_MAX_CHARACTERS) {
    errors.push(
      createError(
        'content',
        VALIDATION_ERROR_CODES.CONTENT_TOO_LONG,
        `Content must be less than ${POST_MAX_CHARACTERS} characters`
      )
    );
  }

  return errors;
}

// ============================================
// MEDIA VALIDATION
// ============================================

/**
 * Validate a single media item.
 */
export function validateMediaItem(media: PostMedia): PostValidationError[] {
  const errors: PostValidationError[] = [];

  // Check file type
  const isImage = IMAGE_UPLOAD_CONFIG.allowedTypes.includes(media.mimeType);
  const isVideo = VIDEO_UPLOAD_CONFIG.allowedTypes.includes(media.mimeType);

  if (!isImage && !isVideo) {
    errors.push(
      createError(
        'media',
        VALIDATION_ERROR_CODES.MEDIA_INVALID_TYPE,
        `File type "${media.mimeType}" is not supported`
      )
    );
    return errors;
  }

  // Check file size
  if (isImage && media.fileSize > IMAGE_UPLOAD_CONFIG.maxFileSize) {
    const maxMB = IMAGE_UPLOAD_CONFIG.maxFileSize / (1024 * 1024);
    errors.push(
      createError(
        'media',
        VALIDATION_ERROR_CODES.MEDIA_TOO_LARGE,
        `Image must be less than ${maxMB}MB`
      )
    );
  }

  if (isVideo && media.fileSize > VIDEO_UPLOAD_CONFIG.maxFileSize) {
    const maxMB = VIDEO_UPLOAD_CONFIG.maxFileSize / (1024 * 1024);
    errors.push(
      createError(
        'media',
        VALIDATION_ERROR_CODES.MEDIA_TOO_LARGE,
        `Video must be less than ${maxMB}MB`
      )
    );
  }

  // Check image dimensions
  if (isImage && media.width && media.height && IMAGE_UPLOAD_CONFIG.maxDimensions) {
    if (
      media.width > IMAGE_UPLOAD_CONFIG.maxDimensions.width ||
      media.height > IMAGE_UPLOAD_CONFIG.maxDimensions.height
    ) {
      errors.push(
        createError(
          'media',
          VALIDATION_ERROR_CODES.MEDIA_DIMENSIONS_EXCEEDED,
          `Image dimensions must be less than ${IMAGE_UPLOAD_CONFIG.maxDimensions.width}x${IMAGE_UPLOAD_CONFIG.maxDimensions.height}`
        )
      );
    }
  }

  // Check video duration
  if (isVideo && media.duration && VIDEO_UPLOAD_CONFIG.maxDuration) {
    if (media.duration > VIDEO_UPLOAD_CONFIG.maxDuration) {
      const maxMinutes = VIDEO_UPLOAD_CONFIG.maxDuration / 60;
      errors.push(
        createError(
          'media',
          VALIDATION_ERROR_CODES.VIDEO_TOO_LONG,
          `Video must be less than ${maxMinutes} minutes`
        )
      );
    }
  }

  // Check upload status
  if (media.status === 'error') {
    errors.push(
      createError(
        'media',
        VALIDATION_ERROR_CODES.MEDIA_UPLOAD_FAILED,
        media.error ?? 'Media upload failed'
      )
    );
  }

  return errors;
}

/**
 * Validate all media items in a post.
 */
export function validatePostMedia(
  media: readonly PostMedia[],
  type: PostType
): PostValidationError[] {
  const errors: PostValidationError[] = [];

  // Check if media is required for this post type
  if (requiresMedia(type) && media.length === 0) {
    errors.push(
      createError(
        'media',
        VALIDATION_ERROR_CODES.MEDIA_REQUIRED,
        `${type} posts require at least one media file`
      )
    );
    return errors;
  }

  // Check maximum media count
  if (media.length > POST_MAX_MEDIA) {
    errors.push(
      createError(
        'media',
        VALIDATION_ERROR_CODES.MEDIA_TOO_MANY,
        `Maximum ${POST_MAX_MEDIA} media files allowed`
      )
    );
  }

  // Validate each media item
  media.forEach((item, index) => {
    const itemErrors = validateMediaItem(item);
    itemErrors.forEach((err) => {
      errors.push({
        ...err,
        field: `media[${index}]`,
      });
    });
  });

  return errors;
}

// ============================================
// POLL VALIDATION
// ============================================

/**
 * Validate poll data.
 */
export function validatePoll(poll: {
  question?: string;
  options?: readonly string[];
  durationHours?: number;
}): PostValidationError[] {
  const errors: PostValidationError[] = [];

  // Check question
  if (!poll.question || poll.question.trim().length === 0) {
    errors.push(
      createError(
        'poll.question',
        VALIDATION_ERROR_CODES.POLL_QUESTION_REQUIRED,
        'Poll question is required'
      )
    );
  }

  // Check options
  if (!poll.options || poll.options.length === 0) {
    errors.push(
      createError(
        'poll.options',
        VALIDATION_ERROR_CODES.POLL_OPTIONS_REQUIRED,
        'Poll options are required'
      )
    );
    return errors;
  }

  if (poll.options.length < POST_MIN_POLL_OPTIONS) {
    errors.push(
      createError(
        'poll.options',
        VALIDATION_ERROR_CODES.POLL_OPTIONS_TOO_FEW,
        `At least ${POST_MIN_POLL_OPTIONS} poll options required`
      )
    );
  }

  if (poll.options.length > POST_MAX_POLL_OPTIONS) {
    errors.push(
      createError(
        'poll.options',
        VALIDATION_ERROR_CODES.POLL_OPTIONS_TOO_MANY,
        `Maximum ${POST_MAX_POLL_OPTIONS} poll options allowed`
      )
    );
  }

  // Check each option
  poll.options.forEach((option, index) => {
    if (!option || option.trim().length === 0) {
      errors.push(
        createError(
          `poll.options[${index}]`,
          VALIDATION_ERROR_CODES.POLL_OPTION_EMPTY,
          `Poll option ${index + 1} cannot be empty`
        )
      );
    }
  });

  // Check duration
  if (poll.durationHours !== undefined) {
    if (poll.durationHours < 1 || poll.durationHours > POST_MAX_POLL_DURATION) {
      errors.push(
        createError(
          'poll.durationHours',
          VALIDATION_ERROR_CODES.POLL_DURATION_INVALID,
          `Poll duration must be between 1 and ${POST_MAX_POLL_DURATION} hours`
        )
      );
    }
  }

  return errors;
}

// ============================================
// FULL POST VALIDATION
// ============================================

/**
 * Validate a complete post draft.
 *
 * @param draft - Post draft to validate
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```typescript
 * const result = validatePost(draft);
 * if (!result.isValid) {
 *   console.log('Errors:', result.errors);
 * }
 * ```
 */
export function validatePost(draft: PostDraft): PostValidationResult {
  const errors: PostValidationError[] = [];
  const warnings: PostValidationError[] = [];

  // Validate type
  const validTypes = POST_TYPE_OPTIONS.map((opt) => opt.id);
  if (!validTypes.includes(draft.type)) {
    errors.push(createError('type', VALIDATION_ERROR_CODES.TYPE_INVALID, 'Invalid post type'));
  }

  // Validate content
  errors.push(...validatePostContent(draft.content, draft.type));

  // Validate media
  errors.push(...validatePostMedia(draft.media, draft.type));

  // Validate tags
  if (draft.taggedUsers.length > POST_MAX_TAGS) {
    errors.push(
      createError(
        'taggedUsers',
        VALIDATION_ERROR_CODES.TAGS_TOO_MANY,
        `Maximum ${POST_MAX_TAGS} users can be tagged`
      )
    );
  }

  // Validate poll (if poll type)
  if (draft.type === 'poll' && draft.poll) {
    errors.push(
      ...validatePoll({
        question: draft.poll.question,
        options: draft.poll.options.map((o) => o.text),
        durationHours: draft.poll.durationHours,
      })
    );
  }

  // Add warning for approaching character limit
  const characterPercentage = draft.characterCount / POST_MAX_CHARACTERS;
  if (characterPercentage >= 0.9 && characterPercentage < 1) {
    warnings.push(
      createError(
        'content',
        'CHARACTER_LIMIT_WARNING',
        `Approaching character limit (${draft.characterCount}/${POST_MAX_CHARACTERS})`
      )
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a create post request.
 * Used for final validation before API submission.
 *
 * @param request - Create post request
 * @returns Validation result
 */
export function validateCreatePostRequest(request: CreatePostRequest): PostValidationResult {
  const errors: PostValidationError[] = [];
  const warnings: PostValidationError[] = [];

  // Check required fields
  if (!request.type) {
    errors.push(createError('type', VALIDATION_ERROR_CODES.TYPE_REQUIRED, 'Post type is required'));
  }

  if (!request.privacy) {
    errors.push(
      createError('privacy', VALIDATION_ERROR_CODES.PRIVACY_REQUIRED, 'Privacy setting is required')
    );
  }

  // Validate content for text posts
  if (request.type === 'text' && (!request.content || request.content.trim().length === 0)) {
    errors.push(
      createError(
        'content',
        VALIDATION_ERROR_CODES.CONTENT_REQUIRED,
        'Content is required for text posts'
      )
    );
  }

  // Check content length
  if (request.content && request.content.length > POST_MAX_CHARACTERS) {
    errors.push(
      createError(
        'content',
        VALIDATION_ERROR_CODES.CONTENT_TOO_LONG,
        `Content must be less than ${POST_MAX_CHARACTERS} characters`
      )
    );
  }

  // Check media requirement
  if (requiresMedia(request.type) && request.mediaIds.length === 0) {
    errors.push(
      createError(
        'media',
        VALIDATION_ERROR_CODES.MEDIA_REQUIRED,
        `${request.type} posts require at least one media file`
      )
    );
  }

  // Check media count
  if (request.mediaIds.length > POST_MAX_MEDIA) {
    errors.push(
      createError(
        'media',
        VALIDATION_ERROR_CODES.MEDIA_TOO_MANY,
        `Maximum ${POST_MAX_MEDIA} media files allowed`
      )
    );
  }

  // Check tag count
  if (request.taggedUserIds.length > POST_MAX_TAGS) {
    errors.push(
      createError(
        'taggedUserIds',
        VALIDATION_ERROR_CODES.TAGS_TOO_MANY,
        `Maximum ${POST_MAX_TAGS} users can be tagged`
      )
    );
  }

  // Validate poll if present
  if (request.poll) {
    errors.push(...validatePoll(request.poll));
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Quick check if content is valid (for real-time feedback).
 */
export function isContentValid(content: string, type: PostType): boolean {
  const errors = validatePostContent(content, type);
  return errors.length === 0;
}

/**
 * Get remaining characters.
 */
export function getRemainingCharacters(content: string): number {
  return POST_MAX_CHARACTERS - content.length;
}

/**
 * Check if character count is in warning zone.
 */
export function isCharacterWarning(content: string): boolean {
  const percentage = content.length / POST_MAX_CHARACTERS;
  return percentage >= 0.9 && percentage < 1;
}

/**
 * Check if character count exceeds limit.
 */
export function isCharacterExceeded(content: string): boolean {
  return content.length > POST_MAX_CHARACTERS;
}
