/**
 * @fileoverview BoardDiagramService — Orchestrator for the Board Diagram Platform.
 *
 * Handles the full lifecycle for both sport_play and sport_drill diagrams:
 *   create  → LLM layout generation → SVG render → PNG upload → Firestore persist
 *   update  → LLM re-generation → SVG render → new PNG upload → Firestore patch → old PNG delete
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
import {
  coercePlayerShape,
  coerceRouteType,
  enhanceLayoutForConcept,
} from '../play-diagram/shared/layout-enhancement.js';
import { validateLayoutForSport } from '../play-diagram/shared/layout-validation.js';
import { layoutToMxGraphModel } from '../play-diagram/shared/mxgraph.js';
import { clampCoord, renderDiagramSvg } from '../play-diagram/shared/svg-helpers.js';
import type {
  DiagramLayout,
  DiagramPlayer,
  DiagramRoute,
  NormalizedSport,
} from '../play-diagram/shared/diagram.types.js';

// ── Board-diagram specific ───────────────────────────────────────────────────
import { validateDrillLayout } from './shared/drill-validation.js';
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
const LLM_TIMEOUT_MS = 60_000;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 440;
const MAX_LAYOUT_ATTEMPTS = 2;

// ─── Private utilities ────────────────────────────────────────────────────────

function buildUserPrompt(
  description: string,
  title: string,
  sport: NormalizedSport,
  xmlTemplate?: string
): string {
  let prompt = `Sport: ${sport}\nTitle: ${title}\nDescription: ${description}`;
  if (xmlTemplate) {
    prompt += `\n\nBase layout JSON to adapt:\n${xmlTemplate}`;
  }
  prompt +=
    '\n\nOutput the JSON layout for this diagram. Ensure coordinates are in bounds. Raw JSON only.';
  return prompt;
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
  kind: BoardDiagramKind
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
  const sport = applySportFeatureFlag(sportFromPayload);

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
    .map(
      (route): DiagramRoute => ({
        from: typeof route['from'] === 'string' ? route['from'] : '',
        label: typeof route['label'] === 'string' ? route['label'] : undefined,
        type: coerceRouteType(route['type']),
        curve: typeof route['curve'] === 'boolean' ? route['curve'] : undefined,
        points: (route['points'] as Array<[number, number]>).map(([x, y]) => [
          clampCoord(x, 5, fieldWidth - 5, 50),
          clampCoord(y, 5, fieldHeight - 5, 200),
        ]),
      })
    );

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
  constructor(private readonly llm: OpenRouterService) {}

  // ─── Private helpers ────────────────────────────────────────────────────

  private getAssetService(context?: ToolExecutionContext): BoardDiagramAssetService {
    return new BoardDiagramAssetService(resolveFirestoreDb(context));
  }

  private buildStoragePath(title: string, context?: ToolExecutionContext): string {
    const timestamp = Date.now();
    const id = randomUUID().slice(0, 8);
    const filename = `${sanitizeFileName(title)}-${timestamp}-${id}.png`;

    if (context?.userId && context?.threadId) {
      return `Users/${context.userId}/threads/${context.threadId}/media/board-diagrams/${filename}`;
    }

    return `agent-board-diagrams/${filename}`;
  }

  private async uploadPng(
    pngBuffer: Buffer,
    storagePath: string,
    context?: ToolExecutionContext
  ): Promise<string> {
    const storageInstance = resolveStorage(context);
    const bucket = storageInstance.bucket();
    const file = bucket.file(storagePath);

    await file.save(pngBuffer, {
      contentType: 'image/png',
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });
    await file.makePublic();

    const [exists] = await file.exists();
    if (!exists) {
      throw new AgentEngineError(
        'BOARD_DIAGRAM_EXPORT_EMPTY',
        `Upload did not persist: gs://${bucket.name}/${storagePath}`
      );
    }

    const encodedPath = storagePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `https://storage.googleapis.com/${bucket.name}/${encodedPath}`;
  }

  /**
   * Delete a storage PNG. Non-fatal — logs a warning on failure so that a
   * missed cleanup never blocks the caller's success path.
   */
  private async deletePng(storagePath: string, context?: ToolExecutionContext): Promise<void> {
    try {
      const storageInstance = resolveStorage(context);
      const bucket = storageInstance.bucket();
      await bucket.file(storagePath).delete();
      logger.info('[BoardDiagramService] Deleted storage PNG', { storagePath });
    } catch (error) {
      logger.warn('[BoardDiagramService] Failed to delete storage PNG (non-fatal)', {
        storagePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async generateLayoutWithRetry(
    description: string,
    title: string,
    sport: NormalizedSport,
    kind: BoardDiagramKind,
    xmlTemplate: string | undefined,
    context?: ToolExecutionContext
  ): Promise<DiagramLayout> {
    const renderer = getSportRenderer(sport);
    const systemPrompt = buildSystemPromptForKind(sport, kind);
    let previousError: string | null = null;

    for (let attempt = 1; attempt <= MAX_LAYOUT_ATTEMPTS; attempt += 1) {
      const basePrompt = buildUserPrompt(description, title, sport, xmlTemplate);
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
          tier: 'prompt_engineering',
          maxTokens: 2400,
          temperature: 0.2,
          timeoutMs: LLM_TIMEOUT_MS,
          telemetryContext: context
            ? {
                operationId: randomUUID(),
                userId: context.userId ?? 'unknown',
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

        const layout = parseLlmLayout(rawOutput, sport, renderer.defaultLosY, kind);

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
    storagePath: string,
    context?: ToolExecutionContext
  ): Promise<{ imageUrl: string; xmlContent: string; editUrl: string }> {
    const renderer = getSportRenderer(layout.sport);
    const fieldSvg = renderer.renderField(layout);
    const svgString = renderDiagramSvg(layout, fieldSvg);
    const pngBuffer = await convertSvgToPng(svgString);
    const imageUrl = await this.uploadPng(pngBuffer, storagePath, context);
    const mxXml = layoutToMxGraphModel(layout);
    const editUrl = buildEditUrl(mxXml);

    return { imageUrl, xmlContent: mxXml, editUrl };
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
    const requestedSport = applySportFeatureFlag(normalizeSportId(input.sport));
    const kind: BoardDiagramKind = input.kind ?? 'sport_play';
    const title =
      input.title ??
      `${requestedSport.charAt(0).toUpperCase() + requestedSport.slice(1)} ${kind === 'sport_drill' ? 'Drill' : 'Play'}`;

    logger.info('[BoardDiagramService] Creating diagram', {
      requestedSport,
      title,
      kind,
      hasTemplate: Boolean(input.xmlTemplate),
    });

    try {
      const layout = await this.generateLayoutWithRetry(
        input.description,
        title,
        requestedSport,
        kind,
        input.xmlTemplate,
        context
      );

      const conceptText = `${input.title ?? ''} ${input.description}`.trim();
      const enhancedLayout = enhanceLayoutForConcept(layout, conceptText);
      const finalLayout =
        kind === 'sport_drill' ? cleanDrillLayout(enhancedLayout) : enhancedLayout;

      const storagePath = this.buildStoragePath(title, context);
      const { imageUrl, xmlContent, editUrl } = await this.renderAndUpload(
        finalLayout,
        storagePath,
        context
      );

      const now = Date.now();
      const assetService = this.getAssetService(context);

      const asset = await assetService.create({
        kind,
        sport: enhancedLayout.sport,
        title,
        description: input.description,
        imageUrl,
        storagePath,
        xmlContent,
        editUrl,
        sourceLayout: finalLayout,
        userId: context?.userId ?? 'unknown',
        threadId: context?.threadId ?? null,
        deleted: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      logger.info('[BoardDiagramService] Diagram created', {
        assetId: asset.id,
        kind,
        sport: asset.sport,
        storagePath,
        imageBytes: (await convertSvgToPng(renderDiagramSvg(finalLayout, ''))).length,
      });

      return asset;
    } catch (error) {
      if (isAgentEngineError(error)) throw error;

      throw new AgentEngineError(
        'BOARD_DIAGRAM_EXPORT_FAILED',
        error instanceof Error ? error.message : 'Board diagram generation failed',
        { cause: error }
      );
    }
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
        undefined,
        context
      );

      const conceptText = `${title} ${description}`.trim();
      const enhancedLayout = enhanceLayoutForConcept(layout, conceptText);
      const finalLayout =
        existing.kind === 'sport_drill' ? cleanDrillLayout(enhancedLayout) : enhancedLayout;

      // Upload the new PNG before patching the asset record
      const newStoragePath = this.buildStoragePath(title, context);
      const { imageUrl, xmlContent, editUrl } = await this.renderAndUpload(
        finalLayout,
        newStoragePath,
        context
      );

      const updated = await assetService.patch(input.assetId, input.userId, {
        title,
        description,
        imageUrl,
        storagePath: newStoragePath,
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
      if (existing.storagePath !== newStoragePath) {
        await this.deletePng(existing.storagePath, context);
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

  /**
   * Soft-delete a diagram asset and remove its backing storage PNG.
   *
   * Process:
   *   1. Fetch existing asset (auth check included).
   *   2. Soft-delete Firestore record (deleted=true, deletedAt=now).
   *   3. Delete storage PNG (non-fatal failure).
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

    // Storage cleanup is non-fatal — a failed PNG delete does not roll back the record
    await this.deletePng(existing.storagePath, context);

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
