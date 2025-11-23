// playwright/loginScenario.js
// Reusable scenario: log in and wait for logged-in banner.
// If skipGoto = true, it assumes the page is already on the login screen.

async function loginAndWait(page, url, options = {}) {
  const { skipGoto = false } = options;

  if (!skipGoto) {
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
  }

  // Fill the demo credentials
  await page.fill("#userId", "demo");
  await page.fill("#pin", "1234");

  // Click the login button
  await page.click("#login-form button[type='submit']");

  // Wait for the "logged in" banner
  await page.waitForSelector("#logged-in-status", {
    state: "visible",
    timeout: 10_000,
  });

  // Small extra delay so UI is stable for screenshot
  await page.waitForTimeout(500);
}

module.exports = { loginAndWait };
