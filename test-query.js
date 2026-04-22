import admin from 'firebase-admin';
import path from 'path';
admin.initializeApp({
  credential: admin.credential.cert(
    path.resolve('../nxt1-backend/assets/nxt-1-staging-v2-firebase-adminsdk-fbsvc-0e09aefb3e.json')
  ),
});
const db = admin.firestore();
const snaps = await db
  .collection('Organizations')
  .where('admins', 'array-contains', { userId: 'EF5WvWYTSLh4nwj8QUrikBm1kXH2' })
  .get();
console.log('Results with map array-contains:', snaps.size);

const snaps2 = await db
  .collection('Organizations')
  .where('ownerId', '==', 'EF5WvWYTSLh4nwj8QUrikBm1kXH2')
  .get();
console.log('Results with ownerId:', snaps2.size);

const snaps3 = await db
  .collection('Organizations')
  .where('billingOwnerUid', '==', 'EF5WvWYTSLh4nwj8QUrikBm1kXH2')
  .get();
console.log('Results with billingOwnerUid:', snaps3.size);

process.exit(0);
