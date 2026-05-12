import type { ConceptEnhancer } from '../shared/concept.types.js';
import type { DiagramLayout, DiagramRoute, DiagramZone } from '../shared/diagram.types.js';

// ─── Zone builders ────────────────────────────────────────────────────────────

function cover2Zones(layout: DiagramLayout): DiagramZone[] {
  const { fieldWidth: w, losY } = layout;
  const topY = 56;
  const deepH = Math.max(58, Math.round((losY - topY) * 0.46));
  const hookY = Math.round(losY - 120);
  return [
    {
      id: 'c2-deep-l',
      label: 'Deep Half',
      shape: 'ellipse',
      team: 'defense',
      x: 24,
      y: topY,
      width: Math.round(w * 0.44),
      height: deepH,
    },
    {
      id: 'c2-deep-r',
      label: 'Deep Half',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.52),
      y: topY,
      width: Math.round(w * 0.44),
      height: deepH,
    },
    {
      id: 'c2-hook-l',
      label: 'Hook',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.22),
      y: hookY,
      width: Math.round(w * 0.2),
      height: 64,
    },
    {
      id: 'c2-hook-r',
      label: 'Hook',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.58),
      y: hookY,
      width: Math.round(w * 0.2),
      height: 64,
    },
    {
      id: 'c2-flat-l',
      label: 'Flat',
      shape: 'rect',
      team: 'defense',
      x: 8,
      y: Math.round(losY - 82),
      width: Math.round(w * 0.16),
      height: 62,
    },
    {
      id: 'c2-flat-r',
      label: 'Flat',
      shape: 'rect',
      team: 'defense',
      x: Math.round(w * 0.84),
      y: Math.round(losY - 82),
      width: Math.round(w * 0.16) - 8,
      height: 62,
    },
  ];
}

function cover3Zones(layout: DiagramLayout): DiagramZone[] {
  const { fieldWidth: w, losY } = layout;
  const topY = 56;
  const deepH = Math.max(58, Math.round((losY - topY) * 0.5));
  const thirdW = Math.round(w * 0.3);
  const flatY = Math.round(losY - 100);
  return [
    {
      id: 'c3-deep-l',
      label: 'Deep Third',
      shape: 'ellipse',
      team: 'defense',
      x: 8,
      y: topY,
      width: thirdW,
      height: deepH,
    },
    {
      id: 'c3-deep-m',
      label: 'Deep Third',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.35),
      y: topY,
      width: thirdW,
      height: deepH,
    },
    {
      id: 'c3-deep-r',
      label: 'Deep Third',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.68),
      y: topY,
      width: thirdW,
      height: deepH,
    },
    {
      id: 'c3-flat-l',
      label: 'Flat',
      shape: 'rect',
      team: 'defense',
      x: 8,
      y: flatY,
      width: Math.round(w * 0.18),
      height: 58,
    },
    {
      id: 'c3-flat-r',
      label: 'Flat',
      shape: 'rect',
      team: 'defense',
      x: Math.round(w * 0.82),
      y: flatY,
      width: Math.round(w * 0.18) - 8,
      height: 58,
    },
    {
      id: 'c3-hook',
      label: 'Hook/Curl',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.3),
      y: Math.round(losY - 130),
      width: Math.round(w * 0.4),
      height: 60,
    },
  ];
}

function cover4Zones(layout: DiagramLayout): DiagramZone[] {
  const { fieldWidth: w, losY } = layout;
  const topY = 56;
  const deepH = Math.max(52, Math.round((losY - topY) * 0.42));
  const quarterW = Math.round(w * 0.22);
  const underY = Math.round(losY - 100);
  return [
    {
      id: 'c4-deep-1',
      label: 'Deep ¼',
      shape: 'ellipse',
      team: 'defense',
      x: 8,
      y: topY,
      width: quarterW,
      height: deepH,
    },
    {
      id: 'c4-deep-2',
      label: 'Deep ¼',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.26),
      y: topY,
      width: quarterW,
      height: deepH,
    },
    {
      id: 'c4-deep-3',
      label: 'Deep ¼',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.52),
      y: topY,
      width: quarterW,
      height: deepH,
    },
    {
      id: 'c4-deep-4',
      label: 'Deep ¼',
      shape: 'ellipse',
      team: 'defense',
      x: Math.round(w * 0.78),
      y: topY,
      width: quarterW,
      height: deepH,
    },
    {
      id: 'c4-curl-l',
      label: 'Curl/Flat',
      shape: 'rect',
      team: 'defense',
      x: 8,
      y: underY,
      width: Math.round(w * 0.22),
      height: 52,
    },
    {
      id: 'c4-curl-r',
      label: 'Curl/Flat',
      shape: 'rect',
      team: 'defense',
      x: Math.round(w * 0.78),
      y: underY,
      width: Math.round(w * 0.22) - 8,
      height: 52,
    },
  ];
}

// ─── Route type hardeners ─────────────────────────────────────────────────────

function hardenZoneDrops(layout: DiagramLayout): DiagramLayout {
  const routes = layout.routes.map((route): DiagramRoute => {
    const player = layout.players.find((p) => p.id === route.from);
    if (!player || player.team !== 'defense') return route;
    const label = (route.label ?? '').toLowerCase();
    if (/(deep|half|third|quarter)/.test(label)) return { ...route, type: 'fade' };
    if (/(hook|curl|flat|zone|cloud|seam|middle|buzz|rob)/.test(label))
      return { ...route, type: 'space' };
    if (route.type === 'go') return { ...route, type: 'space' };
    return route;
  });
  return { ...layout, routes };
}

function hardenManPress(layout: DiagramLayout): DiagramLayout {
  const routes = layout.routes.map((route): DiagramRoute => {
    const player = layout.players.find((p) => p.id === route.from);
    if (!player || player.team !== 'defense') return route;
    const label = (route.label ?? '').toLowerCase();
    if (/(press|jam|trail|man|cover|shadow|mirror)/.test(label)) return { ...route, type: 'block' };
    return route;
  });
  return { ...layout, routes };
}

// ─── Exported concept registry for football ───────────────────────────────────

export const footballConcepts: ConceptEnhancer[] = [
  {
    id: 'football/cover-2',
    sport: 'football',
    matches: (text) => /(cover[\s-]?2|tampa[\s-]?2)/i.test(text),
    enhance: (layout) => ({ ...hardenZoneDrops(layout), zones: cover2Zones(layout) }),
  },
  {
    id: 'football/cover-3',
    sport: 'football',
    matches: (text) => /(cover[\s-]?3)/i.test(text),
    enhance: (layout) => ({ ...hardenZoneDrops(layout), zones: cover3Zones(layout) }),
  },
  {
    id: 'football/cover-4',
    sport: 'football',
    matches: (text) => /(cover[\s-]?4|quarters[\s-]?coverage)/i.test(text),
    enhance: (layout) => ({ ...hardenZoneDrops(layout), zones: cover4Zones(layout) }),
  },
  {
    id: 'football/man-coverage',
    sport: 'football',
    matches: (text) => /(man[\s-]?(coverage|to[\s-]?man|free)|press[\s-]?coverage)/i.test(text),
    enhance: hardenManPress,
  },
];
