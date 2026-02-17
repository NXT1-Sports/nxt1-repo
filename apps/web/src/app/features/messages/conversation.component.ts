/**
 * @fileoverview Conversation Page - Web App Wrapper
 * @module @nxt1/web/features/messages
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Conversation shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ USES WEB-OPTIMIZED SHELL FOR SSR & SEO ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation (Angular Router)
 * - Route parameter extraction
 * - SEO metadata
 */

import { Component, ChangeDetectionStrategy, inject, input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ConversationShellWebComponent, NxtLoggingService, NxtToastService } from '@nxt1/ui';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-conversation',
  standalone: true,
  imports: [ConversationShellWebComponent],
  template: `
    <nxt1-conversation-shell-web
      [conversationId]="conversationId()"
      (backClick)="onBack()"
      (infoClick)="onInfo()"
      (callClick)="onCall()"
      (videoClick)="onVideo()"
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
export class ConversationComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('ConversationComponent');
  private readonly seo = inject(SeoService);
  private readonly toast = inject(NxtToastService);

  /** Conversation ID from route parameter */
  readonly conversationId = input.required<string>();

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Conversation',
      description: 'View your conversation on NXT1.',
      noIndex: true,
      canonicalUrl: `/messages/${this.conversationId()}`,
    });

    this.logger.debug('Conversation page initialized', {
      conversationId: this.conversationId(),
    });
  }

  /** Navigate back to messages list */
  protected onBack(): void {
    this.router.navigate(['/messages']);
  }

  /** Open conversation info/details */
  protected onInfo(): void {
    this.logger.debug('Conversation info requested');
    this.toast.info('Profile view coming soon');
  }

  /** Initiate voice call */
  protected onCall(): void {
    this.logger.debug('Voice call requested');
    this.toast.info('Voice calls coming soon');
  }

  /** Initiate video call */
  protected onVideo(): void {
    this.logger.debug('Video call requested');
    this.toast.info('Video calls coming soon');
  }
}
