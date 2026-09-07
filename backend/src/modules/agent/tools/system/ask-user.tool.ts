/**
 * @fileoverview Ask User Tool — Suspend & Resume
 * @module @nxt1/backend/modules/agent/tools/comms
 *
 * When Agent X needs information it cannot find on its own (e.g. "Which
 * college is your top choice?"), the LLM calls this tool. Instead of
 * returning data, it throws an AgentYieldException which causes the
 * worker to:
 * 1. Serialize the full LLM message array to MongoDB/Firestore.
 * 2. Send the user a push notification with the question.
 * 3. Mark the job as `awaiting_input`.
 * 4. Complete the BullMQ job cleanly (no failure).
 *
 * When the user replies (via chat or the notification deep link),
 * POST /resume-job/:operationId re-enqueues a new job that injects
 * the user's answer into the saved message array and continues the ReAct loop.
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import { AgentYieldException } from '../../exceptions/agent-yield.exception.js';
import type {
  AgentToolCategory,
  AgentIdentifier,
  AgentXSelectedContext,
  AgentXOutputFormatTag,
  AgentXOutputOptionIcon,
} from '@nxt1/core';
import type { LLMMessage } from '../../llm/llm.types.js';
import { z } from 'zod';

/**
 * Context injected into the tool input by the ReAct loop so AskUserTool
 * knows which agent is executing and has access to the current message array.
 *
 * This is passed through the `input` object (as `__yieldContext`) rather than
 * stored as mutable state on the singleton — critical because
 * WORKER_CONCURRENCY > 1 and the tool registry holds a single instance.
 */
export interface AskUserToolContext {
  readonly agentId: AgentIdentifier;
  readonly messages: readonly LLMMessage[];
  readonly toolCallId?: string;
  readonly planContext?: {
    readonly currentTaskId: string;
    readonly completedTaskResults: Record<string, unknown>;
    readonly enrichedIntent: string;
  };
  readonly selectedContexts?: readonly AgentXSelectedContext[];
}

/** Key used to inject context into the tool input. Prefixed to avoid LLM collision. */
export const ASK_USER_CONTEXT_KEY = '__yieldContext' as const;

const ASK_USER_FORMAT_TAGS = [
  'PDF',
  'GAMMA',
  'XLSX',
  'PPTX',
  'CSV',
  'WEB',
  'CHOICE',
  'CUSTOM',
] as const;
const ASK_USER_OPTION_ICONS = [
  'pdf',
  'presentation',
  'spreadsheet',
  'slides',
  'web',
  'sparkles',
  'choice',
  'edit',
] as const;

const askUserOptionObjectSchema = z
  .object({
    id: z.string().trim().min(1).max(80).optional(),
    value: z.string().trim().min(1).max(120).optional(),
    label: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(240).optional(),
    formatTag: z.enum(ASK_USER_FORMAT_TAGS).optional(),
    icon: z.enum(ASK_USER_OPTION_ICONS).optional(),
    badge: z.string().trim().min(1).max(40).optional(),
    disabled: z.boolean().optional(),
    disabledReason: z.string().trim().min(1).max(140).optional(),
  })
  .refine((value) => !!(value.title ?? value.label ?? value.value ?? value.id), {
    message: 'Each option must include title, label, value, or id',
  });

const askUserOptionSchema = z.union([
  z.string().trim().min(1).max(120),
  askUserOptionObjectSchema,
]);

const askUserSchema = z.object({
  /** Short label for push/SMS preview + waiting affordance — NOT the full question (write that as prose first). */
  question: z.string().trim().min(1).max(160),
  context: z.string().trim().min(1).max(500).optional(),
  inputMode: z.enum(['text', 'single_select', 'multi_select']).optional(),
  category: z
    .enum(['film_review', 'playbook', 'stats_report', 'scout_card', 'roster', 'general'])
    .optional(),
  options: z.array(askUserOptionSchema).min(1).max(8).optional(),
  steps: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80).optional(),
        question: z.string().trim().min(1).max(160),
        context: z.string().trim().min(1).max(500).optional(),
        inputMode: z.enum(['text', 'single_select', 'multi_select']),
        options: z.array(askUserOptionSchema).min(1).max(8).optional(),
        defaultSelectedIds: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
        allowCustomText: z.boolean().optional(),
        customPlaceholder: z.string().trim().min(1).max(140).optional(),
      })
    )
    .min(1)
    .max(12)
    .optional(),
  defaultSelectedIds: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  allowCustomText: z.boolean().optional(),
});

