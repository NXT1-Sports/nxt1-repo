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

/**
 * Determines if legend/title bar should be rendered based on diagram kind.
 * Default is off to keep the tactical canvas cleaner.
 */

export interface RenderProfileOptions {
  kind?: string;
  showLegend?: boolean;
  showTitleBar?: boolean;
  annotationClutter?: boolean;
  /**
   * Controls which team is rendered.
   * - 'offense'  (default) — only offense players and their routes
   * - 'defense'            — only defense players and their routes
   * - 'both'               — all players (use only when explicitly requested)
   */
  teamFocus?: 'offense' | 'defense' | 'both';
}

export function shouldRenderLegend(_kind?: string, opts?: RenderProfileOptions): boolean {
  if (opts && typeof opts.showLegend === 'boolean') return opts.showLegend;
  return false;
}

export function shouldRenderTitleBar(_kind?: string, opts?: RenderProfileOptions): boolean {
  if (opts && typeof opts.showTitleBar === 'boolean') return opts.showTitleBar;
  return true;
}

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
 * Cubic Bézier conversion to produce natural curves through
 * every waypoint.  2-point routes and block-type routes use straight `L`
 * segments to preserve intentionally linear movement.
 */
function pointsToPath(
  points: ReadonlyArray<[number, number]>,
  smooth: boolean,
  tension = 1 / 3
): string {
  const n = points.length;
  if (n < 2) return '';

  if (!smooth || n === 2) {
    return points.map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`)).join(' ');
  }

  // Lower tension keeps curves sharper and prevents exaggerated bowing.
  const t = tension;
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

function refineRoutePath(points: ReadonlyArray<[number, number]>, smooth: boolean): string {
  if (smooth) {
    return pointsToPath(points, true, 0.3);
  }
  return pointsToPath(points, false);
}

// ─── SVG defs ─────────────────────────────────────────────────────────────────

export function renderDefs(): string {
  return `<defs>
  <!-- Standard arrow for go/default routes -->
  <marker id="arr-go" markerWidth="6" markerHeight="6" refX="5.3" refY="3" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L6,3 L0,6 L1.3,3 z" fill="context-stroke"/>
  </marker>
  <!-- Football block marker: open T cap (classic clinic-board symbol) -->
  <marker id="arr-block" markerWidth="9" markerHeight="9" refX="4.5" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M4.5,1.2 L4.5,7.8 M1.4,3.5 L7.6,3.5" fill="none" stroke="context-stroke" stroke-width="1.6" stroke-linecap="round"/>
  </marker>
  <!-- Screen box marker -->
  <marker id="arr-screen" markerWidth="7" markerHeight="7" refX="6.4" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
    <rect x="0.8" y="0.8" width="5.4" height="5.4" fill="none" stroke="context-stroke" stroke-width="1.1" rx="0.9" ry="0.9"/>
  </marker>
  <!-- Pick arc marker -->
  <marker id="arr-pick" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
    <circle cx="4" cy="4" r="4" fill="none" stroke="context-stroke" stroke-width="1.5"/>
  </marker>
  <!-- Cut angle marker -->
  <marker id="arr-cut" markerWidth="6" markerHeight="6" refX="5.3" refY="3" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L6,3 L0,6 Z" fill="context-stroke"/>
  </marker>
  <!-- Drag marker: slim, clean arrowhead -->
  <marker id="arr-drag" markerWidth="6" markerHeight="6" refX="5.1" refY="3" orient="auto" markerUnits="strokeWidth">
    <path d="M0,0.5 L5.2,3 L0,5.5 L1.1,3 z" fill="context-stroke"/>
  </marker>
  <!-- Space/dashed -->
  <marker id="arr-space" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto" markerUnits="strokeWidth">
    <circle cx="3" cy="3" r="1.5" fill="context-stroke"/>
  </marker>
  <!-- Fade diminishing -->
  <marker id="arr-fade" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto" markerUnits="strokeWidth">
    <path d="M0,3 L4,1 L5,3 L4,5 Z" fill="context-stroke" opacity="0.6"/>
  </marker>
  <filter id="ps" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="1" dy="1" stdDeviation="1.8" flood-color="${C.shadow}"/>
  </filter>
</defs>`;
}

function getRouteMarkerAndStyle(type?: DiagramRouteType, customColor?: string): {
  marker: string;
  strokeWidth: string;
  strokeDasharray?: string;
  opacity: string;
  color: string;
} {
  // Block assignments should stay football-standard gray for consistency.
  if (type === 'block') {
    return {
      marker: 'url(#arr-block)',
      strokeWidth: '3.0',
      opacity: '0.90',
      color: C.routeBlock,
    };
  }

  // If custom color provided, use it (respects AI-selected colors)
  if (customColor) {
    return {
      marker: 'url(#arr-go)',
      strokeWidth: '2.5',
      opacity: '0.95',
      color: customColor,
    };
  }

  switch (type) {
    case 'screen':
      return {
        marker: 'url(#arr-screen)',
        strokeWidth: '2.4',
        strokeDasharray: '7,4',
        opacity: '0.88',
        color: C.routeScreen,
      };
    case 'pick':
      return { marker: 'url(#arr-pick)', strokeWidth: '3.2', opacity: '0.95', color: C.routePick };
    case 'cut':
      return { marker: 'url(#arr-cut)', strokeWidth: '2.5', opacity: '0.95', color: C.routeCut }; // Updated to use a distinct cut arrow style

    case 'go':
      return { marker: 'url(#arr-go)', strokeWidth: '2.5', opacity: '0.95', color: C.routeGo }; // Ensures go routes have their arrow marker

    default:
      return { marker: 'url(#arr-go)', strokeWidth: '2.5', opacity: '0.95', color: C.routeGo };
  }
}

function shouldSmoothRoute(route: DiagramRoute): boolean {
  if (route.curve === false) return false;
  if (route.curve === true) return true;

  // Only smooth routes explicitly requiring curves
  switch (route.type) {
    case 'fade':
    case 'space':
      return route.points.length > 2;
    default:
      return false; // Default to sharp routes
  }
}

function compactLabel(raw: string | undefined, maxChars: number): string {
  if (!raw) return '';

  const squashed = raw.replace(/\s+/g, ' ').trim();
  if (!squashed) return '';

  const replacements: ReadonlyArray<[RegExp, string]> = [
    [/\bRight\b/gi, 'Rt'],
    [/\bLeft\b/gi, 'Lt'],
    [/\bVertical\b/gi, 'Vert'],
    [/\bOutside\b/gi, 'Out'],
    [/\bInside\b/gi, 'In'],
    [/\bRelease\b/gi, 'Rel'],
    [/\bAnticipate\b/gi, 'Ant'],
    [/\bProtect\b/gi, 'Prot'],
    [/\bQuick\b/gi, 'Qk'],
    [/\bCorner\b/gi, 'Cor'],
    [/\bComeback\b/gi, 'Cmbk'],
  ];

  let normalized = squashed;
  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

function normalizePositionToken(raw: string | undefined): string {
  const token = (raw ?? '').trim();
  if (!token) return '';

  const compact = token.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const slotMatch = compact.match(/^(SL|SLOTL|SR|SLOTR)(\d+)$/);
  if (slotMatch) {
    const [, base, rawIndex] = slotMatch;
    const index = Number(rawIndex);
    if (base === 'SL' || base === 'SLOTL') {
      return index === 1 ? 'H' : index === 2 ? 'Y' : 'SLOT';
    }
    return index === 1 ? 'Y' : index === 2 ? 'H' : 'SLOT';
  }

  const upper = /^(1B|2B|3B)$/.test(compact) ? compact : compact.replace(/\d+$/, '');
  const aliases: Record<string, string> = {
    SL: 'H',
    SLOTL: 'H',
    SR: 'Y',
    SLOTR: 'Y',
  };

  return aliases[upper] ?? upper;
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

/**
 * Render route paths only — no inline labels (labels go in the annotation strip below).
 */
export function renderRoutes(routes: DiagramRoute[]): string {
  const parts: string[] = [];

  for (const route of routes) {
    if (route.points.length < 2) continue;

    const { marker, strokeWidth, strokeDasharray, opacity, color } = getRouteMarkerAndStyle(
      route.type,
      route.color // Pass custom color if provided by AI
    );
    const dasharray = strokeDasharray ? ` stroke-dasharray="${strokeDasharray}"` : '';
    const smooth = route.type !== 'block' && shouldSmoothRoute(route);
    const pathD = refineRoutePath(route.points, smooth);

    parts.push(
      `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" marker-end="${marker}"${dasharray} opacity="${opacity}"/>`
    );
  }

  if (parts.length === 0) return '';
  return `<g class="route-layer">\n${parts.join('\n')}\n</g>`;
}

