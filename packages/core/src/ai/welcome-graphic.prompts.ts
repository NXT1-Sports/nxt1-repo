/**
 * @fileoverview Welcome Graphic Prompt Templates
 * @module @nxt1/core/ai
 *
 * Prompt builders for the Agent X welcome graphic generation pipeline.
 * These produce the text prompts sent to the image model (Gemini 3 Pro Image)
 * via the BrandMediaCoordinatorAgent → GenerateImageTool flow.
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
  readonly profileImageUrl?: string;
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
    'Create a professional, high-energy sports welcome graphic with the following specifications:',
    '',
    '## Layout',
    '- Dimensions: square (1:1 aspect ratio), suitable for social media',
    '- Modern sports media aesthetic with bold typography',
    '- Clean composition with a dynamic gradient background',
    '',
    '## Color Palette',
    ...(ctx.teamColors?.length
      ? [
          `- Team colors: ${ctx.teamColors.join(', ')}`,
          '- Use the team colors for the gradient background, text highlights, and decorative elements',
        ]
      : [
          '- Use bold, energetic colors that match the sport',
          '- Ensure high contrast for readability',
        ]),
    '',
    '## Content',
    `- Large bold text: "WELCOME" across the top`,
    `- Name: "${ctx.firstName.toUpperCase()}"`,
    `- Sport badge: "${sportLabel.toUpperCase()}${positionLabel.toUpperCase()}"`,
    '- Small NXT1 branding text in the bottom corner: "NXT1 • The Future of Sports"',
    '',
    '## Style',
    `- Genre: ${sportLabel} sports media card`,
    '- Mood: exciting, welcoming, professional, premium',
    '- Elements: geometric shapes, light rays, energy lines',
    '- Typography: bold sans-serif, all-caps for name',
    '- No stock photos or clip art — abstract/geometric design only',
    '',
    '## Important',
    '- This is a GENERATED GRAPHIC, not a photo composite',
    '- Make it look like an official sports network welcome card',
    '- Ensure text is readable against the background',
  ].join('\n');
}

/**
 * Build the image generation prompt for a team welcome graphic.
 */
export function buildTeamWelcomePrompt(ctx: TeamWelcomePromptContext): string {
  const sportLabel = ctx.sport ?? 'sports';

  return [
    'Create a professional team welcome graphic with the following specifications:',
    '',
    '## Layout',
    '- Dimensions: square (1:1 aspect ratio), suitable for social media',
    '- Official sports organization aesthetic with bold branding',
    '- Clean, premium composition with a dynamic gradient background',
    '',
    '## Color Palette',
    ...(ctx.teamColors?.length
      ? [
          `- Team colors: ${ctx.teamColors.join(', ')}`,
          '- Use the team colors for the gradient, typography accents, and borders',
        ]
      : [
          '- Use bold, authoritative colors that match the sport',
          '- Ensure high contrast for readability',
        ]),
    '',
    '## Content',
    `- Large bold text: "WELCOME"`,
    `- Team name: "${ctx.teamName.toUpperCase()}"`,
    `- Sport label: "${sportLabel.toUpperCase()}"`,
    '- Tagline: "YOUR TEAM IS NOW ON NXT1"',
    '- Small NXT1 branding in the bottom corner: "NXT1 • The Future of Sports"',
    '',
    '## Style',
    `- Genre: ${sportLabel} team announcement card`,
    '- Mood: official, powerful, prestigious, premium',
    '- Elements: shield/crest motifs, bold borders, geometric patterns',
    '- Typography: bold sans-serif, all-caps, strong hierarchy',
    '- No stock photos — abstract/geometric design only',
    '',
    '## Important',
    '- This is a GENERATED GRAPHIC, not a photo composite',
    '- Make it look like an official program announcement',
    '- Ensure all text is clearly readable',
  ].join('\n');
}
