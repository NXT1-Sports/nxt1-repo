import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NxtIconComponent } from '@nxt1/ui/components/icon';
import { NxtVideoControlsComponent } from '@nxt1/ui/components/video-controls';

interface FilmReviewPopoutPlayMetaItem {
  readonly label: string;
  readonly value: string;
}

interface FilmReviewPopoutPayload {
  readonly videoUrl: string;
  readonly title: string;
  readonly startTimeSec: number;
  readonly playCounter?: string | null;
  readonly playDetails?: readonly FilmReviewPopoutPlayMetaItem[];
}

const FILM_REVIEW_POPOUT_STORAGE_PREFIX = 'nxt1-film-review-popout:';

@Component({
  selector: 'app-agent-x-film-review-popout',
  standalone: true,
  imports: [NxtIconComponent, NxtVideoControlsComponent],
  template: `
    <main class="film-popout" role="main">
      <header class="film-popout__header">
        <div class="film-popout__identity">
          <h1 class="film-popout__title">{{ title() }}</h1>
        </div>
        <span class="film-popout__status">{{ status() }}</span>
      </header>

      <section class="film-popout__workspace" aria-label="Film review player">
        @if (videoUrl()) {
          <div class="film-popout__player-shell" #playerContainer>
            <video
              #filmPlayer
              class="film-popout__player"
              [src]="videoUrl()"
              crossorigin="anonymous"
              playsinline
              preload="auto"
              (loadedmetadata)="onPlayerLoadedMetadata()"
              (timeupdate)="onPlayerTimeUpdate()"
              (play)="onPlayerPlay()"
              (pause)="onPlayerPause()"
              (ended)="onPlayerEnded()"
              (error)="onPlayerError()"
            ></video>

            <canvas
              #drawCanvas
              class="film-draw-canvas"
              [class.film-draw-canvas--active]="drawModeEnabled()"
              (pointerdown)="onDrawPointerDown($event)"
              (pointermove)="onDrawPointerMove($event)"
              (pointerup)="onDrawPointerUp($event)"
              (pointerleave)="onDrawPointerUp($event)"
              (pointercancel)="onDrawPointerUp($event)"
              aria-label="Coach drawing overlay"
            ></canvas>

            <div class="film-top-tools">
              <div
                class="film-top-tools__left"
                [class.film-controls__cluster]="currentInlinePlayOverlayItems().length > 0"
                [class.film-top-tools__left--collapsed]="!isInlinePlayOverlayExpanded()"
                aria-label="Selected play details"
              >
                @if (currentInlinePlayOverlayItems().length) {
                  @if (isInlinePlayOverlayExpanded()) {
                    <div class="film-top-meta">
                      @if (currentInlinePlayOverlayCounter(); as counter) {
                        <div class="film-top-meta__counter">{{ counter }}</div>
                      }

                      <div class="film-top-meta__scroll">
                        @for (item of currentInlinePlayOverlayItems(); track item.label) {
                          <div class="film-top-meta__item">
                            <span class="film-top-meta__label">{{ item.label }}</span>
                            <span class="film-top-meta__value">{{ item.value }}</span>
                          </div>
                        }
                      </div>

                      <button
                        type="button"
                        class="film-top-meta__toggle"
                        (click)="toggleInlinePlayOverlay()"
                        [attr.aria-label]="
                          isInlinePlayOverlayExpanded()
                            ? 'Collapse selected play details'
                            : 'Expand selected play details'
                        "
                        [attr.aria-expanded]="isInlinePlayOverlayExpanded()"
                        [attr.title]="
                          isInlinePlayOverlayExpanded()
                            ? 'Collapse selected play details'
                            : 'Expand selected play details'
                        "
                      >
                        <svg
                          class="film-top-meta__toggle-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            [attr.d]="
                              isInlinePlayOverlayExpanded()
                                ? inlinePlayOverlayCollapseIconPath
                                : inlinePlayOverlayExpandIconPath
                            "
                          />
                        </svg>
                      </button>
                    </div>
                  } @else {
                    <button
                      type="button"
                      class="film-top-meta__toggle film-top-meta__toggle--collapsed"
                      (click)="toggleInlinePlayOverlay()"
                      aria-label="Expand selected play details"
                      aria-expanded="false"
                      title="Expand selected play details"
                    >
                      <svg
                        class="film-top-meta__toggle-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path [attr.d]="inlinePlayOverlayExpandIconPath" />
                      </svg>
                    </button>
                  }
                }
              </div>

              <div
                class="film-top-tools__right film-draw-tools film-controls__cluster"
                role="group"
                aria-label="Drawing tools"
              >
                <button
                  type="button"
                  class="film-icon-btn video-controls__tooltip-host"
                  [class.film-icon-btn--primary]="drawModeEnabled()"
                  (click)="toggleDrawMode()"
                  [attr.title]="drawModeEnabled() ? 'Turn off draw mode' : 'Turn on draw mode'"
                  [attr.data-tooltip]="
                    drawModeEnabled() ? 'Turn off draw mode' : 'Turn on draw mode'
                  "
                  [attr.aria-label]="drawModeEnabled() ? 'Disable draw mode' : 'Enable draw mode'"
                >
                  <nxt1-icon name="pencil" [size]="11"></nxt1-icon>
                </button>
                @if (drawModeEnabled()) {
                  <button
                    type="button"
                    class="film-icon-btn film-top-tool-btn film-top-tool-btn--danger video-controls__tooltip-host"
                    [disabled]="!hasDrawing()"
                    (click)="clearDrawOverlay()"
                    title="Clear drawing overlay"
                    data-tooltip="Clear drawing overlay"
                    aria-label="Clear drawing"
                  >
                    <nxt1-icon name="trash" [size]="11" />
                  </button>
                }
              </div>
            </div>

            <div class="film-popout__controls" aria-label="Coach video controls">
              <nxt1-video-controls
                [isPlaying]="isPlaying()"
                [currentTime]="currentTime()"
                [duration]="duration()"
                [playbackRate]="playbackRate()"
                [playbackRates]="playbackRates"
                [showSpeedControls]="true"
                [showFullscreen]="true"
                [showOpenInNewWindow]="false"
                [showPlayNavigation]="true"
                [showAdvancedPlaybackControls]="true"
                [showDurationBadge]="true"
                [allowTransportCollapse]="true"
                [frameStepSeconds]="filmFrameStepSeconds"
                [disablePreviousNav]="true"
                [disableNextNav]="true"
                (seekRelative)="seekRelative($event)"
                (playPause)="togglePlayPause()"
                (seekStart)="onSeekStart()"
                (seekEnd)="onSeekEnd()"
                (seekChange)="seekTo($event)"
                (playbackRateChange)="setPlaybackRate($event)"
                (fullscreenToggle)="toggleFullscreen()"
              />
            </div>
          </div>
        } @else {
          <div class="film-popout__empty">
            <h2>Video unavailable</h2>
            <p>Open this player from Film Review again.</p>
          </div>
        }
      </section>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        color-scheme: dark;
        background: #05070a;
        color: #f8fafc;
        --nxt1-color-primary: #ccff00;
        --nxt1-color-danger: #ef4444;
        --nxt1-color-bg-primary: #05070a;
        --nxt1-color-surface-100: #111827;
        --nxt1-color-text-primary: #f8fafc;
        --nxt1-color-text-secondary: #94a3b8;
        --nxt1-color-border-subtle: rgba(148, 163, 184, 0.22);
        --nxt1-border-radius-sm: 6px;
        --nxt1-border-radius-md: 10px;
        --nxt1-spacing-1: 4px;
        --nxt1-spacing-2: 8px;
        font-family:
          Rajdhani,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
      }

      .film-popout {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        background: #05070a;
      }

      .film-popout__header {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 52px;
        padding: 0 18px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        background: rgba(5, 7, 10, 0.94);
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
      }

      .film-popout__identity {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        gap: 10px;
      }

      .film-popout__title {
        min-width: 0;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0;
      }

      .film-popout__status {
        flex: 0 0 auto;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 600;
      }

      .film-popout__workspace {
        display: block;
        min-width: 0;
        min-height: 0;
        padding: 0;
        overflow: hidden;
        background: radial-gradient(circle at top, rgba(15, 23, 42, 0.72), #000 54%);
      }

      .film-popout__player-shell {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow: hidden;
        border: 0;
        border-radius: 0;
        background: #000;
        box-shadow: none;
      }

      .film-popout__player-shell:fullscreen,
      .film-popout__player-shell:-webkit-full-screen {
        width: 100vw;
        height: 100vh;
        aspect-ratio: auto;
        border: 0;
        border-radius: 0;
        background: #000;
      }

      .film-popout__player-shell:fullscreen .film-popout__player,
      .film-popout__player-shell:-webkit-full-screen .film-popout__player {
        border-radius: 0;
      }

      .film-popout__player-shell:fullscreen .film-draw-canvas,
      .film-popout__player-shell:-webkit-full-screen .film-draw-canvas {
        border-radius: 0;
      }

      .film-popout__player {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        min-height: 0;
        object-fit: contain;
        background: #000;
        outline: none;
      }

      .film-draw-canvas {
        position: absolute;
        inset: 0;
        z-index: 15;
        width: 100%;
        height: 100%;
        border-radius: var(--nxt1-border-radius-md, 10px);
        pointer-events: none;
        touch-action: none;
      }

      .film-draw-canvas--active {
        pointer-events: auto;
        cursor: crosshair;
      }

      .film-top-tools {
        position: absolute;
        top: var(--nxt1-spacing-2, 8px);
        left: var(--nxt1-spacing-2, 8px);
        right: var(--nxt1-spacing-2, 8px);
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .film-top-tools__left,
      .film-top-tools__right {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .film-top-tools__left {
        min-width: 0;
        flex: 0 1 min(760px, calc(100% - 128px));
      }

      .film-top-tools__left--collapsed {
        flex: 0 0 auto;
        gap: 0;
        padding: 2px;
      }

      .film-top-meta {
        display: inline-flex;
        align-items: stretch;
        min-width: 0;
        flex: 1 1 auto;
        overflow: hidden;
      }

      .film-top-meta__counter {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        min-width: 48px;
        padding: 0 6px;
        color: var(--nxt1-color-text-primary);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0;
        white-space: nowrap;
      }

      .film-top-meta__scroll {
        display: inline-flex;
        align-items: stretch;
        min-width: 0;
        gap: 2px;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
      }

      .film-top-meta__scroll::-webkit-scrollbar {
        display: none;
      }

      .film-top-meta__item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex: 0 0 auto;
        min-width: 0;
        padding: 0 6px;
        white-space: nowrap;
      }

      .film-top-meta__label {
        color: var(--nxt1-color-text-secondary);
        font-size: 9px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .film-top-meta__value {
        color: var(--nxt1-color-text-primary);
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      }

      .film-top-meta__toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 24px;
        min-height: 24px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        transition:
          background 0.16s ease,
          color 0.16s ease;
      }

      .film-top-meta__toggle--collapsed {
        width: 26px;
      }

      .film-top-meta__toggle:hover,
      .film-top-meta__toggle:focus-visible {
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 72%, transparent);
        color: var(--nxt1-color-text-primary);
        outline: none;
      }

      .film-top-meta__toggle-icon {
        width: 12px;
        height: 12px;
        display: block;
      }

      .film-top-meta__toggle-icon path {
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .film-draw-tools {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .film-controls__cluster {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-1, 4px);
        border-radius: var(--nxt1-border-radius-sm, 6px);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 68%, transparent);
        border: 1px solid var(--nxt1-color-border-subtle);
        backdrop-filter: blur(6px);
      }

      .film-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        min-height: 24px;
        min-width: 24px;
        padding: 0;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        transition: all 0.18s cubic-bezier(0.23, 1, 0.32, 1);
      }

      .film-icon-btn:hover:not(:disabled) {
        color: var(--nxt1-color-primary);
      }

      .film-icon-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .film-icon-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .film-icon-btn--primary {
        color: var(--nxt1-color-primary);
      }

      .film-icon-btn--primary:hover {
        color: var(--nxt1-color-primary);
      }

      .film-icon-btn.film-top-tool-btn--danger {
        color: var(--nxt1-color-danger);
      }

      .film-icon-btn.film-top-tool-btn--danger:hover:not(:disabled) {
        color: var(--nxt1-color-danger);
      }

      .film-popout__controls {
        position: absolute;
        left: 10px;
        right: 10px;
        bottom: 10px;
        --nxt-video-controls-seek-track-height: 4px;
        --nxt-video-controls-seek-thumb-size: 14px;
        --nxt-video-controls-seek-thumb-hover-scale: 1.12;
        --nxt-video-controls-seek-thumb-hover-ring-size: 5px;
        z-index: 3;
      }

      .film-popout__empty {
        display: grid;
        gap: 8px;
        text-align: center;
      }

      .film-popout__empty h2 {
        margin: 0;
        font-size: 18px;
      }

      .film-popout__empty p {
        margin: 0;
        color: #94a3b8;
        font-size: 13px;
      }

      @media (max-width: 760px) {
        .film-popout__header {
          padding-inline: 12px;
        }

        .film-popout__controls {
          left: 6px;
          right: 6px;
          bottom: 6px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXFilmReviewPopoutComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly player = viewChild<ElementRef<HTMLVideoElement>>('filmPlayer');
  private readonly drawCanvas = viewChild<ElementRef<HTMLCanvasElement>>('drawCanvas');
  private readonly playerContainer = viewChild<ElementRef<HTMLDivElement>>('playerContainer');

  protected readonly playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
  protected readonly inlinePlayOverlayCollapseIconPath = 'M15 6L9 12L15 18';
  protected readonly inlinePlayOverlayExpandIconPath = 'M9 6L15 12L9 18';
  protected readonly filmFrameStepSeconds = 1 / 30;
  protected readonly title = signal('Film Review');
  protected readonly videoUrl = signal('');
  protected readonly status = signal('Loading');
  protected readonly isPlaying = signal(false);
  protected readonly currentTime = signal(0);
  protected readonly duration = signal(0);
  protected readonly playbackRate = signal(1);
  protected readonly currentInlinePlayOverlayCounter = signal<string | null>(null);
  protected readonly currentInlinePlayOverlayItems = signal<
    readonly FilmReviewPopoutPlayMetaItem[]
  >([]);
  protected readonly isInlinePlayOverlayExpanded = signal(true);
  protected readonly drawModeEnabled = signal(false);
  protected readonly hasDrawing = signal(false);
  protected readonly loadedPayload = computed(() => this.videoUrl().trim().length > 0);

  private drawStrokes: Array<Array<{ x: number; y: number }>> = [];
  private activeStroke: Array<{ x: number; y: number }> = [];
  private isDrawStrokeInProgress = false;

  constructor() {
    afterNextRender(() => {
      this.loadPayload();
    });
  }

  protected onPlayerLoadedMetadata(): void {
    const video = this.player()?.nativeElement;
    if (!video) return;

    this.duration.set(Number.isFinite(video.duration) ? video.duration : 0);
    this.status.set('Ready');

    const startTimeSec = this.readPayload()?.startTimeSec ?? 0;
    if (Number.isFinite(startTimeSec) && startTimeSec > 0 && startTimeSec < video.duration) {
      video.currentTime = startTimeSec;
      this.currentTime.set(startTimeSec);
    }
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();
  }

  @HostListener('document:fullscreenchange')
  @HostListener('document:webkitfullscreenchange')
  protected onFullscreenChange(): void {
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();
  }

  protected onPlayerTimeUpdate(): void {
    const video = this.player()?.nativeElement;
    if (!video) return;
    this.currentTime.set(video.currentTime || 0);
    this.duration.set(Number.isFinite(video.duration) ? video.duration : 0);
  }

  protected onPlayerPlay(): void {
    this.isPlaying.set(true);
    this.status.set('Playing');
  }

  protected onPlayerPause(): void {
    this.isPlaying.set(false);
    this.status.set('Paused');
  }

  protected onPlayerEnded(): void {
    this.isPlaying.set(false);
    this.status.set('Ended');
  }

  protected onPlayerError(): void {
    this.status.set('Video unavailable');
  }

  protected togglePlayPause(): void {
    const video = this.player()?.nativeElement;
    if (!video) return;

    if (video.paused || video.ended) {
      void video.play().catch(() => this.status.set('Playback blocked'));
      return;
    }

    video.pause();
  }

  protected seekRelative(deltaSeconds: number): void {
    const video = this.player()?.nativeElement;
    if (!video) return;

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (duration <= 0) return;

    video.currentTime = Math.min(duration, Math.max(0, (video.currentTime || 0) + deltaSeconds));
    this.currentTime.set(video.currentTime);
  }

  protected seekTo(timeSeconds: number): void {
    const video = this.player()?.nativeElement;
    if (!video || !Number.isFinite(timeSeconds)) return;

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    video.currentTime = Math.min(duration || timeSeconds, Math.max(0, timeSeconds));
    this.currentTime.set(video.currentTime);
  }

  protected onSeekStart(): void {
    this.status.set('Scrubbing');
  }

  protected onSeekEnd(): void {
    this.status.set(this.isPlaying() ? 'Playing' : 'Ready');
  }

  protected setPlaybackRate(rate: number): void {
    const video = this.player()?.nativeElement;
    if (!video || !Number.isFinite(rate) || rate <= 0) return;

    video.playbackRate = rate;
    this.playbackRate.set(rate);
  }

  protected async toggleFullscreen(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const container = this.playerContainer()?.nativeElement;
    if (!container) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }

    await container.requestFullscreen().catch(() => undefined);
  }

  protected toggleInlinePlayOverlay(): void {
    this.isInlinePlayOverlayExpanded.update((expanded) => !expanded);
  }

  protected toggleDrawMode(): void {
    const enabled = !this.drawModeEnabled();
    this.drawModeEnabled.set(enabled);
    this.isDrawStrokeInProgress = false;
    this.activeStroke = [];
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();
  }

  protected clearDrawOverlay(): void {
    this.drawStrokes = [];
    this.activeStroke = [];
    this.isDrawStrokeInProgress = false;
    this.hasDrawing.set(false);
    this.renderDrawOverlay();
  }

  protected onDrawPointerDown(event: PointerEvent): void {
    if (!this.drawModeEnabled()) return;

    const canvas = this.drawCanvas()?.nativeElement;
    if (!canvas) return;

    event.preventDefault();
    this.ensureDrawCanvasSize();

    const point = this.toNormalizedDrawPoint(event, canvas);
    this.activeStroke = [point];
    this.drawStrokes.push(this.activeStroke);
    this.isDrawStrokeInProgress = true;
    canvas.setPointerCapture?.(event.pointerId);
    this.hasDrawing.set(true);
    this.renderDrawOverlay();
  }

  protected onDrawPointerMove(event: PointerEvent): void {
    if (!this.drawModeEnabled() || !this.isDrawStrokeInProgress || !this.activeStroke.length) {
      return;
    }

    const canvas = this.drawCanvas()?.nativeElement;
    if (!canvas) return;

    event.preventDefault();
    this.activeStroke.push(this.toNormalizedDrawPoint(event, canvas));
    this.renderDrawOverlay();
  }

  protected onDrawPointerUp(event: PointerEvent): void {
    if (!this.drawModeEnabled()) return;

    const canvas = this.drawCanvas()?.nativeElement;
    if (!canvas) return;

    canvas.releasePointerCapture?.(event.pointerId);
    this.isDrawStrokeInProgress = false;
    this.activeStroke = [];
  }

  private loadPayload(): void {
    const payload = this.readPayload();
    if (!payload) {
      this.status.set('Video unavailable');
      return;
    }

    this.title.set(payload.title || 'Film Review');
    this.videoUrl.set(payload.videoUrl);
    this.currentInlinePlayOverlayCounter.set(payload.playCounter ?? null);
    this.currentInlinePlayOverlayItems.set(payload.playDetails ?? []);
    this.status.set('Loading');
    document.title = `NXT1 Film Review | ${payload.title || 'Film Review'}`;
  }

  private readPayload(): FilmReviewPopoutPayload | null {
    if (!isPlatformBrowser(this.platformId)) return null;

    const sessionId = this.route.snapshot.queryParamMap.get('session')?.trim();
    if (!sessionId) return null;

    try {
      const rawPayload = window.sessionStorage.getItem(
        `${FILM_REVIEW_POPOUT_STORAGE_PREFIX}${sessionId}`
      );
      if (!rawPayload) return null;

      const parsedPayload = JSON.parse(rawPayload) as Partial<FilmReviewPopoutPayload>;
      if (!parsedPayload.videoUrl || typeof parsedPayload.videoUrl !== 'string') return null;

      return {
        videoUrl: parsedPayload.videoUrl,
        title: typeof parsedPayload.title === 'string' ? parsedPayload.title : 'Film Review',
        startTimeSec:
          typeof parsedPayload.startTimeSec === 'number' &&
          Number.isFinite(parsedPayload.startTimeSec)
            ? parsedPayload.startTimeSec
            : 0,
        playCounter:
          typeof parsedPayload.playCounter === 'string' ? parsedPayload.playCounter : null,
        playDetails: this.parsePlayDetails(parsedPayload.playDetails),
      };
    } catch {
      return null;
    }
  }

  private parsePlayDetails(value: unknown): readonly FilmReviewPopoutPlayMetaItem[] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item): FilmReviewPopoutPlayMetaItem | null => {
        if (!item || typeof item !== 'object') return null;

        const maybeItem = item as Partial<FilmReviewPopoutPlayMetaItem>;
        if (typeof maybeItem.label !== 'string' || typeof maybeItem.value !== 'string') {
          return null;
        }

        return {
          label: maybeItem.label,
          value: maybeItem.value,
        };
      })
      .filter((item): item is FilmReviewPopoutPlayMetaItem => item !== null);
  }

  private ensureDrawCanvasSize(): void {
    const canvas = this.drawCanvas()?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const ratio = isPlatformBrowser(this.platformId) ? window.devicePixelRatio || 1 : 1;
    const targetWidth = Math.max(1, Math.round(width * ratio));
    const targetHeight = Math.max(1, Math.round(height * ratio));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
  }

  private renderDrawOverlay(): void {
    const canvas = this.drawCanvas()?.nativeElement;
    if (!canvas) return;

    this.ensureDrawCanvasSize();
    const context = canvas.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.drawStrokes.length) return;

    context.save();
    context.strokeStyle = '#ccff00';
    context.lineWidth = Math.max(3, Math.round(Math.min(canvas.width, canvas.height) * 0.004));
    context.lineCap = 'round';
    context.lineJoin = 'round';

    for (const stroke of this.drawStrokes) {
      if (!stroke.length) continue;

      context.beginPath();
      context.moveTo(stroke[0]!.x * canvas.width, stroke[0]!.y * canvas.height);
      for (const point of stroke.slice(1)) {
        context.lineTo(point.x * canvas.width, point.y * canvas.height);
      }
      context.stroke();
    }

    context.restore();
  }

  private toNormalizedDrawPoint(
    event: PointerEvent,
    canvas: HTMLCanvasElement
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return { x: 0, y: 0 };
    }

    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }
}