/**
 * Render a clean annotation strip below the field listing each labeled route.
 * Returns { svg, height } where height is 0 if no labels exist.
 * Renders as a dark band matching the legend, split into up to 2 columns.
 */
export function renderAnnotationStrip(
  routes: DiagramRoute[],
  width: number,
  offsetY: number
): { svg: string; height: number } {
  const labeled = routes
    .map((r) => ({
      from: normalizePositionToken(r.from),
      label: compactLabel(r.label, 18),
      color: r.color || getRouteMarkerAndStyle(r.type).color, // Use custom color if provided, else default
    }))
    .filter((r) => r.label.length > 0);

  if (labeled.length === 0) return { svg: '', height: 0 };

  const ROW_H = 18;
  const PAD_Y = 10;
  const COLS = labeled.length > 5 ? 2 : 1;
  const perCol = Math.ceil(labeled.length / COLS);
  const stripH = perCol * ROW_H + PAD_Y * 2;
  const colW = width / COLS;

  const parts: string[] = [
    `<rect x="0" y="${offsetY}" width="${width}" height="${stripH}" fill="rgba(0,0,0,0.55)"/>`,
  ];

  labeled.forEach((item, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    const x = col * colW + 12;
    const y = offsetY + PAD_Y + row * ROW_H + ROW_H / 2;
    // colored dot
    parts.push(
      `<circle cx="${x + 4}" cy="${y}" r="4" fill="${item.color}" opacity="0.9"/>`,
      `<text x="${x + 12}" y="${y}" dominant-baseline="middle" fill="rgba(255,255,255,0.92)" font-size="9" font-family="Arial,sans-serif" font-weight="600">${escapeXml(item.from ? `${item.from}: ${item.label}` : item.label)}</text>`
    );
  });

  return { svg: parts.join('\n'), height: stripH };
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

    const playerLabel = compactLabel(normalizePositionToken(p.label), 9);
    parts.push(
      `<text x="${p.x}" y="${p.y + 4}" text-anchor="middle" fill="${text}" font-size="9" font-family="Arial,sans-serif" font-weight="700">${escapeXml(playerLabel)}</text>`
    );
  }

  if (parts.length === 0) return '';
  return `<g class="player-layer">\n${parts.join('\n')}\n</g>`;
}

