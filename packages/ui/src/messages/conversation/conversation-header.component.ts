/**
 * @fileoverview Conversation Header Component
 * @module @nxt1/ui/messages/conversation
 * @version 2.0.0
 *
 * Uses the standard NXT1 page header so conversation screens match
 * the rest of the mobile app header system.
 *
 * ⭐ SHARED — Works on both web and mobile ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Conversation } from '@nxt1/core';
import { NxtPageHeaderComponent } from '../../components/page-header';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '../../agent-x/fab/agent-x-logo.constants';
import { HapticsService } from '../../services/haptics/haptics.service';

@Component({
  selector: 'nxt1-conversation-header',
  standalone: true,
  imports: [CommonModule, NxtPageHeaderComponent],
  template: `
    <nxt1-page-header [title]="title()" [showBack]="true" (backClick)="onBack()">
      <button
        type="button"
        pageHeaderSlot="end"
        class="header-agentx-action"
        (click)="onAgentXClick()"
        aria-label="Open Agent X"
      >
        <svg
          class="header-agentx-logo"
          viewBox="0 0 612 792"
          width="46"
          height="46"
          fill="currentColor"
          stroke="currentColor"
          stroke-width="8"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path [attr.d]="agentXLogoPath" />
          <polygon [attr.points]="agentXLogoPolygon" />
        </svg>
      </button>
    </nxt1-page-header>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .header-agentx-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border: none;
        border-radius: var(--nxt1-borderRadius-full);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        -webkit-tap-highlight-color: transparent;
        overflow: visible;
      }

      .header-agentx-action:active {
        transform: scale(0.96);
      }

      .header-agentx-logo {
        display: block;
        width: 46px;
        height: 46px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationHeaderComponent {
  private readonly haptics = inject(HapticsService);

  readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  /** Conversation metadata */
  readonly conversation = input<Conversation | null>(null);

  /** Display title */
  readonly title = input('');

  /** Subtitle (online status, member count, etc.) */
  readonly subtitle = input('');

  /** Whether the other participant is online */
  readonly isOnline = input(false);

  /** Emitted when back button is pressed */
  readonly backClick = output<void>();

  /** Emitted when header center (info) is tapped */
  readonly infoClick = output<void>();

  /** Emitted when Agent X action is pressed */
  readonly agentXClick = output<void>();

  async onBack(): Promise<void> {
    await this.haptics.impact('light');
    this.backClick.emit();
  }

  async onAgentXClick(): Promise<void> {
    await this.haptics.impact('medium');
    this.agentXClick.emit();
  }
}
