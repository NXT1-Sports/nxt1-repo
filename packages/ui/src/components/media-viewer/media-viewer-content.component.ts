/**
 * @fileoverview NxtMediaViewerContentComponent — Full-screen media viewer
 * @module @nxt1/ui/components/media-viewer
 *
 * Presented via ModalController (Tier 3 — Full-Screen Modal).
 * Uses @Input() instead of signal input() because ModalController.create()
 * binds props via componentProps which does not support signal inputs.
 *
 * Features:
 * - CSS scroll-snap horizontal swipe (zero dependencies)
 * - Native <video> with controls
 * - Cinematic black backdrop (forced dark regardless of theme)
 * - Counter indicator ("2 / 5")
 * - Close & Share top-bar actions
 * - SSR-safe (all DOM access guarded)
 * - Full design-token integration
 * - data-testid attributes from @nxt1/core/testing
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  OnInit,
  inject,
  signal,
  computed,
  output,
  PLATFORM_ID,
  ElementRef,
  viewChild,
  afterNextRender,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import { TEST_IDS } from '@nxt1/core/testing';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { ANALYTICS_ADAPTER } from '../../services/analytics';
import type { MediaViewerItem } from './media-viewer.types';

@Component({
  selector: 'nxt1-media-viewer-content',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="media-viewer"
      [attr.data-testid]="testIds.CONTAINER"
      (keydown.escape)="dismiss()"
      (keydown.arrowLeft)="prev()"
      (keydown.arrowRight)="next()"
      tabindex="0"
    >
      <!-- Top bar -->
      <div class="top-bar">
        @if (showShare) {
          <button
            class="top-bar-btn share-btn"
            [attr.data-testid]="testIds.SHARE_BUTTON"
            (click)="share()"
            aria-label="Share media"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        } @else {
          <div class="top-bar-spacer"></div>
        }

        @if (showCounter && totalItems() > 1) {
          <span class="counter" [attr.data-testid]="testIds.COUNTER">
            {{ currentIndex() + 1 }} / {{ totalItems() }}
          </span>
        }

        <button
          class="top-bar-btn close-btn"
          [attr.data-testid]="testIds.CLOSE_BUTTON"
          (click)="dismiss()"
          aria-label="Close media viewer"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <!-- Media track (scroll-snap) -->
      <div
        class="media-track"
        #mediaTrack
        [attr.data-testid]="testIds.TRACK"
        (scroll)="onTrackScroll()"
      >
        @for (item of items; track item.url; let i = $index) {
          <div class="media-slide" [attr.data-testid]="testIds.SLIDE">
            @if (item.type === 'video') {
              <video
                class="media-video"
                [attr.data-testid]="testIds.VIDEO"
                [src]="item.url"
                [poster]="item.poster ?? ''"
                controls
                playsinline
                preload="metadata"
                (error)="onMediaError(i)"
              ></video>
            } @else if (item.type === 'doc') {
              <div class="doc-preview">
                <div
                  class="doc-preview__icon"
                  [style.background]="getDocColor(item.name, 0.12)"
                  [style.color]="getDocColor(item.name, 1)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    width="48"
                    height="48"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <span
                  class="doc-preview__ext"
                  [style.background]="getDocColor(item.name, 0.15)"
                  [style.color]="getDocColor(item.name, 1)"
                >
                  {{ getDocExt(item.name) }}
                </span>
                <h3 class="doc-preview__name">{{ item.name || 'Document' }}</h3>
                @if (item.size) {
                  <span class="doc-preview__size">{{ formatDocSize(item.size) }}</span>
                }
                <div class="doc-preview__actions">
                  <a
                    class="doc-preview__btn doc-preview__btn--open"
                    [href]="item.url"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      width="16"
                      height="16"
                    >
                      <path
                        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"
                      />
                    </svg>
                    Open
                  </a>
                  <a
                    class="doc-preview__btn doc-preview__btn--download"
                    [href]="item.url"
                    [download]="item.name || ''"
                    target="_blank"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      width="16"
                      height="16"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    Download
                  </a>
                </div>
              </div>
            } @else {
              @if (loadErrors()[i]) {
                <div class="error-state" [attr.data-testid]="testIds.ERROR_STATE">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                    />
                  </svg>
                  <span>Failed to load media</span>
                </div>
              } @else {
                <img
                  class="media-image"
                  [attr.data-testid]="testIds.IMAGE"
                  [src]="item.url"
                  [alt]="item.alt ?? ''"
                  [loading]="i === initialIndex ? 'eager' : 'lazy'"
                  draggable="false"
                  (error)="onMediaError(i)"
                />
              }
            }
          </div>
        }
      </div>

      <!-- Desktop nav arrows -->
      @if (totalItems() > 1) {
        @if (currentIndex() > 0) {
          <button
            class="nav-arrow nav-arrow--prev"
            [attr.data-testid]="testIds.PREV_BUTTON"
            (click)="prev()"
            aria-label="Previous"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        }
        @if (currentIndex() < totalItems() - 1) {
          <button
            class="nav-arrow nav-arrow--next"
            [attr.data-testid]="testIds.NEXT_BUTTON"
            (click)="next()"
            aria-label="Next"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 18l6-6-6-6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        }
      }

      <!-- Caption -->
      @if (currentItem().caption) {
        <div class="caption" [attr.data-testid]="testIds.CAPTION">
          {{ currentItem().caption }}
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .media-viewer {
      position: relative;
      width: 100%;
      height: 100%;
      background: #000;
      display: flex;
      flex-direction: column;
      outline: none;
      user-select: none;
      -webkit-user-select: none;
    }

    /* ── Top bar ─────────────────────────────────── */
    .top-bar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: calc(env(safe-area-inset-top, 0px) + 12px) 12px 12px;
      background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0) 100%);
      pointer-events: none;
    }

    .top-bar > * {
      pointer-events: auto;
    }

    .top-bar-spacer {
      width: 40px;
    }

    .top-bar-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: #fff;
      cursor: pointer;
      transition: background 0.15s ease;
      padding: 0;
    }

    .top-bar-btn:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .top-bar-btn:active {
      transform: scale(0.92);
    }

    .counter {
      font-size: 0.875rem;
      font-weight: 600;
      color: #fff;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
      letter-spacing: 0.02em;
    }

    /* ── Media track (scroll-snap) ───────────────── */
    .media-track {
      flex: 1;
      display: flex;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .media-track::-webkit-scrollbar {
      display: none;
    }

    .media-slide {
      flex: 0 0 100%;
      width: 100%;
      height: 100%;
      scroll-snap-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .media-image {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      -webkit-touch-callout: none;
    }

    .media-video {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    /* ── Error state ─────────────────────────────── */
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.875rem;
    }

    /* ── Desktop nav arrows ──────────────────────── */
    .nav-arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 10;
      display: none;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: #fff;
      cursor: pointer;
      transition:
        background 0.15s ease,
        transform 0.15s ease;
      padding: 0;
    }

    .nav-arrow:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .nav-arrow:active {
      transform: translateY(-50%) scale(0.92);
    }

    .nav-arrow--prev {
      left: 16px;
    }

    .nav-arrow--next {
      right: 16px;
    }

    /* Show arrows on hover-capable devices (desktop) */
    @media (hover: hover) {
      .nav-arrow {
        display: flex;
      }
    }

    /* ── Caption ─────────────────────────────────── */
    .caption {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10;
      padding: 16px 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
      background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0) 100%);
      color: #fff;
      font-size: 0.875rem;
      line-height: 1.4;
      text-align: center;
    }

    /* ── Document preview slide ──────────────────── */
    .doc-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 32px 24px;
      max-width: 360px;
      text-align: center;
    }

    .doc-preview__icon {
      width: 88px;
      height: 88px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
    }

    .doc-preview__ext {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .doc-preview__name {
      color: #fff;
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.4;
      word-break: break-word;
      margin: 0;
      max-width: 100%;
    }

    .doc-preview__size {
      color: rgba(255, 255, 255, 0.45);
      font-size: 0.8125rem;
    }

    .doc-preview__actions {
      display: flex;
      gap: 10px;
      margin-top: 8px;
    }

    .doc-preview__btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition:
        background 0.15s ease,
        transform 0.1s ease;
    }

    .doc-preview__btn:active {
      transform: scale(0.96);
    }

    .doc-preview__btn--open {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }

    .doc-preview__btn--open:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .doc-preview__btn--download {
      background: var(--nxt1-color-primary, #ccff00);
      color: #000;
    }

    .doc-preview__btn--download:hover {
      background: var(--nxt1-color-primary-hover, #b8e600);
    }
  `,
})
export class NxtMediaViewerContentComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController, { optional: true });
  private readonly platformId = inject(PLATFORM_ID);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  /** Output for self-dismissal — NxtOverlayService auto-subscribes. */
  readonly close = output<{ lastIndex: number; item: MediaViewerItem | null }>();

  private readonly mediaTrack = viewChild<ElementRef<HTMLElement>>('mediaTrack');

  // ── Inputs (via ModalController componentProps) ────────
  @Input() items: MediaViewerItem[] = [];
  @Input() initialIndex = 0;
  @Input() showShare = true;
  @Input() showCounter = true;
  @Input() source = '';

  // ── Internal state ─────────────────────────────────────
  protected readonly currentIndex = signal(0);
  protected readonly loadErrors = signal<Record<number, boolean>>({});

  protected readonly totalItems = computed(() => this.items.length);
  protected readonly currentItem = computed(() => this.items[this.currentIndex()] ?? null);

  protected readonly testIds = TEST_IDS.MEDIA_VIEWER;

  /** Whether post-render setup has already run. */
  private initialized = false;

  constructor() {
    // afterNextRender requires injection context (constructor)
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => {
        if (this.initialized) return;
        this.initialized = true;

        const clamped = this.currentIndex();
        if (clamped > 0) {
          this.scrollToIndex(clamped, false);
        }
        this.focusViewer();
      });
    }
  }

  ngOnInit(): void {
    // Clamp initial index (inputs are available here)
    const clamped = Math.max(0, Math.min(this.initialIndex, this.items.length - 1));
    this.currentIndex.set(clamped);
  }

  // ── Navigation ─────────────────────────────────────────

  prev(): void {
    const idx = this.currentIndex();
    if (idx > 0) {
      this.navigateTo(idx - 1);
    }
  }

  next(): void {
    const idx = this.currentIndex();
    if (idx < this.items.length - 1) {
      this.navigateTo(idx + 1);
    }
  }

  onTrackScroll(): void {
    const track = this.mediaTrack()?.nativeElement;
    if (!track) return;

    const slideWidth = track.clientWidth;
    if (slideWidth === 0) return;

    const newIndex = Math.round(track.scrollLeft / slideWidth);
    const clamped = Math.max(0, Math.min(newIndex, this.items.length - 1));

    if (clamped !== this.currentIndex()) {
      this.pauseAllVideos();
      this.currentIndex.set(clamped);
      this.trackNavigation(clamped, 'swipe');
    }
  }

  // ── Actions ────────────────────────────────────────────

  dismiss(): void {
    const data = { lastIndex: this.currentIndex(), item: this.currentItem() };
    this.close.emit(data);
    // modalCtrl.dismiss() only works when opened via Ionic bottom sheet.
    // When opened via NxtOverlayService, no Ionic modal exists on the stack.
    this.modalCtrl?.dismiss(data, 'dismiss').catch(() => undefined);
  }

  share(): void {
    this.analytics?.trackEvent(APP_EVENTS.MEDIA_VIEWER_SHARED, {
      index: this.currentIndex(),
      type: this.currentItem()?.type,
      source: this.source,
    });
    const data = { lastIndex: this.currentIndex(), item: this.currentItem() };
    this.close.emit(data);
    this.modalCtrl?.dismiss(data, 'share').catch(() => undefined);
  }

  onMediaError(index: number): void {
    this.loadErrors.update((errors) => ({ ...errors, [index]: true }));
  }

  // ── Private helpers ────────────────────────────────────

  private navigateTo(index: number): void {
    this.pauseAllVideos();
    this.currentIndex.set(index);
    this.scrollToIndex(index, true);
    this.trackNavigation(index, 'arrow');
  }

  private trackNavigation(index: number, method: 'swipe' | 'arrow'): void {
    this.analytics?.trackEvent(APP_EVENTS.MEDIA_VIEWER_NAVIGATED, {
      index,
      method,
      type: this.items[index]?.type,
      source: this.source,
    });
  }

  private pauseAllVideos(): void {
    const track = this.mediaTrack()?.nativeElement;
    if (!track) return;

    track.querySelectorAll('video').forEach((video) => {
      if (!video.paused) video.pause();
    });
  }

  private scrollToIndex(index: number, smooth: boolean): void {
    const track = this.mediaTrack()?.nativeElement;
    if (!track) return;

    const slideWidth = track.clientWidth;
    track.scrollTo({
      left: slideWidth * index,
      behavior: smooth ? 'smooth' : 'instant',
    });
  }

  private focusViewer(): void {
    const el = this.mediaTrack()?.nativeElement?.closest('.media-viewer') as HTMLElement | null;
    el?.focus({ preventScroll: true });
  }

  // ── Document helpers ───────────────────────────────────

  /** File extension → colour rgba string for doc preview. */
  protected getDocColor(filename: string | undefined, alpha: number): string {
    const ext = this.getDocExt(filename).toLowerCase();
    const colors: Record<string, string> = {
      pdf: '239, 68, 68',
      doc: '59, 130, 246',
      docx: '59, 130, 246',
      xls: '34, 197, 94',
      xlsx: '34, 197, 94',
      csv: '34, 197, 94',
      ppt: '249, 115, 22',
      pptx: '249, 115, 22',
      txt: '148, 163, 184',
      zip: '168, 85, 247',
      rar: '168, 85, 247',
    };
    const rgb = colors[ext] ?? '148, 163, 184';
    return `rgba(${rgb}, ${alpha})`;
  }

  /** Extract uppercase extension. */
  protected getDocExt(filename: string | undefined): string {
    if (!filename) return 'FILE';
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex < 0) return 'FILE';
    return filename.slice(dotIndex + 1).toUpperCase();
  }

  /** Format bytes to human-readable size. */
  protected formatDocSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