// ─── Legend ───────────────────────────────────────────────────────────────────

const ROUTE_TYPE_ORDER: DiagramRouteType[] = [
  'go',
  'cut',
  'drag',
  'screen',
  'block',
  'pick',
  'fade',
  'space',
];

const ROUTE_LABELS: Record<DiagramRouteType, string> = {
  go: 'Go',
  cut: 'Cut',
  drag: 'Drag',
  screen: 'Screen',
  block: 'Block',
  pick: 'Pick',
  fade: 'Fade',
  space: 'Run',
};

const ROUTE_COLORS: Record<DiagramRouteType, string> = {
  go: C.routePass,
  cut: C.routeCut,
  drag: C.routeDrag,
  screen: C.routeScreen,
  block: C.routeBlock,
  pick: C.routePick,
  fade: C.routeFade,
  space: C.routeRun,
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
    const color = ROUTE_COLORS[type] || '#fff';
    parts.push(
      `<line x1="${ix}" y1="${midY}" x2="${ix + 16}" y2="${midY}" stroke="${color}" stroke-width="2" marker-end="${marker}"${dash} opacity="${opacity}"/>`,
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
 *   2. Routes                    — movement/arrows drawn beneath markers
 *   3. Players                   — markers above lines for cleaner tactical readability
 *   4. Zone overlays             — semi-transparent coverage bubbles sit on top for clarity
 *   5. Title bar                 — always readable, renders over field content
 *   6. Legend bar (optional)     — compact key at bottom edge when enabled
 */

/**
 * Detect which team focus to use based on the actual layout content.
 * - If the layout has ONLY defense players → defense
 * - If the layout has ONLY offense players → offense
 * - If both are present and focus is 'offense' → offense (default safe)
 * - 'both' always passes through
 */
function resolveTeamFocus(
  layout: DiagramLayout,
  requested: 'offense' | 'defense' | 'both'
): 'offense' | 'defense' | 'both' {
  if (requested === 'both') return 'both';
  const hasOffense = layout.players.some((p) => p.team === 'offense');
  const hasDefense = layout.players.some((p) => p.team === 'defense');
  // Auto-promote: if LLM only generated defense players, show them
  if (hasDefense && !hasOffense) return 'defense';
  // Auto-demote: if LLM only generated offense players, honor that
  if (hasOffense && !hasDefense) return 'offense';
  // Mixed: respect the explicit request
  return requested;
}

/**
 * Return a layout filtered to only the requested team.
 * Routes are kept only when their `from` player ID belongs to a visible player.
 */
function applyTeamFocus(
  layout: DiagramLayout,
  teamFocus: 'offense' | 'defense' | 'both'
): DiagramLayout {
  const resolved = resolveTeamFocus(layout, teamFocus);
  if (resolved === 'both') return layout;

  const visiblePlayers = layout.players.filter((p) => p.team === resolved);
  const visibleIds = new Set(visiblePlayers.map((p) => p.id));
  const visibleRoutes = layout.routes.filter((r) => !r.from || visibleIds.has(r.from));

  return { ...layout, players: visiblePlayers, routes: visibleRoutes };
}

export function renderDiagramSvg(
  layout: DiagramLayout,
  fieldSvg: string,
  opts?: RenderProfileOptions
): string {
  const teamFocus = opts?.teamFocus ?? 'offense';
  const focused = applyTeamFocus(layout, teamFocus);
  const { fieldWidth, fieldHeight, title } = focused;
  const kind = opts?.kind;
  const showLegend = shouldRenderLegend(kind, opts);
  const showTitleBar = shouldRenderTitleBar(kind, opts);

  // Route annotation strip: labeled routes listed cleanly BELOW the field canvas.
  // Legend is embedded inside the field (bottom edge). Annotations expand the total SVG height.
  const { svg: annotSvg, height: annotH } = renderAnnotationStrip(
    focused.routes,
    fieldWidth,
    fieldHeight // start immediately below the field
  );
  // Total SVG height: field + annotation strip (0 when no labels exist)
  const totalHeight = fieldHeight + annotH;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fieldWidth}" height="${totalHeight}" viewBox="0 0 ${fieldWidth} ${totalHeight}">
${renderDefs()}
${fieldSvg}
${renderRoutes(focused.routes)}
${renderPlayers(focused.players)}
${renderZones(focused.zones)}
${showTitleBar ? renderTitleBar(title, fieldWidth) : ''}
${showLegend ? renderLegend(focused.routes, fieldWidth, fieldHeight) : ''}
${annotSvg}
</svg>`;
}

// ─── Coordinate utility ───────────────────────────────────────────────────────

export function clampCoord(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}
