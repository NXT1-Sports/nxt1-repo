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
import type { AgentToolCategory, AgentIdentifier } from '@nxt1/core';
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
  readonly planContext?: {
    readonly currentTaskId: string;
    readonly completedTaskResults: Record<string, unknown>;
    readonly enrichedIntent: string;
  };
}

/** Key used to inject context into the tool input. Prefixed to avoid LLM collision. */
export const ASK_USER_CONTEXT_KEY = '__yieldContext' as const;

export class AskUserTool extends BaseTool {
  readonly name = 'ask_user';
  readonly description =
    'Pause execution to wait for the user when you cannot proceed without their input.\n\n' +
    'CRITICAL — TWO-STEP USAGE:\n' +
    '  1. FIRST: write your actual question to the user as a normal conversational chat message (assistant prose). Be warm, specific, and complete — this is what the user reads in chat.\n' +
    '  2. THEN: invoke `ask_user` in the SAME turn. The `question` parameter is a SHORT one-line label (≤ 80 chars) used for the push/SMS notification preview and a tiny "waiting for your reply…" affordance in the chat. Do NOT repeat your full question in the parameter — the chat already shows it.\n\n' +
    'Example:\n' +
    '  Assistant message (streamed prose): "Before I draft this email, what tone are you going for — formal and recruiter-style, or casual and personal?"\n' +
    '  Then call: ask_user({ question: "Pick an email tone" })\n\n' +
    'RULES:\n' +
    '  • Call this tool EXACTLY ONCE per turn.\n' +
    '  • Use sparingly — only when you truly cannot proceed without the user.\n' +
    '  • Never paste the full question into `question`; the prose message owns the question copy.\n' +
    '  • Calling this tool immediately suspends the conversation.';
  readonly parameters = z.object({
    /** Short label for push/SMS preview + waiting affordance — NOT the full question (write that as prose first). */
    question: z.string().trim().min(1).max(120),
    context: z.string().trim().min(1).optional(),
  });
  readonly isMutation = false;
  readonly category: AgentToolCategory = 'system';

  readonly entityGroup = 'user_tools' as const;
  override readonly allowedAgents: readonly (AgentIdentifier | '*')[] = ['*'];

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const question = this.str(input, 'question');
    if (!question) return this.paramError('question');

    // Context is injected into the input by the ReAct loop (base.agent.ts)
    // instead of stored as mutable state — safe with concurrent workers.
    const ctx = input[ASK_USER_CONTEXT_KEY] as AskUserToolContext | undefined;
    if (!ctx) {
      return {
        success: false,
        error: 'AskUserTool: missing runtime context. Cannot yield without agent context.',
      };
    }

    // Throw the yield exception — the worker will catch it and suspend
    throw new AgentYieldException({
      reason: 'needs_input',
      promptToUser: question,
      agentId: ctx.agentId,
      messages: ctx.messages,
      planContext: ctx.planContext,
    });
  }
}
