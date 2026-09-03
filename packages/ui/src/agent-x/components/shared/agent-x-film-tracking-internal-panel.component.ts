import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export type FilmTrackingStatus =
  | 'not_tracked'
  | 'queued'
  | 'processing'
  | 'ready'
  | 'limited'
  | 'failed'
  | 'cancelled';

export type FilmTrackingCapability =
  | 'none'
  | 'detection_only'
  | 'tracked_image_space'
  | 'calibrated_surface'
  | 'identified_roster'
  | 'metric_ready';

export type FilmTrackingSurfaceType =
  | 'field'
  | 'court'
  | 'rink'
  | 'diamond'
  | 'mat'
  | 'pool'
  | 'track'
  | 'unknown';

export interface FilmTrackingPanelPoint {
  readonly x: number;
  readonly y: number;
  readonly unit: 'yard' | 'meter' | 'foot' | 'normalized';
}

export interface FilmTrackingPanelTrack {
  readonly trackId: string;
  readonly kind: 'player' | 'official' | 'ball' | 'coach' | 'other';
  readonly teamSide?: 'home' | 'away' | 'official' | 'unknown';
  readonly label?: string;
  readonly jerseyNumber?: string | null;
  readonly positionLabel?: string | null;
  readonly roleLabel?: string | null;
  readonly confidence: number;
  readonly surfacePoint?: FilmTrackingPanelPoint;
  readonly topSpeedMph?: number;
  readonly separationYards?: number;
  readonly matchupLabel?: string;
}

export interface FilmTrackingPanelMetric {
  readonly label: string;
  readonly value: string;
  readonly trackId?: string;
}

