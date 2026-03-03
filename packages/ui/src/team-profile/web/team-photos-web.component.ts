/**
 * @fileoverview Team Photos Web Component
 * @module @nxt1/ui/team-profile/web
 * @version 1.0.0
 *
 * Photos tab content for team profile.
 * Masonry-style photo gallery using imagePosts and galleryImages.
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-photos-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtImageComponent],
  template: `
    <div class="team-photos">
      <h2 class="team-section__title">Photos</h2>
      @if (photos().length > 0) {
        <div class="team-photos__grid">
          @for (photo of photos(); track photo.url) {
            <button type="button" class="team-photos__item" (click)="photoClick.emit(photo.url)">
              <nxt1-image
                [src]="photo.url"
                [alt]="photo.caption ?? ''"
                [width]="320"
                [height]="240"
                fit="cover"
              />
              @if (photo.caption) {
                <span class="team-photos__caption">{{ photo.caption }}</span>
              }
            </button>
          }
        </div>
      } @else {
        <div class="team-empty-state">
          <nxt1-icon name="photo-library" [size]="40" />
          <h3>No photos yet</h3>
          <p>Team photos will appear here when posted.</p>
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
        letter-spacing: 0.02em;
      }

      .team-photos__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 8px;
      }

      .team-photos__item {
        position: relative;
        border-radius: 10px;
        overflow: hidden;
        cursor: pointer;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid transparent;
        padding: 0;
        width: 100%;
        aspect-ratio: 4 / 3;
        transition:
          border-color 0.12s,
          transform 0.12s;
      }

      .team-photos__item:hover {
        border-color: var(--m-border, rgba(255, 255, 255, 0.12));
        transform: scale(1.02);
      }

      .team-photos__item nxt1-image {
        width: 100%;
        height: 100%;
        display: block;
      }

      .team-photos__caption {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 8px 10px;
        font-size: 11px;
        color: #fff;
        background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
        text-align: left;
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
export class TeamPhotosWebComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  // ============================================
  // INPUTS
  // ============================================

  /** Active side tab section — 'all-photos', 'team', 'events', etc. */
  readonly activeSection = input<string>('all-photos');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits the URL of clicked photo for lightbox */
  readonly photoClick = output<string>();

  // ============================================
  // COMPUTED
  // ============================================

  /** All photos combining imagePosts thumbnails and gallery images */
  protected readonly photos = computed(() => {
    const gallery = this.teamProfile.galleryImages();
    const imagePosts = this.teamProfile.imagePosts();

    // Build unified photo list
    const fromPosts = imagePosts
      .filter((p) => p.thumbnailUrl)
      .map((p) => ({
        url: p.thumbnailUrl!,
        caption: p.title ?? null,
      }));

    const fromGallery = gallery.map((url) => ({
      url,
      caption: null as string | null,
    }));

    return [...fromPosts, ...fromGallery];
  });
}
