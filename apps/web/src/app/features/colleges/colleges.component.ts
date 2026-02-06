/**
 * @fileoverview Colleges Page Component
 * @module @nxt1/web/features/colleges
 *
 * Displays college search, information, and recruiting details.
 * Backend-first: All data fetched from API with server-side filtering.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtLoggingService } from '@nxt1/ui';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-colleges',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="colleges-page">
      <header class="page-header">
        <h1 class="page-title">Colleges</h1>
        <p class="page-subtitle">Find your perfect college match</p>
      </header>

      <main class="page-content">
        <!-- Colleges content will be implemented with shared @nxt1/ui components -->
        <div class="coming-soon">
          <div class="coming-soon-icon">🎓</div>
          <h2>College Search Coming Soon</h2>
          <p>
            We're building a powerful college search tool to help you find the perfect fit for your
            athletic and academic goals. Check back soon!
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

      .colleges-page {
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
export class CollegesComponent implements OnInit {
  private readonly logger = inject(NxtLoggingService).child('CollegesComponent');
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'College Search',
      description:
        'Search 2,000+ NCAA, NAIA, and NJCAA college athletic programs. Find schools by sport, division, location, and academic programs. Connect with coaches and explore scholarship opportunities.',
      keywords: [
        'college search',
        'college recruiting',
        'NCAA schools',
        'NAIA colleges',
        'college athletics',
        'sports scholarships',
        'college coaches',
        'recruiting database',
        'college programs',
      ],
      canonicalUrl: '/colleges',
    });

    this.logger.debug('Colleges page initialized');
  }
}
