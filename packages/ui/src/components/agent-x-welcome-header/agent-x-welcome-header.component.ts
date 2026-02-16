import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { NxtCtaButtonComponent } from '../cta-button';

@Component({
  selector: 'nxt1-agent-x-welcome-header',
  standalone: true,
  imports: [CommonModule, NxtCtaButtonComponent],
  template: `
    <section class="agentx-shell" aria-labelledby="agentx-title">
      <div class="agentx-header">
        <div class="agentx-header__bg" aria-hidden="true">
          <div class="agentx-orb agentx-orb--one"></div>
          <div class="agentx-orb agentx-orb--two"></div>
          <div class="agentx-grid"></div>
        </div>

        <div class="agentx-header__content">
          <div class="agentx-header__copy">
            <p class="agentx-badge">Agent X • Online</p>
            <h1 id="agentx-title" class="agentx-title">Welcome to NXT1</h1>
            <p class="agentx-typed" [attr.aria-label]="message()">
              {{ displayText() }}<span class="agentx-cursor" aria-hidden="true"></span>
            </p>

            <div class="agentx-actions">
              <nxt1-cta-button label="Meet Agent X" route="/agent-x" variant="primary" />
              <nxt1-cta-button label="Explore Platform" route="/explore" variant="ghost" />
            </div>
          </div>

          <div class="agentx-header__visual" aria-hidden="true">
            <div class="agentx-logo-shell">
              <svg
                class="agentx-logo"
                viewBox="0 0 612 792"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="12"
                stroke-linejoin="round"
              >
                <path
                  d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                />
                <polygon
                  points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .agentx-shell {
        margin: 0 auto;
        max-width: var(--nxt1-root-shell-max-width, 88rem);
        padding: var(--nxt1-spacing-4);
      }

      .agentx-header {
        position: relative;
        overflow: hidden;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-3xl);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 90%, transparent);
        backdrop-filter: blur(10px);
        box-shadow: 0 18px 36px color-mix(in srgb, var(--nxt1-color-bg-primary) 24%, transparent);
      }

      .agentx-header__bg {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .agentx-orb {
        position: absolute;
        border-radius: 9999px;
        filter: blur(48px);
        opacity: 0.45;
        animation: orbFloat 10s ease-in-out infinite;
      }

      .agentx-orb--one {
        top: -120px;
        left: -80px;
        width: 280px;
        height: 280px;
        background: color-mix(in srgb, var(--nxt1-color-primary) 35%, transparent);
      }

      .agentx-orb--two {
        right: -80px;
        bottom: -140px;
        width: 300px;
        height: 300px;
        background: color-mix(in srgb, var(--nxt1-color-secondary) 32%, transparent);
        animation-delay: 1.5s;
      }

      .agentx-grid {
        position: absolute;
        inset: 0;
        opacity: 0.18;
        background-image:
          linear-gradient(
            to right,
            color-mix(in srgb, var(--nxt1-color-border-default) 65%, transparent) 1px,
            transparent 1px
          ),
          linear-gradient(
            to bottom,
            color-mix(in srgb, var(--nxt1-color-border-default) 65%, transparent) 1px,
            transparent 1px
          );
        background-size: 24px 24px;
      }

      .agentx-header__content {
        position: relative;
        z-index: 1;
        padding: var(--nxt1-spacing-7) var(--nxt1-spacing-5);
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-8);
        align-items: center;
      }

      .agentx-badge {
        display: inline-flex;
        align-items: center;
        margin: 0;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-secondary);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 80%, transparent);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .agentx-title {
        margin: var(--nxt1-spacing-3) 0 var(--nxt1-spacing-2) 0;
        color: var(--nxt1-color-text-primary);
        font-size: clamp(1.75rem, 3.4vw, 3rem);
        line-height: 1.08;
        font-weight: var(--nxt1-fontWeight-bold);
      }

      .agentx-typed {
        margin: 0;
        min-height: 1.8em;
        color: var(--nxt1-color-text-secondary);
        font-size: clamp(1rem, 1.5vw, 1.18rem);
        line-height: 1.5;
        max-width: 56ch;
      }

      .agentx-cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        margin-left: 6px;
        vertical-align: -0.15em;
        background: var(--nxt1-color-primary);
        animation: blink 1s step-end infinite;
      }

      .agentx-actions {
        margin-top: var(--nxt1-spacing-5);
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-3);
      }

      .agentx-header__visual {
        display: flex;
        justify-content: center;
      }

      .agentx-logo-shell {
        width: clamp(180px, 28vw, 280px);
        aspect-ratio: 1;
        display: grid;
        place-items: center;
        border-radius: 9999px;
        border: 1px solid var(--nxt1-color-border-subtle);
        background: radial-gradient(
          circle at 30% 30%,
          color-mix(in srgb, var(--nxt1-color-surface-300) 80%, transparent),
          color-mix(in srgb, var(--nxt1-color-surface-100) 88%, transparent)
        );
        box-shadow:
          0 24px 54px color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent),
          inset 0 1px 0 color-mix(in srgb, var(--nxt1-color-text-primary) 12%, transparent);
        animation: pulseRing 4.8s ease-in-out infinite;
      }

      .agentx-logo {
        width: 64%;
        height: 64%;
        color: var(--nxt1-color-primary);
      }

      @media (min-width: 1024px) {
        .agentx-header__content {
          grid-template-columns: 1.25fr 0.75fr;
          padding: var(--nxt1-spacing-9) var(--nxt1-spacing-8);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .agentx-orb,
        .agentx-logo-shell,
        .agentx-cursor {
          animation: none;
        }
      }

      @keyframes orbFloat {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-12px);
        }
      }

      @keyframes pulseRing {
        0%,
        100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.02);
        }
      }

      @keyframes blink {
        0%,
        45% {
          opacity: 1;
        }
        46%,
        100% {
          opacity: 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAgentXWelcomeHeaderComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  readonly message = input(
    "Hi, I'm Agent X — welcome to the ultimate platform for sports discovery."
  );
  readonly typingSpeedMs = input(24);

  private readonly _displayText = signal('');
  readonly displayText = computed(() => this._displayText());

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this._displayText.set(this.message());
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      this._displayText.set(this.message());
      return;
    }

    const fullText = this.message();
    let index = 0;

    const timer = window.setInterval(
      () => {
        index += 1;
        this._displayText.set(fullText.slice(0, index));

        if (index >= fullText.length) {
          window.clearInterval(timer);
        }
      },
      Math.max(12, this.typingSpeedMs())
    );

    this.destroyRef.onDestroy(() => window.clearInterval(timer));
  }
}
