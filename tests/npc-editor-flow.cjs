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
    await page.goto(`${base}/npc-editor/index.html?source=project`);
    await page.waitForSelector("#editorApp:not(.is-loading)");
    await page.selectOption("#npcSelect", "eddie");
    const initialNodeCount = Object.keys(JSON.parse(readFileSync(require.resolve("../npc-dialogues/eddie.json"), "utf8")).nodes).length;
    assert.equal(await page.locator("#nodeList button").count(), initialNodeCount);
    await page.click("#addNodeButton");
    assert.equal(await page.locator("#nodeList button").count(), initialNodeCount + 1);
    await page.click("#undoButton");
    assert.equal(await page.locator("#nodeList button").count(), initialNodeCount);

    await page.click("#sandboxButton");
    const preview = page.locator("#previewBody");
    const choose = (name) => page.locator("#previewOptions").getByRole("button", { name, exact: true }).click();
    for (const flags of [{}, { wrapTested: true }]) {
      await page.fill("#sandboxFlags", JSON.stringify(flags));
      await page.click("#startSandboxButton");
      const opening = await preview.innerText();
      await choose("你知道我身上这些斑纹是怎么回事吗？");
      const report = await preview.innerText();
      assert.match(report, flags.wrapTested ? /甲缝没有再刺痛/ : /你是喝到黑水了吧/);
      for (const [question, answer] of [["变异？变成什么？", /变成一滩烂肉吧/], ["怎么能治好", /山上的教堂去碰碰运气/]]) {
        await choose(question);
        assert.match(await preview.innerText(), answer);
        await choose("返回");
        assert.equal(await preview.innerText(), report);
        assert.equal(await page.evaluate(() => sandboxNodeId), "slice_report");
      }
      await choose("返回");
      assert.equal(await preview.innerText(), opening);
      assert.equal(await page.evaluate(() => sandboxNodeId), "root");
    }
    await page.click("#closeSandboxButton");

    await page.selectOption("#npcSelect", "chris");
    await page.click("#sandboxButton");
    await page.fill("#sandboxDay", "4");
    await page.fill("#sandboxFlags", "{}");
    await page.fill("#sandboxItems", "{\"mistWrapMaterial\":1}");
    await page.click("#startSandboxButton");
    assert.match(await page.locator("#previewBody").innerText(), /明天我就上山/);
    await page.getByRole("button", { name: /给她一片包扎韧膜/ }).click();
    assert.match(await page.locator("#sandboxLog").innerText(), /foundSecretPath/);
    await page.click("#closeSandboxButton");

    await page.click("#validateButton");
    assert.match(await page.locator("#inspector").innerText(), /检查：0 错误，0 警告/);
    assert.equal(await page.locator("#exportButton").count(), 0);
    const exported = await page.evaluate(() => JSON.parse(JSON.stringify(current())));
    assert.equal(exported.id, "chris");
    assert.equal(exported.nodes.root.options[0].effects[1].key, "helpedChris");
    await page.selectOption("#npcSelect", "thomas");
    await page.click("#validateButton");
    assert.match(await page.locator("#inspector").innerText(), /检查：0 错误，0 警告/);
    assert.deepEqual(errors, []);
    console.log("PASS: NPC editor graph history, sandbox, validation and current JSON (disk writes covered by dialogue-folder-flow)");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
