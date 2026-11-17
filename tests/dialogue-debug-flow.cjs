const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";
const fixture = JSON.parse(fs.readFileSync(require.resolve("../npc-editor/examples/dialogue_debug.json"), "utf8"));

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const requests = [], errors = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  try {
    await page.addInitScript(() => {
      sessionStorage.setItem("npc-editor-draft", JSON.stringify({ documents: { eddie: { schemaVersion: 1, id: "eddie", name: "旧项目草稿", start: { default: "root" }, nodes: { root: { body: "不应加载" } } } } }));
      sessionStorage.setItem("dialogue-text-aliases", JSON.stringify({ 项目旧映射: "projectOldFlag" }));
    });
    await page.goto(`${base}/npc-editor/index.html`);
    await page.waitForSelector("#editorApp:not(.is-loading)");
    assert.deepEqual(await page.locator("#npcSelect option").evaluateAll((opts) => opts.map((o) => o.value)), ["dialogue_debug"]);
    assert.equal(await page.locator("#textWorkspace").isVisible(), true);
    assert.equal(await page.locator("#editorDataHint").isVisible(), true);
    assert.match(await page.locator("#dialogueTextInput").inputValue(), /理解感染.*吃药.*已经康复/);
    assert.doesNotMatch(await page.locator("#textFlagAliases").inputValue(), /项目旧映射/);
    const source = await page.locator("#dialogueTextInput").inputValue();
    const original = await page.evaluate(() => JSON.stringify(current()));
    const originalPreview = await page.locator("#textJsonPreview").textContent();
    const originalAliases = await page.locator("#textFlagAliases").inputValue();
    await page.fill("#dialogueTextInput", "尚未写完\n》（理解感染/）继续");
    // Exceed the former debounce delay: incomplete text must stay unparsed.
    await page.waitForTimeout(450);
    assert.equal(await page.locator("#textDiagnostics").textContent(), "");
    assert.equal(await page.locator("#textJsonPreview").textContent(), originalPreview);
    assert.equal(await page.locator("#textFlagAliases").inputValue(), originalAliases);
    assert.equal(await page.evaluate(() => JSON.stringify(current())), original);
    await page.click("#applyTextButton");
    await page.waitForFunction(() => document.querySelector("#textDiagnostics").textContent.includes("缺少"));
    assert.equal(await page.evaluate(() => JSON.stringify(current())), original);
    await page.fill("#dialogueTextInput", source.replace("你又见到她，似乎依然没有离开。", "手动转换后的新正文。"));
    assert.equal(await page.evaluate(() => JSON.stringify(current())), original);
    await page.click("#applyTextButton");
    await page.waitForFunction(() => !window.DialogueTextEditor.hasDraft());
    assert.equal(await page.evaluate(() => current().nodes.root.body), "手动转换后的新正文。");
    assert.match(await page.locator("#textJsonPreview").textContent(), /手动转换后的新正文/);
    await page.click("#validateButton");
    assert.match(await page.locator("#inspector").innerText(), /检查：0 错误，0 警告/);
    await page.click("#sandboxButton");
    const options = page.locator("#previewOptions");
    assert.match(await options.innerText(), /你好点吗/);
    await options.getByRole("button", { name: "调整测试状态", exact: true }).click();
    await options.getByRole("button", { name: "吃药并康复", exact: true }).click();
    assert.doesNotMatch(await options.innerText(), /你好点吗/);
    await options.getByRole("button", { name: "调整测试状态", exact: true }).click();
    await options.getByRole("button", { name: "理解感染", exact: true }).click();
    assert.match(await options.innerText(), /你好点吗/);
    await options.getByRole("button", { name: "问候", exact: true }).click();
    await options.getByRole("button", { name: "继续追问", exact: true }).click();
    assert.match(await page.locator("#sandboxLog").innerText(), /debugLucyMonster.*true/);
    assert.match(await options.innerText(), /你已经看到了她的异变/);
    await page.click("#closeSandboxButton");
    assert.equal(await page.locator("#exportButton").count(), 0);
    assert.equal(await page.evaluate(() => current().id), "dialogue_debug");

    // Create a dirty text draft, then simulate editing the example file externally.
    await page.fill("#dialogueTextInput", "旧文本草稿\n不应覆盖修改后的文件");
    await page.waitForFunction(() => window.DialogueTextEditor.hasDraft());
    const changed = structuredClone(fixture); changed.nodes.root.body = "文件修改后的新正文";
    await page.route("**/npc-editor/examples/dialogue_debug.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(changed) }));
    await page.reload(); await page.waitForSelector("#editorApp:not(.is-loading)");
    assert.match(await page.locator("#dialogueTextInput").inputValue(), /文件修改后的新正文/);
    assert.doesNotMatch(await page.locator("#dialogueTextInput").inputValue(), /旧文本草稿/);
    assert.equal(await page.evaluate(() => window.DialogueTextEditor.hasDraft()), false);
    assert.equal(await page.evaluate(() => Boolean(sessionStorage.getItem("npc-editor-draft"))), true);
    assert.deepEqual(requests.filter((p) => /^\/(npc-dialogues|world-dialogues|action-events|battle-data)\//.test(p)), []);
    assert.deepEqual(errors, []);
    console.log("PASS: isolated example only, no project JSON requests/drafts, manual conversion only, failed conversion preserves JSON, compound conditions/effects, file edits supersede old drafts");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