function defaultIconForFormat(formatTag: AgentXOutputFormatTag): AgentXOutputOptionIcon {
  switch (formatTag) {
    case 'PDF':
      return 'pdf';
    case 'GAMMA':
      return 'sparkles';
    case 'XLSX':
    case 'CSV':
      return 'spreadsheet';
    case 'PPTX':
      return 'slides';
    case 'WEB':
      return 'web';
    case 'CHOICE':
      return 'choice';
    case 'CUSTOM':
      return 'edit';
  }
}

function normalizeOptionId(value: string, index: number): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return normalized || `option_${index + 1}`;
}

function inferFormatTagFromOptionText(value: string): AgentXOutputFormatTag {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'CHOICE' as AgentXOutputFormatTag;
  if (/\bgamma\b/.test(normalized)) return 'GAMMA' as AgentXOutputFormatTag;
  if (/\b(?:xlsx|excel|workbook|spreadsheet)\b/.test(normalized)) {
    return 'XLSX' as AgentXOutputFormatTag;
  }
  if (/\bcsv\b/.test(normalized)) return 'CSV' as AgentXOutputFormatTag;
  if (/\b(?:pptx|powerpoint|slide(?:s)?|deck)\b/.test(normalized)) {
    return 'PPTX' as AgentXOutputFormatTag;
  }
  if (/\b(?:pdf|printable)\b/.test(normalized)) return 'PDF' as AgentXOutputFormatTag;
  if (/\b(?:web|website|landing page|page)\b/.test(normalized)) {
    return 'WEB' as AgentXOutputFormatTag;
  }
  if (/\b(?:custom|other)\b/.test(normalized)) return 'CUSTOM' as AgentXOutputFormatTag;
  return 'CHOICE' as AgentXOutputFormatTag;
}

function normalizeAskUserOption(
  option: z.infer<typeof askUserOptionSchema>,
  index: number
): {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly formatTag: AgentXOutputFormatTag;
  readonly icon: AgentXOutputOptionIcon;
  readonly badge?: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
} {
  if (typeof option === 'string') {
    const title = option.trim();
    const formatTag = inferFormatTagFromOptionText(title);
    return {
      id: normalizeOptionId(title, index),
      title,
      description: '',
      formatTag,
      icon: defaultIconForFormat(formatTag),
    };
  }

  const title = (option.title ?? option.label ?? option.value ?? option.id ?? `Option ${index + 1}`).trim();
  const id = normalizeOptionId(option.id ?? option.value ?? option.label ?? title, index);
  const inferredFormatTag = inferFormatTagFromOptionText(`${title} ${id} ${option.description ?? ''}`);
  const formatTag =
    inferredFormatTag === 'GAMMA' ? inferredFormatTag : (option.formatTag ?? inferredFormatTag);
  return {
    id,
    title,
    description: option.description?.trim() ?? '',
    formatTag,
    icon: option.icon ?? defaultIconForFormat(formatTag),
    ...(option.badge ? { badge: option.badge } : {}),
    ...(option.disabled !== undefined ? { disabled: option.disabled } : {}),
    ...(option.disabledReason ? { disabledReason: option.disabledReason } : {}),
  };
}

