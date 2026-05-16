/**
 * @fileoverview Drill diagram enhancement module — deterministic post-processing for drill layouts.
 *
 * This module applies drill-specific optimizations: spacing, route deconfliction, label normalization, and station/cone canonicalization.
 *
 * This is called ONLY for sport_drill diagrams, never for plays.
 */

import type {
  DiagramLayout,
  DiagramPlayer,
  DiagramRoute,
} from '../../play-diagram/shared/diagram.types.js';

/**
 * Enhance a drill layout with deterministic quality controls:
 * - Enforce minimum spacing (already validated, but can nudge)
 * - Normalize labels
 * - Canonicalize station/cone zones
 * - (Future) Route deconfliction
 * - (Future) Deduplicate labels
 *
 * This is a pure function: does not mutate input.
 */

// Helper: Nudge players apart if spacing is too tight (minimum 30px)
function nudgePlayerSpacing(players: DiagramPlayer[], minSpacing = 30): DiagramPlayer[] {
  const nudged = players.map((p) => ({ ...p }));
  let changed = false;
  for (let i = 0; i < nudged.length; i++) {
    for (let j = i + 1; j < nudged.length; j++) {
      const a = nudged[i];
      const b = nudged[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minSpacing && dist > 0.1) {
        // Move each player away from the other by half the overlap
        const move = (minSpacing - dist) / 2;
        const angle = Math.atan2(dy, dx);
        a.x += Math.cos(angle) * move;
        a.y += Math.sin(angle) * move;
        b.x -= Math.cos(angle) * move;
        b.y -= Math.sin(angle) * move;
        changed = true;
      }
    }
  }
  // Clamp to field bounds (assume 600x440)
  for (const p of nudged) {
    p.x = Math.max(10, Math.min(590, p.x));
    p.y = Math.max(10, Math.min(430, p.y));
  }
  return changed ? nudgePlayerSpacing(nudged, minSpacing) : nudged;
}

// Helper: Deduplicate player/route/zone labels (add suffix if needed)
function dedupeLabels<T extends { label?: string }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    if (!item.label) return item;
    const base = item.label.trim();
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? item : { ...item, label: `${base} ${count + 1}` };
  });
}

// Helper: Canonicalize zones for cones/stations
function canonicalizeZones(zones?: DiagramLayout['zones']): DiagramLayout['zones'] {
  if (!zones) return undefined;
  return zones.map((z) => {
    if (z.label?.toLowerCase().startsWith('cone') || z.label === 'C') {
      return { ...z, label: 'C', width: 20, height: 20, shape: 'ellipse' };
    }
    if (z.label?.toLowerCase().startsWith('station')) {
      return { ...z, width: 60, height: 40, shape: 'rect' };
    }
    if (z.label === 'Land') {
      return { ...z, width: 50, height: 30, shape: 'rect' };
    }
    if (z.label === 'Catch') {
      return { ...z, width: 50, height: 30, shape: 'rect' };
    }
    return z;
  });
}

// Helper: Route deconfliction stub (future: implement crossing detection)
function deconflictRoutes(routes: DiagramRoute[]): DiagramRoute[] {
  // For now, just return as-is. Future: nudge points to avoid crossings.
  return routes;
}

// Helper: Normalize labels (collapse repeats, trim, max length)
function normalizeLabel(raw: string | undefined, maxLength = 14): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9+\-/. ]+/g, '')
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length <= maxLength ? cleaned : cleaned.slice(0, maxLength).trimEnd();
}

export function enhanceDrillLayout(layout: DiagramLayout): DiagramLayout {
  // Nudge player spacing
  const players = nudgePlayerSpacing(layout.players);
  // Deduplicate and normalize player labels
  const playersLabeled = dedupeLabels(players).map((p) => ({
    ...p,
    label: normalizeLabel(p.label, 10) ?? p.label,
  }));
  // Deduplicate and normalize route labels
  const routes = dedupeLabels(layout.routes).map((r) => ({
    ...r,
    label: normalizeLabel(r.label, 14),
  }));
  // Canonicalize zones
  const zones = canonicalizeZones(layout.zones);
  // Route deconfliction (stub)
  const routesDeconflicted = deconflictRoutes(routes);
  return {
    ...layout,
    players: playersLabeled,
    routes: routesDeconflicted,
    ...(zones ? { zones } : {}),
  };
}
