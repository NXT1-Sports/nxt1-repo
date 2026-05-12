import { C } from './svg-colors.js';
import type {
  DiagramLayout,
  DiagramPlayer,
  DiagramPlayerShape,
  DiagramRoute,
  DiagramRouteType,
  DiagramZone,
} from './diagram.types.js';

const PLAYER_RADIUS = 13;
const LEGEND_HEIGHT = 24;

// ─── XML utilities ────────────────────────────────────────────────────────────

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** @deprecated Use renderRoutes (path-based). Kept for external callers. */
export function toPoints(pts: Array<[number, number]>): string {
  return pts.map(([x, y]) => `${x},${y}`).join(' ');
}

// ─── Bézier path helpers ──────────────────────────────────────────────────────

/** Format a number to 1 decimal place, stripping needless `.0`. */
function f(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

/**
 * Convert waypoints to an SVG path string.
 *
 * When `smooth` is true and there are 3+ points, applies a Catmull-Rom →
 * Cubic Bézier conversion (tension = 1/3) to produce natural curves through
 * every waypoint.  2-point routes and block-type routes use straight `L`
 * segments to preserve intentionally linear movement.
 */
function pointsToPath(points: ReadonlyArray<[number, number]>, smooth: boolean): string {
  const n = points.length;
  if (n < 2) return '';

  if (!smooth || n === 2) {
    return points.map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`)).join(' ');
  }

  // Catmull-Rom → Cubic Bézier  (tension 1/3 gives tight, natural curves)
  const t = 1 / 3;
  let d = `M ${points[0][0]},${points[0][1]}`;

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];

    const cp1x = p1[0] + (p2[0] - p0[0]) * t;
    const cp1y = p1[1] + (p2[1] - p0[1]) * t;
    const cp2x = p2[0] - (p3[0] - p1[0]) * t;
    const cp2y = p2[1] - (p3[1] - p1[1]) * t;

    d += ` C ${f(cp1x)},${f(cp1y)} ${f(cp2x)},${f(cp2y)} ${p2[0]},${p2[1]}`;
  }

  return d;
}

// ─── SVG defs ─────────────────────────────────────────────────────────────────

export function renderDefs(): string {
  return `<defs>
  <!-- Standard arrow for go/default routes -->
  <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
    <path d="M0,0 L7,3.5 L0,7 L1.5,3.5 z" fill="${C.route}"/>
  </marker>
  <!-- Block/thick marker -->
  <marker id="arr-block" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
    <rect x="0" y="1" width="10" height="8" fill="${C.route}"/>
  </marker>
  <!-- Screen box marker -->
  <marker id="arr-screen" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
    <rect x="0" y="0" width="12" height="12" fill="none" stroke="${C.route}" stroke-width="1.5"/>
  </marker>
  <!-- Pick arc marker -->
  <marker id="arr-pick" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
    <circle cx="4" cy="4" r="4" fill="none" stroke="${C.route}" stroke-width="1.5"/>
  </marker>
  <!-- Cut angle marker -->
  <marker id="arr-cut" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
    <path d="M0,0 L8,4 L0,8 Z" fill="${C.route}"/>
  </marker>
  <!-- Drag curved -->
  <marker id="arr-drag" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto" markerUnits="strokeWidth">
    <path d="M0,0 Q3,3 6,3 L4,3 L5,5 L3,2" fill="${C.route}"/>
  </marker>
  <!-- Space/dashed -->
  <marker id="arr-space" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto" markerUnits="strokeWidth">
    <circle cx="3" cy="3" r="1.5" fill="${C.route}"/>
  </marker>
  <!-- Fade diminishing -->
  <marker id="arr-fade" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto" markerUnits="strokeWidth">
    <path d="M0,3 L4,1 L5,3 L4,5 Z" fill="${C.route}" opacity="0.6"/>
  </marker>
  <filter id="ps" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="1" dy="1" stdDeviation="1.8" flood-color="${C.shadow}"/>
  </filter>
</defs>`;
}

function getRouteMarkerAndStyle(type?: DiagramRouteType): {
  marker: string;
  strokeWidth: string;
  strokeDasharray?: string;
  opacity: string;
} {
  switch (type) {
    case 'screen':
      return { marker: 'url(#arr-screen)', strokeWidth: '3', opacity: '0.95' };
    case 'pick':
      return { marker: 'url(#arr-pick)', strokeWidth: '2.8', opacity: '0.93' };
    case 'block':
      return { marker: 'url(#arr-block)', strokeWidth: '4', opacity: '0.98' };
    case 'cut':
      return { marker: 'url(#arr-cut)', strokeWidth: '2.5', opacity: '0.92' };
    case 'drag':
      return {
        marker: 'url(#arr-drag)',
        strokeWidth: '2.2',
        strokeDasharray: '4,2',
        opacity: '0.85',
      };
    case 'space':
      return {
        marker: 'url(#arr-space)',
        strokeWidth: '1.8',
        strokeDasharray: '3,3',
        opacity: '0.7',
      };
    case 'fade':
      return { marker: 'url(#arr-fade)', strokeWidth: '2', opacity: '0.6' };
    case 'go':
    default:
      return { marker: 'url(#arr)', strokeWidth: '2.5', opacity: '0.92' };
  }
}

// ─── Zone overlays ────────────────────────────────────────────────────────────

export function renderZones(zones: DiagramZone[] = []): string {
  if (zones.length === 0) return '';

  const parts: string[] = ['<g class="zone-overlays">'];

  for (const zone of zones) {
    const shape = zone.shape ?? 'ellipse';
    const cx = zone.x + zone.width / 2;
    const cy = zone.y + zone.height / 2;

    if (shape === 'rect') {
      parts.push(
        `<rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}" rx="8" ry="8" fill="${C.zoneFill}" stroke="${C.zoneStroke}" stroke-width="1.2" stroke-dasharray="5,3"/>`
      );
    } else {
      parts.push(
        `<ellipse cx="${cx}" cy="${cy}" rx="${Math.max(4, zone.width / 2)}" ry="${Math.max(4, zone.height / 2)}" fill="${C.zoneFill}" stroke="${C.zoneStroke}" stroke-width="1.2" stroke-dasharray="5,3"/>`
      );
    }

    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="${C.zoneLabel}" font-size="9" font-family="Arial,sans-serif" font-weight="700">${escapeXml(zone.label)}</text>`
    );
  }

  parts.push('</g>');
  return parts.join('\n');
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function renderRoutes(routes: DiagramRoute[]): string {
  const parts: string[] = [];
  const labelAnchors: Array<[number, number]> = [];

  for (const route of routes) {
    if (route.points.length < 2) continue;

    const { marker, strokeWidth, strokeDasharray, opacity } = getRouteMarkerAndStyle(route.type);
    const dasharray = strokeDasharray ? ` stroke-dasharray="${strokeDasharray}"` : '';
    // Straight segments for blocks (always) or when caller explicitly opts out.
    // Everything else gets smooth Catmull-Rom curves for 3+ waypoint routes.
    const smooth = route.type !== 'block' && route.curve !== false;
    const pathD = pointsToPath(route.points, smooth);

    parts.push(
      `<path d="${pathD}" fill="none" stroke="${C.route}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" marker-end="${marker}"${dasharray} opacity="${opacity}"/>`
    );

    if (!route.label) continue;

    // Place label perpendicular to the mid-segment, using waypoint coordinates
    // (close enough to the visible curve for all practical purposes).
    const midIdx = Math.max(1, Math.floor(route.points.length / 2));
    const [mx, my] = route.points[midIdx];
    const [px, py] = route.points[Math.max(0, midIdx - 1)];

    const dx = mx - px;
    const dy = my - py;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const tx = dx / len;
    const ty = dy / len;

    let lx = mx + nx * 16;
    let ly = my + ny * 16;

    for (let i = 0; i < 6; i += 1) {
      const overlaps = labelAnchors.some(([ax, ay]) => {
        const ddx = lx - ax;
        const ddy = ly - ay;
        return Math.sqrt(ddx * ddx + ddy * ddy) < 26;
      });
      if (!overlaps) break;

      const direction = i % 2 === 0 ? 1 : -1;
      const step = 14 + i * 4;
      lx = mx + nx * (16 + step) + tx * direction * 8;
      ly = my + ny * (16 + step) + ty * direction * 8;
    }

    labelAnchors.push([lx, ly]);

    parts.push(
      `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" ` +
        `fill="${C.routeLabel}" font-size="10" font-family="Arial,sans-serif" font-weight="700" ` +
        `stroke="white" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${escapeXml(route.label)}</text>`
    );
  }

  return parts.join('\n');
}

