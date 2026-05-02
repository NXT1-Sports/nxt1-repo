/**
 * @fileoverview Contact Mongoose Model
 * @module @nxt1/backend/models/contact
 *
 * Mongoose schema and model for the `contacts` collection.
 * Each Contact represents a college coaching staff member linked
 * to a College document via the `College.contacts` ObjectId array.
 */

import { Schema, type Model, type Connection } from 'mongoose';
import type { CollegeContact } from '@nxt1/core/models';
import { getMongoGlobalConnection } from '../../config/database.config.js';

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

const CONTACT_MODEL_NAME = 'Contact';

export function getContactModel(
  connection: Connection = getMongoGlobalConnection()
): Model<CollegeContact> {
  const existingModel = connection.models[CONTACT_MODEL_NAME] as Model<CollegeContact> | undefined;
  if (existingModel) return existingModel;

  return connection.model<CollegeContact>(CONTACT_MODEL_NAME, ContactSchema);
}

export const ContactModel = new Proxy({} as Model<CollegeContact>, {
  get(_target, prop) {
    const model = getContactModel();
    const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? value.bind(model) : value;
  },
  has(_target, prop) {
    const model = getContactModel();
    return prop in model;
  },
  getOwnPropertyDescriptor(_target, prop) {
    const model = getContactModel() as unknown as Record<PropertyKey, unknown>;
    const value = model[prop];
    if (value === undefined) return undefined;
    return { configurable: true, enumerable: true, writable: true, value };
  },
});
