import { initLegacyApp, initTargetApp } from './migration-utils.js';

const { db } = initTargetApp();

const uids = [
  { email: 'john@nxt1sports.com', uid: 'p8OiVVIknKhgncxVahKeRs8HzD63' },
  { email: 'devtest@test.com', uid: 'i1GWzZbhfaTPeErWgVAcYHSkHFg2' },
];

for (const { email, uid } of uids) {
  const doc = await db.collection('Users').doc(uid).get();
  const d = doc.data() as Record<string, unknown>;
  console.log(`\n── ${email} ──`);
  console.log('  profileImgs:', d?.['profileImgs']);
  console.log('  bannerImg  :', d?.['bannerImg']);
  const sports = d?.['sports'] as Record<string, unknown>[] | undefined;
  if (sports?.[0]) {
    console.log('  sport[0].profileImg :', sports[0]['profileImg']);
    const team = sports[0]['team'] as Record<string, unknown> | undefined;
    console.log('  sport[0].team.logoUrl:', team?.['logoUrl']);
  }
}
process.exit(0);
