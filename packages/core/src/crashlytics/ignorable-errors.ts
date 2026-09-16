/**
 * @fileoverview Ignorable Runtime Error Classifier
 * @module @nxt1/core/crashlytics
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Single source of truth for classifying known non-actionable browser/runtime
 * noise (Firebase Installations offline retries, native WebView bridge
 * lifecycle messages, user-initiated request cancellation, and device
 * storage exhaustion). Previously this logic was duplicated across the
 * Sentry `beforeSend` hook, the shared GlobalErrorHandler, and several
 * individual services — this module consolidates it so every caller applies
 * the same rules.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

/**
 * Normalized shape callers adapt their error/event data into before classifying.
 * All fields are optional since callers may only have partial information
 * (e.g. a Sentry event only has message/stack, not a live Error instance).
 */
export interface IgnorableErrorInput {
  readonly message?: string | null;
  readonly name?: string | null;
  readonly code?: string | null;
  readonly stack?: string | null;
  readonly userAgent?: string | null;
}

/**
 * Returns true when the error is known, non-actionable runtime/browser noise
 * that should not be surfaced to the user or reported to crash tracking.
 *
 * Covers:
 * - Firebase Installations `app-offline` / load-failed background retries
 * - Firebase Installations IndexedDB contention during teardown
 * - Native WebView/Capacitor bridge lifecycle noise (e.g. "Java object is gone")
 * - Expected `AbortError` from user/browser-initiated request cancellation
 * - Device-originated storage exhaustion (no space left, quota exceeded)
 * - Known third-party in-app-browser noise (e.g. Instagram WebView)
 */
export function isIgnorableRuntimeError(input: IgnorableErrorInput): boolean {
  const message = (input.message ?? '').toLowerCase();
  const stack = (input.stack ?? '').toLowerCase();
  const code = (input.code ?? '').toLowerCase();
  const name = (input.name ?? '').toLowerCase();
  const userAgent = (input.userAgent ?? '').toLowerCase();

  return (
    isFirebaseInstallationsNoise(message, stack, code, name) ||
    isInstallationsIndexedDbTeardownNoise(message, stack, name) ||
    isNativeBridgeNoise(message, stack) ||
    isAbortNoise(name) ||
    isDeviceStorageExhaustionNoise(message, name) ||
    isInstagramWebViewNoise(message, userAgent)
  );
}

function isFirebaseInstallationsNoise(
  message: string,
  stack: string,
  code: string,
  name: string
): boolean {
  const installationsHost = 'firebaseinstallations.googleapis.com';
  const fetchFailed =
    (message.includes('failed to fetch') || message.includes('load failed')) &&
    (message.includes(installationsHost) || stack.includes(installationsHost));

  return (
    code === 'installations/app-offline' ||
    message.includes('installations/app-offline') ||
    stack.includes('installations/app-offline') ||
    fetchFailed ||
    (name === 'firebaseerror' &&
      message.includes('installations') &&
      message.includes('application offline'))
  );
}

function isInstallationsIndexedDbTeardownNoise(
  message: string,
  stack: string,
  name: string
): boolean {
  return (
    name === 'invalidstateerror' &&
    message.includes("failed to execute 'transaction' on 'idbdatabase'") &&
    message.includes('database connection is closing') &&
    (stack.includes('firebase-installations-database') ||
      stack.includes('firebaseinstallations') ||
      stack.includes('gettoken'))
  );
}

function isNativeBridgeNoise(message: string, stack: string): boolean {
  const webkitBridgeNoise =
    message.includes('window.webkit.messagehandlers') &&
    (stack.includes('senddatatonative') ||
      stack.includes('sendpagehidemessage') ||
      stack.includes('setupioscallbackhandler'));

  return (
    message.includes('java object is gone') ||
    message.includes('illegal access') ||
    message.includes('enabledidusertypeonkeyboardlogging') ||
    message.includes('script error') ||
    webkitBridgeNoise
  );
}

function isAbortNoise(name: string): boolean {
  return name === 'aborterror';
}

function isDeviceStorageExhaustionNoise(message: string, name: string): boolean {
  return (
    name === 'quotaexceedederror' ||
    message.includes('quota exceeded') ||
    message.includes('file_error_no_space') ||
    message.includes('no-space') ||
    message.includes('attempt to get a record from database without an in-progress transaction')
  );
}

function isInstagramWebViewNoise(message: string, userAgent: string): boolean {
  return userAgent.includes('instagram') && message.includes('navigation_performance_logger');
}
