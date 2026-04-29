/**
 * @fileoverview Welcome Graphic Prompt Templates
 * @module @nxt1/core/ai
 *
 * Prompt builders for the Agent X welcome graphic generation pipeline.
 * These produce the text prompts sent to the image model (Gemini 3 Pro Image)
 * via the BrandMediaCoordinatorAgent → GenerateGraphicTool flow.
 *
 * Two variants:
 * - Athlete welcome: personalized with sport, position, name, and team colors
 * - Team welcome: branded with team name, sport, and logo integration
 *
 * 100% portable — pure TypeScript, no framework dependencies.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AthleteWelcomePromptContext {
  readonly firstName: string;
  readonly sport?: string;
  readonly position?: string;
  readonly subjectImageUrl?: string;
  readonly teamColors?: readonly string[];
}

export interface TeamWelcomePromptContext {
  readonly teamName: string;
  readonly sport?: string;
  readonly logoUrl?: string;
  readonly teamColors?: readonly string[];
}

// ─── Prompt Builders ────────────────────────────────────────────────────────

/**
 * Build the image generation prompt for an athlete welcome graphic.
 */
export function buildAthleteWelcomePrompt(ctx: AthleteWelcomePromptContext): string {
  const sportLabel = ctx.sport ?? 'sports';
  const positionLabel = ctx.position ? ` — ${ctx.position}` : '';

  return [
    'Create a welcome graphic for a new athlete joining the platform.',
    '',
    '## Content',
    `- Headline: "WELCOME"`,
    `- Athlete Name: "${ctx.firstName.toUpperCase()}"`,
    `- Sport/Role: "${sportLabel.toUpperCase()}${positionLabel.toUpperCase()}"`,
    ...(ctx.subjectImageUrl ? [`- Athlete Photo: ${ctx.subjectImageUrl}`] : []),
    ...(ctx.teamColors?.length
      ? [`- Brand Colors: ${ctx.teamColors.join(', ')}`]
      : ctx.subjectImageUrl
        ? ['- Brand Colors: Derive the color palette from the athlete photo provided above.']
        : []),
    '',
    '## Rules',
    '- Do NOT draw, generate, or invent any logos, watermarks, or corner branding.',
    '- Be as creative as you want with the design, style, and composition.',
  ].join('\n');
}

/**
 * Build the image generation prompt for a team welcome graphic.
 */
export function buildTeamWelcomePrompt(ctx: TeamWelcomePromptContext): string {
  const sportLabel = ctx.sport ?? 'sports';

  return [
    'Create a welcome graphic for a new team joining the platform.',
    '',
    '## Content',
    `- Headline: "WELCOME"`,
    `- Team Name: "${ctx.teamName.toUpperCase()}"`,
    `- Sport: "${sportLabel.toUpperCase()}"`,
    ...(ctx.logoUrl ? [`- Team Logo: ${ctx.logoUrl}`] : []),
    ...(ctx.teamColors?.length
      ? [`- Brand Colors: ${ctx.teamColors.join(', ')}`]
      : ctx.logoUrl
        ? ['- Brand Colors: Derive the color palette from the team logo provided above.']
        : []),
    '',
    '## Rules',
    '- Do NOT draw, generate, or invent any logos, watermarks, or corner branding.',
    '- Be as creative as you want with the design, style, and composition.',
  ].join('\n');
}
