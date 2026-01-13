/**
 * @fileoverview Analytics Event Schemas
 * @module @nxt1/core/analytics
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Type-safe event payload schemas for all analytics events.
 * These interfaces ensure consistent event structure across platforms.
 *
 * @example
 * ```typescript
 * import { APP_EVENTS, type AuthSignedUpEvent } from '@nxt1/core/analytics';
 *
 * // Type-safe event tracking
 * const event: AuthSignedUpEvent = {
 *   method: 'email',
 *   user_type: 'athlete',
 *   referral_source: 'friend',
 * };
 * analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, event);
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type {
  BaseEventProperties,
  TrafficSource,
  ViewerType,
  ContentType,
  AuthMethod,
  PlanType,
} from './events';

// ============================================
// AUTH EVENTS
// ============================================

export interface AuthSignedUpEvent extends BaseEventProperties {
  method: AuthMethod;
  user_type?: ViewerType;
  referral_source?: string;
  team_code?: string;
}

export interface AuthSignedInEvent extends BaseEventProperties {
  method: AuthMethod;
  user_type?: ViewerType;
}

export interface AuthSignedOutEvent extends BaseEventProperties {
  reason?: 'user_initiated' | 'session_expired' | 'forced';
}

export interface AuthErrorEvent extends BaseEventProperties {
  error_code: string;
  error_message?: string;
  method?: AuthMethod;
  stage: 'signup' | 'signin' | 'password_reset' | 'verification';
}

// ============================================
// ONBOARDING EVENTS
// ============================================

export interface OnboardingStartedEvent extends BaseEventProperties {
  user_type: ViewerType;
  total_steps: number;
  first_step_id: string;
  team_code?: string;
  referral_source?: string;
}

export interface OnboardingStepEvent extends BaseEventProperties {
  step_id: string;
  step_name: string;
  step_number: number;
  total_steps: number;
  user_type: ViewerType;
  time_on_step_ms?: number;
  action: 'viewed' | 'completed' | 'skipped';
}

export interface OnboardingCompletedEvent extends BaseEventProperties {
  user_type: ViewerType;
  steps_completed: number;
  steps_skipped: number;
  total_time_ms?: number;
  sport?: string;
  team_code?: string;
}

// ============================================
// PROFILE EVENTS
// ============================================

export interface ProfileViewedEvent extends BaseEventProperties {
  profile_id: string;
  profile_sport?: string;
  viewer_type?: ViewerType;
  source: TrafficSource;
  source_id?: string;
  is_own_profile: boolean;
}

export interface ProfileEditedEvent extends BaseEventProperties {
  fields_updated: string[];
  sport_index?: number;
}

export interface ProfileSharedEvent extends BaseEventProperties {
  share_method: 'link' | 'qr' | 'social' | 'email';
  share_platform?: string;
}

// ============================================
// VIDEO EVENTS
// ============================================

export interface VideoViewedEvent extends BaseEventProperties {
  video_id: string;
  video_type: 'mixtape' | 'highlight' | 'game_film';
  owner_id: string;
  source: TrafficSource;
  viewer_type?: ViewerType;
}

export interface VideoPlayedEvent extends BaseEventProperties {
  video_id: string;
  video_type: 'mixtape' | 'highlight' | 'game_film';
  start_position_seconds?: number;
}

export interface VideoCompletedEvent extends BaseEventProperties {
  video_id: string;
  video_type: 'mixtape' | 'highlight' | 'game_film';
  watch_duration_seconds: number;
  completion_percent: number;
}

export interface VideoSharedEvent extends BaseEventProperties {
  video_id: string;
  share_method: 'link' | 'social' | 'embed';
  share_platform?: string;
}

// ============================================
// POST EVENTS
// ============================================

export interface PostViewedEvent extends BaseEventProperties {
  post_id: string;
  post_type?: string;
  author_id: string;
  source: TrafficSource;
}

export interface PostCreatedEvent extends BaseEventProperties {
  post_id: string;
  post_type?: string;
  has_media: boolean;
  media_count?: number;
}

// ============================================
// ENGAGEMENT EVENTS
// ============================================

export interface UserFollowedEvent extends BaseEventProperties {
  followed_user_id: string;
  followed_user_type?: ViewerType;
  source: TrafficSource;
}

export interface ReactionAddedEvent extends BaseEventProperties {
  content_id: string;
  content_type: ContentType;
  reaction_type: string;
}

export interface CommentAddedEvent extends BaseEventProperties {
  content_id: string;
  content_type: ContentType;
  comment_length?: number;
  is_reply?: boolean;
}

// ============================================
// SEARCH EVENTS
// ============================================

export interface SearchPerformedEvent extends BaseEventProperties {
  query: string;
  search_type: 'athletes' | 'videos' | 'colleges' | 'all';
  results_count: number;
  filters_applied?: string[];
}

export interface SearchResultClickedEvent extends BaseEventProperties {
  query: string;
  result_id: string;
  result_type: ContentType;
  result_position: number;
}

// ============================================
// SUBSCRIPTION EVENTS
// ============================================

export interface SubscriptionStartedEvent extends BaseEventProperties {
  plan: PlanType;
  billing_period: 'monthly' | 'yearly';
  price?: number;
  currency?: string;
  trial?: boolean;
}

export interface SubscriptionChangedEvent extends BaseEventProperties {
  from_plan: PlanType;
  to_plan: PlanType;
  change_type: 'upgrade' | 'downgrade' | 'cancel' | 'renew';
  reason?: string;
}

export interface CreditsUsedEvent extends BaseEventProperties {
  feature: string;
  credits_used: number;
  credits_remaining: number;
}

// ============================================
// AI EVENTS
// ============================================

export interface AITaskEvent extends BaseEventProperties {
  task_type: string;
  status: 'started' | 'completed' | 'failed';
  tokens_used?: number;
  duration_ms?: number;
  error_message?: string;
}

// ============================================
// ERROR EVENTS
// ============================================

export interface ErrorOccurredEvent extends BaseEventProperties {
  error_code: string;
  error_message: string;
  error_stack?: string;
  component?: string;
  fatal: boolean;
}

// ============================================
// NAVIGATION EVENTS
// ============================================

export interface ScreenViewedEvent extends BaseEventProperties {
  screen_name: string;
  screen_class?: string;
  previous_screen?: string;
}

// ============================================
// APP LIFECYCLE EVENTS
// ============================================

export interface SessionEvent extends BaseEventProperties {
  action: 'started' | 'ended';
  duration_seconds?: number;
  pages_viewed?: number;
}

export interface AppOpenedEvent extends BaseEventProperties {
  launch_type: 'cold' | 'warm' | 'hot';
  launch_time_ms?: number;
  previous_version?: string;
}

// ============================================
// TYPE MAP
// ============================================

/**
 * Map of event names to their payload types
 * Use with generic trackEvent for type inference
 */
