/**
 * @fileoverview Communication Center Section
 * @module @nxt1/ui/components/communication-center-section
 * @version 1.0.0
 *
 * Shared recruiting communication section for web and mobile surfaces.
 * Presents a unified inbox concept with utility cards for conversation
 * flow and simplified message management.
 *
 * Standards:
 * - 100% design-token driven styling
 * - SSR-safe deterministic heading IDs
 * - Semantic HTML for SEO (section/article/header/ul)
 * - Mobile-first responsive layout
 */

import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

interface CommunicationInboxItem {
  readonly id: string;
  readonly senderName: string;
  readonly preview: string;
  readonly timeLabel: string;
  readonly unreadCount: number;
  readonly isOnline: boolean;
  readonly isVerified: boolean;
}

interface CommunicationUtilityItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

const INBOX_ITEMS: readonly CommunicationInboxItem[] = [
  {
    id: 'inbox-coach-thompson',
    senderName: 'Coach Thompson',
    preview: 'Great practice clips. Can you send your updated schedule for this weekend?',
    timeLabel: '5m',
    unreadCount: 2,
    isOnline: true,
    isVerified: true,
  },
  {
    id: 'inbox-recruiting-coordinator',
    senderName: 'Recruiting Coordinator',
    preview: 'Reminder: call window opens after 6:00 PM. Reply YES to confirm.',
    timeLabel: '18m',
    unreadCount: 1,
    isOnline: false,
    isVerified: false,
  },
  {
    id: 'inbox-state-university',
    senderName: 'State University Athletics',
    preview: 'Thank you for your interest. We would like your official transcript.',
    timeLabel: '1h',
    unreadCount: 0,
    isOnline: false,
    isVerified: true,
  },
] as const;

const UTILITIES: readonly CommunicationUtilityItem[] = [
  {
    id: 'utility-unified-flow',
    title: 'Unified Conversation Flow',
    description:
      'Keep every recruiter conversation in one stream so you can review context and respond faster without switching tools.',
  },
  {
    id: 'utility-simple-management',
    title: 'Simplified Message Management',
    description:
      'Organize priorities quickly, track unread updates, and stay on top of follow-ups with less effort every day.',
  },
] as const;

let communicationCenterInstanceCounter = 0;

