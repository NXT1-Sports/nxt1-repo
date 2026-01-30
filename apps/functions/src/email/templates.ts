/**
 * @fileoverview Email Templates
 * @module @nxt1/functions/email/templates
 *
 * HTML email templates for transactional and marketing emails.
 */

export interface EmailTemplate {
  subject: string;
  html: (data: Record<string, unknown>) => string;
  text: (data: Record<string, unknown>) => string;
}

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  welcome: {
    subject: 'Welcome to NXT1 Sports!',
    html: (data) => `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://nxt1sports.com/assets/logo.png" alt="NXT1 Sports" style="height: 50px;">
          </div>
          <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 16px;">Welcome to NXT1, ${data['firstName']}!</h1>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
            Your journey to the next level starts here. Complete your profile to get discovered by college coaches.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://nxt1sports.com/onboarding" 
               style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
              Complete Your Profile
            </a>
          </div>
          <p style="color: #6a6a6a; font-size: 14px;">
            Questions? Reply to this email or reach out at support@nxt1sports.com
          </p>
        </body>
      </html>
    `,
    text: (data) =>
      `Welcome to NXT1, ${data['firstName']}!\n\nYour journey to the next level starts here. Complete your profile to get discovered by college coaches.\n\nVisit: https://nxt1sports.com/onboarding`,
  },

  verification: {
    subject: 'Verify your NXT1 email',
    html: (data) => `
      <!DOCTYPE html>
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">Verify your email</h1>
          <p>Click the link below to verify your email address:</p>
          <a href="${data['verificationLink']}" style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none;">
            Verify Email
          </a>
          <p style="color: #6a6a6a; font-size: 12px; margin-top: 20px;">
            This link expires in 24 hours. If you didn't request this, ignore this email.
          </p>
        </body>
      </html>
    `,
    text: (data) =>
      `Verify your email by clicking this link: ${data['verificationLink']}\n\nThis link expires in 24 hours.`,
  },

  password_reset: {
    subject: 'Reset your NXT1 password',
    html: (data) => `
      <!DOCTYPE html>
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">Reset your password</h1>
          <p>Click the link below to reset your password:</p>
          <a href="${data['resetLink']}" style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none;">
            Reset Password
          </a>
          <p style="color: #6a6a6a; font-size: 12px; margin-top: 20px;">
            This link expires in 1 hour. If you didn't request this, your account is safe.
          </p>
        </body>
      </html>
    `,
    text: (data) => `Reset your password: ${data['resetLink']}\n\nThis link expires in 1 hour.`,
  },

  offer_notification: {
    subject: 'New College Offer! 🎉',
    html: (data) => `
      <!DOCTYPE html>
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">Congratulations! 🎉</h1>
          <p style="font-size: 18px;">You received an offer from <strong>${data['collegeName']}</strong>!</p>
          <p>Division: ${data['division']}</p>
          <a href="https://nxt1sports.com/offers/${data['offerId']}" style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none;">
            View Offer Details
          </a>
        </body>
      </html>
    `,
    text: (data) =>
      `Congratulations! You received an offer from ${data['collegeName']} (${data['division']}).\n\nView details: https://nxt1sports.com/offers/${data['offerId']}`,
  },

  weekly_digest: {
    subject: 'Your NXT1 Weekly Update',
    html: (data) => `
      <!DOCTYPE html>
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">Your Weekly Update</h1>
          <p>Here's what happened this week:</p>
          <ul>
            <li>Profile views: ${data['profileViews']}</li>
            <li>New followers: ${data['newFollowers']}</li>
            <li>Video views: ${data['videoViews']}</li>
          </ul>
          <a href="https://nxt1sports.com/home" style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none;">
            See Full Stats
          </a>
        </body>
      </html>
    `,
    text: (data) =>
      `Your Weekly Update\n\nProfile views: ${data['profileViews']}\nNew followers: ${data['newFollowers']}\nVideo views: ${data['videoViews']}`,
  },
};
