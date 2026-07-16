import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SeoService } from '../../core/services';

type SessionStepId = 'creating-plays' | 'self-scouting' | 'creating-highlights';

interface SessionStep {
  readonly id: SessionStepId;
  readonly title: string;
  readonly subtitle: string;
}

const SESSION_STEPS: readonly SessionStep[] = [
  {
    id: 'creating-plays',
    title: 'Creating Plays',
    subtitle: 'Structuring formations and sequence logic.',
  },
  {
    id: 'self-scouting',
    title: 'Self Scouting',
    subtitle: 'Analyzing tendency signals and impact patterns.',
  },
  {
    id: 'creating-highlights',
    title: 'Creating Highlights',
    subtitle: 'Building a clean, coach-ready visual reel.',
  },
] as const;

@Component({
  selector: 'app-video-canvas',
  standalone: true,
  template: `
    <main class="launch-canvas" aria-label="NXT1 launch canvas">
      <section class="launch-canvas__frame" aria-label="Launch frame 1920x1080">
        <div class="launch-canvas__fx launch-canvas__fx--left" aria-hidden="true"></div>
        <div class="launch-canvas__fx launch-canvas__fx--right" aria-hidden="true"></div>
        <div class="launch-canvas__grid" aria-hidden="true"></div>

        <div class="launch-canvas__layout">
          <section class="hero-panel" aria-label="Launch hero copy">
            <h1>
              <span class="hero-line hero-line--lead">Just Ask.</span>
              <span class="hero-line hero-line--accent hero-line--agent">Agent X</span>
              <span class="hero-line hero-line--accent hero-line--delivers">Delivers.</span>
            </h1>
            <p>No complexity. No learning curve. Just results.</p>
          </section>

          <section class="workflow-panel" aria-label="Agent output sequence">
            <div class="workflow-day-label">Today</div>
            <div class="workflow-steps">
              @for (step of steps; track step.id; let index = $index) {
                @if (shouldRenderStep(index)) {
                  <article
                    class="workflow-task"
                    [class.workflow-task--active]="isStepRunning(index)"
                    [class.workflow-task--complete]="isStepCompleted(index)"
                  >
                    <div class="workflow-task__content">
                      <h2 class="workflow-task__title">{{ step.title }}</h2>
                      <div class="workflow-task__meta">
                        <span class="workflow-task__time">{{ getStepTimeLabel(index) }}</span>
                        <span class="workflow-task__duration">{{
                          getStepDurationLabel(index)
                        }}</span>
                      </div>
                    </div>

                    <span
                      class="workflow-task__state"
                      [class.workflow-task__state--active]="isStepRunning(index)"
                      [class.workflow-task__state--complete]="isStepCompleted(index)"
                      aria-hidden="true"
                    >
                      @if (isStepRunning(index)) {
                        <span class="workflow-task__spinner"></span>
                      } @else if (isStepCompleted(index)) {
                        <span class="workflow-task__check">✓</span>
                      }
                    </span>

                    @if (isOutputVisibleFor(index)) {
                      <div
                        class="workflow-task__output"
                        [class.workflow-task__output--closing]="isOutputClosing()"
                      >
                        @if (step.id === 'creating-plays') {
                          <div class="stage stage--plays" aria-hidden="true">
                            <div class="stage--plays__field"></div>
                            <span class="stage--plays__ring stage--plays__ring--one"></span>
                            <span class="stage--plays__ring stage--plays__ring--two"></span>
                            <span class="stage--plays__ring stage--plays__ring--three"></span>
                            <p>Structuring play map and route layers</p>
                          </div>
                        }

                        @if (step.id === 'self-scouting') {
                          <div class="stage stage--scouting" aria-hidden="true">
                            <p class="stage--scouting__line stage--scouting__line--one">
                              Detecting movement trends and in-game tendencies...
                            </p>
                            <p class="stage--scouting__line stage--scouting__line--two">
                              Flagging acceleration windows, spacing reads, and pressure response...
                            </p>
                            <p class="stage--scouting__line stage--scouting__line--three">
                              Building coach-ready self-scout narrative output.
                            </p>
                            <span class="stage--scouting__cursor"></span>
                          </div>
                        }

                        @if (step.id === 'creating-highlights') {
                          <div class="stage stage--highlights" aria-hidden="true">
                            <div class="stage--highlights__screen"></div>
                            <div class="stage--highlights__rows">
                              <article>
                                <h3>#1 Elite Sprint Finish</h3>
                                <strong>94%</strong>
                              </article>
                              <article>
                                <h3>#2 Transition Decision</h3>
                                <strong>91%</strong>
                              </article>
                              <article>
                                <h3>#3 Defensive Recovery</h3>
                                <strong>87%</strong>
                              </article>
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </article>
                }
              }
            </div>

            @if (showMoreFooter()) {
              <footer class="workflow-panel__footer">And MORE ...</footer>
            }
          </section>
        </div>
      </section>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: #040605;
      }

      .launch-canvas {
        min-height: 100vh;
        display: grid;
        place-items: center;
        overflow: hidden;
      }

      .launch-canvas__frame {
        position: relative;
        width: min(100vw, calc(100vh * 16 / 9), 1920px);
        aspect-ratio: 16 / 9;
        padding: clamp(32px, 2.1vw, 42px);
        background:
          radial-gradient(circle at 88% 12%, rgba(160, 234, 62, 0.26), transparent 34%),
          radial-gradient(circle at 12% 86%, rgba(32, 123, 170, 0.2), transparent 40%),
          linear-gradient(180deg, #040605 0%, #070a08 100%);
        border: 1px solid rgba(255, 255, 255, 0.05);
        box-shadow: 0 22px 54px rgba(0, 0, 0, 0.36);
        overflow: hidden;
        isolation: isolate;
        --accent: var(--nxt1-color-primary, #ccff00);
        --surface: rgba(17, 23, 19, 0.72);
        --border: rgba(255, 255, 255, 0.1);
        --text-main: #f3f7ef;
        --text-muted: rgba(208, 219, 202, 0.68);
        --log-surface: rgba(255, 255, 255, 0.04);
        --log-surface-hover: rgba(255, 255, 255, 0.06);
        --log-border: rgba(255, 255, 255, 0.08);
      }

      .launch-canvas__fx,
      .launch-canvas__grid {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .launch-canvas__fx--left {
        background: radial-gradient(circle at 16% 78%, rgba(55, 130, 162, 0.2), transparent 39%);
        animation: drift-one 9s ease-in-out infinite alternate;
      }

      .launch-canvas__fx--right {
        background: radial-gradient(circle at 90% 15%, rgba(164, 233, 74, 0.24), transparent 33%);
        animation: drift-two 11s ease-in-out infinite alternate;
      }

      .launch-canvas__grid {
        opacity: 0.08;
        background-image:
          linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
        background-size: 70px 70px;
      }

      .launch-canvas__layout {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: 0.9fr 1.1fr;
        gap: clamp(20px, 1.8vw, 30px);
        align-items: stretch;
        height: 100%;
      }

      .hero-panel {
        align-self: center;
      }

      .hero-panel h1 {
        margin: 0;
        display: grid;
        font-size: clamp(44px, 4.2vw, 78px);
        line-height: 0.96;
        font-weight: 740;
        letter-spacing: -0.03em;
        color: var(--text-main);
        max-width: 9.5ch;
      }

      .workflow-panel {
        opacity: 0;
        transform: translateY(14px);
        animation: intro-fade-in 520ms cubic-bezier(0.22, 1, 0.36, 1) 120ms forwards;
      }

      .hero-line {
        display: block;
        opacity: 0;
        transform: translateY(14px);
        animation: hero-line-in 420ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }

      .hero-line--lead {
        animation-delay: 120ms;
      }

      .hero-line--agent {
        animation-delay: 420ms;
      }

      .hero-line--delivers {
        animation-delay: 500ms;
      }

      .hero-line--accent {
        color: var(--accent);
        text-shadow: 0 0 18px rgba(204, 255, 0, 0.25);
      }

      .hero-panel p {
        margin: clamp(18px, 1.4vw, 24px) 0 0;
        color: var(--text-muted);
        font-size: clamp(14px, 1.05vw, 20px);
        max-width: 24ch;
      }

      .workflow-panel {
        border-radius: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
        padding: 0;
        display: grid;
        gap: 10px;
        align-self: start;
      }

      .workflow-steps {
        display: grid;
        gap: 8px;
        align-content: start;
      }

      .workflow-day-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgba(208, 219, 202, 0.5);
        padding: 2px 0 8px;
      }

      .workflow-task {
        min-height: 0;
        border-radius: 14px;
        border: 1px solid var(--log-border);
        background: var(--log-surface);
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        transition:
          background 150ms ease,
          border-color 150ms ease;
      }

      .workflow-task:has(.workflow-task__output) {
        align-items: start;
        padding-top: 12px;
        padding-bottom: 12px;
      }

      .workflow-task--active {
        border-color: color-mix(in srgb, var(--accent) 50%, transparent);
        background: color-mix(in srgb, var(--accent) 4%, var(--log-surface));
        animation: workflow-glow-pulse 2s ease-in-out infinite;
      }

      .workflow-task--complete {
        border-color: var(--log-border);
        background: var(--log-surface);
      }

      .workflow-task__state {
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: rgba(208, 219, 202, 0.44);
      }

      .workflow-task__state--active,
      .workflow-task__state--complete {
        color: var(--accent);
      }

      .workflow-task__spinner {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 2px solid color-mix(in srgb, var(--accent) 30%, transparent);
        border-top-color: var(--accent);
        animation: workflow-spin 1.2s linear infinite;
      }

      .workflow-task__check {
        font-size: 14px;
        line-height: 1;
        font-weight: 800;
      }

      .workflow-task__content {
        min-width: 0;
      }

      .workflow-task__title {
        margin: 0;
        color: var(--text-main);
        font-size: 13px;
        font-weight: 600;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .workflow-task__meta {
        margin-top: 3px;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .workflow-task__time {
        font-size: 11px;
        font-weight: 500;
        color: rgba(208, 219, 202, 0.52);
      }

      .workflow-task__duration {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 500;
        color: rgba(208, 219, 202, 0.52);
      }

      .workflow-task__duration::before {
        content: '';
        width: 3px;
        height: 3px;
        border-radius: 999px;
        background: rgba(208, 219, 202, 0.52);
      }

      .workflow-task__output {
        grid-column: 1 / -1;
        margin-top: 12px;
      }

      .workflow-task__output--closing {
        opacity: 0;
        transform: translateY(-5px);
        transition:
          opacity 340ms ease,
          transform 340ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      .stage {
        min-height: clamp(210px, 14vw, 270px);
        height: 100%;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: linear-gradient(180deg, rgba(15, 19, 16, 0.94), rgba(12, 16, 13, 0.98));
        overflow: hidden;
        animation: panel-in 340ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      @keyframes panel-in {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.985);
        }

        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes intro-fade-in {
        from {
          opacity: 0;
          transform: translateY(14px);
        }

        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes hero-line-in {
        from {
          opacity: 0;
          transform: translateY(14px);
        }

        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .stage--plays {
        display: grid;
        place-items: center;
        position: relative;
      }

      .stage--plays__field {
        position: absolute;
        inset: 18px;
        border-radius: 10px;
        border: 1px dashed color-mix(in srgb, var(--accent) 30%, rgba(255, 255, 255, 0.35));
      }

      .stage--plays__ring {
        position: absolute;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--accent) 44%, transparent);
      }

      .stage--plays__ring--one {
        width: 190px;
        height: 190px;
        animation: scale-pulse 2400ms ease-in-out infinite;
      }

      .stage--plays__ring--two {
        width: 284px;
        height: 284px;
        animation: scale-pulse 2400ms ease-in-out infinite 240ms;
      }

      .stage--plays__ring--three {
        width: 378px;
        height: 378px;
        animation: scale-pulse 2400ms ease-in-out infinite 480ms;
      }

      .stage--plays p {
        position: relative;
        margin: 0;
        color: var(--text-muted);
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        font-weight: 700;
      }

      .stage--scouting {
        padding: 14px;
        position: relative;
      }

      .stage--scouting__line {
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        width: 0;
        color: color-mix(in srgb, var(--text-main) 90%, #dbe8cf);
        font-size: 13px;
        line-height: 1.6;
        border-right: 2px solid transparent;
      }

      .stage--scouting__line + .stage--scouting__line {
        margin-top: 10px;
      }

      .stage--scouting__line--one {
        animation: typing-one 3600ms steps(48, end) infinite;
      }

      .stage--scouting__line--two {
        animation: typing-two 3600ms steps(64, end) infinite;
      }

      .stage--scouting__line--three {
        animation: typing-three 3600ms steps(56, end) infinite;
      }

      .stage--scouting__cursor {
        position: absolute;
        left: 14px;
        bottom: 14px;
        width: 9px;
        height: 17px;
        border-radius: 2px;
        background: color-mix(in srgb, var(--accent) 80%, #f2ffd7);
        animation: cursor-blink 700ms steps(1, end) infinite;
      }

      .stage--highlights {
        display: grid;
        grid-template-rows: 1fr auto;
        gap: 10px;
        padding: 14px;
      }

      .stage--highlights__screen {
        border-radius: 10px;
        border: 1px dashed color-mix(in srgb, var(--accent) 32%, rgba(255, 255, 255, 0.42));
        background:
          radial-gradient(
            circle at 26% 28%,
            color-mix(in srgb, var(--accent) 14%, transparent),
            transparent 28%
          ),
          linear-gradient(160deg, rgba(13, 18, 13, 0.92), rgba(10, 14, 10, 0.96));
        position: relative;
        overflow: hidden;
      }

      .stage--highlights__screen::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          120deg,
          transparent 0%,
          color-mix(in srgb, var(--accent) 7%, transparent) 46%,
          color-mix(in srgb, var(--accent) 18%, transparent) 50%,
          color-mix(in srgb, var(--accent) 7%, transparent) 54%,
          transparent 100%
        );
        transform: translateX(-100%);
        animation: shimmer 2.6s linear infinite;
      }

      .stage--highlights__rows {
        display: grid;
        gap: 8px;
      }

      .stage--highlights__rows article {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 10px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        background: rgba(18, 23, 19, 0.72);
        padding: 8px 10px;
      }

      .stage--highlights__rows h3 {
        margin: 0;
        color: var(--text-main);
        font-size: 12px;
        font-weight: 600;
      }

      .stage--highlights__rows strong {
        color: color-mix(in srgb, var(--accent) 88%, #eff9d7);
        font-size: 18px;
        font-weight: 700;
      }

      .workflow-panel__footer {
        border-radius: 999px;
        border: 1px solid rgba(204, 255, 0, 0.24);
        background: linear-gradient(90deg, rgba(204, 255, 0, 0.12), rgba(204, 255, 0, 0.04));
        color: color-mix(in srgb, var(--accent) 86%, #eff9dc);
        text-align: center;
        padding: 10px 0;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.13em;
        text-transform: uppercase;
      }

      @keyframes scale-pulse {
        0%,
        100% {
          transform: scale(0.94);
          opacity: 0.48;
        }

        50% {
          transform: scale(1);
          opacity: 0.9;
        }
      }

      @keyframes shimmer {
        to {
          transform: translateX(100%);
        }
      }

      @keyframes workflow-spin {
        from {
          transform: rotate(0deg);
        }

        to {
          transform: rotate(360deg);
        }
      }

      @keyframes workflow-glow-pulse {
        0%,
        100% {
          border-color: color-mix(in srgb, var(--accent) 50%, transparent);
          box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 15%, transparent);
        }

        50% {
          border-color: var(--accent);
          box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 30%, transparent);
        }
      }

      @keyframes timeline-pulse {
        0%,
        100% {
          opacity: 0.44;
          transform: scaleX(0.9);
        }

        50% {
          opacity: 1;
          transform: scaleX(1);
        }
      }

      @keyframes typing-one {
        0%,
        15% {
          width: 0;
          border-right-color: transparent;
        }

        34% {
          width: 100%;
          border-right-color: color-mix(in srgb, var(--accent) 82%, #f4ffd8);
        }

        100% {
          width: 100%;
          border-right-color: transparent;
        }
      }

      @keyframes typing-two {
        0%,
        34% {
          width: 0;
          border-right-color: transparent;
        }

        66% {
          width: 100%;
          border-right-color: color-mix(in srgb, var(--accent) 82%, #f4ffd8);
        }

        100% {
          width: 100%;
          border-right-color: transparent;
        }
      }

      @keyframes typing-three {
        0%,
        66% {
          width: 0;
          border-right-color: transparent;
        }

        90% {
          width: 100%;
          border-right-color: color-mix(in srgb, var(--accent) 82%, #f4ffd8);
        }

        100% {
          width: 100%;
          border-right-color: transparent;
        }
      }

      @keyframes cursor-blink {
        0%,
        49% {
          opacity: 1;
        }

        50%,
        100% {
          opacity: 0;
        }
      }

      @keyframes drift-one {
        from {
          transform: translate3d(-12px, 0, 0);
        }

        to {
          transform: translate3d(18px, -8px, 0);
        }
      }

      @keyframes drift-two {
        from {
          transform: translate3d(16px, -6px, 0);
        }

        to {
          transform: translate3d(-8px, 10px, 0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .workflow-panel {
          opacity: 1;
          transform: none;
          animation: none;
        }

        .hero-line {
          opacity: 1;
          transform: none;
          animation: none;
        }

        .launch-canvas__fx,
        .workflow-task__spinner,
        .workflow-task--active,
        .stage--plays__ring,
        .stage--scouting__line,
        .stage--scouting__cursor,
        .stage--highlights__screen::after {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoCanvasComponent implements OnInit, OnDestroy {
  private readonly seo = inject(SeoService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly steps = SESSION_STEPS;

  private readonly activeStepIndex = signal(0);
  private readonly stageMode = signal<
    'running' | 'show-output' | 'closing-output' | 'completed-hold'
  >('running');
  private phaseTimer?: ReturnType<typeof setTimeout>;

  protected readonly activeStep = computed(
    () => this.steps[this.activeStepIndex()] ?? this.steps[0]
  );

  protected isStepRunning(index: number): boolean {
    return this.activeStepIndex() === index && this.stageMode() === 'running';
  }

  protected shouldRenderStep(index: number): boolean {
    return index <= this.activeStepIndex();
  }

  protected isStepCompleted(index: number): boolean {
    const activeIndex = this.activeStepIndex();
    if (index < activeIndex) return true;
    return index === activeIndex && this.stageMode() !== 'running';
  }

  protected isOutputVisibleFor(index: number): boolean {
    return this.activeStepIndex() === index && this.isOutputVisible();
  }

  protected isOutputVisible(): boolean {
    const mode = this.stageMode();
    return mode === 'show-output' || mode === 'closing-output';
  }

  protected isOutputClosing(): boolean {
    return this.stageMode() === 'closing-output';
  }

  protected showMoreFooter(): boolean {
    const isFinalStep = this.activeStepIndex() === this.steps.length - 1;
    return isFinalStep && this.stageMode() !== 'running';
  }

  protected getStepTimeLabel(index: number): string {
    if (this.isStepRunning(index)) {
      return 'Now';
    }

    if (this.isStepCompleted(index)) {
      return 'Just now';
    }

    return 'Queued';
  }

  protected getStepDurationLabel(index: number): string {
    if (this.isStepRunning(index)) {
      return 'live';
    }

    if (this.isStepCompleted(index)) {
      return '1m';
    }

    return '--';
  }

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'NXT1 Launch Video Canvas',
      description: 'Hidden internal launch-video canvas for 1920x1080 production capture.',
      keywords: ['agent x', 'launch video', 'operations canvas'],
      noIndex: true,
      noFollow: true,
    });

    if (isPlatformBrowser(this.platformId)) {
      this.startRotation();
    }
  }

  ngOnDestroy(): void {
    this.clearPhaseTimer();
  }

  private startRotation(): void {
    const inProgressDurationMs = 1100;
    const outputVisibleDurationMs = 1450;
    const closeDurationMs = 220;
    const finalHoldDurationMs = 500;

    const runActiveStep = (): void => {
      this.stageMode.set('running');
      this.schedulePhase(inProgressDurationMs, () => {
        this.stageMode.set('show-output');

        this.schedulePhase(outputVisibleDurationMs, () => {
          this.stageMode.set('closing-output');

          this.schedulePhase(closeDurationMs, () => {
            const isLastStep = this.activeStepIndex() >= this.steps.length - 1;

            if (isLastStep) {
              this.stageMode.set('completed-hold');
              this.schedulePhase(finalHoldDurationMs, () => {
                this.activeStepIndex.set(0);
                runActiveStep();
              });
              return;
            }

            const nextIndex = this.activeStepIndex() + 1;
            this.activeStepIndex.set(nextIndex);
            runActiveStep();
          });
        });
      });
    };

    runActiveStep();
  }

  private schedulePhase(durationMs: number, callback: () => void): void {
    this.clearPhaseTimer();
    this.phaseTimer = setTimeout(callback, durationMs);
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = undefined;
    }
  }
}
