const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const tab = (name) => page.getByRole("tab", { name, exact: true });
  const bounds = () => page.evaluate(() => {
    const rect = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { top:r.top, bottom:r.bottom, height:r.height }; };
    return { input:rect("dialogueTextInput"), tabs:rect("textSheetTabs"), workspace:rect("textWorkspace"), viewport:innerHeight, pageHeight:document.documentElement.scrollHeight };
  });
  try {
    await page.goto(`${base}/npc-editor/index.html`); await page.waitForSelector("#editorApp:not(.is-loading)");
    assert.equal(await page.getByRole("tab").count(), 5);
    assert.equal(await tab("正文").getAttribute("aria-selected"), "true");
    const tall = await bounds();
    assert.ok(tall.input.height > 650, JSON.stringify(tall));
    assert.ok(tall.tabs.top - tall.input.bottom <= 14, JSON.stringify(tall));
    assert.ok(Math.abs(tall.tabs.bottom - tall.workspace.bottom) <= 2, JSON.stringify(tall));
    assert.ok(tall.viewport - tall.tabs.bottom < 45, JSON.stringify(tall));
    assert.ok(tall.pageHeight <= tall.viewport + 1, JSON.stringify(tall));
    await page.setViewportSize({ width:1440, height:720 });
    const short = await bounds();
    assert.ok(Math.abs(tall.input.height - short.input.height - 280) <= 3, JSON.stringify({tall,short}));
    assert.ok(short.viewport - short.tabs.bottom < 45);

    const initialJson = await page.evaluate(() => JSON.stringify(current()));
    const source = Array.from({ length:100 }, (_, i) => `正文第${i+1}行`).join("\n");
    await page.fill("#dialogueTextInput", source); await page.locator("#dialogueTextInput").press("Control+End");
    const before = await page.locator("#dialogueTextInput").evaluate((el) => ({ start:el.selectionStart, end:el.selectionEnd, scroll:el.scrollTop }));
    assert.ok(before.scroll > 0);
    await tab("高级配置").click();
    assert.equal(await page.locator("#dialogueTextInput").isVisible(), false);
    const config = `${await page.locator("#textConfigInput").inputValue()}\n`;
    await page.fill("#textConfigInput", config);
    assert.equal(await page.locator("#configLineNumbers").textContent(), config.split("\n").map((_, i) => i + 1).join("\n"));
    await page.locator("#textConfigInput").press("Control+End");
    await page.waitForFunction(() => {
      const view = document.querySelector("#textConfigInput"), gutter = document.querySelector("#configLineNumbers");
      return view.scrollTop > 0 && Math.abs(new DOMMatrixReadOnly(getComputedStyle(gutter).transform).m42 + view.scrollTop) < 1;
    });
    await tab("Flag 映射").click(); await page.fill("#textFlagAliases", '{"未提交的映射":"temporaryField"}');
    await tab("语法帮助").click(); assert.match(await page.locator("#textPanelHelp").innerText(), /相同缩进/);
    await tab("当前 JSON").click();
    assert.equal(await page.locator("#textJsonPreview").isVisible(), true);
    const jsonText = await page.locator("#textJsonPreview").textContent();
    assert.equal(await page.locator("#jsonLineNumbers").textContent(), jsonText.split("\n").map((_, i) => i + 1).join("\n"));
    await page.locator("#textJsonPreview").hover(); await page.mouse.wheel(0, 400);
    await page.waitForFunction(() => {
      const view = document.querySelector("#textJsonPreview"), gutter = document.querySelector("#jsonLineNumbers");
      return view.scrollTop > 0 && Math.abs(new DOMMatrixReadOnly(getComputedStyle(gutter).transform).m42 + view.scrollTop) < 1;
    });
    assert.equal(await page.evaluate(() => JSON.stringify(current())), initialJson);
    assert.equal(await page.locator("#textDraftDialog").getAttribute("open"), null);
    await tab("正文").click();
    assert.equal(await page.locator("#dialogueTextInput").inputValue(), source);
    const after = await page.locator("#dialogueTextInput").evaluate((el) => ({ start:el.selectionStart, end:el.selectionEnd, scroll:el.scrollTop }));
    assert.deepEqual(after, before);
    await tab("高级配置").click(); assert.equal(await page.locator("#textConfigInput").inputValue(), config);
    await tab("Flag 映射").click(); assert.equal(await page.locator("#textFlagAliases").inputValue(), '{"未提交的映射":"temporaryField"}');

    await tab("Flag 映射").press("ArrowRight");
    assert.equal(await tab("语法帮助").getAttribute("aria-selected"), "true");
    await tab("语法帮助").press("End");
    assert.equal(await tab("当前 JSON").getAttribute("aria-selected"), "true");
    await tab("当前 JSON").press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "textPanelJson");
    await tab("正文").click();
    await page.fill("#dialogueTextInput", "正文\n》（条件/）继续"); await page.click("#applyTextButton");
    await page.waitForFunction(() => document.querySelector("#textDiagnostics").textContent.includes("缺少"));
    await tab("当前 JSON").click(); await page.locator("#textDiagnostics button").click();
    assert.equal(await tab("正文").getAttribute("aria-selected"), "true");
    assert.equal(await page.evaluate(() => document.activeElement.id), "dialogueTextInput");
    assert.deepEqual(errors, []);
    console.log("PASS: full-height editor, workbook tabs, resize, config/JSON line numbers and synchronized scrolling, preserved drafts, keyboard navigation and diagnostic focus");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
