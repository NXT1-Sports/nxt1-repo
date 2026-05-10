/**
 * @fileoverview Usage & Billing Page — Auth-Gated Dashboard
 * @module @nxt1/web/features/usage
 * @version 3.0.0
 *
 * Root component for the `/usage` route.
 * Renders the usage dashboard for authenticated users.
 * Logged-out users stay on a lightweight loading state while auth resolves.
 *
 * Architecture:
 * - Reads auth state via AUTH_SERVICE injection token (Signal-based)
 * - Dashboard content is noindex
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
  UsageService,
  type UsageSection,
} from '@nxt1/ui/usage';
import { AUTH_SERVICE, type IAuthService } from '../../core/services/auth/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-usage',
  standalone: true,
  imports: [UsageShellWebComponent, UsageSkeletonComponent],
  template: `
    <!-- Loading: Auth state initializing -->
    @if (isAuthLoading()) {
      <nxt1-usage-skeleton />
    }

    <!-- Authenticated: Show actual billing & usage dashboard -->
    @else if (isAuthenticated()) {
      <nxt1-usage-shell-web />
    }

    <!-- Unauthenticated: keep a lightweight state (landing removed) -->
    @else {
      <nxt1-usage-skeleton />
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
    'auto-topup',
    'breakdown',
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

    this.seo.updatePage({
      title: 'Billing & Usage',
      description: 'Manage your billing, usage, and payment details for your NXT1 account.',
      keywords: ['billing', 'usage', 'payments', 'subscriptions', 'invoices'],
      noIndex: true,
    });
  }
}
