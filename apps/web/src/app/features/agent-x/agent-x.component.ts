/**
 * @fileoverview Agent X Page - Web App Wrapper
 * @module @nxt1/web/features/agent-x
 * @version 2.0.0
 *
 * Thin wrapper component that imports the shared Agent X shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ LANDING STATE PATTERN (2026) ⭐
 * When logged OUT: Shows full-screen marketing landing state only.
 * When logged IN: Shows only the full Agent X shell.
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthFlowService
 * - Auth-gated landing section visibility
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import {
  AgentXShellWebComponent,
  NxtAgentXLandingComponent,
  NxtAgentXExecutionLayerSectionComponent,
  NxtAgentXWelcomeHeaderComponent,
  NxtSidenavService,
  NxtLoggingService,
  NxtPlatformService,
  type AgentXUser,
} from '@nxt1/ui';
import type { AgentXMode } from '@nxt1/core';
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
  ],
  template: `
    @if (isAuthenticated()) {
      <!-- Authenticated users: full Agent X shell -->
      <nxt1-agent-x-shell-web
        [user]="userInfo()"
        [hideHeader]="isDesktop()"
        [hideInput]="false"
        (avatarClick)="onAvatarClick()"
        (modeChange)="onModeChange($event)"
      />
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
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly logger = inject(NxtLoggingService).child('AgentXComponent');
  private readonly seo = inject(SeoService);
  private readonly platform = inject(NxtPlatformService);

  /** Desktop detection for hiding redundant page header (sidebar provides nav) */
  protected readonly isDesktop = computed(() => this.platform.viewport().width >= 1280);

  /** Auth state — hard-gates shell visibility */
  protected readonly isAuthenticated = computed(() => this.authFlow.isAuthenticated());

  ngOnInit(): void {
    const isAuthenticated = this.authFlow.isAuthenticated();

    this.seo.updatePage({
      title: 'Agent X - AI Assistant | NXT1',
      description:
        'Your AI-powered recruiting assistant. Create highlight films, recruiting graphics, draft coach emails, and get evaluations — all through a simple conversation.',
      keywords: ['ai', 'agent x', 'assistant', 'recruiting', 'highlights', 'graphics', 'nxt1'],
      noIndex: isAuthenticated, // Index for logged-out (SEO landing), noindex for logged-in
    });
  }

  /**
   * Transform auth user to AgentXUser interface.
   */
  protected readonly userInfo = computed<AgentXUser | null>(() => {
    const user = this.authFlow.user();
    if (!user) return null;

    return {
      photoURL: user.photoURL,
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
  }
}
