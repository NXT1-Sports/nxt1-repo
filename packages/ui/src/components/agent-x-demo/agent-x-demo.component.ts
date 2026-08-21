import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';
import { NxtCtaButtonComponent } from '../cta-button';
import { NxtSectionHeaderComponent } from '../section-header';

let nextDemoId = 0;
const HIGHLIGHT_REEL_THUMBNAIL_SRC = `/${IMAGE_PATHS.highlightPlaceholder}`;

type AgentXDemoOutputType =
  | 'highlight-reel'
  | 'contact-coaches'
  | 'recruiting-strategy'
  | 'college-match';

export interface AgentXDemoWorkflowStep {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly result: string;
  readonly outputType: AgentXDemoOutputType;
}

const DEFAULT_WORKFLOW: readonly AgentXDemoWorkflowStep[] = [
  {
    id: 'highlight-reel',
    title: 'Package the film',
    prompt:
      "Turn Friday's film and stat sheet into a 60-second recap package the staff and players can use tonight.",
    result:
      'Agent X cuts the clips, sequences the story, and packages the share-ready film assets automatically.',
    outputType: 'highlight-reel',
  },
  {
    id: 'contact-coaches',
    title: 'Run the communications queue',
    prompt:
      "Draft the updates I need for staff, parents, recruits, and sponsors after tonight's result.",
    result:
      'Agent X builds the message set, personalizes each version, and queues the follow-ups automatically.',
    outputType: 'contact-coaches',
  },
  {
    id: 'recruiting-strategy',
    title: 'Build the weekly operating plan',
    prompt:
      'Review what happened this week and generate the next seven days of priorities for film, creative, outreach, and staff actions.',
    result: 'Agent X returns a structured weekly playbook with milestones, owners, and timing.',
    outputType: 'recruiting-strategy',
  },
  {
    id: 'college-match',
    title: 'Prioritize roster outreach',
    prompt:
      'Rank the college programs our roster should contact first and map the next recruiting touchpoint for each one.',
    result:
      'Agent X returns a priority outreach board with fit, urgency, and the next action for every target program.',
    outputType: 'college-match',
  },
];

