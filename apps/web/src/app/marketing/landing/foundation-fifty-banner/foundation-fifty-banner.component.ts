/**
 * @fileoverview Foundation 50 — Coach Early Access Banner
 * @module apps/web/features/marketing/landing/foundation-fifty-banner
 *
 * Coaches-only early access offer. First 50 coaches to join this summer
 * receive $100+ in free AI budget plus exclusive early access perks.
 *
 * Displayed as the first section directly under the ImmersiveHero
 * on the root landing page. Eagerly loaded (above the fold).
 *
 * 100% design-token styling. SSR-safe. Mobile-first responsive.
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FIREBASE_EVENTS } from '@nxt1/core/analytics';
import { PARTNER_TEAM_LOGO_PATHS } from '@nxt1/design-tokens/assets';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';

interface FoundationPartnerTeamLogo {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly src: string;
}

interface FoundationPartnerTeamLogoRow {
  readonly id: string;
  readonly logos: readonly FoundationPartnerTeamLogo[];
}

const FOUNDATION_TEAM_LIMIT = 50;
const FOUNDATION_VISIBLE_LOGO_COUNT = 15;
const FOUNDATION_LOGO_ROW_COUNT = 3;

const PARTNER_TEAM_LOGOS: readonly FoundationPartnerTeamLogo[] = [
  {
    id: 'allen-iverson-prep-stars-showcase',
    name: 'Allen Iverson Prep Stars Showcase',
    location: 'Henrico, VA',
    src: PARTNER_TEAM_LOGO_PATHS.aiNexxtLevelUClub,
  },
  {
    id: 'akron-east-hs',
    name: 'Akron East High School',
    location: 'Akron, OH',
    src: PARTNER_TEAM_LOGO_PATHS.akronEastHs,
  },
  {
    id: 'barberton-hs',
    name: 'Barberton High School',
    location: 'Barberton, OH',
    src: PARTNER_TEAM_LOGO_PATHS.barbertonHs,
  },
  {
    id: 'brentwood-hs',
    name: 'Brentwood High School',
    location: 'Brentwood, TN',
    src: PARTNER_TEAM_LOGO_PATHS.brentwoodHs,
  },
  {
    id: 'brush-hs',
    name: 'Brush High School',
    location: 'Lyndhurst, OH',
    src: PARTNER_TEAM_LOGO_PATHS.brushHs,
  },
  {
    id: 'buchtel-hs',
    name: 'Buchtel High School',
    location: 'Akron, OH',
    src: PARTNER_TEAM_LOGO_PATHS.buchtelHs,
  },
  {
    id: 'canton-mckinley-hs',
    name: 'Canton McKinley High School',
    location: 'Canton, OH',
    src: PARTNER_TEAM_LOGO_PATHS.cantonMckinleyHs,
  },
  {
    id: 'canton-south-hs',
    name: 'Canton South High School',
    location: 'Canton, OH',
    src: PARTNER_TEAM_LOGO_PATHS.cantonSouthHs,
  },
  {
    id: 'carrollton-hs',
    name: 'Carrollton High School',
    location: 'Carrollton, OH',
    src: PARTNER_TEAM_LOGO_PATHS.carrolltonHs,
  },
  {
    id: 'centennial-hs',
    name: 'Centennial High School',
    location: 'Columbus, OH',
    src: PARTNER_TEAM_LOGO_PATHS.centennialHs,
  },
  {
    id: 'central-valley-hs',
    name: 'Central Valley High School',
    location: 'Monaca, PA',
    src: PARTNER_TEAM_LOGO_PATHS.centralValleyHs,
  },
  {
    id: 'crestview-hs',
    name: 'Crestview High School',
    location: 'Columbiana, OH',
    src: PARTNER_TEAM_LOGO_PATHS.crestviewHs,
  },
  {
    id: 'dickinson-tx-hs',
    name: 'Dickinson High School',
    location: 'Dickinson, TX',
    src: PARTNER_TEAM_LOGO_PATHS.dickinsonTxHs,
  },
  {
    id: 'dixie-heights-hs',
    name: 'Dixie Heights High School',
    location: 'Edgewood, KY',
    src: PARTNER_TEAM_LOGO_PATHS.dixieHeightsHs,
  },
  {
    id: 'evanston-township-hs',
    name: 'Evanston Township High School',
    location: 'Evanston, IL',
    src: PARTNER_TEAM_LOGO_PATHS.evanstonTownshipHs,
  },
  {
    id: 'fairborn-hs',
    name: 'Fairborn High School',
    location: 'Fairborn, OH',
    src: PARTNER_TEAM_LOGO_PATHS.fairbornHs,
  },
  {
    id: 'frederick-douglass-hs',
    name: 'Frederick Douglass High School',
    location: 'Lexington, KY',
    src: PARTNER_TEAM_LOGO_PATHS.frederickDouglassHs,
  },
  {
    id: 'garfield-hs',
    name: 'Garfield High School',
    location: 'Akron, OH',
    src: PARTNER_TEAM_LOGO_PATHS.garfieldHs,
  },
  {
    id: 'george-rogers-clark-hs',
    name: 'George Rogers Clark High School',
    location: 'Winchester, KY',
    src: PARTNER_TEAM_LOGO_PATHS.georgeRogersClarkHs,
  },
  {
    id: 'glassboro-hs',
    name: 'Glassboro High School',
    location: 'Glassboro, NJ',
    src: PARTNER_TEAM_LOGO_PATHS.glassboroHs,
  },
  {
    id: 'hillsboro-hs',
    name: 'Hillsboro High School',
    location: 'Hillsboro, NJ',
    src: PARTNER_TEAM_LOGO_PATHS.hillsboroHs,
  },
  {
    id: 'hoover-hs',
    name: 'Hoover High School',
    location: 'North Canton, OH',
    src: PARTNER_TEAM_LOGO_PATHS.hooverHs,
  },
  {
    id: 'keyser-hs',
    name: 'Keyser High School',
    location: 'Keyser, WV',
    src: PARTNER_TEAM_LOGO_PATHS.keyserHs,
  },
  {
    id: 'lake-hs',
    name: 'Lake High School',
    location: 'Uniontown, OH',
    src: PARTNER_TEAM_LOGO_PATHS.lakeHs,
  },
  {
    id: 'lincoln-county-hs',
    name: 'Lincoln County High School',
    location: 'Stanford, KY',
    src: PARTNER_TEAM_LOGO_PATHS.lincolnCountyHs,
  },
  {
    id: 'loudon-sports-academy-hs',
    name: 'Loudon Sports Academy',
    location: 'Loudoun County, VA',
    src: PARTNER_TEAM_LOGO_PATHS.loudonSportsAcademyHs,
  },
  {
    id: 'marlington-hs',
    name: 'Marlington High School',
    location: 'Alliance, OH',
    src: PARTNER_TEAM_LOGO_PATHS.marlingtonHs,
  },
  {
    id: 'martin-county-hs',
    name: 'Martin County High School',
    location: 'Inez, KY',
    src: PARTNER_TEAM_LOGO_PATHS.martinCountyHs,
  },
  {
    id: 'mason-county-hs',
    name: 'Mason County High School',
    location: 'Maysville, KY',
    src: PARTNER_TEAM_LOGO_PATHS.masonCountyHs,
  },
  {
    id: 'nordonia-hs',
    name: 'Nordonia High School',
    location: 'Macedonia, OH',
    src: PARTNER_TEAM_LOGO_PATHS.nordoniaHs,
  },
  {
    id: 'north-hs',
    name: 'North High School',
    location: 'Akron, OH',
    src: PARTNER_TEAM_LOGO_PATHS.northHs,
  },
  {
    id: 'perry-pirates-hs',
    name: 'Perry Pirates',
    location: 'Perry, OH',
    src: PARTNER_TEAM_LOGO_PATHS.perryPiratesHs,
  },
  {
    id: 'pulaski-county-hs',
    name: 'Pulaski County High School',
    location: 'Somerset, KY',
    src: PARTNER_TEAM_LOGO_PATHS.pulaskiCountyHs,
  },
  {
    id: 'rouse-hs',
    name: 'Rouse High School',
    location: 'Leander, TX',
    src: PARTNER_TEAM_LOGO_PATHS.rouseHs,
  },
  {
    id: 'salem-hs',
    name: 'Salem High School',
    location: 'Salem, OH',
    src: PARTNER_TEAM_LOGO_PATHS.salemHs,
  },
  {
    id: 'sandy-valley-hs',
    name: 'Sandy Valley High School',
    location: 'Magnolia, OH',
    src: PARTNER_TEAM_LOGO_PATHS.sandyValleyHs,
  },
  {
    id: 'silverdale-baptist-hs',
    name: 'Silverdale Baptist',
    location: 'Chattanooga, TN',
    src: PARTNER_TEAM_LOGO_PATHS.silverdaleBaptistHs,
  },
  {
    id: 'st-v-hs',
    name: 'St. Vincent-St. Mary High School',
    location: 'Akron, OH',
    src: PARTNER_TEAM_LOGO_PATHS.stVHs,
  },
  {
    id: 'youngstown-hs',
    name: 'Youngstown High School',
    location: 'Youngstown, OH',
    src: PARTNER_TEAM_LOGO_PATHS.youngstownHs,
  },
] as const;

const FOUNDATION_PARTNER_ROWS: readonly FoundationPartnerTeamLogoRow[] = Array.from(
  { length: FOUNDATION_LOGO_ROW_COUNT },
  (_, rowIndex) => ({
    id: `row-${rowIndex + 1}`,
    logos: PARTNER_TEAM_LOGOS.filter(
      (_, logoIndex) => logoIndex % FOUNDATION_LOGO_ROW_COUNT === rowIndex
    ),
  })
);

@Component({
  selector: 'app-foundation-fifty-banner',
  standalone: true,
  imports: [RouterModule],
  template: `
    <section class="f50" aria-labelledby="f50-title" itemscope itemtype="https://schema.org/Offer">
      <div class="f50__inner">
        <!-- Left: identity + headline + perks -->
        <div class="f50__body">
          <div class="f50__badge-row">
            <span class="f50__badge" aria-label="Limited offer">
              <span class="f50__badge-dot" aria-hidden="true"></span>
              Foundation 50 · Coaches Early Access
            </span>
            <span class="f50__spots" aria-live="polite">Only 50 spots available</span>
          </div>

          <h2 id="f50-title" class="f50__headline" itemprop="name">
            Join the First 50 Programs.<br class="f50__br" />
            Get a <span class="f50__accent">FREE Budget</span> to Start on Us.
          </h2>

          <p class="f50__sub">
            Sign up as a founding coach this summer for early platform access, exclusive community
            access, and a direct hand in shaping a new era platform around your program.
          </p>

          <!-- Perks row -->
          <ul class="f50__perks" aria-label="Foundation 50 perks">
            <li class="f50__perk">
              <span class="f50__perk-icon" aria-hidden="true">⚡</span>
              <span class="f50__perk-text">Early Platform Access</span>
            </li>
            <li class="f50__perk">
              <span class="f50__perk-icon" aria-hidden="true">🏆</span>
              <span class="f50__perk-text">Exclusive Community Access</span>
            </li>
            <li class="f50__perk">
              <span class="f50__perk-icon" aria-hidden="true">🎙️</span>
              <span class="f50__perk-text">Platform-Shaping Input</span>
            </li>
          </ul>

          <!-- CTA row -->
          <div class="f50__cta-row">
            <a
              routerLink="/auth"
              (click)="onClaimSpotClick()"
              class="f50__cta-btn"
              role="button"
              aria-label="Claim your Foundation 50 coach spot"
              itemprop="url"
            >
              Claim Your Spot
              <svg
                class="f50__cta-arrow"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </a>
            <span class="f50__cta-note">Free to join · No credit card required</span>
          </div>
        </div>

        <aside class="f50__partners" aria-label="Foundation 50 partner teams">
          <div class="f50__partners-head">
            <p class="f50__partners-label">Foundation teams</p>
            <span class="f50__partners-count" aria-label="Foundation teams claimed">
              {{ partnerProgressLabel }}
            </span>
          </div>
          <div class="f50__progress" aria-hidden="true">
            <span class="f50__progress-bar" [style.width.%]="partnerProgressPercent"></span>
          </div>
          <div
            class="f50__partner-marquee"
            aria-label="Current Foundation team logos"
            [style.--f50-visible-per-row]="visibleLogosPerRow"
          >
            @for (row of partnerLogoRows; track row.id; let rowIndex = $index) {
              <div
                class="f50__partner-row"
                [class.f50__partner-row--reverse]="rowIndex % 2 === 1"
                [style.--f50-row-duration]="getRowDuration(rowIndex)"
              >
                <div class="f50__partner-track">
                  @for (partner of row.logos; track partner.id) {
                    <div
                      class="f50__partner-card"
                      [class.f50__partner-card--large]="
                        partner.id === 'akron-east-hs' || partner.id === 'barberton-hs'
                      "
                    >
                      <div class="f50__partner-logo-shell">
                        <img
                          class="f50__partner-logo"
                          [src]="partner.src"
                          [alt]="partner.name + ' logo'"
                          width="88"
                          height="88"
                          decoding="async"
                        />
                      </div>
                      <span class="f50__partner-location">{{ partner.location }}</span>
                    </div>
                  }
                </div>
                <div class="f50__partner-track" aria-hidden="true">
                  @for (partner of row.logos; track partner.id + '-clone') {
                    <div
                      class="f50__partner-card"
                      [class.f50__partner-card--large]="
                        partner.id === 'akron-east-hs' || partner.id === 'barberton-hs'
                      "
                    >
                      <div class="f50__partner-logo-shell">
                        <img
                          class="f50__partner-logo"
                          [src]="partner.src"
                          [alt]="partner.name + ' logo'"
                          width="88"
                          height="88"
                          decoding="async"
                        />
                      </div>
                      <span class="f50__partner-location">{{ partner.location }}</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </aside>
      </div>
    </section>
  `,
  styles: [
    `
      /* ============================================================
       * Foundation 50 Banner
       * Full-width section, dark panel with amber accent.
       * Mobile-first, 100% design-token driven.
       * ============================================================ */

      :host {
        --f50-accent: var(--nxt1-color-primary);
        --f50-accent-muted: var(--nxt1-color-secondary);
        --f50-surface: color-mix(
          in srgb,
          var(--nxt1-color-surface-100) 40%,
          var(--nxt1-color-bg-primary)
        );
        --f50-surface-strong: color-mix(
          in srgb,
          var(--nxt1-color-surface-100) 58%,
          var(--nxt1-color-bg-primary)
        );
        display: block;
        width: 100%;
      }

      .f50 {
        width: 100%;
        padding: var(--nxt1-spacing-6, 1.5rem) var(--nxt1-spacing-4, 1rem);
        background:
          radial-gradient(
            ellipse 70% 55% at 10% 0%,
            color-mix(in srgb, var(--f50-accent) 10%, transparent) 0%,
            transparent 68%
          ),
          radial-gradient(
            ellipse 55% 45% at 100% 100%,
            color-mix(in srgb, var(--f50-accent-muted) 8%, transparent) 0%,
            transparent 72%
          ),
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--nxt1-color-bg-primary) 18%, transparent) 0%,
            color-mix(in srgb, var(--nxt1-color-bg-primary) 45%, transparent) 45%,
            color-mix(in srgb, var(--nxt1-color-bg-primary) 78%, transparent) 100%
          ),
          var(--nxt1-color-bg-primary);
        border-top: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 42%, transparent);
        border-bottom: 1px solid
          color-mix(in srgb, var(--nxt1-color-border-default) 42%, transparent);
        position: relative;
        overflow: hidden;
      }

      /* Subtle ambient glow top-left */
      .f50::before {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse 60% 40% at 18% 12%,
          color-mix(in srgb, var(--f50-accent) 5%, transparent),
          transparent 70%
        );
        pointer-events: none;
      }

      .f50__inner {
        position: relative;
        max-width: var(--nxt1-root-shell-max-width, 88rem);
        margin-inline: auto;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-6, 1.5rem);
        align-items: flex-start;
      }

      /* ── Badge row ── */
      .f50__badge-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
      }

      .f50__badge {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5, 0.375rem);
        padding: 0.3rem 0.75rem;
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid color-mix(in srgb, var(--f50-accent) 36%, transparent);
        background: color-mix(in srgb, var(--f50-accent) 12%, transparent);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--f50-accent);
        white-space: nowrap;
      }

      .f50__badge-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--f50-accent);
        animation: f50-pulse 1.8s ease-in-out infinite;
      }

      @keyframes f50-pulse {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.5;
          transform: scale(0.7);
        }
      }

      .f50__spots {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-color-text-tertiary);
        letter-spacing: 0.03em;
      }

      /* ── Headline ── */
      .f50__headline {
        margin: 0;
        font-family: var(--nxt1-fontFamily-display, 'Barlow Condensed', sans-serif);
        font-size: clamp(1.75rem, 4vw + 0.5rem, 2.875rem);
        font-weight: var(--nxt1-fontWeight-extrabold, 800);
        line-height: 1.1;
        color: var(--nxt1-color-text-primary);
        letter-spacing: -0.02em;
      }

      .f50__br {
        /* Show line break on mobile; hide on desktop */
        display: inline;
      }

      .f50__accent {
        color: var(--f50-accent);
      }

      /* ── Sub ── */
      .f50__sub {
        margin: 0;
        max-width: 52ch;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        line-height: 1.6;
        color: var(--nxt1-color-text-secondary);
      }

      /* ── Perks ── */
      .f50__perks {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-4, 1rem);
      }

      .f50__perk {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5, 0.375rem);
      }

      .f50__perk-icon {
        font-size: 1rem;
        line-height: 1;
      }

      .f50__perk-text {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
      }

      /* ── CTA row ── */
      .f50__cta-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
      }

      .f50__cta-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
        padding: 0.6875rem 1.5rem;
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--f50-accent);
        color: var(--nxt1-color-text-onPrimary);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.02em;
        text-decoration: none;
        transition:
          filter 0.15s ease,
          transform 0.15s ease;
        will-change: filter;
        white-space: nowrap;
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--f50-accent) 18%, transparent);
      }

      .f50__cta-btn:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
      }

      .f50__cta-btn:active {
        filter: brightness(0.95);
        transform: translateY(0);
      }

      .f50__cta-arrow {
        flex-shrink: 0;
        transition: transform 0.15s ease;
      }

      .f50__cta-btn:hover .f50__cta-arrow {
        transform: translateX(3px);
      }

      .f50__cta-note {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ── Partner teams ── */
      .f50__partners {
        position: relative;
        width: 100%;
        flex-shrink: 0;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 48%, transparent);
        border-radius: var(--nxt1-borderRadius-2xl, 1rem);
        background:
          linear-gradient(
            135deg,
            color-mix(in srgb, var(--f50-accent) 9%, transparent),
            transparent 44%
          ),
          color-mix(in srgb, var(--f50-surface-strong) 82%, transparent);
        padding: var(--nxt1-spacing-3, 0.75rem);
        box-shadow:
          inset 0 1px 0 color-mix(in srgb, white 8%, transparent),
          0 18px 42px color-mix(in srgb, black 22%, transparent);
      }

      .f50__partners::before {
        content: '';
        position: absolute;
        inset: -18px;
        border-radius: 999px;
        background: radial-gradient(
          circle,
          color-mix(in srgb, var(--f50-accent) 14%, transparent),
          transparent 70%
        );
        pointer-events: none;
      }

      .f50__partners-head {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3, 0.75rem);
        margin: 0 0 var(--nxt1-spacing-2, 0.5rem);
      }

      .f50__partners-label {
        margin: 0;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary);
      }

      .f50__partners-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 3.25rem;
        padding: 0.25rem 0.5rem;
        border-radius: var(--nxt1-borderRadius-full, 999px);
        background: color-mix(in srgb, var(--f50-accent) 14%, transparent);
        color: var(--f50-accent);
        font-family: var(--nxt1-fontFamily-display, 'Barlow Condensed', sans-serif);
        font-size: 1rem;
        font-weight: var(--nxt1-fontWeight-extrabold, 800);
        line-height: 1;
      }

      .f50__progress {
        position: relative;
        z-index: 1;
        height: 4px;
        margin-block-end: var(--nxt1-spacing-3, 0.75rem);
        overflow: hidden;
        border-radius: var(--nxt1-borderRadius-full, 999px);
        background: color-mix(in srgb, var(--nxt1-color-border-default) 44%, transparent);
      }

      .f50__progress-bar {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--f50-accent), var(--f50-accent-muted));
      }

      .f50__partner-marquee {
        --f50-card-width: 4rem;
        --f50-card-height: 5.4rem;
        --f50-logo-gap: var(--nxt1-spacing-2, 0.5rem);
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: var(--f50-logo-gap);
        width: min(
          100%,
          calc(
            (var(--f50-visible-per-row) * var(--f50-card-width)) +
              ((var(--f50-visible-per-row) - 1) * var(--f50-logo-gap))
          )
        );
        margin-inline: auto;
        overflow: hidden;
        mask-image: linear-gradient(90deg, transparent 0, black 6%, black 94%, transparent 100%);
        -webkit-mask-image: linear-gradient(
          90deg,
          transparent 0,
          black 6%,
          black 94%,
          transparent 100%
        );
      }

      .f50__partner-row {
        --f50-row-duration: 28s;
        display: flex;
        width: max-content;
        gap: var(--f50-logo-gap);
        animation: f50-marquee var(--f50-row-duration) linear infinite;
        will-change: transform;
      }

      .f50__partner-row--reverse {
        animation-direction: reverse;
      }

      .f50__partner-track {
        display: flex;
        gap: var(--f50-logo-gap);
      }

      .f50__partner-card {
        width: var(--f50-card-width);
        height: var(--f50-card-height);
        flex: 0 0 auto;
        border-radius: var(--nxt1-borderRadius-lg, 0.5rem);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 55%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 58%, white 4%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        padding: 0.4rem 0.3rem 0.45rem;
        box-shadow: inset 0 1px 0 color-mix(in srgb, white 8%, transparent);
      }

      .f50__partner-card--large {
        padding: var(--nxt1-spacing-1, 0.25rem);
      }

      .f50__partner-logo-shell {
        display: grid;
        place-items: center;
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
      }

      .f50__partner-logo {
        display: block;
        width: 100%;
        max-height: 100%;
        object-fit: contain;
        filter: saturate(0.94) contrast(1.04);
      }

      .f50__partner-card--large .f50__partner-logo {
        transform: scale(1.08);
        transform-origin: center;
      }

      .f50__partner-card:hover .f50__partner-logo {
        filter: saturate(1.05) contrast(1.08);
      }

      .f50__partner-location {
        display: block;
        width: 100%;
        font-size: 0.56rem;
        font-weight: var(--nxt1-fontWeight-medium, 500);
        line-height: 1.1;
        text-align: center;
        letter-spacing: 0.01em;
        color: var(--nxt1-color-text-tertiary);
        text-wrap: balance;
      }

      .f50__partner-marquee:hover .f50__partner-row {
        animation-play-state: paused;
      }

      @keyframes f50-marquee {
        from {
          transform: translateX(0);
        }
        to {
          transform: translateX(calc(-50% - (var(--nxt1-spacing-2, 0.5rem) / 2)));
        }
      }

      /* ── Body layout — text + cta stacked by default ── */
      .f50__body {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 1rem);
        flex: 1;
        min-width: 0;
      }

      /* ============================================================
       * TABLET (≥ 640px)
       * ============================================================ */
      @media (min-width: 640px) {
        .f50 {
          padding: var(--nxt1-spacing-8, 2rem) var(--nxt1-spacing-6, 1.5rem);
        }

        .f50__perks {
          gap: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-5, 1.25rem);
        }

        .f50__br {
          display: none; /* single line on tablet+ */
        }

        .f50__partners {
          padding: var(--nxt1-spacing-4, 1rem);
        }

        .f50__partner-marquee {
          --f50-card-width: 4.5rem;
          --f50-card-height: 5.8rem;
          --f50-logo-gap: var(--nxt1-spacing-3, 0.75rem);
        }

        .f50__partner-row,
        .f50__partner-track {
        }
      }

      /* ============================================================
       * DESKTOP (≥ 1024px)
       * ============================================================ */
      @media (min-width: 1024px) {
        .f50 {
          padding: var(--nxt1-spacing-10, 2.5rem) var(--nxt1-spacing-8, 2rem);
        }

        .f50__inner {
          flex-direction: row;
          align-items: center;
          gap: var(--nxt1-spacing-12, 3rem);
        }

        .f50__partners {
          width: clamp(26rem, 42vw, 36rem);
          padding: var(--nxt1-spacing-5, 1.25rem);
        }

        .f50__partners-head {
          margin: 0 0 var(--nxt1-spacing-3, 0.75rem);
        }

        .f50__partners-label {
          font-size: 0.7rem;
          letter-spacing: 0.16em;
        }

        .f50__partners-count {
          font-size: 1.15rem;
          padding: 0.275rem 0.625rem;
        }

        .f50__progress {
          margin-block-end: var(--nxt1-spacing-4, 1rem);
        }

        .f50__partner-marquee {
          --f50-card-width: 5rem;
          --f50-card-height: 6.1rem;
          --f50-logo-gap: var(--nxt1-spacing-3, 0.75rem);
        }

        .f50__partner-row,
        .f50__partner-track {
        }

        .f50__partner-card {
          border-radius: var(--nxt1-borderRadius-xl, 0.75rem);
          padding: var(--nxt1-spacing-3, 0.75rem);
        }

        .f50__sub {
          font-size: var(--nxt1-fontSize-base, 1rem);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .f50__partner-marquee {
          mask-image: none;
          -webkit-mask-image: none;
        }

        .f50__partner-row {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoundationFiftyBannerComponent {
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  protected readonly partnerLogos = PARTNER_TEAM_LOGOS;
  protected readonly partnerLogoRows = FOUNDATION_PARTNER_ROWS;
  protected readonly visibleLogosPerRow = FOUNDATION_VISIBLE_LOGO_COUNT / FOUNDATION_LOGO_ROW_COUNT;
  protected readonly partnerProgressLabel = '41/50';
  protected readonly partnerProgressPercent =
    (this.partnerLogos.length / FOUNDATION_TEAM_LIMIT) * 100;

  protected getRowDuration(rowIndex: number): string {
    return `${26 + rowIndex * 4}s`;
  }

  protected onClaimSpotClick(): void {
    this.analytics?.trackEvent(FIREBASE_EVENTS.SELECT_PROMOTION, {
      creative_name: 'foundation_50_claim_spot_cta',
      creative_slot: 'root_landing_foundation_50',
      promotion_id: 'foundation_50_early_access',
      promotion_name: 'Foundation 50 Coach Early Access',
      location_id: 'root_landing_foundation_50',
    });
  }
}
