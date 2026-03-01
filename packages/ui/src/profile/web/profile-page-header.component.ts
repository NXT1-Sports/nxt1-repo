/**
 * @fileoverview Gamified Profile Page Header
 *
 * Premium header with:
 * - Back button + Name/Position
 * - Badge shelf (up to 6 earned badges with rarity-glow) on the LEFT
 * - XP progress ring with gamified glow on the RIGHT
 *
 * Design inspired by the /xp dashboard aesthetic — rarity colours,
 * animated ring, subtle pulse glow, legendary shimmer.
 */
import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ProfileUser, PlayerCardData, ProspectTier } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
import { NxtBackButtonComponent } from '../../components/back-button';
import { NxtTooltipDirective, type TooltipConfig } from '../../components/tooltip';

/* ── Local Types ── */

/** Compact badge metadata used only in this header shelf. */
interface HeaderBadge {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  readonly description?: string;
}

/** Maps rarity tier → accent colour for the tooltip title tint. */
const RARITY_ACCENT: Record<HeaderBadge['rarity'], string> = {
  common: '#a0a0a0',
  uncommon: '#4ade80',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#facc15',
};

/* ── Constants ── */

/** XP level tiers with names for ring progress + centre display. */
const XP_LEVELS: ReadonlyArray<{
  readonly level: number;
  readonly name: string;
  readonly min: number;
  readonly max: number;
}> = [
  { level: 1, name: 'ROOKIE', min: 0, max: 999 },
  { level: 2, name: 'STARTER', min: 1_000, max: 2_999 },
  { level: 3, name: 'ALL-STAR', min: 3_000, max: 5_999 },
  { level: 4, name: 'PRO', min: 6_000, max: 9_999 },
  { level: 5, name: 'ELITE', min: 10_000, max: 14_999 },
  { level: 6, name: 'LEGEND', min: 15_000, max: 24_999 },
  { level: 7, name: 'GOAT', min: 25_000, max: Infinity },
];

/** Representative badges shown when real badge data isn't available yet. */
const PLACEHOLDER_BADGES: ReadonlyArray<HeaderBadge> = [
  {
    id: 'profile-pro',
    name: 'Profile Pro',
    icon: 'person',
    rarity: 'rare',
    description: 'Completed your full athlete profile',
  },
  {
    id: 'highlight-star',
    name: 'Highlight Star',
    icon: 'videocam',
    rarity: 'epic',
    description: 'Uploaded 10+ highlight videos',
  },
  {
    id: 'team-player',
    name: 'Team Player',
    icon: 'users',
    rarity: 'uncommon',
    description: 'Joined a team and linked your roster',
  },
  {
    id: 'stat-tracker',
    name: 'Stat Tracker',
    icon: 'barChart',
    rarity: 'common',
    description: 'Logged season stats for the first time',
  },
  {
    id: 'early-adopter',
    name: 'Early Adopter',
    icon: 'rocket',
    rarity: 'rare',
    description: 'One of the first 1,000 athletes on NXT1',
  },
  {
    id: 'on-fire',
    name: 'On Fire',
    icon: 'flame',
    rarity: 'legendary',
    description: 'Achieved a 30-day activity streak',
  },
];

const RING_RADIUS = 40;
/** We use a 270° arc (¾ circle) with a gap at the bottom. */
const ARC_DEGREES = 270;
const ARC_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // full circ ≈ 251.33
const ARC_LENGTH = ARC_CIRCUMFERENCE * (ARC_DEGREES / 360); // visible arc ≈ 188.5

