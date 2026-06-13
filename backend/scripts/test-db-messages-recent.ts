import { connectToMongoDB, disconnectFromMongoDB } from '../src/config/database.config';
import { AgentMessageModel } from '../src/models/agent/agent-message.model';

async function run() {
  await connectToMongoDB();
  const threadMessages = await AgentMessageModel.find({}).sort({ createdAt: -1 }).limit(10).lean();
  for (const msg of threadMessages) {
    if (msg.role !== 'assistant') continue;
    console.log('ID:', msg._id);
    console.log('Operation:', msg.operationId);
    console.log('Phase:', msg.semanticPhase);
    console.log('Role:', msg.role);
    console.log('Content Start:', msg.content?.slice(0, 80));
    console.log(
      'Steps:',
      Math.max(
        msg.steps?.length || 0,
        msg.parts
          ?.filter((p: any) => p.type === 'tool-steps')
          ?.reduce((acc: any, p: any) => acc + p.steps?.length, 0) || 0
      )
    );
    console.log(
      'Cards:',
      msg.parts?.filter((p: any) => p.type === 'card').length || msg.cards?.length || 0
    );
    console.log('---');
  }
  await disconnectFromMongoDB();
}
run();
