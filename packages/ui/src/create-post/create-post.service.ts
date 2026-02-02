/**
 * @fileoverview Create Post Service
 * @module @nxt1/ui/create-post
 * @version 1.0.0
 *
 * Signal-based state management service for Create Post feature.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Signal-based reactive state
 * - Computed derived state
 * - Validation
 * - Draft auto-save
 * - XP calculation
 * - Optimistic updates
 *
 * @example
 * ```typescript
 * private readonly createPostService = inject(CreatePostService);
 *
 * // Access signals
 * readonly content = this.createPostService.content;
 * readonly canSubmit = this.createPostService.canSubmit;
 *
 * // Actions
 * this.createPostService.setContent('Hello world');
 * await this.createPostService.submit();
 * ```
 */

import { Injectable, signal, computed } from '@angular/core';
import type {
  PostMedia,
  PostPrivacy,
  PostLocation,
  PostDraft,
  TaggableUser,
  CreatePostState,
  CreatePostStatus,
  PostXpBreakdown,
  PostType,
  PostPoll,
} from '@nxt1/core';
import {
  POST_MAX_CHARACTERS,
  POST_MAX_MEDIA,
  XP_REWARD_TIERS,
  XP_BONUSES,
  validatePost,
  getRemainingCharacters,
} from '@nxt1/core';

export interface CreatePostServiceState {
  content: string;
  postType: PostType;
  privacy: PostPrivacy;
  media: readonly PostMedia[];
  location: PostLocation | null;
  tags: readonly TaggableUser[];
  poll: PostPoll | null;
  scheduledAt: Date | null;
  isSubmitting: boolean;
  isUploading: boolean;
  uploadProgress: number;
  isDirty: boolean;
  lastSavedAt: Date | null;
}

const initialState: CreatePostServiceState = {
  content: '',
  postType: 'text',
  privacy: 'public',
  media: [],
  location: null,
  tags: [],
  poll: null,
  scheduledAt: null,
  isSubmitting: false,
  isUploading: false,
  uploadProgress: 0,
  isDirty: false,
  lastSavedAt: null,
};

@Injectable({ providedIn: 'root' })
export class CreatePostService {
  // Private writeable signals
  private readonly _content = signal(initialState.content);
  private readonly _postType = signal<PostType>(initialState.postType);
  private readonly _privacy = signal<PostPrivacy>(initialState.privacy);
  private readonly _media = signal<readonly PostMedia[]>(initialState.media);
  private readonly _location = signal<PostLocation | null>(initialState.location);
  private readonly _tags = signal<readonly TaggableUser[]>(initialState.tags);
  private readonly _poll = signal<PostPoll | null>(initialState.poll);
  private readonly _scheduledAt = signal<Date | null>(initialState.scheduledAt);
  private readonly _isSubmitting = signal(initialState.isSubmitting);
  private readonly _isUploading = signal(initialState.isUploading);
  private readonly _uploadProgress = signal(initialState.uploadProgress);
  private readonly _isDirty = signal(initialState.isDirty);
  private readonly _lastSavedAt = signal<Date | null>(initialState.lastSavedAt);
  private readonly _currentUser = signal<TaggableUser | null>(null);
  private readonly _isFirstPost = signal(false);
  private readonly _streakDays = signal(0);

  // Public readonly computed signals
  readonly content = computed(() => this._content());
  readonly postType = computed(() => this._postType());
  readonly privacy = computed(() => this._privacy());
  readonly media = computed(() => this._media());
  readonly location = computed(() => this._location());
  readonly tags = computed(() => this._tags());
  readonly poll = computed(() => this._poll());
  readonly scheduledAt = computed(() => this._scheduledAt());
  readonly isSubmitting = computed(() => this._isSubmitting());
  readonly isUploading = computed(() => this._isUploading());
  readonly uploadProgress = computed(() => this._uploadProgress());
  readonly isDirty = computed(() => this._isDirty());
  readonly lastSavedAt = computed(() => this._lastSavedAt());
  readonly currentUser = computed(() => this._currentUser());
  readonly isFirstPost = computed(() => this._isFirstPost());
  readonly streakDays = computed(() => this._streakDays());

  // Derived computed signals
  readonly hasContent = computed(() => this._content().trim().length > 0);
  readonly hasMedia = computed(() => this._media().length > 0);
  readonly hasLocation = computed(() => this._location() !== null);
  readonly hasTags = computed(() => this._tags().length > 0);
  readonly hasPoll = computed(() => this._poll() !== null);

