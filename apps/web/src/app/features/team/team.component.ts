/**
 * @fileoverview Team Page - Web App Wrapper
 * @module @nxt1/web/features/team
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Team shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Team data fetching from backend
 * - SEO Metadata for team pages
 * - Share functionality
 *
 * Routes:
 * - /team/:slug — View team by slug (SEO-friendly URL)
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  signal,
  effect,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TeamShellComponent, type TeamData } from '@nxt1/ui';
import { SeoService, ShareService } from '../../core/services';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [TeamShellComponent],
  template: `
    <nxt1-team-shell
      [teamId]="teamId()"
      [teamData]="teamData()"
      (backClick)="onBackClick()"
      (shareClick)="onShare()"
      (retryClick)="onRetry()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly share = inject(ShareService);

  // ============================================
  // STATE
  // ============================================

  protected readonly teamData = signal<TeamData | null>(null);

  /**
   * Team ID/slug from route parameter.
   */
  protected readonly teamId = computed<string>(() => {
    return this.route.snapshot.paramMap.get('slug') || '';
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    // Effect to load team data and update SEO when slug changes
    effect(() => {
      const slug = this.teamId();
      if (slug) {
        this.loadTeamAndSeo(slug);
      }
    });
  }

  // ============================================
  // DATA LOADING
  // ============================================

  private loadTeamAndSeo(slug: string): void {
    // Mock team data for now - replace with actual API call
    // TODO: Connect to TeamService when backend is ready
    const mockTeamData: TeamData = {
      id: slug,
      slug: slug,
      teamName: 'Lincoln High School',
      sport: 'Football',
      location: 'Lincoln, NE',
      logoUrl: '/assets/images/teams/lincoln-hs-logo.png',
      imageUrl: '/assets/images/teams/lincoln-hs-cover.jpg',
      record: '10-2',
      description:
        'Lincoln High School Football program with a rich tradition of excellence. Multiple state championships and a commitment to developing student-athletes both on and off the field.',
      foundedYear: 1965,
      coachName: 'John Smith',
      homeVenue: 'Lincoln Stadium',
      rosterCount: 45,
    };

    this.teamData.set(mockTeamData);

    // Update SEO with team data
    this.seo.updateForTeam({
      id: mockTeamData.id,
      slug: mockTeamData.slug,
      teamName: mockTeamData.teamName,
      sport: mockTeamData.sport,
      location: mockTeamData.location,
      logoUrl: mockTeamData.logoUrl,
      imageUrl: mockTeamData.imageUrl,
      record: mockTeamData.record,
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onBackClick(): void {
    // Navigate back or to home if no history
    if (window.history.length > 1) {
      this.router.navigate(['..'], { relativeTo: this.route });
    } else {
      this.router.navigate(['/']);
    }
  }

  protected async onShare(): Promise<void> {
    const team = this.teamData();
    if (!team) return;

    await this.share.shareTeam({
      id: team.id,
      slug: team.slug,
      teamName: team.teamName,
      sport: team.sport,
      location: team.location,
      logoUrl: team.logoUrl,
      imageUrl: team.imageUrl,
      record: team.record,
    });
  }

  protected onRetry(): void {
    const slug = this.teamId();
    if (slug) {
      this.loadTeamAndSeo(slug);
    }
  }
}
