import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NxtIconComponent } from '../icon';
import { VIDEO_CONTROL_TOOLTIP_STYLES } from './video-control-tooltips.styles';

const NXT_VIDEO_CONTROLS_SHARED_STYLES = `
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
        position: relative;
        z-index: 1;
      }

      .video-controls__seek-track {
        position: relative;
        width: 100%;
      }

      .video-controls__seek {
        position: relative;
        z-index: 1;
        width: 100%;
        height: var(--nxt-video-controls-seek-track-height, 3px);
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
        height: var(--nxt-video-controls-seek-track-height, 3px);
        background: transparent;
        border-radius: 999px;
      }

      .video-controls__seek::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: var(--nxt-video-controls-seek-thumb-size, 10px);
        height: var(--nxt-video-controls-seek-thumb-size, 10px);
        margin-top: calc(
          (
              var(--nxt-video-controls-seek-track-height, 3px) -
                var(--nxt-video-controls-seek-thumb-size, 10px)
            ) / 2
        );
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        border: 1px solid var(--nxt1-color-border-default);
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent);
        transition:
          transform 160ms ease,
          box-shadow 160ms ease,
          background-color 160ms ease;
      }

      .video-controls__seek::-moz-range-track {
        height: var(--nxt-video-controls-seek-track-height, 3px);
        background: transparent;
        border-radius: 999px;
      }

      .video-controls__seek::-moz-range-thumb {
        width: var(--nxt-video-controls-seek-thumb-size, 10px);
        height: var(--nxt-video-controls-seek-thumb-size, 10px);
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        border: 1px solid var(--nxt1-color-border-default);
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent);
        transition:
          transform 160ms ease,
          box-shadow 160ms ease,
          background-color 160ms ease;
      }

      .video-controls__seek:hover::-webkit-slider-thumb,
      .video-controls__seek:focus-visible::-webkit-slider-thumb,
      .video-controls__seek:active::-webkit-slider-thumb {
        transform: scale(var(--nxt-video-controls-seek-thumb-hover-scale, 1.12));
        box-shadow: 0 0 0 var(--nxt-video-controls-seek-thumb-hover-ring-size, 4px)
          color-mix(in srgb, var(--nxt1-color-primary) 16%, transparent);
      }

      .video-controls__seek:hover::-moz-range-thumb,
      .video-controls__seek:focus-visible::-moz-range-thumb,
      .video-controls__seek:active::-moz-range-thumb {
        transform: scale(var(--nxt-video-controls-seek-thumb-hover-scale, 1.12));
        box-shadow: 0 0 0 var(--nxt-video-controls-seek-thumb-hover-ring-size, 4px)
          color-mix(in srgb, var(--nxt1-color-primary) 16%, transparent);
      }

      .video-controls__dock {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-1, 4px);
        flex-wrap: wrap;
        position: relative;
        z-index: 2;
      }

      .video-controls__cluster {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-1, 4px);
        border-radius: var(--nxt1-border-radius-sm, 6px);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 76%, transparent);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 78%, transparent);
        box-shadow: 0 10px 28px color-mix(in srgb, #000 30%, transparent);
        backdrop-filter: blur(10px);
      }

      .video-controls__cluster--right {
        margin-left: auto;
      }

      .video-controls__cluster--duration {
        gap: 6px;
        padding-inline: 10px;
      }

      .video-controls__duration-label {
        color: var(--nxt1-color-text-secondary);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      .video-controls__duration-value {
        color: var(--nxt1-color-text-primary);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.01em;
        font-variant-numeric: tabular-nums;
      }

      .video-controls__cluster--transport {
        gap: 2px;
        padding: 3px;
      }

      .video-controls__divider {
        width: 1px;
        height: 18px;
        margin: 0 2px;
        background: color-mix(in srgb, var(--nxt1-color-border-subtle) 85%, transparent);
      }

      .video-controls__icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        gap: 0;
        min-height: 28px;
        min-width: 28px;
        padding: 0;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        transition: all 0.18s cubic-bezier(0.23, 1, 0.32, 1);
      }

      .video-controls__icon-btn:hover:not(:disabled) {
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
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
        background: color-mix(in srgb, var(--nxt1-color-primary) 16%, transparent);
      }

      .video-controls__icon-btn--primary:hover:not(:disabled) {
        background: color-mix(in srgb, var(--nxt1-color-primary) 24%, transparent);
      }

      :host-context([data-theme='light']) .video-controls__icon-btn--primary {
        color: var(
          --nxt1-color-text-onPrimary,
          var(--nxt1-color-text-on-primary, #0a0a0a)
        );
      }

      .video-controls__speed-menu {
        position: relative;
        display: inline-flex;
        z-index: 4;
      }

      .video-controls__speed-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-height: 28px;
        min-width: 50px;
        padding: 0 8px;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
        cursor: pointer;
        transition:
          background 0.16s ease,
          color 0.16s ease;
      }

      .video-controls__speed-trigger:hover,
      .video-controls__speed-trigger--open {
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
        color: var(--nxt1-color-primary);
      }

      .video-controls__speed-trigger:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .video-controls__speed-trigger-label {
        min-width: 18px;
        text-align: center;
      }

      .video-controls__speed-popover {
        position: absolute;
        right: 0;
        bottom: calc(100% + 8px);
        z-index: 40;
        display: grid;
        min-width: 94px;
        padding: 4px;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 86%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 92%, #000 8%);
        box-shadow: 0 18px 38px color-mix(in srgb, #000 44%, transparent);
        backdrop-filter: blur(12px);
      }

      .video-controls__speed-option {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 26px;
        padding: 0 10px;
        border: 0;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: 10px;
        font-weight: 800;
        cursor: pointer;
        transition:
          background 0.16s ease,
          color 0.16s ease;
      }

      .video-controls__speed-option:hover,
      .video-controls__speed-option--active {
        background: color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent);
        color: var(--nxt1-color-primary);
      }

      .video-controls__speed-option:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
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
`;

