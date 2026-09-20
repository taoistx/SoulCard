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
  const node = (id) => page.locator(`.world-node[data-node-id="${id}"]`);
  const option = (name) => page.locator("#worldModalOptions").getByRole("button", { name, exact: false });

  async function moveTo(id) {
    await node(id).click();
    await page.waitForFunction((nodeId) => WorldGame.getState().currentNodeId === nodeId, id);
  }

  try {
    await page.goto(base);
    await page.click("#startButton");
    await page.waitForSelector('.world-node[data-node-id="start"]');
    await page.waitForSelector('.world-node[data-node-id="eddie"]');
    assert.deepEqual((await state()).revealedNodes.sort(), ["eddie", "start"]);

    await moveTo("eddie");
    assert.match(await page.locator("#worldModalTitle").innerText(), /艾迪/);
    await page.keyboard.press("Escape");
    for (const id of ["siltWoods", "drownedHuts", "bellRoad"]) await page.waitForSelector(`.world-node[data-node-id="${id}"]`);
    assert.ok((await state()).revealedNodes.includes("siltWoods"));

    await moveTo("siltWoods");
    await option("探索").click();
    assert.equal((await state()).stamina, 11);
    assert.ok((await state()).exploredNodes.includes("siltWoods"));
    await page.keyboard.press("Escape");
    await page.waitForSelector('.world-node[data-node-id="chris"]');

    await moveTo("chris");
    await option("给她一瓶止血剂").click();
    assert.equal((await state()).flags.foundSecretPath, true);
    await page.keyboard.press("Escape");

    await moveTo("eddie");
    assert.equal(await page.locator("#worldModal").evaluate((el) => el.classList.contains("hidden")), true);
    await page.keyboard.press("e");
    assert.match(await page.locator("#worldModalTitle").innerText(), /艾迪/);
    await page.keyboard.press("Escape");

    await moveTo("gate");
    await page.keyboard.press("e");
    await option("走克里斯指出的骨缝").click();
    assert.equal((await state()).stamina, 10);
    assert.equal((await state()).flags.bridgeOpened, true);
    await page.keyboard.press("Escape");
    await page.waitForSelector('.world-node[data-node-id="dungA"]');

    await moveTo("dungA");
    await page.waitForSelector("#game:not(.hidden)");
    assert.equal((await state()).stamina, 9);
    await page.click("#escapeBattleButton");
    await page.click("#endOverlay.visible #restartButton");
    await page.waitForSelector("#mapScreen:not(.hidden)");
    assert.equal((await state()).currentNodeId, "dungA");
    await page.keyboard.press("Escape");

    await page.keyboard.press("l");
    await option("长休到次日").click();
    const rested = await state();
    assert.equal(rested.day, 2);
    assert.equal(rested.stamina, 12);
    await page.keyboard.press("Escape");

    await page.keyboard.press("i");
    await page.click('[data-equip-item="rustySword"][data-equip-slot="leftHand"]');
    assert.equal((await state()).equipment.leftHand, "rustySword");
    await page.click('[data-unequip-slot="leftHand"]');
    assert.equal((await state()).equipment.leftHand, null);
    await page.keyboard.press("Escape");

    assert.deepEqual(errors, []);
    console.log("PASS: point crawl reveal, path movement, first-arrival NPC prompt, stamina costs, rest, battle escape and equipment");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
