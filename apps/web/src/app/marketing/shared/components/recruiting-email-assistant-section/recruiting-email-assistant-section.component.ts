/**
 * @fileoverview Recruiting Email Assistant Section
 * @module apps/web/features/marketing/components/recruiting-email-assistant-section
 * @version 1.0.0
 *
 * Shared marketing section for communication training on Agent X surfaces.
 * Highlights a redline correction workflow for coach outreach emails.
 *
 * Standards:
 * - 100% design-token driven styling
 * - SSR-safe deterministic heading IDs
 * - Semantic HTML for SEO (section/article/header/blockquote)
 * - Mobile-first responsive layout
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '@nxt1/ui/components/section-header';

export interface RecruitingEmailAssistantDraft {
  /** Stable unique id for list tracking. */
  readonly id: string;
  /** Label for the draft actor. */
  readonly authorLabel: string;
  /** Message content shown in the redline mock conversation. */
  readonly message: string;
  /** Visual tone in UI bubble. */
  readonly tone: 'draft' | 'correction';
}

const DEFAULT_RECRUITING_EMAIL_DRAFTS: readonly RecruitingEmailAssistantDraft[] = [
  {
    id: 'draft-athlete',
    authorLabel: 'User Draft',
    message: 'Hey coach I want an offer.',
    tone: 'draft',
  },
  {
    id: 'draft-agent-x-correction',
    authorLabel: 'Agent X Correction',
    message:
      "Let's make this professional: 'Coach [Name], I've been following your program's defensive scheme and believe my skills at [Position] would be a great fit...'",
    tone: 'correction',
  },
] as const;

let recruitingEmailAssistantInstanceCounter = 0;

@Component({
  selector: 'nxt1-recruiting-email-assistant-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="email-assistant" [attr.aria-labelledby]="titleId()">
      <div class="email-assistant__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Communication Training"
          [headingLevel]="2"
          variant="hero"
          layout="split"
          contentPosition="start"
          title="Never Send a Bad Email Again."
          subtitle="Social skills training for young athletes with professional coach-outreach guidance."
          support="Agent X redlines weak drafts into recruiter-ready communication that earns responses."
        >
          <article class="email-assistant__panel" [attr.aria-labelledby]="panelTitleId()">
            <header class="email-assistant__panel-header">
              <p class="email-assistant__eyebrow">Recruiting Email Assistant</p>
              <h3 class="email-assistant__panel-title" [id]="panelTitleId()">
                Real-time Redline View
              </h3>
            </header>

            <div
              class="email-assistant__chat"
              role="list"
              aria-label="Recruiting email correction example"
            >
              @for (entry of drafts(); track entry.id) {
                <article
                  class="email-entry"
                  role="listitem"
                  [class.email-entry--draft]="entry.tone === 'draft'"
                  [class.email-entry--correction]="entry.tone === 'correction'"
                >
                  <p class="email-entry__label">{{ entry.authorLabel }}</p>
                  <p class="email-entry__message">{{ entry.message }}</p>
                </article>
              }
            </div>

            <aside class="email-assistant__reason" [attr.aria-labelledby]="reasonTitleId()">
              <h4 class="email-assistant__reason-title" [id]="reasonTitleId()">Why this matters</h4>
              <blockquote class="email-assistant__reason-copy">
                Solves the #1 complaint from college coaches: poor athlete communication.
              </blockquote>
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

      .email-assistant {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .email-assistant__shell {
        display: grid;
        gap: var(--nxt1-spacing-7);
      }

      .email-assistant__panel {
        display: grid;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .email-assistant__panel-header {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .email-assistant__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .email-assistant__panel-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .email-assistant__chat {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .email-entry {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .email-entry__label {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .email-entry__message {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .email-entry--draft {
        background: var(--nxt1-color-surface-200);
      }

      .email-entry--draft .email-entry__label {
        color: var(--nxt1-color-text-tertiary);
      }

      .email-entry--draft .email-entry__message {
        color: var(--nxt1-color-text-secondary);
      }

      .email-entry--correction {
        border-color: var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary4);
      }

      .email-entry--correction .email-entry__label {
        color: var(--nxt1-color-primary);
      }

      .email-entry--correction .email-entry__message {
        color: var(--nxt1-color-text-primary);
      }

      .email-assistant__reason {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .email-assistant__reason-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .email-assistant__reason-copy {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      @media (min-width: 992px) {
        .email-assistant__panel {
          grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
          column-gap: var(--nxt1-spacing-5);
          align-items: start;
        }

        .email-assistant__panel-header,
        .email-assistant__chat {
          grid-column: 1;
        }

        .email-assistant__reason {
          grid-column: 2;
          grid-row: 1 / span 2;
          position: sticky;
          top: var(--nxt1-spacing-6);
        }
      }

      @media (max-width: 767px) {
        .email-assistant__panel {
          padding: var(--nxt1-spacing-5);
        }

        .email-assistant__panel-title {
          font-size: var(--nxt1-fontSize-lg);
        }

        .email-entry__message {
          font-size: var(--nxt1-fontSize-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtRecruitingEmailAssistantSectionComponent {
  private readonly instanceId = ++recruitingEmailAssistantInstanceCounter;

  readonly titleId = computed(() => `recruiting-email-assistant-title-${this.instanceId}`);
  readonly panelTitleId = computed(
    () => `recruiting-email-assistant-panel-title-${this.instanceId}`
  );
  readonly reasonTitleId = computed(
    () => `recruiting-email-assistant-reason-title-${this.instanceId}`
  );

  readonly drafts = input<readonly RecruitingEmailAssistantDraft[]>(
    DEFAULT_RECRUITING_EMAIL_DRAFTS
  );
}
