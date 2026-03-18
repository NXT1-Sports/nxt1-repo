/**
 * @fileoverview Create Post Page Component (Web)
 * @module apps/web/features/create-post
 * @version 1.0.0
 *
 * Web-specific wrapper for the Create Post feature.
 * Uses shared UI components from @nxt1/ui.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  CreatePostShellComponent,
  CreatePostService,
  CreatePostApiService,
  MOCK_CURRENT_USER,
  MOCK_XP_PREVIEW,
} from '@nxt1/ui/create-post';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { CreatePostState, TaggableUser, PostXpBreakdown } from '@nxt1/core';
import { SeoService } from '../../core/services';

type CreateOptionId = 'post' | 'video' | 'graphic' | 'event';

interface CreateOption {
  readonly id: CreateOptionId;
  readonly title: string;
  readonly description: string;
}

@Component({
  selector: 'app-create-post',
  standalone: true,
  imports: [CommonModule, CreatePostShellComponent],
  template: `
    <div class="create-post-page">
      <!-- Backdrop for modal effect on web -->
      <div class="create-post-page__backdrop" (click)="onBackdropClick()"></div>

      <!-- Modal container -->
      <div class="create-post-page__modal">
        @if (viewMode() === 'options') {
          <section class="create-selection">
            <header class="create-selection__header">
              <h1 class="create-selection__title">Create/Add</h1>
            </header>

            <div class="create-selection__content">
              <p class="create-selection__subtitle">Choose what you want to create.</p>

              <div class="create-selection__list">
                @for (option of createOptions; track option.id) {
                  <button
                    type="button"
                    class="create-selection__item"
                    (click)="onSelectOption(option.id)"
                    [attr.aria-label]="option.title"
                  >
                    <div class="create-selection__item-body">
                      <h2 class="create-selection__item-title">{{ option.title }}</h2>
                      <p class="create-selection__item-description">{{ option.description }}</p>
                    </div>
                  </button>
                }
              </div>
            </div>
          </section>
        } @else {
          <nxt1-create-post-shell
            [user]="currentUser()"
            [loading]="loading()"
            [headerTitle]="'Create/Add'"
            [isFirstPost]="isFirstPost()"
            [streakDays]="streakDays()"
            [xpBreakdown]="xpBreakdown()"
            (close)="onClose()"
            (submit)="onSubmit($event)"
            (addMedia)="onAddMedia()"
            (addTag)="onAddTag()"
            (addLocation)="onAddLocation()"
            (addPoll)="onAddPoll()"
          />
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         CREATE POST PAGE - Web Modal Layout
         ============================================ */

      :host {
        display: block;
      }

      .create-post-page {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 40px 20px;
        overflow-y: auto;
      }

      /* ============================================
         BACKDROP
         ============================================ */

      .create-post-page__backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        animation: fadeIn 0.2s ease;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      /* ============================================
         MODAL
         ============================================ */

      .create-post-page__modal {
        position: relative;
        width: 100%;
        max-width: 600px;
        background: var(--nxt1-color-bg-primary, var(--ion-background-color));
        border-radius: var(--nxt1-radius-xl, 16px);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s var(--nxt1-easing-out, ease-out);
        overflow: hidden;
      }

      .create-selection {
        min-height: 100%;
        display: flex;
        flex-direction: column;
      }

      .create-selection__header {
        display: flex;
        align-items: center;
        padding: 16px;
        border-bottom: 1px solid var(--nxt1-color-border-default);
      }

      .create-selection__title {
        margin: 0;
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .create-selection__content {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .create-selection__subtitle {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-secondary);
      }

      .create-selection__list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .create-selection__item {
        width: 100%;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--nxt1-color-surface-100);
        padding: 14px 16px;
        text-align: left;
        cursor: pointer;
        transition: border-color var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
      }

      .create-selection__item:hover,
      .create-selection__item:focus-visible {
        border-color: var(--nxt1-color-primary);
        outline: none;
      }

      .create-selection__item-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .create-selection__item-title {
        margin: 0;
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .create-selection__item-description {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-secondary);
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (max-width: 640px) {
        .create-post-page {
          padding: 0;
          align-items: stretch;
        }

        .create-post-page__modal {
          max-width: 100%;
          border-radius: 0;
          min-height: 100%;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePostComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly createPostService = inject(CreatePostService);
  private readonly api = inject(CreatePostApiService);
  private readonly seo = inject(SeoService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('CreatePostComponent');

  // UI State
  protected readonly loading = signal(true);
  protected readonly viewMode = signal<'options' | 'post'>('options');
  protected readonly createOptions: readonly CreateOption[] = [
    {
      id: 'post',
      title: 'Create Post',
      description: 'Share an update, highlight, or recruiting moment.',
    },
    {
      id: 'video',
      title: 'Create Video',
      description: 'Start a new video flow for clips or reels.',
    },
    {
      id: 'graphic',
      title: 'Create Graphic',
      description: 'Build a branded visual for your profile or feed.',
    },
    {
      id: 'event',
      title: 'Add New Event',
      description: 'Add an event to keep your schedule and profile current.',
    },
  ];
  protected readonly currentUser = signal<TaggableUser | null>(null);
  protected readonly isFirstPost = signal(false);
  protected readonly streakDays = signal(0);
  protected readonly xpBreakdown = signal<PostXpBreakdown | null>(null);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Create/Add',
      description: 'Choose what you want to create and publish on NXT1.',
      keywords: ['create', 'add', 'post', 'video', 'graphic', 'event'],
      noIndex: true, // Protected page - don't index
    });
    this.loadInitialData();
  }

  ngOnDestroy(): void {
    // Reset service state when leaving
    this.createPostService.reset();
  }

  /**
   * Load initial data.
   */
  private async loadInitialData(): Promise<void> {
    try {
      // Simulate API loading (replace with real API calls)
      await new Promise((resolve) => setTimeout(resolve, 500));

      // For demo, use mock data
      this.currentUser.set(MOCK_CURRENT_USER);
      this.isFirstPost.set(false);
      this.streakDays.set(7);
      this.xpBreakdown.set(MOCK_XP_PREVIEW);

      // Configure service
      this.createPostService.setCurrentUser(MOCK_CURRENT_USER);
      this.createPostService.setIsFirstPost(false);
      this.createPostService.setStreakDays(7);
    } catch (error) {
      this.logger.error('Failed to load create post data', error);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Handle backdrop click.
   */
  protected onBackdropClick(): void {
    // Check if dirty before closing
    if (this.createPostService.isDirty()) {
      // TODO: Show confirmation dialog
      // For now, just close
      this.onClose();
    } else {
      this.onClose();
    }
  }

  /**
   * Handle close.
   */
  protected onClose(): void {
    // Navigate back or to feed
    this.router.navigate(['/feed']);
  }

  /**
   * Handle create option selection.
   */
  protected onSelectOption(optionId: CreateOptionId): void {
    if (optionId === 'post') {
      this.viewMode.set('post');
      return;
    }

    const selectedOption = this.createOptions.find((option) => option.id === optionId);
    this.toast.info(`${selectedOption?.title ?? 'This option'} is coming soon`);
  }

  /**
   * Handle submit.
   */
  protected async onSubmit(state: CreatePostState): Promise<void> {
    try {
      this.createPostService.setIsSubmitting(true);

      // TODO: Call API to create post
      // const result = await this.api.createPost({
      //   content: state.content,
      //   privacy: state.privacy,
      //   mediaIds: state.media.map(m => m.id),
      //   locationId: state.location?.id,
      //   taggedUserIds: state.tags.map(t => t.id),
      //   poll: state.poll ?? undefined,
      //   scheduledAt: state.scheduledAt?.toISOString(),
      // });

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      this.logger.info('Post submitted', { privacy: state.draft.privacy });

      // Navigate to success or feed
      this.router.navigate(['/feed']);
    } catch (error) {
      this.logger.error('Failed to create post', error);
      // TODO: Show error toast
    } finally {
      this.createPostService.setIsSubmitting(false);
    }
  }

  /**
   * Handle add media.
   */
  protected onAddMedia(): void {
    // TODO: Open media picker dialog
    this.logger.debug('Add media requested');
  }

  /**
   * Handle add tag.
   */
  protected onAddTag(): void {
    // TODO: Open tag picker dialog
    this.logger.debug('Add tag requested');
  }

  /**
   * Handle add location.
   */
  protected onAddLocation(): void {
    // TODO: Open location picker dialog
    this.logger.debug('Add location requested');
  }

  /**
   * Handle add poll.
   */
  protected onAddPoll(): void {
    // TODO: Open poll editor dialog
    this.logger.debug('Add poll requested');
  }
}
