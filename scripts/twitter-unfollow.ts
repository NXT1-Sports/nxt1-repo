import { chromium } from 'playwright';

/**
 * Automated Twitter/X Unfollower
 *
 * Scrolls down to load older followers first, then unfollows them gradually
 * with natural delays to avoid detection.
 *
 * Usage: npm run twitter:unfollow
 */

const CONFIG = {
  username: 'nxt1sports',
  scrollCount: 300, // Number of times to scroll (loads ~300-500 users)
  maxUnfollows: 200, // Max unfollows per run (be conservative)
  delayMin: 1000, // Min delay between unfollows (ms)
  delayMax: 3000, // Max delay between unfollows (ms)
  breakInterval: 10, // Take break every N unfollows
  breakDuration: 30000, // Break duration (ms)
};

async function autoUnfollow() {
  console.log('🚀 Starting Twitter auto-unfollower...\n');

  let browser;

  try {
    console.log('⏳ Launching Chrome browser...');
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
    });

    console.log('✅ Chrome launched\n');

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to following page
    console.log(`📍 Navigating to https://x.com/${CONFIG.username}/following`);
    try {
      await page.goto(`https://x.com/${CONFIG.username}/following`, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
    } catch (e) {
      console.log('⚠️  Page load timeout - continuing anyway');
    }

    // Wait for content to load
    await page.waitForTimeout(3000);

    // Check if logged in - wait for user to login manually if needed
    let isLoggedIn = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const loginButton = await page.$('a[href="/login"]');
      if (!loginButton) {
        isLoggedIn = true;
        console.log('✅ Logged in successfully\n');
        break;
      }

      if (attempt === 0) {
        console.log('⚠️  Not logged in. Please log in manually in the browser window.');
        console.log('⏳ Waiting up to 30 seconds for login...\n');
      }

      await page.waitForTimeout(5000);
    }

    if (!isLoggedIn) {
      console.log('❌ Login timeout. Please log in and run again.');
      await browser.close();
      return;
    }

    // Make sure we're on the following page
    let currentUrl = page.url();
    console.log(`📍 Current page: ${currentUrl}`);

    if (!currentUrl.includes('/following')) {
      console.log('🔄 Navigating to following page...');

      // Try clicking the Following tab if we're on the profile
      try {
        const followingLink = await page.$('a[href$="/following"]');
        if (followingLink) {
          console.log('   Clicking "Following" tab...');
          await followingLink.click();
          await page.waitForTimeout(3000);
          currentUrl = page.url();
          console.log(`   ✅ Now on: ${currentUrl}`);
        } else {
          // Fallback: direct navigation
          await page.evaluate((username) => {
            window.location.href = `https://x.com/${username}/following`;
          }, CONFIG.username);
          await page.waitForTimeout(3000);
        }
      } catch (e) {
        console.log('⚠️  Using fallback navigation...');
        await page.evaluate((username) => {
          window.location.href = `https://x.com/${username}/following`;
        }, CONFIG.username);
        await page.waitForTimeout(3000);
      }
    }

    // Wait for followers list to render
    console.log('⏳ Waiting for followers list to load...');
    await page.waitForTimeout(5000);

    // Scroll to load older followers
    console.log(`\n📜 Scrolling ${CONFIG.scrollCount} times to load older followers...`);
    for (let i = 0; i < CONFIG.scrollCount; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, 800);
      });
      await page.waitForTimeout(500);

      if ((i + 1) % 10 === 0) {
        console.log(`   Scrolled ${i + 1}/${CONFIG.scrollCount}`);
      }
    }

    console.log('✅ Scrolling complete - older followers loaded\n');

    // Wait for UI to settle
    await page.waitForTimeout(2000);

    console.log('🔄 Starting unfollow process (Bottom-Up Strategy)...');
    console.log('   We will unfollow visible users, then scroll UP to find more.');

    let successCount = 0;
    let failCount = 0;
    let consecutiveEmptyScrolls = 0;

    while (successCount < CONFIG.maxUnfollows && consecutiveEmptyScrolls < 10) {
      // Find visible buttons (re-query every time to handle DOM updates)
      const buttons = await page.$$('[data-testid$="-unfollow"]');

      if (buttons.length === 0) {
        console.log('   ⬆️  No buttons visible, scrolling up to find more...');
        await page.evaluate(() => window.scrollBy(0, -600));
        await page.waitForTimeout(2000);
        consecutiveEmptyScrolls++;
        continue;
      }

      // Reset empty scroll counter since we found buttons
      consecutiveEmptyScrolls = 0;

      // Select the LAST button (Bottom-most = Oldest)
      // This ensures we peel away the oldest followers first
      const targetButton = buttons[buttons.length - 1];

      try {
        await targetButton.scrollIntoViewIfNeeded(); // Ensure it's clickable
        await targetButton.click();
        await page.waitForTimeout(500);

        // Confirm unfollow in popup modal
        const confirmBtn = await page.waitForSelector('[data-testid="confirmationSheetConfirm"]', {
          timeout: 3000,
        });

        if (confirmBtn) {
          await confirmBtn.click();
          successCount++;
          console.log(`   ✓ Unfollowed user ${successCount}/${CONFIG.maxUnfollows}`);
        } else {
          console.log('   ⚠️  Confirmation modal did not appear');
          failCount++;
        }

        // Random delay to look natural (1-3 seconds)
        const delay = Math.random() * (CONFIG.delayMax - CONFIG.delayMin) + CONFIG.delayMin;
        await page.waitForTimeout(delay);

        // Take a break every N unfollows
        if (successCount % CONFIG.breakInterval === 0 && successCount < CONFIG.maxUnfollows) {
          console.log(`\n   ⏸️  Taking ${CONFIG.breakDuration / 1000}s break...\n`);
          await page.waitForTimeout(CONFIG.breakDuration);
        }
      } catch (e) {
        failCount++;
        console.log(
          `   ⚠️  Error processing user: ${e instanceof Error ? e.message.split('\n')[0] : 'Unknown error'}`
        );
        // If we fail on a button, scrolling up might help clear the view
        await page.evaluate(() => window.scrollBy(0, -100));
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ Unfollow session complete!');
    console.log('='.repeat(50));
    console.log(`   Successfully unfollowed: ${successCount}`);
    console.log(`   Failed/Skipped: ${failCount}`);
    console.log(`   Total processed: ${successCount + failCount}`);
    console.log('='.repeat(50) + '\n');

    // Keep browser open for a moment
    await page.waitForTimeout(3000);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
    console.log('👋 Browser closed. Done!\n');
  }
}

// Run the script
autoUnfollow().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
