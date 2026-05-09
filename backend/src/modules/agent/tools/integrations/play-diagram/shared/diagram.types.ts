export type NormalizedSport = 'football' | 'basketball' | 'soccer' | 'baseball' | 'softball';

export type DiagramRouteType =
  | 'screen'
  | 'pick'
  | 'block'
  | 'cut'
  | 'drag'
  | 'space'
  | 'go'
  | 'fade';

export type DiagramZoneShape = 'ellipse' | 'rect';

export type DiagramPlayerShape = 'circle' | 'square' | 'diamond';

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
  from: string;
  points: Array<[number, number]>;
  label?: string;
  type?: DiagramRouteType;
  curve?: boolean;
}

export interface DiagramLayout {
  sport: NormalizedSport;
  title: string;
  fieldWidth: number;
  fieldHeight: number;
  losY: number;
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
