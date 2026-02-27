/**
 * @fileoverview Team Overview Web Component
 * @module @nxt1/ui/team-profile/web
 * @version 1.0.0
 *
 * Overview tab content for team profile.
 * Sub-sections: About, Staff, Team History, Quick Stats, Sponsors.
 *
 * Mirrors ProfileOverviewWebComponent — injects TeamProfileService directly.
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-overview-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtImageComponent],
  template: `
    <div class="team-overview">
      <!-- ═══ ABOUT ═══ -->
      @if (activeSideTab() === 'about' || activeSideTab() === '') {
        <div class="team-section">
          <h2 class="team-section__title">About</h2>
          @if (teamProfile.team()?.description) {
            <p class="team-section__text">{{ teamProfile.team()?.description }}</p>
          }
          <div class="team-info-grid">
            @if (teamProfile.team()?.sport) {
              <div class="team-info-item">
                <nxt1-icon name="football" [size]="16" />
                <span>{{ teamProfile.team()?.sport }}</span>
              </div>
            }
            @if (teamProfile.team()?.location) {
              <div class="team-info-item">
                <nxt1-icon name="location" [size]="16" />
                <span>{{ teamProfile.team()?.location }}</span>
              </div>
            }
            @if (teamProfile.team()?.conference) {
              <div class="team-info-item">
                <nxt1-icon name="shield" [size]="16" />
                <span>{{ teamProfile.team()?.conference }}</span>
              </div>
            }
            @if (teamProfile.team()?.division) {
              <div class="team-info-item">
                <nxt1-icon name="ribbon" [size]="16" />
                <span>{{ teamProfile.team()?.division }}</span>
              </div>
            }
            @if (teamProfile.team()?.homeVenue) {
              <div class="team-info-item">
                <nxt1-icon name="business" [size]="16" />
                <span>{{ teamProfile.team()?.homeVenue }}</span>
              </div>
            }
            @if (teamProfile.team()?.foundedYear) {
              <div class="team-info-item">
                <nxt1-icon name="calendar" [size]="16" />
                <span>Est. {{ teamProfile.team()?.foundedYear }}</span>
              </div>
            }
          </div>

          <!-- Contact info in about -->
          @if (teamProfile.team()?.contact) {
            <div class="team-contact-section">
              <h3 class="team-subsection-title">Contact</h3>
              <div class="team-contact-grid">
                @if (teamProfile.team()?.contact?.email) {
                  <a
                    class="team-contact-item"
                    [href]="'mailto:' + teamProfile.team()!.contact!.email"
                  >
                    <nxt1-icon name="mail" [size]="16" />
                    <span>{{ teamProfile.team()!.contact!.email }}</span>
                  </a>
                }
                @if (teamProfile.team()?.contact?.phone) {
                  <a class="team-contact-item" [href]="'tel:' + teamProfile.team()!.contact!.phone">
                    <nxt1-icon name="call" [size]="16" />
                    <span>{{ teamProfile.team()!.contact!.phone }}</span>
                  </a>
                }
                @if (teamProfile.team()?.contact?.website) {
                  <a
                    class="team-contact-item"
                    [href]="teamProfile.team()!.contact!.website"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <nxt1-icon name="globe" [size]="16" />
                    <span>{{ teamProfile.team()!.contact!.website }}</span>
                  </a>
                }
              </div>
            </div>
          }

          <!-- Social links in about -->
          @if (teamProfile.team()?.social && teamProfile.team()!.social!.length > 0) {
            <div class="team-social-section">
              <h3 class="team-subsection-title">Social Media</h3>
              <div class="team-social-grid">
                @for (link of teamProfile.team()!.social!; track link.platform) {
                  <a
                    class="team-social-link"
                    [href]="link.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    [attr.aria-label]="link.platform"
                  >
                    <nxt1-icon [name]="getSocialIcon(link.platform)" [size]="18" />
                    <span>{{ link.username ?? link.platform }}</span>
                    @if (link.verified) {
                      <nxt1-icon name="checkmark-circle" [size]="14" class="team-social-verified" />
                    }
                  </a>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- ═══ STAFF ═══ -->
      @if (activeSideTab() === 'staff') {
        <div class="team-section">
          <h2 class="team-section__title">Coaching Staff</h2>
          @if (teamProfile.staff().length > 0) {
            <div class="team-staff-list">
              @for (member of teamProfile.staff(); track member.id) {
                <div class="team-staff-card">
                  <div class="team-staff-card__avatar">
                    @if (member.profileImg) {
                      <nxt1-image
                        [src]="member.profileImg"
                        [alt]="member.firstName + ' ' + member.lastName"
                        [width]="48"
                        [height]="48"
                        variant="avatar"
                        fit="cover"
                        [showPlaceholder]="false"
                      />
                    } @else {
                      <nxt1-icon name="person" [size]="24" />
                    }
                  </div>
                  <div class="team-staff-card__info">
                    <h3 class="team-staff-card__name">
                      {{ member.firstName }} {{ member.lastName }}
                    </h3>
                    <p class="team-staff-card__role">{{ member.title }}</p>
                    @if (member.bio) {
                      <p class="team-staff-card__bio">{{ member.bio }}</p>
                    }
                    @if (member.yearsWithTeam) {
                      <span class="team-staff-card__tenure"
                        >{{ member.yearsWithTeam }}y with program</span
                      >
                    }
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="team-empty-state">
              <nxt1-icon name="person" [size]="40" />
              <h3>No staff listed</h3>
              <p>Coaches and staff members will appear here.</p>
            </div>
          }
        </div>
      }

      <!-- ═══ TEAM HISTORY ═══ -->
      @if (activeSideTab() === 'team-history') {
        <div class="team-section">
          <h2 class="team-section__title">Team History</h2>
          @if (teamProfile.recordDisplay()) {
            <div class="team-record-display">
              <span class="team-record-display__value">{{ teamProfile.recordDisplay() }}</span>
              <span class="team-record-display__label">Current Record</span>
            </div>
          }
          <!-- Recent Results -->
          @if (teamProfile.completedSchedule().length > 0) {
            <div class="team-recent-results">
              <h3 class="team-subsection-title">Recent Results</h3>
              @for (game of teamProfile.completedSchedule().slice(0, 8); track game.id) {
                <div
                  class="team-game-row"
                  [class.team-game-row--win]="game.result?.outcome === 'win'"
                  [class.team-game-row--loss]="game.result?.outcome === 'loss'"
                >
                  <span class="team-game-row__outcome">
                    {{
                      game.result?.outcome === 'win'
                        ? 'W'
                        : game.result?.outcome === 'loss'
                          ? 'L'
                          : 'T'
                    }}
                  </span>
                  <span class="team-game-row__opponent"
                    >{{ game.isHome ? 'vs' : '@' }} {{ game.opponent }}</span
                  >
                  <span class="team-game-row__score"
                    >{{ game.result?.teamScore }}-{{ game.result?.opponentScore }}</span
                  >
                </div>
              }
            </div>
          }
          @if (teamProfile.team()?.foundedYear) {
            <div class="team-founded">
              <nxt1-icon name="calendar" [size]="16" />
              <span>Founded in {{ teamProfile.team()!.foundedYear }}</span>
            </div>
          }
        </div>
      }

      <!-- ═══ QUICK STATS ═══ -->
      @if (activeSideTab() === 'quick-stats') {
        <div class="team-section">
          <h2 class="team-section__title">Quick Stats</h2>
          @if (teamProfile.quickStats()) {
            <div class="team-stats-grid">
              <div class="team-stat-card">
                <nxt1-icon name="eye" [size]="20" />
                <span class="team-stat-card__value">{{
                  teamProfile.quickStats()!.pageViews | number
                }}</span>
                <span class="team-stat-card__label">Page Views</span>
              </div>
              <div class="team-stat-card">
                <nxt1-icon name="people" [size]="20" />
                <span class="team-stat-card__value">{{
                  teamProfile.quickStats()!.rosterCount
                }}</span>
                <span class="team-stat-card__label">Athletes</span>
              </div>
              <div class="team-stat-card">
                <nxt1-icon name="videocam" [size]="20" />
                <span class="team-stat-card__value">{{
                  teamProfile.quickStats()!.highlightCount
                }}</span>
                <span class="team-stat-card__label">Highlights</span>
              </div>
              <div class="team-stat-card">
                <nxt1-icon name="newspaper" [size]="20" />
                <span class="team-stat-card__value">{{
                  teamProfile.quickStats()!.totalPosts
                }}</span>
                <span class="team-stat-card__label">Posts</span>
              </div>
              <div class="team-stat-card">
                <nxt1-icon name="calendar" [size]="20" />
                <span class="team-stat-card__value">{{
                  teamProfile.quickStats()!.eventCount
                }}</span>
                <span class="team-stat-card__label">Events</span>
              </div>
              <div class="team-stat-card">
                <nxt1-icon name="share-social" [size]="20" />
                <span class="team-stat-card__value">{{
                  teamProfile.quickStats()!.shareCount
                }}</span>
                <span class="team-stat-card__label">Shares</span>
              </div>
            </div>
          } @else {
            <div class="team-empty-state">
              <nxt1-icon name="stats-chart" [size]="40" />
              <h3>No stats yet</h3>
              <p>Team analytics will appear here as the profile grows.</p>
            </div>
          }
        </div>
      }

      <!-- ═══ SPONSORS ═══ -->
      @if (activeSideTab() === 'sponsors') {
        <div class="team-section">
          <h2 class="team-section__title">Sponsors</h2>
          @if (teamProfile.sponsors().length > 0) {
            <div class="team-sponsors-grid">
              @for (sponsor of teamProfile.sponsors(); track sponsor.name) {
                <div
                  class="team-sponsor-card"
                  [class.team-sponsor-card--title]="sponsor.tier === 'title'"
                >
                  @if (sponsor.logoUrl) {
                    <nxt1-image
                      class="team-sponsor-card__logo"
                      [src]="sponsor.logoUrl"
                      [alt]="sponsor.name"
                      [width]="80"
                      [height]="48"
                      fit="contain"
                      [showPlaceholder]="false"
                    />
                  } @else {
                    <div class="team-sponsor-card__fallback">
                      <nxt1-icon name="business" [size]="24" />
                    </div>
                  }
                  <div class="team-sponsor-card__info">
                    <span class="team-sponsor-card__name">{{ sponsor.name }}</span>
                    @if (sponsor.tier) {
                      <span class="team-sponsor-card__tier"
                        >{{ sponsor.tier | titlecase }} Sponsor</span
                      >
                    }
                  </div>
                  @if (sponsor.url) {
                    <a
                      class="team-sponsor-card__link"
                      [href]="sponsor.url"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <nxt1-icon name="open-outline" [size]="14" />
                    </a>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="team-empty-state">
              <nxt1-icon name="business" [size]="40" />
              <h3>No sponsors yet</h3>
              <p>Team sponsors and partners will appear here.</p>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .team-section {
        padding: 4px 0 16px;
      }

      .team-section__title {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text, #ffffff);
        margin: 0 0 12px;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .team-section__text {
        font-size: 14px;
        line-height: 1.6;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 0 0 16px;
      }

      .team-subsection-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 16px 0 10px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* ─── INFO GRID ─── */
      .team-info-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 20px;
      }

      .team-info-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
      }

      /* ─── CONTACT ─── */
      .team-contact-section {
        margin-top: 16px;
      }

      .team-contact-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .team-contact-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        color: var(--m-text, #ffffff);
        font-size: 13px;
        text-decoration: none;
        transition: background 0.12s;
      }

      .team-contact-item:hover {
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
      }

      /* ─── SOCIAL ─── */
      .team-social-section {
        margin-top: 16px;
      }

      .team-social-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .team-social-link {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 999px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        color: var(--m-text, #ffffff);
        font-size: 13px;
        text-decoration: none;
        transition: border-color 0.12s;
      }

      .team-social-link:hover {
        border-color: var(--m-accent, var(--nxt1-color-primary, #d4ff00));
      }

      .team-social-verified {
        color: var(--m-accent, var(--nxt1-color-primary, #d4ff00));
      }

      /* ─── STAFF ─── */
      .team-staff-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .team-staff-card {
        display: flex;
        gap: 14px;
        padding: 14px;
        border-radius: 12px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
      }

      .team-staff-card__avatar {
        width: 48px;
        height: 48px;
        border-radius: 10px;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        flex-shrink: 0;
        overflow: hidden;
      }

      .team-staff-card__info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .team-staff-card__name {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text, #ffffff);
        margin: 0;
      }

      .team-staff-card__role {
        font-size: 12px;
        color: var(--m-accent, var(--nxt1-color-primary, #d4ff00));
        margin: 0;
        font-weight: 600;
      }

      .team-staff-card__bio {
        font-size: 13px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 4px 0 0;
        line-height: 1.5;
      }

      .team-staff-card__tenure {
        font-size: 11px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      /* ─── RECORD / HISTORY ─── */
      .team-record-display {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        margin-bottom: 16px;
        gap: 4px;
      }

      .team-record-display__value {
        font-size: 42px;
        font-weight: 900;
        color: var(--m-accent, var(--nxt1-color-primary, #d4ff00));
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: -0.02em;
      }

      .team-record-display__label {
        font-size: 11px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .team-game-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        margin-bottom: 6px;
      }

      .team-game-row__outcome {
        font-size: 14px;
        font-weight: 800;
        width: 20px;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }

      .team-game-row--win .team-game-row__outcome {
        color: #4ade80;
      }

      .team-game-row--loss .team-game-row__outcome {
        color: #f87171;
      }

      .team-game-row__opponent {
        flex: 1;
        font-size: 13px;
        color: var(--m-text, #ffffff);
      }

      .team-game-row__score {
        font-size: 13px;
        font-weight: 700;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
      }

      .team-founded {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 0;
        font-size: 13px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin-top: 16px;
      }

      /* ─── STATS GRID ─── */
      .team-stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 10px;
      }

      .team-stat-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 16px 12px;
        border-radius: 12px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        text-align: center;
      }

      .team-stat-card__value {
        font-size: 20px;
        font-weight: 800;
        color: var(--m-text, #ffffff);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }

      .team-stat-card__label {
        font-size: 11px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      /* ─── SPONSORS ─── */
      .team-sponsors-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .team-sponsor-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px;
        border-radius: 12px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
      }

      .team-sponsor-card--title {
        border-color: color-mix(
          in srgb,
          var(--m-accent, var(--nxt1-color-primary, #d4ff00)) 30%,
          transparent
        );
      }

      .team-sponsor-card__logo {
        width: 80px;
        height: 48px;
        border-radius: 8px;
        flex-shrink: 0;
      }

      .team-sponsor-card__fallback {
        width: 80px;
        height: 48px;
        border-radius: 8px;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        flex-shrink: 0;
      }

      .team-sponsor-card__info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .team-sponsor-card__name {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text, #ffffff);
      }

      .team-sponsor-card__tier {
        font-size: 11px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .team-sponsor-card__link {
        flex-shrink: 0;
        padding: 8px;
        border-radius: 8px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        transition: color 0.12s;
      }

      .team-sponsor-card__link:hover {
        color: var(--m-accent, var(--nxt1-color-primary, #d4ff00));
      }

      /* ─── EMPTY STATE ─── */
      .team-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 48px 16px;
        gap: 10px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-empty-state h3 {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 4px 0 0;
      }

      .team-empty-state p {
        font-size: 13px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        margin: 0;
        max-width: 320px;
      }

      @media (max-width: 768px) {
        .team-stats-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamOverviewWebComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  // ============================================
  // INPUTS
  // ============================================

  /** Active sub-section tab (about, staff, team-history, quick-stats, sponsors) */
  readonly activeSideTab = input.required<string>();

  // ============================================
  // HELPERS
  // ============================================

  protected getSocialIcon(platform: string): string {
    const icons: Record<string, string> = {
      twitter: 'logo-twitter',
      instagram: 'logo-instagram',
      facebook: 'logo-facebook',
      youtube: 'logo-youtube',
      tiktok: 'logo-tiktok',
      hudl: 'videocam',
      maxpreps: 'stats-chart',
    };
    return icons[platform] ?? 'link';
  }
}
