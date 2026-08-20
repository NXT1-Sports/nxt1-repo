/**
 * @fileoverview BoardDiagramService — Orchestrator for the Board Diagram Platform.
 *
 * Handles the full lifecycle for both sport_play and sport_drill diagrams:
 *   create  → LLM layout generation → SVG render → PNG+SVG upload → Firestore persist
 *   update  → LLM re-generation → SVG render → new PNG+SVG upload → Firestore patch → old assets delete
 *   delete  → Firestore soft-delete → storage PNG cleanup
 *
 * Design principles:
 *   - Reuses the entire existing play-diagram render pipeline (SVG helpers, renderers,
 *     concept enhancers, mxGraph export) — no duplication of rendering code.
 *   - Drill diagrams share the same render pipeline but use relaxed validation and
 *     a drill-specific LLM system prompt.
 *   - Storage and Firestore are resolved at runtime based on context.environment so
 *     the same service works in both staging and production environments.
 *   - Storage cleanup (delete) is always non-fatal — a failed PNG delete does not
 *     roll back the Firestore mutation. The record is the source of truth.
 */

import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Firestore } from 'firebase-admin/firestore';
import { stagingDb } from '../../../../../utils/firebase-staging.js';
import { db as defaultDb } from '../../../../../utils/firebase.js';
import { stagingStorage } from '../../../../../utils/firebase-staging.js';
import { storage as defaultStorage } from '../../../../../utils/firebase.js';
import { logger } from '../../../../../utils/logger.js';
import {
  AgentEngineError,
  getAgentEngineErrorCode,
  isAgentEngineError,
} from '../../../exceptions/agent-engine.error.js';
import type { OpenRouterService } from '../../../llm/openrouter.service.js';
import type { ToolExecutionContext } from '../../base.tool.js';

// ── Reuse the play-diagram render pipeline in full ───────────────────────────
import { buildSystemPrompt } from '../play-diagram/prompts/index.js';
import { getSportRenderer } from '../play-diagram/renderers/index.js';
import { applySportFeatureFlag, normalizeSportId } from '../play-diagram/sport-normalization.js';
import { getFeatureFlagsService } from '../../../../../config/feature-flags/index.js';
import {
  coercePlayerShape,
  coerceRouteType,
  enhanceLayoutForConcept,
} from '../play-diagram/shared/layout-enhancement.js';
import { validateLayoutForSport } from '../play-diagram/shared/layout-validation.js';
import { layoutToMxGraphModel } from '../play-diagram/shared/mxgraph.js';
import {
  clampCoord,
  renderDiagramSvg,
  type RenderProfileOptions,
} from '../play-diagram/shared/svg-helpers.js';
import type {
  DiagramLayout,
  DiagramPlayer,
  DiagramRoute,
  NormalizedSport,
} from '../play-diagram/shared/diagram.types.js';

// ── Board-diagram specific ───────────────────────────────────────────────────
import { validateDrillLayout } from './shared/drill-validation.js';
import { enhanceDrillLayout } from './shared/drill-enhancement.js';
import { getDrillPromptForSport } from './prompts/drill.prompt.js';
import { BoardDiagramAssetService } from './services/board-diagram-asset.service.js';
import type { BoardDiagramAsset, BoardDiagramKind } from './shared/board-diagram.types.js';
import type {
  CreateBoardDiagramInput,
  UpdateBoardDiagramInput,
  DeleteBoardDiagramInput,
} from './schemas.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const DIAGRAMS_EDITOR_BASE = 'https://app.diagrams.net/';
const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const LLM_TIMEOUT_MS = 60_000;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 440;
const MAX_LAYOUT_ATTEMPTS = 2;
const MAX_BOARD_QUERY_LENGTH = 380;
type TeamFocus = 'offense' | 'defense' | 'both';
type TeamFocusRequest = TeamFocus | 'auto';

function compactBoardQuery(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_BOARD_QUERY_LENGTH);
}

function extractBoardDiagramKind(value: unknown): BoardDiagramKind | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const kindValue = (value as { kind?: unknown }).kind;
  if (kindValue === 'sport_play' || kindValue === 'sport_drill') {
    return kindValue;
  }

  return undefined;
}

// ─── Private utilities ────────────────────────────────────────────────────────

