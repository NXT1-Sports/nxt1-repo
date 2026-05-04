import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { logger } from '../../../../../utils/logger.js';
import { db } from '../../../../../utils/firebase.js';
import { stagingDb } from '../../../../../utils/firebase-staging.js';
import {
  FirebaseMcpListViewsResultSchema,
  FirebaseMcpListViewsToolArgsSchema,
  FirebaseMcpQueryResultSchema,
  FirebaseMcpQueryToolArgsSchema,
  FirebaseMcpMutateToolArgsSchema,
  FirebaseMcpMutateResultSchema,
  verifySignedScopeEnvelope,
} from './shared.js';
import { executeFirebaseViewQuery, listFirebaseViewMetadata } from './views.js';
import { getMutationPolicy, ALLOWED_MUTATION_COLLECTIONS } from './mutation-policy.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';

const MCP_SERVER_NAME = 'firebase-readonly';
const MCP_SERVER_VERSION = '1.0.0';
const SCOPE_SECRET_ENV = 'FIREBASE_MCP_SCOPE_SECRET';
const FIREBASE_TARGET_ENV = 'FIREBASE_MCP_TARGET_APP';
const MUTATIONS_ENABLED_ENV = 'FIREBASE_MCP_MUTATIONS_ENABLED';

function getScopeSecret(): string {
  const secret = process.env[SCOPE_SECRET_ENV];
  if (!secret) {
    throw new AgentEngineError(
      'FIREBASE_MCP_CONFIG_INVALID',
      `${SCOPE_SECRET_ENV} must be set for the Firebase MCP server`
    );
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

  throw new AgentEngineError(
    'FIREBASE_MCP_CONFIG_INVALID',
    `Unsupported ${FIREBASE_TARGET_ENV} value: ${target}`
  );
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
      ...(process.env[MUTATIONS_ENABLED_ENV] === 'true'
        ? [
            {
              name: 'firebase_mutate',
              description:
                'Perform an update or soft/hard delete on a Firestore document in an explicitly allow-listed collection. ' +
                'Ownership is verified server-side — the user must own the document. ' +
                `Allowed collections: ${ALLOWED_MUTATION_COLLECTIONS.join(', ')}.`,
              inputSchema: {
                type: 'object',
                properties: {
                  scopeEnvelope: {
                    type: 'object',
                    description:
                      'Signed server-only user scope envelope. The LLM must not generate this value.',
                  },
                  operation: {
                    type: 'string',
                    enum: ['update', 'delete'],
                    description: 'The mutation operation to perform.',
                  },
                  collection: {
                    type: 'string',
                    description: 'Firestore collection name.',
                  },
                  documentId: {
                    type: 'string',
                    description: 'Firestore document ID.',
                  },
                  patch: {
                    type: 'object',
                    description:
                      'Fields to merge into the document. Required for update, ignored for delete.',
                  },
                },
                required: ['scopeEnvelope', 'operation', 'collection', 'documentId'],
              },
            },
          ]
        : []),
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

      if (toolName === 'firebase_mutate') {
        if (process.env[MUTATIONS_ENABLED_ENV] !== 'true') {
          return errorResult('firebase_mutate is not enabled on this server instance.');
        }

        const parsed = FirebaseMcpMutateToolArgsSchema.parse(toolArgs);
        const scope = verifySignedScopeEnvelope(parsed.scopeEnvelope, scopeSecret);
        const { operation, collection, documentId, patch } = parsed;

        // Policy gate — collection must be in the explicit allow-list
        const policy = getMutationPolicy(collection);
        if (!policy) {
          return errorResult(
            `Collection "${collection}" is not in the mutation allow-list. ` +
              `Allowed: ${ALLOWED_MUTATION_COLLECTIONS.join(', ')}.`
          );
        }

        // Operation gate
        if (!(policy.allowedOperations as readonly string[]).includes(operation)) {
          return errorResult(
            `Operation "${operation}" is not allowed on collection "${collection}".`
          );
        }

        // Fetch document and verify ownership
        const docRef = firestore.collection(collection).doc(documentId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
          return errorResult(`Document "${documentId}" not found in "${collection}".`);
        }

        const docData = docSnap.data() as Record<string, unknown>;

        let ownerId: string | undefined;
        if (policy.ownershipPath === '__team_owner') {
          const teamId =
            typeof docData['teamId'] === 'string' ? docData['teamId'] : undefined;
          if (!teamId) {
            return errorResult(`Document "${documentId}" has no teamId — cannot verify ownership.`);
          }
          const teamSnap = await firestore.collection('Teams').doc(teamId).get();
          ownerId = teamSnap.exists
            ? (teamSnap.data() as Record<string, unknown>)['ownerId'] as string | undefined
            : undefined;
        } else if (policy.ownershipPath === '__org_owner') {
          const orgId =
            typeof docData['organizationId'] === 'string' ? docData['organizationId'] : undefined;
          if (!orgId) {
            return errorResult(
              `Document "${documentId}" has no organizationId — cannot verify ownership.`
            );
          }
          const orgSnap = await firestore.collection('Organizations').doc(orgId).get();
          ownerId = orgSnap.exists
            ? (orgSnap.data() as Record<string, unknown>)['ownerId'] as string | undefined
            : undefined;
        } else if (policy.ownershipPath === '__schedule_owner') {
          const ownerType = typeof docData['ownerType'] === 'string' ? docData['ownerType'] : undefined;
          const rawOwnerId = typeof docData['ownerId'] === 'string' ? docData['ownerId'] : undefined;
          if (!ownerType || !rawOwnerId) {
            return errorResult(
              `Document "${documentId}" has no ownerType/ownerId — cannot verify ownership.`
            );
          }
          if (ownerType === 'user') {
            ownerId = rawOwnerId;
          } else {
            // team-owned schedule event — check Teams.ownerId
            const teamSnap = await firestore.collection('Teams').doc(rawOwnerId).get();
            ownerId = teamSnap.exists
              ? (teamSnap.data() as Record<string, unknown>)['ownerId'] as string | undefined
              : undefined;
          }
        } else {
          // Simple dot-path: only top-level field supported
          ownerId = docData[policy.ownershipPath] as string | undefined;
        }

        if (!ownerId || ownerId !== scope.userId) {
          return errorResult('Forbidden: you do not own this document.');
        }

        // Execute the mutation
        if (operation === 'delete') {
          if (policy.softDelete) {
            await docRef.update({
              deleted: true,
              deletedAt: FieldValue.serverTimestamp(),
            });
          } else {
            await docRef.delete();
          }
        } else {
          // update
          if (!patch || Object.keys(patch).length === 0) {
            return errorResult('patch is required and must be non-empty for update operations.');
          }

          // Field allow-list filtering
          let filteredPatch: Record<string, unknown>;
          if (policy.allowedPatchFields) {
            const allowed = new Set(policy.allowedPatchFields);
            filteredPatch = Object.fromEntries(
              Object.entries(patch).filter(([key]) => allowed.has(key))
            );
            if (Object.keys(filteredPatch).length === 0) {
              return errorResult(
                `None of the supplied patch fields are allowed for collection "${collection}". ` +
                  `Allowed fields: ${[...policy.allowedPatchFields].join(', ')}.`
              );
            }
          } else {
            // Strip immutable/ownership fields
            const IMMUTABLE = new Set(['id', 'userId', 'teamId', 'organizationId', 'ownerId', 'createdAt']);
            filteredPatch = Object.fromEntries(
              Object.entries(patch).filter(([key]) => !IMMUTABLE.has(key))
            );
          }

          filteredPatch['updatedAt'] = FieldValue.serverTimestamp();
          await docRef.update(filteredPatch);
        }

        logger.info('[FirebaseMCP] Mutation completed', {
          collection,
          documentId,
          operation,
          userId: scope.userId,
          softDelete: operation === 'delete' ? policy.softDelete : undefined,
        });

        const mutateResult = FirebaseMcpMutateResultSchema.parse({
          collection,
          documentId,
          operation,
          success: true,
          message: `${operation === 'delete' ? 'Deleted' : 'Updated'} ${collection}/${documentId} successfully.`,
        });

        return serializeResult(mutateResult);
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
