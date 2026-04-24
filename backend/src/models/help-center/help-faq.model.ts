/**
 * @fileoverview Help FAQ Mongoose Model
 * @module @nxt1/backend/models/help-center
 *
 * Mongoose schema for help center FAQs.
 * Maps to FaqItem type from @nxt1/core.
 */

import { model, Schema, type Model } from 'mongoose';
import type { FaqItem } from '@nxt1/core';

/**
 * Stored FAQ document (writable version of FaqItem + isPublished flag)
 */
export interface HelpFaqDocument extends Omit<FaqItem, 'id'> {
  readonly isPublished: boolean;
  readonly lastAgentRefresh?: Date | null;
}

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

export const HelpFaqModel: Model<HelpFaqDocument> = model<HelpFaqDocument>(
  'HelpFaq',
  HelpFaqSchema
);
