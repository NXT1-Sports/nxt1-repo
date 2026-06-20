import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import {
  FieldPath,
  FieldValue,
  getFirestore,
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { getMessaging, type Messaging, type MulticastMessage } from 'firebase-admin/messaging';
import { getStorage, type Storage } from 'firebase-admin/storage';

const app = getApps()[0] ?? initializeApp();
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const messaging = getMessaging(app);

export { app, auth, db, FieldPath, FieldValue, messaging, storage, Timestamp };
export type {
  App,
  Auth,
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore,
  Messaging,
  MulticastMessage,
  Query,
  QueryDocumentSnapshot,
  Storage,
};
