import { Directive, ElementRef, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import { buildInlineVideoPreviewSrc } from './video-preview.utils';

@Directive({
  selector: 'video[nxt1InlineVideoPreview]',
  standalone: true,
})
export class NxtInlineVideoPreviewDirective implements OnChanges, OnDestroy {
  @Input() nxt1InlineVideoPreview: string | null | undefined;
  @Input() nxt1InlineVideoPreviewPoster: string | null | undefined;

  private readonly videoRef = inject<ElementRef<HTMLVideoElement>>(ElementRef);

  ngOnChanges(): void {
    const video = this.videoRef.nativeElement;
    const previewSrc = buildInlineVideoPreviewSrc(this.nxt1InlineVideoPreview);
    const poster = this.nxt1InlineVideoPreviewPoster?.trim() ?? '';

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('preload', 'metadata');

    if (poster) {
      video.poster = poster;
      video.setAttribute('poster', poster);
    } else {
      video.removeAttribute('poster');
    }

    if (previewSrc) {
      video.src = previewSrc;
      video.setAttribute('src', previewSrc);
    } else {
      video.removeAttribute('src');
    }
  }

  ngOnDestroy(): void {
    const video = this.videoRef.nativeElement;
    video.removeAttribute('src');
    video.removeAttribute('poster');
    try {
      video.load();
    } catch {
      /* no-op: element may already be detached in tests or SSR-like runtimes */
    }
  }
}
