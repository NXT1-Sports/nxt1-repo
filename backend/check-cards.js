import 'dotenv/config';
import mongoose from 'mongoose';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.useDb('nxt_staging');
  const messages = await db
    .collection('agentmessages')
    .find({
      $or: [
        { cards: { $exists: true, $not: { $size: 0 } } },
        { parts: { $exists: true, $not: { $size: 0 } } },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(3)
    .toArray();

  console.log(JSON.stringify(messages, null, 2));
  process.exit(0);
}
run();
