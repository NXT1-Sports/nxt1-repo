/**
 * @fileoverview Create Post Module Index
 * @module @nxt1/core/create-post
 * @version 1.0.0
 *
 * NOTE: PostType and MediaType are intentionally not re-exported here to avoid
 * name conflicts with the same-named types in @nxt1/core/constants.
 * Import them directly via '@nxt1/core/create-post' if needed.
 */

export type {
  PostPrivacy,
  PostMedia,
  PostLocation,
  TaggableUser,
  PostXpBreakdown,
  PostDraft,
  CreatePostState,
  PrivacyOption,
  UploadStatus,
  CreatePostStatus,
  MediaUploadConfig,
  PollOption,
  PostPoll,
  XpRewardTier,
  PostValidationError,
  PostValidationResult,
  CreatePostRequest,
  CreatePostResponse,
  MediaUploadRequest,
  MediaUploadResponse,
  PostTypeOption,
} from './create-post.types';

export * from './create-post.constants';
