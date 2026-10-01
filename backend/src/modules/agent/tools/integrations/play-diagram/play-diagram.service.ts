/**
 * @fileoverview PlayDiagramService — temporary Tavily-backed fallback while
 * play diagram generation is disabled.
 */

import { logger } from '../../../../../utils/logger.js';
import type { OpenRouterService } from '../../../llm/openrouter.service.js';
import type { ToolExecutionContext } from '../../base.tool.js';
import type { CreatePlayDiagramInput, PlayDiagramResult } from './schemas.js';

const DIAGRAMS_EDITOR_BASE = 'https://app.diagrams.net/';
const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const MAX_QUERY_LENGTH = 380;
const MIN_IMAGE_SCORE = 2;

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'your',
  'you',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
  'about',
  'over',
  'under',
]);

type TavilyImageItem = string | { readonly url: string; readonly description?: string };

type ResolvedImageCandidate = {
  readonly url: string;
  readonly description: string;
};

function extractImageUrl(item: TavilyImageItem): string {
  return typeof item === 'string' ? item : item.url;
}

function extractImageDescription(item: TavilyImageItem): string {
  return typeof item === 'string' ? '' : item.description || '';
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function getResultHosts(results: TavilySearchResponse['results']): Set<string> {
  const hosts = new Set<string>();

  for (const result of results) {
    try {
      hosts.add(new URL(result.url).hostname.replace(/^www\./, '').toLowerCase());
    } catch {
      // Ignore invalid URLs from external providers.
    }
  }

  return hosts;
}

function resolveImageCandidates(images?: ReadonlyArray<TavilyImageItem>): ResolvedImageCandidate[] {
  if (!images?.length) return [];

  const uniqueByUrl = new Map<string, ResolvedImageCandidate>();

  for (const image of images) {
    const url = extractImageUrl(image).trim();
    if (!url) continue;

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    } catch {
      continue;
    }

    if (!uniqueByUrl.has(url)) {
      uniqueByUrl.set(url, {
        url,
        description: extractImageDescription(image).trim(),
      });
    }
  }

  return Array.from(uniqueByUrl.values());
}

function scoreImageCandidate(
  candidate: ResolvedImageCandidate,
  queryTerms: Set<string>,
  resultHosts: Set<string>
): number {
  let score = 0;
  const candidateTerms = new Set(tokenize(`${candidate.description} ${candidate.url}`));

  for (const term of queryTerms) {
    if (candidateTerms.has(term)) score += 2;
  }

  const urlLower = candidate.url.toLowerCase();
  const descriptionLower = candidate.description.toLowerCase();
  const DIAGRAM_KEYWORDS = [
    'playbook',
    'diagram',
    'drill',
    'formation',
    'coverage',
    'route',
    'scheme',
    'tactic',
    'x-and-o',
    'xs-and-os',
    'play-call',
    'playcall',
    'chalkboard',
    'whiteboard',
    'board',
  ];
  if (
    DIAGRAM_KEYWORDS.some(
      (keyword) => urlLower.includes(keyword) || descriptionLower.includes(keyword)
    )
  ) {
    score += 2;
  }

  try {
    const host = new URL(candidate.url).hostname.replace(/^www\./, '').toLowerCase();
    if (resultHosts.has(host)) score += 2;
  } catch {
    // Ignore host scoring for invalid URL parse.
  }

  return score;
}

function pickBestImage(
  input: CreatePlayDiagramInput,
  searchQuery: string,
  images: ReadonlyArray<TavilyImageItem> | undefined,
  results: TavilySearchResponse['results']
): string {
  const candidates = resolveImageCandidates(images);
  if (!candidates.length) return '';

  const queryTerms = new Set(
    tokenize(`${searchQuery} ${input.title || ''} ${input.description || ''} ${input.sport || ''}`)
  );
  const resultHosts = getResultHosts(results);

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreImageCandidate(candidate, queryTerms, resultHosts),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  return best && best.score >= MIN_IMAGE_SCORE ? best.candidate.url : '';
}

type TavilySearchResponse = {
  readonly query: string;
  readonly images?: ReadonlyArray<TavilyImageItem>;
  readonly results: ReadonlyArray<{
    readonly title: string;
    readonly url: string;
    readonly content: string;
    readonly published_date?: string;
  }>;
};

function buildSearchQuery(input: CreatePlayDiagramInput): string {
  const raw = `${input.title || 'play'} ${input.description || ''} ${input.sport || ''} playbook diagram`;
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
}

