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
 * - Shared branded custom video controls
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
  OnDestroy,
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
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { ModalController } from '@ionic/angular/standalone';
import { TEST_IDS } from '@nxt1/core/testing';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { ANALYTICS_ADAPTER } from '../../services/analytics';
import { NxtPlatformService } from '../../services/platform';
import { NxtMediaService } from '../../services/media';
import { NxtToastService } from '../../services/toast';
import { NxtLoggingService } from '../../services/logging';
import { NxtVideoControlsComponent } from '../video-controls';
import type { MediaViewerBreakdown, MediaViewerItem } from './media-viewer.types';
import type { MediaImageFormat } from '../../services/media';

@Component({
  selector: 'nxt1-media-viewer-content',
  standalone: true,
  imports: [NxtVideoControlsComponent],
  host: {
    '[style.height]': 'isPlaybookVariant() ? "auto" : "100%"',
    '[style.min-height]': 'null',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="media-viewer"
      [class.media-viewer--playbook]="isPlaybookVariant()"
      [attr.data-testid]="testIds.CONTAINER"
      (keydown.escape)="dismiss()"
      (keydown.arrowLeft)="prev()"
      (keydown.arrowRight)="next()"
      tabindex="0"
    >
      <!-- Top bar -->
      <div class="top-bar">
        <div class="top-bar-left">
          @if (showShare && !platform.isNative()) {
            <!-- Web: save/download button in top-left -->
            <button
              class="top-bar-btn save-btn"
              [attr.data-testid]="testIds.SHARE_BUTTON"
              (click)="saveCurrentItem()"
              [disabled]="saving()"
              aria-label="Save media"
            >
              @if (saving()) {
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="spin">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-dasharray="31.4"
                    stroke-dashoffset="10"
                  />
                </svg>
              } @else {
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              }
            </button>
          }
        </div>

        <div class="top-bar-center">
          @if (showCounter && totalItems() > 1) {
            <span class="counter" [attr.data-testid]="testIds.COUNTER">
              {{ currentIndex() + 1 }} / {{ totalItems() }}
            </span>
          }
        </div>

        <div class="top-bar-actions">
          @if (primaryAction && currentItem().type === 'video') {
            <button
              class="top-bar-btn promote-btn"
              [attr.data-testid]="testIds.PRIMARY_ACTION_BUTTON"
              (click)="onPrimaryAction()"
              [disabled]="primaryActionBusy()"
              [attr.aria-label]="primaryActionAriaLabel || 'Create film review'"
            >
              @if (primaryActionBusy()) {
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="spin">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-dasharray="31.4"
                    stroke-dashoffset="10"
                  />
                </svg>
              } @else {
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 5v14m-7-7h14"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              }
              <span>{{
                primaryActionBusy() ? 'Creating...' : primaryActionLabel || 'Create'
              }}</span>
            </button>
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
              @if (resolveCloudflareEmbedUrl(item.url); as cloudflareEmbedUrl) {
                <iframe
                  class="media-video media-video--iframe"
                  [attr.data-testid]="testIds.VIDEO"
                  [src]="getSafeIframeUrl(cloudflareEmbedUrl)"
                  title="Video playback"
                  loading="lazy"
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                  allowfullscreen
                ></iframe>
              } @else {
                <video
                  class="media-video"
                  [attr.data-slide-index]="i"
                  [attr.data-testid]="testIds.VIDEO"
                  [src]="item.url"
                  [poster]="item.poster ?? ''"
                  playsinline
                  preload="auto"
                  (loadedmetadata)="onViewerVideoLoaded(i, $event)"
                  (timeupdate)="onViewerVideoTimeUpdate(i, $event)"
                  (play)="onViewerVideoPlay(i)"
                  (pause)="onViewerVideoPause(i)"
                  (ended)="onViewerVideoPause(i)"
                  (seeking)="onViewerVideoSeeking(i)"
                  (seeked)="onViewerVideoSeeked(i, $event)"
                  (error)="onMediaError(i)"
                ></video>
              }
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

      @if (showCustomVideoControls()) {
        <div
          class="video-controls-overlay"
          [class.video-controls-overlay--with-caption]="!!currentItem().caption"
          [class.video-controls-overlay--with-save-bar]="showMobileSaveBar()"
        >
          <nxt1-video-controls
            [isPlaying]="videoIsPlaying()"
            [currentTime]="videoCurrentTime()"
            [duration]="videoDuration()"
            [playbackRate]="videoPlaybackRate()"
            [playbackRates]="videoPlaybackRates"
            [showSpeedControls]="true"
            [showFullscreen]="true"
            [showOpenInNewWindow]="!platform.isNative()"
            [showPlayNavigation]="true"
            [disablePreviousNav]="currentIndex() <= 0"
            [disableNextNav]="currentIndex() >= totalItems() - 1"
            previousNavAriaLabel="Previous media"
            nextNavAriaLabel="Next media"
            (previousNav)="prev()"
            (playPause)="togglePlayPauseForCurrent()"
            (seekRelative)="seekRelativeForCurrent($event)"
            (seekChange)="seekAbsoluteForCurrent($event)"
            (seekStart)="onSeekStartForCurrent()"
            (seekEnd)="onSeekEndForCurrent()"
            (nextNav)="next()"
            (playbackRateChange)="setPlaybackRateForCurrent($event)"
            (fullscreenToggle)="toggleFullscreenForCurrent()"
            (openInNewWindow)="openCurrentVideoInNewWindow()"
          />
        </div>
      }

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
      @if (currentItem().caption && !isPlaybookVariant()) {
        <div class="caption" [attr.data-testid]="testIds.CAPTION">
          {{ currentItem().caption }}
        </div>
      }

      <!-- Mobile: bottom save-to-camera-roll bar -->
      @if (showMobileSaveBar()) {
        <div class="bottom-save-bar">
          <button
            class="save-btn-mobile"
            (click)="saveCurrentItem()"
            [disabled]="saving()"
            aria-label="Save to camera roll"
          >
            @if (saving()) {
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" class="spin">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-dasharray="31.4"
                  stroke-dashoffset="10"
                />
              </svg>
              Saving…
            } @else {
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              Save to Camera Roll
            }
          </button>
        </div>
      }

      @if (isPlaybookVariant() && currentBreakdown(); as breakdown) {
        <section class="playbook-breakdown" aria-label="Play breakdown details">
          <header class="playbook-breakdown__header">
            @if (breakdown.subtitle) {
              <p class="playbook-breakdown__subtitle">{{ breakdown.subtitle }}</p>
            }
            @if (breakdown.metaChips?.length) {
              <div class="playbook-breakdown__summary" aria-label="Play at a glance">
                <h4 class="playbook-breakdown__summary-title">At a Glance</h4>
                <ul class="playbook-breakdown__summary-list">
                  @for (chip of breakdown.metaChips!; track chip) {
                    <li>{{ chip }}</li>
                  }
                </ul>
              </div>
            }
          </header>

          @if (breakdown.sections?.length) {
            <div class="playbook-breakdown__body">
              @for (section of breakdown.sections!; track section.title) {
                <article class="playbook-breakdown__section">
                  <h4>{{ section.title }}</h4>
                  @if (section.paragraphs?.length) {
                    @for (paragraph of section.paragraphs!; track paragraph) {
                      <p>{{ paragraph }}</p>
                    }
                  }
                  @if (section.bullets?.length) {
                    <ul>
                      @for (bullet of section.bullets!; track bullet) {
                        <li>{{ bullet }}</li>
                      }
                    </ul>
                  }
                  @if (section.chips?.length) {
                    <ul class="playbook-breakdown__list playbook-breakdown__list--plain">
                      @for (chip of section.chips!; track chip) {
                        <li>{{ chip }}</li>
                      }
                    </ul>
                  }
                </article>
              }
            </div>
          }
        </section>
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

    .media-viewer--playbook {
      height: auto;
      min-height: 0;
      overflow: visible;
    }

    .media-viewer--playbook .top-bar {
      padding: calc(env(safe-area-inset-top, 0px) + 6px) 12px 6px;
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

    .top-bar-left,
    .top-bar-center,
    .top-bar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .top-bar-left {
      min-width: 40px;
    }

    .top-bar-center {
      flex: 1;
      justify-content: center;
    }

    .top-bar-actions {
      justify-content: flex-end;
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

    .promote-btn {
      width: auto;
      min-width: 40px;
      padding: 0 14px;
      border-radius: 999px;
      gap: 8px;
    }

    .promote-btn span {
      font-size: 0.8125rem;
      font-weight: 700;
      white-space: nowrap;
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

    .media-viewer--playbook .media-track {
      flex: 0 0 auto;
      height: min(72vh, 620px);
      min-height: 420px;
      overflow-x: hidden;
      overflow-y: visible;
      scroll-snap-type: none;
      touch-action: pan-y;
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

    .media-viewer--playbook .media-slide {
      align-items: flex-start;
      padding-top: 0;
      padding-inline: 8px;
      box-sizing: border-box;
    }

    .media-image {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      -webkit-touch-callout: none;
    }

    .media-viewer--playbook .media-image {
      max-height: calc(100% - 4px);
      width: auto;
    }

    .media-video {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .media-video--iframe {
      width: min(100%, 1100px);
      height: min(100%, 70vh);
      border: 0;
      border-radius: 8px;
      background: #000;
    }

    .video-controls-overlay {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 20;
      display: flex;
      flex-direction: column;
      gap: var(--nxt1-spacing-1, 4px);
      padding: var(--nxt1-spacing-1, 4px);
      pointer-events: none;
    }

    .video-controls-overlay > * {
      pointer-events: auto;
    }

    .video-controls-overlay--with-caption {
      bottom: 56px;
    }

    .video-controls-overlay--with-save-bar {
      bottom: calc(env(safe-area-inset-bottom, 0px) + 78px);
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
      pointer-events: none;
    }

    .playbook-breakdown {
      position: relative;
      left: auto;
      right: auto;
      bottom: auto;
      z-index: auto;
      max-height: none;
      display: grid;
      gap: 10px;
      border-radius: var(--nxt1-borderRadius-xl, 12px);
      border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
      background: var(--nxt1-color-surface-100, #111);
      color: var(--nxt1-color-text-primary, #fff);
      overflow: hidden;
      pointer-events: auto;
      margin: 10px 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
    }

    .playbook-breakdown__header {
      display: grid;
      gap: 8px;
      padding: 12px 12px 0;
    }

    .playbook-breakdown__subtitle {
      margin: 0;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
    }

    .playbook-breakdown__summary {
      display: grid;
      gap: 6px;
      border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      border-radius: var(--nxt1-borderRadius-lg, 8px);
      background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      padding: 8px;
    }

    .playbook-breakdown__summary-title {
      margin: 0;
      font-size: 0.68rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
    }

    .playbook-breakdown__summary-list {
      margin: 0;
      padding-left: 16px;
      display: grid;
      gap: 4px;
      list-style: disc;
    }

    .playbook-breakdown__summary-list li {
      font-size: 0.74rem;
      line-height: 1.4;
      color: var(--nxt1-color-text-primary, #fff);
    }

    .playbook-breakdown__body {
      overflow: visible;
      display: grid;
      gap: 8px;
      padding: 0 12px 12px;
      max-height: none;
    }

    .playbook-breakdown__section {
      display: grid;
      gap: 6px;
      border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      border-radius: var(--nxt1-borderRadius-lg, 8px);
      background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      padding: 8px;
    }

    .playbook-breakdown__section h4 {
      margin: 0;
      font-size: 0.68rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
    }

    .playbook-breakdown__section p {
      margin: 0;
      font-size: 0.76rem;
      line-height: 1.45;
      color: var(--nxt1-color-text-primary, #fff);
    }

    .playbook-breakdown__list {
      margin: 0;
      padding-left: 16px;
      display: grid;
      gap: 4px;
      list-style: disc;
    }

    .playbook-breakdown__list li {
      font-size: 0.74rem;
      line-height: 1.4;
      color: var(--nxt1-color-text-primary, #fff);
    }

    .playbook-breakdown__list--plain {
      list-style: none;
      padding-left: 0;
      gap: 2px;
    }

    .playbook-breakdown__list--plain li {
      border-left: 2px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      padding-left: 8px;
      color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
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

    /* ── Mobile bottom save bar ──────────────────── */
    .bottom-save-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10;
      display: flex;
      justify-content: center;
      padding: 16px 24px calc(env(safe-area-inset-bottom, 0px) + 16px);
      background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0) 100%);
      pointer-events: none;
    }

    .bottom-save-bar > * {
      pointer-events: auto;
    }

    .save-btn-mobile {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 13px 32px;
      border-radius: 28px;
      border: none;
      background: var(--nxt1-color-primary, #ccff00);
      color: #000;
      font-size: 0.9375rem;
      font-weight: 700;
      letter-spacing: 0.01em;
      cursor: pointer;
      transition:
        transform 0.15s ease,
        background 0.15s ease,
        opacity 0.15s ease;
      -webkit-tap-highlight-color: transparent;
    }

    .save-btn-mobile:active {
      transform: scale(0.95);
    }

    .save-btn-mobile:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }

    @media (max-width: 767px) {
      .media-viewer--playbook .top-bar {
        padding: calc(env(safe-area-inset-top, 0px) + 4px) 10px 4px;
      }

      .media-viewer--playbook .media-track {
        height: min(62vh, 460px);
        min-height: 320px;
        overflow-x: hidden;
      }

      .playbook-breakdown {
        margin: 8px 8px calc(env(safe-area-inset-bottom, 0px) + 10px);
      }

      .playbook-breakdown__body {
        max-height: none;
      }
    }

    /* Spinner animation */
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .spin {
      animation: spin 0.8s linear infinite;
    }
  `,
})
export class NxtMediaViewerContentComponent implements OnInit, OnDestroy {
  private readonly modalCtrl = inject(ModalController, { optional: true });
  private readonly platformId = inject(PLATFORM_ID);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  protected readonly platform = inject(NxtPlatformService);
  private readonly mediaService = inject(NxtMediaService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('MediaViewerContent');

  /** Output for self-dismissal — NxtOverlayService auto-subscribes. */
  readonly close = output<{ lastIndex: number; item: MediaViewerItem | null }>();

  private readonly mediaTrack = viewChild<ElementRef<HTMLElement>>('mediaTrack');

  // ── Inputs (via ModalController componentProps) ────────
  @Input() items: MediaViewerItem[] = [];
  @Input() initialIndex = 0;
  @Input() showShare = true;
  @Input() showCounter = true;
  @Input() source = '';
  @Input() variant: 'default' | 'playbook-breakdown' = 'default';
  @Input() primaryActionLabel?: string;
  @Input() primaryActionAriaLabel?: string;
  @Input() primaryAction?: (item: MediaViewerItem) => void | Promise<void>;
  /**
   * Set to true when opened via NxtOverlayService (Angular CDK, no Ionic modal).
   * Prevents modalCtrl.dismiss() from accidentally closing the topmost Ionic
   * modal behind the overlay (e.g. an Agent X operation-chat sheet).
   */
  @Input() isOverlay = false;

  // ── Internal state ─────────────────────────────────────
  protected readonly currentIndex = signal(0);
  protected readonly loadErrors = signal<Record<number, boolean>>({});
  protected readonly videoCurrentTime = signal(0);
  protected readonly videoDuration = signal(0);
  protected readonly videoIsPlaying = signal(false);
  protected readonly videoPlaybackRate = signal(1);
  protected readonly videoPlaybackRates = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
  private readonly _saving = signal(false);
  protected readonly primaryActionBusy = signal(false);
  protected readonly saving = computed(() => this._saving());
  private isScrubbingVideo = false;
  private wasPlayingBeforeSeek = false;
  private smoothProgressFrameId: number | null = null;
  private pendingSeekFrameId: number | null = null;
  private pendingSeekTime: number | null = null;

  protected readonly totalItems = computed(() => this.items.length);
  protected readonly currentItem = computed(() => this.items[this.currentIndex()] ?? null);
  protected readonly showMobileSaveBar = computed(
    () => this.showShare && this.platform.isNative() && this.currentItem()?.type !== 'doc'
  );
  protected readonly showCustomVideoControls = computed(() => {
    const item = this.currentItem();
    if (!item || item.type !== 'video') return false;
    return this.resolveCloudflareEmbedUrl(item.url) === null;
  });
  protected readonly isPlaybookVariant = computed(() => this.variant === 'playbook-breakdown');
  protected readonly currentBreakdown = computed<MediaViewerBreakdown | null>(
    () => this.currentItem()?.breakdown ?? null
  );

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
        this.syncCurrentVideoStateFromDom();
      });
    }
  }

  ngOnInit(): void {
    // Clamp initial index (inputs are available here)
    const clamped = Math.max(0, Math.min(this.initialIndex, this.items.length - 1));
    this.currentIndex.set(clamped);
    this.resetCustomVideoState();
  }

  ngOnDestroy(): void {
    this.stopSmoothProgressTracking();
    this.cancelPendingVideoSeek();
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
    if (this.isScrubbingVideo) return;

    const track = this.mediaTrack()?.nativeElement;
    if (!track) return;

    const slideWidth = track.clientWidth;
    if (slideWidth === 0) return;

    const newIndex = Math.round(track.scrollLeft / slideWidth);
    const clamped = Math.max(0, Math.min(newIndex, this.items.length - 1));

    if (clamped !== this.currentIndex()) {
      this.pauseAllVideos();
      this.currentIndex.set(clamped);
      this.resetCustomVideoState();
      this.scheduleCurrentVideoStateSync();
      this.trackNavigation(clamped, 'swipe');
    }
  }

  protected onViewerVideoLoaded(index: number, event: Event): void {
    if (!this.isCurrentVideoIndex(index)) return;
    const video = event.target as HTMLVideoElement | null;
    if (!video) return;
    this.videoDuration.set(Number.isFinite(video.duration) ? video.duration : 0);
    this.videoCurrentTime.set(video.currentTime || 0);
    this.videoPlaybackRate.set(video.playbackRate || 1);
    this.videoIsPlaying.set(!video.paused && !video.ended);

    if (!video.paused && !video.ended) {
      this.startSmoothProgressTracking();
    }
  }

  protected onViewerVideoTimeUpdate(index: number, event: Event): void {
    if (!this.isCurrentVideoIndex(index)) return;
    if (this.isScrubbingVideo) return;
    const video = event.target as HTMLVideoElement | null;
    if (!video) return;
    this.videoCurrentTime.set(video.currentTime || 0);
    if (Number.isFinite(video.duration)) {
      this.videoDuration.set(video.duration);
    }

    if (!video.paused && !video.ended) {
      this.startSmoothProgressTracking();
    }
  }

  protected onViewerVideoPlay(index: number): void {
    if (!this.isCurrentVideoIndex(index)) return;
    this.videoIsPlaying.set(true);

    const video = this.getCurrentVideoElement();
    if (video && !video.paused && !video.ended) {
      this.startSmoothProgressTracking();
    }
  }

  protected onViewerVideoPause(index: number): void {
    if (!this.isCurrentVideoIndex(index)) return;
    this.stopSmoothProgressTracking();
    this.videoIsPlaying.set(false);
    const video = this.getCurrentVideoElement();
    this.videoCurrentTime.set(video?.currentTime || 0);
  }

  protected onViewerVideoSeeking(index: number): void {
    if (!this.isCurrentVideoIndex(index)) return;
    this.stopSmoothProgressTracking();
    const video = this.getCurrentVideoElement();
    this.videoCurrentTime.set(video?.currentTime || 0);
  }

  protected onViewerVideoSeeked(index: number, event: Event): void {
    if (!this.isCurrentVideoIndex(index)) return;
    const video = event.target as HTMLVideoElement | null;
    if (!video) return;
    this.videoCurrentTime.set(video.currentTime || 0);
    this.videoIsPlaying.set(!video.paused && !video.ended);

    if (!this.isScrubbingVideo && !video.paused && !video.ended) {
      this.startSmoothProgressTracking();
    }
  }

  protected async togglePlayPauseForCurrent(): Promise<void> {
    const video = this.getCurrentVideoElement();
    if (!video) return;

    this.isScrubbingVideo = false;

    if (video.paused) {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration > 0 && video.currentTime >= duration - 0.05) {
        video.currentTime = 0;
      }

      let played: boolean;
      try {
        await video.play();
        played = true;
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
          played = true;
        } catch {
          played = false;
        }
      }

      this.videoIsPlaying.set(played && !video.paused && !video.ended);
      return;
    }

    video.pause();
    this.videoIsPlaying.set(false);
  }

  protected seekRelativeForCurrent(deltaSeconds: number): void {
    const video = this.getCurrentVideoElement();
    if (!video) return;

    const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
    const nextTime = Math.max(0, Math.min((video.currentTime || 0) + deltaSeconds, duration));
    this.seekAbsoluteForCurrent(nextTime);
  }

  protected seekAbsoluteForCurrent(nextTime: number): void {
    const video = this.getCurrentVideoElement();
    if (!video || !Number.isFinite(nextTime)) return;

    if (this.isScrubbingVideo) {
      this.pendingSeekTime = nextTime;
      if (this.pendingSeekFrameId === null && typeof requestAnimationFrame !== 'undefined') {
        this.pendingSeekFrameId = requestAnimationFrame(() => {
          this.pendingSeekFrameId = null;
          if (this.pendingSeekTime !== null) {
            this.seekVideoTo(video, this.pendingSeekTime);
            this.pendingSeekTime = null;
          }
        });
      } else if (typeof requestAnimationFrame === 'undefined') {
        this.seekVideoTo(video, nextTime);
        this.pendingSeekTime = null;
      }
      return;
    }

    this.seekVideoTo(video, nextTime);
  }

  protected onSeekStartForCurrent(): void {
    const video = this.getCurrentVideoElement();
    this.isScrubbingVideo = true;
    this.stopSmoothProgressTracking();

    if (video && !video.paused && !video.ended) {
      this.wasPlayingBeforeSeek = true;
      video.pause();
    } else {
      this.wasPlayingBeforeSeek = false;
    }
  }

  protected onSeekEndForCurrent(): void {
    const video = this.getCurrentVideoElement();
    if (video) {
      this.flushPendingVideoSeek(video);
    }

    this.isScrubbingVideo = false;
    if (!video) {
      this.wasPlayingBeforeSeek = false;
      return;
    }

    this.videoCurrentTime.set(video.currentTime || 0);

    if (this.wasPlayingBeforeSeek) {
      this.wasPlayingBeforeSeek = false;
      this.videoIsPlaying.set(true);
      void this.playVideoWhenReady(video).then((played) => {
        this.videoIsPlaying.set(played && !video.paused && !video.ended);
        if (played && !video.paused && !video.ended) {
          this.startSmoothProgressTracking();
        }
      });
      return;
    }

    this.videoIsPlaying.set(!video.paused && !video.ended);

    if (!video.paused && !video.ended) {
      this.startSmoothProgressTracking();
    }
  }

  private seekVideoTo(video: HTMLVideoElement, nextTime: number): void {
    const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
    const target = Math.max(0, Math.min(nextTime, duration));

    video.currentTime = target;
    const committedTime = Number.isFinite(video.currentTime) ? video.currentTime : target;
    this.videoCurrentTime.set(committedTime);

    if (video.ended && duration > 0 && committedTime >= duration) {
      video.currentTime = Math.max(0, duration - 0.1);
    }
  }

  private flushPendingVideoSeek(video: HTMLVideoElement): void {
    if (this.pendingSeekFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.pendingSeekFrameId);
    }

    this.pendingSeekFrameId = null;
    if (this.pendingSeekTime !== null) {
      this.seekVideoTo(video, this.pendingSeekTime);
      this.pendingSeekTime = null;
    }
  }

  private cancelPendingVideoSeek(): void {
    if (this.pendingSeekFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.pendingSeekFrameId);
    }

    this.pendingSeekFrameId = null;
    this.pendingSeekTime = null;
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

  protected setPlaybackRateForCurrent(rate: number): void {
    const video = this.getCurrentVideoElement();
    if (!video || !Number.isFinite(rate) || rate <= 0) return;
    const normalized = this.videoPlaybackRates.includes(
      rate as (typeof this.videoPlaybackRates)[number]
    )
      ? rate
      : 1;
    video.playbackRate = normalized;
    this.videoPlaybackRate.set(normalized);
  }

  protected toggleFullscreenForCurrent(): void {
    const video = this.getCurrentVideoElement();
    const target = video?.closest('.media-slide') as HTMLElement | null;
    if (!target || typeof document === 'undefined') return;

    if (!document.fullscreenElement) {
      const requestFullscreen = target.requestFullscreen?.bind(target) as
        | (() => Promise<void>)
        | undefined;
      if (requestFullscreen) {
        void requestFullscreen().catch(() => undefined);
      }
      return;
    }

    void document.exitFullscreen?.().catch(() => undefined);
  }

  protected openCurrentVideoInNewWindow(): void {
    const item = this.currentItem();
    if (!item || item.type !== 'video' || typeof window === 'undefined') return;
    window.open(item.url, '_blank', 'noopener,noreferrer');
  }

  // ── Actions ────────────────────────────────────────────

  dismiss(): void {
    const data = { lastIndex: this.currentIndex(), item: this.currentItem() };
    this.close.emit(data);
    // Only call ModalController.dismiss() when opened via Ionic bottom sheet.
    // When isOverlay=true (NxtOverlayService path), there is no Ionic modal on
    // the stack for this viewer — calling dismiss() here would hit the topmost
    // Ionic modal underneath (e.g. the Agent X operation-chat sheet) and close it.
    if (!this.isOverlay) {
      this.modalCtrl?.dismiss(data, 'dismiss').catch(() => undefined);
    }
  }

  share(): void {
    this.analytics?.trackEvent(APP_EVENTS.MEDIA_VIEWER_SHARED, {
      index: this.currentIndex(),
      type: this.currentItem().type,
      source: this.source,
    });
    const data = { lastIndex: this.currentIndex(), item: this.currentItem() };
    this.close.emit(data);
    if (!this.isOverlay) {
      this.modalCtrl?.dismiss(data, 'share').catch(() => undefined);
    }
  }

  async onPrimaryAction(): Promise<void> {
    const action = this.primaryAction;
    const item = this.currentItem();
    if (!action || !item || item.type !== 'video' || this.primaryActionBusy()) return;

    this.primaryActionBusy.set(true);
    try {
      await action(item);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete media action';
      this.logger.error('Media viewer primary action failed', err, {
        type: item.type,
        url: item.url,
      });
      this.toast.error(message);
    } finally {
      this.primaryActionBusy.set(false);
    }
  }

  async saveCurrentItem(): Promise<void> {
    const item = this.currentItem();
    if (!item || item.type === 'doc' || this._saving()) return;

    this._saving.set(true);
    this.logger.info('Saving media item', { type: item.type, url: item.url });

    try {
      if (item.type === 'video') {
        await this.saveVideoItem(item);
      } else {
        await this.saveImageItem(item);
      }

      this.analytics?.trackEvent(APP_EVENTS.MEDIA_VIEWER_SHARED, {
        index: this.currentIndex(),
        type: item.type,
        source: this.source,
        action: 'save',
      });
    } catch (err) {
      this.logger.error('Failed to save media item', err, { type: item.type });
      this.toast.error('Failed to save media');
    } finally {
      this._saving.set(false);
    }
  }

  private async saveImageItem(item: MediaViewerItem): Promise<void> {
    const baseName = item.name?.replace(/\.[^.]+$/, '') ?? this.deriveFileName(item);

    if (this.platform.isNative()) {
      // On native iOS/Android, pass the HTTPS URL directly to the Media plugin.
      // The plugin's native downloader (SDWebImageDownloader on iOS, Glide on Android)
      // fetches via NSURLSession — no WKWebView cross-origin restriction, no
      // intermediate cache file needed, and no share-sheet fallback.
      const result = await this.mediaService.saveImageFromUrl(item.url);

      if (result.success) {
        this.dismiss();
        this.toast.success('Saved to camera roll!');
      } else if (result.error && result.error !== 'Cancelled') {
        this.toast.error(result.error ?? 'Failed to save');
      }
      return;
    }

    // Web: fetch as blob (cross-origin blob URL workaround for <a download>)
    const response = await fetch(item.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const format = this.inferImageFormat(blob, item.url);

    const result = await this.mediaService.saveImage({
      data: blob,
      fileName: baseName,
      format,
      album: 'NXT1',
    });

    if (result.success) {
      this.toast.success('Download started');
    } else if (result.error && result.error !== 'Cancelled') {
      this.toast.error(result.error ?? 'Failed to save');
    }
  }

  private async saveVideoItem(item: MediaViewerItem): Promise<void> {
    if (this.platform.isNative()) {
      // Native iOS/Android: save directly to the camera roll via the Media plugin.
      // This works for both standard videos and Runway-generated animated graphics.
      // Uses the plugin's native downloader to fetch the HTTPS URL, bypassing
      // WKWebView cross-origin restrictions — no cache write required.
      const result = await this.mediaService.saveVideoFromUrl(item.url);
      if (result.success) {
        this.dismiss();
        this.toast.success('Saved to camera roll!');
      } else if (result.error && result.error !== 'Cancelled') {
        this.toast.error(result.error ?? 'Failed to save');
      }
    } else {
      // Web: Firebase Storage URLs are cross-origin so a bare <a download> is
      // ignored by the browser (it navigates instead). Fetch as blob first,
      // then create a same-origin blob URL that download attribute honours.
      const response = await fetch(item.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = item.name ?? 'nxt1-video.mp4';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a generous delay so the browser finishes streaming
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
      this.toast.success('Download started');
    }
  }

  private inferImageFormat(blob: Blob, url: string): MediaImageFormat {
    const mime = blob.type.toLowerCase();
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpeg';
    if (mime.includes('webp')) return 'webp';
    const urlPath = url.toLowerCase().split('?')[0];
    if (urlPath.endsWith('.jpg') || urlPath.endsWith('.jpeg')) return 'jpeg';
    if (urlPath.endsWith('.webp')) return 'webp';
    return 'png';
  }

  private deriveFileName(item: MediaViewerItem): string {
    try {
      const pathname = new URL(item.url).pathname;
      const last = pathname.split('/').pop() ?? '';
      const clean = decodeURIComponent(last)
        .split('?')[0]
        .replace(/\.[^.]+$/, '');
      if (clean.length > 0 && clean.length < 120) return clean;
    } catch {
      /* ignore */
    }
    return item.type === 'video' ? 'nxt1-video' : 'nxt1-image';
  }

  onMediaError(index: number): void {
    this.loadErrors.update((errors) => ({ ...errors, [index]: true }));
  }

  // ── Private helpers ────────────────────────────────────

  private navigateTo(index: number): void {
    this.pauseAllVideos();
    this.currentIndex.set(index);
    this.resetCustomVideoState();
    this.scrollToIndex(index, true);
    this.scheduleCurrentVideoStateSync();
    this.trackNavigation(index, 'arrow');
  }

  private isCurrentVideoIndex(index: number): boolean {
    return index === this.currentIndex();
  }

  private getCurrentVideoElement(): HTMLVideoElement | null {
    const track = this.mediaTrack()?.nativeElement;
    if (!track) return null;

    const byIndex = track.querySelector<HTMLVideoElement>(
      `video.media-video[data-slide-index="${this.currentIndex()}"]`
    );
    if (byIndex) return byIndex;

    const slides = Array.from(track.querySelectorAll<HTMLElement>('.media-slide'));
    const slide = slides[this.currentIndex()];
    if (!slide) return null;

    return slide.querySelector<HTMLVideoElement>('video.media-video');
  }

  private scheduleCurrentVideoStateSync(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    requestAnimationFrame(() => this.syncCurrentVideoStateFromDom());
    setTimeout(() => this.syncCurrentVideoStateFromDom(), 220);
  }

  private syncCurrentVideoStateFromDom(): void {
    const video = this.getCurrentVideoElement();
    if (!video) {
      this.stopSmoothProgressTracking();
      this.resetCustomVideoState();
      return;
    }

    if (!Number.isFinite(video.playbackRate) || video.playbackRate <= 0) {
      video.playbackRate = 1;
    }

    this.videoDuration.set(Number.isFinite(video.duration) ? video.duration : 0);
    this.videoCurrentTime.set(video.currentTime || 0);
    this.videoPlaybackRate.set(video.playbackRate || 1);
    this.videoIsPlaying.set(!video.paused && !video.ended);

    if (!this.isScrubbingVideo && !video.paused && !video.ended) {
      this.startSmoothProgressTracking();
      return;
    }

    this.stopSmoothProgressTracking();
  }

  private resetCustomVideoState(): void {
    this.stopSmoothProgressTracking();
    this.cancelPendingVideoSeek();
    this.videoCurrentTime.set(0);
    this.videoDuration.set(0);
    this.videoPlaybackRate.set(1);
    this.videoIsPlaying.set(false);
    this.isScrubbingVideo = false;
    this.wasPlayingBeforeSeek = false;

    const current = this.getCurrentVideoElement();
    if (current) {
      current.playbackRate = 1;
    }
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
    this.stopSmoothProgressTracking();
    const track = this.mediaTrack()?.nativeElement;
    if (!track) return;

    track.querySelectorAll('video').forEach((video) => {
      if (!video.paused) video.pause();
    });
  }

  private startSmoothProgressTracking(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (typeof requestAnimationFrame === 'undefined') return;
    if (this.smoothProgressFrameId !== null || this.isScrubbingVideo) return;

    const step = (): void => {
      const video = this.getCurrentVideoElement();
      if (!video || this.isScrubbingVideo) {
        this.stopSmoothProgressTracking();
        return;
      }

      this.videoCurrentTime.set(video.currentTime || 0);
      if (Number.isFinite(video.duration)) {
        this.videoDuration.set(video.duration);
      }

      if (!video.paused && !video.ended) {
        this.smoothProgressFrameId = requestAnimationFrame(step);
        return;
      }

      this.stopSmoothProgressTracking();
    };

    this.smoothProgressFrameId = requestAnimationFrame(step);
  }

  private stopSmoothProgressTracking(): void {
    if (this.smoothProgressFrameId === null) return;
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.smoothProgressFrameId);
    }
    this.smoothProgressFrameId = null;
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

  protected resolveCloudflareEmbedUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== 'watch.cloudflarestream.com') return null;
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      if (!videoId) return null;
      return `https://iframe.videodelivery.net/${videoId}`;
    } catch {
      return null;
    }
  }

  protected getSafeIframeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}
