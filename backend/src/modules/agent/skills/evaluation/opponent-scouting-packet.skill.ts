/**
 * @fileoverview Opponent Scouting Packet Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Standardizes opponent scouting output into a coach-ready packet.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class OpponentScoutingPacketSkill extends BaseSkill {
  readonly name = 'opponent_scouting_packet';
  readonly description =
    'Opponent scouting packets, tendency extraction, personnel threat grading, situational tendencies, ' +
    'set-play alerts, matchup keys, and prep priorities for coaches and staff.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(): string {
    return `## Opponent Scouting Packet

### Packet Sections
1. **Opponent Identity**: tempo, style, core strengths, primary pressure points
2. **Top Personnel**: role, usage, efficiency, go-to actions, pressure responses
3. **Tendency Map**: first-option calls, preferred zones, down-and-distance or game-state behavior
4. **Situational Alerts**: late-clock, after-timeout, red zone/critical moments, foul-game patterns
5. **Matchup Keys**: where we have leverage and where we are vulnerable

### Grading Model
- **Threat Level**: High / Medium / Low
- **Reliability**: High / Medium / Low based on sample size and recency
- **Prep Priority**: Tier 1 / Tier 2 / Tier 3

### Deliverable Rules
- Include concise "what to take away" notes for players.
- Distinguish verified tendency from one-off outcomes.
- Call out small-sample risk when data is thin.

### Output Format
- **3 Biggest Risks**
- **3 Highest-Value Counters**
- **First 5 Defensive/Offensive Priorities**`;
  }
}
