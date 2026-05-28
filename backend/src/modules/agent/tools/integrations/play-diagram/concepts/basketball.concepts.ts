import type { ConceptEnhancer } from '../shared/concept.types.js';
import type { DiagramLayout, DiagramZone } from '../shared/diagram.types.js';

function orientZonesForTopBasket(
  layout: DiagramLayout,
  zones: readonly DiagramZone[]
): DiagramZone[] {
  return zones.map((zone) => ({
    ...zone,
    // Basketball renderer is a half-court with the basket at the top.
    // Mirror template Y positions so defensive "low" zones sit closer to the rim.
    y: Math.round(layout.fieldHeight - zone.y - zone.height),
  }));
}

function zone23Zones(layout: DiagramLayout): DiagramZone[] {
  const { fieldWidth: w, fieldHeight: h } = layout;
  return orientZonesForTopBasket(layout, [
    {
      id: 'bk-z23-wing-l',
      label: 'Wing',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.08),
      y: Math.round(h * 0.38),
      width: Math.round(w * 0.24),
      height: Math.round(h * 0.18),
    },
    {
      id: 'bk-z23-top',
      label: 'Point',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.34),
      y: Math.round(h * 0.3),
      width: Math.round(w * 0.32),
      height: Math.round(h * 0.18),
    },
    {
      id: 'bk-z23-wing-r',
      label: 'Wing',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.68),
      y: Math.round(h * 0.38),
      width: Math.round(w * 0.24),
      height: Math.round(h * 0.18),
    },
    {
      id: 'bk-z23-block-l',
      label: 'Block',
      shape: 'rect',
      team: 'defense',
      x: Math.round(w * 0.32),
      y: Math.round(h * 0.58),
      width: Math.round(w * 0.15),
      height: Math.round(h * 0.28),
    },
    {
      id: 'bk-z23-block-r',
      label: 'Block',
      shape: 'rect',
      team: 'defense',
      x: Math.round(w * 0.53),
      y: Math.round(h * 0.58),
      width: Math.round(w * 0.15),
      height: Math.round(h * 0.28),
    },
  ]);
}

function zone131Zones(layout: DiagramLayout): DiagramZone[] {
  const { fieldWidth: w, fieldHeight: h } = layout;
  return orientZonesForTopBasket(layout, [
    {
      id: 'bk-131-top',
      label: 'Point',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.36),
      y: Math.round(h * 0.26),
      width: Math.round(w * 0.28),
      height: Math.round(h * 0.16),
    },
    {
      id: 'bk-131-wing-l',
      label: 'Wing',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.06),
      y: Math.round(h * 0.44),
      width: Math.round(w * 0.2),
      height: Math.round(h * 0.2),
    },
    {
      id: 'bk-131-mid',
      label: 'Middle',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.36),
      y: Math.round(h * 0.46),
      width: Math.round(w * 0.28),
      height: Math.round(h * 0.2),
    },
    {
      id: 'bk-131-wing-r',
      label: 'Wing',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.74),
      y: Math.round(h * 0.44),
      width: Math.round(w * 0.2),
      height: Math.round(h * 0.2),
    },
    {
      id: 'bk-131-base',
      label: 'Baseline',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.32),
      y: Math.round(h * 0.72),
      width: Math.round(w * 0.36),
      height: Math.round(h * 0.14),
    },
  ]);
}

export const basketballConcepts: ConceptEnhancer[] = [
  {
    id: 'basketball/zone-2-3',
    sport: 'basketball',
    matches: (text) => /(2[\s-]?3\s+zone|zone[\s-]?2[\s-]?3|2[\s-]3\s+defense)/i.test(text),
    enhance: (layout): DiagramLayout => ({ ...layout, zones: zone23Zones(layout) }),
  },
  {
    id: 'basketball/zone-1-3-1',
    sport: 'basketball',
    matches: (text) => /(1[\s-]?3[\s-]?1\s+zone|zone[\s-]?1[\s-]?3[\s-]?1)/i.test(text),
    enhance: (layout): DiagramLayout => ({ ...layout, zones: zone131Zones(layout) }),
  },
];
