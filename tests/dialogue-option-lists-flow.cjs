const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  const apply = async (source) => {
    await page.fill("#dialogueTextInput", source); await page.click("#applyTextButton");
    await page.waitForFunction(() => !window.DialogueTextEditor.hasDraft());
    assert.equal(await page.locator("#dialogueTextInput").inputValue(), source);
  };
  const preview = async (choice, body) => {
    await page.click("#sandboxButton");
    await page.selectOption("#sandboxEntry", ""); await page.click("#startSandboxButton");
    await page.locator("#previewOptions").getByRole("button", { name: choice, exact: true }).click();
    assert.equal(await page.locator("#previewBody").innerText(), body);
    await page.click("#closeSandboxButton");
  };
  try {
    await page.goto(`${base}/npc-editor/index.html`);
    await page.waitForSelector("#editorApp:not(.is-loading)");
    assert.match(await page.locator("#dialogueTextInput").inputValue(), /@ mainChoices/);
    assert.match(await page.locator("#nodeList").innerText(), /@mainChoices/);
    const source = "露西看向你\n（+开场）\n》回避（-开场）\n    她很失望\n    （+失望）\n    @mainChoices\n》离开";
    await apply(source);
    await preview("回避", "她很失望");
    assert.equal(await page.evaluate(() => sandboxState.flags[current().editor.textAuthoring.flagAliases["开场"]]), false);
    assert.equal(await page.evaluate(() => sandboxState.flags[current().editor.textAuthoring.flagAliases["失望"]]), true);

    // Editing the shared choice in the graph updates both nodes immediately.
    await page.click("#graphModeButton");
    await page.locator("#nodeList button").filter({ hasText: "她很失望" }).click();
    await page.getByRole("button", { name: "2. 离开", exact: true }).click();
    const label = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "选项文字", exact: true }) }).getByLabel("默认文本");
    await label.fill("结束交谈"); await label.blur();
    assert.equal(await page.evaluate(() => Runtime.resolveNode(current(), "root").options[1].label), "结束交谈");
    await page.click("#textModeButton");
    assert.match(await page.locator("#dialogueTextInput").inputValue(), /》结束交谈/);
    assert.match(await page.locator("#dialogueTextInput").inputValue(), /@ mainChoices/);
    await apply(source.replace("@mainChoices", "@root"));
    assert.match(await page.locator("#textDiagnostics").innerText(), /临时正文和进入效果不执行/);
    await preview("回避", "露西看向你");
    assert.equal(await page.evaluate(() => sandboxState.flags[current().editor.textAuthoring.flagAliases["开场"]]), true);
    assert.equal(await page.evaluate(() => sandboxState.flags[current().editor.textAuthoring.flagAliases["失望"]]), undefined);

    await apply(source);
    const downloadText = page.waitForEvent("download"); await page.click("#exportTextButton");
    const complete = fs.readFileSync(await (await downloadText).path(), "utf8");
    assert.match(complete, /"syntaxVersion": 4/);
    const exported = await page.evaluate(() => JSON.parse(JSON.stringify(current())));
    assert.ok(exported.optionLists.mainChoices);
    assert.ok(Object.values(exported.nodes).every((node) => !Object.hasOwn(node, "options")));
    await page.locator("#importTextFile").setInputFiles({ name: "dialogue.txt", mimeType: "text/plain", buffer: Buffer.from(complete) });
    await page.click("#applyTextButton"); await page.waitForFunction(() => !window.DialogueTextEditor.hasDraft());
    await preview("回避", "她很失望");
    const stable = await page.evaluate(() => JSON.stringify(current()));
    await page.fill("#dialogueTextInput", source.replace("@mainChoices", "@missing")); await page.click("#applyTextButton");
    await page.waitForFunction(() => document.querySelector("#textDiagnostics").textContent.includes("未知"));
    assert.equal(await page.evaluate(() => JSON.stringify(current())), stable);
    assert.deepEqual(errors, []);
    console.log("PASS: typed @ references, isolated effects, shared graph edits, full-text import/export and atomic failures");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
