import { logger } from '../../../../utils/logger.js';
import type { PageVideo } from '../integrations/firecrawl/scraping/page-data.types.js';
import type {
  ScrapeRequest,
  ScrapeResult,
} from '../integrations/firecrawl/scraping/scraper.types.js';
import { UrlClassifierService, type MediaPlatform } from './url-classifier.service.js';

const TAVILY_API_URL = 'https://api.tavily.com/search';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_SEARCH_RESULTS = 10;
const MAX_RECOMMENDATIONS = 6;
const MAX_SCRAPE_CANDIDATES = 4;

const RECOMMENDATION_TYPES = [
  'drills',
  'skill_improvement',
  'film_study',
  'recruiting_examples',
  'role_specific_learning',
  'general',
] as const;

type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];
type RecommendationLevel = 'youth' | 'high_school' | 'college' | 'pro' | 'any';
type SuggestedNextStep = 'analyze_video' | 'extract_hudl_video' | 'stage_media' | 'review_link';
type RecommendationSourceType = 'direct_video' | 'video_page';

interface TavilyResult {
  readonly title: string;
  readonly url: string;
  readonly content: string;
  readonly score: number;
  readonly published_date?: string;
}

interface TavilyResponse {
  readonly results?: readonly TavilyResult[];
}

interface SearchCandidate {
  readonly title: string;
  readonly url: string;
  readonly excerpt: string;
  readonly score: number;
  readonly publishedDate?: string;
  readonly query: string;
}

interface RankedCandidate {
  readonly title: string;
  readonly url: string;
  readonly excerpt: string;
  readonly score: number;
  readonly platform: MediaPlatform;
  readonly sourceType: RecommendationSourceType;
  readonly whyItFits: string;
  readonly watchFor: string;
  readonly topicTags: readonly string[];
  confidence: 'high' | 'medium';
  readonly suggestedNextStep: SuggestedNextStep;
  readonly canAnalyzeDirectly: boolean;
  readonly host: string;
  readonly publishedDate?: string;
}

export interface LearningVideoRecommendationInput {
  readonly goal: string;
  readonly sport?: string;
  readonly position?: string;
  readonly audienceRole?: string;
  readonly level?: RecommendationLevel;
  readonly recommendationType?: RecommendationType;
  readonly maxResults?: number;
  readonly preferredPlatforms?: readonly MediaPlatform[];
  readonly includeGenericVideoPages?: boolean;
}

export interface LearningVideoRecommendation {
  readonly title: string;
  readonly url: string;
  readonly excerpt: string;
  readonly platform: MediaPlatform;
  readonly sourceType: RecommendationSourceType;
  readonly whyItFits: string;
  readonly watchFor: string;
  readonly topicTags: readonly string[];
  readonly confidence: 'high' | 'medium';
  readonly suggestedNextStep: SuggestedNextStep;
  readonly canAnalyzeDirectly: boolean;
}

export interface LearningVideoRecommendationResult {
  readonly normalizedIntent: {
    readonly goal: string;
    readonly sport: string | null;
    readonly position: string | null;
    readonly audienceRole: string | null;
    readonly level: RecommendationLevel;
    readonly recommendationType: RecommendationType;
    readonly maxResults: number;
    readonly preferredPlatforms: readonly MediaPlatform[];
    readonly includeGenericVideoPages: boolean;
  };
  readonly searchQueries: readonly string[];
  readonly recommendations: readonly LearningVideoRecommendation[];
  readonly rejectedCandidateCounts: Readonly<Record<string, number>>;
}

type NormalizedIntent = LearningVideoRecommendationResult['normalizedIntent'];

interface ScrapeClient {
  scrape(request: ScrapeRequest): Promise<ScrapeResult>;
}

interface LearningVideoRecommendationServiceDeps {
  readonly classifier?: UrlClassifierService;
  readonly scraper?: ScrapeClient;
  readonly fetchImpl?: typeof fetch;
  readonly apiKey?: string;
}

const DIRECT_ANALYSIS_PLATFORMS = new Set<MediaPlatform>(['youtube', 'vimeo']);

