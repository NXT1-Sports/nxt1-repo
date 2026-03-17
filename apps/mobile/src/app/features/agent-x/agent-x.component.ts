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
import { IonHeader, IonContent, IonToolbar } from '@ionic/angular/standalone';
import {
  AgentXShellComponent,
  AgentOnboardingShellMobileComponent,
  AgentOnboardingService,
  AgentXService,
  NxtSidenavService,
  NxtLoggingService,
  type AgentXUser,
} from '@nxt1/ui';
import { AuthFlowService } from '../auth/services/auth-flow.service';

@Component({
  selector: 'app-agent-x',
  standalone: true,
  imports: [
    IonHeader,
    IonContent,
    IonToolbar,
    AgentXShellComponent,
    AgentOnboardingShellMobileComponent,
  ],
  template: `
    @if (showOnboarding()) {
      <!-- Onboarding flow — native Ionic shell -->
      <nxt1-agent-onboarding-shell-mobile (onboardingComplete)="onOnboardingComplete()" />
    } @else {
      <!-- Agent X Command Center -->
      <ion-header class="ion-no-border" [translucent]="true">
        <ion-toolbar></ion-toolbar>
      </ion-header>
      <ion-content [fullscreen]="true">
        <nxt1-agent-x-shell [user]="userInfo()" (avatarClick)="onAvatarClick()" />
      </ion-content>
    }
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
export class AgentXComponent implements OnInit {
  private readonly authFlow = inject(AuthFlowService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly logger = inject(NxtLoggingService).child('AgentXComponent');
  private readonly onboarding = inject(AgentOnboardingService);
  private readonly route = inject(ActivatedRoute);
  private readonly agentX = inject(AgentXService);

  /** Whether to show onboarding flow */
  protected readonly showOnboarding = computed(() => this.onboarding.needsOnboarding());

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
    // TODO: Check backend for onboarding completion status
    const needsOnboarding = false; // Skip onboarding by default until backend flag is wired
    this.onboarding.initialize(role, needsOnboarding);
    this.logger.info('Agent X initialized (mobile)', { role, needsOnboarding });

    // Load thread from deep link query param (?thread=<id>)
    const threadId = this.route.snapshot.queryParamMap.get('thread');
    if (threadId) {
      this.logger.info('Loading thread from query param', { threadId });
      void this.agentX.loadThread(threadId);
    }
  }

  /**
   * Handle onboarding completion — transition to Agent X shell.
   */
  onOnboardingComplete(): void {
    this.logger.info('Onboarding complete, transitioning to Agent X shell');
    this.onboarding.markAsCompleted();
  }

  /**
   * Handle avatar click — open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }
}
