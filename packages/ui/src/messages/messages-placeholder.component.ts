/**
 * @fileoverview Shared messages empty/placeholder state
 * @module @nxt1/ui/messages
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-messages-placeholder',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="messages-empty">
      <div class="empty-icon-wrapper">
        <svg
          class="empty-icon"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h2 class="empty-title">Messages Coming Soon</h2>
      <p class="empty-description">
        We're building a secure messaging system to connect athletes, coaches, and recruiters. Check
        back soon!
      </p>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .messages-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--nxt1-spacing-16) var(--nxt1-spacing-6);
        min-height: 60%;
      }

      .empty-icon-wrapper {
        width: var(--nxt1-spacing-20);
        height: var(--nxt1-spacing-20);
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-surface-100);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-6);
      }

      .empty-icon {
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        color: var(--nxt1-color-text-tertiary);
      }

      .empty-title {
        font-size: var(--nxt1-font-size-xl);
        font-weight: var(--nxt1-font-weight-bold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-3);
      }

      .empty-description {
        font-size: var(--nxt1-font-size-base);
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        max-width: var(--nxt1-spacing-80);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesPlaceholderComponent {}
