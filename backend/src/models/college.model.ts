/**
 * @fileoverview College Mongoose Model
 * @module @nxt1/backend/models/college
 *
 * Mongoose schema and model for College collection
 */

import { model, Schema, Model, Types } from 'mongoose';
import type { College, CollegeSportInfo } from '@nxt1/core/models';

// Sport Information sub-schema (used in sportInfo Map below)

const SportInfoSchema = new Schema<CollegeSportInfo>(
  {
    conference: { type: String },
    division: { type: String },
    questionnaire: { type: String },
    sportLandingUrl: { type: String },
    twitter: { type: String },
    conferenceId: { type: String },
    name: { type: String },
    camp: { type: String },
  },
  { _id: false, versionKey: false }
);

// Main College schema
const CollegeSchema = new Schema<College>(
  {
    name: { type: String },
    'IPEDS/NCES_ID': { type: String },
    acceptanceRate: { type: Number, min: 0, max: 100 }, // Fixed: was String, now Number with constraints (0-100%)
    averageGPA: { type: Number, min: 0, max: 4.0 }, // Fixed: was String, now Number with constraints (0.0-4.0)
    city: { type: String },
    compositeACT: { type: String },
    contacts: { type: [Types.ObjectId], ref: 'Contact' },
    sportInfo: { type: Map, of: SportInfoSchema },
    female: { type: String },
    male: { type: String },
    hbcu: { type: Boolean },
    landingUrl: { type: String },
    majorsOffered: { type: String },
    mathSAT: { type: Number, min: 200, max: 800 },
    readingSAT: { type: Number, min: 200, max: 800 },
    public: { type: Boolean },
    religious_affiliation: { type: String },
    sport: { type: [String] },
    state: { type: String, index: true },
    totalCost: { type: Number, min: 0 },
    undergradsNo: { type: String },
    women_only: { type: Boolean },
    community_college: { type: Boolean },
    logoUrl: { type: String },
  },
  { versionKey: false }
);

// ============================================
// INDEXES
// ============================================

// Compound indexes for common queries
CollegeSchema.index({ state: 1, acceptanceRate: 1 }); // Filter by state + acceptance rate
CollegeSchema.index({ sport: 1, state: 1 }); // Filter by sport + state
CollegeSchema.index({ name: 'text' }); // Full-text search on college name

// Create and export model
export const CollegeModel: Model<College> = model<College>('College', CollegeSchema);
