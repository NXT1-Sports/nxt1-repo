import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { LOGO_PATHS } from '@nxt1/design-tokens/assets';
import { NxtIconComponent } from '../../components/icon';

export interface RankingSource {
  readonly id: string;
  readonly name: string;
  readonly website: string;
  readonly logoUrl: string;
  readonly logoFallbackUrl: string;
  readonly nationalRank: number | null;
  readonly stateRank: number | null;
  readonly positionRank: number | null;
  readonly stars: number;
  readonly score: number | null;
}

export interface VerifiedProvider {
  readonly id: string;
  readonly name: string;
  readonly website: string;
  readonly logoUrl: string;
  readonly logoFallbackUrl: string;
}

const clearbitLogo = (domain: string): string => `https://logo.clearbit.com/${domain}`;
const faviconLogo = (domain: string): string =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

const MOCK_RANKINGS: RankingSource[] = [
  {
    id: 'nxt1',
    name: 'NXT1',
    website: 'nxt1sports.com',
    logoUrl: LOGO_PATHS.white,
    logoFallbackUrl: LOGO_PATHS.icon,
    nationalRank: 12,
    stateRank: 2,
    positionRank: 1,
    stars: 5,
    score: 98,
  },
  {
    id: 'on3',
    name: 'On3',
    website: 'on3.com',
    logoUrl: clearbitLogo('on3.com'),
    logoFallbackUrl: faviconLogo('on3.com'),
    nationalRank: 15,
    stateRank: 3,
    positionRank: 2,
    stars: 5,
    score: 96,
  },
  {
    id: '247',
    name: '247Sports',
    website: '247sports.com',
    logoUrl: clearbitLogo('247sports.com'),
    logoFallbackUrl: faviconLogo('247sports.com'),
    nationalRank: 18,
    stateRank: 3,
    positionRank: 4,
    stars: 4,
    score: 94,
  },
  {
    id: 'rivals',
    name: 'Rivals',
    website: 'rivals.com',
    logoUrl: clearbitLogo('rivals.com'),
    logoFallbackUrl: faviconLogo('rivals.com'),
    nationalRank: 22,
    stateRank: 4,
    positionRank: 5,
    stars: 4,
    score: 6.0,
  },
  {
    id: 'espn',
    name: 'ESPN',
    website: 'espn.com',
    logoUrl: clearbitLogo('espn.com'),
    logoFallbackUrl: faviconLogo('espn.com'),
    nationalRank: 25,
    stateRank: 5,
    positionRank: 8,
    stars: 4,
    score: 88,
  },
  {
    id: 'xp',
    name: 'XP',
    website: 'nxt1sports.com/xp',
    logoUrl: LOGO_PATHS.icon,
    logoFallbackUrl: LOGO_PATHS.icon,
    nationalRank: null,
    stateRank: null,
    positionRank: null,
    stars: 0,
    score: 1250,
  },
];

