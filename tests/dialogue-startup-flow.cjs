const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";
const example = path.resolve(__dirname, "../npc-editor/examples/dialogue_debug.json");

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  try {
    for (const mode of ["file", "no-crypto", "missing-json"]) {
      const context = await browser.newContext();
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      if (mode === "no-crypto") await page.addInitScript(() => Object.defineProperty(window, "crypto", { value: undefined, configurable: true }));
      if (mode === "missing-json") await page.route("**/npc-editor/examples/dialogue_debug.json", (r) => r.fulfill({ status: 404, body: "not found" }));
      await page.goto(mode === "file" ? pathToFileURL(path.resolve(__dirname, "../npc-editor/index.html")).href : `${base}/npc-editor/index.html`);
      if (mode !== "no-crypto") {
        await page.waitForSelector("#startupFailure:not([hidden])");
        assert.match(await page.locator("#startupError").innerText(), mode === "file" ? /直接打开 HTML/ : /HTTP 404/);
        assert.equal(await page.locator("#editorApp").evaluate((el) => el.classList.contains("is-loading")), false);
        assert.equal(await page.locator("#loadStartupExampleButton").isEnabled(), true);
        await page.locator("#startupExampleFile").setInputFiles(example);
      }
      await page.waitForSelector("#editorApp:not(.is-loading):not([inert])");
      assert.equal(await page.locator("#startupFailure").isVisible(), false);
      assert.equal(await page.locator("#textWorkspace").isVisible(), true);
      assert.equal(await page.locator("#npcSelect option").count(), 1);
      await page.click("#validateButton");
      assert.match(await page.locator("#inspector").innerText(), /检查：0 错误，0 警告/);
      const source = await page.locator("#dialogueTextInput").inputValue();
      await page.fill("#dialogueTextInput", `${source}\n》启动测试（+启动测试）`);
      await page.click("#applyTextButton");
      await page.waitForFunction(() => !window.DialogueTextEditor.hasDraft());
      const key = await page.evaluate(() => current().editor.textAuthoring.flagAliases["启动测试"]);
      assert.equal(key, `storyFlag_${crypto.createHash("sha256").update("启动测试").digest("hex")}`);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS: startup ${mode}, usable example editor and manual JSON conversion`);
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
