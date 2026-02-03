/**
 * @fileoverview Agent X Page - Web App Wrapper
 * @module @nxt1/web/features/agent-x
 * @version 1.0.0
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
import {
  AgentXShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  type AgentXUser,
} from '@nxt1/ui';
import type { AgentXMode } from '@nxt1/core';
import { AuthFlowService } from '../auth/services/auth-flow.service';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-agent-x',
  standalone: true,
  imports: [AgentXShellComponent],
  template: `
    <nxt1-agent-x-shell
      [user]="userInfo()"
      (avatarClick)="onAvatarClick()"
      (modeChange)="onModeChange($event)"
    />
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
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

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Agent X - AI Assistant',
      description:
        'Your AI-powered recruiting assistant. Get personalized insights, analysis, and recommendations.',
      keywords: ['ai', 'agent x', 'assistant', 'recruiting', 'insights'],
      noIndex: true, // Protected page - don't index
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
    // In production: track analytics event
    // this.analytics.track('agent_x_mode_change', { mode });
  }
}
