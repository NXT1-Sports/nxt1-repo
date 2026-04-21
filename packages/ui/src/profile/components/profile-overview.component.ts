/**
 * @fileoverview Profile Overview Component
 * @module @nxt1/ui/profile/components
 *
 * Shared profile section component used by both web and mobile shells.
 * Overview tab content including player info, history,
 * awards, academic, and contact sub-sections.
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  signal,
  effect,
  PLATFORM_ID,
  OnDestroy,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { NxtPlatformIconComponent } from '../../components/platform-icon';
import { NxtImageComponent } from '../../components/image';
import { NxtTimelineComponent } from '../../components/timeline';
import {
  NxtHistoryTimelineComponent,
  type HistoryTimelineEntry,
} from '../../components/history-timeline';
import { ProfileService } from '../profile.service';
import { NxtToastService } from '../../services/toast/toast.service';
import {
  type ProfileTeamType,
  type ProfileTeamAffiliation,
  type ProfileAward,
  type TimelineItem,
  type TimelineEmptyConfig,
  type TimelineDotConfig,
  getVerification,
  formatSportDisplayName,
  normalizeWeightDisplay,
  isFemaleGender,
} from '@nxt1/core';
import { getPlatformFaviconUrl } from '@nxt1/core/platforms';
import { ICONS, type IconName } from '@nxt1/design-tokens/assets/icons';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

// ── Static constants ──

const ARCHETYPE_TOKEN_ICONS: Readonly<Record<string, IconName>> = {
  'arm strength': 'barbell',
  accuracy: 'star',
  athleticism: 'bolt',
  'football iq': 'hardwareChip',
};

const TEAM_TYPE_ICONS: Readonly<Record<ProfileTeamType, IconName>> = {
  'high-school': 'school',
  club: 'people',
  juco: 'shield',
  college: 'shield',
  academy: 'school',
  travel: 'shield',
  'middle-school': 'school',
  other: 'shield',
};

@Component({
  selector: 'nxt1-profile-overview',
  standalone: true,
  imports: [
    NxtIconComponent,
    NxtPlatformIconComponent,
    NxtImageComponent,
    NxtTimelineComponent,
    NxtHistoryTimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="madden-tab-section madden-overview" aria-labelledby="overview-heading">
      <h2 id="overview-heading" class="sr-only">Player Overview</h2>

      <!-- Mobile-only team affiliations (swapped from hero) -->
      @if (activeSideTab() === 'player-profile') {
        <div class="ov-mobile-teams">
          <h4 class="ov-section-title ov-section-title--subsection">Player Bio</h4>
          <div class="ov-bio-card ov-bio-card--mobile-info">
            <nxt1-icon name="person" [size]="18" />
            <p>
              {{
                profile.user()?.aboutMe ||
                  'No bio added yet. Add a short player bio to help coaches understand your story and goals.'
              }}
            </p>
          </div>

          @if (teamAffiliations().length > 0) {
            <div class="madden-team-stack ov-mobile-team-stack">
              @for (team of teamAffiliations(); track team.name + '-' + (team.type || 'other')) {
                <div
                  class="madden-team-block madden-team-block--clickable"
                  role="button"
                  tabindex="0"
                  (click)="onTeamClick(team)"
                  (keydown.enter)="onTeamClick(team)"
                  (keydown.space)="onTeamClick(team); $event.preventDefault()"
                >
                  @if (team.logoUrl) {
                    <nxt1-image
                      class="madden-team-logo"
                      [src]="team.logoUrl"
                      [alt]="team.name"
                      [width]="32"
                      [height]="32"
                      variant="avatar"
                      fit="contain"
                      [priority]="true"
                      [showPlaceholder]="false"
                    />
                  } @else {
                    <div class="madden-team-logo-placeholder">
                      <nxt1-icon [name]="teamIconName(team.type)" [size]="22" />
                    </div>
                  }
                  <div class="madden-team-info">
                    <div class="madden-team-headline">
                      <span class="madden-team-name">{{ team.name }}</span>
                    </div>
                    @if (team.location) {
                      <span class="madden-team-location">{{ team.location }}</span>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      @if (activeSideTab() === 'player-profile') {
        <div class="ov-top-row">
          <!-- ═══ PLAYER PROFILE — Key/Value Pairs (like Madden) ═══ -->
          <div class="ov-section ov-section--profile ov-section--player-stats">
            <div class="ov-profile-grid">
              @if (profile.user()?.classYear) {
                <div class="ov-profile-row">
                  <span class="ov-profile-key">Class:</span>
                  <span class="ov-profile-val">{{ profile.user()?.classYear }}</span>
                </div>
              }
              @if (profile.user()?.height) {
                <div class="ov-profile-row">
                  <span class="ov-profile-key">Height:</span>
                  <span class="ov-profile-val-wrap">
                    <span class="ov-profile-val">{{ profile.user()?.height }}</span>
                    @if (measurablesVerification()) {
                      @if (measurablesProviderUrl()) {
                        <a
                          class="ov-verified-badge ov-verified-link"
                          [href]="measurablesProviderUrl()!"
                          target="_blank"
                          rel="noopener noreferrer"
                          [attr.aria-label]="
                            'Open measurable source: ' + measurablesVerifiedByLabel()
                          "
                        >
                          <span class="ov-verified-label">Verified by</span>
                          <span class="ov-verified-logo">
                            <nxt1-image
                              class="ov-verified-logo-img"
                              [src]="measurablesProviderLogoSrc()"
                              [alt]="measurablesVerifiedByLabel() + ' logo'"
                              [width]="60"
                              [height]="14"
                              fit="contain"
                              [showPlaceholder]="false"
                            />
                          </span>
                        </a>
                      } @else {
                        <span class="ov-verified-badge">
                          <span class="ov-verified-label">Verified by</span>
                          <span class="ov-verified-logo">
                            <nxt1-image
                              class="ov-verified-logo-img"
                              [src]="measurablesProviderLogoFallbackSrc()"
                              [alt]="measurablesVerifiedByLabel() + ' logo'"
                              [width]="60"
                              [height]="14"
                              fit="contain"
                              [showPlaceholder]="false"
                            />
                          </span>
                        </span>
                      }
                    }
                  </span>
                </div>
              }
              @if (showWeight()) {
                <div class="ov-profile-row">
                  <span class="ov-profile-key">Weight:</span>
                  <span class="ov-profile-val-wrap">
                    <span class="ov-profile-val">{{ formattedWeight() }}</span>
                    @if (measurablesVerification()) {
                      @if (measurablesProviderUrl()) {
                        <a
                          class="ov-verified-badge ov-verified-link"
                          [href]="measurablesProviderUrl()!"
                          target="_blank"
                          rel="noopener noreferrer"
                          [attr.aria-label]="
                            'Open measurable source: ' + measurablesVerifiedByLabel()
                          "
                        >
                          <span class="ov-verified-label">Verified by</span>
                          <span class="ov-verified-logo">
                            <nxt1-image
                              class="ov-verified-logo-img"
                              [src]="measurablesProviderLogoSrc()"
                              [alt]="measurablesVerifiedByLabel() + ' logo'"
                              [width]="60"
                              [height]="14"
                              fit="contain"
                              [showPlaceholder]="false"
                            />
                          </span>
                        </a>
                      } @else {
                        <span class="ov-verified-badge">
                          <span class="ov-verified-label">Verified by</span>
                          <span class="ov-verified-logo">
                            <nxt1-image
                              class="ov-verified-logo-img"
                              [src]="measurablesProviderLogoFallbackSrc()"
                              [alt]="measurablesVerifiedByLabel() + ' logo'"
                              [width]="60"
                              [height]="14"
                              fit="contain"
                              [showPlaceholder]="false"
                            />
                          </span>
                        </span>
                      }
                    }
                  </span>
                </div>
              }
              @if (profile.user()?.location) {
                <div class="ov-profile-row">
                  <span class="ov-profile-key">Location:</span>
                  <span class="ov-profile-val">{{ profile.user()?.location }}</span>
                </div>
              }
            </div>
          </div>

          <!-- ═══ AGENT X TRAIT (inline, no large container) ═══ -->
          @if (profile.playerCard()?.trait) {
            <div class="ov-trait-inline">
              <div class="ov-trait-badge">
                <div class="ov-trait-icon-lg" aria-hidden="true">
                  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M50 6L84 28V72L50 94L16 72V28L50 6Z" class="ov-trait-icon-shell" />
                    <path d="M50 16L74 32V68L50 84L26 68V32L50 16Z" class="ov-trait-icon-core" />
                  </svg>
                  <div class="ov-trait-icon-inner">
                    @if (profile.playerCard()?.trait?.category === 'hidden') {
                      <nxt1-icon name="flame" [size]="36" />
                    } @else {
                      <nxt1-icon name="bolt" [size]="36" />
                    }
                  </div>
                </div>
              </div>
              <div class="ov-trait-text">
                <span class="ov-trait-category">{{ traitCategoryLabel() }}</span>
                @if (profile.playerCard()?.agentXSummary) {
                  <p class="ov-trait-summary">
                    <span class="ov-trait-summary__reserve" aria-hidden="true">
                      {{ profile.playerCard()?.agentXSummary }}
                    </span>
                    <span class="ov-trait-summary__typed" aria-live="polite">
                      {{ displayAgentXSummary() }}
                    </span>
                  </p>
                }
              </div>
            </div>
          }
        </div>

        <!-- ═══ PLAYER BIO (full width) ═══ -->
        <div class="ov-section ov-section--bio">
          <h4 class="ov-section-title ov-section-title--subsection ov-section-title--bio-inline">
            Player Bio
          </h4>
          <div class="ov-bio-card">
            <nxt1-icon name="person" [size]="18" />
            <p>
              {{
                profile.user()?.aboutMe ||
                  'No bio added yet. Add a short player bio to help coaches understand your story and goals.'
              }}
            </p>
          </div>
        </div>

        <!-- ═══ PLAYER ARCHETYPES (badge-style labels) ═══ -->
        @if (profile.playerCard()?.archetypes?.length) {
          <div class="ov-section">
            <h3 class="ov-section-title">Player Archetypes</h3>
            <div class="ov-archetype-badges">
              @for (arch of profile.playerCard()?.archetypes ?? []; track arch.name) {
                <div class="ov-archetype-badge">
                  <nxt1-icon [name]="archetypeIconName(arch.name, arch.icon)" [size]="18" />
                  <span class="ov-archetype-badge-name">{{ arch.name }}</span>
                </div>
              }
            </div>
          </div>
        }

        <!-- ═══ CONNECTED ACCOUNTS ═══ -->
        @if (connectedAccountsList().length > 0) {
          <div class="ov-section">
            <h3 class="ov-section-title">Connected Accounts</h3>
            <div class="ov-connected-grid">
              @for (acct of connectedAccountsList(); track acct.key) {
                <a
                  class="ov-connected-chip"
                  [href]="acct.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  [attr.aria-label]="acct.label"
                >
                  <span class="ov-connected-icon" [style.color]="acct.color">
                    <nxt1-platform-icon
                      [icon]="acct.icon"
                      [faviconUrl]="acct.faviconUrl"
                      [size]="14"
                      [alt]="acct.label + ' icon'"
                    />
                  </span>
                  <span class="ov-connected-label">{{ acct.label }}</span>
                  <span class="ov-connected-check">
                    <nxt1-icon name="checkmarkCircle" [size]="13" />
                  </span>
                </a>
              }
            </div>
            <p class="ov-connected-explainer">
              <svg
                class="ov-connected-agentx"
                viewBox="0 0 612 792"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="12"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path [attr.d]="agentXLogoPath" />
                <polygon [attr.points]="agentXLogoPolygon" />
              </svg>
              @if (profile.isOwnProfile()) {
                Agent X is your personal AI sports agent — connecting all your accounts in one place
                so coaches see a complete, always up-to-date profile without the extra work.
              } @else {
                Agent X keeps {{ profile.user()?.firstName ?? 'this athlete' }}'s accounts connected
                in one place — so you always see a complete, up-to-date profile.
              }
            </p>
          </div>
        }

        <div class="ov-section ov-section--profile">
          <div class="ov-last-synced-btn">
            <div class="ov-last-synced-main">
              <span class="ov-last-synced-label">Last synced</span>
              <span class="ov-last-synced-time">{{ lastSyncedLabel() }}</span>
            </div>
            <div class="ov-last-synced-agent">
              <svg
                class="ov-last-synced-agentx"
                viewBox="0 0 612 792"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="12"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path [attr.d]="agentXLogoPath" />
                <polygon [attr.points]="agentXLogoPolygon" />
              </svg>
              <span class="ov-last-synced-agent-name">Agent X</span>
            </div>
          </div>
        </div>

        @if (profile.hasMultipleSports() && !profile.isOwnProfile()) {
          <div class="ov-mobile-sport-switcher" role="group" aria-label="Sport profiles">
            <span class="ov-mobile-sport-switcher__title">Sport Profiles</span>
            <div class="ov-mobile-sport-switcher__list">
              @for (sport of profile.allSports(); track sport.name; let i = $index) {
                <button
                  type="button"
                  class="ov-mobile-sport-switcher__item"
                  [class.ov-mobile-sport-switcher__item--active]="profile.activeSportIndex() === i"
                  [attr.aria-selected]="profile.activeSportIndex() === i"
                  [attr.aria-label]="'Switch to ' + formatSportDisplayName(sport.name) + ' profile'"
                  role="tab"
                  (click)="onSportSwitch(i)"
                >
                  @if (profile.user()?.profileImg) {
                    <nxt1-image
                      class="ov-mobile-sport-switcher__avatar"
                      [src]="profile.user()?.profileImg"
                      [alt]="sport.name"
                      [width]="24"
                      [height]="24"
                      variant="avatar"
                      fit="cover"
                      [showPlaceholder]="false"
                    />
                  } @else {
                    <span class="ov-mobile-sport-switcher__avatar-fallback" aria-hidden="true">
                      {{ sport.name.charAt(0) }}
                    </span>
                  }
                  <span class="ov-mobile-sport-switcher__sport-name">{{
                    formatSportDisplayName(sport.name)
                  }}</span>
                  @if (profile.activeSportIndex() === i) {
                    <span class="ov-mobile-sport-switcher__active-badge" aria-hidden="true"></span>
                  }
                </button>
              }
            </div>
          </div>
        }
      }

      @if (activeSideTab() === 'player-history') {
        <div class="ov-top-row ov-top-row--single">
          <div class="ov-section ov-section--profile">
            <h3 class="ov-section-title ov-overview-title">Player History</h3>
            <nxt1-history-timeline
              [entries]="playerHistoryEntries()"
              emptyIcon="time-outline"
              emptyTitle="No history yet"
              [emptyDescription]="playerHistoryEmptyText()"
            />
          </div>
        </div>
      }

      @if (activeSideTab() === 'awards') {
        <div class="ov-top-row ov-top-row--single">
          <div class="ov-section ov-section--profile">
            @if (awardsTimelineItems().length > 0) {
              <h3 class="ov-section-title ov-overview-title">Awards</h3>
            }
            <nxt1-timeline
              [items]="awardsTimelineItems()"
              [isLoading]="profile.isLoading()"
              [isOwnProfile]="profile.isOwnProfile()"
              [emptyState]="awardsEmptyState"
              [emptyCta]="profile.isOwnProfile() ? 'Add Award' : null"
              [dotOverrides]="awardsDotOverrides"
              cardLayout="horizontal"
              fallbackIcon="trophy"
              (emptyCtaClick)="onAddAward()"
            />
          </div>
        </div>
      }

      @if (activeSideTab() === 'academic') {
        <div class="ov-top-row ov-top-row--single">
          <div class="ov-section ov-section--profile">
            @if (!profile.user()?.gpa && !profile.user()?.sat && !profile.user()?.act) {
              <div class="madden-empty">
                <div class="madden-empty__icon" aria-hidden="true">
                  <nxt1-icon name="school-outline" [size]="40" />
                </div>
                <h3>No Academic Info Yet</h3>
                <p>
                  @if (profile.isOwnProfile()) {
                    Add GPA, test scores, and school details to strengthen your profile.
                  } @else {
                    This athlete hasn't added academic information yet.
                  }
                </p>
                @if (profile.isOwnProfile()) {
                  <button type="button" class="madden-cta-btn" (click)="onEditProfile()">
                    Add Academic Info
                  </button>
                }
              </div>
            } @else {
              <h3 class="ov-section-title ov-overview-title">Academic</h3>
              <div class="acad-stats">
                @if (profile.user()?.gpa) {
                  <div class="acad-stat">
                    <span class="acad-stat__value">{{ profile.user()?.gpa }}</span>
                    <span class="acad-stat__label">GPA</span>
                  </div>
                }
                @if (profile.user()?.sat) {
                  <div class="acad-stat">
                    <span class="acad-stat__value">{{ profile.user()?.sat }}</span>
                    <span class="acad-stat__label">SAT</span>
                  </div>
                }
                @if (profile.user()?.act) {
                  <div class="acad-stat">
                    <span class="acad-stat__value">{{ profile.user()?.act }}</span>
                    <span class="acad-stat__label">ACT</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

      @if (activeSideTab() === 'contact') {
        @if (
          !profile.user()?.contact?.email &&
          !profile.user()?.contact?.phone &&
          connectedAccountsList().length === 0 &&
          !profile.user()?.coachContact
        ) {
          <div class="madden-empty">
            <div class="madden-empty__icon" aria-hidden="true">
              <nxt1-icon name="mail-outline" [size]="40" />
            </div>
            <h3>Contact info not set</h3>
            <p>
              @if (profile.isOwnProfile()) {
                Add your contact information so coaches can reach you.
              } @else {
                This athlete hasn't added contact information yet.
              }
            </p>
            @if (profile.isOwnProfile()) {
              <button type="button" class="madden-cta-btn" (click)="onEditContact()">
                Add Contact Info
              </button>
            }
          </div>
        } @else {
          <div class="contact-social-row">
            <!-- LEFT: Contact + Social Media -->
            <div class="contact-social-col">
              @if (profile.user()?.contact?.email || profile.user()?.contact?.phone) {
                <h3 class="contact-section-title">Contact</h3>
                <div class="contact-info-list">
                  @if (profile.user()?.contact?.email) {
                    <a
                      class="contact-info-item"
                      [href]="'mailto:' + profile.user()?.contact?.email"
                    >
                      <span class="contact-info-icon">
                        <nxt1-icon name="mail-outline" [size]="16" />
                      </span>
                      <div class="contact-info-text">
                        <span class="contact-info-label">Email</span>
                        <span class="contact-info-value">{{ profile.user()?.contact?.email }}</span>
                      </div>
                    </a>
                  }
                  @if (profile.user()?.contact?.phone) {
                    <a class="contact-info-item" [href]="'tel:' + profile.user()?.contact?.phone">
                      <span class="contact-info-icon">
                        <nxt1-icon name="phone" [size]="16" />
                      </span>
                      <div class="contact-info-text">
                        <span class="contact-info-label">Phone</span>
                        <span class="contact-info-value">{{ profile.user()?.contact?.phone }}</span>
                      </div>
                    </a>
                  }
                </div>
              }

              @if (connectedAccountsList().length > 0) {
                <h3 class="contact-section-title" style="margin-top: 24px;">Social Media</h3>
                <div class="contact-social-chips">
                  @for (acct of connectedAccountsList(); track acct.key) {
                    <a
                      class="contact-social-chip"
                      [href]="acct.url"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span class="contact-social-chip-icon" [style.color]="acct.color">
                        <nxt1-platform-icon
                          [icon]="acct.icon"
                          [faviconUrl]="acct.faviconUrl"
                          [size]="16"
                          [alt]="acct.label + ' icon'"
                        />
                      </span>
                      <span class="contact-social-chip-handle">{{
                        acct.handle || acct.label
                      }}</span>
                    </a>
                  }
                </div>
              }
            </div>

            <!-- RIGHT: Coach Contact -->
            @if (profile.user()?.coachContact; as coach) {
              <div class="contact-social-col">
                <h3 class="contact-section-title">Coach Contact</h3>
                <div class="coach-card">
                  <div class="coach-card-header">
                    <span class="coach-card-avatar">
                      <nxt1-icon name="person" [size]="18" />
                    </span>
                    <div class="coach-card-info">
                      <span class="coach-card-name"
                        >{{ coach.firstName }} {{ coach.lastName }}</span
                      >
                      @if (coach.title) {
                        <span class="coach-card-title">{{ coach.title }}</span>
                      }
                    </div>
                  </div>
                  <div class="coach-card-divider"></div>
                  <div class="contact-info-list">
                    @if (coach.email) {
                      <a class="contact-info-item" [href]="'mailto:' + coach.email">
                        <span class="contact-info-icon">
                          <nxt1-icon name="mail-outline" [size]="16" />
                        </span>
                        <div class="contact-info-text">
                          <span class="contact-info-label">Email</span>
                          <span class="contact-info-value">{{ coach.email }}</span>
                        </div>
                      </a>
                    }
                    @if (coach.phone) {
                      <a class="contact-info-item" [href]="'tel:' + coach.phone">
                        <span class="contact-info-icon">
                          <nxt1-icon name="phone" [size]="16" />
                        </span>
                        <div class="contact-info-text">
                          <span class="contact-info-label">Phone</span>
                          <span class="contact-info-value">{{ coach.phone }}</span>
                        </div>
                      </a>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        }
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      .ov-section-title {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text);
        margin: 0 0 14px;
        letter-spacing: -0.01em;
      }
      .ov-section-title--subsection {
        margin-top: 0;
      }
      .ov-section-title--bio-inline {
        margin-top: 24px;
      }
      .ov-mobile-teams {
        margin-top: -10px;
      }
      .ov-mobile-team-stack {
        margin-top: 12px;
      }
      .ov-overview-title {
        font-size: 16px;
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: -0.01em;
      }

      .ov-top-row {
        display: grid;
        grid-template-columns: minmax(0, 1.75fr) minmax(240px, 0.25fr);
        gap: 16px;
        align-items: start;
      }
      .ov-top-row--single {
        grid-template-columns: minmax(0, 1fr);
      }
      .ov-section {
        margin-bottom: 20px;
      }
      .ov-section--profile {
        /* inherits default */
      }

      /* Player Profile key-value grid */
      .ov-profile-grid {
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .ov-profile-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--m-border);
      }
      .ov-profile-row:last-child {
        border-bottom: none;
      }
      .ov-profile-key {
        font-size: 14px;
        color: var(--m-text-3);
        min-width: 80px;
        font-weight: 500;
      }
      .ov-profile-val {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
      }
      .ov-profile-val-wrap {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      /* Verified badge */
      .ov-verified-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--m-accent);
        letter-spacing: 0.01em;
        border: 1px solid color-mix(in srgb, var(--m-accent) 35%, transparent);
        background: color-mix(in srgb, var(--m-accent) 12%, transparent);
        border-radius: 999px;
        padding: 2px 8px 2px 6px;
        line-height: 1;
      }
      .ov-verified-link {
        text-decoration: none;
      }
      .ov-verified-link:hover {
        border-color: color-mix(in srgb, var(--m-accent) 55%, transparent);
      }
      .ov-verified-label {
        color: var(--m-text-2);
        font-weight: 600;
      }
      .ov-verified-logo {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--m-accent) 24%, transparent);
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .ov-verified-logo-img {
        width: 12px;
        height: 12px;
        object-fit: contain;
        display: block;
      }

      /* Last synced button */
      .ov-last-synced-btn {
        width: 100%;
        margin: 16px 0 0;
        padding: 14px 16px;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--m-accent) 28%, var(--m-border));
        background:
          linear-gradient(
            160deg,
            color-mix(in srgb, var(--m-accent) 11%, transparent),
            color-mix(in srgb, var(--m-surface) 88%, transparent)
          ),
          var(--m-surface);
        color: var(--m-text);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .ov-last-synced-main {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .ov-last-synced-label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--m-text-3);
      }
      .ov-last-synced-time {
        margin-top: 4px;
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
      }
      .ov-last-synced-agent {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .ov-last-synced-agentx {
        width: 34px;
        height: 34px;
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .ov-last-synced-agent-name {
        font-size: 13px;
        font-weight: 700;
        color: color-mix(in srgb, var(--m-accent) 72%, var(--m-text));
        letter-spacing: 0.02em;
      }

      /* Agent X Trait inline */
      .ov-trait-inline {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 8px;
        margin: 24px 0;
        width: 100%;
        min-width: 0;
      }
      .ov-trait-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .ov-trait-text {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        width: 100%;
        min-width: 0;
      }
      /* Mobile: agent badge on right, text on left */
      @media (max-width: 768px) {
        .ov-trait-inline {
          flex-direction: row-reverse;
          align-items: center;
          text-align: left;
          gap: 14px;
          margin: 16px 0;
          padding: 16px;
          border-radius: 14px;
          background: var(--m-surface);
          border: 1px solid var(--m-border);
        }
        .ov-trait-badge {
          flex-shrink: 0;
        }
        .ov-trait-text {
          align-items: flex-start;
          flex: 1;
          min-width: 0;
        }
        .ov-trait-icon-lg {
          width: 72px;
          height: 72px;
        }
        .ov-trait-summary {
          max-width: none;
        }
      }
      .ov-trait-icon-lg {
        width: 112px;
        height: 112px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }
      .ov-trait-icon-lg svg {
        width: 100%;
        height: 100%;
      }
      .ov-trait-icon-inner {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: var(--m-accent);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .ov-trait-icon-shell {
        fill: color-mix(in srgb, var(--m-accent) 15%, transparent);
        stroke: color-mix(in srgb, var(--m-accent) 70%, transparent);
        stroke-width: 2;
      }
      .ov-trait-icon-core {
        fill: color-mix(in srgb, var(--m-accent) 25%, transparent);
        stroke: color-mix(in srgb, var(--m-accent) 80%, transparent);
        stroke-width: 1.5;
      }
      .ov-trait-category {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: var(--m-accent);
        line-height: 1;
      }
      .ov-trait-summary {
        position: relative;
        font-size: 14px;
        font-weight: 600;
        color: var(--m-text);
        margin: 4px 0 0;
        line-height: 1.45;
        width: 100%;
        max-width: 320px;
        min-height: calc(1.45em * 4);
        overflow-wrap: anywhere;
      }
      .ov-trait-summary__reserve {
        display: block;
        visibility: hidden;
        pointer-events: none;
      }
      .ov-trait-summary__typed {
        position: absolute;
        inset: 0;
        display: block;
      }

      /* Connected Accounts */
      .ov-connected-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .ov-connected-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px 5px 7px;
        background: var(--m-card);
        border: 1px solid color-mix(in srgb, var(--m-accent) 18%, var(--m-border));
        border-radius: 999px;
        text-decoration: none;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          transform 0.15s ease;
        cursor: pointer;
      }
      .ov-connected-chip:hover {
        background: color-mix(in srgb, var(--m-accent) 8%, var(--m-card));
        border-color: color-mix(in srgb, var(--m-accent) 40%, var(--m-border));
        transform: translateY(-1px);
      }
      .ov-connected-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.06);
      }
      .ov-connected-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 12.5px;
        font-weight: 700;
        color: var(--m-text);
        white-space: nowrap;
        letter-spacing: 0.01em;
      }
      .ov-connected-check {
        display: inline-flex;
        align-items: center;
        color: var(--m-accent);
        flex-shrink: 0;
        margin-left: -2px;
      }
      .ov-connected-explainer {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 10px 0 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 11.5px;
        font-weight: 500;
        line-height: 1.45;
        color: var(--m-text-3);
        letter-spacing: 0.01em;
      }
      .ov-connected-agentx {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        color: var(--m-accent);
        margin-top: -1px;
      }

      /* Player Archetypes */
      .ov-archetype-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .ov-archetype-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border-radius: 50px;
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--m-accent) 10%, transparent) 0%,
          color-mix(in srgb, var(--m-accent) 4%, transparent) 100%
        );
        border: 1px solid color-mix(in srgb, var(--m-accent) 18%, transparent);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        transition:
          border-color 0.2s,
          transform 0.15s,
          box-shadow 0.2s;
        cursor: default;
      }
      .ov-archetype-badge:hover {
        border-color: var(--m-accent);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px color-mix(in srgb, var(--m-accent) 12%, transparent);
      }
      .ov-archetype-badge nxt1-icon {
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .ov-archetype-badge-name {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
        letter-spacing: 0.06em;
        white-space: nowrap;
        line-height: 1;
      }

      /* Player Bio */
      .ov-bio-card {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        margin-top: 16px;
        border-radius: 10px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .ov-bio-card--mobile-info {
        margin-top: 4px;
      }
      .ov-bio-card nxt1-icon {
        color: var(--m-accent);
        flex-shrink: 0;
        margin-top: 2px;
      }
      .ov-bio-card p {
        font-size: 15px;
        font-weight: 500;
        color: var(--m-text-2);
        line-height: 1.6;
        margin: 0;
      }

      /* Mobile-only team affiliations — hidden on desktop */
      .ov-mobile-teams {
        display: none;
      }

      .ov-mobile-sport-switcher {
        display: none;
      }

      /* Team block (shared) */
      .madden-team-stack {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .madden-team-block {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 16px;
        border-radius: 12px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .madden-team-block--clickable {
        cursor: pointer;
      }
      .madden-team-block--clickable:hover {
        border-color: color-mix(in srgb, var(--m-accent) 35%, var(--m-border));
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
      .madden-team-logo {
        width: 42px;
        height: 42px;
        object-fit: contain;
        border-radius: 6px;
        flex-shrink: 0;
      }
      .madden-team-logo-placeholder {
        width: 42px;
        height: 42px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        background: color-mix(in srgb, var(--m-accent) 10%, transparent);
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .madden-team-logo-wrap {
        flex-shrink: 0;
      }
      .madden-team-info {
        min-width: 0;
        flex: 1;
      }
      .madden-team-headline {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .madden-team-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }
      .madden-team-location {
        font-size: 12px;
        color: var(--m-text-3);
      }

      /* Empty state */
      .madden-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
      }
      .madden-empty h3 {
        font-size: 16px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 16px 0 8px;
      }
      .madden-empty__icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
        color: var(--nxt1-color-text-tertiary);
      }
      .madden-empty p {
        font-size: 14px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        max-width: 280px;
      }
      .madden-cta-btn {
        margin-top: 12px;
        padding: 10px 24px;
        background: var(--nxt1-color-primary);
        border: none;
        border-radius: 9999px;
        color: #000;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.1);
      }
      .madden-cta-btn:active {
        filter: brightness(0.95);
      }

      /* Stat grid (academic sub-section) */
      .acad-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 4px;
      }
      .acad-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 110px;
        min-height: 80px;
        padding: 14px 8px;
        border-radius: 10px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        flex-shrink: 0;
      }
      .acad-stat__value {
        font-size: 24px;
        font-weight: 800;
        color: var(--m-text);
        line-height: 1;
        margin-bottom: 5px;
      }
      .acad-stat__label {
        font-size: 11px;
        font-weight: 600;
        color: var(--m-text-3);
        text-transform: uppercase;
        letter-spacing: 0.07em;
      }

      /* Contact sub-section */
      .contact-social-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      .contact-social-col {
        display: flex;
        flex-direction: column;
      }
      .contact-section-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text);
        margin: 0 0 12px;
      }
      .contact-info-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .contact-info-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        text-decoration: none;
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
      }
      .contact-info-item:hover {
        border-color: color-mix(in srgb, var(--m-accent) 30%, var(--m-border));
        background: color-mix(in srgb, var(--m-accent) 4%, var(--m-surface));
      }
      .contact-info-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--m-accent) 10%, transparent);
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .contact-info-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .contact-info-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--m-text-3);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .contact-info-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--m-text);
        word-break: break-all;
      }
      .contact-social-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .contact-social-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px 8px 10px;
        border-radius: 999px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        text-decoration: none;
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
      }
      .contact-social-chip:hover {
        border-color: color-mix(in srgb, var(--m-accent) 30%, var(--m-border));
        background: color-mix(in srgb, var(--m-accent) 4%, var(--m-surface));
      }
      .contact-social-chip-icon {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }
      .contact-social-chip-favicon {
        display: block;
        width: 16px;
        height: 16px;
        border-radius: 3px;
        object-fit: contain;
      }
      .contact-social-chip-handle {
        font-size: 13px;
        font-weight: 600;
        color: var(--m-text);
      }

      /* Coach card */
      .coach-card {
        padding: 14px;
        border-radius: 12px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .coach-card-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .coach-card-avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--m-accent) 10%, transparent);
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .coach-card-info {
        display: flex;
        flex-direction: column;
      }
      .coach-card-name {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
      }
      .coach-card-title {
        font-size: 12px;
        color: var(--m-text-3);
      }
      .coach-card-divider {
        height: 1px;
        background: var(--m-border);
        margin-bottom: 12px;
      }

      /* Responsive */
      @media (max-width: 1360px) {
        .ov-top-row {
          grid-template-columns: minmax(0, 1fr);
          gap: 14px;
        }
      }
      @media (max-width: 768px) {
        .ov-top-row {
          grid-template-columns: minmax(0, 1fr);
          gap: 10px;
        }
        .ov-mobile-teams {
          display: block;
          margin-bottom: 12px;
        }
        /* Hide duplicate player stats on mobile — already shown in mobile hero */
        .ov-section--player-stats {
          display: none;
        }
        /* Hide desktop bio block on mobile — bio is already in ov-mobile-teams */
        .ov-section--bio {
          display: none;
        }
        .ov-mobile-teams .madden-team-block {
          padding: 10px 12px;
          border-radius: 10px;
          gap: 10px;
        }
        .ov-mobile-teams .madden-team-logo,
        .ov-mobile-teams .madden-team-logo-placeholder {
          width: 36px;
          height: 36px;
        }
        .ov-mobile-sport-switcher {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin: 8px 0 12px;
          padding: 10px 12px 12px;
          border-radius: 12px;
          background: var(--m-surface);
          border: 1px solid var(--m-border);
        }
        .ov-mobile-sport-switcher__title {
          color: var(--m-text-3);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .ov-mobile-sport-switcher__list {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .ov-mobile-sport-switcher__list::-webkit-scrollbar {
          display: none;
        }
        .ov-mobile-sport-switcher__item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px 5px 5px;
          border-radius: 999px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--m-text-2);
          white-space: nowrap;
        }
        .ov-mobile-sport-switcher__item--active {
          border-color: color-mix(in srgb, var(--m-accent) 35%, transparent);
          background: color-mix(in srgb, var(--m-accent) 12%, transparent);
          color: var(--m-text);
        }
        .ov-mobile-sport-switcher__avatar,
        .ov-mobile-sport-switcher__avatar-fallback {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .ov-mobile-sport-switcher__avatar {
          object-fit: cover;
          border: 1.5px solid transparent;
        }
        .ov-mobile-sport-switcher__avatar-fallback {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
          background: color-mix(in srgb, var(--m-text) 10%, transparent);
        }
        .ov-mobile-sport-switcher__item--active .ov-mobile-sport-switcher__avatar,
        .ov-mobile-sport-switcher__item--active .ov-mobile-sport-switcher__avatar-fallback {
          border-color: var(--m-accent);
        }
        .ov-mobile-sport-switcher__sport-name {
          font-size: 12px;
          font-weight: 600;
          line-height: 1;
        }
        .ov-mobile-sport-switcher__active-badge {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--m-accent);
          flex-shrink: 0;
        }
        .ov-archetype-badges {
          gap: 8px;
        }
        .ov-archetype-badge {
          gap: 6px;
          padding: 8px 12px;
          border-radius: 999px;
        }
        .ov-archetype-badge nxt1-icon {
          transform: scale(0.88);
          transform-origin: center;
        }
        .ov-archetype-badge-name {
          font-size: 13px;
          letter-spacing: 0.04em;
        }
        .contact-social-row {
          grid-template-columns: 1fr;
          gap: 16px;
        }
      }
    `,
  ],
})
export class ProfileOverviewComponent implements OnDestroy {
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;
  protected readonly profile = inject(ProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  protected readonly formatSportDisplayName = formatSportDisplayName;

  // Typewriter state
  private typewriterTimer: ReturnType<typeof setTimeout> | null = null;
  private typewriterTarget = '';
  private isTypewriterRunning = false;
  private readonly _hasPlayedTypewriter = signal(false);
  private readonly typedAgentXSummary = signal('');

  // ── Inputs ──

  readonly activeSideTab = input.required<string>();

  // ── Outputs ──

  readonly editProfileClick = output<void>();
  readonly teamClick = output<ProfileTeamAffiliation>();
  readonly addAwardClick = output<void>();

  // ── Trait label ──

  protected readonly traitCategoryLabel = computed(() => {
    const cat = this.profile.playerCard()?.trait?.category;
    if (cat === 'x-factor') return 'X-Factor';
    if (cat === 'hidden') return 'Agent';
    return 'Superstar';
  });

  // ── Typewriter ──

  protected readonly displayAgentXSummary = computed(() => {
    const summary = this.profile.playerCard()?.agentXSummary?.trim() ?? '';
    if (!summary) return '';
    if (!this.isBrowser || this._hasPlayedTypewriter()) return summary;
    return this.typedAgentXSummary();
  });

  protected readonly isFemaleProfile = computed(() => isFemaleGender(this.profile.user()?.gender));

  protected readonly formattedWeight = computed(() =>
    normalizeWeightDisplay(this.profile.user()?.weight)
  );

  protected readonly showWeight = computed(
    () => this.formattedWeight().length > 0 && !this.isFemaleProfile()
  );

  constructor() {
    effect(
      () => {
        const summary = this.profile.playerCard()?.agentXSummary?.trim() ?? '';
        if (!summary) {
          this.clearTypewriterTimer();
          this.typewriterTarget = '';
          this.isTypewriterRunning = false;
          this.typedAgentXSummary.set('');
          return;
        }
        if (!this.isBrowser) {
          this.typedAgentXSummary.set(summary);
          return;
        }
        if (this._hasPlayedTypewriter()) {
          this.typedAgentXSummary.set(summary);
          return;
        }
        if (this.isTypewriterRunning && this.typewriterTarget === summary) return;
        this.startTypewriter(summary);
      },
      { allowSignalWrites: true }
    );
  }

  // ── Team affiliations ──

  protected readonly teamAffiliations = computed((): ReadonlyArray<ProfileTeamAffiliation> => {
    const user = this.profile.user();
    if (!user) return [];
    const normalized: ProfileTeamAffiliation[] = [];
    const seen = new Set<string>();
    const push = (a: ProfileTeamAffiliation): void => {
      const name = a.name.trim();
      if (!name) return;
      const type = this.normalizeTeamType(a.type);
      const key = `${name.toLowerCase()}::${type}`;
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push({
        name,
        type,
        logoUrl: a.logoUrl,
        teamCode: a.teamCode,
        location: a.location,
      });
    };
    for (const a of user.teamAffiliations ?? []) push(a);
    if (user.school?.name) {
      push({
        name: user.school.name,
        type: this.normalizeTeamType(user.school.type) || 'high-school',
        logoUrl: user.school.logoUrl,
        teamCode: user.school.teamCode,
        location: user.school.location,
      });
    }
    if (user.collegeTeamName && user.collegeTeamName !== user.school?.name) {
      push({ name: user.collegeTeamName, type: 'college' });
    }
    return normalized.slice(0, 2);
  });

  protected readonly playerHistoryAffiliations = computed(
    (): ReadonlyArray<ProfileTeamAffiliation> => {
      const user = this.profile.user();
      if (!user) return [];
      const normalized: ProfileTeamAffiliation[] = [];
      const seen = new Set<string>();
      const push = (a: ProfileTeamAffiliation): void => {
        const name = a.name.trim();
        if (!name) return;
        const type = this.normalizeTeamType(a.type);
        const key = `${name.toLowerCase()}::${type}`;
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push({
          name,
          type,
          logoUrl: a.logoUrl,
          teamCode: a.teamCode,
          location: a.location,
          seasonRecord: a.seasonRecord,
          wins: a.wins,
          losses: a.losses,
          ties: a.ties,
        });
      };
      for (const a of user.teamAffiliations ?? []) push(a);
      if (user.school?.name) {
        push({
          name: user.school.name,
          type: this.normalizeTeamType(user.school.type) || 'high-school',
          logoUrl: user.school.logoUrl,
          teamCode: user.school.teamCode,
          location: user.school.location,
          seasonRecord: user.school.seasonRecord,
          wins: user.school.wins,
          losses: user.school.losses,
          ties: user.school.ties,
        });
      }
      if (user.collegeTeamName && user.collegeTeamName !== user.school?.name) {
        push({ name: user.collegeTeamName, type: 'college' });
      }
      return normalized;
    }
  );

  /** Mapped entries for the shared history timeline component */
  protected readonly playerHistoryEntries = computed((): readonly HistoryTimelineEntry[] => {
    const affiliations = this.playerHistoryAffiliations();
    return affiliations.map((team, index) => ({
      label: this.historySeasonLabel(index),
      name: team.name,
      logoUrl: team.logoUrl,
      subtitle: team.location,
      record: this.historyTeamRecord(team) ?? 'N/A',
      fallbackIcon: TEAM_TYPE_ICONS[this.normalizeTeamType(team.type)],
    }));
  });

  /** Empty-state description text (own profile vs. other) */
  protected readonly playerHistoryEmptyText = computed(() =>
    this.profile.isOwnProfile()
      ? 'Team history and year-by-year progression will appear here.'
      : "This athlete hasn't added any team history yet."
  );

  // ── Connected accounts ──

  private static readonly PLATFORM_META: Readonly<
    Record<string, { label: string; icon: string; color: string; handlePrefix: string }>
  > = {
    twitter: { label: 'X', icon: 'twitter', color: 'currentColor', handlePrefix: '@' },
    instagram: { label: 'Instagram', icon: 'instagram', color: '#E1306C', handlePrefix: '@' },
    youtube: { label: 'YouTube', icon: 'youtube', color: '#FF0000', handlePrefix: '' },
    hudl: { label: 'Hudl', icon: 'link', color: '#FF6600', handlePrefix: '' },
    maxpreps: { label: 'MaxPreps', icon: 'link', color: '#003DA5', handlePrefix: '' },
    on3: { label: 'On3', icon: 'link', color: '#000000', handlePrefix: '' },
    rivals: { label: 'Rivals', icon: 'link', color: '#F47B20', handlePrefix: '' },
    espn: { label: 'ESPN', icon: 'link', color: '#CC0000', handlePrefix: '' },
    tiktok: { label: 'TikTok', icon: 'link', color: '#000000', handlePrefix: '@' },
  };

  protected readonly connectedAccountsList = computed(
    (): ReadonlyArray<{
      readonly key: string;
      readonly label: string;
      readonly handle: string;
      readonly icon: string;
      readonly color: string;
      readonly url: string;
      readonly faviconUrl: string | null;
    }> => {
      const connectedSources = this.profile.user()?.connectedSources ?? [];

      const def = { label: '', icon: 'link', color: 'currentColor', handlePrefix: '' };

      if (connectedSources.length === 0) return [];

      return connectedSources
        .slice()
        .filter((cs) => cs.platform.toLowerCase() !== 'manual')
        .sort((a, b) => {
          const orderA = (a as unknown as { displayOrder?: number }).displayOrder ?? 99;
          const orderB = (b as unknown as { displayOrder?: number }).displayOrder ?? 99;
          return orderA - orderB;
        })
        .slice(0, 8)
        .map((cs) => {
          const meta = ProfileOverviewComponent.PLATFORM_META[cs.platform.toLowerCase()] ?? def;
          const handle = meta.label || cs.platform;
          return {
            key: cs.platform,
            label: meta.label || cs.platform,
            handle,
            icon: meta.icon,
            color: meta.color,
            url: cs.profileUrl,
            faviconUrl: cs.faviconUrl ?? getPlatformFaviconUrl(cs.platform.toLowerCase()) ?? null,
          };
        });
    }
  );

  // ── Awards ──

  protected readonly awardsEmptyState: Partial<TimelineEmptyConfig> = {
    icon: 'trophy',
    title: 'No Awards Yet',
    description: "This athlete hasn't added any awards yet.",
    ownProfileDescription:
      'Add your athletic awards, honors, and recognitions to stand out to college coaches.',
  };

  protected readonly awardsDotOverrides: Partial<Record<string, TimelineDotConfig>> = {
    primary: { icon: 'trophy', size: 14 },
    secondary: { icon: 'trophy', size: 12 },
  };

  protected readonly awardsTimelineItems = computed((): readonly TimelineItem<ProfileAward>[] => {
    const awards = this.profile.awards();
    const currentYear = new Date().getFullYear();
    return awards.map((award) => {
      const year = this.parseAwardYear(award.season);
      const isRecent = year !== null && year >= currentYear - 1;
      const variant = isRecent ? 'primary' : 'secondary';
      const isoDate = year !== null ? `${year}-06-01T00:00:00.000Z` : new Date().toISOString();
      const tags: { label: string; variant: 'primary' | 'secondary' }[] = [];
      if (award.sport) tags.push({ label: award.sport, variant });
      return {
        id: award.id,
        title: award.title,
        subtitle: award.issuer,
        footerLeft: award.sport,
        footerRight: award.season,
        date: isoDate,
        variant,
        badge: { icon: 'trophy', label: 'Award' },
        tags: tags.length > 0 ? tags : undefined,
        data: award,
      };
    });
  });

  // ── Measurables verification ──

  protected readonly measurablesVerification = computed(() =>
    getVerification(this.profile.user(), 'measurables')
  );

  protected readonly measurablesVerifiedByLabel = computed(
    () => this.measurablesVerification()?.verifiedBy ?? 'provider'
  );

  protected readonly measurablesProviderUrl = computed(() => {
    const v = this.measurablesVerification();
    if (!v) return null;
    const explicitUrl = v.sourceUrl?.trim();
    if (explicitUrl) return this.ensureAbsoluteUrl(explicitUrl);
    const provider = v.verifiedBy?.trim().toLowerCase() ?? '';
    if (!provider) return null;
    if (provider.includes('rivals')) return 'https://www.rivals.com';
    if (provider.includes('hudl')) return 'https://www.hudl.com';
    if (provider.includes('maxpreps')) return 'https://www.maxpreps.com';
    if (provider.includes('247') || provider.includes('247sports')) return 'https://247sports.com';
    if (provider.includes('on3')) return 'https://www.on3.com';
    return null;
  });

  protected readonly measurablesProviderLogoSrc = computed(() => {
    const v = this.measurablesVerification();
    if (v?.sourceLogoUrl) return v.sourceLogoUrl;
    const host = this.providerHost(this.measurablesProviderUrl());
    return `https://logo.clearbit.com/${host}`;
  });

  protected readonly measurablesProviderLogoFallbackSrc = computed(() => {
    const v = this.measurablesVerification();
    if (v?.sourceLogoUrl) return v.sourceLogoUrl;
    const host = this.providerHost(this.measurablesProviderUrl());
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  });

  // ── Last synced ──

  protected readonly lastSyncedLabel = computed(() => {
    const connectedSources = this.profile.user()?.connectedSources ?? [];
    const latestConnectedSync = connectedSources
      .map((source) => source.lastSyncedAt)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((left, right) => right.getTime() - left.getTime())[0];

    if (latestConnectedSync) {
      return this.formatRelativeTime(latestConnectedSync);
    }

    const updatedAt = this.profile.user()?.updatedAt;
    if (!updatedAt) return 'Never synced';
    const parsed = new Date(updatedAt);
    if (Number.isNaN(parsed.getTime())) return 'Never synced';
    return this.formatRelativeTime(parsed);
  });

  // ── Actions ──

  protected onEditProfile(): void {
    this.editProfileClick.emit();
  }

  protected onTeamClick(team: ProfileTeamAffiliation): void {
    this.teamClick.emit(team);
  }

  protected onEditContact(): void {
    // placeholder — edit contact functionality
  }

  protected onAddAward(): void {
    this.addAwardClick.emit();
  }

  protected async onSyncNow(): Promise<void> {
    try {
      await this.profile.refresh();
      this.toast.success('Profile synced with Agent X');
    } catch {
      this.toast.error('Sync failed. Please try again.');
    }
  }

  protected onSportSwitch(index: number): void {
    this.profile.setActiveSportIndex(index);
  }

  // ── Helpers ──

  protected archetypeIconName(name: string, fallbackIcon?: string | null): IconName {
    const normalizedName = name.trim().toLowerCase();
    const mappedIcon = ARCHETYPE_TOKEN_ICONS[normalizedName];
    if (mappedIcon) return mappedIcon;
    if (fallbackIcon && fallbackIcon in ICONS) return fallbackIcon as IconName;
    return 'sparkles';
  }

  protected teamIconName(type?: ProfileTeamType): IconName {
    const normalized = this.normalizeTeamType(type);
    return TEAM_TYPE_ICONS[normalized];
  }

  protected historySeasonLabel(index: number): string {
    const classYearValue = Number(this.profile.user()?.classYear ?? 0);
    const hasClassYear = Number.isFinite(classYearValue) && classYearValue > 1900;
    if (!hasClassYear) return index === 0 ? 'Current' : `Prior ${index}`;
    const endYear = classYearValue - index;
    const startYear = endYear - 1;
    return `${startYear}-${endYear}`;
  }

  protected historyTeamRecord(team: ProfileTeamAffiliation): string | null {
    const directRecord = team.seasonRecord?.trim();
    if (directRecord) return directRecord;
    const wins = this.parseRecordNumber(team.wins);
    const losses = this.parseRecordNumber(team.losses);
    const ties = this.parseRecordNumber(team.ties);
    if (wins === null || losses === null) return null;
    if (ties === null || ties <= 0) return `${wins}-${losses}`;
    return `${wins}-${losses}-${ties}`;
  }

  private normalizeTeamType(type?: string): ProfileTeamType {
    if (!type) return 'other';
    const n = type.trim().toLowerCase();
    if (n === 'high-school' || n === 'high school' || n === 'hs') return 'high-school';
    if (n === 'middle-school' || n === 'middle school' || n === 'ms') return 'middle-school';
    if (n === 'club') return 'club';
    if (n === 'juco' || n === 'junior college') return 'juco';
    if (n === 'college') return 'college';
    if (n === 'academy') return 'academy';
    if (n === 'travel' || n === 'travel-team' || n === 'travel team') return 'travel';
    return 'other';
  }

  private parseRecordNumber(value: number | string | undefined): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return null;
  }

  private parseAwardYear(season?: string): number | null {
    if (!season) return null;
    const allYears = [...season.matchAll(/(\d{4})/g)].map((m) => parseInt(m[1], 10));
    return allYears.length > 0 ? Math.max(...allYears) : null;
  }

  private ensureAbsoluteUrl(rawUrl: string): string {
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
    return `https://${rawUrl}`;
  }

  private providerHost(url: string | null): string {
    if (!url) return 'example.com';
    try {
      return new URL(url).hostname || 'example.com';
    } catch {
      return 'example.com';
    }
  }

  private formatRelativeTime(date: Date): string {
    const now = Date.now();
    const diffMs = now - date.getTime();
    if (diffMs < 60_000) return 'Just now';
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const minutes = Math.round(diffMs / 60_000);
    if (minutes < 60) return rtf.format(-minutes, 'minute');
    const hours = Math.round(diffMs / 3_600_000);
    if (hours < 24) return rtf.format(-hours, 'hour');
    const days = Math.round(diffMs / 86_400_000);
    if (days < 30) return rtf.format(-days, 'day');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private startTypewriter(summary: string): void {
    this.clearTypewriterTimer();
    this.typewriterTarget = summary;
    this.isTypewriterRunning = true;
    this.typedAgentXSummary.set('');
    let cursor = 0;
    const step = () => {
      cursor += 1;
      this.typedAgentXSummary.set(summary.slice(0, cursor));
      if (cursor < summary.length) {
        this.typewriterTimer = setTimeout(step, 16);
        return;
      }
      this.isTypewriterRunning = false;
      this._hasPlayedTypewriter.set(true);
      this.typewriterTimer = null;
    };
    this.typewriterTimer = setTimeout(step, 120);
  }

  private clearTypewriterTimer(): void {
    if (this.typewriterTimer !== null) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.clearTypewriterTimer();
  }
}
