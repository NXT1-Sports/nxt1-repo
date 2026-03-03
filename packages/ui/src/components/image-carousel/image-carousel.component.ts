/**
 * @fileoverview Image Carousel Component
 * @module @nxt1/ui/components/image-carousel
 * @version 1.0.0
 *
 * A responsive image carousel with dot indicators and arrow navigation.
 * Supports swipe gestures, keyboard navigation, and auto-play.
 * SSR-safe with platform checks for DOM operations.
 *
 * Usage:
 * ```html
 * <nxt1-image-carousel
 *   [images]="imageUrls()"
 *   [alt]="'Player photos'"
 *   [autoPlay]="false"
 *   [aspectRatio]="'3/4'"
 * />
 * ```
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  signal,
  computed,
  effect,
  output,
  inject,
  PLATFORM_ID,
  afterNextRender,
  DestroyRef,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'nxt1-image-carousel',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (images().length > 0) {
      <div
        class="carousel"
        #carouselEl
        (mouseenter)="onMouseEnter()"
        (mouseleave)="onMouseLeave()"
        (touchstart)="onTouchStart($event)"
        (touchmove)="onTouchMove($event)"
        (touchend)="onTouchEnd()"
        (keydown)="onKeydown($event)"
        [attr.tabindex]="0"
        [attr.role]="'region'"
        [attr.aria-label]="'Image carousel, ' + images().length + ' images'"
        [attr.aria-roledescription]="'carousel'"
      >
        <!-- Image Track -->
        <div class="carousel-track" [style.transform]="trackTransform()">
          @for (img of images(); track img; let i = $index) {
            <div
              class="carousel-slide"
              [attr.aria-hidden]="i !== activeIndex()"
              [attr.aria-label]="'Slide ' + (i + 1) + ' of ' + images().length"
            >
              <img
                [src]="img"
                [alt]="alt() + ' ' + (i + 1)"
                class="carousel-img"
                [loading]="i === 0 ? 'eager' : 'lazy'"
                draggable="false"
              />
            </div>
          }
        </div>

        <!-- Hover Fade Overlay with Info -->
        @if (activeOverlayTitle()) {
          <div class="carousel-overlay" [class.carousel-overlay--visible]="isHovered()">
            <div class="carousel-overlay-content">
              <span class="carousel-overlay-title">{{ activeOverlayTitle() }}</span>
            </div>
          </div>
        }

        <!-- Arrow Navigation (only if > 1 image) -->
        @if (images().length > 1) {
          <!-- Left Arrow -->
          <button
            type="button"
            class="carousel-arrow carousel-arrow--prev"
            [class.carousel-arrow--visible]="isHovered()"
            [attr.aria-label]="'Previous image'"
            [disabled]="!canGoPrev()"
            (click)="prev(); $event.stopPropagation()"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <!-- Right Arrow -->
          <button
            type="button"
            class="carousel-arrow carousel-arrow--next"
            [class.carousel-arrow--visible]="isHovered()"
            [attr.aria-label]="'Next image'"
            [disabled]="!canGoNext()"
            (click)="next(); $event.stopPropagation()"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          <!-- Dot Indicators -->
          <div class="carousel-dots" role="tablist" aria-label="Slide controls">
            @for (img of images(); track img; let i = $index) {
              <button
                type="button"
                class="carousel-dot"
                [class.carousel-dot--active]="i === activeIndex()"
                role="tab"
                [attr.aria-selected]="i === activeIndex()"
                [attr.aria-label]="'Go to slide ' + (i + 1)"
                (click)="goTo(i); $event.stopPropagation()"
              ></button>
            }
          </div>

          <!-- Counter Badge -->
          <div class="carousel-counter" aria-hidden="true">
            {{ activeIndex() + 1 }} / {{ images().length }}
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        --carousel-radius: var(--nxt1-radius-xl, 16px);
        --carousel-arrow-bg: rgba(0, 0, 0, 0.55);
        --carousel-arrow-hover: rgba(0, 0, 0, 0.75);
        --carousel-arrow-color: #fff;
        --carousel-dot-size: 8px;
        --carousel-dot-color: rgba(255, 255, 255, 0.4);
        --carousel-dot-active: #fff;
        --carousel-transition: 360ms cubic-bezier(0.25, 0.1, 0.25, 1);
      }

      .carousel {
        position: relative;
        width: 100%;
        overflow: hidden;
        border-radius: var(--carousel-radius);
        outline: none;
        user-select: none;
        -webkit-user-select: none;
        cursor: grab;
      }
      .carousel:active {
        cursor: grabbing;
      }
      .carousel:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #d4ff00);
        outline-offset: 2px;
      }

      /* ─── TRACK ─── */
      .carousel-track {
        display: flex;
        transition: transform var(--carousel-transition);
        will-change: transform;
      }

      .carousel-slide {
        flex: 0 0 100%;
        width: 100%;
        min-width: 0;
      }

      .carousel-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center top;
        display: block;
        pointer-events: none;
      }

      /* ─── ARROWS ─── */
      .carousel-arrow {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        z-index: 3;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 50%;
        background: var(--carousel-arrow-bg);
        color: var(--carousel-arrow-color);
        cursor: pointer;
        opacity: 0;
        transition:
          opacity 200ms ease,
          background 150ms ease,
          transform 150ms ease;
        -webkit-tap-highlight-color: transparent;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
      .carousel-arrow--prev {
        left: 10px;
      }
      .carousel-arrow--next {
        right: 10px;
      }
      .carousel-arrow--visible {
        opacity: 1;
      }
      .carousel-arrow:hover:not(:disabled) {
        background: var(--carousel-arrow-hover);
        transform: translateY(-50%) scale(1.08);
      }
      .carousel-arrow:active:not(:disabled) {
        transform: translateY(-50%) scale(0.95);
      }
      .carousel-arrow:disabled {
        opacity: 0;
        cursor: default;
        pointer-events: none;
      }

      /* ─── DOT INDICATORS ─── */
      .carousel-dots {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 3;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      .carousel-dot {
        width: var(--carousel-dot-size);
        height: var(--carousel-dot-size);
        border: none;
        border-radius: 50%;
        background: var(--carousel-dot-color);
        padding: 0;
        cursor: pointer;
        transition:
          background 200ms ease,
          transform 200ms ease,
          width 200ms ease;
        -webkit-tap-highlight-color: transparent;
      }
      .carousel-dot--active {
        background: var(--carousel-dot-active);
        width: 20px;
        border-radius: 999px;
      }
      .carousel-dot:hover:not(.carousel-dot--active) {
        background: rgba(255, 255, 255, 0.7);
        transform: scale(1.2);
      }

      /* ─── COUNTER BADGE ─── */
      .carousel-counter {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 3;
        padding: 3px 8px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: rgba(255, 255, 255, 0.85);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.03em;
        pointer-events: none;
      }

      /* ─── HOVER OVERLAY ─── */
      .carousel-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 2;
        padding: 48px 16px 40px;
        background: linear-gradient(
          to top,
          rgba(0, 0, 0, 0.75) 0%,
          rgba(0, 0, 0, 0.45) 40%,
          rgba(0, 0, 0, 0.12) 70%,
          transparent 100%
        );
        opacity: 0;
        transform: translateY(6px);
        transition:
          opacity 280ms cubic-bezier(0.25, 0.1, 0.25, 1),
          transform 280ms cubic-bezier(0.25, 0.1, 0.25, 1);
        pointer-events: none;
      }
      .carousel-overlay--visible {
        opacity: 1;
        transform: translateY(0);
      }
      .carousel-overlay-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-bottom: 2px;
      }
      .carousel-overlay-title {
        font-size: 15px;
        font-weight: 700;
        color: #fff;
        line-height: 1.25;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      }
      .carousel-overlay-subtitle {
        font-size: 12px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.75);
        line-height: 1.3;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtImageCarouselComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  // ─── INPUTS ───
  /** Array of image URLs to display */
  readonly images = input<readonly string[]>([]);

  /** Alt text base for images (index appended automatically) */
  readonly alt = input<string>('Photo');

  /** Enable auto-play rotation */
  readonly autoPlay = input(false);

  /** Auto-play interval in milliseconds */
  readonly autoPlayInterval = input(5000);

  /** Enable infinite looping */
  readonly loop = input(false);

  /** Title text for the hover overlay (e.g. athlete name) */
  readonly overlayTitle = input<string>('');

  /** Subtitle text for the hover overlay (e.g. position, school) */
  readonly overlaySubtitle = input<string>('');

  /** Optional per-image overlay titles (index aligned with images) */
  readonly overlayTitles = input<readonly string[]>([]);

  /** Optional per-image overlay subtitles (index aligned with images) */
  readonly overlaySubtitles = input<readonly string[]>([]);

  // ─── OUTPUTS ───
  /** Emitted when active slide changes */
  readonly slideChange = output<number>();

  /** Emitted when an image is clicked */
  readonly imageClick = output<number>();

  // ─── STATE ───
  private readonly _activeIndex = signal(0);
  protected readonly activeIndex = computed(() => this._activeIndex());
  protected readonly isHovered = signal(false);
  protected readonly isTouchDevice = signal(false);

  /** Active overlay title (per-image if provided, fallback to global title) */
  protected readonly activeOverlayTitle = computed(() => {
    const index = this._activeIndex();
    const titles = this.overlayTitles();
    const byIndex = titles[index]?.trim() ?? '';
    if (byIndex) return byIndex;
    return this.overlayTitle().trim();
  });

  /** Active overlay subtitle (per-image if provided, fallback to global subtitle) */
  protected readonly activeOverlaySubtitle = computed(() => {
    const index = this._activeIndex();
    const subtitles = this.overlaySubtitles();
    const byIndex = subtitles[index]?.trim() ?? '';
    if (byIndex) return byIndex;
    return this.overlaySubtitle().trim();
  });

  /** CSS transform for the track */
  protected readonly trackTransform = computed(() => `translateX(-${this._activeIndex() * 100}%)`);

  /** Whether can navigate to previous */
  protected readonly canGoPrev = computed(() => {
    return this.loop() || this._activeIndex() > 0;
  });

  /** Whether can navigate to next */
  protected readonly canGoNext = computed(() => {
    return this.loop() || this._activeIndex() < this.images().length - 1;
  });

  // ─── TOUCH TRACKING ───
  private touchStartX = 0;
  private touchStartY = 0;
  private touchCurrentX = 0;
  private isSwiping = false;

  // ─── AUTO-PLAY ───
  private autoPlayTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    afterNextRender(() => {
      if (isPlatformBrowser(this.platformId)) {
        this.isTouchDevice.set('ontouchstart' in window || navigator.maxTouchPoints > 0);
      }
    });

    effect(() => {
      const isBrowser = isPlatformBrowser(this.platformId);
      const shouldAutoPlay = this.autoPlay();
      const imageCount = this.images().length;
      const pausedByHover = this.isHovered();

      this.stopAutoPlay();

      if (isBrowser && shouldAutoPlay && imageCount > 1 && !pausedByHover) {
        this.startAutoPlay();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.stopAutoPlay();
    });
  }

  // ─── PUBLIC NAVIGATION ───

  next(): void {
    const images = this.images();
    if (images.length <= 1) return;

    const current = this._activeIndex();
    if (current < images.length - 1) {
      this.setIndex(current + 1);
    } else if (this.loop()) {
      this.setIndex(0);
    }
  }

  prev(): void {
    const images = this.images();
    if (images.length <= 1) return;

    const current = this._activeIndex();
    if (current > 0) {
      this.setIndex(current - 1);
    } else if (this.loop()) {
      this.setIndex(images.length - 1);
    }
  }

  goTo(index: number): void {
    const images = this.images();
    if (index >= 0 && index < images.length) {
      this.setIndex(index);
    }
  }

  // ─── EVENT HANDLERS ───

  protected onMouseEnter(): void {
    this.isHovered.set(true);
    this.stopAutoPlay();
  }

  protected onMouseLeave(): void {
    this.isHovered.set(false);
    if (this.autoPlay()) {
      this.startAutoPlay();
    }
  }

  protected onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) return;
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchCurrentX = touch.clientX;
    this.isSwiping = false;
    this.stopAutoPlay();
  }

  protected onTouchMove(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) return;
    this.touchCurrentX = touch.clientX;

    const diffX = Math.abs(this.touchCurrentX - this.touchStartX);
    const diffY = Math.abs(touch.clientY - this.touchStartY);

    // Only consider horizontal swipes (prevent vertical scroll interference)
    if (diffX > diffY && diffX > 10) {
      this.isSwiping = true;
      event.preventDefault();
    }
  }

  protected onTouchEnd(): void {
    if (!this.isSwiping) return;

    const diff = this.touchStartX - this.touchCurrentX;
    const threshold = 50;

    if (diff > threshold) {
      this.next();
    } else if (diff < -threshold) {
      this.prev();
    }

    this.isSwiping = false;

    if (this.autoPlay()) {
      this.startAutoPlay();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.prev();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.next();
        break;
      case 'Home':
        event.preventDefault();
        this.goTo(0);
        break;
      case 'End':
        event.preventDefault();
        this.goTo(this.images().length - 1);
        break;
    }
  }

  // ─── PRIVATE ───

  private setIndex(index: number): void {
    this._activeIndex.set(index);
    this.slideChange.emit(index);
  }

  private startAutoPlay(): void {
    if (!this.autoPlay() || this.images().length <= 1) return;
    this.stopAutoPlay();

    this.autoPlayTimer = setInterval(() => {
      const current = this._activeIndex();
      const max = this.images().length - 1;
      this.setIndex(current < max ? current + 1 : 0);
    }, this.autoPlayInterval());
  }

  private stopAutoPlay(): void {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
  }
}
