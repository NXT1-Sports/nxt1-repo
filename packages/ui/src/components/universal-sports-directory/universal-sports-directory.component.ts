import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SPORTS, formatSportDisplayName, normalizeSportKey } from '@nxt1/core';
import { NxtSectionHeaderComponent } from '../section-header';

export interface UniversalSportDirectoryLink {
  readonly slug: string;
  readonly sport: string;
  readonly href: string;
}

const SPORT_ROUTE_OVERRIDES: Readonly<Record<string, string>> = {
  football: '/football',
  basketball: '/basketball',
};

function formatDirectorySportName(key: string): string {
  if (key === 'track_field') return 'Track & Field';
  if (key === 'swimming_diving') return 'Swim & Dive';

  const formatted = formatSportDisplayName(key);
  return formatted.replace(/^Mma$/, 'MMA');
}

const UNIVERSAL_SPORT_DIRECTORY_LINKS: readonly UniversalSportDirectoryLink[] = Array.from(
  new Set(SPORTS.map((sport) => normalizeSportKey(sport)).filter((sport) => sport.length > 0))
).map((sportKey: string) => ({
  slug: sportKey,
  sport: formatDirectorySportName(sportKey),
  href: SPORT_ROUTE_OVERRIDES[sportKey] ?? `/explore?sport=${encodeURIComponent(sportKey)}`,
}));

@Component({
  selector: 'nxt1-universal-sports-directory',
  standalone: true,
  imports: [CommonModule, NxtSectionHeaderComponent],
  template: `
    <section class="sports-directory" aria-labelledby="sports-directory-title">
      <div class="sports-directory__header">
        <nxt1-section-header
          titleId="sports-directory-title"
          eyebrow="Universal Sports Directory"
          [headingLevel]="2"
          title="Find Your Sport."
          subtitle="Massive internal sport navigation built for discoverability, crawl depth, and recruiting intent across every major sport."
        />
      </div>

      <nav class="sports-directory__nav" aria-label="Universal sports links">
        <ul class="sports-directory__list" role="list">
          @for (item of links; track item.slug) {
            <li class="sports-directory__item">
              <a
                class="sports-directory__link"
                [attr.href]="item.href"
                [attr.title]="item.sport"
                [attr.aria-label]="'Explore ' + item.sport + ' on NXT1'"
              >
                <span class="sports-directory__sport">{{ item.sport }}</span>
              </a>
            </li>
          }
        </ul>
      </nav>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .sports-directory {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-spacing-6) var(--nxt1-section-padding-x) var(--nxt1-section-padding-y);
      }

      .sports-directory__header {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .sports-directory__nav {
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-2xl);
        padding: var(--nxt1-spacing-5);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-sm);
      }

      .sports-directory__list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--nxt1-spacing-3);
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      @media (max-width: 420px) {
        .sports-directory__list {
          gap: var(--nxt1-spacing-2);
        }

        .sports-directory__link {
          padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        }

        .sports-directory__sport {
          font-size: var(--nxt1-fontSize-sm);
        }
      }

      @media (min-width: 768px) {
        .sports-directory__list {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (min-width: 992px) {
        .sports-directory__list {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }

      .sports-directory__item {
        min-width: 0;
      }

      .sports-directory__link {
        display: block;
        text-decoration: none;
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-bg-secondary);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        transition:
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          transform var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          background var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);
      }

      .sports-directory__link:hover,
      .sports-directory__link:focus-visible {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary10);
        transform: translateY(calc(var(--nxt1-spacing-0_5) * -1));
        outline: none;
      }

      .sports-directory__sport {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      @media (prefers-reduced-motion: reduce) {
        .sports-directory__link {
          transition: none;
          transform: none;
        }

        .sports-directory__link:hover,
        .sports-directory__link:focus-visible {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtUniversalSportsDirectoryComponent {
  readonly links = UNIVERSAL_SPORT_DIRECTORY_LINKS;
}
