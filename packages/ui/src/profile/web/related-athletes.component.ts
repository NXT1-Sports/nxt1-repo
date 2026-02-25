/**
 * @fileoverview Related Athletes Section - Web
 * @module @nxt1/ui/profile/web
 * @version 1.0.0
 *
 * Horizontally scrollable row of related athlete cards.
 * Shown below the main profile content to drive discovery.
 *
 * ⭐ 100% SSR-safe, fully responsive, Grade A+ design ⭐
 *
 * Matches athletes by:
 * - Same sport & position
 * - Same graduation class
 * - Same state / region
 * - Similar recruiting profile
 *
 * Design: Inspired by Spotify "Fans also like", YouTube "Related channels",
 * and ESPN "Similar Players" patterns — glass-morphism cards with hover lift.
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';

// ============================================
// TYPES
// ============================================

export interface RelatedAthlete {
  readonly id: string;
  readonly unicode: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly profileImg: string | null;
  readonly sport: string;
  readonly position: string;
  readonly classYear: string;
  readonly school: string;
  readonly state: string;
  readonly isVerified: boolean;
  readonly matchReason: string;
}

// ============================================
// MOCK DATA
// ============================================

const MOCK_RELATED_ATHLETES: readonly RelatedAthlete[] = [
  {
    id: 'rel-001',
    unicode: 'jayden-williams-2026',
    firstName: 'Jayden',
    lastName: 'Williams',
    profileImg: 'https://i.pravatar.cc/300?img=11',
    sport: 'Football',
    position: 'Quarterback',
    classYear: '2026',
    school: 'Lake Travis HS',
    state: 'TX',
    isVerified: true,
    matchReason: 'Same position',
  },
  {
    id: 'rel-002',
    unicode: 'devon-carter-2026',
    firstName: 'Devon',
    lastName: 'Carter',
    profileImg: 'https://i.pravatar.cc/300?img=12',
    sport: 'Football',
    position: 'Wide Receiver',
    classYear: '2026',
    school: 'Westlake HS',
    state: 'TX',
    isVerified: false,
    matchReason: 'Same school district',
  },
  {
    id: 'rel-003',
    unicode: 'tre-jackson-2026',
    firstName: 'Tre',
    lastName: 'Jackson',
    profileImg: 'https://i.pravatar.cc/300?img=53',
    sport: 'Football',
    position: 'Quarterback',
    classYear: '2026',
    school: 'Allen HS',
    state: 'TX',
    isVerified: true,
    matchReason: 'Same position',
  },
  {
    id: 'rel-004',
    unicode: 'caleb-harris-2026',
    firstName: 'Caleb',
    lastName: 'Harris',
    profileImg: 'https://i.pravatar.cc/300?img=14',
    sport: 'Football',
    position: 'Running Back',
    classYear: '2026',
    school: 'Katy HS',
    state: 'TX',
    isVerified: false,
    matchReason: 'Same class year',
  },
  {
    id: 'rel-005',
    unicode: 'malik-thompson-2026',
    firstName: 'Malik',
    lastName: 'Thompson',
    profileImg: 'https://i.pravatar.cc/300?img=15',
    sport: 'Football',
    position: 'Quarterback',
    classYear: '2026',
    school: 'North Shore HS',
    state: 'TX',
    isVerified: true,
    matchReason: 'Same position',
  },
  {
    id: 'rel-006',
    unicode: 'isaiah-brooks-2026',
    firstName: 'Isaiah',
    lastName: 'Brooks',
    profileImg: 'https://i.pravatar.cc/300?img=57',
    sport: 'Football',
    position: 'Safety',
    classYear: '2026',
    school: 'Cedar Hill HS',
    state: 'TX',
    isVerified: false,
    matchReason: 'Same region',
  },
  {
    id: 'rel-007',
    unicode: 'jordan-davis-2027',
    firstName: 'Jordan',
    lastName: 'Davis',
    profileImg: 'https://i.pravatar.cc/300?img=60',
    sport: 'Football',
    position: 'Quarterback',
    classYear: '2027',
    school: 'Southlake Carroll HS',
    state: 'TX',
    isVerified: true,
    matchReason: 'Same position',
  },
  {
    id: 'rel-008',
    unicode: 'aiden-martinez-2026',
    firstName: 'Aiden',
    lastName: 'Martinez',
    profileImg: 'https://i.pravatar.cc/300?img=52',
    sport: 'Football',
    position: 'Linebacker',
    classYear: '2026',
    school: 'DeSoto HS',
    state: 'TX',
    isVerified: false,
    matchReason: 'Same class year',
  },
] as const;

@Component({
  selector: 'nxt1-related-athletes',
  standalone: true,
  imports: [NxtIconComponent, NxtImageComponent],
  template: `
    <section class="related-section" aria-labelledby="related-heading">
      <!-- Section Header -->
      <div class="related-header">
        <div class="related-header-left">
          <div class="related-header-icon" aria-hidden="true">
            <nxt1-icon name="people" [size]="18" />
          </div>
          <div class="related-header-text">
            <h2 id="related-heading" class="related-title">Related Athletes</h2>
            <p class="related-subtitle">{{ subtitle() }}</p>
          </div>
        </div>
        @if (athletes().length > 4) {
          <button
            type="button"
            class="related-see-all-btn"
            aria-label="See all related athletes"
            (click)="seeAllClick.emit()"
          >
            See All
            <nxt1-icon name="chevronForward" [size]="14" />
          </button>
        }
      </div>

      <!-- Scroll Container -->
      <div class="related-scroll-wrapper" role="list" aria-label="Related athletes">
        <div class="related-scroll-track">
          @for (athlete of athletes(); track athlete.id) {
            <article
              class="related-card"
              role="listitem"
              tabindex="0"
              [attr.aria-label]="
                athlete.firstName +
                ' ' +
                athlete.lastName +
                ', ' +
                athlete.position +
                ' at ' +
                athlete.school
              "
              (click)="onAthleteClick(athlete)"
              (keydown.enter)="onAthleteClick(athlete)"
              (keydown.space)="onAthleteClick(athlete); $event.preventDefault()"
            >
              <!-- Avatar -->
              <div class="related-card-avatar-wrap">
                @if (athlete.profileImg) {
                  <nxt1-image
                    class="related-card-avatar"
                    [src]="athlete.profileImg"
                    [alt]="athlete.firstName + ' ' + athlete.lastName"
                    [width]="48"
                    [height]="48"
                    variant="avatar"
                    fit="cover"
                    [showPlaceholder]="false"
                  />
                } @else {
                  <div class="related-card-avatar-fallback" aria-hidden="true">
                    {{ athlete.firstName.charAt(0) }}{{ athlete.lastName.charAt(0) }}
                  </div>
                }
                @if (athlete.isVerified) {
                  <span class="related-card-verified" aria-label="Verified athlete">
                    <nxt1-icon name="checkmark-circle" [size]="14" />
                  </span>
                }
              </div>

              <!-- Info -->
              <div class="related-card-info">
                <h3 class="related-card-name">{{ athlete.firstName }} {{ athlete.lastName }}</h3>
                <span class="related-card-position">{{ athlete.position }}</span>
                <span class="related-card-school">{{ athlete.school }}</span>
                <div class="related-card-meta">
                  <span class="related-card-class">Class of {{ athlete.classYear }}</span>
                  <span class="related-card-dot" aria-hidden="true">·</span>
                  <span class="related-card-state">{{ athlete.state }}</span>
                </div>
              </div>

              <!-- Match Reason Tag -->
              <div class="related-card-tag">
                <nxt1-icon name="flash" [size]="10" />
                <span>{{ athlete.matchReason }}</span>
              </div>
            </article>
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════════════════════
         RELATED ATHLETES — Full-width discovery section
         Horizontal scroll track with glass-morphism cards
         ═══════════════════════════════════════════════════════════ */

      :host {
        display: block;
        width: 100%;
        contain: layout style;
      }

      /* ─── SECTION WRAPPER ─── */
      .related-section {
        position: relative;
        padding: 20px 0 24px;
        border-top: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.06));
      }

      /* ─── HEADER ROW ─── */
      .related-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px 16px 12px;
        gap: 12px;
      }

      .related-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .related-header-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: linear-gradient(
          135deg,
          rgba(212, 255, 0, 0.12) 0%,
          rgba(212, 255, 0, 0.04) 100%
        );
        color: var(--nxt1-color-primary, #d4ff00);
        flex-shrink: 0;
      }

      .related-header-text {
        min-width: 0;
      }

      .related-title {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 16px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        margin: 0;
        line-height: 1.2;
        letter-spacing: 0.02em;
      }

      .related-subtitle {
        font-size: 12px;
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        margin: 2px 0 0;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .related-see-all-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px 6px 14px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        border-radius: 999px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .related-see-all-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        border-color: var(--nxt1-color-primary, #d4ff00);
        color: var(--nxt1-color-primary, #d4ff00);
      }

      /* ─── SCROLL CONTAINER ─── */
      .related-scroll-wrapper {
        position: relative;
        width: 100%;
        overflow: hidden;
        /* Left indent aligns cards with Sport Profiles sidebar label.
           Applied on the non-scrollable wrapper so scroll-snap cannot override it. */
        padding-left: 12px;
        box-sizing: border-box;
      }

      .related-scroll-track {
        display: flex;
        gap: 12px;
        padding: 4px 20px 8px 0;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-behavior: smooth;
        scroll-snap-type: x proximity;
        -webkit-overflow-scrolling: touch;

        /* Hide scrollbar by default, show on hover (desktop) */
        scrollbar-width: none;
      }
      .related-scroll-track::-webkit-scrollbar {
        height: 0;
      }
      .related-scroll-wrapper:hover .related-scroll-track {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
      }
      .related-scroll-wrapper:hover .related-scroll-track::-webkit-scrollbar {
        height: 4px;
      }
      .related-scroll-wrapper:hover .related-scroll-track::-webkit-scrollbar-track {
        background: transparent;
      }
      .related-scroll-wrapper:hover .related-scroll-track::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.12);
        border-radius: 2px;
      }

      /* ─── ATHLETE CARD ─── */
      .related-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        width: 154px;
        min-width: 154px;
        padding: 16px 12px 12px;
        border-radius: 14px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.035));
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.06));
        cursor: pointer;
        scroll-snap-align: start;
        transition:
          transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
          background 0.2s ease,
          border-color 0.2s ease,
          box-shadow 0.25s ease;
        -webkit-tap-highlight-color: transparent;
        outline: none;
        position: relative;
        overflow: hidden;
      }
      .related-card::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 14px;
        background: linear-gradient(180deg, rgba(212, 255, 0, 0) 0%, rgba(212, 255, 0, 0) 100%);
        transition: background 0.25s ease;
        pointer-events: none;
        z-index: 0;
      }

      .related-card:hover {
        transform: translateY(-4px);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border-color: rgba(212, 255, 0, 0.2);
        box-shadow:
          0 8px 24px rgba(0, 0, 0, 0.3),
          0 0 0 1px rgba(212, 255, 0, 0.08);
      }
      .related-card:hover::before {
        background: linear-gradient(180deg, rgba(212, 255, 0, 0.03) 0%, rgba(212, 255, 0, 0) 60%);
      }

      .related-card:focus-visible {
        box-shadow: 0 0 0 2px var(--nxt1-color-primary, #d4ff00);
      }

      .related-card:active {
        transform: translateY(-1px) scale(0.98);
      }

      /* Card children should be above the ::before overlay */
      .related-card > * {
        position: relative;
        z-index: 1;
      }

      /* ─── AVATAR ─── */
      .related-card-avatar-wrap {
        position: relative;
        width: 64px;
        height: 64px;
        margin-bottom: 10px;
        flex-shrink: 0;
      }

      .related-card-avatar {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        transition: border-color 0.2s ease;
      }
      .related-card:hover .related-card-avatar {
        border-color: rgba(212, 255, 0, 0.35);
      }

      .related-card-avatar-fallback {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.02em;
        border: 2px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        transition: border-color 0.2s ease;
      }
      .related-card:hover .related-card-avatar-fallback {
        border-color: rgba(212, 255, 0, 0.35);
      }

      .related-card-verified {
        position: absolute;
        bottom: 0;
        right: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
        color: var(--nxt1-color-primary, #d4ff00);
        border: 1.5px solid var(--nxt1-color-bg-primary, #0a0a0a);
      }

      /* ─── INFO ─── */
      .related-card-info {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        width: 100%;
        min-width: 0;
      }

      .related-card-name {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 14px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        margin: 0;
        line-height: 1.25;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        letter-spacing: 0.01em;
      }

      .related-card-position {
        font-size: 11.5px;
        font-weight: 600;
        color: var(--nxt1-color-primary, #d4ff00);
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .related-card-school {
        font-size: 11px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .related-card-meta {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 2px;
      }

      .related-card-class,
      .related-card-state {
        font-size: 10.5px;
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        line-height: 1;
      }

      .related-card-dot {
        font-size: 8px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
      }

      /* ─── MATCH REASON TAG ─── */
      .related-card-tag {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        margin-top: 8px;
        padding: 3px 8px;
        border-radius: 999px;
        background: rgba(212, 255, 0, 0.08);
        border: 1px solid rgba(212, 255, 0, 0.12);
        color: var(--nxt1-color-primary, #d4ff00);
        font-size: 9.5px;
        font-weight: 600;
        letter-spacing: 0.02em;
        white-space: nowrap;
        line-height: 1;
      }
      .related-card:hover .related-card-tag {
        background: rgba(212, 255, 0, 0.14);
        border-color: rgba(212, 255, 0, 0.25);
      }

      /* ═══ RESPONSIVE ═══ */

      /* Tablet: slightly smaller cards */
      @media (max-width: 1024px) {
        .related-header {
          padding: 0 16px 14px 10px;
        }
        .related-scroll-wrapper {
          padding-left: 10px;
        }
        .related-scroll-track {
          gap: 10px;
          padding: 4px 16px 8px 0;
        }
        .related-card {
          width: 142px;
          min-width: 142px;
          padding: 14px 10px 10px;
        }
        .related-card-avatar-wrap {
          width: 56px;
          height: 56px;
        }
        .related-card-avatar,
        .related-card-avatar-fallback {
          width: 56px;
          height: 56px;
        }
      }

      /* Mobile: compact cards, tighter spacing */
      @media (max-width: 768px) {
        .related-section {
          padding: 16px 0 20px;
        }
        .related-header {
          padding: 0 14px 12px;
        }
        .related-scroll-wrapper {
          padding-left: 12px;
        }
        .related-header-icon {
          width: 28px;
          height: 28px;
          border-radius: 6px;
        }
        .related-title {
          font-size: 14px;
        }
        .related-subtitle {
          font-size: 11px;
        }
        .related-scroll-track {
          gap: 10px;
          padding: 4px 20px 6px 0;
        }
        .related-card {
          width: 132px;
          min-width: 132px;
          padding: 12px 8px 10px;
          border-radius: 12px;
        }
        .related-card-avatar-wrap {
          width: 52px;
          height: 52px;
          margin-bottom: 8px;
        }
        .related-card-avatar,
        .related-card-avatar-fallback {
          width: 52px;
          height: 52px;
        }
        .related-card-avatar-fallback {
          font-size: 15px;
        }
        .related-card-verified {
          width: 18px;
          height: 18px;
        }
        .related-card-name {
          font-size: 13px;
        }
        .related-card-position {
          font-size: 11px;
        }
        .related-card-school {
          font-size: 10.5px;
        }
        .related-card-class,
        .related-card-state {
          font-size: 10px;
        }
        .related-card-tag {
          font-size: 9px;
          padding: 2px 6px;
          margin-top: 6px;
        }
      }

      /* Small mobile: even more compact */
      @media (max-width: 480px) {
        .related-header {
          padding: 0 12px 10px;
        }
        .related-scroll-track {
          gap: 8px;
          padding: 4px 20px 6px 0;
        }
        .related-card {
          width: 122px;
          min-width: 122px;
          padding: 10px 6px 8px;
        }
        .related-card-avatar-wrap {
          width: 46px;
          height: 46px;
          margin-bottom: 6px;
        }
        .related-card-avatar,
        .related-card-avatar-fallback {
          width: 46px;
          height: 46px;
        }
        .related-card-avatar-fallback {
          font-size: 14px;
        }
      }

      /* Screen-reader only */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelatedAthletesComponent {
  /** Athletes to display — defaults to mock data for development */
  readonly athletes = input<readonly RelatedAthlete[]>(MOCK_RELATED_ATHLETES);

  /** Whether section is loading */
  readonly loading = input<boolean>(false);

  /** Current profile sport for context in subtitle */
  readonly sport = input<string>('Football');

  /** Current profile state for context in subtitle */
  readonly state = input<string>('Texas');

  /** Emitted when user clicks an athlete card */
  readonly athleteClick = output<RelatedAthlete>();

  /** Emitted when user clicks "See All" */
  readonly seeAllClick = output<void>();

  /** Dynamic subtitle based on context */
  protected readonly subtitle = computed(() => {
    const sportName = this.sport();
    const stateName = this.state();
    if (sportName && stateName) {
      return `${sportName} athletes in ${stateName} you may know`;
    }
    if (sportName) {
      return `${sportName} athletes with similar profiles`;
    }
    return 'Athletes with similar profiles';
  });

  /** Handle card click — emit the athlete for parent to navigate */
  protected onAthleteClick(athlete: RelatedAthlete): void {
    this.athleteClick.emit(athlete);
  }
}
