/**
 * @fileoverview Request-scoped Mongo environment context.
 * @module @nxt1/backend/middleware/mongo
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type MongoEnvironmentScope = 'staging' | 'production';

const mongoScopeStorage = new AsyncLocalStorage<MongoEnvironmentScope>();

export function runWithMongoEnvironmentScope<T>(scope: MongoEnvironmentScope, fn: () => T): T {
  return mongoScopeStorage.run(scope, fn);
}

export function getMongoEnvironmentScope(): MongoEnvironmentScope | undefined {
  return mongoScopeStorage.getStore();
}
