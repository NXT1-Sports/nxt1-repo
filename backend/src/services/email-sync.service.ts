/**
 * @fileoverview Email Sync Service
 * @module @nxt1/backend/services/email-sync
 *
 * Fetches emails from connected Gmail / Microsoft inboxes using their
 * REST APIs, maps them to NXT1 Conversation + Message documents, and
 * upserts into MongoDB.  Outbound messages sent from the platform are
 * dispatched through the same provider tokens.
 *
 * Token storage:
 *   Firestore → Users/{uid}/emailTokens/{provider}
 *   (server-only subcollection — Firestore rules block client reads)
 *
 * College coach matching:
 *   Compares the sender's email domain against the colleges collection
 *   in MongoDB to flag conversations with verified college contacts.
 */

import axios from 'axios';
import { db } from '../utils/firebase.js';
import { logger } from '../utils/logger.js';
import { ConversationModel, type IConversation } from '../models/conversation.model.js';
import { MessageModel } from '../models/message.model.js';
import { CollegeModel } from '../models/college.model.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type EmailProvider = 'gmail' | 'microsoft';

interface EmailTokens {
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
 * Retrieve OAuth tokens from Firestore server-only subcollection.
 */
async function getEmailTokens(
  userId: string,
  provider: EmailProvider
): Promise<EmailTokens | null> {
  const tokenRef = db.collection('Users').doc(userId).collection('emailTokens').doc(provider);
  const snap = await tokenRef.get();

  if (!snap.exists) return null;

  const data = snap.data() as EmailTokens;
  return { ...data, provider };
}

/**
 * Refresh a Gmail access token using the refresh token.
 */
async function refreshGmailToken(userId: string, refreshToken: string): Promise<string> {
  const clientId = process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];

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
  const tokenRef = db.collection('Users').doc(userId).collection('emailTokens').doc('gmail');
  await tokenRef.update({
    accessToken: newAccessToken,
    lastRefreshedAt: new Date().toISOString(),
  });

  return newAccessToken;
}

/**
 * Refresh a Microsoft access token using the refresh token.
 */
async function refreshMicrosoftToken(userId: string, refreshToken: string): Promise<string> {
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
  const tokenRef = db.collection('Users').doc(userId).collection('emailTokens').doc('microsoft');
  await tokenRef.update({
    accessToken: newAccessToken,
    lastRefreshedAt: new Date().toISOString(),
  });

  return newAccessToken;
}

/**
 * Get a valid access token, refreshing if necessary.
 */
async function getValidAccessToken(userId: string, tokens: EmailTokens): Promise<string> {
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
      return refreshGmailToken(userId, tokens.refreshToken);
    }
    return refreshMicrosoftToken(userId, tokens.refreshToken);
  }
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
      const fromHeader = headers['From'] ?? '';
      const fromMatch = fromHeader.match(/^(?:"?(.+?)"?\s+)?<?([^\s>]+)>?$/);
      const fromName = fromMatch?.[1] ?? fromHeader;
      const fromEmail = fromMatch?.[2] ?? fromHeader;

      // Parse To header
      const toHeader = headers['To'] ?? '';
      const toRecipients = toHeader.split(',').map((t) => {
        const m = t.trim().match(/^(?:"?(.+?)"?\s+)?<?([^\s>]+)>?$/);
        return { name: m?.[1] ?? t.trim(), email: m?.[2] ?? t.trim() };
      });

      results.push({
        externalMessageId: msg.id,
        externalThreadId: msg.threadId,
        from: { email: fromEmail, name: fromName },
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
export async function syncUserEmails(userId: string, provider: EmailProvider): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, skipped: 0, errors: 0 };

  // 1. Get tokens
  const tokens = await getEmailTokens(userId, provider);
  if (!tokens) {
    logger.warn(`[EmailSync] No ${provider} tokens for user ${userId}`);
    return result;
  }

  // 2. Get valid access token (refresh if needed)
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(userId, tokens);
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

      // Upsert messages
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
      }

      // Update unread count: count messages not sent by user
      const unreadMsgs = threadEmails.filter((e) => e.from.email.toLowerCase() !== userEmail);
      await ConversationModel.updateOne(
        { _id: conversation._id },
        { $set: { [`unreadCounts.${userId}`]: unreadMsgs.length } }
      );
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
export async function syncAllUserEmails(userId: string): Promise<Record<string, SyncResult>> {
  const results: Record<string, SyncResult> = {};

  // Check which providers are connected
  const userDoc = await db.collection('Users').doc(userId).get();
  const userData = userDoc.data();
  const connectedEmails: Array<{ provider: string; isActive: boolean }> =
    userData?.['connectedEmails'] ?? [];

  for (const ce of connectedEmails) {
    if (!ce.isActive) continue;
    if (ce.provider !== 'gmail' && ce.provider !== 'microsoft') continue;

    results[ce.provider] = await syncUserEmails(userId, ce.provider as EmailProvider);
  }

  return results;
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
  body: string
): Promise<{ success: boolean; externalMessageId?: string }> {
  const tokens = await getEmailTokens(userId, provider);
  if (!tokens) {
    throw new Error(`No ${provider} tokens for user ${userId}`);
  }

  const accessToken = await getValidAccessToken(userId, tokens);

  if (provider === 'gmail') {
    return sendGmailMessage(accessToken, to, subject, body);
  }
  return sendMicrosoftMessage(accessToken, to, subject, body);
}

/**
 * Send email via Gmail API.
 */
async function sendGmailMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; externalMessageId?: string }> {
  // Construct RFC 2822 message
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ];
  const rawMessage = Buffer.from(messageParts.join('\r\n')).toString('base64url');

  const res = await axios.post(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    { raw: rawMessage },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  return { success: true, externalMessageId: res.data.id };
}

/**
 * Send email via Microsoft Graph API.
 */
async function sendMicrosoftMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; externalMessageId?: string }> {
  const res = await axios.post(
    'https://graph.microsoft.com/v1.0/me/sendMail',
    {
      message: {
        subject,
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  // Microsoft sendMail returns 202 with no body on success
  return { success: res.status === 202 || res.status === 200, externalMessageId: undefined };
}
