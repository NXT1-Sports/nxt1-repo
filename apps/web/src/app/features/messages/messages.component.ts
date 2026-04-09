/**
 * @fileoverview Messages Page - Web App Wrapper
 * @module @nxt1/web/features/messages
 * @version 2.0.0
 *
 * Thin wrapper component that imports the shared Messages shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ USES WEB-OPTIMIZED SHELL FOR SSR & SEO ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthService
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MessagesShellWebComponent, type MessagesUser } from '@nxt1/ui/messages';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { Conversation } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../../core/services/auth/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [MessagesShellWebComponent],
  template: `
    <nxt1-messages-shell-web
      [user]="userInfo()"
      (conversationClick)="onConversationClick($event)"
      (compose)="onCompose()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('MessagesComponent');
  private readonly seo = inject(SeoService);

  /** Transform auth user to MessagesUser interface */
  protected readonly userInfo = computed<MessagesUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
    };
  });

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Messages',
      description:
        'View and manage your conversations with coaches, recruiters, and teammates on NXT1.',
      keywords: ['messages', 'chat', 'conversations', 'recruiting', 'coaches'],
      noIndex: true,
      canonicalUrl: '/messages',
    });

    this.logger.debug('Messages page initialized');
  }

  /** Navigate to conversation thread */
  protected onConversationClick(conversation: Conversation): void {
    this.logger.debug('Conversation selected', { conversationId: conversation.id });
    this.router.navigate(['/messages', conversation.id]);
  }

  /** Navigate to compose new message */
  protected onCompose(): void {
    this.logger.debug('Compose new message');
    this.router.navigate(['/messages', 'new']);
  }
}
