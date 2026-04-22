import { z } from 'zod';
import type { LLMCompletionResult } from './llm.types.js';

export function resolveStructuredOutput<T>(
  result: LLMCompletionResult,
  schema: z.ZodType<T>,
  label: string
): T {
  if (result.parsedOutput !== undefined) {
    return schema.parse(result.parsedOutput);
  }

  if (!result.content) {
    throw new Error(`${label} returned empty structured output.`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(result.content);
  } catch {
    throw new Error(`${label} returned invalid JSON structured output.`);
  }

  return schema.parse(parsedJson);
}
