/**
 * @fileoverview Interact With Live View Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/browser
 *
 * Agent X tool that executes browser interactions in an active live-view
 * session using Firecrawl's native AI-driven prompt system. Instead of
 * specifying CSS selectors, describe what you want to do in plain English
 * and Firecrawl's AI will find elements and interact with them automatically.
 *
 * All actions execute in the SAME browser the user sees in their command
 * center iframe.
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../../base.tool.js';
import type { LiveViewSessionService } from './live-view-session.service.js';
import { logger } from '../../../../../../utils/logger.js';
import { z } from 'zod';

interface ActionTokenMatch {
  readonly action: string;
  readonly index: number;
}

interface CompiledPromptContract {
  readonly compiledPrompt: string;
  readonly action: string;
  readonly rawStep: string;
}

interface CompiledPromptPlan {
  readonly kind: 'single' | 'sequence';
  readonly contracts: readonly CompiledPromptContract[];
}

type PromptCompilationResult =
  | {
      readonly ok: true;
      readonly plan: CompiledPromptPlan;
    }
  | {
      readonly ok: false;
      readonly error: string;
    };

export class InteractWithLiveViewTool extends BaseTool {
  readonly name = 'interact_with_live_view';

  readonly description =
    'Performs browser interactions in the active live-view session using natural language. ' +
    'Describe what you want to do in plain English (e.g. "Click the Continue with Google button", ' +
    '"Type test@example.com into the email field and click Sign In", "Scroll down to the stats section"). ' +
    "Firecrawl's AI automatically finds elements and interacts with them — no CSS selectors needed. " +
    'The user watches the actions happen in real time in their side panel. ' +
    'Use this whenever the user wants actions performed in the page that is already open in live view. ' +
    'This tool is for navigation and page manipulation only: clicking tabs, signing in, opening menus, expanding playlists, scrolling, or moving between pages. ' +
    'Compound navigation requests are executed as a bounded sequence of focused actions against the same live browser session. ' +
    'Before any visually ambiguous page-changing action, use read_live_view and/or capture_live_view_screenshot so the current page state is grounded. ' +
    'For requests to watch, analyze, report on, or batch-process Hudl clips/playlists/plays, use extract_live_view_media through the film coordinator workflow. ' +
    'Do NOT use this tool to watch video, evaluate plays, infer what happened in motion, grade technique from playback, or simulate film study by clicking through frames or playlist items. ' +
    'If the user wants actual film analysis, use this tool only to reach the correct page state, then use `extract_live_view_media` and the downstream video pipeline on real media URLs. ' +
    "The sessionId is optional — if omitted, the tool automatically finds the user's active session. " +
    'Approval-sensitive actions are evaluated centrally by the agent approval gate before this tool executes. ' +
    'For legacy callers outside the approval-aware runtime, destructive actions still require confirmed: true as a safety fallback.';

  readonly parameters = z.object({
    sessionId: z.string().trim().min(1).optional(),
    prompt: z.string().trim().min(1),
    confirmed: z.boolean().optional(),
  });

  readonly isMutation = true;
  readonly category = 'system' as const;

  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  private readonly sessionService: LiveViewSessionService;

  /** Final safety net for non-agent-runtime callers that bypass ApprovalGateService. */
  private static readonly DESTRUCTIVE_KEYWORDS =
    /\b(submit|send|confirm|purchase|buy|place\s+order|delete|remove|pay|checkout|sign\s+up|register|apply|publish|post|transfer|authorize|approve)\b/i;

  private static readonly READ_ONLY_PROMPT =
    /\b(read|scan|inspect|check|tell\s+me|what\s+(?:is|are)|how\s+many|identify|look\s+at|see\s+what)\b/i;

  private static readonly ACTION_PROMPT =
    /\b(click|type|write|press|scroll|submit|send|select|choose|open|close|navigate|go\s+to|play|pause|expand|collapse|sign\s+in|log\s+in|fill|fill\s+out|fill\s+in|populate|complete)\b/i;

  private static readonly ACTION_TOKEN_REGEX =
    /\b(click|tap|type|enter|write|press|scroll|navigate|go\s+to|open|close|select|choose|submit|send|wait|expand|collapse|play|pause|sign\s+in|log\s+in|fill\s+out|fill\s+in|fill|populate|complete)\b/gi;

  /** Matches explicit form-fill intent in the prompt (expanded: fill/populate/complete + form keywords). */
  private static readonly FORM_FILL_PROMPT =
    /\b(fill\s+(?:out|in)|fill|populate|complete|enter)\b[\s\S]{0,400}\b(form|questionnaire|application|field|fields|information|info|profile)\b/i;

  /**
   * When ALL extracted action tokens are form-field synonyms (type, select, enter, write, choose,
   * fill, populate) and more than one is present, the prompt is describing a compound form-fill
   * operation — not separate focused interactions. Treat the whole thing as a single FORM_FILL.
   */
  private static readonly FORM_FILL_ACTION_VERBS = new Set([
    'type',
    'enter',
    'write',
    'fill',
    'fill out',
    'fill in',
    'populate',
    'complete',
    'select',
    'choose',
  ]);

  private static readonly MAX_COMPILED_PROMPT_CHARS = 320;
  private static readonly MAX_FORM_FILL_PROMPT_CHARS = 1800;
  private static readonly MAX_SEQUENCE_STEPS = 8;

  private static readonly PRE_INTERACTION_SCREENSHOT_OPTIONS = {
    format: 'jpeg' as const,
    quality: 72,
    fullPage: false,
  };

  constructor(sessionService: LiveViewSessionService) {
    super();
    this.sessionService = sessionService;
  }

  private normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private canonicalAction(token: string): string {
    const normalized = token.toLowerCase().replace(/\s+/g, ' ').trim();
    if (normalized === 'go to') return 'navigate';
    if (normalized === 'tap') return 'click';
    if (normalized === 'enter' || normalized === 'write') return 'type';
    if (normalized === 'choose') return 'select';
    if (normalized === 'log in') return 'sign in';
    if (normalized === 'fill out' || normalized === 'fill in') return 'fill';
    if (normalized === 'populate' || normalized === 'complete') return 'fill';
    return normalized;
  }

  private extractActionTokens(prompt: string): string[] {
    const matches = this.extractActionMatches(prompt);
    const tokens: string[] = [];
    for (const match of matches) {
      tokens.push(match.action);
    }
    return tokens;
  }

  private extractActionMatches(prompt: string): ActionTokenMatch[] {
    const matches = prompt.matchAll(InteractWithLiveViewTool.ACTION_TOKEN_REGEX);
    const tokens: ActionTokenMatch[] = [];
    for (const match of matches) {
      const token = match[0]?.trim();
      if (!token || typeof match.index !== 'number') continue;
      tokens.push({ action: this.canonicalAction(token), index: match.index });
    }
    return tokens;
  }

  private isBulkFormFillPrompt(prompt: string): boolean {
    return InteractWithLiveViewTool.FORM_FILL_PROMPT.test(prompt);
  }

  /**
   * Returns true when every unique action token in the prompt is a form-field synonym.
   * Example: a prompt with both "type" and "select" is describing field-by-field form entry,
   * not two separate interactions — so it should compile as FORM_FILL, not be rejected.
   */
  private isFormFillActionSet(actions: string[]): boolean {
    if (actions.length < 2) return false;
    return actions.every((a) => InteractWithLiveViewTool.FORM_FILL_ACTION_VERBS.has(a));
  }

  private normalizeStepPrompt(value: string): string {
    return this.normalizeWhitespace(
      value
        .replace(/^[,.;:\-\s]+/, '')
        .replace(/[,.;:\-\s]+$/, '')
        .replace(/^(?:and\s+then|then|after\s+that|next|and)\s+/i, '')
        .replace(/\s+(?:and\s+then|then|after\s+that|next|and)$/i, '')
    );
  }

  private splitPromptIntoActionSteps(
    prompt: string,
    matches: readonly ActionTokenMatch[]
  ): string[] {
    const orderedMatches = [...matches].sort((a, b) => a.index - b.index);
    const steps: string[] = [];

    for (let i = 0; i < orderedMatches.length; i++) {
      const start = orderedMatches[i].index;
      const end = orderedMatches[i + 1]?.index ?? prompt.length;
      const step = this.normalizeStepPrompt(prompt.slice(start, end));
      if (step) steps.push(step);
    }

    return steps;
  }

  private buildTargetPhrase(prompt: string, action: string): string {
    const quoted = prompt.match(/["'`](.+?)["'`]/g)?.[0];
    if (quoted) return quoted.slice(0, 140);

    const withoutAction = this.normalizeWhitespace(
      prompt
        .replace(InteractWithLiveViewTool.ACTION_TOKEN_REGEX, '')
        .replace(/\b(then|and|after that|next|please)\b/gi, '')
    );

    if (withoutAction.length > 0) {
      return withoutAction.slice(0, 140);
    }

    if (action === 'scroll') return 'main page content';
    if (action === 'wait') return 'current page state update';
    return 'most relevant visible interactive element';
  }

  private compileSinglePromptContract(prompt: string):
    | {
        readonly ok: true;
        readonly contract: CompiledPromptContract;
      }
    | {
        readonly ok: false;
        readonly error: string;
      } {
    const normalized = this.normalizeWhitespace(prompt);

    const actions = Array.from(new Set(this.extractActionTokens(normalized)));

    if (this.isBulkFormFillPrompt(normalized) || this.isFormFillActionSet(actions)) {
      const contract = [
        'ACTION: FORM_FILL',
        '// Triggered by: ' +
          (this.isBulkFormFillPrompt(normalized)
            ? 'explicit fill/questionnaire pattern'
            : `compound form-fill action set [${actions.join(', ')}]`),
        'TARGET: visible questionnaire/form fields on current page',
        'EXECUTION: Fill only fields explicitly provided in USER_REQUEST. Leave unspecified fields unchanged unless explicitly told to blank them.',
        'MATCHING: Use label, placeholder, aria-label, and nearby field text to map each requested value to the correct input.',
        `USER_REQUEST: ${normalized}`,
        'MAX_STEPS: 30',
        'MAX_WAIT_MS: 12000',
        'DO_NOT_SUBMIT: true',
        'RETURN: concise list of fields updated, fields skipped, and any ambiguous mappings.',
      ].join('\n');

      const compiledPrompt =
        contract.length > InteractWithLiveViewTool.MAX_FORM_FILL_PROMPT_CHARS
          ? contract.slice(0, InteractWithLiveViewTool.MAX_FORM_FILL_PROMPT_CHARS).trimEnd()
          : contract;

      return {
        ok: true,
        contract: { compiledPrompt, action: 'form_fill', rawStep: normalized },
      };
    }

    if (actions.length === 0) {
      return {
        ok: false,
        error:
          'Interaction prompt must specify exactly one action verb (for example: click, type, scroll, select, navigate, wait).',
      };
    }

    if (actions.length > 1) {
      return {
        ok: false,
        error: `Interaction step includes multiple actions (${actions.join(', ')}). Split it into focused steps.`,
      };
    }

    const action = actions[0];
    const target = this.buildTargetPhrase(normalized, action);
    const contract = [
      `ACTION: ${action.toUpperCase()}`,
      `TARGET: ${target}`,
      'EXECUTION: Perform only this single action once.',
      'STOP_CONDITION: Stop when the action effect is visible or page state stabilizes.',
      'MAX_STEPS: 1',
      'MAX_WAIT_MS: 8000',
      'RETURN: concise result with what changed.',
    ].join('\n');

    const compiledPrompt =
      contract.length > InteractWithLiveViewTool.MAX_COMPILED_PROMPT_CHARS
        ? contract.slice(0, InteractWithLiveViewTool.MAX_COMPILED_PROMPT_CHARS).trimEnd()
        : contract;

    return { ok: true, contract: { compiledPrompt, action, rawStep: normalized } };
  }

  private compilePromptPlan(prompt: string): PromptCompilationResult {
    const normalized = this.normalizeWhitespace(prompt);
    const actionMatches = this.extractActionMatches(normalized);
    const actions = actionMatches.map((match) => match.action);
    const uniqueActions = Array.from(new Set(actions));

    if (
      actionMatches.length <= 1 ||
      this.isBulkFormFillPrompt(normalized) ||
      this.isFormFillActionSet(actions)
    ) {
      const single = this.compileSinglePromptContract(normalized);
      return single.ok
        ? { ok: true, plan: { kind: 'single', contracts: [single.contract] } }
        : single;
    }

    if (actionMatches.length > InteractWithLiveViewTool.MAX_SEQUENCE_STEPS) {
      return {
        ok: false,
        error: `Interaction prompt includes ${actionMatches.length} actions. Keep live-view sequences to ${InteractWithLiveViewTool.MAX_SEQUENCE_STEPS} focused steps or split the request.`,
      };
    }

    const stepPrompts = this.splitPromptIntoActionSteps(normalized, actionMatches);
    if (stepPrompts.length < 2) {
      return {
        ok: false,
        error: `Interaction prompt includes multiple actions (${uniqueActions.join(', ')}) but could not be split into safe focused steps.`,
      };
    }

    const contracts: CompiledPromptContract[] = [];
    for (const stepPrompt of stepPrompts) {
      const compiled = this.compileSinglePromptContract(stepPrompt);
      if (!compiled.ok) {
        return {
          ok: false,
          error: `Could not compile step "${stepPrompt}": ${compiled.error}`,
        };
      }
      contracts.push(compiled.contract);
    }

    return { ok: true, plan: { kind: 'sequence', contracts } };
  }

  private isReadOnlyPrompt(prompt: string): boolean {
    return (
      InteractWithLiveViewTool.READ_ONLY_PROMPT.test(prompt) &&
      !InteractWithLiveViewTool.ACTION_PROMPT.test(prompt)
    );
  }

  private async runPreInteractionGrounding(
    sessionId: string,
    userId: string
  ): Promise<{
    readonly scan: {
      readonly ok: boolean;
      readonly url: string;
      readonly title: string;
      readonly content: string;
      readonly error?: string;
    };
    readonly screenshot: {
      readonly ok: boolean;
      readonly url?: string;
      readonly title?: string;
      readonly mimeType?: string;
      readonly capturedAt?: string;
      readonly sizeBytes?: number;
      readonly viewport?: { readonly width: number; readonly height: number } | null;
      readonly source?: string;
      readonly error?: string;
    };
  }> {
    let scan: {
      readonly ok: boolean;
      readonly url: string;
      readonly title: string;
      readonly content: string;
      readonly error?: string;
    };

    try {
      const extracted = await this.sessionService.extractContent(sessionId, userId);
      scan = {
        ok: true,
        url: extracted.url,
        title: extracted.title,
        content: extracted.content,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'scan failed';
      logger.warn('[InteractWithLiveViewTool] Pre-interaction scan failed', {
        sessionId,
        userId,
        error: message,
      });
      scan = {
        ok: false,
        url: '',
        title: '',
        content: '',
        error: message,
      };
    }

    let screenshot: {
      readonly ok: boolean;
      readonly url?: string;
      readonly title?: string;
      readonly mimeType?: string;
      readonly capturedAt?: string;
      readonly sizeBytes?: number;
      readonly viewport?: { readonly width: number; readonly height: number } | null;
      readonly source?: string;
      readonly error?: string;
    };

    try {
      const image = await this.sessionService.captureScreenshot(
        sessionId,
        userId,
        InteractWithLiveViewTool.PRE_INTERACTION_SCREENSHOT_OPTIONS
      );
      screenshot = {
        ok: true,
        url: image.url,
        title: image.title,
        mimeType: image.mimeType,
        capturedAt: image.capturedAt,
        sizeBytes: image.sizeBytes,
        viewport: image.viewport,
        source: image.source,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'screenshot failed';
      logger.warn('[InteractWithLiveViewTool] Pre-interaction screenshot failed', {
        sessionId,
        userId,
        error: message,
      });
      screenshot = {
        ok: false,
        error: message,
      };
    }

    if (!scan.ok && !screenshot.ok) {
      throw new Error(
        `Unable to ground page state before interaction (scan failed: ${scan.error ?? 'unknown'}; screenshot failed: ${screenshot.error ?? 'unknown'}).`
      );
    }

    return { scan, screenshot };
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const userId = context?.userId ?? this.str(input, 'userId');
    const rawPrompt = this.str(input, 'prompt');
    const confirmed = input['confirmed'] === true;

    if (!userId) return this.paramError('userId');
    if (!rawPrompt) return this.paramError('prompt');

    const prompt = this.normalizeWhitespace(rawPrompt);

    if (!confirmed && InteractWithLiveViewTool.DESTRUCTIVE_KEYWORDS.test(prompt)) {
      const matchedWord =
        prompt.match(InteractWithLiveViewTool.DESTRUCTIVE_KEYWORDS)?.[0] ?? 'this action';
      logger.info('[InteractWithLiveViewTool] Destructive action requires confirmation', {
        userId,
        matchedWord,
        prompt: prompt.slice(0, 200),
      });
      return {
        success: true,
        data: {
          requiresConfirmation: true,
          action: matchedWord,
          prompt,
          message:
            `This action involves "${matchedWord}" which could be irreversible. ` +
            'Ask the user to confirm before re-running with confirmed: true.',
        },
      };
    }

    let sessionId: string;
    try {
      sessionId = await this.sessionService.resolveSessionId(this.str(input, 'sessionId'), userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No active live view session';
      return { success: false, error: message };
    }

    try {
      const grounding = await this.runPreInteractionGrounding(sessionId, userId);
      const preflight = grounding.scan.ok
        ? {
            url: grounding.scan.url,
            title: grounding.scan.title,
            content: grounding.scan.content,
          }
        : {
            url: grounding.screenshot.url ?? '',
            title: grounding.screenshot.title ?? '',
            content: '',
          };

      if (this.isReadOnlyPrompt(prompt)) {
        logger.info('[InteractWithLiveViewTool] Read-only prompt served via page scan', {
          sessionId,
          userId,
          url: preflight.url,
          title: preflight.title,
          contentLength: preflight.content.length,
        });

        return {
          success: true,
          data: {
            sessionId,
            url: preflight.url,
            title: preflight.title,
            content: preflight.content,
            scannedBeforeInteraction: true,
            screenshotCapturedBeforeInteraction: grounding.screenshot.ok,
            grounding,
            interactionSkipped: true,
            output:
              'I scanned the current live-view page instead of interacting because the prompt only asked to read/check page state.',
            message: `Scanned the current live-view page without interacting. Current URL: ${preflight.url}`,
          },
        };
      }

      const compiled = this.compilePromptPlan(prompt);
      if (!compiled.ok) {
        logger.warn('[InteractWithLiveViewTool] Prompt rejected by contract compiler', {
          sessionId,
          userId,
          promptLength: prompt.length,
          reason: compiled.error,
        });
        return {
          success: false,
          error: compiled.error,
          data: {
            sessionId,
            scannedBeforeInteraction: true,
            rejectedPrompt: prompt,
            reason: compiled.error,
          },
        };
      }

      const { plan } = compiled;
      const stepResults: Array<{
        readonly stepNumber: number;
        readonly action: string;
        readonly rawStep: string;
        readonly compiledPrompt: string;
        readonly success: boolean;
        readonly output: string;
        readonly verification?: unknown;
      }> = [];

      for (let index = 0; index < plan.contracts.length; index++) {
        const contract = plan.contracts[index];
        const result = await this.sessionService.executePrompt(
          sessionId,
          userId,
          contract.compiledPrompt
        );

        stepResults.push({
          stepNumber: index + 1,
          action: contract.action,
          rawStep: contract.rawStep,
          compiledPrompt: contract.compiledPrompt,
          success: result.success,
          output: result.output,
          ...(result.verification ? { verification: result.verification } : {}),
        });

        logger.info('[InteractWithLiveViewTool] Prompt step executed', {
          sessionId,
          userId,
          stepNumber: index + 1,
          stepCount: plan.contracts.length,
          action: contract.action,
          success: result.success,
          rawPromptLength: prompt.length,
          compiledPromptLength: contract.compiledPrompt.length,
          outputLength: result.output.length,
        });

        if (!result.success) {
          return {
            success: false,
            error: result.output,
            data: {
              sessionId,
              preflight: {
                url: preflight.url,
                title: preflight.title,
                contentPreview: preflight.content.slice(0, 4000),
              },
              grounding,
              promptContract:
                plan.kind === 'single'
                  ? {
                      action: contract.action,
                      rawPrompt: prompt,
                      compiledPrompt: contract.compiledPrompt,
                      rawLength: prompt.length,
                      compiledLength: contract.compiledPrompt.length,
                    }
                  : {
                      action: 'sequence',
                      rawPrompt: prompt,
                      stepCount: plan.contracts.length,
                      rawLength: prompt.length,
                    },
              promptContracts: plan.contracts,
              steps: stepResults,
              scannedBeforeInteraction: true,
              screenshotCapturedBeforeInteraction: grounding.screenshot.ok,
              output: result.output,
              message:
                plan.kind === 'single'
                  ? `Interaction failed: ${result.output}`
                  : `Live-view sequence stopped at step ${index + 1} of ${plan.contracts.length}: ${result.output}`,
            },
          };
        }
      }

      const finalResult = stepResults[stepResults.length - 1];
      const output =
        plan.kind === 'single'
          ? finalResult.output
          : stepResults
              .map((step) => `${step.stepNumber}. ${step.action}: ${step.output}`)
              .join('\n');

      logger.info('[InteractWithLiveViewTool] Prompt plan executed', {
        sessionId,
        userId,
        success: true,
        planKind: plan.kind,
        stepCount: plan.contracts.length,
        rawPromptLength: prompt.length,
        outputLength: output.length,
      });

      return {
        success: true,
        data: {
          sessionId,
          preflight: {
            url: preflight.url,
            title: preflight.title,
            contentPreview: preflight.content.slice(0, 4000),
          },
          grounding,
          promptContract:
            plan.kind === 'single'
              ? {
                  action: finalResult.action,
                  rawPrompt: prompt,
                  compiledPrompt: finalResult.compiledPrompt,
                  rawLength: prompt.length,
                  compiledLength: finalResult.compiledPrompt.length,
                }
              : {
                  action: 'sequence',
                  rawPrompt: prompt,
                  stepCount: plan.contracts.length,
                  rawLength: prompt.length,
                },
          promptContracts: plan.contracts,
          steps: stepResults,
          scannedBeforeInteraction: true,
          screenshotCapturedBeforeInteraction: grounding.screenshot.ok,
          output,
          ...(finalResult.verification
            ? {
                verification: finalResult.verification,
              }
            : {}),
          message:
            plan.kind === 'single'
              ? `Interaction completed. The user can see the changes in their live view panel. Firecrawl AI response: ${finalResult.output}`
              : `Completed ${stepResults.length} live-view steps. The user can see the changes in their live view panel.`,
        },
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to execute interaction in live view';
      logger.error('[InteractWithLiveViewTool] Execution failed', {
        sessionId,
        userId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
