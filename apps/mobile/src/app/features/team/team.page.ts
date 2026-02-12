/**
 * @fileoverview Team Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/team
 * @version 1.0.0
 *
 * Thin wrapper page that imports the shared Team shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Ionic navigation integration
 * - Mobile-specific back navigation
 * - Team data fetching from backend
 * - Native share functionality
 *
 * Routes:
 * - /team/:slug — View team by slug
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  signal,
  effect,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular/standalone';
import { TeamShellComponent, type TeamData, NxtLoggingService } from '@nxt1/ui';
import { ShareService } from '../../core/services/share.service';

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
export class TeamPage {
  private readonly navCtrl = inject(NavController);
  private readonly route = inject(ActivatedRoute);
  private readonly logger = inject(NxtLoggingService).child('TeamPage');
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
    // Effect to load team data when slug changes
    effect(() => {
      const slug = this.teamId();
      if (slug) {
        this.loadTeamData(slug);
      }
    });
  }

  // ============================================
  // DATA LOADING
  // ============================================

  private loadTeamData(slug: string): void {
    this.logger.info('Loading team data', { slug });

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
    this.logger.info('Team data loaded', { teamName: mockTeamData.teamName });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onBackClick(): void {
    this.logger.info('Back button clicked');
    this.navCtrl.back();
  }

  protected async onShare(): Promise<void> {
    const team = this.teamData();
    if (!team) {
      this.logger.warn('Cannot share - no team data');
      return;
    }

    const result = await this.share.shareTeam({
      id: team.id,
      slug: team.slug,
      teamName: team.teamName,
      sport: team.sport,
      location: team.location,
      logoUrl: team.logoUrl,
      imageUrl: team.imageUrl,
      record: team.record,
    });

    if (result.completed) {
      this.logger.info('Team shared', { teamSlug: team.slug, method: result.activityType });
    }
  }

  protected onRetry(): void {
    this.logger.info('Retry button clicked');
    const slug = this.teamId();
    if (slug) {
      this.loadTeamData(slug);
    }
  }
}
