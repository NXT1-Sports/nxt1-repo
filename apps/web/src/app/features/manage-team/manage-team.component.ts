/**
 * @fileoverview Manage Team Page — Marketing Landing Only
 * @module @nxt1/web/features/manage-team
 * @version 3.0.0
 *
 * Root component for the `/manage-team` route.
 *
 * Previously implemented a dual-state pattern (logged-in → dashboard,
 * logged-out → marketing). The dashboard is now accessed via the
 * ManageTeamModalService overlay, triggered in-context from the Team
 * Profile page. This page exclusively serves as a public SEO-optimized
 * marketing landing page.
 *
 * Architecture:
 * - Always renders NxtManageTeamLandingComponent (marketing page)
 * - SEO meta tags for organic search traffic
 * - Auth state no longer checked — page is purely informational
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { NxtManageTeamLandingComponent } from '@nxt1/ui/manage-team';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-manage-team',
  standalone: true,
  imports: [NxtManageTeamLandingComponent],
  template: `<nxt1-manage-team-landing />`,
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
export class ManageTeamComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Team Management — Run Your Program Like a Pro | NXT1',
      description:
        'Manage your roster, schedule, stats, staff, and sponsors from one powerful coaching dashboard. Built for head coaches, assistants, and directors.',
      keywords: [
        'team management',
        'coaching dashboard',
        'roster management',
        'sports scheduling',
        'team stats',
        'NXT1 coaching',
      ],
    });
  }
}
