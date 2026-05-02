import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'nxt1-agent-x-operation-chat-thinking',
  standalone: true,
  template: `
    <div class="thinking-block">
      <div class="thinking-block__avatar">
        <svg class="thinking-block__spinner" viewBox="0 0 16 16" fill="none" width="16" height="16">
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            stroke-width="2"
            stroke-dasharray="28"
            stroke-dashoffset="8"
            stroke-linecap="round"
          />
        </svg>
      </div>
      <span class="thinking-block__label">{{ displayLabel }}</span>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .thinking-block {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        animation: fadeSlideIn 0.3s ease-out;
      }

      .thinking-block__avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--op-primary);
      }

      .thinking-block__spinner {
        width: 16px;
        height: 16px;
        animation: thinkingSpin 1s linear infinite;
      }

      .thinking-block__label {
        font-size: 13px;
        font-weight: 500;
        letter-spacing: -0.01em;
        background: linear-gradient(
          90deg,
          var(--op-text-muted, rgba(211, 218, 227, 0.72)) 0%,
          var(--op-text, rgba(233, 238, 245, 0.96)) 50%,
          var(--op-text-muted, rgba(211, 218, 227, 0.72)) 100%
        );
        background-size: 200% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: thinkingShimmer 2s linear infinite;
      }

      @keyframes fadeSlideIn {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes thinkingSpin {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes thinkingShimmer {
        to {
          background-position: 200% center;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .thinking-block__spinner {
          animation: none;
        }

        .thinking-block__label {
          animation: none;
          color: var(--op-text-secondary);
          background: none;
          -webkit-background-clip: unset;
          background-clip: unset;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOperationChatThinkingComponent {
  @Input() label: string | null = null;

  protected get displayLabel(): string {
    const value = this.label?.trim();
    return value && value.length > 0 ? value : 'Agent X is thinking...';
  }
}
