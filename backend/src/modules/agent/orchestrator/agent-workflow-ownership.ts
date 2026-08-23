import type { AgentIdentifier } from '@nxt1/core';

export type AgentWorkflowId =
  | 'film_review_game_plan'
  | 'film_review_player_evaluation'
  | 'film_review_cutup_creation'
  | 'creative_video_edit'
  | 'recruiting_outreach_campaign'
  | 'data_import_profile_sync'
  | 'strategy_file_artifact'
  | 'practice_script_from_playbook'
  | 'callsheet_generation'
  | 'analytics_report'
  | 'file_organization';

type CoordinatorAgentId = Exclude<AgentIdentifier, 'router'>;

export interface AgentWorkflowOwnershipDecision {
  readonly workflowId: AgentWorkflowId;
  readonly owner: CoordinatorAgentId;
  readonly confidence: 'high' | 'medium';
  readonly reason: string;
  readonly recoveryInstruction: string;
}

interface WorkflowRule {
  readonly workflowId: AgentWorkflowId;
  readonly owner: CoordinatorAgentId;
  readonly confidence: 'high' | 'medium';
  readonly matches: (input: WorkflowOwnershipInput) => boolean;
  readonly reason: string;
  readonly recoveryInstruction: string;
}

export interface WorkflowOwnershipInput {
  readonly intent: string;
  readonly structuredPayload?: Record<string, unknown>;
}

const FILM_POINTER_KEYS = new Set([
  'filmReviewId',
  'film_review_id',
  'sourceId',
  'sourceIds',
  'filmReviewSourceId',
  'selectedSourceIds',
]);

const STRATEGY_FILES_PREFLIGHT =
  'Use semantic Files discovery first with list_universal_team_documents for the artifact family and football terminology needed, then hydrate selected/referenced Files with get_universal_team_document as high-priority candidates. If any selected/referenced File is a pointer PDF or uploaded document, parse or render it as needed before using it. Do not fall back to legacy playbook/database assumptions while relevant Files artifacts exist.';

