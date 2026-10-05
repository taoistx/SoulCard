// Optional browser regression using the same existing Playwright runtime as other flow checks.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";
const nodes = { fallenSurvivor: "node8", breathingCorpses: "node4Copy", metalInMist: "node12", corpseDispute: "node6", livingHand: "node4" };

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge", args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const snapshot = () => page.evaluate(() => WorldGame.getState());
  async function fresh(eventId, setup = {}) {
    await page.evaluate(async ({ eventId, setup, nodes }) => {
      await WorldGame.startNewRun();
      const id = nodes[eventId], parent = incomingEdges(id)[0].from;
      // Seed already explored connecting roads; enter each event through the actual map UI.
      world.exploredNodes = new Set(WORLD_NODES.filter((node) => !node.revealFlag && node.id !== id).map((node) => node.id));
      world.currentNodeId = parent;
      if (setup.hp !== undefined) world.hp = setup.hp;
      if (setup.stamina !== undefined) world.stamina = setup.stamina;
      if (setup.flesh) addItem("freshFlesh", setup.flesh);
      if (setup.ritual) addCard("delay");
      if (setup.heart) world.sacrificed.heart = true;
      renderWorld(); focusCameraOnNode(NODE_BY_ID.get(parent), true);
    }, { eventId, setup, nodes });
    await page.locator(`[data-node-id="${nodes[eventId]}"]`).click();
    await page.waitForSelector("#actionEventPanel:not(.hidden)");
    assert.equal((await snapshot()).currentNodeId, nodes[eventId]);
  }
  async function place(cardId, bait = false, slot = "subject") {
    const instance = await page.evaluate((id) => world.deck.find((card) => card.cardId === id).instanceId, cardId);
    await page.locator('[data-tab="card"]').click();
    await page.locator(`[data-resource="card:${instance}"]`).click();
    await page.locator(`[data-slot="${slot}"]`).click();
    if (bait) {
      await page.locator('[data-tab="item"]').click();
      await page.locator('[data-resource="item:freshFlesh"]').click();
      await page.locator('[data-slot="bait"]').click();
    }
  }
  async function submit() {
    assert.equal(await page.locator(".action-event-submit").isEnabled(), true);
    await page.locator(".action-event-submit").click();
    await page.waitForSelector("#worldModal:not(.hidden)");
  }
  const proceed = () => page.locator("#worldModalOptions button").first().click();
  async function close() {
    await page.getByRole("button", { name: /离开.*返回地图/ }).click();
  }
  async function rest() {
    await page.click("#longRestButton");
    await page.getByRole("button", { name: /长休到次日/ }).click();
    await close();
  }
  try {
    await page.goto(base);
    await page.waitForFunction(() => !document.querySelector("#startButton").disabled);
    for (const eventId of Object.keys(nodes).filter((id) => id !== "livingHand")) {
      for (const observeSlot of ["subject", "field"]) {
        await fresh(eventId);
        await place("focus", false, observeSlot);
        await place("guard", false, observeSlot === "subject" ? "field" : "subject");
        await submit();
        const result = await snapshot();
        assert.equal(result.deck.find((card) => card.cardId === "focus").fatigue, 0);
        assert.equal(result.deck.find((card) => card.cardId === "guard").fatigue, 1);
        assert.deepEqual(result.knowledge, {});
        await proceed();
        assert.ok(!(await snapshot()).eventStates[eventId].outcome.endsWith("_observe"));
      }
    }
    await fresh("metalInMist"); await place("focus"); await place("adjust", false, "field");
    await submit(); await proceed();
    assert.equal((await snapshot()).flags.distractedMistCreature, true);
    assert.equal((await snapshot()).deck.find((card) => card.cardId === "focus").fatigue, 0);
    await fresh("corpseDispute", { ritual: true, heart: true });
    await place("focus"); await place("delay", false, "field"); await submit(); await proceed();
    assert.equal((await snapshot()).knowledge.corpseAnomaly, true);
    assert.equal((await snapshot()).knowledge.corpseCorruption, undefined);
    await fresh("livingHand"); await place("focus", false, "hand"); await place("adjust", false, "mud");
    assert.equal(await page.locator(".action-event-submit").isEnabled(), false);
    assert.match(await page.locator(".action-event-status").innerText(), /其他行动/);
    await page.locator('[data-retract="mud"]').click();
    assert.equal(await page.locator(".action-event-submit").isEnabled(), true);
    console.log("PASS: common priority across every event, both placements, tricks/rituals and unmet-action blocking");
    for (const eventId of Object.keys(nodes).filter((id) => !["livingHand", "breathingCorpses"].includes(id))) {
      await fresh(eventId);
      await place("focus"); await submit();
      let result = await snapshot();
      assert.equal(result.deck.find((card) => card.cardId === "focus").fatigue, 1);
      assert.equal(result.day, 1);
      await proceed();
      assert.equal((await snapshot()).eventStates[eventId].resolved, true);
      const before = (await snapshot()).inventory;
      await page.keyboard.press("e");
      assert.equal(await page.locator("#actionEventPanel").isVisible(), false);
      assert.deepEqual((await snapshot()).inventory, before);
      await close();
      if (eventId === "fallenSurvivor") {
        assert.equal(result.flags.revealedDragTrail, true);
        await page.locator('[data-node-id="fallenDragTrail"]').click();
        assert.match(await page.locator("#worldModalBody").innerText(), /测试版尚未接入/);
      } else if (eventId === "metalInMist") {
        assert.equal(result.knowledge.mistRhythm, true);
        await rest();
        const hp = (await snapshot()).hp;
        await page.locator('[data-node-id="metalSoundSource"]').click();
        assert.equal((await snapshot()).hp, hp);
        assert.match(await page.locator("#worldModalBody").innerText(), /金属杯/);
      }
    }
    console.log("PASS: three terminal observations, hidden trail, permanent mist rhythm");

    await fresh("fallenSurvivor");
    let before = await snapshot();
    await page.locator(".action-event-leave").click();
    assert.equal((await snapshot()).stamina, before.stamina);
    assert.deepEqual((await snapshot()).deck, before.deck);
    await page.keyboard.press("e");
    await place("quick"); await submit(); await proceed();
    assert.match(await page.locator("#worldModalTitle").innerText(), /他还活着/);
    assert.equal((await snapshot()).inventory.freshFlesh, 1);
    await page.getByRole("button", { name: /杀死/ }).click();
    assert.equal((await snapshot()).inventory.freshFlesh, 1);
    await close(); await page.keyboard.press("e");
    assert.equal((await snapshot()).inventory.freshFlesh, 1);
    await fresh("fallenSurvivor"); await place("quick"); await submit(); await proceed();
    await page.getByRole("button", { name: /离开.*留下他/ }).click();
    assert.equal((await snapshot()).flags.fallenAbandoned, true);
    await fresh("fallenSurvivor", { hp: 2 }); await place("guard"); await submit();
    assert.equal((await snapshot()).hp, 1);
    await proceed(); await page.keyboard.press("e");
    assert.match(await page.locator("#worldModalBody").innerText(), /无法移动.*测试版尚未接入/);
    await fresh("fallenSurvivor"); await place("adjust");
    before = await snapshot(); await submit(); await proceed();
    assert.equal((await snapshot()).flags.liedToDyingSurvivor, true);
    assert.equal((await snapshot()).stamina, before.stamina);
    assert.equal((await snapshot()).deck.find((card) => card.cardId === "adjust").fatigue, 1);
    console.log("PASS: free leave/resume, both grounded choices, nonlethal rescue, deception fatigue");

    await fresh("breathingCorpses", { flesh: 1 });
    assert.deepEqual(await page.locator(".action-event-target h3").allInnerTexts(), ["尸堆", "周围环境"]);
    assert.equal(await page.locator(".action-event-story").innerText(), "路边对着三具高度腐烂的尸体，尸体正在整齐缓慢上下起伏");
    assert.equal(await page.locator('[data-slot="bait"]').count(), 0);
    await place("adjust");
    assert.equal(await page.locator(".action-event-submit").isEnabled(), false);
    await page.locator('[data-retract="subject"]').click();
    await place("focus", false, "field"); await submit();
    assert.equal(await page.locator("#worldModalBody").innerText(), "四周有很多杂乱的脚步，来往路过的东西应该已经对尸体习以为常");
    await proceed();
    assert.equal((await snapshot()).eventStates.breathingCorpses.stage, "opening");
    await place("focus"); await submit();
    assert.equal(await page.locator("#worldModalBody").innerText(), "你发现，三个人死亡时间不同，却被人为叠在一起。");
    await proceed();
    assert.equal((await snapshot()).eventStates.breathingCorpses.stage, "examined");
    assert.equal((await snapshot()).eventStates.breathingCorpses.corpseObservations, 1);
    before = await snapshot();
    await page.locator(".action-event-leave").click();
    assert.equal((await snapshot()).stamina, before.stamina);
    await page.keyboard.press("e");
    assert.equal(await page.locator("#actionEventPanel").isVisible(), true);
    await place("focus"); await submit();
    assert.equal(await page.locator("#worldModalBody").innerText(), "尸体下藏着一窝巨大的蠕虫，这个尸堆更像是人为搭建的饲养堆");
    assert.equal((await snapshot()).knowledge.wormFarming, true);
    assert.equal((await snapshot()).eventStates.breathingCorpses.corpseObservations, 2);
    await proceed();
    assert.equal((await snapshot()).eventStates.breathingCorpses.resolved, false);
    assert.equal(await page.locator('[data-node-id="corpseHiddenPath"]').count(), 0);
    await page.locator('[data-tab="knowledge"]').click();
    await page.locator('[data-resource="knowledge:wormFarming"]').click();
    await page.locator('[data-slot="subject"]').click();
    await place("focus", false, "field");
    assert.equal(await page.locator(".action-event-submit").isEnabled(), true);
    await submit();
    assert.match(await page.locator("#worldModalBody").innerText(), /隐蔽的小径/);
    assert.equal((await snapshot()).flags.revealedCorpseHiddenPath, true);
    assert.equal((await snapshot()).knowledge.wormFarming, true);
    assert.equal((await snapshot()).inventory.freshFlesh, 1);
    await proceed();
    assert.equal((await snapshot()).eventStates.breathingCorpses.resolved, true);
    await page.locator('[data-node-id="corpseHiddenPath"]').click();
    assert.match(await page.locator("#worldModalBody").innerText(), /测试版尚未接入/);
    assert.equal((await snapshot()).day, 1);
    assert.equal(await page.locator('[data-node-id="corpseNestExit"]').count(), 0);
    for (const [card, slot, expected] of [
      ["quick", "subject", /尸堆的起伏停止/],
      ["quick", "field", /四周疯狂挥舞/],
    ]) {
      await fresh("breathingCorpses", { flesh: 1 }); await place(card, false, slot); await submit();
      assert.match(await page.locator("#worldModalBody").innerText(), expected);
      await proceed();
      const result = await snapshot();
      assert.equal(result.eventStates.breathingCorpses.resolved, true);
      assert.equal(result.inventory.freshFlesh, 1);
      assert.deepEqual(result.threats, {});
      assert.equal(result.knowledge.wormFarming, undefined);
    }
    for (const slot of ["subject", "field"]) {
      await fresh("breathingCorpses"); await place("guard", false, slot); await submit(); await proceed();
      assert.equal((await snapshot()).eventStates.breathingCorpses.stage, "opening");
      assert.equal((await snapshot()).eventStates.breathingCorpses.resolved, false);
    }
    console.log("PASS: corpse fixed targets, repeated observations, worm knowledge, hidden path and noncombat endings");

    await fresh("livingHand");
    assert.deepEqual(await page.locator(".action-event-target h3").allInnerTexts(), ["手", "泥水"]);
    assert.equal((await snapshot()).day, 1);
    assert.equal(await page.locator(".action-event-story").innerText(), "泥水中露出一只人的手，手指还偶尔动一下，似乎尚有生机");
    await place("focus", false, "mud"); await submit();
    assert.match(await page.locator("#worldModalBody").innerText(), /6根手指/);
    await proceed();
    assert.equal((await snapshot()).eventStates.livingHand.stage, "opening");
    assert.equal((await snapshot()).eventStates.livingHand.resolved, false);
    await place("guard", false, "hand"); await submit(); await proceed();
    assert.equal((await snapshot()).eventStates.livingHand.stage, "trapped");
    assert.equal((await snapshot()).eventStates.livingHand.failedStrikes, 0);
    assert.equal(await page.locator(".action-event-leave").count(), 0);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#actionEventPanel").isVisible(), true);
    before = await snapshot();
    const noFlesh = await page.evaluate(async () => {
      try { await submitEventAction("livingHand", { mud: "item:freshFlesh" }); }
      catch (error) { return error.message; }
    });
    assert.ok(noFlesh);
    assert.deepEqual(await snapshot(), before);
    await place("quick", false, "mud"); await submit();
    assert.match(await page.locator("#worldModalBody").innerText(), /感动了痛疼/);
    await proceed();
    assert.equal((await snapshot()).eventStates.livingHand.failedStrikes, 1);
    await place("thrust", false, "hand"); await submit();
    assert.equal((await snapshot()).hp, 0);
    assert.equal((await snapshot()).eventStates.livingHand.failedStrikes, 2);
    assert.match(await page.locator("#worldModalBody").innerText(), /巨大压力包裹/);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#worldModal").isVisible(), true);
    assert.equal(await page.getByRole("button", { name: /离开.*返回地图/ }).count(), 0);
    await page.getByRole("button", { name: /重新开始 Vertical Slice/ }).click();
    assert.equal((await snapshot()).hp > 0, true);
    assert.equal((await snapshot()).eventStates.livingHand, undefined);

    for (const fatalCard of ["focus", "guard"]) {
      await fresh("livingHand"); await place("guard", false, "mud"); await submit(); await proceed();
      await place(fatalCard, false, "hand"); await submit();
      assert.equal((await snapshot()).hp, 0);
      assert.match(await page.locator("#worldModalBody").innerText(), /巨大压力包裹/);
    }
    await fresh("livingHand"); await place("quick", false, "hand"); await place("thrust", false, "mud");
    await submit(); await proceed();
    assert.equal((await snapshot()).eventStates.livingHand.resolved, true);
    assert.equal((await snapshot()).deck.find((card) => card.cardId === "quick").fatigue, 1);
    assert.equal((await snapshot()).deck.find((card) => card.cardId === "thrust").fatigue, 1);
    await fresh("livingHand"); await place("guard", false, "hand"); await submit(); await proceed();
    await place("quick", false, "hand"); await place("thrust", false, "mud"); await submit(); await proceed();
    assert.equal((await snapshot()).eventStates.livingHand.failedStrikes, 1);
    assert.equal((await snapshot()).deck.find((card) => card.cardId === "quick").fatigue, 1);
    assert.equal((await snapshot()).deck.find((card) => card.cardId === "thrust").fatigue, 1);
    await place("heavy", false, "mud"); await submit(); await proceed();
    assert.equal((await snapshot()).eventStates.livingHand.resolved, true);
    await fresh("livingHand"); await place("guard", false, "hand"); await submit(); await proceed();
    await place("quick", false, "hand"); await place("heavy", false, "mud"); await submit(); await proceed();
    assert.equal((await snapshot()).eventStates.livingHand.resolved, true);
    assert.equal((await snapshot()).deck.find((card) => card.cardId === "quick").fatigue, 1);
    assert.equal((await snapshot()).deck.find((card) => card.cardId === "heavy").fatigue, 1);
    await fresh("livingHand", { flesh: 1 }); await place("guard", false, "mud"); await submit(); await proceed();
    await page.locator('[data-tab="item"]').click();
    await page.locator('[data-resource="item:freshFlesh"]').click();
    await page.locator('[data-slot="mud"]').click();
    assert.equal(await page.locator(".action-event-submit").isEnabled(), true);
    await submit();
    assert.match(await page.locator("#worldModalBody").innerText(), /血肉的腥味吸引/);
    assert.equal((await snapshot()).inventory.freshFlesh, undefined);
    await proceed();
    assert.equal((await snapshot()).eventStates.livingHand.resolved, true);
    assert.equal((await snapshot()).deck.find((card) => card.cardId === "guard").fatigue, 1);
    assert.equal((await snapshot()).deck.find((card) => card.cardId === "focus").fatigue, 0);
    assert.equal((await snapshot()).day, 1);
    assert.equal(await page.locator('[data-node-id="handDestination"]').count(), 0);
    console.log("PASS: living hand phases, two-card fatigue, heavy escape, meat escape and locked death");

    await fresh("metalInMist"); await place("guard"); before = await snapshot();
    await submit(); await proceed();
    assert.equal((await snapshot()).hp, before.hp - 6);
    assert.equal((await snapshot()).stamina, before.stamina - 1);
    assert.equal((await snapshot()).currentNodeId, "metalSoundSource");
    await close(); await page.keyboard.press("e");
    assert.equal((await snapshot()).hp, before.hp - 6);
    await fresh("metalInMist"); await place("adjust"); await submit(); await proceed();
    before = await snapshot();
    await page.locator('[data-node-id="metalSoundSource"]').click();
    assert.equal((await snapshot()).hp, before.hp);
    await fresh("metalInMist"); await place("adjust"); await submit(); await proceed(); await rest();
    before = await snapshot();
    await page.locator('[data-node-id="metalSoundSource"]').click();
    assert.equal((await snapshot()).hp, before.hp - 6);
    await fresh("metalInMist"); await place("quick"); await submit(); await proceed();
    assert.equal((await snapshot()).flags.alarmedMetalSource, true);
    before = await snapshot(); await page.locator('[data-node-id="metalSoundSource"]').click();
    assert.equal((await snapshot()).hp, before.hp - 6);
    console.log("PASS: direct arrival avoids double damage; distraction expires on rest; violence alarms source");

    await fresh("corpseDispute"); before = await snapshot();
    await page.locator(".action-event-leave").click(); await page.keyboard.press("e");
    assert.equal(await page.locator("#actionEventPanel").isVisible(), true);
    await page.locator(".action-event-leave").click();
    await page.locator('[data-node-id="node"]').click();
    await page.locator('[data-node-id="node6"]').click(); await page.keyboard.press("e");
    assert.match(await page.locator("#worldModalTitle").innerText(), /三具尸体/);
    assert.equal((await snapshot()).day, before.day);
    await page.getByRole("button", { name: /取得腐败血肉/ }).click();
    assert.equal((await snapshot()).inventory.rottenFlesh, 3);
    await close(); await page.keyboard.press("e");
    assert.equal(await page.getByRole("button", { name: /取得腐败血肉/ }).count(), 0);
    assert.equal((await snapshot()).inventory.rottenFlesh, 3);
    for (const card of ["quick", "adjust", "guard"]) {
      await fresh("corpseDispute"); await place(card); await submit(); await proceed();
      assert.equal((await snapshot()).eventStates.corpseDispute.resolved, true);
      if (card !== "guard") assert.equal((await snapshot()).inventory.rottenFlesh, 1);
    }
    for (const eventId of ["corpseDispute"]) {
      await fresh(eventId, { ritual: true });
      assert.equal(await page.locator('.action-resource.ritual').isDisabled(), true);
      await fresh(eventId, { ritual: true, heart: true });
      await place("delay"); await submit(); await proceed();
      assert.equal((await snapshot()).eventStates[eventId].resolved, true);
      assert.equal((await snapshot()).deck.find((card) => card.cardId === "delay").fatigue, 1);
    }
    console.log("PASS: actual departure required, three corpses picked once, dispute branches and heart-gated rituals");

    await fresh("breathingCorpses"); await place("focus"); await submit(); await proceed();
    await place("guard", false, "field"); await submit(); await proceed();
    assert.equal((await snapshot()).eventStates.breathingCorpses.stage, "examined");
    assert.equal((await snapshot()).eventStates.breathingCorpses.corpseObservations, 1);
    assert.equal((await snapshot()).knowledge.wormFarming, undefined);
    assert.equal((await snapshot()).day, 1);
    await page.locator(".action-event-leave").click(); await rest();
    assert.equal((await snapshot()).deck.every((card) => card.fatigue === 0), true);
    await page.click("#characterButton");
    await page.locator('[data-equip-item="rustySword"][data-equip-slot="leftHand"]').click();
    assert.equal((await snapshot()).equipment.leftHand, "rustySword");
    await page.locator('[data-unequip-slot="leftHand"]').click();
    assert.equal((await snapshot()).equipment.leftHand, null);
    await page.keyboard.press("Escape");
    await page.goto(`${base}/node-editor/events.html`);
    await page.waitForSelector("#eventEditorApp:not(.is-loading)");
    await page.click("#validateButton");
    assert.match(await page.locator("#inspector").innerText(), /检查：0 错误/);
    assert.deepEqual(errors, []);
    console.log("PASS: rest clears fatigue, equip/unequip, editor validation and no browser errors");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
