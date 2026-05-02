/**
 * @fileoverview Athlete Scouting Framework Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Provides a scouting-first framework for evaluating individual athletes.
 * This skill intentionally avoids grading language and numeric rankings.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class AthleteScoutingSkill extends BaseSkill {
  readonly name = 'athlete_scouting_framework';
  readonly description =
    'Generic athlete scouting framework for prospects and roster players using verified observations, role fit, projection notes, and development priorities without grades or rankings.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(_params?: { sport?: string; position?: string }): string {
    return `## Athlete Scouting Framework
When scouting an athlete, use this evidence-first structure:

### Prospect Snapshot
- Athlete name, sport, position, class year, school/team context
- Current role (starter, rotation, specialist, developmental)

### Verified Evidence Log
- Recent competition sample (games/events reviewed)
- Measurables and production pulled from trusted sources only
- Source list for every key claim (league stats, verified profile, film timestamp)

### Scouting Observations
1. Physical Profile
   - Movement traits, functional strength, speed/explosiveness, durability indicators
2. Technical Profile
   - Position-specific technique, consistency, execution under pressure
3. Processing & Decisions
   - Read speed, anticipation, discipline, adaptability
4. Competitive Behaviors
   - Motor, resilience, communication, coachability signals

### Role Fit & Usage
- Best projected role in current system
- Alternate role fit (if primary role is crowded)
- Situations where this athlete creates an advantage

### Development Priorities
- Top 2-3 development focuses tied to observed evidence
- Suggested training emphasis and short-term checkpoints

### Scouting Rules
- Do not assign grades, ratings, or rank labels.
- Do not fabricate stats, measurements, or achievements.
- Use concise, concrete language tied to evidence.
- If evidence is missing, gather more data before making conclusions.`;
  }
}
