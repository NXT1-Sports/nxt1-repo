/**
 * @fileoverview Post Detail Overlay Component
 * @module @nxt1/ui/post-cards
 * @version 1.0.0
 *
 * Full-screen post viewer rendered inside NxtOverlayService.
 * Accepts a normalized PostDetailInput and renders media, content, and stats.
 * Compatible with both ProfilePost and TeamProfilePost shapes.
 *
 * Emits `close` output when the user dismisses the overlay.
 * SSR-safe — no direct browser API access.
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import type { IconName } from '@nxt1/design-tokens/assets/icons';
import { NxtIconComponent } from '../components/icon';
import { NxtAvatarComponent } from '../components/avatar';
import {
  type FeedExternalSource,
  type FeedItemPost,
  type FeedMedia,
  type FeedNewsData,
  type FeedPostTag,
  type FeedPostType,
  type FeedVideoProcessingStatus,
} from '@nxt1/core';
import { FeedPostContentComponent } from './feed-post-content.component';

// ============================================
// POST DETAIL INPUT — normalized shape compatible
// with both ProfilePost and TeamProfilePost
// ============================================

/**
 * Normalized post data passed to the overlay.
 * Maps directly to ProfilePost and TeamProfilePost common fields.
 */
export interface PostDetailInput {
  readonly id: string;
  readonly type: string;
  readonly title?: string;
  /** Legacy alias for content body used by existing profile/team post DTOs. */
  readonly body?: string;
  /** Canonical text body used by feed payloads. */
  readonly content?: string;
  /** Canonical feed media array (supports carousel with mixed images/videos). */
  readonly media?: readonly FeedMedia[];
  readonly thumbnailUrl?: string;
  readonly mediaUrl?: string;
  /** Cloudflare Stream iframe embed URL (preferred for CF videos) */
  readonly iframeUrl?: string;
  /** HLS stream URL for Cloudflare video playback */
  readonly hlsUrl?: string;
  /** Cloudflare Video ID */
  readonly cloudflareVideoId?: string;
  /** Cloudflare video processing status (e.g. 'ready', 'processing', 'error') */
  readonly processingStatus?: FeedVideoProcessingStatus | string;
  readonly externalLink?: string;
  readonly externalSource?: FeedExternalSource;
  readonly location?: string;
  readonly postTags?: readonly FeedPostTag[];
  readonly embeds?: readonly FeedNewsData[];
  readonly shareCount?: number;
  readonly viewCount?: number;
  readonly duration?: number;
  readonly isPinned?: boolean;
  readonly createdAt: string;
}

/** Metadata about the author shown in the overlay header */
export interface PostAuthorInfo {
  readonly name: string;
  readonly avatarUrl?: string;
}

const TYPE_LABELS: Record<string, string> = {
  video: 'Video',
  image: 'Photo',
  text: 'Post',
  news: 'News',
  stat: 'Stats',
  offer: 'Offer',
  announcement: 'Announcement',
  metric: 'Metric',
  award: 'Award',
  event: 'Event',
};

