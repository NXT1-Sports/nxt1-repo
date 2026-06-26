import { estimateChargeAmountSync } from '../../billing/pricing.service.js';

const DEFAULT_STANDARD_HOLD_COST_CENTS = 40;
const DEFAULT_COMPLEX_HOLD_COST_CENTS = 60;

const MEDIA_NOUN_PATTERN =
  /\b(video|videos|highlight|highlights|highlight\s+package|highlight\s+graphics?|reel|clips?|film|hudl|runway|ffmpeg|merge|combine|intro|opener|motion\s+graphic|thumbnail|poster|graphic|graphics|cutups?|montage|caption\s+pack)\b/i;
const MEDIA_VERB_PATTERN =
  /\b(create|make|generate|edit|build|produce|merge|combine|cut|trim|add|turn|post|render)\b/i;
const COMPLEX_WORKFLOW_PATTERN =
  /\b(create[-\s]+cutup[-\s]+folders|create[-\s]+highlight|pull[-\s]+best[-\s]+plays|practice[-\s]+scripts?|build[-\s]+practice[-\s]+plan|scout[-\s]+opponent[-\s]+tendencies|player[-\s]+evaluation[-\s]+notes|summari[sz]e(?:[-\s]+selection|[-\s]+files)?|extract[-\s]+key[-\s]+details|build[-\s]+action[-\s]+plan|action[-\s]+plan|gameday[-\s]+playbook|create[-\s]+gameday[-\s]+playbook|suggest[-\s]+new[-\s]+plays|install[-\s]+plan|coaching[-\s]+points|create[-\s]+scout[-\s]+team[-\s]+playbook|opening[-\s]+script|tempo[-\s]+packages?|trick[-\s]+play[-\s]+ideas|variations?|highlight\s+graphics?|performance\s+briefs?|branded\s+creative|break[-\s]*down|analy[sz]e|analysis|evaluation|evaluate|extract|summar(?:y|ize|ise)|scout(?:ing)?|practice|review|report|playbook|callsheet|install)\b/i;
const ATTACHMENT_COMPLEX_PATTERN =
  /\b(summar(?:y|ize|ise)|extract|analy[sz]e|evaluate|evaluation|scout(?:ing)?|plan|review|compare|break[-\s]*down|best\s+plays|key\s+details|tendencies|coaching\s+points|practice\s+scripts?|action\s+plan|opening\s+script|tempo\s+packages?|variations?)\b/i;
const ATTACHMENT_DOMAIN_PATTERN =
  /\b(files?|attachments?|documents?|folders?|materials?|reports?|pdfs?|spreadsheets?|playbooks?|installs?|callsheets?|film|clips?|cutups?|opponent|tendencies|graphics?)\b/i;

function parseConfiguredHoldCostCents(
  value: string | undefined,
  fallbackCents: number,
  minimumCents: number
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackCents;
  }

  return Math.max(parsed, minimumCents);
}

export const AGENT_X_STANDARD_HOLD_COST_CENTS = parseConfiguredHoldCostCents(
  process.env['AGENT_X_STANDARD_BILLING_GATE_COST_CENTS'],
  Math.max(DEFAULT_STANDARD_HOLD_COST_CENTS, estimateChargeAmountSync(0.1).chargeAmountCents),
  DEFAULT_STANDARD_HOLD_COST_CENTS
);

export const AGENT_X_COMPLEX_HOLD_COST_CENTS = parseConfiguredHoldCostCents(
  process.env['AGENT_X_COMPLEX_BILLING_GATE_COST_CENTS'] ??
    process.env['AGENT_X_MEDIA_BILLING_GATE_COST_CENTS'],
  Math.max(DEFAULT_COMPLEX_HOLD_COST_CENTS, AGENT_X_STANDARD_HOLD_COST_CENTS),
  AGENT_X_STANDARD_HOLD_COST_CENTS
);

export interface AgentXBillingGateEstimateInput {
  readonly text: string;
  readonly hasAttachment?: boolean;
}

export function estimateAgentXBillingGateCostCents(input: AgentXBillingGateEstimateInput): number {
  const text = input.text.toLowerCase();
  const isMediaIntent = MEDIA_NOUN_PATTERN.test(text) && MEDIA_VERB_PATTERN.test(text);
  const isComplexWorkflowIntent = COMPLEX_WORKFLOW_PATTERN.test(text);
  const isAttachmentHeavyIntent =
    Boolean(input.hasAttachment) &&
    (ATTACHMENT_COMPLEX_PATTERN.test(text) || ATTACHMENT_DOMAIN_PATTERN.test(text));

  return isMediaIntent || isComplexWorkflowIntent || isAttachmentHeavyIntent
    ? AGENT_X_COMPLEX_HOLD_COST_CENTS
    : AGENT_X_STANDARD_HOLD_COST_CENTS;
}
