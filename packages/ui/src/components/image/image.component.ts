/**
 * @fileoverview Optimized Image Component
 * @module @nxt1/ui/components/image
 *
 * Production-grade image component using Angular's NgOptimizedImage.
 * Provides automatic lazy loading, responsive sizing, and CDN integration.
 *
 * Features:
 * - Automatic lazy loading (below-the-fold images)
 * - Priority loading support (above-the-fold images)
 * - Responsive srcset generation
 * - Firebase Storage CDN integration
 * - Placeholder/skeleton while loading
 * - Error state handling with fallback
 * - Aspect ratio preservation
 * - Blur-up loading effect
 *
 * @example
 * ```html
 * <!-- Basic usage -->
 * <nxt1-image
 *   src="https://storage.googleapis.com/nxt1/image.jpg"
 *   alt="Athlete photo"
 *   [width]="400"
 *   [height]="300"
 * />
 *
 * <!-- Hero image with priority loading -->
 * <nxt1-image
 *   src="hero.jpg"
 *   alt="Hero banner"
 *   [width]="1200"
 *   [height]="630"
 *   [priority]="true"
 *   fit="cover"
 * />
 *
 * <!-- Avatar with fallback -->
 * <nxt1-image
 *   [src]="user.photoUrl"
 *   alt="Profile photo"
 *   [width]="48"
 *   [height]="48"
 *   variant="avatar"
 *   fallback="/assets/default-avatar.png"
 * />
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnChanges,
  SimpleChanges,
  signal,
  computed,
  booleanAttribute,
  numberAttribute,
} from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';

// ============================================
// TYPES
// ============================================

/** Image fit modes */
export type ImageFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';

/** Image loading strategy */
export type ImageLoading = 'lazy' | 'eager';

/** Image variant for preset styling */
export type ImageVariant = 'default' | 'avatar' | 'thumbnail' | 'hero' | 'card';