const LEVEL_TERMS: Record<RecommendationLevel, readonly string[]> = {
  youth: ['youth'],
  high_school: ['high school', 'varsity'],
  college: ['college', 'ncaa'],
  pro: ['pro', 'professional', 'nfl', 'nba', 'mlb', 'wnba', 'mls'],
  any: [],
};

const TYPE_KEYWORDS: Record<RecommendationType, readonly string[]> = {
  drills: ['drill', 'workout', 'reps', 'progression'],
  skill_improvement: ['technique', 'mechanics', 'footwork', 'training'],
  film_study: ['film', 'breakdown', 'study', 'analysis'],
  recruiting_examples: ['recruiting', 'highlight', 'showcase', 'example'],
  role_specific_learning: ['clinic', 'install', 'scheme', 'coaching'],
  general: ['video', 'training', 'breakdown'],
};

export class LearningVideoRecommendationService {
  private readonly classifier: UrlClassifierService;
  private readonly scraper?: ScrapeClient;
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey?: string;

  constructor(deps: LearningVideoRecommendationServiceDeps = {}) {
    this.classifier = deps.classifier ?? new UrlClassifierService();
    this.scraper = deps.scraper;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.apiKey = deps.apiKey;
  }

  async recommend(
    input: LearningVideoRecommendationInput,
    options?: { readonly signal?: AbortSignal }
  ): Promise<LearningVideoRecommendationResult> {
    const intent = normalizeIntent(input);
    const searchQueries = buildSearchQueries(intent);
    const rawCandidates = await this.searchAcrossQueries(searchQueries, intent, options?.signal);
    const analyzedCandidates = await this.analyzeCandidates(rawCandidates, intent, options?.signal);
    const rankedCandidates = analyzedCandidates.candidates
      .map((candidate) => ({ candidate, rank: scoreCandidate(candidate, intent) }))
      .sort((left, right) => right.rank - left.rank)
      .map(({ candidate }) => candidate);

    const recommendations = diversifyCandidates(rankedCandidates, intent.maxResults).map(
      ({ host: _host, score: _score, ...candidate }) => candidate
    );

    logger.debug('[LearningVideoRecommendationService] curated recommendations', {
      goal: intent.goal,
      recommendationType: intent.recommendationType,
      recommendationCount: recommendations.length,
      searchQueries,
    });

    return {
      normalizedIntent: intent,
      searchQueries,
      recommendations,
      rejectedCandidateCounts: analyzedCandidates.rejectedCandidateCounts,
    };
  }

  private async searchAcrossQueries(
    queries: readonly string[],
    intent: NormalizedIntent,
    signal?: AbortSignal
  ): Promise<readonly SearchCandidate[]> {
    const perQueryMaxResults = Math.min(Math.max(intent.maxResults + 2, 4), MAX_SEARCH_RESULTS);
    const settled = await Promise.all(
      queries.map(async (query) => {
        const results = await this.searchWeb(query, perQueryMaxResults, signal);
        return results.map((result) => ({ ...result, query }));
      })
    );

    const seen = new Set<string>();
    const candidates: SearchCandidate[] = [];

    for (const results of settled) {
      for (const result of results) {
        const dedupeKey = normalizeUrl(result.url);
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        candidates.push(result);
      }
    }

    return candidates;
  }

  private async searchWeb(
    query: string,
    maxResults: number,
    signal?: AbortSignal
  ): Promise<readonly Omit<SearchCandidate, 'query'>[]> {
    const apiKey = this.apiKey ?? process.env['TAVILY_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'TAVILY_API_KEY is not configured. Set it to enable learning video recommendations.'
      );
    }

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combinedSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;

