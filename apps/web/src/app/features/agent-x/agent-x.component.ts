/**
 * @fileoverview Agent X Page - Web App Wrapper
 * @module @nxt1/web/features/agent-x
 * @version 2.0.0
 *
 * Thin wrapper component that imports the shared Agent X shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ LANDING STATE PATTERN (2026) ⭐
 * When logged OUT: Shows the live Agent X shell at top, then fades
 * into marketing landing sections below (stats, features, FAQ, etc.)
 * When logged IN: Shows only the full Agent X shell — no landing content.
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
  imports: [AgentXShellWebComponent, NxtAgentXLandingComponent, NxtAgentXWelcomeHeaderComponent],
  template: `
    <!-- Agent X Shell — always visible (both logged-in and logged-out) -->
    <div class="agent-shell-wrapper" [class.agent-shell-wrapper--preview]="isLoggedOut()">
      <nxt1-agent-x-shell-web
        [user]="userInfo()"
        [hideHeader]="isDesktop()"
        [hideInput]="isLoggedOut()"
        (avatarClick)="onAvatarClick()"
        (modeChange)="onModeChange($event)"
      />

      <!-- Fade overlay — masks bottom of shell when logged-out -->
      @if (isLoggedOut()) {
        <div class="agent-fade-overlay" aria-hidden="true"></div>
      }
    </div>

    <!-- Welcome Header + Landing — shown after fade when logged out -->
    @if (isLoggedOut()) {
      <div class="agent-landing-surface">
        <div class="agent-welcome-wrapper">
          <nxt1-agent-x-welcome-header />
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

      .agent-landing-surface {
        position: relative;
        z-index: 2;
        background: var(--nxt1-color-bg-primary);
        padding-top: var(--nxt1-spacing-4);
      }

      .agent-welcome-wrapper {
        position: relative;
        z-index: 10;
        margin-top: calc(var(--nxt1-spacing-8) * -1);
        background: var(--nxt1-color-bg-primary);
      }

      /* ============================================
         SHELL WRAPPER — Live preview container
         When logged out, clips to a fixed height and
         adds a gradient fade at the bottom.
         When logged in, takes full height (normal).
         ============================================ */
      .agent-shell-wrapper {
        position: relative;
      }

      .agent-shell-wrapper--preview {
        max-height: 82vh;
        overflow: hidden;
      }

      /* Gradient fade overlay — bottom-to-top transparent-to-bg */
      .agent-fade-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 24%;
        background: linear-gradient(
          to bottom,
          transparent 0%,
          color-mix(in srgb, var(--nxt1-color-bg-primary) 22%, transparent) 42%,
          color-mix(in srgb, var(--nxt1-color-bg-primary) 58%, transparent) 70%,
          color-mix(in srgb, var(--nxt1-color-bg-primary) 86%, transparent) 88%,
          var(--nxt1-color-bg-primary) 100%
        );
        pointer-events: none;
        z-index: 1;
      }

      /* ============================================
         RESPONSIVE — Mobile adjustments
         ============================================ */
      @media (max-width: 768px) {
        .agent-shell-wrapper--preview {
          max-height: 72vh;
        }

        .agent-fade-overlay {
          height: 40%;
        }
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

  /** Auth state — drives landing section visibility */
  protected readonly isLoggedOut = computed(() => !this.authFlow.isAuthenticated());

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
