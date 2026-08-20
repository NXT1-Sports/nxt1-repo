export type NormalizedSport = 'football' | 'basketball' | 'soccer' | 'baseball' | 'softball';

export type DiagramRouteType =
  'screen' | 'pick' | 'block' | 'cut' | 'drag' | 'space' | 'go' | 'fade';

export type DiagramZoneShape = 'ellipse' | 'rect' | 'text';

export type DiagramPlayerShape = 'circle' | 'square' | 'diamond' | 'triangle';

export type DiagramFieldStyle = 'classic' | 'modern' | 'night' | 'blueprint' | 'chalk';

export interface DiagramZone {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: DiagramZoneShape;
  team?: 'offense' | 'defense';
}

export interface DiagramPlayer {
  id: string;
  label: string;
  x: number;
  y: number;
  team: 'offense' | 'defense';
  shape?: DiagramPlayerShape;
}

export interface DiagramRoute {
  id?: string;
  from: string;
  points: Array<[number, number]>;
  label?: string;
  type?: DiagramRouteType;
  curve?: boolean;
  color?: string; // Optional hex color (e.g., '#00ff00' for green). If omitted, defaults based on route type.
  strokeDasharray?: string; // Optional stroke dasharray pattern for the route (e.g., '6,4' for dashed lines).
  /**
   * Optional opacity for the route (e.g., 0.7 for 70% visibility).
   */
  opacity?: number;
}

export interface DiagramLayout {
  sport: NormalizedSport;
  title: string;
  fieldWidth: number;
  fieldHeight: number;
  losY: number;
  fieldStyle?: DiagramFieldStyle;
  players: DiagramPlayer[];
  routes: DiagramRoute[];
  zones?: DiagramZone[];
}

export interface SportRenderer {
  readonly sport: NormalizedSport;
  readonly defaultLosY: number;
  renderField(layout: DiagramLayout): string;
}

export interface SportPrompt {
  readonly systemSection: string;
  readonly exampleJson: string;
}
