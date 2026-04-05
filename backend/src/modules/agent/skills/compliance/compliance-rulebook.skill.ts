/**
 * @fileoverview Compliance Rulebook Skill
 * @module @nxt1/backend/modules/agent/skills/compliance
 *
 * Provides the Compliance Coordinator with the NCAA/NAIA/NJCAA recruiting
 * calendar reference, eligibility requirements, and compliance verdict format.
 *
 * This is the SINGLE SOURCE OF TRUTH for compliance rules used by agents.
 * The ComplianceCoordinator's system prompt references this skill dynamically.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class ComplianceRulebookSkill extends BaseSkill {
  readonly name = 'compliance_rulebook';
  readonly description =
    'NCAA NAIA NJCAA recruiting calendar rules, contact periods, dead periods, eligibility requirements, GPA core courses SAT ACT thresholds, official unofficial visits, compliance verdicts.';
  readonly category: SkillCategory = 'compliance';

  getPromptContext(_params?: { division?: string; sport?: string }): string {
    return `## Recruiting Calendar Quick Reference

### NCAA Division I Football
- **Contact Period**: Coaches may have in-person contact on/off campus
- **Evaluation Period**: Coaches may evaluate but not have in-person contact off campus
- **Quiet Period**: Coaches may have in-person contact only on campus
- **Dead Period**: No in-person contact or evaluations whatsoever

### NCAA Division I — Non-Football
- Most sports: contact permitted year-round except dead periods around national championships.
- Basketball: specific contact and evaluation period windows apply.

### NCAA Division II & III
- Division II: no contact before September 1 of 11th grade.
- Division III: no restrictions on contact but still governs official visits.

### NAIA & NJCAA
- Generally fewer restrictions than NCAA D1, but official visit rules still apply.

## Academic Eligibility Cutoffs
- NCAA D1: 2.3 GPA in 16 core courses + 900 SAT / 75 ACT sum score
- NCAA D2: 2.2 GPA in 16 core courses + 840 SAT / 70 ACT sum score
- NCAA D3: Admission standards set by individual institutions
- NAIA: 2.0 GPA + 18 ACT / 860 SAT (or top-half class rank)
- NJCAA: High school diploma or GED required

## Compliance Verdict Format
Always structure compliance verdicts as:
1. **Status**: ✅ COMPLIANT / ⚠️ CAUTION / 🚫 BLOCKED
2. **Rule**: Which specific bylaw or period applies
3. **Reasoning**: Plain-language explanation
4. **Alternative**: If blocked, what can they do instead?
5. **Next Window**: When does the restriction lift?

## Rules
- When in doubt, flag as CAUTION and recommend consulting the school's compliance office.
- NEVER approve a communication that could constitute a recruiting violation.
- Always check today's date against the relevant recruiting calendar.
- Use search_web to verify current-year calendar dates (they change annually).`;
  }
}
