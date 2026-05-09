import 'dotenv/config';
import mongoose from 'mongoose';

async function run() {
  await mongoose.connect(process.env.MONGO);
  const db = mongoose.connection.useDb('nxt_staging');
  const messages = await db
    .collection('agentmessages')
    .find({
      $or: [{ cards: { $not: { $size: 0 } } }, { parts: { $not: { $size: 0 } } }],
    })
    .sort({ createdAt: -1 })
    .limit(3)
    .toArray();

  console.log(JSON.stringify(messages, null, 2));
  process.exit(0);
}
run();
