// Optional real-browser regression. Uses an existing Playwright install; no project dependency.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge", args: ["--enable-unsafe-swiftshader"] });
  const errors = [];
  let page;
  const snapshot = () => page.evaluate(() => WorldGame.getState());
  async function fresh() {
    if (page) await page.close();
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => !document.querySelector("#startButton").disabled);
    await page.click("#startButton");
    await page.locator('[data-node-id="eddie"]').click();
    assert.equal((await snapshot()).inventory.baitMeat, 1);
    await page.getByRole("button", { name: /收起诱饵/ }).click();
    await page.getByRole("button", { name: /离开.*返回地图/ }).click();
    await page.keyboard.press("e");
    assert.equal((await snapshot()).inventory.baitMeat, 1);
    await page.getByRole("button", { name: /离开.*返回地图/ }).click();
    await page.locator('[data-node-id="node"]').click();
    await page.waitForSelector("#actionEventPanel:not(.hidden)");
    assert.equal((await snapshot()).stamina, 4);
  }
  async function place(key, slot, drag = false) {
    const tab = key.startsWith("card:") ? "战斗卡" : key.startsWith("item:") ? "物品" : "知识";
    await page.locator(".action-resource-tabs").getByRole("button", { name: tab, exact: true }).click();
    const card = page.locator(`[data-resource="${key}"]`);
    const target = page.locator(`[data-slot="${slot}"]`);
    if (drag) await card.dragTo(target);
    else { await card.click(); await target.click(); }
  }
  async function submit(doubleClick = false) {
    assert.equal(await page.locator(".action-event-submit").isEnabled(), true);
    if (doubleClick) await page.locator(".action-event-submit").evaluate((el) => { el.click(); el.click(); });
    else await page.locator(".action-event-submit").click();
    await page.waitForSelector("#worldModal:not(.hidden)");
  }
  async function continueAction(battle = false) {
    await page.locator("#worldModalOptions button").first().click();
    if (battle) await page.waitForFunction(() => state?.active && !document.querySelector("#game").classList.contains("hidden"));
  }
  async function endBattle(result = "Win") {
    if (result === "Escape") await page.click("#escapeBattleButton");
    else await page.evaluate((outcome) => {
      if (outcome === "Win") damageEnemy(9999);
      else state.player.hp = 0;
      checkBattleEnd();
    }, result);
    await page.waitForSelector("#endOverlay.visible");
    await page.click("#restartButton");
    await page.waitForFunction(() => !pendingBattleResolve);
  }
  try {
    await fresh();
    await place("card:card_8", "field");
    await place("card:card_9", "thomas");
    assert.equal(await page.locator(".action-event-submit").isEnabled(), false);
    assert.match(await page.locator(".action-event-status").innerText(), /其他行动/);
    assert.equal((await snapshot()).deck[7].fatigue, 0);
    assert.equal((await snapshot()).deck[8].fatigue, 0);
    await page.locator('[data-retract="thomas"]').click();
    assert.equal(await page.locator(".action-event-submit").isEnabled(), true);
    await page.keyboard.press("Escape"); await page.keyboard.press("l"); await page.keyboard.press("i");
    assert.equal(await page.locator("#actionEventPanel").isVisible(), true);
    assert.equal((await snapshot()).day, 1);
    await place("card:card_8", "monster");
    assert.doesNotMatch(await page.locator(".action-event-status").innerText(), /感染|观察|15%/);
    await submit(true);
    let worldState = await snapshot();
    assert.equal(worldState.flags.thomasInfected, true);
    assert.equal(worldState.knowledge.dungLore, true);
    assert.equal(worldState.deck[7].fatigue, 1);
    await continueAction();
    await place("card:card_8", "monster");
    assert.equal(await page.locator(".action-event-submit").isEnabled(), true);
    await place("card:card_9", "field", true);
    await place("knowledge:dungLore", "monster");
    await submit(); await continueAction();
    worldState = await snapshot();
    assert.equal(worldState.deck[8].fatigue, 1);
    assert.equal(worldState.inventory.baitMeat, 1);
    assert.equal(worldState.knowledge.dungLore, true);
    assert.equal(worldState.flags.thomasFled, true);
    assert.equal(worldState.threats.thomasCrossroads_monster.nodeId, "node7");
    assert.equal(await page.evaluate(() => blocksAutoPath(NODE_BY_ID.get("node7"))), true);
    await page.locator('[data-node-id="node7"]').click();
    await page.waitForFunction(() => state?.active);
    assert.equal(await page.evaluate(() => activeBattle.damageMultiplier), 1.15);
    await endBattle();
    assert.deepEqual((await snapshot()).threats, {});
    await page.keyboard.press("e");
    assert.match(await page.locator("#worldModalBody").innerText(), /风吹过空地/);
    console.log("PASS: observation, second action, drag/drop, reusable knowledge, migration and original node event");

    for (const infected of [false, true]) {
      await fresh();
      if (infected) { await place("card:card_8", "monster"); await submit(); await continueAction(); }
      await place("card:card_6", "thomas"); await submit(); await continueAction(true);
      assert.equal(await page.evaluate(() => activeBattle.openingDelay), 0);
      await endBattle();
      worldState = await snapshot();
      assert.equal(worldState.flags.thomasStayed, true);
      assert.equal(Boolean(worldState.flags.thomasInfected), infected);
      assert.equal(worldState.stamina, 4);
      assert.match(await page.locator("#worldModalBody").innerText(), infected ? /孢子/ : /挡在前面/);
      assert.equal(await page.getByRole("button", { name: /向幸存者 托马斯献祭身体/ }).count(), 1);
      await page.getByRole("button", { name: /离开.*返回地图/ }).click();
      await page.click("#longRestButton"); await page.getByRole("button", { name: /长休到次日/ }).click();
      assert.equal((await snapshot()).day, 2);
      assert.equal((await snapshot()).deck.every((card) => card.fatigue === 0), true);
      await page.getByRole("button", { name: /离开.*返回地图/ }).click(); await page.keyboard.press("e");
      assert.match(await page.locator("#worldModalBody").innerText(), infected ? /孢子/ : /挡在前面/);
    }
    console.log("PASS: protection, healthy/infected NPC dialogue, sacrifice entry and long rest persistence");

    await fresh();
    await place("card:card_9", "monster"); await place("item:baitMeat", "field");
    await submit(); await continueAction();
    assert.equal((await snapshot()).inventory.baitMeat, undefined);
    assert.equal(await page.evaluate(() => Boolean(getNodeThreat("node"))), false);
    await page.click("#longRestButton"); await page.getByRole("button", { name: /长休到次日/ }).click();
    assert.equal(await page.evaluate(() => Boolean(getNodeThreat("node"))), true);
    await page.getByRole("button", { name: /离开.*返回地图/ }).click(); await page.keyboard.press("e");
    await page.waitForFunction(() => state?.active);
    await endBattle("Escape");
    assert.equal((await snapshot()).eventStates.thomasCrossroads.resolved, true);
    assert.equal((await snapshot()).threats.thomasCrossroads_monster.nodeId, "node");
    console.log("PASS: bait consumption, trapping, release on rest, escape preserves threat");

    await fresh();
    await place("card:card_8", "field"); await submit(); await continueAction();
    assert.equal((await snapshot()).flags.thomasInfected, true);
    await place("card:card_8", "monster"); await submit(); await continueAction(true);
    assert.equal((await snapshot()).flags.thomasKilled, true);
    assert.equal((await snapshot()).flags.thomasInfectedCorpse, true);
    await endBattle();
    assert.equal((await snapshot()).eventStates.thomasCrossroads.resolved, true);
    await page.keyboard.press("e");
    assert.match(await page.locator("#worldModalBody").innerText(), /感染孢子的尸体/);
    console.log("PASS: focus in the field observes; observing twice leaves an infected corpse and forces battle");

    await fresh();
    await place("card:card_1", "thomas");
    await place("card:card_2", "monster");
    await place("card:card_8", "field");
    await submit(); await continueAction(true);
    worldState = await snapshot();
    assert.equal(worldState.flags.thomasKilled, true);
    assert.equal(worldState.flags.thomasInfected, undefined);
    assert.equal(worldState.knowledge.dungLore, undefined);
    assert.equal(worldState.deck[0].fatigue, 1);
    assert.equal(worldState.deck[1].fatigue, 1);
    assert.equal(worldState.deck[7].fatigue, 0);
    assert.equal(await page.evaluate(() => activeBattle.openingDelay), 4);
    await endBattle();
    console.log("PASS: paired attacks override observation and grant four ticks of initiative");

    await fresh();
    await place("card:card_1", "thomas"); await submit(); await continueAction(true);
    assert.equal((await snapshot()).flags.thomasKilled, true);
    assert.equal(await page.evaluate(() => activeBattle.openingDelay), 0);
    await endBattle();
    assert.equal((await snapshot()).flags.thomasStayed, false);
    console.log("PASS: killing Thomas starts solo battle and never produces a resident NPC");

    await fresh();
    await place("card:card_1", "monster"); await submit(); await continueAction(true);
    assert.equal(await page.evaluate(() => getLeadEnemyCountdown() - getBattleIntents()[getLeadEnemyEntry().intentIndex].windup), 4);
    // Deterministic fixture for a physical fatigue card; use the real keyboard play and piles.
    await page.evaluate(() => {
      const tired = activeBattle.cardInstances.find((card) => card.instanceId === "card_1");
      tired.fatigue = 2;
      state.hand = [tired]; state.handCostDeltas = [-9]; state.deck = []; state.discard = [];
      state.player.focus = .5; state.lastPlayedCardId = "quick";
      state.enemy.intents.forEach((entry) => { entry.countdown += 40; });
      renderAll();
    });
    assert.match(await page.locator("#hand .card").innerText(), /疲劳 · 2 层/);
    assert.equal(await page.evaluate(() => getEffectiveHandCardCost(0)), 1);
    const enemyHp = await page.evaluate(() => state.enemy.hp);
    await page.keyboard.press("1");
    await page.waitForFunction(() => !processingActions);
    assert.deepEqual(await page.evaluate(() => ({ node: state.node, hp: state.enemy.hp, focus: state.player.focus, last: state.lastPlayedCardId, fatigue: state.discard[0].fatigue })), { node: 1, hp: enemyHp, focus: .5, last: null, fatigue: 1 });
    await page.evaluate(() => { drawCards(1); renderAll(); });
    assert.equal(await page.evaluate(() => state.hand[0].instanceId), "card_1");
    await page.keyboard.press("1"); await page.waitForFunction(() => !processingActions);
    await page.evaluate(() => { drawCards(1); renderAll(); });
    assert.equal(await page.evaluate(() => getBattleCard(state.hand[0]).type), "attack");
    await page.keyboard.press("1"); await page.waitForFunction(() => !processingActions);
    assert.equal(await page.evaluate(() => state.enemy.hp < state.enemy.maxHp), true);
    await endBattle("Escape");
    assert.equal((await snapshot()).deck[0].fatigue, 0);
    assert.equal((await snapshot()).deck[1].fatigue, 0);
    assert.equal((await snapshot()).flags.thomasFled, true);
    console.log("PASS: four-tick initiative, fixed-cost multilayer fatigue, shuffle identity, no effects, recovery and return");

    await fresh();
    await place("card:card_8", "monster"); await submit(); await continueAction();
    await page.route("**/battle-stage.js", (route) => route.abort());
    await place("card:card_1", "thomas"); await submit(); await continueAction();
    await page.waitForFunction(() => document.querySelector("#worldModalTitle").textContent === "本次行动已撤销");
    worldState = await snapshot();
    assert.equal(worldState.flags.thomasKilled, undefined);
    assert.equal(worldState.flags.thomasInfected, true);
    assert.equal(worldState.deck[0].fatigue, 0);
    assert.equal(worldState.deck[7].fatigue, 1);
    assert.equal(worldState.stamina, 4);
    assert.equal(worldState.eventStates.thomasCrossroads.stage, "infected");
    await page.getByRole("button", { name: /返回行动选择/ }).click();
    assert.equal(await page.locator("#actionEventPanel").isVisible(), true);
    console.log("PASS: battle initialization failure rolls back only the current submission");

    await page.close(); page = await browser.newPage();
    await page.goto(`${base}/node-editor/events.html`);
    await page.waitForSelector("#eventEditorApp:not(.is-loading)");
    await page.getByRole("button", { name: /托马斯与粪怪/ }).click();
    await page.locator(".event-entry-card").click();
    assert.equal(await page.getByLabel("行动事件 JSON").inputValue(), "thomasCrossroads");
    await page.click("#validateButton");
    assert.match(await page.locator("#inspector").innerText(), /检查：0 错误/);
    assert.deepEqual(errors, []);
    console.log("PASS: event editor mounting and validation; no browser page errors");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
