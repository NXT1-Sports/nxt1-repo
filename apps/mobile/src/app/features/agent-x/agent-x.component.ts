/**
 * @fileoverview Agent X Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/agent-x
 * @version 3.0.0
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

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonHeader, IonToolbar } from '@ionic/angular/standalone';
import {
  AgentXShellComponent,
  AgentXService,
  NxtSidenavService,
  NxtLoggingService,
  type AgentXUser,
} from '@nxt1/ui';
import { AuthFlowService } from '../../core/services/auth/auth-flow.service';

@Component({
  selector: 'app-agent-x',
  standalone: true,
  imports: [IonHeader, IonToolbar, AgentXShellComponent],
  template: `
    <!-- Agent X Command Center -->
    <!-- Transparent header for safe-area inset -->
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <!-- Shell owns its own ion-content + ion-footer (proper Ionic page structure) -->
    <nxt1-agent-x-shell [user]="userInfo()" (avatarClick)="onAvatarClick()" />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
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
      nxt1-agent-x-shell {
        flex: 1;
        min-height: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXComponent implements OnInit {
  private readonly authFlow = inject(AuthFlowService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly logger = inject(NxtLoggingService).child('AgentXComponent');
  private readonly route = inject(ActivatedRoute);
  private readonly agentX = inject(AgentXService);

  /**
   * Transform auth user to AgentXUser interface.
   */
  protected readonly userInfo = computed<AgentXUser | null>(() => {
    const user = this.authFlow.user();
    if (!user) return null;

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
      role: user.role,
    };
  });

  ngOnInit(): void {
    const user = this.authFlow.user();
    const role = user?.role ?? 'athlete';
    this.logger.info('Agent X initialized (mobile)', { role });

    // Load thread from deep link query param (?thread=<id>) — opens in bottom sheet
    const threadId = this.route.snapshot.queryParamMap.get('thread');
    if (threadId) {
      this.logger.info('Queuing thread from query param', { threadId });
      this.agentX.queuePendingThread({ threadId, title: 'Agent X' });
    }
  }

  /**
   * Handle avatar click — open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }
}
