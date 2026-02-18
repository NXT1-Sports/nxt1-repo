/**
 * @fileoverview Old Way vs NXT1 Way Value Prop Comparison
 * @module @nxt1/ui/components/value-prop-comparison
 *
 * Marketing comparison section that highlights status-quo recruiting friction
 * versus the NXT1 workflow. Includes an accessible range-slider visual to
 * compare both states.
 *
 * SSR-safe, standalone, token-driven, and responsive.
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, signal } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

@Component({
  selector: 'nxt1-value-prop-comparison',
  standalone: true,
  imports: [CommonModule, NxtSectionHeaderComponent],
  template: `
    <section class="value-prop" aria-labelledby="value-prop-title">
      <div class="value-prop__header">
        <nxt1-section-header
          titleId="value-prop-title"
          eyebrow="The Old Way vs. The NXT1 Way"
          align="center"
          [headingLevel]="2"
          title="Stop Fighting Algorithms."
          accentText="Start Commanding Attention."
          subtitle="Move from scattered workflows and uncertainty to a professional recruiting system built for visibility, trust, and action."
        />
      </div>

      <div
        #comparisonTrack
        class="value-prop__comparison"
        [style.--comparison-position]="sliderPosition() + '%'"
        aria-label="Visual comparison of traditional recruiting versus the NXT1 recruiting workflow"
      >
        <article class="comparison-panel comparison-panel--old" aria-label="Old way">
          <header class="comparison-panel__header">
            <p class="comparison-panel__label">Old Way</p>
            <h3 class="comparison-panel__title">Hard to Track. Easy to Miss.</h3>
          </header>

          <div class="comparison-panel__surface" aria-hidden="true">
            <div class="surface-card">Messy email chains</div>
            <div class="surface-card">Google Doc stat sheets</div>
            <div class="surface-card surface-card--strong">“Hope they see it.”</div>
          </div>

          <ul class="comparison-panel__list" aria-label="Old recruiting process pain points">
            <li>Fragmented updates across tools</li>
            <li>No clear verification signal</li>
            <li>Uncertain coach visibility</li>
          </ul>
        </article>

        <article class="comparison-panel comparison-panel--new" aria-label="NXT1 way">
          <header class="comparison-panel__header">
            <p class="comparison-panel__label">The NXT1 Way</p>
            <h3 class="comparison-panel__title">Built for Elite Recruiting Outcomes.</h3>
          </header>

          <div class="comparison-panel__surface" aria-hidden="true">
            <div class="surface-card">ESPN-style graphics</div>
            <div class="surface-card">Elite highlight reel</div>
            <div class="surface-card surface-card--strong">Verified profile badge</div>
          </div>

          <ul class="comparison-panel__list" aria-label="NXT1 recruiting workflow benefits">
            <li>One-click send to coach</li>
            <li>Read receipts and visibility tracking</li>
            <li>Professional presentation by default</li>
          </ul>
        </article>

        <div class="comparison-divider" aria-hidden="true">
          <span
            class="comparison-divider__knob"
            (pointerdown)="onKnobPointerDown($event, comparisonTrack)"
            >VS</span
          >
        </div>
      </div>

      <div class="value-prop__slider">
        <label class="value-prop__slider-label" for="value-prop-slider"
          >Compare Old Way and NXT1 Way</label
        >
        <input
          id="value-prop-slider"
          class="value-prop__range"
          type="range"
          min="0"
          max="100"
          step="1"
          [value]="sliderPosition()"
          (input)="onSliderInput($event)"
          [attr.aria-valuenow]="sliderPosition()"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-valuetext]="'Comparison split ' + sliderPosition() + ' percent'"
        />
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .value-prop {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .value-prop__header {
        margin: 0 auto var(--nxt1-spacing-10);
      }

      .value-prop__comparison {
        --comparison-position: 56%;

        position: relative;
        min-height: calc(var(--nxt1-spacing-12) * 4);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-2xl);
        overflow: clip;
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-lg);
      }

      .comparison-panel {
        display: grid;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-6);
      }

      .comparison-panel--old {
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-surface-200);
        filter: saturate(0.75);
      }

      .comparison-panel--new {
        position: absolute;
        inset: 0;
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-100);
        clip-path: inset(0 0 0 var(--comparison-position));
      }

      .comparison-panel__header {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .comparison-panel__label {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .comparison-panel--old .comparison-panel__label {
        color: var(--nxt1-color-text-muted);
      }

      .comparison-panel--new .comparison-panel__label {
        color: var(--nxt1-color-primary);
      }

      .comparison-panel__title {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      @media (max-width: 575px) {
        .comparison-panel__title {
          font-size: var(--nxt1-fontSize-md);
        }
      }

      .comparison-panel__surface {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      @media (min-width: 768px) {
        .comparison-panel__surface {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      .surface-card {
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        padding: var(--nxt1-spacing-4);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .comparison-panel--old .surface-card {
        background: var(--nxt1-color-surface-300);
        color: var(--nxt1-color-text-secondary);
      }

      .comparison-panel--new .surface-card {
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-text-primary);
        border-color: var(--nxt1-color-alpha-primary30);
      }

      .surface-card--strong {
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .comparison-panel__list {
        margin: 0;
        padding-left: var(--nxt1-spacing-6);
        display: grid;
        gap: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .comparison-divider {
        position: absolute;
        top: 0;
        bottom: 0;
        left: var(--comparison-position);
        width: 1px;
        background: var(--nxt1-color-alpha-primary30);
        pointer-events: none;
      }

      .comparison-divider__knob {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        pointer-events: auto;
        cursor: ew-resize;
        touch-action: none;
        user-select: none;
      }

      .value-prop__slider {
        margin-top: var(--nxt1-spacing-5);
        display: grid;
        justify-items: center;
      }

      .value-prop__slider-label {
        display: block;
        margin-bottom: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
      }

      .value-prop__range {
        -webkit-appearance: none;
        appearance: none;
        width: min(24rem, calc(100vw - var(--nxt1-spacing-12)));
        background: transparent;
      }

      .value-prop__range::-webkit-slider-runnable-track {
        height: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary30);
      }

      .value-prop__range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: var(--nxt1-spacing-6);
        height: var(--nxt1-spacing-6);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        margin-top: calc((var(--nxt1-spacing-3) - var(--nxt1-spacing-6)) / 2);
      }

      .value-prop__range::-moz-range-track {
        height: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary30);
      }

      .value-prop__range::-moz-range-thumb {
        width: var(--nxt1-spacing-6);
        height: var(--nxt1-spacing-6);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
      }

      @media (max-width: 575px) {
        .value-prop__range {
          width: min(18rem, calc(100vw - var(--nxt1-spacing-12)));
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .comparison-panel--new {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtValuePropComparisonComponent {
  protected readonly sliderPosition = signal(56);
  private readonly isKnobDragging = signal(false);
  private comparisonTrackElement: HTMLElement | null = null;

  protected onSliderInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    const nextValue = Number.parseInt(target.value, 10);
    if (Number.isNaN(nextValue)) return;
    this.sliderPosition.set(this.clampPercentage(nextValue));
  }

  protected onKnobPointerDown(event: PointerEvent, comparisonTrack: HTMLElement): void {
    this.comparisonTrackElement = comparisonTrack;
    this.isKnobDragging.set(true);
    this.updateFromPointer(event.clientX);
    event.preventDefault();
  }

  @HostListener('window:pointermove', ['$event'])
  protected onPointerMove(event: PointerEvent): void {
    if (!this.isKnobDragging()) return;
    this.updateFromPointer(event.clientX);
  }

  @HostListener('window:pointerup')
  protected onPointerUp(): void {
    if (!this.isKnobDragging()) return;
    this.isKnobDragging.set(false);
  }

  private updateFromPointer(clientX: number): void {
    if (!this.comparisonTrackElement) return;
    const bounds = this.comparisonTrackElement.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const raw = ((clientX - bounds.left) / bounds.width) * 100;
    this.sliderPosition.set(this.clampPercentage(Math.round(raw)));
  }

  private clampPercentage(value: number): number {
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
  }
}
