const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge", args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${base}/npc-editor/index.html?kind=world&id=site_start`);
    await page.waitForSelector("#editorApp:not(.is-loading)");
    assert.equal(await page.locator("#npcSelect").inputValue(), "world:site_start");
    assert.match(await page.locator("#inspector").innerText(), /world-dialogues\/site_start.json/);
    assert.match(await page.locator("#inspector").innerText(), /v06_start/);
    await page.selectOption("#dialogueKind", "world");
    await page.fill("#dialogueSearch", "site_start");
    assert.equal(await page.locator("#npcSelect option").count(), 1);
    await page.fill("#dialogueSearch", "");
    await page.locator("#nodeList button").filter({ hasText: "root" }).click();
    const before = await page.getByLabel("默认文本", { exact: true }).inputValue();
    await page.getByLabel("默认文本", { exact: true }).fill("已编辑的岸台正文");
    await page.getByLabel("默认文本", { exact: true }).blur();
    await page.click("#undoButton");
    assert.equal(await page.getByLabel("默认文本", { exact: true }).inputValue(), before);
    await page.click("#redoButton");
    await page.getByRole("button", { name: "1. 检查甲缝中的白絮", exact: true }).click();
    await page.locator("section.card").filter({ has: page.getByRole("heading", { name: "选项文字", exact: true }) }).getByLabel("默认文本").fill("检查编辑后的分支");
    await page.getByLabel(/^下一节点/).focus();
    await page.click("#sandboxButton");
    assert.equal(await page.locator("#previewBody").innerText(), "已编辑的岸台正文");
    await page.locator("#previewOptions").getByRole("button", { name: /检查编辑后的分支/ }).click();
    assert.match(await page.locator("#previewBody").innerText(), /白絮已经扎进/);
    assert.doesNotMatch(await page.locator("#previewOptions").innerText(), /自动追加献祭/);
    await page.click("#closeSandboxButton");
    const downloadPromise = page.waitForEvent("download");
    await page.click("#exportButton");
    const download = await downloadPromise;
    const exported = JSON.parse(readFileSync(await download.path(), "utf8"));
    assert.equal(download.suggestedFilename(), "site_start.json");
    assert.equal(exported.nodes.root.body, "已编辑的岸台正文");
    assert.match(await page.locator("#feedback").innerText(), /world-dialogues\/site_start.json/);

    // A world document can share an NPC's ID. Import, rename and undo must not alter the NPC.
    const collision = { ...exported, id: "eddie", name: "同 ID 世界对话" };
    await page.locator("#importFile").setInputFiles({ name: "eddie.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(collision)) });
    assert.equal(await page.locator("#npcSelect").inputValue(), "world:eddie");
    await page.getByLabel("稳定 ID", { exact: true }).fill("world_eddie_copy");
    await page.getByLabel("稳定 ID", { exact: true }).blur();
    await page.click("#undoButton");
    assert.equal(await page.locator("#npcSelect").inputValue(), "world:eddie");
    await page.selectOption("#npcSelect", "eddie");
    assert.equal(await page.getByLabel("显示名称", { exact: true }).inputValue(), "渔夫 艾迪");
    await page.reload(); await page.waitForSelector("#editorApp:not(.is-loading)");
    await page.selectOption("#npcSelect", "world:eddie");
    assert.equal(await page.getByLabel("显示名称", { exact: true }).inputValue(), "同 ID 世界对话");

    await page.selectOption("#npcSelect", "world:ending_church");
    await page.click("#sandboxButton");
    await page.selectOption("#sandboxEntry", "complete");
    await page.fill("#sandboxContext", '{"churchArrivalDay":3}');
    await page.click("#startSandboxButton");
    assert.match(await page.locator("#previewBody").innerText(), /首次抵达：第 3 天/);
    assert.match(await page.locator("#previewOptions").innerText(), /不能直接关闭/);
    await page.click("#closeSandboxButton");

    // Serve the actual exported file to a fresh game load, without writing project files.
    await page.route("**/world-dialogues/site_start.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(exported) }));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => typeof WorldGame !== "undefined" && !document.querySelector("#startButton").disabled);
    await page.click("#startButton");
    await page.keyboard.press("e");
    assert.equal(await page.locator("#worldModalBody").innerText(), "已编辑的岸台正文");
    assert.doesNotMatch(await page.locator("#worldModalOptions").innerText(), /献祭/);
    await page.locator("#worldModalOptions").getByRole("button", { name: /检查编辑后的分支/ }).click();
    assert.match(await page.locator("#worldModalBody").innerText(), /白絮已经扎进/);

    // Result references remain editable and never replay resource effects on display.
    const resultScript = JSON.parse(readFileSync(require.resolve("../world-dialogues/event_sliceMudbank.json"), "utf8"));
    resultScript.nodes.result_opening_cut.body = "编辑后的行动结果";
    resultScript.nodes.result_opening_cut.options[0].label = "编辑后的继续";
    await page.route("**/world-dialogues/event_sliceMudbank.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(resultScript) }));
    await page.reload(); await page.waitForFunction(() => typeof WorldGame !== "undefined" && !document.querySelector("#startButton").disabled);
    await page.click("#startButton");
    const inventory = await page.evaluate(() => {
      const recipe = ActionEventData.get("sliceMudbank").stages.opening.recipes.find((r) => r.id === "cut");
      showActionResult(recipe, { allowClose: true, options: [{ label: "继续", action: () => showWorldDialogue("site_start") }] });
      return JSON.stringify(world.inventory);
    });
    assert.equal(await page.locator("#worldModalBody").innerText(), "编辑后的行动结果");
    await page.locator("#worldModalOptions").getByRole("button", { name: /编辑后的继续/ }).click();
    assert.equal(await page.locator("#worldModalBody").innerText(), "已编辑的岸台正文");
    assert.equal(await page.evaluate(() => JSON.stringify(world.inventory)), inventory);
    // Direct drowning recipes must offer restart as well as the two-strike death branch.
    await page.evaluate(async () => {
      world.currentNodeId = "node4";
      world.eventStates.livingHand = { nodeId: "node4", stage: "trapped", resolved: false };
      openActionEvent("livingHand", NODE_BY_ID.get("node4"));
      const focus = eventResources().find((resource) => resource.cardId === "focus");
      await submitSliceEventAction("livingHand", { hand: focus.key });
    });
    assert.equal(await page.evaluate(() => world.hp), 0);
    assert.equal(await page.locator("#worldModalOptions").getByRole("button", { name: /离开/ }).count(), 0);
    await page.locator("#worldModalOptions").getByRole("button", { name: /重新开始 Vertical Slice/ }).click();
    assert.ok(await page.evaluate(() => world.hp > 0));
    assert.deepEqual(errors, []);
    console.log("PASS: world dialogue search, graph edits, undo/redo, sandbox, ID isolation, draft reload, JSON export and actual game reload");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