const VIDEO_CONTROL_TOOLTIP_MAX_WIDTH_PX = 180;
const VIDEO_CONTROL_TOOLTIP_VIEWPORT_GUTTER_PX = 12;
const VIDEO_CONTROL_TOOLTIP_MIN_WIDTH_PX = 48;
const VIDEO_CONTROL_TOOLTIP_ESTIMATED_CHAR_WIDTH_PX = 6.25;
const VIDEO_CONTROL_TOOLTIP_HORIZONTAL_PADDING_PX = 14;

type DrawSegment = {
  readonly startSec: number;
  readonly endSec: number;
};

type DrawEffectMarker = {
  readonly id: string;
  readonly atSec: number;
  readonly durationSec: number;
};

@Component({
  selector: 'nxt1-video-controls',
  standalone: true,
  imports: [NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="video-controls"
      aria-label="Video controls"
      (mouseover)="onTooltipHostMouseOver($event)"
      (focusin)="onTooltipHostFocusIn($event)"
      (pointerdown)="$event.stopPropagation()"
      (pointermove)="$event.stopPropagation()"
      (pointerup)="$event.stopPropagation()"
      (click)="$event.stopPropagation()"
    >
      <div class="video-controls__progress">
        <div class="video-controls__seek-track" #seekTrack>
          @if (resolvedDrawEffectMarkers().length > 0) {
            <div class="video-controls__effect-markers" aria-label="Video effects timeline markers">
              @for (marker of resolvedDrawEffectMarkers(); track marker.id) {
                <div
                  class="video-controls__effect-marker-anchor"
                  [style.left.%]="marker.positionPct"
                >
                  <button
                    type="button"
                    class="video-controls__effect-marker video-controls__tooltip-host"
                    [class.video-controls__effect-marker--active]="
                      activeDrawEffectMarkerId() === marker.id
                    "
                    aria-label="Edit effect"
                    title="Edit effect"
                    data-tooltip="Edit effect"
                    (click)="onToggleDrawEffectMarkerMenu(marker.id)"
                  ></button>

                  @if (activeDrawEffectMarkerId() === marker.id) {
                    <div
                      class="video-controls__effect-popover"
                      [class.video-controls__effect-popover--align-start]="
                        marker.alignment === 'start'
                      "
                      [class.video-controls__effect-popover--align-end]="marker.alignment === 'end'"
                      role="dialog"
                      aria-label="Effect options"
                      (pointerdown)="$event.stopPropagation()"
                      (click)="$event.stopPropagation()"
                    >
                      <div class="video-controls__effect-popover-row">
                        <span class="video-controls__effect-popover-label">Duration</span>
                        <div class="video-controls__effect-duration-controls">
                          <button
                            type="button"
                            class="video-controls__effect-action-btn"
                            aria-label="Reduce effect duration"
                            title="Reduce effect duration"
                            (click)="onAdjustDrawEffectDuration(marker, -0.5)"
                          >
                            <nxt1-icon name="minus" [size]="10"></nxt1-icon>
                          </button>
                          <div class="video-controls__effect-duration-input-shell">
                            <input
                              type="number"
                              class="video-controls__effect-duration-input"
                              min="0.1"
                              step="0.1"
                              [value]="formatDurationInputValue(marker.durationSec)"
                              aria-label="Effect duration in seconds"
                              (change)="onDrawEffectDurationInput(marker, $event)"
                              (keydown.enter)="onDrawEffectDurationInput(marker, $event)"
                            />
                            <span class="video-controls__effect-duration-unit">s</span>
                          </div>
                          <button
                            type="button"
                            class="video-controls__effect-action-btn"
                            aria-label="Increase effect duration"
                            title="Increase effect duration"
                            (click)="onAdjustDrawEffectDuration(marker, 0.5)"
                          >
                            <nxt1-icon name="plus" [size]="10"></nxt1-icon>
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="video-controls__effect-delete-btn"
                        (click)="onDeleteDrawEffectMarker(marker.id)"
                      >
                        Delete effect
                      </button>
                    </div>
                  }
                </div>
                <ng-content select="[nxtVideoControlsBeforeSpeed]"></ng-content>
              }
            </div>
          }

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

          @if (showDrawSegmentEditor() && resolvedDrawSegment(); as drawSegment) {
            <div
              class="video-controls__draw-segment"
              [style.left.%]="drawSegmentStartPct()"
              [style.width.%]="drawSegmentWidthPct()"
            >
              <button
                type="button"
                class="video-controls__draw-handle video-controls__draw-handle--start video-controls__tooltip-host"
                aria-label="Drawing start handle"
                title="Drawing start"
                data-tooltip="Drawing start"
                (pointerdown)="onDrawSegmentPointerDown($event, 'start')"
              >
                <nxt1-icon name="pencil" [size]="9"></nxt1-icon>
              </button>
              <button
                type="button"
                class="video-controls__draw-range video-controls__tooltip-host"
                [attr.aria-label]="'Move drawing window: ' + formattedDrawSegmentDuration()"
                [attr.title]="'Move drawing window (' + formattedDrawSegmentDuration() + ')'"
                [attr.data-tooltip]="'Move drawing window (' + formattedDrawSegmentDuration() + ')'"
                (pointerdown)="onDrawSegmentPointerDown($event, 'move')"
              >
                <span class="video-controls__draw-range-dot" aria-hidden="true"></span>
              </button>
              <button
                type="button"
                class="video-controls__draw-handle video-controls__draw-handle--end video-controls__tooltip-host"
                aria-label="Drawing end handle"
                title="Drawing end"
                data-tooltip="Drawing end"
                (pointerdown)="onDrawSegmentPointerDown($event, 'end')"
              >
                <nxt1-icon name="pencil" [size]="9"></nxt1-icon>
              </button>
            </div>
          }
        </div>
      </div>

      <div class="video-controls__dock">
        <div class="video-controls__cluster video-controls__cluster--transport">
          @if (allowTransportCollapse() && !compactMode()) {
            <button
              type="button"
              class="video-controls__icon-btn video-controls__transport-toggle video-controls__tooltip-host"
              (click)="toggleTransportExpanded()"
              [attr.aria-label]="
                transportExpanded() ? 'Collapse playback controls' : 'Expand playback controls'
              "
              [attr.title]="
                transportExpanded() ? 'Collapse playback controls' : 'Expand playback controls'
              "
              [attr.data-tooltip]="
                transportExpanded() ? 'Collapse playback controls' : 'Expand playback controls'
              "
              [attr.aria-expanded]="transportExpanded()"
            >
              <nxt1-icon
                [name]="transportExpanded() ? 'chevronLeft' : 'chevronRight'"
                [size]="12"
              />
            </button>
          }

          @if (transportExpanded()) {
            @if (showPlayNavigation()) {
              <button
                type="button"
                class="video-controls__icon-btn video-controls__tooltip-host"
                [disabled]="disablePreviousNav()"
                (click)="previousNav.emit()"
                [attr.aria-label]="previousNavAriaLabel()"
                [attr.title]="previousNavAriaLabel()"
                [attr.data-tooltip]="previousNavAriaLabel()"
              >
                <nxt1-icon name="previousClip" [size]="13"></nxt1-icon>
              </button>
              <span class="video-controls__divider" aria-hidden="true"></span>
            }

            @if (showAdvancedPlaybackControls()) {
              <button
                type="button"
                class="video-controls__icon-btn video-controls__tooltip-host"
                [disabled]="isAtStart()"
                (click)="onFastSeekClick(-1)"
                (pointerdown)="onFastSeekPointerDown($event, -1)"
                (pointerup)="onTransportSeekPointerUp()"
                (pointercancel)="onTransportSeekPointerUp()"
                (pointerleave)="onTransportSeekPointerUp()"
                aria-label="Fast rewind"
                title="Fast rewind"
                data-tooltip="Fast rewind"
              >
                <nxt1-icon name="fastRewind" [size]="13"></nxt1-icon>
              </button>
              <button
                type="button"
                class="video-controls__icon-btn video-controls__tooltip-host"
                (click)="onSlowSeekClick(-1)"
                (pointerdown)="onSlowSeekPointerDown($event, -1)"
                (pointerup)="onTransportSeekPointerUp()"
                (pointercancel)="onTransportSeekPointerUp()"
                (pointerleave)="onTransportSeekPointerUp()"
                aria-label="Slow rewind"
                title="Slow rewind"
                data-tooltip="Slow rewind"
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
                (click)="onSlowSeekClick(1)"
                (pointerdown)="onSlowSeekPointerDown($event, 1)"
                (pointerup)="onTransportSeekPointerUp()"
                (pointercancel)="onTransportSeekPointerUp()"
                (pointerleave)="onTransportSeekPointerUp()"
                aria-label="Slow forward"
                title="Slow forward"
                data-tooltip="Slow forward"
              >
                <nxt1-icon name="forward" [size]="13"></nxt1-icon>
              </button>
              <button
                type="button"
                class="video-controls__icon-btn video-controls__tooltip-host"
                [disabled]="isAtEnd()"
                (click)="onFastSeekClick(1)"
                (pointerdown)="onFastSeekPointerDown($event, 1)"
                (pointerup)="onTransportSeekPointerUp()"
                (pointercancel)="onTransportSeekPointerUp()"
                (pointerleave)="onTransportSeekPointerUp()"
                aria-label="Fast forward"
                title="Fast forward"
                data-tooltip="Fast forward"
              >
                <nxt1-icon name="fastForward" [size]="13"></nxt1-icon>
              </button>
            }

            @if (showPlayNavigation()) {
              <span class="video-controls__divider" aria-hidden="true"></span>
              <button
                type="button"
                class="video-controls__icon-btn video-controls__tooltip-host"
                [disabled]="disableNextNav()"
                (click)="nextNav.emit()"
                [attr.aria-label]="nextNavAriaLabel()"
                [attr.title]="nextNavAriaLabel()"
                [attr.data-tooltip]="nextNavAriaLabel()"
              >
                <nxt1-icon name="nextClip" [size]="13"></nxt1-icon>
              </button>
            }
          }

          @if (!transportExpanded()) {
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
          }
        </div>

        @if (showDurationBadge()) {
          <div
            class="video-controls__cluster video-controls__cluster--duration"
            aria-label="Clip duration"
          >
            <span class="video-controls__duration-label">Clip</span>
            <span class="video-controls__duration-value"
              >{{ formattedCurrentTime() }} / {{ formattedDuration() }}</span
            >
          </div>
        }

        <div class="video-controls__cluster video-controls__cluster--right">
          @if (showSpeedControls()) {
            <div class="video-controls__speed-menu" role="group" aria-label="Playback speed">
              <button
                type="button"
                class="video-controls__speed-trigger video-controls__tooltip-host"
                [class.video-controls__speed-trigger--open]="speedMenuOpen()"
                [attr.aria-expanded]="speedMenuOpen()"
                aria-haspopup="menu"
                aria-label="Playback speed"
                title="Playback speed"
                data-tooltip="Playback speed"
                (click)="toggleSpeedMenu()"
              >
                <span class="video-controls__speed-trigger-label">{{ playbackRate() }}x</span>
                <nxt1-icon name="chevronDown" [size]="10"></nxt1-icon>
              </button>

              @if (speedMenuOpen()) {
                <div
                  class="video-controls__speed-popover"
                  role="menu"
                  aria-label="Playback speed options"
                >
                  @for (rate of playbackRates(); track rate) {
                    <button
                      type="button"
                      class="video-controls__speed-option"
                      [class.video-controls__speed-option--active]="playbackRate() === rate"
                      role="menuitemradio"
                      [attr.aria-checked]="playbackRate() === rate"
                      (click)="selectPlaybackRate(rate)"
                    >
                      <span>{{ rate }}x</span>
                    </button>
                  }
                </div>
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
    NXT_VIDEO_CONTROLS_SHARED_STYLES,
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
        position: relative;
        z-index: 1;
      }

      .video-controls__seek-track {
        position: relative;
        width: 100%;
      }

      .video-controls__seek {
        position: relative;
        z-index: 1;
        width: 100%;
        height: var(--nxt-video-controls-seek-track-height, 3px);
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
        height: var(--nxt-video-controls-seek-track-height, 3px);
        background: transparent;
        border-radius: 999px;
      }

      .video-controls__seek::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: var(--nxt-video-controls-seek-thumb-size, 10px);
        height: var(--nxt-video-controls-seek-thumb-size, 10px);
        margin-top: calc(
          (
              var(--nxt-video-controls-seek-track-height, 3px) - var(
                  --nxt-video-controls-seek-thumb-size,
                  10px
                )
            ) /
            2
        );
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        border: 1px solid var(--nxt1-color-border-default);
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent);
        transition:
          transform 160ms ease,
          box-shadow 160ms ease,
          background-color 160ms ease;
      }

      .video-controls__seek::-moz-range-track {
        height: var(--nxt-video-controls-seek-track-height, 3px);
        background: transparent;
        border-radius: 999px;
      }

      .video-controls__seek::-moz-range-thumb {
        width: var(--nxt-video-controls-seek-thumb-size, 10px);
        height: var(--nxt-video-controls-seek-thumb-size, 10px);
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        border: 1px solid var(--nxt1-color-border-default);
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent);
        transition:
          transform 160ms ease,
          box-shadow 160ms ease,
          background-color 160ms ease;
      }

      .video-controls__seek:hover::-webkit-slider-thumb,
      .video-controls__seek:focus-visible::-webkit-slider-thumb,
      .video-controls__seek:active::-webkit-slider-thumb {
        transform: scale(var(--nxt-video-controls-seek-thumb-hover-scale, 1.12));
        box-shadow: 0 0 0 var(--nxt-video-controls-seek-thumb-hover-ring-size, 4px)
          color-mix(in srgb, var(--nxt1-color-primary) 16%, transparent);
      }

      .video-controls__seek:hover::-moz-range-thumb,
      .video-controls__seek:focus-visible::-moz-range-thumb,
      .video-controls__seek:active::-moz-range-thumb {
        transform: scale(var(--nxt-video-controls-seek-thumb-hover-scale, 1.12));
        box-shadow: 0 0 0 var(--nxt-video-controls-seek-thumb-hover-ring-size, 4px)
          color-mix(in srgb, var(--nxt1-color-primary) 16%, transparent);
      }

      .video-controls__effect-markers {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 3;
      }

      .video-controls__effect-marker {
        pointer-events: auto;
        position: absolute;
        top: 50%;
        left: 0;
        transform: translate(-50%, calc(-50% - 5px));
        width: 9px;
        height: 9px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-bg-primary) 82%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-danger, #ff4d4f) 80%, #000 20%);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--nxt1-color-bg-primary) 72%, transparent);
        cursor: pointer;
        padding: 0;
      }

      .video-controls__effect-marker:hover,
      .video-controls__effect-marker:focus-visible {
        transform: translate(-50%, calc(-50% - 5px)) scale(1.12);
      }

      .video-controls__effect-marker--active {
        transform: translate(-50%, calc(-50% - 5px)) scale(1.12);
      }

      .video-controls__effect-marker-anchor {
        position: absolute;
        inset-block: 0;
        width: 0;
        pointer-events: auto;
      }

      .video-controls__effect-popover {
        position: absolute;
        left: 0;
        bottom: calc(100% + 10px);
        transform: translateX(-50%);
        z-index: 12;
        display: grid;
        gap: 8px;
        min-width: 156px;
        padding: 8px;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 86%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 94%, #000 6%);
        box-shadow: 0 18px 38px color-mix(in srgb, #000 44%, transparent);
        backdrop-filter: blur(12px);
      }

      .video-controls__effect-popover--align-start {
        transform: translateX(0);
      }

      .video-controls__effect-popover--align-end {
        left: auto;
        right: 0;
        transform: translateX(0);
      }

      .video-controls__effect-popover-row {
        display: grid;
        gap: 6px;
      }

      .video-controls__effect-popover-label {
        color: var(--nxt1-color-text-secondary);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      .video-controls__effect-duration-controls {
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }

      .video-controls__effect-duration-input-shell {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        padding: 0 8px;
        min-height: 28px;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 86%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 90%, transparent);
      }

      .video-controls__effect-duration-input {
        width: 38px;
        min-width: 38px;
        min-height: 26px;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        font-size: 11px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        text-align: right;
      }

      .video-controls__effect-duration-input:focus-visible {
        outline: none;
      }

      .video-controls__effect-duration-input-shell:has(
        .video-controls__effect-duration-input:focus-visible
      ) {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 1px;
      }

      .video-controls__effect-duration-unit {
        color: var(--nxt1-color-text-secondary);
        font-size: 10px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .video-controls__effect-action-btn,
      .video-controls__effect-delete-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 26px;
        border: 0;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        background: transparent;
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
      }

      .video-controls__effect-action-btn {
        min-width: 26px;
      }

      .video-controls__effect-delete-btn {
        width: 100%;
        justify-content: flex-start;
        padding: 0 8px;
        color: var(--nxt1-color-danger, #ff4d4f);
        font-size: 11px;
        font-weight: 700;
      }

      .video-controls__effect-action-btn:hover,
      .video-controls__effect-delete-btn:hover,
      .video-controls__effect-action-btn:focus-visible,
      .video-controls__effect-delete-btn:focus-visible {
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
        outline: none;
      }

      .video-controls__draw-segment {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        display: grid;
        grid-template-columns: auto minmax(10px, 1fr) auto;
        align-items: center;
        min-width: 16px;
        z-index: 2;
        pointer-events: none;
      }

      .video-controls__draw-range {
        pointer-events: auto;
        min-height: 14px;
        border: 0;
        border-radius: 999px;
        padding: 0;
        background: color-mix(in srgb, var(--nxt1-color-primary) 62%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--nxt1-color-primary) 88%, transparent);
        cursor: grab;
      }

      .video-controls__draw-range:active {
        cursor: grabbing;
      }

      .video-controls__draw-range-dot {
        display: block;
        width: 100%;
        height: 100%;
        min-width: 10px;
      }

      .video-controls__draw-handle {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border: 0;
        border-radius: 999px;
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-bg-primary);
        padding: 0;
        cursor: ew-resize;
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--nxt1-color-bg-primary) 55%, transparent);
      }

      .video-controls__draw-handle:hover,
      .video-controls__draw-range:hover {
        filter: brightness(1.06);
      }

      .video-controls__dock {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-1, 4px);
        flex-wrap: wrap;
        position: relative;
        z-index: 2;
      }

      .video-controls__cluster {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-1, 4px);
        border-radius: var(--nxt1-border-radius-sm, 6px);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 76%, transparent);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 78%, transparent);
        box-shadow: 0 10px 28px color-mix(in srgb, #000 30%, transparent);
        backdrop-filter: blur(10px);
      }

      .video-controls__cluster--right {
        margin-left: auto;
      }

      .video-controls__cluster--duration {
        gap: 6px;
        padding-inline: 10px;
      }

      .video-controls__duration-label {
        color: var(--nxt1-color-text-secondary);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      .video-controls__duration-value {
        color: var(--nxt1-color-text-primary);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.01em;
        font-variant-numeric: tabular-nums;
      }

      .video-controls__cluster--transport {
        gap: 2px;
        padding: 3px;
      }

      .video-controls__transport-toggle {
        color: var(--nxt1-color-text-secondary);
      }

      .video-controls__divider {
        width: 1px;
        height: 18px;
        margin: 0 2px;
        background: color-mix(in srgb, var(--nxt1-color-border-subtle) 85%, transparent);
      }

      .video-controls__icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        gap: 0;
        min-height: 28px;
        min-width: 28px;
        padding: 0;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        transition: all 0.18s cubic-bezier(0.23, 1, 0.32, 1);
      }

      .video-controls__icon-btn:hover:not(:disabled) {
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
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
        background: color-mix(in srgb, var(--nxt1-color-primary) 16%, transparent);
      }

      .video-controls__icon-btn--primary:hover:not(:disabled) {
        background: color-mix(in srgb, var(--nxt1-color-primary) 24%, transparent);
      }

      :host-context([data-theme='light']) .video-controls__icon-btn--primary {
        color: var(--nxt1-color-text-onPrimary, var(--nxt1-color-text-on-primary, #0a0a0a));
      }

      .video-controls__speed-menu {
        position: relative;
        display: inline-flex;
        z-index: 4;
      }

      .video-controls__speed-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-height: 28px;
        min-width: 50px;
        padding: 0 8px;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
        cursor: pointer;
        transition:
          background 0.16s ease,
          color 0.16s ease;
      }

      .video-controls__speed-trigger:hover,
      .video-controls__speed-trigger--open {
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
        color: var(--nxt1-color-primary);
      }

      .video-controls__speed-trigger:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .video-controls__speed-trigger-label {
        min-width: 18px;
        text-align: center;
      }

      .video-controls__speed-popover {
        position: absolute;
        right: 0;
        bottom: calc(100% + 8px);
        z-index: 40;
        display: grid;
        min-width: 94px;
        padding: 4px;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 86%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 92%, #000 8%);
        box-shadow: 0 18px 38px color-mix(in srgb, #000 44%, transparent);
        backdrop-filter: blur(12px);
      }

      .video-controls__speed-option {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 26px;
        padding: 0 10px;
        border: 0;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: 10px;
        font-weight: 800;
        cursor: pointer;
        transition:
          background 0.16s ease,
          color 0.16s ease;
      }

      .video-controls__speed-option:hover,
      .video-controls__speed-option--active {
        background: color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent);
        color: var(--nxt1-color-primary);
      }

      .video-controls__speed-option:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
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
  private readonly host = inject(ElementRef<HTMLElement>);

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
  readonly showDurationBadge = input(false);
  readonly allowTransportCollapse = input(false);
  readonly compactMode = input(false);
  readonly showDrawSegmentEditor = input(false);
  readonly drawSegment = input<DrawSegment | null>(null);
  readonly drawEffectMarkers = input<readonly DrawEffectMarker[]>([]);
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
  readonly drawSegmentChange = output<DrawSegment>();
  readonly deleteDrawEffectMarker = output<string>();
  readonly drawEffectDurationChange = output<{ markerId: string; durationSec: number }>();

  private readonly isScrubbing = signal(false);
  private readonly scrubValue = signal(0);
  protected readonly speedMenuOpen = signal(false);
  private readonly transportExpandedState = signal(true);
  protected readonly transportExpanded = computed(() =>
    this.compactMode() ? false : this.transportExpandedState()
  );
  protected readonly activeDrawEffectMarkerId = signal<string | null>(null);
  @ViewChild('seekTrack') private seekTrack?: ElementRef<HTMLDivElement>;
  private activeDrawSegmentDrag: {
    mode: 'start' | 'end' | 'move';
    startSec: number;
    endSec: number;
    pointerStartSec: number;
  } | null = null;
  private holdSeekStartTimerId: number | null = null;
  private holdSeekIntervalId: number | null = null;
  private holdSeekBaseDeltaSec = 0;
  private holdSeekStartMs = 0;

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
  protected readonly formattedCurrentTime = computed(() =>
    this.formatTime(this.seekDisplayValue())
  );
  protected readonly formattedDuration = computed(() => this.formatTime(this.duration()));
  protected readonly resolvedDrawSegment = computed<DrawSegment | null>(() => {
    const segment = this.drawSegment();
    if (!segment) return null;

    const max = this.seekMax();
    const start = Math.max(0, Math.min(Number(segment.startSec) || 0, max));
    const endCandidate = Math.max(0, Math.min(Number(segment.endSec) || 0, max));
    const end = Math.max(start + 0.05, endCandidate);

    return {
      startSec: Math.min(start, max),
      endSec: Math.min(end, max),
    };
  });
  protected readonly drawSegmentStartPct = computed(() => {
    const segment = this.resolvedDrawSegment();
    if (!segment) return 0;
    return Math.min(100, Math.max(0, (segment.startSec / this.seekMax()) * 100));
  });
  protected readonly drawSegmentWidthPct = computed(() => {
    const segment = this.resolvedDrawSegment();
    if (!segment) return 0;
    const span = Math.max(0.05, segment.endSec - segment.startSec);
    return Math.min(100, Math.max(0.2, (span / this.seekMax()) * 100));
  });
  protected readonly formattedDrawSegmentDuration = computed(() => {
    const segment = this.resolvedDrawSegment();
    if (!segment) return '--:--';
    return this.formatTime(Math.max(0, segment.endSec - segment.startSec));
  });
  protected readonly resolvedDrawEffectMarkers = computed<
    readonly {
      id: string;
      atSec: number;
      positionPct: number;
      durationSec: number;
      alignment: 'start' | 'center' | 'end';
    }[]
  >(() => {
    const max = this.seekMax();
    if (max <= 0) return [];

    return this.drawEffectMarkers()
      .map((marker) => {
        const atSec = Number(marker.atSec);
        if (!marker.id || !Number.isFinite(atSec)) return null;

        const clamped = Math.max(0, Math.min(atSec, max));
        const positionPct = Math.min(100, Math.max(0, (clamped / max) * 100));
        const durationSec = Math.max(0.1, Number(marker.durationSec) || 0.1);
        const alignment = positionPct <= 14 ? 'start' : positionPct >= 86 ? 'end' : 'center';
        return { id: marker.id, atSec: clamped, positionPct, durationSec, alignment };
      })
      .filter(
        (
          marker
        ): marker is {
          id: string;
          atSec: number;
          positionPct: number;
          durationSec: number;
          alignment: 'start' | 'center' | 'end';
        } => marker !== null
      );
  });

  private formatTime(value: number): string {
    const totalSeconds = Math.floor(Number(value) || 0);
    if (totalSeconds <= 0) return '--:--';

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

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

  protected onTransportSeekClick(deltaSec: number): void {
    this.seekRelative.emit(deltaSec);
  }

  protected onSlowSeekClick(direction: number): void {
    this.seekRelative.emit(this.resolveSlowSeekDelta(direction));
  }

  protected onSlowSeekPointerDown(event: PointerEvent, direction: number): void {
    this.onTransportSeekPointerDown(event, this.resolveSlowSeekDelta(direction));
  }

  protected onFastSeekClick(direction: number): void {
    this.seekRelative.emit(this.resolveFastSeekDelta(direction));
  }

  protected onFastSeekPointerDown(event: PointerEvent, direction: number): void {
    this.onTransportSeekPointerDown(event, this.resolveFastSeekDelta(direction));
  }

  protected onTransportSeekPointerDown(event: PointerEvent, baseDeltaSec: number): void {
    if (event.button !== 0) return;
    this.stopTransportSeekHold();
    this.holdSeekBaseDeltaSec = baseDeltaSec;
    this.holdSeekStartMs = Date.now();
    this.holdSeekStartTimerId = window.setTimeout(() => {
      this.holdSeekStartTimerId = null;
      this.holdSeekIntervalId = window.setInterval(() => {
        const elapsedMs = Date.now() - this.holdSeekStartMs;
        const acceleration = Math.min(5, 1 + Math.floor(elapsedMs / 500));
        this.seekRelative.emit(this.holdSeekBaseDeltaSec * acceleration);
      }, 90);
    }, 220);
  }

  protected onTransportSeekPointerUp(): void {
    this.stopTransportSeekHold();
  }

  private stopTransportSeekHold(): void {
    if (this.holdSeekStartTimerId !== null) {
      clearTimeout(this.holdSeekStartTimerId);
      this.holdSeekStartTimerId = null;
    }

    if (this.holdSeekIntervalId !== null) {
      clearInterval(this.holdSeekIntervalId);
      this.holdSeekIntervalId = null;
    }

    this.holdSeekBaseDeltaSec = 0;
  }

  private resolveSlowSeekDelta(direction: number): number {
    const sign = direction < 0 ? -1 : 1;
    return this.resolveFrameStepSeconds() * sign;
  }

  private resolveFastSeekDelta(direction: number): number {
    const sign = direction < 0 ? -1 : 1;
    return this.resolveFrameStepSeconds() * 6 * sign;
  }

  private resolveFrameStepSeconds(): number {
    const configured = Number(this.frameStepSeconds());
    if (!Number.isFinite(configured) || configured <= 0) {
      return 1 / 30;
    }

    return configured;
  }

  protected toggleSpeedMenu(): void {
    this.speedMenuOpen.update((open) => !open);
  }

  protected selectPlaybackRate(rate: number): void {
    this.playbackRateChange.emit(rate);
    this.speedMenuOpen.set(false);
  }

  protected toggleTransportExpanded(): void {
    if (this.compactMode()) return;
    this.transportExpandedState.update((expanded) => !expanded);
  }

  protected onDrawSegmentPointerDown(event: PointerEvent, mode: 'start' | 'end' | 'move'): void {
    if (!this.showDrawSegmentEditor()) return;

    const segment = this.resolvedDrawSegment();
    if (!segment) return;

    event.preventDefault();
    event.stopPropagation();

    this.activeDrawSegmentDrag = {
      mode,
      startSec: segment.startSec,
      endSec: segment.endSec,
      pointerStartSec: this.timeFromPointerEvent(event),
    };
  }

  protected onDeleteDrawEffectMarker(markerId: string): void {
    this.activeDrawEffectMarkerId.set(null);
    this.deleteDrawEffectMarker.emit(markerId);
  }

  protected onToggleDrawEffectMarkerMenu(markerId: string): void {
    this.activeDrawEffectMarkerId.update((current) => (current === markerId ? null : markerId));
  }

  protected onAdjustDrawEffectDuration(
    marker: { id: string; atSec: number; durationSec: number },
    deltaSec: number
  ): void {
    const maxDuration = Math.max(0.1, this.seekMax() - marker.atSec);
    const nextDurationSec = Math.max(0.1, Math.min(maxDuration, marker.durationSec + deltaSec));
    this.drawEffectDurationChange.emit({ markerId: marker.id, durationSec: nextDurationSec });
  }

  protected onDrawEffectDurationInput(
    marker: { id: string; atSec: number; durationSec: number },
    event: Event
  ): void {
    const input = event.target as HTMLInputElement | null;
    const nextValue = Number(input?.value ?? '');
    if (!Number.isFinite(nextValue)) {
      if (input) input.value = this.formatDurationInputValue(marker.durationSec);
      return;
    }

    const maxDuration = Math.max(0.1, this.seekMax() - marker.atSec);
    const nextDurationSec = Math.max(0.1, Math.min(maxDuration, nextValue));
    if (input) input.value = this.formatDurationInputValue(nextDurationSec);
    this.drawEffectDurationChange.emit({ markerId: marker.id, durationSec: nextDurationSec });
  }

  protected formatShortDuration(value: number): string {
    const duration = Math.max(0.1, Number(value) || 0);
    if (duration < 10) return `${duration.toFixed(1)}s`;
    return `${Math.round(duration)}s`;
  }

  protected formatDurationInputValue(value: number): string {
    const duration = Math.max(0.1, Number(value) || 0.1);
    return duration < 10 ? duration.toFixed(1) : String(Math.round(duration));
  }

  protected onTooltipHostMouseOver(event: MouseEvent): void {
    this.updateTooltipViewportOffset(event.target);
  }

  protected onTooltipHostFocusIn(event: FocusEvent): void {
    this.updateTooltipViewportOffset(event.target);
  }

  @HostListener('document:pointermove', ['$event'])
  protected onDocumentPointerMove(event: PointerEvent): void {
    if (!this.activeDrawSegmentDrag) return;

    const drag = this.activeDrawSegmentDrag;
    const pointerSec = this.timeFromPointerEvent(event);
    const max = this.seekMax();
    const minSpan = 0.1;
    const span = Math.max(minSpan, drag.endSec - drag.startSec);

    let nextStart = drag.startSec;
    let nextEnd = drag.endSec;

    if (drag.mode === 'start') {
      nextStart = Math.min(pointerSec, drag.endSec - minSpan);
    } else if (drag.mode === 'end') {
      nextEnd = Math.max(pointerSec, drag.startSec + minSpan);
    } else {
      const delta = pointerSec - drag.pointerStartSec;
      nextStart = drag.startSec + delta;
      nextEnd = drag.endSec + delta;

      if (nextStart < 0) {
        nextStart = 0;
        nextEnd = span;
      }

      if (nextEnd > max) {
        nextEnd = max;
        nextStart = Math.max(0, max - span);
      }
    }

    nextStart = Math.max(0, Math.min(nextStart, max - minSpan));
    nextEnd = Math.max(nextStart + minSpan, Math.min(nextEnd, max));

    this.drawSegmentChange.emit({ startSec: nextStart, endSec: nextEnd });
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  protected onDocumentPointerUp(): void {
    this.activeDrawSegmentDrag = null;
    this.stopTransportSeekHold();
  }

  @HostListener('document:pointerdown', ['$event'])
  protected onDocumentPointerDown(event: PointerEvent): void {
    const host = this.host.nativeElement;
    if (host.contains(event.target as Node | null)) return;
    this.activeDrawEffectMarkerId.set(null);
  }

  private timeFromPointerEvent(event: PointerEvent): number {
    const track = this.seekTrack?.nativeElement;
    if (!track) return 0;

    const rect = track.getBoundingClientRect();
    if (!rect.width) return 0;

    const ratio = (event.clientX - rect.left) / rect.width;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    return clampedRatio * this.seekMax();
  }

  private updateTooltipViewportOffset(target: EventTarget | null): void {
    if (typeof window === 'undefined' || !(target instanceof HTMLElement)) return;

    const tooltipHost = target.closest<HTMLElement>('.video-controls__tooltip-host[data-tooltip]');
    if (!tooltipHost) return;

    const tooltipText = tooltipHost.dataset['tooltip']?.trim();
    if (!tooltipText) return;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    if (!viewportWidth) return;

    const rect = tooltipHost.getBoundingClientRect();
    const estimatedTooltipWidth = Math.min(
      VIDEO_CONTROL_TOOLTIP_MAX_WIDTH_PX,
      Math.max(
        VIDEO_CONTROL_TOOLTIP_MIN_WIDTH_PX,
        tooltipText.length * VIDEO_CONTROL_TOOLTIP_ESTIMATED_CHAR_WIDTH_PX +
          VIDEO_CONTROL_TOOLTIP_HORIZONTAL_PADDING_PX
      )
    );

    const centeredLeft = rect.left + rect.width / 2 - estimatedTooltipWidth / 2;
    const centeredRight = rect.left + rect.width / 2 + estimatedTooltipWidth / 2;

    let offsetX = 0;
    if (centeredLeft < VIDEO_CONTROL_TOOLTIP_VIEWPORT_GUTTER_PX) {
      offsetX = VIDEO_CONTROL_TOOLTIP_VIEWPORT_GUTTER_PX - centeredLeft;
    } else if (centeredRight > viewportWidth - VIDEO_CONTROL_TOOLTIP_VIEWPORT_GUTTER_PX) {
      offsetX = viewportWidth - VIDEO_CONTROL_TOOLTIP_VIEWPORT_GUTTER_PX - centeredRight;
    }

    tooltipHost.style.setProperty('--video-tooltip-offset-x', `${Math.round(offsetX)}px`);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!this.speedMenuOpen() || target === null) return;
    if (!this.host.nativeElement.contains(target as Node)) {
      this.speedMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKey(): void {
    this.speedMenuOpen.set(false);
  }
}
