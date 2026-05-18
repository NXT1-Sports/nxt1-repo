/**
 * @fileoverview Request-scoped Firestore environment context.
 * @module @nxt1/backend/utils/firestore-environment-context
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Firestore } from 'firebase-admin/firestore';
import { getRuntimeEnvironment, type RuntimeEnvironment } from '../config/runtime-environment.js';

const firestoreEnvironmentStorage = new AsyncLocalStorage<RuntimeEnvironment>();
const SCOPED_FIRESTORE_MARKER = Symbol('nxt1.firestore.environment.scoped');

type FirestoreEnvironmentMap = {
  readonly production: Firestore;
  readonly staging: Firestore;
};

type ScopedFirestore = Firestore & {
  readonly [SCOPED_FIRESTORE_MARKER]?: true;
};

export function runWithFirestoreEnvironment<T>(
  environment: RuntimeEnvironment | undefined,
  fn: () => T
): T {
  return firestoreEnvironmentStorage.run(environment ?? getRuntimeEnvironment(), fn);
}

export function getActiveFirestoreEnvironment(): RuntimeEnvironment {
  return firestoreEnvironmentStorage.getStore() ?? getRuntimeEnvironment();
}

export function createEnvironmentScopedFirestore(
  firestoreMap: FirestoreEnvironmentMap,
  defaultEnvironment: RuntimeEnvironment = getRuntimeEnvironment()
): Firestore {
  const resolveDb = (): Firestore => {
    const environment = firestoreEnvironmentStorage.getStore() ?? defaultEnvironment;
    return environment === 'production' ? firestoreMap.production : firestoreMap.staging;
  };

  return new Proxy({} as ScopedFirestore, {
    get(_target, prop) {
      if (prop === SCOPED_FIRESTORE_MARKER) {
        return true;
      }

      const activeDb = resolveDb();
      const value = Reflect.get(activeDb as unknown as object, prop, activeDb);

      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          const db = resolveDb();
          const method = Reflect.get(db as unknown as object, prop, db);
          return Reflect.apply(method as (...methodArgs: unknown[]) => unknown, db, args);
        };
      }

      return value;
    },
    set(_target, prop, value) {
      const activeDb = resolveDb();
      return Reflect.set(activeDb as unknown as object, prop, value, activeDb);
    },
    has(_target, prop) {
      if (prop === SCOPED_FIRESTORE_MARKER) {
        return true;
      }

      return prop in (resolveDb() as unknown as object);
    },
    ownKeys() {
      return Reflect.ownKeys(resolveDb() as unknown as object);
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (prop === SCOPED_FIRESTORE_MARKER) {
        return {
          configurable: false,
          enumerable: false,
          value: true,
          writable: false,
        };
      }

      const descriptor = Object.getOwnPropertyDescriptor(resolveDb() as unknown as object, prop);
      if (!descriptor) {
        return undefined;
      }

      return {
        ...descriptor,
        configurable: true,
      };
    },
  }) as Firestore;
}

export function isEnvironmentScopedFirestore(db: unknown): boolean {
  if (!db || (typeof db !== 'object' && typeof db !== 'function')) {
    return false;
  }

  return Reflect.get(db as object, SCOPED_FIRESTORE_MARKER) === true;
}
