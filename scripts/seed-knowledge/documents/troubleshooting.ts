import type { KnowledgeIngestionRequest } from '@nxt1/core/ai';

export const TROUBLESHOOTING_DOC: Omit<KnowledgeIngestionRequest, 'chunkSize' | 'chunkOverlap'> = {
  title: 'NXT1 Troubleshooting Guide — Common Issues and Fixes',
  category: 'help_center',
  source: 'manual',
  sourceRef: 'nxt1://help-center/troubleshooting',
  content: `# Troubleshooting Common Issues

## Video Upload Problems

**Supported formats:** MP4, MOV, and AVI are supported. Files in WMV, MKV, or other formats must be converted before uploading.

**File size limit:** The maximum upload size is 2GB per file. Files larger than this must be compressed or trimmed before uploading. Most phones record at quality levels well within this limit.

**Upload stalls or fails mid-way:**
- Check your internet connection stability. Video uploads require a consistent connection; uploads on spotty Wi-Fi frequently fail mid-transfer.
- Try switching from Wi-Fi to mobile data or vice versa.
- On mobile, keep the app in the foreground during large uploads. Background uploads may be paused by the OS.
- If the upload reaches 100% but never completes, wait 2 minutes then refresh. The processing step after upload can take time for large files.

**Video uploaded but not visible on profile:**
- Videos go through a short processing step after upload (generating thumbnail, optimizing for playback). This takes 30 seconds to 3 minutes depending on file size.
- If a video is still not visible after 5 minutes, navigate away and return. A hard refresh resolves display issues in most cases.

## Joining a Team — Team Code Issues

**Received an invite link but it's not working:**
- Make sure you are signed in (or signed up) before tapping the link. Once signed in, the link places you on the team automatically.
- If the link has expired, ask the coach to resend the invite from the Invite section.

**Entering a team code manually:**
- Go to Add Sport / Team and enter the 6-character code.
- Codes are case-insensitive but must be exactly 6 characters — double-check for spaces before or after when typing or pasting.
- The code may have been reset by the coach. Ask them to go to Team Settings → Team Code → Regenerate and share the new one.
- If you get an error saying you are already a member, check your Teams list — you may have joined previously.
- Codes can only be used to join active teams. If the team has been archived, contact the coach.

**Joined a team but cannot see team content:**
- Some teams require coach approval before new members gain full access. Wait for the coach to approve your join request.
- Try signing out and back in if content appears missing immediately after joining.

## Inviting Athletes and Staff to Your Team

Coaches and Directors invite players and staff to their team from the **Invite** section (accessible from the sidenav) or directly from the Team Profile.

**Invite via team code (fastest method for athletes):**
1. Go to your Team Profile → tap the share/invite icon
2. Your team code is displayed — share it verbally, or use the copy/share button
3. Players enter the code in the Teams section → Join a Team

**Invite via personal invite link or share channels:**
1. Go to Invite in the sidenav and select your team
2. Choose an invite channel:
   - **Messages (SMS)** — sends a text with the invite link (iOS/Android)
   - **WhatsApp** — shares via WhatsApp
   - **Email** — opens a pre-filled email invite
   - **Copy Link** — copies the invite URL to your clipboard
   - **QR Code** — displays a scannable QR code (great for in-person, at practice or a game)
   - **Contacts** — pick recipients directly from your device contacts (iOS/Android)
   - **AirDrop** — share nearby on iOS
   - **Instagram / X / Messenger** — share to social platforms
3. The recipient taps the link. If they don't have NXT1 yet, they sign up first and are then placed into the correct team automatically.

**Invite a player directly by email (from roster management):**
1. Go to your Team Profile → Roster
2. Tap "Invite Player"
3. Enter the player's email address, optional name, and position
4. They receive an email invite directly linked to your team

**Inviting staff (assistant coaches, trainers):**
- Staff can be added from the **Invite** section in the sidenav, or from Team Profile → Staff section
- Staff members must have a Coach or Director role on NXT1
- Send them the personal invite link and ask them to sign up as Coach/Director, then the team admin adds them from the Staff section

**Invite credits (individual accounts only):** When someone joins NXT1 through your personal invite link, you earn Agent X wallet credits that can be used toward AI operations. This applies to individual users only — org/team accounts do not earn invite credits.

## Push Notification Issues

**Not receiving push notifications (iOS):**
- Go to iOS Settings → NXT1 → Notifications and ensure Allow Notifications is enabled.
- Inside the NXT1 app, check Settings → Notifications to confirm the notification types you want are enabled.
- If notifications were previously working and stopped, try toggling push notifications off and on in iOS Settings.

**Not receiving push notifications (Android):**
- Go to Android Settings → Apps → NXT1 → Notifications and ensure notifications are allowed.
- Check that Battery Optimization is not restricting NXT1 in the background (Settings → Battery → Battery Optimization → NXT1 → Don't Optimize).

## Account Recovery and Login Issues

**"Email already in use" when signing up:**
- An account with this email already exists. Use "Sign In" and then "Forgot Password" to recover access.

**Verification email not received:**
- Check your spam/junk folder. Verification emails from NXT1 occasionally land there.
- Wait 5 minutes before requesting a resend. Email delivery can be delayed during high-volume periods.
- Ensure you are checking the correct email address used during signup.

**App crashes on launch:**
- Ensure you are running the latest version of the app. Force quit, update from the App Store or Google Play, then relaunch.
- If the issue persists, uninstall and reinstall the app. Your data is stored in the cloud and will reappear after signing back in.

## Contacting Support

If an issue is not resolved by the steps above, contact support via Help Center → Contact Us. Include:
- Your account email
- The device model and OS version
- A description of what you were doing when the issue occurred
- Screenshots or a screen recording if possible

Support response time is typically within 1 business day.
`,
};
