/**
 * @fileoverview Highlight Engine Action Section
 * @module @nxt1/ui/components/highlight-engine-action-section
 * @version 2.0.0
 *
 * Shared marketing section for AI Athletes surfaces.
 * Demonstrates the raw-to-reel AI workflow for highlight creation.
 *
 * v2: Vertical card layout (visual on top, text below), differentiated
 * step visuals, full-width prompt, proper video placeholders on steps 1 & 5.
 *
 * Standards:
 * - 100% design-token driven styling
 * - SSR-safe deterministic heading IDs
 * - Semantic HTML for SEO (section/article/ol/li)
 * - Mobile-first responsive layout for web + mobile
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

export interface HighlightEngineStep {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly tone: 'upload' | 'scan' | 'enhance' | 'prompt' | 'result';
}

const DEFAULT_HIGHLIGHT_ENGINE_STEPS: readonly HighlightEngineStep[] = [
  {
    id: 'highlight-engine-step-upload',
    title: 'Step 1: Upload raw game file',
    detail: 'Shaky phone video accepted. Drop it in and go.',
    tone: 'upload',
  },
  {
    id: 'highlight-engine-step-style',
    title: 'Step 2: Request style',
    detail: 'Choose Cartoon, Movie, Video Game, or your custom vibe.',
    tone: 'prompt',
  },
  {
    id: 'highlight-engine-step-scan',
    title: 'Step 3: AI scans',
    detail: 'Agent X detects moments, pace shifts, and key plays automatically.',
    tone: 'scan',
  },
  {
    id: 'highlight-engine-step-enhance',
    title: 'Step 4: AI auto-edits',
    detail: 'Auto-crops, stabilizes, adds music, and overlays stats.',
    tone: 'enhance',
  },
  {
    id: 'highlight-engine-step-output',
    title: 'Step 5: Final output',
    detail: 'Your viral-ready highlight reel is produced and ready to post.',
    tone: 'result',
  },
] as const;

let highlightEngineActionInstanceCounter = 0;

@Component({
  selector: 'nxt1-highlight-engine-action-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="highlight-engine" [attr.aria-labelledby]="titleId()">
      <div class="highlight-engine__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="The Highlight Engine (Action)"
          [headingLevel]="2"
          variant="hero"
          align="center"
          layout="stack"
          title="Your Personal ESPN Producer."
          subtitle="Raw to Reel Transformation."
          support="Stop spending 5 hours editing. Spend 5 seconds uploading."
        />

        <article class="engine-panel" [attr.aria-labelledby]="panelTitleId()">
          <header class="engine-panel__header">
            <p class="engine-panel__eyebrow">Raw to Reel</p>
            <h3 class="engine-panel__title" [id]="panelTitleId()">AI Highlight Pipeline</h3>
          </header>

          <ol class="engine-steps" aria-label="The Highlight Engine workflow">
            @for (step of steps(); track step.id) {
              <li
                class="engine-step"
                [class.engine-step--result]="step.tone === 'result'"
                [class.engine-step--upload]="step.tone === 'upload'"
              >
                <!-- Step label on top -->
                <div class="engine-step__header">
                  <h4 class="engine-step__title">{{ step.title }}</h4>
                  <p class="engine-step__detail">{{ step.detail }}</p>
                </div>

                <!-- Visual content below -->
                <div class="engine-step__visual" [attr.data-tone]="step.tone">
                  @switch (step.tone) {
                    @case ('upload') {
                      <!-- Video placeholder frame -->
                      <div class="visual-video-placeholder" aria-hidden="true">
                        <div class="visual-video-placeholder__frame">
                          <div class="visual-video-placeholder__play-btn">
                            <div class="visual-video-placeholder__play-triangle"></div>
                          </div>
                          <div class="visual-video-placeholder__bar">
                            <div class="visual-video-placeholder__bar-fill"></div>
                          </div>
                          <p class="visual-video-placeholder__label">
                            Drop your raw game footage here
                          </p>
                        </div>
                      </div>
                    }

                    @case ('scan') {
                      <!-- Scanning visual: timeline with detection markers -->
                      <div class="visual-scan" aria-hidden="true">
                        <span class="visual-scan__badge">Agent X</span>
                        <div class="visual-scan__timeline">
                          <div class="visual-scan__track"></div>
                          <div class="visual-scan__scanline"></div>
                          <span class="visual-scan__marker visual-scan__marker--a"></span>
                          <span class="visual-scan__marker visual-scan__marker--b"></span>
                          <span class="visual-scan__marker visual-scan__marker--c"></span>
                          <span class="visual-scan__marker visual-scan__marker--d"></span>
                        </div>
                        <div class="visual-scan__labels">
                          <span class="visual-scan__tag">Key Play</span>
                          <span class="visual-scan__tag">Pace Shift</span>
                          <span class="visual-scan__tag">Highlight</span>
                        </div>
                      </div>
                    }

                    @case ('enhance') {
                      <!-- Editing visual: layered tracks with processing nodes -->
                      <div class="visual-enhance" aria-hidden="true">
                        <span class="visual-enhance__badge">Agent X</span>
                        <div class="visual-enhance__tracks">
                          <div class="visual-enhance__track visual-enhance__track--video">
                            <span class="visual-enhance__track-label">Video</span>
                            <div class="visual-enhance__track-bar"></div>
                          </div>
                          <div class="visual-enhance__track visual-enhance__track--audio">
                            <span class="visual-enhance__track-label">Audio</span>
                            <div class="visual-enhance__track-bar"></div>
                          </div>
                          <div class="visual-enhance__track visual-enhance__track--overlay">
                            <span class="visual-enhance__track-label">Stats</span>
                            <div class="visual-enhance__track-bar"></div>
                          </div>
                        </div>
                        <div class="visual-enhance__actions">
                          <span class="visual-enhance__action">Crop</span>
                          <span class="visual-enhance__action">Stabilize</span>
                          <span class="visual-enhance__action visual-enhance__action--active"
                            >Music</span
                          >
                          <span class="visual-enhance__action">Overlay</span>
                        </div>
                      </div>
                    }

                    @case ('prompt') {
                      <!-- Prompt terminal with full visible text -->
                      <div class="visual-prompt" aria-hidden="true">
                        <div class="visual-prompt__terminal">
                          <div class="visual-prompt__terminal-header">
                            <span class="visual-prompt__dot"></span>
                            <span class="visual-prompt__dot"></span>
                            <span class="visual-prompt__dot"></span>
                          </div>
                          <div class="visual-prompt__body">
                            <p class="visual-prompt__line">
                              <span class="visual-prompt__prefix">&gt;</span>
                              <span class="visual-prompt__text">Style:</span>
                              <span class="visual-prompt__value">Cartoon</span>
                            </p>
                            <p class="visual-prompt__line">
                              <span class="visual-prompt__prefix">&gt;</span>
                              <span class="visual-prompt__text">Intro:</span>
                              <span class="visual-prompt__value">Dramatic</span>
                            </p>
                            <p class="visual-prompt__line">
                              <span class="visual-prompt__prefix">&gt;</span>
                              <span class="visual-prompt__text">Stats:</span>
                              <span class="visual-prompt__value">Season totals</span>
                            </p>
                            <p class="visual-prompt__line visual-prompt__line--typing">
                              <span class="visual-prompt__prefix">&gt;</span>
                              <span class="visual-prompt__typing"
                                >Add slow-mo on touchdown plays<span
                                  class="visual-prompt__caret"
                                ></span
                              ></span>
                            </p>
                          </div>
                        </div>
                      </div>
                    }

                    @default {
                      <!-- Video placeholder for final output -->
                      <div
                        class="visual-video-placeholder visual-video-placeholder--output"
                        aria-hidden="true"
                      >
                        <div
                          class="visual-video-placeholder__frame visual-video-placeholder__frame--output"
                        >
                          <div
                            class="visual-video-placeholder__play-btn visual-video-placeholder__play-btn--output"
                          >
                            <div class="visual-video-placeholder__play-triangle"></div>
                          </div>
                          <div class="visual-video-placeholder__bar">
                            <div
                              class="visual-video-placeholder__bar-fill visual-video-placeholder__bar-fill--output"
                            ></div>
                          </div>
                          <div class="visual-video-placeholder__meta">
                            <span class="visual-video-placeholder__tag">9:16</span>
                            <span class="visual-video-placeholder__tag">4K</span>
                            <span
                              class="visual-video-placeholder__tag visual-video-placeholder__tag--ready"
                              >Ready</span
                            >
                          </div>
                        </div>
                      </div>
                    }
                  }
                </div>
              </li>
            }
          </ol>

          <aside class="engine-result" [attr.aria-labelledby]="resultTitleId()">
            <h4 class="engine-result__title" [id]="resultTitleId()">Result</h4>
            <p class="engine-result__copy">A viral-ready highlight reel created in minutes.</p>
          </aside>
        </article>
      </div>
    </section>
  `,
  styles: [
    `
      /* ─── HOST ─── */
      :host {
        display: block;
      }

      /* ─── SECTION SHELL ─── */
      .highlight-engine {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      .highlight-engine__shell {
        display: grid;
        gap: var(--nxt1-spacing-7);
      }

      /* ─── PANEL ─── */
      .engine-panel {
        display: grid;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-md);
      }

      .engine-panel__header {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .engine-panel__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .engine-panel__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      /* ─── STEPS GRID ─── */
      .engine-steps {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--nxt1-spacing-4);
      }

      /* ─── STEP CARD (vertical: header on top, visual below) ─── */
      .engine-step {
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 0;
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        overflow: hidden;
      }

      .engine-step--upload .engine-step__visual,
      .engine-step--result .engine-step__visual {
        min-height: var(--nxt1-spacing-72);
      }

      .engine-step--upload {
        border-style: dashed;
        border-color: var(--nxt1-color-alpha-primary30);
      }

      .engine-step--result {
        border-color: var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary6);
      }

      /* Step header area */
      .engine-step__header {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-4) var(--nxt1-spacing-3);
      }

      .engine-step__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .engine-step__detail {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* Step visual area */
      .engine-step__visual {
        position: relative;
        min-height: var(--nxt1-spacing-44);
        border-top: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        overflow: hidden;
        display: grid;
        place-items: center;
      }

      /* ─── RESULT ASIDE ─── */
      .engine-result {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary6);
        text-align: center;
        justify-items: center;
      }

      .engine-result__title {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .engine-result__copy {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ────────────────────────────────────────
         VISUAL: Video Placeholder (Steps 1 & 5)
         ──────────────────────────────────────── */
      .visual-video-placeholder {
        width: 100%;
        height: 100%;
        padding: var(--nxt1-spacing-4);
      }

      .visual-video-placeholder__frame {
        height: 100%;
        min-height: var(--nxt1-spacing-64);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 2px dashed var(--nxt1-color-alpha-primary30);
        background: linear-gradient(
          135deg,
          var(--nxt1-color-surface-200) 0%,
          var(--nxt1-color-alpha-primary6) 50%,
          var(--nxt1-color-surface-200) 100%
        );
        background-size: 200% 200%;
        animation: upload-shimmer 3s ease-in-out infinite;
        display: grid;
        align-content: center;
        justify-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
      }

      .visual-video-placeholder__frame--output {
        border-style: solid;
        border-color: var(--nxt1-color-alpha-primary30);
        background: linear-gradient(
          135deg,
          var(--nxt1-color-alpha-primary6) 0%,
          var(--nxt1-color-alpha-primary12) 50%,
          var(--nxt1-color-alpha-primary6) 100%
        );
        background-size: 200% 200%;
        animation: reel-flow 2.4s ease-in-out infinite;
      }

      .visual-video-placeholder__play-btn {
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
        border-radius: var(--nxt1-borderRadius-full);
        border: 2px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary8);
        display: grid;
        place-items: center;
      }

      .visual-video-placeholder__play-btn--output {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary20);
      }

      .visual-video-placeholder__play-triangle {
        width: 0;
        height: 0;
        border-style: solid;
        border-width: 8px 0 8px 14px;
        border-color: transparent transparent transparent var(--nxt1-color-alpha-primary30);
        margin-left: 3px; /* geometric offset for CSS triangle centering */
      }

      .visual-video-placeholder__play-btn--output .visual-video-placeholder__play-triangle {
        border-color: transparent transparent transparent var(--nxt1-color-primary);
      }

      .visual-video-placeholder__bar {
        width: 80%;
        height: var(--nxt1-spacing-1);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary12);
        overflow: hidden;
      }

      .visual-video-placeholder__bar-fill {
        width: 0%;
        height: 100%;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary30);
        animation: bar-grow 2.4s ease-in-out infinite;
      }

      .visual-video-placeholder__bar-fill--output {
        background: var(--nxt1-color-primary);
        animation: bar-grow-full 1.6s ease-out forwards;
      }

      .visual-video-placeholder__label {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .visual-video-placeholder__meta {
        display: flex;
        gap: var(--nxt1-spacing-2);
      }

      .visual-video-placeholder__tag {
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary6);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .visual-video-placeholder__tag--ready {
        background: var(--nxt1-color-alpha-primary20);
      }

      /* ────────────────────────────────────
         VISUAL: Scan (Step 2 — timeline)
         ──────────────────────────────────── */
      .visual-scan {
        width: 100%;
        height: 100%;
        padding: var(--nxt1-spacing-4);
        display: grid;
        gap: var(--nxt1-spacing-3);
        align-content: center;
      }

      .visual-scan__badge {
        justify-self: start;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary6);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .visual-scan__timeline {
        position: relative;
        width: 100%;
        height: var(--nxt1-spacing-8);
      }

      .visual-scan__track {
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--nxt1-color-alpha-primary20);
        border-radius: var(--nxt1-borderRadius-full);
        transform: translateY(-50%);
      }

      .visual-scan__scanline {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-borderRadius-full);
        box-shadow: 0 0 var(--nxt1-spacing-2) var(--nxt1-color-alpha-primary30);
        animation: scanline-sweep 2.8s ease-in-out infinite;
      }

      .visual-scan__marker {
        position: absolute;
        top: 50%;
        width: var(--nxt1-spacing-3);
        height: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: 2px solid var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary20);
        transform: translateY(-50%) scale(0);
        animation: marker-pop 2.8s ease-in-out infinite;
      }

      .visual-scan__marker--a {
        left: 18%;
        animation-delay: 0.5s;
      }

      .visual-scan__marker--b {
        left: 42%;
        animation-delay: 1.1s;
      }

      .visual-scan__marker--c {
        left: 64%;
        animation-delay: 1.6s;
      }

      .visual-scan__marker--d {
        left: 85%;
        animation-delay: 2.1s;
      }

      .visual-scan__labels {
        display: flex;
        gap: var(--nxt1-spacing-2);
        flex-wrap: wrap;
      }

      .visual-scan__tag {
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary20);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ────────────────────────────────────────
         VISUAL: Enhance (Step 3 — editing tracks)
         ──────────────────────────────────────── */
      .visual-enhance {
        width: 100%;
        height: 100%;
        padding: var(--nxt1-spacing-4);
        display: grid;
        gap: var(--nxt1-spacing-3);
        align-content: center;
      }

      .visual-enhance__badge {
        justify-self: start;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary6);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .visual-enhance__tracks {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .visual-enhance__track {
        display: grid;
        grid-template-columns: var(--nxt1-spacing-10) 1fr;
        gap: var(--nxt1-spacing-2);
        align-items: center;
      }

      .visual-enhance__track-label {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      .visual-enhance__track-bar {
        height: var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-sm);
        overflow: hidden;
      }

      .visual-enhance__track--video .visual-enhance__track-bar {
        background: linear-gradient(
          90deg,
          var(--nxt1-color-alpha-primary30) 0%,
          var(--nxt1-color-alpha-primary12) 40%,
          var(--nxt1-color-alpha-primary30) 60%,
          var(--nxt1-color-alpha-primary12) 100%
        );
        animation: track-process 2s linear infinite;
        background-size: 200% 100%;
      }

      .visual-enhance__track--audio .visual-enhance__track-bar {
        background: repeating-linear-gradient(
          90deg,
          var(--nxt1-color-alpha-primary20) 0px,
          var(--nxt1-color-alpha-primary20) 3px,
          transparent 3px,
          transparent 6px
        );
        animation: track-wave 1.4s ease-in-out infinite;
      }

      .visual-enhance__track--overlay .visual-enhance__track-bar {
        background: var(--nxt1-color-alpha-primary8);
        border: 1px dashed var(--nxt1-color-alpha-primary20);
      }

      .visual-enhance__actions {
        display: flex;
        gap: var(--nxt1-spacing-2);
        flex-wrap: wrap;
      }

      .visual-enhance__action {
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary20);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .visual-enhance__action--active {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary12);
        color: var(--nxt1-color-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      /* ────────────────────────────────
         VISUAL: Prompt (Step 4 — terminal)
         ──────────────────────────────── */
      .visual-prompt {
        width: 100%;
        height: 100%;
        padding: var(--nxt1-spacing-4);
        display: grid;
        place-items: center;
      }

      .visual-prompt__terminal {
        width: 100%;
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-alpha-primary20);
        background: var(--nxt1-color-surface-200);
        overflow: hidden;
      }

      .visual-prompt__terminal-header {
        display: flex;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-300, var(--nxt1-color-surface-200));
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .visual-prompt__dot {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary20);
      }

      .visual-prompt__body {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
      }

      .visual-prompt__line {
        margin: 0;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .visual-prompt__prefix {
        color: var(--nxt1-color-primary);
        font-weight: var(--nxt1-fontWeight-bold);
        flex-shrink: 0;
      }

      .visual-prompt__text {
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
      }

      .visual-prompt__value {
        color: var(--nxt1-color-text-primary);
      }

      .visual-prompt__line--typing {
        min-height: var(--nxt1-spacing-5);
      }

      .visual-prompt__typing {
        color: var(--nxt1-color-text-secondary);
        display: inline;
        overflow: hidden;
        white-space: nowrap;
        max-width: 0;
        animation: prompt-typing 4s steps(30, end) infinite;
      }

      .visual-prompt__caret {
        display: inline-block;
        width: 2px;
        height: 1em;
        background: var(--nxt1-color-primary);
        vertical-align: text-bottom;
        margin-left: var(--nxt1-spacing-px);
        animation: prompt-caret 0.9s step-end infinite;
      }

      /* ─── KEYFRAME ANIMATIONS ─── */
      @keyframes upload-shimmer {
        0% {
          background-position: 200% 200%;
        }

        100% {
          background-position: 0% 0%;
        }
      }

      @keyframes bar-grow {
        0% {
          width: 0%;
        }

        50% {
          width: 65%;
        }

        100% {
          width: 0%;
        }
      }

      @keyframes bar-grow-full {
        0% {
          width: 0%;
        }

        100% {
          width: 100%;
        }
      }

      @keyframes scanline-sweep {
        0% {
          left: 0%;
        }

        100% {
          left: 100%;
        }
      }

      @keyframes marker-pop {
        0%,
        15% {
          transform: translateY(-50%) scale(0);
        }

        25% {
          transform: translateY(-50%) scale(1.2);
        }

        35%,
        100% {
          transform: translateY(-50%) scale(1);
        }
      }

      @keyframes track-process {
        0% {
          background-position: 200% 0;
        }

        100% {
          background-position: 0% 0;
        }
      }

      @keyframes track-wave {
        0%,
        100% {
          opacity: 0.6;
        }

        50% {
          opacity: 1;
        }
      }

      @keyframes prompt-typing {
        0% {
          max-width: 0;
        }

        40% {
          max-width: 100%;
        }

        85% {
          max-width: 100%;
        }

        100% {
          max-width: 0;
        }
      }

      @keyframes prompt-caret {
        50% {
          opacity: 0;
        }
      }

      @keyframes reel-flow {
        0% {
          background-position: 200% 200%;
        }

        100% {
          background-position: 0% 0%;
        }
      }

      /* ─── RESPONSIVE: Desktop 2-column grid ─── */
      @media (min-width: 992px) {
        .engine-steps {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        /* Step 5 spans full grid but matches single-column width, centered */
        .engine-step:last-child:nth-child(odd) {
          grid-column: 1 / -1;
          width: calc((100% - var(--nxt1-spacing-4)) / 2);
          justify-self: center;
        }

        .engine-step__visual {
          min-height: var(--nxt1-spacing-52);
        }

        .engine-result {
          text-align: center;
          justify-items: center;
        }
      }

      /* ─── RESPONSIVE: Tablet ─── */
      @media (max-width: 991px) and (min-width: 768px) {
        .engine-steps {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      /* ─── RESPONSIVE: Mobile ─── */
      @media (max-width: 767px) {
        .engine-panel {
          padding: var(--nxt1-spacing-4);
        }

        .engine-step__visual {
          min-height: var(--nxt1-spacing-40);
        }

        .engine-step--upload .engine-step__visual,
        .engine-step--result .engine-step__visual {
          min-height: var(--nxt1-spacing-56);
        }

        .engine-panel__title {
          font-size: var(--nxt1-fontSize-lg);
        }

        .visual-prompt__line {
          font-size: var(--nxt1-fontSize-xs);
        }
      }

      /* ─── REDUCED MOTION ─── */
      @media (prefers-reduced-motion: reduce) {
        .visual-video-placeholder__frame,
        .visual-video-placeholder__frame--output,
        .visual-video-placeholder__bar-fill,
        .visual-video-placeholder__bar-fill--output,
        .visual-scan__scanline,
        .visual-scan__marker,
        .visual-enhance__track-bar,
        .visual-prompt__typing,
        .visual-prompt__caret {
          animation: none;
        }

        .visual-prompt__typing {
          max-width: 100%;
        }

        .visual-scan__marker {
          transform: translateY(-50%) scale(1);
        }

        .visual-video-placeholder__bar-fill--output {
          width: 100%;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtHighlightEngineActionSectionComponent {
  private readonly instanceId = ++highlightEngineActionInstanceCounter;

  readonly titleId = computed(() => `highlight-engine-title-${this.instanceId}`);
  readonly panelTitleId = computed(() => `highlight-engine-panel-title-${this.instanceId}`);
  readonly resultTitleId = computed(() => `highlight-engine-result-title-${this.instanceId}`);

  readonly steps = input<readonly HighlightEngineStep[]>(DEFAULT_HIGHLIGHT_ENGINE_STEPS);
}
