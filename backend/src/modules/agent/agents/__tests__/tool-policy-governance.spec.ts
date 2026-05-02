import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getToolGovernancePolicy, isToolClassified } from '../tool-policy.js';

const BOOTSTRAP_PATH = fileURLToPath(new URL('../../queue/bootstrap.ts', import.meta.url));
const TOOLS_DIR = fileURLToPath(new URL('../../tools/', import.meta.url));

const ALLOWED_UNRESOLVED_TOOL_CLASSES = new Set<string>(['DynamicGoogleWorkspaceTool']);

function walkTsFiles(rootDir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(rootDir)) {
    const fullPath = join(rootDir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === '__tests__') continue;
      results.push(...walkTsFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractRegisteredToolClassNames(bootstrapSource: string): readonly string[] {
  const classNames = new Set<string>();
  const registerRegex = /toolRegistry\.register\(\s*new\s+([A-Za-z0-9_]+)/g;
  let match = registerRegex.exec(bootstrapSource);

  while (match) {
    if (match[1]) classNames.add(match[1]);
    match = registerRegex.exec(bootstrapSource);
  }

  return [...classNames];
}

function resolveToolNameForClass(className: string, sourceFiles: readonly string[]): string | null {
  for (const filePath of sourceFiles) {
    const source = readFileSync(filePath, 'utf-8');
    if (!new RegExp(`class\\s+${className}\\b`).test(source)) {
      continue;
    }

    const inlineNameMatch = source.match(
      new RegExp(
        `class\\s+${className}\\b[\\s\\S]*?readonly\\s+name(?:\\s*:\\s*string)?\\s*=\\s*['"]([^'"]+)['"]`
      )
    );
    if (inlineNameMatch?.[1]) {
      return inlineNameMatch[1];
    }

    const constructorLiteralMatch = source.match(
      new RegExp(`class\\s+${className}\\b[\\s\\S]*?this\\.name\\s*=\\s*['"]([^'"]+)['"]`)
    );
    if (constructorLiteralMatch?.[1]) {
      return constructorLiteralMatch[1];
    }

    return null;
  }

  return null;
}

describe('Agent tool governance', () => {
  it('ensures every registered bootstrap tool is policy-exposed or explicitly internal-only', () => {
    const bootstrapSource = readFileSync(BOOTSTRAP_PATH, 'utf-8');
    const registeredClassNames = extractRegisteredToolClassNames(bootstrapSource);
    const toolSourceFiles = walkTsFiles(TOOLS_DIR);

    const registeredToolNames = new Set<string>();
    const unresolvedClasses = new Set<string>();

    for (const className of registeredClassNames) {
      const toolName = resolveToolNameForClass(className, toolSourceFiles);
      if (!toolName) {
        unresolvedClasses.add(className);
        continue;
      }
      registeredToolNames.add(toolName);
    }

    const unsupportedUnresolvedClasses = [...unresolvedClasses].filter(
      (className) => !ALLOWED_UNRESOLVED_TOOL_CLASSES.has(className)
    );
    expect(unsupportedUnresolvedClasses).toEqual([]);

    const governance = getToolGovernancePolicy();
    const effectiveExposedTools = new Set<string>([
      ...governance.globalSystem.filter((toolName) => !toolName.endsWith('*')),
      ...Object.values(governance.coordinatorSpecialized)
        .flat()
        .filter((toolName) => !toolName.endsWith('*')),
    ]);
    const internalOnlyTools = new Set<string>(governance.internalOnly);

    const registeredButUnexposed = [...registeredToolNames]
      .filter(
        (toolName) =>
          !effectiveExposedTools.has(toolName) &&
          !internalOnlyTools.has(toolName) &&
          !isToolClassified(toolName)
      )
      .sort();

    expect(registeredButUnexposed).toEqual([]);
  });
});