function buildUserPrompt(
  description: string,
  title: string,
  sport: NormalizedSport,
  teamFocus: TeamFocusRequest,
  xmlTemplate?: string
): string {
  let prompt = `Sport: ${sport}\nTitle: ${title}\nDescription: ${description}`;
  if (teamFocus === 'both') {
    prompt +=
      '\n\nTEAM FOCUS: BOTH SIDES (offense + defense). Include both offense and defense players in the output.';
  } else if (teamFocus === 'offense' || teamFocus === 'defense') {
    prompt += `\n\nTEAM FOCUS: ${teamFocus.toUpperCase()} ONLY. Include ONLY ${teamFocus} players in the output.`;
  } else {
    prompt +=
      '\n\nTEAM FOCUS: AUTO. Infer the correct side of the ball from the request, defaulting to offense if ambiguous.';
  }

  if (xmlTemplate) {
    prompt += `\n\nBase layout JSON to adapt:\n${xmlTemplate}`;
  }
  prompt +=
    '\n\nOutput the JSON layout for this diagram. Ensure coordinates are in bounds. Raw JSON only.';
  return prompt;
}

function inferRequestedTeamFocus(title: string, description: string): TeamFocusRequest {
  const text = `${title} ${description}`.toLowerCase();

  // Explicit matchup language ("X vs Y", "X versus Y") → show both sides.
  if (/\b(vs\.?|versus)\b/.test(text)) return 'both';

  // Explicit request for both sides simultaneously.
  if (/\b(both (sides|teams|offense and defense|defense and offense))\b/.test(text)) return 'both';

  // Find the first occurrence of a defense keyword and an offense keyword.
  // Whichever appears first in the text is the PRIMARY subject.
  // This correctly handles cases like:
  //   "defense diagrams to beat west coast offense" → defense wins (appears first)
  //   "offensive play against cover 2" → offense wins (appears first)
  //   "draw cover 2 against the spread offense" → defense wins (cover 2 appears first)
  const defenseMatch =
    /\b(defense|defensive|defender|defenders|coverage|blitz|scheme|cover \d)\b/.exec(text);
  const offenseMatch = /\b(offense|offensive|attacking)\b/.exec(text);

  if (defenseMatch && offenseMatch) {
    return defenseMatch.index < offenseMatch.index ? 'defense' : 'offense';
  }
  if (defenseMatch) return 'defense';
  if (offenseMatch) return 'offense';

  return 'auto';
}

function validateTeamFocusMatch(layout: DiagramLayout, requested: TeamFocusRequest): void {
  if (requested === 'auto') return;

  const hasOffense = layout.players.some((player) => player.team === 'offense');
  const hasDefense = layout.players.some((player) => player.team === 'defense');

  if (requested === 'both') {
    if (!hasOffense || !hasDefense) {
      throw new AgentEngineError(
        'BOARD_DIAGRAM_LLM_INVALID_LAYOUT',
        'Layout team focus mismatch: request requires BOTH offense and defense players.'
      );
    }
    return;
  }

  if (requested === 'offense' && (!hasOffense || hasDefense)) {
    throw new AgentEngineError(
      'BOARD_DIAGRAM_LLM_INVALID_LAYOUT',
      'Layout team focus mismatch: request requires offense-only players.'
    );
  }

  if (requested === 'defense' && (!hasDefense || hasOffense)) {
    throw new AgentEngineError(
      'BOARD_DIAGRAM_LLM_INVALID_LAYOUT',
      'Layout team focus mismatch: request requires defense-only players.'
    );
  }
}

function sanitizeFileName(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned.length > 0 ? cleaned : 'board-diagram';
}

function collapseRepeatedTerm(raw: string): string {
  const compact = raw.replace(/\s+/g, ' ').trim();
  if (!compact) return '';

  // Example: "CoverageCoverageCoverage" -> "Coverage"
  const repeatedFragment = compact.match(/^([A-Za-z]{2,})(\1){1,}$/i);
  if (repeatedFragment) {
    const term = repeatedFragment[1] ?? compact;
    return term.charAt(0).toUpperCase() + term.slice(1).toLowerCase();
  }

  const words = compact.split(' ');
  const deduped: string[] = [];
  for (const word of words) {
    const prev = deduped[deduped.length - 1];
    if (prev?.toLowerCase() === word.toLowerCase()) continue;
    deduped.push(word);
  }

  return deduped.join(' ');
}