const FILM_REPORT_DELIVERY_OPTIONS: readonly z.infer<typeof askUserOptionSchema>[] = [
  {
    id: 'chat_summary',
    title: 'Chat Summary',
    description: 'Trends and analysis right here in the conversation.',
    formatTag: 'CHOICE',
    icon: 'choice',
  },
  {
    id: 'printable_pdf',
    title: 'Printable PDF',
    description: 'Best for sharing with staff or printing.',
    formatTag: 'PDF',
    icon: 'pdf',
  },
  {
    id: 'gamma_pdf',
    title: 'Gamma PDF',
    description: 'Narrative Gamma-styled PDF with richer layout.',
    formatTag: 'GAMMA',
    icon: 'sparkles',
  },
  {
    id: 'gamma_deck',
    title: 'Gamma Deck',
    description: 'Interactive meeting deck or presentation.',
    formatTag: 'GAMMA',
    icon: 'sparkles',
  },
  {
    id: 'editable_pptx',
    title: 'Editable PPTX',
    description: 'PowerPoint deck you can revise after export.',
    formatTag: 'PPTX',
    icon: 'slides',
  },
  {
    id: 'xlsx_workbook',
    title: 'XLSX Workbook',
    description: 'Editable spreadsheet for splits, filters, and staff notes.',
    formatTag: 'XLSX',
    icon: 'spreadsheet',
  },
  {
    id: 'csv',
    title: 'CSV',
    description: 'Flat raw data for import or spreadsheet work.',
    formatTag: 'CSV',
    icon: 'spreadsheet',
  },
];

const FILM_REPORT_PERSPECTIVE_OPTIONS: readonly z.infer<typeof askUserOptionSchema>[] = [
  {
    id: 'self_scout',
    title: 'Self-scout our tendencies',
    description: 'Focus on our execution, tendencies, and coaching priorities.',
    formatTag: 'CHOICE',
    icon: 'choice',
  },
  {
    id: 'opponent_scout',
    title: 'Opponent scout their tendencies',
    description: 'Focus on opponent patterns, stress points, and plan implications.',
    formatTag: 'CHOICE',
    icon: 'choice',
  },
  {
    id: 'balanced_tendencies',
    title: 'Balanced team-vs-team trends',
    description: 'Compare both teams and separate what each side showed.',
    formatTag: 'CHOICE',
    icon: 'choice',
  },
];

function isFilmReportPerspectiveStep(
  step: NonNullable<z.infer<typeof askUserSchema>['steps']>[number]
): boolean {
  const text = `${step.id ?? ''} ${step.question}`.toLowerCase();
  return /\b(kind|type|perspective|focus)\b.*\breport\b|\breport\b.*\b(kind|type|perspective|focus)\b|\bself[-\s]?scout\b|\bopponent\s+scout\b|\bbalanced\s+(?:team[-\s]?vs[-\s]?team\s+)?tendenc(?:y|ies)\b/.test(
    text
  );
}

function normalizeFilmReportPerspectiveOptions(): readonly ReturnType<typeof normalizeAskUserOption>[] {
  return FILM_REPORT_PERSPECTIVE_OPTIONS.map((option, index) =>
    normalizeAskUserOption(option, index)
  );
}

function isFilmReportDeliveryStep(
  step: NonNullable<z.infer<typeof askUserSchema>['steps']>[number]
): boolean {
  const text = `${step.id ?? ''} ${step.question}`.toLowerCase();
  if (/\b(kind|type|perspective|focus)\b.*\breport\b|\breport\b.*\b(kind|type|perspective|focus)\b/.test(text)) {
    return false;
  }

  return /\b(deliver(?:y|ed)?|output|package|format|export|pdf|deck|pptx|workbook|xlsx|csv)\b/.test(text);
}

function normalizeFilmReportDeliveryOptions(
  options: readonly ReturnType<typeof normalizeAskUserOption>[] | undefined
): readonly ReturnType<typeof normalizeAskUserOption>[] {
  const incomingById = new Map((options ?? []).map((option) => [option.id, option]));
  return FILM_REPORT_DELIVERY_OPTIONS.map((option, index) => {
    const normalized = normalizeAskUserOption(option, index);
    return { ...normalized, ...(incomingById.get(normalized.id) ?? {}) };
  });
}

