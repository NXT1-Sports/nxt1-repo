/**
 * @fileoverview Skill System — Unit Tests
 * @module @nxt1/backend/modules/agent/skills
 *
 * Tests cosine similarity, BaseSkill.matchIntent(), and SkillRegistry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseSkill, cosineSimilarity } from '../base.skill.js';
import { SkillRegistry } from '../skill-registry.js';
import { ScoutingRubricSkill } from '../evaluation/scouting-rubric.skill.js';
import { VideoAnalysisSkill } from '../evaluation/video-analysis.skill.js';
import { FilmBreakdownTaxonomySkill } from '../evaluation/film-breakdown-taxonomy.skill.js';
import { OutreachCopywritingSkill } from '../copywriting/outreach-copywriting.skill.js';
import { StaticGraphicStyleSkill } from '../brand/static-graphic-style.skill.js';
import { GlobalKnowledgeSkill } from '../knowledge/global-knowledge.skill.js';
import { StrategyGameplanFrameworkSkill } from '../strategy/strategy-gameplan-framework.skill.js';
import { DataNormalizationAndEntityResolutionSkill } from '../data/data-normalization-and-entity-resolution.skill.js';
import { NilDealEvaluationSkill } from '../strategy/nil-deal-evaluation.skill.js';
import { SocialMediaGrowthStrategySkill } from '../strategy/social-media-growth-strategy.skill.js';
import { ReportFormattingAndExportSkill } from '../data/report-formatting-and-export.skill.js';
import { CollegeVisitPlanningSkill } from '../strategy/college-visit-planning.skill.js';
import { CoachGamePlanAndAdjustmentsSkill } from '../strategy/coach-game-plan-and-adjustments.skill.js';
import { OpponentScoutingPacketSkill } from '../evaluation/opponent-scouting-packet.skill.js';
import { LineupRotationOptimizerSkill } from '../strategy/lineup-rotation-optimizer.skill.js';

class EmptyContextSkill extends BaseSkill {
  readonly name = 'empty_context';
  readonly description = 'Test helper skill for empty prompt blocks.';
  readonly category = 'strategy' as const;

  getPromptContext(): string {
    return '   ';
  }
}

// ─── Cosine Similarity ──────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('should return -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it('should return 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('should correctly compute for arbitrary vectors', () => {
    // cos(θ) = (1*4 + 2*5 + 3*6) / (sqrt(14) * sqrt(77))
    const result = cosineSimilarity([1, 2, 3], [4, 5, 6]);
    expect(result).toBeCloseTo(0.9746, 3);
  });
});

// ─── BaseSkill.matchIntent ──────────────────────────────────────────────────

describe('BaseSkill.matchIntent', () => {
  const skill = new ScoutingRubricSkill();

  it('should match when cosine similarity exceeds threshold', async () => {
    // Mock embedFn that returns a vector similar to a fixed "intent" embedding
    const skillEmbedding = [1, 0, 0];
    const intentEmbedding = [0.9, 0.1, 0]; // Very similar to skill embedding
    const embedFn = vi.fn().mockResolvedValue(skillEmbedding);

    const { matched, similarity } = await skill.matchIntent(intentEmbedding, embedFn, 0.3);

    expect(matched).toBe(true);
    expect(similarity).toBeGreaterThan(0.3);
    expect(embedFn).toHaveBeenCalledOnce();
  });

  it('should not match when similarity is below threshold', async () => {
    const skillEmbedding = [1, 0, 0];
    const intentEmbedding = [0, 1, 0]; // Orthogonal
    const embedFn = vi.fn().mockResolvedValue(skillEmbedding);

    const { matched, similarity } = await skill.matchIntent(intentEmbedding, embedFn, 0.3);

    expect(matched).toBe(false);
    expect(similarity).toBeCloseTo(0, 5);
  });

  it('should cache the embedding after first call', async () => {
    const freshSkill = new OutreachCopywritingSkill();
    const embedFn = vi.fn().mockResolvedValue([1, 0, 0]);

    await freshSkill.matchIntent([0.9, 0.1, 0], embedFn, 0.3);
    await freshSkill.matchIntent([0.8, 0.2, 0], embedFn, 0.3);

    // embedFn should only be called once (for the skill description), not twice
    expect(embedFn).toHaveBeenCalledOnce();
  });

  it('should expose real-media video analysis guidance', () => {
    const videoSkill = new VideoAnalysisSkill();
    const prompt = videoSkill.getPromptContext();

    expect(videoSkill.name).toBe('video_analysis');
    expect(videoSkill.category).toBe('evaluation');
    expect(prompt).toContain('extract_live_view_media');
    expect(prompt).toContain('skipMediaPersistence: true');
    expect(prompt).toContain('Never loop through playlist clicks');
  });

  it('should expose film breakdown taxonomy guidance', () => {
    const skill = new FilmBreakdownTaxonomySkill();
    const prompt = skill.getPromptContext();

    expect(skill.category).toBe('evaluation');
    expect(prompt).toContain('Situation');
    expect(prompt).toContain('Coaching Point');
    expect(prompt).toContain('Confidence');
  });

  it('should use generate_graphic language for brand guidance', () => {
    const skill = new StaticGraphicStyleSkill();
    const prompt = skill.getPromptContext();

    expect(prompt).toContain('generate_graphic');
    expect(prompt).not.toContain('generate_image');
  });

  it('should classify global knowledge as knowledge', () => {
    const retrievalService = {
      retrieve: vi.fn().mockResolvedValue([]),
      buildPromptBlock: vi.fn().mockReturnValue(''),
    };
    const skill = new GlobalKnowledgeSkill(retrievalService as never);

    expect(skill.category).toBe('knowledge');
  });

  it('should expose strategy and data skill categories', () => {
    expect(new StrategyGameplanFrameworkSkill().category).toBe('strategy');
    expect(new DataNormalizationAndEntityResolutionSkill().category).toBe('data');
    expect(new NilDealEvaluationSkill().category).toBe('strategy');
    expect(new SocialMediaGrowthStrategySkill().category).toBe('strategy');
    expect(new ReportFormattingAndExportSkill().category).toBe('data');
    expect(new CollegeVisitPlanningSkill().category).toBe('strategy');
    expect(new CoachGamePlanAndAdjustmentsSkill().category).toBe('strategy');
    expect(new OpponentScoutingPacketSkill().category).toBe('evaluation');
    expect(new LineupRotationOptimizerSkill().category).toBe('strategy');
  });

  it('should expose NIL deal, growth, report export, and college visit guidance', () => {
    expect(new NilDealEvaluationSkill().getPromptContext()).toContain('Recommendation');
    expect(new SocialMediaGrowthStrategySkill().getPromptContext()).toContain('Weekly Content Mix');
    expect(new ReportFormattingAndExportSkill().getPromptContext()).toContain(
      'Required Report Structure'
    );
    expect(new CollegeVisitPlanningSkill().getPromptContext()).toContain('Visit Prioritization');
  });

  it('should expose coach planning, opponent packet, and lineup optimization guidance', () => {
    expect(new CoachGamePlanAndAdjustmentsSkill().getPromptContext()).toContain(
      'In-Game Adjustment Tree'
    );
    expect(new OpponentScoutingPacketSkill().getPromptContext()).toContain('Packet Sections');
    expect(new LineupRotationOptimizerSkill().getPromptContext()).toContain(
      'Rotation Design Principles'
    );
  });
});

// ─── SkillRegistry ──────────────────────────────────────────────────────────

describe('SkillRegistry', () => {
  let registry: SkillRegistry;
  const embedFn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new SkillRegistry();
  });

  it('should register and retrieve skills', () => {
    const skill = new ScoutingRubricSkill();
    registry.register(skill);

    expect(registry.get('scouting_rubric')).toBe(skill);
    expect(registry.listAll()).toContain('scouting_rubric');
  });

  it('should register the video analysis skill', () => {
    const skill = new VideoAnalysisSkill();
    registry.register(skill);

    expect(registry.get('video_analysis')).toBe(skill);
    expect(registry.listAll()).toContain('video_analysis');
  });

  it('should reject duplicate skill names', () => {
    const skill1 = new ScoutingRubricSkill();
    const skill2 = new ScoutingRubricSkill();

    registry.register(skill1);
    registry.register(skill2); // Should be silently rejected

    expect(registry.listAll()).toHaveLength(1);
  });

  it('should return undefined for unregistered skills', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('should match skills above threshold', async () => {
    const scouting = new ScoutingRubricSkill();
    const outreach = new OutreachCopywritingSkill();
    registry.register(scouting);
    registry.register(outreach);

    // Mock: return an embedding based on the input text content
    embedFn.mockImplementation(async (text: string) => {
      // Scouting description contains "rubric" / "evaluation" → vector close to [1,0,0]
      // Outreach description contains "email" / "copywriting" → vector close to [0,0,1]
      return text.includes('rubric') || text.includes('evaluation')
        ? [0.95, 0.1, 0]
        : [0, 0.1, 0.95];
    });

    const intentEmbedding = [1, 0, 0]; // Close to scouting, far from outreach
    const matched = await registry.match(intentEmbedding, embedFn);

    expect(matched.length).toBeGreaterThanOrEqual(1);
    expect(matched[0].skill.name).toBe('scouting_rubric');
  });

  it('should filter by allowed names', async () => {
    const scouting = new ScoutingRubricSkill();
    const outreach = new OutreachCopywritingSkill();
    registry.register(scouting);
    registry.register(outreach);

    embedFn.mockResolvedValue([1, 0, 0]);
    const intentEmbedding = [1, 0, 0];

    // Only allow outreach — even though scouting would match
    const matched = await registry.match(intentEmbedding, embedFn, ['outreach_copywriting']);

    // Only outreach was considered
    expect(matched.every((m) => m.skill.name === 'outreach_copywriting')).toBe(true);
  });

  it('should return empty array when no skills match', async () => {
    const scouting = new ScoutingRubricSkill();
    registry.register(scouting);

    // Orthogonal embedding
    embedFn.mockResolvedValue([0, 1, 0]);
    const intentEmbedding = [1, 0, 0];

    const matched = await registry.match(intentEmbedding, embedFn, undefined, 0.99);

    expect(matched).toHaveLength(0);
  });

  it('should return empty array when no skills registered', async () => {
    const matched = await registry.match([1, 0, 0], embedFn);
    expect(matched).toHaveLength(0);
  });

  describe('buildPromptBlock', () => {
    it('should return empty string for no matches', () => {
      expect(registry.buildPromptBlock([])).toBe('');
    });

    it('should build formatted prompt block for matched skills', () => {
      const skill = new ScoutingRubricSkill();
      const matched = [{ skill, similarity: 0.85 }];
      const block = registry.buildPromptBlock(matched);

      expect(block).toContain('## Loaded Skills');
      expect(block).toContain('### Skill: scouting_rubric');
      expect(block).toContain('relevance: 0.85');
      expect(block).toContain('Scout Report Format');
    });

    it('should omit empty skill prompt contexts', () => {
      const skill = new EmptyContextSkill();
      const matched = [{ skill, similarity: 0.9 }];

      expect(registry.buildPromptBlock(matched)).toBe('');
    });
  });
});
