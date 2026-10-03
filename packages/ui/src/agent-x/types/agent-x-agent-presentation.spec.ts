import { describe, expect, it } from 'vitest';
import type { AgentXToolStep } from '@nxt1/core/ai';
import {
  getThinkingLabel,
  getToolStepProvider,
  getToolStepDisplayLabel,
  getToolStepsSummaryLabel,
} from './agent-x-agent-presentation';

describe('Agent X tool-step export labels', () => {
  it.each([
    ['pdf', 'PDF document'],
    ['csv', 'CSV spreadsheet'],
    ['xlsx', 'Excel spreadsheet'],
    ['pptx', 'PowerPoint presentation'],
    ['docx', 'Word document'],
  ])('shows the output type for %s steps', (format, displayName) => {
    const step: AgentXToolStep = {
      id: 'export',
      label: 'Data Export',
      status: 'active',
      stageType: 'tool',
      metadata: { format, phase: 'upload_export' },
    };

    expect(getToolStepDisplayLabel(step)).toBe(`Creating ${displayName}`);
    expect(getThinkingLabel(step)).toBe(`Creating ${displayName}...`);
    expect(getToolStepsSummaryLabel([step])).toBe(`Creating ${displayName}...`);
    expect(getToolStepsSummaryLabel([{ ...step, status: 'success' }])).toBe(
      `Creating ${displayName}`
    );
  });

  it.each([
    'format_export',
    'build_xlsx_workbook',
    'build_presentation_deck',
    'build_word_document',
    'build_pdf_table',
    'build_pdf_document',
    'upload_export',
    'create_download_link',
  ])('preserves the output type during the %s phase', (phase) => {
    expect(
      getToolStepDisplayLabel({
        id: 'export',
        label: 'Data Export',
        status: 'active',
        metadata: { format: 'pdf', phase },
      })
    ).toBe('Creating PDF document');
  });

  it.each([undefined, 'zip'])('retains the original label for format %s', (format) => {
    expect(
      getToolStepDisplayLabel({
        id: 'export',
        label: 'Data Export',
        status: 'active',
        metadata: { format, phase: 'format_export' },
      })
    ).toBe('Data Export');
  });

  it('leaves unrelated or incomplete steps unchanged', () => {
    const step: AgentXToolStep = {
      id: 'other',
      label: 'Data Export',
      status: 'success',
      stageType: 'tool',
      metadata: { format: 'docx', phase: 'other_phase' },
    };

    expect(getToolStepDisplayLabel(step)).toBe('Data Export');
  });
});

describe('getToolStepProvider', () => {
  const step = (toolName?: string) => ({
    id: 's',
    label: 'Working',
    status: 'active' as const,
    metadata: toolName ? { toolName } : undefined,
  });

  it.each([
    ['search_drive_files', 'Google Drive', 'drive.google.com'],
    ['run_microsoft_365_tool', 'Microsoft 365', 'microsoft.com'],
    ['scrape_instagram', 'Instagram', 'instagram.com'],
    ['runway_generate_video', 'Runway', 'runwayml.com'],
  ])('maps %s to %s', (toolName, label, domain) => {
    const provider = getToolStepProvider(step(toolName));
    expect(provider?.label).toBe(label);
    expect(provider?.logoUrl).toContain(`domain=${domain}`);
  });

  it.each([undefined, 'dynamic_export', 'query_nxt1_data'])('returns null for %s', (toolName) => {
    expect(getToolStepProvider(step(toolName))).toBeNull();
  });
});
