/**
 * @fileoverview Create Post Shell Component
 * @module @nxt1/ui/create-post
 * @version 1.0.0
 *
 * Main orchestrating container for the Create Post feature.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Header with close/post actions
 * - User avatar display
 * - Composed layout of all sub-components
 * - Form validation state
 * - Submit handling
 * - Keyboard-aware (mobile)
 *
 * @example
 * ```html
 * <nxt1-create-post-shell
 *   [user]="currentUser()"
 *   (close)="navigateBack()"
 *   (submit)="createPost($event)"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonRippleEffect, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, sparkles } from 'ionicons/icons';
import type {
  PostMedia,
  PostPrivacy,
  PostLocation,
  PostDraft,
  TaggableUser,
  CreatePostState,
  PostXpBreakdown,
} from '@nxt1/core';
import { POST_MAX_CHARACTERS, POST_MAX_MEDIA, validatePost } from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtLoggingService } from '../services/logging';
import { NxtPageHeaderComponent } from '../components/page-header';
import { CreatePostEditorComponent } from './create-post-editor.component';
import { CreatePostToolbarComponent } from './create-post-toolbar.component';
import { CreatePostMediaPickerComponent } from './create-post-media-picker.component';
import { CreatePostPrivacySelectorComponent } from './create-post-privacy-selector.component';
import { CreatePostXpIndicatorComponent } from './create-post-xp-indicator.component';
import { CreatePostPreviewComponent } from './create-post-preview.component';
import { CreatePostProgressComponent, type UploadingFile } from './create-post-progress.component';
import { CreatePostSkeletonComponent } from './create-post-skeleton.component';

// Register icons
@Component({
  selector: 'nxt1-create-post-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonRippleEffect,
    IonSpinner,
    NxtPageHeaderComponent,
    CreatePostEditorComponent,
    CreatePostToolbarComponent,
    CreatePostMediaPickerComponent,
    CreatePostPrivacySelectorComponent,
    CreatePostXpIndicatorComponent,
    CreatePostPreviewComponent,
    CreatePostProgressComponent,
    CreatePostSkeletonComponent,
  ],
  template: `
    <div
      class="shell"
      [class.shell--submitting]="isSubmitting()"
      [class.shell--desktop-modal]="!fullBleed()"
    >
      <!-- Shared Header -->
      <nxt1-page-header
        [title]="headerTitle()"
        [avatarSrc]="user()?.photoUrl"
        [avatarName]="user()?.displayName"
        (avatarClick)="onAvatarClick()"
      >
        <button
          pageHeaderSlot="end"
          type="button"
          class="shell__submit"
          [class.shell__submit--active]="canSubmit()"
          (click)="onSubmit()"
          [disabled]="!canSubmit() || isSubmitting()"
          aria-label="Post"
        >
          <ion-ripple-effect></ion-ripple-effect>
          @if (isSubmitting()) {
            <ion-spinner name="crescent"></ion-spinner>
          } @else {
            <span>Post</span>
          }
        </button>
      </nxt1-page-header>

      <!-- Loading skeleton -->
      @if (loading()) {
        <nxt1-create-post-skeleton variant="full" />
      } @else {
        <div class="shell__content">
          <!-- User row -->
          <div class="shell__user-row">
            <!-- Avatar -->
            <div class="shell__avatar">
              @if (user()?.photoUrl) {
                <img [src]="user()?.photoUrl" [alt]="user()?.displayName" />
              } @else {
                <div class="shell__avatar-placeholder">
                  {{ userInitials() }}
                </div>
              }
            </div>

            <!-- User info & privacy -->
            <div class="shell__user-info">
              <span class="shell__user-name">{{ user()?.displayName ?? 'User' }}</span>
              <nxt1-create-post-privacy-selector
                [privacy]="privacy()"
                (privacyChange)="onPrivacyChange($event)"
              />
            </div>

            <!-- XP indicator -->
            <nxt1-create-post-xp-indicator [xpBreakdown]="xpBreakdown()" />
          </div>

          <!-- Editor -->
          <nxt1-create-post-editor
            [(content)]="content"
            [maxCharacters]="maxCharacters()"
            [placeholder]="editorPlaceholder()"
            [disabled]="isSubmitting()"
            (submitRequested)="onSubmit()"
          />

          <!-- Upload progress -->
          @if (isUploading()) {
            <nxt1-create-post-progress
              [isUploading]="isUploading()"
              [overallProgress]="uploadProgress()"
              [files]="uploadingFiles()"
              (cancel)="onCancelUpload()"
            />
          }

          <!-- Media picker -->
          @if (showMediaPicker()) {
            <nxt1-create-post-media-picker
              [media]="media()"
              [maxMedia]="maxMedia()"
              [disabled]="isSubmitting()"
              (mediaAdd)="onAddMedia()"
              (mediaRemove)="onRemoveMedia($event)"
              (filesDropped)="onFilesDropped($event)"
            />
          }

          <!-- Preview (collapsed by default) -->
          <nxt1-create-post-preview
            [user]="user()"
            [content]="content()"
            [media]="media()"
            [privacy]="privacy()"
            [location]="location()"
            [expanded]="showPreview()"
            (toggleExpand)="togglePreview()"
          />

          <!-- Toolbar -->
          <nxt1-create-post-toolbar
            [disabled]="isSubmitting()"
            [hasMedia]="hasMedia()"
            [hasLocation]="!!location()"
            [hasPoll]="false"
            [canAddMedia]="canAddMedia()"
            [canAddPoll]="!hasMedia()"
            (addMedia)="onShowMediaPicker()"
            (addTag)="onAddTag()"
            (addLocation)="onAddLocation()"
            (addPoll)="onAddPoll()"
            (addGif)="onAddGif()"
            (addEmoji)="onAddEmoji()"
          />
        </div>
      }

      <!-- Keyboard spacer for mobile -->
      <div class="shell__keyboard-spacer"></div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         SHELL - Theme-aware Design
         ============================================ */

      :host {
        display: block;
        height: 100%;
      }

      .shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-bg-primary, var(--ion-background-color));
      }

      .shell--submitting {
        pointer-events: none;
      }

      /* ============================================
         HEADER
         ============================================ */

      .shell__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--nxt1-color-border-default);
        position: sticky;
        top: 0;
        background: var(--nxt1-color-bg-primary, var(--ion-background-color));
        z-index: 10;
      }

      .shell__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background: transparent;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      .shell__close:hover:not(:disabled) {
        background: var(--nxt1-color-surface-200);
      }

      .shell__close ion-icon {
        font-size: 24px;
        color: var(--nxt1-color-text-primary);
      }

      .shell__title {
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .shell__submit {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 80px;
        height: 36px;
        padding: 0 20px;
        -webkit-appearance: none;
        appearance: none;
        background: var(--nxt1-color-surface-300);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: inherit;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        -webkit-tap-highlight-color: transparent;
      }

      .shell__submit span {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary);
      }

      .shell__submit ion-spinner {
        --color: var(--nxt1-color-text-onPrimary);
        width: 18px;
        height: 18px;
      }

      .shell__submit--active {
        background: var(--nxt1-color-primary);
      }

      .shell__submit--active span {
        color: var(--nxt1-color-text-onPrimary);
      }

      .shell__submit--active:hover:not(:disabled) {
        background: var(--nxt1-color-primaryLight);
      }

      .shell__submit:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      /* ============================================
         CONTENT
         ============================================ */

      .shell__content {
        flex: 1;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        overflow-y: auto;
      }

      /* ============================================
         USER ROW
         ============================================ */

      .shell__user-row {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }

      .shell__avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
        background: var(--nxt1-color-surface-300);
      }

      .shell__avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .shell__avatar-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2));
      }

      .shell__user-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }

      .shell__user-name {
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ============================================
         KEYBOARD SPACER (Mobile)
         ============================================ */

      .shell__keyboard-spacer {
        flex-shrink: 0;
        height: env(safe-area-inset-bottom, 0);
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (min-width: 640px) {
        .shell.shell--desktop-modal {
          max-width: 600px;
          margin: 0 auto;
          border-radius: var(--nxt1-radius-xl, 16px);
          height: auto;
          max-height: 90vh;
          margin-top: 5vh;
        }

        .shell.shell--desktop-modal .shell__header {
          border-radius: var(--nxt1-radius-xl, 16px) var(--nxt1-radius-xl, 16px) 0 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePostShellComponent {
  constructor() {
    addIcons({
      'close-outline': closeOutline,
      sparkles,
    });
  }

  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('CreatePostShell');

  /** Current user */
  readonly user = input<TaggableUser | null>(null);

  /** Loading state */
  readonly loading = input(false);

  /** Header title */
  readonly headerTitle = input('Create Post');

  /** Is first post */
  readonly isFirstPost = input(false);

  /** Streak days */
  readonly streakDays = input(0);

  /** XP breakdown */
  readonly xpBreakdown = input<PostXpBreakdown | null>(null);

  /** Initial draft */
  readonly draft = input<PostDraft | null>(null);

  /** Max characters */
  readonly maxCharacters = input(POST_MAX_CHARACTERS);

  /** Max media */
  readonly maxMedia = input(POST_MAX_MEDIA);

  /** Editor placeholder */
  readonly editorPlaceholder = input("What's on your mind?");

  /**
   * Render as full-bleed page (mobile shell) instead of centered desktop modal card.
   */
  readonly fullBleed = input(false);

  /** Emitted when close is clicked */
  readonly close = output<void>();

  /** Emitted when avatar is clicked */
  readonly avatarClick = output<void>();

  /** Emitted when post is submitted */
  readonly submit = output<CreatePostState>();

  /** Emitted when add media is triggered */
  readonly addMedia = output<void>();

  /** Emitted when add tag is triggered */
  readonly addTag = output<void>();

  /** Emitted when add location is triggered */
  readonly addLocation = output<void>();

  /** Emitted when add poll is triggered */
  readonly addPoll = output<void>();

  /** Emitted when add GIF is triggered */
  readonly addGif = output<void>();

  /** Emitted when add emoji is triggered */
  readonly addEmoji = output<void>();

  /** Emitted when upload is cancelled */
  readonly cancelUpload = output<void>();

  // State signals
  protected readonly content = signal('');
  protected readonly privacy = signal<PostPrivacy>('public');
  protected readonly media = signal<readonly PostMedia[]>([]);
  protected readonly location = signal<PostLocation | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly isUploading = signal(false);
  protected readonly uploadProgress = signal(0);
  protected readonly uploadingFiles = signal<readonly UploadingFile[]>([]);
  protected readonly showMediaPicker = signal(false);
  protected readonly showPreview = signal(false);

  /** User initials for avatar placeholder */
  protected readonly userInitials = computed(() => {
    const name = this.user()?.displayName ?? '';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  });

  /** Whether has media */
  protected readonly hasMedia = computed(() => this.media().length > 0);

  /** Whether can add more media */
  protected readonly canAddMedia = computed(() => this.media().length < this.maxMedia());

  /** Whether form can be submitted */
  protected readonly canSubmit = computed(() => {
    const contentValue = this.content();
    const mediaValue = this.media();

    // Must have content or media
    if (!contentValue.trim() && mediaValue.length === 0) {
      return false;
    }

    // Validate content using full draft
    const draft: PostDraft = {
      id: '',
      content: contentValue,
      type: 'text',
      privacy: this.privacy(),
      media: [...mediaValue],
      taggedUsers: [],
      savedAt: new Date().toISOString(),
      characterCount: contentValue.length,
    };
    const validation = validatePost(draft);

    return validation.isValid;
  });

  /**
   * Handle close button click.
   */
  protected async onClose(): Promise<void> {
    await this.haptics.impact('light');
    this.close.emit();
  }

  /**
   * Handle avatar click.
   */
  protected async onAvatarClick(): Promise<void> {
    await this.haptics.impact('light');
    this.avatarClick.emit();
  }

  /**
   * Handle submit button click.
   */
  protected async onSubmit(): Promise<void> {
    if (!this.canSubmit() || this.isSubmitting()) return;

    await this.haptics.notification('success');
    this.isSubmitting.set(true);

    const draft: PostDraft = {
      id: '',
      content: this.content(),
      type: 'text',
      privacy: this.privacy(),
      media: [...this.media()],
      taggedUsers: [],
      location: this.location() ?? undefined,
      poll: undefined,
      savedAt: new Date().toISOString(),
      characterCount: this.content().length,
    };

    const state: CreatePostState = {
      status: 'submitting',
      draft,
      xpPreview: this.xpBreakdown(),
      showXpCelebration: false,
      earnedXp: null,
      validation: null,
      error: null,
      isDirty: false,
      isAutoSaving: false,
      isUploadingMedia: false,
      uploadProgress: 0,
    };

    this.submit.emit(state);
  }

  /**
   * Handle privacy change.
   */
  protected onPrivacyChange(privacy: PostPrivacy): void {
    this.privacy.set(privacy);
  }

  /**
   * Show media picker.
   */
  protected onShowMediaPicker(): void {
    this.showMediaPicker.set(true);
    this.addMedia.emit();
  }

  /**
   * Handle add media.
   */
  protected onAddMedia(): void {
    this.addMedia.emit();
  }

  /**
   * Handle remove media.
   */
  protected onRemoveMedia(id: string): void {
    this.media.update((items) => items.filter((m) => m.id !== id));
    if (this.media().length === 0) {
      this.showMediaPicker.set(false);
    }
  }

  /**
   * Handle files dropped.
   */
  protected onFilesDropped(files: FileList): void {
    // TODO: Process dropped files
    this.logger.debug('Files dropped', { count: files.length });
  }

  /**
   * Handle add tag.
   */
  protected onAddTag(): void {
    this.addTag.emit();
  }

  /**
   * Handle add location.
   */
  protected onAddLocation(): void {
    this.addLocation.emit();
  }

  /**
   * Handle add poll.
   */
  protected onAddPoll(): void {
    this.addPoll.emit();
  }

  /**
   * Handle add GIF.
   */
  protected onAddGif(): void {
    this.addGif.emit();
  }

  /**
   * Handle add emoji.
   */
  protected onAddEmoji(): void {
    this.addEmoji.emit();
  }

  /**
   * Handle cancel upload.
   */
  protected onCancelUpload(): void {
    this.cancelUpload.emit();
  }

  /**
   * Toggle preview.
   */
  protected togglePreview(): void {
    this.showPreview.update((v) => !v);
  }
}
