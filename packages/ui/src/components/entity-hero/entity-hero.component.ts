/**
 * @fileoverview NxtEntityHeroComponent — Shared Entity Hero Card
 * @module @nxt1/ui/components/entity-hero
 * @version 1.0.0
 *
 * Shared identity card used directly above the option scroller
 * on both the /profile and /team pages.
 *
 * Replaces the ad-hoc identity blocks in:
 *   - ProfileMobileHeroComponent (identity column)
 *   - TeamShellComponent (team-header div)
 *
 * Design: dark NXT1 Madden-style — consistent across all entity pages.
 *
 * ⭐ SHARED BETWEEN /profile AND /team ⭐
 *
 * @example
 * ```html
 * <!-- Athlete profile -->
 * <nxt1-entity-hero
 *   [name]="'John Doe'"
 *   [subtitle]="'RB #22'"
 *   [avatarSrc]="user.profileImg"
 *   [metaItems]="[{ key: 'Class', value: '2029' }, { key: 'Location', value: 'Austin, TX' }]"
 *   [isVerified]="true"
 *   actionLabel="Message"
 *   actionIcon="chatbubble-outline"
 *   (actionClick)="onMessage()"
 * />
 *
 * <!-- Team -->
 * <nxt1-entity-hero
 *   [name]="team.teamName"
 *   [subtitle]="team.sport"
 *   [logoSrc]="team.logoUrl"
 *   [metaItems]="[{ key: 'Location', value: team.location }, { key: 'Record', value: team.record }]"
 * />
 * ```
 */
import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { NxtAvatarComponent } from '../avatar';
import { NxtImageComponent } from '../image';
import { NxtIconComponent } from '../icon';
import type { AvatarShape } from '../avatar/avatar.types';

export interface EntityHeroMetaItem {
  readonly key: string;
  readonly value: string;
}

