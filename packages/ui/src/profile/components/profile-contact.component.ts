/**
 * @fileoverview Profile Contact Tab Component
 * @module @nxt1/ui/profile/components
 *
 * Shared profile section component used by both web and mobile shells.
 * Displays contact info, social media links, and coach contact card.
 */
import { Component, ChangeDetectionStrategy, inject, computed, input } from '@angular/core';
import { getPlatformFaviconUrl } from '@nxt1/core/onboarding';
import { NxtIconComponent } from '../../components/icon';
import { NxtPlatformIconComponent } from '../../components/platform-icon';
import { ProfileService } from '../profile.service';
import { ConnectedAccountsModalService } from '../../components/connected-sources';

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
  selector: 'nxt1-profile-contact',
  standalone: true,
  imports: [NxtIconComponent, NxtPlatformIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="madden-tab-section" aria-labelledby="contact-heading">
      <h2 id="contact-heading" class="sr-only">Contact Information</h2>
      @if (!hasCurrentSectionContent()) {
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
              @if (profile.isOwnProfile()) {
                Connect your verified platforms and accounts so your profile feels complete.
              } @else {
                This athlete hasn't connected any sources yet.
              }
            } @else if (profile.isOwnProfile()) {
              Add your contact information so coaches can reach you.
            } @else {
              This athlete hasn't added contact information yet.
            }
          </p>
          @if (profile.isOwnProfile() && activeSection() === 'connected' && !hideInlineCta()) {
            <button type="button" class="madden-cta-btn" (click)="onConnectAccounts()">
              Connect Accounts
            </button>
          }
          @if (profile.isOwnProfile() && activeSection() === 'contact' && !hideInlineCta()) {
            <button type="button" class="madden-cta-btn" (click)="onEditContact()">
              Edit Contact
            </button>
          }
        </div>
      } @else {
        <div class="contact-social-row">
          <!-- LEFT: Contact + Social Media -->
          <div class="contact-social-col">
            @if (
              activeSection() === 'contact' &&
              (profile.user()?.contact?.email || profile.user()?.contact?.phone)
            ) {
              <h3 class="contact-section-title">Contact</h3>
              <div class="contact-info-list">
                @if (profile.user()?.contact?.email) {
                  <a class="contact-info-item" [href]="'mailto:' + profile.user()?.contact?.email">
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
                    <span class="contact-social-chip-handle">{{ acct.handle || acct.label }}</span>
                  </a>
                }
              </div>
            }
          </div>

          <!-- RIGHT: Coach Contact -->
          @if (activeSection() === 'contact' && profile.user()?.coachContact; as coach) {
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
      .contact-social-chip-favicon {
        width: 16px;
        height: 16px;
        border-radius: 2px;
        object-fit: contain;
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
export class ProfileContactComponent {
  protected readonly profile = inject(ProfileService);
  private readonly connectedAccountsModal = inject(ConnectedAccountsModalService);
  readonly activeSection = input<string>('contact');
  readonly hideInlineCta = input(false);

  // ── Connected Accounts ──

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

  protected readonly hasCurrentSectionContent = computed(() => {
    if (this.activeSection() === 'connected') {
      return this.connectedAccountsList().length > 0;
    }

    const user = this.profile.user();
    return !!user?.contact?.email || !!user?.contact?.phone || !!user?.coachContact;
  });

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

      const defaultMeta = {
        label: '',
        icon: 'link',
        color: 'currentColor',
        handlePrefix: '',
        showHandle: false,
      };

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
          const meta =
            ProfileContactComponent.PLATFORM_META[cs.platform.toLowerCase()] ?? defaultMeta;
          const fallback = meta.label || cs.platform;
          const handle = meta.showHandle
            ? deriveConnectedHandle(cs.profileUrl, fallback, meta.handlePrefix)
            : fallback;
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

  protected onEditContact(): void {
    // No-op — parent handles
  }

  protected async onConnectAccounts(): Promise<void> {
    const user = this.profile.user();
    const role = user?.role ?? null;
    await this.connectedAccountsModal.open({
      role,
      scope: role === 'coach' || role === 'director' ? 'team' : 'athlete',
    });
  }
}
