import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { AgentXInputBarComponent } from '../../agent-x/components/inputs/agent-x-input-bar.component';
import { NxtIconComponent } from '../icon/icon.component';
import { NxtLogoComponent } from '../logo/logo.component';
import { NxtPlatformIconComponent } from '../platform-icon/platform-icon.component';
import { HapticsService } from '../../services/haptics/haptics.service';
import { NxtInteractiveDemoTimelineService } from './interactive-demo.service';

const DESKTOP_HANDOFF_AUDIO_DELAY_MS = 4_150;
const DESKTOP_COMPLETION_HOLD_MS = 900;
const DESKTOP_VIDEO_SRC = '/assets/shared/videos/desktop-video.mov';
const FINAL_SCORE_VIDEO_IMAGE_SRC = '/assets/shared/images/final-score-video.png';
const HIGHLIGHT_VIDEO_IMAGE_SRC = '/assets/shared/images/highlight-video.png';
const PDF_PLAYS_IMAGE_SRC = '/assets/shared/images/pdf-plays.png';
const PROSPECT_CARD_ATHLETE_IMAGE_SRC = '/assets/shared/images/prospect-card-athlete.png';
const STAT_CARD_VIDEO_IMAGE_SRC = '/assets/shared/images/stat-card-video.png';
const STRATEGY_CALL_SHEET_IMAGE_SRC = '/assets/shared/images/callsheet.png';

