/**
 * @fileoverview Post Validation Utilities
 * @module @nxt1/backend/utils/postValidation
 */

import { PostVisibility } from '@nxt1/core/constants';
import type { CreatePostRequest } from '@nxt1/core/create-post';

/**
 * DTO for creating a new post (reuses CreatePostRequest from core)
 * Extended with backend-specific metadata
 */
export interface CreatePostDto extends Omit<
  CreatePostRequest,
  'privacy' | 'mediaIds' | 'taggedUserIds' | 'locationId'
> {
  visibility: PostVisibility;
  teamId?: string;
  mediaUrls?: string[]; // Instead of mediaIds
  videoUrl?: string;
  externalLinks?: string[];
  mentions?: string[]; // Instead of taggedUserIds
  hashtags?: string[];
  location?: string; // Direct string instead of locationId
  isPinned?: boolean;
  commentsDisabled?: boolean;
}

/**
 * DTO for creating a comment
 */
export interface CreateCommentDto {
  content: string;
}

export interface GetFeedQuery {
  visibility?: string;
  teamId?: string;
  limit?: string | number;
  cursor?: string;
}

export interface GetCommentsQuery {
  limit?: string | number;
  cursor?: string;
}

/**
 * Validate create post DTO
 */
export function validateCreatePostDto(data: unknown): {
  valid: boolean;
  errors?: string[];
  dto?: CreatePostDto;
} {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid request body'] };
  }

  const dto = data as Partial<CreatePostDto>;

  // Content validation
  if (!dto.content || typeof dto.content !== 'string') {
    errors.push('content is required and must be a string');
  } else if (dto.content.trim().length === 0) {
    errors.push('content cannot be empty');
  } else if (dto.content.length > 5000) {
    errors.push('content must not exceed 5000 characters');
  }

  // Type validation (optional, default: 'text')
  // Valid types from @nxt1/core: text, photo, video, highlight, stats, achievement, announcement, poll
  if (
    dto.type &&
    ![
      'text',
      'photo',
      'video',
      'highlight',
      'stats',
      'achievement',
      'announcement',
      'poll',
    ].includes(dto.type)
  ) {
    errors.push(
      'type must be one of: text, photo, video, highlight, stats, achievement, announcement, poll'
    );
  }

  // Visibility validation
  if (!dto.visibility || !['PUBLIC', 'FOLLOWERS', 'TEAM', 'PRIVATE'].includes(dto.visibility)) {
    errors.push('visibility must be PUBLIC, FOLLOWERS, TEAM, or PRIVATE');
  }

  // Team ID validation
  if (dto.visibility === 'TEAM' && !dto.teamId) {
    errors.push('teamId is required for TEAM visibility');
  }

  // Media URLs validation
  if (dto.mediaUrls && !Array.isArray(dto.mediaUrls)) {
    errors.push('mediaUrls must be an array');
  }

  // Video URL validation
  if (dto.videoUrl && typeof dto.videoUrl !== 'string') {
    errors.push('videoUrl must be a string');
  }

  // External links validation
  if (dto.externalLinks && !Array.isArray(dto.externalLinks)) {
    errors.push('externalLinks must be an array');
  }

  // Mentions validation
  if (dto.mentions && !Array.isArray(dto.mentions)) {
    errors.push('mentions must be an array');
  }

  // Hashtags validation
  if (dto.hashtags && !Array.isArray(dto.hashtags)) {
    errors.push('hashtags must be an array');
  }

  // Location validation
  if (dto.location && typeof dto.location !== 'string') {
    errors.push('location must be a string');
  }

  // Poll validation
  if (dto.poll) {
    if (!dto.poll.question || typeof dto.poll.question !== 'string') {
      errors.push('poll.question is required and must be a string');
    }
    if (
      !Array.isArray(dto.poll.options) ||
      dto.poll.options.length < 2 ||
      dto.poll.options.length > 6
    ) {
      errors.push('poll.options must be an array with 2-6 options');
    }
    if (
      typeof dto.poll.durationHours !== 'number' ||
      dto.poll.durationHours < 1 ||
      dto.poll.durationHours > 168
    ) {
      errors.push('poll.durationHours must be a number between 1 and 168 (7 days)');
    }
  }

  // Scheduled date validation
  if (dto.scheduledFor) {
    const scheduledDate = new Date(dto.scheduledFor);
    if (isNaN(scheduledDate.getTime())) {
      errors.push('scheduledFor must be a valid ISO date string');
    } else if (scheduledDate.getTime() < Date.now()) {
      errors.push('scheduledFor must be in the future');
    }
  }

  // Boolean validations
  if (dto.isPinned !== undefined && typeof dto.isPinned !== 'boolean') {
    errors.push('isPinned must be a boolean');
  }

  if (dto.commentsDisabled !== undefined && typeof dto.commentsDisabled !== 'boolean') {
    errors.push('commentsDisabled must be a boolean');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    dto: dto as CreatePostDto,
  };
}

/**
 * Validate create comment DTO
 */
export function validateCreateCommentDto(data: unknown): {
  valid: boolean;
  errors?: string[];
  dto?: CreateCommentDto;
} {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid request body'] };
  }

  const dto = data as Partial<CreateCommentDto>;

  // Content validation
  if (!dto.content || typeof dto.content !== 'string') {
    errors.push('content is required and must be a string');
  } else if (dto.content.trim().length === 0) {
    errors.push('content cannot be empty');
  } else if (dto.content.length > 2000) {
    errors.push('content must not exceed 2000 characters');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    dto: dto as CreateCommentDto,
  };
}

/**
 * Sanitize HTML content (simple XSS prevention)
 */
export function sanitizeContent(content: string): string {
  return content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}
