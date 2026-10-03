// Integration checks against the real battle module and WebGL stage.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge", args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function start(enemyId) {
    await page.evaluate((id) => { closeWorldModal(); window.testBattle = runBattle(id, "regression", { prepaid: true }); }, enemyId);
    await page.waitForFunction(() => state?.active);
    await page.evaluate(() => { state.enemy.intents.forEach((entry) => { entry.countdown += 100; }); });
  }
  async function finish(result = "Escape") {
    await page.evaluate((value) => finishBattle(value), result);
    await page.waitForSelector("#endOverlay.visible"); await page.click("#restartButton");
    await page.evaluate(() => window.testBattle);
  }
  try {
    await page.goto(base); await page.waitForFunction(() => !document.querySelector("#startButton").disabled); await page.click("#startButton");
    await page.evaluate(() => {
      world.deck[0].fatigue = 2; world.knowledge.dungLore = true;
      addCard("preRead"); addCard("chase"); addCard("chase");
    });
    await start("dungling");
    assert.match(await page.evaluate(async () => {
      try { await BattleBridge.startBattle("dungling"); return "unexpected"; } catch (error) { return error.message; }
    }), /already active/);
    await page.evaluate(() => {
      const tired = activeBattle.cardInstances[0];
      state.hand = [tired]; state.handCostDeltas = [0]; state.deck = []; state.discard = [];
      enqueueAction(performReplenish);
    });
    await page.waitForFunction(() => !processingActions);
    assert.equal(await page.evaluate(() => state.hand[0].fatigue), 2);
    await page.evaluate(() => {
      const tired = activeBattle.cardInstances[0], other = activeBattle.cardInstances[1];
      state.hand = []; state.handCostDeltas = []; state.discard = []; state.deck = [other, tired];
      enqueueAction(() => resolveScry(CARD_LIBRARY.preRead));
    });
    await page.waitForFunction(() => state.choice?.kind === "deck");
    assert.match(await page.locator("#hand .card").first().innerText(), /疲劳 · 2 层/);
    await page.locator("#hand .card").first().click();
    await page.waitForFunction(() => !processingActions);
    assert.deepEqual(await page.evaluate(() => ({ identity: state.hand[0] === activeBattle.cardInstances[0], fatigue: state.hand[0].fatigue, other: state.deck[0].instanceId })), { identity: true, fatigue: 2, other: "card_2" });

    const clash = await page.evaluate(async () => {
      const copies = activeBattle.cardInstances.filter((card) => card.cardId === "chase");
      state.hand = []; state.handCostDeltas = []; state.deck = []; state.discard = [copies[1]];
      state.player.focus = 1;
      state.enemy.intents[0].intentIndex = 1; state.enemy.intents[0].countdown = 1;
      const before = state.enemy.hp;
      await performCardPlay(copies[0]);
      return { returned: state.hand[0] === copies[0], untouched: state.discard[0] === copies[1], damage: before - state.enemy.hp };
    });
    assert.deepEqual(clash, { returned: true, untouched: true, damage: 18 });
    // 11 base damage * focus 2 * knowledge 1.15 => 26, minus 8 clash damage => 18, once.
    await finish();
    assert.equal(await page.evaluate(() => WorldGame.getState().deck[0].fatigue), 2);
    await start("dungling");
    assert.equal(await page.evaluate(() => activeBattle.cardInstances[0].fatigue), 2);
    await finish("Lose");
    assert.equal(await page.evaluate(() => WorldGame.getState().deck[0].fatigue), 2);
    console.log("PASS: discard, refill, scry, duplicate chase return, clash knowledge and cross-battle fatigue including Lose");

    await page.evaluate(() => startNewRun());
    await page.evaluate(() => { world.knowledge.dungLore = true; });
    await start("dung_swarm");
    assert.equal(await page.evaluate(() => activeBattle.damageMultiplier), 1.15);
    assert.equal(await page.evaluate(() => state.hand.some((card) => card.cardId === "sweep")), true);
    let result = await page.evaluate(() => {
      const card = getBattleCard(activeBattle.cardInstances.find((entry) => entry.cardId === "sweep"));
      const preview = getPreviewCardDamage(card), before = state.enemy.hp;
      resolveCard(card, { effectiveCost: 1 });
      return { preview, damage: before - state.enemy.hp };
    });
    assert.deepEqual(result, { preview: 12, damage: 12 });
    result = await page.evaluate(async () => {
      state.enemy.bleedTicks = 1;
      const before = state.enemy.hp;
      await advanceNode();
      return before - state.enemy.hp;
    });
    assert.equal(result, 7);
    result = await page.evaluate(() => {
      const card = getBattleCard(activeBattle.cardInstances[0]);
      const preview = getPreviewCardDamage(card), before = state.enemy.hp;
      resolveCard(card, { effectiveCost: 1 });
      return { preview, damage: before - state.enemy.hp };
    });
    assert.deepEqual(result, { preview: 9, damage: 9 });
    result = await page.evaluate(async () => {
      const instance = activeBattle.cardInstances.find((card) => card.cardId === "adjustStance");
      instance.fatigue = 1; state.hand = []; state.handCostDeltas = []; state.discard = []; state.deck = [activeBattle.cardInstances[0]];
      state.player.focus = .5;
      const before = state.node;
      await performCardPlay(instance, -5);
      return { elapsed: state.node - before, hand: state.hand.length, fatigue: instance.fatigue, focus: state.player.focus };
    });
    assert.deepEqual(result, { elapsed: 1, hand: 0, fatigue: 0, focus: .5 });
    await finish("Win");
    assert.equal(await page.evaluate(() => world.deck.some((card) => card.temporary || card.cardId === "sweep")), false);
    console.log("PASS: real group battle, sweep/attack/bleed knowledge, zero-cost skill fatigue and temporary card isolation");

    await page.evaluate(() => { closeWorldModal(); addItem("greatSword"); addItem("heavyArmor"); addItem("ladyHat"); });
    await page.click("#characterButton");
    await page.click('[data-equip-item="rustySword"][data-equip-slot="leftHand"]');
    assert.equal(await page.evaluate(() => WorldGame.getState().equipment.leftHand), "rustySword");
    await page.click('[data-equip-item="rustySword"][data-equip-slot="rightHand"]');
    assert.equal(await page.evaluate(() => WorldGame.getState().equipment.leftHand), null);
    await page.click('[data-equip-item="greatSword"]');
    assert.equal(await page.evaluate(() => WorldGame.getState().equipment.leftHand), "greatSword");
    assert.equal(await page.evaluate(() => WorldGame.getState().equipment.rightHand), "greatSword");
    await page.click('[data-unequip-slot="rightHand"]');
    assert.equal(await page.evaluate(() => WorldGame.getState().equipment.leftHand), null);
    for (const [id, slot] of [["heavyArmor", "body"], ["ladyHat", "head"]]) {
      await page.click(`[data-equip-item="${id}"]`); await page.click(`[data-unequip-slot="${slot}"]`);
      assert.equal(await page.evaluate((key) => WorldGame.getState().equipment[key], slot), null);
    }
    await page.click("#closeCharacterButton");
    await page.evaluate(() => { world.deck[0].fatigue = 3; chooseInnateCard("eddie"); });
    await page.locator("#worldModalOptions button").first().click();
    assert.equal(await page.evaluate(() => world.deck.some((card) => card.instanceId === "card_1")), false);
    assert.equal(await page.evaluate(() => world.deck.find((card) => card.instanceId === "card_2").fatigue), 0);
    assert.equal(await page.evaluate(() => world.innateCardId), "quick");
    assert.equal(await page.evaluate(() => eventResources().filter((resource) => resource.kind === "card").length), 9);
    assert.deepEqual(errors, []);
    console.log("PASS: equipment hands/two-hand/body/head unequip and exact-copy internalization");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
