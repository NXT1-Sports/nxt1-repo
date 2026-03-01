/**
 * @fileoverview Team News Web Component
 * @module @nxt1/ui/team-profile/web
 * @version 1.0.0
 *
 * News tab content for team profile.
 * Mirrors ProfileNewsWebComponent — uses mock data pattern.
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import type { TeamProfilePost } from '@nxt1/core';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-news-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtImageComponent],
  template: `
    <div class="team-news">
      <h2 class="team-section__title">News & Announcements</h2>
      @if (filteredNews().length > 0) {
        <div class="team-posts-list">
          @for (post of filteredNews(); track post.id) {
            <button type="button" class="team-post-card" (click)="postClick.emit(post)">
              @if (post.thumbnailUrl) {
                <nxt1-image
                  class="team-post-card__image"
                  [src]="post.thumbnailUrl"
                  [alt]="post.title ?? ''"
                  [width]="120"
                  [height]="80"
                  fit="cover"
                />
              }
              <div class="team-post-card__content">
                <h3 class="team-post-card__title">{{ post.title }}</h3>
                @if (post.body) {
                  <p class="team-post-card__body">{{ post.body }}</p>
                }
                <div class="team-post-card__meta">
                  <span>{{ formatPostDate(post.createdAt) }}</span>
                  @if (post.likeCount) {
                    <span>{{ post.likeCount }} likes</span>
                  }
                  @if (post.commentCount) {
                    <span>{{ post.commentCount }} comments</span>
                  }
                </div>
              </div>
            </button>
          }
        </div>
      } @else {
        <div class="team-empty-state">
          <nxt1-icon name="newspaper" [size]="40" />
          <h3>No news yet</h3>
          <p>Team news and announcements will appear here.</p>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .team-section__title {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text, #ffffff);
        margin: 0 0 12px;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .team-posts-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .team-post-card {
        display: flex;
        gap: 14px;
        padding: 14px;
        border-radius: 12px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid transparent;
        cursor: pointer;
        width: 100%;
        text-align: left;
        transition:
          background 0.12s,
          border-color 0.12s;
      }

      .team-post-card:hover {
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
        border-color: var(--m-border, rgba(255, 255, 255, 0.08));
      }

      .team-post-card__image {
        width: 120px;
        height: 80px;
        border-radius: 8px;
        flex-shrink: 0;
        object-fit: cover;
      }

      .team-post-card__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .team-post-card__title {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text, #ffffff);
        margin: 0;
      }

      .team-post-card__body {
        font-size: 13px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .team-post-card__meta {
        display: flex;
        gap: 12px;
        font-size: 11px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        margin-top: auto;
      }

      .team-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 48px 16px;
        gap: 10px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-empty-state h3 {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 4px 0 0;
      }

      .team-empty-state p {
        font-size: 13px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        margin: 0;
        max-width: 320px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamNewsWebComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  // ============================================
  // INPUTS
  // ============================================

  /** Active side tab section — 'all-news', 'announcements', etc. */
  readonly activeSection = input<string>('all-news');

  // ============================================
  // OUTPUTS
  // ============================================

  readonly postClick = output<TeamProfilePost>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Filtered news posts based on active section */
  protected readonly filteredNews = computed(() => {
    const section = this.activeSection();
    const news = this.teamProfile.newsPosts();

    if (!section || section === 'all-news') {
      return news;
    }

    if (section === 'announcements') {
      return news.filter((p) => p.type === 'announcement');
    }

    return news;
  });

  // ============================================
  // HELPERS
  // ============================================

  protected formatPostDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