@Component({
  selector: 'nxt1-profile-page-header',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtBackButtonComponent, NxtTooltipDirective],
  template: `
    <header class="mdh" [attr.data-tier]="currentTier()">
      <div class="mdh-row">
        <!-- Back button -->
        <nxt1-back-button
          class="mdh-back"
          size="md"
          variant="ghost"
          ariaLabel="Go back"
          (backClick)="back.emit()"
        />

        <!-- Identity (LEFT side — name only) -->
        <div class="mdh-identity">
          <div class="mdh-name-block">
            <div class="mdh-name-row">
              <span class="mdh-last">{{ fullName() }}</span>
              <button
                type="button"
                class="mdh-follow-btn"
                (click)="follow.emit()"
                aria-label="Follow athlete"
              >
                <nxt1-icon name="plus" [size]="13" />
                Follow
              </button>
            </div>
            @if (subtitleLine()) {
              <div class="mdh-subline">
                <span class="mdh-first">{{ subtitleLine() }}</span>
              </div>
            }
          </div>
        </div>

        <!-- RIGHT side: Badge shelf + XP ring -->
        <div class="mdh-right">
          <!-- Earned Badges (up to 6 orbs) -->
          @if (displayBadges().length > 0) {
            <div class="mdh-badges" aria-label="Earned badges">
              @for (badge of displayBadges(); track badge.id) {
                <div
                  class="mdh-badge"
                  [class]="'mdh-badge mdh-badge--' + badge.rarity"
                  [attr.aria-label]="badge.name + ' badge'"
                  [nxtTooltip]="badgeTooltip(badge)"
                >
                  <nxt1-icon [name]="badge.icon" [size]="13" />
                </div>
              }
              @if (remainingBadgeCount() > 0) {
                <span class="mdh-badge-more">+{{ remainingBadgeCount() }}</span>
              }
            </div>
          }

          <!-- Gamified XP Level Ring -->
          <div class="mdh-xp" [attr.aria-label]="'Level ' + xpLevel() + ' — ' + xpLevelName()">
            <div class="mdh-xp-glow"></div>
            <svg class="mdh-xp-ring" viewBox="0 0 96 96" aria-hidden="true">
              <!-- Dark filled circle background -->
              <circle
                cx="48"
                cy="48"
                r="38"
                fill="var(--nxt1-color-surface-100, var(--nxt1-color-background-secondary, #161616))"
              />
              <!-- Track (dim 270° arc with gap at bottom) -->
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="var(--ring-track)"
                stroke-width="6"
                stroke-linecap="round"
                [attr.stroke-dasharray]="arcLength + ' ' + arcGap"
                transform="rotate(135 48 48)"
              />
              <!-- Progress arc (bright, same 270° base) -->
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="var(--ovr-accent)"
                stroke-width="6"
                stroke-linecap="round"
                [attr.stroke-dasharray]="xpArcDash()"
                transform="rotate(135 48 48)"
                class="mdh-xp-arc"
              />
            </svg>
            <div class="mdh-xp-inner">
              <span class="mdh-xp-lvl">Lv {{ xpLevel() }}</span>
              <span class="mdh-xp-tier">{{ xpLevelName() }}</span>
            </div>
          </div>
        </div>
        <!-- /mdh-right -->
      </div>
    </header>
  `,
  styles: [
    `
      /* ============================================
         HOST
         ============================================ */
      :host {
        display: block;
      }

      /* ============================================
         ROOT
         ============================================ */
      .mdh {
        --ovr-accent: var(--nxt1-color-primary);
        --ovr-glow: var(--nxt1-color-alpha-primary20, rgba(206, 255, 0, 0.2));
        --ring-track: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.06));
        margin-bottom: 0;
      }

      /* Tier-based accent colours */
      .mdh[data-tier='elite'] {
        --ovr-accent: var(--nxt1-color-primary);
        --ovr-glow: var(--nxt1-color-alpha-primary20, rgba(206, 255, 0, 0.2));
      }
      .mdh[data-tier='blue-chip'] {
        --ovr-accent: var(--nxt1-color-feedback-success);
        --ovr-glow: rgba(34, 197, 94, 0.2);
      }
      .mdh[data-tier='starter'] {
        --ovr-accent: var(--nxt1-color-feedback-info);
        --ovr-glow: rgba(59, 130, 246, 0.2);
      }
      .mdh[data-tier='prospect'] {
        --ovr-accent: var(--nxt1-color-feedback-warning);
        --ovr-glow: rgba(245, 158, 11, 0.2);
      }
      .mdh[data-tier='developing'] {
        --ovr-accent: var(--nxt1-color-text-tertiary);
        --ovr-glow: rgba(255, 255, 255, 0.05);
      }
      .mdh[data-tier='unrated'] {
        --ovr-accent: var(--nxt1-color-primary);
        --ovr-glow: var(--nxt1-color-alpha-primary20, rgba(206, 255, 0, 0.2));
      }

      /* ============================================
         ROW LAYOUT
         ============================================ */
      .mdh-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: 0 var(--nxt1-spacing-1);
      }

      .mdh-back {
        flex-shrink: 0;
      }

      /* ============================================
         IDENTITY  (left side — name only)
         ============================================ */
      .mdh-identity {
        flex: 1;
        min-width: 0;
      }

      /* ============================================
         RIGHT GROUP  (badges + XP ring side-by-side)
         ============================================ */
      .mdh-right {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        margin-left: auto;
      }

      .mdh-name-block {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .mdh-name-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        min-width: 0;
      }
      .mdh-subline {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        min-width: 0;
      }
      .mdh-last {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: var(--nxt1-spacing-0-5);
      }
      .mdh-first {
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-normal);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mdh-follow-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex-shrink: 0;
        border: 1.5px solid var(--nxt1-color-primary);
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
        color: var(--nxt1-color-primary);
        border-radius: var(--nxt1-radius-md, 8px);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 13px;
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: 0.01em;
        line-height: 1;
        padding: 7px 16px;
        cursor: pointer;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        transition:
          transform 0.1s ease,
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }
      .mdh-follow-btn:hover {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-bg-primary);
        border-color: var(--nxt1-color-primary);
      }
      .mdh-follow-btn:active {
        transform: scale(0.97);
      }
      .mdh-follow-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      /* ============================================
         BADGE SHELF  (up to 6 rarity-coloured orbs)
         ============================================ */
      .mdh-badges {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
      }

      .mdh-badge {
        width: 30px;
        height: 30px;
        border-radius: var(--nxt1-radius-md, 8px);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1.5px solid transparent;
        position: relative;
        cursor: default;
        transition:
          transform 0.2s ease,
          box-shadow 0.2s ease;
      }
      .mdh-badge:hover {
        transform: translateY(-2px) scale(1.1);
      }

      /* ── Rarity: Common (gray) ── */
      .mdh-badge--common {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.06));
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        color: var(--nxt1-color-text-secondary);
      }

      /* ── Rarity: Uncommon (green / primary) ── */
      .mdh-badge--uncommon {
        background: var(--nxt1-color-alpha-primary10, rgba(206, 255, 0, 0.06));
        border-color: var(--nxt1-color-alpha-primary20, rgba(206, 255, 0, 0.15));
        color: var(--nxt1-color-primary);
      }

      /* ── Rarity: Rare (blue) ── */
      .mdh-badge--rare {
        background: var(--nxt1-color-infoBg, rgba(59, 130, 246, 0.08));
        border-color: var(--nxt1-color-info, #3b82f6);
        color: var(--nxt1-color-info, #3b82f6);
        box-shadow: 0 0 8px rgba(59, 130, 246, 0.15);
      }

      /* ── Rarity: Epic (purple) ── */
      .mdh-badge--epic {
        background: rgba(168, 85, 247, 0.08);
        border-color: rgba(168, 85, 247, 0.55);
        color: #a855f7;
        box-shadow: 0 0 10px rgba(168, 85, 247, 0.2);
      }

      /* ── Rarity: Legendary (gold + shimmer) ── */
      .mdh-badge--legendary {
        background: rgba(255, 215, 0, 0.06);
        border-color: rgba(255, 215, 0, 0.5);
        color: #ffd700;
        box-shadow: 0 0 12px rgba(255, 215, 0, 0.2);
        animation: legendary-shimmer 3s ease-in-out infinite;
      }

      @keyframes legendary-shimmer {
        0%,
        100% {
          box-shadow: 0 0 10px rgba(255, 215, 0, 0.15);
        }
        50% {
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
        }
      }

      /* Overflow indicator (+N) */
      .mdh-badge-more {
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-tertiary);
        padding-left: var(--nxt1-spacing-0-5);
        white-space: nowrap;
      }

      /* ============================================
         XP LEVEL RING  (thick arc, gap at bottom)
         ============================================ */
      .mdh-xp {
        flex-shrink: 0;
        position: relative;
        width: 104px;
        height: 104px;
        padding: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Glow halo behind ring */
      .mdh-xp-glow {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: radial-gradient(circle, var(--ovr-glow) 0%, transparent 65%);
        opacity: 0.6;
        animation: xp-pulse 3s ease-in-out infinite;
        pointer-events: none;
      }

      @keyframes xp-pulse {
        0%,
        100% {
          transform: scale(1);
          opacity: 0.35;
        }
        50% {
          transform: scale(1.08);
          opacity: 0.7;
        }
      }

      /* SVG ring */
      .mdh-xp-ring {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      .mdh-xp-arc {
        transition: stroke-dasharray 1.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        filter: drop-shadow(0 0 4px var(--ovr-accent));
      }

      /* Centre label */
      .mdh-xp-inner {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 1px;
      }

      .mdh-xp-lvl {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl, 20px);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: 1;
        color: var(--nxt1-color-text-primary);
        letter-spacing: -0.02em;
      }

      .mdh-xp-tier {
        font-size: 8px;
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ovr-accent);
        margin-top: 2px;
      }

      /* ============================================
         RESPONSIVE
         ============================================ */
      @media (max-width: 900px) {
        .mdh-last {
          font-size: var(--nxt1-fontSize-xl);
        }
        .mdh-first {
          font-size: var(--nxt1-fontSize-sm);
        }
        .mdh-badges {
          gap: var(--nxt1-spacing-1);
        }
        .mdh-right {
          gap: var(--nxt1-spacing-2);
        }
        .mdh-badge {
          width: 26px;
          height: 26px;
        }
        .mdh-xp {
          width: 88px;
          height: 88px;
          padding: 6px;
        }
        .mdh-xp-lvl {
          font-size: var(--nxt1-fontSize-lg, 18px);
        }
        .mdh-xp-tier {
          font-size: 7px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePageHeaderComponent {
  /* ── Inputs / Outputs ── */
  readonly user = input<ProfileUser | null>(null);
  readonly playerCard = input<PlayerCardData | null>(null);
  readonly showFollowAction = input(false);
  readonly back = output<void>();
  readonly follow = output<void>();

  /** SVG arc measurements exposed for template binding. */
  protected readonly arcLength = ARC_LENGTH;
  protected readonly arcGap = ARC_CIRCUMFERENCE - ARC_LENGTH;

  /* ── Name & Subtitle ── */

  protected readonly fullName = computed(() => {
    const u = this.user();
    if (!u) return '';
    if (u.displayName) return u.displayName.trim();
    const combined = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
    return combined || 'Profile';
  });

  protected readonly subtitleLine = computed(() => {
    const position = this.user()?.primarySport?.position?.trim();
    const jersey = this.user()?.primarySport?.jerseyNumber?.trim();
    if (position && jersey) return `${position} #${jersey}`;
    if (position) return position;
    if (jersey) return `#${jersey}`;
    return '';
  });

  /* ── OVR / XP ── */

  protected readonly hasProspectGrade = computed(() => {
    const grade = this.playerCard()?.prospectGrade;
    return !!(grade && grade.overall > 0);
  });

  private readonly ovrRating = computed(() => {
    const grade = this.playerCard()?.prospectGrade;
    return grade && grade.overall > 0 ? grade.overall : 80;
  });

  /** Safely read a numeric field by name from the user record. */
  private getNumericField(fieldName: string): number | null {
    const raw = (this.user() as unknown as Record<string, unknown> | null)?.[fieldName];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const parsed = Number(raw.replace(/,/g, '').trim());
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  protected readonly xpRating = computed(() => {
    const xpFromUser =
      this.getNumericField('xp') ??
      this.getNumericField('xpPoints') ??
      this.getNumericField('totalXp') ??
      this.getNumericField('xpTotal') ??
      this.getNumericField('xpRating');
    if (xpFromUser !== null && xpFromUser >= 0) return Math.round(xpFromUser);
    return this.ovrRating() * 100;
  });

  /** Current XP level info. */
  private readonly currentXpLevel = computed(() => {
    const xp = this.xpRating();
    return XP_LEVELS.find((l) => xp >= l.min && xp <= l.max) ?? XP_LEVELS[XP_LEVELS.length - 1];
  });

  /** Level number (1-7). */
  protected readonly xpLevel = computed(() => this.currentXpLevel().level);

  /** Level tier name e.g. "ALL-STAR". */
  protected readonly xpLevelName = computed(() => this.currentXpLevel().name);

  /** Formatted XP — compact for large values. */
  protected readonly formattedXpRating = computed(() => {
    const xp = this.xpRating();
    if (xp >= 100_000) return `${Math.round(xp / 1_000)}K`;
    if (xp >= 10_000) return `${(xp / 1_000).toFixed(1)}K`;
    return xp.toLocaleString();
  });

  /**
   * SVG stroke-dasharray for the progress arc.
   * Encodes "filled gap" so the bright arc covers a portion of the 270° track.
   */
  protected readonly xpArcDash = computed(() => {
    const xp = this.xpRating();
    const lvl = this.currentXpLevel();
    const range = lvl.max === Infinity ? 25_000 : lvl.max - lvl.min;
    const progress = Math.min(1, (xp - lvl.min) / range);
    const filled = ARC_LENGTH * progress;
    const remaining = ARC_CIRCUMFERENCE - filled;
    return `${filled} ${remaining}`;
  });

  /* ── Badges ── */

  protected readonly badgesEarned = computed(() => {
    const numericBadges =
      this.getNumericField('badgesEarned') ??
      this.getNumericField('badgeCount') ??
      this.getNumericField('badgesCount');
    if (numericBadges !== null && numericBadges >= 0) return Math.round(numericBadges);

    const badges = (this.user() as unknown as Record<string, unknown> | null)?.['badges'];
    if (Array.isArray(badges)) return badges.length;

    return Math.max(1, Math.round(this.ovrRating() / 6));
  });

  /** Up to 6 badges to display in the header shelf. */
  protected readonly displayBadges = computed((): ReadonlyArray<HeaderBadge> => {
    /* 1. Try real earned-badge objects from user data */
    const userBadges = (this.user() as unknown as Record<string, unknown> | null)?.['earnedBadges'];
    if (Array.isArray(userBadges) && userBadges.length > 0) {
      const VALID_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
      return userBadges.slice(0, 6).map((b: Record<string, unknown>) => ({
        id: String(b['id'] ?? ''),
        name: String(b['name'] ?? 'Badge'),
        icon: String(b['icon'] ?? 'star'),
        rarity: (VALID_RARITIES.includes(String(b['rarity'] ?? ''))
          ? String(b['rarity'])
          : 'common') as HeaderBadge['rarity'],
        description: b['description'] ? String(b['description']) : undefined,
      }));
    }

    /* 2. Fallback: show placeholder badges scaled to badgesEarned count */
    const count = Math.min(this.badgesEarned(), 6);
    return PLACEHOLDER_BADGES.slice(0, count);
  });

  /** How many more badges beyond the displayed 6. */
  protected readonly remainingBadgeCount = computed(() => {
    const total = this.badgesEarned();
    const shown = this.displayBadges().length;
    return Math.max(0, total - shown);
  });

  protected readonly currentTier = computed((): ProspectTier => {
    return this.playerCard()?.prospectGrade?.tier ?? 'unrated';
  });

  /* ── Tooltip Helpers ── */

  /** Builds a rich tooltip config for a badge orb. */
  protected badgeTooltip(badge: HeaderBadge): TooltipConfig {
    const rarityLabel = badge.rarity.charAt(0).toUpperCase() + badge.rarity.slice(1);
    return {
      title: badge.name,
      description: badge.description ?? `${rarityLabel} badge`,
      accent: RARITY_ACCENT[badge.rarity],
      placement: 'bottom',
    };
  }
}
