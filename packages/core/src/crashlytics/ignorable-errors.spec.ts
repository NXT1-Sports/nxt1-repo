/**
 * @fileoverview Unit Tests for Ignorable Runtime Error Classifier
 * @module @nxt1/core/crashlytics
 *
 * Verifies every known Sentry noise signature is classified as ignorable,
 * while ensuring first-party defects (e.g. `.observe is not a function`,
 * `InvalidAccessError`) remain reportable.
 */

import { describe, it, expect } from 'vitest';
import { isIgnorableRuntimeError } from './ignorable-errors';

describe('isIgnorableRuntimeError', () => {
  it('ignores Firebase Installations app-offline errors', () => {
    expect(
      isIgnorableRuntimeError({
        name: 'FirebaseError',
        message:
          'Installations: Could not process request. Application offline. (installations/app-offline).',
        code: 'installations/app-offline',
      })
    ).toBe(true);
  });

  it('ignores Firebase Installations load-failed network errors', () => {
    expect(
      isIgnorableRuntimeError({
        message: 'Load failed',
        stack: 'at fetch (firebaseinstallations.googleapis.com/v1/projects/x/installations)',
      })
    ).toBe(true);
  });

  it('ignores Firebase Installations IndexedDB teardown noise', () => {
    expect(
      isIgnorableRuntimeError({
        name: 'InvalidStateError',
        message:
          "Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.",
        stack: 'at getToken (firebase-installations-database.js:1:1)',
      })
    ).toBe(true);
  });

  it('ignores native WebView bridge "Java object is gone" errors', () => {
    expect(
      isIgnorableRuntimeError({
        message: 'Error invoking postMessage: Java object is gone',
      })
    ).toBe(true);
  });

  it('ignores native iOS webkit bridge lifecycle noise', () => {
    expect(
      isIgnorableRuntimeError({
        message: 'window.webkit.messageHandlers.foo is undefined',
        stack: 'at sendDataToNative (app.js:1:1)',
      })
    ).toBe(true);
  });

  it('ignores expected AbortError cancellations', () => {
    expect(
      isIgnorableRuntimeError({ name: 'AbortError', message: 'The user aborted a request.' })
    ).toBe(true);
  });

  it('ignores device storage no-space failures', () => {
    expect(
      isIgnorableRuntimeError({
        name: 'UnknownError',
        message:
          'Connection is closing because of: IO error: .../0.indexeddb.leveldb/000064.log: FILE_ERROR_NO_SPACE',
      })
    ).toBe(true);
  });

  it('ignores IndexedDB "no in-progress transaction" failures', () => {
    expect(
      isIgnorableRuntimeError({
        name: 'UnknownError',
        message: 'Attempt to get a record from database without an in-progress transaction',
      })
    ).toBe(true);
  });

  it('ignores QuotaExceededError', () => {
    expect(isIgnorableRuntimeError({ name: 'QuotaExceededError', message: 'Quota exceeded' })).toBe(
      true
    );
  });

  it('ignores known Instagram in-app-browser noise', () => {
    expect(
      isIgnorableRuntimeError({
        message: 'navigation_performance_logger is not defined',
        userAgent: 'Mozilla/5.0 Instagram 300.0.0.0.0',
      })
    ).toBe(true);
  });

  it('does NOT ignore generic TypeErrors (e.g. ".observe is not a function")', () => {
    expect(
      isIgnorableRuntimeError({ name: 'TypeError', message: 'e.observe is not a function' })
    ).toBe(false);
  });

  it('does NOT ignore InvalidAccessError (unproven root cause, keep reportable)', () => {
    expect(
      isIgnorableRuntimeError({
        name: 'InvalidAccessError',
        message: 'The object does not support the operation or argument.',
      })
    ).toBe(false);
  });

  it('does NOT ignore an onboarding-style undefined property crash', () => {
    expect(
      isIgnorableRuntimeError({
        name: 'TypeError',
        message: "Cannot read properties of undefined (reading 'continue')",
      })
    ).toBe(false);
  });

  it('handles empty/missing input gracefully', () => {
    expect(isIgnorableRuntimeError({})).toBe(false);
  });
});
