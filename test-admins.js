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
  .where('ownerId', '==', 'usIHt0gagOfNyoV59SNSXox3wWB2')
  .limit(1)
  .get();
if (!snaps.empty) {
  console.log(snaps.docs[0].data().admins);
} else {
  console.log('No doc found for owner.');
}
process.exit(0);
