import { Injectable, computed, inject, signal, type Signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createDiagramAssetApi,
  type DiagramAssetDetail,
  type DiagramAssetKind,
  type DiagramAssetSummary,
  type UpdateDiagramAssetRequest,
} from '@nxt1/core/ai';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES } from '@nxt1/core/performance';
import type { AnalyticsAdapter } from '@nxt1/core/analytics';
import type { PerformanceAdapter } from '@nxt1/core/performance';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { PERFORMANCE_ADAPTER } from '../../services/performance';
import { AGENT_X_API_BASE_URL } from './agent-x-job.service';

export interface DiagramAssetLoadRequest {
  readonly sport?: string | null;
  readonly kind?: DiagramAssetKind | 'all' | null;
  readonly limit?: number;
}

@Injectable({ providedIn: 'root' })
export class AgentXDiagramService {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(NxtLoggingService).child('AgentXDiagramService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, {
    optional: true,
  }) as AnalyticsAdapter | null;
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PERFORMANCE_ADAPTER, {
    optional: true,
  }) as PerformanceAdapter | null;
  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;

  private readonly api = createDiagramAssetApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    this.baseUrl
  );

  private readonly _diagrams = signal<readonly DiagramAssetSummary[]>([]);
  private readonly _details = signal<Readonly<Record<string, DiagramAssetDetail>>>({});
  private readonly _selectedId = signal<string | null>(null);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly diagrams: Signal<readonly DiagramAssetSummary[]> = computed(() => this._diagrams());
  readonly selectedId = computed(() => this._selectedId());
  readonly loading = computed(() => this._loading());
  readonly saving = computed(() => this._saving());
  readonly error = computed(() => this._error());
  readonly isEmpty = computed(() => this._diagrams().length === 0);
  readonly selectedDiagram: Signal<DiagramAssetDetail | DiagramAssetSummary | null> = computed(
    () => {
      const selectedId = this._selectedId();
      if (!selectedId) return null;
      return (
        this._details()[selectedId] ??
        this._diagrams().find((diagram) => diagram.id === selectedId) ??
        null
      );
    }
  );

  private applyDetail(id: string, detail: DiagramAssetDetail): void {
    this._details.update((details) => ({ ...details, [id]: detail }));
    this._diagrams.update((diagrams) =>
      diagrams.map((diagram) => (diagram.id === id ? { ...diagram, ...detail } : diagram))
    );
  }

  private async fetchDetail(id: string): Promise<DiagramAssetDetail> {
    return (
      (await this.performance?.trace(
        TRACE_NAMES.DIAGRAM_ASSET_DETAIL,
        () => this.api.getDiagram(id),
        {
          attributes: { diagram_id: id },
        }
      )) ?? (await this.api.getDiagram(id))
    );
  }

  async load(request: DiagramAssetLoadRequest = {}): Promise<void> {
    this._loading.set(true);
    this._error.set(null);

    this.logger.info('Loading diagram assets', {
      sport: request.sport ?? null,
      kind: request.kind ?? 'all',
      limit: request.limit ?? 50,
    });
    this.breadcrumb.trackStateChange('diagrams_lab_loading', {
      sport: request.sport ?? null,
      kind: request.kind ?? 'all',
    });

    try {
      const diagrams =
        (await this.performance?.trace(
          TRACE_NAMES.DIAGRAM_ASSET_LIST,
          () => this.api.listDiagrams({ ...request, limit: request.limit ?? 50 }),
          {
            attributes: {
              sport: request.sport ?? 'all',
              kind: request.kind ?? 'all',
            },
          }
        )) ?? (await this.api.listDiagrams({ ...request, limit: request.limit ?? 50 }));

      this._diagrams.set(diagrams);
      this._details.update((details) => {
        const next: Record<string, DiagramAssetDetail> = {};
        for (const diagram of diagrams) {
          const detail = details[diagram.id];
          if (detail) next[diagram.id] = detail;
        }
        return next;
      });

      if (!this._selectedId() || !diagrams.some((diagram) => diagram.id === this._selectedId())) {
        this._selectedId.set(diagrams[0]?.id ?? null);
      }

      const selectedId = this._selectedId();
      if (selectedId && !this._details()[selectedId]) {
        try {
          const detail = await this.fetchDetail(selectedId);
          this.applyDetail(selectedId, detail);
        } catch (err) {
          this.logger.error('Failed to preload selected diagram detail', err, {
            diagramId: selectedId,
          });
        }
      }

      this.analytics?.trackEvent(APP_EVENTS.DIAGRAM_ASSET_LIST_LOADED, {
        count: diagrams.length,
        sport: request.sport ?? null,
        kind: request.kind ?? 'all',
      });
      this.logger.info('Diagram assets loaded', { count: diagrams.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load diagrams';
      this._error.set(message);
      this.logger.error('Failed to load diagram assets', err, {
        sport: request.sport ?? null,
        kind: request.kind ?? 'all',
      });
    } finally {
      this._loading.set(false);
    }
  }

  async select(id: string): Promise<void> {
    this._selectedId.set(id);
    this._error.set(null);

    const existing = this._details()[id] ?? this._diagrams().find((diagram) => diagram.id === id);
    this.analytics?.trackEvent(APP_EVENTS.DIAGRAM_ASSET_OPENED, {
      diagram_id: id,
      kind: existing?.kind ?? null,
      sport: existing?.sport ?? null,
    });
    this.breadcrumb.trackStateChange('diagrams_lab_selected', {
      diagramId: id,
      kind: existing?.kind ?? null,
    });

    if (this._details()[id]) return;

    try {
      const detail = await this.fetchDetail(id);
      this.applyDetail(id, detail);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load diagram';
      this._error.set(message);
      this.logger.error('Failed to load diagram detail', err, { diagramId: id });
    }
  }

  async update(id: string, request: UpdateDiagramAssetRequest): Promise<DiagramAssetDetail> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const updated =
        (await this.performance?.trace(
          TRACE_NAMES.DIAGRAM_ASSET_UPDATE,
          () => this.api.updateDiagram(id, request),
          { attributes: { diagram_id: id } }
        )) ?? (await this.api.updateDiagram(id, request));

      this._diagrams.update((diagrams) =>
        diagrams.map((diagram) => (diagram.id === id ? { ...diagram, ...updated } : diagram))
      );
      this._details.update((details) => ({ ...details, [id]: updated }));

      this.analytics?.trackEvent(APP_EVENTS.DIAGRAM_ASSET_UPDATED, {
        diagram_id: id,
        kind: updated.kind,
        sport: updated.sport,
      });
      this.logger.info('Diagram asset updated', { diagramId: id });
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update diagram';
      this._error.set(message);
      this.logger.error('Failed to update diagram asset', err, { diagramId: id });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  async delete(id: string): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    const previous = this._diagrams();
    const previousDetails = this._details();
    const removed = previous.find((diagram) => diagram.id === id) ?? previousDetails[id] ?? null;

    this._diagrams.update((diagrams) => diagrams.filter((diagram) => diagram.id !== id));
    this._details.update((details) => {
      const next = { ...details };
      delete next[id];
      return next;
    });

    if (this._selectedId() === id) {
      const nextSelection = this._diagrams()[0]?.id ?? null;
      this._selectedId.set(nextSelection);
    }

    try {
      await (this.performance?.trace(
        TRACE_NAMES.DIAGRAM_ASSET_DELETE,
        () => this.api.deleteDiagram(id),
        {
          attributes: { diagram_id: id },
        }
      ) ?? this.api.deleteDiagram(id));

      this.analytics?.trackEvent(APP_EVENTS.DIAGRAM_ASSET_DELETED, {
        diagram_id: id,
        kind: removed?.kind ?? null,
        sport: removed?.sport ?? null,
      });
      this.logger.info('Diagram asset deleted', { diagramId: id });
    } catch (err) {
      this._diagrams.set(previous);
      this._details.set(previousDetails);
      if (!this._selectedId() && previous.some((diagram) => diagram.id === id)) {
        this._selectedId.set(id);
      }

      const message = err instanceof Error ? err.message : 'Failed to delete diagram';
      this._error.set(message);
      this.logger.error('Failed to delete diagram asset', err, { diagramId: id });
      throw err;
    } finally {
      this._saving.set(false);
    }
  }
}
