import 'dotenv/config';

async function registerWebhook() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  // Change this to your actual production or staging backend URL
  const backendUrl = process.argv[2];

  if (!accountId || !apiToken) {
    console.error('❌ Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in .env');
    process.exit(1);
  }

  if (!backendUrl || !backendUrl.startsWith('http')) {
    console.error('❌ Please provide your backend URL as an argument.');
    console.error('Usage: npx tsx scripts/register-cf-webhook.ts https://api.nxt1sports.com');
    process.exit(1);
  }

  const notificationUrl = `${backendUrl.replace(/\/$/, '')}/api/v1/cloudflare-webhook`;
  console.log(`📡 Registering Webhook URL: ${notificationUrl}`);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/webhook`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notificationUrl }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    console.error('❌ Failed to register webhook:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('\n✅ Webhook registered successfully!');
  console.log('====================================================');
  console.log('Add the following line to your backend/.env file:');
  console.log(`CLOUDFLARE_WEBHOOK_SECRET="${data.result.secret}"`);
  console.log('====================================================\n');
}

registerWebhook().catch(console.error);
