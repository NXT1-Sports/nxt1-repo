/**
 * @fileoverview Skill System — Unit Tests
 * @module @nxt1/backend/modules/agent/skills
 *
 * Tests cosine similarity, BaseSkill.matchIntent(), and SkillRegistry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cosineSimilarity } from '../base.skill.js';
import { SkillRegistry } from '../skill-registry.js';
import { ScoutingRubricSkill } from '../evaluation/scouting-rubric.skill.js';
import { OutreachCopywritingSkill } from '../copywriting/outreach-copywriting.skill.js';

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
  });
});
