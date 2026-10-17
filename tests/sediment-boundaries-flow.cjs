const assert = require("node:assert/strict");
(async () => {
  const h = await require("./sediment-browser.cjs")();
  const { browser, page, errors, snapshot, button, seed, fresh, dismiss, move, inspect, rest, place, resource, submit, action, finishBattle } = h;
  try {
    await fresh();
    const reveal = await page.evaluate(() => {
      world.exploredNodes = new Set(["start", "slice_drybench"]);
      const reverse = isNodeAvailable(NODE_BY_ID.get("slice_climbcourt"));
      world.exploredNodes.add("slice_fungus_edge");
      const hidden = isNodeAvailable(NODE_BY_ID.get("slice_pipe_seam"));
      world.flags.pipeFound = true;
      const found = isNodeAvailable(NODE_BY_ID.get("slice_pipe_seam"));
      const path = findReachablePath("start", "slice_church_approach");
      world.exploredNodes.delete("slice_fungus_edge");
      return {reverse,hidden,found,path,flagAlone:isNodeAvailable(NODE_BY_ID.get("slice_pipe_seam"))};
    });
    assert.deepEqual(reveal, { reverse:false, hidden:false, found:true, path:["start","slice_church_approach"], flagAlone:false });
    await page.evaluate(() => { world.stamina=0; renderWorld(); });
    await move("slice_drybench");
    console.log("PASS reveal: parents only, extra condition retained, flag alone cannot reveal, non-adjacent explored destination remains reachable");

    await seed("slice_mudbank", {}, {}, 40); await action("quick", "corpse"); await action("guard", "fiber");
    const harvested = await snapshot(); assert.equal(harvested.inventory.freshFlesh,1); assert.equal(harvested.inventory.mistWrapMaterial,1);
    await place("guard","fiber"); assert.equal(await page.locator(".action-event-submit").isDisabled(),true);
    await dismiss(); await page.click("#characterButton"); await page.locator('[data-item-use="freshFlesh"]').click();
    assert.equal((await snapshot()).hp,50); assert.equal((await snapshot()).day,1);
    await page.click("#closeCharacterButton"); await rest(); await inspect();
    assert.match(await page.locator(".action-event-story").innerText(),/取肉的切痕/);
    assert.match(await page.locator(".action-event-story").innerText(),/空腔/);
    assert.equal((await snapshot()).inventory.mistWrapMaterial,1);
    await place("quick","corpse"); assert.equal(await page.locator(".action-event-submit").isDisabled(),true);
    console.log("PASS independent resource sources, irreversible depletion, eating heals only HP, rest does not refill sources");

    await seed("slice_climbcourt", {}, {freshFlesh:1});
    await resource("item", "freshFlesh", "ridge"); await submit();
    assert.equal((await snapshot()).inventory.freshFlesh,undefined);
    assert.equal((await snapshot()).flags.courtPassToken,true);
    await move("slice_drybench"); assert.equal((await snapshot()).hp,66);
    await seed("slice_emperor_yard"); await button("与小皇帝交谈").click();
    assert.equal(await button(/换.*诱饵/).count(),0);
    console.log("PASS fresh flesh is consumed directly as bait, saves crossing damage, and has no processing/trade loop");

    await seed("slice_pipe_seam",{pipeFound:true}); await page.evaluate(() => { world.stamina=0; });
    const before = await snapshot();
    const error = await page.evaluate(async () => { try { await submitV06Action("slicePipe", {shell:`card:${world.deck.find(c=>c.cardId==="adjust").instanceId}`}); } catch(e) {return e.message;} });
    assert.match(error,/体力不足/); assert.deepEqual(await snapshot(),before);
    await seed("slice_climbcourt"); const beforeBattle=await snapshot();
    await page.evaluate(() => { window.BattleBridge={...BattleBridge,startBattle:async()=>{throw new Error("fixture bridge failure");}}; });
    await place("quick","monster"); await page.locator(".action-event-submit").click();
    await page.waitForFunction(()=>document.querySelector("#worldModalTitle").textContent==="行动未完成");
    assert.deepEqual(await snapshot(),beforeBattle);
    console.log("PASS insufficient resources and failed battle startup roll back state, card fatigue and costs");

    for (const outcome of ["Win","Escape","Lose"]) {
      await seed("slice_climbcourt"); await place("quick","monster"); await page.locator(".action-event-submit").click();
      await page.waitForFunction(()=>state?.active); await finishBattle(outcome);
      const s=await snapshot(); assert.equal(Boolean(s.flags.courtSwarmCleared),outcome==="Win");
      assert.equal(s.deck[0].fatigue,1); assert.equal(s.hp===0,outcome==="Lose");
    }
    await seed("node3"); await button("与玄一螂交谈").click(); await button(/挑战他/).click();
    await page.waitForFunction(()=>state?.active); await finishBattle("Escape"); assert.equal((await snapshot()).inventory.oldMistWrap,undefined);
    await dismiss(); await inspect(); await button("与玄一螂交谈").click(); await button(/挑战他/).click();
    await page.waitForFunction(()=>state?.active); assert.equal((await snapshot()).stamina,5); await finishBattle("Win");
    assert.equal((await snapshot()).inventory.oldMistWrap,1); await rest(); assert.equal((await snapshot()).flags.genichiroLocation,null);
    console.log("PASS real BattleBridge group Win/Escape/Lose and NPC single combat; revisit costs, one-time loot, death precedes migration");

    await seed("node",{thomasRescue:"rescued",thomasPrepared:true}); await button(/与幸存者 托马斯交谈/).click(); await button(/告诉她自己要上山/).click();
    assert.equal((await snapshot()).flags.thomasLocation,"node"); await rest(); assert.equal((await snapshot()).flags.thomasLocation,"slice_drybench");
    const day2=await snapshot(); await page.evaluate(()=>advanceV06Day()); assert.deepEqual(await snapshot(),day2);
    await rest(); assert.equal((await snapshot()).flags.thomasLocation,"slice_church_approach");
    await page.evaluate(()=>setFlag("thomasKilled",true)); await rest(); assert.equal((await snapshot()).flags.thomasLocation,null);
    console.log("PASS conversations record intent; rest drives staged travel, day settlement is idempotent and dead people never travel");

    await seed("node3",{pipeOpened:true}); await rest();
    assert.equal((await snapshot()).flags.genichiroWound,"none", "a cleared bypass spares the later climber");
    await seed("node3",{genichiroAidGiven:true}); await rest();
    assert.equal((await snapshot()).flags.genichiroWound,"treated");
    assert.equal((await snapshot()).flags.genichiroAidUsed,true);

    await seed("node3",{}, {eddieMistWrap:1}); await dismiss(); await page.click("#characterButton");
    await page.locator('[data-equip-item="eddieMistWrap"]').click(); await page.click("#closeCharacterButton");
    await move("slice_fungus_edge"); assert.equal((await snapshot()).hp,66);
    await dismiss(); await page.evaluate(()=>unequipSlot("head")); await move("node3"); await move("slice_fungus_edge"); assert.equal((await snapshot()).hp,63);
    await inspect(); assert.equal((await snapshot()).hp,63);
    await page.evaluate(()=>{ equipItem("eddieMistWrap","head"); });
    await dismiss(); await page.evaluate(()=>sacrificeBodyPart("head")); await move("node3"); await move("slice_fungus_edge");
    assert.equal((await snapshot()).equipment.head,null); assert.equal((await snapshot()).hp,57);
    console.log("PASS actual head equipment protects; unwearing and sacrificing remove protection; inspecting a site does not charge entry twice");

    await seed("slice_climbcourt"); await action("guard","field"); assert.equal((await snapshot()).hp,62);
    await move("slice_drybench"); assert.equal((await snapshot()).hp,62); assert.equal((await snapshot()).flags.courtPassToken,false);
    await seed("slice_climbcourt"); await action("guard","field"); await rest(); assert.equal((await snapshot()).flags.courtPassToken,false);
    await move("slice_drybench"); assert.equal((await snapshot()).hp,60);
    await seed("slice_pipe_seam",{pipeFound:true}); await action("adjust","shell"); await move("slice_drybench"); assert.equal((await snapshot()).hp,66);
    await button(/取下工具匣/).click(); const supply=await snapshot(); assert.equal(await button(/工具匣只剩/).isDisabled(),true); await page.evaluate(()=>v06TakeUpperMaterial()); assert.deepEqual(await snapshot(),supply);
    console.log("PASS temporary traversal is spent/expired, permanent side route saves HP, upper material exists once at its actual location");
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
