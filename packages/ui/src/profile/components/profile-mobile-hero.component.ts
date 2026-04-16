/**
 * @fileoverview Profile Mobile Hero Component
 * @module @nxt1/ui/profile/components
 *
 * Shared profile section component used by both web and mobile shells.
 * Mobile-only hero section showing carousel + NxtEntityHeroComponent identity.
 * Hidden on wide (md+) layouts where page-header handles this info.
 *
 * The identity card (name, subtitle, meta rows) is rendered by the shared
 * NxtEntityHeroComponent so it stays visually consistent with the /team page.
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';

import { NxtIconComponent } from '../../components/icon';
import { NxtEntityHeroComponent, type EntityHeroMetaItem } from '../../components/entity-hero';
import { ProfileService } from '../profile.service';
import { isFemaleGender } from '@nxt1/core';

@Component({
  selector: 'nxt1-profile-mobile-hero',
  standalone: true,
  imports: [NxtIconComponent, NxtEntityHeroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="madden-mobile-hero madden-mobile-hero--no-carousel md:hidden"
      aria-label="Profile summary"
    >
      <!-- ── Entity identity card ── -->
      <nxt1-entity-hero
        [name]="mobileDisplayName()"
        [subtitle]="mobileSubtitleLine()"
        [avatarSrc]="profile.user()?.isTeamManager ? null : profile.user()?.profileImg"
        [logoSrc]="
          profile.user()?.isTeamManager
            ? (profile.user()?.teamAffiliations?.[0]?.logoUrl ?? null)
            : null
        "
        [metaItems]="heroMetaItems()"
      />
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* Desktop: hide mobile hero */
      .madden-mobile-hero {
        display: none;
      }

      /* Mobile hero stats hidden on desktop */
      .madden-mobile-hero__stats {
        display: none;
      }

      /* ── Mobile breakpoint ── */
      @media (max-width: 768px) {
        .madden-mobile-hero {
          display: block;
          margin: 0 0 10px;
          position: relative;
          isolation: isolate;
          overflow: hidden;
          padding: 14px 16px;
        }

        /* ── Hero background: speed lines + colour wash (full width) ── */
        .madden-mobile-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: -1;

          /* Dark base */
          background:
            /* Diagonal speed-line texture — right-biased, fades left */
            repeating-linear-gradient(
              -52deg,
              transparent 0 18px,
              color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 7%, transparent) 18px 19.5px,
              transparent 19.5px 44px
            ),
            /* Accent edge bleed — top-left corner pop */
              radial-gradient(
                ellipse 80% 60% at -4% -8%,
                color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 22%, transparent) 0%,
                color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 8%, transparent) 38%,
                transparent 68%
              ),
            /* Subtle centre-bottom glow for depth */
              radial-gradient(
                ellipse 110% 55% at 50% 108%,
                color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 10%, transparent) 0%,
                transparent 60%
              ),
            /* Solid dark surface */
              linear-gradient(
                160deg,
                var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.07)) 0%,
                var(--nxt1-color-bg-primary, #0a0a0a) 100%
              );

          box-shadow: 0 2px 24px rgba(0, 0, 0, 0.45);
        }
      }
    `,
  ],
})
export class ProfileMobileHeroComponent {
  protected readonly profile = inject(ProfileService);

  /** Whether viewing own profile */
  readonly isOwnProfile = input(false);

  /** Emitted when Message button is tapped */
  readonly messageClick = output<void>();

  // ── Display computeds ──

  protected readonly mobileDisplayName = computed(() => {
    const u = this.profile.user();
    if (u?.displayName?.trim()) return u.displayName.trim();
    const combined = `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
    return combined || 'Profile';
  });

  protected readonly mobileSubtitleLine = computed(() => {
    // Use activeSport() instead of primarySport for sport-switching support
    const activeSport = this.profile.activeSport();
    const position = activeSport?.position?.trim();
    const jersey = activeSport?.jerseyNumber?.trim();
    if (position && jersey) return `${position} #${jersey}`;
    if (position) return position;
    if (jersey) return `#${jersey}`;
    return '';
  });

  /** Meta rows passed to NxtEntityHeroComponent (Team, Class, Location) */
  protected readonly heroMetaItems = computed<EntityHeroMetaItem[]>(() => {
    const u = this.profile.user();
    const items: EntityHeroMetaItem[] = [];
    // Primary team for the active sport
    const primaryTeam = this.profile.teamAffiliations()[0];
    if (primaryTeam?.name) items.push({ key: 'Team', value: primaryTeam.name });
    if (u?.classYear) items.push({ key: 'Class', value: String(u.classYear) });
    if (u?.location) items.push({ key: 'Location', value: u.location });
    return items;
  });

  protected readonly isFemaleProfile = computed(() => isFemaleGender(this.profile.user()?.gender));
}
