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
  computed,
  effect,
  signal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavController, IonContent, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import {
  CreatePostShellComponent,
  CreatePostService,
  HapticsService,
  NxtPageHeaderComponent,
  NxtSidenavService,
  NxtToastService,
  MOCK_XP_PREVIEW,
} from '@nxt1/ui';
import type { CreatePostState, TaggableUser, PostXpBreakdown } from '@nxt1/core';
import { USER_ROLES } from '@nxt1/core';
import { AuthFlowService } from '../auth/services/auth-flow.service';

type CreateOptionId = 'post' | 'video' | 'graphic' | 'event';

interface CreateOption {
  readonly id: CreateOptionId;
  readonly title: string;
  readonly description: string;
}

@Component({
  selector: 'app-create-post',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonContent,
    NxtPageHeaderComponent,
    CreatePostShellComponent,
  ],
  template: `
    <!-- Transparent Ionic header anchor for native page transitions -->
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      @if (viewMode() === 'options') {
        <section class="create-selection">
          <nxt1-page-header title="Create/Add" (menuClick)="onAvatarClick()" />

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
          [fullBleed]="true"
          [isFirstPost]="isFirstPost()"
          [streakDays]="streakDays()"
          [xpBreakdown]="xpBreakdown()"
          (avatarClick)="onAvatarClick()"
          (close)="onClose()"
          (submit)="onSubmit($event)"
          (addMedia)="onAddMedia()"
          (addTag)="onAddTag()"
          (addLocation)="onAddLocation()"
          (addPoll)="onAddPoll()"
        />
      }
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      ion-header {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: -1;
        --background: transparent;
      }
      ion-toolbar {
        --background: transparent;
        --min-height: 0;
        --padding-top: 0;
        --padding-bottom: 0;
      }

      ion-content {
        --background: var(--nxt1-color-bg-primary, var(--ion-background-color));
      }

      ion-content::part(scroll) {
        display: flex;
        flex-direction: column;
      }

      .create-selection {
        min-height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--nxt1-color-bg-primary, var(--ion-background-color));
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

      .create-selection__item:active,
      .create-selection__item:hover {
        border-color: var(--nxt1-color-primary);
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePostComponent implements OnInit, OnDestroy {
  private readonly navController = inject(NavController);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly authFlow = inject(AuthFlowService);
  private readonly createPostService = inject(CreatePostService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);

  private readonly authUser = this.authFlow.user;
  private readonly profile = this.authFlow.profile;

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
  protected readonly currentUser = computed<TaggableUser | null>(() => {
    const profile = this.profile();
    const authUser = this.authUser();

    if (!profile && !authUser) return null;

    const firstName = profile?.firstName?.trim() ?? '';
    const lastName = profile?.lastName?.trim() ?? '';
    const profileDisplayName = `${firstName} ${lastName}`.trim();
    const displayName = profileDisplayName || authUser?.displayName || 'User';

    const handleSource =
      authUser?.email?.split('@')[0] ?? displayName.replace(/\s+/g, '').toLowerCase();
    const username = `@${handleSource || 'user'}`;

    const role = (profile?.role ?? authUser?.role) as string | undefined;

    return {
      id: profile?.id ?? authUser?.uid ?? 'user',
      displayName,
      username,
      photoUrl: profile?.profileImgs?.[0] ?? authUser?.profileImg ?? undefined,
      verified: authUser?.emailVerified ?? false,
      type: this.mapRoleToTagType(role),
    };
  });
  protected readonly isFirstPost = signal(false);
  protected readonly streakDays = signal(0);
  protected readonly xpBreakdown = signal<PostXpBreakdown | null>(null);

  constructor() {
    effect(() => {
      this.createPostService.setCurrentUser(this.currentUser());
    });
  }

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
      this.isFirstPost.set(false);
      this.streakDays.set(7);
      this.xpBreakdown.set(MOCK_XP_PREVIEW);

      // Configure service
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
      await this.navController.back();
    } else {
      await this.navController.back();
    }
  }

  /**
   * Handle create option selection.
   */
  protected async onSelectOption(optionId: CreateOptionId): Promise<void> {
    await this.haptics.impact('light');

    if (optionId === 'post') {
      this.viewMode.set('post');
      return;
    }

    const selectedOption = this.createOptions.find((option) => option.id === optionId);
    this.toast.info(`${selectedOption?.title ?? 'This option'} is coming soon`);
  }

  /**
   * Handle avatar click.
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
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

      // Navigate back to the primary feed experience
      await this.navController.navigateRoot('/explore');
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

  private mapRoleToTagType(role: string | undefined): TaggableUser['type'] {
    if (role === USER_ROLES.COACH) return 'coach';
    if (role === USER_ROLES.RECRUITER) return 'college';
    if (role === USER_ROLES.DIRECTOR) return 'team';
    return 'athlete';
  }
}