function normalizeAskUserStep(
  step: NonNullable<z.infer<typeof askUserSchema>['steps']>[number],
  index: number,
  forceFilmReportDeliveryContext = false
): {
  readonly id: string;
  readonly prompt: string;
  readonly context?: string;
  readonly inputMode: 'text' | 'single_select' | 'multi_select';
  readonly options?: readonly ReturnType<typeof normalizeAskUserOption>[];
  readonly allowCustomOption?: boolean;
  readonly defaultSelectedIds?: readonly string[];
  readonly customPlaceholder?: string;
} {
  const normalizedOptions = step.options?.map((option, optionIndex) =>
    normalizeAskUserOption(option, optionIndex)
  );
  const forceFilmReportPerspective =
    forceFilmReportDeliveryContext && isFilmReportPerspectiveStep(step);
  const forceFilmReportDelivery = forceFilmReportDeliveryContext && isFilmReportDeliveryStep(step);

  return {
    id: normalizeOptionId(step.id ?? `step_${index + 1}`, index),
    prompt: step.question,
    ...(step.context ? { context: step.context } : {}),
    inputMode: forceFilmReportDelivery ? 'multi_select' : forceFilmReportPerspective ? 'single_select' : step.inputMode,
    ...(normalizedOptions || forceFilmReportDelivery || forceFilmReportPerspective
      ? {
          options: forceFilmReportPerspective
            ? normalizeFilmReportPerspectiveOptions()
            : forceFilmReportDelivery
              ? normalizeFilmReportDeliveryOptions(normalizedOptions)
              : normalizedOptions,
        }
      : {}),
    allowCustomOption: forceFilmReportDelivery
      ? true
      : forceFilmReportPerspective
        ? true
        : step.allowCustomText,
    ...(step.defaultSelectedIds ? { defaultSelectedIds: step.defaultSelectedIds } : {}),
    ...(step.customPlaceholder ? { customPlaceholder: step.customPlaceholder } : {}),
  };
}

function buildFallbackTextStep(question: string): ReturnType<typeof normalizeAskUserStep> {
  return {
    id: 'response',
    prompt: question,
    inputMode: 'text',
    allowCustomOption: true,
    customPlaceholder: 'Type your answer...',
  };
}

