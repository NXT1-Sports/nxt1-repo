/**
 * @fileoverview Activity Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/activity
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Activity shell
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

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  ActivityShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  type ActivityUser,
} from '@nxt1/ui';
import type { ActivityTabId, ActivityItem } from '@nxt1/core';
import { AuthFlowService } from '../auth/services/auth-flow.service';
import { AgentXService } from '../agent-x/services';

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, ActivityShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-activity-shell
        [user]="userInfo()"
        (avatarClick)="onAvatarClick()"
        (tabChange)="onTabChange($event)"
        (itemNavigate)="onItemNavigate($event)"
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
export class ActivityComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly navController = inject(NavController);
  private readonly agentX = inject(AgentXService);
  private readonly logger = inject(NxtLoggingService).child('ActivityComponent');

  /**
   * Transform auth user to ActivityUser interface.
   */
  protected readonly userInfo = computed<ActivityUser | null>(() => {
    const user = this.authFlow.user();
    if (!user) return null;

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
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
  protected onTabChange(tab: ActivityTabId): void {
    this.logger.debug('Activity tab changed', { tab });
  }

  /**
   * Handle item navigation — route based on item type and deepLink.
   * Uses NavController for native page transitions.
   *
   * For agent_task items with imageUrl metadata (e.g. welcome graphic),
   * injects the image into the Agent X chat before navigating.
   */
  protected onItemNavigate(item: ActivityItem): void {
    if (!item.deepLink) {
      this.logger.debug('Item clicked without deepLink', { id: item.id, type: item.type });
      return;
    }

    this.logger.debug('Navigating to item', {
      id: item.id,
      type: item.type,
      deepLink: item.deepLink,
    });

    // Agent task with image (welcome graphic, generated content) —
    // inject the message into Agent X chat so it's visible on arrival.
    const imageUrl = item.metadata?.['imageUrl'] as string | undefined;
    if (item.type === 'agent_task' && imageUrl && item.deepLink.includes('agent')) {
      this.agentX.pushMessage({
        role: 'assistant',
        content: item.body ?? "Here's your personalized welcome graphic!",
        imageUrl,
      });
    }

    // Normalize deep link: web uses /agent-x, mobile uses /agent
    const normalizedLink = item.deepLink.replace(/^\/agent-x(\/|$)/, '/agent$1');
    void this.navController.navigateForward(normalizedLink);
  }
}
