/**
 * @fileoverview Create Post Module - Barrel Export
 * @module @nxt1/core/create-post
 * @version 1.0.0
 */

// Types
export type {
  PostType,
  PostPrivacy,
  MediaType,
  UploadStatus,
  CreatePostStatus,
  PostMedia,
  MediaUploadConfig,
  TaggableUser,
  PostLocation,
  PollOption,
  PostPoll,
  XpRewardTier,
  PostXpBreakdown,
  PostDraft,
  CreatePostRequest,
  CreatePostResponse,
  MediaUploadRequest,
  MediaUploadResponse,
  PostValidationError,
  PostValidationResult,
  CreatePostState,
  PrivacyOption,
  PostTypeOption,
} from './create-post.types';

// Constants
export {
  POST_MAX_CHARACTERS,
  POST_MIN_CHARACTERS,
  POST_MAX_MEDIA,
  POST_MAX_TAGS,
  POST_MAX_POLL_OPTIONS,
  POST_MIN_POLL_OPTIONS,
  POST_MAX_POLL_DURATION,
  POST_AUTOSAVE_DELAY,
  IMAGE_UPLOAD_CONFIG,
  VIDEO_UPLOAD_CONFIG,
  ALLOWED_MEDIA_TYPES,
  POST_TYPE_OPTIONS,
  POST_DEFAULT_TYPE,
  PRIVACY_OPTIONS,
  POST_DEFAULT_PRIVACY,
  XP_REWARD_TIERS,
  XP_BONUSES,
  POST_TYPE_ICONS,
  PRIVACY_ICONS,
  POST_TYPE_COLORS,
  CREATE_POST_API_ENDPOINTS,
  CREATE_POST_UI_CONFIG,
  POST_PLACEHOLDERS,
  CREATE_POST_EMPTY_STATES,
} from './create-post.constants';

// API
export { createCreatePostApi, type CreatePostApi } from './create-post.api';

// Validation
export {
  VALIDATION_ERROR_CODES,
  validatePostContent,
  validateMediaItem,
  validatePostMedia,
  validatePoll,
  validatePost,
  validateCreatePostRequest,
  isContentValid,
  getRemainingCharacters,
  isCharacterWarning,
  isCharacterExceeded,
} from './create-post.validation';
