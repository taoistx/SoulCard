// Uses an isolated folder and settings file; never overwrites project dialogue content.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, ".."), temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dialogue-folder-"));
const folder = path.join(temporary, "对白 JSON"), empty = path.join(temporary, "empty"), settings = path.join(temporary, "settings.json");
fs.mkdirSync(folder); fs.mkdirSync(empty);
const example = JSON.parse(fs.readFileSync(path.join(root, "npc-editor/examples/dialogue_debug.json"), "utf8"));
fs.writeFileSync(path.join(folder, "custom-name.json"), JSON.stringify(example));
const world = { schemaVersion: 1, kind: "world", id: "world_test", name: "世界测试", start: { default: "root", rules: [] }, nodes: { root: { body: "世界正文", options: [] } } };
const mappings = (directory) => path.join(directory, "flag-mappings.json");
const readMappings = (directory) => JSON.parse(fs.readFileSync(mappings(directory), "utf8"));
fs.writeFileSync(path.join(folder, "world.json"), JSON.stringify(world));
fs.writeFileSync(path.join(folder, "invalid.json"), '{"id":"broken","nodes":{}}');
fs.writeFileSync(path.join(folder, "malformed.json"), '{');
fs.writeFileSync(path.join(folder, "unsafe-shape.json"), JSON.stringify({ ...world, id: "bad_shape", entryNodes: 42 }));
fs.writeFileSync(path.join(folder, "manifest.json"), '{"schemaVersion":1,"dialogues":{}}');
let server, browser, occupiedPort;
async function start(port = 0) {
  server = spawn(process.env.PYTHON || "python", ["npc-editor/server.py", "--port", String(port), "--settings-file", settings], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  server.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const [chunk] = await Promise.race([once(server.stdout, "data"), once(server, "exit").then(([code]) => { throw new Error(`Editor server exited (${code}): ${stderr}`); })]);
  const url = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  assert.ok(url, chunk.toString()); return url;
}
async function stop() { if (server && server.exitCode === null) { const done = once(server, "exit"); server.kill(); await done; } }

(async () => {
  // An old static server owning the requested port must not receive the editor launch.
  occupiedPort = net.createServer(); occupiedPort.listen(0, "127.0.0.1"); await once(occupiedPort, "listening");
  const oldPort = occupiedPort.address().port;
  let base = await start(oldPort);
  assert.notEqual(new URL(base).port, String(oldPort));
  await new Promise((resolve) => occupiedPort.close(resolve)); occupiedPort = null;
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  let page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [], downloads = [];
  page.on("pageerror", (error) => errors.push(error.message)); page.on("download", (download) => downloads.push(download));
  page.on("dialog", (dialog) => dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss());
  const loaded = () => page.waitForSelector("#editorApp:not(.is-loading):not([inert])");
  async function configure(directory) {
    await page.click("#editorSettingsButton"); await page.waitForFunction(() => !document.querySelector("#applyEditorSettingsButton").disabled);
    await page.fill("#dialogueDirectoryInput", directory);
    await Promise.all([page.waitForNavigation(), page.click("#applyEditorSettingsButton")]); await loaded();
  }
  async function graph(id = "dialogue_debug") {
    await page.selectOption("#npcSelect", id); await page.click("#graphModeButton");
    await page.locator("#nodeList button").filter({ hasText: "root" }).first().click();
  }
  async function body(text) { await page.getByLabel("默认文本", { exact: true }).fill(text); await page.getByLabel("默认文本", { exact: true }).blur(); }
  async function save() {
    const response = page.waitForResponse((r) => r.url().endsWith("/__dialogue_editor/save"));
    await page.click("#applyGraphButton"); return response;
  }
  // Reproduce the disabled button on a static service, then recover without losing the entered path.
  await page.route("**/__dialogue_editor/settings", (route) => route.fulfill({ status: 404, body: "static server" }));
  await page.goto(`${base}/npc-editor/index.html`); await loaded();
  assert.equal(await page.locator("#exportButton").count(), 0);
  await page.click("#editorSettingsButton"); await page.waitForSelector("#retryEditorConnectionButton:not([hidden])");
  assert.equal(await page.locator("#applyEditorSettingsButton").isDisabled(), true);
  assert.match(await page.locator("#editorSettingsStatus").innerText(), /路径尚未提交/);
  await page.fill("#dialogueDirectoryInput", folder);
  await page.unroute("**/__dialogue_editor/settings"); await page.click("#retryEditorConnectionButton");
  await page.waitForFunction(() => !document.querySelector("#applyEditorSettingsButton").disabled);
  assert.equal(await page.locator("#dialogueDirectoryInput").inputValue(), folder);
  await Promise.all([page.waitForNavigation(), page.click("#applyEditorSettingsButton")]); await loaded();
  assert.equal(await page.locator("#npcSelect option").count(), 2);
  assert.deepEqual(readMappings(folder), example.editor.textAuthoring.flagAliases);
  assert.match(await page.locator("#editorDataHint").innerText(), /invalid.json/);
  assert.match(await page.locator("#editorDataHint").innerText(), /malformed.json/);
  assert.match(await page.locator("#editorDataHint").innerText(), /unsafe-shape.json/);
  await graph();
  assert.equal(await page.locator("#graphToolbar").isVisible(), true);
  assert.equal(await page.locator("#textWorkspace").isVisible(), false);
  const viewport = await page.locator("#graphViewport").boundingBox(), toolbar = await page.locator("#graphToolbar").boundingBox();
  assert.ok(toolbar.y + toolbar.height <= viewport.y + 1);
  await body("直接写回源文件");
  assert.equal((await save()).status(), 200);
  await page.waitForFunction(() => document.querySelector("#dirtyState").textContent === "已保存");
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder, "custom-name.json"), "utf8")).nodes.root.body, "直接写回源文件");
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder, "custom-name.json"), "utf8")).editor.textAuthoring.flagAliases, undefined);
  assert.equal(fs.existsSync(path.join(folder, "dialogue_debug.json")), false);
  assert.match(await page.locator("#feedback").innerText(), /custom-name.json/);
  // An unsaved document survives a different document being saved and a reload.
  await graph("world:world_test"); await body("未保存的世界草稿");
  await graph(); await body("第二次保存"); await save();
  await page.reload(); await loaded(); await graph("world:world_test");
  assert.equal(await page.getByLabel("默认文本", { exact: true }).inputValue(), "未保存的世界草稿");
  // A bare text file creates reusable groups even when the current JSON uses inline options.
  await page.click("#textModeButton");
  const source = [
    "这是在黑水边一片相对坚硬的台地上的一个棚架，有一个老人，似乎在黑水里打捞东西",
    "》你是谁？",
    "&#x20;   我叫艾迪，也是一个倒霉蛋而已",
    "》这里是哪？",
    "&#x20;   这是所有倒霉的东西汇集的地方……",
    "》怎样能离开这个鬼地方？",
    "&#x20;   看到远处山顶那类似教堂的建筑吗？到那就能回去原来的世界了",
    "》你在这里做什么？（+交易知识）",
    "&#x20;   捞点有用的东西……你要有新鲜的血肉可以来跟我交换",
    "》你知道我身上这些斑纹是怎么回事吗？",
    "&#x20;   艾迪轻微唉了一声，“你是喝到黑水了吧？你可能没几天可以活就要变异了。”",
    "&#x20;   》变异？变成什么？",
    "&#x20;       怎么形容……变成一滩烂肉吧。",
    "&#x20;   》怎么能治好",
    "&#x20;       我也不知道，也许你只能到山上的教堂去碰碰运气。",
    "》（交易知识）交易",
    "#shop_eddie",
    "》离开",
  ].join("\\\n");
  await page.locator("#importTextFile").setInputFiles({ name: "eddie.txt", mimeType: "text/plain", buffer: Buffer.from(source) });
  await page.waitForFunction(() => DialogueTextEditor.hasDraft());
  assert.equal(await page.evaluate(() => current().optionLists), undefined);
  await page.click("#applyTextButton");
  await page.waitForFunction(() => !DialogueTextEditor.hasDraft());
  const imported = await page.evaluate(() => current());
  const main = imported.optionLists[imported.nodes.root.optionList].options;
  assert.equal(main.length, 7);
  assert.equal(imported.nodes[main[0].next].body, "我叫艾迪，也是一个倒霉蛋而已");
  assert.equal(main[3].effects[0].key, main[5].visibleWhen.clauses[0].key);
  assert.equal(main[5].action, "shop_eddie");
  const followUps = imported.optionLists[imported.nodes[main[4].next].optionList].options;
  assert.deepEqual(followUps.map((option) => option.label), ["变异？变成什么？", "怎么能治好"]);
  assert.equal(imported.nodes[followUps[0].next].body, "怎么形容……变成一滩烂肉吧。");
  assert.equal(Object.keys(imported.optionLists).length, 2);
  assert.ok(Object.values(imported.nodes).every((node) => !Object.hasOwn(node, "options")));
  assert.match(await page.locator("#nodeList").innerText(), /@rootChoices/);
  // Text conversion remains explicit; saving guards unconverted text.
  await graph(); await page.click("#textModeButton");
  assert.equal(await page.locator("#graphToolbar").isVisible(), false);
  await page.fill("#dialogueTextInput", "文本保存测试\n》离开");
  await page.click("#saveTextJsonButton"); await page.waitForSelector("#textDraftDialog[open]");
  await page.click("#draftApplyContinue");
  await page.waitForFunction(() => document.querySelector("#dirtyState").textContent === "已保存" && !window.DialogueTextEditor.hasDraft());
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder, "custom-name.json"), "utf8")).nodes.root.body, "文本保存测试");
  const setMappings = async (table) => {
    await page.getByRole("tab", { name: "Flag 映射" }).click();
    await page.fill("#textFlagAliases", JSON.stringify(table));
    const response = page.waitForResponse((r) => r.url().endsWith("/__dialogue_editor/flag-mappings"));
    await page.click("#acceptAliasesButton");
    assert.equal((await response).status(), 200);
    await page.waitForFunction(() => !document.querySelector("#acceptAliasesButton").disabled);
  };
  await setMappings({ ...readMappings(folder), "甲目录独有": "folderOnly" });
  assert.equal(readMappings(folder)["甲目录独有"], "folderOnly");
  assert.equal(await page.evaluate(() => DialogueTextEditor.hasDraft()), false);
  await page.getByRole("tab", { name: "正文" }).click();
  await page.fill("#dialogueTextInput", "文本保存测试\n（+自动新增）\n》离开");
  await page.click("#applyTextButton");
  await page.waitForFunction(() => !DialogueTextEditor.hasDraft());
  assert.match(readMappings(folder)["自动新增"], /^storyFlag_/);
  const { "自动新增": generatedFlag, ...otherMappings } = readMappings(folder);
  await page.fill("#dialogueTextInput", "改名测试\n（+自动新增）\n》离开");
  await setMappings({ ...otherMappings, "改过名称": generatedFlag });
  await page.getByRole("tab", { name: "正文" }).click();
  await page.click("#applyTextButton");
  await page.locator("#textDiagnostics button").filter({ hasText: "已改名为" }).waitFor();
  await page.fill("#dialogueTextInput", "文本保存测试\n（+改过名称）\n》离开");
  await page.click("#applyTextButton");
  await page.waitForFunction(() => !DialogueTextEditor.hasDraft());
  assert.equal(readMappings(folder)["自动新增"], undefined);
  assert.equal(readMappings(folder)["改过名称"], generatedFlag);
  // A concurrent disk edit must not be overwritten or marked saved.
  await graph(); await body("不应覆盖外部修改");
  const external = JSON.parse(fs.readFileSync(path.join(folder, "custom-name.json"), "utf8")); external.nodes.root.body = "外部修改";
  fs.writeFileSync(path.join(folder, "custom-name.json"), JSON.stringify(external));
  assert.equal((await save()).status(), 409);
  await page.waitForFunction(() => document.querySelector("#feedback").textContent.includes("保存失败"));
  assert.equal(await page.locator("#dirtyState").innerText(), "未保存");
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder, "custom-name.json"), "utf8")).nodes.root.body, "外部修改");
  assert.deepEqual(downloads, []);
  await page.reload(); await loaded(); await graph();
  assert.equal(await page.getByLabel("默认文本", { exact: true }).inputValue(), "外部修改");
  // Invalid paths leave settings unchanged and the current editor usable.
  await page.click("#editorSettingsButton"); await page.waitForFunction(() => !document.querySelector("#applyEditorSettingsButton").disabled);
  await page.fill("#dialogueDirectoryInput", path.join(temporary, "missing")); await page.click("#applyEditorSettingsButton");
  await page.waitForFunction(() => document.querySelector("#editorSettingsStatus").textContent.includes("不存在"));
  assert.equal(JSON.parse(fs.readFileSync(settings, "utf8")).directory, folder);
  await page.click("#closeEditorSettingsButton");
  await configure(empty);
  assert.equal(fs.existsSync(mappings(empty)), false);
  assert.equal(await page.locator("#applyGraphButton").isDisabled(), true);
  assert.match(await page.locator("#graphNodes").innerText(), /没有有效对话/);
  await page.keyboard.press("Escape");
  // New documents create a JSON in the configured folder, including after ID rename.
  const prompts = ["fresh_dialogue", "新建测试"];
  page.removeAllListeners("dialog"); page.on("dialog", (dialog) => dialog.type() === "prompt" ? dialog.accept(prompts.shift()) : dialog.accept());
  await page.click("#newNpcButton"); await page.click("#graphModeButton");
  assert.equal(await page.locator("#dirtyState").innerText(), "未保存");
  assert.equal((await save()).status(), 200);
  await page.waitForFunction(() => document.querySelector("#dirtyState").textContent === "已保存");
  assert.ok(fs.existsSync(path.join(empty, "fresh_dialogue.json")));
  await page.getByLabel("稳定 ID", { exact: true }).fill("renamed_dialogue"); await page.getByLabel("稳定 ID", { exact: true }).blur();
  await page.click("#undoButton"); assert.equal(await page.evaluate(() => current().id), "fresh_dialogue");
  await page.click("#redoButton"); await page.reload(); await loaded(); await page.click("#graphModeButton");
  assert.equal(await page.locator("#npcSelect option").count(), 1);
  assert.equal(await page.evaluate(() => current().id), "renamed_dialogue");
  assert.equal((await save()).status(), 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(empty, "fresh_dialogue.json"), "utf8")).id, "renamed_dialogue");
  assert.equal(fs.existsSync(path.join(empty, "renamed_dialogue.json")), false);
  await page.click("#textModeButton");
  await setMappings({ "乙目录独有": "folderOnly" });
  assert.deepEqual(readMappings(empty), { "乙目录独有": "folderOnly" });
  const staleMapping = await page.request.post(`${base}/__dialogue_editor/flag-mappings`, { data: { directory: empty, revision: null, aliases: { invalid: "stale" } } });
  assert.equal(staleMapping.status(), 409);
  const wrongFolder = await page.request.post(`${base}/__dialogue_editor/flag-mappings`, { data: { directory: folder, revision: null, aliases: {} } });
  assert.equal(wrongFolder.status(), 409);
  // Restart the process and create a fresh browser session: folder settings persist on disk.
  await page.close(); await stop(); base = await start();
  page = await browser.newPage(); await page.goto(`${base}/npc-editor/index.html`); await loaded();
  assert.match(await page.locator("#editorDataHint").innerText(), /empty/);
  assert.equal(await page.locator("#npcSelect option").count(), 1);
  assert.equal(await page.evaluate(() => current().id), "renamed_dialogue");
  await page.getByRole("tab", { name: "Flag 映射" }).click();
  assert.deepEqual(JSON.parse(await page.locator("#textFlagAliases").inputValue()), { "乙目录独有": "folderOnly" });
  if (process.env.EDITOR_SCREENSHOT) { await page.click("#graphModeButton"); await page.screenshot({ path: process.env.EDITOR_SCREENSHOT }); }
  // Traversal and cross-origin writes are rejected by the local service.
  const traversal = await page.request.post(`${base}/__dialogue_editor/save`, { data: { directory: empty, file: "../escape.json", dialogue: world, revision: null } });
  assert.equal(traversal.status(), 400);
  const crossOrigin = await page.request.post(`${base}/__dialogue_editor/settings`, { headers: { Origin: "https://other.example" }, data: { directory: folder } });
  assert.equal(crossOrigin.status(), 403);
  // A moved/deleted source folder can be repaired from the startup error panel.
  await page.close(); fs.renameSync(empty, `${empty}-moved`);
  page = await browser.newPage(); await page.goto(`${base}/npc-editor/index.html`);
  await page.waitForSelector("#startupFailure:not([hidden])");
  await page.click("#startupSettingsButton"); await page.waitForFunction(() => !document.querySelector("#applyEditorSettingsButton").disabled);
  await page.fill("#dialogueDirectoryInput", folder);
  await Promise.all([page.waitForNavigation(), page.click("#applyEditorSettingsButton")]); await loaded();
  assert.equal(await page.locator("#npcSelect option").count(), 2);
  await page.getByRole("tab", { name: "Flag 映射" }).click();
  const restoredMappings = JSON.parse(await page.locator("#textFlagAliases").inputValue());
  assert.equal(restoredMappings["甲目录独有"], "folderOnly");
  assert.equal(restoredMappings["乙目录独有"], undefined);
  assert.deepEqual(errors, []);
  console.log("PASS: folder scan/restart, graph and text writes, draft recovery, isolated Flag mappings, migration, rename and conflict protection");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  occupiedPort?.close(); await browser?.close(); await stop(); fs.rmSync(temporary, { recursive: true, force: true });
});
