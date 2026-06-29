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
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  signal,
  effect,
} from '@angular/core';
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
import { TEAM_VIDEOS_TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../components/icon';
import { NxtActivityCardComponent } from '../../components/activity-card';
import { FeedCardShellComponent } from '../../post-cards/feed-card-shell.component';
import { FeedPostContentComponent } from '../../post-cards/feed-post-content.component';
import { FeedStatCardComponent } from '../../post-cards/feed-stat-card.component';
import { FeedEventCardComponent } from '../../post-cards/feed-event-card.component';
import { FeedMetricsCardComponent } from '../../post-cards/feed-metrics-card.component';
import { FeedAwardCardComponent } from '../../post-cards/feed-award-card.component';
import { FeedNewsCardComponent } from '../../post-cards/feed-news-card.component';
import { TeamProfileService } from '../team-profile.service';

interface VideoPlaylistOption {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

const ALL_VIDEO_PLAYLISTS_ID = 'all';
const UNCATEGORIZED_VIDEO_PLAYLIST_ID = 'uncategorized';

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
    @if (filteredFeed().length > 0) {
      @if (showPlaylistDropdown()) {
        <div class="playlist-filter" [attr.data-testid]="testIds.PLAYLIST_FILTER">
          <label class="playlist-filter__label" for="team-video-playlist-select">Playlist</label>
          <select
            id="team-video-playlist-select"
            class="playlist-filter__select"
            [value]="activePlaylistId()"
            [attr.data-testid]="testIds.PLAYLIST_SELECT"
            (change)="setPlaylist($event)"
          >
            @for (playlist of playlistOptions(); track playlist.id) {
              <option [value]="playlist.id">{{ playlist.label }} ({{ playlist.count }})</option>
            }
          </select>
        </div>
      }

      <div class="team-videos-list" [attr.data-testid]="testIds.LIST">
        @for (item of filteredFeed(); track item.id; let idx = $index) {
          <nxt1-feed-card-shell
            [item]="item"
            [hideAuthor]="true"
            [showMenu]="false"
            (contentClick)="handlePolyVideoClick(idx)"
          >
            @switch (item.feedType) {
              @case ('POST') {
                <nxt1-feed-post-content [data]="asPost(item)" [videoControlsMode]="'compact'" />
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
      <div class="madden-empty" [attr.data-testid]="testIds.EMPTY_STATE">
        <div class="madden-empty__icon" aria-hidden="true">
          <nxt1-icon name="videocam-outline" [size]="40" />
        </div>
        <h3>No videos yet</h3>
        <p>Team highlights and game footage will appear here.</p>
        @if (teamProfile.isTeamAdmin()) {
          <button
            type="button"
            class="madden-cta-btn"
            [attr.data-testid]="testIds.EMPTY_CTA"
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

      .playlist-filter {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
        padding: 10px 12px;
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        border-radius: 8px;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.04));
      }

      .playlist-filter__label {
        font-size: 12px;
        font-weight: 700;
        color: var(--m-text-2, rgba(255, 255, 255, 0.62));
        text-transform: uppercase;
      }

      .playlist-filter__select {
        min-width: 180px;
        max-width: 100%;
        padding: 8px 32px 8px 10px;
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.14));
        border-radius: 8px;
        background: var(--m-surface, rgba(10, 13, 18, 0.96));
        color: var(--m-text, #fff);
        font: inherit;
      }

      @media (max-width: 520px) {
        .playlist-filter {
          align-items: stretch;
          flex-direction: column;
        }

        .playlist-filter__select {
          width: 100%;
        }
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
  protected readonly testIds = TEAM_VIDEOS_TEST_IDS;

  private readonly _activePlaylistId = signal<string>(ALL_VIDEO_PLAYLISTS_ID);
  protected readonly activePlaylistId = this._activePlaylistId.asReadonly();

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

  constructor() {
    effect(() => {
      const options = this.playlistOptions();
      const current = this._activePlaylistId();
      if (!options.some((option) => option.id === current)) {
        this._activePlaylistId.set(ALL_VIDEO_PLAYLISTS_ID);
      }
    });
  }

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

  protected readonly playlistOptions = computed<readonly VideoPlaylistOption[]>(() => {
    const videos = this.effectiveFeed().filter((item) => this.isVideoFeedItem(item));
    if (videos.length === 0) return [];

    const groups = new Map<string, { label: string; count: number }>();
    for (const video of videos) {
      const playlist = this.resolvePlaylist(video);
      const id = playlist?.id ?? UNCATEGORIZED_VIDEO_PLAYLIST_ID;
      const label = playlist?.label ?? 'Uncategorized';
      const existing = groups.get(id);
      groups.set(id, { label, count: (existing?.count ?? 0) + 1 });
    }

    const grouped = Array.from(groups.entries())
      .map(([id, value]) => ({ id, label: value.label, count: value.count }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [{ id: ALL_VIDEO_PLAYLISTS_ID, label: 'All Videos', count: videos.length }, ...grouped];
  });

  protected readonly showPlaylistDropdown = computed(() => this.playlistOptions().length > 1);

  protected readonly filteredFeed = computed<readonly FeedItem[]>(() => {
    const feed = this.effectiveFeed();
    const playlistId = this._activePlaylistId();
    if (playlistId === ALL_VIDEO_PLAYLISTS_ID) return feed;

    return feed.filter((item) => {
      const playlist = this.resolvePlaylist(item);
      return (playlist?.id ?? UNCATEGORIZED_VIDEO_PLAYLIST_ID) === playlistId;
    });
  });

  protected setPlaylist(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    this._activePlaylistId.set(select?.value || ALL_VIDEO_PLAYLISTS_ID);
  }

  /** Resolve polymorphic item click */
  protected handlePolyVideoClick(index: number): void {
    const item = this.filteredFeed()[index];
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

  private isVideoFeedItem(item: FeedItem): boolean {
    return (
      item.feedType === 'POST' &&
      ((item as FeedItemPost).postType === 'video' ||
        (item as FeedItemPost).media.some((media) => media.type === 'video'))
    );
  }

  private resolvePlaylist(item: FeedItem): { id: string; label: string } | null {
    if (item.feedType !== 'POST') return null;

    const post = item as FeedItemPost;
    const media = post.media.find((candidate) => candidate.type === 'video') ?? post.media[0];
    const mediaRecord = media as unknown as Record<string, unknown> | undefined;
    const postRecord = post as unknown as Record<string, unknown>;
    const rawId = this.firstString(
      mediaRecord?.['playlistId'],
      postRecord['playlistId'],
      mediaRecord?.['playlist'],
      postRecord['playlist']
    );
    const rawLabel = this.firstString(
      mediaRecord?.['playlistName'],
      postRecord['playlistName'],
      mediaRecord?.['playlistTitle'],
      postRecord['playlistTitle']
    );
    const label = rawLabel ?? rawId;
    if (!label) return null;

    return {
      id: this.normalizePlaylistId(rawId ?? label),
      label,
    };
  }

  private firstString(...values: readonly unknown[]): string | null {
    for (const value of values) {
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
    return null;
  }

  private normalizePlaylistId(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  protected asFallbackContent(item: FeedItem): string | null {
    const record = item as unknown as Record<string, unknown>;
    return typeof record['content'] === 'string' ? record['content'] : null;
  }
}
