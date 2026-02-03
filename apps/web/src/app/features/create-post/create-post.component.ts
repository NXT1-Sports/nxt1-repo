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
} from '@nxt1/ui';
import type { CreatePostState, TaggableUser, PostXpBreakdown } from '@nxt1/core';
import { SeoService } from '../../core/services';

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
        <nxt1-create-post-shell
          [user]="currentUser()"
          [loading]="loading()"
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
        background: var(--nxt1-color-surface-base, #0a0a0a);
        border-radius: var(--nxt1-radius-xl, 16px);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s var(--nxt1-easing-out, ease-out);
        overflow: hidden;
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

  // UI State
  protected readonly loading = signal(true);
  protected readonly currentUser = signal<TaggableUser | null>(null);
  protected readonly isFirstPost = signal(false);
  protected readonly streakDays = signal(0);
  protected readonly xpBreakdown = signal<PostXpBreakdown | null>(null);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Create Post',
      description: 'Share your athletic achievements, training sessions, and sports content.',
      keywords: ['create', 'post', 'share', 'content'],
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
      console.error('Failed to load create post data:', error);
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

      console.log('Post submitted:', state);

      // Navigate to success or feed
      this.router.navigate(['/feed']);
    } catch (error) {
      console.error('Failed to create post:', error);
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
    console.log('Add media');
  }

  /**
   * Handle add tag.
   */
  protected onAddTag(): void {
    // TODO: Open tag picker dialog
    console.log('Add tag');
  }

  /**
   * Handle add location.
   */
  protected onAddLocation(): void {
    // TODO: Open location picker dialog
    console.log('Add location');
  }

  /**
   * Handle add poll.
   */
  protected onAddPoll(): void {
    // TODO: Open poll editor dialog
    console.log('Add poll');
  }
}