@Component({
  selector: 'nxt1-communication-center-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="communication-center" [attr.aria-labelledby]="titleId()">
      <div class="communication-center__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="The Communication Center"
          [headingLevel]="2"
          variant="hero"
          layout="split"
          contentPosition="end"
          title="Never Miss an Opportunity."
          subtitle="A unified inbox for every recruiter conversation in one place."
          support="Recruiting moves fast. Our inbox ensures you always reply professionally and instantly."
        >
          <article class="communication-center__panel" [attr.aria-labelledby]="panelTitleId()">
            <header class="communication-center__panel-header">
              <p class="communication-center__eyebrow">Message Management</p>
              <h3 class="communication-center__panel-title" [id]="panelTitleId()">
                Unified Recruiting Inbox
              </h3>
            </header>

            <div class="communication-center__filters" aria-hidden="true">
              <span class="filter-pill filter-pill--active">All</span>
              <span class="filter-pill">Unread</span>
              <span class="filter-pill">Priority</span>
            </div>

            <div class="inbox-list" role="list" aria-label="Recruiting inbox preview">
              @for (item of inboxItems; track item.id) {
                <article
                  class="inbox-item"
                  [class.inbox-item--unread]="item.unreadCount > 0"
                  role="listitem"
                  [attr.aria-label]="item.senderName + ', ' + item.timeLabel"
                >
                  <div class="inbox-item__avatar" aria-hidden="true">
                    <span class="inbox-item__avatar-initial">{{ item.senderName.charAt(0) }}</span>
                    @if (item.isOnline) {
                      <span class="inbox-item__online-dot"></span>
                    }
                  </div>

                  <div class="inbox-item__content">
                    <div class="inbox-item__header">
                      <div class="inbox-item__name-row">
                        <p class="inbox-item__name">{{ item.senderName }}</p>
                        @if (item.isVerified) {
                          <span class="inbox-item__verified" aria-label="Verified">✓</span>
                        }
                      </div>
                      <p class="inbox-item__time">{{ item.timeLabel }}</p>
                    </div>

                    <div class="inbox-item__preview-row">
                      <p class="inbox-item__preview">{{ item.preview }}</p>
                      @if (item.unreadCount > 0) {
                        <span
                          class="inbox-item__unread-badge"
                          [attr.aria-label]="item.unreadCount + ' unread'"
                        >
                          {{ item.unreadCount > 9 ? '9+' : item.unreadCount }}
                        </span>
                      }
                    </div>
                  </div>
                </article>
              }
            </div>

            <div class="utility-list" role="list" [attr.aria-label]="utilityListLabel()">
              @for (utility of utilities; track utility.id) {
                <article class="utility-item" role="listitem">
                  <h4 class="utility-item__title">{{ utility.title }}</h4>
                  <p class="utility-item__description">{{ utility.description }}</p>
                </article>
              }
            </div>
          </article>
        </nxt1-section-header>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .communication-center {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      .communication-center__shell {
        display: grid;
        gap: var(--nxt1-spacing-8);
      }

      .communication-center__panel {
        display: grid;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-md);
      }

      .communication-center__panel-header {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .communication-center__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .communication-center__panel-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .communication-center__filters {
        display: flex;
        gap: var(--nxt1-spacing-2);
        overflow-x: auto;
        scrollbar-width: none;
      }

      .communication-center__filters::-webkit-scrollbar {
        display: none;
      }

      .filter-pill {
        display: inline-flex;
        align-items: center;
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        color: var(--nxt1-color-text-secondary);
        background: transparent;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        white-space: nowrap;
      }

      .filter-pill--active {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-inverse);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .inbox-list {
        display: flex;
        flex-direction: column;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-200);
        overflow: hidden;
      }

      .inbox-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .inbox-item:last-child {
        border-bottom: 0;
      }

      .inbox-item__avatar {
        position: relative;
        width: var(--nxt1-spacing-11);
        height: var(--nxt1-spacing-11);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }

      .inbox-item__avatar-initial {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .inbox-item__online-dot {
        position: absolute;
        right: 0;
        bottom: 0;
        width: var(--nxt1-spacing-2_5);
        height: var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-success);
        border: 2px solid var(--nxt1-color-surface-100);
      }

      .inbox-item__content {
        flex: 1;
        min-width: 0;
        display: grid;
        gap: var(--nxt1-spacing-1);
      }

      .inbox-item__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2);
      }

      .inbox-item__name-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        min-width: 0;
      }

      .inbox-item__name {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-tight);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .inbox-item--unread .inbox-item__name {
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .inbox-item__verified {
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-inverse);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-none);
        flex-shrink: 0;
      }

      .inbox-item__time {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
        white-space: nowrap;
      }

      .inbox-item__preview-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2);
      }

      .inbox-item__preview {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .inbox-item__unread-badge {
        min-width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        padding: 0 var(--nxt1-spacing-1);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-inverse);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-none);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .utility-list {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .utility-item {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .utility-item__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .utility-item__description {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      @media (max-width: 991px) {
        .communication-center__panel {
          padding: var(--nxt1-spacing-5);
        }

        .communication-center__panel-title {
          font-size: var(--nxt1-fontSize-lg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtCommunicationCenterSectionComponent {
  private readonly instanceId = ++communicationCenterInstanceCounter;

  readonly titleId = computed(() => `communication-center-title-${this.instanceId}`);
  readonly panelTitleId = computed(() => `communication-center-panel-title-${this.instanceId}`);
  readonly utilityListLabel = computed(() => `Communication center utilities ${this.instanceId}`);

  protected readonly inboxItems = INBOX_ITEMS;
  protected readonly utilities = UTILITIES;
}
