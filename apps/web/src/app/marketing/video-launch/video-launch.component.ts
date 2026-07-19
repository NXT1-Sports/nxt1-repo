import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import type { SeoConfig } from '@nxt1/core/seo';
import {
  NxtInteractiveDemoReelComponent,
  NxtInteractiveDemoTimelineService,
} from '@nxt1/ui/components/interactive-demo';
import { SeoService } from '../../core/services/web/seo.service';

const VIDEO_LAUNCH_TITLE = 'NXT1 Launch Video Studio';
const VIDEO_LAUNCH_DESCRIPTION =
  'Internal NXT1 launch video recording stage for the vertical Agent X reel.';
const PHONE_REEL_VIDEO_SRC = '/assets/images/video-agent-1.mov';

@Component({
  selector: 'app-video-launch',
  standalone: true,
  imports: [NxtInteractiveDemoReelComponent],
  providers: [NxtInteractiveDemoTimelineService],
  template: `
    <main class="video-launch" [class.video-launch--recording]="recordingMode()">
      @if (!recordingMode()) {
        <header class="video-launch__toolbar" aria-label="Launch video studio controls">
          <div class="video-launch__title">
            <span>Launch Video Studio</span>
            <strong>{{ stageLabel }}</strong>
          </div>

          <div class="video-launch__actions" aria-label="Demo controls">
            <button type="button" class="video-launch__button" (click)="togglePlayback()">
              {{ timeline.playing() ? 'Pause' : 'Play' }}
            </button>
            <button type="button" class="video-launch__button" (click)="timeline.restart()">
              Restart
            </button>
            <button type="button" class="video-launch__button" (click)="toggleRecordingMode()">
              Recording Mode
            </button>
          </div>
        </header>
      }

      <section class="video-launch__stage-wrap" aria-label="Recording stage">
        <div class="video-launch__stage">
          <nxt1-interactive-demo-reel [phoneVideoSrc]="phoneVideoSrc" />
        </div>
      </section>

      @if (!recordingMode()) {
        <footer class="video-launch__timeline" aria-label="Timeline scrubber">
          <span>{{ timeline.activeCue().label }}</span>
          <input
            type="range"
            min="0"
            max="100"
            [value]="timeline.progress()"
            aria-label="Timeline progress"
            (input)="seek($event)"
          />
          <strong>{{ timeline.progress() }}%</strong>
        </footer>
      } @else {
        <button type="button" class="video-launch__recording-exit" (click)="toggleRecordingMode()">
          Exit
        </button>
      }
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100dvh;
        color: #f9faf4;
        background: #020302;
      }

      .video-launch {
        --stage-width: min(540px, calc(100vw - 48px));
        --stage-aspect: 9 / 16;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        gap: 18px;
        min-height: 100dvh;
        padding: 18px 24px 20px;
        background: linear-gradient(135deg, rgba(204, 255, 0, 0.08), transparent 34%), #020302;
        font-family: var(--nxt1-fontFamily-brand, Inter, sans-serif);
      }

      .video-launch--recording {
        gap: 0;
        place-items: center;
        padding: 0;
        background: #000;
      }

      .video-launch__toolbar,
      .video-launch__timeline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        width: min(1920px, calc(100vw - 48px));
        margin: 0 auto;
        padding: 12px 14px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.045);
      }

      .video-launch__title {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      .video-launch__title span,
      .video-launch__timeline span {
        color: #ccff00;
        font-size: 12px;
        font-weight: 850;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .video-launch__title strong {
        color: #fff;
        font-size: clamp(18px, 2vw, 28px);
        line-height: 1;
      }

      .video-launch__actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .video-launch__button {
        min-height: 38px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px;
        padding: 0 14px;
        background: rgba(255, 255, 255, 0.07);
        color: rgba(249, 250, 244, 0.82);
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 800;
      }

      .video-launch__button:hover {
        border-color: rgba(204, 255, 0, 0.5);
        background: rgba(204, 255, 0, 0.14);
        color: #fff;
      }

      .video-launch__stage-wrap {
        display: grid;
        place-items: center;
        min-height: 0;
      }

      .video-launch__stage {
        width: min(var(--stage-width), calc((100dvh - 178px) * 0.5625));
        max-height: calc(100dvh - 178px);
        aspect-ratio: var(--stage-aspect);
        overflow: hidden;
        box-shadow: 0 32px 90px rgba(0, 0, 0, 0.48);
      }

      .video-launch--recording .video-launch__stage {
        width: min(100vw, calc(100dvh * 0.5625));
        max-height: 100dvh;
        box-shadow: none;
      }

      .video-launch__stage > * {
        display: block;
        width: 100%;
        height: 100%;
      }

      .video-launch__timeline {
        display: grid;
        grid-template-columns: minmax(160px, 0.35fr) minmax(220px, 1fr) auto;
      }

      .video-launch__timeline input {
        width: 100%;
        accent-color: #ccff00;
      }

      .video-launch__timeline strong {
        color: #fff;
        font-size: 14px;
      }

      .video-launch__recording-exit {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 20;
        min-height: 34px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px;
        padding: 0 12px;
        background: rgba(0, 0, 0, 0.58);
        color: rgba(255, 255, 255, 0.72);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        opacity: 0.18;
      }

      .video-launch__recording-exit:hover {
        opacity: 1;
      }

      @media (max-width: 760px) {
        .video-launch {
          padding: 12px;
        }

        .video-launch__toolbar,
        .video-launch__actions,
        .video-launch__timeline {
          align-items: stretch;
          flex-direction: column;
        }

        .video-launch__toolbar,
        .video-launch__timeline {
          width: 100%;
        }

        .video-launch__actions {
          width: 100%;
        }

        .video-launch__button {
          flex: 1;
        }

        .video-launch__timeline {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoLaunchComponent implements OnInit {
  protected readonly timeline = inject(NxtInteractiveDemoTimelineService);
  private readonly seo = inject(SeoService);

  protected readonly recordingMode = signal(false);
  protected readonly stageLabel = 'Reel launch film · 1080W x 1920H';
  protected readonly phoneVideoSrc = PHONE_REEL_VIDEO_SRC;

  constructor() {
    afterNextRender(() => {
      this.timeline.play();
    });
  }

  ngOnInit(): void {
    const seoConfig: SeoConfig = {
      page: {
        title: VIDEO_LAUNCH_TITLE,
        description: VIDEO_LAUNCH_DESCRIPTION,
        canonicalUrl: 'https://nxt1sports.com/dev/video-launch',
      },
      openGraph: {
        type: 'website',
        title: VIDEO_LAUNCH_TITLE,
        description: VIDEO_LAUNCH_DESCRIPTION,
        url: 'https://nxt1sports.com/dev/video-launch',
      },
      twitter: {
        card: 'summary',
        title: VIDEO_LAUNCH_TITLE,
        description: VIDEO_LAUNCH_DESCRIPTION,
      },
    };

    this.seo.applySeoConfig(seoConfig);
  }

  protected togglePlayback(): void {
    if (this.timeline.playing()) {
      this.timeline.pause();
      return;
    }

    this.timeline.play();
  }

  protected toggleRecordingMode(): void {
    this.recordingMode.update((enabled) => !enabled);
    this.timeline.restart();
  }

  protected seek(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.timeline.seek(Number(target?.value ?? 0));
  }
}
