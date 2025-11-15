const fs = require("fs-extra");
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const userDataDir = path.join(__dirname, "pw-user-data");
  const sessionFile = path.join(__dirname, "linear-state.json");
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  const page = await ctx.newPage();

  if (fs.existsSync(sessionFile)) {
    console.log("✅ Using existing Linear session...");
  } else {
    console.log("⚠️ No session found — please log in manually once.");
  }

  console.log("🌐 Navigating to https://linear.app/ ...");
  await page.goto("https://linear.app/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  // 1️⃣ Click “Projects” in the sidebar
  console.log("➡️ Opening Projects...");
  await page.waitForSelector(
    "div#sidebarWorkspace >> text=Projects",
    { timeout: 15000 }
  );
  await page.click("div#sidebarWorkspace >> text=Projects");
  await page.waitForTimeout(3000);

  // 2️⃣ Click “Add Project” button (top-right)
  console.log("➕ Clicking Add Project...");
  await page.waitForSelector(
    "div#content-header button.sc-cpSJdf.hVYWuk",
    { timeout: 15000 }
  );
  await page.click("div#content-header button.sc-cpSJdf.hVYWuk");
  await page.waitForTimeout(1500);

  // 3️⃣ Fill Project Name field
  const projectName = "AutoTest_" + Date.now().toString().slice(-4);
  console.log("⌨️ Entering project name:", projectName);
  await page.waitForSelector(
    "div.ProseMirror.editor",
    { timeout: 15000 }
  );
  const editor = await page.$("div.ProseMirror.editor");
  await editor.click({ delay: 80 });
  await page.keyboard.type(projectName, { delay: 80 });
  await page.waitForTimeout(500);

  // 4️⃣ Click “Create Project”
  console.log("🚀 Creating project...");
  await page.waitForSelector(
    "button.sc-cpSJdf.kDGsMb",
    { timeout: 15000 }
  );
  await page.click("button.sc-cpSJdf.kDGsMb");
  console.log(`✅ Project '${projectName}' created.`);

  await page.waitForTimeout(4000);
  await ctx.close();
})();
