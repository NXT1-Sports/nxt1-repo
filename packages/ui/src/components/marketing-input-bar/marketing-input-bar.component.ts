import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NxtIconComponent } from '../icon';

@Component({
  selector: 'nxt1-marketing-input-bar',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <form class="marketing-input-bar" (submit)="onSubmit($event)">
      <input
        type="text"
        class="marketing-input-bar__input"
        [placeholder]="placeholder()"
        [value]="value()"
        (input)="onInput($event)"
        [attr.aria-label]="ariaLabel()"
      />

      <button
        type="submit"
        class="marketing-input-bar__button"
        [class.marketing-input-bar__button--active]="active()"
        [attr.aria-label]="buttonLabel()"
        (click)="submitButtonClick.emit()"
      >
        <span class="marketing-input-bar__button-text">{{ buttonLabel() }}</span>
        <nxt1-icon name="arrowUp" [size]="18" />
      </button>
    </form>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        --marketing-input-bg: var(
          --agent-input-bg,
          color-mix(in srgb, var(--nxt1-color-surface-100) 86%, transparent)
        );
        --marketing-input-border: var(--agent-input-border, var(--nxt1-color-border-default));
        --marketing-input-shadow: var(--agent-input-shadow, var(--nxt1-shadow-md));
        --marketing-input-button-bg: var(
          --agent-input-button-bg,
          color-mix(in srgb, var(--nxt1-color-surface-200) 88%, transparent)
        );
        --marketing-input-button-hover-bg: var(
          --agent-input-button-hover-bg,
          color-mix(in srgb, var(--nxt1-color-surface-300) 90%, transparent)
        );
        --marketing-input-button-active-bg: var(
          --agent-input-button-active-bg,
          var(--nxt1-color-primary)
        );
        --marketing-input-button-active-color: var(
          --agent-input-button-active-color,
          var(--nxt1-color-text-onPrimary)
        );
        --marketing-input-button-active-shadow: var(
          --agent-input-button-active-shadow,
          var(--nxt1-glow-sm)
        );
      }

      .marketing-input-bar {
        display: flex;
        gap: var(--nxt1-spacing-2);
        align-items: center;
        width: 100%;
        position: relative;
        overflow: visible;
        background: var(--marketing-input-bg);
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        border: 1px solid var(--marketing-input-border);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        box-shadow:
          var(--marketing-input-shadow),
          0 0 0 1px var(--nxt1-color-alpha-primary10, var(--nxt1-color-alpha-primary15));
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease,
          transform 0.2s ease,
          border-radius 0.2s ease;
      }

      .marketing-input-bar::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        padding: 1px;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-alpha-primary30, var(--nxt1-color-alpha-primary15)),
          transparent,
          var(--nxt1-color-alpha-primary20, var(--nxt1-color-alpha-primary15))
        );
        mask:
          linear-gradient(#fff 0 0) content-box,
          linear-gradient(#fff 0 0);
        mask-composite: exclude;
        pointer-events: none;
        opacity: 0.6;
      }

      .marketing-input-bar::before {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: inherit;
        background: linear-gradient(
          45deg,
          transparent,
          var(--nxt1-color-alpha-primary20, var(--nxt1-color-alpha-primary15)),
          transparent,
          var(--nxt1-color-alpha-primary20, var(--nxt1-color-alpha-primary15)),
          transparent
        );
        background-size: 400% 400%;
        opacity: 0;
        animation: marketing-input-gradient-flow 3s ease-in-out infinite;
        pointer-events: none;
        z-index: -1;
      }

      @keyframes marketing-input-gradient-flow {
        0% {
          background-position: 0% 50%;
        }
        50% {
          background-position: 100% 50%;
        }
        100% {
          background-position: 0% 50%;
        }
      }

      .marketing-input-bar:focus-within {
        border-color: var(--nxt1-color-primary);
        box-shadow:
          var(--marketing-input-shadow),
          0 0 0 2px var(--nxt1-color-alpha-primary20, var(--nxt1-color-alpha-primary15)),
          0 0 28px var(--nxt1-color-alpha-primary20, var(--nxt1-color-alpha-primary15));
        transform: translateY(-1px);
      }

      .marketing-input-bar:focus-within::before {
        opacity: 1;
      }

      .marketing-input-bar__input {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-base);
        font-family: var(--nxt1-fontFamily-brand);
        outline: none;
        padding: 0;
      }

      .marketing-input-bar__input::placeholder {
        color: var(--nxt1-color-text-tertiary);
      }

      .marketing-input-bar__button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        background: var(--marketing-input-button-bg);
        color: var(--nxt1-color-text-secondary);
        border: 1px solid var(--marketing-input-border);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        cursor: pointer;
        transition: all 0.15s ease;
        flex-shrink: 0;
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .marketing-input-bar__button--active {
        background: var(--marketing-input-button-active-bg);
        color: var(--marketing-input-button-active-color);
        border-color: var(--nxt1-color-primary);
        box-shadow: var(--marketing-input-button-active-shadow);
      }

      .marketing-input-bar__button:hover:not(:disabled) {
        background: var(--marketing-input-button-hover-bg);
        transform: translateY(-2px);
      }

      .marketing-input-bar__button--active:hover:not(:disabled) {
        background: var(--marketing-input-button-active-bg);
      }

      .marketing-input-bar__button-text {
        display: inline;
      }

      @media (max-width: 640px) {
        .marketing-input-bar__button {
          padding: var(--nxt1-spacing-2);
          gap: 0;
        }

        .marketing-input-bar__button-text {
          display: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .marketing-input-bar,
        .marketing-input-bar__button {
          transition: none;
        }

        .marketing-input-bar__button:hover:not(:disabled) {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtMarketingInputBarComponent {
  readonly value = input<string>('');
  readonly placeholder = input<string>('What can Agent X help with?');
  readonly ariaLabel = input<string>('Command Agent X');
  readonly buttonLabel = input<string>('Ask NXT1');
  readonly active = input<boolean>(true);

  readonly valueChange = output<string>();
  readonly submitCommand = output<string>();
  readonly submitButtonClick = output<void>();

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.valueChange.emit(target?.value ?? '');
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.submitCommand.emit(this.value().trim());
  }
}
