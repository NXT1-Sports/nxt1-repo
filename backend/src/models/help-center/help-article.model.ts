/**
 * @fileoverview Help Article Mongoose Model
 * @module @nxt1/backend/models/help-center
 *
 * Mongoose schema for help center articles.
 * Maps to HelpArticle type from @nxt1/core.
 */

import { model, Schema, type Model } from 'mongoose';
import type { HelpArticle, HelpContentType } from '@nxt1/core';

/**
 * Stored article document (writable version of HelpArticle + isPublished flag)
 */
export interface HelpArticleDocument extends Omit<HelpArticle, 'id'> {
  readonly isPublished: boolean;
}

const ArticleTableOfContentsSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    level: { type: Number, enum: [1, 2, 3], required: true },
  },
  { _id: false, versionKey: false }
);

const RelatedContentSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['article', 'video', 'faq', 'guide', 'tutorial'], required: true },
    thumbnailUrl: { type: String },
    category: { type: String, required: true },
  },
  { _id: false, versionKey: false }
);

const SeoSchema = new Schema(
  {
    metaTitle: { type: String },
    metaDescription: { type: String },
    keywords: { type: [String] },
  },
  { _id: false, versionKey: false }
);

const HelpArticleSchema = new Schema<HelpArticleDocument>(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    excerpt: { type: String, required: true },
    content: { type: String, required: true },
    type: {
      type: String,
      enum: ['article', 'video', 'faq', 'guide', 'tutorial'] satisfies HelpContentType[],
      required: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    tags: { type: [String], default: [] },
    targetUsers: {
      type: [String],
      default: ['all'],
      index: true,
    },
    heroImageUrl: { type: String },
    thumbnailUrl: { type: String },
    videoUrl: { type: String },
    videoDuration: { type: Number },
    readingTimeMinutes: { type: Number, required: true, default: 5 },
    tableOfContents: { type: [ArticleTableOfContentsSchema], default: [] },
    relatedContent: { type: [RelatedContentSchema], default: [] },
    publishedAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    viewCount: { type: Number, default: 0 },
    helpfulCount: { type: Number, default: 0 },
    notHelpfulCount: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    isNew: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true, index: true },
    seo: { type: SeoSchema },
  },
  { versionKey: false, timestamps: false }
);

// Text index for full-text search
HelpArticleSchema.index(
  { title: 'text', excerpt: 'text', tags: 'text', content: 'text' },
  {
    weights: { title: 10, tags: 5, excerpt: 3, content: 1 },
    name: 'help_article_text_search',
  }
);

// Compound index for category listing
HelpArticleSchema.index({ category: 1, isPublished: 1, publishedAt: -1 });

export const HelpArticleModel: Model<HelpArticleDocument> = model<HelpArticleDocument>(
  'HelpArticle',
  HelpArticleSchema
);