function normalizeLabel(raw: string | undefined, maxLength = 18): string | undefined {
  if (!raw) return undefined;

  const cleaned = collapseRepeatedTerm(raw)
    .replace(/[^a-zA-Z0-9+\-/. ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return undefined;
  return cleaned.length <= maxLength ? cleaned : cleaned.slice(0, maxLength).trimEnd();
}

function cleanDrillLayout(layout: DiagramLayout): DiagramLayout {
  const players = layout.players.map((player) => ({
    ...player,
    label: normalizeLabel(player.label, 10) ?? player.label,
  }));

  const routes = layout.routes.map((route) => ({
    ...route,
    label: normalizeLabel(route.label, 14),
  }));

  const zones = layout.zones?.map((zone) => ({
    ...zone,
    label: normalizeLabel(zone.label, 12) ?? zone.label,
  }));

  return {
    ...layout,
    players,
    routes,
    ...(zones ? { zones } : {}),
  };
}

async function convertSvgToPng(svgString: string): Promise<Buffer> {
  return sharp(Buffer.from(svgString, 'utf-8'), { density: 144 })
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toBuffer();
}

function resolveTeamFocus(layout: DiagramLayout, requestedTeamFocus?: TeamFocusRequest): TeamFocus {
  const hasOffense = layout.players.some((player) => player.team === 'offense');
  const hasDefense = layout.players.some((player) => player.team === 'defense');
  const derivedTeamFocus: TeamFocus =
    hasOffense && hasDefense ? 'both' : hasDefense ? 'defense' : 'offense';

  return requestedTeamFocus && requestedTeamFocus !== 'auto'
    ? requestedTeamFocus
    : derivedTeamFocus;
}

function buildRenderProfile(
  layout: DiagramLayout,
  kind: BoardDiagramKind,
  requestedTeamFocus?: TeamFocusRequest
): RenderProfileOptions {
  const teamFocus = resolveTeamFocus(layout, requestedTeamFocus);

  if (kind === 'sport_drill') {
    return {
      kind,
      showLegend: false,
      showTitleBar: true,
      annotationClutter: false,
      teamFocus,
    };
  }

  return {
    kind,
    showLegend: true,
    showTitleBar: true,
    annotationClutter: true,
    teamFocus,
  };
}

export function renderBoardDiagramSvg(
  layout: DiagramLayout,
  kind: BoardDiagramKind,
  requestedTeamFocus?: TeamFocusRequest
): string {
  const renderer = getSportRenderer(layout.sport);
  const fieldSvg = renderer.renderField(layout);
  const renderProfile = buildRenderProfile(layout, kind, requestedTeamFocus);
  return renderDiagramSvg(layout, fieldSvg, renderProfile);
}

function buildEditUrl(mxXml: string): string {
  return `${DIAGRAMS_EDITOR_BASE}#R${encodeURIComponent(mxXml)}`;
}

function resolveFirestoreDb(context?: ToolExecutionContext): Firestore {
  const isStaging =
    context?.environment === 'staging' ||
    (!context?.environment && process.env['NODE_ENV'] === 'staging');
  return isStaging ? stagingDb : defaultDb;
}

function resolveStorage(context?: ToolExecutionContext) {
  const isStaging =
    context?.environment === 'staging' ||
    (!context?.environment && process.env['NODE_ENV'] === 'staging');
  return isStaging ? stagingStorage : defaultStorage;
}

async function isExtendedSportsEnabled(context?: ToolExecutionContext): Promise<boolean> {
  return getFeatureFlagsService(resolveFirestoreDb(context)).isEnabled(
    'ai.play.diagram.extended.sports.enabled'
  );
}

/**
 * Build the LLM system prompt for a given sport and diagram kind.
 *
 * For `sport_play`: returns the unmodified play-diagram system prompt.
 * For `sport_drill`: replaces the sport-specific section and example with
 *   drill-specific content, teaching the model drill notation conventions.
 */
function buildSystemPromptForKind(sport: NormalizedSport, kind: BoardDiagramKind): string {
  const basePrompt = buildSystemPrompt(sport);

  if (kind !== 'sport_drill') {
    return basePrompt;
  }

  const drillPrompt = getDrillPromptForSport(sport);

  // Replace everything from the last EXAMPLE JSON section onwards with
  // drill-specific rules and a drill-specific example JSON.
  const exampleIndex = basePrompt.lastIndexOf('\nEXAMPLE JSON:');

  if (exampleIndex !== -1) {
    return (
      basePrompt.slice(0, exampleIndex) +
      `\n${drillPrompt.systemSection}\n\nEXAMPLE JSON:\n${drillPrompt.exampleJson}`
    );
  }

  // Fallback: append to the full prompt if the expected anchor wasn't found
  return `${basePrompt}\n\n${drillPrompt.systemSection}\n\nEXAMPLE JSON:\n${drillPrompt.exampleJson}`;
}

function parseLlmLayout(
  raw: string,
  requestedSport: NormalizedSport,
  fallbackLosY: number,
  kind: BoardDiagramKind,
  extendedSportsEnabled: boolean
): DiagramLayout {
  const cleaned = raw
    .replace(/^```[a-z]*\n?/im, '')
    .replace(/\n?```$/im, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new AgentEngineError(
      'BOARD_DIAGRAM_LLM_INVALID_LAYOUT',
      `LLM output is not valid JSON: ${String(error)}. Preview: ${cleaned.slice(0, 220)}`
    );
  }

  const obj = parsed as Record<string, unknown>;
  const sportFromPayload =
    typeof obj['sport'] === 'string' ? normalizeSportId(obj['sport']) : requestedSport;
  const sport = applySportFeatureFlag(sportFromPayload, extendedSportsEnabled);

  if (!Array.isArray(obj['players']) || !Array.isArray(obj['routes'])) {
    throw new AgentEngineError(
      'BOARD_DIAGRAM_LLM_INVALID_LAYOUT',
      `LLM layout missing required arrays. Preview: ${cleaned.slice(0, 220)}`
    );
  }

  const fieldWidth = clampCoord(obj['fieldWidth'], 300, 1200, CANVAS_WIDTH);
  const fieldHeight = clampCoord(obj['fieldHeight'], 220, 900, CANVAS_HEIGHT);
  const losY = clampCoord(obj['losY'], 10, fieldHeight - 10, fallbackLosY);

  const players = (obj['players'] as Array<Record<string, unknown>>).map(
    (player, index): DiagramPlayer => ({
      id: typeof player['id'] === 'string' && player['id'] ? player['id'] : `p${index}`,
      label: typeof player['label'] === 'string' ? player['label'] : '?',
      x: clampCoord(player['x'], 10, fieldWidth - 10, 50),
      y: clampCoord(player['y'], 10, fieldHeight - 10, 200),
      team: player['team'] === 'defense' ? 'defense' : 'offense',
      shape: coercePlayerShape(player['shape']),
    })
  );

  const routes = (obj['routes'] as Array<Record<string, unknown>>)
    .filter((route) => Array.isArray(route['points']) && (route['points'] as unknown[]).length >= 2)
    .map((route): DiagramRoute => ({
      from: typeof route['from'] === 'string' ? route['from'] : '',
      label: typeof route['label'] === 'string' ? route['label'] : undefined,
      type: coerceRouteType(route['type']),
      curve: typeof route['curve'] === 'boolean' ? route['curve'] : undefined,
      points: (route['points'] as Array<[number, number]>).map(([x, y]) => [
        clampCoord(x, 5, fieldWidth - 5, 50),
        clampCoord(y, 5, fieldHeight - 5, 200),
      ]),
    }));

  const defaultTitle = kind === 'sport_drill' ? 'Drill Diagram' : 'Play Diagram';

  const layout: DiagramLayout = {
    sport,
    title:
      typeof obj['title'] === 'string' && obj['title'].trim() ? obj['title'].trim() : defaultTitle,
    fieldWidth,
    fieldHeight,
    losY,
    players,
    routes,
  };

  // Apply subtype-specific validation rules
  if (kind === 'sport_drill') {
    validateDrillLayout(layout);
  } else {
    validateLayoutForSport(layout);
  }

  return layout;
}

// ─── BoardDiagramService ──────────────────────────────────────────────────────

export class BoardDiagramService {
  constructor(private readonly llm?: OpenRouterService) {}

  // ─── Private helpers ────────────────────────────────────────────────────

  private getAssetService(context?: ToolExecutionContext): BoardDiagramAssetService {
    return new BoardDiagramAssetService(resolveFirestoreDb(context));
  }

  private buildStoragePaths(
    title: string,
    context?: ToolExecutionContext
  ): { pngStoragePath: string; svgStoragePath: string } {
    const timestamp = Date.now();
    const id = randomUUID().slice(0, 8);
    const filenameBase = `${sanitizeFileName(title)}-${timestamp}-${id}`;

    if (context?.userId && context?.threadId) {
      const directory = `Users/${context.userId}/threads/${context.threadId}/media/board-diagrams`;
      return {
        pngStoragePath: `${directory}/${filenameBase}.png`,
        svgStoragePath: `${directory}/${filenameBase}.svg`,
      };
    }

    return {
      pngStoragePath: `agent-board-diagrams/${filenameBase}.png`,
      svgStoragePath: `agent-board-diagrams/${filenameBase}.svg`,
    };
  }

  private async uploadAsset(
    fileContents: Buffer,
    storagePath: string,
    contentType: string,
    context?: ToolExecutionContext
  ): Promise<string> {
    const storageInstance = resolveStorage(context);
    const bucket = storageInstance.bucket();
    const file = bucket.file(storagePath);
    const downloadToken = randomUUID();

    await file.save(fileContents, {
      contentType,
      metadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    const [exists] = await file.exists();
    if (!exists) {
      throw new AgentEngineError(
        'BOARD_DIAGRAM_EXPORT_EMPTY',
        `Upload did not persist: gs://${bucket.name}/${storagePath}`
      );
    }

    return (
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`
    );
  }

  private async uploadPng(
    pngBuffer: Buffer,
    storagePath: string,
    context?: ToolExecutionContext
  ): Promise<string> {
    return this.uploadAsset(pngBuffer, storagePath, 'image/png', context);
  }

  private async uploadSvg(
    svgString: string,
    storagePath: string,
    context?: ToolExecutionContext
  ): Promise<string> {
    return this.uploadAsset(Buffer.from(svgString, 'utf-8'), storagePath, 'image/svg+xml', context);
  }

  /**
   * Delete a storage PNG. Non-fatal — logs a warning on failure so that a
   * missed cleanup never blocks the caller's success path.
   */
  private async deleteStorageAsset(
    storagePath: string | undefined,
    assetKind: 'PNG' | 'SVG',
    context?: ToolExecutionContext
  ): Promise<void> {
    if (!storagePath) {
      return;
    }

    try {
      const storageInstance = resolveStorage(context);
      const bucket = storageInstance.bucket();
      await bucket.file(storagePath).delete();
      logger.info(`[BoardDiagramService] Deleted storage ${assetKind}`, { storagePath });
    } catch (error) {
      logger.warn(`[BoardDiagramService] Failed to delete storage ${assetKind} (non-fatal)`, {
        storagePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async deletePng(
    storagePath: string | undefined,
    context?: ToolExecutionContext
  ): Promise<void> {
    await this.deleteStorageAsset(storagePath, 'PNG', context);
  }

  private async deleteSvg(
    storagePath: string | undefined,
    context?: ToolExecutionContext
  ): Promise<void> {
    await this.deleteStorageAsset(storagePath, 'SVG', context);
  }

  private async generateLayoutWithRetry(
    description: string,
    title: string,
    sport: NormalizedSport,
    kind: BoardDiagramKind,
    teamFocus: TeamFocusRequest,
    extendedSportsEnabled: boolean,
    xmlTemplate: string | undefined,
    context?: ToolExecutionContext
  ): Promise<DiagramLayout> {
    if (!this.llm) {
      throw new AgentEngineError(
        'BOARD_DIAGRAM_LLM_UNAVAILABLE',
        'Board diagram generation is unavailable because the LLM service is not configured.'
      );
    }

    const renderer = getSportRenderer(sport);
    const systemPrompt = buildSystemPromptForKind(sport, kind);
    let previousError: string | null = null;

    for (let attempt = 1; attempt <= MAX_LAYOUT_ATTEMPTS; attempt += 1) {
      const basePrompt = buildUserPrompt(description, title, sport, teamFocus, xmlTemplate);
      const prompt =
        previousError === null
          ? basePrompt
          : `${basePrompt}\n\nIMPORTANT: Previous layout was invalid: ${previousError}. Regenerate valid JSON with players[], routes[], and route.from values that match player ids.`;

      const completion = await this.llm.complete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        {
          maxTokens: 2400,
          temperature: 0.2,
          timeoutMs: LLM_TIMEOUT_MS,
          telemetryContext:
            context?.operationId && context.userId
              ? {
                  operationId: context.operationId,
                  userId: context.userId,
                  agentId: 'strategy_coordinator' as const,
                  feature: 'board-diagrams',
                }
              : undefined,
          signal: context?.signal,
        }
      );

      try {
        const rawOutput = completion.content?.trim() ?? '';

        if (!rawOutput) {
          throw new AgentEngineError(
            'BOARD_DIAGRAM_LLM_INVALID_LAYOUT',
            'LLM returned empty layout output.'
          );
        }

        const layout = parseLlmLayout(
          rawOutput,
          sport,
          renderer.defaultLosY,
          kind,
          extendedSportsEnabled
        );

        // Enforce that generated players match the side of ball requested by the user.
        validateTeamFocusMatch(layout, teamFocus);

        logger.info('[BoardDiagramService] Layout generation succeeded', {
          sport,
          kind,
          attempt,
          players: layout.players.length,
          routes: layout.routes.length,
        });

        return layout;
      } catch (error) {
        const code = getAgentEngineErrorCode(error);

        if (code !== 'BOARD_DIAGRAM_LLM_INVALID_LAYOUT' || attempt >= MAX_LAYOUT_ATTEMPTS) {
          throw error;
        }

        previousError = error instanceof Error ? error.message : 'Unknown layout validation error';

        logger.warn('[BoardDiagramService] Retrying invalid layout', {
          sport,
          kind,
          attempt,
          previousError,
        });
      }
    }

    throw new AgentEngineError(
      'BOARD_DIAGRAM_LLM_INVALID_LAYOUT',
      'Unable to generate a valid layout after retries.'
    );
  }

  private async renderAndUpload(
    layout: DiagramLayout,
    pngStoragePath: string,
    svgStoragePath: string,
    context?: ToolExecutionContext,
    kindOverride?: BoardDiagramKind,
    requestedTeamFocus?: TeamFocusRequest
  ): Promise<{ imageUrl: string; svgUrl: string; xmlContent: string; editUrl: string }> {
    const kind = kindOverride ?? extractBoardDiagramKind(context) ?? 'sport_play';
    const svgString = renderBoardDiagramSvg(layout, kind, requestedTeamFocus);
    const pngBuffer = await convertSvgToPng(svgString);
    const [imageUrl, svgUrl] = await Promise.all([
      this.uploadPng(pngBuffer, pngStoragePath, context),
      this.uploadSvg(svgString, svgStoragePath, context),
    ]);
    const mxXml = layoutToMxGraphModel(layout);
    const editUrl = buildEditUrl(mxXml);

    return { imageUrl, svgUrl, xmlContent: mxXml, editUrl };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Generate a new diagram (play or drill), render it to PNG, upload to storage,
   * and persist a first-class Firestore asset record.
   *
   * @returns The persisted BoardDiagramAsset with a stable ID for future CRUD ops.
   */
  async createDiagram(
    input: CreateBoardDiagramInput,
    context?: ToolExecutionContext
  ): Promise<BoardDiagramAsset> {
    const kind: BoardDiagramKind = input.kind;
    const searchType = kind === 'sport_drill' ? 'drill' : 'play';
    const searchQuery = compactBoardQuery(
      `${input.title || searchType} ${input.description || ''} ${input.sport || ''} coaching ${searchType}`
    );
    const fallbackQuery = compactBoardQuery(
      `${input.title || `${input.sport || 'sports'} ${searchType}`} ${input.sport || ''} ${searchType} diagram`
    );

    logger.info('[BoardDiagramService] Diagram generation disabled. Redirecting to web search.', {
      kind,
      title: input.title,
      query: searchQuery,
    });

    try {
      // Use Tavily web search
      let response = await fetch(TAVILY_SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env['TAVILY_API_KEY'],
          query: searchQuery,
          max_results: 5,
          search_depth: 'advanced',
          include_answer: true,
          include_images: true,
        }),
        signal: context?.signal,
      });

      let effectiveQuery = searchQuery;

      // Tavily can reject verbose prompt-like queries with HTTP 400.
      // Retry once with a compact fallback query.
      if (!response.ok && response.status === 400 && fallbackQuery !== searchQuery) {
        logger.warn(
          '[BoardDiagramService] Tavily rejected primary query. Retrying with compact fallback query.',
          {
            kind,
            title: input.title,
            primaryQueryLength: searchQuery.length,
            fallbackQueryLength: fallbackQuery.length,
          }
        );

        response = await fetch(TAVILY_SEARCH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: process.env['TAVILY_API_KEY'],
            query: fallbackQuery,
            max_results: 5,
            search_depth: 'advanced',
            include_answer: true,
            include_images: true,
          }),
          signal: context?.signal,
        });

        effectiveQuery = fallbackQuery;
      }

      if (!response.ok) {
        throw new Error(`Tavily search failed: ${response.status} ${response.statusText}`);
      }

      type BoardTavilyImageItem = string | { url: string; description?: string };
      const data = (await response.json()) as {
        query: string;
        images?: BoardTavilyImageItem[];
        results: Array<{ title: string; url: string; content: string; published_date?: string }>;
      };
      const firstImg = data.images?.[0];
      const resolvedImageUrl = firstImg
        ? typeof firstImg === 'string'
          ? firstImg
          : firstImg.url
        : '';

      // Build a summary response with search results
      const userId = context?.userId || 'anonymous';
      const threadId = context?.threadId || null;
      const resultsText = data.results
        .map((r) => `• ${r.title} (${r.url})\n  ${r.content.slice(0, 200)}...`)
        .join('\n\n');

      const assetId = randomUUID();
      const now = Date.now();

      return {
        id: assetId,
        kind,
        sport: normalizeSportId(input.sport) as NormalizedSport,
        title:
          input.title ||
          `${searchType.charAt(0).toUpperCase() + searchType.slice(1)} Search Results`,
        description: `Web search results: ${effectiveQuery}`,
        imageUrl: resolvedImageUrl,
        userId,
        threadId,
        assetSource: 'external_image' as const,
        xmlContent: `<!-- Web Search Results for ${kind} diagram generation (currently disabled) -->\n${resultsText}`,
        deleted: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      } as unknown as BoardDiagramAsset;
    } catch (error) {
      logger.error('[BoardDiagramService] Web search failed', {
        query: searchQuery,
        error: error instanceof Error ? error.message : String(error),
      });

      const userId = context?.userId || 'anonymous';
      const threadId = context?.threadId || null;
      const now = Date.now();

      return {
        id: randomUUID(),
        kind,
        sport: normalizeSportId(input.sport) as NormalizedSport,
        title: input.title || `${searchType} Error`,
        description: 'Diagram generation failed',
        imageUrl: '',
        userId,
        threadId,
        assetSource: 'external_image' as const,
        xmlContent: `Error during search: ${error instanceof Error ? error.message : String(error)}`,
        deleted: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      } as unknown as BoardDiagramAsset;
    }
  }

  private normalizeManualLayout(
    layout: DiagramLayout,
    sport: NormalizedSport,
    title: string
  ): DiagramLayout {
    const normalized: DiagramLayout = {
      ...layout,
      sport,
      title,
      fieldStyle: layout.fieldStyle ?? 'classic',
      players: layout.players.map((player) => ({
        ...player,
        x: clampCoord(player.x, 10, layout.fieldWidth - 10, player.x),
        y: clampCoord(player.y, 10, layout.fieldHeight - 10, player.y),
        shape: coercePlayerShape(player.shape),
      })),
      routes: layout.routes.map((route, index) => ({
        ...route,
        id: route.id ?? `route-${index + 1}`,
        type: coerceRouteType(route.type),
        points: route.points.map(
          ([x, y]) =>
            [
              clampCoord(x, 5, layout.fieldWidth - 5, x),
              clampCoord(y, 5, layout.fieldHeight - 5, y),
            ] as [number, number]
        ),
      })),
      zones: layout.zones?.map((zone, index) => ({
        ...zone,
        id: zone.id || `zone-${index + 1}`,
        x: clampCoord(zone.x, 0, layout.fieldWidth - 10, zone.x),
        y: clampCoord(zone.y, 0, layout.fieldHeight - 10, zone.y),
        width: clampCoord(zone.width, 20, layout.fieldWidth, zone.width),
        height: clampCoord(zone.height, 20, layout.fieldHeight, zone.height),
      })),
    };

    if (
      sport === 'football' ||
      sport === 'basketball' ||
      sport === 'soccer' ||
      sport === 'baseball' ||
      sport === 'softball'
    ) {
      validateLayoutForSport(normalized);
    } else {
      validateDrillLayout(normalized);
    }

    return normalized;
  }

  /**
   * Regenerate an existing diagram asset with updated description or title.
   *
   * Process:
   *   1. Fetch existing asset (auth check included).
   *   2. Re-run LLM generation with the new description/title.
   *   3. Upload the new PNG.
   *   4. Patch the Firestore asset record.
   *   5. Delete the old PNG (non-fatal).
   *
   * The asset ID and all immutable fields (kind, sport, userId, createdAt) are preserved.
   */
  async updateDiagram(
    input: UpdateBoardDiagramInput,
    context?: ToolExecutionContext
  ): Promise<BoardDiagramAsset> {
    const extendedSportsEnabled = await isExtendedSportsEnabled(context);

    const assetService = this.getAssetService(context);
    const existing = await assetService.getById(input.assetId, input.userId);

    if (!existing) {
      throw new AgentEngineError(
        'BOARD_DIAGRAM_NOT_FOUND',
        `Diagram asset '${input.assetId}' not found or you do not have permission to update it.`
      );
    }

    const description = input.description ?? existing.description;
    const title = input.title ?? existing.title;
    const requestedTeamFocus = inferRequestedTeamFocus(title, description);

    logger.info('[BoardDiagramService] Updating diagram', {
      assetId: input.assetId,
      kind: existing.kind,
      sport: existing.sport,
      hasNewDescription: Boolean(input.description),
      hasNewTitle: Boolean(input.title),
    });

    try {
      const layout = await this.generateLayoutWithRetry(
        description,
        title,
        existing.sport,
        existing.kind,
        requestedTeamFocus,
        extendedSportsEnabled,
        undefined,
        context
      );

      let finalLayout: DiagramLayout;
      if (existing.kind === 'sport_play') {
        const conceptText = `${title} ${description}`.trim();
        finalLayout = enhanceLayoutForConcept(layout, conceptText);
      } else {
        finalLayout = enhanceDrillLayout(cleanDrillLayout(layout));
      }

      // Upload the new PNG before patching the asset record
      const { pngStoragePath: newStoragePath, svgStoragePath: newSvgStoragePath } =
        this.buildStoragePaths(title, context);
      const { imageUrl, svgUrl, xmlContent, editUrl } = await this.renderAndUpload(
        finalLayout,
        newStoragePath,
        newSvgStoragePath,
        context,
        undefined,
        requestedTeamFocus
      );

      const updated = await assetService.patch(input.assetId, input.userId, {
        title,
        description,
        imageUrl,
        storagePath: newStoragePath,
        svgUrl,
        svgStoragePath: newSvgStoragePath,
        xmlContent,
        editUrl,
        sourceLayout: finalLayout,
        updatedAt: Date.now(),
      });

      if (!updated) {
        throw new AgentEngineError(
          'BOARD_DIAGRAM_EXPORT_FAILED',
          'Failed to patch asset record after successful render.'
        );
      }

      // Non-fatal: delete the old PNG after the Firestore record is safely updated
      if (existing.storagePath && existing.storagePath !== newStoragePath) {
        await this.deletePng(existing.storagePath, context);
      }

      if (existing.svgStoragePath && existing.svgStoragePath !== newSvgStoragePath) {
        await this.deleteSvg(existing.svgStoragePath, context);
      }

      logger.info('[BoardDiagramService] Diagram updated', { assetId: updated.id });

      return updated;
    } catch (error) {
      if (isAgentEngineError(error)) throw error;

      throw new AgentEngineError(
        'BOARD_DIAGRAM_EXPORT_FAILED',
        error instanceof Error ? error.message : 'Board diagram update failed',
        { cause: error }
      );
    }
  }

  async saveManualEdits(
    input: {
      readonly assetId: string;
      readonly userId: string;
      readonly sourceLayout: DiagramLayout;
      readonly title?: string;
      readonly description?: string;
    },
    context?: ToolExecutionContext
  ): Promise<BoardDiagramAsset> {
    const assetService = this.getAssetService(context);
    const existing = await assetService.getById(input.assetId, input.userId);

    if (!existing) {
      throw new AgentEngineError(
        'BOARD_DIAGRAM_NOT_FOUND',
        `Diagram asset '${input.assetId}' not found or you do not have permission to update it.`
      );
    }

    const title = input.title?.trim() || existing.title;
    const description = input.description?.trim() || existing.description;
    const requestedTeamFocus = inferRequestedTeamFocus(title, description);
    const normalizedLayout = this.normalizeManualLayout(input.sourceLayout, existing.sport, title);

    const { pngStoragePath: newStoragePath, svgStoragePath: newSvgStoragePath } =
      this.buildStoragePaths(title, context);
    const { imageUrl, svgUrl, xmlContent, editUrl } = await this.renderAndUpload(
      normalizedLayout,
      newStoragePath,
      newSvgStoragePath,
      context,
      existing.kind,
      requestedTeamFocus
    );

    const updated = await assetService.patch(input.assetId, input.userId, {
      title,
      description,
      imageUrl,
      storagePath: newStoragePath,
      svgUrl,
      svgStoragePath: newSvgStoragePath,
      xmlContent,
      editUrl,
      sourceLayout: normalizedLayout,
      updatedAt: Date.now(),
    });

    if (!updated) {
      throw new AgentEngineError(
        'BOARD_DIAGRAM_EXPORT_FAILED',
        'Failed to patch asset record after successful manual diagram render.'
      );
    }

    if (existing.storagePath && existing.storagePath !== newStoragePath) {
      await this.deletePng(existing.storagePath, context);
    }

    if (existing.svgStoragePath && existing.svgStoragePath !== newSvgStoragePath) {
      await this.deleteSvg(existing.svgStoragePath, context);
    }

    logger.info('[BoardDiagramService] Manual diagram edits saved', {
      assetId: updated.id,
      kind: updated.kind,
      sport: updated.sport,
    });

    return updated;
  }

  /**
   * Soft-delete a diagram asset and remove its backing storage PNG/SVG assets.
   *
   * Process:
   *   1. Fetch existing asset (auth check included).
   *   2. Soft-delete Firestore record (deleted=true, deletedAt=now).
   *   3. Delete storage assets (non-fatal failure).
   */
  async deleteDiagram(
    input: DeleteBoardDiagramInput,
    context?: ToolExecutionContext
  ): Promise<void> {
    const assetService = this.getAssetService(context);
    const existing = await assetService.getById(input.assetId, input.userId);

    if (!existing) {
      throw new AgentEngineError(
        'BOARD_DIAGRAM_NOT_FOUND',
        `Diagram asset '${input.assetId}' not found or you do not have permission to delete it.`
      );
    }

    // Firestore soft-delete first — this is the authoritative mutation
    const deleted = await assetService.softDelete(input.assetId, input.userId);

    if (!deleted) {
      throw new AgentEngineError(
        'BOARD_DIAGRAM_EXPORT_FAILED',
        'Failed to soft-delete asset record.'
      );
    }

    // Storage cleanup is non-fatal — a failed asset delete does not roll back the record
    await this.deletePng(existing.storagePath, context);
    if (existing.svgStoragePath) {
      await this.deleteSvg(existing.svgStoragePath, context);
    }

    logger.info('[BoardDiagramService] Diagram deleted', {
      assetId: input.assetId,
      userId: input.userId,
    });
  }

  /**
   * Retrieve an asset by ID with authorization check.
   * Returns null when the asset does not exist, is deleted, or belongs to a different user.
   */
  async getAsset(
    assetId: string,
    userId: string,
    context?: ToolExecutionContext
  ): Promise<BoardDiagramAsset | null> {
    return this.getAssetService(context).getById(assetId, userId);
  }
}
