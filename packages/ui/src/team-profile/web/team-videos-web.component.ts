/**
 * @fileoverview Team Videos Web Component
 * @module @nxt1/ui/team-profile/web
 * @version 2.0.0
 *
 * Renders team video content (highlights, full videos) using the shared
 * FeedPostCardComponent — identical card rendering to athlete profiles
 * and the home feed. Follows the Instagram/Twitter pattern: one card
 * component everywhere.
 *
 * Uses videoPosts() from TeamProfileService.
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
  selector: 'nxt1-team-videos-web',
  standalone: true,
  imports: [NxtIconComponent, FeedPostCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (filteredFeedPosts().length > 0) {
      <div class="team-videos-list">
        @for (post of filteredFeedPosts(); track post.id; let idx = $index) {
          <nxt1-feed-post-card
            [post]="post"
            [hideAuthor]="true"
            [showMenu]="false"
            (postClick)="handleVideoClick(idx)"
            (reactClick)="handleVideoClick(idx)"
            (shareClick)="handleVideoClick(idx)"
          />
        }
      </div>
    } @else {
      <div class="team-empty-state">
        <nxt1-icon name="videocam-outline" size="40" />
        <h3>No videos yet</h3>
        <p>Team highlights and game footage will appear here.</p>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .team-videos-list {
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
export class TeamVideosWebComponent {
  private readonly teamProfile = inject(TeamProfileService);

  /** Active section from side nav: 'highlights' | 'all-videos' */
  readonly activeSection = input<string>('all-videos');

  /** Emitted when a video card is clicked */
  readonly videoClick = output<TeamProfilePost>();

  /** Build FeedAuthor from team data (shared across all posts) */
  private readonly feedAuthor = computed<FeedAuthor>(() => {
    const team = this.teamProfile.team();
    if (team) return teamToFeedAuthor(team);

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

  /** Filter videos based on active section, mapped to FeedPost[] */
  protected readonly filteredFeedPosts = computed<readonly FeedPost[]>(() => {
    const section = this.activeSection();
    const author = this.feedAuthor();
    const videos = this.teamProfile.videoPosts();

    const filtered =
      section === 'highlights' ? videos.filter((v) => v.type === 'highlight') : videos;
    return filtered.map((p) => teamPostToFeedPost(p, author));
  });

  /** Source videos for resolving click events back to TeamProfilePost */
  private readonly filteredSourceVideos = computed<readonly TeamProfilePost[]>(() => {
    const section = this.activeSection();
    const videos = this.teamProfile.videoPosts();
    return section === 'highlights' ? videos.filter((v) => v.type === 'highlight') : videos;
  });

  /** Resolve FeedPost index → TeamProfilePost and emit */
  protected handleVideoClick(index: number): void {
    const video = this.filteredSourceVideos()[index];
    if (video) this.videoClick.emit(video);
  }
}
