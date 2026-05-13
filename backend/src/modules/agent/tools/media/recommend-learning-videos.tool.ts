import { z } from 'zod';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import {
  LearningVideoRecommendationService,
  type LearningVideoRecommendationResult,
} from './learning-video-recommendation.service.js';

const RecommendLearningVideosInputSchema = z.object({
  goal: z.string().trim().min(1).max(240),
  sport: z.string().trim().min(1).max(80).optional(),
  position: z.string().trim().min(1).max(80).optional(),
  audienceRole: z.string().trim().min(1).max(80).optional(),
  level: z.enum(['youth', 'high_school', 'college', 'pro', 'any']).optional(),
  recommendationType: z
    .enum([
      'drills',
      'skill_improvement',
      'film_study',
      'recruiting_examples',
      'role_specific_learning',
      'general',
    ])
    .optional(),
  maxResults: z.number().int().min(1).max(6).optional(),
  preferredPlatforms: z
    .array(z.enum(['youtube', 'hudl', 'vimeo', 'web']))
    .max(4)
    .optional(),
  includeGenericVideoPages: z.boolean().optional(),
});

export class RecommendLearningVideosTool extends BaseTool {
  readonly name = 'recommend_learning_videos';
  readonly description =
    'Find public videos worth studying for drills, skill improvement, film study, recruiting examples, and coaching installs. ' +
    'Use this when a user asks what videos they should watch, wants drill or film-study examples, or needs curated recruiting or clinic references. ' +
    'Returns a curated list of relevant links with why each video fits and what to watch for.';

  readonly parameters = RecommendLearningVideosInputSchema;
  readonly isMutation = false;
  readonly category = 'media' as const;
  readonly entityGroup = 'platform_tools' as const;

  override readonly allowedAgents = [
    'router',
    'admin_coordinator',
    'brand_coordinator',
    'data_coordinator',
    'performance_coordinator',
    'recruiting_coordinator',
    'strategy_coordinator',
  ] as const;

  constructor(
    private readonly recommendationService: Pick<
      LearningVideoRecommendationService,
      'recommend'
    > = new LearningVideoRecommendationService()
  ) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = RecommendLearningVideosInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    context?.emitStage?.('fetching_data', {
      icon: 'media',
      phase: 'recommend_learning_videos',
      goal: parsed.data.goal,
    });

    try {
      const result = await this.recommendationService.recommend(parsed.data, {
        signal: context?.signal,
      });

      return {
        success: true,
        data: result,
        markdown: renderRecommendations(result),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to curate learning video recommendations.',
      };
    }
  }
}

function renderRecommendations(result: LearningVideoRecommendationResult): string {
  if (result.recommendations.length === 0) {
    return [
      `I could not find strong public video matches for "${result.normalizedIntent.goal}" yet.`,
      '',
      `Searches tried: ${result.searchQueries.join(' | ')}`,
      '',
      'Try narrowing the goal with sport, position, or level for a tighter video list.',
    ].join('\n');
  }

  const lines = ['## Recommended Videos To Study', ''];

  result.recommendations.forEach((recommendation, index) => {
    lines.push(`${index + 1}. ${recommendation.title}`);
    lines.push(`   Link: ${recommendation.url}`);
    lines.push(`   Why it fits: ${recommendation.whyItFits}`);
    lines.push(`   Watch for: ${recommendation.watchFor}`);
    lines.push(`   Platform: ${recommendation.platform}`);
    if (recommendation.topicTags.length > 0) {
      lines.push(`   Tags: ${recommendation.topicTags.join(', ')}`);
    }
    lines.push('');
  });

  return lines.join('\n').trim();
}
