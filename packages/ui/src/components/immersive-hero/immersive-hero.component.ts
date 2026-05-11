import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  afterNextRender,
  computed,
  input,
  inject,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NxtHeaderCardComponent } from '../header-card';
import { NxtIconComponent } from '../icon';
import { NxtMarketingInputBarComponent } from '../marketing-input-bar';

export interface ImmersiveHeroShot {
  readonly id: 'upload' | 'processing' | 'polished' | 'offer';
  readonly title: string;
  readonly description: string;
  readonly chip: string;
}

@Component({
  selector: 'nxt1-immersive-hero',
  standalone: true,
  imports: [CommonModule, NxtHeaderCardComponent, NxtIconComponent, NxtMarketingInputBarComponent],
  template: `
    @if (variant() === 'sleek') {
      <!-- SLEEK FULL-WIDTH VARIANT: Sports Intelligence Style -->
      <div class="hero-sleek" [class.hero-sleek--loaded]="loaded()">
        <div class="hero-sleek__background">
          @if (loaded()) {
            <!-- Tech Wave Layer (deferred until first paint for LCP) -->
            <svg class="hero-sleek__wave" viewBox="0 0 1440 320" preserveAspectRatio="none">
              <defs>
                <linearGradient id="wave-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop
                    offset="0%"
                    style="stop-color: var(--nxt1-color-primary); stop-opacity: 0.08"
                  />
                  <stop
                    offset="50%"
                    style="stop-color: var(--nxt1-color-secondary); stop-opacity: 0.04"
                  />
                  <stop offset="100%" style="stop-color: transparent" />
                </linearGradient>
                <linearGradient id="wave-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop
                    offset="0%"
                    style="stop-color: var(--nxt1-color-primary); stop-opacity: 0.25"
                  />
                  <stop
                    offset="50%"
                    style="stop-color: var(--nxt1-color-secondary); stop-opacity: 0.5"
                  />
                  <stop
                    offset="100%"
                    style="stop-color: var(--nxt1-color-primary); stop-opacity: 0.25"
                  />
                </linearGradient>
              </defs>
              <!-- Primary wave -->
              <path
                d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,122.7C672,117,768,139,864,144C960,149,1056,139,1152,128C1248,117,1344,107,1392,101.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
                fill="url(#wave-gradient)"
                class="wave-path wave-path--primary"
              />
              <!-- Secondary wave (offset & subtle) -->
              <path
                d="M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,154.7C672,149,768,171,864,176C960,181,1056,171,1152,160C1248,149,1344,139,1392,133.3L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
                fill="url(#wave-gradient)"
                class="wave-path wave-path--secondary"
                opacity="0.6"
              />
              <!-- Signal line to read as premium technology layer -->
              <path
                d="M0,128C160,145,320,176,480,165C640,154,800,102,960,112C1120,122,1280,170,1440,152"
                fill="none"
                stroke="url(#wave-line-gradient)"
                stroke-width="2"
                stroke-linecap="round"
                class="wave-line"
              />
            </svg>

            <!-- Animated grid network for sports data vibe -->
            <svg class="hero-sleek__grid" viewBox="0 0 1200 800" preserveAspectRatio="none">
              <defs>
                <linearGradient id="grid-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop
                    offset="0%"
                    style="stop-color: var(--nxt1-color-primary); stop-opacity: 0.1"
                  />
                  <stop
                    offset="50%"
                    style="stop-color: var(--nxt1-color-secondary); stop-opacity: 0.05"
                  />
                  <stop
                    offset="100%"
                    style="stop-color: var(--nxt1-color-primary); stop-opacity: 0"
                  />
                </linearGradient>
              </defs>
              <!-- Horizontal grid lines -->
              <line x1="0" y1="200" x2="1200" y2="200" class="grid-line" />
              <line x1="0" y1="400" x2="1200" y2="400" class="grid-line" />
              <line x1="0" y1="600" x2="1200" y2="600" class="grid-line" />
              <!-- Vertical grid lines -->
              <line x1="300" y1="0" x2="300" y2="800" class="grid-line" />
              <line x1="600" y1="0" x2="600" y2="800" class="grid-line" />
              <line x1="900" y1="0" x2="900" y2="800" class="grid-line" />
              <!-- Accent diagonal lines for data flow -->
              <line x1="0" y1="0" x2="1200" y2="800" class="grid-line grid-line--accent" />
              <line x1="1200" y1="0" x2="0" y2="800" class="grid-line grid-line--accent" />
            </svg>

            <!-- Gradient blobs (subtle backdrop) -->
            <div class="hero-sleek__blob hero-sleek__blob--1"></div>
            <div class="hero-sleek__blob hero-sleek__blob--2"></div>
            <div class="hero-sleek__blob hero-sleek__blob--3"></div>

            <!-- Animated data particles -->
            <div class="hero-sleek__particles">
              <div class="particle" style="--particle-delay: 0s"></div>
              <div class="particle" style="--particle-delay: 0.2s"></div>
              <div class="particle" style="--particle-delay: 0.4s"></div>
              <div class="particle" style="--particle-delay: 0.6s"></div>
              <div class="particle" style="--particle-delay: 0.8s"></div>
              <div class="particle" style="--particle-delay: 1s"></div>
            </div>
          }

          <!-- Scrim for readability -->
          <div class="hero-sleek__scrim"></div>
        </div>

        <div class="hero-sleek__content">
          <h1 id="sleek-hero-title" class="hero-sleek__title">{{ headline() }}</h1>
          <p class="hero-sleek__subtitle">{{ subhead() }}</p>

          <!-- Command Interface -->
          <div class="hero-sleek__command-zone">
            <nxt1-marketing-input-bar
              [placeholder]="commandPlaceholder()"
              [value]="commandInput()"
              ariaLabel="Command Agent X"
              buttonLabel="Ask NXT1"
              [active]="true"
              (valueChange)="commandInput.set($event)"
              (submitCommand)="onCommandSubmit($event)"
              (submitButtonClick)="navigateToAuth()"
            />

            <!-- Quick Action Tabs -->
            <div
              class="hero-sleek__quick-actions"
              role="tablist"
              aria-label="Quick Agent X commands"
            >
              <button
                type="button"
                class="hero-sleek__quick-action-tab"
                (click)="onQuickAction('Analyze')"
                role="tab"
                aria-selected="false"
              >
                <span>Analyze</span>
              </button>
              <button
                type="button"
                class="hero-sleek__quick-action-tab"
                (click)="onQuickAction('Create')"
                role="tab"
                aria-selected="false"
              >
                <span>Create</span>
              </button>
              <button
                type="button"
                class="hero-sleek__quick-action-tab"
                (click)="onQuickAction('Plan')"
                role="tab"
                aria-selected="false"
              >
                <span>Plan</span>
              </button>
              <button
                type="button"
                class="hero-sleek__quick-action-tab"
                (click)="onQuickAction('Discover')"
                role="tab"
                aria-selected="false"
              >
                <span>Discover</span>
              </button>
            </div>
          </div>

          <p class="hero-sleek__proof" role="status" aria-live="polite">
            <span class="hero-proof-pill">
              <nxt1-icon name="agentX" [size]="28" className="hero-proof-pill__icon" />
              <span>Agent X Active</span>
              <span class="hero-proof-pill__dot" aria-hidden="true"></span>
            </span>
          </p>
        </div>
      </div>
    } @else {
      <!-- DEFAULT VARIANT (existing) -->
      <nxt1-header-card [title]="headline()" titleId="immersive-hook-title">
        <div nxtHeaderBackground class="hook__background" [class.hook--loaded]="loaded()">
          <!-- Animated gradient mesh blobs -->
          <div class="hook__mesh">
            <div class="hook__blob hook__blob--1"></div>
            <div class="hook__blob hook__blob--2"></div>
            <div class="hook__blob hook__blob--3"></div>
            <div class="hook__blob hook__blob--4"></div>
          </div>

          <!-- Fine grain texture for depth -->
          <div class="hook__grain"></div>

          <!-- Soft readability scrim -->
          <div class="hook__scrim"></div>
        </div>

        <p nxtHeaderSubtitle class="hook__subtitle">{{ subhead() }}</p>

        <!-- Command Interface -->
        <div class="hook__command-zone" nxtHeaderActions>
          <nxt1-marketing-input-bar
            [placeholder]="commandPlaceholder()"
            [value]="commandInput()"
            ariaLabel="Command Agent X"
            buttonLabel="Ask NXT1"
            [active]="true"
            (valueChange)="commandInput.set($event)"
            (submitCommand)="onCommandSubmit($event)"
            (submitButtonClick)="navigateToAuth()"
          />

          <!-- Quick Action Tabs -->
          <div class="hook__quick-actions" role="tablist" aria-label="Quick Agent X commands">
            <button
              type="button"
              class="hook__quick-action-tab"
              (click)="onQuickAction('Analyze')"
              role="tab"
              aria-selected="false"
            >
              <span>Analyze</span>
            </button>
            <button
              type="button"
              class="hook__quick-action-tab"
              (click)="onQuickAction('Create')"
              role="tab"
              aria-selected="false"
            >
              <span>Create</span>
            </button>
            <button
              type="button"
              class="hook__quick-action-tab"
              (click)="onQuickAction('Plan')"
              role="tab"
              aria-selected="false"
            >
              <span>Plan</span>
            </button>
            <button
              type="button"
              class="hook__quick-action-tab"
              (click)="onQuickAction('Discover')"
              role="tab"
              aria-selected="false"
            >
              <span>Discover</span>
            </button>
          </div>
        </div>

        <p nxtHeaderFooter class="hook__proof" role="status" aria-live="polite">
          <span class="hero-proof-pill">
            <nxt1-icon name="agentX" [size]="28" className="hero-proof-pill__icon" />
            <span>Agent X Active</span>
            <span class="hero-proof-pill__dot" aria-hidden="true"></span>
          </span>
        </p>
      </nxt1-header-card>
    }

    @if (isReelOpen()) {
      <div class="hook-reel" role="presentation" (click)="closeReel()">
        <section
          class="hook-reel__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hook-reel-title"
          (click)="$event.stopPropagation()"
        >
          <header class="hook-reel__header">
            <h2 id="hook-reel-title" class="hook-reel__title">Platform Reel</h2>
            <button
              type="button"
              class="hook-reel__close"
              aria-label="Close reel"
              (click)="closeReel()"
            >
              Close
            </button>
          </header>

          <div class="hook-reel__grid">
            @for (shot of shots(); track shot.id) {
              <article class="hook-reel__shot">
                <div
                  class="hook-reel__media"
                  [class]="'hook-reel__media hook-reel__media--' + shot.id"
                >
                  <span class="hook-reel__media-chip">{{ shot.chip }}</span>
                </div>
                <h3 class="hook-reel__shot-title">{{ shot.title }}</h3>
                <p class="hook-reel__shot-copy">{{ shot.description }}</p>
              </article>
            }
          </div>
        </section>
      </div>
    }
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════════════
         SLEEK VARIANT: Full-width Sports Intelligence
         ═══════════════════════════════════════════════════ */

      @keyframes grid-pulse {
        0% {
          opacity: 0.3;
          stroke-width: 1px;
        }
        50% {
          opacity: 0.6;
          stroke-width: 1.2px;
        }
        100% {
          opacity: 0.3;
          stroke-width: 1px;
        }
      }

      @keyframes agentx-status-pulse {
        0% {
          transform: scale(1);
          opacity: 1;
        }
        70% {
          transform: scale(1.5);
          opacity: 0;
        }
        100% {
          transform: scale(1.5);
          opacity: 0;
        }
      }

      .hero-proof-pill {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .hero-proof-pill__icon {
        color: var(--nxt1-color-primary);
      }

      .hero-proof-pill__dot {
        position: relative;
        inline-size: 8px;
        block-size: 8px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-success, #22c55e);
      }

      .hero-proof-pill__dot::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-success, #22c55e);
        animation: agentx-status-pulse 1.8s ease-out infinite;
      }

      @keyframes particle-float {
        0% {
          transform: translateY(0) translateX(0) scale(1);
          opacity: 0;
        }
        10% {
          opacity: 1;
        }
        90% {
          opacity: 1;
        }
        100% {
          transform: translateY(-800px) translateX(var(--particle-x, 200px)) scale(0);
          opacity: 0;
        }
      }

      @keyframes data-flow-1 {
        0% {
          stroke-dashoffset: 1000;
        }
        100% {
          stroke-dashoffset: 0;
        }
      }

      @keyframes data-flow-2 {
        0% {
          stroke-dashoffset: 0;
        }
        100% {
          stroke-dashoffset: 1000;
        }
      }

      /* Tech Wave Animations (GPU-accelerated, LCP/CLS safe) */
      @keyframes wave-motion {
        0% {
          transform: translateX(0) translateZ(0);
        }
        50% {
          transform: translateX(40px) translateZ(0);
        }
        100% {
          transform: translateX(0) translateZ(0);
        }
      }

      @keyframes wave-motion-offset {
        0% {
          transform: translateX(-20px) translateZ(0);
        }
        50% {
          transform: translateX(60px) translateZ(0);
        }
        100% {
          transform: translateX(-20px) translateZ(0);
        }
      }

      @keyframes wave-signal-flow {
        0% {
          stroke-dashoffset: 180;
        }
        100% {
          stroke-dashoffset: 0;
        }
      }

      .hero-sleek {
        position: relative;
        width: 100%;
        min-height: 90vh;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: var(--nxt1-color-bg-primary);
      }

      .hero-sleek__background {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      /* SVG Grid Network */
      .hero-sleek__grid {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0.15;
      }

      /* Tech Wave Layer */
      .hero-sleek__wave {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 32%;
        opacity: 0.92;
        z-index: 2;
        pointer-events: none;
        will-change: transform;
      }

      .wave-path {
        will-change: transform;
      }

      .wave-path--primary {
        animation: wave-motion 6s ease-in-out infinite;
      }

      .wave-path--secondary {
        animation: wave-motion-offset 8s ease-in-out infinite;
      }

      .wave-line {
        stroke-dasharray: 14 8;
        stroke-dashoffset: 180;
        opacity: 0.7;
      }

      .hero-sleek--loaded .wave-line {
        animation: wave-signal-flow 2.8s linear infinite;
      }

      .hero-sleek--loaded .wave-path--primary {
        animation-play-state: running;
      }

      .hero-sleek--loaded .wave-path--secondary {
        animation-play-state: running;
      }

      .grid-line {
        stroke: var(--nxt1-color-primary);
        stroke-width: 1px;
        opacity: 0.4;
      }

      .hero-sleek--loaded .grid-line {
        animation: grid-pulse 4s ease-in-out infinite;
      }

      .grid-line--accent {
        stroke: var(--nxt1-color-secondary);
        opacity: 0.2;
        animation-delay: 1s;
      }

      /* Subtle gradient blobs (backdrop) */
      .hero-sleek__blob {
        position: absolute;
        border-radius: 50%;
        pointer-events: none;
        will-change: transform;
        filter: blur(80px);
      }

      .hero-sleek__blob--1 {
        top: -10%;
        left: -5%;
        width: 500px;
        height: 500px;
        background: radial-gradient(
          ellipse at 30% 30%,
          color-mix(in srgb, var(--nxt1-color-primary) 25%, transparent) 0%,
          transparent 70%
        );
      }

      .hero-sleek--loaded .hero-sleek__blob--1 {
        animation: blob-drift-1 20s ease-in-out infinite;
      }

      .hero-sleek__blob--2 {
        bottom: -8%;
        right: -3%;
        width: 450px;
        height: 450px;
        background: radial-gradient(
          ellipse at 60% 60%,
          color-mix(in srgb, var(--nxt1-color-secondary) 20%, transparent) 0%,
          transparent 70%
        );
      }

      .hero-sleek--loaded .hero-sleek__blob--2 {
        animation: blob-drift-2 22s ease-in-out infinite;
        animation-delay: -3s;
      }

      .hero-sleek__blob--3 {
        top: -10%;
        right: -5%;
        width: 500px;
        height: 500px;
        background: radial-gradient(
          ellipse at 70% 30%,
          color-mix(in srgb, var(--nxt1-color-primary) 25%, transparent) 0%,
          transparent 70%
        );
      }

      .hero-sleek--loaded .hero-sleek__blob--3 {
        animation: blob-drift-sleek-3 24s ease-in-out infinite;
        animation-delay: -5s;
      }

      /* Animated data particles */
      .hero-sleek__particles {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      .particle {
        position: absolute;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: radial-gradient(
          circle at 30% 30%,
          var(--nxt1-color-primary),
          var(--nxt1-color-secondary)
        );
        box-shadow: 0 0 12px var(--nxt1-color-primary);
        left: var(--particle-x, 50%);
        bottom: -10%;
        --particle-x: calc(10% + var(--random, 0) * 80%);
      }

      .hero-sleek--loaded .particle {
        animation: particle-float 6s ease-out var(--particle-delay, 0s) infinite;
      }

      .particle:nth-child(1) {
        --particle-x: 15%;
      }
      .particle:nth-child(2) {
        --particle-x: 28%;
      }
      .particle:nth-child(3) {
        --particle-x: 42%;
      }
      .particle:nth-child(4) {
        --particle-x: 58%;
      }
      .particle:nth-child(5) {
        --particle-x: 72%;
      }
      .particle:nth-child(6) {
        --particle-x: 85%;
      }

      /* Readability scrim */
      .hero-sleek__scrim {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--nxt1-color-bg-primary) 18%, transparent) 0%,
          color-mix(in srgb, var(--nxt1-color-bg-primary) 45%, transparent) 45%,
          color-mix(in srgb, var(--nxt1-color-bg-primary) 78%, transparent) 100%
        );
        pointer-events: none;
      }

      /* Content positioning */
      .hero-sleek__content {
        position: relative;
        z-index: 10;
        text-align: center;
        padding: var(--nxt1-spacing-10) var(--nxt1-spacing-4);
        max-width: 900px;
        width: 100%;
      }

      .hero-sleek__title {
        margin: 0 0 var(--nxt1-spacing-4) 0;
        font-size: clamp(2.5rem, 8vw, 4.5rem);
        font-family: var(--nxt1-fontFamily-display);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: 1.1;
        color: var(--nxt1-color-text-primary);
        letter-spacing: -0.02em;
      }

      .hero-sleek__subtitle {
        margin: 0 0 var(--nxt1-spacing-8) 0;
        max-width: 60ch;
        margin-left: auto;
        margin-right: auto;
        font-size: clamp(1rem, 2vw, 1.25rem);
        font-family: var(--nxt1-fontFamily-brand);
        line-height: 1.6;
        color: var(--nxt1-color-text-secondary);
        text-wrap: pretty;
      }

      .hero-sleek__command-zone {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        margin-bottom: var(--nxt1-spacing-6);
        max-width: 600px;
        width: 100%;
        margin-left: auto;
        margin-right: auto;
      }

      .hero-sleek__command-form {
        display: flex;
        gap: var(--nxt1-spacing-2);
        align-items: center;
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 40%, transparent);
        backdrop-filter: blur(20px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 40%, transparent);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .hero-sleek__command-form:focus-within {
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 60%, transparent);
        border-color: var(--nxt1-color-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--nxt1-color-primary) 15%, transparent);
      }

      .hero-sleek__command-input {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-base);
        font-family: var(--nxt1-fontFamily-brand);
        outline: none;
        padding: 0;
      }

      .hero-sleek__command-input::placeholder {
        color: var(--nxt1-color-text-tertiary);
        animation: typewriter-cursor 0.6s infinite;
      }

      @keyframes typewriter-cursor {
        0%,
        49% {
          color: var(--nxt1-color-text-tertiary);
        }
        50%,
        100% {
          color: transparent;
        }
      }

      .hero-sleek__command-button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        cursor: pointer;
        transition: all 0.15s ease;
        flex-shrink: 0;
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .hero-sleek__command-button-text {
        display: inline;
      }

      .hero-sleek__command-button.active {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-bg-primary);
        border-color: var(--nxt1-color-primary);
        box-shadow: 0 4px 12px color-mix(in srgb, var(--nxt1-color-primary) 30%, transparent);
      }

      .hero-sleek__command-button:hover:not(:disabled) {
        transform: translateY(-2px);
      }

      @media (max-width: 640px) {
        .hero-sleek__command-button {
          padding: var(--nxt1-spacing-2);
          gap: 0;
        }

        .hero-sleek__command-button-text {
          display: none;
        }
      }

      .hero-sleek__quick-actions {
        display: flex;
        gap: var(--nxt1-spacing-2);
        justify-content: center;
        flex-wrap: wrap;
      }

      .hero-sleek__quick-action-tab {
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 50%, transparent);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 30%, transparent);
        border-radius: var(--nxt1-borderRadius-full);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .hero-sleek__quick-action-tab:hover {
        background: color-mix(
          in srgb,
          var(--nxt1-color-primary) 20%,
          var(--nxt1-color-surface-200)
        );
        color: var(--nxt1-color-primary);
        border-color: var(--nxt1-color-primary);
        transform: translateY(-2px);
      }

      .hero-sleek__actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        margin-bottom: var(--nxt1-spacing-6);
      }

      .hero-sleek__proof {
        margin: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 50%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 60%, transparent);
        backdrop-filter: blur(10px);
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      /* Responsive: sleek variant */
      @media (max-width: 768px) {
        .hero-sleek {
          min-height: 84vh;
        }

        .hero-sleek__title {
          font-size: clamp(var(--nxt1-fontSize-3xl), 8vw, var(--nxt1-fontSize-5xl));
          line-height: 1.08;
        }

        .hero-sleek__subtitle {
          font-size: clamp(var(--nxt1-fontSize-base), 3.2vw, var(--nxt1-fontSize-xl));
        }

        .hero-sleek__content {
          padding: var(--nxt1-spacing-7) var(--nxt1-spacing-4);
        }

        .hero-sleek__grid {
          opacity: 0.18;
        }

        .grid-line {
          stroke-width: 1.1px;
        }
      }

      @media (max-width: 480px) {
        .hero-sleek {
          min-height: 78vh;
        }

        .hero-sleek__title {
          font-size: clamp(var(--nxt1-fontSize-3xl), 9.4vw, var(--nxt1-fontSize-4xl));
          margin-bottom: var(--nxt1-spacing-4);
        }

        .hero-sleek__subtitle {
          font-size: var(--nxt1-fontSize-base);
          line-height: var(--nxt1-lineHeight-relaxed);
          margin-bottom: var(--nxt1-spacing-6);
        }

        .hero-sleek__actions {
          gap: var(--nxt1-spacing-2);
          margin-bottom: var(--nxt1-spacing-5);
        }

        .hero-sleek__proof {
          font-size: var(--nxt1-fontSize-xs);
          padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .hero-sleek--loaded .grid-line,
        .hero-sleek--loaded .particle,
        .hero-sleek--loaded .hero-sleek__blob--1,
        .hero-sleek--loaded .hero-sleek__blob--2,
        .hero-sleek--loaded .hero-sleek__blob--3 {
          animation: none !important;
        }
      }

      /* ═══════════════════════════════════════════════════
         DEFAULT VARIANT: Existing styles (preserved)
         ═══════════════════════════════════════════════════ */

      /* ─── keyframes ─── */

      @keyframes blob-drift-1 {
        0% {
          transform: translate(0, 0) scale(1);
          border-radius: 40% 60% 55% 45% / 55% 40% 60% 45%;
        }
        20% {
          transform: translate(12%, -8%) scale(1.12);
          border-radius: 50% 50% 45% 55% / 48% 52% 48% 52%;
        }
        40% {
          transform: translate(-6%, 10%) scale(0.92);
          border-radius: 44% 56% 52% 48% / 56% 44% 50% 50%;
        }
        60% {
          transform: translate(14%, 5%) scale(1.08);
          border-radius: 52% 48% 42% 58% / 42% 58% 55% 45%;
        }
        80% {
          transform: translate(-10%, -6%) scale(0.95);
          border-radius: 46% 54% 58% 42% / 52% 48% 44% 56%;
        }
        100% {
          transform: translate(0, 0) scale(1);
          border-radius: 40% 60% 55% 45% / 55% 40% 60% 45%;
        }
      }

      @keyframes blob-drift-2 {
        0% {
          transform: translate(0, 0) scale(1);
          border-radius: 55% 45% 50% 50% / 45% 55% 45% 55%;
        }
        25% {
          transform: translate(-14%, 8%) scale(1.14);
          border-radius: 48% 52% 56% 44% / 52% 48% 50% 50%;
        }
        50% {
          transform: translate(10%, -12%) scale(0.88);
          border-radius: 58% 42% 44% 56% / 44% 56% 52% 48%;
        }
        75% {
          transform: translate(-4%, 14%) scale(1.06);
          border-radius: 42% 58% 52% 48% / 56% 44% 48% 52%;
        }
        100% {
          transform: translate(0, 0) scale(1);
          border-radius: 55% 45% 50% 50% / 45% 55% 45% 55%;
        }
      }

      @keyframes blob-drift-sleek-3 {
        0% {
          transform: translate(0, 0) scale(1);
          border-radius: 48% 52% 46% 54% / 52% 48% 52% 48%;
        }
        33% {
          transform: translate(8%, 12%) scale(1.1);
          border-radius: 54% 46% 52% 48% / 46% 54% 48% 52%;
        }
        66% {
          transform: translate(-12%, -6%) scale(0.9);
          border-radius: 42% 58% 56% 44% / 58% 42% 46% 54%;
        }
        100% {
          transform: translate(0, 0) scale(1);
          border-radius: 48% 52% 46% 54% / 52% 48% 52% 48%;
        }
      }

      @keyframes blob-drift-4 {
        0% {
          transform: translate(0, 0) scale(1);
          border-radius: 50% 50% 44% 56% / 56% 44% 56% 44%;
        }
        30% {
          transform: translate(-10%, -10%) scale(1.16);
          border-radius: 56% 44% 50% 50% / 44% 56% 50% 50%;
        }
        60% {
          transform: translate(12%, 8%) scale(0.88);
          border-radius: 44% 56% 56% 44% / 50% 50% 44% 56%;
        }
        100% {
          transform: translate(0, 0) scale(1);
          border-radius: 50% 50% 44% 56% / 56% 44% 56% 44%;
        }
      }

      @keyframes shimmer-sweep {
        0% {
          transform: translateX(-100%) skewX(-15deg);
        }
        100% {
          transform: translateX(200%) skewX(-15deg);
        }
      }

      :host {
        display: block;
      }

      nxt1-header-card {
        --nxt1-header-min-height: calc(var(--nxt1-spacing-10) * 8);
        --nxt1-header-padding: var(--nxt1-spacing-7) var(--nxt1-spacing-5);
        --nxt1-header-title-margin: var(--nxt1-spacing-3) 0 var(--nxt1-spacing-2) 0;
        --nxt1-header-title-line-height: 1.05;
        --nxt1-header-actions-margin-top: var(--nxt1-spacing-5);
      }

      /* ─── background root ─── */

      .hook__background {
        position: relative;
        width: 100%;
        height: 100%;
      }

      /* ─── gradient mesh container ─── */

      .hook__mesh {
        position: absolute;
        inset: -20%;
        width: 140%;
        height: 140%;
        pointer-events: none;
      }

      /* ─── organic gradient blobs ─── */

      .hook__blob {
        position: absolute;
        border-radius: 40% 60% 55% 45% / 55% 40% 60% 45%;
        pointer-events: none;
        opacity: 0;
        transition: opacity 1s ease;
        will-change: transform;
      }

      .hook--loaded .hook__blob {
        opacity: 1;
      }

      /* Primary colour — top-left dominant wash */
      .hook__blob--1 {
        top: -10%;
        left: -8%;
        width: 60%;
        height: 65%;
        background: radial-gradient(
          ellipse at 40% 40%,
          color-mix(in srgb, var(--nxt1-color-primary) 48%, transparent) 0%,
          color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent) 50%,
          transparent 80%
        );
        filter: blur(clamp(30px, 5vw, 60px));
      }

      .hook--loaded .hook__blob--1 {
        animation: blob-drift-1 14s ease-in-out infinite;
      }

      /* Secondary colour — bottom-right accent */
      .hook__blob--2 {
        bottom: -12%;
        right: -6%;
        width: 55%;
        height: 60%;
        border-radius: 55% 45% 50% 50% / 45% 55% 45% 55%;
        background: radial-gradient(
          ellipse at 60% 60%,
          color-mix(in srgb, var(--nxt1-color-secondary) 42%, transparent) 0%,
          color-mix(in srgb, var(--nxt1-color-secondary) 14%, transparent) 50%,
          transparent 80%
        );
        filter: blur(clamp(32px, 5vw, 65px));
      }

      .hook--loaded .hook__blob--2 {
        animation: blob-drift-2 18s ease-in-out infinite;
        animation-delay: -4s;
      }

      /* Accent blend — center convergence */
      .hook__blob--3 {
        top: 25%;
        left: 20%;
        width: 50%;
        height: 50%;
        border-radius: 48% 52% 46% 54% / 52% 48% 52% 48%;
        background: radial-gradient(
          ellipse at 50% 50%,
          color-mix(in srgb, var(--nxt1-color-primary) 16%, var(--nxt1-color-secondary)) 0%,
          transparent 70%
        );
        filter: blur(clamp(36px, 6vw, 72px));
      }

      .hook--loaded .hook__blob--3 {
        opacity: 0.7;
        animation: blob-drift-3 20s ease-in-out infinite;
        animation-delay: -8s;
      }

      /* Subtle warm highlight — top-right shimmer */
      .hook__blob--4 {
        top: -5%;
        right: 10%;
        width: 40%;
        height: 40%;
        border-radius: 50% 50% 44% 56% / 56% 44% 56% 44%;
        background: radial-gradient(
          ellipse at 50% 50%,
          color-mix(in srgb, var(--nxt1-color-primary) 22%, transparent) 0%,
          color-mix(in srgb, var(--nxt1-color-secondary) 8%, transparent) 40%,
          transparent 70%
        );
        filter: blur(clamp(28px, 4vw, 55px));
      }

      .hook--loaded .hook__blob--4 {
        opacity: 0.6;
        animation: blob-drift-4 16s ease-in-out infinite;
        animation-delay: -6s;
      }

      /* ─── fine grain texture (CSS noise, no SVG) ─── */

      .hook__grain {
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.035;
        mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        background-repeat: repeat;
        background-size: 200px 200px;
      }

      /* ─── subtle shimmer highlight ─── */

      .hook__scrim {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }

      .hook__scrim::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 50%;
        height: 100%;
        background: linear-gradient(
          105deg,
          transparent 40%,
          color-mix(in srgb, var(--nxt1-color-text-primary) 3%, transparent) 45%,
          color-mix(in srgb, var(--nxt1-color-text-primary) 5%, transparent) 50%,
          transparent 55%
        );
        opacity: 0;
        transition: opacity 1.2s ease 0.4s;
      }

      .hook--loaded .hook__scrim::before {
        opacity: 1;
        animation: shimmer-sweep 8s ease-in-out 2s infinite;
      }

      /* ─── content ─── */

      .hook__subtitle {
        margin: 0;
        max-width: 60ch;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-lg);
        line-height: var(--nxt1-lineHeight-relaxed);
        text-wrap: pretty;
      }

      .hook__command-zone {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        max-width: 600px;
        width: 100%;
        margin-left: auto;
        margin-right: auto;
      }

      .hook__command-form {
        display: flex;
        gap: var(--nxt1-spacing-2);
        align-items: center;
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 40%, transparent);
        backdrop-filter: blur(20px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 40%, transparent);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .hook__command-form:focus-within {
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 60%, transparent);
        border-color: var(--nxt1-color-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--nxt1-color-primary) 15%, transparent);
      }

      .hook__command-input {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-base);
        font-family: var(--nxt1-fontFamily-brand);
        outline: none;
        padding: 0;
      }

      .hook__command-input::placeholder {
        color: var(--nxt1-color-text-tertiary);
        animation: typewriter-cursor 0.6s infinite;
      }

      .hook__command-button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        cursor: pointer;
        transition: all 0.15s ease;
        flex-shrink: 0;
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .hook__command-button-text {
        display: inline;
      }

      .hook__command-button.active {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-bg-primary);
        border-color: var(--nxt1-color-primary);
        box-shadow: 0 4px 12px color-mix(in srgb, var(--nxt1-color-primary) 30%, transparent);
      }

      .hook__command-button:hover:not(:disabled) {
        transform: translateY(-2px);
      }

      @media (max-width: 640px) {
        .hook__command-button {
          padding: var(--nxt1-spacing-2);
          gap: 0;
        }

        .hook__command-button-text {
          display: none;
        }
      }

      .hook__quick-actions {
        display: flex;
        gap: var(--nxt1-spacing-2);
        justify-content: center;
        flex-wrap: wrap;
      }

      .hook__quick-action-tab {
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 50%, transparent);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 30%, transparent);
        border-radius: var(--nxt1-borderRadius-full);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .hook__quick-action-tab:hover {
        background: color-mix(
          in srgb,
          var(--nxt1-color-primary) 20%,
          var(--nxt1-color-surface-200)
        );
        color: var(--nxt1-color-primary);
        border-color: var(--nxt1-color-primary);
        transform: translateY(-2px);
      }

      .hook__actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .hook__proof {
        margin: var(--nxt1-spacing-3) 0 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        min-height: var(--nxt1-spacing-8);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 60%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 80%, transparent);
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        backdrop-filter: blur(8px);
      }

      /* ─── reel modal ─── */

      .hook-reel {
        position: fixed;
        inset: 0;
        z-index: var(--nxt1-z-index-modal, 1000);
        display: grid;
        place-items: center;
        padding: var(--nxt1-spacing-4);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 70%, transparent);
        backdrop-filter: blur(var(--nxt1-spacing-1));
      }

      .hook-reel__dialog {
        width: min(var(--nxt1-root-shell-max-width, 88rem), 100%);
        max-height: min(90svh, calc(var(--nxt1-spacing-10) * 11));
        overflow: auto;
        border-radius: var(--nxt1-borderRadius-3xl);
        border: 1px solid var(--nxt1-color-border-default);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 92%, transparent);
        box-shadow: 0 var(--nxt1-spacing-6) var(--nxt1-spacing-10)
          color-mix(in srgb, var(--nxt1-color-bg-primary) 36%, transparent);
      }

      .hook-reel__header {
        position: sticky;
        top: 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        border-bottom: 1px solid var(--nxt1-color-border-default);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 96%, transparent);
      }

      .hook-reel__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .hook-reel__close {
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        min-height: var(--nxt1-spacing-8);
        padding: 0 var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
      }

      .hook-reel__close:hover {
        background: var(--nxt1-color-surface-300);
      }

      .hook-reel__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-5);
      }

      .hook-reel__shot {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .hook-reel__media {
        min-height: calc(var(--nxt1-spacing-10) * 2);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        display: flex;
        align-items: end;
        padding: var(--nxt1-spacing-3);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 82%, transparent);
      }

      .hook-reel__media--upload {
        background-image: linear-gradient(
          140deg,
          color-mix(in srgb, var(--nxt1-color-primary) 36%, transparent),
          color-mix(in srgb, var(--nxt1-color-surface-300) 84%, transparent)
        );
      }

      .hook-reel__media--processing {
        background-image: linear-gradient(
          140deg,
          color-mix(in srgb, var(--nxt1-color-secondary) 36%, transparent),
          color-mix(in srgb, var(--nxt1-color-surface-300) 84%, transparent)
        );
      }

      .hook-reel__media--polished {
        background-image: linear-gradient(
          140deg,
          color-mix(in srgb, var(--nxt1-color-primary) 30%, transparent),
          color-mix(in srgb, var(--nxt1-color-secondary) 24%, transparent)
        );
      }

      .hook-reel__media--offer {
        background-image: linear-gradient(
          140deg,
          color-mix(in srgb, var(--nxt1-color-success, var(--nxt1-color-primary)) 34%, transparent),
          color-mix(in srgb, var(--nxt1-color-surface-300) 84%, transparent)
        );
      }

      .hook-reel__media-chip {
        display: inline-flex;
        align-items: center;
        padding: 0 var(--nxt1-spacing-2);
        min-height: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 72%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 90%, transparent);
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        text-transform: uppercase;
      }

      .hook-reel__shot-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .hook-reel__shot-copy {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ─── responsive ─── */

      @media (max-width: 768px) {
        nxt1-header-card {
          --nxt1-header-shell-padding-mobile: var(--nxt1-spacing-3);
          --nxt1-header-padding-mobile: var(--nxt1-spacing-6) var(--nxt1-spacing-4);
          --nxt1-header-min-height-mobile: calc(var(--nxt1-spacing-10) * 6);
          --nxt1-header-title-size-mobile: var(--nxt1-fontSize-3xl);
        }

        .hook__subtitle {
          font-size: var(--nxt1-fontSize-base);
        }

        .hook-reel__grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 480px) {
        nxt1-header-card {
          --nxt1-header-shell-padding-xs: var(--nxt1-spacing-2);
        }

        .hook__subtitle {
          max-width: 36ch;
        }

        .hook__proof {
          font-size: var(--nxt1-fontSize-xs);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .hook__blob,
        .hook--loaded .hook__blob {
          animation: none !important;
        }

        .hook__scrim::before,
        .hook--loaded .hook__scrim::before {
          animation: none !important;
          opacity: 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtImmersiveHeroComponent {
  readonly variant = input<'default' | 'sleek'>('default');
  readonly headline = input('The Sports Intelligence Platform');
  readonly subhead = input(
    'The AI command center for sports organizations to run complex operations, automate workflows, and coordinate execution from one system.'
  );
  readonly shots = input<readonly ImmersiveHeroShot[]>([]);

  readonly exploreRequested = output<void>();
  readonly commandSubmitted = output<string>();
  readonly quickActionSelected = output<string>();

  protected readonly commandInput = signal('');

  private readonly typewriterPhrases = [
    'What can Agent X help with?',
    'Analyze game film...',
    'Generate performance reports...',
    'Build game strategies...',
    'Scout opponents...',
    'Track team metrics...',
    'Design AI playbooks...',
  ];

  private readonly _displayedPlaceholder = signal(this.typewriterPhrases[0]);
  protected readonly displayedPlaceholder = computed(() => this._displayedPlaceholder());

  protected readonly commandPlaceholder = computed(() => this.displayedPlaceholder());

  private readonly _isReelOpen = signal(false);
  protected readonly isReelOpen = computed(() => this._isReelOpen());

  private readonly router = inject(Router);

  /** Becomes true after the first render so animations only run post-load. */
  private readonly _loaded = signal(false);
  protected readonly loaded = computed(() => this._loaded());

  constructor() {
    afterNextRender(() => {
      // Mark hero as loaded on first frame so non-critical visuals mount after LCP candidate.
      requestAnimationFrame(() => this._loaded.set(true));

      // Start typewriter when the main thread is idle to avoid competing with initial paint.
      const idleCallback = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback;

      if (idleCallback) {
        idleCallback(() => this.startTypewriterAnimation());
        return;
      }

      setTimeout(() => this.startTypewriterAnimation(), 1200);
    });
  }

  private startTypewriterAnimation(): void {
    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    const typingSpeed = 25; // ms per character
    const deletingSpeed = 15; // ms per character
    const pauseBetweenPhrases = 1000; // ms pause before deleting

    const animate = () => {
      const currentPhrase = this.typewriterPhrases[phraseIndex];

      if (isDeleting) {
        // Delete characters one by one
        charIndex--;
        if (charIndex < 0) {
          isDeleting = false;
          phraseIndex = (phraseIndex + 1) % this.typewriterPhrases.length;
          setTimeout(animate, 300);
          return;
        }
      } else {
        // Type characters one by one
        charIndex++;
        if (charIndex > currentPhrase.length) {
          isDeleting = true;
          setTimeout(animate, pauseBetweenPhrases);
          return;
        }
      }

      this._displayedPlaceholder.set(currentPhrase.substring(0, charIndex));
      setTimeout(animate, isDeleting ? deletingSpeed : typingSpeed);
    };

    animate();
  }

  protected openReel(): void {
    this._isReelOpen.set(true);
    this.exploreRequested.emit();
  }

  protected closeReel(): void {
    this._isReelOpen.set(false);
  }

  protected onCommandSubmit(command: string): void {
    if (command) {
      this.commandSubmitted.emit(command);
      this.commandInput.set('');
    }
  }

  protected onQuickAction(action: string): void {
    this.quickActionSelected.emit(action);
  }

  protected navigateToAuth(): void {
    this.router.navigate(['/auth']);
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKey(): void {
    if (this._isReelOpen()) {
      this._isReelOpen.set(false);
    }
  }
}
