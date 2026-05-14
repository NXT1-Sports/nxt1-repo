/**
 * @fileoverview PlayDiagramService — Orchestrator for sport-aware play diagram generation.
 */

import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
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
import { buildSystemPrompt } from './prompts/index.js';
import { getSportRenderer } from './renderers/index.js';
import { applySportFeatureFlag, normalizeSportId } from './sport-normalization.js';
import { getFeatureFlagsService } from '../../../../../config/feature-flags/index.js';
import { getFirestore } from 'firebase-admin/firestore';
import {
  coercePlayerShape,
  coerceRouteType,
  enhanceLayoutForConcept,
} from './shared/layout-enhancement.js';
import { validateLayoutForSport } from './shared/layout-validation.js';
import { layoutToMxGraphModel } from './shared/mxgraph.js';
import { clampCoord, renderDiagramSvg } from './shared/svg-helpers.js';
import type {
  DiagramLayout,
  DiagramPlayer,
  DiagramRoute,
  NormalizedSport,
} from './shared/diagram.types.js';
import type { CreatePlayDiagramInput, PlayDiagramResult } from './schemas.js';

const DIAGRAMS_EDITOR_BASE = 'https://app.diagrams.net/';
const LLM_TIMEOUT_MS = 60_000;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 440;
const MAX_LAYOUT_ATTEMPTS = 2;

function buildUserPrompt(input: CreatePlayDiagramInput, sport: NormalizedSport): string {
  const title = input.title ?? 'Play Diagram';
  let prompt = `Sport: ${sport}\nTitle: ${title}\nDescription: ${input.description}`;

  if (input.xmlTemplate) {
    prompt += `\n\nBase layout JSON to adapt:\n${input.xmlTemplate}`;
  }

  prompt +=
    '\n\nOutput the JSON layout for this play. Ensure route points accurately represent the described movement and are in bounds. Raw JSON only.';
  return prompt;
}

function sanitizeFileName(input: string): string {
  const trimmed = input.trim();
  const lowered = trimmed.toLowerCase();
  const replaced = lowered.replace(/[^a-z0-9._-]+/g, '-');
  const cleaned = replaced.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned.length > 0 ? cleaned : 'play-diagram';
}

async function convertSvgToPng(svgString: string): Promise<Buffer> {
  return sharp(Buffer.from(svgString, 'utf-8'), { density: 144 })
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toBuffer();
}

async function buildEditUrl(mxXml: string): Promise<string> {
  const encodedXml = encodeURIComponent(mxXml);
  return `${DIAGRAMS_EDITOR_BASE}#R${encodedXml}`;
}