// ─── Players ──────────────────────────────────────────────────────────────────

/**
 * Infers the best marker shape from a position abbreviation when the LLM does
 * not supply one explicitly.
 *
 * - square  → offensive/defensive linemen (immovable, physical)
 * - diamond → safeties + specialists (deep field, wide range)
 * - circle  → all other skill positions (default)
 */
function inferPlayerShape(label: string): DiagramPlayerShape {
  const pos = label.toUpperCase();
  if (/^(LT|LG|C|RG|RT|OL|OG|OT|DT|DL|DE|NT|NG|G|T)$/.test(pos)) return 'square';
  if (/^(FS|SS|K|P|PK|LS)$/.test(pos)) return 'diamond';
  return 'circle';
}

export function renderPlayers(players: DiagramPlayer[]): string {
  const parts: string[] = [];

  for (const p of players) {
    const isOffense = p.team === 'offense';
    const fill = isOffense ? C.offFill : C.defFill;
    const stroke = isOffense ? C.offStroke : C.defStroke;
    const text = isOffense ? C.offText : C.defText;
    const shape = p.shape ?? inferPlayerShape(p.label);

    if (shape === 'square') {
      const s = +(PLAYER_RADIUS * 1.72).toFixed(1);
      const half = +(s / 2).toFixed(1);
      parts.push(
        `<rect x="${p.x - half}" y="${p.y - half}" width="${s}" height="${s}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#ps)"/>`
      );
    } else if (shape === 'diamond') {
      const r = PLAYER_RADIUS + 2;
      parts.push(
        `<polygon points="${p.x},${p.y - r} ${p.x + r},${p.y} ${p.x},${p.y + r} ${p.x - r},${p.y}" fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#ps)"/>`
      );
    } else {
      parts.push(
        `<circle cx="${p.x}" cy="${p.y}" r="${PLAYER_RADIUS}" fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#ps)"/>`
      );
    }

    parts.push(
      `<text x="${p.x}" y="${p.y + 4}" text-anchor="middle" fill="${text}" font-size="9" font-family="Arial,sans-serif" font-weight="700">${escapeXml(p.label)}</text>`
    );
  }

  return parts.join('\n');
}

