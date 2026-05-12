import type { ConceptEnhancer } from '../shared/concept.types.js';
import type { DiagramLayout, DiagramZone } from '../shared/diagram.types.js';

function shiftZones(layout: DiagramLayout): DiagramZone[] {
  const { fieldWidth: w, fieldHeight: h } = layout;
  return [
    {
      id: 'bb-shift',
      label: 'Shift',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.52),
      y: Math.round(h * 0.25),
      width: Math.round(w * 0.4),
      height: Math.round(h * 0.3),
    },
  ];
}

function buntCoverageZones(layout: DiagramLayout): DiagramZone[] {
  const { fieldWidth: w, fieldHeight: h } = layout;
  const nearY = Math.round(h * 0.58);
  return [
    {
      id: 'bb-bunt-l',
      label: '3B Crash',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.08),
      y: nearY,
      width: Math.round(w * 0.24),
      height: 54,
    },
    {
      id: 'bb-bunt-r',
      label: '1B Crash',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.68),
      y: nearY,
      width: Math.round(w * 0.24),
      height: 54,
    },
  ];
}

export const baseballConcepts: ConceptEnhancer[] = [
  {
    id: 'baseball/infield-shift',
    sport: 'baseball',
    matches: (text) =>
      /(infield[\s-]shift|ted[\s-]?williams\s+shift|over[\s-]?shift|defensive\s+shift)/i.test(text),
    enhance: (layout): DiagramLayout => ({ ...layout, zones: shiftZones(layout) }),
  },
  {
    id: 'baseball/bunt-coverage',
    sport: 'baseball',
    matches: (text) => /(bunt[\s-]coverage|squeeze\s+(play|bunt)|defend.*bunt)/i.test(text),
    enhance: (layout): DiagramLayout => ({ ...layout, zones: buntCoverageZones(layout) }),
  },
  {
    id: 'softball/infield-shift',
    sport: 'softball',
    matches: (text) => /(infield[\s-]shift|over[\s-]?shift|defensive\s+shift)/i.test(text),
    enhance: (layout): DiagramLayout => ({ ...layout, zones: shiftZones(layout) }),
  },
  {
    id: 'softball/bunt-coverage',
    sport: 'softball',
    matches: (text) => /(bunt[\s-]coverage|squeeze\s+(play|bunt)|defend.*bunt)/i.test(text),
    enhance: (layout): DiagramLayout => ({ ...layout, zones: buntCoverageZones(layout) }),
  },
];
