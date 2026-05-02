import type { AgentToolCategory } from '@nxt1/core';
import type { McpToolCallResult, McpToolDefinition } from '../base-mcp-client.service.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';

export interface MicrosoftOAuthTokenDocument {
  readonly provider: 'microsoft';
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly email?: string;
  readonly grantedScopes?: string;
  readonly lastRefreshedAt?: string;
}

type Microsoft365Service =
  | 'mail'
  | 'calendar'
  | 'files'
  | 'teams'
  | 'tasks'
  | 'contacts'
  | 'search'
  | 'users'
  | 'other';

export interface Microsoft365ToolMetadata {
  readonly service: Microsoft365Service;
  readonly isMutation: boolean;
  readonly summary: string;
}

export interface Microsoft365ResolvedToolMetadata extends Microsoft365ToolMetadata {
  readonly category: AgentToolCategory;
}

export interface Microsoft365DiscoveredToolDefinition
  extends McpToolDefinition, Microsoft365ResolvedToolMetadata {
  readonly available: true;
}

const MICROSOFT_365_DYNAMIC_BLOCKLIST = [/^login$/i, /^logout$/i, /^verify-login$/i] as const;

const MICROSOFT_365_MUTATION_PREFIX =
  /^(create|update|patch|delete|remove|send|reply|forward|move|copy|post|put|set|add|import|upload|enable|disable)-/;

const MICROSOFT_365_MUTATION_CONTAINS = [
  'send-mail',
  'reply',
  'forward',
  'create-event',
  'update-event',
  'delete-event',
  'upload',
  'create-folder',
  'delete-file',
];

function isBlockedMicrosoft365ToolName(name: string): boolean {
  return MICROSOFT_365_DYNAMIC_BLOCKLIST.some((pattern) => pattern.test(name));
}

function inferMicrosoft365Service(name: string): Microsoft365Service {
  if (/mail|message|inbox|draft|outlook/i.test(name)) return 'mail';
  if (/calendar|event|meeting|freebusy/i.test(name)) return 'calendar';
  if (/drive|file|folder|onedrive|sharepoint/i.test(name)) return 'files';
  if (/teams|channel|chat|transcript|attendance|presence/i.test(name)) return 'teams';
  if (/todo|task|planner/i.test(name)) return 'tasks';
  if (/contact/i.test(name)) return 'contacts';
  if (/search|query/i.test(name)) return 'search';
  if (/user|profile|people|directory/i.test(name)) return 'users';
  return 'other';
}

function inferMicrosoft365Mutation(name: string): boolean {
  if (MICROSOFT_365_MUTATION_PREFIX.test(name)) return true;
  return MICROSOFT_365_MUTATION_CONTAINS.some((needle) => name.includes(needle));
}

function getMicrosoft365Category(service: Microsoft365Service): AgentToolCategory {
  if (service === 'mail' || service === 'calendar' || service === 'teams') {
    return 'communication';
  }
  return 'data';
}

function sanitizeMicrosoft365InputSchema(
  inputSchema?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!inputSchema) return undefined;

  const nextSchema: Record<string, unknown> = { ...inputSchema };
  const rawProperties = nextSchema['properties'];
  if (rawProperties && typeof rawProperties === 'object' && !Array.isArray(rawProperties)) {
    nextSchema['properties'] = { ...(rawProperties as Record<string, unknown>) };
  }

  return nextSchema;
}

export function resolveMicrosoft365ToolMetadata(
  name: string,
  description?: string
): Microsoft365ResolvedToolMetadata | null {
  if (isBlockedMicrosoft365ToolName(name)) return null;

  const service = inferMicrosoft365Service(name);
  const isMutation = inferMicrosoft365Mutation(name);

  return {
    service,
    isMutation,
    summary: description?.trim() || `Microsoft 365 tool: ${name}`,
    category: getMicrosoft365Category(service),
  };
}

export function filterMicrosoft365ToolDefinitions(
  definitions: readonly McpToolDefinition[]
): ReadonlyArray<Microsoft365DiscoveredToolDefinition> {
  const seenNames = new Set<string>();

  return definitions.flatMap((definition) => {
    if (seenNames.has(definition.name)) return [];
    seenNames.add(definition.name);

    const metadata = resolveMicrosoft365ToolMetadata(definition.name, definition.description);
    if (!metadata) return [];

    const sanitizedSchema = sanitizeMicrosoft365InputSchema(definition.inputSchema);

    return [
      {
        ...definition,
        ...(sanitizedSchema ? { inputSchema: sanitizedSchema } : {}),
        ...metadata,
        available: true as const,
      },
    ];
  });
}

export function extractMicrosoft365Payload(result: McpToolCallResult): unknown {
  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    return result.structuredContent;
  }

  const textBlocks = result.content
    .flatMap((content) => {
      if (content.type === 'text' && content.text) return [content.text];
      if (typeof content.data === 'string' && content.data.trim().length > 0) {
        return [content.data];
      }
      return [] as string[];
    })
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  if (textBlocks.length === 0) return null;

  const combined = textBlocks.join('\n');
  try {
    return JSON.parse(combined);
  } catch {
    return textBlocks.length === 1 ? textBlocks[0] : combined;
  }
}

export function extractMicrosoft365ErrorMessage(result: McpToolCallResult): string {
  const payload = extractMicrosoft365Payload(result);

  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim();
  }

  if (payload && typeof payload === 'object') {
    const message =
      ('message' in payload && typeof payload.message === 'string' && payload.message.trim()) ||
      ('error' in payload && typeof payload.error === 'string' && payload.error.trim()) ||
      ('detail' in payload && typeof payload.detail === 'string' && payload.detail.trim());

    if (message) return message;
  }

  return 'Microsoft 365 MCP tool returned an error.';
}

export function truncateMicrosoft365Payload(data: unknown, maxChars = 50_000): unknown {
  if (typeof data === 'string') {
    return data.length <= maxChars
      ? data
      : `${data.slice(0, maxChars)}\n\n... [OUTPUT TRUNCATED — exceeds context limit]`;
  }

  const json = JSON.stringify(data, null, 2);
  if (json.length <= maxChars) return data;

  return {
    truncated: true,
    preview: `${json.slice(0, maxChars)}\n\n... [OUTPUT TRUNCATED — exceeds context limit]`,
  };
}

export function getMicrosoft365ToolMetadataFromCatalog(
  tools: readonly Microsoft365DiscoveredToolDefinition[],
  toolName: string
): Microsoft365ResolvedToolMetadata {
  const found = tools.find((tool) => tool.name === toolName);
  if (!found) {
    throw new AgentEngineError(
      'AGENT_VALIDATION_FAILED',
      `Unsupported Microsoft 365 tool: ${toolName}`,
      {
        metadata: { toolName },
      }
    );
  }

  return {
    service: found.service,
    isMutation: found.isMutation,
    summary: found.summary,
    category: found.category,
  };
}
