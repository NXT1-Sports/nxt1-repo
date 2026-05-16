const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: 'john@nxt1sports.com',
      subject: 'launch',
      text: 'Connectivity test',
    });
    console.log('SUCCESS: ' + info.messageId);
  } catch (error) {
    console.error('FAILED: ' + error.message);
    process.exit(1);
  }
}

main();
