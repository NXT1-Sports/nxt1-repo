import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NxtIconComponent } from '../icon';
import { VIDEO_CONTROL_TOOLTIP_STYLES } from './video-control-tooltips.styles';

@Component({
  selector: 'nxt1-video-controls',
  standalone: true,
  imports: [NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="video-controls"
      aria-label="Video controls"
      (pointerdown)="$event.stopPropagation()"
      (pointermove)="$event.stopPropagation()"
      (pointerup)="$event.stopPropagation()"
      (click)="$event.stopPropagation()"
    >
      <div class="video-controls__progress">
        <input
          type="range"
          class="video-controls__seek"
          min="0"
          [max]="seekMax()"
          step="any"
          [value]="seekDisplayValue()"
          [style.--seek-progress]="seekProgress()"
          (pointerdown)="onSeekStart()"
          (pointerup)="onSeekCommit($event)"
          (pointercancel)="onSeekEnd()"
          (input)="onSeekInput($event)"
          (change)="onSeekCommit($event)"
          aria-label="Seek video timeline"
        />
      </div>

      <div class="video-controls__dock">
        <div class="video-controls__cluster">
          @if (showAdvancedPlaybackControls()) {
            <button
              type="button"
              class="video-controls__icon-btn video-controls__tooltip-host"
              [disabled]="isAtStart()"
              (click)="seekChange.emit(0)"
              aria-label="Jump to start"
              title="Jump to start"
              data-tooltip="Jump to start"
            >
              <nxt1-icon name="jumpToStart" [size]="13"></nxt1-icon>
            </button>
            <button
              type="button"
              class="video-controls__icon-btn video-controls__tooltip-host"
              [disabled]="isAtStart()"
              (click)="seekRelative.emit(-15)"
              aria-label="Fast rewind"
              title="Fast rewind"
              data-tooltip="Fast rewind"
            >
              <nxt1-icon name="fastRewind" [size]="13"></nxt1-icon>
            </button>
            <button
              type="button"
              class="video-controls__icon-btn video-controls__tooltip-host"
              [disabled]="isAtStart()"
              (click)="seekRelative.emit(-7)"
              aria-label="Rewind"
              title="Rewind"
              data-tooltip="Rewind"
            >
              <nxt1-icon name="rewind" [size]="13"></nxt1-icon>
            </button>
            <button
              type="button"
              class="video-controls__icon-btn video-controls__tooltip-host"
              (click)="seekRelative.emit(-5)"
              aria-label="Skip back 5 seconds"
              title="Skip back 5 seconds"
              data-tooltip="Skip back 5 seconds"
            >
              <nxt1-icon name="skipBack" [size]="12"></nxt1-icon>
            </button>
          }

          <button
            type="button"
            class="video-controls__icon-btn video-controls__icon-btn--primary video-controls__tooltip-host"
            (click)="playPause.emit()"
            [attr.aria-label]="isPlaying() ? 'Pause video' : 'Play video'"
            [attr.title]="isPlaying() ? 'Pause video' : 'Play video'"
            [attr.data-tooltip]="isPlaying() ? 'Pause video' : 'Play video'"
          >
            <nxt1-icon [name]="isPlaying() ? 'pause' : 'play'" [size]="13"></nxt1-icon>
          </button>

          @if (showAdvancedPlaybackControls()) {
            <button
              type="button"
              class="video-controls__icon-btn video-controls__tooltip-host"
              (click)="seekRelative.emit(5)"
              aria-label="Skip forward 5 seconds"
              title="Skip forward 5 seconds"
              data-tooltip="Skip forward 5 seconds"
            >
              <nxt1-icon name="skipForward" [size]="12"></nxt1-icon>
            </button>
            <button
              type="button"
              class="video-controls__icon-btn video-controls__tooltip-host"
              [disabled]="isAtEnd()"
              (click)="seekRelative.emit(7)"
              aria-label="Forward"
              title="Forward"
              data-tooltip="Forward"
            >
              <nxt1-icon name="forward" [size]="13"></nxt1-icon>
            </button>
            <button
              type="button"
              class="video-controls__icon-btn video-controls__tooltip-host"
              [disabled]="isAtEnd()"
              (click)="seekRelative.emit(15)"
              aria-label="Fast forward"
              title="Fast forward"
              data-tooltip="Fast forward"
            >
              <nxt1-icon name="fastForward" [size]="13"></nxt1-icon>
            </button>
            <button
              type="button"
              class="video-controls__icon-btn video-controls__tooltip-host"
              [disabled]="isAtEnd()"
              (click)="seekChange.emit(seekMax())"
              aria-label="Next play (jump to end)"
              title="Next play (jump to end)"
              data-tooltip="Next play (jump to end)"
            >
              <nxt1-icon name="jumpToEnd" [size]="13"></nxt1-icon>
            </button>
          }
        </div>

        <div class="video-controls__cluster video-controls__cluster--right">
          @if (showSpeedControls()) {
            <div class="video-controls__speed-pills" role="group" aria-label="Playback speed">
              @for (rate of playbackRates(); track rate) {
                <button
                  type="button"
                  class="video-controls__speed-pill video-controls__tooltip-host"
                  [class.video-controls__speed-pill--active]="playbackRate() === rate"
                  (click)="playbackRateChange.emit(rate)"
                  [attr.title]="formatRateLabel(rate)"
                  [attr.data-tooltip]="formatRateLabel(rate)"
                >
                  {{ rate }}x
                </button>
              }
            </div>
          }

          @if (showOpenInNewWindow()) {
            <button
              type="button"
              class="video-controls__icon-btn video-controls__tooltip-host"
              (click)="openInNewWindow.emit()"
              aria-label="Open video in new window"
              title="Open video in new window"
              data-tooltip="Open video in new window"
            >
              <nxt1-icon name="openInNew" [size]="13"></nxt1-icon>
            </button>
          }

          @if (showFullscreen()) {
            <button
              type="button"
              class="video-controls__icon-btn video-controls__tooltip-host"
              (click)="fullscreenToggle.emit()"
              aria-label="Toggle fullscreen"
              title="Toggle fullscreen"
              data-tooltip="Toggle fullscreen"
            >
              <nxt1-icon name="expand" [size]="12"></nxt1-icon>
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .video-controls {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-1, 4px);
        border-radius: var(--nxt1-border-radius-sm, 6px);
      }

      .video-controls__progress {
        display: flex;
        align-items: center;
      }

      .video-controls__seek {
        width: 100%;
        height: 3px;
        -webkit-appearance: none;
        appearance: none;
        border-radius: 999px;
        border: none;
        outline: none;
        cursor: pointer;
        background: linear-gradient(
          to right,
          var(--nxt1-color-primary) 0%,
          var(--nxt1-color-primary) var(--seek-progress, 0%),
          var(--nxt1-color-border-strong) var(--seek-progress, 0%),
          var(--nxt1-color-border-strong) 100%
        );
      }

      .video-controls__seek::-webkit-slider-runnable-track {
        height: 3px;
        background: transparent;
        border-radius: 999px;
      }

      .video-controls__seek::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 10px;
        height: 10px;
        margin-top: -3.5px;
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        border: 1px solid var(--nxt1-color-border-default);
      }

      .video-controls__seek::-moz-range-track {
        height: 3px;
        background: transparent;
        border-radius: 999px;
      }

      .video-controls__seek::-moz-range-thumb {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        border: 1px solid var(--nxt1-color-border-default);
      }

      .video-controls__dock {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-1, 4px);
        flex-wrap: wrap;
      }

      .video-controls__cluster {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-1, 4px);
        border-radius: var(--nxt1-border-radius-sm, 6px);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 68%, transparent);
        border: 1px solid var(--nxt1-color-border-subtle);
        backdrop-filter: blur(6px);
      }

      .video-controls__cluster--right {
        margin-left: auto;
      }

      .video-controls__icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
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

      .video-controls__icon-btn:hover:not(:disabled) {
        color: var(--nxt1-color-primary);
      }

      .video-controls__icon-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .video-controls__icon-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .video-controls__icon-btn--primary {
        color: var(--nxt1-color-primary);
      }

      .video-controls__speed-pills {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: 0;
        border-radius: 0;
        background: transparent;
        border: 0;
      }

      .video-controls__speed-pill {
        position: relative;
        min-width: 24px;
        padding: 0 6px;
        min-height: 24px;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        transition: color 0.16s ease;
      }

      .video-controls__speed-pill:hover {
        color: var(--nxt1-color-primary);
      }

      .video-controls__speed-pill--active {
        color: var(--nxt1-color-primary);
      }

      @media (max-width: 1024px) {
        .video-controls__dock {
          gap: 6px;
        }

        .video-controls__cluster,
        .video-controls__cluster--right {
          margin-left: 0;
          flex-wrap: wrap;
        }
      }
    `,
    VIDEO_CONTROL_TOOLTIP_STYLES,
  ],
})
export class NxtVideoControlsComponent {
  readonly isPlaying = input(false);
  readonly currentTime = input(0);
  readonly duration = input(0);

  readonly playbackRate = input(1);
  readonly playbackRates = input<readonly number[]>([0.5, 0.75, 1, 1.25, 1.5, 2]);

  readonly showSpeedControls = input(true);
  readonly showFullscreen = input(true);
  readonly showOpenInNewWindow = input(false);
  readonly showPlayNavigation = input(false);
  readonly showAdvancedPlaybackControls = input(false);
  readonly frameStepSeconds = input(1 / 30);
  readonly disablePreviousNav = input(false);
  readonly disableNextNav = input(false);
  readonly previousNavAriaLabel = input('Previous tagged play');
  readonly nextNavAriaLabel = input('Next tagged play');

  readonly playPause = output<void>();
  readonly seekRelative = output<number>();
  readonly seekChange = output<number>();
  readonly seekStart = output<void>();
  readonly seekEnd = output<void>();
  readonly playbackRateChange = output<number>();
  readonly fullscreenToggle = output<void>();
  readonly openInNewWindow = output<void>();
  readonly previousNav = output<void>();
  readonly nextNav = output<void>();

  private readonly isScrubbing = signal(false);
  private readonly scrubValue = signal(0);

  protected readonly seekMax = computed(() => Math.max(0.1, Number(this.duration()) || 0.1));
  protected readonly safeCurrentTime = computed(() => {
    const current = Number(this.currentTime()) || 0;
    return Math.max(0, Math.min(current, this.seekMax()));
  });
  protected readonly seekDisplayValue = computed(() =>
    this.isScrubbing() ? this.scrubValue() : this.safeCurrentTime()
  );
  protected readonly seekProgress = computed(() => {
    const max = this.seekMax();
    const current = this.seekDisplayValue();
    const pct = Math.min(100, Math.max(0, (current / max) * 100));
    return `${pct}%`;
  });
  protected readonly isAtStart = computed(() => this.safeCurrentTime() <= 0.05);
  protected readonly isAtEnd = computed(() => {
    const duration = Number(this.duration()) || 0;
    return duration <= 0 || this.safeCurrentTime() >= duration - 0.05;
  });

  protected onSeekStart(): void {
    this.isScrubbing.set(true);
    this.scrubValue.set(this.safeCurrentTime());
    this.seekStart.emit();
  }

  protected onSeekEnd(): void {
    this.isScrubbing.set(false);
    this.seekEnd.emit();
  }

  protected onSeekInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement | null;
    const nextTime = Number(inputEl?.value ?? '0');
    if (!Number.isFinite(nextTime)) return;
    this.scrubValue.set(Math.max(0, Math.min(nextTime, this.seekMax())));
    this.seekChange.emit(nextTime);
  }

  protected onSeekCommit(event: Event): void {
    this.onSeekInput(event);
    this.onSeekEnd();
  }

  protected formatRateLabel(rate: number): string {
    return `${rate}x playback speed`;
  }
}
