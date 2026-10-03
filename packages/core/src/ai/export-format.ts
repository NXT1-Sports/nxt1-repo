const AGENT_EXPORT_FORMAT_DISPLAY_NAMES = {
  pdf: 'PDF document',
  csv: 'CSV spreadsheet',
  xlsx: 'Excel spreadsheet',
  pptx: 'PowerPoint presentation',
  docx: 'Word document',
} as const;

export type AgentExportFormat = keyof typeof AGENT_EXPORT_FORMAT_DISPLAY_NAMES;

function isAgentExportFormat(format: string): format is AgentExportFormat {
  return Object.prototype.hasOwnProperty.call(AGENT_EXPORT_FORMAT_DISPLAY_NAMES, format);
}

export function getAgentExportFormatDisplayName(format: unknown): string | null {
  if (typeof format !== 'string') return null;

  const normalizedFormat = format.trim().toLowerCase();
  return isAgentExportFormat(normalizedFormat)
    ? AGENT_EXPORT_FORMAT_DISPLAY_NAMES[normalizedFormat]
    : null;
}
