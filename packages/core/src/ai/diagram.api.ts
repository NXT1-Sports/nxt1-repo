/**
 * @fileoverview Agent X Diagram Assets API Factory
 * @module @nxt1/core/ai/diagram.api
 *
 * 100% portable pure TypeScript API factory for Agent X diagram assets.
 */

import type { HttpAdapter } from '../api/http-adapter.js';

interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

export type DiagramAssetKind = 'sport_play' | 'sport_drill';

export type DiagramFieldStyle = 'classic' | 'modern' | 'night' | 'blueprint' | 'chalk';

export type DiagramRouteType =
  | 'screen'
  | 'pick'
  | 'block'
  | 'cut'
  | 'drag'
  | 'space'
  | 'go'
  | 'fade';

export type DiagramZoneShape = 'ellipse' | 'rect' | 'text';

export type DiagramPlayerShape = 'circle' | 'square' | 'diamond' | 'triangle';

export interface DiagramZone {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly shape?: DiagramZoneShape;
  readonly team?: 'offense' | 'defense';
}

export interface DiagramPlayer {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly team: 'offense' | 'defense';
  readonly shape?: DiagramPlayerShape;
}

export interface DiagramRoute {
  readonly id?: string;
  readonly from: string;
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly label?: string;
  readonly type?: DiagramRouteType;
  readonly curve?: boolean;
  readonly color?: string;
  readonly strokeDasharray?: string;
  readonly opacity?: number;
}

export interface DiagramLayout {
  readonly sport: string;
  readonly title: string;
  readonly fieldWidth: number;
  readonly fieldHeight: number;
  readonly losY: number;
  readonly fieldStyle?: DiagramFieldStyle;
  readonly players: ReadonlyArray<DiagramPlayer>;
  readonly routes: ReadonlyArray<DiagramRoute>;
  readonly zones?: ReadonlyArray<DiagramZone>;
}

export interface DiagramAssetBase {
  readonly id: string;
  readonly kind: DiagramAssetKind;
  readonly sport: string;
  readonly title: string;
  readonly description: string;
  readonly imageUrl: string;
  readonly storagePath?: string;
  readonly svgUrl?: string;
  readonly svgStoragePath?: string;
  readonly editUrl?: string;
  readonly threadId?: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type DiagramAssetSummary = DiagramAssetBase;

export interface DiagramAssetDetail extends DiagramAssetBase {
  readonly svgContent?: string;
  readonly xmlContent?: string;
  readonly sourceLayout?: DiagramLayout;
}

export interface ListDiagramAssetsRequest {
  readonly sport?: string | null;
  readonly kind?: DiagramAssetKind | 'all' | null;
  readonly limit?: number;
}

export interface ListDiagramAssetsResponse {
  readonly diagrams: readonly DiagramAssetSummary[];
  readonly count: number;
}

export interface GetDiagramAssetResponse {
  readonly diagram: DiagramAssetDetail;
}

export interface UpdateDiagramAssetRequest {
  readonly title?: string;
  readonly description?: string;
  readonly sourceLayout?: DiagramLayout;
}

export interface UpdateDiagramAssetResponse {
  readonly diagram: DiagramAssetDetail;
}

export interface DeleteDiagramAssetResponse {
  readonly id: string;
  readonly deleted: boolean;
}

function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

export function createDiagramAssetApi(http: HttpAdapter, baseUrl: string) {
  const endpoint = `${baseUrl}/diagram-assets`;

  return {
    async listDiagrams(
      request: ListDiagramAssetsRequest = {}
    ): Promise<readonly DiagramAssetSummary[]> {
      const response = await http.get<ApiResponse<ListDiagramAssetsResponse>>(
        `${endpoint}${buildQuery({
          sport: request.sport,
          kind: request.kind && request.kind !== 'all' ? request.kind : null,
          limit: request.limit,
        })}`
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load diagrams');
      }

      return response.data.diagrams;
    },

    async getDiagram(id: string): Promise<DiagramAssetDetail> {
      const response = await http.get<ApiResponse<GetDiagramAssetResponse>>(`${endpoint}/${id}`);

      if (!response.success || !response.data?.diagram) {
        throw new Error(response.error ?? 'Failed to load diagram');
      }

      return response.data.diagram;
    },

    async updateDiagram(
      id: string,
      request: UpdateDiagramAssetRequest
    ): Promise<DiagramAssetDetail> {
      const response = await http.patch<ApiResponse<UpdateDiagramAssetResponse>>(
        `${endpoint}/${id}`,
        request
      );

      if (!response.success || !response.data?.diagram) {
        throw new Error(response.error ?? 'Failed to update diagram');
      }

      return response.data.diagram;
    },

    async deleteDiagram(id: string): Promise<void> {
      const response = await http.delete<ApiResponse<DeleteDiagramAssetResponse>>(
        `${endpoint}/${id}`
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to delete diagram');
      }
    },
  } as const;
}

export type DiagramAssetApi = ReturnType<typeof createDiagramAssetApi>;
