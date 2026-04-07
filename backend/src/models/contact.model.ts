/**
 * @fileoverview Contact Mongoose Model
 * @module @nxt1/backend/models/contact
 *
 * Mongoose schema and model for the `contacts` collection.
 * Each Contact represents a college coaching staff member linked
 * to a College document via the `College.contacts` ObjectId array.
 */

import { model, Schema, type Model } from 'mongoose';
import type { CollegeContact } from '@nxt1/core/models';

const ContactSchema = new Schema<CollegeContact>(
  {
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String },
    phoneNumber: { type: String },
    position: { type: String },
    sport: { type: String },
    twitter: { type: String },
  },
  { versionKey: false }
);

export const ContactModel: Model<CollegeContact> = model<CollegeContact>('Contact', ContactSchema);
