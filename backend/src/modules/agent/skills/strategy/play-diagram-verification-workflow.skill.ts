/**
 * @fileoverview Play Diagram Verification Workflow Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Teaches strategy workflows how to generate play-diagram image artifacts,
 * verify them with analyze_image, and only then present them to the user.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class PlayDiagramVerificationWorkflowSkill extends BaseSkill {
  readonly name = 'play_diagram_verification_workflow';
  readonly description =
    'Play diagram generation workflow for game-play requests: use create_play_diagram for plays, ' +
    'use create_board_diagram only for drills, run analyze_image on returned play diagram images ' +
    'before responding, reject mismatched or unverifiable web images, retry once with tighter play wording, ' +
    'and never claim a diagram exists without a verified image URL.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Play Diagram Verification Workflow

Use this workflow when the user asks for PLAYS, coverages, route concepts, formations, or playbook-style tactical diagrams.

### Tool Selection
- Use \`create_play_diagram\` for play requests.
- Use \`create_board_diagram\` only for drills and practice/training boards.
- Never substitute \`create_board_diagram\` for a normal play request.

### Required Verification Flow
1. Call \`create_play_diagram\` with the sport, title, and a detailed play description.
2. Inspect the tool result immediately.
3. If \`imageUrl\` / \`diagramUrl\` is missing, do NOT say the diagram was created. State that no usable image was returned and either retry once with tighter wording or report that no verified diagram is available.
4. If an image URL is present, call \`analyze_image\` on that returned URL before responding to the user.
5. When available, use the tool's returned \`verificationPrompt\` verbatim for \`analyze_image\` instead of improvising a looser prompt.
6. The verification must demand an explicit \`VERDICT: PASS\` or \`VERDICT: FAIL\` and must check all of the following:
  - the image is actually a sports play diagram / tactic board,
  - the sport matches the request,
  - the concept matches the requested play (for example Cover 3 beater, flood, smash, mesh, four verts),
  - the visible formation/routes/assignments materially align to the requested concept,
  - the image is not a generic sports photo, logo, unrelated graphic, or wrong scheme.
7. Only after \`analyze_image\` returns an explicit PASS should you present the diagram URL in chat.

### Failure Rules
- If \`analyze_image\` says the image is ambiguous, mismatched, wrong sport, wrong concept, or not clearly a tactical diagram, do NOT present it as valid.
- If \`analyze_image\` returns partial/unclear concept match or does not clearly say PASS, treat that as a failed verification.
- If analysis fails because the URL cannot be accessed or verified, do NOT claim success.
- For play-diagram web retrieval, one retry with a tighter description is acceptable; repeated unverifiable images should be reported honestly instead of fabricated.

### Multi-Play Requests
- Repeat the full sequence per requested play: \`create_play_diagram\` → \`analyze_image\` → user-facing response.
- Do not summarize five plays as "created" unless each one has a verified image result.

### Response Rule
- Never say "I've created the diagrams" unless you have real verified image URLs.
- When verified, include a short concept summary plus the actual diagram link.
- When not verified, say that verification failed and avoid attaching the unverified image as if it were correct.`;
  }
}
