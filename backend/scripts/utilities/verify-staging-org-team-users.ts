import { initTargetApp } from '../migration/migration-utils.js';

const ORG_ID = 'org_TImtZtIIJRl2bQuxm0Hn';
const TEAM_ID = 'team_seed_timtztii_main';

async function main() {
  const { db } = initTargetApp();

  const [orgSnap, teamSnap, rosterSnap, usersSnap] = await Promise.all([
    db.collection('Organizations').doc(ORG_ID).get(),
    db.collection('Teams').doc(TEAM_ID).get(),
    db.collection('RosterEntries').where('teamId', '==', TEAM_ID).get(),
    db.collection('Users').where('teamId', '==', TEAM_ID).get(),
  ]);

  console.log('orgExists', orgSnap.exists);
  console.log('teamExists', teamSnap.exists);
  console.log('rosterCount', rosterSnap.size);
  console.log('userCount', usersSnap.size);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
