/**
 * @fileoverview Create Post Page Component (Mobile)
 * @module apps/mobile/features/create-post
 * @version 1.0.0
 *
 * Mobile-specific wrapper for the Create Post feature.
 * Uses shared UI components from @nxt1/ui with Ionic integration.
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
import { NavController, IonContent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import {
  CreatePostShellComponent,
  CreatePostService,
  CreatePostApiService,
  HapticsService,
  MOCK_CURRENT_USER,
  MOCK_XP_PREVIEW,
} from '@nxt1/ui';
import type { CreatePostState, TaggableUser, PostXpBreakdown } from '@nxt1/core';

// Register icons
addIcons({
  'close-outline': closeOutline,
});

@Component({
  selector: 'app-create-post',
  standalone: true,
  imports: [CommonModule, IonContent, CreatePostShellComponent],
  template: `
    <ion-content [fullscreen]="true">
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
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
         CREATE POST PAGE - Mobile Full Screen
         ============================================ */

      :host {
        display: block;
        height: 100%;
      }

      ion-content {
        --background: var(--nxt1-color-surface-base, #0a0a0a);
      }

      ion-content::part(scroll) {
        display: flex;
        flex-direction: column;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePostComponent implements OnInit, OnDestroy {
  private readonly navController = inject(NavController);
  private readonly createPostService = inject(CreatePostService);
  private readonly api = inject(CreatePostApiService);
  private readonly haptics = inject(HapticsService);

  // UI State
  protected readonly loading = signal(true);
  protected readonly currentUser = signal<TaggableUser | null>(null);
  protected readonly isFirstPost = signal(false);
  protected readonly streakDays = signal(0);
  protected readonly xpBreakdown = signal<PostXpBreakdown | null>(null);

  ngOnInit(): void {
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
   * Handle close.
   */
  protected async onClose(): Promise<void> {
    await this.haptics.impact('light');

    // Check if dirty before closing
    if (this.createPostService.isDirty()) {
      // TODO: Show confirmation action sheet
      // For now, just close
      await this.navController.navigateBack('/home');
    } else {
      await this.navController.navigateBack('/home');
    }
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

      // Success haptic
      await this.haptics.notification('success');

      // Navigate to success or home
      await this.navController.navigateRoot('/home');
    } catch (error) {
      console.error('Failed to create post:', error);
      await this.haptics.notification('error');
      // TODO: Show error toast
    } finally {
      this.createPostService.setIsSubmitting(false);
    }
  }

  /**
   * Handle add media.
   */
  protected async onAddMedia(): Promise<void> {
    await this.haptics.impact('light');
    // TODO: Open media picker (Camera, Gallery)
    console.log('Add media');
  }

  /**
   * Handle add tag.
   */
  protected async onAddTag(): Promise<void> {
    await this.haptics.impact('light');
    // TODO: Navigate to tag picker
    console.log('Add tag');
  }

  /**
   * Handle add location.
   */
  protected async onAddLocation(): Promise<void> {
    await this.haptics.impact('light');
    // TODO: Open location picker
    console.log('Add location');
  }

  /**
   * Handle add poll.
   */
  protected async onAddPoll(): Promise<void> {
    await this.haptics.impact('light');
    // TODO: Navigate to poll editor
    console.log('Add poll');
  }
}
