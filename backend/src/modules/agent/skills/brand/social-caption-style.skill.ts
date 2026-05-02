/**
 * @fileoverview Social Caption Style Skill
 * @module @nxt1/backend/modules/agent/skills/brand
 *
 * Provides the Brand & Media Coordinator with domain knowledge for
 * crafting social media captions and platform-specific content
 * for athlete and team branding.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class SocialCaptionStyleSkill extends BaseSkill {
  readonly name = 'social_caption_style';
  readonly description =
    'Social media caption writing for athlete and team branding: Instagram, Twitter/X, TikTok post copy, personal branding, NIL content, sports announcement captions, engagement optimization.';
  readonly category: SkillCategory = 'brand';

  getPromptContext(_params?: Record<string, unknown>): string {
    return `## Social Caption Guidelines

### Voice & Tone
- Confident, not cocky. Motivational, not cheesy.
- Write like a top sports media brand (Overtime, House of Highlights, Bleacher Report)
- Short, punchy sentences. Max 2-3 lines per post.
- Use emojis sparingly — max 2-3 per post, sport-relevant only (🏈🏀⚾🎾)

### Caption Structure
1. **Hook** (1 line): Attention-grabbing opener — stat, bold claim, or question
2. **Body** (1-2 lines): Context, achievement, or call-to-action
3. End the caption cleanly — no hashtags.

### Platform-Specific Rules
- **Instagram**: 2,200 char max.
- **Twitter/X**: 280 chars.
- **TikTok**: Short overlay text. Caption under 150 chars.

### Rules
- NEVER include hashtags. NXT1 does not support hashtags. Do not add any #terms to post content.
- NEVER include unverified stats in captions — only reference database-confirmed data
- NEVER tag schools or coaches without explicit user approval
- Include the NXT1 profile link when promoting the athlete's profile
- If the post accompanies a graphic, reference the visual ("📸 Check the new stat card")`;
  }
}