  readonly characterCount = computed(() => this._content().length);
  readonly remainingCharacters = computed(() => getRemainingCharacters(this._content()));
  readonly characterProgress = computed(() =>
    Math.min((this._content().length / POST_MAX_CHARACTERS) * 100, 100)
  );
  readonly isNearCharacterLimit = computed(() => {
    const remaining = this.remainingCharacters();
    return remaining <= 100 && remaining > 0;
  });
  readonly isOverCharacterLimit = computed(() => this.remainingCharacters() < 0);

  readonly mediaCount = computed(() => this._media().length);
  readonly canAddMedia = computed(() => this._media().length < POST_MAX_MEDIA);
  readonly canAddPoll = computed(() => !this.hasMedia());

  readonly validation = computed(() => {
    const draft: PostDraft = {
      id: '',
      content: this._content(),
      type: this._postType(),
      privacy: this._privacy(),
      media: [...this._media()],
      taggedUsers: [...this._tags()],
      location: this._location() ?? undefined,
      poll: this._poll() ?? undefined,
      savedAt: new Date().toISOString(),
      characterCount: this._content().length,
    };
    return validatePost(draft);
  });
  readonly isValid = computed(() => this.validation().isValid);
  readonly validationErrors = computed(() => this.validation().errors);

  readonly canSubmit = computed(() => {
    if (this._isSubmitting()) return false;
    if (!this.hasContent() && !this.hasMedia() && !this.hasPoll()) return false;
    return this.isValid();
  });

  /** Calculate XP preview */
  readonly xpBreakdown = computed<PostXpBreakdown>(() => {
    const media = this._media();
    const tags = this._tags();
    const poll = this._poll();
    const isFirstPost = this._isFirstPost();
    const streakDays = this._streakDays();

    // Determine post type
    let postType: PostType = 'text';
    if (media.some((m) => m.type === 'video')) {
      postType = 'video';
    } else if (media.length > 0) {
      postType = 'photo';
    } else if (poll) {
      postType = 'poll';
    }

    // Base XP - find from array
    const tier = XP_REWARD_TIERS.find((t) => t.type === postType);
    const baseXp = tier?.baseXp ?? 10;

    // Calculate media bonus (XP per media up to max)
    const mediaBonus = Math.min(media.length * XP_BONUSES.PER_MEDIA, XP_BONUSES.MAX_MEDIA_BONUS);

    // Calculate tag bonus (XP per tag up to max)
    const tagBonus = Math.min(tags.length * XP_BONUSES.PER_TAG, XP_BONUSES.MAX_TAG_BONUS);

    // Daily first post bonus
    const dailyBonus = isFirstPost ? XP_BONUSES.DAILY_FIRST_POST : 0;

    // Streak bonus (multiplied by streak days)
    const streakBonus = Math.floor(streakDays * XP_BONUSES.STREAK_MULTIPLIER);

    // First ever post bonus (separate from daily)
    const firstPostBonus = isFirstPost ? XP_BONUSES.FIRST_POST_BONUS : 0;

    const totalXp = baseXp + mediaBonus + tagBonus + dailyBonus + streakBonus + firstPostBonus;

    return {
      baseXp,
      mediaBonus,
      tagBonus,
      dailyBonus,
      streakBonus,
      totalXp,
      streakCount: streakDays,
      isFirstPost,
    };
  });

  /** Current state snapshot */
  readonly state = computed<CreatePostState>(() => {
    const draft: PostDraft = {
      id: '',
      content: this._content(),
      type: this._postType(),
      privacy: this._privacy(),
      media: [...this._media()],
      taggedUsers: [...this._tags()],
      location: this._location() ?? undefined,
      poll: this._poll() ?? undefined,
      scheduledFor: this._scheduledAt()?.toISOString(),
      savedAt: this._lastSavedAt()?.toISOString() ?? new Date().toISOString(),
      characterCount: this._content().length,
    };

    const status: CreatePostStatus = this._isSubmitting()
      ? 'submitting'
      : this._isUploading()
        ? 'uploading'
        : this._content().trim() || this._media().length > 0
          ? 'composing'
          : 'idle';

    return {
      status,
      draft,
      xpPreview: this.xpBreakdown(),
      showXpCelebration: false,
      earnedXp: null,
      validation: this.validation(),
      error: null,
      isDirty: this._isDirty(),
      isAutoSaving: false,
      isUploadingMedia: this._isUploading(),
      uploadProgress: this._uploadProgress(),
    };
  });

  // === Actions ===

  /**
   * Set post content.
   */
  setContent(content: string): void {
    this._content.set(content);
    this._isDirty.set(true);
    this.updatePostType();
  }

  /**
   * Set privacy level.
   */
  setPrivacy(privacy: PostPrivacy): void {
    this._privacy.set(privacy);
    this._isDirty.set(true);
  }

  /**
   * Add media item.
   */
  addMedia(media: PostMedia): void {
    if (this.canAddMedia()) {
      this._media.update((items) => [...items, media]);
      this._isDirty.set(true);
      this.updatePostType();
    }
  }

