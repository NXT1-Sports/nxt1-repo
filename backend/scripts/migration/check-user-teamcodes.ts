#!/usr/bin/env npx tsx
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { initLegacyApp } from './migration-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { db: legacyDb } = initLegacyApp();
const mapping = JSON.parse(readFileSync(resolve(__dirname, 'user-uid-mapping.json'), 'utf8'));
const uids: string[] = mapping.results.map((r: { uid: string }) => r.uid);

for (const uid of uids) {
  const snap = await legacyDb.collection('Users').doc(uid).get();
  if (!snap.exists) {
    console.log(`${uid}: NOT FOUND`);
    continue;
  }
  const d = snap.data()!;
  const email = d['email'];
  const teamCode = d['teamCode'];
  const sportsTeams = Array.isArray(d['sports'])
    ? d['sports']
        .map(
          (s: Record<string, unknown>) =>
            (s?.['team'] as Record<string, unknown>)?.['teamCode'] || s['teamCode']
        )
        .filter(Boolean)
    : [];
  console.log(
    `${email}: teamCode=${JSON.stringify(teamCode)}, sportsTeamCodes=${JSON.stringify(sportsTeams)}`
  );
  // Also check memberOf / teams fields
  const memberOf = d['memberOf'];
  const teams = d['teams'];
  if (memberOf) console.log(`  memberOf=${JSON.stringify(memberOf)}`);
  if (teams) console.log(`  teams=${JSON.stringify(teams)}`);
  // Dump all keys
  console.log(`  keys: ${Object.keys(d).join(', ')}`);
  if (teamCode) {
    const tcSnap = await legacyDb.collection('TeamCodes').doc(String(teamCode)).get();
    if (tcSnap.exists) {
      const tc = tcSnap.data()!;
      console.log(
        `  -> TeamCode doc: ${tcSnap.id} | ${tc['teamName']} | ${tc['sportName']} | members=${Array.isArray(tc['members']) ? tc['members'].length : 0} | memberIds=${Array.isArray(tc['memberIds']) ? tc['memberIds'].length : 0}`
      );
    } else {
      console.log(
        `  -> TeamCode ${teamCode} NOT FOUND in Firestore (may be the code string, not doc ID?)`
      );
      // Try querying by teamCode field
      const q = await legacyDb
        .collection('TeamCodes')
        .where('teamCode', '==', teamCode)
        .limit(3)
        .get();
      if (!q.empty) {
        q.docs.forEach((d2) => {
          const t = d2.data();
          console.log(
            `  -> Found by field: ${d2.id} | ${t['teamName']} | members=${Array.isArray(t['members']) ? t['members'].length : 0}`
          );
        });
      } else {
        console.log(`  -> No TeamCode doc with teamCode field = ${teamCode}`);
      }
    }
  }
}
process.exit(0);
