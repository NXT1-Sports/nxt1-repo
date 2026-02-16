/**
 * Quick Firebase TeamCodes Data Check
 * Verifies connection and shows sample data
 */

import { db } from '../dist/utils/firebase.js';

async function checkTeamCodes() {
  try {
    console.log('🔍 Checking Firebase TeamCodes collection...\n');

    // Get first 5 teams
    const snapshot = await db.collection('TeamCodes').limit(5).get();

    if (snapshot.empty) {
      console.log('⚠️  No TeamCodes found in Firebase');
      return;
    }

    console.log(`✅ Found ${snapshot.size} teams (showing first 5):\n`);

    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. Team ID: ${doc.id}`);
      console.log(`   Name: ${data.name || 'N/A'}`);
      console.log(`   Code: ${data.teamCode || 'N/A'}`);
      console.log(`   Unicode: ${data.unicode || 'N/A'}`);
      console.log(`   Members: ${data.members?.length || 0}`);
      console.log(`   Created: ${data.createdAt?.toDate?.() || data.createdAt || 'N/A'}`);
      console.log('');
    });

    // Get total count (expensive, but useful for testing)
    const allSnapshot = await db.collection('TeamCodes').count().get();
    console.log(`📊 Total teams in database: ${allSnapshot.data().count}\n`);

    // Show a sample team with full details
    if (snapshot.docs.length > 0) {
      console.log('📋 Sample team (first one) full data:');
      console.log('─'.repeat(80));
      console.log(JSON.stringify(snapshot.docs[0].data(), null, 2));
      console.log('─'.repeat(80));
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkTeamCodes();
