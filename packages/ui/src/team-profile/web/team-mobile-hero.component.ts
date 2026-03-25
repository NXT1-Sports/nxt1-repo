/**
 * @fileoverview Team Mobile Hero Component
 * @module @nxt1/ui/team-profile/web
 * @version 2.0.0
 *
 * Mobile-only hero block for team profile — matches the 2-column grid
 * layout used by ProfileMobileHeroComponent (carousel + identity + stats).
 *
 * Shows: Gallery carousel (or large team logo) with glow effects on the
 * left, team identity + follow button + key-value stats on the right.
 *
 * ⭐ WEB ONLY (mobile viewport) — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { NxtImageCarouselComponent } from '../../components/image-carousel';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-mobile-hero',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtImageComponent, NxtImageCarouselComponent],
  template: `
    <section class="team-mobile-hero md:hidden" aria-label="Team summary">
      <!-- Left column: gallery carousel or large logo with glow effects -->
      <div class="team-mobile-hero__carousel">
        @if (teamProfile.galleryImages().length > 0) {
          <div class="carousel-glow-wrap">
            <div class="carousel-glow-border" aria-hidden="true"></div>
            <div class="carousel-glow-ambient" aria-hidden="true"></div>
            <nxt1-image-carousel
              [images]="teamProfile.galleryImages()"
              [alt]="headerTeamName()"
              [autoPlay]="true"
              [autoPlayInterval]="5000"
              [overlayTitle]="headerTeamName()"
              [overlaySubtitle]="headerSubtitle()"
              class="team-hero-carousel"
            />
            @if (teamProfile.team()?.verificationStatus === 'verified') {
              <span class="carousel-verified-badge">
                <nxt1-icon name="checkmarkCircle" [size]="14" />
                Verified
              </span>
            }
          </div>
        } @else {
          <div class="carousel-glow-wrap team-logo-hero-wrap">
            <div class="carousel-glow-border" aria-hidden="true"></div>
            <div class="carousel-glow-ambient" aria-hidden="true"></div>
            <div class="team-logo-hero">
              @if (teamProfile.team()?.logoUrl) {
                <nxt1-image
                  [src]="teamProfile.team()!.logoUrl!"
                  [alt]="headerTeamName()"
                  [width]="96"
                  [height]="96"
                  variant="avatar"
                  fit="contain"
                  [priority]="true"
                  [showPlaceholder]="false"
                />
              } @else {
                <div class="team-logo-hero__fallback">
                  <nxt1-icon name="shield" [size]="48" />
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Right column: logo + identity + follow + followers -->
      <div class="team-mobile-hero__identity">
        <!-- Team logo above name -->
        @if (teamProfile.team()?.logoUrl) {
          <nxt1-image
            class="team-mobile-hero__logo"
            [src]="teamProfile.team()!.logoUrl!"
            [alt]="headerTeamName()"
            [width]="60"
            [height]="60"
            variant="avatar"
            fit="contain"
            [priority]="true"
            [showPlaceholder]="false"
          />
        } @else {
          <div class="team-mobile-hero__logo-fallback">
            <nxt1-icon name="shield" [size]="22" />
          </div>
        }
        <h1 class="team-mobile-hero__name">{{ headerTeamName() }}</h1>
        @if (headerSubtitle()) {
          <p class="team-mobile-hero__meta">{{ headerSubtitle() }}</p>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ── Desktop: hide mobile hero ── */
      .team-mobile-hero {
        display: none;
      }

      .team-mobile-hero__followers {
        display: none;
      }

      /* ── Carousel glow effects (matches profile) ── */
      .carousel-glow-wrap {
        position: relative;
        max-width: 400px;
        width: 100%;
        border-radius: var(--nxt1-radius-2xl, 20px);
        overflow: hidden;
      }
      .carousel-glow-border {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        z-index: 2;
        border: 1.5px solid rgba(255, 255, 255, 0.08);
      }
      .carousel-glow-ambient {
        position: absolute;
        inset: -2px;
        border-radius: inherit;
        pointer-events: none;
        z-index: 0;
        background: radial-gradient(
          ellipse at 50% 0%,
          color-mix(in srgb, var(--m-accent, #d4ff00) 10%, transparent) 0%,
          transparent 70%
        );
      }
      .carousel-verified-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: color-mix(
          in srgb,
          var(--m-accent, var(--nxt1-color-primary, #d4ff00)) 15%,
          rgba(0, 0, 0, 0.65)
        );
        border: 1px solid
          color-mix(in srgb, var(--m-accent, var(--nxt1-color-primary, #d4ff00)) 40%, transparent);
        color: var(--m-accent, var(--nxt1-color-primary, #d4ff00));
        font-size: 11px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 999px;
        z-index: 5;
        pointer-events: none;
        line-height: 1;
      }

      /* ── Large logo fallback hero (when no gallery images) ── */
      .team-logo-hero-wrap {
        overflow: visible;
      }
      .team-logo-hero {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border-radius: inherit;
      }
      .team-logo-hero__fallback {
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      /* ═══ MOBILE BREAKPOINT ═══ */
      @media (max-width: 768px) {
        .team-mobile-hero {
          display: grid;
          grid-template-columns: 148px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
          margin: 32px 12px 10px;
        }

        .team-mobile-hero__carousel {
          width: 148px;
        }
        .team-mobile-hero__carousel .carousel-glow-wrap {
          width: 148px;
          max-width: none;
          height: 220px;
          border-radius: 14px;
        }
        .team-mobile-hero__carousel .team-hero-carousel {
          width: 100%;
          height: 100%;
          border-radius: 14px;
          overflow: hidden;
        }
        .team-mobile-hero__carousel .team-hero-carousel ::ng-deep .carousel {
          height: 100%;
          border-radius: 14px;
        }
        .team-mobile-hero__carousel .team-hero-carousel ::ng-deep .carousel::before {
          border-radius: 14px;
        }
        .team-mobile-hero__carousel .team-hero-carousel ::ng-deep .carousel-track {
          height: 100%;
        }
        .team-mobile-hero__carousel .team-hero-carousel ::ng-deep .carousel-slide {
          height: 100%;
        }
        .team-mobile-hero__carousel .team-hero-carousel ::ng-deep .carousel-img {
          height: 100%;
          object-fit: cover;
          object-position: center top;
        }

        /* ── Logo fallback sizing ── */
        .team-mobile-hero__carousel .team-logo-hero-wrap {
          width: 148px;
          max-width: none;
          height: 220px;
          border-radius: 14px;
        }
        .team-mobile-hero__carousel .team-logo-hero {
          border-radius: 14px;
        }

        /* ── Identity column ── */
        .team-mobile-hero__identity {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
          padding-top: 2px;
        }
        .team-mobile-hero__logo {
          width: 60px;
          height: 60px;
          border-radius: 10px;
          flex-shrink: 0;
        }
        .team-mobile-hero__logo-fallback {
          width: 60px;
          height: 60px;
          border-radius: 10px;
          background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        }
        .team-mobile-hero__name {
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          line-height: 1.12;
          letter-spacing: -0.01em;
          color: var(--m-text, #ffffff);
        }
        .team-mobile-hero__meta {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.35;
          color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamMobileHeroComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  private static formatTeamTypeLabel(teamType?: string): string {
    if (!teamType) return '';
    return teamType
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  // ============================================
  // OUTPUTS
  // ============================================

  readonly back = output<void>();

  protected readonly headerTeamName = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return '';

    const teamName = team.teamName?.trim() ?? '';
    if (!teamName) return '';

    const sport = team.sport?.trim();
    const withoutHighSchool = teamName.replace(/\bhigh\s+school\b/gi, '').trim();
    const withoutSport = sport
      ? withoutHighSchool
          .replace(new RegExp(`\\b${sport.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi'), '')
          .trim()
      : withoutHighSchool;

    const baseName = withoutSport.replace(/\s{2,}/g, ' ').trim();
    const cleanName = baseName || teamName;

    const mascot = team.branding?.mascot?.trim();
    if (!mascot) return cleanName;

    const mascotLower = mascot.toLowerCase();
    if (cleanName.toLowerCase().endsWith(mascotLower)) return cleanName;

    return `${cleanName} ${mascot}`;
  });

  // ============================================
  // COMPUTED
  // ============================================

  /** Header subtitle: Team type + sport (for example: "High School Football") */
  protected readonly headerSubtitle = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return '';

    const typeLabel = TeamMobileHeroComponent.formatTeamTypeLabel(team.teamType);
    const sportLabel = team.sport?.trim() ? team.sport.trim() : '';

    return `${typeLabel} ${sportLabel}`.trim();
  });
}
