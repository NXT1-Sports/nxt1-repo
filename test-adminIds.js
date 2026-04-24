import admin from 'firebase-admin';
import path from 'path';
admin.initializeApp({
  credential: admin.credential.cert(
    path.resolve('../nxt1-backend/assets/nxt-1-staging-v2-firebase-adminsdk-fbsvc-0e09aefb3e.json')
  ),
});
const db = admin.firestore();
const orgDoc = await db.collection('Organizations').doc('ipVyl7FUUoLnwjavsRl2').get();
console.log('Fields:', Object.keys(orgDoc.data()));
process.exit(0);
