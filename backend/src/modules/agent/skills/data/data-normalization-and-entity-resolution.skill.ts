/**
 * @fileoverview Data Normalization And Entity Resolution Skill
 * @module @nxt1/backend/modules/agent/skills/data
 *
 * Standardizes how the Data Coordinator normalizes external data, resolves
 * duplicates, and decides whether records are safe to write.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class DataNormalizationAndEntityResolutionSkill extends BaseSkill {
  readonly name = 'data_normalization_and_entity_resolution';
  readonly description =
    'Entity resolution, duplicate detection, canonical school names, team normalization, source precedence, ' +
    'identity matching, confidence scoring, safe data writes for athlete and team ingestion.';
  readonly category: SkillCategory = 'data';

  getPromptContext(): string {
    return `## Data Normalization And Entity Resolution

### Source Precedence
When fields conflict, trust sources in this order unless the user explicitly overrides:
1. Official school, team, league, or governing body source
2. Verified athlete or parent-provided source already stored in NXT1
3. Major recruiting/stat platforms
4. Local media or secondary references
5. Social/profile text with no independent verification

### Identity Resolution Rules
Score confidence before writing:
- **High**: full name + school/team + sport + class year align
- **Medium**: name + two supporting fields align, but one field is missing or fuzzy
- **Low**: only name or nickname match without enough support

### Normalization Rules
- Preserve the raw source value in the write payload when possible, but write the canonical value to the primary field.
- Expand abbreviations when confidence is high: HS -> High School, Univ -> University, St. -> Saint only when clearly correct.
- Normalize case, spacing, punctuation, and duplicate whitespace.
- Never merge two people only because they share a common name.

### Safe Write Rules
- If confidence is Low, ask the user or defer the destructive write.
- Never overwrite a stronger verified value with a weaker scraped value.
- Prefer partial enrichment over risky full replacement.
- Record connected sources consistently so future syncs remain deterministic.`;
  }
}
