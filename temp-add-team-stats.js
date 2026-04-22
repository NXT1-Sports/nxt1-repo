const admin = require('firebase-admin');
const serviceAccount = require('../nxt1-backend/assets/nxt-1-admin-firebase-adminsdk-9m8cg-3cd10211f8.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function run() {
  const db = admin.firestore();
  console.log('Searching for Hoover Bucs...');
  const teamsSnapshot = await db
    .collection('Teams')
    .where('name', '==', 'Hoover Bucs')
    .limit(1)
    .get();

  if (teamsSnapshot.empty) {
    console.log('Team Hoover Bucs not found exactly.');
    // Try a text search if needed, but let's see.
    const all = await db.collection('Teams').get();
    for (let d of all.docs) {
      if (d.data().name && d.data().name.includes('Hoover')) {
        console.log('Found:', d.id, d.data().name);
      }
    }
    process.exit(1);
  }

  const teamDoc = teamsSnapshot.docs[0];
  const teamId = teamDoc.id;
  console.log(`Found Hoover Bucs with ID: ${teamId}, name: ${teamDoc.data().name}`);

  const statRef = db.collection('TeamStats').doc();

  await statRef.set({
    teamId: teamId,
    season: '2026',
    sport: 'Basketball', // or whatever is in teamDoc
    stats: [
      {
        name: 'Total Points',
        value: 1200,
        type: 'points',
      },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Successfully added TeamStats with 1200 points for teamId ${teamId}.`);
  process.exit(0);
}

run().catch(console.error);
