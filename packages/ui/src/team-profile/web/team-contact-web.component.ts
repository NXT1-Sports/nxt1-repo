/**
 * @fileoverview Team Contact Section Component - Web
 * @module @nxt1/ui/team-profile/web
 *
 * Displays contact info, social media links, and head coach contact card
 * for a team profile. Mirrors ProfileContactWebComponent layout exactly.
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { NxtIconComponent } from '../../components/icon';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-contact-web',
  standalone: true,
  imports: [NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="madden-tab-section" aria-labelledby="team-contact-heading">
      <h2 id="team-contact-heading" class="sr-only">Contact Information</h2>
      @if (!hasAnyContactInfo()) {
        <div class="madden-empty">
          <div class="madden-empty__icon" aria-hidden="true">
            <nxt1-icon name="mail-outline" [size]="40" />
          </div>
          <h3>Contact info not set</h3>
          <p>This team hasn't added contact information yet.</p>
        </div>
      } @else {
        <div class="contact-social-row">
          <!-- LEFT: Contact + Social Media -->
          <div class="contact-social-col">
            @if (
              teamProfile.team()?.contact?.email ||
              teamProfile.team()?.contact?.phone ||
              teamProfile.team()?.contact?.website
            ) {
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
                  <a class="contact-info-item" [href]="'tel:' + teamProfile.team()!.contact!.phone">
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
                @if (teamProfile.team()?.contact?.website) {
                  <a
                    class="contact-info-item"
                    [href]="teamProfile.team()!.contact!.website"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span class="contact-info-icon">
                      <nxt1-icon name="globe-outline" [size]="16" />
                    </span>
                    <div class="contact-info-text">
                      <span class="contact-info-label">Website</span>
                      <span class="contact-info-value">{{
                        teamProfile.team()!.contact!.website
                      }}</span>
                    </div>
                  </a>
                }
              </div>
            }

            @if (connectedAccountsList().length > 0) {
              <h3 class="contact-section-title" style="margin-top: 24px">Social Media</h3>
              <div class="contact-social-chips">
                @for (acct of connectedAccountsList(); track acct.key) {
                  <a
                    class="contact-social-chip"
                    [href]="acct.url"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span class="contact-social-chip-icon" [style.color]="acct.color">
                      <nxt1-icon [name]="acct.icon" [size]="16" />
                    </span>
                    <span class="contact-social-chip-handle">{{ acct.handle || acct.label }}</span>
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

          <!-- RIGHT: Head Coach Contact -->
          @if (teamProfile.headCoach(); as coach) {
            <div class="contact-social-col">
              <h3 class="contact-section-title">Head Coach</h3>
              <div class="coach-card">
                <div class="coach-card-header">
                  <span class="coach-card-avatar">
                    <nxt1-icon name="person" [size]="18" />
                  </span>
                  <div class="coach-card-info">
                    <span class="coach-card-name">{{ coach.firstName }} {{ coach.lastName }}</span>
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

      /* ─── CONTACT + SOCIAL SIDE-BY-SIDE ─── */
      .contact-social-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
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

  // ── Social Accounts ──

  private static readonly PLATFORM_META: Readonly<
    Record<string, { label: string; icon: string; color: string; handlePrefix: string }>
  > = {
    twitter: { label: 'X', icon: 'twitter', color: 'currentColor', handlePrefix: '@' },
    instagram: { label: 'Instagram', icon: 'instagram', color: '#E1306C', handlePrefix: '@' },
    youtube: { label: 'YouTube', icon: 'youtube', color: '#FF0000', handlePrefix: '' },
    facebook: { label: 'Facebook', icon: 'link', color: '#1877F2', handlePrefix: '' },
    hudl: { label: 'Hudl', icon: 'link', color: '#FF6600', handlePrefix: '' },
    maxpreps: { label: 'MaxPreps', icon: 'link', color: '#003DA5', handlePrefix: '' },
    on3: { label: 'On3', icon: 'link', color: '#000000', handlePrefix: '' },
    rivals: { label: 'Rivals', icon: 'link', color: '#F47B20', handlePrefix: '' },
    espn: { label: 'ESPN', icon: 'link', color: '#CC0000', handlePrefix: '' },
    tiktok: { label: 'TikTok', icon: 'link', color: '#000000', handlePrefix: '@' },
  };

  /** Whether any contact info exists at all */
  protected readonly hasAnyContactInfo = computed((): boolean => {
    const team = this.teamProfile.team();
    const hasCoreContact =
      !!team?.contact?.email || !!team?.contact?.phone || !!team?.contact?.website;
    const hasSocial = !!team?.social && team.social.length > 0;
    const hasCoach = !!this.teamProfile.headCoach();
    return hasCoreContact || hasSocial || hasCoach;
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
    }> => {
      const social = this.teamProfile.team()?.social;
      if (!social?.length) return [];

      const defaultMeta = { label: '', icon: 'link', color: 'currentColor', handlePrefix: '' };

      return social
        .slice()
        .sort((a, b) => (a.displayOrder ?? 99) - (b.displayOrder ?? 99))
        .slice(0, 8)
        .map((link) => {
          const meta =
            TeamContactWebComponent.PLATFORM_META[link.platform.toLowerCase()] ?? defaultMeta;
          const handle = link.username
            ? `${meta.handlePrefix}${link.username}`
            : meta.label || link.platform;
          return {
            key: link.platform,
            label: meta.label || link.platform,
            handle,
            icon: meta.icon,
            color: meta.color,
            url: link.url,
            verified: !!link.verified,
          };
        });
    }
  );
}