@Component({
  selector: 'nxt1-interactive-demo-reel',
  standalone: true,
  imports: [AgentXInputBarComponent, NxtIconComponent, NxtLogoComponent, NxtPlatformIconComponent],
  template: `
    <section
      class="launch-film"
      [class.launch-film--phone]="timeline.showPhone()"
      [class.launch-film--cascade]="timeline.showCascade()"
      aria-label="NXT1 reel launch film"
    >
      @if (timeline.showHook() || timeline.showOutro()) {
        <div class="launch-film__slide launch-film__slide--hook" aria-label="The Hook">
          <div class="launch-film__hook-mark">
            @if (timeline.showHook()) {
              <div class="launch-film__hook-typewriter" aria-label="Revolutionizing Sports.">
                <span class="launch-film__hook-line1">Revolutionizing</span>
                <span class="launch-film__hook-line2">Sports.</span>
              </div>
            } @else {
              <div
                class="launch-film__hook-typewriter"
                aria-label="Not A Chatbot. A Real Work Engine."
              >
                <span class="launch-film__hook-line1">Not A Chatbot.</span>
                <span class="launch-film__hook-line2">A Real Work Engine.</span>
              </div>
            }
          </div>
        </div>
      } @else if (timeline.showPrompt()) {
        <div
          class="launch-film__slide launch-film__slide--prompt"
          aria-label="Agent X prompt intro"
        >
          <div class="launch-film__prompt-stage">
            <nxt1-agent-x-input-bar
              class="launch-film__prompt-real launch-film__prompt-real--intro-light"
              [class.launch-film__prompt-real--selected]="timeline.introSendSelected()"
              [class.launch-film__prompt-real--source-active]="timeline.hudlSourceActive()"
              [userMessage]="timeline.typedPrompt()"
              [placeholder]="'Message Agent X'"
              [isLoading]="false"
              [uploading]="false"
              [canSend]="timeline.introCanSend()"
              [pendingFiles]="[]"
              [pendingSources]="timeline.pendingSources()"
              [pendingContexts]="[]"
              [selectedTask]="null"
            />
          </div>
        </div>
      } @else if (timeline.showCascade()) {
        <div
          class="launch-film__slide launch-film__slide--cascade"
          aria-label="Agent X role cascade"
        >
          <div class="launch-film__cascade-carousel" aria-label="Coordinator prompt carousel">
            @for (row of timeline.cascadeRows(); track row.role) {
              <article
                class="launch-film__cascade-card"
                [class.launch-film__cascade-card--active]="row.active"
                [class.launch-film__cascade-card--next]="row.next"
                [class.launch-film__cascade-card--back]="row.back"
                [class.launch-film__cascade-card--hidden]="row.hidden"
                [class.launch-film__cascade-card--complete]="row.complete"
              >
                <div class="launch-film__cascade-card-top">
                  <span>{{ row.role }}</span>
                  <strong>{{ row.unit }}</strong>
                </div>

                <nxt1-agent-x-input-bar
                  class="launch-film__prompt-real launch-film__cascade-real"
                  [class.launch-film__prompt-real--selected]="row.sendSelected"
                  [userMessage]="row.userMessage"
                  [placeholder]="'Message ' + row.role"
                  [isLoading]="false"
                  [uploading]="false"
                  [canSend]="row.canSend"
                  [pendingFiles]="[]"
                  [pendingSources]="[]"
                  [pendingContexts]="[]"
                  [selectedTask]="null"
                />

                <aside
                  class="launch-film__cascade-output"
                  [class.launch-film__cascade-output--visible]="row.outputVisible"
                  [class.launch-film__cascade-output--performance]="
                    row.outputKind === 'performance'
                  "
                  [class.launch-film__cascade-output--recruiting]="row.outputKind === 'recruiting'"
                  [class.launch-film__cascade-output--brand]="row.outputKind === 'brand'"
                  [class.launch-film__cascade-output--data]="row.outputKind === 'data'"
                  [class.launch-film__cascade-output--strategy]="row.outputKind === 'strategy'"
                  aria-label="Agent X generated output"
                >
                  @switch (row.outputKind) {
                    @case ('performance') {
                      <div class="launch-film__artifact-bar">
                        <div>
                          <span>{{ row.outputMeta }}</span>
                          <strong>Your PDF download is ready</strong>
                        </div>
                        <svg
                          class="launch-film__pdf-icon"
                          viewBox="0 0 48 56"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M8 2H30L44 16V50C44 52.2 42.2 54 40 54H8C5.8 54 4 52.2 4 50V6C4 3.8 5.8 2 8 2Z"
                          />
                          <path d="M30 2V15C30 16.1 30.9 17 32 17H44" />
                          <rect x="10" y="28" width="28" height="15" rx="3" />
                          <text x="24" y="39" text-anchor="middle">PDF</text>
                        </svg>
                      </div>
                      <div class="launch-film__pdf-preview" aria-hidden="true">
                        <div class="launch-film__pdf-image-placeholder">
                          <img class="launch-film__pdf-image" [src]="pdfPlaysImageSrc" alt="" />
                        </div>
                      </div>
                      <button type="button" class="launch-film__pdf-download" aria-hidden="true">
                        <nxt1-icon name="download" [size]="16" />
                        Download PDF
                      </button>
                    }
                    @case ('recruiting') {
                      <div class="launch-film__mail-card">
                        <div class="launch-film__mail-header">
                          <div class="launch-film__gmail-icon" aria-hidden="true">
                            <nxt1-platform-icon
                              icon="link"
                              faviconUrl="https://www.google.com/s2/favicons?domain=mail.google.com&sz=64"
                              [size]="24"
                              alt="Gmail"
                            />
                          </div>
                          <div>
                            <span>{{ row.outputMeta }}</span>
                            <strong>Your email draft is ready</strong>
                          </div>
                        </div>
                        <div class="launch-film__school-stack" aria-hidden="true">
                          <img
                            src="https://a.espncdn.com/i/teamlogos/ncaa/500/194.png"
                            alt="Ohio State"
                            width="42"
                            height="42"
                            loading="lazy"
                          />
                          <img
                            src="https://a.espncdn.com/i/teamlogos/ncaa/500/150.png"
                            alt="Duke"
                            width="42"
                            height="42"
                            loading="lazy"
                          />
                          <img
                            src="https://a.espncdn.com/i/teamlogos/ncaa/500/61.png"
                            alt="Georgia"
                            width="42"
                            height="42"
                            loading="lazy"
                          />
                          <img
                            src="https://a.espncdn.com/i/teamlogos/ncaa/500/24.png"
                            alt="Stanford"
                            width="42"
                            height="42"
                            loading="lazy"
                          />
                        </div>
                        <p>{{ row.outputDetail }}</p>
                        <div class="confirm-card launch-film__approval-card">
                          <div class="confirm-card__header">
                            <svg class="confirm-card__icon" viewBox="0 0 20 20" fill="none">
                              <circle
                                cx="10"
                                cy="10"
                                r="8"
                                stroke="currentColor"
                                stroke-width="1.5"
                              />
                              <path
                                d="M10 6V11"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                              />
                              <circle cx="10" cy="14" r="1" fill="currentColor" />
                            </svg>
                            <span class="confirm-card__title">Review and Approve Email</span>
                          </div>
                          <p class="confirm-card__message">
                            Review the generated coach outreach before Agent X sends it.
                          </p>
                          <div
                            class="launch-film__email-draft-preview"
                            aria-label="Email draft preview"
                          >
                            <div class="launch-film__email-draft-row">
                              <span>Subject</span>
                              <strong>2026 DB film, transcript, and verified testing</strong>
                            </div>
                            <div class="launch-film__email-draft-body">
                              <span>Body</span>
                              <p>
                                Coach, I wanted to send my updated senior film, transcript, and
                                spring testing numbers. I also attached my academic profile and
                                next-game schedule for your staff to review.
                              </p>
                            </div>
                          </div>
                          <div class="confirm-card__actions">
                            <button type="button" class="confirm-btn confirm-btn--secondary">
                              Cancel
                            </button>
                            <button type="button" class="confirm-btn confirm-btn--primary">
                              Approve
                            </button>
                          </div>
                        </div>
                      </div>
                    }
                    @case ('brand') {
                      <div class="launch-film__artifact-bar">
                        <div>
                          <span>{{ row.outputMeta }}</span>
                          <strong>Your graphics package is ready</strong>
                        </div>
                      </div>
                      <div class="launch-film__graphic-grid" aria-hidden="true">
                        <figure>
                          <div
                            class="launch-film__graphic-placeholder launch-film__graphic-placeholder--hero launch-film__graphic-placeholder--image"
                          >
                            <img
                              class="launch-film__graphic-image"
                              [src]="finalScoreVideoImageSrc"
                              alt=""
                            />
                          </div>
                          <figcaption>Story graphic</figcaption>
                        </figure>
                        <figure>
                          <div
                            class="launch-film__graphic-placeholder launch-film__graphic-placeholder--clip launch-film__graphic-placeholder--image"
                          >
                            <img
                              class="launch-film__graphic-image"
                              [src]="statCardVideoImageSrc"
                              alt=""
                            />
                          </div>
                          <figcaption>Game recap</figcaption>
                        </figure>
                        <figure>
                          <div
                            class="launch-film__graphic-placeholder launch-film__graphic-placeholder--poster launch-film__graphic-placeholder--image"
                          >
                            <img
                              class="launch-film__graphic-image"
                              [src]="prospectCardAthleteImageSrc"
                              alt=""
                            />
                          </div>
                          <figcaption>Athlete post</figcaption>
                        </figure>
                        <figure>
                          <div
                            class="launch-film__graphic-placeholder launch-film__graphic-placeholder--banner launch-film__graphic-placeholder--image launch-film__graphic-placeholder--video"
                          >
                            <img
                              class="launch-film__graphic-image"
                              [src]="highlightVideoImageSrc"
                              alt=""
                            />
                            <span class="launch-film__graphic-video-badge" aria-hidden="true">
                              <nxt1-icon name="play-circle-outline" [size]="18" />
                            </span>
                          </div>
                          <figcaption>Athlete video</figcaption>
                        </figure>
                      </div>
                    }
                    @case ('data') {
                      <div class="launch-film__artifact-bar launch-film__artifact-bar--schedule">
                        <span class="launch-film__schedule-icon" aria-hidden="true">
                          <nxt1-icon name="calendar-outline" [size]="22" />
                        </span>
                        <div>
                          <span>{{ row.outputMeta }}</span>
                          <strong>Your scheduled sync is ready</strong>
                        </div>
                      </div>
                      <div class="launch-film__sync-list" aria-hidden="true">
                        <span><b>84</b>Profiles</span>
                        <span><b>12</b>Roster edits</span>
                        <span><b>6</b>Leaderboards</span>
                        <span><b>41</b>Stat lines</span>
                        <span><b>18</b>New rankings</span>
                        <span><b>9</b>Team pages</span>
                        <span><b>27</b>Player IDs</span>
                        <span><b>3</b>Alerts queued</span>
                      </div>
                    }
                    @default {
                      <div class="launch-film__strategy-card">
                        <div>
                          <span>{{ row.outputMeta }}</span>
                          <strong>Your call sheet is ready</strong>
                        </div>
                        <div class="launch-film__strategy-image-placeholder" aria-hidden="true">
                          <img
                            class="launch-film__strategy-image"
                            [src]="strategyCallSheetImageSrc"
                            alt=""
                          />
                        </div>
                        <p>{{ row.outputDetail }}</p>
                        <div class="launch-film__strategy-actions" aria-hidden="true">
                          <button type="button">Print</button>
                          <button type="button">Share</button>
                        </div>
                      </div>
                    }
                  }
                </aside>
              </article>
            }
          </div>
        </div>
      } @else if (timeline.showFinale()) {
        <div class="launch-film__slide launch-film__slide--finale" aria-label="NXT1 finale">
          <div
            class="launch-film__finale-copy"
            aria-label="BUILT FOR PERFORMANCE. BRAND. STRATEGY. ADMIN. DATA. RECRUITING."
          >
            <span class="launch-film__finale-kicker">BUILT FOR</span>
            <div class="launch-film__finale-words" aria-hidden="true">
              <span class="launch-film__finale-word launch-film__finale-word--performance"
                >PERFORMANCE.</span
              >
              <span class="launch-film__finale-word launch-film__finale-word--brand">BRAND.</span>
              <span class="launch-film__finale-word launch-film__finale-word--strategy"
                >STRATEGY.</span
              >
              <span class="launch-film__finale-word launch-film__finale-word--admin">ADMIN.</span>
              <span class="launch-film__finale-word launch-film__finale-word--data">DATA.</span>
              <span class="launch-film__finale-word launch-film__finale-word--recruiting"
                >RECRUITING.</span
              >
            </div>
          </div>

          <div class="launch-film__finale-url-panel" aria-label="nxt1sports.com NXT1 Sports">
            <div class="launch-film__finale-url-card">
              <span class="launch-film__finale-url-text">nxt1sports.com</span>
              <nxt1-logo
                class="launch-film__finale-logo"
                size="xl"
                variant="default"
                alt="NXT1 Sports"
              />
            </div>
          </div>
        </div>
      } @else {
        <div class="launch-film__slide launch-film__slide--phone" aria-label="Device handoff">
          <div class="launch-film__device-handoff">
            <div class="launch-film__iphone" aria-hidden="true">
              <div class="launch-film__island"></div>
              <div class="launch-film__screen">
                @if (phoneVideoSrc()) {
                  <video
                    class="launch-film__phone-video"
                    [src]="phoneVideoSrc()"
                    autoplay
                    [loop]="shouldLoopPhoneVideo"
                    muted
                    playsinline
                    preload="auto"
                    (ended)="handlePhoneVideoEnded()"
                  ></video>
                }
              </div>
            </div>

            <div class="launch-film__desktop" aria-hidden="true">
              <div class="launch-film__desktop-glow"></div>
              <div class="launch-film__desktop-frame">
                <div class="launch-film__desktop-camera"></div>
                <div class="launch-film__desktop-screen">
                  @if (desktopVideoActive()) {
                    <video
                      class="launch-film__desktop-video"
                      [src]="desktopVideoSrc"
                      autoplay
                      muted
                      playsinline
                      preload="auto"
                      (ended)="handleDesktopVideoEnded()"
                    ></video>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        color: #f7f7f2;
      }

      .launch-film {
        container-type: size;
        isolation: isolate;
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #ffffff;
        font-family: var(--nxt1-fontFamily-brand, Inter, sans-serif);
      }

      .launch-film::before,
      .launch-film::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .launch-film::before {
        z-index: 0;
        inset: -24%;
        background:
          linear-gradient(
            112deg,
            transparent 0%,
            transparent 14%,
            rgba(204, 255, 0, 0.92) 30%,
            rgba(255, 255, 255, 0.88) 48%,
            rgba(204, 255, 0, 0.62) 66%,
            transparent 84%,
            transparent 100%
          ),
          linear-gradient(
            34deg,
            rgba(0, 0, 0, 0.08) 0%,
            transparent 22%,
            transparent 68%,
            rgba(0, 0, 0, 0.05) 100%
          ),
          linear-gradient(72deg, transparent 8%, rgba(204, 255, 0, 0.28) 28%, transparent 54%),
          linear-gradient(156deg, transparent 10%, rgba(204, 255, 0, 0.2) 44%, transparent 78%);
        background-size:
          210% 210%,
          150% 150%,
          120% 120%,
          130% 130%;
        filter: blur(18px) saturate(1.06);
        opacity: 0.9;
        transform: translate3d(-2cqi, -1cqh, 0) rotate(-2deg);
        animation: launch-film-gradient 10.5s cubic-bezier(0.45, 0, 0.25, 1) infinite alternate;
      }

      .launch-film::after {
        z-index: 0;
        background:
          linear-gradient(
            128deg,
            transparent 0%,
            transparent 58%,
            rgba(0, 0, 0, 0.1) 74%,
            transparent 88%
          ),
          linear-gradient(rgba(0, 0, 0, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 0, 0, 0.026) 1px, transparent 1px);
        background-size:
          170% 170%,
          100% 5.2cqh,
          5.2cqh 100%;
        mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 74%);
        opacity: 0.72;
        animation: launch-film-atmosphere 13s ease-in-out infinite alternate;
      }

      .launch-film--cascade {
        background: #050705;
      }

      .launch-film--cascade::before {
        background:
          linear-gradient(
            112deg,
            transparent 0%,
            transparent 18%,
            rgba(204, 255, 0, 0.18) 31%,
            rgba(5, 7, 5, 0.94) 46%,
            rgba(10, 16, 12, 0.86) 58%,
            rgba(204, 255, 0, 0.12) 70%,
            transparent 88%,
            transparent 100%
          ),
          linear-gradient(
            34deg,
            rgba(204, 255, 0, 0.08) 0%,
            transparent 22%,
            transparent 68%,
            rgba(65, 184, 255, 0.08) 100%
          ),
          linear-gradient(72deg, transparent 8%, rgba(204, 255, 0, 0.12) 28%, transparent 54%),
          linear-gradient(156deg, transparent 10%, rgba(65, 184, 255, 0.08) 44%, transparent 78%);
        background-size:
          210% 210%,
          150% 150%,
          120% 120%,
          130% 130%;
        filter: blur(18px) saturate(1.06);
        opacity: 0.78;
        transform: translate3d(-2cqi, -1cqh, 0) rotate(-2deg);
        animation: launch-film-gradient 10.5s cubic-bezier(0.45, 0, 0.25, 1) infinite alternate;
      }

      .launch-film--cascade::after {
        background:
          linear-gradient(
            128deg,
            transparent 0%,
            transparent 58%,
            rgba(255, 255, 255, 0.1) 74%,
            transparent 88%
          ),
          linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.026) 1px, transparent 1px);
        background-size:
          170% 170%,
          100% 5.2cqh,
          5.2cqh 100%;
        mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 74%);
        opacity: 0.72;
        animation: launch-film-atmosphere 13s ease-in-out infinite alternate;
      }

      .launch-film__slide {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: grid;
        place-items: center;
        padding: 8cqh 10cqi;
      }

      .launch-film__slide--hook {
        overflow: hidden;
        justify-items: center;
        align-items: center;
        padding: 0 8cqi;
        background: #ccff00;
      }

      .launch-film__hook-mark {
        position: relative;
        z-index: 1;
        display: grid;
        justify-items: center;
        gap: 1.8cqh;
        width: min(100%, 72cqi);
        animation: launch-film-intro-in 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }

      .launch-film__hook-typewriter {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.06em;
        text-align: center;
      }

      .launch-film__hook-line1,
      .launch-film__hook-line2 {
        color: #050705;
        font-size: clamp(38px, 10cqi, 84px);
        font-weight: 780;
        letter-spacing: -0.045em;
        line-height: 0.92;
        text-shadow: 0 1.2cqh 4.5cqh rgba(5, 7, 5, 0.18);
        white-space: nowrap;
        opacity: 0;
        transform: translateY(3.5cqh);
        filter: blur(10px);
      }

      .launch-film__hook-line1 {
        display: block;
        animation: launch-film-word-in 900ms cubic-bezier(0.16, 1, 0.3, 1) 120ms forwards;
      }

      .launch-film__hook-line2 {
        display: inline-flex;
        align-items: center;
        animation: launch-film-word-in 900ms cubic-bezier(0.16, 1, 0.3, 1) 600ms forwards;
      }

      .launch-film__slide--finale {
        overflow: hidden;
        padding: 0 8cqi;
        background: #41b8ff;
        animation: launch-film-finale-background 5.65s cubic-bezier(0.45, 0, 0.25, 1) both;
      }

      .launch-film__finale-copy {
        position: relative;
        z-index: 1;
        display: grid;
        justify-items: center;
        gap: clamp(10px, 2.4cqh, 22px);
        width: min(100%, 86cqi);
        color: #050705;
        text-align: center;
        animation: launch-film-finale-copy-out 7.2s ease both;
      }

      .launch-film__finale-kicker {
        display: block;
        font-size: clamp(26px, 6.3cqi, 54px);
        font-weight: 760;
        letter-spacing: 0;
        line-height: 1;
        opacity: 0;
        transform: translate3d(0, 2cqh, 0);
        animation: launch-film-finale-kicker-in 720ms cubic-bezier(0.16, 1, 0.3, 1) 120ms forwards;
      }

      .launch-film__finale-words {
        position: relative;
        display: grid;
        place-items: center;
        width: 100%;
        min-height: clamp(76px, 17cqi, 148px);
      }

      .launch-film__finale-word {
        position: absolute;
        inset: auto 0;
        display: block;
        color: #050705;
        font-size: clamp(54px, 13cqi, 124px);
        font-weight: 880;
        letter-spacing: 0;
        line-height: 0.92;
        text-shadow:
          0 1.5cqh 5.5cqh rgba(5, 7, 5, 0.2),
          0 0 3.8cqh rgba(255, 255, 255, 0.16);
        opacity: 0;
        transform: translate3d(0, 5cqh, 0) scale(0.94);
        filter: blur(10px);
      }

      .launch-film__finale-word--performance {
        animation: launch-film-finale-word-cycle 5.65s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .launch-film__finale-word--brand {
        animation: launch-film-finale-word-cycle 5.65s cubic-bezier(0.16, 1, 0.3, 1) 820ms both;
      }

      .launch-film__finale-word--strategy {
        animation: launch-film-finale-word-cycle 5.65s cubic-bezier(0.16, 1, 0.3, 1) 1.64s both;
      }

      .launch-film__finale-word--admin {
        animation: launch-film-finale-word-cycle 5.65s cubic-bezier(0.16, 1, 0.3, 1) 2.46s both;
      }

      .launch-film__finale-word--data {
        animation: launch-film-finale-word-cycle 5.65s cubic-bezier(0.16, 1, 0.3, 1) 3.28s both;
      }

      .launch-film__finale-word--recruiting {
        animation: launch-film-finale-word-win 5.65s cubic-bezier(0.16, 1, 0.3, 1) 4.1s both;
      }

      .launch-film__finale-url-panel {
        position: absolute;
        inset: 0;
        z-index: 3;
        display: grid;
        place-items: center;
        background:
          linear-gradient(
            112deg,
            transparent 0%,
            transparent 14%,
            rgba(204, 255, 0, 0.92) 30%,
            rgba(255, 255, 255, 0.88) 48%,
            rgba(204, 255, 0, 0.62) 66%,
            transparent 84%,
            transparent 100%
          ),
          linear-gradient(
            34deg,
            rgba(0, 0, 0, 0.08) 0%,
            transparent 22%,
            transparent 68%,
            rgba(0, 0, 0, 0.05) 100%
          ),
          linear-gradient(72deg, transparent 8%, rgba(204, 255, 0, 0.28) 28%, transparent 54%),
          linear-gradient(156deg, transparent 10%, rgba(204, 255, 0, 0.2) 44%, transparent 78%),
          #ffffff;
        background-size:
          210% 210%,
          150% 150%,
          120% 120%,
          130% 130%,
          100% 100%;
        transform: translate3d(0, 100%, 0);
        animation:
          launch-film-finale-url-rise 7.2s cubic-bezier(0.2, 0.82, 0.18, 1) both,
          launch-film-finale-url-gradient 10.5s cubic-bezier(0.45, 0, 0.25, 1) infinite alternate;
      }

      .launch-film__finale-url-panel::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(rgba(0, 0, 0, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 0, 0, 0.026) 1px, transparent 1px);
        background-size:
          100% 5.4cqh,
          5.4cqh 100%;
        mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 74%);
        opacity: 0.56;
        pointer-events: none;
      }

      .launch-film__finale-url-card {
        position: relative;
        z-index: 1;
        display: grid;
        place-items: center;
        width: min(76cqi, 760px);
        min-height: clamp(96px, 17cqh, 168px);
        opacity: 0;
        transform: translate3d(0, 2cqh, 0) scale(0.98);
        animation: launch-film-finale-card-in 7.2s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .launch-film__finale-url-text,
      .launch-film__finale-logo {
        grid-area: 1 / 1;
      }

      .launch-film__finale-url-text {
        color: #050705;
        font-size: clamp(38px, 8.8cqi, 92px);
        font-weight: 850;
        letter-spacing: 0;
        line-height: 1;
        text-shadow:
          0 1.6cqh 5.6cqh rgba(0, 0, 0, 0.18),
          0 0 5.2cqh rgba(255, 255, 255, 0.18);
        transform: translate3d(0, 0, 0) scale(1);
        animation: launch-film-finale-url-text-out 7.2s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .launch-film__finale-logo {
        width: min(48cqi, 520px);
        opacity: 0;
        transform: translate3d(0, 2cqh, 0) scale(0.86);
        filter: drop-shadow(0 2cqh 4.8cqh rgba(0, 0, 0, 0.2))
          drop-shadow(0 0 2.4cqh rgba(204, 255, 0, 0.28));
        animation: launch-film-finale-logo-in 7.2s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      @keyframes launch-film-finale-background {
        0%,
        14% {
          background-color: #41b8ff;
        }
        17%,
        29% {
          background-color: #ff7a45;
        }
        32%,
        44% {
          background-color: #9d7bff;
        }
        47%,
        59% {
          background-color: #3fa3ff;
        }
        62%,
        74% {
          background-color: #2fd39a;
        }
        77%,
        100% {
          background-color: #ccff00;
        }
      }

      @keyframes launch-film-finale-kicker-in {
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }
      }

      @keyframes launch-film-finale-word-cycle {
        0% {
          opacity: 0;
          transform: translate3d(0, 5cqh, 0) scale(0.94);
          filter: blur(10px);
        }
        9%,
        17% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
        25%,
        100% {
          opacity: 0;
          transform: translate3d(0, -4cqh, 0) scale(1.04);
          filter: blur(8px);
        }
      }

      @keyframes launch-film-finale-word-win {
        0% {
          opacity: 0;
          transform: translate3d(0, 5cqh, 0) scale(0.94);
          filter: blur(10px);
        }
        12%,
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes launch-film-finale-copy-out {
        0%,
        75% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
        84%,
        100% {
          opacity: 0;
          transform: translate3d(0, -4cqh, 0) scale(0.98);
          filter: blur(8px);
        }
      }

      @keyframes launch-film-finale-url-rise {
        0%,
        76% {
          transform: translate3d(0, 100%, 0);
        }
        88%,
        100% {
          transform: translate3d(0, 0, 0);
        }
      }

      @keyframes launch-film-finale-url-gradient {
        from {
          background-position:
            0% 50%,
            18% 26%,
            0% 0%,
            100% 100%,
            0 0;
        }
        to {
          background-position:
            100% 50%,
            82% 74%,
            22% 18%,
            78% 84%,
            0 0;
        }
      }

      @keyframes launch-film-finale-card-in {
        0%,
        84% {
          opacity: 0;
          transform: translate3d(0, 2cqh, 0) scale(0.98);
          filter: blur(8px);
        }
        91%,
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes launch-film-finale-url-text-out {
        0%,
        92% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
        96%,
        100% {
          opacity: 0;
          transform: translate3d(0, -2cqh, 0) scale(0.92);
          filter: blur(8px);
        }
      }

      @keyframes launch-film-finale-logo-in {
        0%,
        93% {
          opacity: 0;
          transform: translate3d(0, 2cqh, 0) scale(0.86);
          filter: blur(8px) drop-shadow(0 2cqh 4.8cqh rgba(0, 0, 0, 0.2))
            drop-shadow(0 0 2.4cqh rgba(204, 255, 0, 0.28));
        }
        97% {
          opacity: 1;
          transform: translate3d(0, -0.5cqh, 0) scale(1.07);
          filter: blur(0) drop-shadow(0 2.4cqh 5.8cqh rgba(0, 0, 0, 0.2))
            drop-shadow(0 0 4.6cqh rgba(204, 255, 0, 0.44));
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0) drop-shadow(0 2cqh 4.8cqh rgba(0, 0, 0, 0.2))
            drop-shadow(0 0 2.4cqh rgba(204, 255, 0, 0.28));
        }
      }

      @keyframes launch-film-hook-drift {
        0% {
          transform: scale(1.08) translate3d(-1.2%, -0.8%, 0);
        }
        50% {
          transform: scale(1.11) translate3d(0.6%, 0.9%, 0);
        }
        100% {
          transform: scale(1.09) translate3d(1.4%, -0.4%, 0);
        }
      }

      @keyframes launch-film-hook-sheen {
        0% {
          transform: translate3d(-32%, 0, 0) skewX(-12deg);
          opacity: 0;
        }
        18% {
          opacity: 0.38;
        }
        52% {
          opacity: 0.54;
        }
        100% {
          transform: translate3d(28%, 0, 0) skewX(-12deg);
          opacity: 0;
        }
      }

      .launch-film__slide--prompt {
        perspective: 180cqh;
        padding: 0 0.8cqi;
      }

      .launch-film__prompt-stage {
        display: grid;
        place-items: center;
        width: 100%;
        transform-origin: 62% 58%;
        will-change: transform, opacity, filter;
        animation: launch-film-prompt-push-in 1000ms cubic-bezier(0.2, 0.82, 0.18, 1) both;
      }

      .launch-film__prompt-real {
        width: min(100%, 86cqi);
        margin: 0 auto;
        --input-selection-bg: rgba(204, 255, 0, 0.14);
      }

      .launch-film__prompt-real--intro-light {
        --input-bg: #ffffff;
        --input-surface: var(--nxt1-color-light-100, #f5f5f5);
        --input-border: rgba(0, 0, 0, 0.12);
        --input-text: var(--nxt1-color-light-900, #212121);
        --input-muted: var(--nxt1-color-light-600, #757575);
        --input-primary: #a3cc00;
        --input-primary-glow: rgba(163, 204, 0, 0.12);
        --input-caret: #a3cc00;
        --input-selection-bg: rgba(163, 204, 0, 0.12);
        --input-surface-hover: var(--nxt1-color-light-150, #f0f0f0);
        --input-chip-remove-bg: rgba(240, 240, 240, 0.96);
        --input-chip-remove-fg: #1a1a1a;
        --input-chip-remove-border: rgba(0, 0, 0, 0.3);
        --input-chip-remove-icon: #1a1a1a;
      }

      .launch-film__prompt-real--intro-light ::ng-deep .input-card {
        box-shadow:
          0 2.2cqh 7cqh rgba(0, 0, 0, 0.16),
          0 0 0 1px rgba(255, 255, 255, 0.9);
      }

      .launch-film__cascade-real {
        --input-bg: #050705;
        --input-surface: rgba(8, 12, 10, 0.92);
        --input-border: rgba(255, 255, 255, 0.13);
        --input-text: #ffffff;
        --input-muted: rgba(255, 255, 255, 0.58);
        --input-primary: #ccff00;
        --input-primary-glow: rgba(204, 255, 0, 0.14);
        --input-caret: #ccff00;
        --input-selection-bg: rgba(204, 255, 0, 0.14);
        --input-surface-hover: rgba(255, 255, 255, 0.1);
        --input-chip-remove-bg: rgba(10, 10, 10, 0.88);
        --input-chip-remove-fg: #ffffff;
        --input-chip-remove-border: rgba(255, 255, 255, 0.55);
        --input-chip-remove-icon: #ffffff;
      }

      .launch-film__cascade-real ::ng-deep .input-card {
        background: rgba(8, 12, 10, 0.94) !important;
        border-color: rgba(255, 255, 255, 0.13) !important;
        box-shadow:
          0 1.8cqh 6.2cqh rgba(0, 0, 0, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      .launch-film__cascade-real ::ng-deep .input-textarea {
        color: #ffffff !important;
        caret-color: #ccff00 !important;
        accent-color: #ccff00 !important;
      }

      .launch-film__cascade-real ::ng-deep .input-textarea::placeholder {
        color: rgba(255, 255, 255, 0.58) !important;
      }

      .launch-film__cascade-real ::ng-deep .input-textarea::selection {
        color: #ffffff !important;
        background: rgba(204, 255, 0, 0.14) !important;
      }

      .launch-film__cascade-real ::ng-deep .input-btn {
        background: rgba(255, 255, 255, 0.1) !important;
        border-color: rgba(255, 255, 255, 0.13) !important;
        color: rgba(255, 255, 255, 0.58) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22) !important;
      }

      .launch-film__cascade-real ::ng-deep .input-send-btn.active {
        background: rgba(204, 255, 0, 0.14) !important;
        border-color: #ccff00 !important;
        color: #ccff00 !important;
        box-shadow: 0 4px 12px rgba(204, 255, 0, 0.15) !important;
      }

      .launch-film__prompt-real ::ng-deep .agent-x-input-root {
        padding-left: 0;
        padding-right: 0;
      }

      .launch-film__prompt-real ::ng-deep .input-card {
        padding-right: 14px;
      }

      .launch-film__prompt-real--source-active ::ng-deep .input-attachment-strip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: fit-content;
        max-width: calc(100% - 28px);
        margin: 0 10px 8px auto;
        padding: 5px 12px 5px 8px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.95);
        border-radius: 999px;
        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }

      .launch-film__prompt-real--source-active ::ng-deep .input-attachment {
        gap: 6px;
      }

      .launch-film__prompt-real--source-active ::ng-deep .input-attachment-thumb {
        width: 18px;
        height: 18px;
        border: none;
        border-radius: 4px;
      }

      .launch-film__prompt-real--source-active ::ng-deep .input-attachment-source-badge {
        position: static;
        max-width: none;
        padding: 0;
        background: transparent;
        color: #0a0a0a;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: 0.01em;
        text-transform: none;
      }

      .launch-film__prompt-real--source-active ::ng-deep .input-attachment-remove {
        display: none;
      }

      .launch-film__prompt-real ::ng-deep .input-textarea {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .launch-film__prompt-real--selected ::ng-deep .input-send-btn.active {
        transform: scale(1.08);
        box-shadow:
          0 0 0 0.26cqi rgba(204, 255, 0, 0.16),
          0 0 3.6cqh rgba(204, 255, 0, 0.22);
        animation: launch-film-send-select 420ms ease-out both;
      }

      .launch-film__intro strong {
        color: #fff;
        font-size: clamp(31px, 6.8cqi, 50px);
        font-weight: 780;
        letter-spacing: -0.03em;
        line-height: 1.05;
        text-wrap: balance;
        text-shadow: 0 1.4cqh 7cqh rgba(0, 0, 0, 0.36);
      }

      .launch-film__slide--cascade {
        overflow: hidden;
        align-content: start;
        grid-template-rows: 1fr;
        padding: 8.4cqh 1.2cqi 5.6cqh;
        perspective: 120cqh;
        background: transparent;
        animation: launch-film-cascade-in 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }

      .launch-film__cascade-carousel {
        position: relative;
        z-index: 1;
        width: 100%;
        min-height: 68cqh;
        margin: 0 auto;
        transform-style: preserve-3d;
      }

      .launch-film__cascade-card {
        position: absolute;
        left: 50%;
        top: 0;
        display: grid;
        gap: 1.6cqh;
        width: 100%;
        max-width: 100%;
        transform-origin: 50% 50%;
        transition:
          opacity 360ms cubic-bezier(0.2, 0.8, 0.2, 1),
          transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1),
          filter 360ms ease;
        will-change: opacity, transform, filter;
      }

      .launch-film__cascade-card--hidden {
        opacity: 0;
        transform: translate3d(-50%, 46cqh, -40cqh) scale(0.6);
        pointer-events: none;
      }

      .launch-film__cascade-card--active {
        z-index: 3;
        opacity: 1;
        transform: translate3d(-50%, 0, 9cqh) rotateY(0deg) scale(1);
        filter: blur(0);
      }

      .launch-film__cascade-card--next {
        z-index: 2;
        opacity: 0.36;
        transform: translate3d(-20%, 15cqh, -18cqh) rotateY(-22deg) scale(0.72);
        filter: blur(1.6px);
      }

      .launch-film__cascade-card--back {
        z-index: 1;
        opacity: 0.24;
        transform: translate3d(-80%, 15cqh, -18cqh) rotateY(22deg) scale(0.72);
        filter: blur(1.9px);
      }

      .launch-film__cascade-card-top {
        width: min(100%, 86cqi);
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1.5cqi;
        min-width: 0;
        padding: 0 1.2cqi;
      }

      .launch-film__cascade-card-top span {
        min-width: 0;
        overflow: hidden;
        color: rgba(255, 255, 255, 0.92);
        font-size: clamp(13px, 3.15cqi, 18px);
        font-weight: 850;
        letter-spacing: 0;
        line-height: 1;
        text-overflow: ellipsis;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .launch-film__cascade-card-top strong {
        flex: 0 0 auto;
        border: 1px solid rgba(204, 255, 0, 0.28);
        border-radius: 999px;
        padding: 0.52cqh 1.4cqi;
        color: #ccff00;
        font-size: clamp(9px, 2.15cqi, 12px);
        font-weight: 850;
        letter-spacing: 0;
        line-height: 1;
        text-transform: uppercase;
      }

      .launch-film__cascade-real {
        width: min(100%, 86cqi);
        margin: 0 auto;
      }

      .launch-film__cascade-card--next .launch-film__cascade-real,
      .launch-film__cascade-card--back .launch-film__cascade-real,
      .launch-film__cascade-card--next .launch-film__cascade-output,
      .launch-film__cascade-card--back .launch-film__cascade-output {
        pointer-events: none;
      }

      .launch-film__cascade-output {
        width: min(100%, 86cqi);
        margin: 0 auto;
        display: grid;
        gap: 1.15cqh;
        min-height: 25cqh;
        border: 0;
        border-radius: 8px;
        padding: 0;
        overflow: hidden;
        background: transparent;
        box-shadow: none;
        opacity: 0;
        transform: translate3d(0, 1.6cqh, 0) scale(0.985);
        transition:
          opacity 180ms ease,
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
        pointer-events: none;
      }

      .launch-film__cascade-output--visible {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }

      .launch-film__cascade-output span {
        color: #ccff00;
        font-size: clamp(9px, 2.1cqi, 12px);
        font-weight: 850;
        letter-spacing: 0;
        line-height: 1;
        text-transform: uppercase;
      }

      .launch-film__cascade-output strong {
        color: #fff;
        font-size: clamp(16px, 4.4cqi, 25px);
        font-weight: 850;
        letter-spacing: 0;
        line-height: 1.02;
      }

      .launch-film__cascade-output p {
        margin: 0;
        color: rgba(255, 255, 255, 0.74);
        font-size: clamp(10px, 2.45cqi, 13px);
        font-weight: 620;
        line-height: 1.3;
      }

      .launch-film__artifact-bar,
      .launch-film__mail-card,
      .launch-film__strategy-card {
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.025)),
          rgba(9, 11, 11, 0.92);
        box-shadow:
          0 2.2cqh 5.2cqh rgba(0, 0, 0, 0.34),
          inset 0 1px 0 rgba(255, 255, 255, 0.09);
      }

      .launch-film__artifact-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 2cqi;
        min-height: 7.2cqh;
        padding: 1.15cqh 2.4cqi;
      }

      .launch-film__artifact-bar > div,
      .launch-film__mail-header > div,
      .launch-film__strategy-card > div:first-child {
        display: grid;
        gap: 0.45cqh;
        min-width: 0;
      }

      .launch-film__pdf-icon {
        flex: 0 0 auto;
        width: 10.5cqi;
        max-width: 48px;
        height: auto;
        color: #d22630;
        filter: drop-shadow(0 1.2cqh 2.4cqh rgba(0, 0, 0, 0.25));
      }

      .launch-film__pdf-icon path:first-child {
        fill: #ffffff;
        stroke: rgba(0, 0, 0, 0.14);
        stroke-width: 1.3;
      }

      .launch-film__pdf-icon path:nth-child(2) {
        stroke: rgba(0, 0, 0, 0.22);
        stroke-width: 1.3;
      }

      .launch-film__pdf-icon rect {
        fill: #d22630;
      }

      .launch-film__pdf-icon text {
        fill: #ffffff;
        font-size: 9px;
        font-weight: 900;
        letter-spacing: 0.02em;
        box-shadow: 0 1.2cqh 2.4cqh rgba(0, 0, 0, 0.25);
      }

      .launch-film__pdf-preview {
        display: grid;
        place-items: center;
        min-height: 21cqh;
        border-radius: 8px;
        background:
          radial-gradient(circle at 18% 18%, rgba(204, 255, 0, 0.16), transparent 26%),
          rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        overflow: hidden;
      }

      .launch-film__pdf-image-placeholder {
        display: block;
        width: min(76%, 245px);
        aspect-ratio: 16 / 9;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        background: rgba(245, 245, 241, 0.98);
        box-shadow: 0 2cqh 4.2cqh rgba(0, 0, 0, 0.36);
        transform: rotate(-2deg);
      }

      .launch-film__pdf-image {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center top;
        background: #f5f5f1;
      }

      .launch-film__pdf-download {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        min-height: 5cqh;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 8px 16px;
        background: #ccff00;
        color: #0a0a0a;
        font-size: clamp(10px, 2.35cqi, 13px);
        font-weight: 700;
        letter-spacing: 0;
        box-shadow: none;
      }

      .launch-film__mail-card,
      .launch-film__strategy-card {
        display: grid;
        gap: 1.15cqh;
        padding: 1.35cqh 2.4cqi;
      }

      .launch-film__mail-header {
        display: flex;
        align-items: center;
        gap: 2cqi;
      }

      .launch-film__gmail-icon {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 9.2cqi;
        max-width: 42px;
        aspect-ratio: 1;
        border-radius: 9px;
        background: #ffffff;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
      }

      .launch-film__school-stack {
        display: flex;
        align-items: center;
        min-height: 4.2cqh;
      }

      .launch-film__school-stack img {
        display: block;
        width: 9.2cqi;
        max-width: 42px;
        aspect-ratio: 1;
        margin-left: -1.5cqi;
        border: 2px solid rgba(9, 11, 11, 0.96);
        border-radius: 999px;
        background: #ffffff;
        object-fit: contain;
        padding: 0.7cqi;
        box-shadow: 0 1cqh 2.2cqh rgba(0, 0, 0, 0.22);
      }

      .launch-film__school-stack img:first-child {
        margin-left: 0;
      }

      .launch-film__approval-card {
        margin-top: 0.2cqh;
        overflow: hidden;
        border: 1px solid rgba(245, 158, 11, 0.34);
        border-radius: 12px;
        background:
          linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(255, 255, 255, 0.025)),
          rgba(10, 10, 10, 0.94);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
      }

      .confirm-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: rgba(245, 158, 11, 0.11);
        border-bottom: 1px solid rgba(245, 158, 11, 0.18);
      }

      .confirm-card__icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: #f59e0b;
      }

      .confirm-card__title {
        flex: 1;
        color: #ffffff;
        font-size: clamp(12px, 2.65cqi, 14px);
        font-weight: 600;
        text-transform: none;
      }

      .confirm-card__message {
        margin: 0;
        padding: 10px 12px 8px;
        color: rgba(255, 255, 255, 0.72);
        font-size: clamp(10px, 2.3cqi, 13px);
        line-height: 1.35;
      }

      .launch-film__email-draft-preview {
        display: grid;
        gap: 0.75cqh;
        margin: 0 12px 10px;
        border: 1px solid rgba(255, 255, 255, 0.11);
        border-radius: 8px;
        padding: 1cqh 1.8cqi;
        background: rgba(255, 255, 255, 0.055);
      }

      .launch-film__email-draft-row {
        display: grid;
        grid-template-columns: 7ch minmax(0, 1fr);
        gap: 1.4cqi;
        align-items: baseline;
      }

      .launch-film__email-draft-row span,
      .launch-film__email-draft-body span {
        color: rgba(255, 255, 255, 0.52);
        font-size: clamp(8px, 1.8cqi, 10px);
        font-weight: 850;
        text-transform: uppercase;
      }

      .launch-film__email-draft-row strong {
        min-width: 0;
        overflow: hidden;
        color: rgba(255, 255, 255, 0.92);
        font-size: clamp(9px, 2.05cqi, 11px);
        font-weight: 750;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .launch-film__email-draft-body {
        display: grid;
        gap: 0.45cqh;
        padding-top: 0.2cqh;
      }

      .launch-film__email-draft-body p {
        color: rgba(255, 255, 255, 0.74);
        font-size: clamp(9px, 2.05cqi, 11px);
        font-weight: 560;
        line-height: 1.28;
      }

      .confirm-card__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 0 12px 12px;
      }

      .confirm-btn {
        flex: 1 1 auto;
        min-width: 80px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 8px 16px;
        background: transparent;
        color: #ffffff;
        font-size: clamp(10px, 2.35cqi, 13px);
        font-weight: 600;
      }

      .confirm-btn--primary {
        border-color: transparent;
        background: #ccff00;
        color: #0a0a0a;
      }

      .launch-film__graphic-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1.35cqh 2cqi;
      }

      .launch-film__graphic-grid figure {
        display: grid;
        gap: 0.6cqh;
        margin: 0;
      }

      .launch-film__graphic-placeholder {
        display: grid;
        place-items: end start;
        min-height: 18.8cqh;
        border-radius: 8px;
        padding: 1.05cqh 1.55cqi;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }

      .launch-film__graphic-placeholder--image {
        height: 18.8cqh;
        min-height: 18.8cqh;
        place-items: stretch;
        padding: 0;
      }

      .launch-film__graphic-placeholder--video {
        position: relative;
      }

      .launch-film__graphic-image {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
      }

      .launch-film__graphic-video-badge {
        position: absolute;
        top: 50%;
        left: 50%;
        display: grid;
        place-items: center;
        width: 5.2cqh;
        min-width: 28px;
        aspect-ratio: 1;
        transform: translate(-50%, -50%);
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.24);
        background: rgba(5, 8, 15, 0.56);
        color: #ffffff;
        box-shadow: 0 0.6cqh 1.8cqh rgba(0, 0, 0, 0.24);
        backdrop-filter: blur(8px);
      }

      .launch-film__graphic-placeholder span {
        color: #fff;
        font-size: clamp(13px, 3.4cqi, 19px);
        text-transform: none;
      }

      .launch-film__graphic-placeholder--hero {
        background:
          linear-gradient(145deg, rgba(204, 255, 0, 0.72), transparent 46%),
          linear-gradient(315deg, rgba(59, 130, 246, 0.7), transparent 48%), #111827;
      }

      .launch-film__graphic-placeholder--clip {
        background:
          linear-gradient(145deg, rgba(236, 72, 153, 0.62), transparent 48%),
          linear-gradient(315deg, rgba(250, 204, 21, 0.7), transparent 50%), #111111;
      }

      .launch-film__graphic-placeholder--poster {
        background:
          linear-gradient(145deg, rgba(59, 130, 246, 0.62), transparent 50%),
          linear-gradient(315deg, rgba(204, 255, 0, 0.52), transparent 48%), #0f172a;
      }

      .launch-film__graphic-placeholder--banner {
        background:
          linear-gradient(145deg, rgba(239, 68, 68, 0.64), transparent 48%),
          linear-gradient(315deg, rgba(255, 255, 255, 0.22), transparent 52%), #111827;
      }

      .launch-film__graphic-grid figcaption {
        color: rgba(255, 255, 255, 0.68);
        font-size: clamp(9px, 2.1cqi, 12px);
        font-weight: 750;
      }

      .launch-film__artifact-bar--schedule {
        justify-content: flex-start;
      }

      .launch-film__schedule-icon {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 8.8cqi;
        max-width: 40px;
        aspect-ratio: 1;
        border: 1px solid rgba(204, 255, 0, 0.55);
        border-radius: 8px;
        background:
          linear-gradient(135deg, rgba(204, 255, 0, 0.2), rgba(255, 255, 255, 0.04)),
          rgba(204, 255, 0, 0.1);
        color: #ccff00;
        box-shadow:
          0 0 0 1px rgba(204, 255, 0, 0.06),
          0 1.1cqh 2.4cqh rgba(0, 0, 0, 0.22);
      }

      .launch-film__sync-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1cqh 1.4cqi;
        padding: 1.2cqh 1.6cqi;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        background:
          radial-gradient(circle at 12% 10%, rgba(204, 255, 0, 0.12), transparent 32%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.025)),
          rgba(8, 11, 9, 0.92);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }

      .launch-film__sync-list span {
        display: grid;
        gap: 0.38cqh;
        min-width: 0;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 1.05cqh 2cqi;
        background:
          linear-gradient(135deg, rgba(204, 255, 0, 0.075), transparent 55%),
          rgba(255, 255, 255, 0.045);
        color: rgba(255, 255, 255, 0.8);
        font-size: clamp(10px, 2.45cqi, 13px);
        font-weight: 850;
        line-height: 1.08;
        text-transform: uppercase;
      }

      .launch-film__sync-list b {
        color: #ccff00;
        font-size: clamp(22px, 5.6cqi, 32px);
        font-weight: 950;
        line-height: 0.95;
      }

      .launch-film__strategy-image-placeholder {
        display: block;
        min-height: 16cqh;
        aspect-ratio: 16 / 7.5;
        border: 1px solid rgba(204, 255, 0, 0.22);
        border-radius: 8px;
        padding: 0;
        overflow: hidden;
        background: rgba(245, 245, 241, 0.98);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          0 1.6cqh 3.4cqh rgba(0, 0, 0, 0.26);
      }

      .launch-film__strategy-image {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 16cqh;
        object-fit: cover;
        object-position: center top;
        background: #f5f5f1;
      }

      .launch-film__strategy-image-placeholder span {
        color: rgba(255, 255, 255, 0.64);
        font-size: clamp(9px, 2.1cqi, 12px);
        text-transform: none;
      }

      .launch-film__strategy-image-placeholder strong {
        max-width: 12ch;
        font-size: clamp(18px, 5cqi, 30px);
      }

      .launch-film__strategy-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1.5cqi;
      }

      .launch-film__strategy-actions button {
        min-width: 0;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px;
        padding: 0.95cqh 1.2cqi;
        background: rgba(255, 255, 255, 0.055);
        color: #ffffff;
        font-size: clamp(10px, 2.35cqi, 13px);
        font-weight: 750;
      }

      .launch-film__strategy-actions button:last-child {
        border-color: transparent;
        background: #ccff00;
        color: #0a0a0a;
      }

      .launch-film__slide--phone {
        overflow: hidden;
        perspective: 160cqh;
        animation: launch-film-phone-in 760ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }

      .launch-film__device-handoff {
        position: relative;
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        transform-style: preserve-3d;
      }

      .launch-film__iphone {
        position: relative;
        z-index: 3;
        width: min(64cqi, 58cqh);
        aspect-ratio: 9 / 19.5;
        border: 1.1cqi solid rgba(244, 246, 240, 0.98);
        border-radius: 8.2cqi;
        background:
          linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(231, 235, 226, 0.96)), #f8faf5;
        box-shadow:
          0 4cqh 18cqh rgba(18, 24, 18, 0.24),
          0 0 0 1px rgba(255, 255, 255, 0.9),
          inset 0 0 0 1px rgba(15, 23, 42, 0.08);
        transform-origin: 52% 42%;
        will-change: transform, filter;
        animation: launch-film-phone-lift 6200ms cubic-bezier(0.22, 1, 0.36, 1) 4.15s both;
      }

      .launch-film__island {
        position: absolute;
        top: 2.1cqh;
        left: 50%;
        z-index: 2;
        width: 34%;
        height: 3.2%;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.34);
        box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.1);
        transform: translateX(-50%);
      }

      .launch-film__screen {
        position: absolute;
        inset: 1.1%;
        overflow: hidden;
        border-radius: 6.7cqi;
        background:
          linear-gradient(145deg, rgba(204, 255, 0, 0.16), transparent 34%),
          linear-gradient(225deg, rgba(59, 130, 246, 0.09), transparent 42%), #f8faf5;
      }

      .launch-film__phone-video {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #f8faf5;
      }

      .launch-film__desktop {
        position: absolute;
        left: 50%;
        bottom: 9.5cqh;
        z-index: 4;
        width: min(92cqi, 76cqh);
        max-width: 96%;
        aspect-ratio: 16 / 10.35;
        transform-origin: 50% 58%;
        will-change: opacity, transform, filter;
        opacity: 0;
        animation: launch-film-desktop-rise-zoom 6200ms cubic-bezier(0.2, 0.8, 0.2, 1) 4.15s both;
      }

      .launch-film__desktop-glow {
        position: absolute;
        inset: -11cqh -8cqi;
        z-index: -1;
        background:
          radial-gradient(circle at 32% 42%, rgba(204, 255, 0, 0.2), transparent 36%),
          radial-gradient(circle at 70% 62%, rgba(76, 154, 255, 0.16), transparent 42%);
        filter: blur(22px);
        opacity: 0.72;
      }

      .launch-film__desktop-frame {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        border: 1.1cqi solid rgba(244, 246, 240, 0.98);
        border-radius: 3.2cqi;
        background:
          linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(229, 234, 224, 0.96)), #f8faf5;
        box-shadow:
          0 5.2cqh 16cqh rgba(18, 24, 18, 0.24),
          0 0 0 1px rgba(255, 255, 255, 0.88),
          inset 0 1px 0 rgba(255, 255, 255, 0.92);
      }

      .launch-film__desktop-camera {
        position: absolute;
        top: 1.35cqh;
        left: 50%;
        z-index: 2;
        width: 8.5%;
        height: 1.4%;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.34);
        box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.1);
        transform: translateX(-50%);
      }

      .launch-film__desktop-screen {
        position: absolute;
        inset: 3.4%;
        overflow: hidden;
        border-radius: 2.25cqi;
        background:
          linear-gradient(145deg, rgba(204, 255, 0, 0.16), transparent 34%),
          linear-gradient(225deg, rgba(59, 130, 246, 0.09), transparent 42%), #f8faf5;
      }

      .launch-film__desktop-video {
        position: absolute;
        inset: 1.4%;
        display: block;
        width: 97.2%;
        height: 97.2%;
        border-radius: 1.45cqi;
        object-fit: contain;
        background: #f8faf5;
      }

      .launch-film__desktop-screen::before {
        content: '';
        position: absolute;
        inset: -25%;
        background: linear-gradient(
          115deg,
          transparent 0%,
          transparent 38%,
          rgba(255, 255, 255, 0.13) 48%,
          transparent 58%,
          transparent 100%
        );
        transform: translateX(-32%);
        animation: launch-film-desktop-sheen 5200ms ease-in-out 4.7s both;
      }

      @keyframes launch-film-gradient {
        from {
          background-position:
            0% 50%,
            18% 26%,
            0% 0%,
            100% 100%;
          transform: translate3d(-4cqi, -1.4cqh, 0) rotate(-2.2deg) scale(1.02);
        }
        to {
          background-position:
            100% 50%,
            82% 74%,
            22% 18%,
            78% 84%;
          transform: translate3d(4cqi, 1.4cqh, 0) rotate(2.2deg) scale(1.04);
        }
      }

      @keyframes launch-film-atmosphere {
        from {
          background-position:
            0% 50%,
            0 0,
            0 0;
          transform: translate3d(-1.8cqi, 0, 0);
        }
        to {
          background-position:
            100% 50%,
            0 3.4cqh,
            3.4cqh 0;
          transform: translate3d(1.8cqi, -0.8cqh, 0);
        }
      }

      @keyframes launch-film-intro-in {
        from {
          opacity: 0;
          transform: translate3d(5cqi, 0, 0);
          filter: blur(10px);
        }
        60% {
          opacity: 1;
        }
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0);
          filter: blur(0);
        }
      }

      @keyframes launch-film-word-in {
        0% {
          opacity: 0;
          transform: translateY(3.5cqh);
          filter: blur(10px);
        }
        60% {
          filter: blur(0px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
          filter: blur(0px);
        }
      }

      @keyframes launch-film-prompt-push-in {
        0% {
          opacity: 0.24;
          transform: translate3d(-3.6cqi, -7.5cqh, 0) scale(0.62) rotateX(10deg);
          filter: blur(12px);
        }
        42% {
          opacity: 0.96;
          transform: translate3d(-1.6cqi, -3.2cqh, 0) scale(0.78) rotateX(5deg);
          filter: blur(4px);
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1) rotateX(0deg);
          filter: blur(0);
        }
      }

      @keyframes launch-film-card-in {
        from {
          opacity: 0;
          transform: translateY(2.4cqh) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes launch-film-border {
        from {
          background-position: 0% 50%;
        }
        to {
          background-position: 100% 50%;
        }
      }

      @keyframes launch-film-click {
        0% {
          box-shadow:
            0 0 0 0.45cqi rgba(204, 255, 0, 0.08),
            0 0 3cqh rgba(97, 214, 139, 0.28);
          transform: scaleY(1);
        }
        50% {
          box-shadow:
            0 0 0 0.95cqi rgba(204, 255, 0, 0.06),
            0 0 4.4cqh rgba(97, 214, 139, 0.34);
          transform: scaleY(0.88);
        }
        100% {
          box-shadow:
            0 0 0 0.45cqi rgba(204, 255, 0, 0.08),
            0 0 3cqh rgba(97, 214, 139, 0.28);
          transform: scaleY(1);
        }
      }

      @keyframes launch-film-send-select {
        0% {
          transform: scale(1);
        }
        55% {
          transform: scale(1.12);
        }
        100% {
          transform: scale(1.08);
        }
      }

      @keyframes launch-film-fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes launch-film-phone-in {
        from {
          opacity: 0;
          transform: translateY(4cqh) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes launch-film-cascade-in {
        from {
          opacity: 0;
          transform: translate3d(0, 3cqh, 0) scale(0.985);
          filter: blur(8px);
        }
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes launch-film-cascade-rise {
        from {
          opacity: 0;
          transform: translateY(2cqh);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes launch-film-cascade-command-in {
        from {
          opacity: 0;
          transform: translateY(1.8cqh) scale(0.985);
          filter: blur(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes launch-film-phone-lift {
        0% {
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
        20% {
          transform: translate3d(0, -70cqh, 0) scale(1);
          filter: blur(0);
        }
        78% {
          opacity: 0.84;
          transform: translate3d(0, -70cqh, 0) scale(1);
        }
        100% {
          opacity: 0.72;
          transform: translate3d(0, -70cqh, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes launch-film-desktop-rise-zoom {
        0% {
          opacity: 0;
          transform: translate3d(-50%, 30cqh, 0) scale(1.24) rotateX(0deg);
          filter: blur(5px);
        }
        16% {
          opacity: 1;
          transform: translate3d(-50%, -11cqh, 0) scale(1.24) rotateX(0deg);
          filter: blur(0);
        }
        31% {
          opacity: 1;
          transform: translate3d(-50%, -11cqh, 0) scale(1.24) rotateX(0deg);
          filter: blur(0);
        }
        43% {
          opacity: 1;
          transform: translate3d(-136%, -27.5cqh, 0) scale(3.55) rotateX(0deg);
          filter: blur(0);
        }
        67% {
          opacity: 1;
          transform: translate3d(28%, -27.5cqh, 0) scale(3.55) rotateX(0deg);
          filter: blur(0);
        }
        86%,
        100% {
          opacity: 1;
          transform: translate3d(28%, -27.5cqh, 0) scale(3.55) rotateX(0deg);
          filter: blur(0);
        }
      }

      @keyframes launch-film-desktop-sheen {
        0%,
        22% {
          opacity: 0;
          transform: translateX(-32%);
        }
        45% {
          opacity: 0.72;
        }
        74%,
        100% {
          opacity: 0;
          transform: translateX(36%);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .launch-film *,
        .launch-film {
          animation-duration: 1ms !important;
          transition-duration: 1ms !important;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtInteractiveDemoReelComponent {
  readonly phoneVideoSrc = input<string | null>(null);
  protected readonly timeline = inject(NxtInteractiveDemoTimelineService);
  protected readonly desktopVideoSrc = DESKTOP_VIDEO_SRC;
  protected readonly shouldLoopPhoneVideo = false;
  protected readonly desktopVideoActive = signal(false);
  protected readonly finalScoreVideoImageSrc = FINAL_SCORE_VIDEO_IMAGE_SRC;
  protected readonly highlightVideoImageSrc = HIGHLIGHT_VIDEO_IMAGE_SRC;
  protected readonly pdfPlaysImageSrc = PDF_PLAYS_IMAGE_SRC;
  protected readonly prospectCardAthleteImageSrc = PROSPECT_CARD_ATHLETE_IMAGE_SRC;
  protected readonly statCardVideoImageSrc = STAT_CARD_VIDEO_IMAGE_SRC;
  protected readonly strategyCallSheetImageSrc = STRATEGY_CALL_SHEET_IMAGE_SRC;
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly haptics = inject(HapticsService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private previousShowHook = false;
  private previousShowPhone = false;
  private previousPromptLength = 0;
  private previousSendSelected = false;
  private audioContext: AudioContext | null = null;
  private audioUnlockCleanup: (() => void) | null = null;
  private desktopVideoStartTimerId: ReturnType<typeof setTimeout> | null = null;
  private desktopCompletionTimerId: ReturnType<typeof setTimeout> | null = null;
  private desktopWindAudioTimerId: ReturnType<typeof setTimeout> | null = null;
  private hookAudioPending = false;
  private phoneAudioPending = false;
  private desktopWindAudioPending = false;
  private sendAudioPending = false;

  constructor() {
    if (this.isBrowser) {
      afterNextRender(() => this.installAudioUnlockListeners());
      this.destroyRef.onDestroy(() => {
        this.clearDesktopVideoStartTimer();
        this.clearDesktopCompletionTimer();
        this.clearDesktopWindAudioTimer();
        this.audioUnlockCleanup?.();
        this.audioUnlockCleanup = null;
        void this.audioContext?.close();
        this.audioContext = null;
      });
    }

    effect(() => {
      this.timeline.setHoldPhoneUntilComplete(!!this.phoneVideoSrc());
    });

    effect(() => {
      const showHook = this.timeline.showHook();
      const showPhone = this.timeline.showPhone();
      const showPrompt = this.timeline.showPrompt();
      const promptLength = this.timeline.typedPrompt().length;
      const sendSelected = this.hasActiveSendSelection();

      if (showHook && !this.previousShowHook) {
        this.hookAudioPending = true;
        void this.tryPlayHookAudio();
      }

      if (!showHook) {
        this.hookAudioPending = false;
      }

      if (showPhone && !this.previousShowPhone) {
        this.desktopVideoActive.set(false);
        this.clearDesktopCompletionTimer();
        this.scheduleDesktopVideoStart();
        this.phoneAudioPending = true;
        void this.tryPlayPhoneAudio();
        this.scheduleDesktopWindAudio();
      }

      if (!showPhone) {
        this.desktopVideoActive.set(false);
        this.clearDesktopVideoStartTimer();
        this.clearDesktopCompletionTimer();
        this.phoneAudioPending = false;
        this.desktopWindAudioPending = false;
        this.clearDesktopWindAudioTimer();
      }

      if (!showPrompt) {
        this.previousPromptLength = 0;
      } else {
        if (
          promptLength > this.previousPromptLength &&
          promptLength < this.timeline.prompt.length
        ) {
          void this.haptics.impact('light');
        }
      }

      if (sendSelected && !this.previousSendSelected) {
        void this.haptics.impact('heavy');
        this.sendAudioPending = true;
        void this.tryPlaySendAudio();
      }

      if (!sendSelected) {
        this.sendAudioPending = false;
      }

      this.previousShowPhone = showPhone;
      this.previousShowHook = showHook;
      this.previousPromptLength = promptLength;
      this.previousSendSelected = sendSelected;
    });
  }

  protected handlePhoneVideoEnded(): void {
    if (this.desktopVideoSrc) {
      return;
    }

    this.timeline.completePhoneScene();
  }

  protected handleDesktopVideoEnded(): void {
    if (!this.isBrowser) {
      this.timeline.completePhoneScene();
      return;
    }

    this.clearDesktopCompletionTimer();
    this.desktopCompletionTimerId = setTimeout(() => {
      this.desktopCompletionTimerId = null;

      if (this.timeline.showPhone()) {
        this.timeline.completePhoneScene();
      }
    }, DESKTOP_COMPLETION_HOLD_MS);
  }

  private installAudioUnlockListeners(): void {
    if (!this.isBrowser || this.audioUnlockCleanup) {
      return;
    }

    const unlockAudio = () => {
      void this.flushPendingAudio();
    };

    const options: AddEventListenerOptions = { passive: true };
    const eventTypes = ['pointerdown', 'touchstart', 'keydown'] as const;

    for (const eventType of eventTypes) {
      this.document.addEventListener(eventType, unlockAudio, options);
    }

    this.audioUnlockCleanup = () => {
      for (const eventType of eventTypes) {
        this.document.removeEventListener(eventType, unlockAudio, options);
      }
    };
  }

  private async ensureAudioContext(): Promise<AudioContext | null> {
    if (!this.isBrowser || typeof window === 'undefined') {
      return null;
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) {
      return null;
    }

    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContextCtor();
    }

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        return null;
      }
    }

    if (this.audioContext.state === 'running') {
      this.audioUnlockCleanup?.();
      this.audioUnlockCleanup = null;
      return this.audioContext;
    }

    return null;
  }

  private async flushPendingAudio(): Promise<void> {
    const audioContext = await this.ensureAudioContext();

    if (!audioContext) {
      return;
    }

    if (this.timeline.showHook() && this.hookAudioPending) {
      await this.tryPlayHookAudio();
    }

    if (this.timeline.showPhone() && this.phoneAudioPending) {
      await this.tryPlayPhoneAudio();
    }

    if (this.timeline.showPhone() && this.desktopWindAudioPending) {
      await this.tryPlayDesktopWindAudio();
    }

    if (this.hasActiveSendSelection() && this.sendAudioPending) {
      await this.tryPlaySendAudio();
    }
  }

  private hasActiveSendSelection(): boolean {
    return (
      this.timeline.introSendSelected() ||
      this.timeline.cascadeRows().some((row) => row.sendSelected)
    );
  }

  private async tryPlayHookAudio(): Promise<void> {
    if (!this.hookAudioPending) {
      return;
    }

    const played = await this.playHookAudio();

    if (played) {
      this.hookAudioPending = false;
    }
  }

  private async tryPlaySendAudio(): Promise<void> {
    if (!this.sendAudioPending) {
      return;
    }

    const played = await this.playSendAudio();

    if (played) {
      this.sendAudioPending = false;
    }
  }

  private async tryPlayPhoneAudio(): Promise<void> {
    if (!this.phoneAudioPending) {
      return;
    }

    const played = await this.playPhoneAudio();

    if (played) {
      this.phoneAudioPending = false;
    }
  }

  private scheduleDesktopWindAudio(): void {
    if (!this.isBrowser) {
      return;
    }

    this.clearDesktopWindAudioTimer();
    this.desktopWindAudioTimerId = setTimeout(() => {
      this.desktopWindAudioTimerId = null;

      if (!this.timeline.showPhone()) {
        return;
      }

      this.desktopWindAudioPending = true;
      void this.haptics.impact('light');
      void this.tryPlayDesktopWindAudio();
    }, DESKTOP_HANDOFF_AUDIO_DELAY_MS);
  }

  private scheduleDesktopVideoStart(): void {
    if (!this.isBrowser) {
      this.desktopVideoActive.set(true);
      return;
    }

    this.clearDesktopVideoStartTimer();
    this.desktopVideoStartTimerId = setTimeout(() => {
      this.desktopVideoStartTimerId = null;

      if (!this.timeline.showPhone()) {
        return;
      }

      this.desktopVideoActive.set(true);
    }, DESKTOP_HANDOFF_AUDIO_DELAY_MS);
  }

  private clearDesktopVideoStartTimer(): void {
    if (this.desktopVideoStartTimerId === null) {
      return;
    }

    clearTimeout(this.desktopVideoStartTimerId);
    this.desktopVideoStartTimerId = null;
  }

  private clearDesktopCompletionTimer(): void {
    if (this.desktopCompletionTimerId === null) {
      return;
    }

    clearTimeout(this.desktopCompletionTimerId);
    this.desktopCompletionTimerId = null;
  }

  private clearDesktopWindAudioTimer(): void {
    if (this.desktopWindAudioTimerId === null) {
      return;
    }

    clearTimeout(this.desktopWindAudioTimerId);
    this.desktopWindAudioTimerId = null;
  }

  private async tryPlayDesktopWindAudio(): Promise<void> {
    if (!this.desktopWindAudioPending) {
      return;
    }

    const played = await this.playDesktopWindAudio();

    if (played) {
      this.desktopWindAudioPending = false;
    }
  }

  private async playHookAudio(): Promise<boolean> {
    const audioContext = await this.ensureAudioContext();

    if (!audioContext) {
      return false;
    }

    const now = audioContext.currentTime;
    const attack = audioContext.createOscillator();
    const body = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    attack.type = 'triangle';
    attack.frequency.setValueAtTime(280, now);
    attack.frequency.exponentialRampToValueAtTime(420, now + 0.16);

    body.type = 'sawtooth';
    body.frequency.setValueAtTime(140, now);
    body.frequency.exponentialRampToValueAtTime(198, now + 0.18);
    body.frequency.exponentialRampToValueAtTime(176, now + 0.3);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1350, now);
    filter.Q.setValueAtTime(1.1, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.03, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.013, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    attack.connect(filter);
    body.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    attack.start(now);
    body.start(now);
    attack.stop(now + 0.3);
    body.stop(now + 0.3);

    return true;
  }

  private async playSendAudio(): Promise<boolean> {
    const audioContext = await this.ensureAudioContext();

    if (!audioContext) {
      return false;
    }

    const now = audioContext.currentTime;
    const snap = audioContext.createOscillator();
    const body = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    snap.type = 'square';
    snap.frequency.setValueAtTime(420, now);
    snap.frequency.exponentialRampToValueAtTime(250, now + 0.05);

    body.type = 'triangle';
    body.frequency.setValueAtTime(180, now);
    body.frequency.exponentialRampToValueAtTime(122, now + 0.11);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, now);
    filter.Q.setValueAtTime(1.4, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.012, now + 0.045);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    snap.connect(filter);
    body.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    snap.start(now);
    body.start(now);
    snap.stop(now + 0.08);
    body.stop(now + 0.15);

    return true;
  }

  private async playPhoneAudio(): Promise<boolean> {
    const audioContext = await this.ensureAudioContext();

    if (!audioContext) {
      return false;
    }

    const now = audioContext.currentTime;
    const durationSeconds = 0.34;
    const sampleCount = Math.floor(audioContext.sampleRate * durationSeconds);
    const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
    const channelData = buffer.getChannelData(0);
    const wind = audioContext.createBufferSource();
    const lift = audioContext.createOscillator();
    const shimmer = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const shimmerFilter = audioContext.createBiquadFilter();

    for (let index = 0; index < sampleCount; index += 1) {
      const progress = index / sampleCount;
      channelData[index] = (Math.random() * 2 - 1) * (1 - progress * 0.72);
    }

    wind.buffer = buffer;

    lift.type = 'triangle';
    lift.frequency.setValueAtTime(190, now);
    lift.frequency.exponentialRampToValueAtTime(320, now + 0.18);

    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(620, now);
    shimmer.frequency.exponentialRampToValueAtTime(880, now + 0.16);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(1800, now + 0.22);
    filter.Q.setValueAtTime(0.72, now);

    shimmerFilter.type = 'highpass';
    shimmerFilter.frequency.setValueAtTime(540, now);
    shimmerFilter.Q.setValueAtTime(0.6, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.026, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

    wind.connect(filter);
    lift.connect(filter);
    shimmer.connect(shimmerFilter);
    shimmerFilter.connect(gain);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    wind.start(now);
    lift.start(now);
    shimmer.start(now);
    wind.stop(now + durationSeconds);
    lift.stop(now + durationSeconds);
    shimmer.stop(now + 0.22);

    return true;
  }

  private async playDesktopWindAudio(): Promise<boolean> {
    const audioContext = await this.ensureAudioContext();

    if (!audioContext) {
      return false;
    }

    const now = audioContext.currentTime;
    const durationSeconds = 0.52;
    const sampleCount = Math.floor(audioContext.sampleRate * durationSeconds);
    const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let index = 0; index < sampleCount; index += 1) {
      channelData[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
    }

    const wind = audioContext.createBufferSource();
    const lift = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();

    wind.buffer = buffer;

    lift.type = 'triangle';
    lift.frequency.setValueAtTime(280, now);
    lift.frequency.exponentialRampToValueAtTime(680, now + 0.34);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.36);
    filter.Q.setValueAtTime(0.82, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.026, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.012, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

    wind.connect(filter);
    lift.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    wind.start(now);
    lift.start(now);
    wind.stop(now + durationSeconds);
    lift.stop(now + durationSeconds);

    return true;
  }
}
