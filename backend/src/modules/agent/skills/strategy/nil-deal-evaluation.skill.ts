/**
 * @fileoverview NIL Deal Evaluation Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Adds a structured framework for evaluating NIL opportunities by value,
 * brand fit, legal risk, execution burden, and long-term athlete outcomes.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class NilDealEvaluationSkill extends BaseSkill {
  readonly name = 'nil_deal_evaluation';
  readonly description =
    'NIL deal evaluation, compensation fairness, deliverable workload, exclusivity risk, ' +
    'contract red flags, audience-brand fit, tax and timeline awareness for athletes.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## NIL Deal Evaluation Framework

### Score Deals Out Of 100
- **Economic Value (30)**: cash value, product value, bonus terms, payment timing
- **Brand And Audience Fit (25)**: authentic fit with athlete identity, fan overlap, long-term positioning
- **Risk Profile (20)**: exclusivity limits, morality clauses, rights ownership, cancellation terms
- **Execution Burden (15)**: content workload, travel/time cost, season interference, revision burden
- **Future Optionality (10)**: does the deal block better partnerships or school-safe positioning later

### Red-Flag Checklist
- Unclear payment schedule or no written deliverables
- Perpetual usage rights without compensation adjustment
- Overbroad exclusivity that blocks common sponsor categories
- Penalties with no cure period
- Claims that require athlete guarantees they cannot verify

### Verdict Format
1. **Recommendation**: ACCEPT / NEGOTIATE / DECLINE
2. **Fairness Score**: numeric score with strongest and weakest dimensions
3. **Negotiation Points**: exact clauses to revise
4. **Compliance Gate**: what must be reviewed before signature

### Rules
- Always separate legal/compliance risk from marketing upside.
- Never advise signature when key terms are ambiguous.
- If contract text is incomplete, mark the recommendation as CONDITIONAL.`;
  }
}
