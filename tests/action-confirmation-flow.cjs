const assert = require("node:assert/strict");

(async () => {
  const h = await require("./sediment-browser.cjs")();
  const { browser, page, errors, snapshot, seed, place } = h;
  try {
    // Every authored stage uses the same single submission control.
    await h.fresh();
    const stages = await page.evaluate(() => window.ActionEventData.list().flatMap((event) =>
      Object.keys(event.stages).map((stage) => ({ eventId: event.id, stage }))));
    for (const { eventId, stage } of stages) {
      await page.evaluate(({ eventId, stage }) => {
        activeActionEvent = null;
        world.eventStates[eventId] = { nodeId: world.currentNodeId, stage, resolved: false };
        openActionEvent(eventId, getCurrentNode(), true);
      }, { eventId, stage });
      // Grounded survivors have moved on to a dialogue, outside the slot panel.
      if (!await page.locator("#actionEventPanel").isVisible()) continue;
      assert.deepEqual(await page.locator(".action-event-card > button").evaluateAll((buttons) =>
        buttons.filter((button) => !button.classList.contains("action-event-leave")).map((button) => button.textContent)),
      ["确认行动"], `${eventId}/${stage}`);
      assert.equal(await page.locator(".action-event-submit").isDisabled(), true);
    }

    for (const [node, cardId, slot, flag, staminaCost, hpCost] of [
      ["slice_mudbank", "guard", "fiber", "wrapMaterialTaken", 1, 0],
      ["slice_fungus_edge", "focus", "wall", "pipeFound", 0, 0],
      ["slice_climbcourt", "guard", "field", "courtPassToken", 0, 4],
      ["slice_pipe_seam", "adjust", "shell", "pipeOpened", 1, 0],
    ]) {
      await seed(node);
      const before = await snapshot();
      await place(cardId, slot);
      assert.deepEqual(await snapshot(), before, "placement must not settle the action");
      assert.equal(await page.locator(".action-event-fallback").count(), 0);
      assert.equal(await page.locator(".action-event-submit").isEnabled(), true);
      await page.locator(".action-event-submit").evaluate((button) => { button.click(); button.click(); });
      await page.waitForSelector("#worldModal:not(.hidden)");
      const after = await snapshot();
      assert.equal(after.flags[flag], true);
      assert.equal(after.stamina, before.stamina - staminaCost);
      assert.equal(after.hp, before.hp - hpCost);
      assert.equal(after.day, before.day);
      const selected = before.deck.find((card) => card.cardId === cardId);
      assert.equal(after.deck.find((card) => card.instanceId === selected.instanceId).fatigue, selected.fatigue + 1);
      assert.equal(await page.locator("#actionEventPanel").isVisible(), false);
      assert.ok((await page.locator("#worldModalBody").innerText()).trim());
      await h.button("继续").click();
    }
    assert.deepEqual(errors, []);
    console.log("PASS: every slot stage has one confirm control; four former shortcut sites settle only on confirmation, exactly once");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
