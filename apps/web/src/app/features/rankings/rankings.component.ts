/**
 * @fileoverview Rankings Page Component
 * @module @nxt1/web/features/rankings
 *
 * Displays athlete rankings, leaderboards, and performance metrics.
 * Backend-first: All data aggregation and sorting handled by API.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-rankings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rankings-page">
      <header class="page-header">
        <h1 class="page-title">Rankings</h1>
        <p class="page-subtitle">Top athletes across all sports</p>
      </header>

      <main class="page-content">
        <!-- Rankings content will be implemented with shared @nxt1/ui components -->
        <div class="coming-soon">
          <div class="coming-soon-icon">🏆</div>
          <h2>Rankings Coming Soon</h2>
          <p>
            We're building a comprehensive rankings system to showcase top athletic talent. Check
            back soon!
          </p>
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        background: var(--nxt1-color-bg-primary);
      }

      .rankings-page {
        flex: 1;
        padding: var(--nxt1-spacing-6);
        max-width: 1200px;
        margin: 0 auto;
        width: 100%;
      }

      .page-header {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .page-title {
        font-size: var(--nxt1-font-size-3xl);
        font-weight: var(--nxt1-font-weight-bold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2);
      }

      .page-subtitle {
        font-size: var(--nxt1-font-size-lg);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .coming-soon {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--nxt1-spacing-16);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-radius-lg);
      }

      .coming-soon-icon {
        font-size: 4rem;
        margin-bottom: var(--nxt1-spacing-4);
      }

      .coming-soon h2 {
        font-size: var(--nxt1-font-size-xl);
        font-weight: var(--nxt1-font-weight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2);
      }

      .coming-soon p {
        font-size: var(--nxt1-font-size-base);
        color: var(--nxt1-color-text-secondary);
        max-width: 400px;
        margin: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RankingsComponent implements OnInit {
  private readonly logger = inject(NxtLoggingService).child('RankingsComponent');
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Athlete Rankings',
      description:
        'View top-ranked high school athletes across football, basketball, baseball, soccer, and more. Updated weekly with verified stats and recruiting activity.',
      keywords: [
        'athlete rankings',
        'high school rankings',
        'football rankings',
        'basketball rankings',
        'recruiting rankings',
        'sports leaderboard',
        'college recruiting',
        'top athletes',
      ],
      canonicalUrl: '/rankings',
    });

    this.logger.debug('Rankings page initialized');
  }
}
