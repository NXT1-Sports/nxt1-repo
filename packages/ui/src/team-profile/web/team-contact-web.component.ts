/**
 * @fileoverview Team Contact Section Component - Web
 * @module @nxt1/ui/team-profile/web
 *
 * Displays contact info, social media links, and head coach contact card
 * for a team profile. Mirrors ProfileContactWebComponent layout exactly.
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, output, computed, input } from '@angular/core';
import { NxtIconComponent } from '../../components/icon';
import { NxtPlatformIconComponent } from '../../components/platform-icon';
import { getPlatformFaviconUrl } from '@nxt1/core/platforms';
import { TeamProfileService } from '../team-profile.service';

function deriveConnectedHandle(profileUrl: string, fallback: string, prefix = ''): string {
  try {
    const parsed = new URL(profileUrl);
    const segment = parsed.pathname
      .split('/')
      .filter(Boolean)
      .map((item) => decodeURIComponent(item))
      .slice(-1)[0];

    if (!segment) return fallback;

    const normalized = segment.replace(/^@/, '').trim();
    if (!normalized) return fallback;

    const needsPrefix = prefix.length > 0 && !segment.startsWith(prefix);
    return needsPrefix ? `${prefix}${normalized}` : segment;
  } catch {
    return fallback;
  }
}

@Component({
  selector: 'nxt1-team-contact-web',
  standalone: true,
  imports: [NxtIconComponent, NxtPlatformIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="madden-tab-section" aria-labelledby="team-contact-heading">
      <h2 id="team-contact-heading" class="sr-only">Contact Information</h2>
      @if (!hasAnyContactInfo()) {
        <div class="madden-empty">
          <div class="madden-empty__icon" aria-hidden="true">
            <nxt1-icon
              [name]="activeSection() === 'connected' ? 'link' : 'mail-outline'"
              [size]="40"
            />
          </div>
          <h3>
            {{
              activeSection() === 'connected' ? 'No connected accounts yet' : 'Contact info not set'
            }}
          </h3>
          <p>
            @if (activeSection() === 'connected') {
              Connect your team's verified platforms and accounts so the program profile feels
              complete.
            } @else {
              This team hasn't added contact information yet.
            }
          </p>
          @if (
            teamProfile.isTeamAdmin() &&
            !(activeSection() === 'connected' && hideConnectedInlineCta())
          ) {
            <button
              type="button"
              class="madden-cta-btn"
              (click)="
                activeSection() === 'connected' ? connectedAccountsClick.emit() : manageTeam.emit()
              "
            >
              {{ activeSection() === 'connected' ? 'Connect Accounts' : 'Add Contact Info' }}
            </button>
          }
        </div>
      } @else {
        <div
          class="contact-social-row"
          [class.contact-social-row--single]="activeSection() === 'contact' && !hasCoreContact()"
        >
          <!-- LEFT: Contact + Social Media -->
          @if (
            (activeSection() === 'contact' && hasCoreContact()) ||
            (activeSection() === 'connected' && connectedAccountsList().length > 0)
          ) {
            <div class="contact-social-col">
              @if (activeSection() === 'contact' && hasCoreContact()) {
                <h3 class="contact-section-title">Contact</h3>
                <div class="contact-info-list">
                  @if (teamProfile.team()?.contact?.email) {
                    <a
                      class="contact-info-item"
                      [href]="'mailto:' + teamProfile.team()!.contact!.email"
                    >
                      <span class="contact-info-icon">
                        <nxt1-icon name="mail-outline" [size]="16" />
                      </span>
                      <div class="contact-info-text">
                        <span class="contact-info-label">Email</span>
                        <span class="contact-info-value">{{
                          teamProfile.team()!.contact!.email
                        }}</span>
                      </div>
                    </a>
                  }
                  @if (teamProfile.team()?.contact?.phone) {
                    <a
                      class="contact-info-item"
                      [href]="'tel:' + teamProfile.team()!.contact!.phone"
                    >
                      <span class="contact-info-icon">
                        <nxt1-icon name="phone" [size]="16" />
                      </span>
                      <div class="contact-info-text">
                        <span class="contact-info-label">Phone</span>
                        <span class="contact-info-value">{{
                          teamProfile.team()!.contact!.phone
                        }}</span>
                      </div>
                    </a>
                  }
                </div>
              }

              @if (activeSection() === 'connected' && connectedAccountsList().length > 0) {
                <h3 class="contact-section-title">Connected</h3>
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
                      @if (acct.verified) {
                        <nxt1-icon
                          name="checkmark-circle"
                          [size]="14"
                          class="contact-social-verified"
                        />
                      }
                    </a>
                  }
                </div>
              }
            </div>
          }

          <!-- RIGHT: Coaching Staff Contacts -->
          @if (activeSection() === 'contact' && coachContacts().length > 0) {
            <div class="contact-social-col">
              <h3 class="contact-section-title">Coaching Staff</h3>
              <div class="coach-grid">
                @for (coach of coachContacts(); track coach.id) {
                  <div class="coach-card">
                    <div class="coach-card-header">
                      <span class="coach-card-avatar">
                        <nxt1-icon name="shield" [size]="18" />
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
                }
              </div>
            </div>
          }
        </div>

        <!-- Location section — full width below the grid -->
        @if (activeSection() === 'contact' && hasLocationInfo()) {
          <div class="location-section">
            <h3 class="contact-section-title">Location</h3>
            <div class="contact-info-list">
              @if (teamProfile.team()?.city || teamProfile.team()?.state) {
                <div class="contact-info-item contact-info-item--static">
                  <span class="contact-info-icon">
                    <nxt1-icon name="location" [size]="16" />
                  </span>
                  <div class="contact-info-text">
                    <span class="contact-info-label">City / State</span>
                    <span class="contact-info-value"
                      >{{ teamProfile.team()?.city
                      }}{{ teamProfile.team()?.city && teamProfile.team()?.state ? ', ' : ''
                      }}{{ teamProfile.team()?.state }}</span
                    >
                  </div>
                </div>
              }
              @if (teamProfile.team()?.contact?.address) {
                <div class="contact-info-item contact-info-item--static">
                  <span class="contact-info-icon">
                    <nxt1-icon name="map" [size]="16" />
                  </span>
                  <div class="contact-info-text">
                    <span class="contact-info-label">Address</span>
                    <span class="contact-info-value">{{
                      teamProfile.team()!.contact!.address
                    }}</span>
                  </div>
                </div>
              }
              @if (teamProfile.team()?.homeVenue) {
                <div class="contact-info-item contact-info-item--static">
                  <span class="contact-info-icon">
                    <nxt1-icon name="stadium" [size]="16" />
                  </span>
                  <div class="contact-info-text">
                    <span class="contact-info-label">Home Venue</span>
                    <span class="contact-info-value">{{ teamProfile.team()!.homeVenue }}</span>
                  </div>
                </div>
              }
            </div>
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

      /* ─── EMPTY STATE ─── */
      .madden-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 48px 24px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
      }
      .madden-empty h3 {
        font-size: 16px;
        font-weight: 700;
        color: var(--m-text);
        margin: 16px 0 8px;
      }
      .madden-empty__icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.4));
      }
      .madden-empty p {
        font-size: 14px;
        color: var(--m-text-2);
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

      /* ─── CONTACT + SOCIAL SIDE-BY-SIDE ─── */
      .contact-social-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        align-items: start;
      }
      .contact-social-row--single {
        grid-template-columns: minmax(0, 1fr);
      }
      .contact-social-col {
        display: flex;
        flex-direction: column;
      }
      @media (max-width: 720px) {
        .contact-social-row {
          grid-template-columns: 1fr;
          gap: 20px;
        }
      }

      .contact-section-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text);
        margin: 0 0 12px;
      }
      .contact-section-header {
        display: none;
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
        color: var(--m-text);
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
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--m-text-3);
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
      .contact-social-chip-handle {
        font-size: 13px;
        font-weight: 600;
        color: var(--m-text);
      }
      .contact-social-verified {
        color: var(--m-accent, var(--nxt1-color-primary, #d4ff00));
        flex-shrink: 0;
      }

      .coach-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      @media (max-width: 860px) {
        .coach-grid {
          grid-template-columns: 1fr;
        }
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
        gap: 10px;
        margin-bottom: 12px;
      }
      .coach-card-avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--m-accent) 10%, transparent);
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .coach-card-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .coach-card-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text);
        line-height: 1.2;
      }
      .coach-card-title {
        font-size: 12px;
        font-weight: 500;
        color: var(--m-text-3);
        line-height: 1.2;
      }
      .coach-card-divider {
        height: 1px;
        background: var(--m-border);
        margin-bottom: 12px;
      }
      .coach-card .contact-info-list {
        gap: 6px;
      }
      .coach-card .contact-info-item {
        background: transparent;
        border: none;
        padding: 8px 6px;
        border-radius: 8px;
      }
      .coach-card .contact-info-item:hover {
        background: rgba(255, 255, 255, 0.04);
      }

      /* ─── LOCATION SECTION ─── */
      .location-section {
        margin-top: 20px;
      }
      .contact-info-item--static {
        cursor: default;
        pointer-events: none;
      }
      .contact-info-item--static:hover {
        border-color: var(--m-border);
        background: var(--m-surface);
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
    `,
  ],
})
export class TeamContactWebComponent {
  protected readonly teamProfile = inject(TeamProfileService);
  readonly activeSection = input<string>('contact');
  readonly hideConnectedInlineCta = input(false);

  /** Emitted when admin clicks a manage CTA button */
  readonly manageTeam = output<void>();
  /** Emitted when admin wants to manage connected accounts */
  readonly connectedAccountsClick = output<void>();

  // ── Social Accounts ──

  private static readonly PLATFORM_META: Readonly<
    Record<
      string,
      { label: string; icon: string; color: string; handlePrefix: string; showHandle: boolean }
    >
  > = {
    twitter: {
      label: 'X',
      icon: 'twitter',
      color: 'currentColor',
      handlePrefix: '@',
      showHandle: true,
    },
    instagram: {
      label: 'Instagram',
      icon: 'instagram',
      color: '#E1306C',
      handlePrefix: '@',
      showHandle: true,
    },
    youtube: {
      label: 'YouTube',
      icon: 'youtube',
      color: '#FF0000',
      handlePrefix: '@',
      showHandle: true,
    },
    facebook: {
      label: 'Facebook',
      icon: 'link',
      color: '#1877F2',
      handlePrefix: '@',
      showHandle: true,
    },
    hudl: { label: 'Hudl', icon: 'link', color: '#FF6600', handlePrefix: '', showHandle: false },
    maxpreps: {
      label: 'MaxPreps',
      icon: 'link',
      color: '#003DA5',
      handlePrefix: '',
      showHandle: false,
    },
    on3: { label: 'On3', icon: 'link', color: '#000000', handlePrefix: '', showHandle: false },
    rivals: {
      label: 'Rivals',
      icon: 'link',
      color: '#F47B20',
      handlePrefix: '',
      showHandle: false,
    },
    espn: { label: 'ESPN', icon: 'link', color: '#CC0000', handlePrefix: '', showHandle: false },
    tiktok: {
      label: 'TikTok',
      icon: 'link',
      color: '#000000',
      handlePrefix: '@',
      showHandle: true,
    },
  };

  protected readonly coachContacts = computed(() => {
    const seen = new Set<string>();

    return this.teamProfile
      .staff()
      .filter(
        (member) =>
          (member.role === 'head-coach' || member.role === 'assistant-coach') &&
          (!!member.email || !!member.phone)
      )
      .filter((member) => {
        const key =
          member.id || member.email || member.phone || `${member.firstName}-${member.lastName}`;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const rank = (role: string) => (role === 'head-coach' ? 0 : 1);
        return rank(a.role) - rank(b.role);
      });
  });

  protected readonly hasCoreContact = computed(() => {
    const team = this.teamProfile.team();
    return !!team?.contact?.email || !!team?.contact?.phone;
  });

  protected readonly hasLocationInfo = computed(() => {
    const team = this.teamProfile.team();
    return !!team?.city || !!team?.state || !!team?.contact?.address || !!team?.homeVenue;
  });

  /** Whether the current connect subsection has any content */
  protected readonly hasAnyContactInfo = computed((): boolean => {
    if (this.activeSection() === 'connected') {
      return this.connectedAccountsList().length > 0;
    }

    return this.hasCoreContact() || this.coachContacts().length > 0 || this.hasLocationInfo();
  });

  /** Sorted + formatted social media accounts */
  protected readonly connectedAccountsList = computed(
    (): ReadonlyArray<{
      readonly key: string;
      readonly label: string;
      readonly handle: string;
      readonly icon: string;
      readonly color: string;
      readonly url: string;
      readonly verified: boolean;
      readonly faviconUrl: string | null;
    }> => {
      const connectedSources = this.teamProfile.team()?.connectedSources;
      if (!connectedSources?.length) return [];

      const defaultMeta = {
        label: '',
        icon: 'link',
        color: 'currentColor',
        handlePrefix: '',
        showHandle: false,
      };

      return connectedSources
        .slice()
        .sort((a, b) => (a.displayOrder ?? 99) - (b.displayOrder ?? 99))
        .slice(0, 8)
        .map((source, index) => {
          const meta =
            TeamContactWebComponent.PLATFORM_META[source.platform.toLowerCase()] ?? defaultMeta;
          const handle = meta.showHandle
            ? deriveConnectedHandle(
                source.profileUrl,
                meta.label || source.platform,
                meta.handlePrefix
              )
            : meta.label || source.platform;
          return {
            key: `${source.platform}-${source.scopeType ?? 'global'}-${source.scopeId ?? index}`,
            label: meta.label || source.platform,
            handle,
            icon: meta.icon,
            color: meta.color,
            url: source.profileUrl,
            verified: source.syncStatus !== 'error',
            faviconUrl: getPlatformFaviconUrl(source.platform.toLowerCase()),
          };
        });
    }
  );
}
