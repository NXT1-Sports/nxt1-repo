/**
 * @fileoverview Recruiting Radar Section
 * @module @nxt1/ui/components/recruiting-radar-section
 * @version 1.0.0
 *
 * Shared marketing section that frames recruiting engagement as
 * a real-time notification center for athletes.
 *
 * Standards:
 * - SSR-safe deterministic IDs
 * - 100% design-token driven visual styles
 * - Semantic HTML for SEO and accessibility
 * - Mobile-first responsive layout for web + mobile surfaces
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtIconComponent } from '../icon';
import { NxtSectionHeaderComponent } from '../section-header';

export interface RecruitingRadarEvent {
  readonly id: string;
  readonly icon: string;
  readonly message: string;
  readonly timestamp: string;
  readonly detail: string;
  readonly unread: boolean;
}

const DEFAULT_RADAR_EVENTS: readonly RecruitingRadarEvent[] = [
  {
    id: 'radar-university-viewed-profile',
    icon: 'eye-outline',
    message: 'University of Michigan viewed your profile.',
    timestamp: '2 min ago',
    detail: 'Recruiting activity · Profile view',
    unread: true,
  },
  {
    id: 'radar-coach-downloaded-transcript',
    icon: 'download-outline',
    message: 'Coach Smith downloaded your transcript.',
    timestamp: '9 min ago',
    detail: 'Academics · Transcript downloaded',
    unread: true,
  },
  {
    id: 'radar-program-return-visit',
    icon: 'time-outline',
    message: 'A Power 5 program returned to your highlights.',
    timestamp: '15 min ago',
    detail: 'Highlights · Return visit',
    unread: false,
  },
] as const;

let recruitingRadarInstanceCounter = 0;

@Component({
  selector: 'nxt1-recruiting-radar-section',
  standalone: true,
  imports: [NxtIconComponent, NxtSectionHeaderComponent],
  template: `
    <section class="recruiting-radar" [attr.aria-labelledby]="titleId()">
      <div class="recruiting-radar__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Recruiting Radar"
          eyebrowIcon="notifications-outline"
          [headingLevel]="2"
          layout="split"
          contentPosition="start"
          title="See Who's Watching."
          subtitle="Stop guessing. Know exactly which schools are interested so you can focus your energy."
          support="The read receipt for your career."
        >
          <article class="radar-center" [attr.aria-labelledby]="panelTitleId()">
            <header class="radar-center__header">
              <div class="radar-center__title-wrap">
                <p class="radar-center__eyebrow">Activity Feed</p>
                <h3 class="radar-center__title" [id]="panelTitleId()">Live Recruiting Signals</h3>
              </div>

              <div class="radar-center__status" role="status" aria-live="polite">
                <span class="radar-center__status-dot" aria-hidden="true"></span>
                <span>Live</span>
              </div>
            </header>

            <ul class="radar-feed" role="list" aria-label="Recent recruiting radar events">
              @for (event of events(); track event.id) {
                <li class="radar-event" role="listitem" [class.radar-event--unread]="event.unread">
                  <span class="radar-event__visual" aria-hidden="true">
                    <span class="radar-event__icon-circle">
                      <nxt1-icon [name]="event.icon" size="16" />
                    </span>
                  </span>

                  <div class="radar-event__content">
                    <div class="radar-event__header">
                      <p class="radar-event__message">{{ event.message }}</p>
                      <p class="radar-event__time">{{ event.timestamp }}</p>
                    </div>
                    <p class="radar-event__detail">{{ event.detail }}</p>
                  </div>

                  <div class="radar-event__trailing" aria-hidden="true">
                    @if (event.unread) {
                      <span class="radar-event__unread-dot"></span>
                    }
                    <nxt1-icon name="chevron-forward" size="16" />
                  </div>
                </li>
              }
            </ul>

            <aside class="radar-concept" [attr.aria-labelledby]="conceptTitleId()">
              <h4 class="radar-concept__title" [id]="conceptTitleId()">Concept</h4>
              <p class="radar-concept__copy">The read receipt for your career.</p>
            </aside>
          </article>
        </nxt1-section-header>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .recruiting-radar {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .recruiting-radar__shell {
        display: grid;
        gap: var(--nxt1-spacing-7);
      }

      .radar-center {
        display: grid;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-alpha-primary35);
        background: var(--nxt1-color-surface-100);
        box-shadow:
          var(--nxt1-shadow-md),
          0 0 0 1px var(--nxt1-color-alpha-primary15);
      }

      .radar-center__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-4) 0;
      }

      .radar-center__title-wrap {
        display: grid;
        gap: var(--nxt1-spacing-1);
      }

      .radar-center__eyebrow {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .radar-center__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .radar-center__status {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-success40, var(--nxt1-color-alpha-primary30));
        background: var(--nxt1-color-alpha-success8, var(--nxt1-color-alpha-primary8));
        color: var(--nxt1-color-success-600, var(--nxt1-color-primary));
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .radar-center__status-dot {
        width: var(--nxt1-spacing-1_5);
        height: var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-borderRadius-full);
        background: currentColor;
      }

      .radar-feed {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 0;
        border-top: 1px solid var(--nxt1-color-border-subtle);
      }

      .radar-event {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3_5) var(--nxt1-spacing-4);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-primary, var(--nxt1-color-surface-100));
      }

      .radar-event:last-child {
        border-bottom: none;
      }

      .radar-event--unread {
        background: var(--nxt1-color-alpha-primary6, var(--nxt1-color-alpha-primary4));
      }

      .radar-event__visual {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .radar-event__icon-circle {
        width: var(--nxt1-spacing-11);
        height: var(--nxt1-spacing-11);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary12, var(--nxt1-color-alpha-primary8));
        color: var(--nxt1-color-primary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .radar-event__content {
        flex: 1;
        min-width: 0;
        display: grid;
        gap: var(--nxt1-spacing-1);
      }

      .radar-event__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2);
      }

      .radar-event__message {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .radar-event__time {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
        white-space: nowrap;
      }

      .radar-event__detail {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .radar-event__trailing {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        color: var(--nxt1-color-text-tertiary);
      }

      .radar-event__unread-dot {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        flex-shrink: 0;
      }

      .radar-concept {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-4);
        margin: 0 var(--nxt1-spacing-4) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: linear-gradient(
          to bottom,
          var(--nxt1-color-surface-200),
          var(--nxt1-color-surface-100)
        );
      }

      .radar-concept__title {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .radar-concept__copy {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
        letter-spacing: var(--nxt1-letterSpacing-tight);
      }

      @media (max-width: 767px) {
        .radar-center {
          padding: var(--nxt1-spacing-2);
        }

        .radar-center__header {
          align-items: start;
          flex-direction: column;
        }

        .radar-center__title {
          font-size: var(--nxt1-fontSize-lg);
        }

        .radar-concept__copy {
          font-size: var(--nxt1-fontSize-base);
        }

        .radar-event {
          padding: var(--nxt1-spacing-3) var(--nxt1-spacing-3_5);
        }

        .radar-event__message {
          font-size: var(--nxt1-fontSize-sm);
        }

        .radar-event__detail {
          font-size: var(--nxt1-fontSize-xs);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtRecruitingRadarSectionComponent {
  private readonly instanceId = ++recruitingRadarInstanceCounter;

  readonly titleId = computed(() => `recruiting-radar-title-${this.instanceId}`);
  readonly panelTitleId = computed(() => `recruiting-radar-panel-title-${this.instanceId}`);
  readonly conceptTitleId = computed(() => `recruiting-radar-concept-title-${this.instanceId}`);

  readonly events = input<readonly RecruitingRadarEvent[]>(DEFAULT_RADAR_EVENTS);
}
