/**
 * @fileoverview Support Ticket Mongoose Model
 * @module @nxt1/backend/models/help-center
 *
 * Stores support ticket submissions coming from Help Center and Agent X tools.
 */

import { Schema, type Model, type Connection } from 'mongoose';
import type { SupportTicket, TicketCategory, TicketPriority, TicketStatus } from '@nxt1/core';
import { getMongoGlobalConnection } from '../../config/database.config.js';

export interface SupportTicketDocument extends Omit<SupportTicket, 'id'> {
  readonly userId?: string;
  readonly relatedArticleId?: string;
  readonly deviceInfo?: string;
}

const SUPPORT_TICKET_MODEL_NAME = 'SupportTicket';

const SupportTicketSchema = new Schema<SupportTicketDocument>(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['open', 'in-progress', 'pending', 'resolved', 'closed'] satisfies TicketStatus[],
      default: 'open',
      required: true,
      index: true,
    },
    email: { type: String, required: true, index: true },
    name: { type: String, required: true },
    subject: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: [
        'account',
        'billing',
        'technical',
        'feature-request',
        'bug-report',
        'other',
      ] satisfies TicketCategory[],
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'] satisfies TicketPriority[],
      default: 'medium',
      required: true,
      index: true,
    },
    description: { type: String, required: true },
    attachments: { type: [String], default: [] },
    estimatedResponseTime: { type: String },
    createdAt: { type: String, required: true, index: true },
    updatedAt: { type: String, required: true },
    userId: { type: String, index: true },
    relatedArticleId: { type: String, index: true },
    deviceInfo: { type: String },
  },
  { versionKey: false, timestamps: false }
);

SupportTicketSchema.index({ status: 1, priority: 1, createdAt: -1 });
SupportTicketSchema.index({ userId: 1, createdAt: -1 });

export function getSupportTicketModel(
  connection: Connection = getMongoGlobalConnection()
): Model<SupportTicketDocument> {
  const existingModel = connection.models[SUPPORT_TICKET_MODEL_NAME] as
    | Model<SupportTicketDocument>
    | undefined;
  if (existingModel) return existingModel;

  return connection.model<SupportTicketDocument>(SUPPORT_TICKET_MODEL_NAME, SupportTicketSchema);
}

export const SupportTicketModel = new Proxy({} as Model<SupportTicketDocument>, {
  get(_target, prop) {
    const model = getSupportTicketModel();
    const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? value.bind(model) : value;
  },
  has(_target, prop) {
    const model = getSupportTicketModel();
    return prop in model;
  },
  getOwnPropertyDescriptor(_target, prop) {
    const model = getSupportTicketModel() as unknown as Record<PropertyKey, unknown>;
    const value = model[prop];
    if (value === undefined) return undefined;
    return { configurable: true, enumerable: true, writable: true, value };
  },
});
