/**
 * @fileoverview Team Videos Web Component
 * @module @nxt1/ui/team-profile/web
 *
 * Renders team video content (highlights, full videos).
 * Uses videoPosts() from TeamProfileService.
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { type TeamProfilePost } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-videos-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (filteredVideos().length > 0) {
      <div class="team-videos-grid">
        @for (video of filteredVideos(); track video.id) {
          <button class="team-video-card" (click)="videoClick.emit(video)">
            @if (video.thumbnailUrl) {
              <nxt1-image
                [src]="video.thumbnailUrl"
                [alt]="video.title ?? 'Video'"
                class="team-video-card__thumb"
              />
            } @else {
              <div class="team-video-card__placeholder">
                <nxt1-icon name="videocam-outline" size="32" />
              </div>
            }
            <div class="team-video-card__overlay">
              <nxt1-icon name="play-circle" size="36" />
            </div>
            <div class="team-video-card__info">
              @if (video.isPinned) {
                <span class="team-video-card__pinned">
                  <nxt1-icon name="pin" size="10" /> Pinned
                </span>
              }
              <span class="team-video-card__title">{{ video.title ?? 'Video' }}</span>
              <div class="team-video-card__meta">
                @if (video.duration) {
                  <span>{{ formatDuration(video.duration) }}</span>
                }
                @if (video.viewCount != null) {
                  <span>{{ video.viewCount }} views</span>
                }
              </div>
            </div>
          </button>
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

      .team-videos-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 12px;
      }

      .team-video-card {
        position: relative;
        border-radius: 12px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        overflow: hidden;
        cursor: pointer;
        border: 1px solid transparent;
        transition: border-color 0.12s;
        width: 100%;
        text-align: left;
      }
      .team-video-card:hover {
        border-color: var(--m-border, rgba(255, 255, 255, 0.08));
      }
      .team-video-card:hover .team-video-card__overlay {
        opacity: 1;
      }

      .team-video-card__thumb {
        width: 100%;
        aspect-ratio: 16/9;
        object-fit: cover;
        display: block;
      }

      .team-video-card__placeholder {
        width: 100%;
        aspect-ratio: 16/9;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-video-card__overlay {
        position: absolute;
        inset: 0;
        aspect-ratio: 16/9;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.35);
        color: white;
        opacity: 0;
        transition: opacity 0.15s;
      }

      .team-video-card__info {
        padding: 10px 12px;
      }

      .team-video-card__pinned {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 700;
        color: var(--m-accent, #d4ff00);
        margin-bottom: 2px;
      }

      .team-video-card__title {
        font-size: 13px;
        font-weight: 600;
        color: var(--m-text, #fff);
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .team-video-card__meta {
        display: flex;
        gap: 10px;
        font-size: 11px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        margin-top: 2px;
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

      @media (max-width: 768px) {
        .team-videos-grid {
          grid-template-columns: 1fr;
        }
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

  /** Filter videos based on active section */
  protected readonly filteredVideos = computed(() => {
    const section = this.activeSection();
    const videos = this.teamProfile.videoPosts();

    if (section === 'highlights') {
      return videos.filter((v) => v.type === 'highlight');
    }
    return videos;
  });

  protected formatDuration(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }
}
