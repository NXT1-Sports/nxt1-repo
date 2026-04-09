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

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  signal,
  effect,
  Injector,
  OnInit,
  afterNextRender,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AgentXShellWebComponent } from '@nxt1/ui/agent-x/web';
import { NxtAgentXLandingComponent, type AgentXUser } from '@nxt1/ui/agent-x';
import { AgentXService } from '@nxt1/ui/agent-x';
import { NxtAgentXExecutionLayerSectionComponent } from '@nxt1/ui/components/agent-x-execution-layer-section';
import { NxtAgentXWelcomeHeaderComponent } from '@nxt1/ui/components/agent-x-welcome-header';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { AuthFlowService } from '../../core/services/auth/auth-flow.service';
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
  host: {
    '[class.agent-authenticated]': 'isAuthenticated()',
  },
  template: `
    <!-- Auth-init mask: covers landing→shell flash while Firebase session resolves -->
    @if (showAuthMask()) {
      <div class="auth-init-mask"></div>
    }

    @if (isAuthenticated()) {
      <!-- Authenticated users: full Agent X shell (goals check handled inside shell) -->
      <nxt1-agent-x-shell-web [user]="userInfo()" [hideInput]="false" />
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
        display: flex;
        flex-direction: column;
        background: var(--nxt1-color-bg-primary);
        /* Pull up to negate shell__content padding-top — Agent X uses nav portal, no page header */
        margin-top: calc(-1 * (var(--nxt1-spacing-4, 1rem) + 7px));
      }

      /* Only lock viewport height + prevent scroll for authenticated desktop (chat UI) */
      @media (min-width: 769px) {
        :host(.agent-authenticated) {
          height: calc(100vh - var(--nxt1-nav-height, 56px));
          overflow: hidden;
        }
      }

      /* On mobile the shell content padding-top is 0 so don't pull up */
      @media (max-width: 768px) {
        :host {
          margin-top: 0;
        }
      }

      .auth-init-mask {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: var(--nxt1-color-bg-primary);
        pointer-events: none;
        animation: authMaskFadeOut 200ms ease 50ms both;
      }

      @keyframes authMaskFadeOut {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
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
  private readonly route = inject(ActivatedRoute);
  private readonly agentX = inject(AgentXService);
  private readonly injector = inject(Injector);

  /**
   * Auth-init overlay: prevents the marketing landing page from flashing
   * for authenticated users while Firebase resolves the session token.
   * Starts hidden on SSR/first render, shows only if auth is not yet ready
   * on the client, then fades away once Firebase resolves.
   */
  protected readonly showAuthMask = signal(false);

  constructor() {
    afterNextRender(() => {
      if (!this.authFlow.isInitialized()) {
        this.showAuthMask.set(true);
        const stop = effect(
          () => {
            if (this.authFlow.isInitialized()) {
              this.showAuthMask.set(false);
              stop.destroy();
            }
          },
          { injector: this.injector }
        );
      }
    });
  }

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

    if (isAuthenticated) {
      // Load thread from deep link query param (?thread=<id>) — opens in bottom sheet
      const threadId = this.route.snapshot.queryParamMap.get('thread');
      if (threadId) {
        this.logger.info('Queuing thread from query param', { threadId });
        this.agentX.queuePendingThread({ threadId, title: 'Agent X' });
      }
    }
  }

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
}
