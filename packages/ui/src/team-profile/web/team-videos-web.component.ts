/**
 * @fileoverview Team Videos Web Component
 * @module @nxt1/ui/team-profile/web
 * @version 4.0.0
 *
 * Renders team video content (highlights, full videos).
 * Uses polymorphic Smart Shell rendering with atomic card components.
 *
 * Uses videoPosts() from TeamProfileService.
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import {
  type TeamProfilePost,
  type FeedItem,
  type FeedItemPost,
  type FeedItemEvent,
  type FeedItemStat,
  type FeedItemMetric,
  type FeedItemOffer,
  type FeedItemCommitment,
  type FeedItemVisit,
  type FeedItemCamp,
  type FeedItemAward,
  type FeedItemNews,
  type ContentCardItem,
  feedOfferToContentCard,
  feedCommitmentToContentCard,
  feedVisitToContentCard,
  feedCampToContentCard,
  teamPostToFeedPost,
  teamToFeedAuthor,
  feedPostToFeedItem,
} from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
import { NxtActivityCardComponent } from '../../components/activity-card';
import { FeedCardShellComponent } from '../../feed/feed-card-shell.component';
import { FeedPostContentComponent } from '../../feed/feed-post-content.component';
import { FeedStatCardComponent } from '../../feed/feed-stat-card.component';
import { FeedEventCardComponent } from '../../feed/feed-event-card.component';
import { FeedMetricsCardComponent } from '../../feed/feed-metrics-card.component';
import { FeedAwardCardComponent } from '../../feed/feed-award-card.component';
import { FeedNewsCardComponent } from '../../feed/feed-news-card.component';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-videos-web',
  standalone: true,
  imports: [
    NxtIconComponent,
    NxtActivityCardComponent,
    FeedCardShellComponent,
    FeedPostContentComponent,
    FeedStatCardComponent,
    FeedEventCardComponent,
    FeedMetricsCardComponent,
    FeedAwardCardComponent,
    FeedNewsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (effectiveFeed().length > 0) {
      <div class="team-videos-list" data-testid="team-videos-list">
        @for (item of effectiveFeed(); track item.id; let idx = $index) {
          <nxt1-feed-card-shell
            [item]="item"
            [hideAuthor]="true"
            [showMenu]="false"
            (contentClick)="handlePolyVideoClick(idx)"
          >
            @switch (item.feedType) {
              @case ('POST') {
                <nxt1-feed-post-content [data]="asPost(item)" />
              }
              @case ('EVENT') {
                <nxt1-feed-event-card [data]="asEvent(item).eventData" />
              }
              @case ('STAT') {
                <nxt1-feed-stat-card [data]="asStat(item).statData" />
              }
              @case ('METRIC') {
                <nxt1-feed-metrics-card [data]="asMetric(item).metricsData" />
              }
              @case ('OFFER') {
                <nxt1-activity-card [item]="toOfferCard(asOffer(item))" />
              }
              @case ('COMMITMENT') {
                <nxt1-activity-card [item]="toCommitmentCard(asCommitment(item))" />
              }
              @case ('VISIT') {
                <nxt1-activity-card [item]="toVisitCard(asVisit(item))" />
              }
              @case ('CAMP') {
                <nxt1-activity-card [item]="toCampCard(asCamp(item))" />
              }
              @case ('AWARD') {
                <nxt1-feed-award-card [data]="asAward(item).awardData" />
              }
              @case ('NEWS') {
                <nxt1-feed-news-card [data]="asNews(item).newsData" />
              }
              @default {
                @if (asFallbackContent(item); as content) {
                  <p class="feed-fallback-text">{{ content }}</p>
                }
              }
            }
          </nxt1-feed-card-shell>
        }
      </div>
    } @else {
      <div class="madden-empty" data-testid="team-videos-empty">
        <div class="madden-empty__icon" aria-hidden="true">
          <nxt1-icon name="videocam-outline" [size]="40" />
        </div>
        <h3>No videos yet</h3>
        <p>Team highlights and game footage will appear here.</p>
        @if (teamProfile.isTeamAdmin()) {
          <button
            type="button"
            class="madden-cta-btn"
            data-testid="team-videos-add-btn"
            (click)="manageTeam.emit()"
          >
            Add Video
          </button>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .team-videos-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .madden-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 48px 24px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
      }
      .madden-empty h3 {
        font-size: 16px;
        font-weight: 700;
        color: var(--m-text);
        margin: 16px 0 8px;
      }
      .madden-empty__icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.4));
      }
      .madden-empty p {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0;
        max-width: 280px;
      }
      .madden-cta-btn {
        margin-top: 12px;
        padding: 10px 24px;
        background: var(--nxt1-color-primary);
        border: none;
        border-radius: 9999px;
        color: #000;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.1);
      }
      .madden-cta-btn:active {
        filter: brightness(0.95);
      }
    `,
  ],
})
export class TeamVideosWebComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  /** Active section from side nav: 'highlights' | 'all-videos' */
  readonly activeSection = input<string>('all-videos');

  /** New polymorphic feed items (discriminated union FeedItem[]) */
  readonly polymorphicFeed = input<readonly FeedItem[]>([]);

  /** Emitted when a video card is clicked */
  readonly videoClick = output<TeamProfilePost>();

  /** Emitted when a polymorphic item is clicked */
  readonly itemClick = output<FeedItem>();

  /** Emitted to open manage team modal */
  readonly manageTeam = output<void>();

  // ============================================
  // BRIDGE — Prefer polymorphicFeed; auto-convert service data if needed
  // ============================================

  /**
   * Resolved feed data: uses `polymorphicFeed` when provided by parent,
   * otherwise auto-converts TeamProfileService video posts via mappers.
   */
  protected readonly effectiveFeed = computed<readonly FeedItem[]>(() => {
    const poly = this.polymorphicFeed();
    if (poly.length > 0) return poly;

    const team = this.teamProfile.team();
    if (!team) return [];

    const author = teamToFeedAuthor(team);
    const videos = this.teamProfile.videoPosts();
    return videos.map((p) => feedPostToFeedItem(teamPostToFeedPost(p, author)));
  });

  /** Resolve polymorphic item click */
  protected handlePolyVideoClick(index: number): void {
    const item = this.effectiveFeed()[index];
    if (item) this.itemClick.emit(item);
  }

  // ============================================
  // POLYMORPHIC → ContentCardItem CONVERTERS
  // ============================================

  protected toOfferCard(item: FeedItemOffer): ContentCardItem {
    return feedOfferToContentCard(item.offerData);
  }

  protected toCommitmentCard(item: FeedItemCommitment): ContentCardItem {
    return feedCommitmentToContentCard(item.commitmentData);
  }

  protected toVisitCard(item: FeedItemVisit): ContentCardItem {
    return feedVisitToContentCard(item.visitData);
  }

  protected toCampCard(item: FeedItemCamp): ContentCardItem {
    return feedCampToContentCard(item.campData);
  }

  // ============================================
  // TYPE-SAFE CAST HELPERS
  // ============================================

  protected asPost(item: FeedItem): FeedItemPost {
    return item as FeedItemPost;
  }

  protected asEvent(item: FeedItem): FeedItemEvent {
    return item as FeedItemEvent;
  }

  protected asStat(item: FeedItem): FeedItemStat {
    return item as FeedItemStat;
  }

  protected asMetric(item: FeedItem): FeedItemMetric {
    return item as FeedItemMetric;
  }

  protected asOffer(item: FeedItem): FeedItemOffer {
    return item as FeedItemOffer;
  }

  protected asCommitment(item: FeedItem): FeedItemCommitment {
    return item as FeedItemCommitment;
  }

  protected asVisit(item: FeedItem): FeedItemVisit {
    return item as FeedItemVisit;
  }

  protected asCamp(item: FeedItem): FeedItemCamp {
    return item as FeedItemCamp;
  }

  protected asAward(item: FeedItem): FeedItemAward {
    return item as FeedItemAward;
  }

  protected asNews(item: FeedItem): FeedItemNews {
    return item as FeedItemNews;
  }

  protected asFallbackContent(item: FeedItem): string | null {
    const record = item as unknown as Record<string, unknown>;
    return typeof record['content'] === 'string' ? record['content'] : null;
  }
}