    const response = await this.fetchImpl(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: 'advanced',
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      }),
      signal: combinedSignal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Learning video search failed with status ${response.status}. ${errorBody.slice(0, 200)}`
      );
    }

    const data = (await response.json()) as TavilyResponse;
    return (data.results ?? []).map((result) => ({
      title: result.title,
      url: result.url,
      excerpt: result.content?.slice(0, 600) ?? '',
      score: Math.round((result.score ?? 0) * 100) / 100,
      ...(result.published_date ? { publishedDate: result.published_date } : {}),
    }));
  }

  private async analyzeCandidates(
    rawCandidates: readonly SearchCandidate[],
    intent: NormalizedIntent,
    signal?: AbortSignal
  ): Promise<{
    readonly candidates: readonly RankedCandidate[];
    readonly rejectedCandidateCounts: Readonly<Record<string, number>>;
  }> {
    const rejectedCandidateCounts = new Map<string, number>();
    const accepted: RankedCandidate[] = [];
    const seen = new Set<string>();
    let scrapedPages = 0;

    const reject = (reason: string): void => {
      rejectedCandidateCounts.set(reason, (rejectedCandidateCounts.get(reason) ?? 0) + 1);
    };

    for (const candidate of rawCandidates) {
      const classification = this.classifier.classify(candidate.url);
      if (classification.isSocialBlocked && classification.platform !== 'youtube') {
        reject('blocked_social');
        continue;
      }

      if (classification.strategy === 'analyze_video_direct') {
        const ranked = buildRankedCandidate(
          candidate,
          candidate.url,
          classification.platform,
          intent,
          {
            sourceType: 'direct_video',
            suggestedNextStep: 'analyze_video',
            canAnalyzeDirectly: true,
          }
        );
        if (dedupeAccepted(seen, ranked.url)) {
          accepted.push(ranked);
        } else {
          reject('duplicate');
        }
        continue;
      }

      if (classification.strategy === 'extract_hudl_video') {
        const ranked = buildRankedCandidate(candidate, candidate.url, 'hudl', intent, {
          sourceType: 'video_page',
          suggestedNextStep: 'extract_hudl_video',
          canAnalyzeDirectly: false,
        });
        if (dedupeAccepted(seen, ranked.url)) {
          accepted.push(ranked);
        } else {
          reject('duplicate');
        }
        continue;
      }

      if (classification.strategy === 'stage_direct_video') {
        const ranked = buildRankedCandidate(
          candidate,
          candidate.url,
          classification.platform,
          intent,
          {
            sourceType: 'direct_video',
            suggestedNextStep: 'stage_media',
            canAnalyzeDirectly: false,
          }
        );
        if (dedupeAccepted(seen, ranked.url)) {
          accepted.push(ranked);
        } else {
          reject('duplicate');
        }
        continue;
      }

      if (
        classification.strategy === 'firecrawl_scrape' &&
        intent.includeGenericVideoPages &&
        this.scraper &&
        scrapedPages < MAX_SCRAPE_CANDIDATES &&
        looksLikeVideoPage(candidate)
      ) {
        scrapedPages += 1;
        const embeddedCandidates = await this.expandEmbeddedVideoCandidates(
          candidate,
          intent,
          signal
        );
        if (embeddedCandidates.length === 0) {
          reject('generic_page_without_video');
          continue;
        }

        for (const embeddedCandidate of embeddedCandidates) {
          if (dedupeAccepted(seen, embeddedCandidate.url)) {
            accepted.push(embeddedCandidate);
          } else {
            reject('duplicate');
          }
        }
        continue;
      }

      reject('non_video_candidate');
    }

    return {
      candidates: accepted,
      rejectedCandidateCounts: Object.fromEntries(rejectedCandidateCounts),
    };
  }

  private async expandEmbeddedVideoCandidates(
    candidate: SearchCandidate,
    intent: NormalizedIntent,
    signal?: AbortSignal
  ): Promise<readonly RankedCandidate[]> {
    if (!this.scraper) {
      return [];
    }

    try {
      const scraped = await this.scraper.scrape({
        url: candidate.url,
        signal,
      });

      const videos = scraped.pageData?.videos ?? [];
      const expanded: RankedCandidate[] = [];

      for (const video of videos) {
        const resolvedUrl = resolveEmbeddedVideoUrl(video);
        if (!resolvedUrl) {
          continue;
        }

        const resolvedClassification = this.classifier.classify(resolvedUrl);
        if (
          resolvedClassification.isSocialBlocked &&
          resolvedClassification.platform !== 'youtube'
        ) {
          continue;
        }

        if (
          resolvedClassification.strategy !== 'analyze_video_direct' &&
          resolvedClassification.strategy !== 'extract_hudl_video' &&
          resolvedClassification.strategy !== 'stage_direct_video'
        ) {
          continue;
        }

        expanded.push(
          buildRankedCandidate(
            {
              ...candidate,
              url: resolvedUrl,
            },
            resolvedUrl,
            resolvedClassification.platform,
            intent,
            {
              sourceType:
                resolvedClassification.strategy === 'extract_hudl_video'
                  ? 'video_page'
                  : 'direct_video',
              suggestedNextStep:
                resolvedClassification.strategy === 'extract_hudl_video'
                  ? 'extract_hudl_video'
                  : resolvedClassification.strategy === 'stage_direct_video'
                    ? 'stage_media'
                    : 'analyze_video',
              canAnalyzeDirectly:
                resolvedClassification.strategy === 'analyze_video_direct' ||
                DIRECT_ANALYSIS_PLATFORMS.has(resolvedClassification.platform),
            }
          )
        );
      }

      return expanded;
    } catch (error) {
      logger.warn('[LearningVideoRecommendationService] failed to scrape candidate page', {
        url: candidate.url,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

function normalizeIntent(input: LearningVideoRecommendationInput): NormalizedIntent {
  const goal = input.goal.trim();
  const sport = trimToNull(input.sport);
  const position = trimToNull(input.position);
  const audienceRole = trimToNull(input.audienceRole);
  const level = input.level ?? 'any';
  const recommendationType =
    input.recommendationType ?? inferRecommendationType(goal, audienceRole);
  const maxResults = Math.min(Math.max(input.maxResults ?? 4, 1), MAX_RECOMMENDATIONS);
  const preferredPlatforms = (input.preferredPlatforms ?? []).filter(isSupportedPlatform);

  return {
    goal,
    sport,
    position,
    audienceRole,
    level,
    recommendationType,
    maxResults,
    preferredPlatforms,
    includeGenericVideoPages: input.includeGenericVideoPages ?? true,
  };
}

function buildSearchQueries(intent: NormalizedIntent): readonly string[] {
  const baseContext = [intent.sport, intent.position, intent.goal].filter(Boolean).join(' ');
  const levelContext = LEVEL_TERMS[intent.level].join(' ');
  const audienceContext = intent.audienceRole ?? '';

  const rawQueries = new Set<string>();

  rawQueries.add(
    compactQuery([
      baseContext,
      levelContext,
      recommendationPhrase(intent.recommendationType),
      audienceContext,
      'YouTube',
    ])
  );

  rawQueries.add(
    compactQuery([
      baseContext,
      levelContext,
      intent.recommendationType === 'recruiting_examples'
        ? 'Hudl recruiting highlight example'
        : 'video breakdown',
    ])
  );

  if (intent.recommendationType === 'role_specific_learning') {
    rawQueries.add(compactQuery([baseContext, 'coach clinic video install']));
  }

  if (intent.recommendationType === 'film_study') {
    rawQueries.add(compactQuery([baseContext, 'film study breakdown']));
  }

  return [...rawQueries].filter((query) => query.length > 0);
}

function recommendationPhrase(recommendationType: RecommendationType): string {
  switch (recommendationType) {
    case 'drills':
      return 'drill video';
    case 'skill_improvement':
      return 'technique video';
    case 'film_study':
      return 'film study video';
    case 'recruiting_examples':
      return 'recruiting highlight example';
    case 'role_specific_learning':
      return 'coaching clinic video';
    case 'general':
      return 'training video';
  }
}

function inferRecommendationType(goal: string, audienceRole: string | null): RecommendationType {
  const haystack = `${goal} ${audienceRole ?? ''}`.toLowerCase();
  if (/(recruit|highlight|showcase|coach.*see|what should coaches watch)/i.test(haystack)) {
    return 'recruiting_examples';
  }
  if (/(clinic|install|scheme|playbook|coaching|coordinator)/i.test(haystack)) {
    return 'role_specific_learning';
  }
  if (/(film|breakdown|study|coverage|reads?)/i.test(haystack)) {
    return 'film_study';
  }
  if (/(drill|workout|reps|progression)/i.test(haystack)) {
    return 'drills';
  }
  if (/(mechanic|technique|footwork|form|release|accuracy|agility|speed)/i.test(haystack)) {
    return 'skill_improvement';
  }
  return 'general';
}

function buildRankedCandidate(
  candidate: SearchCandidate,
  resolvedUrl: string,
  platform: MediaPlatform,
  intent: NormalizedIntent,
  options: {
    readonly sourceType: RecommendationSourceType;
    readonly suggestedNextStep: SuggestedNextStep;
    readonly canAnalyzeDirectly: boolean;
  }
): RankedCandidate {
  return {
    title: candidate.title.trim() || resolvedUrl,
    url: resolvedUrl,
    excerpt: candidate.excerpt,
    score: candidate.score,
    platform,
    sourceType: options.sourceType,
    whyItFits: buildWhyItFits(candidate, platform, intent),
    watchFor: buildWatchFor(intent.recommendationType),
    topicTags: buildTopicTags(candidate, intent),
    confidence: 'medium',
    suggestedNextStep: options.suggestedNextStep,
    canAnalyzeDirectly: options.canAnalyzeDirectly,
    host: safeHostname(resolvedUrl),
    ...(candidate.publishedDate ? { publishedDate: candidate.publishedDate } : {}),
  };
}

function scoreCandidate(candidate: RankedCandidate, intent: NormalizedIntent): number {
  let score = candidate.score;
  const haystack = `${candidate.title} ${candidate.excerpt}`.toLowerCase();

  if (intent.sport && haystack.includes(intent.sport.toLowerCase())) {
    score += 0.24;
  }
  if (intent.position && haystack.includes(intent.position.toLowerCase())) {
    score += 0.18;
  }
  for (const goalToken of tokenize(intent.goal)) {
    if (haystack.includes(goalToken)) {
      score += 0.05;
    }
  }
  for (const keyword of TYPE_KEYWORDS[intent.recommendationType]) {
    if (haystack.includes(keyword)) {
      score += 0.08;
    }
  }
  for (const keyword of LEVEL_TERMS[intent.level]) {
    if (haystack.includes(keyword)) {
      score += 0.06;
    }
  }
  if (intent.preferredPlatforms.includes(candidate.platform)) {
    score += 0.16;
  }
  if (candidate.platform === 'youtube') {
    score += 0.12;
  }
  if (candidate.platform === 'hudl') {
    score += 0.1;
  }
  if (candidate.platform === 'vimeo') {
    score += 0.08;
  }
  if (candidate.sourceType === 'direct_video') {
    score += 0.05;
  }

  // Recency scoring: prefer recent videos, penalize stale content
  if (candidate.publishedDate) {
    try {
      const publishedTime = new Date(candidate.publishedDate).getTime();
      const nowTime = Date.now();
      const ageMonths = (nowTime - publishedTime) / (1000 * 60 * 60 * 24 * 30.44);

      if (ageMonths < 0) {
        // Future dates (edge case) - neutral
        score += 0;
      } else if (ageMonths <= 6) {
        // Last 6 months - strong bonus (very current)
        score += 0.2;
      } else if (ageMonths <= 12) {
        // Last 12 months - medium bonus (current)
        score += 0.12;
      } else if (ageMonths <= 18) {
        // Last 18 months - light bonus (reasonably recent)
        score += 0.06;
      } else if (ageMonths > 36) {
        // Older than 3 years - penalty (potentially outdated coaching methodologies)
        score -= 0.15;
      }
    } catch {
      // Invalid date format - no adjustment
    }
  }

  if (score >= 1.35) {
    candidate.confidence = 'high';
  }

  return score;
}

function diversifyCandidates(
  candidates: readonly RankedCandidate[],
  maxResults: number
): readonly RankedCandidate[] {
  const selected: RankedCandidate[] = [];
  const hostCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const limit = isYouTubeHost(candidate.host) ? 2 : 1;
    const currentHostCount = hostCounts.get(candidate.host) ?? 0;
    if (currentHostCount >= limit) {
      continue;
    }

    selected.push(candidate);
    hostCounts.set(candidate.host, currentHostCount + 1);
    if (selected.length >= maxResults) {
      break;
    }
  }

  return selected;
}

function dedupeAccepted(seen: Set<string>, url: string): boolean {
  const key = normalizeUrl(url);
  if (seen.has(key)) {
    return false;
  }
  seen.add(key);
  return true;
}

function buildWhyItFits(
  candidate: Pick<SearchCandidate, 'title' | 'excerpt'>,
  platform: MediaPlatform,
  intent: NormalizedIntent
): string {
  const reasons: string[] = [];
  const haystack = `${candidate.title} ${candidate.excerpt}`.toLowerCase();

  if (intent.sport && haystack.includes(intent.sport.toLowerCase())) {
    reasons.push(`${intent.sport} specific`);
  }
  if (intent.position && haystack.includes(intent.position.toLowerCase())) {
    reasons.push(`${intent.position} specific`);
  }
  if (intent.level !== 'any' && LEVEL_TERMS[intent.level].some((term) => haystack.includes(term))) {
    reasons.push(intent.level.replace('_', ' '));
  }
  reasons.push(platformLabel(platform));

  return `Matches ${reasons.join(', ')} context for ${intent.goal}.`;
}

function buildWatchFor(recommendationType: RecommendationType): string {
  switch (recommendationType) {
    case 'drills':
      return 'Watch the setup, rep structure, coaching cues, and how the drill scales under game tempo.';
    case 'skill_improvement':
      return 'Watch for mechanics, footwork, sequencing, and the specific correction cues the coach repeats.';
    case 'film_study':
      return 'Watch the decision points, reads, spacing, and what triggers the adjustment or final action.';
    case 'recruiting_examples':
      return 'Watch the opening hook, clip order, labels, pacing, and what a coach can understand in the first 30 seconds.';
    case 'role_specific_learning':
      return 'Watch how the concept is installed, how responsibilities are taught, and what progression the coach uses.';
    case 'general':
      return 'Watch for transferable technique, clear coaching language, and anything you can turn into a repeatable routine.';
  }
}

function buildTopicTags(
  candidate: Pick<SearchCandidate, 'title' | 'excerpt'>,
  intent: NormalizedIntent
): readonly string[] {
  const tags = new Set<string>();
  const haystack = `${candidate.title} ${candidate.excerpt}`.toLowerCase();

  if (intent.sport && haystack.includes(intent.sport.toLowerCase())) {
    tags.add(intent.sport);
  }
  if (intent.position && haystack.includes(intent.position.toLowerCase())) {
    tags.add(intent.position);
  }
  for (const keyword of TYPE_KEYWORDS[intent.recommendationType]) {
    if (haystack.includes(keyword)) {
      tags.add(keyword);
    }
  }
  for (const goalToken of tokenize(intent.goal)) {
    if (haystack.includes(goalToken)) {
      tags.add(goalToken);
    }
  }

  return [...tags].slice(0, 4);
}

function looksLikeVideoPage(candidate: SearchCandidate): boolean {
  const haystack = `${candidate.title} ${candidate.excerpt} ${candidate.url}`.toLowerCase();
  return /(video|watch|drill|film|breakdown|clinic|highlight|showcase|training|workout)/i.test(
    haystack
  );
}

function resolveEmbeddedVideoUrl(video: PageVideo): string | null {
  if (video.provider === 'youtube' && video.videoId) {
    return `https://www.youtube.com/watch?v=${video.videoId}`;
  }
  if (video.provider === 'vimeo' && video.videoId) {
    return `https://vimeo.com/${video.videoId}`;
  }
  return video.src || null;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function trimToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function compactQuery(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');
}

function tokenize(value: string): readonly string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
    .slice(0, 6);
}

function platformLabel(platform: MediaPlatform): string {
  switch (platform) {
    case 'youtube':
      return 'YouTube';
    case 'hudl':
      return 'Hudl';
    case 'vimeo':
      return 'Vimeo';
    default:
      return 'public web';
  }
}

function isYouTubeHost(host: string): boolean {
  return host === 'youtube.com' || host === 'youtu.be';
}

function isSupportedPlatform(platform: MediaPlatform): boolean {
  return ['youtube', 'hudl', 'vimeo', 'web'].includes(platform);
}
