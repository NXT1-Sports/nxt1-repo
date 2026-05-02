/**
 * @fileoverview College Visit Planning Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Adds a practical framework for planning and prioritizing college visits.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class CollegeVisitPlanningSkill extends BaseSkill {
  readonly name = 'college_visit_planning';
  readonly description =
    'College visit planning, official and unofficial visit strategy, itinerary prioritization, ' +
    'coach meeting preparation, question frameworks, and post-visit decision scoring.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## College Visit Planning Framework

### Pre-Visit Plan
- Define objective for each visit: roster fit, coaching relationship, academics, culture
- Build a question set for coaches, position room, academics, and support services
- Prepare athlete talking points: current role, development goals, timeline, transcript snapshot

### Visit Prioritization Score (100)
- **Roster Opportunity (30)**: depth chart path and position need
- **Coach Relationship Strength (25)**: responsiveness and clarity of development plan
- **Academic And Major Fit (20)**: program quality and realistic admissions path
- **Program Environment (15)**: culture, facilities, support systems
- **Logistics And Timing (10)**: distance, cost, scheduling feasibility

### During Visit
Capture evidence, not impressions only:
- facility quality, practice tempo, meeting quality, athlete interactions
- coaching specificity: did they describe a real development path
- current player feedback on culture and support

### Post-Visit Decision Output
1. **Visit Score** (numeric)
2. **Top 3 Positives**
3. **Top 3 Concerns**
4. **Follow-Up Actions** (email, film send, transcript update, next call)

### Rules
- Do not rank a school highly without clear roster opportunity evidence.
- Distinguish emotional excitement from strategic fit.
- If key stakeholders were not met, label the visit as incomplete.`;
  }
}