function buildFallbackQuery(input: CreatePlayDiagramInput): string {
  const sportLabel = input.sport || 'sports';
  return `${input.title || `${sportLabel} play`} ${input.sport || ''} diagram`
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function buildXmlContent(searchQuery: string, results: TavilySearchResponse['results']): string {
  const resultLines = results.length
    ? results
        .map(
          (result, index) =>
            `<!-- Result ${index + 1}: ${result.title} -->\n` +
            `<!-- URL: ${result.url} -->\n` +
            `<!-- Published: ${result.published_date || 'unknown'} -->\n` +
            `<!-- Content: ${result.content.slice(0, 400)} -->`
        )
        .join('\n')
    : '<!-- No search results returned. -->';

  return [
    '<!-- Web Search Results for Play Diagram Generation (currently disabled) -->',
    `<!-- Query: ${searchQuery} -->`,
    resultLines,
  ].join('\n');
}

async function runTavilySearch(query: string, context?: ToolExecutionContext): Promise<Response> {
  return fetch(TAVILY_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env['TAVILY_API_KEY'],
      query,
      max_results: 10,
      search_depth: 'advanced',
      include_answer: true,
      include_images: true,
      // Without this flag Tavily returns bare image URLs with no alt-text,
      // which starves the relevance scorer of the terms it needs to match
      // candidates against the request. This was the primary cause of
      // "no candidate found" results even when relevant images existed.
      include_image_descriptions: true,
    }),
    signal: context?.signal,
  });
}

export class PlayDiagramService {
  constructor(llm: OpenRouterService) {
    void llm;
  }

  async execute(
    input: CreatePlayDiagramInput,
    context?: ToolExecutionContext
  ): Promise<PlayDiagramResult> {
    logger.info(
      '[PlayDiagramService] Play diagram generation is disabled. Redirecting to web search.',
      {
        title: input.title,
        description: input.description,
      }
    );

    const searchQuery = buildSearchQuery(input);
    const fallbackQuery = buildFallbackQuery(input);

    try {
      let response = await runTavilySearch(searchQuery, context);

      let effectiveQuery = searchQuery;

      // Tavily can reject very long/verbose prompt-style queries with HTTP 400.
      // Retry once with a compact query to avoid first-attempt failures.
      if (!response.ok && response.status === 400 && fallbackQuery !== searchQuery) {
        logger.warn(
          '[PlayDiagramService] Tavily rejected primary query. Retrying with compact fallback query.',
          {
            primaryQueryLength: searchQuery.length,
            fallbackQueryLength: fallbackQuery.length,
            title: input.title,
          }
        );

        response = await runTavilySearch(fallbackQuery, context);

        effectiveQuery = fallbackQuery;
      }

      if (!response.ok) {
        throw new Error(`Tavily search failed: ${response.status} ${response.statusText}`);
      }

      let data = (await response.json()) as TavilySearchResponse;
      let imageUrl = pickBestImage(input, effectiveQuery, data.images, data.results);
      let xmlContent = buildXmlContent(effectiveQuery, data.results);

      if (!imageUrl && fallbackQuery !== effectiveQuery) {
        logger.info(
          '[PlayDiagramService] Primary search returned no usable candidate. Retrying with compact fallback query.',
          {
            primaryQueryLength: effectiveQuery.length,
            fallbackQueryLength: fallbackQuery.length,
            title: input.title,
          }
        );

        const fallbackResponse = await runTavilySearch(fallbackQuery, context);
        if (!fallbackResponse.ok) {
          throw new Error(
            `Tavily fallback search failed: ${fallbackResponse.status} ${fallbackResponse.statusText}`
          );
        }

        const fallbackData = (await fallbackResponse.json()) as TavilySearchResponse;
        const fallbackImageUrl = pickBestImage(
          input,
          fallbackQuery,
          fallbackData.images,
          fallbackData.results
        );

        xmlContent = [
          buildXmlContent(effectiveQuery, data.results),
          '<!-- Fallback query retried because no usable candidate was found in the primary search. -->',
          buildXmlContent(fallbackQuery, fallbackData.results),
        ].join('\n');

        if (fallbackImageUrl) {
          data = fallbackData;
          imageUrl = fallbackImageUrl;
          effectiveQuery = fallbackQuery;
        }
      }

      return {
        title: input.title || 'Play Search Results',
        imageUrl,
        xmlContent,
        editUrl: `${DIAGRAMS_EDITOR_BASE}#proto=json`,
        resultStatus: imageUrl ? 'candidate_found' : 'no_candidate_found',
        ...(imageUrl
          ? {}
          : {
              failureReason:
                'Web search completed, including one fallback retry, but no candidate image met the play-diagram match threshold for this request.',
            }),
        storagePath: undefined,
        generationMode: 'auto',
      };
    } catch (error) {
      logger.error('[PlayDiagramService] Web search failed', {
        query: searchQuery,
        fallbackQuery,
        error: error instanceof Error ? error.message : String(error),
      });

      const errorXml = [
        '<!-- Web Search Failed -->',
        `<!-- Query: ${searchQuery} -->`,
        `<!-- Error: ${error instanceof Error ? error.message : String(error)} -->`,
      ].join('\n');

      return {
        title: input.title || 'Play Search Error',
        imageUrl: '',
        xmlContent: errorXml,
        editUrl: `${DIAGRAMS_EDITOR_BASE}#proto=json`,
        resultStatus: 'search_failed',
        failureReason:
          error instanceof Error
            ? `Play-diagram web search failed: ${error.message}`
            : `Play-diagram web search failed: ${String(error)}`,
        storagePath: undefined,
        generationMode: 'auto',
      };
    }
  }

  async createDiagram(
    input: CreatePlayDiagramInput,
    context?: ToolExecutionContext
  ): Promise<PlayDiagramResult> {
    return this.execute(input, context);
  }
}
