const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
module.exports = async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge", args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const snapshot = () => page.evaluate(() => WorldGame.getState());
  const button = (name) => page.locator("#worldModalOptions").getByRole("button", { name });
  async function fresh() {
    await page.goto(process.env.DUNGEON_URL || "http://127.0.0.1:8765");
    await page.waitForFunction(() => typeof WorldGame !== "undefined" && !document.querySelector("#startButton").disabled);
    await page.click("#startButton");
  }
  async function dismiss() {
    if (await page.locator("#actionEventPanel").isVisible()) await page.locator(".action-event-leave").click();
    if (await page.locator("#worldModal").isVisible()) await button(/离开.*返回地图/).click();
  }
  async function move(id) {
    await dismiss();
    await page.evaluate((id) => focusCameraOnNode(NODE_BY_ID.get(id), true), id);
    await page.waitForTimeout(280);
    await page.locator(`[data-node-id="${id}"]`).click();
    if (await button("确认前往").count()) await button("确认前往").click();
    assert.equal((await snapshot()).currentNodeId, id);
  }
  async function inspect() { await dismiss(); await page.keyboard.press("e"); }
  async function rest() { await dismiss(); await page.click("#longRestButton"); await button(/长休到次日/).click(); await dismiss(); }
  async function place(card, slot) {
    const instance = await page.evaluate((id) => world.deck.find((c) => c.cardId === id).instanceId, card);
    await page.locator('[data-tab="card"]').click();
    await page.locator(`[data-resource="card:${instance}"]`).click(); await page.locator(`[data-slot="${slot}"]`).click();
  }
  async function resource(kind, id, slot) {
    await page.locator(`[data-tab="${kind}"]`).click(); await page.locator(`[data-resource="${kind}:${id}"]`).click(); await page.locator(`[data-slot="${slot}"]`).click();
  }
  async function submit() { await page.locator(".action-event-submit").click(); await button("继续").click(); }
  async function action(card, slot) { await place(card, slot); await submit(); }
  async function seed(id, flags = {}, inventory = {}, hp = 66, day = 1) {
    await fresh(); await page.evaluate(({id, flags, inventory, hp, day}) => {
      world.currentNodeId = id; world.exploredNodes.add(id); Object.assign(world.flags, flags); Object.assign(world.inventory, inventory); world.hp = hp; world.day = day;
      renderWorld(); triggerNodeEvent(getCurrentNode(), { arrivalPaid: true });
    }, {id, flags, inventory, hp, day});
  }
  async function finishBattle(outcome) {
    await page.evaluate((result) => finishBattle(result), outcome);
    await page.waitForSelector("#endOverlay.visible"); await page.click("#restartButton");
    await page.waitForFunction(() => !pendingBattleResolve);
  }
  return { browser, page, errors, snapshot, button, fresh, dismiss, move, inspect, rest, place, resource, submit, action, seed, finishBattle };
};
