import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AgentXFilmReviewPanelComponent, AgentXFilmReviewService } from '@nxt1/ui/agent-x';

interface FilmReviewPopoutPayload {
  readonly reviewId?: string | null;
  readonly teamId?: string | null;
  readonly role?: string | null;
  readonly sport?: string | null;
  readonly startTimeSec: number;
}

const FILM_REVIEW_POPOUT_STORAGE_PREFIX = 'nxt1-film-review-popout:';

@Component({
  selector: 'app-agent-x-film-review-popout',
  standalone: true,
  imports: [AgentXFilmReviewPanelComponent],
  template: `
    <main class="film-popout" role="main">
      @if (payloadError(); as error) {
        <div class="film-popout__state">
          <h2>Film Review unavailable</h2>
          <p>{{ error }}</p>
        </div>
      } @else if (reviewId()) {
        <nxt1-agent-x-film-review-panel
          #filmReviewPanelRef
          [teamId]="teamId()"
          [role]="role()"
          [sport]="sport()"
          [detailOnly]="true"
          [openingSelection]="openingSelection()"
          [showOpenInNewWindow]="false"
          [enableDrawTool]="true"
          [parentManagedLoad]="true"
        />
      } @else {
        <div class="film-popout__state">
          <h2>Loading film review</h2>
          <p>Preparing the shared Film Review player.</p>
        </div>
      }
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100vw;
        min-width: 0;
        min-height: 100vh;
        color-scheme: dark;
        background: #05070a;
        color: #f8fafc;
        font-family:
          Rajdhani,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
      }

      .film-popout {
        width: 100%;
        min-height: 100vh;
        background: #05070a;
      }

      nxt1-agent-x-film-review-panel {
        display: block;
        width: 100%;
        min-height: 100vh;
      }

      .film-popout__state {
        display: grid;
        gap: 8px;
        place-items: center;
        align-content: center;
        min-height: 100vh;
        padding: 24px;
        text-align: center;
      }

      .film-popout__state h2 {
        margin: 0;
        font-size: 18px;
      }

      .film-popout__state p {
        margin: 0;
        color: #94a3b8;
        font-size: 13px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXFilmReviewPopoutComponent {
  private readonly filmReviewService = inject(AgentXFilmReviewService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly filmReviewPanel =
    viewChild<AgentXFilmReviewPanelComponent>('filmReviewPanelRef');
  protected readonly teamId = signal<string | null>(null);
  protected readonly role = signal<string | null>(null);
  protected readonly sport = signal('');
  protected readonly reviewId = signal<string | null>(null);
  protected readonly startTimeSec = signal(0);
  protected readonly openingSelection = signal(true);
  protected readonly payloadError = signal<string | null>(null);

  private readonly initialSeekApplied = signal(false);
  private readonly initialSeekTimeMs = computed(() => Math.max(0, this.startTimeSec() * 1000));

  constructor() {
    afterNextRender(() => {
      void this.loadPayload();
    });

    effect(() => {
      const panel = this.filmReviewPanel();
      const reviewId = this.reviewId();

      if (!panel || !reviewId || this.openingSelection() || this.initialSeekApplied()) {
        return;
      }

      this.initialSeekApplied.set(true);
      void panel.seekToTimestampMs(this.initialSeekTimeMs());
    });
  }

  private readPayload(): FilmReviewPopoutPayload | null {
    if (!isPlatformBrowser(this.platformId)) return null;

    const sessionId = this.route.snapshot.queryParamMap.get('session')?.trim();
    if (!sessionId) return null;

    try {
      const rawPayload = window.sessionStorage.getItem(
        `${FILM_REVIEW_POPOUT_STORAGE_PREFIX}${sessionId}`
      );
      if (!rawPayload) return null;

      const parsedPayload = JSON.parse(rawPayload) as Partial<FilmReviewPopoutPayload>;
      const startTimeSec =
        typeof parsedPayload.startTimeSec === 'number' &&
        Number.isFinite(parsedPayload.startTimeSec)
          ? Math.max(0, Number(parsedPayload.startTimeSec.toFixed(2)))
          : 0;

      return {
        reviewId:
          typeof parsedPayload.reviewId === 'string' && parsedPayload.reviewId.trim().length > 0
            ? parsedPayload.reviewId.trim()
            : null,
        teamId:
          typeof parsedPayload.teamId === 'string' && parsedPayload.teamId.trim().length > 0
            ? parsedPayload.teamId.trim()
            : null,
        role:
          typeof parsedPayload.role === 'string' && parsedPayload.role.trim().length > 0
            ? parsedPayload.role.trim()
            : null,
        sport:
          typeof parsedPayload.sport === 'string' && parsedPayload.sport.trim().length > 0
            ? parsedPayload.sport.trim()
            : null,
        startTimeSec,
      };
    } catch {
      return null;
    }
  }

  private async loadPayload(): Promise<void> {
    const payload = this.readPayload();
    if (!payload?.reviewId) {
      this.payloadError.set('Open this player from Film Review again.');
      this.openingSelection.set(false);
      return;
    }

    this.reviewId.set(payload.reviewId);
    this.teamId.set(payload.teamId ?? null);
    this.role.set(payload.role ?? null);
    this.sport.set(payload.sport ?? '');
    this.startTimeSec.set(payload.startTimeSec);

    if (isPlatformBrowser(this.platformId)) {
      document.title = 'NXT1 Film Review';
    }

    try {
      await this.filmReviewService.load(payload.teamId ?? null, payload.sport ?? undefined, 200);
      this.filmReviewService.select(payload.reviewId);
      await this.filmReviewService.ensureReviewDetails(
        payload.reviewId,
        payload.teamId ?? undefined
      );
      this.filmReviewService.select(payload.reviewId);
    } catch {
      this.payloadError.set(
        'Could not load this film review. Open it again from the main Film Review panel.'
      );
    } finally {
      this.openingSelection.set(false);
    }
  }
}
