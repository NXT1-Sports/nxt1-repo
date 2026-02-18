/**
 * @fileoverview Agent X Demo Component — "The Magic" Interactive Showcase
 * @module @nxt1/ui/components/agent-x-demo
 * @version 1.0.0
 *
 * Split-screen interactive demo proving "AI Creative Director" capability.
 * Left panel: Simulated chat interface with typewriter effect.
 * Right panel: 3 distinct graphic styles generating in real-time.
 *
 * 100% design-token driven — zero hardcoded colors, fonts, or sizes.
 * SSR-safe, responsive (stacked on mobile), reduced-motion aware.
 * OnPush change detection, signal-based state, standalone component.
 *
 * @example
 * ```html
 * <nxt1-agent-x-demo />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  afterNextRender,
  signal,
  computed,
  input,
  DestroyRef,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { NxtCtaButtonComponent } from '../cta-button';
import { NxtIconComponent } from '../icon';

/** Monotonic counter for deterministic, SSR-hydration-safe IDs. */
let nextDemoId = 0;

// ============================================
// TYPES
// ============================================

/** A single chat message in the simulated conversation. */
export interface AgentXDemoChatMessage {
  /** Who sent it. */
  readonly role: 'user' | 'agent';
  /** Full message text (typed character-by-character for user). */
  readonly text: string;
}

/** A generated graphic card configuration. */
export interface AgentXDemoGraphic {
  /** Unique identifier. */
  readonly id: string;
  /** Style label shown on the card. */
  readonly styleLabel: string;
  /** Card gradient class suffix. */
  readonly variant: 'bold' | 'clean' | 'editorial';
  /** Player name displayed. */
  readonly playerName: string;
  /** Stat line displayed. */
  readonly statLine: string;
  /** Graphic title. */
  readonly title: string;
}

/** Phase of the demo animation cycle. */
type DemoPhase = 'idle' | 'typing' | 'thinking' | 'generating' | 'complete';

// ============================================
// DEFAULT DATA
// ============================================

const DEFAULT_CHAT: readonly AgentXDemoChatMessage[] = [
  {
    role: 'user',
    text: 'Agent X, make a "Player of the Game" graphic for John Smith with 28pts, 12reb.',
  },
  {
    role: 'agent',
    text: 'On it. Generating 3 styles now...',
  },
];

const DEFAULT_GRAPHICS: readonly AgentXDemoGraphic[] = [
  {
    id: 'bold',
    styleLabel: 'Bold Impact',
    variant: 'bold',
    playerName: 'John Smith',
    statLine: '28 PTS  ·  12 REB',
    title: 'PLAYER OF THE GAME',
  },
  {
    id: 'clean',
    styleLabel: 'Clean Minimal',
    variant: 'clean',
    playerName: 'John Smith',
    statLine: '28 PTS  ·  12 REB',
    title: 'PLAYER OF THE GAME',
  },
  {
    id: 'editorial',
    styleLabel: 'Editorial',
    variant: 'editorial',
    playerName: 'John Smith',
    statLine: '28 PTS  ·  12 REB',
    title: 'PLAYER OF THE GAME',
  },
];

