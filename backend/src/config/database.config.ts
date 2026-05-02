/**
 * @fileoverview MongoDB Database Configuration
 * @module @nxt1/backend/config/database
 *
 * MongoDB connection setup with Mongoose
 */

import mongoose from 'mongoose';
import { getMongoDatabaseName, getRuntimeEnvironment } from './runtime-environment.js';
import { logger } from '../utils/logger.js';
import type { Connection } from 'mongoose';
import { getMongoEnvironmentScope } from '../middleware/mongo/mongo-scope.context.js';

let isConnected = false;

type MongoScope = 'global' | 'staging' | 'production';

const scopedConnections: Partial<Record<MongoScope, Connection>> = {};

interface ScopedDbNames {
  readonly global: string;
  readonly staging: string;
  readonly production: string;
}

function extractMongoDatabaseNameFromUri(mongoUri?: string): string | undefined {
  if (!mongoUri) return undefined;

  const withoutQuery = mongoUri.split('?')[0] ?? '';
  const lastSlash = withoutQuery.lastIndexOf('/');
  if (lastSlash === -1 || lastSlash === withoutQuery.length - 1) return undefined;

  const dbName = withoutQuery.slice(lastSlash + 1).trim();
  return dbName.length > 0 ? dbName : undefined;
}

function resolveScopedDbNames(mongoUri: string): ScopedDbNames {
  const baseNameRaw = extractMongoDatabaseNameFromUri(mongoUri) ?? 'nxt';
  const baseNameWithoutSuffix = baseNameRaw.replace(/_(staging|production)$/, '');
  const canonicalBase =
    typeof process.env['MONGO_DB_NAME_GLOBAL'] === 'string' &&
    process.env['MONGO_DB_NAME_GLOBAL'].trim().length > 0
      ? process.env['MONGO_DB_NAME_GLOBAL'].trim()
      : baseNameWithoutSuffix;

  return {
    global: canonicalBase,
    staging:
      typeof process.env['MONGO_DB_NAME_STAGING'] === 'string' &&
      process.env['MONGO_DB_NAME_STAGING'].trim().length > 0
        ? process.env['MONGO_DB_NAME_STAGING'].trim()
        : `${canonicalBase}_staging`,
    production:
      typeof process.env['MONGO_DB_NAME_PRODUCTION'] === 'string' &&
      process.env['MONGO_DB_NAME_PRODUCTION'].trim().length > 0
        ? process.env['MONGO_DB_NAME_PRODUCTION'].trim()
        : `${canonicalBase}_production`,
  };
}

async function createScopedConnection(
  mongoUri: string,
  dbName: string,
  scope: MongoScope
): Promise<void> {
  const connection = mongoose.createConnection(mongoUri, { dbName });
  await connection.asPromise();
  scopedConnections[scope] = connection;
}

async function initializeScopedConnections(mongoUri: string): Promise<void> {
  const dbNames = resolveScopedDbNames(mongoUri);

  await Promise.all([
    createScopedConnection(mongoUri, dbNames.global, 'global'),
    createScopedConnection(mongoUri, dbNames.staging, 'staging'),
    createScopedConnection(mongoUri, dbNames.production, 'production'),
  ]);

  logger.info('✅ MongoDB scoped connections initialized', {
    global: dbNames.global,
    staging: dbNames.staging,
    production: dbNames.production,
  });
}

function getRequiredScopedConnection(scope: MongoScope): Connection {
  const connection = scopedConnections[scope];
  if (!connection || connection.readyState !== 1) {
    return mongoose.connection;
  }
  return connection;
}

/**
 * Initialize MongoDB connection
 * @returns {Promise<void>}
 */
export async function connectToMongoDB(): Promise<void> {
  if (isConnected) {
    logger.info('MongoDB already connected');
    return;
  }

  const mongoUri = process.env['MONGO'];

  if (!mongoUri) {
    throw new Error('MONGO environment variable is not set');
  }

  try {
    const environment = getRuntimeEnvironment();
    const dbName = getMongoDatabaseName(mongoUri);

    await mongoose.connect(mongoUri, { dbName });
    await initializeScopedConnections(mongoUri);
    isConnected = true;

    const sanitizedUri = mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    logger.info(
      `✅ MongoDB connected successfully to: ${sanitizedUri} | db=${dbName} | env=${environment}`
    );
  } catch (error) {
    logger.error('❌ MongoDB connection error:', { error });
    throw error;
  }
}

/**
 * Close MongoDB connection
 * @returns {Promise<void>}
 */
export async function disconnectFromMongoDB(): Promise<void> {
  if (!isConnected) {
    return;
  }

  try {
    const closeScopedConnection = async (scope: MongoScope): Promise<void> => {
      const connection = scopedConnections[scope];
      if (connection) {
        await connection.close();
      }
      delete scopedConnections[scope];
    };

    await Promise.all([
      closeScopedConnection('global'),
      closeScopedConnection('staging'),
      closeScopedConnection('production'),
    ]);

    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error('MongoDB disconnect error:', { error });
    throw error;
  }
}

/**
 * Get MongoDB connection status
 */
export function isMongoDBConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

export function getMongoGlobalConnection(): Connection {
  return getRequiredScopedConnection('global');
}

export function getMongoEnvironmentConnection(scope?: 'staging' | 'production'): Connection {
  const resolvedScope = scope ?? getMongoEnvironmentScope() ?? getRuntimeEnvironment();
  return getRequiredScopedConnection(resolvedScope);
}
