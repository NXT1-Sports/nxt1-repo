/**
 * @fileoverview Scouting Rubric Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Provides the Performance Coordinator with the exact evaluation rubrics
 * and grading scales used for AI Scout Reports. Covers Physical, Technical,
 * Mental, and Potential dimensions with calibrated scoring guidelines.
 *
 * This is the SINGLE SOURCE OF TRUTH for scout report format and grading.
 * The PerformanceCoordinator's system prompt references this skill dynamically.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class ScoutingRubricSkill extends BaseSkill {
  readonly name = 'scouting_rubric';
  readonly description =
    'Sport-specific player evaluation rubrics, scouting report templates, grading scales, prospect scoring, athlete assessment, Physical Technical Mental Potential dimensions.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(_params?: { sport?: string; position?: string }): string {
    return `## Scout Report Format
When generating a scout report, always follow this structure:

### [Name] — [Position] | [School] | Class of [Year]
**Overall Grade: [X]/100**

| Dimension | Score | Notes |
|---|---|---|
| Physical | /100 | Height, weight, speed, strength |
| Technical | /100 | Sport-specific skills, mechanics |
| Mental | /100 | IQ, decision-making, coachability |
| Potential | /100 | Ceiling, developmental timeline |

**Strengths:** (3 bullet points max)
**Areas to Develop:** (2–3 bullet points)
**Projection:** (1–2 sentences on ceiling)

## Scoring Calibration
- 90+ = Elite prospect (Power 5 / professional pipeline)
- 80–89 = High-major prospect (Power 5 caliber)
- 70–79 = Mid-major prospect (solid D1 / strong D2)
- 60–69 = Low-major / D2 prospect
- 50–59 = D3 / NAIA level
- Below 50 = Developmental / roster depth

## Evaluation Rules
- NEVER fabricate stats. Only evaluate what you can verify from the database or scraping tools.
- Use specific numbers (e.g., "4.52 40-yard dash") rather than vague descriptors.
- Always cite your data source (e.g., "per MaxPreps 2024–25 season stats").
- If asked to evaluate without data, use search_web and scrape_webpage to gather evidence first.`;
  }
}
