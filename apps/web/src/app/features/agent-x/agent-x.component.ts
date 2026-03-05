/**
 * @fileoverview Agent X Page - Web App Wrapper
 * @module @nxt1/web/features/agent-x
 * @version 2.1.0
 *
 * Thin wrapper component that imports the shared Agent X shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ LANDING STATE PATTERN (2026) ⭐
 * When logged OUT: Shows full-screen marketing landing state only.
 * When logged IN + NEEDS ONBOARDING: Shows onboarding flow.
 * When logged IN + ONBOARDED: Shows the full Agent X shell.
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthFlowService
 * - Auth-gated landing section visibility
 * - Onboarding flow orchestration
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { AgentXShellWebComponent } from '@nxt1/ui/agent-x/web';
import { NxtAgentXLandingComponent, type AgentXUser } from '@nxt1/ui/agent-x';
import { AgentOnboardingShellComponent, AgentOnboardingService } from '@nxt1/ui/agent-x/onboarding';
import { NxtAgentXExecutionLayerSectionComponent } from '@nxt1/ui/components/agent-x-execution-layer-section';
import { NxtAgentXWelcomeHeaderComponent } from '@nxt1/ui/components/agent-x-welcome-header';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { AuthFlowService } from '../auth/services/auth-flow.service';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-agent-x',
  standalone: true,
  imports: [
    AgentXShellWebComponent,
    NxtAgentXLandingComponent,
    NxtAgentXExecutionLayerSectionComponent,
    NxtAgentXWelcomeHeaderComponent,
    AgentOnboardingShellComponent,
  ],
  template: `
    @if (isAuthenticated()) {
      @if (showOnboarding()) {
        <!-- Authenticated users who haven't completed onboarding -->
        <nxt1-agent-onboarding-shell (onboardingComplete)="onOnboardingComplete()" />
      } @else {
        <!-- Authenticated users: full Agent X shell -->
        <nxt1-agent-x-shell-web [user]="userInfo()" [hideInput]="false" />
      }
    } @else {
      <!-- Logged-out users: full-screen landing state only -->
      <div class="agent-landing-shell">
        <div class="agent-welcome-wrapper">
          <nxt1-agent-x-welcome-header />
          <nxt1-agent-x-execution-layer-section />
        </div>

        <nxt1-agent-x-landing />
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }

      .agent-landing-shell {
        position: relative;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }

      .agent-welcome-wrapper {
        position: relative;
        z-index: 10;
        background: var(--nxt1-color-bg-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXComponent implements OnInit {
  private readonly authFlow = inject(AuthFlowService);
  private readonly logger = inject(NxtLoggingService).child('AgentXComponent');
  private readonly seo = inject(SeoService);
  private readonly onboarding = inject(AgentOnboardingService);

  /** Auth state — hard-gates shell visibility */
  protected readonly isAuthenticated = computed(() => this.authFlow.isAuthenticated());

  /** Whether to show onboarding flow */
  protected readonly showOnboarding = computed(() => this.onboarding.needsOnboarding());

  ngOnInit(): void {
    const isAuthenticated = this.authFlow.isAuthenticated();

    this.seo.updatePage({
      title: 'Agent X - AI Assistant | NXT1',
      description:
        'Your AI-powered recruiting assistant. Create highlight films, recruiting graphics, draft coach emails, and get evaluations — all through a simple conversation.',
      keywords: ['ai', 'agent x', 'assistant', 'recruiting', 'highlights', 'graphics', 'nxt1'],
      noIndex: isAuthenticated, // Index for logged-out (SEO landing), noindex for logged-in
    });

    // Initialize onboarding with user context
    if (isAuthenticated) {
      const user = this.authFlow.user();
      const role = user?.role ?? 'athlete';
      // TODO: Check backend for onboarding completion status
      const needsOnboarding = true; // Replace with actual check
      this.onboarding.initialize(role, needsOnboarding);
      this.logger.info('Agent X initialized', { role, needsOnboarding });
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
}
