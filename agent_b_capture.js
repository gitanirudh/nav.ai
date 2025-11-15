
// const fs = require("fs-extra");
// const path = require("path");
// const { chromium } = require("playwright");

// const PLAN_PATH = path.join(__dirname, "captured_plan.json");
// const OUT_DIR = path.join(__dirname, "captures");
// fs.ensureDirSync(OUT_DIR);

// async function recordUserFlow() {
//   const userDataDir = path.join(__dirname, "pw-user-data");
//   const sessionFile = path.join(__dirname, "linear-state.json");

//   const ctx = await chromium.launchPersistentContext(userDataDir, {
//     headless: false,
//     viewport: { width: 1440, height: 900 },
//     args: [
//       "--disable-blink-features=AutomationControlled",
//       "--no-sandbox",
//       "--disable-infobars",
//     ],
//   });

//   const page = await ctx.newPage();

//   if (fs.existsSync(sessionFile)) {
//     console.log("✅ Using existing Linear session...");
//   } else {
//     console.log("⚠️ No session found — please log in manually once.");
//   }

//   console.log("🌐 Navigating to https://linear.app/ ...");
//   await page.goto("https://linear.app/", { waitUntil: "domcontentloaded" });

//   console.log("⏳ Waiting for Linear dashboard (up to 25s)...");
//   await page.waitForTimeout(5000);
//   await page.waitForSelector("body", { timeout: 25000 }).catch(() => {});
//   console.log("✅ Page loaded, injecting recorder...");

//   const actions = [];

//   // Expose recorder function so the browser can call Node
//   await page.exposeFunction("___recordAction", (data) => {
//     actions.push({ ...data, ts: Date.now() });
//     console.log(`${data.type.toUpperCase()} →`, data.selector, data.value || "");
//   });

//   // Inject listener script inside browser context
//   await page.evaluate(() => {
//     const getSelector = (el) => {
//       if (!el || el === document.body) return "body";
//       let path = [];
//       while (el && el.nodeType === 1 && el !== document.body) {
//         let sel = el.tagName.toLowerCase();
//         if (el.id) {
//           sel += `#${el.id}`;
//           path.unshift(sel);
//           break;
//         } else if (el.classList.length > 0) {
//           sel += "." + Array.from(el.classList).slice(0, 2).join(".");
//         }
//         path.unshift(sel);
//         el = el.parentElement;
//       }
//       return path.join(" > ");
//     };

//     const handlerClick = (e) => {
//       window.___recordAction({
//         type: "click",
//         selector: getSelector(e.target),
//       });
//     };

//     const handlerInput = (e) => {
//       const val =
//         e.target?.value ??
//         (e.target?.innerText?.trim() || e.target?.textContent?.trim());
//       window.___recordAction({
//         type: "input",
//         selector: getSelector(e.target),
//         value: val || "",
//       });
//     };

//     window.addEventListener("click", handlerClick, true);
//     window.addEventListener("input", handlerInput, true);
//     window.addEventListener("change", handlerInput, true);

//     console.log("✅ Recorder script injected in page context");
//   });

//   console.log("🎥 Recording started!");
//   console.log("👉 Perform your flow manually:");
//   console.log("   1. Go to Workspace → Projects");
//   console.log("   2. Click Add Project");
//   console.log("   3. Type Project name");
//   console.log("   4. Click Create Project");
//   console.log("🧩 When done, close the browser window or press Ctrl+C.");

//   // Wait until user closes browser
//   await new Promise((resolve) => ctx.on("close", resolve));

//   // Save recorded actions
//   await fs.writeJson(PLAN_PATH, actions, { spaces: 2 });
//   console.log(`✅ Recording complete — saved ${actions.length} actions to ${PLAN_PATH}`);

//   await ctx.close();
// }

// recordUserFlow().catch(console.error);


/**
 * Agent Linear – autonomous browser agent for Linear.app
 * Behaviorally simulates agent reasoning over your working script
 */

/**
 * Agent Linear – Autonomous project creator with smart load detection
 */

/**
 * Agent Linear – with adaptive DOM introspection
 */

const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');

