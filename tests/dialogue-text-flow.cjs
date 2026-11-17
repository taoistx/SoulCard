const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge", args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => dialog.accept());
  try {
    await page.goto(`${base}/npc-editor/index.html?source=project`); await page.waitForSelector("#editorApp:not(.is-loading)");
    const fixture = { schemaVersion: 1, kind: "npc", id: "lucy", name: "露西", start: { default: "root", rules: [] }, nodes: { root: { body: "旧正文", options: [] } } };
    await page.locator("#importFile").setInputFiles({ name: "lucy.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.selectOption("#npcSelect", "lucy");
    await page.click("#textModeButton");
    const source = "路边偶遇露西\n你又见到她\n》（条件1/！（条件2＆条件3））条件回答\n\t她摇摇头\n》问候（+问候过）\n\t她没有回答\n\t\t》继续追问\n\t\t\t她变成了怪兽\n\t\t\t（+露西怪兽）\n\t\t》离开\n》离开";
    await page.fill("#dialogueTextInput", source);
    await page.waitForFunction(() => !document.querySelector("#applyTextButton").disabled);
    assert.equal(await page.evaluate(() => current().nodes.root.body), "旧正文");
    assert.equal(JSON.parse(await page.locator("#textJsonPreview").textContent()).nodes.root.body, "旧正文");
    // Bind a newly discovered Chinese Flag before committing it.
    await page.getByRole("tab", { name: "Flag 映射", exact: true }).click();
    const aliases = JSON.parse(await page.locator("#textFlagAliases").inputValue());
    aliases["露西怪兽"] = "lucyMonster";
    await page.fill("#textFlagAliases", JSON.stringify(aliases)); await page.click("#acceptAliasesButton");
    await page.waitForFunction(() => !document.querySelector("#applyTextButton").disabled);
    await page.click("#applyTextButton");
    await page.waitForFunction(() => !window.DialogueTextEditor.hasDraft());
    await page.getByRole("tab", { name: "正文", exact: true }).click();
    const applied = await page.evaluate(() => structuredClone(current()));
    assert.equal(applied.nodes.root.options[0].visibleWhen.mode, "any");
    assert.equal(applied.editor.textAuthoring.flagAliases["露西怪兽"], "lucyMonster");
    const firstIds = Object.keys(applied.nodes);
    await page.screenshot({ path: path.join(os.tmpdir(), "dialogue-text-editor.png"), fullPage: true });
    // Serialization emits IDs, preserves them when prose changes, and uses /.
    const generated = await page.locator("#dialogueTextInput").inputValue();
    assert.match(generated, /@node root/); assert.match(generated, /@option choice1/); assert.match(generated, /\//);
    await page.fill("#dialogueTextInput", generated.replace("你又见到她", "你再次见到她"));
    await page.waitForFunction(() => !document.querySelector("#applyTextButton").disabled); await page.click("#applyTextButton");
    await page.waitForFunction(() => !window.DialogueTextEditor.hasDraft());
    assert.deepEqual(await page.evaluate(() => Object.keys(current().nodes)), firstIds);
    await page.click("#undoButton"); assert.equal(await page.evaluate(() => current().nodes.root.body), "你又见到她");
    await page.click("#redoButton"); assert.equal(await page.evaluate(() => current().nodes.root.body), "你再次见到她");

    await page.click("#sandboxButton");
    const map = applied.editor.textAuthoring.flagAliases;
    await page.fill("#sandboxFlags", JSON.stringify({ [map["条件1"]]: false, [map["条件2"]]: true, [map["条件3"]]: true }));
    await page.click("#startSandboxButton");
    assert.doesNotMatch(await page.locator("#previewOptions").innerText(), /条件回答/);
    await page.fill("#sandboxFlags", "{}"); await page.click("#startSandboxButton");
    assert.match(await page.locator("#previewOptions").innerText(), /条件回答/);
    await page.locator("#previewOptions").getByRole("button", { name: "问候", exact: true }).click();
    await page.locator("#previewOptions").getByRole("button", { name: "继续追问", exact: true }).click();
    assert.match(await page.locator("#sandboxLog").innerText(), /lucyMonster.*true/);
    await page.click("#closeSandboxButton");

    // Advanced groups stay editable in the graph inspector.
    await page.click("#graphModeButton");
    await page.locator("#nodeList button").filter({ hasText: "root" }).click();
    await page.getByRole("button", { name: "1. 条件回答", exact: true }).click();
    assert.ok(await page.locator(".nested-condition").count() >= 2);
    assert.ok((await page.locator("#inspector select").evaluateAll((els) => els.map((e) => e.value))).includes("not"));
    await page.click("#textModeButton");

    const downloadPromise = page.waitForEvent("download"); await page.click("#exportTextButton");
    const exportedText = fs.readFileSync(await (await downloadPromise).path(), "utf8");
    assert.match(exportedText, /@config/); assert.match(exportedText, /lucyMonster/);
    await page.locator("#importTextFile").setInputFiles({ name: "lucy.dialogue.txt", mimeType: "text/plain", buffer: Buffer.from(exportedText) });
    await page.waitForFunction(() => !document.querySelector("#applyTextButton").disabled); await page.click("#applyTextButton");
    await page.waitForFunction(() => !window.DialogueTextEditor.hasDraft());
    const valid = await page.evaluate(() => JSON.stringify(current()));
    await page.fill("#dialogueTextInput", "坏草稿\n》（条件1/）继续");
    await page.click("#applyTextButton");
    await page.waitForFunction(() => document.querySelector("#textDiagnostics").textContent.includes("缺少"));
    assert.equal(await page.evaluate(() => JSON.stringify(current())), valid);
    await page.click("#graphModeButton"); await page.click("#draftKeepContinue");
    assert.equal(await page.locator("#graphViewport").isVisible(), true);
    await page.click("#textModeButton");
    assert.match(await page.locator("#dialogueTextInput").inputValue(), /坏草稿/);
    await page.selectOption("#npcSelect", "eddie"); await page.click("#draftKeepContinue");
    await page.selectOption("#npcSelect", "lucy");
    assert.match(await page.locator("#dialogueTextInput").inputValue(), /坏草稿/);
    await page.reload(); await page.waitForSelector("#editorApp:not(.is-loading)"); await page.click("#textModeButton");
    assert.match(await page.locator("#dialogueTextInput").inputValue(), /坏草稿/);
    await page.click("#graphModeButton"); await page.click("#draftDiscardContinue");
    assert.equal(await page.evaluate(() => JSON.stringify(current())), valid);

    // A shared Chinese-name rename changes metadata, retains the field identity,
    // and is undone/redone together with the edited dialogue.
    const shared = structuredClone(fixture); shared.id = "lucy_shared";
    shared.nodes.root.effects = [{ type: "setFlag", key: "lucyMonster", value: true }];
    shared.editor = { textAuthoring: { flagAliases: { 露西怪兽: "lucyMonster" } } };
    await page.locator("#importFile").setInputFiles({ name: "shared.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(shared)) });
    await page.click("#textModeButton");
    const sharedSource = await page.locator("#dialogueTextInput").inputValue();
    await page.fill("#dialogueTextInput", sharedSource.replaceAll("露西怪兽", "露西变异"));
    await page.waitForFunction(() => !document.querySelector("#applyTextButton").disabled);
    const rename = JSON.parse(await page.locator("#textFlagAliases").inputValue());
    delete rename["露西怪兽"]; rename["露西变异"] = "lucyMonster";
    await page.getByRole("tab", { name: "Flag 映射", exact: true }).click();
    await page.fill("#textFlagAliases", JSON.stringify(rename)); await page.click("#acceptAliasesButton");
    await page.waitForFunction(() => !document.querySelector("#applyTextButton").disabled); await page.click("#applyTextButton");
    await page.waitForFunction(() => !window.DialogueTextEditor.hasDraft());
    assert.equal(await page.evaluate(() => documents["npc:lucy"].editor.textAuthoring.flagAliases["露西变异"]), "lucyMonster");
    await page.click("#undoButton");
    assert.equal(await page.evaluate(() => documents["npc:lucy"].editor.textAuthoring.flagAliases["露西怪兽"]), "lucyMonster");
    await page.click("#redoButton");
    assert.equal(await page.evaluate(() => documents["npc:lucy"].editor.textAuthoring.flagAliases["露西变异"]), "lucyMonster");
    const beforeConflict = await page.evaluate(() => JSON.stringify(documents));
    shared.editor.textAuthoring.flagAliases = { 露西变异: "wrongField" };
    await page.locator("#importFile").setInputFiles({ name: "conflict.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(shared)) });
    await page.waitForFunction(() => document.querySelector("#feedback").textContent.includes("冲突"));
    assert.equal(await page.evaluate(() => JSON.stringify(documents)), beforeConflict);
    await page.selectOption("#npcSelect", "lucy");

    // Serve the generated document to the actual game without writing content files.
    const gameDialogue = await page.evaluate(() => structuredClone(current())); gameDialogue.id = "chris";
    gameDialogue.nodes.root.effects = [{ type: "setFlag", key: "arrivedInDialogue", value: true }];
    gameDialogue.nodes.root.options.push({ id: "entryEffect", label: "进入效果后可见", visibleWhen: { mode: "all", clauses: [{ source: "flag", key: "arrivedInDialogue", operator: "eq", value: true }] } });
    await page.route("**/npc-dialogues/chris.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(gameDialogue) }));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => typeof WorldGame !== "undefined" && !document.querySelector("#startButton").disabled);
    await page.click("#startButton");
    await page.evaluate((map) => { setFlag(map["条件1"], false); setFlag(map["条件2"], true); setFlag(map["条件3"], true); showNpcDialogue("chris"); }, map);
    assert.doesNotMatch(await page.locator("#worldModalOptions").innerText(), /条件回答/);
    assert.match(await page.locator("#worldModalOptions").innerText(), /进入效果后可见/);
    await page.evaluate((map) => { setFlag(map["条件1"], true); showNpcDialogue("chris"); }, map);
    assert.match(await page.locator("#worldModalOptions").innerText(), /条件回答/);
    await page.locator("#worldModalOptions").getByRole("button", { name: /问候/ }).click();
    await page.locator("#worldModalOptions").getByRole("button", { name: /继续追问/ }).click();
    assert.equal(await page.evaluate(() => getFlag("lucyMonster")), true);
    assert.match(await page.locator("#worldModalBody").innerText(), /她变成了怪兽/);
    assert.deepEqual(errors, []);
    console.log("PASS: text preview/apply, alias binding, stable IDs, nested graph inspector, sandbox, exports, guarded drafts/reload/history, and actual game conditions/effects");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
