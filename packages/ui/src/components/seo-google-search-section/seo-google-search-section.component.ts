/**
 * @fileoverview Search Optimized (SEO) Google Search Section
 * @module @nxt1/ui/components/seo-google-search-section
 * @version 1.0.0
 *
 * Shared marketing section that demonstrates NXT1's SEO power by rendering
 * a realistic Google Search mock result showing the athlete's Super Profile
 * ranking #1 for a recruiting search query.
 *
 * Standards:
 * - SSR-safe deterministic IDs (instance counter)
 * - 100% design-token driven — all colors, spacing, typography, radii, shadows
 * - Component-scoped CSS custom properties for layout constraints
 * - Semantic HTML (<section>, <article>, <figure>) for SEO and a11y
 * - Mobile-first responsive layout via min-width breakpoints
 * - Configurable via `input()` signals with sensible defaults
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

let seoGoogleSearchInstanceCounter = 0;

@Component({
  selector: 'nxt1-seo-google-search-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="seo-section" [attr.aria-labelledby]="titleId()">
      <div class="seo-section__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Search Optimized"
          [headingLevel]="2"
          align="center"
          variant="hero"
          [title]="title()"
          [accentText]="accentText()"
          [subtitle]="subtitle()"
          [support]="support()"
        />

        <!-- Google Search Mockup -->
        <article class="google-mock" [attr.aria-labelledby]="mockTitleId()">
          <h3 class="sr-only" [id]="mockTitleId()">
            Google Search results preview showing an NXT1 profile ranked first
          </h3>

          <!-- Search Bar -->
          <div class="google-mock__search-bar" aria-hidden="true">
            <div class="google-mock__search-icon">
              <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
                <path
                  d="M16 16l4 4"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </div>
            <span class="google-mock__query">{{ searchQuery() }}</span>
          </div>

          <!-- Search Metadata -->
          <div class="google-mock__meta" aria-hidden="true">
            <span class="google-mock__meta-text">About 1,240,000 results (0.42 seconds)</span>
          </div>

          <!-- Result #1 — NXT1 Profile (Featured) -->
          <figure
            class="google-mock__result google-mock__result--featured"
            role="img"
            aria-roledescription="search result preview"
            [attr.aria-describedby]="insightId()"
          >
            <figcaption class="sr-only">
              NXT1 Super Profile appearing as the number one Google search result for "{{
                searchQuery()
              }}"
            </figcaption>

            <div class="google-mock__result-url">
              <span class="google-mock__favicon">
                <span class="google-mock__favicon-inner" aria-hidden="true">N</span>
              </span>
              <div class="google-mock__url-stack">
                <span class="google-mock__url-domain">nxt1sports.com</span>
                <span class="google-mock__url-path">{{ resultUrlPath() }}</span>
              </div>
            </div>

            <h4 class="google-mock__result-title">{{ resultTitle() }}</h4>

            <p class="google-mock__result-snippet">
              {{ resultSnippet() }}
            </p>

            <!-- Sitelinks Row -->
            <div class="google-mock__sitelinks">
              @for (link of sitelinks(); track link) {
                <span class="google-mock__sitelink">{{ link }}</span>
              }
            </div>
          </figure>

          <!-- Result #2 — Generic competitor (dimmed) -->
          <div class="google-mock__result google-mock__result--dimmed" aria-hidden="true">
            <div class="google-mock__result-url">
              <span class="google-mock__favicon google-mock__favicon--generic">
                <span class="google-mock__favicon-placeholder"></span>
              </span>
              <div class="google-mock__url-stack">
                <span class="google-mock__url-domain">{{ competitorDomain() }}</span>
                <span class="google-mock__url-path">› rankings › 2026</span>
              </div>
            </div>
            <div class="google-mock__skeleton-title"></div>
            <div class="google-mock__skeleton-snippet">
              <span class="google-mock__skeleton-line"></span>
              <span class="google-mock__skeleton-line google-mock__skeleton-line--short"></span>
            </div>
          </div>

          <!-- Result #3 — Another generic competitor (dimmed) -->
          <div
            class="google-mock__result google-mock__result--dimmed google-mock__result--faded"
            aria-hidden="true"
          >
            <div class="google-mock__result-url">
              <span class="google-mock__favicon google-mock__favicon--generic">
                <span class="google-mock__favicon-placeholder"></span>
              </span>
              <div class="google-mock__url-stack">
                <span class="google-mock__url-domain">{{ competitorDomain2() }}</span>
                <span class="google-mock__url-path">› players</span>
              </div>
            </div>
            <div class="google-mock__skeleton-title"></div>
            <div class="google-mock__skeleton-snippet">
              <span class="google-mock__skeleton-line"></span>
              <span class="google-mock__skeleton-line google-mock__skeleton-line--short"></span>
            </div>
          </div>
        </article>

        <!-- Insight Callout -->
        <aside class="seo-section__insight" [id]="insightId()">
          <div class="seo-section__insight-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
              <path
                d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <p class="seo-section__insight-text">{{ insightText() }}</p>
        </aside>
      </div>
    </section>
  `,
  styles: [
    `
      /* ── Component host ── */
      :host {
        display: block;
        width: 100%;
      }

      /* ── Section container — matches coaches-network, recruitment-pillars ── */
      .seo-section {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      /* ── Shell grid — header + mock + insight ── */
      .seo-section__shell {
        display: grid;
        gap: var(--nxt1-spacing-8);
      }

      /* ── Google Mockup ── */
      .google-mock {
        display: grid;
        gap: var(--nxt1-spacing-2_5);
        max-width: var(--nxt1-section-max-width-narrow);
        margin: 0 auto;
        width: 100%;
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      /* ── Search Bar ── */
      .google-mock__search-bar {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2_5);
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-200);
      }

      .google-mock__search-icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-tertiary);
      }

      .google-mock__query {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-regular);
        line-height: var(--nxt1-lineHeight-normal);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ── Search Meta ── */
      .google-mock__meta {
        padding: 0 var(--nxt1-spacing-2);
      }

      .google-mock__meta-text {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-2xs);
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ── Search Result (shared) ── */
      .google-mock__result {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-3_5) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        margin: 0;
      }

      /* ── Featured result — #1 NXT1 ── */
      .google-mock__result--featured {
        background: linear-gradient(
          168deg,
          var(--nxt1-color-alpha-primary4) 0%,
          var(--nxt1-color-surface-100) 50%
        );
        border: 1px solid var(--nxt1-color-border-primary);
        box-shadow: var(--nxt1-glow-sm);
        position: relative;
      }

      .google-mock__result--featured::before {
        content: '#1';
        position: absolute;
        top: var(--nxt1-spacing-3);
        right: var(--nxt1-spacing-3);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-bg-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-tight);
        line-height: var(--nxt1-lineHeight-tight);
      }

      /* ── Dimmed competitor results ── */
      .google-mock__result--dimmed {
        opacity: 0.45;
        border: 1px solid transparent;
      }

      .google-mock__result--faded {
        opacity: 0.2;
      }

      /* ── Result URL Row ── */
      .google-mock__result-url {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2_5);
      }

      .google-mock__favicon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-7);
        height: var(--nxt1-spacing-7);
        border-radius: var(--nxt1-borderRadius-full);
        background: linear-gradient(
          145deg,
          var(--nxt1-color-primary) 0%,
          var(--nxt1-color-primaryLight) 100%
        );
      }

      .google-mock__favicon-inner {
        color: var(--nxt1-color-bg-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-none);
      }

      .google-mock__favicon--generic {
        background: var(--nxt1-color-surface-300);
      }

      .google-mock__favicon-placeholder {
        display: block;
        width: var(--nxt1-spacing-2_5);
        height: var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-surface-400);
      }

      .google-mock__url-stack {
        display: flex;
        flex-direction: column;
        gap: 0;
        min-width: 0;
      }

      .google-mock__url-domain {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-regular);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .google-mock__url-path {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-2xs);
        line-height: var(--nxt1-lineHeight-tight);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ── Result title ── */
      .google-mock__result-title {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      /* ── Result snippet ── */
      .google-mock__result-snippet {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-regular);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── Sitelinks ── */
      .google-mock__sitelinks {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
        padding-top: var(--nxt1-spacing-1_5);
      }

      .google-mock__sitelink {
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
        white-space: nowrap;
      }

      /* ── Skeleton lines (competitor placeholders) ── */
      .google-mock__skeleton-title {
        width: 60%;
        height: var(--nxt1-spacing-3_5);
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-surface-300);
      }

      .google-mock__skeleton-snippet {
        display: grid;
        gap: var(--nxt1-spacing-1);
      }

      .google-mock__skeleton-line {
        display: block;
        width: 100%;
        height: var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-xs);
        background: var(--nxt1-color-surface-300);
      }

      .google-mock__skeleton-line--short {
        width: 42%;
      }

      /* ── Insight Callout ── */
      .seo-section__insight {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-2_5);
        max-width: var(--nxt1-section-max-width-narrow);
        margin: 0 auto;
        width: 100%;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: linear-gradient(
          to bottom,
          var(--nxt1-color-surface-200),
          var(--nxt1-color-surface-100)
        );
      }

      .seo-section__insight-icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-primary);
      }

      .seo-section__insight-text {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── Accessibility ── */
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

      /* ── Desktop ── */
      @media (min-width: 768px) {
        .google-mock {
          padding: var(--nxt1-spacing-6) var(--nxt1-spacing-8);
        }

        .google-mock__result-title {
          font-size: var(--nxt1-fontSize-xl);
        }

        .google-mock__meta-text {
          font-size: var(--nxt1-fontSize-xs);
        }
      }

      /* ── Mobile adjustments ── */
      @media (max-width: 767px) {
        .google-mock {
          padding: var(--nxt1-spacing-3);
        }

        .google-mock__result {
          padding: var(--nxt1-spacing-3);
        }

        .google-mock__query {
          font-size: var(--nxt1-fontSize-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSeoGoogleSearchSectionComponent {
  private readonly instanceId = ++seoGoogleSearchInstanceCounter;

  // ── Section header inputs ──
  readonly title = input('Be Found');
  readonly accentText = input(' on Google.');
  readonly subtitle = input(
    'We optimize your profile so when scouts search for talent, they find you.'
  );
  readonly support = input(
    '90% of college coaches Google recruits before making contact. Your NXT1 Super Profile is engineered to rank.'
  );

  // ── Google mockup inputs ──
  readonly searchQuery = input('Best QB in Texas 2026');
  readonly resultTitle = input('Jordan Smith — NXT1 Super Profile | Verified Quarterback');
  readonly resultUrlPath = input('› profile › jordan-smith');
  readonly resultSnippet = input(
    'Class of 2026 · Quarterback · 4-Star Verified · 6\'2" 195 lbs · 4.52 40-yard dash · Film, stats, academics, and direct messaging — all in one recruiting profile.'
  );
  readonly sitelinks = input<readonly string[]>(['Highlights', 'Stats', 'Academics', 'Contact']);
  readonly insightText = input(
    'Every NXT1 Super Profile is structured-data optimized, mobile-first indexed, and built to surface in Google search results — so coaches find you before they find the competition.'
  );
  readonly competitorDomain = input('maxpreps.com');
  readonly competitorDomain2 = input('247sports.com');

  // ── Deterministic SSR-safe IDs ──
  readonly titleId = computed(() => `seo-google-search-title-${this.instanceId}`);
  readonly mockTitleId = computed(() => `seo-google-search-mock-title-${this.instanceId}`);
  readonly insightId = computed(() => `seo-google-search-insight-${this.instanceId}`);
}
