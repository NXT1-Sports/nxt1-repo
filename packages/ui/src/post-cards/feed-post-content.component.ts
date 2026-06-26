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
  OnDestroy,
  input,
  output,
  computed,
  signal,
  inject,
  SecurityContext,
  ElementRef,
} from '@angular/core';
import { DomSanitizer, type SafeHtml, type SafeResourceUrl } from '@angular/platform-browser';
import type Hls from 'hls.js';
import type { ErrorData } from 'hls.js';
import type { FeedItemPost, FeedAuthor, FeedMedia } from '@nxt1/core';
import { FEED_CARD_TEST_IDS } from '@nxt1/core/testing';
import { NxtImageComponent } from '../components/image';
import { NxtIconComponent } from '../components/icon';
import { NxtAvatarComponent } from '../components/avatar';
import { LinkEmbedComponent, type LinkEmbedData } from '../components/link-embed';
import { NxtVideoControlsComponent } from '../components/video-controls';
import { NxtMediaViewerService, type MediaViewerItem } from '../components/media-viewer';

const MAX_VISIBLE_TAGS = 5;
type FeedPostContentMode = 'full' | 'media' | 'body';
type FeedPostVideoControlsMode = 'default' | 'compact';
type FeedVideoPlaybackState = {
  readonly currentTime: number;
  readonly duration: number;
  readonly isPlaying: boolean;
  readonly playbackRate: number;
};

