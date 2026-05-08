import type { Firestore } from 'firebase-admin/firestore';
import { db as defaultDb } from '../../../../../utils/firebase.js';

export type EmailProvider = 'gmail' | 'microsoft';
export type EmailTemplateVariableValue = string | number | boolean;

export interface BatchEmailRecipient {
  readonly toEmail: string;
  readonly variables: Readonly<Record<string, EmailTemplateVariableValue>>;
  readonly recipientName?: string;
  readonly recipientKind?: string;
  readonly recipientOrgName?: string;
}

export const MAX_SUBJECT_LENGTH = 500;
export const MAX_BODY_LENGTH = 50_000;
export const MAX_BATCH_RECIPIENTS = 100;

const TEMPLATE_PLACEHOLDER_REGEX = /{{\s*([A-Za-z0-9_]+)\s*}}/g;

export async function resolveConnectedEmailProvider(
  userId: string,
  db: Firestore = defaultDb
): Promise<EmailProvider> {
  const userDoc = await db.collection('Users').doc(userId).get();
  const userData = userDoc.data();
  const connectedEmails: Array<{ provider: string; isActive: boolean }> =
    userData?.['connectedEmails'] ?? [];

  const active = connectedEmails.find(
    (connectedEmail) =>
      connectedEmail.isActive &&
      (connectedEmail.provider === 'gmail' || connectedEmail.provider === 'microsoft')
  );

  if (!active) {
    throw new Error(
      'No connected email account found. The user needs to connect their Gmail or Outlook account in Settings -> Email before sending emails.'
    );
  }

  return active.provider as EmailProvider;
}

export function collectTemplatePlaceholders(...templates: readonly string[]): readonly string[] {
  const placeholders = new Set<string>();

  for (const template of templates) {
    for (const match of template.matchAll(TEMPLATE_PLACEHOLDER_REGEX)) {
      const token = match[1]?.trim();
      if (token) {
        placeholders.add(token);
      }
    }
  }

  return [...placeholders];
}

function hasTemplateValue(value: EmailTemplateVariableValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export function getMissingTemplatePlaceholders(
  templates: readonly string[],
  variables: Readonly<Record<string, EmailTemplateVariableValue>>
): readonly string[] {
  return collectTemplatePlaceholders(...templates).filter(
    (placeholder) => !hasTemplateValue(variables[placeholder])
  );
}

export function renderEmailTemplate(
  template: string,
  variables: Readonly<Record<string, EmailTemplateVariableValue>>
): string {
  return template.replace(TEMPLATE_PLACEHOLDER_REGEX, (_match, token: string) => {
    const value = variables[token.trim()];
    if (value === undefined) return '';
    return String(value);
  });
}

/**
 * Normalizes LLM-generated template syntax by converting single-brace `{key}`
 * placeholders to the canonical double-brace `{{key}}` format.
 *
 * This is a deterministic safety net: if the model generates `{firstName}` instead
 * of `{{firstName}}`, the template still renders correctly rather than sending the
 * literal placeholder text to the recipient.
 *
 * Only converts tokens that are NOT already wrapped in double braces. The regex
 * uses negative lookbehind/lookahead to avoid double-converting `{{key}}`.
 */
export function normalizeTemplateSyntax(template: string): string {
  return template.replace(/(?<!\{)\{([A-Za-z0-9_]+)\}(?!\})/g, '{{$1}}');
}
