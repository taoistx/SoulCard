// Optional browser regression: use an existing Playwright installation; no app dependency.
// DUNGEON_URL defaults to a static server on 127.0.0.1:8765.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = () => page.evaluate(() => WorldGame.getState());
  async function step(key, col, row) {
    await page.keyboard.down(key);
    await page.waitForTimeout(35);
    await page.keyboard.up(key);
    await page.waitForTimeout(160);
    assert.deepEqual((await state()).player, { col, row });
  }
  const option = (name) => page.locator("#worldModalOptions").getByRole("button", { name, exact: false });
  try {
    await page.goto(base);
    await page.click("#startButton");
    await page.waitForSelector(".world-stage.has-dungeon canvas");
    await page.waitForTimeout(300);
    const viewport = await page.locator("#dungeonViewport canvas").boundingBox();
    // Raycast onto the adjacent east floor in the fixed 45° / span-10 camera.
    await page.mouse.click(viewport.x + viewport.width / 2 + viewport.height / (10 * Math.SQRT2), viewport.y + viewport.height / 2 + viewport.height / 20);
    assert.deepEqual((await state()).player, { col: 3, row: 13 });
    await step("a", 2, 13);
    await step("s", 2, 13); // Wall at row 14.
    await page.keyboard.press("e");
    await option("这里是什么地方").click();
    assert.match(await page.locator("#worldModalTitle").innerText(), /唯一出口/);
    await page.keyboard.press("Escape");
    await page.keyboard.press("i");
    await page.click('[data-equip-item="rustySword"][data-equip-slot="leftHand"]');
    assert.equal((await state()).equipment.leftHand, "rustySword");
    await page.click('[data-equip-item="rustySword"][data-equip-slot="rightHand"]');
    assert.equal((await state()).equipment.rightHand, "rustySword");
    await page.click('[data-unequip-slot="rightHand"]');
    assert.equal((await state()).equipment.rightHand, null);
    await page.keyboard.press("Escape");
    assert.equal((await state()).day, 1);
    await page.keyboard.press("l");
    await option("长休到次日").click();
    assert.equal((await state()).day, 2);
    await page.keyboard.press("Escape");
    for (let col = 3; col <= 8; col++) await step("d", col, 13);
    await page.keyboard.press("e");
    await option("给她一瓶止血剂").click();
    assert.equal((await state()).flags.foundSecretPath, true);
    await page.keyboard.press("Escape");
    await step("w", 8, 12); await step("w", 8, 11);
    for (let col = 9; col <= 11; col++) await step("d", col, 11);
    for (let row = 10; row >= 7; row--) await step("w", 11, row);
    await step("d", 12, 7); await step("d", 13, 7);
    await step("d", 13, 7); // Closed gate blocks entry.
    await page.keyboard.press("e");
    await option("走克里斯指出的骨缝").click();
    assert.equal((await state()).flags.bridgeOpened, true);
    assert.match(await page.locator('.dungeon-label[data-object-id="gate"]').innerText(), /已开启/);
    await page.keyboard.press("Escape");
    await step("d", 14, 7); await step("d", 15, 7); await step("d", 16, 7);
    await page.keyboard.press("e");
    await page.waitForSelector("#game:not(.hidden)");
    await page.click("#escapeBattleButton");
    await page.click("#endOverlay.visible #restartButton");
    await page.waitForSelector("#mapScreen:not(.hidden)");
    assert.deepEqual((await state()).player, { col: 16, row: 7 });
    assert.equal((await state()).day, 2);
    await page.keyboard.press("Escape");
    await page.evaluate(() => WorldGame.setFlag("dungAKilled", true));
    await page.waitForSelector('.dungeon-label[data-object-id="dungA"][hidden]', { state: "attached" });
    console.log("PASS: default movement, walls, NPC branches, rest, hand slots, gate, battle Escape and object visibility");

    await page.goto(`${base}/map-editor/index.html`);
    await page.click("#loadCurrentButton");
    await page.click("#preview3dButton");
    await page.waitForSelector("#editorDungeonViewport canvas");
    await page.check("#previewGateOpened");
    assert.match(await page.locator('.dungeon-label[data-object-id="gate"]').innerText(), /已开启/);
    await page.keyboard.press("Escape");
    const definitions = await page.evaluate(() => window.WORLD_MAP_BUNDLE.objectDefinitions);
    const custom = { schemaVersion: 1, objectDefinitions: definitions, map: {
      meta: { title: "编辑器映射回归", eyebrow: "7 × 7 自定义地宫" },
      grid: ["#######", "#rr#rr#", "#rr#rr#", "#r...r#", "#rr#rr#", "#rr#rr#", "#######"],
      playerStart: { col: 1, row: 1 },
      objects: [{ id: "eddie", col: 2, row: 2 }, { id: "gate", col: 3, row: 3 }, { id: "dungA", col: 5, row: 3 }],
    } };
    await page.locator("#importFile").setInputFiles({ name: "world-map.js", mimeType: "text/javascript", buffer: Buffer.from(`window.WORLD_MAP_BUNDLE = ${JSON.stringify(custom)};`) });
    assert.equal(await page.locator("#mapSize").innerText(), "7 × 7");
    await page.click('[data-tool="wall"]');
    await page.click('[data-cell="2,1"]');
    await page.click("#undoButton");
    await page.click("#redoButton");
    await page.click("#preview3dButton");
    await page.waitForSelector("#editorDungeonViewport canvas");
    await page.click("#playtestButton");
    await page.waitForURL("**/index.html?mapPreview=1");
    await page.waitForSelector(".world-stage.has-dungeon canvas");
    assert.equal(await page.locator("#worldTitle").innerText(), "编辑器映射回归");
    assert.deepEqual((await state()).player, { col: 1, row: 1 });
    await step("d", 1, 1); // The painted wall is present in World collision.
    await step("s", 1, 2); await step("s", 1, 3); await step("d", 2, 3);
    await step("d", 2, 3); // Relocated gate is blocked.
    await page.evaluate(() => WorldGame.setFlag("bridgeOpened", true));
    await step("d", 3, 3);
    await page.click("#returnToEditor");
    await page.waitForSelector("#editorApp:not(.is-hidden)");
    assert.equal(await page.locator("#mapTitle").inputValue(), "编辑器映射回归");
    assert.equal(await page.locator("#dirtyState").innerText(), "未保存");
    assert.equal(await page.locator("#undoButton").isEnabled(), true);
    await page.click("#undoButton");
    assert.match(await page.locator('[data-cell="2,1"]').getAttribute("class"), /room/);
    page.on("dialog", (dialog) => dialog.accept());
    const downloadPromise = page.waitForEvent("download");
    await page.click("#exportButton");
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "world-map.js");
    const content = require("node:fs").readFileSync(await download.path(), "utf8");
    assert.match(content, /编辑器映射回归/);
    console.log("PASS: editor preview, imported custom map, paint, undo/redo, playtest, shifted gate, draft restore and export");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
