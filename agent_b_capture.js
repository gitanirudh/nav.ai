const fs = require('fs-extra');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = path.resolve(__dirname, 'captures');
fs.ensureDirSync(OUT_DIR);

async function saveSnapshot(page, name, meta = {}) {
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const fname = `${ts}__${name}.png`;
  const htmlname = `${ts}__${name}.html`;
  const p = path.join(OUT_DIR, fname);
  const h = path.join(OUT_DIR, htmlname);

  await page.screenshot({ path: p, fullPage: true });
  const html = await page.content();
  await fs.writeFile(h, html);
  const metadata = { name, path: p, htmlPath: h, ts, ...meta };
  await fs.appendFile(path.join(OUT_DIR, 'log.jsonl'), JSON.stringify(metadata) + '\n');
  console.log('Saved snapshot', p);
  return metadata;
}

const IN_PAGE_SCRIPT = `
(() => {
  window.__captureEvents = [];
  const mo = new MutationObserver((mutations) => {
    let added = 0, removed = 0, attrs = 0;
    for (const m of mutations) {
      added += (m.addedNodes || []).length;
      removed += (m.removedNodes || []).length;
      if (m.type === 'attributes') attrs++;
    }
    window.__lastMutation = { added, removed, attrs, time: Date.now() };
    window.__captureEvents.push({type:'mutation', added, removed, attrs, time: Date.now()});
    if (window.__captureEvents.length > 200) window.__captureEvents.shift();
  });
  mo.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['style','class','aria-hidden','hidden'] });

  window.addEventListener('focus', (e) => {
    try {
      const tag = document.activeElement && document.activeElement.tagName;
      window.__captureEvents.push({type:'focus', tag, time: Date.now()});
    } catch(e){}
  }, true);

  window.__checkOverlay = () => {
    const overlays = [];
    const all = Array.from(document.querySelectorAll('body *'));
    all.forEach(el => {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (!style || style.visibility === 'hidden' || style.display === 'none') return;
      if ((style.position === 'fixed' || style.position === 'absolute') && r.width > window.innerWidth * 0.3 && r.height > 100) {
        const z = parseInt(style.zIndex || 0) || 0;
        overlays.push({tag: el.tagName, z, rect: r.toJSON(), ariaRole: el.getAttribute('role')});
      }
    });
    window.__captureEvents.push({type:'overlay-scan', overlays, time: Date.now()});
    return overlays;
  };

  setInterval(window.__checkOverlay, 800);
})();
`;

async function resolveSelector(page, action) {
    const text = (action.target || "").trim();
    if (!text) {
      console.warn("⚠️ No text provided in action.target");
      return null;
    }
  
    const lowered = text.toLowerCase();
  
    // --- Special case: Workspace -> Projects ---
    if (lowered === "projects") {
        const workspaceProjectsHandle = await page.evaluateHandle(() => {
            const normalize = s => s?.toLowerCase().trim();
            const headings = Array.from(document.querySelectorAll("aside, nav, [data-testid*='sidebar'], [role='navigation'] *"));
            for (const h of headings) {
              if (normalize(h.textContent).includes("workspace")) {
                const match = Array.from(h.parentElement.querySelectorAll("a, div, span, button"))
                  .find(el => normalize(el.textContent).includes("projects"));
                if (match) return match;
              }
            }
            return null;
          });
          
          if (workspaceProjectsHandle) {
            const elHandle = workspaceProjectsHandle.asElement();
            if (elHandle) {
              console.log("✅ Found 'Projects' inside Workspace sidebar");
              return elHandle; // <-- Now a true ElementHandle, not a JSHandle
            }
          }
        }
  
    // --- Add project button ---
    if (lowered.includes("add project")) {
      const addSel = `xpath=//button[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'add project')
        or contains(.,'+ Add project') or @aria-label='Add project']`;
      const el = await page.$(addSel);
      if (el && await el.isVisible()) {
        console.log("✅ Found 'Add project' button");
        return addSel;
      }
    }
  
    // --- Create project button ---
    if (lowered.includes("create project")) {
      const createSel = `xpath=//button[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'create project')
        or contains(@class,'sc-cpSJdf')]`;
      const el = await page.$(createSel);
      if (el && await el.isVisible()) {
        console.log("✅ Found 'Create project' button");
        return createSel;
      }
    }
  
    // --- Fallback search for text matches ---
    const fallbackSelectors = [
      `xpath=//*[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${lowered}')]`,
      `xpath=//*[@aria-label and contains(translate(@aria-label,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${lowered}')]`,
      `xpath=//*[@role='button' and contains(translate(@aria-label,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${lowered}')]`
    ];
  
    for (const selector of fallbackSelectors) {
      const el = await page.$(selector);
      if (el && await el.isVisible()) {
        console.log(`✅ Fallback matched selector: ${selector}`);
        return selector;
      }
    }
  
    console.warn("❌ No selector matched for text:", text);
    return null;
  }
  
  