@Component({
  selector: 'nxt1-post-detail-overlay',
  standalone: true,
  imports: [NxtIconComponent, NxtAvatarComponent, FeedPostContentComponent, DatePipe, DecimalPipe],
  template: `
    <div
      class="pdo-panel"
      role="dialog"
      [attr.aria-label]="post().title ? 'Post: ' + post().title : 'Post detail'"
      aria-modal="true"
    >
      <!-- ── HEADER ── -->
      <header class="pdo-header">
        <!-- Type badge -->
        <span class="pdo-type-badge pdo-type-badge--{{ post().type }}">
          <nxt1-icon [name]="typeIcon()" [size]="12" aria-hidden="true" />
          {{ typeLabel() }}
        </span>

        @if (post().isPinned) {
          <span class="pdo-pinned-badge" aria-label="Pinned post">
            <nxt1-icon name="pin" [size]="12" aria-hidden="true" />
            Pinned
          </span>
        }

        <div class="pdo-header-spacer"></div>

        <!-- Close button -->
        <button type="button" class="pdo-close-btn" aria-label="Close post" (click)="onClose()">
          <nxt1-icon name="close" [size]="20" />
        </button>
      </header>

      <!-- ── SCROLLABLE BODY ── -->
      <div class="pdo-body" #pdoBody>
        <!-- Author row -->
        <div class="pdo-author-row">
          <nxt1-avatar
            [src]="author().avatarUrl"
            [name]="author().name"
            size="md"
            class="pdo-author-avatar"
          />
          <div class="pdo-author-info">
            <span class="pdo-author-name">{{ author().name }}</span>
            <time
              class="pdo-date"
              [attr.datetime]="post().createdAt"
              [title]="post().createdAt | date: 'medium'"
            >
              {{ post().createdAt | date: 'MMM d, yyyy' }}
            </time>
          </div>
        </div>

        <!-- ── CONTENT (shared renderer with feed timeline cards) ── -->
        <div class="pdo-content-wrap">
          <nxt1-feed-post-content [data]="feedPostData()" [videoControlsMode]="'compact'" />
        </div>

        <!-- ── STATS BAR ── -->
        <div class="pdo-stats-bar">
          @if (post().viewCount) {
            <span class="pdo-stat">
              <nxt1-icon name="barChart" [size]="14" aria-hidden="true" />
              {{ post().viewCount | number }} views
            </span>
          }
          @if (post().shareCount) {
            <span class="pdo-stat">
              <nxt1-icon name="share" [size]="14" aria-hidden="true" />
              {{ post().shareCount }} shares
            </span>
          }
          @if (post().duration) {
            <span class="pdo-stat">
              <nxt1-icon name="time" [size]="14" aria-hidden="true" />
              {{ durationLabel() }}
            </span>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      /* ─── PANEL ─── */
      .pdo-panel {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        margin: 0;
        background: transparent;
        border: none;
        border-radius: inherit;
        overflow: hidden;
        box-shadow: none;
      }

      /* ─── HEADER ─── */
      .pdo-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.06));
        flex-shrink: 0;
      }

      .pdo-header-spacer {
        flex: 1;
      }

      .pdo-close-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        cursor: pointer;
        flex-shrink: 0;
        transition:
          background 0.15s ease,
          color 0.15s ease;
      }

      .pdo-close-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-primary, #fff);
        border-color: rgba(255, 255, 255, 0.14);
      }

      /* ─── TYPE BADGE ─── */
      .pdo-type-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.04em;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        text-transform: uppercase;
      }

      .pdo-type-badge--video {
        background: rgba(212, 255, 0, 0.08);
        border-color: rgba(212, 255, 0, 0.25);
        color: var(--nxt1-color-primary, #d4ff00);
      }

      .pdo-type-badge--news {
        background: rgba(59, 130, 246, 0.1);
        border-color: rgba(59, 130, 246, 0.3);
        color: #60a5fa;
      }

      .pdo-type-badge--offer {
        background: rgba(34, 197, 94, 0.1);
        border-color: rgba(34, 197, 94, 0.3);
        color: #4ade80;
      }

      .pdo-type-badge--stat {
        background: rgba(168, 85, 247, 0.1);
        border-color: rgba(168, 85, 247, 0.3);
        color: #c084fc;
      }

      .pdo-pinned-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
      }

      /* ─── BODY ─── */
      .pdo-body {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 0 0 24px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
      }

      .pdo-body::-webkit-scrollbar {
        width: 5px;
      }

      .pdo-body::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
      }

      /* ─── AUTHOR ROW ─── */
      .pdo-author-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px 12px;
      }

      .pdo-author-avatar {
        flex-shrink: 0;
      }

      .pdo-author-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }

      .pdo-author-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .pdo-date {
        font-size: 11.5px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      /* ─── CONTENT ─── */
      .pdo-content-wrap {
        padding: 0 20px;
      }

      :host ::ng-deep .pdo-content-wrap .post-content__media {
        margin-left: -20px;
        margin-right: -20px;
      }

      /* ─── STATS BAR ─── */
      .pdo-stats-bar {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 14px 20px 0;
        flex-wrap: wrap;
      }

      .pdo-stat {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12.5px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      /* ─── RESPONSIVE ─── */
      @media (max-width: 600px) {
        .pdo-panel {
          max-width: none;
          max-height: none;
          margin: 0;
          border-radius: inherit;
        }

        .pdo-title {
          font-size: 16px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostDetailOverlayComponent {
  // ─── INPUTS ───
  readonly post = input.required<PostDetailInput>();
  readonly author = input<PostAuthorInfo>({ name: 'Athlete' });

  // ─── OUTPUTS ───
  readonly close = output<void>();

  // ─── COMPUTED ───

  protected readonly typeLabel = computed(() => TYPE_LABELS[this.post().type] ?? this.post().type);

  protected readonly typeIcon = computed((): IconName => {
    const map: Partial<Record<string, IconName>> = {
      video: 'videocam',
      image: 'image',
      text: 'documentText',
      news: 'newspaper',
      stat: 'barChart',
      offer: 'trophy',
      announcement: 'fan',
      metric: 'barChart',
      award: 'ribbon',
      event: 'calendar',
    };
    return map[this.post().type] ?? 'documentText';
  });

  protected readonly feedPostData = computed<FeedItemPost>(() => {
    const post = this.post();
    const fallbackMedia: FeedMedia[] = [];

    if (post.media?.length) {
      fallbackMedia.push(...post.media);
    } else if (post.mediaUrl || post.thumbnailUrl || post.iframeUrl) {
      const type = post.type === 'video' ? 'video' : 'image';
      fallbackMedia.push({
        id: `${post.id}-media-0`,
        type,
        // For video: iframeUrl is the primary renderable URL (Cloudflare Stream player)
        url:
          type === 'video'
            ? (post.iframeUrl ?? post.mediaUrl ?? post.thumbnailUrl ?? '')
            : (post.mediaUrl ?? post.thumbnailUrl ?? ''),
        thumbnailUrl: post.thumbnailUrl,
        duration: post.duration,
        iframeUrl: post.iframeUrl,
        hlsUrl: post.hlsUrl,
        cloudflareVideoId: post.cloudflareVideoId,
        processingStatus: post.processingStatus as FeedVideoProcessingStatus | undefined,
        altText: post.title ?? undefined,
      });
    }

    const normalizedPostType = this.normalizePostType(post.type);
    const derivedContent = post.content ?? post.body;
    const externalSource: FeedExternalSource | undefined =
      post.externalSource ??
      (post.externalLink
        ? {
            platform: 'External',
            label: 'External Source',
            originalUrl: post.externalLink,
          }
        : undefined);

    return {
      id: post.id,
      feedType: 'POST',
      postType: normalizedPostType,
      title: post.title,
      content: derivedContent,
      media: fallbackMedia,
      location: post.location,
      externalSource,
      postTags: post.postTags,
      embeds: post.embeds,
      isPinned: !!post.isPinned,
      createdAt: post.createdAt,
      updatedAt: post.createdAt,
      author: {
        uid: 'post-detail-overlay',
        profileCode: '',
        displayName: this.author().name,
        firstName: '',
        lastName: '',
        avatarUrl: this.author().avatarUrl,
      },
      engagement: {
        likeCount: 0,
        commentCount: 0,
        shareCount: post.shareCount ?? 0,
        viewCount: post.viewCount ?? 0,
        saveCount: 0,
      },
    };
  });

  protected readonly durationLabel = computed(() => {
    const dur = this.post().duration;
    if (!dur) return '';
    const totalSeconds = Math.max(0, Math.floor(dur));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
  });

  // ─── HANDLERS ───

  protected onClose(): void {
    this.close.emit();
  }

  private normalizePostType(type: string): FeedPostType {
    switch (type) {
      case 'stat':
        return 'stats';
      case 'metric':
        return 'metrics';
      case 'announcement':
        return 'news';
      case 'news':
      case 'video':
      case 'image':
      case 'text':
      case 'offer':
      case 'award':
      case 'camp':
      case 'visit':
      case 'game':
      case 'schedule':
        return type;
      default:
        return 'text';
    }
  }
}
