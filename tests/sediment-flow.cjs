const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
(async () => {
  const h = await require("./sediment-browser.cjs")();
  const { browser, page, errors, snapshot, button, fresh, dismiss, move, inspect, rest, place, resource, submit, action } = h;
  async function ending(day) {
    const s = await snapshot(); assert.equal(s.flags.sliceComplete, true); assert.equal(s.day, day);
    assert.match(await page.locator("#worldModalBody").innerText(), /你也是来下去的/);
    assert.equal(await button(/进殿|乘笼|下层|离开/).count(), 0);
    await page.keyboard.press("l"); assert.equal((await snapshot()).day, day);
    await button("……").click(); assert.equal(await page.locator("#worldModalTitle").innerText(), "你抵达了教堂");
    await page.screenshot({ path: path.join(os.tmpdir(), "sediment-ending.png") });
    await button("返回地图").click();
  }
  async function gather() {
    await move("slice_mudbank"); await action("quick", "corpse"); await action("guard", "fiber");
  }
  async function mask() {
    await move("eddie"); await inspect(); await button("逛艾迪的货摊").click();
    await page.locator('[data-shop-offer="mist_wrap"]').click(); await page.click("#shopExchangeButton"); await page.click("#closeShopButton");
    await dismiss(); await page.click("#characterButton"); await page.locator('[data-equip-item="eddieMistWrap"]').click(); await page.click("#closeCharacterButton");
  }
  try {
    await fresh();
    for (const id of ["eddie", "node", "node3", "slice_fungus_edge", "slice_climbcourt", "slice_drybench"]) await move(id);
    assert.equal((await snapshot()).stamina, 0); assert.equal((await snapshot()).hp, 53);
    await rest(); await move("slice_church_approach"); await move("slice_church_nave"); await ending(2);
    assert.equal((await snapshot()).hp, 66); assert.equal((await snapshot()).stamina, 4);
    await move("eddie"); assert.equal((await snapshot()).flags.churchArrivalDay, 2);
    console.log("PASS direct route: Day2, stamina 6 / 2, complete body, no NPC bargain/sacrifice/card requirement; ending returns to map");

    await fresh(); await move("eddie"); await gather(); await mask(); await move("node");
    await place("adjust", "field"); await resource("item", "freshFlesh", "monster"); await submit();
    await button(/告诉她岸台营地/).click();
    assert.equal((await snapshot()).flags.thomasLocation, "node", "conversation must not teleport Thomas");
    await move("node3"); await move("slice_fungus_edge"); assert.equal((await snapshot()).stamina, 0);
    await rest(); assert.equal((await snapshot()).flags.thomasLocation, "eddie");
    await move("slice_climbcourt"); await action("focus", "field"); await action("guard", "field");
    await move("slice_drybench"); assert.equal((await snapshot()).hp, 62);
    await button(/取下工具匣/).click(); await move("slice_church_approach"); await move("slice_church_nave"); await ending(2);
    assert.equal((await snapshot()).inventory.mistWrapMaterial, 1);
    console.log("PASS prepared route: Day2, stamina 6 / 4, independent bay resources, crafted/equipped protection, rescue + delayed migration, 62 HP");

    await fresh(); await move("eddie"); await gather(); await mask(); await move("node");
    await place("adjust", "field"); await resource("item", "freshFlesh", "monster"); await submit(); await button(/告诉她自己要上山/).click();
    await move("slice_emperor_yard");
    for (const name of ["小皇帝", "莫尔", "温妮"]) { await inspect(); await button(`与${name}交谈`).click(); assert.equal(await button(new RegExp(`向${name}献祭身体`)).count(), 1); }
    await move("node3"); assert.equal((await snapshot()).stamina, 0); await rest();
    await move("slice_fungus_edge"); await action("focus", "wall"); await move("slice_pipe_seam"); await action("adjust", "shell");
    await move("slice_climbcourt"); await action("focus", "field"); await move("slice_drybench");
    assert.equal((await snapshot()).hp, 66, "opened side route avoids narrow crossing damage");
    await button(/取下工具匣/).click();
    await button(/与幸存者 托马斯交谈/).click(); await button(/分享实际验证过的走法/).click();
    await move("slice_church_approach"); assert.equal((await snapshot()).stamina, 0); await rest();
    assert.equal((await snapshot()).flags.thomasLocation, "slice_church_approach");
    await move("slice_church_nave"); await ending(3);
    assert.equal((await snapshot()).exploredNodes.length, 12); assert.equal((await snapshot()).stamina, 5);
    assert.equal((await snapshot()).hp, 66);
    await page.click("#mapOverviewButton");
    assert.equal(await page.evaluate(() => camera.height === mapExtent.height), true);
    await page.screenshot({ path: path.join(os.tmpdir(), "sediment-map.png") });
    await page.click("#focusPlayerButton");
    assert.equal(await page.evaluate(() => camera.height), 680);
    console.log("PASS full route: Day3, stamina 6 / 6 / 1, all 12 nodes, hidden side route, three co-located NPCs, 66 HP");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
