/**
 * @fileoverview Demo Request Service
 * @module @nxt1/backend/services/marketing
 *
 * Public, unauthenticated "Request a Demo" lead capture. Persists the
 * submission into the Notion B2B Partners database and notifies John and Ray.
 */

import { logger } from '../../utils/logger.js';
import { randomUUID } from 'node:crypto';
import type { RuntimeEnvironment } from '../../config/runtime-environment.js';
import type { DemoRequestRecord, DemoRequestRole, DemoRequestSubmission } from '@nxt1/core';
import { sendPlatformEmail } from '../communications/platform-email.service.js';
import { upsertB2BOutboundLead } from './integrations/notion/signup-dashboard-entry.service.js';
import { compactText } from './integrations/notion/notion-property-helpers.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEMO_REQUEST_ROLES: readonly DemoRequestRole[] = [
  'coach',
  'director',
  'program-admin',
  'other',
];
const DEMO_REQUEST_NOTIFICATION_RECIPIENTS = ['john@nxt1sports.com', 'ray@nxt1sports.com'] as const;

export class DemoRequestValidationError extends Error {
  readonly details: readonly string[];

  constructor(details: readonly string[]) {
    super(details.join(', '));
    this.name = 'DemoRequestValidationError';
    this.details = details;
  }
}

function validateDemoRequest(input: DemoRequestSubmission): string[] {
  const errors: string[] = [];

  if (!input.name || input.name.trim().length < 2) {
    errors.push('Name is required');
  }
  if (!input.email || !EMAIL_PATTERN.test(input.email.trim())) {
    errors.push('A valid email is required');
  }
  if (!input.organization || input.organization.trim().length < 2) {
    errors.push('Organization or program name is required');
  }
  if (input.role && !DEMO_REQUEST_ROLES.includes(input.role)) {
    errors.push('Invalid role');
  }
  if (input.preferredDemoDate && !DATE_PATTERN.test(input.preferredDemoDate)) {
    errors.push('Preferred date must be a valid date');
  }
  if (input.preferredDemoTime && input.preferredDemoTime.trim().length > 160) {
    errors.push('Preferred time must be 160 characters or fewer');
  }
  if (input.notes && input.notes.length > 2000) {
    errors.push('Notes must be 2000 characters or fewer');
  }

  return errors;
}

function buildNotionNotes(record: Omit<DemoRequestRecord, 'id'>): string {
  const isSubscription = record.requestType === 'subscription';
  const lines = [
    isSubscription
      ? 'Inbound custom subscription request from the authenticated Billing & Usage page.'
      : 'Inbound demo request from the public /request-demo page.',
  ];

  const role = compactText(record.role);
  const sport = compactText(record.sport);
  const preferredDate = compactText(record.preferredDemoDate);
  const preferredTime = compactText(record.preferredDemoTime);
  const notes = compactText(record.notes);

  if (role) lines.push(`Role: ${role}`);
  if (sport) lines.push(`Sport: ${sport}`);
  if (preferredDate) lines.push(`Preferred Date: ${preferredDate}`);
  if (preferredTime) lines.push(`Preferred Time: ${preferredTime}`);
  if (notes) lines.push(`Notes: ${notes}`);

  return lines.join('\n');
}

function buildSalesNotificationHtml(record: DemoRequestRecord): string {
  const isSubscription = record.requestType === 'subscription';
  const requestLabel = isSubscription ? 'Custom Subscription Request' : 'Demo Request';
  const rows: Array<[string, string]> = [
    ['Name', record.name],
    ['Email', record.email],
    ['Organization', record.organization],
    ['Role', record.role ?? '—'],
    ['Sport', record.sport ?? '—'],
    ['Preferred Date', record.preferredDemoDate ?? '—'],
    ['Preferred Time', record.preferredDemoTime ?? '—'],
    ['Notes', record.notes ?? '—'],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;">${label}</td><td style="padding:4px 0;font-weight:600;">${value}</td></tr>`
    )
    .join('');

  return `<div><h2>New ${requestLabel}</h2><table>${rowsHtml}</table></div>`;
}

/**
 * Validate, persist, and notify sales of a new public demo request.
 */
export async function submitDemoRequest(
  input: DemoRequestSubmission,
  environment: RuntimeEnvironment
): Promise<DemoRequestRecord> {
  const normalized: DemoRequestSubmission = {
    requestType: input.requestType === 'subscription' ? 'subscription' : 'demo',
    name: input.name?.trim() ?? '',
    email: input.email?.trim().toLowerCase() ?? '',
    organization: input.organization?.trim() ?? '',
    role: input.role,
    sport: input.sport?.trim() || undefined,
    preferredDemoDate: input.preferredDemoDate?.trim() || undefined,
    preferredDemoTime: input.preferredDemoTime?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  };

  const errors = validateDemoRequest(normalized);
  if (errors.length > 0) {
    throw new DemoRequestValidationError(errors);
  }

  const createdAt = new Date().toISOString();

  const draftRecord: Omit<DemoRequestRecord, 'id'> = {
    ...normalized,
    createdAt,
  };

  // Notion is the source of truth for demo leads, but a Notion outage or
  // missing local config must never lose the lead — fall back to a
  // generated id and keep emailing John and Ray either way.
  let notionPageId: string | null = null;
  try {
    const notionResult = await upsertB2BOutboundLead({
      environment,
      organization: draftRecord.organization,
      email: draftRecord.email,
      primaryContact: draftRecord.name,
      stage: 'Demo',
      leadSource: 'Inbound',
      nextAction:
        draftRecord.requestType === 'subscription'
          ? 'Reach out to schedule a custom subscription conversation with John or Ray.'
          : 'Reach out to schedule the requested demo with John or Ray.',
      notes: buildNotionNotes(draftRecord),
    });

    if (notionResult.status === 'skipped') {
      logger.warn('[DemoRequest] Notion B2B Partners save skipped', {
        reason: notionResult.reason,
        organization: draftRecord.organization,
      });
    } else {
      notionPageId = notionResult.pageId;
    }
  } catch (err) {
    logger.error('[DemoRequest] Failed to save demo request to Notion B2B Partners', {
      organization: draftRecord.organization,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const record: DemoRequestRecord = {
    id: notionPageId ?? randomUUID(),
    ...draftRecord,
  };

  try {
    const requestLabel =
      record.requestType === 'subscription' ? 'Custom Subscription Request' : 'Demo Request';
    await sendPlatformEmail(
      DEMO_REQUEST_NOTIFICATION_RECIPIENTS.join(', '),
      `New ${requestLabel} — ${record.organization}`,
      buildSalesNotificationHtml(record),
      record.email
    );
  } catch (err) {
    // Lead is already persisted — a failed notification email should not fail the request.
    logger.error('[DemoRequest] Failed to send sales notification email', {
      demoRequestId: record.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('[DemoRequest] ✅ Demo request submitted', {
    demoRequestId: record.id,
    organization: record.organization,
    environment,
  });

  return record;
}
