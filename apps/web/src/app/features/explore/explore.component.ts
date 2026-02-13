/**
 * @fileoverview Explore Page - Web App Wrapper
 * @module @nxt1/web/features/explore
 * @version 2.0.0
 *
 * Thin wrapper component that imports the shared Explore shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ USES WEB-OPTIMIZED SHELL FOR GRADE A+ SEO ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthService
 */

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import {
  ExploreShellWebComponent,
  NxtSidenavService,
  NxtLoggingService,
  NxtPlatformService,
  type ExploreUser,
} from '@nxt1/ui';
import type { ExploreItem, ScoutReport } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [ExploreShellWebComponent],
  template: `
    <nxt1-explore-shell-web
      [user]="userInfo()"
      [hideHeader]="isDesktop()"
      (avatarClick)="onAvatarClick()"
      (itemClick)="onItemClick($event)"
      (scoutReportSelect)="onScoutReportSelect($event)"
      (scoutReportFiltersOpen)="onScoutReportFiltersOpen()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreComponent {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('ExploreComponent');
  private readonly seo = inject(SeoService);
  private readonly platform = inject(NxtPlatformService);

  /** Desktop detection for hiding redundant page header (sidebar provides nav) */
  protected readonly isDesktop = computed(() => this.platform.viewport().width >= 1280);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Explore',
      description:
        'Discover top athletic talent, teams, and sports content from across the country.',
      keywords: ['explore', 'discover', 'athletes', 'recruiting', 'sports'],
    });
  }
  /**
   * Transform auth user to ExploreUser interface.
   */
  protected readonly userInfo = computed<ExploreUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      photoURL: user.photoURL,
      displayName: user.displayName,
    };
  });

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle item click - navigate to detail page.
   */
  protected onItemClick(item: ExploreItem): void {
    this.logger.debug('Explore item clicked', { id: item.id, type: item.type, route: item.route });

    // Navigate to the item's route
    if (item.route) {
      this.router.navigate([item.route]);
    }
  }

  /**
   * Handle scout report selection - navigate to detail page.
   */
  protected onScoutReportSelect(report: ScoutReport): void {
    this.logger.debug('Scout report selected', { reportId: report.id });
    void this.router.navigate(['/scout-reports', report.id]);
  }

  /**
   * Handle scout report filters open.
   */
  protected onScoutReportFiltersOpen(): void {
    this.logger.debug('Scout report filters opened');
    // TODO: Open filter modal/side panel
  }
}
