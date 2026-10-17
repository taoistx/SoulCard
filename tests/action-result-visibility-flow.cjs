const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

(async () => {
  const h = await require("./sediment-browser.cjs")();
  const { browser, page, errors, seed, place, button, snapshot } = h;
  const panel = page.locator("#actionEventPanel");
  const modal = page.locator("#worldModal");
  async function reading() {
    assert.equal(await modal.isVisible(), true);
    assert.equal(await panel.isVisible(), false);
  }
  async function interacting() {
    assert.equal(await panel.isVisible(), true);
    assert.equal(await modal.isVisible(), false);
  }
  try {
    // The shared result entry must hide an already-open panel itself.
    await seed("slice_mudbank");
    await page.evaluate(() => showActionResult({ result: "第一段结果" }, {
      title: "行动结果", allowClose: false,
      options: [{ label: "读下一段", action: () => showWorldModal({
        title: "行动结果", bodyText: "最后一段结果", allowClose: false,
        options: [{ label: "读完", action: () => openV06Event("sliceMudbank", getCurrentNode(), true) }],
      }) }],
    }));
    await reading();
    await button("读下一段").click(); await reading();
    await button("读完").click(); await interacting();

    // Exercise multiple authored result nodes through a real staged action.
    const script = JSON.parse(readFileSync(require.resolve("../world-dialogues/event_breathingCorpses.json"), "utf8"));
    const first = script.nodes.result_opening_corpse_observe_first;
    const continuation = structuredClone(first.options);
    first.options = [{ id: "next_page", label: "读下一段", next: "result_last_page" }];
    script.nodes.result_last_page = { body: "尸堆下仍有动静。", allowClose: false, options: continuation };
    await page.route("**/world-dialogues/event_breathingCorpses.json", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(script),
    }));
    await h.fresh();
    await page.evaluate(() => openActionEvent("breathingCorpses", getCurrentNode(), true));
    await place("focus", "subject");
    await page.locator(".action-event-submit").click();
    await reading();
    const settled = await snapshot();
    assert.equal(settled.eventStates.breathingCorpses.stage, "examined");
    await page.keyboard.press("Escape"); await reading();
    await button("读下一段").click(); await reading();
    assert.equal(await page.locator("#worldModalBody").innerText(), "尸堆下仍有动静。");
    assert.deepEqual(await snapshot(), settled, "paging must not settle another action");
    await button("继续").click(); await interacting();
    assert.equal(await page.locator(".action-event-slot.filled").count(), 0);
    assert.deepEqual(await snapshot(), settled);

    // A terminal outcome must not reopen slots when its text ends.
    await place("quick", "subject");
    await page.locator(".action-event-submit").click(); await reading();
    await button("继续").click();
    assert.equal(await panel.isVisible(), false);
    assert.equal((await snapshot()).eventStates.breathingCorpses.resolved, true);

    // Failed actions stay hidden until the explicit retry, with all costs rolled back.
    await seed("slice_climbcourt");
    const before = await snapshot();
    await page.evaluate(() => { window.BattleBridge = { ...BattleBridge, startBattle: async () => { throw new Error("fixture failure"); } }; });
    await place("quick", "monster");
    await page.locator(".action-event-submit").click();
    await page.waitForFunction(() => document.querySelector("#worldModalTitle").textContent === "行动未完成");
    await reading();
    assert.deepEqual(await snapshot(), before);
    await button("返回行动选择").click(); await interacting();
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(errors, []);
    console.log("PASS: result text hides slots; only the last continuation reopens them; terminal and failed outcomes respect visibility and costs");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
