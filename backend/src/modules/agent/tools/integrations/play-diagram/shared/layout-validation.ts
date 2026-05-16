import { AgentEngineError } from '../../../../exceptions/agent-engine.error.js';
import type { DiagramLayout, NormalizedSport } from './diagram.types.js';

export type LayoutQualitySeverity = 'critical' | 'major' | 'minor';

export interface LayoutQualityFinding {
  readonly severity: LayoutQualitySeverity;
  readonly code: string;
  readonly message: string;
}

export interface LayoutQualityReport {
  readonly score: number;
  readonly findings: readonly LayoutQualityFinding[];
  readonly hasCritical: boolean;
  readonly hasMajor: boolean;
}

const MIN_PLAYERS: Record<NormalizedSport, number> = {
  football: 8,
  basketball: 6,
  soccer: 8,
  baseball: 8,
  softball: 8,
};

const ALLOWED_POSITION_LABELS: Record<NormalizedSport, ReadonlySet<string>> = {
  football: new Set([
    'LT',
    'LG',
    'C',
    'RG',
    'RT',
    'QB',
    'RB',
    'FB',
    'X',
    'Z',
    'Y',
    'H',
    'WR',
    'TE',
    'SLOT',
    'DE',
    'DT',
    'NT',
    'DL',
    'OLB',
    'ILB',
    'MLB',
    'WLB',
    'SLB',
    'LB',
    'CB',
    'NB',
    'FS',
    'SS',
    'S',
    'K',
    'P',
    'LS',
  ]),
  basketball: new Set(['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F']),
  soccer: new Set([
    'GK',
    'LB',
    'LCB',
    'CB',
    'RCB',
    'RB',
    'LWB',
    'RWB',
    'DM',
    'CDM',
    'CM',
    'LCM',
    'RCM',
    'AM',
    'CAM',
    'LW',
    'RW',
    'ST',
    'CF',
    'WF',
  ]),
  baseball: new Set(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'IF', 'OF', 'UTIL']),
  softball: new Set(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'IF', 'OF', 'UTIL']),
};

const POSITION_ALIASES: Record<NormalizedSport, Readonly<Record<string, string>>> = {
  football: {
    SLOTL: 'H',
    SLOTR: 'Y',
    SL: 'H',
    SR: 'Y',
    HB: 'RB',
    TB: 'RB',
    SAFETY: 'S',
  },
  basketball: {
    POINTGUARD: 'PG',
    SHOOTINGGUARD: 'SG',
    SMALLFORWARD: 'SF',
    POWERFORWARD: 'PF',
    CENTER: 'C',
  },
  soccer: {
    STRIKER: 'ST',
    KEEPER: 'GK',
  },
  baseball: {
    PITCHER: 'P',
    CATCHER: 'C',
    SHORTSTOP: 'SS',
  },
  softball: {
    PITCHER: 'P',
    CATCHER: 'C',
    SHORTSTOP: 'SS',
  },
};

function pushFinding(
  findings: LayoutQualityFinding[],
  severity: LayoutQualitySeverity,
  code: string,
  message: string
): void {
  findings.push({ severity, code, message });
}

function normalizePositionToken(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[0-9]+$/, '');
}

function resolveAllowedPositionToken(raw: string, sport: NormalizedSport): string {
  const normalized = normalizePositionToken(raw);
  if (!normalized) return '';
  return POSITION_ALIASES[sport][normalized] ?? normalized;
}

function evaluatePositionHardlist(layout: DiagramLayout, findings: LayoutQualityFinding[]): void {
  const allowed = ALLOWED_POSITION_LABELS[layout.sport];

  for (const player of layout.players) {
    const source = player.label || player.id;
    const token = resolveAllowedPositionToken(source, layout.sport);

    if (!token || !allowed.has(token)) {
      pushFinding(
        findings,
        'critical',
        'diagram/players/invalid-position',
        `Position '${source}' is not allowed for sport '${layout.sport}'.`
      );
      return;
    }
  }
}

function isFootballRushLike(label: string | undefined): boolean {
  const normalized = (label ?? '').toLowerCase();
  return /(rush|blitz|penetrat|gap|stunt|attack|pressure|sack|contain|fill)/.test(normalized);
}

function isFootballBlockingConcept(conceptText: string): boolean {
  const concept = conceptText.toLowerCase();
  return /(inside zone|outside zone|wide zone|duo|power|counter|trap|iso|draw|sweep|toss|run game|rush|pass pro|protection|slide protect|max protect|half slide|full slide|chip|blocking scheme|play action protection)/.test(
    concept
  );
}

function summarizeScore(findings: readonly LayoutQualityFinding[]): number {
  const critical = findings.filter((item) => item.severity === 'critical').length;
  const major = findings.filter((item) => item.severity === 'major').length;
  const minor = findings.filter((item) => item.severity === 'minor').length;

  return Math.max(0, 100 - critical * 30 - major * 12 - minor * 4);
}

