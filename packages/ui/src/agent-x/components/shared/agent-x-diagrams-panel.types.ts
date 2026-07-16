import type { DiagramAssetKind, DiagramFieldStyle, DiagramRouteType } from '@nxt1/core/ai';

export type DiagramKindFilter = 'all' | DiagramAssetKind;

export interface DiagramPanelFilters {
  readonly query: string;
  readonly kind: DiagramKindFilter;
}

export const EMPTY_DIAGRAM_FILTERS: DiagramPanelFilters = {
  query: '',
  kind: 'all',
} as const;

export type DiagramBuilderTool = 'select' | 'route' | 'zone';

export type DiagramDefensiveShell = 'cover2' | 'cover3' | 'quarters';

export type DiagramBuilderEntityType = 'player' | 'route' | 'zone';

export interface DiagramBuilderSelection {
  readonly type: DiagramBuilderEntityType;
  readonly id: string;
}

export interface DiagramFieldStyleOption {
  readonly id: DiagramFieldStyle;
  readonly label: string;
}

export interface DiagramRouteTypeOption {
  readonly id: DiagramRouteType;
  readonly label: string;
  readonly color: string;
}

export interface DiagramDefensiveShellOption {
  readonly id: DiagramDefensiveShell;
  readonly label: string;
}

export const DIAGRAM_FIELD_STYLE_OPTIONS: readonly DiagramFieldStyleOption[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'modern', label: 'Modern' },
  { id: 'night', label: 'Night' },
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'chalk', label: 'Chalk' },
] as const;

export const DIAGRAM_ROUTE_TYPE_OPTIONS: readonly DiagramRouteTypeOption[] = [
  { id: 'go', label: 'Go', color: '#f7b500' },
  { id: 'cut', label: 'Cut', color: '#ff6f00' },
  { id: 'block', label: 'Block', color: '#444444' },
  { id: 'screen', label: 'Screen', color: '#00b7ff' },
  { id: 'space', label: 'Space', color: '#4caf50' },
] as const;

export const DIAGRAM_DEFENSIVE_SHELL_OPTIONS: readonly DiagramDefensiveShellOption[] = [
  { id: 'cover2', label: 'Cover 2' },
  { id: 'cover3', label: 'Cover 3' },
  { id: 'quarters', label: 'Quarters' },
] as const;