@Component({
  selector: 'nxt1-profile-rankings',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <section class="rankings-shell" aria-label="Recruiting rankings">
      <div class="verified-by" role="status" aria-label="Verified by ranking providers">
        <span class="verified-by__label">Verified by</span>
        <div class="verified-by__list">
          @for (provider of providers(); track provider.id) {
            <a
              class="verified-by__chip"
              [href]="
                provider.website.startsWith('http')
                  ? provider.website
                  : 'https://' + provider.website
              "
              target="_blank"
              rel="noopener noreferrer"
              [attr.aria-label]="'Open ' + provider.name + ' (opens in new tab)'"
            >
              <img
                class="verified-by__logo"
                [src]="provider.logoUrl"
                [alt]="provider.name + ' logo'"
                loading="lazy"
                decoding="async"
                (error)="onProviderLogoError($event, provider)"
              />
              <span class="verified-by__name">{{ provider.name }}</span>
            </a>
          }
        </div>
      </div>

      <div class="rankings-grid">
        @for (source of rankings(); track source.id) {
          <article class="ranking-card">
            <div class="ranking-card__header">
              <div class="ranking-card__source">
                <img
                  class="ranking-card__logo"
                  [src]="source.logoUrl"
                  [alt]="source.name + ' logo'"
                  loading="lazy"
                  decoding="async"
                  (error)="onSourceLogoError($event, source)"
                />
                <span class="ranking-card__name">{{ source.name }}</span>
              </div>

              @if (source.stars > 0) {
                <div class="ranking-card__stars" [attr.aria-label]="source.stars + ' stars'">
                  @for (star of [1, 2, 3, 4, 5]; track star) {
                    <nxt1-icon
                      name="star"
                      [class.star--filled]="star <= source.stars"
                      [class.star--empty]="star > source.stars"
                      size="14"
                    />
                  }
                  <span class="ranking-card__star-number">{{ source.stars.toFixed(1) }}</span>
                </div>
              }
            </div>

            <div class="ranking-card__ranks">
              <div class="rank-item">
                <span class="rank-item__label">NATL</span>
                <span class="rank-item__value">
                  {{ source.nationalRank ? '#' + source.nationalRank : '--' }}
                </span>
              </div>
              <div class="rank-item">
                <span class="rank-item__label">STATE</span>
                <span class="rank-item__value">
                  {{ source.stateRank ? '#' + source.stateRank : '--' }}
                </span>
              </div>
              <div class="rank-item">
                <span class="rank-item__label">POS</span>
                <span class="rank-item__value">
                  {{ source.positionRank ? '#' + source.positionRank : '--' }}
                </span>
              </div>
            </div>

            @if (source.score !== null) {
              <div class="ranking-card__footer">
                <span class="ranking-card__score-label">Score</span>
                <span class="ranking-card__score-val">{{ source.score }}</span>
              </div>
            }
          </article>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: var(--nxt1-spacing-3);
      }

      .rankings-shell {
        display: grid;
        gap: var(--nxt1-spacing-4);
      }

      .verified-by {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-xl, 16px);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03));
      }

      .verified-by__label {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.6));
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        white-space: nowrap;
      }

      .verified-by__list {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        flex-wrap: wrap;
      }

      .verified-by__chip {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1-5, 0.375rem);
        padding: 0.375rem 0.625rem;
        border-radius: var(--nxt1-radius-full, 999px);
        text-decoration: none;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.8));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04)) 75%,
          transparent
        );
        transition:
          border-color var(--nxt1-duration-fast, 120ms) var(--nxt1-easing-out, ease-out),
          background var(--nxt1-duration-fast, 120ms) var(--nxt1-easing-out, ease-out);
      }

      .verified-by__chip:hover {
        border-color: var(--nxt1-color-primary, #d4ff00);
        background: color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 10%, transparent);
      }

      .verified-by__logo {
        width: 16px;
        height: 16px;
        object-fit: contain;
        border-radius: 3px;
        flex-shrink: 0;
      }

      .verified-by__name {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        line-height: 1;
      }

      .rankings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: var(--nxt1-spacing-4);
      }

      .ranking-card {
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-xl, 16px);
        padding: var(--nxt1-spacing-4);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        transition:
          transform var(--nxt1-duration-fast, 120ms) var(--nxt1-easing-out, ease-out),
          box-shadow var(--nxt1-duration-fast, 120ms) var(--nxt1-easing-out, ease-out),
          border-color var(--nxt1-duration-fast, 120ms) var(--nxt1-easing-out, ease-out);
      }

      .ranking-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        border-color: color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 40%, transparent);
      }

      @media (prefers-reduced-motion: reduce) {
        .ranking-card,
        .verified-by__chip {
          transition: none;
        }

        .ranking-card:hover {
          transform: none;
        }
      }

      .ranking-card__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .ranking-card__source {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .ranking-card__logo {
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-radius-md, 8px);
        object-fit: contain;
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08)) 70%,
          transparent
        );
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        padding: 4px;
      }

      .ranking-card__name {
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
        color: var(--nxt1-color-text-primary, #fff);
      }

      .ranking-card__stars {
        display: flex;
        gap: 2px;
        align-items: center;
      }

      .star--filled {
        color: var(--nxt1-color-warning, #fbbf24);
      }

      .star--empty {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.35));
      }

      .ranking-card__star-number {
        margin-left: 4px;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.85));
      }

      .ranking-card__ranks {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: var(--nxt1-spacing-2);
        margin-bottom: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-3) 0;
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
      }

      .rank-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .rank-item__label {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.6));
        margin-bottom: var(--nxt1-spacing-1);
      }

      .rank-item__value {
        font-size: var(--nxt1-fontSize-xl, 1.25rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-primary, #fff);
      }

      .ranking-card__footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
      }

      .ranking-card__score-label {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.6));
      }

      .ranking-card__score-val {
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-primary, #d4ff00);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileRankingsComponent {
  protected readonly rankings = signal<RankingSource[]>(MOCK_RANKINGS);
  protected readonly providers = signal<VerifiedProvider[]>(
    MOCK_RANKINGS.map(({ id, name, website, logoUrl, logoFallbackUrl }) => ({
      id,
      name,
      website,
      logoUrl,
      logoFallbackUrl,
    }))
  );

  protected onSourceLogoError(event: Event, source: RankingSource): void {
    const image = event.target as HTMLImageElement | null;
    if (!image) return;

    if (image.dataset['fallbackApplied'] === 'true') {
      image.src = LOGO_PATHS.icon;
      return;
    }

    image.dataset['fallbackApplied'] = 'true';
    image.src = source.logoFallbackUrl;
  }

  protected onProviderLogoError(event: Event, provider: VerifiedProvider): void {
    const image = event.target as HTMLImageElement | null;
    if (!image) return;

    if (image.dataset['fallbackApplied'] === 'true') {
      image.src = LOGO_PATHS.icon;
      return;
    }

    image.dataset['fallbackApplied'] = 'true';
    image.src = provider.logoFallbackUrl;
  }
}