export interface EventPayloadMap {
  // Auth
  auth_signed_up: AuthSignedUpEvent;
  auth_signed_in: AuthSignedInEvent;
  auth_signed_out: AuthSignedOutEvent;
  auth_signup_error: AuthErrorEvent;
  auth_signin_error: AuthErrorEvent;

  // Onboarding
  onboarding_started: OnboardingStartedEvent;
  onboarding_step_viewed: OnboardingStepEvent;
  onboarding_step_completed: OnboardingStepEvent;
  onboarding_completed: OnboardingCompletedEvent;

  // Profile
  profile_viewed: ProfileViewedEvent;
  profile_edited: ProfileEditedEvent;
  profile_shared: ProfileSharedEvent;

  // Video
  video_viewed: VideoViewedEvent;
  video_played: VideoPlayedEvent;
  video_completed: VideoCompletedEvent;
  video_shared: VideoSharedEvent;

  // Post
  post_viewed: PostViewedEvent;
  post_created: PostCreatedEvent;

  // Engagement
  user_followed: UserFollowedEvent;
  reaction_added: ReactionAddedEvent;
  comment_added: CommentAddedEvent;

  // Search
  search_performed: SearchPerformedEvent;
  search_result_clicked: SearchResultClickedEvent;

  // Subscription
  subscription_started: SubscriptionStartedEvent;
  subscription_upgraded: SubscriptionChangedEvent;
  subscription_downgraded: SubscriptionChangedEvent;
  subscription_cancelled: SubscriptionChangedEvent;
  credits_used: CreditsUsedEvent;

  // AI
  ai_task_started: AITaskEvent;
  ai_task_completed: AITaskEvent;
  ai_task_failed: AITaskEvent;

  // Error
  error_occurred: ErrorOccurredEvent;

  // Navigation
  screen_viewed: ScreenViewedEvent;

  // Lifecycle
  session_started: SessionEvent;
  session_ended: SessionEvent;
  app_opened: AppOpenedEvent;
}

/**
 * Helper type to get event payload type from event name
 */
export type EventPayload<T extends keyof EventPayloadMap> = EventPayloadMap[T];
