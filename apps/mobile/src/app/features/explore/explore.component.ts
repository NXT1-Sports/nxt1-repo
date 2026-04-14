/**
 * @fileoverview Explore Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/explore
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Explore shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthFlowService
 */

import { Component, ChangeDetectionStrategy, inject, computed, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  ExploreShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  NxtToastService,
  type ExploreUser,
  ExploreService,
} from '@nxt1/ui';
import {
  buildCanonicalProfilePath,
  type ExploreTabId,
  type ExploreItem,
  type FeedPost,
  type FeedAuthor,
} from '@nxt1/core';
import { AuthFlowService } from '../../core/services/auth/auth-flow.service';
import { ProfileService } from '../../core/services/state/profile.service';

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, ExploreShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-explore-shell
        #shellRef
        [user]="userInfo()"
        (avatarClick)="onAvatarClick()"
        (tabChange)="onTabChange($event)"
        (itemClick)="onItemClick($event)"
        (postSelect)="onPostSelect($event)"
        (authorSelect)="onAuthorSelect($event)"
        (newsArticleSelect)="onNewsArticleSelect($event)"
        (detectLocation)="onDetectLocation()"
      />
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
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }
      ion-content::part(scroll) {
        overflow: visible;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly navController = inject(NavController);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('ExploreComponent');
  private readonly toast = inject(NxtToastService);
  private readonly exploreService = inject(ExploreService);
  private readonly profileService = inject(ProfileService);

  private readonly shellRef = viewChild<ExploreShellComponent>('shellRef');

  /**
   * Transform auth user to ExploreUser interface.
   */
  protected readonly userInfo = computed<ExploreUser | null>(() => {
    const user = this.authFlow.user();
    if (!user) return null;

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
      sport: this.profileService.primarySport()?.sport ?? null,
      state: this.profileService.user()?.location?.state ?? null,
    };
  });

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle tab changes for analytics/logging.
   */
  protected onTabChange(tab: ExploreTabId): void {
    this.logger.debug('Explore tab changed', { tab });
    // In production: track analytics event
    // this.analytics.track('explore_tab_change', { tab });
  }

  /**
   * Handle item click - navigate to detail page.
   */
  protected onItemClick(item: ExploreItem): void {
    this.logger.debug('Explore item clicked', { id: item.id, type: item.type, route: item.route });

    // Navigate to the item's route
    if (item.route) {
      this.navController.navigateForward(item.route);
    }
  }

  // ── Feed / Following / News Handlers ──

  /**
   * Handle post selection - navigate to post detail.
   */
  protected onPostSelect(post: FeedPost): void {
    this.logger.debug('Feed post selected', { id: post.id, type: post.type });
    // Navigate to post detail when ready
    // this.navController.navigateForward(['/post', post.id]);
  }

  /**
   * Handle author selection - navigate to author profile.
   */
  protected onAuthorSelect(author: FeedAuthor): void {
    this.logger.debug('Author selected', { uid: author.uid, profileCode: author.profileCode });
    this.navController.navigateForward(
      buildCanonicalProfilePath({
        athleteName: author.displayName || `${author.firstName} ${author.lastName}`.trim(),
        sport: author.sport,
        unicode: author.profileCode,
      })
    );
  }

  /**
   * Handle news article selection - navigate to article page.
   */
  protected onNewsArticleSelect(article: { id: string; title: string }): void {
    this.logger.debug('News article selected', { id: article.id });
    this.navController.navigateForward(['/pulse', article.id]);
  }

  /**
   * Handle detect-location event.
   * Uses the saved account location as the source of truth for Explore filters.
   */
  protected async onDetectLocation(): Promise<void> {
    const state = this.profileService.user()?.location?.state ?? null;

    if (state) {
      this.logger.info('Applying saved account location', { state });
      this.exploreService.applyDetectedState(state);
      this.shellRef()?.completeDetectLocation(state);
      this.toast.success(`Location set to ${state}`);
      return;
    }

    this.logger.warn('No saved account location available');
    this.shellRef()?.completeDetectLocation(null);
    this.toast.error('No location is saved to your account yet. Please add it in your profile.');
  }
}