async function uploadToStorage(
  pngBuffer: Buffer,
  title: string,
  context: ToolExecutionContext | undefined
): Promise<{ publicUrl: string; storagePath: string }> {
  const timestamp = Date.now();
  const id = randomUUID().slice(0, 8);
  const filename = `${sanitizeFileName(title)}-${timestamp}-${id}.png`;

  const storagePath =
    context?.userId && context?.threadId
      ? `Users/${context.userId}/threads/${context.threadId}/media/play-diagrams/${filename}`
      : `agent-play-diagrams/${filename}`;

  const storageInstance =
    context?.environment === 'staging'
      ? stagingStorage
      : context?.environment === 'production'
        ? defaultStorage
        : process.env['NODE_ENV'] === 'staging'
          ? stagingStorage
          : defaultStorage;

  const bucket = storageInstance.bucket();
  const file = bucket.file(storagePath);

  try {
    await file.save(pngBuffer, {
      contentType: 'image/png',
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });
    await file.makePublic();

    const [exists] = await file.exists();
    if (!exists) {
      throw new AgentEngineError(
        'PLAY_DIAGRAM_EXPORT_EMPTY',
        `Upload did not persist: gs://${bucket.name}/${storagePath}`
      );
    }

    const encodedPath = storagePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodedPath}`;
    return { publicUrl, storagePath };
  } catch (error) {
    logger.error('[PlayDiagramService] Failed storage upload', {
      storagePath,
      pngBytes: pngBuffer.length,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AgentEngineError(
      'PLAY_DIAGRAM_EXPORT_FAILED',
      'Failed to upload generated play diagram to storage.',
      { cause: error }
    );
  }
}

function parseLlmLayout(
  raw: string,
  requestedSport: NormalizedSport,
  fallbackLosY: number,
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
      'PLAY_DIAGRAM_LLM_INVALID_LAYOUT',
      `LLM output is not valid JSON: ${String(error)}. Preview: ${cleaned.slice(0, 220)}`
    );
  }

  const obj = parsed as Record<string, unknown>;
  const sportFromPayload =
    typeof obj['sport'] === 'string' ? normalizeSportId(obj['sport']) : requestedSport;
  const sport = applySportFeatureFlag(sportFromPayload, extendedSportsEnabled);

  if (!Array.isArray(obj['players']) || !Array.isArray(obj['routes'])) {
    throw new AgentEngineError(
      'PLAY_DIAGRAM_LLM_INVALID_LAYOUT',
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

  const layout: DiagramLayout = {
    sport,
    title:
      typeof obj['title'] === 'string' && obj['title'].trim()
        ? obj['title'].trim()
        : 'Play Diagram',
    fieldWidth,
    fieldHeight,
    losY,
    players,
    routes,
  };

  validateLayoutForSport(layout);
  return layout;
}

export class PlayDiagramService {
  constructor(private readonly llm: OpenRouterService) {}

  private async generateLayoutWithRetry(
    input: CreatePlayDiagramInput,
    sport: NormalizedSport,
    extendedSportsEnabled: boolean,
    context: ToolExecutionContext | undefined
  ): Promise<DiagramLayout> {
    const renderer = getSportRenderer(sport);
    const systemPrompt = buildSystemPrompt(sport);

    let previousError: string | null = null;

    for (let attempt = 1; attempt <= MAX_LAYOUT_ATTEMPTS; attempt += 1) {
      const prompt =
        previousError === null
          ? buildUserPrompt(input, sport)
          : `${buildUserPrompt(input, sport)}\n\nIMPORTANT: Previous layout was invalid: ${previousError}. Regenerate valid JSON with players[], routes[], and route.from values that match player ids.`;

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
                feature: 'play-diagrams',
              }
            : undefined,
          signal: context?.signal,
        }
      );

      try {
        const rawOutput = completion.content?.trim() ?? '';
        if (!rawOutput) {
          throw new AgentEngineError(
            'PLAY_DIAGRAM_LLM_INVALID_LAYOUT',
            'LLM returned empty layout output.'
          );
        }

        const layout = parseLlmLayout(
          rawOutput,
          sport,
          renderer.defaultLosY,
          extendedSportsEnabled
        );
        logger.info('[PlayDiagramService] Layout generation succeeded', {
          sport,
          attempt,
          players: layout.players.length,
          routes: layout.routes.length,
        });
        return layout;
      } catch (error) {
        const code = getAgentEngineErrorCode(error);
        if (code !== 'PLAY_DIAGRAM_LLM_INVALID_LAYOUT' || attempt >= MAX_LAYOUT_ATTEMPTS) {
          throw error;
        }

        previousError = error instanceof Error ? error.message : 'Unknown layout validation error';
        logger.warn('[PlayDiagramService] Retrying invalid layout', {
          sport,
          attempt,
          previousError,
        });
      }
    }

    throw new AgentEngineError(
      'PLAY_DIAGRAM_LLM_INVALID_LAYOUT',
      'Unable to generate a valid layout after retries.'
    );
  }

  async createDiagram(
    input: CreatePlayDiagramInput,
    context?: ToolExecutionContext
  ): Promise<PlayDiagramResult> {
    const extendedSportsEnabled = await getFeatureFlagsService(getFirestore()).isEnabled(
      'ai.play.diagram.extended.sports.enabled'
    );
    const requestedSport = applySportFeatureFlag(
      normalizeSportId(input.sport),
      extendedSportsEnabled
    );
    const title = input.title ?? `${requestedSport} Diagram`;

    logger.info('[PlayDiagramService] Start generation', {
      requestedSport,
      title,
      hasTemplate: Boolean(input.xmlTemplate),
      extendedSportsEnabled,
    });

    try {
      const layout = await this.generateLayoutWithRetry(
        input,
        requestedSport,
        extendedSportsEnabled,
        context
      );
      const conceptText = `${input.title ?? ''} ${input.description}`.trim();
      const enhancedLayout = enhanceLayoutForConcept(layout, conceptText);

      const resolvedRenderer = getSportRenderer(enhancedLayout.sport);
      const fieldSvg = resolvedRenderer.renderField(enhancedLayout);
      const svgString = renderDiagramSvg(enhancedLayout, fieldSvg);
      const pngBuffer = await convertSvgToPng(svgString);
      const { publicUrl, storagePath } = await uploadToStorage(pngBuffer, title, context);

      const mxXml = layoutToMxGraphModel(enhancedLayout);
      const editUrl = await buildEditUrl(mxXml);

      logger.info('[PlayDiagramService] Generation complete', {
        sport: enhancedLayout.sport,
        storagePath,
        imageBytes: pngBuffer.length,
      });

      return {
        imageUrl: publicUrl,
        xmlContent: mxXml,
        editUrl,
        title,
        storagePath,
      };
    } catch (error) {
      if (isAgentEngineError(error)) {
        throw error;
      }

      throw new AgentEngineError(
        'PLAY_DIAGRAM_EXPORT_FAILED',
        error instanceof Error ? error.message : 'Play diagram generation failed',
        { cause: error }
      );
    }
  }
}
