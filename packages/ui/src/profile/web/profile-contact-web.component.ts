/**
 * @fileoverview Profile Contact Tab Component - Web
 * @module @nxt1/ui/profile/web
 *
 * Extracted from ProfileShellWebComponent.
 * Displays contact info, social media links, and coach contact card.
 */
import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { NxtIconComponent } from '../../components/icon';
import { ProfileService } from '../profile.service';

@Component({
  selector: 'nxt1-profile-contact-web',
  standalone: true,
  imports: [NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="madden-tab-section" aria-labelledby="contact-heading">
      <h2 id="contact-heading" class="sr-only">Contact Information</h2>
      @if (
        !profile.user()?.contact?.email &&
        !profile.user()?.contact?.phone &&
        !profile.user()?.social &&
        !profile.user()?.coachContact
      ) {
        <div class="madden-empty">
          <nxt1-icon name="mail" [size]="48" />
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
              Edit Contact
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
                  <a class="contact-info-item" [href]="'mailto:' + profile.user()?.contact?.email">
                    <span class="contact-info-icon">
                      <nxt1-icon name="mail" [size]="16" />
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
                      <nxt1-icon [name]="acct.icon" [size]="16" />
                    </span>
                    <span class="contact-social-chip-handle">{{ acct.handle || acct.label }}</span>
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
                        <nxt1-icon name="mail" [size]="16" />
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
      .madden-empty p {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0 0 20px;
        max-width: 280px;
      }
      .madden-cta-btn {
        background: var(--m-accent);
        color: #000;
        border: none;
        border-radius: 999px;
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: filter 0.15s;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.1);
      }

      /* ─── CONTACT + SOCIAL SIDE-BY-SIDE ─── */
      .contact-social-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 32px;
        align-items: start;
      }
      .contact-social-col {
        min-width: 0;
      }
      @media (max-width: 720px) {
        .contact-social-row {
          grid-template-columns: 1fr;
          gap: 28px;
        }
      }

      .contact-section-title {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text);
        margin: 0 0 14px;
        letter-spacing: -0.01em;
        line-height: 1.2;
      }

      .contact-info-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .contact-info-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 16px;
        border-radius: 10px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        color: var(--m-text);
        text-decoration: none;
        transition: all 0.15s ease;
      }
      .contact-info-item:hover {
        background: var(--m-surface-2);
        border-color: var(--m-accent);
      }
      .contact-info-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--m-accent) 8%, transparent);
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .contact-info-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .contact-info-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--m-dim);
        line-height: 1;
      }
      .contact-info-value {
        font-size: 14px;
        font-weight: 500;
        color: var(--m-text);
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .contact-social-chips {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .contact-social-chip {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-radius: 10px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        text-decoration: none;
        transition: all 0.15s ease;
      }
      .contact-social-chip:hover {
        background: var(--m-surface-2);
        border-color: var(--m-accent);
      }
      .contact-social-chip-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.06);
        flex-shrink: 0;
      }
      .contact-social-chip-handle {
        font-size: 14px;
        font-weight: 500;
        color: var(--m-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .coach-card {
        border-radius: 12px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        overflow: hidden;
      }
      .coach-card-header {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px;
      }
      .coach-card-avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--m-accent) 10%, transparent);
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .coach-card-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .coach-card-name {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
        line-height: 1.2;
      }
      .coach-card-title {
        font-size: 12px;
        font-weight: 500;
        color: var(--m-dim);
        line-height: 1.2;
      }
      .coach-card-divider {
        height: 1px;
        background: var(--m-border);
      }
      .coach-card .contact-info-list {
        padding: 12px;
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
export class ProfileContactWebComponent {
  protected readonly profile = inject(ProfileService);

  // ── Connected Accounts ──

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
    }> => {
      const social = this.profile.user()?.social;
      if (!social?.length) return [];

      const defaultMeta = { label: '', icon: 'link', color: 'currentColor', handlePrefix: '' };

      return social
        .slice()
        .sort((a, b) => (a.displayOrder ?? 99) - (b.displayOrder ?? 99))
        .slice(0, 8)
        .map((link) => {
          const meta =
            ProfileContactWebComponent.PLATFORM_META[link.platform.toLowerCase()] ?? defaultMeta;
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
          };
        });
    }
  );

  protected onEditContact(): void {
    // No-op — parent handles
  }
}
