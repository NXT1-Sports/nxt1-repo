import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';
import { NxtCtaButtonComponent } from '../cta-button';
import { NxtHeaderCardComponent } from '../header-card';

interface ShowcaseImage {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

@Component({
  selector: 'nxt1-agent-x-welcome-header',
  standalone: true,
  imports: [CommonModule, NxtCtaButtonComponent, NxtHeaderCardComponent],
  template: `
    <nxt1-header-card title="Your Personal Agent" titleId="agentx-title" [mobileFullBleed]="true">
      <div nxtHeaderBackground class="agentx-header__bg">
        <div class="agentx-orb agentx-orb--one"></div>
        <div class="agentx-orb agentx-orb--two"></div>
        <div class="agentx-grid"></div>
      </div>

      <p nxtHeaderBadge class="agentx-badge">Agent X • Online</p>

      <div nxtHeaderSubtitle class="agentx-typed-container">
        <p class="agentx-typed-ghost" aria-hidden="true">{{ message() }}&nbsp;</p>
        <p class="agentx-typed" [attr.aria-label]="message()">
          {{ displayText() }}<span class="agentx-cursor" aria-hidden="true"></span>
        </p>
      </div>

      <div nxtHeaderActions class="agentx-actions">
        <nxt1-cta-button label="Meet Agent X" route="/agent-x" variant="primary" />
        <nxt1-cta-button label="Explore Platform" route="/explore" variant="ghost" />
      </div>

      <div nxtHeaderOverlay class="agentx-photo-rail" aria-hidden="true" role="presentation">
        <div class="agentx-photo-cluster agentx-photo-cluster--left">
          @for (image of leftShowcaseImages; track image.src) {
            <div class="agentx-photo-card">
              <img
                [src]="image.src"
                [alt]="image.alt"
                [width]="image.width"
                [height]="image.height"
                class="agentx-photo-image"
                loading="lazy"
                decoding="async"
                fetchpriority="low"
              />
            </div>
          }
        </div>

        <div class="agentx-photo-cluster agentx-photo-cluster--right">
          @for (image of rightShowcaseImages; track image.src) {
            <div class="agentx-photo-card">
              <img
                [src]="image.src"
                [alt]="image.alt"
                [width]="image.width"
                [height]="image.height"
                class="agentx-photo-image"
                loading="lazy"
                decoding="async"
                fetchpriority="low"
              />
            </div>
          }
        </div>
      </div>
    </nxt1-header-card>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      nxt1-header-card {
        --nxt1-header-min-height: calc(var(--nxt1-spacing-10) * 8);
        --nxt1-header-min-height-tablet: calc(var(--nxt1-spacing-10) * 7);
        --nxt1-header-min-height-mobile: auto;
        --nxt1-header-padding: var(--nxt1-spacing-7) var(--nxt1-spacing-5);
        --nxt1-header-padding-mobile: var(--nxt1-spacing-7) var(--nxt1-spacing-5)
          var(--nxt1-spacing-2);
        --nxt1-header-shell-padding-mobile: 0;
        --nxt1-header-title-margin: var(--nxt1-spacing-3) 0 var(--nxt1-spacing-2) 0;
      }

      .agentx-header__bg {
        position: relative;
        width: 100%;
        height: 100%;
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

      .agentx-typed-container {
        position: relative;
        max-width: var(--nxt1-content-max-readable, 65ch);
      }

      .agentx-typed-ghost {
        visibility: hidden;
        margin: 0;
        font-size: var(--nxt1-fontSize-lg);
        line-height: 1.5;
      }

      .agentx-typed {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-lg);
        line-height: 1.5;
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

      .agentx-photo-rail {
        position: absolute;
        left: var(--nxt1-spacing-5);
        right: var(--nxt1-spacing-5);
        bottom: calc(var(--nxt1-spacing-3) * -1);
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: var(--nxt1-spacing-4);
        pointer-events: none;
        z-index: 1;
      }

      .agentx-photo-cluster {
        display: flex;
        align-items: end;
        position: relative;
        isolation: isolate;
      }

      .agentx-photo-cluster--left {
        -webkit-mask-image: linear-gradient(
          to right,
          transparent 0%,
          black 24%,
          black 78%,
          transparent 100%
        );
        mask-image: linear-gradient(
          to right,
          transparent 0%,
          black 24%,
          black 78%,
          transparent 100%
        );
      }

      .agentx-photo-cluster--right {
        -webkit-mask-image: linear-gradient(
          to left,
          transparent 0%,
          black 24%,
          black 78%,
          transparent 100%
        );
        mask-image: linear-gradient(
          to left,
          transparent 0%,
          black 24%,
          black 78%,
          transparent 100%
        );
      }

      .agentx-photo-cluster .agentx-photo-card + .agentx-photo-card {
        margin-left: calc(var(--nxt1-spacing-6) * -1);
      }

      .agentx-photo-card {
        width: var(
          --nxt1-agentx-photo-size,
          calc((var(--nxt1-spacing-10) * 4) + var(--nxt1-spacing-8))
        );
        aspect-ratio: 3 / 4;
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 72%, transparent);
        box-shadow: 0 var(--nxt1-spacing-3) var(--nxt1-spacing-8)
          color-mix(in srgb, var(--nxt1-color-bg-primary) 28%, transparent);
        opacity: 0.9;
        overflow: hidden;
        backdrop-filter: blur(2px);
      }

      .agentx-photo-cluster .agentx-photo-card:first-child {
        transform: translateY(calc(var(--nxt1-spacing-1) * -1));
      }

      .agentx-photo-cluster .agentx-photo-card:last-child {
        transform: translateY(calc(var(--nxt1-spacing-3) * -1));
      }

      .agentx-photo-image {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
        border-radius: inherit;
        filter: saturate(0.92) contrast(0.96);
      }

      @media (max-width: 1024px) {
        .agentx-photo-rail {
          left: var(--nxt1-spacing-4);
          right: var(--nxt1-spacing-4);
          bottom: var(--nxt1-spacing-2);
        }

        .agentx-photo-card {
          width: calc((var(--nxt1-spacing-10) * 3) + var(--nxt1-spacing-8));
        }
      }

      @media (max-width: 768px) {
        .agentx-photo-rail {
          position: relative;
          left: auto;
          right: auto;
          bottom: auto;
          padding: 0;
          justify-content: center;
          z-index: 1;
          margin-top: var(--nxt1-spacing-1);
        }

        .agentx-photo-card {
          width: calc((var(--nxt1-spacing-10) * 3) + var(--nxt1-spacing-6));
        }

        .agentx-photo-cluster .agentx-photo-card + .agentx-photo-card {
          margin-left: calc(var(--nxt1-spacing-6) * -1);
        }

        .agentx-photo-cluster .agentx-photo-card:first-child,
        .agentx-photo-cluster .agentx-photo-card:last-child {
          transform: none;
        }

        .agentx-photo-cluster--left {
          -webkit-mask-image: linear-gradient(
            to right,
            transparent 0%,
            black 28%,
            black 72%,
            transparent 100%
          );
          mask-image: linear-gradient(
            to right,
            transparent 0%,
            black 28%,
            black 72%,
            transparent 100%
          );
        }

        .agentx-photo-cluster--right {
          -webkit-mask-image: linear-gradient(
            to left,
            transparent 0%,
            black 28%,
            black 72%,
            transparent 100%
          );
          mask-image: linear-gradient(
            to left,
            transparent 0%,
            black 28%,
            black 72%,
            transparent 100%
          );
        }
      }

      @media (max-width: 480px) {
        .agentx-photo-card {
          width: calc((var(--nxt1-spacing-10) * 2) + var(--nxt1-spacing-8));
        }

        .agentx-photo-cluster .agentx-photo-card + .agentx-photo-card {
          margin-left: calc(var(--nxt1-spacing-5) * -1);
        }
      }

      .agentx-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-3);
        justify-content: center;
      }

      @media (prefers-reduced-motion: reduce) {
        .agentx-orb,
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
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private typingStarted = false;

  /**
   * Showcase images with intrinsic dimensions for CLS prevention.
   * Dimensions match source files in @nxt1/design-tokens/assets/images.
   */
  private readonly showcaseImages: readonly ShowcaseImage[] = [
    { src: `/${IMAGE_PATHS.athlete1}`, alt: 'High school athlete', width: 500, height: 500 },
    { src: `/${IMAGE_PATHS.athlete2}`, alt: 'Club athlete', width: 500, height: 500 },
    { src: `/${IMAGE_PATHS.athlete3}`, alt: 'Student athlete', width: 500, height: 500 },
    { src: `/${IMAGE_PATHS.coach1}`, alt: 'Sports coach', width: 408, height: 612 },
  ];

  protected readonly leftShowcaseImages = [this.showcaseImages[0], this.showcaseImages[1]] as const;
  protected readonly rightShowcaseImages = [
    this.showcaseImages[2],
    this.showcaseImages[3],
  ] as const;

  readonly message = input(
    "Hi, I'm Agent X — your personal AI recruiting partner for highlights, graphics, and smarter discovery."
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

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.startTyping();
            observer.disconnect();
            break;
          }
        }
      },
      {
        threshold: 0.2,
      }
    );

    observer.observe(this.hostElement.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private startTyping(): void {
    if (this.typingStarted) {
      return;
    }

    this.typingStarted = true;

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
