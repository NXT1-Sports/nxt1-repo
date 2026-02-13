/**
 * @fileoverview College Mongoose Model
 * @module @nxt1/backend/models/college
 *
 * Mongoose schema and model for College collection
 */

import { model, Schema, Model, Types } from 'mongoose';
import type { College, CollegeSportInfo } from '@nxt1/shared-types/college';

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
    acceptanceRate: { type: String },
    averageGPA: { type: String },
    city: { type: String },
    compositeACT: { type: String },
    contacts: { type: [Types.ObjectId], ref: 'Contact' },
    sportInfo: { type: Map, of: SportInfoSchema },
    female: { type: String },
    male: { type: String },
    hbcu: { type: Boolean },
    landingUrl: { type: String },
    majorsOffered: { type: String },
    mathSAT: { type: String },
    public: { type: Boolean },
    readingSAT: { type: String },
    religious_affiliation: { type: String },
    sport: { type: [String] },
    state: { type: String },
    totalCost: { type: String },
    undergradsNo: { type: String },
    women_only: { type: Boolean },
    сommunity_сollege: { type: Boolean },
    logoUrl: { type: String },
  },
  { versionKey: false }
);

// Create and export model
export const CollegeModel: Model<College> = model<College>('College', CollegeSchema);
