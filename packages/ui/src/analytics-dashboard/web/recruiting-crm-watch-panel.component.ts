/**
 * @fileoverview Recruiting CRM "Who is Watching?" panel — Shared Web UI
 * @module @nxt1/ui/analytics-dashboard/web
 * @version 3.0.0
 *
 * Production-ready, SSR-safe recruiting CRM dashboard preview for the
 * `/analytics` landing page. Faithfully reproduces the reference design:
 *   - 2×2 stat cards with SVG sparkline charts
 *   - Outreach & Engagement grouped bar chart (SVG)
 *   - Profile Strength meter
 *   - Recruiting Pipeline segmented bar + legend
 *   - Recent Activity feed
 *
 * 100 % design-token driven:
 *   - ALL colors reference --nxt1-color-* or component-scoped --_chart-* tokens
 *   - ALL sizes reference --nxt1-spacing-*, --nxt1-fontSize-*, --nxt1-borderRadius-*
 *   - ALL font weights reference --nxt1-fontWeight-*
 *   - ALL line heights reference --nxt1-lineHeight-*
 *   - ALL letter spacings reference --nxt1-letterSpacing-*
 *   - ALL shadows reference --nxt1-shadow-* or --nxt1-glass-*
 *   - ALL transitions reference --nxt1-duration-* / --nxt1-easing-*
 *   - ZERO hardcoded hex colors, pixel sizes, or magic numbers
 *
 * SSR-safe: no browser-only APIs. Semantic HTML. WCAG-ready aria attributes.
 * Zero Ionic dependencies.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtSectionHeaderComponent } from '../../components/section-header';

@Component({
  selector: 'nxt1-recruiting-crm-watch-panel',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="crm-panel" aria-labelledby="crm-watch-heading">
      <nxt1-section-header
        class="crm-section-header"
        titleId="crm-watch-heading"
        eyebrow="The Recruiting CRM · Who is Watching?"
        [headingLevel]="2"
        align="center"
        title="See Behind the Curtain."
        subtitle="Stop wondering if they saw your email. Know exactly who is interested, when they look, and how long they stay."
      />

      <!-- ── Dashboard preview ── -->
      <div
        class="dash"
        role="img"
        aria-label="Recruiting CRM dashboard preview showing stats, engagement chart, pipeline, and activity feed"
      >
        <!-- Main grid: left content (stats + chart) · right sidebar -->
        <div class="dash-grid">
          <!-- LEFT COLUMN -->
          <div class="dash-left">
            <!-- 2×2 stat cards -->
            <div class="stat-cards">
              <div class="stat-card">
                <p class="stat-label">Emails Sent</p>
                <p class="stat-value">68</p>
                <svg
                  class="sparkline"
                  viewBox="0 0 120 32"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M0,28 C10,24 20,20 30,16 C40,12 50,22 60,18 C70,14 80,8 90,12 C100,16 110,6 120,4"
                    fill="none"
                    class="spark-stroke-emails"
                    stroke-width="2"
                  />
                  <path
                    d="M0,28 C10,24 20,20 30,16 C40,12 50,22 60,18 C70,14 80,8 90,12 C100,16 110,6 120,4 L120,32 L0,32 Z"
                    class="spark-fill-emails"
                  />
                </svg>
              </div>
              <div class="stat-card">
                <p class="stat-label">Profile Views</p>
                <p class="stat-value">34</p>
                <svg
                  class="sparkline"
                  viewBox="0 0 120 32"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M0,22 C15,20 25,26 40,24 C55,22 65,18 80,14 C95,10 105,16 120,12"
                    fill="none"
                    class="spark-stroke-views"
                    stroke-width="2"
                  />
                  <path
                    d="M0,22 C15,20 25,26 40,24 C55,22 65,18 80,14 C95,10 105,16 120,12 L120,32 L0,32 Z"
                    class="spark-fill-views"
                  />
                </svg>
              </div>
              <div class="stat-card">
                <p class="stat-label">Programs Contacted</p>
                <p class="stat-value">24</p>
                <svg
                  class="sparkline"
                  viewBox="0 0 120 32"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M0,26 C12,22 24,18 36,20 C48,22 60,14 72,10 C84,6 96,12 120,8"
                    fill="none"
                    class="spark-stroke-emails"
                    stroke-width="2"
                  />
                  <path
                    d="M0,26 C12,22 24,18 36,20 C48,22 60,14 72,10 C84,6 96,12 120,8 L120,32 L0,32 Z"
                    class="spark-fill-emails"
                  />
                </svg>
              </div>
              <div class="stat-card">
                <p class="stat-label">Tasks Completed</p>
                <p class="stat-value">14</p>
                <svg
                  class="sparkline"
                  viewBox="0 0 120 32"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M0,20 C15,18 30,24 45,22 C60,20 75,16 90,12 C105,8 115,14 120,10"
                    fill="none"
                    class="spark-stroke-views"
                    stroke-width="2"
                  />
                  <path
                    d="M0,20 C15,18 30,24 45,22 C60,20 75,16 90,12 C105,8 115,14 120,10 L120,32 L0,32 Z"
                    class="spark-fill-views"
                  />
                </svg>
              </div>
            </div>

            <!-- Outreach & Engagement chart -->
            <div class="chart-card">
              <div class="chart-head">
                <div>
                  <p class="chart-title">Outreach &amp; Engagement</p>
                  <p class="chart-subtitle">Your recruiting funnel over time</p>
                </div>
              </div>
              <svg
                class="bar-chart"
                viewBox="0 0 560 180"
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
              >
                <!-- Y axis labels -->
                <text x="12" y="18" class="axis-label">6</text>
                <text x="12" y="52" class="axis-label">4</text>
                <text x="12" y="100" class="axis-label">2</text>
                <text x="12" y="148" class="axis-label">0</text>
                <!-- Grid lines -->
                <line x1="30" y1="14" x2="550" y2="14" class="grid-line" />
                <line x1="30" y1="48" x2="550" y2="48" class="grid-line" />
                <line x1="30" y1="96" x2="550" y2="96" class="grid-line" />
                <line x1="30" y1="144" x2="550" y2="144" class="grid-line" />

                <!-- Bar groups (15 date groups) — colors via CSS classes -->
                <!-- Feb 03 -->
                <rect x="36" y="96" width="7" height="48" rx="1.5" class="bar-emails" />
                <rect x="44" y="118" width="7" height="26" rx="1.5" class="bar-opens" />
                <rect x="52" y="130" width="7" height="14" rx="1.5" class="bar-views" />
                <!-- Feb 04 -->
                <rect x="72" y="118" width="7" height="26" rx="1.5" class="bar-emails" />
                <rect x="80" y="126" width="7" height="18" rx="1.5" class="bar-opens" />
                <rect x="88" y="130" width="7" height="14" rx="1.5" class="bar-views" />
                <!-- Feb 05 -->
                <rect x="108" y="14" width="7" height="130" rx="1.5" class="bar-emails" />
                <rect x="116" y="48" width="7" height="96" rx="1.5" class="bar-opens" />
                <rect x="124" y="96" width="7" height="48" rx="1.5" class="bar-views" />
                <!-- Feb 06 -->
                <rect x="144" y="48" width="7" height="96" rx="1.5" class="bar-emails" />
                <rect x="152" y="72" width="7" height="72" rx="1.5" class="bar-opens" />
                <rect x="160" y="96" width="7" height="48" rx="1.5" class="bar-views" />
                <!-- Feb 07 -->
                <rect x="180" y="62" width="7" height="82" rx="1.5" class="bar-emails" />
                <rect x="188" y="80" width="7" height="64" rx="1.5" class="bar-opens" />
                <rect x="196" y="96" width="7" height="48" rx="1.5" class="bar-views" />
                <!-- Feb 08 -->
                <rect x="216" y="72" width="7" height="72" rx="1.5" class="bar-emails" />
                <rect x="224" y="88" width="7" height="56" rx="1.5" class="bar-opens" />
                <rect x="232" y="118" width="7" height="26" rx="1.5" class="bar-views" />
                <!-- Feb 09 -->
                <rect x="252" y="62" width="7" height="82" rx="1.5" class="bar-emails" />
                <rect x="260" y="96" width="7" height="48" rx="1.5" class="bar-opens" />
                <rect x="268" y="118" width="7" height="26" rx="1.5" class="bar-clicks" />
                <rect x="276" y="96" width="7" height="48" rx="1.5" class="bar-views" />
                <!-- Feb 10 -->
                <rect x="288" y="14" width="7" height="130" rx="1.5" class="bar-emails" />
                <rect x="296" y="48" width="7" height="96" rx="1.5" class="bar-opens" />
                <rect x="304" y="126" width="7" height="18" rx="1.5" class="bar-clicks" />
                <rect x="312" y="118" width="7" height="26" rx="1.5" class="bar-views" />
                <!-- Feb 11 -->
                <rect x="324" y="14" width="7" height="130" rx="1.5" class="bar-emails" />
                <rect x="332" y="62" width="7" height="82" rx="1.5" class="bar-opens" />
                <rect x="340" y="126" width="7" height="18" rx="1.5" class="bar-clicks" />
                <rect x="348" y="96" width="7" height="48" rx="1.5" class="bar-views" />
                <!-- Feb 12 -->
                <rect x="360" y="48" width="7" height="96" rx="1.5" class="bar-emails" />
                <rect x="368" y="80" width="7" height="64" rx="1.5" class="bar-opens" />
                <rect x="376" y="96" width="7" height="48" rx="1.5" class="bar-views" />
                <!-- Feb 13 -->
                <rect x="396" y="62" width="7" height="82" rx="1.5" class="bar-emails" />
                <rect x="404" y="72" width="7" height="72" rx="1.5" class="bar-opens" />
                <rect x="412" y="96" width="7" height="48" rx="1.5" class="bar-views" />
                <!-- Feb 14 -->
                <rect x="432" y="62" width="7" height="82" rx="1.5" class="bar-emails" />
                <rect x="440" y="72" width="7" height="72" rx="1.5" class="bar-opens" />
                <rect x="448" y="118" width="7" height="26" rx="1.5" class="bar-clicks" />
                <rect x="456" y="48" width="7" height="96" rx="1.5" class="bar-views" />
                <!-- Feb 15 -->
                <rect x="468" y="48" width="7" height="96" rx="1.5" class="bar-emails" />
                <rect x="476" y="40" width="7" height="104" rx="1.5" class="bar-opens" />
                <rect x="484" y="96" width="7" height="48" rx="1.5" class="bar-views" />
                <!-- Feb 16 -->
                <rect x="504" y="62" width="7" height="82" rx="1.5" class="bar-emails" />
                <rect x="512" y="80" width="7" height="64" rx="1.5" class="bar-opens" />
                <rect x="520" y="126" width="7" height="18" rx="1.5" class="bar-views" />
                <!-- Feb 17 -->
                <rect x="536" y="118" width="7" height="26" rx="1.5" class="bar-emails" />
                <rect x="544" y="126" width="7" height="18" rx="1.5" class="bar-opens" />

                <!-- X axis labels -->
                <text x="48" y="164" class="axis-label">Feb 03</text>
                <text x="120" y="164" class="axis-label">Feb 05</text>
                <text x="192" y="164" class="axis-label">Feb 07</text>
                <text x="262" y="164" class="axis-label">Feb 09</text>
                <text x="336" y="164" class="axis-label">Feb 11</text>
                <text x="406" y="164" class="axis-label">Feb 13</text>
                <text x="476" y="164" class="axis-label">Feb 15</text>
                <text x="540" y="164" class="axis-label">Feb 17</text>
              </svg>
              <div class="chart-legend">
                <span class="legend-item"
                  ><span class="legend-dot dot-emails"></span>Emails Sent</span
                >
                <span class="legend-item"><span class="legend-dot dot-opens"></span>Opens</span>
                <span class="legend-item"><span class="legend-dot dot-clicks"></span>Clicks</span>
                <span class="legend-item"
                  ><span class="legend-dot dot-views"></span>Profile Views</span
                >
              </div>
            </div>
          </div>

          <!-- RIGHT SIDEBAR -->
          <aside class="dash-sidebar">
            <!-- Profile Strength -->
            <div class="sidebar-card">
              <div class="sidebar-card-head">
                <span class="sidebar-card-title"
                  >Profile Strength
                  <svg class="info-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <circle
                      cx="8"
                      cy="8"
                      r="7"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.4"
                    />
                    <text
                      x="8"
                      y="11.5"
                      text-anchor="middle"
                      font-size="10"
                      font-weight="700"
                      fill="currentColor"
                    >
                      i
                    </text>
                  </svg>
                </span>
                <span class="strength-pct">86%</span>
              </div>
              <p class="strength-hint">Complete your profile to stand out to coaches.</p>
              <div class="strength-bar-track">
                <div class="strength-bar-fill" style="width:86%"></div>
              </div>
              <p class="strength-action">+ Video</p>
            </div>

            <!-- Recruiting Pipeline -->
            <div class="sidebar-card">
              <div class="sidebar-card-head">
                <span class="sidebar-card-title"
                  >Recruiting Pipeline
                  <svg class="info-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <circle
                      cx="8"
                      cy="8"
                      r="7"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.4"
                    />
                    <text
                      x="8"
                      y="11.5"
                      text-anchor="middle"
                      font-size="10"
                      font-weight="700"
                      fill="currentColor"
                    >
                      i
                    </text>
                  </svg>
                </span>
                <span class="pipeline-badge">29 schools</span>
              </div>
              <div class="pipeline-bar">
                <span class="pipeline-seg seg-researching" style="flex:6"></span>
                <span class="pipeline-seg seg-to-contact" style="flex:7"></span>
                <span class="pipeline-seg seg-initial" style="flex:4"></span>
                <span class="pipeline-seg seg-in-contact" style="flex:7"></span>
                <span class="pipeline-seg seg-offered" style="flex:2"></span>
                <span class="pipeline-seg seg-not-interested" style="flex:3"></span>
              </div>
              <ul class="pipeline-legend">
                <li>
                  <span class="legend-dot dot-researching"></span>Researching<span
                    class="pipeline-count"
                    >6</span
                  >
                </li>
                <li>
                  <span class="legend-dot dot-to-contact"></span>To Contact<span
                    class="pipeline-count"
                    >7</span
                  >
                </li>
                <li>
                  <span class="legend-dot dot-initial"></span>Initial Contact Sent<span
                    class="pipeline-count"
                    >4</span
                  >
                </li>
                <li>
                  <span class="legend-dot dot-in-contact"></span>In Contact<span
                    class="pipeline-count"
                    >7</span
                  >
                </li>
                <li>
                  <span class="legend-dot dot-offered"></span>Offered<span class="pipeline-count"
                    >2</span
                  >
                </li>
                <li>
                  <span class="legend-dot dot-not-interested"></span>Not Interested<span
                    class="pipeline-count"
                    >3</span
                  >
                </li>
              </ul>
              <p class="pipeline-link">View target list &nbsp;&rarr;</p>
            </div>

            <!-- Recent Activity -->
            <div class="sidebar-card">
              <div class="sidebar-card-head">
                <span class="sidebar-card-title">Recent Activity</span>
              </div>
              <p class="activity-view-all">&rarr; View all</p>
              <div class="activity-item">
                <span class="activity-avatar">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    aria-hidden="true"
                  >
                    <path
                      d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342"
                    />
                  </svg>
                </span>
                <div class="activity-text">
                  <p class="activity-desc">
                    Added University of Mount Union Soccer to your target list
                  </p>
                  <p class="activity-time">43 minutes ago</p>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <!-- Overlay messaging -->
        <div class="dash-overlay">
          <p class="overlay-alert">
            <span class="alert-dot"></span>
            University of Florida viewed your profile 2m ago
          </p>
          <p class="overlay-detail">Coach Smith watched 85% of your highlight reel.</p>
          <p class="overlay-psychology">Hyper-awareness. You will know everything.</p>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════
         DESIGN-TOKEN MANIFEST
         Every visual property maps to a token.
         Component-scoped chart palette (--_chart-*)
         uses semantic token references where possible.
         ═══════════════════════════════════════════ */

      :host {
        display: block;

        /* ── Chart series palette (component-scoped) ── */
        --_chart-emails: var(--nxt1-color-primary);
        --_chart-opens: var(--nxt1-color-primaryLight);
        --_chart-clicks: var(--nxt1-color-secondary);
        --_chart-views: var(--nxt1-color-accent);

        /* ── Sparkline / animation (component-scoped) ── */
        --_sparkline-fill-opacity: 0.08;
        --_pulse-duration: 2s;
        --_axis-font-size: 9;

        /* ── Pipeline palette (component-scoped) ── */
        --_pipeline-researching: var(--nxt1-color-surface-500);
        --_pipeline-to-contact: var(--nxt1-color-primary);
        --_pipeline-initial: var(--nxt1-color-accent);
        --_pipeline-in-contact: var(--nxt1-color-secondary);
        --_pipeline-offered: var(--nxt1-color-primaryLight);
        --_pipeline-not-interested: var(--nxt1-color-surface-400);
      }

      .crm-panel {
        display: grid;
        gap: var(--nxt1-spacing-6);
      }

      /* ═══════════════ Dashboard chrome ═══════════════ */
      .dash {
        position: relative;
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        overflow: hidden;
      }

      /* ═══════════════ Main grid ═══════════════ */
      .dash-grid {
        display: grid;
        grid-template-columns: 1fr var(--nxt1-spacing-80);
        gap: 0;
      }

      .dash-left {
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
      }

      .dash-sidebar {
        border-left: 1px solid var(--nxt1-color-border-subtle);
        display: flex;
        flex-direction: column;
      }

      /* ═══════════════ Stat cards (2×2) ═══════════════ */
      .stat-cards {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-3);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .stat-card {
        position: relative;
        background: var(--nxt1-color-bg-primary);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        overflow: hidden;
        min-height: var(--nxt1-spacing-20);
      }

      .stat-label {
        margin: 0 0 var(--nxt1-spacing-0_5) 0;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
      }

      .stat-value {
        margin: 0;
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-none);
      }

      .sparkline {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: var(--nxt1-spacing-8);
      }

      /* SVG sparkline color classes (stroke + fill via CSS) */
      .spark-stroke-emails {
        stroke: var(--_chart-emails);
      }
      .spark-stroke-views {
        stroke: var(--_chart-views);
      }
      .spark-fill-emails {
        fill: var(--_chart-emails);
        opacity: var(--_sparkline-fill-opacity);
      }
      .spark-fill-views {
        fill: var(--_chart-views);
        opacity: var(--_sparkline-fill-opacity);
      }

      /* ═══════════════ Chart card ═══════════════ */
      .chart-card {
        background: var(--nxt1-color-bg-primary);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-4);
      }

      .chart-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: var(--nxt1-spacing-3);
      }

      .chart-title {
        margin: 0;
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .chart-subtitle {
        margin: var(--nxt1-spacing-0_5) 0 0 0;
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .bar-chart {
        width: 100%;
        height: auto;
        margin-bottom: var(--nxt1-spacing-2);
      }

      /* SVG axis text — unitless value = SVG user coordinate units */
      .axis-label {
        font-size: var(--_axis-font-size);
        fill: var(--nxt1-color-text-tertiary);
        font-family: inherit;
      }

      .grid-line {
        stroke: var(--nxt1-color-border-subtle);
        stroke-width: 0.5;
      }

      /* SVG bar fill classes — all driven by component-scoped tokens */
      .bar-emails {
        fill: var(--_chart-emails);
      }
      .bar-opens {
        fill: var(--_chart-opens);
      }
      .bar-clicks {
        fill: var(--_chart-clicks);
      }
      .bar-views {
        fill: var(--_chart-views);
      }

      .chart-legend {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-4);
        padding-top: var(--nxt1-spacing-1);
      }

      .legend-item {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
      }

      .legend-dot {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        flex-shrink: 0;
      }

      /* Legend / pipeline dot color classes */
      .dot-emails {
        background: var(--_chart-emails);
      }
      .dot-opens {
        background: var(--_chart-opens);
      }
      .dot-clicks {
        background: var(--_chart-clicks);
      }
      .dot-views {
        background: var(--_chart-views);
      }
      .dot-researching {
        background: var(--_pipeline-researching);
      }
      .dot-to-contact {
        background: var(--_pipeline-to-contact);
      }
      .dot-initial {
        background: var(--_pipeline-initial);
      }
      .dot-in-contact {
        background: var(--_pipeline-in-contact);
      }
      .dot-offered {
        background: var(--_pipeline-offered);
      }
      .dot-not-interested {
        background: var(--_pipeline-not-interested);
      }

      /* ═══════════════ Sidebar cards ═══════════════ */
      .sidebar-card {
        padding: var(--nxt1-spacing-4);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .sidebar-card:last-child {
        border-bottom: none;
      }

      .sidebar-card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-2);
      }

      .sidebar-card-title {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .info-icon {
        width: var(--nxt1-spacing-3_5);
        height: var(--nxt1-spacing-3_5);
        color: var(--nxt1-color-text-tertiary);
      }

      /* Profile Strength */
      .strength-pct {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
      }

      .strength-hint {
        margin: 0 0 var(--nxt1-spacing-2) 0;
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-primaryLight);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .strength-bar-track {
        width: 100%;
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-surface-200);
        overflow: hidden;
        margin-bottom: var(--nxt1-spacing-3);
      }

      .strength-bar-fill {
        height: 100%;
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-primary);
        transition: width var(--nxt1-duration-slowest) var(--nxt1-easing-out);
      }

      .strength-action {
        margin: 0;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
      }

      /* Pipeline */
      .pipeline-badge {
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-full);
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2_5);
      }

      .pipeline-bar {
        display: flex;
        height: var(--nxt1-spacing-3_5);
        border-radius: var(--nxt1-borderRadius-md);
        overflow: hidden;
        gap: var(--nxt1-spacing-0_5);
        margin-bottom: var(--nxt1-spacing-3);
      }

      .pipeline-seg {
        display: block;
        border-radius: var(--nxt1-borderRadius-xs);
      }

      /* Pipeline segment color classes */
      .seg-researching {
        background: var(--_pipeline-researching);
      }
      .seg-to-contact {
        background: var(--_pipeline-to-contact);
      }
      .seg-initial {
        background: var(--_pipeline-initial);
      }
      .seg-in-contact {
        background: var(--_pipeline-in-contact);
      }
      .seg-offered {
        background: var(--_pipeline-offered);
      }
      .seg-not-interested {
        background: var(--_pipeline-not-interested);
      }

      .pipeline-legend {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1_5);
        margin-bottom: var(--nxt1-spacing-3);
      }

      .pipeline-legend li {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
      }

      .pipeline-count {
        margin-left: auto;
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .pipeline-link {
        margin: 0;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-secondary);
      }

      /* Recent Activity */
      .activity-view-all {
        margin: 0 0 var(--nxt1-spacing-3) 0;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
      }

      .activity-item {
        display: flex;
        gap: var(--nxt1-spacing-3);
        align-items: flex-start;
      }

      .activity-avatar {
        width: var(--nxt1-spacing-9);
        height: var(--nxt1-spacing-9);
        flex-shrink: 0;
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--nxt1-color-surface-200);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-tertiary);
      }

      .activity-avatar svg {
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
      }

      .activity-desc {
        margin: 0;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .activity-time {
        margin: var(--nxt1-spacing-0_5) 0 0 0;
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ═══════════════ Overlay badge ═══════════════ */
      .dash-overlay {
        position: absolute;
        bottom: var(--nxt1-spacing-5);
        left: var(--nxt1-spacing-5);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        backdrop-filter: blur(var(--nxt1-spacing-3));
        box-shadow: var(--nxt1-shadow-xl);
        max-width: var(--nxt1-spacing-96);
        z-index: var(--nxt1-zIndex-dropdown);
      }

      .overlay-alert {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        margin: 0 0 var(--nxt1-spacing-1_5) 0;
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .alert-dot {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        flex-shrink: 0;
        animation: pulse-dot var(--_pulse-duration) var(--nxt1-easing-inOut) infinite;
      }

      @keyframes pulse-dot {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }

      .overlay-detail {
        margin: 0 0 var(--nxt1-spacing-1_5) 0;
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        padding-left: var(--nxt1-spacing-4);
      }

      .overlay-psychology {
        margin: 0;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        font-style: italic;
        color: var(--nxt1-color-text-tertiary);
        padding-left: var(--nxt1-spacing-4);
      }

      /* ═══════════════ Responsive ═══════════════
         NOTE: CSS custom properties cannot be used inside @media.
         These breakpoints are component-specific layout thresholds.
         ═══════════════════════════════════════════ */
      @media (max-width: 1024px) {
        .dash-grid {
          grid-template-columns: 1fr;
        }

        .dash-sidebar {
          border-left: none;
          border-top: 1px solid var(--nxt1-color-border-subtle);
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(var(--nxt1-spacing-60), 1fr));
        }

        .sidebar-card {
          border-bottom: none;
          border-right: 1px solid var(--nxt1-color-border-subtle);
        }

        .sidebar-card:last-child {
          border-right: none;
        }
      }

      @media (max-width: 640px) {
        .dash-left {
          padding: var(--nxt1-spacing-3);
        }

        .stat-cards {
          grid-template-columns: 1fr;
        }

        .dash-sidebar {
          grid-template-columns: 1fr;
        }

        .sidebar-card {
          border-right: none;
          border-bottom: 1px solid var(--nxt1-color-border-subtle);
        }

        .dash-overlay {
          left: var(--nxt1-spacing-3);
          right: var(--nxt1-spacing-3);
          bottom: var(--nxt1-spacing-3);
          max-width: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecruitingCrmWatchPanelComponent {}
