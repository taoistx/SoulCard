const assert = require("node:assert/strict");
const vm = require("node:vm");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    let exported;
    await page.route("**/__node_editor/save_world_map", async (route) => {
      exported = route.request().postDataJSON().source;
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.goto(`${base}/node-editor/index.html`);
    await page.waitForSelector("#editorApp:not(.is-loading)");
    const fogToggle = page.getByLabel("迷雾节点", { exact: true });
    assert.equal(await fogToggle.isChecked(), false);
    await fogToggle.check();
    assert.equal(await page.evaluate(() => currentNode().fog), true);
    await page.click("#undoButton");
    assert.equal(await fogToggle.isChecked(), false);
    await page.click("#redoButton");
    assert.equal(await fogToggle.isChecked(), true);
    await page.click("#copyNodeButton"); await page.click("#pasteNodeButton");
    assert.equal(await fogToggle.isChecked(), true);
    await page.click("#undoButton"); // Remove the copy before validating/exporting.
    await page.reload();
    await page.waitForSelector("#editorApp:not(.is-loading)");
    assert.equal(await fogToggle.isChecked(), true, "draft reload preserves fog");
    await page.click("#validateButton");
    assert.match(await page.locator("#inspector").innerText(), /检查：0 错误/);
    await page.click("#exportButton");
    await page.waitForFunction(() => document.querySelector("#feedback").textContent.includes("已保存"));
    const context = vm.createContext({ window: {} }); vm.runInContext(exported, context);
    const saved = context.window.WORLD_MAP_BUNDLE;
    assert.equal(saved.map.nodes.find((node) => node.id === saved.map.startNodeId).fog, true);
    await fogToggle.uncheck();
    assert.equal(await page.evaluate(() => currentNode().fog), undefined);
    console.log("PASS editor: toggle, undo/redo, copy, draft reload and export preserve fog; default is off");

    // Inject a small directed graph through the actual map script loader; no disk writes.
    await page.route(/\/world-map\.js(?:\?|$)/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\n(() => {
        const map = window.WORLD_MAP_BUNDLE.map;
        const eventSetId = map.nodes[0].eventSetId;
        const ids = ["start", "parent", "parent2", "mist", "mist2", "child", "grandchild", "sibling", "gated", "unrevealedParent"];
        map.nodes = ids.map((id, i) => ({ id, label: id, icon: "?", x: 80 + (i % 5) * 150, y: 80 + Math.floor(i / 5) * 160, eventSetId,
          ...(["mist", "mist2"].includes(id) ? { fog: true } : {}), ...(id === "gated" ? { revealFlag: "fogGate" } : {}) })).concat(map.nodes.filter(node => !ids.includes(node.id)));
        map.startNodeId = "start";
        map.edges = [["start","parent"], ["start","parent2"], ["parent","mist"], ["parent2","mist"], ["parent","sibling"], ["mist","mist2"], ["mist","child"], ["mist2","grandchild"], ["mist","gated"], ["unrevealedParent","mist"]].map(([from,to]) => ({from,to}));
        map.edges.find(e => e.to === "child").activeWhen = { mode: "all", clauses: [{source:"flag", key:"lockedFogEdge", operator:"eq", value:true}] };
      })();` });
    });
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => typeof WorldGame !== "undefined" && !document.querySelector("#startButton").disabled);
    await page.click("#startButton");
    await page.evaluate(() => {
      world.exploredNodes = new Set(["start", "parent", "parent2", "mist", "mist2", "child", "grandchild", "sibling"]);
      renderWorld();
    });
    const visible = () => page.locator("#worldNodes [data-node-id]").evaluateAll((nodes) => nodes.map((node) => node.dataset.nodeId).sort());
    const all = await visible();
    const explored = await page.evaluate(() => [...world.exploredNodes]);
    async function move(id) {
      await page.evaluate((id) => focusCameraOnNode(NODE_BY_ID.get(id), true), id);
      await page.waitForTimeout(280);
      await page.locator(`#worldNodes [data-node-id="${id}"]`).click();
      assert.equal(await page.evaluate(() => world.currentNodeId), id);
    }
    await move("mist");
    assert.deepEqual(await visible(), ["child", "mist", "mist2", "parent", "parent2"]);
    assert.equal(await page.locator("#worldEdges line").count(), 4, "hide edges with either endpoint outside fog view");
    assert.equal(await page.locator("#worldEdges line.locked").count(), 1, "locked edge does not change direct relationship visibility");
    assert.match(await page.locator("#mapHint").innerText(), /迷雾中/);
    assert.deepEqual(await page.evaluate(() => findReachablePath("mist", "sibling")), ["mist", "sibling"], "fog does not change reachability");
    assert.equal(await page.evaluate(() => isNodeAvailable(NODE_BY_ID.get("unrevealedParent"))), false, "child cannot reveal its parent");
    await page.evaluate(() => { setFlag("fogGate", true); renderWorld(); });
    assert.deepEqual(await visible(), ["child", "gated", "mist", "mist2", "parent", "parent2"]);
    await page.evaluate(() => { setFlag("fogGate", false); renderWorld(); });
    await move("mist2");
    assert.deepEqual(await visible(), ["grandchild", "mist", "mist2"], "consecutive fog uses the new current node's direct relatives");
    await move("grandchild");
    assert.deepEqual(await visible(), all, "non-fog destination restores the map");
    assert.doesNotMatch(await page.locator("#mapHint").innerText(), /迷雾中/);
    assert.deepEqual(await page.evaluate(() => [...world.exploredNodes]), explored, "filtering preserves explored state");
    await move("mist");
    assert.deepEqual(await visible(), ["child", "mist", "mist2", "parent", "parent2"]);
    await move("child");
    assert.deepEqual(await visible(), all);
    assert.equal(await page.evaluate(() => world.day), 1);
    assert.equal(await page.evaluate(() => {
      const copy = JSON.parse(JSON.stringify(window.WORLD_MAP_BUNDLE));
      copy.map.nodes[0].fog = "true";
      return validateWorldConfiguration(copy, window.WORLD_EVENT_SET_BUNDLE).some((error) => error.includes("fog"));
    }), true);
    assert.deepEqual(errors, []);
    console.log("PASS map: direct parents/children only, conditional reveal, no reverse reveal, hidden edges, consecutive fog, exit/reentry and unchanged reachability/day");
  } catch (error) {
    console.error("Browser diagnostics:", errors, await page.evaluate(() => typeof worldDataError !== "undefined" ? String(worldDataError) : "World unavailable"));
    throw error;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
