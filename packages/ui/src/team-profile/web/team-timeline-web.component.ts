/**
 * @fileoverview Team Timeline Web Component
 * @module @nxt1/ui/team-profile/web
 * @version 2.0.0
 *
 * Renders the full social/post timeline for a team using the shared
 * FeedPostCardComponent — identical card rendering to athlete profiles
 * and the home feed. Follows the Instagram/Twitter pattern: one card
 * component everywhere.
 *
 * Handles pinned vs all-posts filtering via activeSection input.
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import {
  type TeamProfilePost,
  type FeedPost,
  type FeedAuthor,
  teamToFeedAuthor,
  teamPostToFeedPost,
} from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
import { FeedPostCardComponent } from '../../feed/feed-post-card.component';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-timeline-web',
  standalone: true,
  imports: [NxtIconComponent, FeedPostCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (filteredFeedPosts().length > 0) {
      <div class="team-timeline-list">
        @for (post of filteredFeedPosts(); track post.id; let idx = $index) {
          <nxt1-feed-post-card
            [post]="post"
            [hideAuthor]="true"
            [showMenu]="false"
            (postClick)="handlePostClick(idx)"
            (reactClick)="handlePostClick(idx)"
            (shareClick)="handlePostClick(idx)"
          />
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
        gap: 12px;
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

  private readonly mediaPosts = computed<readonly TeamProfilePost[]>(() =>
    this.teamProfile
      .allPosts()
      .filter(
        (post) =>
          post.type === 'image' ||
          post.type === 'video' ||
          post.type === 'highlight' ||
          !!post.thumbnailUrl ||
          !!post.mediaUrl
      )
  );

  /** Active section from side nav: 'pinned' | 'all-posts' */
  readonly activeSection = input<string>('all-posts');

  /** Emitted when a post card is clicked */
  readonly postClick = output<TeamProfilePost>();

  /** Build FeedAuthor from team data (shared across all posts) */
  private readonly feedAuthor = computed<FeedAuthor>(() => {
    const team = this.teamProfile.team();
    if (team) return teamToFeedAuthor(team);

    // Fallback when team data not yet loaded
    return {
      uid: '',
      profileCode: '',
      displayName: '',
      firstName: '',
      lastName: '',
      role: 'team',
      verificationStatus: 'unverified',
      isVerified: false,
    };
  });

  /** Filter posts based on active section, mapped to FeedPost[] */
  protected readonly filteredFeedPosts = computed<readonly FeedPost[]>(() => {
    const section = this.activeSection();
    const author = this.feedAuthor();
    const posts =
      section === 'pinned'
        ? this.teamProfile.pinnedPosts()
        : section === 'media'
          ? this.mediaPosts()
          : this.teamProfile.allPosts();
    return posts.map((p) => teamPostToFeedPost(p, author));
  });

  /** Source posts for resolving click events back to TeamProfilePost */
  private readonly filteredSourcePosts = computed<readonly TeamProfilePost[]>(() => {
    const section = this.activeSection();
    return section === 'pinned'
      ? this.teamProfile.pinnedPosts()
      : section === 'media'
        ? this.mediaPosts()
        : this.teamProfile.allPosts();
  });

  /** Resolve FeedPost index → TeamProfilePost and emit */
  protected handlePostClick(index: number): void {
    const post = this.filteredSourcePosts()[index];
    if (post) this.postClick.emit(post);
  }
}
