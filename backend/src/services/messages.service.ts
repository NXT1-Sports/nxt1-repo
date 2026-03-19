/**
 * @fileoverview Messages Service
 * @module @nxt1/backend/services/messages
 *
 * Business logic for the Messages/Conversations feature.
 * CRUD operations, filtering, search, and email-provider bridging.
 *
 * All methods accept a `userId` (Firebase UID) that was extracted
 * by the auth middleware and validated upstream.
 */

import { ConversationModel, type IConversation } from '../models/conversation.model.js';
import { MessageModel, type IMessage } from '../models/message.model.js';
import { logger } from '../utils/logger.js';
import { sendEmailViaProvider } from './email-sync.service.js';
import type {
  Conversation,
  Message,
  ConversationParticipant,
  ConversationsResponse,
  MessagesThreadResponse,
  MessagesFilterId,
  MessagesPagination,
} from '@nxt1/core';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map a Mongoose conversation document to the core Conversation type.
 */
function mapConversation(doc: IConversation & { _id: unknown }, userId: string): Conversation {
  const id = String(doc._id);

  const participants: ConversationParticipant[] = doc.participants.map((p) => ({
    id: p.userId,
    name: p.userId === userId ? 'You' : p.name,
    avatarUrl: p.avatarUrl,
    role: p.role as ConversationParticipant['role'],
    isVerified: p.isVerified,
  }));

  const unreadCount = doc.unreadCounts?.get(userId) ?? 0;

  return {
    id,
    type: doc.type,
    title: doc.title,
    avatarUrl: doc.avatarUrl,
    participants,
    lastMessage: doc.lastMessage ?? undefined,
    unreadCount,
    isMuted: doc.mutedBy?.includes(userId),
    isPinned: doc.pinnedBy?.includes(userId),
    hasVerifiedParticipant: doc.hasVerifiedParticipant,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Map a Mongoose message document to the core Message type.
 */
function mapMessage(doc: IMessage & { _id: unknown }, userId: string): Message {
  return {
    id: String(doc._id),
    conversationId: doc.conversationId,
    sender: {
      id: doc.sender.userId,
      name: doc.sender.userId === userId ? 'You' : doc.sender.name,
      avatarUrl: doc.sender.avatarUrl,
      role: doc.sender.role as ConversationParticipant['role'],
      isVerified: doc.sender.isVerified,
    },
    body: doc.body,
    timestamp: doc.createdAt,
    status: doc.status,
    isOwn: doc.sender.userId === userId,
    attachments: doc.attachments?.map((a, index) => ({
      id: `${String(doc._id)}-att-${index}`,
      type: a.type,
      name: a.name,
      url: a.url,
      thumbnailUrl: a.thumbnailUrl,
      size: a.size,
      mimeType: a.mimeType,
    })),
    replyTo: doc.replyTo
      ? {
          id: doc.replyTo.messageId,
          senderName: doc.replyTo.senderName,
          preview: doc.replyTo.preview,
        }
      : undefined,
  };
}

function buildPagination(page: number, limit: number, total: number): MessagesPagination {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get paginated conversation list with filtering and search.
 */
export async function getConversations(
  userId: string,
  filter: MessagesFilterId = 'all',
  page = 1,
  limit = 20,
  searchQuery?: string
): Promise<ConversationsResponse> {
  // Base filter: user is a participant
  const query: Record<string, unknown> = {
    'participants.userId': userId,
  };

  // Apply filter
  if (filter === 'unread') {
    query[`unreadCounts.${userId}`] = { $gt: 0 };
  }

  // Apply search
  if (searchQuery && searchQuery.trim().length > 0) {
    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query['$or'] = [
      { title: { $regex: escapedQuery, $options: 'i' } },
      { 'lastMessage.body': { $regex: escapedQuery, $options: 'i' } },
      { emailSubject: { $regex: escapedQuery, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    ConversationModel.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    ConversationModel.countDocuments(query),
  ]);

  const conversations = (docs as Array<IConversation & { _id: unknown }>).map((d) =>
    mapConversation(d, userId)
  );

  return {
    success: true,
    conversations,
    pagination: buildPagination(page, limit, total),
  };
}

/**
 * Get a single conversation thread with messages.
 */
export async function getThread(
  userId: string,
  conversationId: string,
  page = 1,
  limit = 30
): Promise<MessagesThreadResponse> {
  const doc = await ConversationModel.findOne({
    _id: conversationId,
    'participants.userId': userId,
  }).lean();

  if (!doc) {
    return {
      success: false,
      conversation: {
        id: conversationId,
        type: 'direct',
        title: '',
        participants: [],
        unreadCount: 0,
        createdAt: '',
        updatedAt: '',
      },
      messages: [],
      pagination: buildPagination(1, limit, 0),
      error: 'Conversation not found',
    };
  }

  const skip = (page - 1) * limit;

  const [messageDocs, total] = await Promise.all([
    MessageModel.find({ conversationId }).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
    MessageModel.countDocuments({ conversationId }),
  ]);

  const conversation = mapConversation(doc as IConversation & { _id: unknown }, userId);
  const messages = (messageDocs as Array<IMessage & { _id: unknown }>).map((m) =>
    mapMessage(m, userId)
  );

  return {
    success: true,
    conversation,
    messages,
    pagination: buildPagination(page, limit, total),
  };
}

/**
 * Send a message to a conversation.
 * If the conversation originated from email, also dispatches via the email provider.
 */
export async function sendMessage(
  userId: string,
  conversationId: string,
  body: string,
  replyToId?: string
): Promise<Message> {
  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    'participants.userId': userId,
  });

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  // Build reply context
  let replyTo: IMessage['replyTo'];
  if (replyToId) {
    const replyMsg = await MessageModel.findById(replyToId).lean();
    if (replyMsg) {
      replyTo = {
        messageId: String((replyMsg as IMessage & { _id: unknown })._id),
        senderName: replyMsg.sender.name,
        preview: replyMsg.body.length > 100 ? replyMsg.body.substring(0, 100) + '…' : replyMsg.body,
      };
    }
  }

  const now = new Date().toISOString();

  // Look up user display name from participants
  const userParticipant = conversation.participants.find((p) => p.userId === userId);
  const senderName = userParticipant?.name ?? 'You';

  // Create message in MongoDB
  const messageDoc = await MessageModel.create({
    conversationId,
    sender: {
      userId,
      name: senderName,
      role: userParticipant?.role ?? 'athlete',
      email: userParticipant?.email,
    },
    body,
    status: 'sent',
    replyTo,
    createdAt: now,
  });

  // Update conversation's last message and timestamp
  const lastMessagePreview = {
    body: body.length > 200 ? body.substring(0, 200) + '…' : body,
    senderName: 'You',
    timestamp: now,
    isOwn: true,
  };

  await ConversationModel.updateOne(
    { _id: conversationId },
    {
      $set: {
        lastMessage: lastMessagePreview,
        updatedAt: now,
      },
    }
  );

  // If email-sourced conversation, dispatch email
  if (conversation.emailProvider) {
    const recipient = conversation.participants.find((p) => p.userId !== userId);
    const recipientEmail = recipient?.email;

    if (recipientEmail) {
      try {
        const result = await sendEmailViaProvider(
          userId,
          conversation.emailProvider as 'gmail' | 'microsoft',
          recipientEmail,
          conversation.emailSubject ?? conversation.title,
          body
        );

        if (result.externalMessageId) {
          await MessageModel.updateOne(
            { _id: messageDoc._id },
            {
              $set: {
                emailProvider: conversation.emailProvider,
                externalMessageId: result.externalMessageId,
                status: 'delivered',
              },
            }
          );
        }

        logger.info('[Messages] Email sent via provider', {
          provider: conversation.emailProvider,
          userId,
          conversationId,
        });
      } catch (err) {
        logger.error('[Messages] Failed to send via email provider', {
          provider: conversation.emailProvider,
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
        // Message still saved in MongoDB — mark as sent (platform-only)
      }
    }
  }

  return mapMessage(messageDoc.toObject() as IMessage & { _id: unknown }, userId);
}

/**
 * Create a new conversation.
 */
export async function createConversation(
  userId: string,
  type: IConversation['type'],
  participantIds: string[],
  title?: string,
  initialMessage?: string
): Promise<Conversation> {
  const now = new Date().toISOString();

  // Build participant list
  const participants = [
    { userId, name: 'You', role: 'athlete' as const },
    ...participantIds.map((id) => ({
      userId: id,
      name: id, // Resolved by frontend or user service
      role: 'athlete' as const,
    })),
  ];

  const conversationDoc = await ConversationModel.create({
    type,
    title: title ?? participants.map((p) => p.name).join(', '),
    participants,
    createdAt: now,
    updatedAt: now,
  });

  // If there's an initial message, create it
  if (initialMessage) {
    const messageDoc = await MessageModel.create({
      conversationId: conversationDoc._id!.toString(),
      sender: { userId, name: 'You', role: 'athlete' },
      body: initialMessage,
      status: 'sent',
      createdAt: now,
    });

    await ConversationModel.updateOne(
      { _id: conversationDoc._id },
      {
        $set: {
          lastMessage: {
            body:
              initialMessage.length > 200 ? initialMessage.substring(0, 200) + '…' : initialMessage,
            senderName: 'You',
            timestamp: now,
            isOwn: true,
          },
          updatedAt: now,
        },
      }
    );

    logger.info('[Messages] Initial message created', {
      messageId: messageDoc._id?.toString(),
    });
  }

  return mapConversation(conversationDoc.toObject() as IConversation & { _id: unknown }, userId);
}

/**
 * Mark a conversation as read for a user.
 */
export async function markAsRead(userId: string, conversationId: string): Promise<void> {
  await ConversationModel.updateOne(
    { _id: conversationId, 'participants.userId': userId },
    { $set: { [`unreadCounts.${userId}`]: 0 } }
  );
}

/**
 * Toggle mute on a conversation for a user.
 */
export async function toggleMute(
  userId: string,
  conversationId: string,
  muted: boolean
): Promise<void> {
  const op = muted ? { $addToSet: { mutedBy: userId } } : { $pull: { mutedBy: userId } };

  await ConversationModel.updateOne({ _id: conversationId, 'participants.userId': userId }, op);
}

/**
 * Toggle pin on a conversation for a user.
 */
export async function togglePin(
  userId: string,
  conversationId: string,
  pinned: boolean
): Promise<void> {
  const op = pinned ? { $addToSet: { pinnedBy: userId } } : { $pull: { pinnedBy: userId } };

  await ConversationModel.updateOne({ _id: conversationId, 'participants.userId': userId }, op);
}

/**
 * Delete a conversation for a user.
 * Soft-delete: removes user from participants. If no participants remain, hard-delete.
 */
export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    'participants.userId': userId,
  });

  if (!conversation) return;

  // Remove user from participants
  await ConversationModel.updateOne(
    { _id: conversationId },
    { $pull: { participants: { userId } } }
  );

  // Check if any participants remain
  const updated = await ConversationModel.findById(conversationId);
  if (!updated || updated.participants.length === 0) {
    // Hard-delete conversation and all its messages
    await Promise.all([
      ConversationModel.deleteOne({ _id: conversationId }),
      MessageModel.deleteMany({ conversationId }),
    ]);
    logger.info('[Messages] Conversation hard-deleted (no participants)', {
      conversationId,
    });
  }
}

/**
 * Get total unread count for a user across all conversations.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const docs = await ConversationModel.find(
    { 'participants.userId': userId },
    { unreadCounts: 1 }
  ).lean();

  let total = 0;
  for (const doc of docs) {
    const counts = doc.unreadCounts;
    if (counts instanceof Map) {
      total += counts.get(userId) ?? 0;
    } else if (counts && typeof counts === 'object') {
      total += (counts as Record<string, number>)[userId] ?? 0;
    }
  }

  return total;
}
