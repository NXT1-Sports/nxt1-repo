/**
 * @fileoverview 4 Pillars of Recruitment Section
 * @module @nxt1/ui/components/recruitment-pillars-section
 * @version 1.0.0
 *
 * Shared educational/product section that presents the 4 required
 * recruiting proof pillars with an interactive anatomy breakdown.
 *
 * Standards:
 * - 100% design-token driven styling
 * - SSR-safe deterministic state
 * - Semantic HTML for SEO and accessibility
 * - Mobile-first responsive layout
 */

import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { NxtIconComponent } from '../icon';
import { NxtSectionHeaderComponent } from '../section-header';

export interface RecruitmentPillar {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly proofTag: string;
  readonly icon: string;
  readonly summary: string;
}

const DEFAULT_PILLARS: readonly RecruitmentPillar[] = [
  {
    id: 'authenticity',
    title: 'Verified Biometrics Badge',
    category: 'Authenticity',
    proofTag: 'Trust',
    icon: 'shield-checkmark-outline',
    summary:
      'Verified biometrics confirm identity and measurables so coaches trust the profile is real, current, and credible.',
  },
  {
    id: 'capability',
    title: 'Embedded Highlight Reel',
    category: 'Capability',
    proofTag: 'Proof',
    icon: 'play-circle-outline',
    summary:
      'Highlight film demonstrates speed, technique, and in-game decision making in context, not just in static stats.',
  },
  {
    id: 'character',
    title: 'Academic/Transcript Locker',
    category: 'Character',
    proofTag: 'Discipline',
    icon: 'document-text-outline',
    summary:
      'Academic records show consistency and eligibility, signaling long-term discipline beyond athletic performance.',
  },
  {
    id: 'influence',
    title: 'Social Media Feed Integration',
    category: 'Influence',
    proofTag: 'Personality',
    icon: 'people-outline',
    summary:
      'Social footprint provides personality context, leadership tone, and communication style that programs evaluate.',
  },
] as const;

let recruitmentPillarsInstanceCounter = 0;

