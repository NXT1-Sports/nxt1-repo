/**
 * @fileoverview Atomic Feed Post Content
 * @module @nxt1/ui/feed
 *
 * Renders the text/media content of a standard post (FeedItemPost).
 * Title, text body, media carousel, tags, location, external source.
 * Used inside FeedCardShellComponent for FeedItemPost items.
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  computed,
  signal,
  inject,
  SecurityContext,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import type { FeedItemPost } from '@nxt1/core';
import { FEED_CARD_TEST_IDS } from '@nxt1/core/testing';
import { NxtImageComponent } from '../components/image';
import { NxtIconComponent } from '../components/icon';

const MAX_VISIBLE_TAGS = 5;

@Component({
  selector: 'nxt1-feed-post-content',
  standalone: true,
  imports: [NxtImageComponent, NxtIconComponent],
  template: `
    <!-- Media Carousel -->
    @if (hasMedia()) {
      <div class="post-content__media" [attr.data-testid]="testIds.POST_MEDIA_CAROUSEL">
        <div
          class="post-content__media-track"
          [attr.data-testid]="testIds.POST_MEDIA_TRACK"
          (scroll)="onMediaScroll($event)"
        >
          @for (media of data().media; track media.id) {
            <div class="post-content__media-slide" [attr.data-testid]="testIds.POST_MEDIA_SLIDE">
              @if (media.type === 'image') {
                <nxt1-image
                  [src]="media.url"
                  [alt]="media.altText || data().title || 'Post image'"
                  fit="cover"
                />
              } @else if (media.type === 'video') {
                <nxt1-image
                  [src]="media.thumbnailUrl || media.url"
                  [alt]="media.altText || 'Video thumbnail'"
                  fit="cover"
                />
                <div class="post-content__video-overlay">
                  <nxt1-icon name="playCircle" [size]="48" />
                </div>
                @if (media.duration) {
                  <span class="post-content__video-duration">{{
                    formatDuration(media.duration)
                  }}</span>
                }
              }
            </div>
          }
        </div>
        @if (data().media.length > 1) {
          <div
            class="post-content__media-dots"
            [attr.data-testid]="testIds.POST_MEDIA_DOTS"
            role="tablist"
            [attr.aria-label]="'Media ' + activeMediaIndex() + ' of ' + data().media.length"
          >
            @for (media of data().media; track media.id; let i = $index) {
              <button
                type="button"
                class="post-content__media-dot"
                [class.post-content__media-dot--active]="i === activeMediaIndex()"
                [attr.data-testid]="testIds.POST_MEDIA_DOT"
                [attr.aria-label]="'Go to media ' + (i + 1)"
                [attr.aria-selected]="i === activeMediaIndex()"
                role="tab"
                (click)="goToSlide(i)"
              ></button>
            }
          </div>
        }
      </div>
    }

    <!-- Title -->
    @if (data().title) {
      <h3 class="post-content__title" [attr.data-testid]="testIds.POST_TITLE">
        {{ data().title }}
      </h3>
    }

    <!-- Text Content -->
    @if (data().content) {
      <p
        class="post-content__text"
        [attr.data-testid]="testIds.POST_CONTENT"
        [innerHTML]="sanitizedContent()"
      ></p>
    }

    <!-- External Source -->
    @if (data().externalSource) {
      <div class="post-content__external" [attr.data-testid]="testIds.POST_EXTERNAL">
        @if (data().externalSource!.logoUrl) {
          <img
            [src]="data().externalSource!.logoUrl"
            class="post-content__external-logo"
            [alt]="data().externalSource!.label + ' logo'"
          />
        } @else {
          <nxt1-icon name="link" [size]="14" />
        }
        <span>{{ data().externalSource!.label }}</span>
      </div>
    }

    <!-- Tags -->
    @if (hasTags()) {
      <div class="post-content__tags" [attr.data-testid]="testIds.POST_TAGS">
        @for (tag of visibleTags(); track tag.id) {
          <div class="post-content__tag" [attr.data-testid]="testIds.POST_TAG">
            <span>{{ tag.label }}</span>
          </div>
        }
        @if (hiddenTagCount() > 0) {
          <div class="post-content__tag post-content__tag--more">
            <span>+{{ hiddenTagCount() }} more</span>
          </div>
        }
      </div>
    }

    <!-- Location -->
    @if (data().location) {
      <div class="post-content__location" [attr.data-testid]="testIds.POST_LOCATION">
        <nxt1-icon name="location" [size]="14" />
        <span>{{ data().location }}</span>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* Media */
      .post-content__media {
        position: relative;
        margin: 0 -16px;
      }

      .post-content__media-track {
        display: flex;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        -ms-overflow-style: none;
        &::-webkit-scrollbar {
          display: none;
        }
      }

      .post-content__media-slide {
        flex: 0 0 100%;
        scroll-snap-align: start;
        position: relative;
        aspect-ratio: 16 / 10;
      }

      .post-content__video-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.3);
        color: #ffffff;
        opacity: 0.9;
        transition: opacity 0.2s;
      }

      .post-content__video-duration {
        position: absolute;
        bottom: 8px;
        right: 8px;
        font-size: 12px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.7);
        color: #ffffff;
      }

      .post-content__media-dots {
        display: flex;
        justify-content: center;
        gap: 6px;
        padding: 8px 0 4px;
      }

      .post-content__media-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.3);
        border: none;
        padding: 0;
        cursor: pointer;
        transition:
          background 0.2s,
          transform 0.2s;
        -webkit-tap-highlight-color: transparent;
      }

      .post-content__media-dot--active {
        background: var(--nxt1-color-primary, #d4ff00);
        transform: scale(1.3);
      }

      /* Title */
      .post-content__title {
        font-size: 16px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 4px 0 2px;
      }

      /* Text */
      .post-content__text {
        font-size: 14px;
        line-height: 1.55;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0;
        word-break: break-word;
      }

      :host ::ng-deep .hashtag {
        color: var(--nxt1-color-primary, #d4ff00);
        font-weight: 600;
      }

      :host ::ng-deep .mention {
        color: var(--nxt1-color-primary, #d4ff00);
        font-weight: 600;
      }

      /* External Source */
      .post-content__external {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        margin-top: 8px;
        border-radius: var(--nxt1-radius-sm, 8px);
        background: rgba(255, 255, 255, 0.04);
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .post-content__external-logo {
        width: 16px;
        height: 16px;
        border-radius: 3px;
        object-fit: contain;
      }

      /* Tags */
      .post-content__tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 10px;
      }

      .post-content__tag {
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: rgba(255, 255, 255, 0.06);
        font-size: 11px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .post-content__tag--more {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* Location */
      .post-content__location {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 8px;
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedPostContentComponent {
  readonly data = input.required<FeedItemPost>();

  private readonly sanitizer = inject(DomSanitizer);
  protected readonly testIds = FEED_CARD_TEST_IDS;
  protected readonly activeMediaIndex = signal(0);

  protected readonly hasMedia = computed(() => this.data().media.length > 0);

  /**
   * Sanitized HTML content with hashtag/mention highlighting.
   * Uses DomSanitizer.sanitize(SecurityContext.HTML) to strip dangerous tags/attrs
   * before inserting via [innerHTML]. Only <span> with class attrs survive.
   */
  protected readonly sanitizedContent = computed<SafeHtml>(() => {
    const content = this.data().content;
    if (!content) return '';
    const highlighted = content
      .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
      .replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    return this.sanitizer.sanitize(SecurityContext.HTML, highlighted) ?? '';
  });

  protected readonly hasTags = computed(() => (this.data().postTags?.length ?? 0) > 0);

  protected readonly visibleTags = computed(() =>
    (this.data().postTags ?? []).slice(0, MAX_VISIBLE_TAGS)
  );

  protected readonly hiddenTagCount = computed(() =>
    Math.max(0, (this.data().postTags?.length ?? 0) - MAX_VISIBLE_TAGS)
  );

  protected onMediaScroll(event: Event): void {
    const track = event.target as HTMLElement;
    const slideWidth = track.offsetWidth;
    if (slideWidth > 0) {
      const index = Math.round(track.scrollLeft / slideWidth);
      if (index !== this.activeMediaIndex()) {
        this.activeMediaIndex.set(index);
      }
    }
  }

  protected goToSlide(index: number): void {
    this.activeMediaIndex.set(index);
  }

  protected formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
