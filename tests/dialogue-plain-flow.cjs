const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`${base}/npc-editor/index.html`); await page.waitForSelector("#editorApp:not(.is-loading)");
    assert.doesNotMatch(await page.locator("#dialogueTextInput").inputValue(), /@node|@option|->/);
    assert.match(await page.locator("#dialogueTextInput").inputValue(), /@ mainChoices/);
    const nested = "主文本1\n》主文本1选项1\n\t主文本2\n\t》主文本2选项1\n\t》主文本2选项2\n》离开";
    await page.fill("#dialogueTextInput", nested); await page.click("#applyTextButton");
    await page.waitForFunction(() => !window.DialogueTextEditor.hasDraft());
    assert.equal(await page.locator("#dialogueTextInput").inputValue(), nested);
    await page.click("#sandboxButton");
    assert.equal(await page.locator("#previewBody").innerText(), "主文本1");
    assert.deepEqual(await page.locator("#previewOptions button").allTextContents(), ["主文本1选项1", "离开"]);
    await page.locator("#previewOptions").getByRole("button", { name: "主文本1选项1", exact: true }).click();
    assert.equal(await page.locator("#previewBody").innerText(), "主文本2");
    assert.deepEqual(await page.locator("#previewOptions button").allTextContents(), ["主文本2选项1", "主文本2选项2"]);
    await page.click("#closeSandboxButton"); await page.click("#undoButton");
    const source = "露西看向你\n》回避\n她非常失望，但又不愿意表现出来\n @ mainChoices\n》离开";
    await page.fill("#dialogueTextInput", source);
    const before = await page.evaluate(() => JSON.stringify(current()));
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => JSON.stringify(current())), before);
    await page.click("#applyTextButton"); await page.waitForFunction(() => !window.DialogueTextEditor.hasDraft());
    assert.equal(await page.locator("#dialogueTextInput").inputValue(), source);
    const currentJson = await page.locator("#textJsonPreview").textContent();
    assert.equal(await page.locator("#jsonLineNumbers").textContent(), currentJson.split("\n").map((_, i) => i + 1).join("\n"));
    const replyId = await page.evaluate(() => nodeOptions(current().nodes.root)[0].next);
    assert.equal(await page.evaluate(() => current().nodes.root.body), "露西看向你");
    assert.ok(replyId && replyId !== "root");
    await page.locator("#nodeList button").filter({ hasText: "她非常失望" }).click();
    assert.equal(await page.getByLabel("节点 ID", { exact: true }).inputValue(), replyId);
    assert.equal(await page.getByLabel("节点 ID", { exact: true }).getAttribute("readonly"), "");
    assert.match(await page.locator("#inspector").innerText(), /mainChoices/);
    await page.click("#sandboxButton");
    await page.selectOption("#sandboxEntry", ""); await page.click("#startSandboxButton");
    assert.equal(await page.locator("#previewBody").innerText(), "露西看向你");
    await page.locator("#previewOptions").getByRole("button", { name: "回避", exact: true }).click();
    assert.equal(await page.locator("#previewBody").innerText(), "她非常失望，但又不愿意表现出来");
    assert.deepEqual(await page.locator("#previewOptions button").allTextContents(), ["回避", "离开"]);
    await page.locator("#previewOptions").getByRole("button", { name: "回避", exact: true }).click();
    assert.equal(await page.locator("#previewBody").innerText(), "她非常失望，但又不愿意表现出来");
    await page.click("#closeSandboxButton");

    // A borrowed choice set must never replay the source node's entry effects.
    const effectsSource = "露西看向你\n（+开场）\n》回避（-开场）\n    她很失望\n    （+失望）\n    @mainChoices\n》离开";
    await page.fill("#dialogueTextInput", effectsSource); await page.click("#applyTextButton");
    await page.waitForFunction(() => !window.DialogueTextEditor.hasDraft());
    assert.equal(await page.evaluate(() => nodeOptions(current().nodes.root)[0].next), replyId);
    await page.click("#sandboxButton");
    await page.selectOption("#sandboxEntry", ""); await page.click("#startSandboxButton");
    await page.locator("#previewOptions").getByRole("button", { name: "回避", exact: true }).click();
    assert.equal(await page.evaluate(() => sandboxState.flags[current().editor.textAuthoring.flagAliases["开场"]]), false);
    assert.equal(await page.evaluate(() => sandboxState.flags[current().editor.textAuthoring.flagAliases["失望"]]), true);
    assert.equal(await page.locator("#previewBody").innerText(), "她很失望");
    await page.click("#closeSandboxButton");

    const stable = await page.evaluate(() => JSON.stringify(current()));
    await page.fill("#dialogueTextInput", "露西看向你\n》回避\n    新的回复\n    @missing\n》离开");
    await page.click("#applyTextButton"); await page.waitForFunction(() => document.querySelector("#textDiagnostics").textContent.includes("未知节点"));
    assert.equal(await page.evaluate(() => JSON.stringify(current())), stable);
    assert.deepEqual(errors, []);
    console.log("PASS: clean prose, manual auto IDs, directory inspection, exact user example, retained reply with borrowed choices, stable IDs, isolated effects, bad targets preserve JSON");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
