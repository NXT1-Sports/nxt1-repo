/**
 * @fileoverview Usage & Billing Page — Auth-Aware Dual State
 * @module @nxt1/web/features/usage
 * @version 3.0.0
 *
 * Root component for the `/usage` route.
 * Implements the professional dual-state pattern (LinkedIn/Strava/GitHub):
 *
 * - **Logged out** → Marketing landing page with feature showcase & dashboard preview
 * - **Logged in** → Actual billing & usage dashboard (web shell)
 *
 * Same URL, different experience. SEO-optimized for both states.
 * SSR-safe with proper meta tags regardless of auth state.
 *
 * Architecture:
 * - Reads auth state via AUTH_SERVICE injection token (Signal-based)
 * - Landing page content is indexable; dashboard is noindex
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  OnInit,
  DestroyRef,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  UsageShellWebComponent,
  UsageSkeletonComponent,
  NxtUsageLandingComponent,
  UsageService,
  type UsageSection,
} from '@nxt1/ui/usage';
import { AUTH_SERVICE, type IAuthService } from '../../core/services/auth/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-usage',
  standalone: true,
  imports: [UsageShellWebComponent, UsageSkeletonComponent, NxtUsageLandingComponent],
  template: `
    <!-- Loading: Auth state initializing -->
    @if (isAuthLoading()) {
      <nxt1-usage-skeleton />
    }

    <!-- Authenticated: Show actual billing & usage dashboard -->
    @else if (isAuthenticated()) {
      <nxt1-usage-shell-web />
    }

    <!-- Unauthenticated: Show marketing landing page -->
    @else {
      <nxt1-usage-landing />
    }
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
export class UsageComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly seo = inject(SeoService);
  private readonly route = inject(ActivatedRoute);
  private readonly usage = inject(UsageService);
  private readonly destroyRef = inject(DestroyRef);

  /** Auth state signals */
  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly isAuthLoading = computed(
    () => !this.authService.isInitialized() || this.authService.isLoading()
  );

  private readonly usageSections: readonly UsageSection[] = [
    'overview',
    'metered-usage',
    'breakdown',
    'payment-history',
    'budgets',
    'payment-info',
  ] as const;

  private toUsageSection(value: string | null): UsageSection | null {
    if (!value) return null;
    return this.usageSections.includes(value as UsageSection) ? (value as UsageSection) : null;
  }

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(
        map((params) => this.toUsageSection(params.get('section'))),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((section) => {
        if (section) {
          this.usage.setActiveSection(section);
        }
      });

    if (this.isAuthenticated()) {
      this.seo.updatePage({
        title: 'Billing & Usage',
        description: 'Manage your billing, usage, and payment details for your NXT1 account.',
        keywords: ['billing', 'usage', 'payments', 'subscriptions', 'invoices'],
        noIndex: true,
      });
    } else {
      this.seo.updatePage({
        title: 'Billing & Usage — Transparent Pricing, Zero Surprises | NXT1',
        description:
          'Track usage, manage subscriptions, set spending budgets, and download receipts. Clear, honest billing for athletes, coaches, and programs on NXT1.',
        keywords: [
          'sports billing',
          'usage tracking',
          'subscription management',
          'payment history',
          'spending budgets',
          'NXT1 pricing',
        ],
      });
    }
  }
}