async function waitForStabilization(page, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const last = await page.evaluate(() => window.__lastMutation ? window.__lastMutation.time : 0);
    const now = Date.now();
    if (!last || now - last > 600) {
      await page.waitForTimeout(200);
      return;
    }
    await page.waitForTimeout(150);
  }
}

async function runPlan(plan, opts = { headless: false }) {
    // Path for persistent user profile and saved session
    const userDataDir = path.join(__dirname, 'pw-user-data');
    const sessionFile = path.join(__dirname, 'linear-state.json');
  
    // Launch persistent browser context (real user profile)
    const ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: opts.headless,
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-infobars',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
  
    if (fs.existsSync(sessionFile)) {
      console.log('✅ Using existing Linear session...');
    } else {
      console.log('⚠️ No session found — starting fresh login context...');
    }
  
    const page = await ctx.newPage();
    await page.addInitScript(IN_PAGE_SCRIPT);
  
    let step = 0;
    for (const action of plan) {
      step++;
  
      if (action.type === 'goto') {
        console.log('Navigating to', action.url);
        await page.goto(action.url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        await saveSnapshot(page, `step-${step}-page-load`, { action });
        continue;
      }
  
      await saveSnapshot(page, `step-${step}-pre`, { action });
  
      if (action.type === 'click') {
        const selectorOrHandle = await resolveSelector(page, action);
        if (!selectorOrHandle) {
          console.warn('Selector not found for', action.target);
          await saveSnapshot(page, `step-${step}-notfound`, { action });
          continue;
        }
      
        try {
            if (typeof selectorOrHandle === 'string') {
              await page.click(selectorOrHandle, { timeout: 5000 });
            } else {
              console.log("👉 Clicking resolved element handle");
              await selectorOrHandle.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
              await selectorOrHandle.click({ delay: 120 });
            }
          } catch (e) {
            console.warn('click failed', e.message);
          }
          
      }
       else if (action.type === 'type') {
        const label = (action.target || "").trim().toLowerCase();
        const value = action.text || "";
        console.log(`⌨️ Typing into "${label}" → "${value}"`);
      
        // Wait for modal input to appear
        await page.waitForTimeout(1000);
      
        // Linear project name field: contenteditable div inside a modal
        const selectors = [
          `xpath=//div[@role='textbox' and @contenteditable='true' and not(@aria-hidden='true')]`,
          `xpath=//div[@contenteditable='true' and not(@aria-hidden='true')]`,
          `xpath=//*[self::input or self::textarea or @contenteditable='true' or @role='textbox']`
        ];
      
        let inputHandle = null;
        for (const sel of selectors) {
          const el = await page.$(sel);
          if (el && await el.isVisible()) {
            inputHandle = el;
            console.log(`✅ Found editable field via ${sel}`);
            break;
          }
        }
      
        if (!inputHandle) {
          console.warn('❌ No editable field found for', label);
          await saveSnapshot(page, `step-${step}-input-notfound`, { action });
        } else {
          try {
            await inputHandle.focus();
            await page.keyboard.press('Control+A').catch(()=>{});
            await page.keyboard.press('Backspace').catch(()=>{});
            await page.keyboard.type(value, { delay: 70 });
            console.log(`✅ Typed "${value}" successfully`);
            await saveSnapshot(page, `step-${step}-input-filled`, { action });
          } catch (e) {
            console.warn('⚠️ Typing failed:', e.message);
          }
        }
      }
      
      
      
      else if (action.type === 'wait') {
        const ms = (action.seconds || 10) * 1000;
        console.log(`⏸️ Waiting ${action.seconds} seconds... log in manually if needed.`);
        await page.waitForTimeout(ms);
      }
    }
  
    // ✅ Save updated session
    await ctx.storageState({ path: sessionFile });
    console.log('💾 Saved session to', sessionFile);
  
    console.log('Plan finished. Captures in', OUT_DIR);
    await ctx.close(); // Close persistent context
  }
  
  

if (require.main === module) {
  const planPath = process.env.PLAN || path.join(__dirname, 'plans', 'example_plan.json');
  let plan = [];
  try {
    plan = fs.readJsonSync(planPath);
  } catch {
    console.log('No plan file found, running built-in example.');
    plan = [
      { type: 'goto', url: 'https://example.com' },
      { type: 'click', target: 'More information...' }
    ];
  }
  runPlan(plan, { headless: !!process.env.HEADLESS }).catch(console.error);
}