@Component({
  selector: 'nxt1-recruitment-pillars-section',
  standalone: true,
  imports: [NxtIconComponent, NxtSectionHeaderComponent],
  template: `
    <section class="pillars" [attr.aria-labelledby]="titleId()">
      <div class="pillars__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="The 4 Pillars of Recruitment"
          [headingLevel]="2"
          layout="split"
          contentPosition="start"
          title="Coaches Look for 4 Things."
          accentText=" We Show Them All."
          subtitle="An interactive breakdown of profile anatomy that aligns with how college programs evaluate real prospects."
          support="If you are missing one, you are invisible. We ensure you are complete."
        >
          <article class="pillars-panel" [attr.aria-labelledby]="panelTitleId()">
            <header class="pillars-panel__header">
              <h3 class="pillars-panel__title" [id]="panelTitleId()">Profile Anatomy</h3>
            </header>

            <figure class="profile-anatomy" [attr.aria-label]="anatomyLabel()">
              <figcaption class="sr-only">
                Four recruiting pillars required for complete athlete profile evaluation.
              </figcaption>

              <ul
                class="profile-anatomy__layers"
                role="tablist"
                [attr.aria-label]="selectorLabel()"
              >
                @for (pillar of pillars(); track pillar.id) {
                  <li>
                    <button
                      type="button"
                      class="profile-layer"
                      [class.profile-layer--active]="pillar.id === selectedPillarId()"
                      role="tab"
                      [attr.id]="tabId(pillar.id)"
                      [attr.aria-selected]="pillar.id === selectedPillarId()"
                      [attr.aria-controls]="panelId(pillar.id)"
                      (click)="selectPillar(pillar.id)"
                    >
                      <span class="profile-layer__icon" aria-hidden="true">
                        <nxt1-icon [name]="pillar.icon" size="16" />
                      </span>
                      <span class="profile-layer__content">
                        <span class="profile-layer__category">{{ pillar.category }}</span>
                        <span class="profile-layer__title">{{ pillar.title }}</span>
                      </span>
                      <span class="profile-layer__tag">{{ pillar.proofTag }}</span>
                    </button>
                  </li>
                }
              </ul>
            </figure>

            <section
              class="pillar-detail"
              role="tabpanel"
              [attr.id]="panelId(activePillar().id)"
              [attr.aria-labelledby]="tabId(activePillar().id)"
            >
              <p class="pillar-detail__label">
                {{ activePillar().category }} · {{ activePillar().proofTag }}
              </p>
              <h4 class="pillar-detail__title">{{ activePillar().title }}</h4>
              <p class="pillar-detail__summary">{{ activePillar().summary }}</p>
            </section>
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

      .pillars {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .pillars__shell {
        display: grid;
        gap: var(--nxt1-spacing-7);
      }

      .pillars-panel {
        display: grid;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-sm);
        max-width: var(--nxt1-section-subtitle-max-width);
        justify-self: start;
      }

      .pillars-panel__header {
        display: grid;
        padding: var(--nxt1-spacing-3_5) var(--nxt1-spacing-4) 0;
      }

      .pillars-panel__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .profile-anatomy {
        margin: 0;
        padding: 0 var(--nxt1-spacing-3_5);
      }

      .profile-anatomy__layers {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .profile-layer {
        -webkit-appearance: none;
        appearance: none;
        font: inherit;
        color: inherit;
        width: 100%;
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: var(--nxt1-spacing-2_5);
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid transparent;
        background: var(--nxt1-color-surface-primary, var(--nxt1-color-surface-100));
        transition:
          border-color var(--nxt1-motion-duration-fast, 150ms)
            var(--nxt1-motion-easing-standard, ease),
          box-shadow var(--nxt1-motion-duration-fast, 150ms)
            var(--nxt1-motion-easing-standard, ease),
          background-color var(--nxt1-motion-duration-fast, 150ms)
            var(--nxt1-motion-easing-standard, ease);
        cursor: pointer;
        text-align: left;
      }

      .profile-layer:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .profile-layer--active {
        border-color: transparent;
        background: var(--nxt1-color-alpha-primary6, var(--nxt1-color-alpha-primary4));
        box-shadow: var(--nxt1-shadow-xs, var(--nxt1-shadow-sm));
      }

      .profile-layer__icon {
        width: var(--nxt1-spacing-8);
        height: var(--nxt1-spacing-8);
        border-radius: var(--nxt1-borderRadius-full);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-alpha-primary12, var(--nxt1-color-alpha-primary8));
        color: var(--nxt1-color-primary);
      }

      .profile-layer__content {
        min-width: 0;
        display: grid;
        gap: var(--nxt1-spacing-0_5, var(--nxt1-spacing-0-5));
      }

      .profile-layer__category {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .profile-layer__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .profile-layer__tag {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: var(--nxt1-spacing-5);
        padding: 0 var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary8);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .pillar-detail {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
        margin: 0 var(--nxt1-spacing-3_5) var(--nxt1-spacing-3_5);
        padding: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: linear-gradient(
          to bottom,
          var(--nxt1-color-surface-200),
          var(--nxt1-color-surface-100)
        );
      }

      .pillar-detail__label {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .pillar-detail__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .pillar-detail__summary {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
      }

      @media (prefers-reduced-motion: reduce) {
        .profile-layer {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtRecruitmentPillarsSectionComponent {
  private readonly instanceId = ++recruitmentPillarsInstanceCounter;
  private readonly selected = signal<string>(DEFAULT_PILLARS[0].id);

  readonly items = input<readonly RecruitmentPillar[]>(DEFAULT_PILLARS);
  readonly pillars = computed<readonly RecruitmentPillar[]>(() => {
    const configured = this.items();
    return configured.length > 0 ? configured : DEFAULT_PILLARS;
  });

  readonly titleId = computed(() => `recruitment-pillars-title-${this.instanceId}`);
  readonly panelTitleId = computed(() => `recruitment-pillars-panel-title-${this.instanceId}`);
  readonly anatomyLabel = computed(() => 'Recruitment profile anatomy');
  readonly selectorLabel = computed(() => 'Select a recruiting pillar');
  readonly selectedPillarId = computed(() => this.selected());

  readonly activePillar = computed<RecruitmentPillar>(() => {
    const currentId = this.selected();
    return this.pillars().find((pillar) => pillar.id === currentId) ?? this.pillars()[0];
  });

  constructor() {
    effect(() => {
      const available = this.pillars();
      if (available.some((pillar) => pillar.id === this.selected())) {
        return;
      }
      this.selected.set(available[0].id);
    });
  }

  selectPillar(id: string): void {
    this.selected.set(id);
  }

  tabId(id: string): string {
    return `recruitment-pillars-tab-${this.instanceId}-${id}`;
  }

  panelId(id: string): string {
    return `recruitment-pillars-content-${this.instanceId}-${id}`;
  }
}
