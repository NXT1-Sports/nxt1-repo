/**
 * @fileoverview Atomic Feed News Card
 * @module @nxt1/ui/feed
 *
 * Renders news article preview with image, headline, excerpt, source.
 * Used inside FeedCardShellComponent for FeedItemNews items.
 * SEO: renders as <a> when articleUrl is present.
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import type { FeedNewsData } from '@nxt1/core';
import { FEED_CARD_TEST_IDS } from '@nxt1/core/testing';
import { NxtImageComponent } from '../components/image';

@Component({
  selector: 'nxt1-feed-news-card',
  standalone: true,
  imports: [NxtImageComponent],
  template: `
    @if (hasLink()) {
      <a
        class="news-card news-card--link"
        [href]="data().articleUrl"
        target="_blank"
        rel="noopener noreferrer"
        [attr.aria-label]="'Read article: ' + data().headline"
        [attr.data-testid]="testIds.NEWS_CARD"
        (click)="$event.stopPropagation()"
      >
        @if (data().imageUrl) {
          <div class="news-card__image" [attr.data-testid]="testIds.NEWS_IMAGE">
            <nxt1-image [src]="data().imageUrl!" [alt]="data().headline" fit="cover" />
            @if (data().category) {
              <span class="news-card__category" [attr.data-testid]="testIds.NEWS_CATEGORY">{{
                data().category
              }}</span>
            }
          </div>
        }
        <div class="news-card__body" [attr.data-testid]="testIds.NEWS_BODY">
          <span class="news-card__headline" [attr.data-testid]="testIds.NEWS_HEADLINE">{{
            data().headline
          }}</span>
          @if (data().excerpt) {
            <p class="news-card__excerpt">{{ data().excerpt }}</p>
          }
          <div class="news-card__source" [attr.data-testid]="testIds.NEWS_SOURCE">
            @if (data().sourceLogoUrl) {
              <img
                [src]="data().sourceLogoUrl"
                class="news-card__source-logo"
                [alt]="data().source + ' logo'"
              />
            }
            <span>{{ data().source }}</span>
          </div>
        </div>
      </a>
    } @else {
      <div class="news-card" [attr.data-testid]="testIds.NEWS_CARD">
        @if (data().imageUrl) {
          <div class="news-card__image" [attr.data-testid]="testIds.NEWS_IMAGE">
            <nxt1-image [src]="data().imageUrl!" [alt]="data().headline" fit="cover" />
            @if (data().category) {
              <span class="news-card__category" [attr.data-testid]="testIds.NEWS_CATEGORY">{{
                data().category
              }}</span>
            }
          </div>
        }
        <div class="news-card__body" [attr.data-testid]="testIds.NEWS_BODY">
          <span class="news-card__headline" [attr.data-testid]="testIds.NEWS_HEADLINE">{{
            data().headline
          }}</span>
          @if (data().excerpt) {
            <p class="news-card__excerpt">{{ data().excerpt }}</p>
          }
          <div class="news-card__source" [attr.data-testid]="testIds.NEWS_SOURCE">
            @if (data().sourceLogoUrl) {
              <img
                [src]="data().sourceLogoUrl"
                class="news-card__source-logo"
                [alt]="data().source + ' logo'"
              />
            }
            <span>{{ data().source }}</span>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .news-card {
        border-radius: var(--nxt1-radius-md, 12px);
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        overflow: hidden;
        display: block;
      }

      .news-card--link {
        text-decoration: none;
        color: inherit;
        transition: background 0.15s ease;
        &:hover {
          background: rgba(255, 255, 255, 0.06);
        }
      }

      .news-card__image {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
      }

      .news-card__category {
        position: absolute;
        top: 10px;
        left: 10px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 3px 10px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: rgba(0, 0, 0, 0.6);
        -webkit-backdrop-filter: blur(8px);
        backdrop-filter: blur(8px);
        color: #ffffff;
      }

      .news-card__body {
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .news-card__headline {
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .news-card__excerpt {
        font-size: 13px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin: 0;
      }

      .news-card__source {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        margin-top: 4px;
      }

      .news-card__source-logo {
        width: 16px;
        height: 16px;
        border-radius: 3px;
        object-fit: contain;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedNewsCardComponent {
  readonly data = input.required<FeedNewsData>();

  protected readonly testIds = FEED_CARD_TEST_IDS;
  protected readonly hasLink = computed(() => !!this.data().articleUrl);
}
