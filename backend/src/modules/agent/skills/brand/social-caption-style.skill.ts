/**
 * @fileoverview Social Caption Style Skill
 * @module @nxt1/backend/modules/agent/skills/brand
 *
 * Provides the Brand & Media Coordinator with domain knowledge for
 * crafting social media captions, hashtag strategies, and platform-specific
 * content for athlete and team branding.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class SocialCaptionStyleSkill extends BaseSkill {
  readonly name = 'social_caption_style';
  readonly description =
    'Social media caption writing, hashtag strategy, Instagram Twitter TikTok post copy, athlete personal branding, NIL content, sports announcement captions, engagement optimization.';
  readonly category: SkillCategory = 'brand';

  getPromptContext(_params?: Record<string, unknown>): string {
    return `## Social Caption Guidelines

### Voice & Tone
- Confident, not cocky. Motivational, not cheesy.
- Write like a top sports media brand (Overtime, House of Highlights, Bleacher Report)
- Short, punchy sentences. Max 2–3 lines before the hashtag block.
- Use emojis sparingly — max 2–3 per post, sport-relevant only (🏈🏀⚾🎾)

### Caption Structure
1. **Hook** (1 line): Attention-grabbing opener — stat, bold claim, or question
2. **Body** (1–2 lines): Context, achievement, or call-to-action
3. **Hashtags** (separate block): 5–10 relevant hashtags, mix popular + niche

### Hashtag Strategy
- Always include: #NXT1 #AgentX #[Sport] #[State]
- Recruiting: #Recruit #ClassOf[Year] #[Position] #[Conference]
- Achievements: #MaxPreps #Highlights #GameDay #AllState
- NIL: #NIL #PersonalBrand #AthleteLife

### Platform-Specific Rules
- **Instagram**: 2,200 char max. Hashtags in first comment or after line breaks.
- **Twitter/X**: 280 chars. No hashtag blocks — weave 1–2 naturally.
- **TikTok**: Short overlay text. Caption under 150 chars. Trending sounds referenced.

### Rules
- NEVER include unverified stats in captions — only reference database-confirmed data
- NEVER tag schools or coaches without explicit user approval
- Include the NXT1 profile link when promoting the athlete's profile
- If the post accompanies a graphic, reference the visual ("📸 Check the new stat card")`;
  }
}