@Component({
  selector: 'nxt1-entity-hero',
  standalone: true,
  imports: [NxtAvatarComponent, NxtImageComponent, NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="eh">
      <!-- ── Avatar / Logo ── -->
      <div class="eh__media">
        @if (logoSrc()) {
          <div class="eh__logo-wrap">
            <nxt1-image
              [src]="logoSrc()!"
              [alt]="name() + ' logo'"
              [width]="64"
              [height]="64"
              variant="avatar"
              fit="contain"
              [showPlaceholder]="false"
            />
          </div>
        } @else {
          <div class="eh__avatar-ring" [style.--eh-avatar-radius]="avatarRadius()">
            <nxt1-avatar
              [src]="avatarSrc() ?? null"
              [name]="name()"
              size="xl"
              [shape]="avatarShape()"
            />
          </div>
        }
      </div>

      <!-- ── Identity ── -->
      <div class="eh__body">
        <!-- Name + verified -->
        <div class="eh__name-row">
          <h1 class="eh__name">{{ name() }}</h1>
          @if (isVerified()) {
            <nxt1-icon name="checkmarkCircle" [size]="16" class="eh__verified" />
          }
        </div>

        <!-- Position badge + CTA -->
        <div class="eh__badge-row">
          @if (subtitle()) {
            <span class="eh__position-chip">{{ subtitle() }}</span>
          }
          @if (actionLabel()) {
            <button
              type="button"
              class="eh__cta"
              [attr.aria-label]="actionLabel()"
              (click)="actionClick.emit()"
            >
              @if (actionIcon()) {
                <nxt1-icon [name]="actionIcon()" [size]="12" />
              }
              {{ actionLabel() }}
            </button>
          }
        </div>

        <!-- Meta chips (Class, Location, etc.) -->
        @if (metaItems().length > 0) {
          <div class="eh__chips">
            @for (item of metaItems(); track item.key) {
              <span class="eh__chip">
                <span class="eh__chip-key">{{ item.key }}</span>
                <span class="eh__chip-val">{{ item.value }}</span>
              </span>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', ui-sans-serif, system-ui, sans-serif);
        --eh-text: var(--nxt1-color-text-primary, #ffffff);
        --eh-text-2: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --eh-text-3: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --eh-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --eh-border-2: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        --eh-surface: var(--nxt1-glass-bg, rgba(22, 22, 22, 0.88));
        --eh-accent: var(--team-accent, var(--nxt1-color-primary, #ccff00));
      }

      /* ═══ ROOT FLEX ROW ═══ */
      .eh {
        display: flex;
        gap: 14px;
        align-items: center;
        padding: 6px 0 12px;
      }

      /* ═══ MEDIA ═══ */
      .eh__media {
        flex-shrink: 0;
      }

      .eh__avatar-ring {
        display: inline-flex;
        line-height: 0;
        border-radius: var(--eh-avatar-radius, 16px);
        /* Accent ring following exact avatar shape — no transparency bleed */
        box-shadow:
          0 0 0 2px color-mix(in srgb, var(--eh-accent) 70%, transparent),
          0 0 12px 0 color-mix(in srgb, var(--eh-accent) 25%, transparent);
      }

      .eh__logo-wrap {
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 14px;
        background: var(--nxt1-color-bg-tertiary, #1a1a1a);
        border: 1px solid var(--eh-border);
        overflow: hidden;
      }

      /* ═══ BODY ═══ */
      .eh__body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      /* Name row */
      .eh__name-row {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      .eh__name {
        margin: 0;
        font-size: var(--nxt1-fontSize-xl, 1.5rem);
        font-weight: 800;
        line-height: 1.08;
        letter-spacing: -0.02em;
        color: var(--eh-text);
        word-break: break-word;
        overflow-wrap: break-word;
      }

      .eh__verified {
        color: var(--eh-accent);
        flex-shrink: 0;
        filter: drop-shadow(0 0 4px color-mix(in srgb, var(--eh-accent) 60%, transparent));
      }

      /* Badge row: position chip + CTA */
      .eh__badge-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .eh__position-chip {
        display: inline-flex;
        align-items: center;
        height: 22px;
        padding: 0 9px;
        border-radius: 6px;
        background: color-mix(in srgb, var(--eh-accent) 15%, transparent);
        border: 1px solid color-mix(in srgb, var(--eh-accent) 35%, transparent);
        color: var(--eh-accent);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        line-height: 1;
      }

      .eh__cta {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 22px;
        padding: 0 10px;
        border-radius: 6px;
        border: 1px solid var(--eh-border-2);
        background: var(--nxt1-color-bg-tertiary, #1a1a1a);
        color: var(--eh-text-2);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        letter-spacing: 0.02em;
        cursor: pointer;
        transition:
          border-color 120ms,
          background 120ms;
      }

      .eh__cta:active {
        background: var(--nxt1-color-bg-elevated, #1e1e1e);
        transform: scale(0.97);
      }

      /* ═══ META CHIPS ═══ */
      .eh__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 2px;
      }

      .eh__chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px 4px 8px;
        border-radius: 99px;
        background: var(--nxt1-color-bg-tertiary, #1a1a1a);
        border: 1px solid var(--eh-border);
        backdrop-filter: var(--nxt1-glass-backdrop, blur(20px));
        white-space: nowrap;
      }

      .eh__chip-key {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--eh-text-3);
        line-height: 1;
      }

      .eh__chip-val {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--eh-text);
        line-height: 1;
      }
    `,
  ],
})
export class NxtEntityHeroComponent {
  /** Primary display name — required */
  readonly name = input.required<string>();

  /** Secondary line: position + jersey (profile) or sport (team) */
  readonly subtitle = input<string>('');

  /** Profile avatar image URL (shown as circle when no logoSrc) */
  readonly avatarSrc = input<string | null | undefined>(undefined);

  /** Team logo URL (shown as rounded square; takes precedence over avatarSrc) */
  readonly logoSrc = input<string | null | undefined>(undefined);

  /** Key-value meta rows (Class, Location, Record, …) */
  readonly metaItems = input<EntityHeroMetaItem[]>([]);

  /** Show a verified checkmark next to the name */
  readonly isVerified = input(false);

  /** Label for optional CTA button (e.g. "Message", "Follow") — hidden when empty */
  readonly actionLabel = input<string>('');

  /** Icon name for the CTA button */
  readonly actionIcon = input<string>('');

  /** Shape of the avatar: 'circle' | 'rounded' | 'square'. Defaults to 'rounded'. */
  readonly avatarShape = input<AvatarShape>('rounded');

  /** Computed border-radius string to match the avatar shape on the ring */
  protected readonly avatarRadius = computed(() => {
    const shape = this.avatarShape();
    // xl avatar = 80px; mirror the avatar.component.ts shape formulas
    if (shape === 'circle') return '50%';
    if (shape === 'rounded') return '16px'; // 80 * 0.2
    return '6px'; // square: 80 * 0.08 ≈ 6px
  });

  /** Emitted when the CTA action button is clicked */
  readonly actionClick = output<void>();
}
