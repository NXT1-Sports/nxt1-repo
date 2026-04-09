/**
 * @fileoverview Agent X Hype Machine Marketing Section
 * @module apps/web/features/marketing/components/agent-x-hype-machine-section
 *
 * Shared section component used on persona landing pages to present
 * Agent X as an AI creative engine for athletes.
 *
 * Standards:
 * - SSR-safe deterministic IDs
 * - 100% design-token driven visuals
 * - Semantic markup for accessibility + SEO
 * - Mobile-first responsive layout
 * - CSS-only motion with prefers-reduced-motion support
 */

import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { NxtIconComponent } from '@nxt1/ui/components/icon';
import { NxtSectionHeaderComponent } from '@nxt1/ui/components/section-header';

type HypeGraphicStyleId = 'gameday' | 'stats' | 'commitment';
type HypeVibeId = 'ice-cold' | 'fire';

interface HypeGraphicStyle {
  readonly id: HypeGraphicStyleId;
  readonly name: string;
  readonly label: string;
  readonly kicker: string;
}

interface HypePreviewSlot {
  readonly id: string;
  readonly label: string;
}

const GRAPHIC_STYLES: readonly HypeGraphicStyle[] = [
  {
    id: 'gameday',
    name: 'Gameday',
    label: 'Pre-Game Impact',
    kicker: 'Tonight • 7:00 PM',
  },
  {
    id: 'stats',
    name: 'Stats',
    label: 'Stats Snapshot',
    kicker: 'Last Night Recap',
  },
  {
    id: 'commitment',
    name: 'Commitment',
    label: 'Big News Moment',
    kicker: 'Offer + Commitment',
  },
] as const;

const PREVIEW_SLOTS: readonly HypePreviewSlot[] = [
  { id: 'hero-graphic', label: 'Hero Graphic Slot' },
  { id: 'story-cut', label: 'Story Cut Slot' },
  { id: 'post-variant', label: 'Post Variant Slot' },
] as const;

let agentXHypeMachineInstanceCounter = 0;

