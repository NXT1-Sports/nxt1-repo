/**
 * @fileoverview Landing Page Component
 * @module @nxt1/web/features/landing
 *
 * Public landing page for unauthenticated users.
 * Showcases NXT1 value proposition with hero header and audience cards.
 *
 * Features:
 * - SEO-optimized with proper meta tags
 * - Full-page hero with animated background
 * - 4 audience-specific CTAs
 * - Responsive design (mobile-first)
 * - 100% theme-aware styling
 *
 * @example
 * // In routes:
 * { path: 'welcome', loadComponent: () => import('./landing.component') }
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NxtHeroHeaderComponent, type HeroAudienceCardClickEvent } from '@nxt1/ui';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule, NxtHeroHeaderComponent],
  template: `
    <!-- Hero Section with Audience Cards -->
    <nxt1-hero-header
      headline=""
      subheadline="The ultimate platform for high school and club athletes to get recruited."
      [showLogo]="false"
      [showPrimaryCta]="true"
      [showAnimatedBg]="true"
      [showTrustBadges]="true"
      [showAppBadges]="true"
      (cardClick)="onAudienceCardClick($event)"
    />

    <!-- Additional Sections Can Go Here -->
    <section class="features-section bg-bg-secondary py-16 lg:py-24">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="text-center">
          <h2 class="font-brand text-text-primary text-3xl font-bold sm:text-4xl">
            Why Athletes Choose NXT1
          </h2>
          <p class="text-text-secondary mt-4 text-lg">
            Everything you need to get discovered by college coaches
          </p>
        </div>

        <div class="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <!-- Feature 1 -->
          <div
            class="border-border bg-surface-200 hover:border-border-primary hover:shadow-glow/10 rounded-2xl border p-6 transition-all hover:shadow-lg"
          >
            <div
              class="bg-alpha-primary10 mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
            >
              <span class="text-2xl">🎥</span>
            </div>
            <h3 class="text-text-primary text-xl font-semibold">Highlight Reels</h3>
            <p class="text-text-secondary mt-2">
              Showcase your best plays with professional-grade highlight videos that get coaches'
              attention.
            </p>
          </div>

          <!-- Feature 2 -->
          <div
            class="border-border bg-surface-200 hover:border-border-primary hover:shadow-glow/10 rounded-2xl border p-6 transition-all hover:shadow-lg"
          >
            <div
              class="bg-alpha-primary10 mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
            >
              <span class="text-2xl">📊</span>
            </div>
            <h3 class="text-text-primary text-xl font-semibold">Verified Stats</h3>
            <p class="text-text-secondary mt-2">
              Display your athletic achievements with verified statistics that coaches can trust.
            </p>
          </div>

          <!-- Feature 3 -->
          <div
            class="border-border bg-surface-200 hover:border-border-primary hover:shadow-glow/10 rounded-2xl border p-6 transition-all hover:shadow-lg"
          >
            <div
              class="bg-alpha-primary10 mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
            >
              <span class="text-2xl">🔗</span>
            </div>
            <h3 class="text-text-primary text-xl font-semibold">Direct Messaging</h3>
            <p class="text-text-secondary mt-2">
              Connect directly with college coaches and recruiters who are actively looking for
              talent like you.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Call to Action Section -->
    <section class="cta-section from-surface-100 to-bg-primary bg-gradient-to-br py-16 lg:py-24">
      <div class="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 class="font-brand text-text-primary text-3xl font-bold sm:text-4xl lg:text-5xl">
          Ready to Get
          <span class="from-primary to-secondary bg-gradient-to-r bg-clip-text text-transparent">
            Recruited?
          </span>
        </h2>
        <p class="text-text-secondary mx-auto mt-4 max-w-2xl text-lg">
          Join thousands of athletes who have connected with college programs through NXT1.
        </p>
        <div class="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            routerLink="/auth/register"
            class="bg-primary text-text-inverse hover:bg-primaryLight hover:shadow-glow inline-flex items-center justify-center gap-2 rounded-xl px-8 py-4 text-lg font-semibold shadow-lg transition-all duration-300 hover:shadow-xl"
          >
            Create Free Profile
          </a>
          <a
            routerLink="/explore"
            class="border-border text-text-primary hover:border-border-strong hover:bg-surface-200 inline-flex items-center justify-center gap-2 rounded-xl border bg-transparent px-8 py-4 text-lg font-semibold transition-all duration-300"
          >
            Browse Athletes
          </a>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnInit {
  private readonly seoService = inject(SeoService);

  ngOnInit(): void {
    this.seoService.updatePage({
      title: 'NXT1 Sports - The Future of Sports Recruiting',
      description:
        'Build your recruiting profile, connect with college coaches, and showcase your athletic talent. NXT1 is the ultimate platform for high school and club athletes to get discovered.',
      keywords: [
        'sports recruiting',
        'college recruiting',
        'high school athletes',
        'athletic profile',
        'college coaches',
        'NCAA recruiting',
      ],
    });
  }

  onAudienceCardClick(event: HeroAudienceCardClickEvent): void {
    console.log('Audience card clicked:', event.card.id);
    // Analytics tracking could be added here
  }
}