function stringifyMessageContent(content: LLMMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function isFilmReportAskContext(params: {
  readonly category?: string;
  readonly question: string;
  readonly steps?: NonNullable<z.infer<typeof askUserSchema>['steps']>;
  readonly messages: readonly LLMMessage[];
  readonly selectedContexts?: readonly AgentXSelectedContext[];
}): boolean {
  if (params.category === 'film_review') return true;

  const selectedContextText = (params.selectedContexts ?? [])
    .map((context) => `${context.kind} ${context.title} ${context.summary ?? ''} ${context.source?.type ?? ''}`)
    .join(' ');
  const messageText = params.messages.map((message) => stringifyMessageContent(message.content)).join(' ');
  const stepText = (params.steps ?? []).map((step) => `${step.id ?? ''} ${step.question}`).join(' ');
  const haystack = `${params.question} ${stepText} ${messageText} ${selectedContextText}`;

  return /\b(film|game\s+film|hudl|breakdown|odk|self[-\s]?scout|opponent\s+scout|tendenc(?:y|ies))\b/i.test(
    haystack
  );
}

export class AskUserTool extends BaseTool {
  readonly name = 'ask_user';
  readonly description =
    'Pause execution to wait for the user when you cannot proceed without their input.\n\n' +
    'CRITICAL — TWO-STEP USAGE:\n' +
    '  1. FIRST: write your actual question to the user as a normal conversational chat message (assistant prose). Be warm, specific, and complete — this is what the user reads in chat.\n' +
    '  2. THEN: invoke `ask_user` in the SAME turn. The `question` parameter is a SHORT one-line label (≤ 80 chars) used for the push/SMS notification preview and a tiny "waiting for your reply…" affordance in the chat. Do NOT repeat your full question in the parameter — the chat already shows it.\n\n' +
    'Example (plain text):\n' +
    '  Assistant message (streamed prose): "Before I draft this email, what tone are you going for — formal and recruiter-style, or casual and personal?"\n' +
    '  Then call: ask_user({ question: "Pick an email tone", steps: [{ id: "tone", question: "What tone are you going for?", inputMode: "single_select", options: [{ label: "Formal and recruiter-style", value: "formal" }, { label: "Casual and personal", value: "casual" }, { label: "Something in between", value: "balanced" }] }] })\n\n' +
    'Example (selection card):\n' +
    '  Assistant message: "I can package this a few ways. Pick the output that fits how you want to use it."\n' +
    '  Then call: ask_user({ question: "How would you like this delivered?", inputMode: "single_select", allowCustomText: true, options: [{ id: "pdf", title: "Printable PDF", description: "Best for sharing or printing.", formatTag: "PDF" }, { id: "gamma_pdf", title: "Gamma PDF", description: "Narrative Gamma-styled PDF with richer layout.", formatTag: "GAMMA" }, { id: "gamma_deck", title: "Gamma Deck", description: "Interactive meeting deck or presentation.", formatTag: "GAMMA" }, { id: "csv", title: "CSV", description: "Flat raw data for import or spreadsheet work.", formatTag: "CSV" }] })\n\n' +
    'Example (normal multiple choice):\n' +
    '  ask_user({ question: "Is the ODK keyed to our team or the opponent?", inputMode: "single_select", options: [{ label: "ODK is keyed to our team (O = our offense, D = our defense)", value: "keyed_to_our_team" }, { label: "ODK is keyed to the opponent (O = opponent offense, D = opponent defense)", value: "keyed_to_opponent" }, { label: "Mixed / selected rows include both teams", value: "mixed" }] })\n\n' +
    'Example (multi-step flow):\n' +
    '  ask_user({ question: "I need two details to continue.", steps: [{ question: "Is the ODK keyed to our team or the opponent?", inputMode: "single_select", options: [{ label: "ODK is keyed to our team (O = our offense, D = our defense)", value: "keyed_to_our_team" }, { label: "ODK is keyed to the opponent (O = opponent offense, D = opponent defense)", value: "keyed_to_opponent" }, { label: "Mixed / selected rows include both teams", value: "mixed" }] }, { question: "Do you want a self-scout or opponent scout?", inputMode: "single_select", options: [{ label: "Self-scout our tendencies", value: "self_scout" }, { label: "Opponent scout their tendencies", value: "opponent_scout" }, { label: "Balanced team-vs-team trends", value: "balanced_tendencies" }] }] })\n\n' +
    'OUTPUT SELECTION RULE:\n' +
    '  • Use inputMode "single_select" or "multi_select" with options when the user asks for an export/report/deck/document and the best output format is ambiguous. When Gamma-backed PDF and Gamma deck/PPTX are both viable, list them as separate options instead of collapsing them into one generic Gamma choice.\n' +
    '  • Do NOT ask if the user already specified one format such as PDF, XLSX, CSV, PPTX, or Gamma. Generate that format directly.\n\n' +
    'STRUCTURED QUESTION RULE:\n' +
    '  • Prefer structured `steps` for any ask_user flow with more than one missing field. Use one step per field.\n' +
    '  • When the answer set is small and explicit, use `single_select` or `multi_select` plus `options` so the UI renders selectable choices.\n' +
    '  • Use `inputMode: "text"` only for truly freeform fields such as names, dates, URLs, or open-ended notes.\n\n' +
    'RULES:\n' +
    '  • Call this tool EXACTLY ONCE per turn.\n' +
    '  • Use sparingly — only when you truly cannot proceed without the user.\n' +
    '  • Never paste the full question into `question`; the prose message owns the question copy.\n' +
    '  • Calling this tool immediately suspends the conversation.';
  readonly parameters = askUserSchema;
  readonly isMutation = false;
  readonly category: AgentToolCategory = 'system';

  readonly entityGroup = 'user_tools' as const;
  override readonly allowedAgents: readonly (AgentIdentifier | '*')[] = ['*'];

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const parsed = askUserSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join('; '),
        isValidationError: true,
      };
    }

    const question = parsed.data.question;

    // Context is injected into the input by the ReAct loop (base.agent.ts)
    // instead of stored as mutable state — safe with concurrent workers.
    const ctx = input[ASK_USER_CONTEXT_KEY] as AskUserToolContext | undefined;
    if (!ctx) {
      return {
        success: false,
        error: 'AskUserTool: missing runtime context. Cannot yield without agent context.',
      };
    }

    const filmReportAskContext = isFilmReportAskContext({
      category: parsed.data.category,
      question,
      steps: parsed.data.steps,
      messages: ctx.messages,
      selectedContexts: ctx.selectedContexts,
    });
    const normalizedSteps =
      parsed.data.steps?.map((step, index) =>
        normalizeAskUserStep(step, index, filmReportAskContext)
      ) ??
      (parsed.data.options || parsed.data.inputMode
        ? undefined
        : [buildFallbackTextStep(question)]);
    const shouldRenderSelectionCard =
      !!normalizedSteps?.length ||
      (parsed.data.inputMode !== undefined && parsed.data.inputMode !== 'text' && parsed.data.options);
    const normalizedTopLevelOptions = parsed.data.options?.map((option, index) =>
      normalizeAskUserOption(option, index)
    );
    const topLevelQuestionAsStep = {
      question: parsed.data.question,
      inputMode: parsed.data.inputMode ?? 'single_select',
      options: parsed.data.options,
    } satisfies NonNullable<z.infer<typeof askUserSchema>['steps']>[number];
    const forceTopLevelFilmReportPerspective =
      filmReportAskContext &&
      parsed.data.inputMode !== 'text' &&
      isFilmReportPerspectiveStep(topLevelQuestionAsStep);
    const forceTopLevelFilmReportDelivery =
      filmReportAskContext &&
      !forceTopLevelFilmReportPerspective &&
      parsed.data.inputMode !== 'text' &&
      /\b(deliver(?:y|ed)?|output|package|format|export|report)\b/i.test(parsed.data.question);
    const normalizedOptions = forceTopLevelFilmReportPerspective
      ? normalizeFilmReportPerspectiveOptions()
      : forceTopLevelFilmReportDelivery
        ? normalizeFilmReportDeliveryOptions(normalizedTopLevelOptions)
        : normalizedTopLevelOptions;
    const pendingToolCall = ctx.toolCallId
      ? {
          toolName: this.name,
          toolInput: {
            question,
            prompt: question,
            ...(parsed.data.context ? { context: parsed.data.context } : {}),
            ...(parsed.data.category ? { category: parsed.data.category } : {}),
            ...(shouldRenderSelectionCard && (normalizedOptions || (normalizedSteps && normalizedSteps.length > 0))
              ? {
                  multiSelect:
                    !forceTopLevelFilmReportPerspective &&
                    (forceTopLevelFilmReportDelivery || parsed.data.inputMode === 'multi_select'),
                  allowCustomOption: forceTopLevelFilmReportDelivery
                    ? true
                    : forceTopLevelFilmReportPerspective
                      ? true
                      : (parsed.data.allowCustomText ?? true),
                  options: normalizedOptions,
                  ...(normalizedSteps ? { steps: normalizedSteps } : {}),
                  ...(parsed.data.defaultSelectedIds
                    ? { defaultSelectedIds: parsed.data.defaultSelectedIds }
                    : {}),
                }
              : {}),
          },
          toolCallId: ctx.toolCallId,
        }
      : undefined;

    // Throw the yield exception — the worker will catch it and suspend
    throw new AgentYieldException({
      reason: 'needs_input',
      promptToUser: question,
      agentId: ctx.agentId,
      messages: ctx.messages,
      ...(pendingToolCall ? { pendingToolCall } : {}),
      planContext: ctx.planContext,
      ...(ctx.selectedContexts?.length ? { selectedContexts: ctx.selectedContexts } : {}),
    });
  }
}