/** Image load state */
export type ImageState = 'loading' | 'loaded' | 'error';

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-image',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage],
  template: `
    <!-- Loading skeleton -->
    @if (state() === 'loading' && showPlaceholder) {
      <div
        class="nxt1-image__placeholder"
        [class.nxt1-image__placeholder--avatar]="variant === 'avatar'"
        [style.aspect-ratio]="aspectRatio()"
        role="presentation"
      >
        <div class="nxt1-image__shimmer"></div>
      </div>
    }

    <!-- Error fallback -->
    @if (state() === 'error') {
      <div
        class="nxt1-image__error"
        [class.nxt1-image__error--avatar]="variant === 'avatar'"
        [style.aspect-ratio]="aspectRatio()"
        role="img"
        [attr.aria-label]="alt || 'Image failed to load'"
      >
        @if (fallback) {
          <img [src]="fallback" [alt]="alt" [style.object-fit]="fit" class="nxt1-image__fallback" />
        } @else {
          <div class="nxt1-image__error-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
              />
            </svg>
          </div>
        }
      </div>
    }

    <!-- Show error state when no valid source and no fallback -->
    @if (!hasValidSrc() && state() !== 'error') {
      <div
        class="nxt1-image__error"
        [class.nxt1-image__error--avatar]="variant === 'avatar'"
        [style.aspect-ratio]="aspectRatio()"
        role="img"
        [attr.aria-label]="alt || 'No image available'"
      >
        <div class="nxt1-image__error-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
            />
          </svg>
        </div>
      </div>
    }

    <!-- Actual image -->
    @if (hasValidSrc() && state() !== 'error') {
      <img
        [ngSrc]="effectiveSrc()!"
        [alt]="alt"
        [width]="width"
        [height]="height"
        [priority]="priority"
        [class.nxt1-image--loaded]="state() === 'loaded'"
        [class.nxt1-image--loading]="state() === 'loading'"
        [class.nxt1-image--avatar]="variant === 'avatar'"
        [class.nxt1-image--thumbnail]="variant === 'thumbnail'"
        [class.nxt1-image--hero]="variant === 'hero'"
        [class.nxt1-image--card]="variant === 'card'"
        [style.object-fit]="fit"
        [attr.loading]="priority ? 'eager' : 'lazy'"
        [attr.fetchpriority]="priority ? 'high' : 'auto'"
        (load)="onLoad()"
        (error)="onError()"
      />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        overflow: hidden;
      }

      /* Base image styles */
      img {
        display: block;
        width: 100%;
        height: auto;
        transition: opacity 0.3s ease;
      }

      .nxt1-image--loading {
        opacity: 0;
      }

      .nxt1-image--loaded {
        opacity: 1;
      }

      /* Variant styles */
      .nxt1-image--avatar {
        border-radius: 50%;
      }

      .nxt1-image--thumbnail {
        border-radius: var(--nxt1-radius-sm, 0.25rem);
      }

      .nxt1-image--hero {
        border-radius: 0;
      }

      .nxt1-image--card {
        border-radius: var(--nxt1-radius-md, 0.5rem);
      }

      /* Placeholder skeleton */
      .nxt1-image__placeholder {
        position: absolute;
        inset: 0;
        background: var(--nxt1-surface-secondary, #1a1a1a);
        overflow: hidden;
      }

      .nxt1-image__placeholder--avatar {
        border-radius: 50%;
      }

      .nxt1-image__shimmer {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          var(--nxt1-surface-tertiary, #2a2a2a) 50%,
          transparent 100%
        );
        animation: shimmer 1.5s infinite;
      }

      @keyframes shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      /* Error state */
      .nxt1-image__error {
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-surface-secondary, #1a1a1a);
        color: var(--nxt1-text-tertiary, #666);
      }

      .nxt1-image__error--avatar {
        border-radius: 50%;
      }

      .nxt1-image__error-icon {
        width: 40%;
        max-width: 64px;
        opacity: 0.5;
      }

      .nxt1-image__error-icon svg {
        width: 100%;
        height: auto;
      }

      .nxt1-image__fallback {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtImageComponent implements OnChanges {
  // ============================================
  // INPUTS
  // ============================================

  /** Image source URL */
  @Input() src: string | null | undefined;

  /** Alt text for accessibility */
  @Input() alt: string = '';

  /** Image width in pixels (REQUIRED for NgOptimizedImage) */
  @Input({ transform: numberAttribute }) width: number = 100;

  /** Image height in pixels (REQUIRED for NgOptimizedImage) */
  @Input({ transform: numberAttribute }) height: number = 100;

  /** Priority loading for above-the-fold images */
  @Input({ transform: booleanAttribute }) priority: boolean = false;

  /** Object-fit CSS property */
  @Input() fit: ImageFit = 'cover';

  /** Visual variant */
  @Input() variant: ImageVariant = 'default';

  /** Fallback image URL on error */
  @Input() fallback?: string;

  /** Show placeholder while loading */
  @Input({ transform: booleanAttribute }) showPlaceholder: boolean = true;

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when image loads successfully */
  @Output() loaded = new EventEmitter<void>();

  /** Emitted when image fails to load */
  @Output() error = new EventEmitter<void>();

  // ============================================
  // STATE
  // ============================================

  /** Current loading state */
  readonly state = signal<ImageState>('loading');

  /** Computed aspect ratio for placeholder sizing */
  readonly aspectRatio = computed(() => {
    if (this.width && this.height) {
      return `${this.width} / ${this.height}`;
    }
    return 'auto';
  });

  /** Effective source URL (handles null/undefined) */
  readonly effectiveSrc = computed(() => {
    // Return null if no valid source
    if (!this.src || this.src.trim() === '') {
      // If we have a fallback and no source, use fallback
      if (this.fallback) {
        return this.fallback;
      }
      return null;
    }
    return this.src;
  });

  /** Whether the image has a valid source */
  readonly hasValidSrc = computed(() => {
    return !!this.effectiveSrc();
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnChanges(changes: SimpleChanges): void {
    // Reset state when source changes
    if (changes['src'] && this.src) {
      this.state.set('loading');
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Handle successful image load */
  onLoad(): void {
    this.state.set('loaded');
    this.loaded.emit();
  }

  /** Handle image load error */
  onError(): void {
    this.state.set('error');
    this.error.emit();
  }
}
