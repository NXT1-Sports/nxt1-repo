/**
 * @fileoverview Agent X Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/agent-x
 * @version 2.0.0
 *
 * Thin wrapper component that imports the shared Agent X shell
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
  AgentXShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  type AgentXUser,
} from '@nxt1/ui';
import type { AgentXMode } from '@nxt1/core';
import { AuthFlowService } from '../auth/services/auth-flow.service';

@Component({
  selector: 'app-agent-x',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, AgentXShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-agent-x-shell
        [user]="userInfo()"
        (avatarClick)="onAvatarClick()"
        (modeChange)="onModeChange($event)"
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
export class AgentXComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly navController = inject(NavController);
  private readonly logger = inject(NxtLoggingService).child('AgentXComponent');

  /**
   * Transform auth user to AgentXUser interface.
   */
  protected readonly userInfo = computed<AgentXUser | null>(() => {
    const user = this.authFlow.user();
    if (!user) return null;

    return {
      profileImg: user.profileImg,
      displayName: user.displayName,
      role: user.role,
    };
  });

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle mode changes for analytics/logging.
   */
  protected onModeChange(mode: AgentXMode): void {
    this.logger.debug('Agent X mode changed', { mode });
    // In production: track analytics event
    // this.analytics.track('agent_x_mode_change', { mode });
  }
}