function evaluateFootballQuality(
  layout: DiagramLayout,
  findings: LayoutQualityFinding[],
  conceptText: string
): void {
  const offensivePlayers = layout.players.filter((player) => player.team === 'offense');
  const defensivePlayers = layout.players.filter((player) => player.team === 'defense');
  const playersById = new Map(layout.players.map((player) => [player.id, player] as const));

  // Critical: LOS integrity when a side exists on the board.
  for (const player of offensivePlayers) {
    const isLineOrReceiver = /^(lt|lg|c|rg|rt|x|z|y|h|wr|te|slot)$/i.test(player.label);
    if (isLineOrReceiver && Math.abs(player.y - layout.losY) > 45) {
      pushFinding(
        findings,
        'critical',
        'football/los/offense-misaligned',
        `Offense alignment drift detected at ${player.label}.`
      );
      break;
    }
  }

  for (const player of defensivePlayers) {
    if (player.y > layout.losY + 5) {
      pushFinding(
        findings,
        'critical',
        'football/los/defense-below-los',
        `Defense alignment is below LOS at ${player.label}.`
      );
      break;
    }
  }

  for (const route of layout.routes) {
    const player = playersById.get(route.from);
    if (!player) continue;

    const start = route.points[0];
    const last = route.points[route.points.length - 1];
    if (!start || !last) continue;

    if (player.team === 'defense' && isFootballRushLike(route.label)) {
      if (last[1] < layout.losY) {
        pushFinding(
          findings,
          'critical',
          'football/rush/wrong-direction',
          `Defensive rush for ${player.label} is moving away from LOS.`
        );
      }
    }

    if (player.team === 'offense') {
      const depth = Math.abs(last[1] - start[1]);
      const label = (route.label ?? '').toLowerCase();

      if (/(post|corner|vert|go|fade)/.test(label) && depth < 85) {
        pushFinding(
          findings,
          'major',
          'football/route/depth-too-shallow-deep',
          `Deep route depth is shallow for ${player.label} (${route.label ?? 'unnamed'}).`
        );
      } else if (/(dig|curl|out|comeback|sail)/.test(label) && depth < 45) {
        pushFinding(
          findings,
          'major',
          'football/route/depth-too-shallow-intermediate',
          `Intermediate route depth is shallow for ${player.label} (${route.label ?? 'unnamed'}).`
        );
      }
    }

    if (!route.label || !route.label.trim()) {
      pushFinding(
        findings,
        'minor',
        'diagram/route/missing-label',
        `Route for ${player.label} is missing a label.`
      );
    }
  }

  const concept = conceptText.toLowerCase();
  if (/(cover\s*-?\s*3|cover3)/.test(concept) && !layout.zones?.length) {
    pushFinding(
      findings,
      'major',
      'football/concept/missing-zones-cover3',
      'Cover 3 concept is missing zone overlays.'
    );
  }

  if (isFootballBlockingConcept(conceptText) && offensivePlayers.length > 0) {
    const olPlayers = offensivePlayers.filter((player) => /^(LT|LG|C|RG|RT)$/i.test(player.label));
    if (olPlayers.length >= 3) {
      const routeByFrom = new Map(layout.routes.map((route) => [route.from, route] as const));
      const missing = olPlayers.filter((player) => {
        const route = routeByFrom.get(player.id);
        return !route || route.type !== 'block';
      });

      if (missing.length > 0) {
        pushFinding(
          findings,
          'major',
          'football/blocking/missing-ol-assignments',
          `Blocking concept is missing OL block assignments for: ${missing
            .map((player) => player.label)
            .join(', ')}.`
        );
      }

      for (const player of olPlayers) {
        const route = routeByFrom.get(player.id);
        if (!route || route.type !== 'block' || route.points.length < 2) continue;
        const first = route.points[0];
        const last = route.points[route.points.length - 1];
        if (!first || !last) continue;

        const depth = Math.abs(last[1] - first[1]);
        if (depth > 70) {
          pushFinding(
            findings,
            'major',
            'football/blocking/unrealistic-depth',
            `OL block path is too deep for ${player.label}; keep block assignments near LOS.`
          );
        }
      }
    }
  }
}

export function evaluateLayoutQualityForSport(
  layout: DiagramLayout,
  conceptText?: string
): LayoutQualityReport {
  const findings: LayoutQualityFinding[] = [];
  const minPlayers = MIN_PLAYERS[layout.sport];

  evaluatePositionHardlist(layout, findings);

  if (layout.players.length < minPlayers) {
    pushFinding(
      findings,
      'critical',
      'diagram/players/min-count',
      `Layout has too few players for ${layout.sport}. Expected at least ${minPlayers}, received ${layout.players.length}.`
    );
  }

  const playerIds = new Set(layout.players.map((player) => player.id));
  for (const route of layout.routes) {
    if (!playerIds.has(route.from)) {
      pushFinding(
        findings,
        'critical',
        'diagram/routes/missing-source-player',
        `Route start player '${route.from}' does not exist in players[].`
      );
    }
  }

  if (layout.sport === 'football') {
    evaluateFootballQuality(layout, findings, conceptText ?? '');
  } else {
    for (const route of layout.routes) {
      if (!route.label || !route.label.trim()) {
        pushFinding(
          findings,
          'minor',
          'diagram/route/missing-label',
          `Route for ${route.from} is missing a label.`
        );
      }
    }
  }

  const hasCritical = findings.some((item) => item.severity === 'critical');
  const hasMajor = findings.some((item) => item.severity === 'major');

  return {
    score: summarizeScore(findings),
    findings,
    hasCritical,
    hasMajor,
  };
}

export function validateLayoutForSport(layout: DiagramLayout): void {
  const report = evaluateLayoutQualityForSport(layout);
  const criticalFinding = report.findings.find((item) => item.severity === 'critical');

  if (criticalFinding) {
    throw new AgentEngineError('PLAY_DIAGRAM_LLM_INVALID_LAYOUT', criticalFinding.message);
  }
}
