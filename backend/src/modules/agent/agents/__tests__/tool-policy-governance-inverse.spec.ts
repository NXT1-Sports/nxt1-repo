import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getToolGovernancePolicy } from '../tool-policy.js';

const BOOTSTRAP_PATH = fileURLToPath(new URL('../../queue/bootstrap.ts', import.meta.url));
const TOOLS_DIR = fileURLToPath(new URL('../../tools/', import.meta.url));

const WILDCARD_PATTERNS_MANUALLY_VALIDATED = new Set<string>([
  'gmail_*',
  'query_gmail_*',
  'create_gmail_*',
  'calendar_*',
  'calendar_get_*',
  'create_calendar_*',
  'delete_calendar_*',
  'drive_*',
  'docs_*',
  'sheets_*',
  'runway_*',
  'open_live_view',
  'navigate_live_view',
  'interact_with_live_view',
  'read_live_view',
  'close_live_view',
]);

const DYNAMIC_GOOGLE_WORKSPACE_TOOLS = new Set<string>([
  'query_gmail_emails',
  'gmail_get_message_details',
  'gmail_send_email',
  'create_gmail_draft',
  'gmail_reply_to_email',
  'calendar_get_events',
  'calendar_get_event_details',
  'create_calendar_event',
  'delete_calendar_event',
  'drive_search_files',
  'drive_read_file_content',
  'drive_upload_file',
  'drive_create_folder',
  'drive_delete_file',
  'drive_list_shared_drives',
  'docs_create_document',
  'docs_get_document_metadata',
  'docs_get_content_as_markdown',
  'docs_append_text',
  'docs_prepend_text',
  'docs_insert_text',
  'docs_batch_update',
  'docs_insert_image',
  'sheets_create_spreadsheet',
  'sheets_read_range',
  'sheets_write_range',
  'sheets_append_rows',
  'sheets_clear_range',
  'sheets_add_sheet',
  'sheets_delete_sheet',
  'get_presentation',
  'get_slides',
  'create_presentation',
  'create_slide',
  'add_text_to_slide',
  'add_formatted_text_to_slide',
  'add_bulleted_list_to_slide',
  'add_table_to_slide',
  'add_slide_notes',
  'duplicate_slide',
  'delete_slide',
  'create_presentation_from_markdown',
]);

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
        `class\\s+${className}\\b[\\s\\S]*?readonly\\s+name(?:\\s*:\\s*string)?\\s*=\\s*['\"]([^'\"]+)['\"]`
      )
    );
    if (inlineNameMatch) {
      return inlineNameMatch[1];
    }
  }

  return null;
}

describe('Tool Policy Governance - Inverse Drift Detection', () => {
  it('should verify all policy-exposed tools exist in bootstrap registrations (no typos or misconfigured tools)', () => {
    const bootstrapSource = readFileSync(BOOTSTRAP_PATH, 'utf-8');
    const registeredClassNames = extractRegisteredToolClassNames(bootstrapSource);

    const toolsSourceFiles = walkTsFiles(TOOLS_DIR);
    const registeredToolNames = new Set<string>();

    for (const className of registeredClassNames) {
      const toolName = resolveToolNameForClass(className, toolsSourceFiles);
      if (toolName) {
        registeredToolNames.add(toolName);
      }
    }

    expect(registeredToolNames.size).toBeGreaterThan(0);

    const governance = getToolGovernancePolicy();
    const policyExactToolNames = new Set<string>();
    const policyWildcardPatterns = new Set<string>();

    for (const tools of [
      governance.globalSystem,
      ...Object.values(governance.coordinatorSpecialized),
    ]) {
      for (const toolName of tools) {
        if (toolName.endsWith('*')) {
          policyWildcardPatterns.add(toolName);
        } else {
          policyExactToolNames.add(toolName);
        }
      }
    }

    const invalidToolNames = [...policyExactToolNames]
      .filter(
        (toolName) =>
          !registeredToolNames.has(toolName) && !DYNAMIC_GOOGLE_WORKSPACE_TOOLS.has(toolName)
      )
      .sort();

    expect(
      invalidToolNames,
      `
The following tools are exposed in AGENT_TOOL_POLICY but do NOT exist in bootstrap registrations.
This indicates a typo or misconfiguration in tool-policy.ts.

Invalid tools: ${invalidToolNames.join(', ')}

Fix: Either remove the tool from AGENT_TOOL_POLICY, or register it in bootstrap.ts.
    `
    ).toEqual([]);

    for (const pattern of policyWildcardPatterns) {
      expect(
        WILDCARD_PATTERNS_MANUALLY_VALIDATED.has(pattern),
        `
Wildcard pattern '${pattern}' in AGENT_TOOL_POLICY is not in WILDCARD_PATTERNS_MANUALLY_VALIDATED.
Wildcard patterns must be explicitly listed for manual validation.

Fix: Add '${pattern}' to WILDCARD_PATTERNS_MANUALLY_VALIDATED in this test.
      `
      ).toBe(true);
    }
  });
});
