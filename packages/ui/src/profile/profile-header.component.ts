/**
 * @fileoverview Madden Franchise Mode — Player Card Header (Mobile)
 *
 * Pixel-accurate recreation of the EA Madden NFL player overview screen.
 * Split-name treatment (first small, LAST HUGE), table-style Player Profile,
 * large centered trait diamond, prominent OVR badge, archetype skill boxes.
 *
 * Reference: Dallas Turner — Vikings — Madden 25 Franchise Mode
 */
import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  ProfileUser,
  ProfilePinnedVideo,
  ProfileQuickStats,
  PlayerCardData,
  ProspectTier,
} from '@nxt1/core';
import { getVerification, normalizeWeightDisplay, isFemaleGender } from '@nxt1/core';
import { NxtAvatarComponent } from '../components/avatar';
import { NxtIconComponent } from '../components/icon';
import { NxtImageComponent } from '../components/image';
import { ProfileService } from './profile.service';

@Component({
  selector: 'nxt1-profile-header',
  standalone: true,
  imports: [CommonModule, NxtAvatarComponent, NxtIconComponent, NxtImageComponent],
  template: `
    <header class="madden-card" [attr.data-tier]="currentTier()">
      <!-- ═══ BANNER (Dark cinematic) ═══ -->
      <div class="mc-banner" [style.backgroundImage]="bannerStyle()">
        @if (!user()?.bannerImg) {
          <div class="mc-banner-grid" aria-hidden="true"></div>
        }
        <div class="mc-banner-fade" aria-hidden="true"></div>
      </div>

      <!-- ═══ HERO ZONE: Team Logo + Name + OVR ═══ -->
      <div class="mc-hero">
        <!-- Team Logo (large, like Vikings logo in Madden) -->
        <div class="mc-team-logo">
          @if (user()?.school?.logoUrl) {
            <nxt1-image
              [src]="user()?.school?.logoUrl"
              [alt]="user()?.school?.name || ''"
              [width]="28"
              [height]="28"
              variant="avatar"
              fit="contain"
              [showPlaceholder]="false"
            />
          } @else {
            <div class="mc-team-placeholder">
              <nxt1-icon name="school-outline" [size]="28" />
            </div>
          }
        </div>

        <!-- Identity: Position + Split Name -->
        <div class="mc-identity">
          @if (activeSport()) {
            <div class="mc-pos-line">
              <span class="mc-pos">{{ activeSport()?.position }}</span>
              @if (activeSport()?.jerseyNumber) {
                <span class="mc-jersey">#{{ activeSport()?.jerseyNumber }}</span>
              }
            </div>
          }
          <div class="mc-name-block">
            <span class="mc-first-name">{{ firstName() }}</span>
            <span class="mc-last-name">{{ lastName() }}</span>
          </div>
          @if (user()?.verificationStatus === 'verified') {
            <div class="mc-verified-badge">
              <nxt1-icon name="verified" [size]="14" />
              <span>Verified</span>
            </div>
          }
        </div>

        <!-- OVR Badge (Madden-style prominent square) -->
        <div class="mc-ovr">
          @if (hasProspectGrade()) {
            <span class="mc-ovr-num">{{ playerCard()?.prospectGrade?.overall }}</span>
          } @else {
            <span class="mc-ovr-num mc-ovr-unrated">--</span>
          }
          <span class="mc-ovr-label">OVR</span>
          @if (playerCard()?.prospectGrade?.starRating) {
            <div class="mc-ovr-stars">
              @for (star of starsArray(); track $index) {
                <span class="mc-star">★</span>
              }
            </div>
          }
        </div>
      </div>

      <!-- ═══ AVATAR ROW (profile pic + school/location meta) ═══ -->
      <div class="mc-avatar-row">
        <div class="mc-avatar-wrap">
          <nxt1-avatar
            [src]="user()?.profileImg"
            [name]="displayName()"
            [isTeamRole]="user()?.isTeamManager ?? false"
            size="xl"
            shape="circle"
          />
        </div>
        <div class="mc-meta-col">
          @if (user()?.school) {
            <span class="mc-meta-item">
              <nxt1-icon name="school-outline" [size]="14" />
              {{ user()?.school?.name }}
            </span>
          }
          @if (user()?.location) {
            <span class="mc-meta-item">
              <nxt1-icon name="location-outline" [size]="14" />
              {{ user()?.location }}
            </span>
          }
          @if (activeSport()?.name) {
            <span class="mc-meta-item mc-meta-sport">
              {{ activeSport()?.name }}
            </span>
          }
        </div>
      </div>

      <!-- ═══ PLAYER PROFILE TABLE (Madden label:value style) ═══ -->
      @if (user()?.isRecruit && hasMeasurables()) {
        <div class="mc-section">
          <h3 class="mc-section-title">Player Profile</h3>
          <div class="mc-profile-table">
            @if (user()?.height) {
              <div class="mc-profile-row">
                <span class="mc-profile-label">Height:</span>
                <span class="mc-profile-value">{{ user()?.height }}</span>
                @if (measurablesVerification(); as v) {
                  <a
                    class="mc-verified-badge"
                    [href]="v.sourceUrl || '#'"
                    target="_blank"
                    rel="noopener noreferrer"
                    [attr.aria-label]="'Verified by ' + v.verifiedBy"
                  >
                    <svg
                      class="mc-verified-check"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      width="11"
                      height="11"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <span class="mc-verified-text">Verified by</span>
                    @if (v.sourceLogoUrl) {
                      <nxt1-image
                        class="mc-verified-logo"
                        [src]="v.sourceLogoUrl"
                        [alt]="v.verifiedBy"
                        [width]="60"
                        [height]="14"
                        fit="contain"
                        [showPlaceholder]="false"
                      />
                    } @else {
                      <span class="mc-verified-source">{{ v.verifiedBy }}</span>
                    }
                  </a>
                }
              </div>
            }
            @if (showWeight()) {
              <div class="mc-profile-row">
                <span class="mc-profile-label">Weight:</span>
                <span class="mc-profile-value">{{ formattedWeight() }}</span>
                @if (measurablesVerification(); as v) {
                  <a
                    class="mc-verified-badge"
                    [href]="v.sourceUrl || '#'"
                    target="_blank"
                    rel="noopener noreferrer"
                    [attr.aria-label]="'Verified by ' + v.verifiedBy"
                  >
                    <svg
                      class="mc-verified-check"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      width="11"
                      height="11"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <span class="mc-verified-text">Verified by</span>
                    @if (v.sourceLogoUrl) {
                      <nxt1-image
                        class="mc-verified-logo"
                        [src]="v.sourceLogoUrl"
                        [alt]="v.verifiedBy"
                        [width]="60"
                        [height]="14"
                        fit="contain"
                        [showPlaceholder]="false"
                      />
                    } @else {
                      <span class="mc-verified-source">{{ v.verifiedBy }}</span>
                    }
                  </a>
                }
              </div>
            }
            @if (user()?.classYear) {
              <div class="mc-profile-row">
                <span class="mc-profile-label">Class:</span>
                <span class="mc-profile-value">{{ user()?.classYear }}</span>
              </div>
            }
            @if (user()?.gpa) {
              <div class="mc-profile-row">
                <span class="mc-profile-label">GPA:</span>
                <span class="mc-profile-value">{{ user()?.gpa }}</span>
              </div>
            }
            @if (user()?.sat) {
              <div class="mc-profile-row">
                <span class="mc-profile-label">SAT:</span>
                <span class="mc-profile-value">{{ user()?.sat }}</span>
              </div>
            }
            @if (user()?.act) {
              <div class="mc-profile-row">
                <span class="mc-profile-label">ACT:</span>
                <span class="mc-profile-value">{{ user()?.act }}</span>
              </div>
            }
            @if (user()?.school) {
              <div class="mc-profile-row">
                <span class="mc-profile-label">School:</span>
                <span class="mc-profile-value">{{ user()?.school?.name }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- ═══ TRAIT DIAMOND (Madden Hidden/Superstar/X-Factor) ═══ -->
      @if (playerCard()?.trait) {
        <div class="mc-section">
          <div class="mc-trait-zone" [attr.data-category]="playerCard()?.trait?.category">
            <h3 class="mc-trait-title">{{ traitCategoryLabel() }}</h3>
            <div class="mc-trait-diamond">
              @if (playerCard()?.trait?.category === 'hidden') {
                <nxt1-icon name="flame" [size]="24" />
              } @else {
                <nxt1-icon name="flash" [size]="24" />
              }
            </div>
            @if (playerCard()?.trait?.category === 'hidden' && playerCard()?.trait?.progressTotal) {
              @if (playerCard()?.agentXSummary) {
                <p class="mc-trait-summary">{{ playerCard()?.agentXSummary }}</p>
              }
              <div class="mc-trait-progress">
                <div class="mc-trait-bar">
                  <div class="mc-trait-fill" [style.width.%]="traitProgress()"></div>
                </div>
                <span class="mc-trait-count"
                  >{{ playerCard()?.trait?.progressCurrent }}/{{
                    playerCard()?.trait?.progressTotal
                  }}</span
                >
              </div>
            } @else {
              <span class="mc-trait-name">{{ playerCard()?.trait?.name }}</span>
            }
          </div>
        </div>
      }

      <!-- ═══ PLAYER ARCHETYPES (Madden skill boxes with icons) ═══ -->
      @if (playerCard()?.archetypes?.length) {
        <div class="mc-section">
          <h3 class="mc-section-title">Player Archetypes</h3>
          <div class="mc-archetypes">
            @for (arch of playerCard()!.archetypes!; track arch.name) {
              <div class="mc-arch-box">
                @if (arch.icon) {
                  <div class="mc-arch-icon">
                    <nxt1-icon [name]="arch.icon" [size]="18" />
                  </div>
                }
                <span class="mc-arch-name">{{ arch.name }}</span>
                <span class="mc-arch-rating" [style.color]="getArchetypeColor(arch.rating)">{{
                  arch.rating
                }}</span>
                <span class="mc-arch-ovr">OVR</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- ═══ AGENT X STATUS ═══ -->
      @if (user()) {
        <div class="mc-agent">
          <div class="mc-agent-dot" aria-hidden="true"></div>
          <svg
            class="mc-agent-x"
            viewBox="0 0 612 792"
            width="16"
            height="16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98Z"
            />
          </svg>
          @if (playerCard()?.agentXSummary) {
            <span class="mc-agent-text">{{ playerCard()?.agentXSummary }}</span>
          } @else {
            <span class="mc-agent-text"
              >Agent X is actively working for {{ user()?.firstName || displayName() }}</span
            >
          }
        </div>
      }

      <!-- ═══ BIO ═══ -->
      @if (user()?.aboutMe) {
        <p class="mc-bio">{{ user()?.aboutMe }}</p>
      }

      <!-- ═══ ACTION BUTTONS ═══ -->
      @if (!isOwnProfile()) {
        <div class="mc-actions">
          <button class="mc-btn mc-btn-msg" (click)="messageClick.emit()">
            <span>Message</span>
          </button>
        </div>
      }

      <!-- ═══ SHOWREEL ═══ -->
      @if (pinnedVideo() || (isOwnProfile() && canEdit())) {
        <div class="mc-showreel">
          @if (pinnedVideo()) {
            <button class="mc-showreel-card" (click)="pinnedVideoClick.emit()">
              <div class="mc-showreel-thumb">
                @if (pinnedVideo()?.previewImage) {
                  <nxt1-image
                    [src]="pinnedVideo()?.previewImage"
                    [alt]="pinnedVideo()?.name || ''"
                    [width]="320"
                    [height]="180"
                    fit="cover"
                    variant="card"
                    [showPlaceholder]="true"
                  />
                }
                <div class="mc-showreel-play">
                  <nxt1-icon name="playCircle" [size]="36" />
                </div>
                @if (pinnedVideo()?.duration) {
                  <span class="mc-showreel-dur">{{
                    formatDuration(pinnedVideo()!.duration!)
                  }}</span>
                }
              </div>
              <div class="mc-showreel-info">
                <span class="mc-showreel-tag">SHOWREEL</span>
                <span class="mc-showreel-title">{{ pinnedVideo()?.name || 'Highlight Tape' }}</span>
                @if (pinnedVideo()?.viewCount) {
                  <span class="mc-showreel-views"
                    >{{ formatCount(pinnedVideo()!.viewCount!) }} views</span
                  >
                }
              </div>
            </button>
          } @else if (isOwnProfile()) {
            <button class="mc-showreel-empty" (click)="pinVideoClick.emit()">
              <nxt1-icon name="plusCircle" [size]="24" />
              <span>Pin Your Highlight Tape</span>
            </button>
          }
          @if (isOwnProfile() && pinnedVideo()) {
            <button
              class="mc-showreel-edit"
              (click)="pinVideoClick.emit()"
              aria-label="Edit pinned video"
            >
              <nxt1-icon name="pencil" [size]="14" />
            </button>
          }
        </div>
      }
    </header>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════════════════════
       EA MADDEN FRANCHISE MODE — PLAYER CARD (MOBILE)
       Faithful recreation of the Madden 25 player overview UI
       ═══════════════════════════════════════════════════════════ */
      :host {
        display: block;
        --card-bg: var(--nxt1-color-bg-primary, #0e0e0e);
        --card-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --card-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --card-text: var(--nxt1-color-text-primary, #ffffff);
        --card-text-2: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --card-text-3: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        --card-accent: var(--nxt1-color-primary, #d4ff00);
        --card-verified: var(--nxt1-color-info, #4da6ff);
      }

      /* ─── OVR Tier Colors (matches Madden rating tiers) ─── */
      .madden-card[data-tier='elite'] {
        --ovr-color: var(--card-accent);
        --ovr-glow: rgba(212, 255, 0, 0.45);
        --ovr-text: #000;
      }
      .madden-card[data-tier='blue-chip'] {
        --ovr-color: #00e676;
        --ovr-glow: rgba(0, 230, 118, 0.35);
        --ovr-text: #000;
      }
      .madden-card[data-tier='starter'] {
        --ovr-color: #42a5f5;
        --ovr-glow: rgba(66, 165, 245, 0.35);
        --ovr-text: #000;
      }
      .madden-card[data-tier='prospect'] {
        --ovr-color: #ff9800;
        --ovr-glow: rgba(255, 152, 0, 0.35);
        --ovr-text: #000;
      }
      .madden-card[data-tier='developing'] {
        --ovr-color: #78909c;
        --ovr-glow: rgba(120, 144, 156, 0.25);
        --ovr-text: #fff;
      }
      .madden-card[data-tier='unrated'] {
        --ovr-color: rgba(255, 255, 255, 0.08);
        --ovr-glow: transparent;
        --ovr-text: rgba(255, 255, 255, 0.25);
      }

      .madden-card {
        position: relative;
        background: var(--card-bg);
      }

      /* ─── BANNER ─── */
      .mc-banner {
        position: relative;
        height: 160px;
        background-size: cover;
        background-position: center top;
        background-color: #1a1a1a;
      }
      .mc-banner-grid {
        position: absolute;
        inset: 0;
        background:
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 60px,
            rgba(255, 255, 255, 0.02) 60px,
            rgba(255, 255, 255, 0.02) 61px
          ),
          repeating-linear-gradient(
            0deg,
            transparent,
            transparent 60px,
            rgba(255, 255, 255, 0.02) 60px,
            rgba(255, 255, 255, 0.02) 61px
          );
      }
      .mc-banner-fade {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to bottom,
          rgba(14, 14, 14, 0.2) 0%,
          rgba(14, 14, 14, 0.4) 50%,
          var(--card-bg) 100%
        );
      }

      /* ─── HERO ZONE (Team Logo + Split Name + OVR) ─── */
      .mc-hero {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 0 16px;
        margin-top: -40px;
        position: relative;
        z-index: 2;
      }

      /* Team Logo — large like Madden's team crest */
      .mc-team-logo {
        flex-shrink: 0;
        width: 64px;
        height: 64px;
        border-radius: 14px;
        overflow: hidden;
        background: var(--card-surface);
        border: 2px solid var(--card-border);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .mc-team-logo img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .mc-team-placeholder {
        color: var(--card-text-3);
      }

      /* Identity block */
      .mc-identity {
        flex: 1;
        min-width: 0;
        padding-top: 4px;
      }
      .mc-pos-line {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 2px;
      }
      .mc-pos {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--card-text-2);
      }
      .mc-jersey {
        font-size: 12px;
        font-weight: 800;
        color: var(--card-text);
      }

      /* Split name — Madden signature style */
      .mc-name-block {
        display: flex;
        flex-direction: column;
        line-height: 1;
      }
      .mc-first-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--card-text-2);
        letter-spacing: 0.02em;
      }
      .mc-last-name {
        font-size: 32px;
        font-weight: 900;
        color: var(--card-text);
        letter-spacing: -0.03em;
        line-height: 0.95;
      }

      .mc-verified-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;
        font-size: 11px;
        font-weight: 600;
        color: var(--card-verified);
      }

      /* OVR Badge — Madden's signature colored square */
      .mc-ovr {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 10px;
        background: var(--ovr-color);
        color: var(--ovr-text);
        box-shadow:
          0 0 20px var(--ovr-glow),
          0 4px 12px rgba(0, 0, 0, 0.5);
        margin-top: 4px;
        position: relative;
      }
      .mc-ovr-num {
        font-size: 26px;
        font-weight: 900;
        line-height: 1;
      }
      .mc-ovr-unrated {
        font-size: 20px;
      }
      .mc-ovr-label {
        font-size: 9px;
        font-weight: 900;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        opacity: 0.7;
        margin-top: -1px;
      }
      .mc-ovr-stars {
        position: absolute;
        bottom: -12px;
        display: flex;
        gap: 1px;
      }
      .mc-star {
        font-size: 10px;
        color: var(--ovr-color);
        filter: drop-shadow(0 0 2px var(--ovr-glow));
      }

      /* ─── AVATAR ROW ─── */
      .mc-avatar-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 16px 0;
      }
      .mc-avatar-wrap {
        width: 48px;
        height: 48px;
        flex-shrink: 0;
        border-radius: 50%;
        overflow: hidden;
        border: 2px solid var(--card-border);
      }
      .mc-avatar-wrap ::ng-deep nxt1-avatar {
        --avatar-border-color: transparent;
        --avatar-border-width: 0;
      }
      .mc-avatar-wrap ::ng-deep .avatar-ring {
        display: none;
      }

      .mc-meta-col {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .mc-meta-item {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 13px;
        color: var(--card-text-2);
      }
      .mc-meta-sport {
        font-size: 11px;
        font-weight: 700;
        color: var(--card-accent);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      /* ─── SECTION CONTAINERS ─── */
      .mc-section {
        padding: 0 16px;
        margin-top: 18px;
      }
      .mc-section-title {
        font-size: 16px;
        font-weight: 800;
        color: var(--card-text);
        margin: 0 0 10px;
        letter-spacing: -0.01em;
      }

      /* ─── PLAYER PROFILE TABLE (Madden label:value) ─── */
      .mc-profile-table {
        background: var(--card-surface);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        padding: 4px 0;
        overflow: hidden;
      }
      .mc-profile-row {
        display: flex;
        align-items: center;
        padding: 9px 16px;
      }
      .mc-profile-row + .mc-profile-row {
        border-top: 1px solid rgba(255, 255, 255, 0.04);
      }
      .mc-profile-label {
        width: 80px;
        flex-shrink: 0;
        font-size: 14px;
        font-weight: 400;
        color: var(--card-text-3);
      }
      .mc-verified-badge {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        margin-left: 8px;
        font-size: 10px;
        font-weight: 600;
        color: var(--card-accent);
        text-decoration: none;
        white-space: nowrap;
        transition: opacity 0.15s ease;
      }
      .mc-verified-badge:hover {
        opacity: 0.8;
      }
      .mc-verified-check {
        flex-shrink: 0;
      }
      .mc-verified-text {
        letter-spacing: 0.01em;
      }
      .mc-verified-logo {
        height: 12px;
        width: auto;
        object-fit: contain;
        filter: brightness(0) invert(1);
      }
      .mc-profile-value {
        font-size: 15px;
        font-weight: 700;
        color: var(--card-text);
        text-transform: uppercase;
      }

      /* ─── TRAIT DIAMOND (Madden Hidden/Superstar/X-Factor) ─── */
      .mc-trait-zone {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 20px 16px;
        background: var(--card-surface);
        border: 1px solid var(--card-border);
        border-radius: 12px;
      }
      .mc-trait-title {
        font-size: 14px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--card-text);
        margin: 0 0 14px;
      }
      .mc-trait-zone .mc-trait-title {
        color: var(--card-accent);
      }

      .mc-trait-diamond {
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 14px;
        transform: rotate(45deg);
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--card-accent) 90%, transparent) 0%,
          color-mix(in srgb, var(--card-accent) 60%, transparent) 100%
        );
        box-shadow:
          0 0 24px color-mix(in srgb, var(--card-accent) 40%, transparent),
          0 0 48px color-mix(in srgb, var(--card-accent) 15%, transparent);
        color: var(--card-text);
        font-size: 28px;
        font-weight: 900;
        margin-bottom: 12px;
      }
      .mc-trait-diamond > * {
        transform: rotate(-45deg);
      }

      .mc-trait-icon {
        transform: rotate(-45deg);
        font-size: 28px;
        font-weight: 900;
      }

      .mc-trait-progress {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        width: 100%;
        max-width: 200px;
      }
      .mc-trait-bar {
        width: 100%;
        height: 6px;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.1);
        overflow: hidden;
      }
      .mc-trait-fill {
        height: 100%;
        border-radius: 3px;
        background: linear-gradient(90deg, #43a047, #66bb6a);
        transition: width 0.6s ease;
      }
      .mc-trait-count {
        font-size: 13px;
        font-weight: 700;
        color: var(--card-text);
      }
      .mc-trait-name {
        font-size: 15px;
        font-weight: 700;
        color: var(--card-text);
        margin-top: 2px;
      }
      .mc-trait-summary {
        font-size: 13px;
        font-weight: 600;
        color: var(--card-text-2);
        margin: 8px 0 4px;
        line-height: 1.45;
        text-align: center;
        max-width: 280px;
      }

      /* ─── ARCHETYPES (Madden skill boxes) ─── */
      .mc-archetypes {
        display: flex;
        gap: 8px;
      }
      .mc-arch-box {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 12px 4px 10px;
        background: var(--card-surface);
        border: 1px solid var(--card-border);
        border-radius: 12px;
      }
      .mc-arch-icon {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.06);
        color: var(--card-text-2);
        margin-bottom: 2px;
      }
      .mc-arch-name {
        font-size: 10px;
        font-weight: 600;
        color: var(--card-text-2);
        text-align: center;
        line-height: 1.2;
      }
      .mc-arch-rating {
        font-size: 28px;
        font-weight: 900;
        line-height: 1;
        letter-spacing: -0.02em;
      }
      .mc-arch-ovr {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--card-text-3);
      }

      /* ─── AGENT X STATUS ─── */
      .mc-agent {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 18px 16px 0;
        padding: 8px 14px;
        border-radius: 9999px;
        background: color-mix(in srgb, var(--card-accent) 6%, transparent);
        border: 1px solid color-mix(in srgb, var(--card-accent) 12%, transparent);
      }
      .mc-agent-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
        background: var(--card-accent);
        box-shadow: 0 0 6px var(--card-accent);
        animation: agentPulse 2s ease-in-out infinite;
      }
      @keyframes agentPulse {
        0%,
        100% {
          opacity: 1;
          box-shadow: 0 0 6px var(--card-accent);
        }
        50% {
          opacity: 0.4;
          box-shadow: 0 0 12px var(--card-accent);
        }
      }
      .mc-agent-x {
        color: var(--card-accent);
        flex-shrink: 0;
      }
      .mc-agent-text {
        font-size: 12px;
        font-weight: 600;
        color: var(--card-accent);
        line-height: 1.3;
      }

      /* ─── BIO ─── */
      .mc-bio {
        font-size: 14px;
        line-height: 1.55;
        color: var(--card-text);
        margin: 14px 16px 0;
        padding: 0;
      }

      /* ─── ACTIONS ─── */
      .mc-actions {
        display: flex;
        gap: 10px;
        margin: 16px 16px 0;
      }
      .mc-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        border-radius: 9999px;
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        border: none;
        transition: all 0.25s ease;
      }
      .mc-btn-msg {
        background: var(--card-surface);
        color: var(--card-text);
        border: 1px solid var(--card-border);
      }
      .mc-btn-msg:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.15);
      }

      /* ─── SHOWREEL ─── */
      .mc-showreel {
        position: relative;
        margin: 16px 16px 0;
      }
      .mc-showreel-card {
        display: flex;
        gap: 12px;
        width: 100%;
        padding: 10px;
        background: var(--card-surface);
        border: 1px solid var(--card-border);
        border-radius: 14px;
        cursor: pointer;
        transition: all 0.25s ease;
        text-align: left;
      }
      .mc-showreel-card:hover {
        border-color: color-mix(in srgb, var(--card-accent) 50%, transparent);
      }
      .mc-showreel-thumb {
        position: relative;
        width: 120px;
        height: 68px;
        border-radius: 10px;
        overflow: hidden;
        flex-shrink: 0;
        background: rgba(255, 255, 255, 0.03);
      }
      .mc-showreel-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .mc-showreel-play {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.35);
        color: #fff;
      }
      .mc-showreel-dur {
        position: absolute;
        bottom: 4px;
        right: 4px;
        padding: 1px 5px;
        background: rgba(0, 0, 0, 0.8);
        border-radius: 3px;
        font-size: 10px;
        color: #fff;
        font-weight: 600;
      }
      .mc-showreel-info {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 3px;
        min-width: 0;
      }
      .mc-showreel-tag {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.1em;
        color: var(--card-accent);
      }
      .mc-showreel-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--card-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mc-showreel-views {
        font-size: 12px;
        color: var(--card-text-3);
      }
      .mc-showreel-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        padding: 22px;
        background: transparent;
        border: 2px dashed var(--card-border);
        border-radius: 14px;
        cursor: pointer;
        color: var(--card-text-2);
        font-size: 14px;
        font-weight: 600;
        transition: all 0.25s ease;
      }
      .mc-showreel-empty:hover {
        border-color: var(--card-accent);
        color: var(--card-accent);
      }
      .mc-showreel-edit {
        position: absolute;
        top: -4px;
        right: 0;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: var(--card-surface);
        border: 1px solid var(--card-border);
        color: var(--card-text-2);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .mc-showreel-edit:hover {
        background: rgba(255, 255, 255, 0.08);
        color: var(--card-text);
      }

      /* ─── SPINNER ─── */
      .mc-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid currentColor;
        border-top-color: transparent;
        border-radius: 50%;
        display: inline-block;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* Bottom padding for content below */
      .madden-card {
        padding-bottom: 16px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileHeaderComponent {
  // ─── SERVICE ───
  protected readonly profile = inject(ProfileService);

  // ─── INPUTS ───
  readonly user = input<ProfileUser | null>(null);
  readonly pinnedVideo = input<ProfilePinnedVideo | null>(null);
  readonly quickStats = input<ProfileQuickStats | null>(null);
  readonly playerCard = input<PlayerCardData | null>(null);
  readonly isOwnProfile = input(false);
  readonly canEdit = input(false);
  readonly hasTeam = input(false);

  // ─── OUTPUTS ───
  readonly editProfile = output<void>();
  readonly editBanner = output<void>();
  readonly editAvatar = output<void>();
  readonly messageClick = output<void>();
  readonly pinnedVideoClick = output<void>();
  readonly pinVideoClick = output<void>();

  // ─── COMPUTED ───
  /** Use activeSport() for sport-switching support */
  protected readonly activeSport = computed(() => this.profile.activeSport());

  protected readonly displayName = computed(() => {
    const u = this.user();
    return u?.displayName ?? (`${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'User');
  });

  /** Madden-style split: small first name */
  protected readonly firstName = computed(() => {
    const u = this.user();
    return u?.firstName || this.displayName().split(' ')[0] || '';
  });

  /** Madden-style split: HUGE last name */
  protected readonly lastName = computed(() => {
    const u = this.user();
    if (u?.lastName) return u.lastName;
    const parts = this.displayName().split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
  });

  protected readonly hasMeasurables = computed(() => {
    const u = this.user();
    return !!(
      u?.height ||
      u?.weight ||
      u?.gpa ||
      u?.classYear ||
      u?.sat ||
      u?.act ||
      u?.school?.name
    );
  });

  protected readonly isFemaleProfile = computed(() => isFemaleGender(this.user()?.gender));

  protected readonly formattedWeight = computed(() => normalizeWeightDisplay(this.user()?.weight));

  protected readonly showWeight = computed(
    () => this.formattedWeight().length > 0 && !this.isFemaleProfile()
  );

  /** Resolved measurables verification from new verifications[] or deprecated flat fields */
  protected readonly measurablesVerification = computed(() =>
    getVerification(this.user(), 'measurables')
  );

  protected readonly hasProspectGrade = computed(() => {
    const grade = this.playerCard()?.prospectGrade;
    return !!(grade && grade.overall > 0);
  });

  protected readonly currentTier = computed((): ProspectTier => {
    return this.playerCard()?.prospectGrade?.tier ?? 'unrated';
  });

  protected readonly starsArray = computed(() => {
    const count = this.playerCard()?.prospectGrade?.starRating ?? 0;
    return Array.from({ length: count });
  });

  protected readonly traitCategoryLabel = computed(() => {
    const cat = this.playerCard()?.trait?.category;
    if (cat === 'x-factor') return 'X-FACTOR';
    if (cat === 'hidden') return 'AGENT X';
    return 'SUPERSTAR';
  });

  protected readonly traitProgress = computed(() => {
    const trait = this.playerCard()?.trait;
    if (!trait?.progressTotal) return 0;
    return Math.min(100, ((trait.progressCurrent ?? 0) / trait.progressTotal) * 100);
  });

  protected readonly bannerStyle = computed(() => {
    const banner = this.user()?.bannerImg;
    return banner ? `url(${banner})` : 'none';
  });

  // ─── HELPERS ───
  protected getArchetypeColor(rating: number): string {
    if (rating >= 90) return 'var(--card-accent)';
    if (rating >= 80) return '#00e676';
    if (rating >= 70) return '#42a5f5';
    if (rating >= 60) return '#ff9800';
    return '#78909c';
  }

  protected formatCount(count: number): string {
    if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + 'M';
    if (count >= 1_000) return (count / 1_000).toFixed(1) + 'K';
    return count.toString();
  }

  protected formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