@Component({
  selector: 'nxt1-feed-post-content',
  standalone: true,
  imports: [
    NxtImageComponent,
    NxtIconComponent,
    NxtAvatarComponent,
    LinkEmbedComponent,
    NxtVideoControlsComponent,
  ],
  template: `
    <!-- Media Carousel -->
    @if (showMedia()) {
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
                  fit="contain"
                  [width]="getMediaWidth(media)"
                  [height]="getMediaHeight(media)"
                  [useNgOptimizedImage]="false"
                />
              } @else if (media.type === 'video') {
                @if (media.processingStatus && media.processingStatus !== 'ready') {
                  <!-- Video is processing or failed in Cloudflare -->
                  <div
                    class="post-content__video-processing"
                    [class.post-content__video-processing--error]="
                      media.processingStatus === 'error'
                    "
                  >
                    <div class="post-content__video-processing-inner">
                      <nxt1-icon name="videocam" [size]="32" />
                      <span>{{ getVideoStatusMessage(media.processingStatus) }}</span>
                    </div>
                  </div>
                } @else {
                  @if (media.thumbnailUrl) {
                    <nxt1-image
                      [src]="media.thumbnailUrl"
                      [alt]="media.altText || 'Video thumbnail'"
                      fit="contain"
                      [width]="getMediaWidth(media)"
                      [height]="getMediaHeight(media)"
                      [useNgOptimizedImage]="false"
                    />
                  } @else {
                    <div class="post-content__video-placeholder">
                      <nxt1-icon name="videocam" [size]="48" />
                    </div>
                  }
                  @if (shouldRenderNativeVideoPlayer(media)) {
                    <div class="post-content__video-native-shell">
                      <video
                        class="post-content__video-native"
                        [attr.data-feed-media-id]="media.id"
                        [poster]="media.thumbnailUrl || null"
                        crossorigin="anonymous"
                        playsinline
                        preload="auto"
                        (loadedmetadata)="onNativeVideoLoadedMetadata(media.id, $event)"
                        (timeupdate)="onNativeVideoTimeUpdate(media.id, $event)"
                        (play)="onNativeVideoPlay(media.id)"
                        (pause)="onNativeVideoPause(media.id)"
                        (ended)="onNativeVideoPause(media.id)"
                        (seeked)="onNativeVideoSeeked(media.id, $event)"
                        (error)="onNativeVideoError(media)"
                      ></video>

                      <div class="post-content__video-controls-overlay">
                        <nxt1-video-controls
                          [isPlaying]="isNativeVideoPlaying(media.id)"
                          [currentTime]="getNativeVideoCurrentTime(media.id)"
                          [duration]="getNativeVideoDuration(media.id)"
                          [playbackRate]="getNativeVideoPlaybackRate(media.id)"
                          [showSpeedControls]="true"
                          [showFullscreen]="true"
                          [showAdvancedPlaybackControls]="showInlineAdvancedPlaybackControls()"
                          [showDurationBadge]="true"
                          [allowTransportCollapse]="allowInlineTransportCollapse()"
                          (playPause)="toggleNativeVideoPlayPause(media.id)"
                          (seekRelative)="onNativeVideoSeekRelative(media.id, $event)"
                          (seekChange)="onNativeVideoSeekChange(media.id, $event)"
                          (seekStart)="onNativeVideoSeekStart(media.id)"
                          (seekEnd)="onNativeVideoSeekEnd(media.id)"
                          (playbackRateChange)="onNativeVideoPlaybackRateChange(media.id, $event)"
                          (fullscreenToggle)="toggleNativeVideoFullscreen(media.id)"
                        />
                      </div>
                    </div>
                  } @else if (shouldRenderIframeVideoPlayer(media)) {
                    <iframe
                      class="post-content__video-iframe"
                      [class.post-content__video-iframe--loaded]="isVideoIframeReady(media.id)"
                      [src]="getSafeIframeUrl(getVideoPlayerUrl(media))"
                      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                      allowfullscreen
                      frameborder="0"
                      (load)="markVideoIframeReady(media.id)"
                    ></iframe>
                    @if (!isVideoIframeReady(media.id)) {
                      <div class="post-content__video-loading" aria-hidden="true">
                        <div class="post-content__video-loading-spinner"></div>
                      </div>
                    }
                  } @else {
                    <button
                      type="button"
                      class="post-content__video-overlay"
                      [attr.aria-label]="'Play video' + (media.altText ? ': ' + media.altText : '')"
                      (click)="activateVideo(media.id, $event)"
                    >
                      <nxt1-icon name="playCircle" [size]="48" />
                    </button>
                    @if (media.duration) {
                      <span class="post-content__video-duration">{{
                        formatDuration(media.duration)
                      }}</span>
                    }
                  }
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

    <!-- Author Row (rendered between media and body when author is provided) -->
    @if (author() && showBody()) {
      <div class="post-content__author-row">
        <button
          type="button"
          class="post-content__author-avatar-btn"
          (click)="handleAuthorClick($event)"
          [attr.aria-label]="'View ' + author()!.displayName + ' profile'"
        >
          <nxt1-avatar [src]="author()!.avatarUrl" [name]="author()!.displayName" size="md" />
        </button>
        <div class="post-content__author-info" (click)="handleAuthorClick($event)">
          <span class="post-content__author-name">{{ author()!.displayName }}</span>
          @if (createdAt()) {
            <span class="post-content__author-time">{{ formatRelativeTime(createdAt()!) }}</span>
          }
        </div>
        @if (showMenu()) {
          <button
            type="button"
            class="post-content__menu-btn"
            (click)="handleMenuClick($event)"
            aria-label="Post options"
          >
            <nxt1-icon name="moreHorizontal" [size]="20" />
          </button>
        }
      </div>
    }

    <!-- Title -->
    @if (showBody() && data().title) {
      <h3 class="post-content__title" [attr.data-testid]="testIds.POST_TITLE">
        {{ data().title }}
      </h3>
    }

    <!-- Text Content -->
    @if (showBody() && data().content) {
      <p
        class="post-content__text"
        [attr.data-testid]="testIds.POST_CONTENT"
        [innerHTML]="sanitizedContent()"
      ></p>
    }

    <!-- External Source -->
    @if (showBody() && data().externalSource) {
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
    @if (showBody() && hasTags()) {
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
    @if (showBody() && data().location) {
      <div class="post-content__location" [attr.data-testid]="testIds.POST_LOCATION">
        <nxt1-icon name="location" [size]="14" />
        <span>{{ data().location }}</span>
      </div>
    }

    <!-- Link Embeds (news articles linked within post) -->
    @if (showBody() && hasEmbeds()) {
      <div class="post-content__embeds">
        @for (embed of embedItems(); track embed.url ?? embed.title) {
          <nxt1-link-embed [data]="embed" />
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        --post-content-media-height: 320px;
      }

      /* Media */
      .post-content__media {
        position: relative;
        margin: 0 -16px 14px;
      }

      .post-content__media-track {
        display: flex;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        -ms-overflow-style: none;
        background: #000;
        &::-webkit-scrollbar {
          display: none;
        }
      }

      .post-content__media-slide {
        flex: 0 0 100%;
        scroll-snap-align: start;
        position: relative;
        height: var(--post-content-media-height);
        background: #000;
        overflow: hidden;
      }

      .post-content__media-slide nxt1-image {
        display: block;
        width: 100%;
        height: 100%;
        background: #000;
      }

      :host ::ng-deep .post-content__media-slide nxt1-image img {
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        object-position: center;
      }

      @media (max-width: 768px) {
        :host {
          --post-content-media-height: 260px;
        }
      }

      .post-content__video-placeholder {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .post-content__video-placeholder--loading {
        background: #000;
      }

      .post-content__video-processing {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
      }

      .post-content__video-processing-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-size: 13px;
        font-weight: 500;
      }

      .post-content__video-processing--error .post-content__video-processing-inner {
        color: var(--nxt1-color-danger, #ff6b6b);
      }

      .post-content__video-iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: none;
        background: #000;
        opacity: 0;
        transition: opacity 0.18s ease;
      }

      .post-content__video-native-shell {
        position: absolute;
        inset: 0;
        background: #000;
      }

      .post-content__video-native {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        background: #000;
        object-fit: contain;
      }

      .post-content__video-controls-overlay {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 3;
        padding: 10px;
        background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.82) 100%);
      }

      .post-content__video-iframe--loaded {
        opacity: 1;
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
        border: none;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        &:hover {
          opacity: 1;
        }
      }

      .post-content__video-loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.24);
        pointer-events: none;
      }

      .post-content__video-loading-spinner {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 3px solid rgba(255, 255, 255, 0.22);
        border-top-color: rgba(255, 255, 255, 0.92);
        animation: post-content-video-spin 0.8s linear infinite;
      }

      @keyframes post-content-video-spin {
        from {
          transform: rotate(0deg);
        }

        to {
          transform: rotate(360deg);
        }
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

      /* Author Row */
      .post-content__author-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 0 4px;
      }

      .post-content__author-avatar-btn {
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        flex-shrink: 0;
      }

      .post-content__author-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
        cursor: pointer;
      }

      .post-content__author-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .post-content__author-time {
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .post-content__menu-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        border-radius: 50%;
        transition: background 0.15s ease;
        flex-shrink: 0;
        &:hover {
          background: rgba(255, 255, 255, 0.08);
        }
      }

      /* Title */
      .post-content__title {
        font-size: 16px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 4px;
      }

      /* Text */
      .post-content__text {
        font-size: 14px;
        line-height: 1.6;
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

      .post-content__embeds {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 12px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedPostContentComponent implements OnDestroy {
  private static readonly FALLBACK_MEDIA_WIDTH = 1200;
  private static readonly FALLBACK_MEDIA_HEIGHT = 675;
  private static readonly VIDEO_IFRAME_REVEAL_DELAY_MS = 180;

  readonly data = input.required<FeedItemPost>();
  readonly mode = input<FeedPostContentMode>('full');
  readonly videoControlsMode = input<FeedPostVideoControlsMode>('default');
  readonly author = input<FeedAuthor>();
  readonly createdAt = input<string>();
  readonly showMenu = input(false);

  readonly authorClick = output<FeedAuthor>();
  readonly menuClick = output<void>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly mediaViewer = inject(NxtMediaViewerService);
  private readonly safeIframeUrls = new Map<string, SafeResourceUrl>();
  private readonly pendingVideoIframeReveal = new Set<string>();
  private readonly nativeVideoSourceUrls = new Map<string, string>();
  private readonly nativeVideoHls = new Map<string, Hls>();
  private readonly scrubbingMediaIds = new Set<string>();
  private readonly resumeAfterScrubMediaIds = new Set<string>();
  private readonly smoothProgressFrameIds = new Map<string, number>();
  private readonly pendingSeekFrameIds = new Map<string, number>();
  private readonly pendingSeekTimes = new Map<string, number>();
  private hlsConstructor: typeof Hls | null = null;
  private hlsLoadPromise: Promise<typeof Hls | null> | null = null;
  protected readonly testIds = FEED_CARD_TEST_IDS;
  protected readonly activeMediaIndex = signal(0);
  /** Tracks which video slide is "playing" by media ID. null = thumbnail shown. */
  protected readonly activeVideoSlide = signal<string | null>(null);
  /** Tracks which embedded video iframes have painted and can replace the poster. */
  protected readonly videoIframeReady = signal<Record<string, true>>({});
  protected readonly nativeVideoPlaybackState = signal<Record<string, FeedVideoPlaybackState>>({});
  protected readonly cloudflareNativePlaybackFailed = signal<Record<string, true>>({});

  protected readonly hasMedia = computed(() => this.data().media.length > 0);
  protected readonly showMedia = computed(() => {
    const mode = this.mode();
    return this.hasMedia() && (mode === 'full' || mode === 'media');
  });
  protected readonly showBody = computed(() => {
    const mode = this.mode();
    return mode === 'full' || mode === 'body';
  });

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

  protected readonly hasEmbeds = computed(() => (this.data().embeds?.length ?? 0) > 0);

  protected readonly isCompactInlineVideoControls = computed(
    () => this.videoControlsMode() === 'compact'
  );

  protected readonly showInlineAdvancedPlaybackControls = computed(
    () => !this.isCompactInlineVideoControls()
  );

  protected readonly allowInlineTransportCollapse = computed(
    () => !this.isCompactInlineVideoControls()
  );

  protected readonly embedItems = computed<LinkEmbedData[]>(() =>
    (this.data().embeds ?? []).map((e) => ({
      url: e.articleUrl,
      title: e.headline,
      excerpt: e.excerpt,
      imageUrl: e.imageUrl,
      source: e.source,
      sourceLogoUrl: e.sourceLogoUrl,
      publishedAt: e.publishedAt,
    }))
  );

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
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  protected getVideoStatusMessage(status: string | undefined): string {
    switch (status) {
      case 'error':
        return 'Video failed to process';
      case 'queued':
      case 'pendingupload':
      case 'inprogress':
      default:
        return 'Video processing…';
    }
  }

  protected handleAuthorClick(event: Event): void {
    event.stopPropagation();
    const a = this.author();
    if (a) this.authorClick.emit(a);
  }

  protected handleMenuClick(event: Event): void {
    event.stopPropagation();
    this.menuClick.emit();
  }

  ngOnDestroy(): void {
    this.stopAllSmoothProgressTracking();
    this.cancelAllPendingVideoSeeks();

    for (const mediaId of this.nativeVideoHls.keys()) {
      this.destroyNativeVideoHls(mediaId);
    }
  }

  protected activateVideo(mediaId: string, event: Event): void {
    event.stopPropagation();

    const previousMediaId = this.activeVideoSlide();
    if (previousMediaId && previousMediaId !== mediaId) {
      this.stopSmoothProgressTracking(previousMediaId);
      this.cancelPendingVideoSeek(previousMediaId);
      this.scrubbingMediaIds.delete(previousMediaId);
      this.resumeAfterScrubMediaIds.delete(previousMediaId);
      this.destroyNativeVideoHls(previousMediaId);
      this.nativeVideoSourceUrls.delete(previousMediaId);
    }

    this.activeVideoSlide.set(mediaId);
    this.scheduleNativeVideoSourceSync(mediaId);
  }

  protected isVideoIframeReady(mediaId: string): boolean {
    return this.videoIframeReady()[mediaId] === true;
  }

  protected markVideoIframeReady(mediaId: string): void {
    if (this.videoIframeReady()[mediaId] === true || this.pendingVideoIframeReveal.has(mediaId)) {
      return;
    }

    this.pendingVideoIframeReveal.add(mediaId);

    setTimeout(() => {
      this.pendingVideoIframeReveal.delete(mediaId);

      this.videoIframeReady.update((current) => {
        if (current[mediaId]) return current;
        return { ...current, [mediaId]: true };
      });
    }, FeedPostContentComponent.VIDEO_IFRAME_REVEAL_DELAY_MS);
  }

  protected shouldRenderVideoPlayer(media: FeedMedia): boolean {
    return this.activeVideoSlide() === this.getMediaIndex(media.id);
  }

  protected shouldRenderNativeVideoPlayer(media: FeedMedia): boolean {
    return this.shouldRenderVideoPlayer(media) && this.resolveNativeVideoUrl(media) !== null;
  }

  protected shouldRenderIframeVideoPlayer(media: FeedMedia): boolean {
    return this.shouldRenderVideoPlayer(media) && this.resolveNativeVideoUrl(media) === null;
  }

  protected getMediaIndex(mediaId: string): string {
    return mediaId;
  }

  protected getMediaWidth(media: FeedMedia): number {
    return media.width && media.width > 0
      ? media.width
      : FeedPostContentComponent.FALLBACK_MEDIA_WIDTH;
  }

  protected getMediaHeight(media: FeedMedia): number {
    return media.height && media.height > 0
      ? media.height
      : FeedPostContentComponent.FALLBACK_MEDIA_HEIGHT;
  }

  protected getVideoPlayerUrl(media: FeedMedia): string {
    const baseUrl = this.resolveVideoIframeBaseUrl(media);
    return this.withVideoPlayerParams(baseUrl, this.shouldRenderVideoPlayer(media));
  }

  protected isNativeVideoPlaying(mediaId: string): boolean {
    return this.getNativeVideoPlaybackState(mediaId).isPlaying;
  }

  protected getNativeVideoCurrentTime(mediaId: string): number {
    return this.getNativeVideoPlaybackState(mediaId).currentTime;
  }

  protected getNativeVideoDuration(mediaId: string): number {
    return this.getNativeVideoPlaybackState(mediaId).duration;
  }

  protected getNativeVideoPlaybackRate(mediaId: string): number {
    return this.getNativeVideoPlaybackState(mediaId).playbackRate;
  }

  protected onNativeVideoLoadedMetadata(mediaId: string, event: Event): void {
    const video = event.target as HTMLVideoElement | null;
    if (!video) return;

    this.updateNativeVideoPlaybackState(mediaId, {
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      playbackRate: video.playbackRate || 1,
    });

    if (!video.paused && !video.ended) {
      this.startSmoothProgressTracking(mediaId);
    }
  }

  protected onNativeVideoTimeUpdate(mediaId: string, event: Event): void {
    const video = event.target as HTMLVideoElement | null;
    if (!video) return;
    if (this.scrubbingMediaIds.has(mediaId)) return;

    this.updateNativeVideoPlaybackState(mediaId, {
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    });

    if (!video.paused && !video.ended) {
      this.startSmoothProgressTracking(mediaId);
    }
  }

  protected onNativeVideoPlay(mediaId: string): void {
    this.updateNativeVideoPlaybackState(mediaId, { isPlaying: true });

    const video = this.getNativeVideoElement(mediaId);
    if (video && !video.paused && !video.ended) {
      this.startSmoothProgressTracking(mediaId);
    }
  }

  protected onNativeVideoPause(mediaId: string): void {
    this.stopSmoothProgressTracking(mediaId);
    this.updateNativeVideoPlaybackState(mediaId, { isPlaying: false });

    const video = this.getNativeVideoElement(mediaId);
    if (video) {
      this.updateNativeVideoPlaybackState(mediaId, { currentTime: video.currentTime || 0 });
    }
  }

  protected onNativeVideoSeeked(mediaId: string, event: Event): void {
    const video = event.target as HTMLVideoElement | null;
    if (!video) return;

    this.updateNativeVideoPlaybackState(mediaId, {
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    });

    if (!this.scrubbingMediaIds.has(mediaId) && !video.paused && !video.ended) {
      this.startSmoothProgressTracking(mediaId);
    }
  }

  protected onNativeVideoError(media: FeedMedia): void {
    this.stopSmoothProgressTracking(media.id);
    this.cancelPendingVideoSeek(media.id);
    this.scrubbingMediaIds.delete(media.id);
    this.resumeAfterScrubMediaIds.delete(media.id);
    this.destroyNativeVideoHls(media.id);
    this.nativeVideoSourceUrls.delete(media.id);

    if (!this.isCloudflarePlaybackMedia(media)) {
      return;
    }

    this.cloudflareNativePlaybackFailed.update((current) => {
      if (current[media.id]) return current;
      return { ...current, [media.id]: true };
    });
  }

  protected toggleNativeVideoPlayPause(mediaId: string): void {
    const video = this.getNativeVideoElement(mediaId);
    if (!video) return;

    if (video.paused) {
      void video.play().catch(() => undefined);
      return;
    }

    video.pause();
  }

  protected onNativeVideoSeekRelative(mediaId: string, deltaSeconds: number): void {
    const video = this.getNativeVideoElement(mediaId);
    if (!video) return;

    const nextTime = this.clampVideoTime(video.currentTime + deltaSeconds, video.duration);
    this.seekVideoTo(mediaId, video, nextTime);
  }

  protected onNativeVideoSeekChange(mediaId: string, nextTime: number): void {
    const video = this.getNativeVideoElement(mediaId);
    if (!video) return;

    if (this.scrubbingMediaIds.has(mediaId)) {
      this.pendingSeekTimes.set(mediaId, nextTime);

      if (!this.pendingSeekFrameIds.has(mediaId) && typeof requestAnimationFrame !== 'undefined') {
        const frameId = requestAnimationFrame(() => {
          this.pendingSeekFrameIds.delete(mediaId);
          const pendingTime = this.pendingSeekTimes.get(mediaId);
          if (pendingTime === undefined) return;

          this.pendingSeekTimes.delete(mediaId);
          this.seekVideoTo(mediaId, video, pendingTime);
        });

        this.pendingSeekFrameIds.set(mediaId, frameId);
      } else if (typeof requestAnimationFrame === 'undefined') {
        this.pendingSeekTimes.delete(mediaId);
        this.seekVideoTo(mediaId, video, nextTime);
      }

      return;
    }

    this.seekVideoTo(mediaId, video, nextTime);
  }

  protected onNativeVideoSeekStart(mediaId: string): void {
    const video = this.getNativeVideoElement(mediaId);
    this.scrubbingMediaIds.add(mediaId);
    this.stopSmoothProgressTracking(mediaId);

    if (video && !video.paused && !video.ended) {
      this.resumeAfterScrubMediaIds.add(mediaId);
      video.pause();
      return;
    }

    this.resumeAfterScrubMediaIds.delete(mediaId);
  }

  protected onNativeVideoSeekEnd(mediaId: string): void {
    const video = this.getNativeVideoElement(mediaId);
    if (video) {
      this.flushPendingVideoSeek(mediaId, video);
    }

    this.scrubbingMediaIds.delete(mediaId);
    if (!video) {
      this.resumeAfterScrubMediaIds.delete(mediaId);
      return;
    }

    this.updateNativeVideoPlaybackState(mediaId, { currentTime: video.currentTime || 0 });

    if (this.resumeAfterScrubMediaIds.has(mediaId)) {
      this.resumeAfterScrubMediaIds.delete(mediaId);
      this.updateNativeVideoPlaybackState(mediaId, { isPlaying: true });

      void this.playVideoWhenReady(video).then((played) => {
        this.updateNativeVideoPlaybackState(mediaId, {
          isPlaying: played && !video.paused && !video.ended,
        });

        if (played && !video.paused && !video.ended) {
          this.startSmoothProgressTracking(mediaId);
        }
      });

      return;
    }

    this.updateNativeVideoPlaybackState(mediaId, { isPlaying: !video.paused && !video.ended });
    if (!video.paused && !video.ended) {
      this.startSmoothProgressTracking(mediaId);
    }
  }

  protected onNativeVideoPlaybackRateChange(mediaId: string, nextRate: number): void {
    const video = this.getNativeVideoElement(mediaId);
    if (!video) return;

    video.playbackRate = nextRate;
    this.updateNativeVideoPlaybackState(mediaId, { playbackRate: nextRate });
  }

  protected toggleNativeVideoFullscreen(mediaId: string): void {
    const video = this.getNativeVideoElement(mediaId);
    video?.pause();
    this.stopSmoothProgressTracking(mediaId);
    this.updateNativeVideoPlaybackState(mediaId, { isPlaying: false });
    void this.openMediaViewer(mediaId);
  }

  /**
   * Bypasses Angular's URL sanitization for trusted Cloudflare Stream iframe URLs.
   * Only called for iframeUrl values constructed by the backend from CF's own CDN.
   */
  protected getSafeIframeUrl(iframeUrl: string): SafeResourceUrl {
    const cached = this.safeIframeUrls.get(iframeUrl);
    if (cached) return cached;

    const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(iframeUrl);
    this.safeIframeUrls.set(iframeUrl, safeUrl);
    return safeUrl;
  }

  private resolveVideoIframeBaseUrl(media: FeedMedia): string {
    const cloudflareVideoId = media.cloudflareVideoId?.trim();
    if (cloudflareVideoId) {
      return `https://iframe.videodelivery.net/${cloudflareVideoId}`;
    }

    const candidateUrl = media.iframeUrl?.trim() || media.url;

    try {
      const parsed = new URL(candidateUrl);
      if (parsed.hostname === 'iframe.videodelivery.net') return parsed.toString();

      if (parsed.hostname === 'watch.cloudflarestream.com') {
        const videoId = parsed.pathname.split('/').filter(Boolean)[0];
        return videoId ? `https://iframe.videodelivery.net/${videoId}` : candidateUrl;
      }

      if (
        parsed.hostname.endsWith('.cloudflarestream.com') &&
        parsed.pathname.endsWith('/iframe')
      ) {
        return parsed.toString();
      }
    } catch {
      return candidateUrl;
    }

    return candidateUrl;
  }

  private resolveNativeVideoUrl(media: FeedMedia): string | null {
    if (this.cloudflareNativePlaybackFailed()[media.id] && this.isCloudflarePlaybackMedia(media)) {
      return null;
    }

    const hlsUrl = media.hlsUrl?.trim();
    if (hlsUrl) return hlsUrl;

    const cloudflareVideoId = media.cloudflareVideoId?.trim();
    if (cloudflareVideoId) {
      return this.buildCloudflareHlsUrl(cloudflareVideoId, media.url || media.iframeUrl);
    }

    const candidateUrl = media.url?.trim() || media.iframeUrl?.trim();
    if (!candidateUrl) return null;

    try {
      const parsed = new URL(candidateUrl);
      if (this.isHlsSourceUrl(candidateUrl)) return candidateUrl;

      if (parsed.hostname === 'watch.cloudflarestream.com') {
        const videoId = parsed.pathname.split('/').filter(Boolean)[0];
        return videoId ? this.buildCloudflareHlsUrl(videoId) : null;
      }

      if (parsed.hostname === 'iframe.videodelivery.net') {
        const videoId = parsed.pathname.split('/').filter(Boolean)[0];
        return videoId ? this.buildCloudflareHlsUrl(videoId) : null;
      }

      if (parsed.hostname.endsWith('.cloudflarestream.com')) {
        const videoId = parsed.pathname.split('/').filter(Boolean)[0];
        return videoId ? `${parsed.origin}/${videoId}/manifest/video.m3u8` : null;
      }

      if (parsed.hostname.endsWith('.videodelivery.net')) {
        const videoId = parsed.pathname.split('/').filter(Boolean)[0];
        return videoId ? this.buildCloudflareHlsUrl(videoId) : null;
      }

      return candidateUrl;
    } catch {
      return candidateUrl;
    }
  }

  private scheduleNativeVideoSourceSync(mediaId: string): void {
    setTimeout(() => {
      void this.configureNativeVideoSource(mediaId);
    }, 0);
  }

  private async configureNativeVideoSource(mediaId: string): Promise<void> {
    const media = this.data().media.find((candidate) => candidate.id === mediaId);
    if (!media) return;

    const player = this.getNativeVideoElement(mediaId);
    const videoUrl = this.resolveNativeVideoUrl(media);
    if (!player || !videoUrl) return;
    if (this.nativeVideoSourceUrls.get(mediaId) === videoUrl) return;

    this.destroyNativeVideoHls(mediaId);
    this.nativeVideoSourceUrls.set(mediaId, videoUrl);
    player.crossOrigin = 'anonymous';
    player.preload = 'auto';

    if (this.isHlsSourceUrl(videoUrl) && !player.canPlayType('application/vnd.apple.mpegurl')) {
      const HlsConstructor = await this.loadHlsConstructor();
      if (!HlsConstructor?.isSupported()) {
        this.onNativeVideoError(media);
        return;
      }

      const hls = new HlsConstructor({ enableWorker: true });
      this.nativeVideoHls.set(mediaId, hls);

      hls.on(HlsConstructor.Events.MEDIA_ATTACHED, () => {
        if (this.nativeVideoHls.get(mediaId) !== hls) return;
        hls.loadSource(videoUrl);
      });

      hls.on(HlsConstructor.Events.ERROR, (_event: string, data: ErrorData) => {
        if (data.fatal) {
          this.onNativeVideoError(media);
        }
      });

      hls.attachMedia(player);
      return;
    }

    player.src = videoUrl;
    player.load();
  }

  private async loadHlsConstructor(): Promise<typeof Hls | null> {
    if (this.hlsConstructor) return this.hlsConstructor;

    this.hlsLoadPromise ??= import('hls.js')
      .then((module) => {
        this.hlsConstructor = module.default;
        return module.default;
      })
      .catch(() => null);

    return this.hlsLoadPromise;
  }

  private destroyNativeVideoHls(mediaId: string): void {
    const hls = this.nativeVideoHls.get(mediaId);
    if (!hls) return;

    hls.destroy();
    this.nativeVideoHls.delete(mediaId);
  }

  private buildCloudflareHlsUrl(videoId: string, sourceUrl?: string): string {
    const normalizedVideoId = videoId.trim();

    try {
      const parsed = sourceUrl ? new URL(sourceUrl) : null;
      if (
        parsed &&
        parsed.hostname.endsWith('.cloudflarestream.com') &&
        parsed.hostname !== 'watch.cloudflarestream.com'
      ) {
        return `${parsed.origin}/${normalizedVideoId}/manifest/video.m3u8`;
      }
    } catch {
      // Fall back to the global Stream delivery host.
    }

    return `https://videodelivery.net/${encodeURIComponent(normalizedVideoId)}/manifest/video.m3u8`;
  }

  private isCloudflarePlaybackMedia(media: FeedMedia): boolean {
    if (media.cloudflareVideoId?.trim()) return true;

    const candidateUrl = media.iframeUrl?.trim() || media.url?.trim();
    if (!candidateUrl) return false;

    try {
      const parsed = new URL(candidateUrl);
      return (
        parsed.hostname === 'watch.cloudflarestream.com' ||
        parsed.hostname === 'iframe.videodelivery.net' ||
        parsed.hostname.endsWith('.cloudflarestream.com') ||
        parsed.hostname.endsWith('.videodelivery.net')
      );
    } catch {
      return false;
    }
  }

  private isHlsSourceUrl(url: string): boolean {
    return /\.m3u8($|\?)/i.test(url);
  }

  private withVideoPlayerParams(url: string, autoplay: boolean): string {
    try {
      const parsed = new URL(url);

      if (autoplay) {
        parsed.searchParams.set('autoplay', 'true');
      } else {
        parsed.searchParams.delete('autoplay');
      }

      return parsed.toString();
    } catch {
      return url;
    }
  }

  private getNativeVideoElement(mediaId: string): HTMLVideoElement | null {
    return this.hostElement.nativeElement.querySelector<HTMLVideoElement>(
      `video[data-feed-media-id="${mediaId}"]`
    );
  }

  private seekVideoTo(mediaId: string, video: HTMLVideoElement, nextTime: number): void {
    const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
    const target = Math.max(0, Math.min(nextTime, duration));

    video.currentTime = target;
    const committedTime = Number.isFinite(video.currentTime) ? video.currentTime : target;
    this.updateNativeVideoPlaybackState(mediaId, { currentTime: committedTime });

    if (video.ended && duration > 0 && committedTime >= duration) {
      video.currentTime = Math.max(0, duration - 0.1);
    }
  }

  private flushPendingVideoSeek(mediaId: string, video: HTMLVideoElement): void {
    const pendingFrameId = this.pendingSeekFrameIds.get(mediaId);
    if (pendingFrameId !== undefined && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(pendingFrameId);
    }

    this.pendingSeekFrameIds.delete(mediaId);
    const pendingTime = this.pendingSeekTimes.get(mediaId);
    if (pendingTime !== undefined) {
      this.pendingSeekTimes.delete(mediaId);
      this.seekVideoTo(mediaId, video, pendingTime);
    }
  }

  private cancelPendingVideoSeek(mediaId: string): void {
    const pendingFrameId = this.pendingSeekFrameIds.get(mediaId);
    if (pendingFrameId !== undefined && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(pendingFrameId);
    }

    this.pendingSeekFrameIds.delete(mediaId);
    this.pendingSeekTimes.delete(mediaId);
  }

  private cancelAllPendingVideoSeeks(): void {
    for (const mediaId of this.pendingSeekFrameIds.keys()) {
      this.cancelPendingVideoSeek(mediaId);
    }
  }

  private async playVideoWhenReady(video: HTMLVideoElement): Promise<boolean> {
    try {
      await video.play();
      return true;
    } catch {
      if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 500);
          video.addEventListener(
            'canplay',
            () => {
              clearTimeout(timeout);
              resolve();
            },
            { once: true }
          );
        });
      }

      try {
        await video.play();
        return true;
      } catch {
        return false;
      }
    }
  }

  private async openMediaViewer(mediaId: string): Promise<void> {
    const mediaItems = this.buildMediaViewerItems();
    if (!mediaItems.length) return;

    const initialIndex = Math.max(
      0,
      this.data().media.findIndex((media) => media.id === mediaId)
    );

    await this.mediaViewer.open({
      items: mediaItems,
      initialIndex,
      source: 'feed-post',
      presentation: 'overlay',
    });
  }

  private buildMediaViewerItems(): MediaViewerItem[] {
    const items: MediaViewerItem[] = [];

    for (const media of this.data().media) {
      if (media.type === 'video') {
        const url = media.hlsUrl?.trim() || media.iframeUrl?.trim() || media.url?.trim();
        if (!url) continue;

        items.push({
          url,
          type: 'video',
          alt: media.altText,
          ...(media.thumbnailUrl ? { poster: media.thumbnailUrl } : {}),
        });
        continue;
      }

      if (media.type === 'image' || media.type === 'gif') {
        const url = media.url?.trim();
        if (!url) continue;

        items.push({
          url,
          type: 'image',
          alt: media.altText,
        });
      }
    }

    return items;
  }

  private getNativeVideoPlaybackState(mediaId: string): FeedVideoPlaybackState {
    return (
      this.nativeVideoPlaybackState()[mediaId] ?? {
        currentTime: 0,
        duration: 0,
        isPlaying: false,
        playbackRate: 1,
      }
    );
  }

  private updateNativeVideoPlaybackState(
    mediaId: string,
    patch: Partial<FeedVideoPlaybackState>
  ): void {
    this.nativeVideoPlaybackState.update((current) => ({
      ...current,
      [mediaId]: {
        ...this.getNativeVideoPlaybackState(mediaId),
        ...patch,
      },
    }));
  }

  private clampVideoTime(nextTime: number, duration: number): number {
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    return Math.max(0, Math.min(nextTime, safeDuration));
  }

  private startSmoothProgressTracking(mediaId: string): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (this.smoothProgressFrameIds.has(mediaId) || this.scrubbingMediaIds.has(mediaId)) return;

    const step = (): void => {
      const video = this.getNativeVideoElement(mediaId);
      if (!video || this.scrubbingMediaIds.has(mediaId)) {
        this.stopSmoothProgressTracking(mediaId);
        return;
      }

      this.updateNativeVideoPlaybackState(mediaId, {
        currentTime: video.currentTime || 0,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      });

      if (!video.paused && !video.ended) {
        this.smoothProgressFrameIds.set(mediaId, requestAnimationFrame(step));
        return;
      }

      this.stopSmoothProgressTracking(mediaId);
    };

    this.smoothProgressFrameIds.set(mediaId, requestAnimationFrame(step));
  }

  private stopSmoothProgressTracking(mediaId: string): void {
    const frameId = this.smoothProgressFrameIds.get(mediaId);
    if (frameId === undefined) return;
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(frameId);
    }
    this.smoothProgressFrameIds.delete(mediaId);
  }

  private stopAllSmoothProgressTracking(): void {
    for (const mediaId of this.smoothProgressFrameIds.keys()) {
      this.stopSmoothProgressTracking(mediaId);
    }
  }

  protected formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
