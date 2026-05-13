import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NxtIconComponent } from '../../..//components/icon/icon.component';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';

interface GamePlanSummary {
  readonly id: string;
  readonly teamId: string;
  readonly sport: string;
  readonly title: string;
  readonly phase: string;
  readonly status: string;
  readonly gameDate?: string;
  readonly opponentName?: string;
  readonly updatedAt: string;
}

interface GameplansResponse {
  readonly success: boolean;
  readonly data?: {
    readonly gamePlans: readonly GamePlanSummary[];
    readonly count: number;
  };
  readonly error?: string;
}

@Component({
  selector: 'nxt1-agent-x-gameplans-panel',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <section class="gameplans-panel" aria-label="Saved game plans">
      <header class="gameplans-panel__header">
        <h4>Saved Game Plans</h4>
        <button type="button" class="refresh" (click)="reload()" [disabled]="loading()">
          <nxt1-icon name="refresh" [size]="14"></nxt1-icon>
          <span>Refresh</span>
        </button>
      </header>

      @if (loading()) {
        <div class="state">Loading saved plans...</div>
      } @else if (error()) {
        <div class="state state--error">{{ error() }}</div>
      } @else if (plans().length === 0) {
        <div class="state">No saved game plans yet.</div>
      } @else {
        <div class="list" role="list">
          @for (plan of plans(); track plan.id) {
            <article class="item" role="listitem">
              <div class="item__head">
                <h5>{{ plan.title }}</h5>
                <span class="pill">{{ plan.status }}</span>
              </div>
              <p class="meta">
                {{ plan.sport | titlecase }} · {{ plan.phase | titlecase }}
                @if (plan.opponentName) {
                  · vs {{ plan.opponentName }}
                }
              </p>
              <p class="meta">Updated {{ formatDate(plan.updatedAt) }}</p>
              <button type="button" class="chat-link" (click)="onRevise(plan)">
                Revise in chat
              </button>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .gameplans-panel {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid color-mix(in srgb, var(--ax-shell-border, #d5dae6) 55%, transparent);
      }
      .gameplans-panel__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }
      .gameplans-panel__header h4 {
        margin: 0;
        font-size: 0.86rem;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--ax-shell-text, #122033) 78%, #fff);
      }
      .refresh {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid color-mix(in srgb, var(--ax-shell-border, #d5dae6) 70%, transparent);
        border-radius: 999px;
        padding: 5px 10px;
        background: #fff;
        font-size: 0.74rem;
        cursor: pointer;
      }
      .state {
        border: 1px dashed color-mix(in srgb, var(--ax-shell-border, #d5dae6) 70%, transparent);
        border-radius: 10px;
        padding: 10px;
        font-size: 0.8rem;
        color: color-mix(in srgb, var(--ax-shell-text, #122033) 72%, #fff);
      }
      .state--error {
        border-color: color-mix(in srgb, #d43b2f 60%, transparent);
        color: #9f1f15;
      }
      .list {
        display: grid;
        gap: 8px;
      }
      .item {
        border: 1px solid color-mix(in srgb, var(--ax-shell-border, #d5dae6) 70%, transparent);
        border-radius: 12px;
        padding: 10px;
        background: color-mix(in srgb, #fff 94%, #f5f7fc);
      }
      .item__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      .item__head h5 {
        margin: 0;
        font-size: 0.82rem;
        line-height: 1.3;
      }
      .pill {
        font-size: 0.66rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 3px 7px;
        border-radius: 999px;
        background: color-mix(in srgb, #11385f 14%, #fff);
      }
      .meta {
        margin: 4px 0 0;
        font-size: 0.72rem;
        color: color-mix(in srgb, var(--ax-shell-text, #122033) 68%, #fff);
      }
      .chat-link {
        margin-top: 8px;
        border: none;
        background: none;
        padding: 0;
        font-size: 0.72rem;
        font-weight: 600;
        cursor: pointer;
        color: #0d4d8b;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXGameplansPanelComponent {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;

  private readonly _loading = signal(true);
  private readonly _error = signal<string | null>(null);
  private readonly _plans = signal<readonly GamePlanSummary[]>([]);

  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly plans = computed(() => this._plans());

  @Output() readonly reviseInChat = new EventEmitter<string>();

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.get<GameplansResponse>(`${this.baseUrl}/gameplans?limit=12`)
      );

      if (!response.success) {
        this._plans.set([]);
        this._error.set(response.error ?? 'Unable to load game plans');
        return;
      }

      this._plans.set(response.data?.gamePlans ?? []);
    } catch {
      this._plans.set([]);
      this._error.set('Unable to load game plans right now');
    } finally {
      this._loading.set(false);
    }
  }

  onRevise(plan: GamePlanSummary): void {
    this.reviseInChat.emit(
      `Revise game plan ${plan.id} (${plan.title}) and keep the same opponent/sport context.`
    );
  }

  formatDate(value: string): string {
    const time = Date.parse(value);
    if (Number.isNaN(time)) return value;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(time));
  }
}
