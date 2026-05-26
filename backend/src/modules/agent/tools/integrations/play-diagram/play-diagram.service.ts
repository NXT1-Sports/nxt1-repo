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
import {
  evaluateLayoutQualityForSport,
  validateLayoutForSport,
} from './shared/layout-validation.js';
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
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

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

function coerceRouteColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return HEX_COLOR_REGEX.test(trimmed) ? trimmed.toLowerCase() : undefined;
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
        color: coerceRouteColor(route['color']),
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

  private summarizeQualityErrors(raw: string, maxItems = 3): string {
    const items = raw
      .split('\n')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .slice(0, maxItems);
    return items.join('; ');
  }

  private async generateLayoutWithRetry(
    input: CreatePlayDiagramInput,
    sport: NormalizedSport,
    extendedSportsEnabled: boolean,
    context: ToolExecutionContext | undefined
  ): Promise<DiagramLayout> {
    const renderer = getSportRenderer(sport);
    const systemPrompt = buildSystemPrompt(sport);
    const conceptText = `${input.title ?? ''} ${input.description}`.trim();

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
          telemetryContext:
            context?.operationId && context.userId
              ? {
                  operationId: context.operationId,
                  userId: context.userId,
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
        const enhancedLayout = enhanceLayoutForConcept(layout, conceptText);
        const quality = evaluateLayoutQualityForSport(enhancedLayout, conceptText);
        const qualityIssues = quality.findings
          .filter((item) => item.severity === 'critical' || item.severity === 'major')
          .map((item) => `${item.severity.toUpperCase()} ${item.code}: ${item.message}`);

        if (quality.hasCritical) {
          const message = this.summarizeQualityErrors(qualityIssues.join('\n'));
          if (attempt >= MAX_LAYOUT_ATTEMPTS) {
            throw new AgentEngineError(
              'PLAY_DIAGRAM_LLM_INVALID_LAYOUT',
              `Critical football quality checks failed after retries: ${message}`
            );
          }

          previousError = `Critical quality checks failed. ${message}`;
          logger.warn('[PlayDiagramService] Retrying critical quality failure', {
            sport,
            attempt,
            score: quality.score,
            findings: quality.findings,
          });
          continue;
        }

        if (quality.hasMajor && attempt < MAX_LAYOUT_ATTEMPTS) {
          previousError = `Major quality checks failed. ${this.summarizeQualityErrors(qualityIssues.join('\n'))}`;
          logger.warn('[PlayDiagramService] Retrying major quality failure', {
            sport,
            attempt,
            score: quality.score,
            findings: quality.findings,
          });
          continue;
        }

        if (quality.hasMajor) {
          logger.warn('[PlayDiagramService] Persisting with unresolved major quality findings', {
            sport,
            attempt,
            score: quality.score,
            findings: quality.findings,
          });
        }

        const minorCount = quality.findings.filter((item) => item.severity === 'minor').length;
        logger.info('[PlayDiagramService] Layout generation succeeded', {
          sport,
          attempt,
          players: enhancedLayout.players.length,
          routes: enhancedLayout.routes.length,
          qualityScore: quality.score,
          qualityMinorFindings: minorCount,
          qualityMajorFindings: quality.findings.filter((item) => item.severity === 'major').length,
        });
        return enhancedLayout;
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
      const quality = evaluateLayoutQualityForSport(
        layout,
        `${input.title ?? ''} ${input.description}`.trim()
      );

      const resolvedRenderer = getSportRenderer(layout.sport);
      const fieldSvg = resolvedRenderer.renderField(layout);
      const svgString = renderDiagramSvg(layout, fieldSvg);
      const pngBuffer = await convertSvgToPng(svgString);
      const { publicUrl, storagePath } = await uploadToStorage(pngBuffer, title, context);

      const mxXml = layoutToMxGraphModel(layout);
      const editUrl = await buildEditUrl(mxXml);

      logger.info('[PlayDiagramService] Generation complete', {
        sport: layout.sport,
        storagePath,
        imageBytes: pngBuffer.length,
        qualityScore: quality.score,
        qualityCriticalFindings: quality.findings.filter((item) => item.severity === 'critical')
          .length,
        qualityMajorFindings: quality.findings.filter((item) => item.severity === 'major').length,
        qualityMinorFindings: quality.findings.filter((item) => item.severity === 'minor').length,
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
