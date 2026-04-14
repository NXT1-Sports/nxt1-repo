import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { logger } from '../../../../utils/logger.js';
import { db } from '../../../../utils/firebase.js';
import { stagingDb } from '../../../../utils/firebase-staging.js';
import {
  FirebaseMcpListViewsResultSchema,
  FirebaseMcpListViewsToolArgsSchema,
  FirebaseMcpQueryResultSchema,
  FirebaseMcpQueryToolArgsSchema,
  verifySignedScopeEnvelope,
} from './firebase-mcp/shared.js';
import { executeFirebaseViewQuery, listFirebaseViewMetadata } from './firebase-mcp/views.js';

const MCP_SERVER_NAME = 'firebase-readonly';
const MCP_SERVER_VERSION = '1.0.0';
const SCOPE_SECRET_ENV = 'FIREBASE_MCP_SCOPE_SECRET';
const FIREBASE_TARGET_ENV = 'FIREBASE_MCP_TARGET_APP';

function getScopeSecret(): string {
  const secret = process.env[SCOPE_SECRET_ENV];
  if (!secret) {
    throw new Error(`${SCOPE_SECRET_ENV} must be set for the Firebase MCP server`);
  }
  return secret;
}

function resolveFirestoreTarget(): Firestore {
  const target =
    process.env[FIREBASE_TARGET_ENV] ??
    (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'default');

  if (target === 'staging') {
    return stagingDb;
  }

  if (target === 'default' || target === 'production') {
    return db;
  }

  throw new Error(`Unsupported ${FIREBASE_TARGET_ENV} value: ${target}`);
}

function serializeResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

async function run(): Promise<void> {
  const scopeSecret = getScopeSecret();
  const firestore = resolveFirestoreTarget();

  const server = new Server(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'firebase_list_views',
        description:
          'List the named, read-only Firebase views available to the agent. Use this to discover supported user-scoped data surfaces before querying.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'firebase_query_view',
        description:
          'Query a named, read-only Firebase view scoped to the authenticated user. This server never allows arbitrary collection paths or writes.',
        inputSchema: {
          type: 'object',
          properties: {
            scopeEnvelope: {
              type: 'object',
              description:
                'Signed server-only user scope envelope. The LLM must not generate this value.',
            },
            view: {
              type: 'string',
              description: 'Named Firebase view to query.',
            },
            filters: {
              type: 'object',
              description: 'Optional view-specific filters.',
            },
            limit: {
              type: 'number',
              description: 'Optional maximum number of rows to return. Hard-capped server-side.',
            },
            cursor: {
              type: 'string',
              description: 'Optional pagination cursor returned by a previous query.',
            },
          },
          required: ['scopeEnvelope', 'view'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const toolArgs = (request.params.arguments ?? {}) as Record<string, unknown>;

    try {
      if (toolName === 'firebase_list_views') {
        const parsed = FirebaseMcpListViewsToolArgsSchema.parse(toolArgs);
        const scope = parsed?.scopeEnvelope
          ? verifySignedScopeEnvelope(parsed.scopeEnvelope, scopeSecret)
          : {
              userId: 'anonymous',
              teamIds: [],
              organizationIds: [],
            };
        const result = FirebaseMcpListViewsResultSchema.parse({
          views: listFirebaseViewMetadata(),
          availableScopes: {
            userId: scope.userId,
            teamIds: scope.teamIds,
            organizationIds: scope.organizationIds,
            ...(scope.defaultTeamId ? { defaultTeamId: scope.defaultTeamId } : {}),
            ...(scope.defaultOrganizationId
              ? { defaultOrganizationId: scope.defaultOrganizationId }
              : {}),
          },
        });
        return serializeResult(result);
      }

      if (toolName === 'firebase_query_view') {
        const parsed = FirebaseMcpQueryToolArgsSchema.parse(toolArgs);
        const scope = verifySignedScopeEnvelope(parsed.scopeEnvelope, scopeSecret);
        const result = await executeFirebaseViewQuery(firestore, scope, {
          view: parsed.view,
          filters: parsed.filters,
          limit: parsed.limit,
          cursor: parsed.cursor,
        });
        const normalized = FirebaseMcpQueryResultSchema.parse(result);

        logger.info('[FirebaseMCP] Query completed', {
          view: normalized.view,
          userId: scope.userId,
          teamIds: scope.teamIds,
          organizationIds: scope.organizationIds,
          threadId: scope.threadId,
          sessionId: scope.sessionId,
          rowCount: normalized.count,
        });

        return serializeResult(normalized);
      }

      return errorResult(`Unknown Firebase MCP tool: ${toolName}`);
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? error.issues
              .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
              .join('; ')
          : error instanceof Error
            ? error.message
            : 'Unknown Firebase MCP error';

      logger.error('[FirebaseMCP] Tool call failed', {
        toolName,
        error: message,
      });

      return errorResult(message);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('[FirebaseMCP] Server connected over stdio', {
    target:
      process.env[FIREBASE_TARGET_ENV] ??
      (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'default'),
  });
}

run().catch((error) => {
  logger.error('[FirebaseMCP] Fatal startup error', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
