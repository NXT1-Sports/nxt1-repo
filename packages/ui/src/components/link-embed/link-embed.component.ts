/**
 * @fileoverview Link Embed Component
 * @module @nxt1/ui/components/link-embed
 *
 * Renders an inline news/article preview card — headline, excerpt, source
 * logo, thumbnail. Used within FeedPostContentComponent to display `embeds`
 * on FeedItemPost, and internally by FeedNewsCardComponent.
 *
 * SSR-safe: no browser globals. Pure template rendering.
 * SEO: renders an <a> tag when `url` is provided.
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { NxtImageComponent } from '../image';

export interface LinkEmbedData {
  readonly url?: string;
  readonly title: string;
  readonly excerpt?: string;
  readonly imageUrl?: string;
  readonly source: string;
  readonly sourceLogoUrl?: string;
  readonly publishedAt?: string;
}

@Component({
  selector: 'nxt1-link-embed',
  standalone: true,
  imports: [NxtImageComponent],
  template: `
    @if (hasLink()) {
      <a
        class="link-embed link-embed--anchor"
        [href]="data().url"
        target="_blank"
        rel="noopener noreferrer"
        [attr.aria-label]="'Read: ' + data().title"
        (click)="$event.stopPropagation()"
      >
        @if (data().imageUrl) {
          <div class="link-embed__image">
            <nxt1-image [src]="data().imageUrl!" [alt]="data().title" fit="cover" />
          </div>
        }
        <div class="link-embed__body">
          <div class="link-embed__source">
            @if (data().sourceLogoUrl) {
              <img
                [src]="data().sourceLogoUrl"
                class="link-embed__source-logo"
                [alt]="data().source + ' logo'"
                loading="lazy"
              />
            }
            <span class="link-embed__source-name">{{ data().source }}</span>
            @if (formattedDate()) {
              <span class="link-embed__date">{{ formattedDate() }}</span>
            }
          </div>
          <p class="link-embed__title">{{ data().title }}</p>
          @if (data().excerpt) {
            <p class="link-embed__excerpt">{{ data().excerpt }}</p>
          }
        </div>
      </a>
    } @else {
      <div class="link-embed">
        @if (data().imageUrl) {
          <div class="link-embed__image">
            <nxt1-image [src]="data().imageUrl!" [alt]="data().title" fit="cover" />
          </div>
        }
        <div class="link-embed__body">
          <div class="link-embed__source">
            @if (data().sourceLogoUrl) {
              <img
                [src]="data().sourceLogoUrl"
                class="link-embed__source-logo"
                [alt]="data().source + ' logo'"
                loading="lazy"
              />
            }
            <span class="link-embed__source-name">{{ data().source }}</span>
            @if (formattedDate()) {
              <span class="link-embed__date">{{ formattedDate() }}</span>
            }
          </div>
          <p class="link-embed__title">{{ data().title }}</p>
          @if (data().excerpt) {
            <p class="link-embed__excerpt">{{ data().excerpt }}</p>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .link-embed {
        display: flex;
        gap: 12px;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-50, rgba(255, 255, 255, 0.03));
        overflow: hidden;
        text-decoration: none;
        color: inherit;
        transition: background 0.15s ease;

        &.link-embed--anchor {
          cursor: pointer;
          &:hover {
            background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.06));
          }
          &:focus-visible {
            outline: 2px solid var(--nxt1-color-primary, #4f46e5);
            outline-offset: 2px;
          }
        }
      }

      .link-embed__image {
        flex: 0 0 80px;
        height: 80px;
        border-radius: 8px;
        overflow: hidden;
      }

      .link-embed__body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .link-embed__source {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .link-embed__source-logo {
        width: 14px;
        height: 14px;
        border-radius: 2px;
        object-fit: contain;
      }

      .link-embed__source-name {
        font-size: 11px;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        text-transform: uppercase;
        letter-spacing: 0.4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .link-embed__date {
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        &::before {
          content: '·';
          margin-right: 4px;
        }
      }

      .link-embed__title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.35;
        color: var(--nxt1-color-text-primary, #fff);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .link-embed__excerpt {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.65));
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkEmbedComponent {
  readonly data = input.required<LinkEmbedData>();

  protected readonly hasLink = computed(() => !!this.data().url);

  protected readonly formattedDate = computed(() => {
    const raw = this.data().publishedAt;
    if (!raw) return null;
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return null;
      const now = Date.now();
      const diff = now - d.getTime();
      const days = Math.floor(diff / 86_400_000);
      if (days === 0) return 'Today';
      if (days === 1) return 'Yesterday';
      if (days < 7) return `${days}d ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return null;
    }
  });
}
