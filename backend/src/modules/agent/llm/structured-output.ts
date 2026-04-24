import { z } from 'zod';
import type { LLMCompletionResult } from './llm.types.js';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';

export function resolveStructuredOutput<T>(
  result: LLMCompletionResult,
  schema: z.ZodType<T>,
  label: string
): T {
  if (result.parsedOutput !== undefined) {
    return schema.parse(result.parsedOutput);
  }

  if (!result.content) {
    throw new AgentEngineError(
      'STRUCTURED_OUTPUT_EMPTY',
      `${label} returned empty structured output.`
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(result.content);
  } catch {
    throw new AgentEngineError(
      'STRUCTURED_OUTPUT_INVALID_JSON',
      `${label} returned invalid JSON structured output.`
    );
  }

  return schema.parse(parsedJson);
}
