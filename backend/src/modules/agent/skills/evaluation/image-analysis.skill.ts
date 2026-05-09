/**
 * @fileoverview Image Analysis Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Teaches evaluators and data coordinators how to use AI vision for athlete
 * image verification, classification, and visual evidence extraction.
 *
 * Loaded by: PerformanceCoordinatorAgent, DataCoordinatorAgent
 * Invokes: analyze_image tool (vision_analysis tier)
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class ImageAnalysisSkill extends BaseSkill {
  readonly name = 'image_analysis';
  readonly description =
    'Athlete image classification, sport context detection, jersey number identification, ' +
    'headshot vs action shot vs team photo distinction, recruiting photo quality standards, ' +
    'image verification before persisting to profile, visual evidence extraction for intel reports, ' +
    'sport mismatch rejection, body composition observation, position indicator identification, ' +
    'profile image enrichment with visionSummary, image quality gating.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(): string {
    return `## Image Analysis Operating Rules

Use \`analyze_image\` to extract visual evidence from athlete photos and verify images before persisting them.
Never infer sport, position, or athlete identity from filename, URL metadata, or caption text alone.

### When to Call analyze_image

**During Intel Report Generation (PerformanceCoordinator):**
1. After reading core identity and sport sections from a scraped profile, check if the athlete has existing \`profileImgs\` in their NXT1 profile.
2. Call \`analyze_image\` on up to 5 of the most recent images (most recent first).
3. Use the prompt: "Analyze these athlete images: classify each as action_shot, headshot, team_photo, graphic, or banner. Identify sport context, jersey number (if visible), position indicators, and physical attributes. Note image quality and suitability for a recruiting profile."
4. Incorporate the returned analysis as visual evidence in the intel report's Physical Profile and Technical sections.
5. Pass the analysis text as \`visionSummary\` when calling \`write_athlete_images\`.

**During Data Verification (DataCoordinator):**
1. After \`scrape_and_index_profile\` returns an athlete profile, if images were discovered via \`extract_page_images\`, call \`analyze_image\` before calling \`write_athlete_images\`.
2. Verify: (a) subject appears to be the correct athlete, (b) sport context matches the athlete's declared sport.
3. Reject only on clear sport mismatch (e.g., image shows a swimmer but athlete is a football player).
4. Flag ambiguous cases (e.g., off-field photo where sport is unclear) with a note in the caption — do NOT silently drop them.
5. Images that pass verification: include in \`write_athlete_images\` call with \`visionSummary\` set to the analysis text.
6. Cap at 20 images per \`write_athlete_images\` call to avoid token/cost spikes.

### Sport-Aware Classification Rules

**Jersey-dominant sports** (jersey number typically visible):
- Football, basketball, baseball, softball, volleyball, lacrosse, hockey, soccer
- In action shots, expect to see jersey number if the athlete is in mid-play.
- In headshots or portrait-style images, jersey number may not be visible.

**Non-jersey sports** (uniform present but number not standard):
- Swimming, track and field, cross country, tennis, golf, gymnastics, wrestling, rowing
- Do NOT flag absence of jersey number as a mismatch for these sports.
- Look for sport-specific equipment, attire, or venue instead.

**Headshot / Portrait rules:**
- Headshots do not need to show athletic context — they are valid profile photos.
- A clear, well-lit face shot is a high-quality headshot regardless of attire.
- Flag blurry, heavily filtered, or group shots where the athlete is not the primary subject.

### Reject Criteria (Drop the Image)
- Clear sport mismatch: image unambiguously shows a different sport (e.g., swim cap/goggles for a football player).
- Wrong subject: image clearly shows a different athlete (different name on jersey, different institution).
- Non-athlete content: pure team logo, stadium exterior, graphic without any person visible.

### Flag-Only Criteria (Include with Note)
- Athlete's face partially obscured or back turned — still valid if sport context is correct.
- Off-field/casual photo — valid if the person reasonably appears to be the athlete.
- Mixed group photo — valid if the athlete appears to be present and identifiable.
- Low resolution — note quality issue in caption; still persist unless resolution is <50px.

### Token Budget
- Batch up to 5 image URLs per \`analyze_image\` call for efficiency.
- Do not call \`analyze_image\` more than twice per intel report generation cycle.
- Never analyze images you already have a \`visionSummary\` for.

### Output Integration
When \`analyze_image\` returns:
- For \`write_athlete_images\`: set \`visionSummary\` to the full analysis text, set \`kind\` to the classified type.
- For \`write_intel\`: include key observations (physicality, technique indicators, sport confirmation) in the relevant intel sections.
- For scout reports: cite visual evidence explicitly: "Based on image analysis: [observation]."
`;
  }
}
