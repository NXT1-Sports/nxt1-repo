import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  afterNextRender,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtCtaButtonComponent } from '../cta-button';
import { NxtHeaderCardComponent } from '../header-card';

export interface ImmersiveHeroShot {
  readonly id: 'upload' | 'processing' | 'polished' | 'offer';
  readonly title: string;
  readonly description: string;
  readonly chip: string;
}

@Component({
  selector: 'nxt1-immersive-hero',
  standalone: true,
  imports: [CommonModule, NxtCtaButtonComponent, NxtHeaderCardComponent],
  template: `
    <nxt1-header-card [title]="headline()" titleId="immersive-hook-title">
      <div nxtHeaderBackground class="hook__background" [class.hook--loaded]="loaded()">
        <!-- Animated gradient mesh blobs -->
        <div class="hook__mesh">
          <div class="hook__blob hook__blob--1"></div>
          <div class="hook__blob hook__blob--2"></div>
          <div class="hook__blob hook__blob--3"></div>
          <div class="hook__blob hook__blob--4"></div>
        </div>

        <!-- Fine grain texture for depth -->
        <div class="hook__grain"></div>

        <!-- Soft readability scrim -->
        <div class="hook__scrim"></div>
      </div>

      <p nxtHeaderSubtitle class="hook__subtitle">{{ subhead() }}</p>

      <div nxtHeaderActions class="hook__actions">
        <nxt1-cta-button label="Get Started" route="/auth/register" variant="primary" />
        <nxt1-cta-button label="Explore Platform" variant="ghost" (clicked)="openReel()" />
      </div>

      <p nxtHeaderFooter class="hook__proof" role="status" aria-live="polite">
        🔥 412 athletes signed offers today.
      </p>
    </nxt1-header-card>

    @if (isReelOpen()) {
      <div class="hook-reel" role="presentation" (click)="closeReel()">
        <section
          class="hook-reel__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hook-reel-title"
          (click)="$event.stopPropagation()"
        >
          <header class="hook-reel__header">
            <h2 id="hook-reel-title" class="hook-reel__title">Platform Reel</h2>
            <button
              type="button"
              class="hook-reel__close"
              aria-label="Close reel"
              (click)="closeReel()"
            >
              Close
            </button>
          </header>

          <div class="hook-reel__grid">
            @for (shot of shots(); track shot.id) {
              <article class="hook-reel__shot">
                <div
                  class="hook-reel__media"
                  [class]="'hook-reel__media hook-reel__media--' + shot.id"
                >
                  <span class="hook-reel__media-chip">{{ shot.chip }}</span>
                </div>
                <h3 class="hook-reel__shot-title">{{ shot.title }}</h3>
                <p class="hook-reel__shot-copy">{{ shot.description }}</p>
              </article>
            }
          </div>
        </section>
      </div>
    }
  `,
  styles: [
    `
      /* ─── keyframes ─── */

      @keyframes blob-drift-1 {
        0% {
          transform: translate(0, 0) scale(1);
          border-radius: 40% 60% 55% 45% / 55% 40% 60% 45%;
        }
        20% {
          transform: translate(12%, -8%) scale(1.12);
          border-radius: 50% 50% 45% 55% / 48% 52% 48% 52%;
        }
        40% {
          transform: translate(-6%, 10%) scale(0.92);
          border-radius: 44% 56% 52% 48% / 56% 44% 50% 50%;
        }
        60% {
          transform: translate(14%, 5%) scale(1.08);
          border-radius: 52% 48% 42% 58% / 42% 58% 55% 45%;
        }
        80% {
          transform: translate(-10%, -6%) scale(0.95);
          border-radius: 46% 54% 58% 42% / 52% 48% 44% 56%;
        }
        100% {
          transform: translate(0, 0) scale(1);
          border-radius: 40% 60% 55% 45% / 55% 40% 60% 45%;
        }
      }

      @keyframes blob-drift-2 {
        0% {
          transform: translate(0, 0) scale(1);
          border-radius: 55% 45% 50% 50% / 45% 55% 45% 55%;
        }
        25% {
          transform: translate(-14%, 8%) scale(1.14);
          border-radius: 48% 52% 56% 44% / 52% 48% 50% 50%;
        }
        50% {
          transform: translate(10%, -12%) scale(0.88);
          border-radius: 58% 42% 44% 56% / 44% 56% 52% 48%;
        }
        75% {
          transform: translate(-4%, 14%) scale(1.06);
          border-radius: 42% 58% 52% 48% / 56% 44% 48% 52%;
        }
        100% {
          transform: translate(0, 0) scale(1);
          border-radius: 55% 45% 50% 50% / 45% 55% 45% 55%;
        }
      }

      @keyframes blob-drift-3 {
        0% {
          transform: translate(0, 0) scale(1);
          border-radius: 48% 52% 46% 54% / 52% 48% 52% 48%;
        }
        33% {
          transform: translate(8%, 12%) scale(1.1);
          border-radius: 54% 46% 52% 48% / 46% 54% 48% 52%;
        }
        66% {
          transform: translate(-12%, -6%) scale(0.9);
          border-radius: 42% 58% 56% 44% / 58% 42% 46% 54%;
        }
        100% {
          transform: translate(0, 0) scale(1);
          border-radius: 48% 52% 46% 54% / 52% 48% 52% 48%;
        }
      }

      @keyframes blob-drift-4 {
        0% {
          transform: translate(0, 0) scale(1);
          border-radius: 50% 50% 44% 56% / 56% 44% 56% 44%;
        }
        30% {
          transform: translate(-10%, -10%) scale(1.16);
          border-radius: 56% 44% 50% 50% / 44% 56% 50% 50%;
        }
        60% {
          transform: translate(12%, 8%) scale(0.88);
          border-radius: 44% 56% 56% 44% / 50% 50% 44% 56%;
        }
        100% {
          transform: translate(0, 0) scale(1);
          border-radius: 50% 50% 44% 56% / 56% 44% 56% 44%;
        }
      }

      @keyframes shimmer-sweep {
        0% {
          transform: translateX(-100%) skewX(-15deg);
        }
        100% {
          transform: translateX(200%) skewX(-15deg);
        }
      }

      :host {
        display: block;
      }

      nxt1-header-card {
        --nxt1-header-min-height: calc(var(--nxt1-spacing-10) * 8);
        --nxt1-header-padding: var(--nxt1-spacing-8) var(--nxt1-spacing-5);
        --nxt1-header-title-line-height: 1.05;
        --nxt1-header-actions-margin-top: var(--nxt1-spacing-1);
      }

      /* ─── background root ─── */

      .hook__background {
        position: relative;
        width: 100%;
        height: 100%;
      }

      /* ─── gradient mesh container ─── */

      .hook__mesh {
        position: absolute;
        inset: -20%;
        width: 140%;
        height: 140%;
        pointer-events: none;
      }

      /* ─── organic gradient blobs ─── */

      .hook__blob {
        position: absolute;
        border-radius: 40% 60% 55% 45% / 55% 40% 60% 45%;
        pointer-events: none;
        opacity: 0;
        transition: opacity 1s ease;
        will-change: transform;
      }

      .hook--loaded .hook__blob {
        opacity: 1;
      }

      /* Primary colour — top-left dominant wash */
      .hook__blob--1 {
        top: -10%;
        left: -8%;
        width: 60%;
        height: 65%;
        background: radial-gradient(
          ellipse at 40% 40%,
          color-mix(in srgb, var(--nxt1-color-primary) 48%, transparent) 0%,
          color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent) 50%,
          transparent 80%
        );
        filter: blur(clamp(30px, 5vw, 60px));
      }

      .hook--loaded .hook__blob--1 {
        animation: blob-drift-1 14s ease-in-out infinite;
      }

      /* Secondary colour — bottom-right accent */
      .hook__blob--2 {
        bottom: -12%;
        right: -6%;
        width: 55%;
        height: 60%;
        border-radius: 55% 45% 50% 50% / 45% 55% 45% 55%;
        background: radial-gradient(
          ellipse at 60% 60%,
          color-mix(in srgb, var(--nxt1-color-secondary) 42%, transparent) 0%,
          color-mix(in srgb, var(--nxt1-color-secondary) 14%, transparent) 50%,
          transparent 80%
        );
        filter: blur(clamp(32px, 5vw, 65px));
      }

      .hook--loaded .hook__blob--2 {
        animation: blob-drift-2 18s ease-in-out infinite;
        animation-delay: -4s;
      }

      /* Accent blend — center convergence */
      .hook__blob--3 {
        top: 25%;
        left: 20%;
        width: 50%;
        height: 50%;
        border-radius: 48% 52% 46% 54% / 52% 48% 52% 48%;
        background: radial-gradient(
          ellipse at 50% 50%,
          color-mix(in srgb, var(--nxt1-color-primary) 16%, var(--nxt1-color-secondary)) 0%,
          transparent 70%
        );
        filter: blur(clamp(36px, 6vw, 72px));
      }

      .hook--loaded .hook__blob--3 {
        opacity: 0.7;
        animation: blob-drift-3 20s ease-in-out infinite;
        animation-delay: -8s;
      }

      /* Subtle warm highlight — top-right shimmer */
      .hook__blob--4 {
        top: -5%;
        right: 10%;
        width: 40%;
        height: 40%;
        border-radius: 50% 50% 44% 56% / 56% 44% 56% 44%;
        background: radial-gradient(
          ellipse at 50% 50%,
          color-mix(in srgb, var(--nxt1-color-primary) 22%, transparent) 0%,
          color-mix(in srgb, var(--nxt1-color-secondary) 8%, transparent) 40%,
          transparent 70%
        );
        filter: blur(clamp(28px, 4vw, 55px));
      }

      .hook--loaded .hook__blob--4 {
        opacity: 0.6;
        animation: blob-drift-4 16s ease-in-out infinite;
        animation-delay: -6s;
      }

      /* ─── fine grain texture (CSS noise, no SVG) ─── */

      .hook__grain {
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.035;
        mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        background-repeat: repeat;
        background-size: 200px 200px;
      }

      /* ─── subtle shimmer highlight ─── */

      .hook__scrim {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }

      .hook__scrim::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 50%;
        height: 100%;
        background: linear-gradient(
          105deg,
          transparent 40%,
          color-mix(in srgb, var(--nxt1-color-text-primary) 3%, transparent) 45%,
          color-mix(in srgb, var(--nxt1-color-text-primary) 5%, transparent) 50%,
          transparent 55%
        );
        opacity: 0;
        transition: opacity 1.2s ease 0.4s;
      }

      .hook--loaded .hook__scrim::before {
        opacity: 1;
        animation: shimmer-sweep 8s ease-in-out 2s infinite;
      }

      /* ─── content ─── */

      .hook__subtitle {
        margin: 0;
        max-width: 60ch;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-lg);
        line-height: var(--nxt1-lineHeight-relaxed);
        text-wrap: pretty;
      }

      .hook__actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .hook__proof {
        margin: var(--nxt1-spacing-1) 0 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        min-height: var(--nxt1-spacing-8);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 60%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 80%, transparent);
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        backdrop-filter: blur(8px);
      }

      /* ─── reel modal ─── */

      .hook-reel {
        position: fixed;
        inset: 0;
        z-index: var(--nxt1-z-index-modal, 1000);
        display: grid;
        place-items: center;
        padding: var(--nxt1-spacing-4);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 70%, transparent);
        backdrop-filter: blur(var(--nxt1-spacing-1));
      }

      .hook-reel__dialog {
        width: min(var(--nxt1-root-shell-max-width, 88rem), 100%);
        max-height: min(90svh, calc(var(--nxt1-spacing-10) * 11));
        overflow: auto;
        border-radius: var(--nxt1-borderRadius-3xl);
        border: 1px solid var(--nxt1-color-border-default);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 92%, transparent);
        box-shadow: 0 var(--nxt1-spacing-6) var(--nxt1-spacing-10)
          color-mix(in srgb, var(--nxt1-color-bg-primary) 36%, transparent);
      }

      .hook-reel__header {
        position: sticky;
        top: 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        border-bottom: 1px solid var(--nxt1-color-border-default);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 96%, transparent);
      }

      .hook-reel__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .hook-reel__close {
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        min-height: var(--nxt1-spacing-8);
        padding: 0 var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
      }

      .hook-reel__close:hover {
        background: var(--nxt1-color-surface-300);
      }

      .hook-reel__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-5);
      }

      .hook-reel__shot {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .hook-reel__media {
        min-height: calc(var(--nxt1-spacing-10) * 2);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        display: flex;
        align-items: end;
        padding: var(--nxt1-spacing-3);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 82%, transparent);
      }

      .hook-reel__media--upload {
        background-image: linear-gradient(
          140deg,
          color-mix(in srgb, var(--nxt1-color-primary) 36%, transparent),
          color-mix(in srgb, var(--nxt1-color-surface-300) 84%, transparent)
        );
      }

      .hook-reel__media--processing {
        background-image: linear-gradient(
          140deg,
          color-mix(in srgb, var(--nxt1-color-secondary) 36%, transparent),
          color-mix(in srgb, var(--nxt1-color-surface-300) 84%, transparent)
        );
      }

      .hook-reel__media--polished {
        background-image: linear-gradient(
          140deg,
          color-mix(in srgb, var(--nxt1-color-primary) 30%, transparent),
          color-mix(in srgb, var(--nxt1-color-secondary) 24%, transparent)
        );
      }

      .hook-reel__media--offer {
        background-image: linear-gradient(
          140deg,
          color-mix(in srgb, var(--nxt1-color-success, var(--nxt1-color-primary)) 34%, transparent),
          color-mix(in srgb, var(--nxt1-color-surface-300) 84%, transparent)
        );
      }

      .hook-reel__media-chip {
        display: inline-flex;
        align-items: center;
        padding: 0 var(--nxt1-spacing-2);
        min-height: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 72%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 90%, transparent);
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        text-transform: uppercase;
      }

      .hook-reel__shot-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .hook-reel__shot-copy {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ─── responsive ─── */

      @media (max-width: 768px) {
        nxt1-header-card {
          --nxt1-header-shell-padding-mobile: var(--nxt1-spacing-3);
          --nxt1-header-padding-mobile: var(--nxt1-spacing-6) var(--nxt1-spacing-4);
          --nxt1-header-min-height-mobile: calc(var(--nxt1-spacing-10) * 6);
          --nxt1-header-title-size-mobile: var(--nxt1-fontSize-3xl);
        }

        .hook__subtitle {
          font-size: var(--nxt1-fontSize-base);
        }

        .hook-reel__grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 480px) {
        nxt1-header-card {
          --nxt1-header-shell-padding-xs: var(--nxt1-spacing-2);
        }

        .hook__subtitle {
          max-width: 36ch;
        }

        .hook__proof {
          font-size: var(--nxt1-fontSize-xs);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .hook__blob,
        .hook--loaded .hook__blob {
          animation: none !important;
        }

        .hook__scrim::before,
        .hook--loaded .hook__scrim::before {
          animation: none !important;
          opacity: 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtImmersiveHeroComponent {
  readonly headline = input('The Future of Sports Recruiting');
  readonly subhead = input(
    'Elite design. Automated recruiting. AI exposure. All in one super app.'
  );
  readonly shots = input<readonly ImmersiveHeroShot[]>([]);

  readonly exploreRequested = output<void>();

  private readonly _isReelOpen = signal(false);
  protected readonly isReelOpen = computed(() => this._isReelOpen());

  /** Becomes true after the first render so animations only run post-load. */
  private readonly _loaded = signal(false);
  protected readonly loaded = computed(() => this._loaded());

  constructor() {
    afterNextRender(() => {
      // Small raf delay ensures paint is complete before triggering animations
      requestAnimationFrame(() => this._loaded.set(true));
    });
  }

  protected openReel(): void {
    this._isReelOpen.set(true);
    this.exploreRequested.emit();
  }

  protected closeReel(): void {
    this._isReelOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKey(): void {
    if (this._isReelOpen()) {
      this._isReelOpen.set(false);
    }
  }
}
