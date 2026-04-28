/**
 * @fileoverview Recruiting Fit Scoring Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Standardizes how Agent X scores college/program fit so recommendations are
 * realistic, evidence-based, and prioritized.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class RecruitingFitScoringSkill extends BaseSkill {
  readonly name = 'recruiting_fit_scoring';
  readonly description =
    'College fit scoring, offer probability, recruiting tiers, depth chart opportunity, academic fit, ' +
    'geographic fit, roster needs, conference fit, realistic school targeting.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Recruiting Fit Scoring Framework

### Score Every Program Out Of 100
- **Athletic Fit (30)**: verified performance, measurables, and position level vs. program standard
- **Opportunity Fit (25)**: depth chart openings, graduation losses, recruiting needs, roster path
- **Academic Fit (20)**: GPA, test profile, admissions realism, major alignment
- **Geographic And Lifestyle Fit (15)**: location, distance from home, climate, culture, conference preference
- **Relationship And Timing Fit (10)**: current contact history, camp/visit timing, responsiveness, urgency

### Decision Bands
- **85-100**: Priority target - high-value, realistic fit
- **70-84**: Strong fit - pursue actively
- **55-69**: Stretch fit - pursue selectively with clear evidence
- **Below 55**: Low-probability fit - do not over-prioritize

### Output Rules
When comparing schools, always classify them as:
- **Best Fits**
- **Competitive Reaches**
- **Safety Or Volume Options**

### Rules
- Never sell a fantasy list. Be realistic about level and probability.
- Separate brand-name appeal from actual roster opportunity.
- Use verified stats and current roster context when available.
- If roster, admissions, or coach data is missing, call that out explicitly instead of guessing.`;
  }
}
