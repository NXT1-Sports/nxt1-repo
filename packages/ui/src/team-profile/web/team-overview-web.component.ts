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
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { NxtPlatformIconComponent } from '../../components/platform-icon';
import { getPlatformFaviconUrl } from '@nxt1/core/onboarding';
import { NxtImageComponent } from '../../components/image';
import {
  NxtHistoryTimelineComponent,
  type HistoryTimelineEntry,
} from '../../components/history-timeline';
import { TeamProfileService } from '../team-profile.service';
import { NxtToastService } from '../../services/toast/toast.service';

@Component({
  selector: 'nxt1-team-overview-web',
  standalone: true,
  imports: [
    CommonModule,
    NxtIconComponent,
    NxtPlatformIconComponent,
    NxtImageComponent,
    NxtHistoryTimelineComponent,
  ],
  template: `
    <div class="team-overview">
      <!-- ═══ TEAM PROFILE + ABOUT (side-by-side) ═══ -->
      @if (activeSideTab() === 'about' || activeSideTab() === '') {
        <div class="team-top-row">
          <!-- LEFT: Team Profile key-value grid -->
          <div class="team-section">
            <h2 class="team-section__title">Team Profile</h2>
            <div class="team-profile-grid">
              @if (teamProfile.athletes().length > 0) {
                <div class="team-profile-row">
                  <span class="team-profile-key">Athletes:</span>
                  <span class="team-profile-val">{{ teamProfile.athletes().length }}</span>
                </div>
              }
              @if (teamProfile.recordDisplay()) {
                <div class="team-profile-row">
                  <span class="team-profile-key">Record:</span>
                  <span class="team-profile-val">{{ teamProfile.recordDisplay() }}</span>
                </div>
              }
              @if (teamProfile.team()?.conference) {
                <div class="team-profile-row">
                  <span class="team-profile-key">Conference:</span>
                  <span class="team-profile-val">{{ teamProfile.team()!.conference }}</span>
                </div>
              }
              @if (teamProfile.team()?.location) {
                <div class="team-profile-row">
                  <span class="team-profile-key">Location:</span>
                  <span class="team-profile-val">{{ teamProfile.team()!.location }}</span>
                </div>
              }
            </div>
          </div>

          <!-- RIGHT: About description -->
          @if (teamProfile.team()?.description) {
            <div class="team-section">
              <h2 class="team-section__title">About</h2>
              <p class="team-section__text">{{ teamProfile.team()!.description }}</p>
            </div>
          }
        </div>

        <!-- ═══ CONNECTED ACCOUNTS ═══ -->
        <div class="team-section">
          <h2 class="team-section__title">Connected Accounts</h2>
          @if (connectedAccountsList().length > 0) {
            <div class="team-connected-grid">
              @for (acct of connectedAccountsList(); track acct.key) {
                <a
                  class="team-connected-chip"
                  [href]="acct.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  [attr.aria-label]="acct.label"
                >
                  <span class="team-connected-icon" [style.color]="acct.color">
                    <nxt1-platform-icon
                      [icon]="acct.icon"
                      [faviconUrl]="acct.faviconUrl"
                      [size]="14"
                      [alt]="acct.label + ' icon'"
                    />
                  </span>
                  <span class="team-connected-label">{{ acct.label }}</span>
                  <span class="team-connected-check">
                    <nxt1-icon name="checkmarkCircle" [size]="13" />
                  </span>
                </a>
              }
            </div>
          } @else {
            <p class="team-section__empty">
              No connected accounts yet — connect your team's social profiles to give recruits and
              coaches a complete picture.
            </p>
          }
          <p class="team-connected-explainer">
            <svg
              class="team-connected-agentx"
              viewBox="0 0 612 792"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="12"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
              />
              <polygon
                points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
              />
            </svg>
            Agent X keeps your team profile up-to-date — connecting all your accounts so recruits
            and coaches see a complete picture without the extra work.
          </p>
        </div>

        <!-- ═══ LAST SYNCED ═══ -->
        <div class="team-section">
          <button
            type="button"
            class="team-last-synced-btn"
            (click)="onSyncNow()"
            aria-label="Sync team profile with Agent X"
          >
            <div class="team-last-synced-main">
              <span class="team-last-synced-label">Last synced</span>
              <span class="team-last-synced-time">{{ lastSyncedLabel() }}</span>
            </div>
            <div class="team-last-synced-agent">
              <svg
                class="team-last-synced-agentx"
                viewBox="0 0 612 792"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="12"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                />
                <polygon
                  points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
                />
              </svg>
              <span class="team-last-synced-agent-name">Agent X</span>
            </div>
          </button>
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
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="madden-empty">
              <div class="madden-empty__icon" aria-hidden="true">
                <nxt1-icon name="person" [size]="40" />
              </div>
              <h3>No staff listed</h3>
              <p>Coaches and staff members will appear here.</p>
              @if (teamProfile.isTeamAdmin()) {
                <button type="button" class="madden-cta-btn" (click)="manageTeam.emit()">
                  Manage Staff
                </button>
              }
            </div>
          }
        </div>
      }

      <!-- ═══ TEAM HISTORY ═══ -->
      @if (activeSideTab() === 'team-history') {
        <div class="team-section">
          <h2 class="team-section__title">Team History</h2>
          <nxt1-history-timeline
            [entries]="teamHistoryEntries()"
            emptyIcon="time-outline"
            emptyTitle="No history yet"
            emptyDescription="Season-by-season records and milestones will appear here."
          />
        </div>
      }

      <!-- ═══ SPONSORS ═══ -->
      @if (activeSideTab() === 'sponsors') {
        <div class="team-section">
          <h2 class="team-section__title">Sponsors</h2>
          @if (teamProfile.sponsors().length > 0) {
            <div class="team-sponsors-grid">
              @for (sponsor of teamProfile.sponsors(); track sponsor.name) {
                <a
                  class="team-sponsor-tile"
                  [href]="sponsor.url || null"
                  [attr.target]="sponsor.url ? '_blank' : null"
                  [attr.rel]="sponsor.url ? 'noopener noreferrer' : null"
                >
                  <div class="team-sponsor-tile__logo-area">
                    @if (sponsor.logoUrl) {
                      <nxt1-image
                        class="team-sponsor-tile__logo"
                        [src]="sponsor.logoUrl"
                        [alt]="sponsor.name"
                        [width]="72"
                        [height]="72"
                        fit="contain"
                        [showPlaceholder]="false"
                      />
                    } @else {
                      <nxt1-icon name="business" [size]="40" />
                    }
                  </div>
                  <span class="team-sponsor-tile__name">{{ sponsor.name }}</span>
                </a>
              }
            </div>
          } @else {
            <div class="madden-empty">
              <div class="madden-empty__icon" aria-hidden="true">
                <nxt1-icon name="business" [size]="40" />
              </div>
              <h3>No sponsors yet</h3>
              <p>Team sponsors and partners will appear here.</p>
              @if (teamProfile.isTeamAdmin()) {
                <button type="button" class="madden-cta-btn" (click)="manageTeam.emit()">
                  Add Sponsors
                </button>
              }
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
        letter-spacing: 0.02em;
      }

      .team-section__text {
        font-size: 14px;
        line-height: 1.6;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 0 0 16px;
      }

      .team-section__empty {
        font-size: 13px;
        line-height: 1.5;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        margin: 0;
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

      /* ─── TEAM PROFILE KEY-VALUE GRID (mirrors Player Profile) ─── */
      .team-top-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
      }

      .team-profile-grid {
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .team-profile-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
      }

      .team-profile-row:last-child {
        border-bottom: none;
      }

      .team-profile-key {
        font-size: 14px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        min-width: 100px;
        font-weight: 500;
      }

      .team-profile-val {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text, #ffffff);
      }

      /* ─── CONNECTED ACCOUNTS ─── */
      .team-connected-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .team-connected-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px 5px 7px;
        background: var(--m-card, rgba(255, 255, 255, 0.06));
        border: 1px solid
          color-mix(
            in srgb,
            var(--m-accent, #d4ff00) 18%,
            var(--m-border, rgba(255, 255, 255, 0.08))
          );
        border-radius: 999px;
        text-decoration: none;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          transform 0.15s ease;
        cursor: pointer;
      }

      .team-connected-chip:hover {
        background: color-mix(
          in srgb,
          var(--m-accent, #d4ff00) 8%,
          var(--m-card, rgba(255, 255, 255, 0.06))
        );
        border-color: color-mix(
          in srgb,
          var(--m-accent, #d4ff00) 40%,
          var(--m-border, rgba(255, 255, 255, 0.08))
        );
        transform: translateY(-1px);
      }

      .team-connected-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.06);
      }

      .team-connected-label {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 12.5px;
        font-weight: 700;
        color: var(--m-text, #ffffff);
        white-space: nowrap;
        letter-spacing: 0.01em;
      }

      .team-connected-check {
        display: inline-flex;
        align-items: center;
        color: var(--m-accent, #d4ff00);
        flex-shrink: 0;
        margin-left: -2px;
      }

      .team-connected-explainer {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 10px 0 0;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 11.5px;
        font-weight: 500;
        line-height: 1.45;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        letter-spacing: 0.01em;
      }

      .team-connected-agentx {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        color: var(--m-accent, #d4ff00);
        margin-top: -1px;
      }

      /* ─── LAST SYNCED ─── */
      .team-last-synced-btn {
        width: 100%;
        margin: 16px 0 0;
        padding: 14px 16px;
        border-radius: 12px;
        border: 1px solid
          color-mix(
            in srgb,
            var(--m-accent, #d4ff00) 28%,
            var(--m-border, rgba(255, 255, 255, 0.08))
          );
        background:
          linear-gradient(
            160deg,
            color-mix(in srgb, var(--m-accent, #d4ff00) 11%, transparent),
            color-mix(in srgb, var(--m-surface, rgba(255, 255, 255, 0.04)) 88%, transparent)
          ),
          var(--m-surface, rgba(255, 255, 255, 0.04));
        color: var(--m-text, #ffffff);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        cursor: pointer;
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease,
          transform 0.2s ease;
      }

      .team-last-synced-btn:hover {
        border-color: color-mix(
          in srgb,
          var(--m-accent, #d4ff00) 44%,
          var(--m-border, rgba(255, 255, 255, 0.08))
        );
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.16);
        transform: translateY(-1px);
      }

      .team-last-synced-btn:focus-visible {
        outline: none;
        border-color: var(--m-accent, #d4ff00);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--m-accent, #d4ff00) 40%, transparent);
      }

      .team-last-synced-main {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        min-width: 0;
      }

      .team-last-synced-label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-last-synced-time {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text, #ffffff);
      }

      .team-last-synced-agent {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .team-last-synced-agentx {
        width: 34px;
        height: 34px;
        color: var(--m-accent, #d4ff00);
        flex-shrink: 0;
      }

      .team-last-synced-agent-name {
        font-size: 13px;
        font-weight: 700;
        color: color-mix(in srgb, var(--m-accent, #d4ff00) 72%, var(--m-text, #ffffff));
        letter-spacing: 0.02em;
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

      /* ─── SPONSORS ─── */
      .team-sponsors-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 12px;
      }

      .team-sponsor-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        aspect-ratio: 1;
        padding: 16px;
        border-radius: 14px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        text-decoration: none;
        transition:
          border-color 0.15s,
          background 0.15s;
        cursor: default;
      }

      a.team-sponsor-tile[href] {
        cursor: pointer;
      }

      .team-sponsor-tile:hover {
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
        border-color: rgba(255, 255, 255, 0.14);
      }

      .team-sponsor-tile__logo-area {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-sponsor-tile__logo {
        width: 72px;
        height: 72px;
        border-radius: 8px;
      }

      .team-sponsor-tile__name {
        font-size: 13px;
        font-weight: 600;
        color: var(--m-text, #ffffff);
        text-align: center;
        line-height: 1.3;
        margin-top: 10px;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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

      @media (max-width: 1360px) {
        .team-top-row {
          grid-template-columns: minmax(0, 1fr);
          gap: 14px;
        }
      }

      @media (max-width: 768px) {
        .team-top-row {
          grid-template-columns: minmax(0, 1fr);
          gap: 10px;
        }

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
  private readonly toast = inject(NxtToastService);

  // ============================================
  // INPUTS
  // ============================================

  /** Active sub-section tab (about, staff, team-history, sponsors) */
  readonly activeSideTab = input.required<string>();

  /** Emitted when admin clicks a manage CTA button */
  readonly manageTeam = output<void>();

  // ============================================
  // COMPUTED — CONNECTED ACCOUNTS
  // ============================================

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
      const social = this.teamProfile.team()?.social;
      if (!social?.length) return [];
      const def = { label: '', icon: 'link', color: 'currentColor', handlePrefix: '' };
      return social
        .slice()
        .sort((a, b) => (a.displayOrder ?? 99) - (b.displayOrder ?? 99))
        .slice(0, 8)
        .map((link) => {
          const meta = TeamOverviewWebComponent.PLATFORM_META[link.platform.toLowerCase()] ?? def;
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
            faviconUrl: getPlatformFaviconUrl(link.platform.toLowerCase()),
          };
        });
    }
  );

  // ============================================
  // COMPUTED — LAST SYNCED
  // ============================================

  protected readonly lastSyncedLabel = computed(() => {
    const updatedAt = this.teamProfile.team()?.updatedAt;
    if (!updatedAt) return 'Never synced';
    const parsed = new Date(updatedAt);
    if (Number.isNaN(parsed.getTime())) return 'Never synced';
    return this.formatRelativeTime(parsed);
  });

  protected async onSyncNow(): Promise<void> {
    try {
      await this.teamProfile.refresh();
      this.toast.success('Team profile synced with Agent X');
    } catch {
      this.toast.error('Sync failed. Please try again.');
    }
  }

  // ============================================
  // COMPUTED — TEAM HISTORY TIMELINE
  // ============================================

  /**
   * Maps team season history + current record into shared
   * HistoryTimelineEntry[] for the NxtHistoryTimelineComponent.
   * Shows the current season first, then past seasons.
   */
  protected readonly teamHistoryEntries = computed((): readonly HistoryTimelineEntry[] => {
    const team = this.teamProfile.team();
    if (!team) return [];

    const entries: HistoryTimelineEntry[] = [];

    // Current season from active record
    const record = team.record;
    if (record) {
      const recordText = this.formatRecord(record.wins, record.losses, record.ties);
      entries.push({
        label: record.season ?? 'Current',
        name: team.teamName,
        logoUrl: team.logoUrl,
        subtitle: team.conference ?? team.location,
        record: recordText,
        fallbackIcon: 'shield',
      });
    }

    // Past seasons from seasonHistory
    const history = team.seasonHistory;
    if (history?.length) {
      for (const season of history) {
        const recordText =
          season.formatted ?? this.formatRecord(season.wins, season.losses, season.ties);
        entries.push({
          label: season.season,
          name: team.teamName,
          logoUrl: team.logoUrl,
          subtitle: season.highlights ?? season.conference ?? team.location,
          record: recordText,
          fallbackIcon: 'shield',
        });
      }
    }

    return entries;
  });

  // ============================================
  // HELPERS
  // ============================================

  /** Format a wins-losses-ties record string */
  private formatRecord(wins: number, losses: number, ties?: number): string {
    if (ties !== undefined && ties > 0) return `${wins}-${losses}-${ties}`;
    return `${wins}-${losses}`;
  }

  /** Format a Date into a human-readable relative time label */
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
}
