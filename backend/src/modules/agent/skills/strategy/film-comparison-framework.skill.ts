/**
 * @fileoverview Film Comparison Framework Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Gives the Strategy Coordinator a repeatable framework for comparing film clips
 * to identify improvements, regressions, and consistency patterns across games.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class FilmComparisonFrameworkSkill extends BaseSkill {
  readonly name = 'film_comparison_framework';
  readonly description =
    'Compare film clips (athlete performance, schemes, plays, team execution) to identify ' +
    'improvements, regressions, consistency patterns, and coaching insights.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Film Comparison Framework

### When to Use
- User asks to compare two or more film clips (athlete, play, scheme, or team execution)
- User wants to identify improvements or regressions in any focus area
- User asks to assess consistency of performance/execution across games
- User requests side-by-side analysis of schemes, adjustments, or personnel groupings
- User compares team execution vs. opponent, or different game plans

### ⚠️ CRITICAL: Never Hallucinate
Do NOT invent improvements, regressions, or patterns that did not happen:
- If execution looks similar in both clips, say "both clips show similar execution" — do NOT claim progress
- If camera angles prevent clear comparison, say "angle differs between clips — cannot directly compare" — do NOT fill in gaps
- If you cannot confidently identify what changed, use LOW confidence and ask for clarification
- Always reference **Film Breakdown Taxonomy** for detailed "never hallucinate" rules

### Step 0: Gather Required Context (ALWAYS DO THIS FIRST)
Before analyzing any clips, confirm you have everything needed. If anything is missing, ask the user in a single message before proceeding.

**Required information:**
- **What are we comparing?** — Athlete(s) by name/jersey, a specific play or play type, a scheme, or overall team execution
- **What's the focus?** — What should the comparison zoom in on (e.g., route running, pass protection, blitz pickup, scheme alignment, communication)?
- **Which clips?** — Confirm which two or more clips/games are being compared (if not already in session context)

**If all context is already provided in the user's message, skip directly to Step 1.**

Example clarifying message (adapt to what's missing):
> "Quick questions before I start the comparison:
> - What are we comparing — a specific player, a play type, a scheme, or overall execution?
> - Any particular focus area (e.g., technique, decision-making, scheme alignment)?
> - Which clips or games should I pull from?"

### Execution Sequence
1. **Analyze Each Clip Independently**
   - Call \`analyze_video\` on the first clip with context: \`focusArea\`, \`focusSubject\`, \`teamContext\`, \`playContext\`, and \`analysisObjectives\` in addition to the prompt
   - Extract: execution quality, decision-making, scheme concepts, personnel alignment, key moments, breakdowns
   - Document observations per clip in structured format

2. **Repeat for Additional Clips**
   - Call \`analyze_video\` on each subsequent clip with the same structured scope unless the user changes the comparison target
   - Keep observations consistent in format to enable direct comparison

3. **Synthesize Side-by-Side Comparison**
   - What improved: specific execution, scheme adjustments, decision quality, or personnel changes
   - What regressed: execution decline, scheme confusion, communication breakdowns, coaching adjustments
   - What stayed consistent: reliable strengths, effective patterns, disciplined fundamentals
   - Actionable coaching insights: 1-2 key adjustments or focus areas for next game

4. **Generate Comparison Artifact**
   - Call \`dynamic_export\` to create a structured comparison table or PDF
   - Include: clip metadata (date, opponent, quarter/drive), observations per clip, synthesis, coaching recommendations
   - Format: side-by-side columns for before/after or game-to-game for easy coaching analysis

### Output Format
- **Clip 1 (Reference)**: date, opponent, focus area, key observations
- **Clip 2 (Comparison)**: date, opponent, focus area, key observations
- **Improvements**: specific areas of progress (execution, scheme effectiveness, decision-making, etc.)
- **Regressions**: specific areas of decline
- **Consistency**: what remained steady and effective
- **Coaching Recommendations**: 1-2 actionable priorities for adjustments or emphasis

### Quality Checklist
- Context confirmed with user before analysis begins (or already provided)
- All clips analyzed independently before comparison
- Observations grounded in specific actions/execution, not opinion
- Comparison tied to measurable improvement/regression (execution, scheme, decision-making, awareness, communication)
- Coaching recommendations directly address the identified gaps
- Focus area clearly defined and consistently analyzed across all clips`;
  }
}