  /**
   * Remove media item.
   */
  removeMedia(id: string): void {
    this._media.update((items) => items.filter((m) => m.id !== id));
    this._isDirty.set(true);
    this.updatePostType();
  }

  /**
   * Update media item.
   */
  updateMedia(id: string, updates: Partial<PostMedia>): void {
    this._media.update((items) => items.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }

  /**
   * Reorder media items.
   */
  reorderMedia(from: number, to: number): void {
    this._media.update((items) => {
      const result = [...items];
      const [removed] = result.splice(from, 1);
      result.splice(to, 0, removed);
      return result;
    });
    this._isDirty.set(true);
  }

  /**
   * Set location.
   */
  setLocation(location: PostLocation | null): void {
    this._location.set(location);
    this._isDirty.set(true);
  }

  /**
   * Add tag.
   */
  addTag(user: TaggableUser): void {
    if (!this._tags().some((t) => t.id === user.id)) {
      this._tags.update((tags) => [...tags, user]);
      this._isDirty.set(true);
    }
  }

  /**
   * Remove tag.
   */
  removeTag(userId: string): void {
    this._tags.update((tags) => tags.filter((t) => t.id !== userId));
    this._isDirty.set(true);
  }

  /**
   * Set poll.
   */
  setPoll(poll: PostPoll | null): void {
    this._poll.set(poll);
    this._isDirty.set(true);
    this.updatePostType();
  }

  /**
   * Set scheduled time.
   */
  setScheduledAt(date: Date | null): void {
    this._scheduledAt.set(date);
    this._isDirty.set(true);
  }

  /**
   * Set current user.
   */
  setCurrentUser(user: TaggableUser | null): void {
    this._currentUser.set(user);
  }

  /**
   * Set first post flag.
   */
  setIsFirstPost(isFirst: boolean): void {
    this._isFirstPost.set(isFirst);
  }

  /**
   * Set streak days.
   */
  setStreakDays(days: number): void {
    this._streakDays.set(days);
  }

  /**
   * Set upload progress.
   */
  setUploadProgress(progress: number): void {
    this._uploadProgress.set(progress);
  }

  /**
   * Set uploading state.
   */
  setIsUploading(uploading: boolean): void {
    this._isUploading.set(uploading);
  }

  /**
   * Set submitting state.
   */
  setIsSubmitting(submitting: boolean): void {
    this._isSubmitting.set(submitting);
  }

  /**
   * Load draft.
   */
  loadDraft(draft: PostDraft): void {
    this._content.set(draft.content);
    this._postType.set(draft.type);
    this._privacy.set(draft.privacy);
    this._media.set(draft.media);
    this._location.set(draft.location ?? null);
    this._tags.set(draft.taggedUsers);
    this._poll.set(draft.poll ?? null);
    this._scheduledAt.set(draft.scheduledFor ? new Date(draft.scheduledFor) : null);
    this._isDirty.set(false);
    this._lastSavedAt.set(new Date(draft.savedAt));
    this.updatePostType();
  }

  /**
   * Export as draft.
   */
  exportDraft(): Partial<PostDraft> {
    return {
      content: this._content(),
      type: this._postType(),
      privacy: this._privacy(),
      media: [...this._media()],
      taggedUsers: [...this._tags()],
      location: this._location() ?? undefined,
      poll: this._poll() ?? undefined,
      scheduledFor: this._scheduledAt()?.toISOString(),
      characterCount: this._content().length,
    };
  }

  /**
   * Reset to initial state.
   */
  reset(): void {
    this._content.set(initialState.content);
    this._postType.set(initialState.postType);
    this._privacy.set(initialState.privacy);
    this._media.set(initialState.media);
    this._location.set(initialState.location);
    this._tags.set(initialState.tags);
    this._poll.set(initialState.poll);
    this._scheduledAt.set(initialState.scheduledAt);
    this._isSubmitting.set(initialState.isSubmitting);
    this._isUploading.set(initialState.isUploading);
    this._uploadProgress.set(initialState.uploadProgress);
    this._isDirty.set(initialState.isDirty);
    this._lastSavedAt.set(initialState.lastSavedAt);
  }

  /**
   * Mark as saved.
   */
  markSaved(): void {
    this._isDirty.set(false);
    this._lastSavedAt.set(new Date());
  }

  // Private helpers

  private updatePostType(): void {
    const media = this._media();
    const poll = this._poll();

    if (media.some((m) => m.type === 'video')) {
      this._postType.set('video');
    } else if (media.length > 0) {
      this._postType.set('photo');
    } else if (poll) {
      this._postType.set('poll');
    } else {
      this._postType.set('text');
    }
  }
}
