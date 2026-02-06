/**
 * @fileoverview Messages Page Component
 * @module @nxt1/web/features/messages
 *
 * Displays user conversations and direct messages.
 * Backend-first: All messages fetched from API with real-time updates.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtLoggingService } from '@nxt1/ui';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="messages-page">
      <header class="page-header">
        <h1 class="page-title">Messages</h1>
        <p class="page-subtitle">Your conversations</p>
      </header>

      <main class="page-content">
        <!-- Messages content will be implemented with shared @nxt1/ui components -->
        <div class="coming-soon">
          <div class="coming-soon-icon">💬</div>
          <h2>Messages Coming Soon</h2>
          <p>
            We're building a secure messaging system to connect athletes, coaches, and recruiters.
            Check back soon!
          </p>
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        background: var(--nxt1-color-bg-primary);
      }

      .messages-page {
        flex: 1;
        padding: var(--nxt1-spacing-6);
        max-width: 1200px;
        margin: 0 auto;
        width: 100%;
      }

      .page-header {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .page-title {
        font-size: var(--nxt1-font-size-3xl);
        font-weight: var(--nxt1-font-weight-bold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2);
      }

      .page-subtitle {
        font-size: var(--nxt1-font-size-lg);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .coming-soon {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--nxt1-spacing-16);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-radius-lg);
      }

      .coming-soon-icon {
        font-size: 4rem;
        margin-bottom: var(--nxt1-spacing-4);
      }

      .coming-soon h2 {
        font-size: var(--nxt1-font-size-xl);
        font-weight: var(--nxt1-font-weight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2);
      }

      .coming-soon p {
        font-size: var(--nxt1-font-size-base);
        color: var(--nxt1-color-text-secondary);
        max-width: 400px;
        margin: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesComponent implements OnInit {
  private readonly logger = inject(NxtLoggingService).child('MessagesComponent');
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Messages',
      description:
        'View and manage your conversations with coaches, recruiters, and teammates on NXT1.',
      keywords: ['messages', 'chat', 'conversations', 'recruiting', 'coaches'],
      noIndex: true, // Protected page - don't index
      canonicalUrl: '/messages',
    });

    this.logger.debug('Messages page initialized');
  }
}