const WORKFLOW_RULES: readonly WorkflowRule[] = [
  {
    workflowId: 'callsheet_generation',
    owner: 'strategy_coordinator',
    confidence: 'high',
    matches: (input) => /\b(call\s*sheet|callsheet|call\s+menu|wristband)\b/i.test(input.intent),
    reason: 'Callsheets and call menus belong to Strategy.',
    recoveryInstruction: `Continue this callsheet workflow locally. ${STRATEGY_FILES_PREFLIGHT} Build situational sections from verified play concepts and film tendencies, then default to render_html_pdf for a printable staff-ready artifact unless the user explicitly asks for an editable XLSX/workbook.`,
  },
  {
    workflowId: 'practice_script_from_playbook',
    owner: 'strategy_coordinator',
    confidence: 'high',
    matches: (input) =>
      /\b(practice\s+script|practice\s+matrix|install\s+script)\b/i.test(input.intent),
    reason: 'Practice scripts and install matrices belong to Strategy.',
    recoveryInstruction: `Continue this practice-script workflow locally. ${STRATEGY_FILES_PREFLIGHT} Generate the script from verified playbook/install content, persist it when requested/defaulted, and export only when appropriate.`,
  },
  {
    workflowId: 'film_review_game_plan',
    owner: 'strategy_coordinator',
    confidence: 'high',
    matches: (input) =>
      hasFilmReviewSignal(input) &&
      /\b(game\s*plan|call\s*sheet|callsheet|opponent|tendenc(?:y|ies)|attack(?:ing)?\s+concepts?|defensive\s+plan|offensive\s+plan|scout(?:ing)?\s+plan|matchup\s+plan|diagrams?)\b/i.test(
        input.intent
      ),
    reason: 'Film-review opponent scouting and game-planning belongs to Strategy.',
    recoveryInstruction: `Continue this film-review game-plan workflow locally. Use available film-review rows first, analyze representative clips if rows are sparse, and use strategy Files preflight when team plays, templates, installs, or prior plans matter: ${STRATEGY_FILES_PREFLIGHT} Produce strategy deliverables and verified artifacts. Do not delegate only because tags are missing.`,
  },
  {
    workflowId: 'strategy_file_artifact',
    owner: 'strategy_coordinator',
    confidence: 'high',
    matches: (input) =>
      /\b(game\s*plan|scout\s+report|opponent\s+report|install\s+sheet|weekly\s+plan|checklist|practice\s+plan|playbook|call\s*sheet|callsheet|notes?|summary|breakdown)\b/i.test(
        input.intent
      ) &&
      /\b(files?|team\s+files?|selected|attached|uploaded|template|sample|document|pdf|library|our\s+plays?|playbook|install)\b/i.test(
        input.intent
      ),
    reason:
      'Files-backed strategy artifacts belong to Strategy with semantic Files discovery first.',
    recoveryInstruction: `Continue this Files-backed strategy artifact workflow locally. ${STRATEGY_FILES_PREFLIGHT} Create the requested strategy artifact from verified source documents and persist/export according to user intent.`,
  },
  {
    workflowId: 'film_review_player_evaluation',
    owner: 'performance_coordinator',
    confidence: 'high',
    matches: (input) =>
      hasFilmReviewSignal(input) &&
      /\b(player\s+grade|grade\s+player|evaluate|evaluation|technique|mechanics|performance|scout(?:ing)?\s+report|athlete\s+report|prospect|combine|metrics?)\b/i.test(
        input.intent
      ),
    reason: 'Film-review player grading and technique evaluation belongs to Performance.',
    recoveryInstruction:
      'Continue this film-review player-evaluation workflow with performance analysis tools. Do not route it as a game-plan or data-import task.',
  },
  {
    workflowId: 'film_review_cutup_creation',
    owner: 'performance_coordinator',
    confidence: 'medium',
    matches: (input) =>
      hasFilmReviewSignal(input) &&
      /\b(cutup|cut\s*up|clip\s+folder|extract\s+clips?|make\s+(?:a\s+)?clips?|trim\s+clips?|source\s+extraction|new\s+review\s+from\s+clips?)\b/i.test(
        input.intent
      ),
    reason: 'Film-review cutup/source extraction is a film-review media workflow.',
    recoveryInstruction:
      'Continue with film-review source extraction/cutup tools. Preserve source-scoped rows and ask only for missing boundaries or folder details.',
  },
  {
    workflowId: 'creative_video_edit',
    owner: 'brand_coordinator',
    confidence: 'high',
    matches: (input) =>
      /\b(create|make|generate|produce|cut|edit|turn\s+into|convert|assemble|merge)\b/i.test(
        input.intent
      ) &&
      /\b(highlight|reel|promo|cinematic|best moments|recap|teaser|social video|motion graphic|intro|branded)\b/i.test(
        input.intent
      ) &&
      /\b(video|videos|clip|clips|x|twitter|tweet|post|hudl|youtube|instagram|media)\b/i.test(
        input.intent
      ),
    reason: 'Creative video production belongs to Brand.',
    recoveryInstruction:
      'Continue as a creative media workflow. Acquire the media, edit/export the asset, and do not route to performance for athletic grading unless explicitly requested.',
  },
  {
    workflowId: 'recruiting_outreach_campaign',
    owner: 'recruiting_coordinator',
    confidence: 'high',
    matches: (input) =>
      /\b(recruiting?|college|colleges|programs?|coaches?|outreach|email\s+campaign|email\s+outreach|send\s+emails?|draft\s+emails?|follow-?up\s+emails?)\b/i.test(
        input.intent
      ),
    reason: 'Recruiting outreach belongs to Recruiting.',
    recoveryInstruction:
      'Continue this recruiting outreach workflow with recipient resolution, message drafting, approval, and connected-email checks.',
  },
  {
    workflowId: 'data_import_profile_sync',
    owner: 'data_coordinator',
    confidence: 'high',
    matches: (input) =>
      /\b(import|sync|scrape|crawl|normalize|dataset|csv|spreadsheet|profile\s+sync|data\s+acquisition|connected\s+source)\b/i.test(
        input.intent
      ),
    reason: 'Data import, normalization, and profile sync belongs to Data.',
    recoveryInstruction:
      'Continue this data workflow with acquisition, normalization, verification, and write tools. Do not route to strategy just because the output may later support a report.',
  },
  {
    workflowId: 'analytics_report',
    owner: 'strategy_coordinator',
    confidence: 'medium',
    matches: (input) =>
      /\b(analytics\s+report|chart|graph|trendline|leaderboard|funnel|dashboard|pipeline\s+visual)\b/i.test(
        input.intent
      ),
    reason: 'Strategic analytics reports and charts belong to Strategy.',
    recoveryInstruction:
      'Continue this analytics reporting workflow locally with analytics/chart/export tools. Route to Data only for raw import or normalization.',
  },
  {
    workflowId: 'file_organization',
    owner: 'strategy_coordinator',
    confidence: 'medium',
    matches: (input) =>
      /\b(files?\s+folder|organize\s+files?|move\s+files?|create\s+folder|folder\s+cleanup)\b/i.test(
        input.intent
      ),
    reason:
      'User-visible Files organization is handled through the workspace/file tools exposed to Strategy.',
    recoveryInstruction:
      'Continue this Files organization workflow locally. Resolve folders before moving files and never delete as a shortcut for cleanup.',
  },
];

export function inferWorkflowOwnership(
  intent: string,
  structuredPayload?: Record<string, unknown>
): AgentWorkflowOwnershipDecision | null {
  const input: WorkflowOwnershipInput = {
    intent: normalizeIntent(intent),
    ...(structuredPayload ? { structuredPayload } : {}),
  };

  for (const rule of WORKFLOW_RULES) {
    if (!rule.matches(input)) continue;
    return {
      workflowId: rule.workflowId,
      owner: rule.owner,
      confidence: rule.confidence,
      reason: rule.reason,
      recoveryInstruction: rule.recoveryInstruction,
    };
  }

  return null;
}

export function buildWorkflowRecoveryIntent(
  intent: string,
  decision: AgentWorkflowOwnershipDecision
): string {
  return [
    intent,
    '',
    `[Workflow Ownership: ${decision.workflowId}]`,
    `Owner: ${decision.owner}.`,
    `Reason: ${decision.reason}`,
    `Recovery: ${decision.recoveryInstruction}`,
  ].join('\n');
}

function hasFilmReviewSignal(input: WorkflowOwnershipInput): boolean {
  if (
    /\b(film\s+review|selected\s+(?:film\s+)?clips?|selected\s+plays?|source\s+breakdown|breakdown\s+rows|odk|down\/?distance|wide\s+clip)\b/i.test(
      input.intent
    )
  ) {
    return true;
  }

  const payload = input.structuredPayload;
  if (!payload) return false;

  return Object.keys(payload).some((key) => FILM_POINTER_KEYS.has(key));
}

function normalizeIntent(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
