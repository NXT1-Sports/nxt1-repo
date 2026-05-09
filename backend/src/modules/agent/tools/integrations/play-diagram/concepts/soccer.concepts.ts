import type { ConceptEnhancer } from '../shared/concept.types.js';
import type { DiagramLayout, DiagramZone } from '../shared/diagram.types.js';

function highPressZones(layout: DiagramLayout): DiagramZone[] {
  const { fieldWidth: w, fieldHeight: h } = layout;
  const zoneH = Math.round(h * 0.22);
  const topY = Math.round(h * 0.08);
  const thirdW = Math.round(w * 0.3);
  return [
    {
      id: 'sc-press-l',
      label: 'Press',
      shape: 'rect',
      team: 'defense',
      x: 8,
      y: topY,
      width: thirdW,
      height: zoneH,
    },
    {
      id: 'sc-press-m',
      label: 'Press',
      shape: 'rect',
      team: 'defense',
      x: Math.round(w * 0.35),
      y: topY,
      width: thirdW,
      height: zoneH,
    },
    {
      id: 'sc-press-r',
      label: 'Press',
      shape: 'rect',
      team: 'defense',
      x: Math.round(w * 0.7),
      y: topY,
      width: Math.round(w * 0.3) - 8,
      height: zoneH,
    },
  ];
}

function lowBlockZones(layout: DiagramLayout): DiagramZone[] {
  const { fieldWidth: w, fieldHeight: h } = layout;
  return [
    {
      id: 'sc-block',
      label: 'Compact Block',
      shape: 'rect',
      team: 'defense',
      x: Math.round(w * 0.12),
      y: Math.round(h * 0.62),
      width: Math.round(w * 0.76),
      height: Math.round(h * 0.22),
    },
  ];
}

export const soccerConcepts: ConceptEnhancer[] = [
  {
    id: 'soccer/high-press',
    sport: 'soccer',
    matches: (text) => /(high[\s-]press|gegenpressing|press\s+high|full[\s-]press)/i.test(text),
    enhance: (layout): DiagramLayout => ({ ...layout, zones: highPressZones(layout) }),
  },
  {
    id: 'soccer/low-block',
    sport: 'soccer',
    matches: (text) => /(low[\s-]block|park.*bus|defend\s+deep|5[\s-]?4[\s-]?1|bunker)/i.test(text),
    enhance: (layout): DiagramLayout => ({ ...layout, zones: lowBlockZones(layout) }),
  },
];
