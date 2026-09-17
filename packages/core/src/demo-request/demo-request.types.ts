/**
 * @fileoverview Demo Request Types - Pure TypeScript
 * @module @nxt1/core/demo-request
 *
 * Public, unauthenticated "Request a Demo" lead-capture flow surfaced
 * from the root marketing landing page hero.
 */

/** Role of the person requesting a demo. */
export type DemoRequestRole = 'coach' | 'director' | 'program-admin' | 'other';

export type DemoRequestType = 'demo' | 'subscription';

/** Submission payload sent from the public request-demo page. */
export interface DemoRequestSubmission {
  readonly requestType?: DemoRequestType;
  readonly name: string;
  readonly email: string;
  readonly organization: string;
  readonly role?: DemoRequestRole;
  readonly sport?: string;
  readonly preferredDemoDate?: string;
  readonly preferredDemoTime?: string;
  readonly notes?: string;
}

/** Persisted demo request record returned by the API. */
export interface DemoRequestRecord {
  readonly id: string;
  readonly requestType?: DemoRequestType;
  readonly name: string;
  readonly email: string;
  readonly organization: string;
  readonly role?: DemoRequestRole;
  readonly sport?: string;
  readonly preferredDemoDate?: string;
  readonly preferredDemoTime?: string;
  readonly notes?: string;
  readonly createdAt: string;
}

export interface DemoRequestResponse {
  readonly success: boolean;
  readonly data?: DemoRequestRecord;
  readonly error?: string;
}
