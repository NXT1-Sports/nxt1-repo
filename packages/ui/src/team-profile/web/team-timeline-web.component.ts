/**
 * @fileoverview Team Timeline Web Component
 * @module @nxt1/ui/team-profile/web
 *
 * Renders the full social/post timeline for a team.
 * Handles pinned vs all-posts filtering via activeSection input.
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { type TeamProfilePost } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-timeline-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (filteredPosts().length > 0) {
      <div class="team-timeline-list">
        @for (post of filteredPosts(); track post.id) {
          <button class="team-post-card" (click)="postClick.emit(post)">
            @if (post.thumbnailUrl) {
              <nxt1-image
                [src]="post.thumbnailUrl"
                [alt]="post.title ?? 'Post'"
                class="team-post-card__image"
              />
            }
            <div class="team-post-card__content">
              @if (post.isPinned) {
                <span class="team-post-card__pinned">
                  <nxt1-icon name="pin" size="12" /> Pinned
                </span>
              }
              @if (post.title) {
                <h4 class="team-post-card__title">{{ post.title }}</h4>
              }
              @if (post.body) {
                <p class="team-post-card__body">{{ post.body }}</p>
              }
              <div class="team-post-card__meta">
                <span>{{ formatPostDate(post.createdAt) }}</span>
                @if (post.type) {
                  <span class="team-post-card__type">{{ post.type }}</span>
                }
                @if (post.likeCount) {
                  <span>{{ post.likeCount }} likes</span>
                }
              </div>
            </div>
          </button>
        }
      </div>
    } @else {
      <div class="team-empty-state">
        <nxt1-icon name="document-text-outline" size="40" />
        <h3>No posts yet</h3>
        <p>Team updates and announcements will appear here.</p>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .team-timeline-list {
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

      .team-post-card__pinned {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 700;
        color: var(--m-accent, #d4ff00);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 2px;
      }

      .team-post-card__title {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text, #fff);
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

      .team-post-card__type {
        text-transform: capitalize;
        padding: 1px 6px;
        border-radius: 4px;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
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
})
export class TeamTimelineWebComponent {
  private readonly teamProfile = inject(TeamProfileService);

  /** Active section from side nav: 'pinned' | 'all-posts' */
  readonly activeSection = input<string>('all-posts');

  /** Emitted when a post card is clicked */
  readonly postClick = output<TeamProfilePost>();

  /** Filter posts based on active section */
  protected readonly filteredPosts = computed(() => {
    const section = this.activeSection();
    if (section === 'pinned') {
      return this.teamProfile.pinnedPosts();
    }
    return this.teamProfile.allPosts();
  });

  protected formatPostDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
