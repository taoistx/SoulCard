const assert = require("node:assert/strict");
const vm = require("node:vm");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  try {
    let exported = null;
    // Capture the real export before its POST reaches disk. The editor result is
    // parsed and round-tripped without changing the project's source or user drafts.
    await page.route("**/__node_editor/save_world_map", async (route) => {
      exported = route.request().postDataJSON().source;
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.goto(`${base}/node-editor/index.html`); await page.waitForSelector("#editorApp:not(.is-loading)");
    await page.click("#validateButton"); assert.match(await page.locator("#inspector").innerText(), /检查：0 错误/);
    const before = await page.evaluate(() => JSON.stringify(bundle));
    await page.click("#exportButton"); await page.waitForFunction(() => document.querySelector("#dirtyState").textContent.includes("已保存"));
    assert.ok(exported);
    const context = vm.createContext({ window: {} }); vm.runInContext(exported, context);
    assert.equal(JSON.stringify(context.window.WORLD_MAP_BUNDLE), before);
    assert.equal(context.window.WORLD_MAP_BUNDLE.map.nodes.filter((n) => n.eventSetId === `v06_${n.id}`).length, 12);
    assert.ok(context.window.WORLD_MAP_BUNDLE.map.nodes.find((n) => n.id === "slice_drybench").siteNpcIds.includes("genichiro"));
    await page.goto(`${base}/node-editor/events.html`); await page.waitForSelector("#eventEditorApp:not(.is-loading)");
    await page.locator("#eventSetList button").filter({ hasText: "v06_slice_church_nave" }).click();
    await page.locator(".event-entry-card").click(); assert.equal(await page.getByLabel(/^世界对话/).inputValue(), "site_slice_church_nave");
    await page.click("#validateButton"); assert.match(await page.locator("#inspector").innerText(), /检查：0 错误/);
    await page.goto(`${base}/npc-editor/index.html`); await page.waitForSelector("#editorApp:not(.is-loading)");
    for (const id of ["eddie", "thomas", "genichiro", "winnie", "mor", "emperor", "hollan"]) {
      await page.selectOption("#npcSelect", id); await page.click("#validateButton");
      assert.match(await page.locator("#inspector").innerText(), /检查：0 错误，0 警告/);
    }
    assert.deepEqual(errors, []);
    console.log("PASS: map export preserves legacy nodes and 12 sediment sites; event and NPC editors validate");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
