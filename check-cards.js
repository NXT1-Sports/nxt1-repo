import mongoose from 'mongoose';

async function run() {
  await mongoose.connect(process.env.MONGO);
  const db = mongoose.connection.useDb('nxt_staging');
  const messages = await db
    .collection('agentmessages')
    .find({ 'cards.0': { $exists: true } })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  console.log(
    JSON.stringify(
      messages.map((m) => ({ cards: m.cards, content: m.content })),
      null,
      2
    )
  );
  process.exit(0);
}
run();