// ─── Legend ───────────────────────────────────────────────────────────────────

const ROUTE_TYPE_ORDER: DiagramRouteType[] = [
  'go',
  'cut',
  'fade',
  'drag',
  'space',
  'screen',
  'pick',
  'block',
];

const ROUTE_LABELS: Record<DiagramRouteType, string> = {
  go: 'Go',
  cut: 'Cut',
  fade: 'Fade',
  drag: 'Drag',
  space: 'Zone',
  screen: 'Screen',
  pick: 'Pick',
  block: 'Block',
};

/**
 * Renders a compact semi-transparent bar at the bottom of the canvas showing
 * only the route types actually present in this diagram.  Returns an empty
 * string if no typed routes exist (no clutter for pure positional diagrams).
 */
export function renderLegend(routes: DiagramRoute[], width: number, fieldHeight: number): string {
  const used = new Set(routes.filter((r) => r.type != null).map((r) => r.type as DiagramRouteType));
  const types = ROUTE_TYPE_ORDER.filter((t) => used.has(t));
  if (types.length === 0) return '';

  const ITEM_W = 64;
  const startX = Math.max(8, (width - types.length * ITEM_W) / 2);
  const barY = fieldHeight - LEGEND_HEIGHT;
  const midY = barY + LEGEND_HEIGHT / 2 + 1;

  const parts: string[] = [
    `<rect x="0" y="${barY}" width="${width}" height="${LEGEND_HEIGHT}" fill="rgba(0,0,0,0.6)"/>`,
  ];

  types.forEach((type, i) => {
    const ix = startX + i * ITEM_W;
    const { marker, strokeDasharray, opacity } = getRouteMarkerAndStyle(type);
    const dash = strokeDasharray ? ` stroke-dasharray="${strokeDasharray}"` : '';
    parts.push(
      `<line x1="${ix}" y1="${midY}" x2="${ix + 16}" y2="${midY}" stroke="${C.route}" stroke-width="2" marker-end="${marker}"${dash} opacity="${opacity}"/>`,
      `<text x="${ix + 20}" y="${midY + 3.5}" fill="rgba(255,255,255,0.9)" font-size="8.5" font-family="Arial,sans-serif">${ROUTE_LABELS[type]}</text>`
    );
  });

  return parts.join('\n');
}

// ─── Title bar ────────────────────────────────────────────────────────────────

export function renderTitleBar(title: string, width: number): string {
  return [
    `<rect x="0" y="0" width="${width}" height="30" fill="${C.titleBg}"/>`,
    `<text x="${width / 2}" y="20" text-anchor="middle" fill="${C.titleText}" font-size="13" font-family="Arial,sans-serif" font-weight="700">${escapeXml(title)}</text>`,
  ].join('\n');
}

// ─── Diagram composition ──────────────────────────────────────────────────────

/**
 * Compose the full SVG from pre-rendered parts.
 *
 * Drawing order (bottom → top in the SVG painter's model):
 *   1. Field / court background  — establishes the playing surface
 *   2. Players                   — markers placed on the field
 *   3. Routes                    — arrows drawn over players so arrowheads are fully visible
 *   4. Zone overlays             — semi-transparent coverage bubbles sit on top for clarity
 *   5. Title bar                 — always readable, renders over field content
 *   6. Legend bar                — compact key at bottom edge
 */
export function renderDiagramSvg(layout: DiagramLayout, fieldSvg: string): string {
  const { fieldWidth, fieldHeight, title } = layout;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fieldWidth}" height="${fieldHeight}" viewBox="0 0 ${fieldWidth} ${fieldHeight}">
${renderDefs()}
${fieldSvg}
${renderPlayers(layout.players)}
${renderRoutes(layout.routes)}
${renderZones(layout.zones)}
${renderTitleBar(title, fieldWidth)}
${renderLegend(layout.routes, fieldWidth, fieldHeight)}
</svg>`;
}

// ─── Coordinate utility ───────────────────────────────────────────────────────

export function clampCoord(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}