@Component({
  selector: 'nxt1-agent-x-film-tracking-internal-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="tracking-panel" [attr.data-status]="status" [attr.data-testid]="testId">
      <header class="tracking-panel__header">
        <div>
          <p class="tracking-panel__eyebrow">Tracking</p>
          <h3>Live Play Map</h3>
        </div>
        <span class="tracking-panel__status">{{ statusLabel }}</span>
      </header>

      <section class="tracking-map" [class.tracking-map--court]="surfaceType === 'court'">
        <div class="tracking-map__surface" aria-label="Live 2D play diagram">
          <div class="tracking-map__midline"></div>
          @if (surfaceType === 'field') {
            @for (line of fieldLines; track line) {
              <div class="tracking-map__yard-line" [style.left.%]="line"></div>
            }
          }
          @if (surfaceType === 'court') {
            <div class="tracking-map__paint tracking-map__paint--left"></div>
            <div class="tracking-map__paint tracking-map__paint--right"></div>
            <div class="tracking-map__arc tracking-map__arc--left"></div>
            <div class="tracking-map__arc tracking-map__arc--right"></div>
          }

          @for (track of positionedTracks(); track track.trackId) {
            <button
              type="button"
              class="tracking-map__dot"
              [class.tracking-map__dot--home]="track.teamSide === 'home'"
              [class.tracking-map__dot--away]="track.teamSide === 'away'"
              [class.tracking-map__dot--official]="track.teamSide === 'official'"
              [class.tracking-map__dot--ball]="track.kind === 'ball'"
              [class.tracking-map__dot--selected]="track.trackId === selectedTrackId"
              [style.left.%]="track.x"
              [style.top.%]="track.y"
              [attr.aria-label]="track.label"
              (click)="selectTrack(track.trackId)"
            >
              {{ track.shortLabel }}
            </button>
          }
        </div>
      </section>

      @if (selectedTrack(); as track) {
        <section class="tracking-card" data-testid="film-tracking-player-dossier">
          <p class="tracking-card__eyebrow">Selected Player</p>
          <h4>{{ track.label || track.trackId }}</h4>
          <dl class="tracking-card__facts">
            <div>
              <dt>Position</dt>
              <dd>{{ track.positionLabel || 'Needs confirmation' }}</dd>
            </div>
            <div>
              <dt>Jersey</dt>
              <dd>{{ track.jerseyNumber ? '#' + track.jerseyNumber : 'Unread' }}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{{ formatPercent(track.confidence) }}</dd>
            </div>
            @if (track.topSpeedMph !== undefined) {
              <div>
                <dt>Top Speed</dt>
                <dd>{{ track.topSpeedMph.toFixed(1) }} mph</dd>
              </div>
            }
            @if (track.separationYards !== undefined) {
              <div>
                <dt>Separation</dt>
                <dd>{{ track.separationYards.toFixed(1) }} yd</dd>
              </div>
            }
          </dl>
          <button
            type="button"
            class="tracking-panel__action"
            (click)="askAgent.emit(track.trackId)"
          >
            Ask Agent X About Player
          </button>
        </section>
      } @else {
        <section class="tracking-card" data-testid="film-tracking-all-tracks-summary">
          <p class="tracking-card__eyebrow">All Players</p>
          <h4>{{ tracks.length }} tracked entities</h4>
          <dl class="tracking-card__facts">
            <div>
              <dt>Capability</dt>
              <dd>{{ capabilityLabel }}</dd>
            </div>
            @for (metric of metrics; track metric.label) {
              <div>
                <dt>{{ metric.label }}</dt>
                <dd>{{ metric.value }}</dd>
              </div>
            }
          </dl>
          <button type="button" class="tracking-panel__action" (click)="askAgent.emit(null)">
            Ask Agent X About Play
          </button>
        </section>
      }
    </aside>
  `,
  styles: [
    `
      .tracking-panel {
        display: grid;
        gap: 12px;
        min-width: 280px;
        height: 100%;
        padding: 12px;
        border-left: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        background: var(--nxt1-color-surface-elevated, rgba(13, 18, 30, 0.96));
        color: var(--nxt1-color-text-primary, #f8fafc);
      }

      .tracking-panel__header {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
      }

      .tracking-panel__eyebrow,
      .tracking-card__eyebrow {
        margin: 0 0 4px;
        color: var(--nxt1-color-text-secondary, #94a3b8);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      h3,
      h4 {
        margin: 0;
        font-size: 16px;
        line-height: 1.2;
      }

      .tracking-panel__status {
        border-radius: 999px;
        padding: 4px 8px;
        background: var(--nxt1-color-primary-soft, rgba(59, 130, 246, 0.16));
        color: var(--nxt1-color-primary, #60a5fa);
        font-size: 12px;
        font-weight: 700;
      }

      .tracking-map {
        aspect-ratio: 1.62;
        overflow: hidden;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        border-radius: 8px;
        background: #174d33;
      }

      .tracking-map--court {
        background: #8a5a2b;
      }

      .tracking-map__surface {
        position: relative;
        width: 100%;
        height: 100%;
        background-image:
          linear-gradient(rgba(255, 255, 255, 0.16) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.16) 1px, transparent 1px);
        background-size: 10% 20%;
      }

      .tracking-map__midline,
      .tracking-map__yard-line {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 1px;
        background: rgba(255, 255, 255, 0.35);
      }

      .tracking-map__midline {
        left: 50%;
      }

      .tracking-map__paint {
        position: absolute;
        top: 32%;
        width: 18%;
        height: 36%;
        border: 1px solid rgba(255, 255, 255, 0.58);
      }

      .tracking-map__paint--left {
        left: 0;
      }

      .tracking-map__paint--right {
        right: 0;
      }

      .tracking-map__arc {
        position: absolute;
        top: 20%;
        width: 28%;
        height: 60%;
        border: 1px solid rgba(255, 255, 255, 0.42);
        border-radius: 50%;
      }

      .tracking-map__arc--left {
        left: -12%;
      }

      .tracking-map__arc--right {
        right: -12%;
      }

      .tracking-map__dot {
        position: absolute;
        translate: -50% -50%;
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border: 2px solid rgba(255, 255, 255, 0.8);
        border-radius: 999px;
        background: #64748b;
        color: #fff;
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
        cursor: pointer;
      }

      .tracking-map__dot--home {
        background: #0f4c81;
      }

      .tracking-map__dot--away {
        background: #b91c1c;
      }

      .tracking-map__dot--official {
        background: #334155;
      }

      .tracking-map__dot--ball {
        width: 14px;
        height: 14px;
        background: #f97316;
        color: transparent;
      }

      .tracking-map__dot--selected {
        box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.38);
      }

      .tracking-card {
        display: grid;
        gap: 10px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        border-radius: 8px;
        padding: 12px;
        background: var(--nxt1-color-surface, rgba(15, 23, 42, 0.72));
      }

      .tracking-card__facts {
        display: grid;
        gap: 8px;
        margin: 0;
      }

      .tracking-card__facts div {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }

      dt {
        color: var(--nxt1-color-text-secondary, #94a3b8);
      }

      dd {
        margin: 0;
        font-weight: 700;
        text-align: right;
      }

      .tracking-panel__action {
        min-height: 36px;
        border: 0;
        border-radius: 8px;
        background: var(--nxt1-color-primary, #2563eb);
        color: #fff;
        font-weight: 800;
        cursor: pointer;
      }

      @media (max-width: 900px) {
        .tracking-panel {
          min-width: 0;
          border-left: 0;
          border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXFilmTrackingInternalPanelComponent {
  @Input() testId = 'film-tracking-internal-panel';
  @Input() status: FilmTrackingStatus = 'not_tracked';
  @Input() capability: FilmTrackingCapability = 'none';
  @Input() surfaceType: FilmTrackingSurfaceType = 'field';
  @Input() selectedTrackId: string | null = null;
  @Input() tracks: readonly FilmTrackingPanelTrack[] = [];
  @Input() metrics: readonly FilmTrackingPanelMetric[] = [];

  @Output() readonly trackSelected = new EventEmitter<string>();
  @Output() readonly askAgent = new EventEmitter<string | null>();

  protected readonly fieldLines = [8.33, 16.67, 25, 33.33, 41.67, 58.33, 66.67, 75, 83.33, 91.67];

  protected selectedTrack(): FilmTrackingPanelTrack | null {
    return this.tracks.find((track) => track.trackId === this.selectedTrackId) ?? null;
  }

  protected positionedTracks(): readonly (FilmTrackingPanelTrack & {
    readonly x: number;
    readonly y: number;
    readonly label: string;
    readonly shortLabel: string;
  })[] {
    const positioned: (FilmTrackingPanelTrack & {
      readonly x: number;
      readonly y: number;
      readonly label: string;
      readonly shortLabel: string;
    })[] = [];

    for (const track of this.tracks) {
      const point = this.resolvePoint(track.surfacePoint);
      if (!point) continue;
      positioned.push({
        ...track,
        ...point,
        label: this.buildLabel(track),
        shortLabel: this.buildShortLabel(track),
      });
    }

    return positioned;
  }

  get statusLabel(): string {
    return this.status.replace(/_/g, ' ');
  }

  get capabilityLabel(): string {
    return this.capability.replace(/_/g, ' ');
  }

  protected selectTrack(trackId: string): void {
    this.trackSelected.emit(trackId);
  }

  protected formatPercent(value: number): string {
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  }

  private resolvePoint(point: FilmTrackingPanelPoint | undefined): { x: number; y: number } | null {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    if (point.unit === 'normalized') {
      return { x: this.clampPercent(point.x * 100), y: this.clampPercent(point.y * 100) };
    }
    if (this.surfaceType === 'field' && point.unit === 'yard') {
      return {
        x: this.clampPercent((point.x / 120) * 100),
        y: this.clampPercent((point.y / 53.3) * 100),
      };
    }
    if (this.surfaceType === 'court' && point.unit === 'foot') {
      return {
        x: this.clampPercent((point.x / 94) * 100),
        y: this.clampPercent((point.y / 50) * 100),
      };
    }
    return { x: this.clampPercent(point.x), y: this.clampPercent(point.y) };
  }

  private clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
  }

  private buildLabel(track: FilmTrackingPanelTrack): string {
    const parts = [
      track.positionLabel,
      track.jerseyNumber ? `#${track.jerseyNumber}` : null,
      track.roleLabel,
    ].filter((part): part is string => !!part);
    return parts.length ? parts.join(' ') : track.label || track.trackId;
  }

  private buildShortLabel(track: FilmTrackingPanelTrack): string {
    if (track.kind === 'ball') return '';
    return track.jerseyNumber ?? track.positionLabel ?? track.label?.slice(0, 2) ?? '';
  }
}
