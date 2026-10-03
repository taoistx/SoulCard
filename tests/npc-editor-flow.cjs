// Optional browser regression. Set PLAYWRIGHT_MODULE when Playwright is installed elsewhere.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${base}/npc-editor/index.html`);
    await page.waitForSelector("#editorApp:not(.is-loading)");
    await page.selectOption("#npcSelect", "eddie");
    const initialNodeCount = Object.keys(JSON.parse(readFileSync(require.resolve("../npc-dialogues/eddie.json"), "utf8")).nodes).length;
    assert.equal(await page.locator("#nodeList button").count(), initialNodeCount);
    await page.click("#addNodeButton");
    assert.equal(await page.locator("#nodeList button").count(), initialNodeCount + 1);
    await page.click("#undoButton");
    assert.equal(await page.locator("#nodeList button").count(), initialNodeCount);

    await page.selectOption("#npcSelect", "chris");
    await page.click("#sandboxButton");
    await page.fill("#sandboxDay", "4");
    await page.fill("#sandboxFlags", "{}");
    await page.fill("#sandboxItems", "{\"healingPotion\":1}");
    await page.click("#startSandboxButton");
    assert.match(await page.locator("#previewBody").innerText(), /明天我就上山/);
    await page.getByRole("button", { name: /给她一瓶止血剂/ }).click();
    assert.match(await page.locator("#sandboxLog").innerText(), /foundSecretPath/);
    await page.click("#closeSandboxButton");

    await page.click("#validateButton");
    assert.match(await page.locator("#inspector").innerText(), /检查：0 错误，0 警告/);
    const downloadPromise = page.waitForEvent("download");
    await page.click("#exportButton");
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "chris.json");
    const exported = JSON.parse(readFileSync(await download.path(), "utf8"));
    assert.equal(exported.id, "chris");
    assert.equal(exported.nodes.root.options[0].effects[1].key, "helpedChris");
    await page.selectOption("#npcSelect", "thomas");
    await page.click("#validateButton");
    assert.match(await page.locator("#inspector").innerText(), /检查：0 错误，0 警告/);
    assert.deepEqual(errors, []);
    console.log("PASS: NPC editor graph history, sandbox, validation and JSON export");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