@Component({
  selector: 'nxt1-agent-x-hype-machine-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent, NxtIconComponent],
  template: `
    <section class="hype-machine" [attr.aria-labelledby]="titleId()">
      <nxt1-section-header
        [titleId]="titleId()"
        eyebrow="Agent X"
        [headingLevel]="2"
        title="Your Personal Hype Machine"
        subtitle="Go Viral On Command."
      />

      <article class="hype-studio" [attr.aria-labelledby]="studioTitleId()">
        <header class="hype-studio__header">
          <h3 class="hype-studio__title" [id]="studioTitleId()">Creative Console</h3>
          <p class="hype-studio__status" role="status" aria-live="polite">AI-ready</p>
        </header>

        <section
          class="hype-preview"
          [class.hype-preview--ice]="selectedVibe() === 'ice-cold'"
          [class.hype-preview--fire]="selectedVibe() === 'fire'"
          [attr.aria-label]="previewAriaLabel()"
        >
          <div class="hype-preview__head">
            <span class="hype-preview__chip">{{ selectedStyle().name }}</span>
            <span class="hype-preview__chip hype-preview__chip--vibe">{{
              selectedVibeLabel()
            }}</span>
          </div>

          <div class="hype-preview__slots" role="list" aria-label="Graphic output placeholders">
            @for (slot of previewSlots; track slot.id) {
              <div class="hype-preview__slot" role="listitem">
                <span class="hype-preview__slot-label">{{ slot.label }}</span>
                <div class="hype-preview__slot-frame" aria-hidden="true">
                  <span class="hype-preview__slot-art">
                    <nxt1-icon name="image-outline" size="28" />
                    <span class="hype-preview__slot-placeholder">Placeholder Image</span>
                  </span>
                </div>
              </div>
            }
          </div>
        </section>

        <div class="hype-studio__controls" [attr.aria-labelledby]="vibeTitleId()">
          <div class="hype-studio__control-row">
            <p class="hype-studio__control-title" [id]="vibeTitleId()">Select a Vibe</p>
            <div class="vibe-toggle" role="group" aria-label="Select a visual vibe">
              <button
                type="button"
                class="vibe-toggle__button vibe-toggle__button--ice"
                [class.vibe-toggle__button--selected]="selectedVibe() === 'ice-cold'"
                (click)="setVibe('ice-cold')"
                [attr.aria-pressed]="selectedVibe() === 'ice-cold'"
              >
                Ice Cold
              </button>

              <button
                type="button"
                class="vibe-toggle__button vibe-toggle__button--fire"
                [class.vibe-toggle__button--selected]="selectedVibe() === 'fire'"
                (click)="setVibe('fire')"
                [attr.aria-pressed]="selectedVibe() === 'fire'"
              >
                Fire
              </button>
            </div>
          </div>

          <div
            class="hype-studio__style-grid"
            role="group"
            aria-label="Agent X elite graphic styles"
          >
            @for (style of graphicStyles; track style.id) {
              <button
                type="button"
                class="style-card"
                [class.style-card--active]="isStyleActive(style.id)"
                (click)="setStyle(style.id)"
                [attr.aria-pressed]="isStyleActive(style.id)"
                [attr.aria-label]="'Select ' + style.name + ' style'"
              >
                <span class="style-card__pill">{{ style.name }}</span>
                <span class="style-card__title">{{ style.label }}</span>
                <span class="style-card__kicker">{{ style.kicker }}</span>
              </button>
            }
          </div>

          <p class="hype-studio__closing-copy">
            You don't need a graphic designer. You need Agent X. Turn last night's stats into
            today's content in seconds.
          </p>
        </div>
      </article>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .hype-machine {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        display: grid;
        gap: var(--nxt1-spacing-6);
      }

      .hype-studio {
        display: grid;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-alpha-primary35);
        background: linear-gradient(
          165deg,
          var(--nxt1-color-alpha-primary5),
          var(--nxt1-color-surface-100) 45%,
          var(--nxt1-color-surface-100)
        );
        box-shadow:
          var(--nxt1-shadow-md),
          0 0 0 1px var(--nxt1-color-alpha-primary15);
      }

      .hype-studio__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
      }

      .hype-studio__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .hype-studio__status {
        margin: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary8);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .hype-preview {
        display: grid;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        transition:
          border-color var(--nxt1-duration-base, 200ms) var(--nxt1-ease-standard, ease),
          box-shadow var(--nxt1-duration-base, 200ms) var(--nxt1-ease-standard, ease),
          background var(--nxt1-duration-base, 200ms) var(--nxt1-ease-standard, ease);
      }

      .hype-preview__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2);
      }

      .hype-preview__slots {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--nxt1-spacing-2);
      }

      .hype-preview__slot {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .hype-preview__slot-frame {
        min-height: var(--nxt1-spacing-40);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-alpha-primary35);
        background: linear-gradient(
          145deg,
          var(--nxt1-color-alpha-primary8),
          var(--nxt1-color-surface-100)
        );
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-primary);
      }

      .hype-preview__slot-art {
        display: grid;
        justify-items: center;
        gap: var(--nxt1-spacing-2);
        color: var(--nxt1-color-primary);
      }

      .hype-preview__slot-placeholder {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .hype-preview__slot-label {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .hype-preview__chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary25);
        background: var(--nxt1-color-alpha-primary8);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .hype-preview__chip--vibe {
        border-color: var(--nxt1-color-alpha-primary35);
        color: var(--nxt1-color-primary);
      }

      .hype-studio__controls {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .hype-studio__control-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
      }

      .hype-studio__control-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .vibe-toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .vibe-toggle__button {
        appearance: none;
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3_5);
        cursor: pointer;
        transition:
          border-color var(--nxt1-duration-base, 200ms) var(--nxt1-ease-standard, ease),
          color var(--nxt1-duration-base, 200ms) var(--nxt1-ease-standard, ease),
          background var(--nxt1-duration-base, 200ms) var(--nxt1-ease-standard, ease),
          box-shadow var(--nxt1-duration-base, 200ms) var(--nxt1-ease-standard, ease);
      }

      .vibe-toggle__button:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .vibe-toggle__button--selected.vibe-toggle__button--ice {
        border-color: var(--nxt1-color-info);
        color: var(--nxt1-color-info);
        background: var(--nxt1-color-alpha-primary8);
        box-shadow: 0 0 0 1px var(--nxt1-color-info);
      }

      .vibe-toggle__button--selected.vibe-toggle__button--fire {
        border-color: var(--nxt1-color-warning);
        color: var(--nxt1-color-warning);
        background: var(--nxt1-color-warningBg);
        box-shadow: 0 0 0 1px var(--nxt1-color-warning);
      }

      .hype-studio__style-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--nxt1-spacing-2);
      }

      .style-card {
        appearance: none;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-200);
        color: inherit;
        text-align: left;
        padding: var(--nxt1-spacing-3);
        display: grid;
        gap: var(--nxt1-spacing-1_5);
        cursor: pointer;
        transition:
          transform var(--nxt1-duration-fast, 150ms) var(--nxt1-ease-standard, ease),
          border-color var(--nxt1-duration-base, 200ms) var(--nxt1-ease-standard, ease),
          box-shadow var(--nxt1-duration-base, 200ms) var(--nxt1-ease-standard, ease);
      }

      .style-card:hover {
        transform: translateY(calc(var(--nxt1-spacing-0_5) * -1));
      }

      .style-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .style-card--active {
        border-color: var(--nxt1-color-alpha-primary50);
        background: linear-gradient(
          to bottom,
          var(--nxt1-color-alpha-primary8),
          var(--nxt1-color-surface-200)
        );
        box-shadow: 0 0 0 1px var(--nxt1-color-alpha-primary20);
      }

      .style-card__pill {
        width: fit-content;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .style-card__title {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .style-card__kicker {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .hype-studio__closing-copy {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .hype-preview--ice {
        border-color: var(--nxt1-color-info);
        box-shadow: 0 0 var(--nxt1-spacing-5) var(--nxt1-color-alpha-primary20);
      }

      .hype-preview--fire {
        border-color: var(--nxt1-color-warning);
        background: linear-gradient(
          to bottom,
          var(--nxt1-color-warningBg),
          var(--nxt1-color-surface-200)
        );
        box-shadow: 0 0 var(--nxt1-spacing-5) var(--nxt1-color-warningBg);
      }

      @media (max-width: 767px) {
        .hype-studio {
          padding: var(--nxt1-spacing-3);
        }

        .hype-studio__header {
          align-items: center;
        }

        .hype-studio__style-grid,
        .hype-preview__slots {
          grid-template-columns: 1fr;
        }

        .hype-preview__slot-frame {
          min-height: var(--nxt1-spacing-24);
        }

        .hype-preview {
          padding: var(--nxt1-spacing-3);
        }

        .hype-preview__title {
          font-size: var(--nxt1-fontSize-xl);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .style-card {
          transition: none;
        }

        .style-card:hover {
          transform: none;
        }

        .vibe-toggle__button {
          transition: none;
        }

        .hype-preview {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAgentXHypeMachineSectionComponent {
  protected readonly graphicStyles = GRAPHIC_STYLES;
  protected readonly previewSlots = PREVIEW_SLOTS;

  private readonly _selectedStyleId = signal<HypeGraphicStyleId>('gameday');
  private readonly _selectedVibe = signal<HypeVibeId>('ice-cold');

  private readonly instanceId = ++agentXHypeMachineInstanceCounter;

  protected readonly titleId = computed(() => `agent-x-hype-machine-title-${this.instanceId}`);
  protected readonly studioTitleId = computed(
    () => `agent-x-hype-machine-studio-${this.instanceId}`
  );
  protected readonly vibeTitleId = computed(() => `agent-x-hype-machine-vibe-${this.instanceId}`);

  protected readonly selectedStyle = computed(
    () => GRAPHIC_STYLES.find((style) => style.id === this._selectedStyleId()) ?? GRAPHIC_STYLES[0]
  );

  protected readonly selectedVibe = computed(() => this._selectedVibe());
  protected readonly selectedVibeLabel = computed(() =>
    this._selectedVibe() === 'ice-cold' ? 'Ice Cold' : 'Fire'
  );

  protected readonly previewAriaLabel = computed(
    () => `${this.selectedStyle().name} graphic preview in ${this.selectedVibeLabel()} mode`
  );

  protected isStyleActive(styleId: HypeGraphicStyleId): boolean {
    return this._selectedStyleId() === styleId;
  }

  protected setStyle(styleId: HypeGraphicStyleId): void {
    this._selectedStyleId.set(styleId);
  }

  protected setVibe(vibe: HypeVibeId): void {
    this._selectedVibe.set(vibe);
  }
}
