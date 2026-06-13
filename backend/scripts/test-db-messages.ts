import { databaseConfig } from '../src/config/database.config';
import { AgentMessageModel } from '../src/models/agent-message.model';

async function run() {
  await databaseConfig.connect();
  const messages = await AgentMessageModel.find({
    role: 'assistant',
    operationId: { $exists: true },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  let first = true;
  for (const msg of messages) {
    if (first) {
      console.log(JSON.stringify(msg, null, 2));
      first = false;
    }
    console.log('ID:', msg._id);
    console.log('Operation:', msg.operationId);
    console.log('Phase:', msg.semanticPhase);
    console.log('Content:', msg.content);
    console.log(
      'Steps:',
      Math.max(
        msg.steps?.length || 0,
        msg.parts
          ?.filter((p) => p.type === 'tool-steps')
          ?.reduce((acc, p: any) => acc + p.steps?.length, 0) || 0
      )
    );
    console.log(
      'Cards:',
      msg.parts?.filter((p) => p.type === 'card').length || msg.cards?.length || 0
    );
    console.log('---');
  }
  await databaseConfig.disconnect();
}
run();
