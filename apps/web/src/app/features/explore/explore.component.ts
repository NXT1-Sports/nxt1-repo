/**
 * @fileoverview Explore Page - Web App Wrapper
 * @module @nxt1/web/features/explore
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Explore shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
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
  ExploreShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  type ExploreUser,
} from '@nxt1/ui';
import type { ExploreTabId, ExploreItem } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [ExploreShellComponent],
  template: `
    <nxt1-explore-shell
      [user]="userInfo()"
      (avatarClick)="onAvatarClick()"
      (tabChange)="onTabChange($event)"
      (itemClick)="onItemClick($event)"
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
   * Handle tab changes for analytics/logging.
   */
  protected onTabChange(tab: ExploreTabId): void {
    this.logger.debug('Explore tab changed', { tab });
    // In production: track analytics event
    // this.analytics.track('explore_tab_change', { tab });
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
}
