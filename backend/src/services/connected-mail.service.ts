/**
 * @fileoverview Connected Mail Service
 * @module @nxt1/backend/services/connected-mail
 *
 * Fetches emails from connected Gmail / Microsoft inboxes using their
 * REST APIs, maps them to NXT1 Conversation + Message documents, and
 * upserts into MongoDB.  Outbound messages sent from the platform are
 * dispatched through the same provider tokens.
 *
 * Token storage:
 *   Firestore → Users/{uid}/oauthTokens/{provider}
 *   Fallback   → Users/{uid}/emailTokens/{provider}
 *   (server-only subcollection — Firestore rules block client reads)
 *
 * College coach matching:
 *   Compares the sender's email domain against the colleges collection
 *   in MongoDB to flag conversations with verified college contacts.
 */

import { randomUUID } from 'node:crypto';
import axios from 'axios';
import {
  OAUTH_TOKEN_SUBCOLLECTION,
  LEGACY_EMAIL_TOKEN_SUBCOLLECTION,
  getOAuthTokenDocId,
} from '@nxt1/core/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { db as defaultDb } from '../utils/firebase.js';
import { stagingDb } from '../utils/firebase-staging.js';
import { logger } from '../utils/logger.js';
import { ConversationModel, type IConversation } from '../models/conversation.model.js';
import { MessageModel } from '../models/message.model.js';
import { CollegeModel } from '../models/college.model.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type EmailProvider = 'gmail' | 'microsoft';

interface ProviderOAuthTokens {
  provider: EmailProvider;
  accessToken: string;
  refreshToken?: string;
  email?: string;
  lastRefreshedAt?: string;
}

interface NormalizedEmail {
  externalMessageId: string;
  externalThreadId: string;
  from: { email: string; name: string };
  to: { email: string; name: string }[];
  subject: string;
  bodyText: string;
  date: string;
  headers: Record<string, string>;
}

interface SyncResult {
  synced: number;
  skipped: number;
  errors: number;
}

// ─── Token Helpers ──────────────────────────────────────────────────────────

/**
 * Resolve Google OAuth credentials using the same env-var fallback chain as
 * the connect-gmail route in auth.routes.ts.  The `db` instance is compared
 * to `stagingDb` to decide which CLIENT_ID to use.
 */
function resolveGoogleCredentials(db: Firestore): { clientId: string; clientSecret: string } {
  const isStaging = db === stagingDb;
  const clientId = isStaging
    ? (process.env['STAGING_CLIENT_ID'] ?? process.env['CLIENT_ID'] ?? '')
    : (process.env['CLIENT_ID'] ?? '');
  const clientSecret = isStaging
    ? (process.env['STAGING_CLIENT_SECRET'] ?? process.env['CLIENT_SECRET'] ?? '')
    : (process.env['CLIENT_SECRET'] ?? '');
  return { clientId, clientSecret };
}

/**
 * Retrieve OAuth tokens from Firestore server-only subcollection.
 */