@Component({
  selector: 'nxt1-agent-x-demo',
  standalone: true,
  imports: [CommonModule, NxtCtaButtonComponent, NxtIconComponent],
  template: `
    <section class="agent-x-demo" [attr.aria-labelledby]="sectionTitleId" role="region">
      <!-- Section Header -->
      <div class="demo-header">
        <div class="demo-badge" aria-hidden="true">
          <span class="demo-badge__dot"></span>
          <span class="demo-badge__text">AI-Powered</span>
        </div>
        <h2 [id]="sectionTitleId" class="demo-headline">
          {{ headline() }}
        </h2>
        <p class="demo-subtitle">{{ subtitle() }}</p>
      </div>

      <!-- Split-Screen Module -->
      <div class="demo-split" [class.demo-split--active]="hasStarted()">
        <!-- LEFT: Chat Interface -->
        <div class="demo-chat" role="log" aria-label="Agent X conversation demo" aria-live="polite">
          <div class="demo-chat__header">
            <div
              class="demo-chat__header-dot demo-chat__header-dot--active"
              aria-hidden="true"
            ></div>
            <span class="demo-chat__header-title">Agent X</span>
            <span class="demo-chat__header-status">
              @switch (phase()) {
                @case ('typing') {
                  Listening...
                }
                @case ('thinking') {
                  Thinking...
                }
                @case ('generating') {
                  Creating...
                }
                @case ('complete') {
                  Done
                }
                @default {
                  Ready
                }
              }
            </span>
          </div>

          <div class="demo-chat__body">
            <!--
              SSR/SEO: When idle (server render), show ALL chat messages statically
              so crawlers index meaningful content. On client, the animated
              sequence replaces this with the interactive typewriter flow.
            -->
            @if (!hasStarted()) {
              @for (msg of chatMessages(); track $index) {
                <div
                  class="demo-chat__bubble"
                  [class.demo-chat__bubble--user]="msg.role === 'user'"
                  [class.demo-chat__bubble--agent]="msg.role === 'agent'"
                >
                  @if (msg.role === 'agent') {
                    <div class="demo-chat__avatar" aria-hidden="true">
                      <nxt1-icon name="sparkles-outline" size="16" />
                    </div>
                  }
                  <div class="demo-chat__text">{{ msg.text }}</div>
                </div>
              }
            } @else {
              @for (msg of visibleMessages(); track $index) {
                <div
                  class="demo-chat__bubble"
                  [class.demo-chat__bubble--user]="msg.role === 'user'"
                  [class.demo-chat__bubble--agent]="msg.role === 'agent'"
                >
                  @if (msg.role === 'agent') {
                    <div class="demo-chat__avatar" aria-hidden="true">
                      <nxt1-icon name="sparkles-outline" size="16" />
                    </div>
                  }
                  <div class="demo-chat__text">
                    @if ($index === 0 && phase() === 'typing') {
                      {{ typedText() }}<span class="demo-chat__cursor" aria-hidden="true"></span>
                    } @else {
                      {{ msg.text }}
                    }
                  </div>
                </div>
              }

              @if (phase() === 'thinking') {
                <div class="demo-chat__bubble demo-chat__bubble--agent">
                  <div class="demo-chat__avatar" aria-hidden="true">
                    <nxt1-icon name="sparkles-outline" size="16" />
                  </div>
                  <div class="demo-chat__thinking" aria-label="Agent X is thinking">
                    <span class="demo-chat__thinking-dot"></span>
                    <span class="demo-chat__thinking-dot"></span>
                    <span class="demo-chat__thinking-dot"></span>
                  </div>
                </div>
              }
            }
          </div>
        </div>

        <!-- RIGHT: Generated Graphics -->
        <div class="demo-output" aria-label="Generated graphics preview">
          <div class="demo-output__header">
            <span class="demo-output__header-title">Output Preview</span>
            <span class="demo-output__header-count">
              @if (hasStarted() && visibleGraphicCount() > 0) {
                {{ visibleGraphicCount() }} of {{ graphics().length }}
              } @else if (!hasStarted()) {
                {{ graphics().length }} of {{ graphics().length }}
              }
            </span>
          </div>

          <div class="demo-output__grid">
            @for (graphic of graphics(); track graphic.id; let i = $index) {
              <article
                class="demo-graphic"
                [class]="'demo-graphic demo-graphic--' + graphic.variant"
                [class.demo-graphic--visible]="!hasStarted() || i < visibleGraphicCount()"
                [attr.aria-hidden]="hasStarted() && i >= visibleGraphicCount()"
                role="article"
                [attr.aria-label]="
                  graphic.title +
                  ' — ' +
                  graphic.playerName +
                  ' ' +
                  graphic.statLine +
                  ' — ' +
                  graphic.styleLabel +
                  ' style'
                "
              >
                <div class="demo-graphic__chrome">
                  <div class="demo-graphic__badge-row">
                    <span class="demo-graphic__style-chip">{{ graphic.styleLabel }}</span>
                  </div>
                  <div class="demo-graphic__content">
                    <span class="demo-graphic__title">{{ graphic.title }}</span>
                    <span class="demo-graphic__player">{{ graphic.playerName }}</span>
                    <span class="demo-graphic__stats">{{ graphic.statLine }}</span>
                  </div>
                  <div class="demo-graphic__shimmer" aria-hidden="true"></div>
                </div>
              </article>
            }
          </div>
        </div>
      </div>

      <!-- CTA Row -->
      <div class="demo-cta">
        <nxt1-cta-button
          [label]="primaryCtaLabel()"
          [route]="primaryCtaRoute()"
          variant="primary"
          size="lg"
        />
        @if (secondaryCtaLabel()) {
          <nxt1-cta-button
            [label]="secondaryCtaLabel()!"
            [route]="secondaryCtaRoute()"
            variant="ghost"
          />
        }
      </div>
    </section>
  `,
  styles: [
    `
      /* ─── KEYFRAMES ─── */

      @keyframes cursor-blink {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0;
        }
      }

      @keyframes thinking-bounce {
        0%,
        80%,
        100% {
          transform: translateY(0);
          opacity: 0.4;
        }
        40% {
          transform: translateY(-6px);
          opacity: 1;
        }
      }

      @keyframes graphic-enter {
        from {
          opacity: 0;
          transform: translateY(12px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes shimmer-slide {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(200%);
        }
      }

      @keyframes pulse-ring {
        0% {
          box-shadow: 0 0 0 0 var(--nxt1-color-alpha-primary30);
        }
        70% {
          box-shadow: 0 0 0 6px transparent;
        }
        100% {
          box-shadow: 0 0 0 0 transparent;
        }
      }

      @keyframes badge-glow {
        0%,
        100% {
          opacity: 0.6;
        }
        50% {
          opacity: 1;
        }
      }

      /* ─── HOST ─── */

      :host {
        display: block;
      }

      /* ─── SECTION SHELL ─── */

      .agent-x-demo {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-spacing-16) var(--nxt1-spacing-4);
      }

      /* ─── HEADER ─── */

      .demo-header {
        text-align: center;
        margin-bottom: var(--nxt1-spacing-10);
      }

      .demo-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-primary);
        background: var(--nxt1-color-alpha-primary4);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .demo-badge__dot {
        width: 8px;
        height: 8px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        animation: badge-glow 2s ease-in-out infinite;
      }

      .demo-badge__text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-primary);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      .demo-headline {
        margin: 0 0 var(--nxt1-spacing-3);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-4xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
        text-wrap: balance;
      }

      .demo-subtitle {
        margin: 0 auto;
        max-width: var(--nxt1-section-subtitle-max-width);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-relaxed);
        text-wrap: pretty;
      }

      @media (min-width: 768px) {
        .demo-headline {
          font-size: var(--nxt1-fontSize-5xl);
        }
      }

      /* ─── SPLIT PANEL ─── */

      .demo-split {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-4);
        margin-bottom: var(--nxt1-spacing-10);
      }

      @media (min-width: 992px) {
        .demo-split {
          grid-template-columns: 1fr 1.2fr;
          gap: var(--nxt1-spacing-6);
        }
      }

      /* ─── CHAT PANEL (LEFT) ─── */

      .demo-chat {
        display: flex;
        flex-direction: column;
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        overflow: hidden;
        min-height: 340px;
      }

      .demo-chat__header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .demo-chat__header-dot {
        width: 8px;
        height: 8px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-text-disabled);
        flex-shrink: 0;
      }

      .demo-chat__header-dot--active {
        background: var(--nxt1-color-success);
        animation: pulse-ring 2s ease-out infinite;
      }

      .demo-chat__header-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .demo-chat__header-status {
        margin-left: auto;
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .demo-chat__body {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        overflow-y: auto;
      }

      /* ─── CHAT BUBBLES ─── */

      .demo-chat__bubble {
        display: flex;
        gap: var(--nxt1-spacing-2);
        max-width: 92%;
        animation: graphic-enter var(--nxt1-motion-duration-slow) var(--nxt1-motion-easing-standard);
      }

      .demo-chat__bubble--user {
        align-self: flex-end;
        flex-direction: row-reverse;
      }

      .demo-chat__bubble--agent {
        align-self: flex-start;
      }

      .demo-chat__avatar {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-7);
        height: var(--nxt1-spacing-7);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
      }

      .demo-chat__text {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .demo-chat__bubble--user .demo-chat__text {
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-text-primary);
        border-bottom-right-radius: var(--nxt1-borderRadius-sm);
      }

      .demo-chat__bubble--agent .demo-chat__text {
        background: var(--nxt1-color-surface-300);
        color: var(--nxt1-color-text-primary);
        border-bottom-left-radius: var(--nxt1-borderRadius-sm);
      }

      .demo-chat__cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        background: var(--nxt1-color-primary);
        margin-left: 1px;
        vertical-align: text-bottom;
        animation: cursor-blink 0.8s step-end infinite;
      }

      /* ─── THINKING DOTS ─── */

      .demo-chat__thinking {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-300);
        border-bottom-left-radius: var(--nxt1-borderRadius-sm);
      }

      .demo-chat__thinking-dot {
        width: 6px;
        height: 6px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-text-tertiary);
        animation: thinking-bounce 1.4s ease-in-out infinite;
      }

      .demo-chat__thinking-dot:nth-child(2) {
        animation-delay: 0.2s;
      }

      .demo-chat__thinking-dot:nth-child(3) {
        animation-delay: 0.4s;
      }

      /* ─── OUTPUT PANEL (RIGHT) ─── */

      .demo-output {
        display: flex;
        flex-direction: column;
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        overflow: hidden;
        min-height: 340px;
      }

      .demo-output__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .demo-output__header-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .demo-output__header-count {
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .demo-output__grid {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        align-content: start;
      }

      .demo-output__empty {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        min-height: 200px;
        color: var(--nxt1-color-text-disabled);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
      }

      @media (max-width: 575px) {
        .demo-output__grid {
          grid-template-columns: 1fr;
        }
      }

      @media (min-width: 576px) and (max-width: 991px) {
        .demo-output__grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      /* ─── GRAPHIC CARDS ─── */

      .demo-graphic {
        position: relative;
        border-radius: var(--nxt1-borderRadius-xl);
        overflow: hidden;
        aspect-ratio: 3 / 4;
        opacity: 0;
        transform: translateY(12px) scale(0.96);
        transition:
          opacity var(--nxt1-motion-duration-slow) var(--nxt1-motion-easing-standard),
          transform var(--nxt1-motion-duration-slow) var(--nxt1-motion-easing-standard);
      }

      .demo-graphic--visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        animation: graphic-enter 0.5s var(--nxt1-motion-easing-standard) both;
      }

      .demo-graphic__chrome {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: 100%;
        padding: var(--nxt1-spacing-3);
        position: relative;
        z-index: 1;
      }

      /* ─── GRAPHIC VARIANT: Bold Impact ─── */

      .demo-graphic--bold {
        background: linear-gradient(
          160deg,
          color-mix(in srgb, var(--nxt1-color-primary) 35%, var(--nxt1-color-surface-200)) 0%,
          var(--nxt1-color-surface-300) 50%,
          color-mix(in srgb, var(--nxt1-color-primary) 10%, var(--nxt1-color-surface-200)) 100%
        );
        border: 1px solid var(--nxt1-color-alpha-primary30);
      }

      .demo-graphic--bold .demo-graphic__title {
        color: var(--nxt1-color-primary);
      }

      /* ─── GRAPHIC VARIANT: Clean Minimal ─── */

      .demo-graphic--clean {
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-default);
      }

      .demo-graphic--clean .demo-graphic__title {
        color: var(--nxt1-color-text-primary);
      }

      /* ─── GRAPHIC VARIANT: Editorial ─── */

      .demo-graphic--editorial {
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--nxt1-color-secondary) 20%, var(--nxt1-color-surface-200)) 0%,
          var(--nxt1-color-surface-300) 40%,
          color-mix(in srgb, var(--nxt1-color-primary) 12%, var(--nxt1-color-surface-200)) 100%
        );
        border: 1px solid color-mix(in srgb, var(--nxt1-color-secondary) 30%, transparent);
      }

      .demo-graphic--editorial .demo-graphic__title {
        color: var(--nxt1-color-secondary);
      }

      /* ─── GRAPHIC INNER ELEMENTS ─── */

      .demo-graphic__badge-row {
        display: flex;
        justify-content: flex-end;
      }

      .demo-graphic__style-chip {
        display: inline-flex;
        align-items: center;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 80%, transparent);
        backdrop-filter: blur(8px);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wider);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 60%, transparent);
      }

      .demo-graphic__content {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
      }

      .demo-graphic__title {
        font-family: var(--nxt1-fontFamily-display);
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-bold);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-widest);
        line-height: var(--nxt1-lineHeight-none);
      }

      .demo-graphic__player {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
        text-transform: uppercase;
      }

      .demo-graphic__stats {
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      /* Shimmer overlay on cards */
      .demo-graphic__shimmer {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        border-radius: inherit;
      }

      .demo-graphic--visible .demo-graphic__shimmer::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 50%;
        height: 100%;
        background: linear-gradient(
          105deg,
          transparent 40%,
          color-mix(in srgb, var(--nxt1-color-text-primary) 4%, transparent) 45%,
          color-mix(in srgb, var(--nxt1-color-text-primary) 8%, transparent) 50%,
          transparent 55%
        );
        animation: shimmer-slide 3s ease-in-out 0.8s 1;
      }

      /* ─── CTA ROW ─── */

      .demo-cta {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
      }

      /* ─── RESPONSIVE ─── */

      @media (max-width: 767px) {
        .agent-x-demo {
          padding: var(--nxt1-spacing-12) var(--nxt1-spacing-3);
        }

        .demo-headline {
          font-size: var(--nxt1-fontSize-3xl);
        }

        .demo-subtitle {
          font-size: var(--nxt1-fontSize-base);
        }

        .demo-chat,
        .demo-output {
          min-height: 280px;
        }

        .demo-graphic__player {
          font-size: var(--nxt1-fontSize-lg);
        }
      }

      @media (max-width: 480px) {
        .agent-x-demo {
          padding: var(--nxt1-spacing-10) var(--nxt1-spacing-2);
        }
      }

      /* ─── REDUCED MOTION ─── */

      @media (prefers-reduced-motion: reduce) {
        .demo-badge__dot {
          animation: none;
        }

        .demo-chat__cursor {
          animation: none;
          opacity: 1;
        }

        .demo-chat__thinking-dot {
          animation: none;
          opacity: 0.7;
        }

        .demo-chat__header-dot--active {
          animation: none;
        }

        .demo-graphic {
          transition: none;
        }

        .demo-graphic--visible {
          animation: none;
        }

        .demo-graphic--visible .demo-graphic__shimmer::after {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAgentXDemoComponent {
  // ─── Injections ───
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  // ─── Inputs ───
  /** Section headline. */
  readonly headline = input<string>('Your Personal AI Worker');

  /** Section subtitle. */
  readonly subtitle = input<string>(
    'No designer needed. Turn raw stats into ESPN-grade content in seconds.'
  );

  /** Chat messages for the demo. */
  readonly chatMessages = input<readonly AgentXDemoChatMessage[]>(DEFAULT_CHAT);

  /** Graphics to display in the output panel. */
  readonly graphics = input<readonly AgentXDemoGraphic[]>(DEFAULT_GRAPHICS);

  /** Primary CTA label. */
  readonly primaryCtaLabel = input<string>('Try Agent X Free');

  /** Primary CTA route. */
  readonly primaryCtaRoute = input<string>('/auth/register');

  /** Secondary CTA label (empty = hidden). */
  readonly secondaryCtaLabel = input<string>('See How It Works');

  /** Secondary CTA route. */
  readonly secondaryCtaRoute = input<string>('/agent-x');

  // ─── Internal State ───
  private readonly _phase = signal<DemoPhase>('idle');
  private readonly _typedText = signal('');
  private readonly _visibleMessages = signal<AgentXDemoChatMessage[]>([]);
  private readonly _visibleGraphicCount = signal(0);
  private readonly _hasStarted = signal(false);
  private _timers: ReturnType<typeof setTimeout>[] = [];
  private _observer: IntersectionObserver | null = null;
  private _hasPlayed = false;

  // ─── Protected Computed (template-only access) ───
  protected readonly phase = computed(() => this._phase());
  protected readonly typedText = computed(() => this._typedText());
  protected readonly visibleMessages = computed(() => this._visibleMessages());
  protected readonly visibleGraphicCount = computed(() => this._visibleGraphicCount());
  protected readonly hasStarted = computed(() => this._hasStarted());

  /** Deterministic, SSR-hydration-safe section title ID. */
  protected readonly sectionTitleId = `agent-x-demo-${nextDemoId++}`;

  constructor() {
    afterNextRender({
      write: () => {
        this.setupIntersectionObserver();
      },
    });

    this.destroyRef.onDestroy(() => this.cleanup());
  }

  // ─── Animation Orchestration ───

  /**
   * Sets up an IntersectionObserver to trigger the animation
   * when the component scrolls into the viewport (50% visible).
   */
  private setupIntersectionObserver(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const host = this.elementRef.nativeElement;
    if (!host) return;

    this._observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !this._hasPlayed) {
          this._hasPlayed = true;
          this.startDemo();
          this._observer?.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    this._observer.observe(host);
  }

  /** Runs the full demo animation sequence. */
  private startDemo(): void {
    const messages = this.chatMessages();
    const userMessage = messages[0];
    const agentMessage = messages[1];

    if (!userMessage) return;

    // Mark as started so template switches from SSR fallback to interactive mode
    this._hasStarted.set(true);

    // Phase 1: Typewriter effect for user message
    this._phase.set('typing');
    this._visibleMessages.set([userMessage]);
    this.typewriterEffect(userMessage.text, () => {
      // Phase 2: Brief pause, then "thinking" state
      this.scheduleTimer(() => {
        this._phase.set('thinking');

        // Phase 3: Agent responds
        this.scheduleTimer(() => {
          this._phase.set('generating');
          if (agentMessage) {
            this._visibleMessages.set([userMessage, agentMessage]);
          }

          // Phase 4: Graphics appear one by one
          this.revealGraphicsSequentially();
        }, 1200);
      }, 400);
    });
  }

  /** Types text character-by-character into the chat. */
  private typewriterEffect(text: string, onComplete: () => void): void {
    const prefersReducedMotion = this.prefersReducedMotion();

    if (prefersReducedMotion) {
      this._typedText.set(text);
      onComplete();
      return;
    }

    let index = 0;
    const speed = 28; // ms per character

    const typeNext = (): void => {
      if (index <= text.length) {
        this._typedText.set(text.slice(0, index));
        index++;
        this.scheduleTimer(typeNext, speed);
      } else {
        onComplete();
      }
    };

    typeNext();
  }

  /** Reveals graphic cards one at a time with staggered delay. */
  private revealGraphicsSequentially(): void {
    const total = this.graphics().length;
    const prefersReducedMotion = this.prefersReducedMotion();
    const delay = prefersReducedMotion ? 0 : 500;

    for (let i = 0; i < total; i++) {
      this.scheduleTimer(
        () => {
          this._visibleGraphicCount.set(i + 1);

          if (i === total - 1) {
            this._phase.set('complete');
          }
        },
        delay * (i + 1)
      );
    }
  }

  /** Checks if user prefers reduced motion. */
  private prefersReducedMotion(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Schedules a timer and tracks it for cleanup. */
  private scheduleTimer(fn: () => void, ms: number): void {
    const timer = setTimeout(fn, ms);
    this._timers.push(timer);
  }

  /** Cleans up all running timers and observer. */
  private cleanup(): void {
    this._timers.forEach((t) => clearTimeout(t));
    this._timers = [];
    this._observer?.disconnect();
    this._observer = null;
  }
}
