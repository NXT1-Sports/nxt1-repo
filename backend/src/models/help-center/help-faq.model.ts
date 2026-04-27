/**
 * @fileoverview Help FAQ Mongoose Model
 * @module @nxt1/backend/models/help-center
 *
 * Mongoose schema for help center FAQs.
 * Maps to FaqItem type from @nxt1/core.
 */

import { Schema, type Model, type Connection } from 'mongoose';
import type { FaqItem } from '@nxt1/core';
import { getMongoGlobalConnection } from '../../config/database.config.js';

/**
 * Stored FAQ document (writable version of FaqItem + isPublished flag)
 */
export interface HelpFaqDocument extends Omit<FaqItem, 'id'> {
  readonly isPublished: boolean;
  readonly lastAgentRefresh?: Date | null;
}

const HELP_FAQ_MODEL_NAME = 'HelpFaq';

const HelpFaqSchema = new Schema<HelpFaqDocument>(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    category: { type: String, required: true, index: true },
    targetUsers: { type: [String], default: ['all'], index: true },
    order: { type: Number, required: true, default: 0 },
    helpfulCount: { type: Number, default: 0 },
    relatedArticles: { type: [String], default: [] },
    isPublished: { type: Boolean, default: true, index: true },
    lastAgentRefresh: { type: Date, default: null, index: true },
  },
  { versionKey: false, timestamps: false }
);

// Text index for search
HelpFaqSchema.index(
  { question: 'text', answer: 'text' },
  { weights: { question: 5, answer: 1 }, name: 'help_faq_text_search' }
);

// Compound index for category + sort
HelpFaqSchema.index({ category: 1, order: 1 });

export function getHelpFaqModel(
  connection: Connection = getMongoGlobalConnection()
): Model<HelpFaqDocument> {
  const existingModel = connection.models[HELP_FAQ_MODEL_NAME] as
    | Model<HelpFaqDocument>
    | undefined;
  if (existingModel) return existingModel;

  return connection.model<HelpFaqDocument>(HELP_FAQ_MODEL_NAME, HelpFaqSchema);
}

export const HelpFaqModel = new Proxy({} as Model<HelpFaqDocument>, {
  get(_target, prop) {
    const model = getHelpFaqModel();
    const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? value.bind(model) : value;
  },
  has(_target, prop) {
    const model = getHelpFaqModel();
    return prop in model;
  },
  getOwnPropertyDescriptor(_target, prop) {
    const model = getHelpFaqModel() as unknown as Record<PropertyKey, unknown>;
    const value = model[prop];
    if (value === undefined) return undefined;
    return { configurable: true, enumerable: true, writable: true, value };
  },
});