async function getProviderOAuthTokens(
  userId: string,
  provider: EmailProvider,
  db: Firestore = defaultDb
): Promise<ProviderOAuthTokens | null> {
  const tokenRef = db
    .collection('Users')
    .doc(userId)
    .collection(OAUTH_TOKEN_SUBCOLLECTION)
    .doc(getOAuthTokenDocId(provider));
  const tokenSnap = await tokenRef.get();

  if (tokenSnap.exists) {
    const tokenData = tokenSnap.data() as ProviderOAuthTokens;
    return { ...tokenData, provider };
  }

  const legacyTokenRef = db
    .collection('Users')
    .doc(userId)
    .collection(LEGACY_EMAIL_TOKEN_SUBCOLLECTION)
    .doc(provider);
  const snap = await legacyTokenRef.get();

  if (!snap.exists) return null;

  const data = snap.data() as ProviderOAuthTokens;
  const migratedStorageDoc = {
    ...data,
    provider: getOAuthTokenDocId(provider),
  };

  try {
    const batch = db.batch();
    batch.set(tokenRef, migratedStorageDoc, { merge: true });
    batch.delete(legacyTokenRef);
    await batch.commit();
    logger.info('[ConnectedMail] Migrated legacy email token doc to oauthTokens', {
      userId,
      provider,
    });
  } catch (error) {
    logger.warn('[ConnectedMail] Failed to migrate legacy email token doc', {
      userId,
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { ...data, provider };
}

/**
 * Refresh a Gmail access token using the refresh token.
 */
async function refreshGmailToken(
  userId: string,
  refreshToken: string,
  db: Firestore = defaultDb
): Promise<string> {
  const { clientId, clientSecret } = resolveGoogleCredentials(db);

  if (!clientId || !clientSecret) {
    throw new Error('Gmail OAuth credentials not configured');
  }

  const { data } = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const newAccessToken = data.access_token as string;

  // Persist refreshed token
  const tokenRef = db
    .collection('Users')
    .doc(userId)
    .collection(OAUTH_TOKEN_SUBCOLLECTION)
    .doc(getOAuthTokenDocId('gmail'));
  await tokenRef.update({
    accessToken: newAccessToken,
    lastRefreshedAt: new Date().toISOString(),
  });

  return newAccessToken;
}

/**
 * Refresh a Microsoft access token using the refresh token.
 */
async function refreshMicrosoftToken(
  userId: string,
  refreshToken: string,
  db: Firestore = defaultDb
): Promise<string> {
  const clientId = process.env['MICROSOFT_CLIENT_ID'];
  const clientSecret = process.env['MICROSOFT_CLIENT_SECRET'];

  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth credentials not configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'User.Read Mail.Send Mail.Read offline_access',
  });

  const { data } = await axios.post(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const newAccessToken = data.access_token as string;

  // Persist refreshed token
  const tokenRef = db
    .collection('Users')
    .doc(userId)
    .collection(OAUTH_TOKEN_SUBCOLLECTION)
    .doc(getOAuthTokenDocId('microsoft'));
  await tokenRef.update({
    accessToken: newAccessToken,
    lastRefreshedAt: new Date().toISOString(),
  });

  return newAccessToken;
}

/**
 * Get a valid access token, refreshing if necessary.
 */
async function getValidAccessToken(
  userId: string,
  tokens: ProviderOAuthTokens,
  db: Firestore = defaultDb
): Promise<string> {
  // Try the current token first
  try {
    if (tokens.provider === 'gmail') {
      await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
    } else {
      await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
    }
    return tokens.accessToken;
  } catch {
    // Token expired — refresh
    if (!tokens.refreshToken) {
      throw new Error(`No refresh token available for ${tokens.provider}. User must re-authorize.`);
    }

    logger.info(`[EmailSync] Refreshing ${tokens.provider} token for user ${userId}`);

    if (tokens.provider === 'gmail') {
      return refreshGmailToken(userId, tokens.refreshToken, db);
    }
    return refreshMicrosoftToken(userId, tokens.refreshToken, db);
  }
}

// ─── Email Header Parsing ───────────────────────────────────────────────────

/** RFC 2822 address pattern: "Display Name" <user@example.com> or user@example.com */
const EMAIL_ADDRESS_PATTERN = /^(?:"?(.+?)"?\s+)?<?([^\s>]+@[^\s>]+)>?$/;

/**
 * Parse an RFC 2822 email address header into name and email components.
 */
function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.trim().match(EMAIL_ADDRESS_PATTERN);
  return {
    name: match?.[1] ?? raw.trim(),
    email: match?.[2] ?? raw.trim(),
  };
}

// ─── Gmail API ──────────────────────────────────────────────────────────────

/**
 * Fetch recent messages from Gmail REST API.
 */
async function fetchGmailMessages(
  accessToken: string,
  maxResults = 50
): Promise<NormalizedEmail[]> {
  // Step 1: List message IDs
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`;
  const listRes = await axios.get(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const messageIds: string[] = (listRes.data.messages ?? []).map((m: { id: string }) => m.id);

  if (messageIds.length === 0) return [];

  // Step 2: Fetch full messages (batch — sequential for simplicity)
  const results: NormalizedEmail[] = [];

  for (const msgId of messageIds) {
    try {
      const msgRes = await axios.get(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const msg = msgRes.data;
      const headers: Record<string, string> = {};
      for (const h of msg.payload?.headers ?? []) {
        headers[h.name] = h.value;
      }

      // Extract plain text body
      let bodyText = '';
      if (msg.payload?.body?.data) {
        bodyText = Buffer.from(msg.payload.body.data, 'base64url').toString('utf-8');
      } else if (msg.payload?.parts) {
        const textPart = msg.payload.parts.find(
          (p: { mimeType: string }) => p.mimeType === 'text/plain'
        );
        if (textPart?.body?.data) {
          bodyText = Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
        } else {
          // Fallback to HTML part stripped of tags
          const htmlPart = msg.payload.parts.find(
            (p: { mimeType: string }) => p.mimeType === 'text/html'
          );
          if (htmlPart?.body?.data) {
            const html = Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8');
            bodyText = html
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          }
        }
      }

      // Parse From header
      const from = parseEmailAddress(headers['From'] ?? '');

      // Parse To header
      const toHeader = headers['To'] ?? '';
      const toRecipients = toHeader.split(',').map((t) => parseEmailAddress(t));

      results.push({
        externalMessageId: msg.id,
        externalThreadId: msg.threadId,
        from,
        to: toRecipients,
        subject: headers['Subject'] ?? '(No Subject)',
        bodyText: bodyText || '(No content)',
        date: headers['Date']
          ? new Date(headers['Date']).toISOString()
          : new Date(Number(msg.internalDate)).toISOString(),
        headers,
      });
    } catch (err) {
      logger.warn(`[EmailSync] Failed to fetch Gmail message ${msgId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

// ─── Microsoft Graph API ────────────────────────────────────────────────────

/**
 * Fetch recent messages from Microsoft Graph API.
 */
async function fetchMicrosoftMessages(
  accessToken: string,
  maxResults = 50
): Promise<NormalizedEmail[]> {
  const url =
    `https://graph.microsoft.com/v1.0/me/messages` +
    `?$top=${maxResults}&$orderby=receivedDateTime desc` +
    `&$select=id,conversationId,from,toRecipients,subject,bodyPreview,body,receivedDateTime,internetMessageHeaders`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const messages: NormalizedEmail[] = [];

  for (const msg of res.data.value ?? []) {
    const headers: Record<string, string> = {};
    for (const h of msg.internetMessageHeaders ?? []) {
      headers[h.name] = h.value;
    }

    const bodyText =
      msg.body?.contentType === 'text'
        ? msg.body.content
        : (msg.body?.content ?? '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() ||
          msg.bodyPreview ||
          '(No content)';

    messages.push({
      externalMessageId: msg.id,
      externalThreadId: msg.conversationId ?? msg.id,
      from: {
        email: msg.from?.emailAddress?.address ?? '',
        name: msg.from?.emailAddress?.name ?? '',
      },
      to: (msg.toRecipients ?? []).map(
        (r: { emailAddress: { address: string; name: string } }) => ({
          email: r.emailAddress?.address ?? '',
          name: r.emailAddress?.name ?? '',
        })
      ),
      subject: msg.subject ?? '(No Subject)',
      bodyText,
      date: msg.receivedDateTime
        ? new Date(msg.receivedDateTime).toISOString()
        : new Date().toISOString(),
      headers,
    });
  }

  return messages;
}

// ─── College Coach Matching ─────────────────────────────────────────────────

/**
 * Cache of known college email domains → college names.
 * Populated once per sync run to avoid repeated DB queries.
 */
let collegeDomainCache: Map<string, string> | null = null;

async function getCollegeDomainMap(): Promise<Map<string, string>> {
  if (collegeDomainCache) return collegeDomainCache;

  const colleges = await CollegeModel.find({}, { name: 1, landingUrl: 1 }).lean();

  const domainMap = new Map<string, string>();
  for (const c of colleges) {
    if (c.landingUrl) {
      try {
        const hostname = new URL(
          c.landingUrl.startsWith('http') ? c.landingUrl : `https://${c.landingUrl}`
        ).hostname.replace(/^www\./, '');
        domainMap.set(hostname, c.name ?? hostname);
      } catch {
        // Skip malformed URLs
      }
    }
  }

  collegeDomainCache = domainMap;
  return domainMap;
}

/**
 * Check if an email address belongs to a known college domain.
 */
async function isCollegeEmail(
  email: string
): Promise<{ isCollege: boolean; collegeName?: string }> {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return { isCollege: false };

  const domainMap = await getCollegeDomainMap();

  // Direct match
  if (domainMap.has(domain)) {
    return { isCollege: true, collegeName: domainMap.get(domain) };
  }

  // Check parent domain (e.g., athletics.university.edu → university.edu)
  const parts = domain.split('.');
  if (parts.length > 2) {
    const parentDomain = parts.slice(-2).join('.');
    if (domainMap.has(parentDomain)) {
      return { isCollege: true, collegeName: domainMap.get(parentDomain) };
    }
  }

  // Check .edu domains as likely college-affiliated
  if (domain.endsWith('.edu')) {
    return { isCollege: true, collegeName: undefined };
  }

  return { isCollege: false };
}

// ─── Sync Engine ────────────────────────────────────────────────────────────

/**
 * Sync emails from a single provider for a given user.
 * Upserts conversations and messages into MongoDB.
 */
export async function syncUserEmails(
  userId: string,
  provider: EmailProvider,
  db: Firestore = defaultDb
): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, skipped: 0, errors: 0 };

  // 1. Get tokens
  const tokens = await getProviderOAuthTokens(userId, provider, db);
  if (!tokens) {
    logger.warn(`[EmailSync] No ${provider} tokens for user ${userId}`);
    return result;
  }

  // 2. Get valid access token (refresh if needed)
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(userId, tokens, db);
  } catch (err) {
    logger.error(`[EmailSync] Token refresh failed for ${provider}`, {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return result;
  }

  // 3. Fetch emails
  let emails: NormalizedEmail[];
  try {
    emails =
      provider === 'gmail'
        ? await fetchGmailMessages(accessToken)
        : await fetchMicrosoftMessages(accessToken);
  } catch (err) {
    logger.error(`[EmailSync] Fetch failed for ${provider}`, {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return result;
  }

  logger.info(`[EmailSync] Fetched ${emails.length} emails from ${provider} for user ${userId}`);

  // 4. Get user's own email for isOwn detection
  const userEmail = tokens.email?.toLowerCase() ?? '';

  // 5. Group emails by thread
  const threadMap = new Map<string, NormalizedEmail[]>();
  for (const email of emails) {
    const threadId = email.externalThreadId;
    if (!threadMap.has(threadId)) {
      threadMap.set(threadId, []);
    }
    threadMap.get(threadId)!.push(email);
  }

  // 6. Upsert conversations and messages
  for (const [threadId, threadEmails] of threadMap) {
    try {
      // Sort chronologically
      threadEmails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const latestEmail = threadEmails[threadEmails.length - 1];
      const isOwnLatest = latestEmail.from.email.toLowerCase() === userEmail;

      // Determine the "other" party (for title / avatar)
      const otherParty = threadEmails.find((e) => e.from.email.toLowerCase() !== userEmail);
      const otherName = otherParty?.from.name || otherParty?.from.email || 'Unknown';
      const otherEmail = otherParty?.from.email ?? '';

      // Check college affiliation
      const collegeCheck = await isCollegeEmail(otherEmail);
      const conversationType = collegeCheck.isCollege ? 'coach' : 'direct';

      // Upsert conversation

      const conversationData: Partial<IConversation> = {
        type: conversationType,
        title: collegeCheck.collegeName ? `${otherName} (${collegeCheck.collegeName})` : otherName,
        participants: [
          {
            userId,
            name: 'You',
            role: 'athlete',
            email: userEmail,
          },
          {
            userId: `ext-${otherEmail}`,
            name: otherName,
            role: collegeCheck.isCollege ? 'coach' : 'athlete',
            isVerified: collegeCheck.isCollege,
            email: otherEmail,
          },
        ],
        lastMessage: {
          body:
            latestEmail.bodyText.length > 200
              ? latestEmail.bodyText.substring(0, 200) + '…'
              : latestEmail.bodyText,
          senderName: isOwnLatest ? 'You' : otherName,
          timestamp: latestEmail.date,
          isOwn: isOwnLatest,
        },
        hasVerifiedParticipant: collegeCheck.isCollege,
        emailProvider: provider,
        externalThreadId: threadId,
        emailSubject: latestEmail.subject,
        updatedAt: latestEmail.date,
      };

      const conversation = await ConversationModel.findOneAndUpdate(
        { emailProvider: provider, externalThreadId: threadId },
        {
          $set: conversationData,
          $setOnInsert: { createdAt: threadEmails[0].date },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Upsert messages — track newly synced inbound messages for unread count
      let newInboundCount = 0;

      for (const email of threadEmails) {
        const isOwn = email.from.email.toLowerCase() === userEmail;

        const existing = await MessageModel.findOne({
          externalMessageId: email.externalMessageId,
        });

        if (existing) {
          result.skipped++;
          continue;
        }

        await MessageModel.create({
          conversationId: conversation._id!.toString(),
          sender: {
            userId: isOwn ? userId : `ext-${email.from.email}`,
            name: isOwn ? 'You' : email.from.name || email.from.email,
            role: isOwn ? 'athlete' : collegeCheck.isCollege ? 'coach' : 'athlete',
            isVerified: !isOwn && collegeCheck.isCollege,
            email: email.from.email,
          },
          body: email.bodyText,
          status: 'delivered',
          emailProvider: provider,
          externalMessageId: email.externalMessageId,
          emailHeaders: email.headers,
          createdAt: email.date,
        });

        result.synced++;
        if (!isOwn) newInboundCount++;
      }

      // Increment unread count only for newly synced inbound messages
      if (newInboundCount > 0) {
        await ConversationModel.updateOne(
          { _id: conversation._id },
          { $inc: { [`unreadCounts.${userId}`]: newInboundCount } }
        );
      }
    } catch (err) {
      result.errors++;
      logger.error(`[EmailSync] Thread upsert failed`, {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Clear college domain cache after sync
  collegeDomainCache = null;

  logger.info(`[EmailSync] Sync complete for ${provider}`, {
    userId,
    ...result,
  });

  return result;
}

/**
 * Sync all connected email providers for a user.
 */
export async function syncAllUserEmails(
  userId: string,
  db: Firestore = defaultDb
): Promise<Record<string, SyncResult>> {
  const results: Record<string, SyncResult> = {};

  // Check which providers are connected
  const userDoc = await db.collection('Users').doc(userId).get();
  const userData = userDoc.data();
  const connectedEmails: Array<{ provider: string; isActive: boolean }> =
    userData?.['connectedEmails'] ?? [];

  for (const ce of connectedEmails) {
    if (!ce.isActive) continue;
    if (ce.provider !== 'gmail' && ce.provider !== 'microsoft') continue;

    results[ce.provider] = await syncUserEmails(userId, ce.provider as EmailProvider, db);
  }

  return results;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeEmailHtml(body: string): string {
  if (/<[a-z][\s\S]*>/i.test(body)) {
    return body;
  }

  return `<div>${escapeHtml(body).replace(/\n/g, '<br/>')}</div>`;
}

function buildTrackingBaseUrl(): string {
  const rawBaseUrl = process.env['BACKEND_URL'] || 'http://localhost:3000';
  return rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
}

function buildTrackedEmailHtml(
  body: string,
  options: { userId: string; to: string; trackingId: string }
): string {
  const html = normalizeEmailHtml(body);
  const baseUrl = buildTrackingBaseUrl();

  const buildClickUrl = (destination: string): string => {
    try {
      const parsed = new URL(destination);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return destination;
      }

      const clickUrl = new URL(`${baseUrl}/api/v1/analytics/track/click`);
      clickUrl.searchParams.set('destination', parsed.toString());
      clickUrl.searchParams.set('subjectId', options.userId);
      clickUrl.searchParams.set('subjectType', 'user');
      clickUrl.searchParams.set('surface', 'email');
      clickUrl.searchParams.set('sourceRecordId', options.trackingId);
      clickUrl.searchParams.set('recipientEmail', options.to);
      return clickUrl.toString();
    } catch {
      return destination;
    }
  };

  let rewrittenHtml = html.replace(
    /href=(['"])(https?:\/\/[^'"\s>]+)\1/gi,
    (_match, quote: string, href: string) => `href=${quote}${buildClickUrl(href)}${quote}`
  );

  rewrittenHtml = rewrittenHtml.replace(/(?<!["'=])(https?:\/\/[^\s<]+)/gi, (href: string) =>
    buildClickUrl(href)
  );

  const openUrl = new URL(`${baseUrl}/api/v1/analytics/track/open`);
  openUrl.searchParams.set('subjectId', options.userId);
  openUrl.searchParams.set('subjectType', 'user');
  openUrl.searchParams.set('surface', 'email');
  openUrl.searchParams.set('sourceRecordId', options.trackingId);
  openUrl.searchParams.set('recipientEmail', options.to);

  return `${rewrittenHtml}<img src="${openUrl.toString()}" alt="" width="1" height="1" style="display:none;max-width:1px;max-height:1px;" />`;
}

// ─── Send Email ─────────────────────────────────────────────────────────────

/**
 * Send an email through a user's connected provider.
 */
export async function sendEmailViaProvider(
  userId: string,
  provider: EmailProvider,
  to: string,
  subject: string,
  body: string,
  db: Firestore = defaultDb
): Promise<{
  success: boolean;
  externalMessageId?: string;
  externalThreadId?: string;
  trackingId: string;
}> {
  const tokens = await getProviderOAuthTokens(userId, provider, db);
  if (!tokens) {
    throw new Error(`No ${provider} tokens for user ${userId}`);
  }

  const accessToken = await getValidAccessToken(userId, tokens, db);
  const trackingId = randomUUID();
  const trackedBody = buildTrackedEmailHtml(body, { userId, to, trackingId });

  if (provider === 'gmail') {
    const result = await sendGmailMessage(accessToken, to, subject, trackedBody);
    return { ...result, trackingId };
  }

  const result = await sendMicrosoftMessage(accessToken, to, subject, trackedBody);
  return { ...result, trackingId };
}

/**
 * Send email via Gmail API.
 */
async function sendGmailMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; externalMessageId?: string; externalThreadId?: string }> {
  // Construct RFC 2822 message
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ];
  const rawMessage = Buffer.from(messageParts.join('\r\n')).toString('base64url');

  const res = await axios.post(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    { raw: rawMessage },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  return {
    success: true,
    externalMessageId: res.data.id,
    externalThreadId: typeof res.data.threadId === 'string' ? res.data.threadId : undefined,
  };
}

/**
 * Send email via Microsoft Graph API.
 */
async function sendMicrosoftMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; externalMessageId?: string; externalThreadId?: string }> {
  const res = await axios.post(
    'https://graph.microsoft.com/v1.0/me/sendMail',
    {
      message: {
        subject,
        body: { contentType: 'HTML', content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  // Microsoft sendMail returns 202 with no body on success
  return { success: res.status === 202 || res.status === 200, externalMessageId: undefined };
}
