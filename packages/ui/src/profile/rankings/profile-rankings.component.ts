import { Component, ChangeDetectionStrategy, inject, output } from '@angular/core';
import { LOGO_PATHS } from '@nxt1/design-tokens/assets';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { ProfileService } from '../profile.service';

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

const clearbitLogo = (domain: string): string => `https://logo.clearbit.com/${domain}`;
const faviconLogo = (domain: string): string =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

export const MOCK_RANKINGS: RankingSource[] = [
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
  imports: [NxtIconComponent, NxtImageComponent],
  template: `
    <section class="rankings-shell" aria-label="Recruiting rankings">
      @if (rankings().length === 0) {
        <div class="rankings-empty" role="status">
          <div class="rankings-empty__icon" aria-hidden="true">
            <nxt1-icon name="trophy" [size]="48" />
          </div>
          <h3 class="rankings-empty__title">No Rankings</h3>
          <p class="rankings-empty__desc">
            @if (isOwnProfile()) {
              Your rankings from scouting services will appear here.
            } @else {
              Rankings from scouting services will appear here.
            }
          </p>
          @if (isOwnProfile()) {
            <button class="rankings-empty__cta" (click)="addRankingClick.emit()">
              Add Ranking
            </button>
          }
        </div>
      } @else {
        <div class="rankings-grid">
          @for (source of rankings(); track source.id) {
            <article class="ranking-card">
              <div class="ranking-card__header">
                <div class="ranking-card__source">
                  <nxt1-image
                    class="ranking-card__logo"
                    [src]="source.logoUrl"
                    [alt]="source.name + ' logo'"
                    [width]="24"
                    [height]="24"
                    variant="avatar"
                    fit="contain"
                    [showPlaceholder]="false"
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
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 0;
      }

      .rankings-shell {
        display: grid;
        gap: var(--nxt1-spacing-4);
      }

      .rankings-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
      }

      .rankings-empty__icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;

        nxt1-icon {
          color: var(--nxt1-color-text-tertiary);
        }
      }

      .rankings-empty__title {
        font-size: 16px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 16px 0 8px;
      }

      .rankings-empty__desc {
        font-size: 14px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        max-width: 280px;
      }

      .rankings-empty__cta {
        margin-top: 12px;
        padding: 10px 24px;
        background: var(--nxt1-color-primary);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: #000;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          filter: brightness(1.1);
        }

        &:active {
          filter: brightness(0.95);
        }
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
        .ranking-card {
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
  private readonly profile = inject(ProfileService);
  protected readonly rankings = this.profile.rankings;
  protected readonly isOwnProfile = this.profile.isOwnProfile;

  readonly addRankingClick = output<void>();

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
}