const SESSION_FILE = path.join(__dirname, 'linear-state.json');
const USERDATA_DIR = path.join(__dirname, 'pw-user-data');
const OUT_DIR = path.join(__dirname, 'captures');
fs.ensureDirSync(OUT_DIR);

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function saveSnapshot(page, name) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const p = path.join(OUT_DIR, `${ts}_${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`📸 Snapshot: ${p}`);
}

async function elementExists(page, locator) {
  const el = await page.$(locator);
  return !!(el && await el.isVisible());
}

class LinearAgent {
  constructor(goal) {
    this.goal = goal.toLowerCase();
    this.projectName = this.extractProjectName();
  }

  extractProjectName() {
    const m = this.goal.match(/project (?:called|named)?\s*([a-zA-Z0-9_\-]+)/);
    return m ? m[1] : `Auto_${Date.now().toString().slice(-4)}`;
  }

  async init() {
    console.log(`🧠 Goal: "${this.goal}"`);
    console.log(`💡 Parsed intent: create project named "${this.projectName}"`);
    this.ctx = await chromium.launchPersistentContext(USERDATA_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    this.page = await this.ctx.newPage();
    console.log(fs.existsSync(SESSION_FILE)
      ? '✅ Using saved Linear session...'
      : '⚠️ No saved session, login manually once.');
  }

  async navigate() {
    console.log('🌐 Navigating to https://linear.app/');
    await this.page.goto('https://linear.app/', { waitUntil: 'domcontentloaded' });
    console.log('⏳ Waiting up to 30s for dashboard to load...');
    await wait(8000); // give React initial render time

    let sidebarVisible = false;
    for (let i = 0; i < 6; i++) {
      sidebarVisible = await elementExists(this.page, 'aside, [data-testid*="sidebar"], nav, div:has-text("Projects")');
      if (sidebarVisible) break;
      console.log(`  🔁 Sidebar not ready yet (${i+1}/6)...`);
      await wait(4000);
    }

    if (!sidebarVisible) {
      console.warn('⚠️ Sidebar not detected — dumping visible DOM text for analysis:');
      const textDump = await this.page.evaluate(() =>
        Array.from(document.querySelectorAll('div,nav,aside,section'))
          .map(e => e.textContent.trim())
          .filter(t => t && t.length < 200)
          .slice(0, 25)
      );
      console.log('🧩 Visible snippets:', textDump);
    }

    await saveSnapshot(this.page, 'dashboard_loaded');
  }

  async goToProjects() {
    console.log('🧭 Searching for visible "Projects" link in sidebar...');
    const candidates = [
      'text=Projects',
      'div:has-text("Projects")',
      'a:has-text("Projects")',
      'nav >> text=Projects',
      'aside >> text=Projects'
    ];

    for (const selector of candidates) {
      const handles = await this.page.$$(selector);
      for (const handle of handles) {
        try {
          if (await handle.isVisible()) {
            const text = await handle.textContent();
            console.log(`👉 Attempting click on: "${text?.trim()}" [${selector}]`);
            await handle.scrollIntoViewIfNeeded();
            await wait(400);
            await handle.click({ timeout: 8000, delay: 100 });
            await wait(3000);
            await saveSnapshot(this.page, 'projects_page_after_click');
            console.log('✅ Click succeeded!');
            return true;
          }
        } catch (err) {
          console.warn(`⚠️ Click failed for ${selector}: ${err.message}`);
          await wait(1000);
        }
      }
    }

    console.warn('❌ Could not click any visible "Projects" link.');
    await saveSnapshot(this.page, 'projects_click_failed');
    return false;
  }

  async addProject() {
    console.log('➕ Waiting for Projects page to fully load...');

    // Wait up to 10s for the page to switch after clicking Projects
    let pageReady = false;
    for (let i = 0; i < 30; i++) {
      const hasAddBtn = await elementExists(this.page, 'button:has-text("Add project")');
      const hasHeader = await elementExists(this.page, 'h1:has-text("Projects"), [role="heading"]:has-text("Projects")');
      if (hasAddBtn || hasHeader) {
        pageReady = true;
        console.log(`✅ Projects page detected (after ${i + 1} checks)`);
        break;
      }
      console.log(`  🔁 Waiting for Projects UI (${i + 1}/10)...`);
      await wait(1000);
    }

    if (!pageReady) {
      console.warn('⚠️ Projects page did not fully load, continuing anyway...');
    }

    console.log('➕ Searching for "Add project" button...');
    const addSelectors = [
      'button:has-text("Add project")',
      'text="+ Add project"',
      '[aria-label="Add project"]',
      'button:has-text("Add Project")'
    ];

    for (const sel of addSelectors) {
      try {
        if (await elementExists(this.page, sel)) {
          console.log(`✅ Found Add Project button: ${sel}`);
          const btn = this.page.locator(sel);
          await btn.scrollIntoViewIfNeeded();
          await wait(500);
          await btn.click({ delay: 100 });
          await wait(3000);
          await saveSnapshot(this.page, 'add_project_modal');
          return true;
        }
      } catch (err) {
        console.warn(`⚠️ Click attempt failed on ${sel}: ${err.message}`);
      }
    }

    console.warn('❌ Could not find Add Project button after waiting.');
    await saveSnapshot(this.page, 'add_project_not_found');
    return false;
  }



  async fillProjectName() {
    console.log(`⌨️ Typing "${this.projectName}"...`);
    const sels = ['div.ProseMirror.editor', '[contenteditable="true"]', '[role="textbox"]'];
    for (const s of sels) {
      const el = await this.page.$(s);
      if (el && await el.isVisible()) {
        await el.click();
        await this.page.keyboard.type(this.projectName, { delay: 70 });
        await saveSnapshot(this.page, 'filled_name');
        return true;
      }
    }
    console.warn('❌ Project name field not found.');
    return false;
  }

  async createProject() {
    const sels = ['button:has-text("Create project")', '[data-active="false"].sc-cpSJdf'];
    for (const s of sels) {
      if (await elementExists(this.page, s)) {
        console.log(`✅ Clicking Create via ${s}`);
        await this.page.locator(s).click();
        await wait(3000);
        await saveSnapshot(this.page, 'created');
        console.log(`🎉 Project "${this.projectName}" created.`);
        return true;
      }
    }
    console.warn('❌ No Create Project button.');
    return false;
  }

  async execute() {
    await this.init();
    await this.navigate();

    const ok = await this.goToProjects()
      && await this.addProject()
      && await this.fillProjectName()
      && await this.createProject();

    if (!ok) console.error('💀 Agent failed to complete flow.');
    else console.log('✅ Agent finished successfully.');

    await this.ctx.storageState({ path: SESSION_FILE });
    await this.ctx.close();
  }
}

(async () => {
  const goal = process.argv.slice(2).join(' ') || 'create a project named AutoAgent';
  const agent = new LinearAgent(goal);
  await agent.execute();
})();