@Component({
  selector: 'nxt1-agent-x-demo',
  standalone: true,
  imports: [CommonModule, NxtCtaButtonComponent, NxtSectionHeaderComponent],
  template: `
    <section class="agent-x-demo" [attr.aria-labelledby]="sectionTitleId" role="region">
      <div class="demo-header-shared">
        <nxt1-section-header
          variant="hero"
          align="center"
          [titleId]="sectionTitleId"
          [headingLevel]="2"
          [title]="headline()"
          [subtitle]="subtitle()"
        />

        <div class="demo-cta">
          <nxt1-cta-button
            [label]="primaryCtaLabel()"
            [route]="primaryCtaRoute()"
            variant="primary"
          />
          @if (secondaryCtaLabel()) {
            <nxt1-cta-button
              [label]="secondaryCtaLabel()!"
              [route]="secondaryCtaRoute()"
              variant="ghost"
            />
          }
        </div>
      </div>

      <div class="workflow-status" aria-live="polite">
        <span class="workflow-status__pill"
          >Step {{ activeStepNumber() }} of {{ stepCount() }}</span
        >
        <span class="workflow-status__title">{{ activeStepTitle() }}</span>
      </div>

      <div class="workflow-list" role="list" aria-label="Agent X operations workflow">
        @for (step of workflowSteps(); track step.id; let i = $index) {
          <article
            class="workflow-step"
            [class.workflow-step--active]="activeStepIndex() === i"
            [class.workflow-step--visible]="visibleStepIndexes().has(i)"
            [attr.data-step-index]="i"
            role="listitem"
            [attr.aria-label]="'Step ' + (i + 1) + ': ' + step.title"
          >
            <header class="workflow-step__header">
              <span class="workflow-step__index">Step {{ i + 1 }}</span>
              <h3 class="workflow-step__title">{{ step.title }}</h3>
            </header>

            <div class="workflow-column workflow-column--prompt">
              <span class="workflow-column__label">Prompt</span>
              <p class="workflow-column__text">{{ step.prompt }}</p>
            </div>

            <div class="workflow-column workflow-column--result">
              <span class="workflow-column__label">Result</span>
              <p class="workflow-column__text">{{ step.result }}</p>

              <div class="workflow-output" [attr.aria-label]="step.title + ' output preview'">
                @switch (step.outputType) {
                  @case ('highlight-reel') {
                    <div class="output-preview output-preview--highlight">
                      <div class="output-video">
                        <img
                          class="output-video__image"
                          [src]="highlightReelThumbnailSrc"
                          alt="Highlight reel thumbnail"
                        />
                        <span class="output-video__play" aria-hidden="true"></span>
                      </div>
                      <div class="output-timeline" role="list" aria-label="Highlight chapters">
                        <span class="output-chip" role="listitem">Transition Defense</span>
                        <span class="output-chip" role="listitem">Rim Finish</span>
                        <span class="output-chip" role="listitem">On-Ball Stop</span>
                        <span class="output-chip" role="listitem">Assist Creation</span>
                      </div>
                    </div>
                  }

                  @case ('contact-coaches') {
                    <div class="output-preview output-preview--contacts">
                      <div class="output-process" role="list" aria-label="Communications workflow">
                        <div class="output-process__step output-process__step--1" role="listitem">
                          <span class="output-process__state" aria-hidden="true">
                            <span class="output-process__loader"></span>
                            <span class="output-process__check">✓</span>
                          </span>
                          <span>1. Select priority audience</span>
                        </div>
                        <div class="output-process__step output-process__step--2" role="listitem">
                          <span class="output-process__state" aria-hidden="true">
                            <span class="output-process__loader"></span>
                            <span class="output-process__check">✓</span>
                          </span>
                          <span>2. Pull verified context</span>
                        </div>
                        <div class="output-process__step output-process__step--3" role="listitem">
                          <span class="output-process__state" aria-hidden="true">
                            <span class="output-process__loader"></span>
                            <span class="output-process__check">✓</span>
                          </span>
                          <span>3. Generate tailored draft</span>
                        </div>
                        <div class="output-process__step output-process__step--4" role="listitem">
                          <span class="output-process__state" aria-hidden="true">
                            <span class="output-process__loader"></span>
                            <span class="output-process__check">✓</span>
                          </span>
                          <span>4. Queue follow-up sequence</span>
                        </div>
                      </div>
                      <div class="output-email">
                        <p class="output-email__title">Draft Communication</p>
                        <p class="output-email__body">
                          Team, tonight's recap package is ready with key clips, verified stats, and
                          tomorrow's action items. Parent, sponsor, and staff versions are queued
                          with the right context attached.
                        </p>
                      </div>
                    </div>
                  }

                  @case ('recruiting-strategy') {
                    <div class="output-preview output-preview--strategy">
                      <div
                        class="output-board"
                        role="list"
                        aria-label="Weekly operating plan board"
                      >
                        <div class="output-board__col" role="listitem">
                          <span class="output-board__label">Week 1</span>
                          <span class="output-board__item">Morning briefing</span>
                        </div>
                        <div class="output-board__col" role="listitem">
                          <span class="output-board__label">Week 2</span>
                          <span class="output-board__item">Film package</span>
                        </div>
                        <div class="output-board__col" role="listitem">
                          <span class="output-board__label">Week 3</span>
                          <span class="output-board__item">Content queue</span>
                        </div>
                        <div class="output-board__col" role="listitem">
                          <span class="output-board__label">Week 4</span>
                          <span class="output-board__item">Follow-up cadence</span>
                        </div>
                      </div>
                    </div>
                  }

                  @case ('college-match') {
                    <div class="output-preview output-preview--match">
                      <div class="output-table" role="table" aria-label="Priority board matches">
                        <div class="output-row output-row--head" role="row">
                          <span role="columnheader">Program</span>
                          <span role="columnheader">Fit</span>
                          <span role="columnheader">Next Action</span>
                        </div>
                        <div class="output-row" role="row">
                          <span role="cell"
                            ><span class="output-star" aria-hidden="true">★</span> State
                            University</span
                          >
                          <span role="cell">92%</span>
                          <span role="cell">Send Intro</span>
                        </div>
                        <div class="output-row" role="row">
                          <span role="cell"
                            ><span class="output-star" aria-hidden="true">★</span> Great Lakes
                            College</span
                          >
                          <span role="cell">88%</span>
                          <span role="cell">Send Film</span>
                        </div>
                        <div class="output-row" role="row">
                          <span role="cell"
                            ><span class="output-star" aria-hidden="true">★</span> Metro State</span
                          >
                          <span role="cell">84%</span>
                          <span role="cell">Follow Up</span>
                        </div>
                      </div>
                    </div>
                  }
                }
              </div>
            </div>
          </article>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .agent-x-demo {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-spacing-16) var(--nxt1-spacing-4);
      }

      .demo-header-shared {
        margin-bottom: var(--nxt1-spacing-10);
      }

      .demo-header-shared .demo-cta {
        margin-top: var(--nxt1-spacing-6);
      }

      .demo-cta {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
      }

      .workflow-status {
        position: sticky;
        top: var(--nxt1-spacing-3);
        z-index: 2;
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        margin-bottom: var(--nxt1-spacing-6);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 85%, transparent);
        backdrop-filter: blur(8px);
      }

      .workflow-status__pill {
        display: inline-flex;
        align-items: center;
        padding: 0 var(--nxt1-spacing-2);
        min-height: var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .workflow-status__title {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .workflow-list {
        display: grid;
        gap: var(--nxt1-spacing-4);
      }

      .workflow-step {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-3);
        min-height: min(78vh, 700px);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        opacity: 0.72;
        transform: translateY(var(--nxt1-spacing-2));
        transition:
          opacity var(--nxt1-motion-duration-slow) var(--nxt1-motion-easing-standard),
          transform var(--nxt1-motion-duration-slow) var(--nxt1-motion-easing-standard),
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-standard);
      }

      .workflow-step--visible {
        opacity: 1;
        transform: translateY(0);
      }

      .workflow-step--active {
        border-color: var(--nxt1-color-alpha-primary30);
      }

      .workflow-step__header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .workflow-step__index {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: var(--nxt1-spacing-6);
        padding: 0 var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .workflow-step__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: clamp(var(--nxt1-fontSize-lg), 1.9vw, var(--nxt1-fontSize-2xl));
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .workflow-column {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-xl);
        padding: var(--nxt1-spacing-4);
      }

      .workflow-column__label {
        display: inline-flex;
        width: fit-content;
        align-items: center;
        justify-content: center;
        min-height: var(--nxt1-spacing-6);
        padding: 0 var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-xs);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wider);
      }

      .workflow-column--prompt {
        background: color-mix(in srgb, var(--nxt1-color-primary) 7%, var(--nxt1-color-surface-200));
        border: 1px solid var(--nxt1-color-alpha-primary30);
      }

      .workflow-column--prompt .workflow-column__label {
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
      }

      .workflow-column--result {
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-default);
      }

      .workflow-column--result .workflow-column__label {
        background: color-mix(
          in srgb,
          var(--nxt1-color-primary) 20%,
          var(--nxt1-color-surface-100)
        );
        color: var(--nxt1-color-text-primary);
      }

      .workflow-column__text {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        line-height: var(--nxt1-lineHeight-relaxed);
        max-width: 68ch;
      }

      .workflow-output {
        margin-top: var(--nxt1-spacing-1);
      }

      .output-preview {
        display: grid;
        gap: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-3);
      }

      .output-video {
        position: relative;
        overflow: hidden;
        min-height: calc(var(--nxt1-spacing-12) * 3 + var(--nxt1-spacing-4));
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: linear-gradient(
          145deg,
          var(--nxt1-color-alpha-primary10),
          var(--nxt1-color-surface-200)
        );
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .output-video__image {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
      }

      .output-video__play {
        z-index: 1;
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 90%, transparent);
        backdrop-filter: blur(10px);
        position: relative;
      }

      .output-video__play::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 52%;
        transform: translate(-50%, -50%);
        width: 0;
        height: 0;
        border-top: 6px solid transparent;
        border-bottom: 6px solid transparent;
        border-left: 10px solid var(--nxt1-color-primary);
      }

      .output-timeline {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
      }

      .output-chip {
        display: inline-flex;
        align-items: center;
        min-height: var(--nxt1-spacing-6);
        padding: 0 var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-subtle);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .output-process {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .output-process__step {
        position: relative;
        --process-delay: 0ms;
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-md);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .output-process__step--1 {
        --process-delay: 0ms;
      }

      .output-process__step--2 {
        --process-delay: 480ms;
      }

      .output-process__step--3 {
        --process-delay: 960ms;
      }

      .output-process__step--4 {
        --process-delay: 1440ms;
      }

      .output-process__state {
        position: relative;
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .output-process__loader {
        width: var(--nxt1-spacing-3);
        height: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid transparent;
        border-top-color: var(--nxt1-color-primary);
        border-right-color: var(--nxt1-color-primary);
      }

      .output-process__check {
        position: absolute;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        opacity: 0;
        transform: scale(0.8);
      }

      .workflow-step--visible .output-process__step {
        animation: output-process-complete 900ms ease forwards;
        animation-delay: var(--process-delay);
      }

      .workflow-step--visible .output-process__loader {
        animation:
          output-loader-spin 0.8s linear infinite,
          output-loader-hide 900ms ease forwards;
        animation-delay: 0ms, var(--process-delay);
      }

      .workflow-step--visible .output-process__check {
        animation: output-check-in 900ms ease forwards;
        animation-delay: calc(var(--process-delay) + 420ms);
      }

      .output-email {
        border-radius: var(--nxt1-borderRadius-md);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary4);
        padding: var(--nxt1-spacing-3);
      }

      .output-email__title {
        margin: 0 0 var(--nxt1-spacing-1);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      .output-email__body {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .output-board {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--nxt1-spacing-2);
      }

      .output-board__col {
        display: grid;
        gap: var(--nxt1-spacing-1);
        border-radius: var(--nxt1-borderRadius-md);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        padding: var(--nxt1-spacing-2);
      }

      .output-board__label {
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      .output-board__item {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .output-table {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
      }

      .output-row {
        display: grid;
        grid-template-columns: 1.3fr 0.6fr 0.8fr;
        gap: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-md);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
      }

      .output-row span {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .output-star {
        color: var(--nxt1-color-primary);
        margin-right: var(--nxt1-spacing-1);
      }

      .output-row--head {
        background: var(--nxt1-color-alpha-primary4);
        border-color: var(--nxt1-color-alpha-primary30);
      }

      .output-row--head span {
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      @media (min-width: 992px) {
        .workflow-step {
          grid-template-columns: 1fr;
          gap: var(--nxt1-spacing-3);
          padding: var(--nxt1-spacing-5);
        }

        .workflow-column {
          padding: var(--nxt1-spacing-5);
        }

        .output-board {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }

      @media (min-width: 1200px) {
        .workflow-status {
          display: none;
        }

        .workflow-list {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          align-items: start;
          gap: var(--nxt1-spacing-3);
        }

        .workflow-step {
          min-height: auto;
          gap: var(--nxt1-spacing-2);
          padding: var(--nxt1-spacing-3);
          transform: none;
        }

        .workflow-step__title {
          font-size: var(--nxt1-fontSize-xl);
        }

        .workflow-column {
          padding: var(--nxt1-spacing-3);
          gap: var(--nxt1-spacing-2);
        }

        .workflow-column__text {
          font-size: var(--nxt1-fontSize-sm);
        }

        .output-preview {
          padding: var(--nxt1-spacing-2);
          gap: var(--nxt1-spacing-2);
        }

        .output-video {
          min-height: calc(var(--nxt1-spacing-12) * 3);
        }

        .output-video__play {
          width: var(--nxt1-spacing-8);
          height: var(--nxt1-spacing-8);
        }

        .output-board {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .output-row {
          grid-template-columns: 1fr;
          gap: var(--nxt1-spacing-1);
        }
      }

      @media (max-width: 767px) {
        .agent-x-demo {
          padding: var(--nxt1-spacing-12) var(--nxt1-spacing-3);
        }

        .workflow-status {
          width: 100%;
          justify-content: space-between;
        }

        .workflow-step {
          min-height: 0;
        }

        .output-row {
          grid-template-columns: 1fr;
          gap: var(--nxt1-spacing-1);
        }
      }

      @media (max-width: 480px) {
        .agent-x-demo {
          padding: var(--nxt1-spacing-10) var(--nxt1-spacing-2);
        }

        .workflow-column {
          padding: var(--nxt1-spacing-3);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .workflow-step {
          transition: none;
          transform: none;
          opacity: 1;
        }

        .output-process__step,
        .output-process__loader,
        .output-process__check {
          animation: none;
        }

        .output-process__loader {
          opacity: 0;
          animation: none;
        }

        .output-process__check {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes output-loader-spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes output-process-complete {
        0% {
          border-color: var(--nxt1-color-border-subtle);
          background: var(--nxt1-color-surface-200);
        }
        100% {
          border-color: var(--nxt1-color-alpha-primary30);
          background: var(--nxt1-color-alpha-primary4);
        }
      }

      @keyframes output-loader-hide {
        0%,
        50% {
          opacity: 1;
        }
        100% {
          opacity: 0;
        }
      }

      @keyframes output-check-in {
        0%,
        40% {
          opacity: 0;
          transform: scale(0.8);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAgentXDemoComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected readonly highlightReelThumbnailSrc = HIGHLIGHT_REEL_THUMBNAIL_SRC;
  readonly headline = input<string>('See the Command Center Work.');
  readonly subtitle = input<string>(
    'From film and creative to communications and intelligence, Agent X turns one prompt into finished operations.'
  );
  readonly workflowSteps = input<readonly AgentXDemoWorkflowStep[]>(DEFAULT_WORKFLOW);
  readonly primaryCtaLabel = input<string>('Start with Agent X');
  readonly primaryCtaRoute = input<string>('/auth');
  readonly secondaryCtaLabel = input<string>('');
  readonly secondaryCtaRoute = input<string>('/agent-x');

  private readonly _activeStepIndex = signal(0);
  private readonly _visibleStepIndexes = signal(new Set<number>([0]));

  private observer: IntersectionObserver | null = null;

  protected readonly sectionTitleId = `agent-x-demo-${nextDemoId++}`;
  protected readonly activeStepIndex = computed(() => this._activeStepIndex());
  protected readonly visibleStepIndexes = computed(() => this._visibleStepIndexes());
  protected readonly stepCount = computed(() => this.workflowSteps().length || 0);
  protected readonly activeStepNumber = computed(() => this._activeStepIndex() + 1);
  protected readonly activeStepTitle = computed(() => {
    const steps = this.workflowSteps();
    return steps[this._activeStepIndex()]?.title ?? '';
  });

  constructor() {
    afterNextRender({
      write: () => this.setupObserver(),
    });

    this.destroyRef.onDestroy(() => this.cleanupObserver());
  }

  private setupObserver(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const host = this.elementRef.nativeElement;
    const sections = host.querySelectorAll('.workflow-step') as NodeListOf<HTMLElement>;
    if (!sections.length) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        let nextActiveIndex: number | null = null;
        let highestRatio = 0;

        for (const entry of entries) {
          const section = entry.target as HTMLElement;
          const rawIndex = section.dataset['stepIndex'];
          const sectionIndex = rawIndex ? Number(rawIndex) : NaN;
          if (Number.isNaN(sectionIndex)) continue;

          if (entry.isIntersecting) {
            this._visibleStepIndexes.update((current) => {
              const next = new Set(current);
              next.add(sectionIndex);
              return next;
            });

            if (entry.intersectionRatio >= highestRatio) {
              highestRatio = entry.intersectionRatio;
              nextActiveIndex = sectionIndex;
            }
          }
        }

        if (nextActiveIndex !== null) {
          this._activeStepIndex.set(nextActiveIndex);
        }
      },
      {
        threshold: [0.25, 0.5, 0.75],
        rootMargin: '-10% 0px -35% 0px',
      }
    );

    sections.forEach((section: HTMLElement) => this.observer?.observe(section));
  }

  private cleanupObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
