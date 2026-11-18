const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const example = require("../action-event-editor/example.js");

const base = process.env.DUNGEON_URL || "http://127.0.0.1:8765";

async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const button = (name) => page.getByRole("button", { name, exact: true });
  const tab = (name) => page.getByRole("tab", { name, exact: true }).click();
  const input = page.locator("#source");
  const preview = page.locator("#jsonPreview");
  const play = page.locator("#sandboxPlay");
  const upload = (name, contents) => page.locator("#importFile").setInputFiles({
    name, mimeType: name.endsWith(".json") ? "application/json" : "text/plain", buffer: Buffer.from(contents),
  });
  async function download(name) {
    const [file] = await Promise.all([page.waitForEvent("download"), button(name).click()]);
    return readFile(await file.path(), "utf8");
  }
  async function place(card, target) {
    await play.locator(`[data-card="${card}"]`).click();
    await play.locator(`[data-slot="${target}"]`).click();
  }

  try {
    for (const entry of ["npc-editor/index.html?source=project", "node-editor/events.html"]) {
      await page.goto(`${base}/${entry}`);
      await page.getByRole("link", { name: "行动事件文本编辑器", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("#draftState")?.textContent.includes("已转换"));
      assert.equal(await input.inputValue(), example.source);
    }
    assert.equal(await page.locator("#outline button").count(), 4);
    const confirmLine = example.source.split("\n").indexOf("》确认") + 1;
    const fold = page.locator(`#lineNumbers button[data-line="${confirmLine}"]`);
    await fold.click();
    assert.ok(!(await input.inputValue()).includes("迎击粪怪"));
    assert.equal(await download("导出文本"), example.source);
    await fold.click();

    const bad = example.source.replace("-card: 肉块", "-card: 缺失牌");
    await input.fill(bad);
    await button("转换并应用").click();
    const error = page.locator("#diagnostics button.error");
    assert.match(await error.innerText(), /露西与粪怪\.txt:\d+:5.*缺失牌/u);
    assert.ok(await button("导出 JSON").isDisabled());
    await fold.click();
    await error.click();
    assert.equal(await fold.getAttribute("aria-expanded"), "true");
    assert.equal(await input.evaluate((el) => el.value.slice(el.selectionStart).split("\n")[0]), "-card: 缺失牌");

    await page.reload();
    assert.equal(await input.inputValue(), bad);
    await tab("沙盒");
    assert.match(await page.locator("#sandboxVersion").innerText(), /第 1 版.*当前草稿尚未应用/u);
    assert.ok(await play.getByRole("button", { name: "确认", exact: true }).isEnabled());
    await tab("当前 JSON");
    assert.equal(JSON.parse(await preview.textContent()).source, example.source);
    assert.equal(await download("导出文本"), bad);

    const newSource = "#门\n》开门\n    @shop eddie\n    +flag: shopClosed\n    @exit\n";
    await upload("新面板.txt", newSource);
    await page.waitForFunction((value) => document.querySelector("#source").value === value, newSource);
    await input.fill("#门\n》开门");
    await input.press("Control+End");
    await input.press("Enter");
    assert.equal(await input.inputValue(), "#门\n》开门\n    ");
    await input.fill("#门\n》确认\n暴力》门:\n\t@battle monster1?");
    await input.press("Control+End");
    await input.press("Enter");
    assert.ok((await input.inputValue()).endsWith("@battle monster1?\n\t"));
    await input.press("Tab");
    assert.ok((await input.inputValue()).endsWith("\n\t\t"));
    await input.press("Shift+Tab");
    assert.ok((await input.inputValue()).endsWith("\n\t"));

    await input.fill("开头\n\t\t甲\n    乙\n  \t  丁\n\t丙");
    await input.evaluate((el) => el.setSelectionRange(el.value.indexOf("\t\t甲"), el.value.indexOf("\t丙")));
    await input.press("Shift+Tab");
    assert.equal(await input.inputValue(), "开头\n\t甲\n乙\n    丁\n\t丙");
    assert.equal(await input.evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd)), "\t甲\n乙\n    丁\n");
    await input.fill(newSource.replace("开门", "先看一眼"));
    const canceled = page.waitForEvent("dialog");
    await upload("取消.txt", "#其他\n》离开\n    @exit");
    await (await canceled).dismiss();
    assert.match(await input.inputValue(), /先看一眼/u);

    await input.fill(newSource);
    await tab("沙盒");
    await page.locator("#sandboxSettings summary").click();
    const config = page.locator("#config");
    const settings = JSON.parse(await config.inputValue());
    settings.initial.flags.shopClosed = false;
    await config.fill(JSON.stringify(settings, null, 2));
    await button("转换并应用").click();
    const exported = JSON.parse(await download("导出 JSON"));
    assert.equal(exported.kind, "action-event-sandbox");
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.source, newSource);
    assert.equal(exported.panel.slots[0].id, "门");
    assert.equal(exported.config.initial.flags.shopClosed, false);
    exported.panel = { slots: [{ id: "伪造" }] };
    exported.filename = "重导入后.txt";
    await upload("重导入.json", JSON.stringify(exported));
    await page.waitForFunction(() => document.querySelector("#filename").textContent === "重导入后.txt");
    await tab("当前 JSON");
    assert.equal(JSON.parse(await preview.textContent()).panel.slots[0].id, "门");
    await tab("沙盒");
    assert.match(await play.innerText(), /shopClosed = false/u);
    await button("开门").click();
    assert.equal(await play.getByRole("heading", { name: "模拟商店 · eddie" }).count(), 1);
    await button("关闭商店").click();
    assert.match(await play.innerText(), /shopClosed = true/u);

    await tab("正文");
    await button("载入露西示例").click();
    await tab("沙盒");
    for (const outcome of ["胜利", "失败", "逃跑"]) {
      await button("重置").click();
      await place("固守", "露西");
      await play.locator('[data-card="短促刺击"]').dragTo(play.locator('[data-slot="粪怪"]'));
      await button("确认").click();
      assert.equal(await play.getByRole("heading", { name: "模拟战斗 · monster1" }).count(), 1);
      assert.ok(await button("确认").isDisabled());
      await button(outcome).click();
      assert.equal(await play.getByRole("heading", { name: "本轮已结束" }).count(), 1);
      const state = await play.locator(".action-state-grid").innerText();
      if (outcome === "胜利") {
        assert.match(state, /露西获救 = true/u);
        assert.equal(await play.locator('[data-card="处决"]').count(), 1);
      } else if (outcome === "失败") assert.match(state, /露西死亡 = true/u);
      else assert.match(await play.innerText(), /进入返回分支「其他」/u);
    }
    await button("重置").click();
    await place("灰钢架势", "露西");
    await button("确认").click();
    assert.match(await play.innerText(), /这样的行动似乎没有意义/u);
    assert.match(await play.locator('[data-slot="露西"]').innerText(), /空槽/u);
    await place("肉块", "粪怪");
    await button("确认").click();
    assert.equal(await play.locator('[data-card="肉块"]').count(), 0);
    await button("重置").click();
    await button("离开").click();
    assert.equal(await play.getByRole("heading", { name: "本轮已结束" }).count(), 1);

    const nested = await readFile(path.join(__dirname, "fixtures/action-event-choice.txt"), "utf8");
    const optionWithRules = nested.replace("\t\t@jump options", "\t（暴力》粪怪 & !空》露西） | [处决]》粪怪：\n\t\t@jump options");
    await upload("嵌套跳转.txt", optionWithRules);
    await page.waitForFunction(() => document.querySelector("#filename").textContent === "嵌套跳转.txt");
    await button("转换并应用").click();
    await tab("沙盒");
    await place("灰钢架势", "露西");
    await button("确认").click();
    const result = play.locator("section").filter({ has: page.getByRole("heading", { name: "本次执行轨迹" }) });
    assert.match(await result.innerText(), /第一次执念后，情况依然危险/u);
    assert.match(await play.locator('[data-slot="露西"]').innerText(), /空槽/u);
    assert.ok(await play.locator('[data-slot="粪怪"]').isEnabled());
    assert.ok(await button("确认").isDisabled());
    await place("灰钢架势", "露西");
    await play.locator('[data-card="短促刺击"]').dragTo(play.locator('[data-slot="粪怪"]'));
    await result.getByRole("button", { name: "选项1" }).click();
    await play.getByRole("heading", { name: "模拟战斗 · monster1" }).waitFor();
    await button("胜利").click();
    assert.match(await play.innerText(), /露西获救 = true/u);
    await button("重置").click();
    await place("灰钢架势", "露西");
    await button("确认").click();
    await result.getByRole("button", { name: "选项2" }).click();
    assert.equal(await play.getByRole("heading", { name: "本轮已结束" }).count(), 1);
    assert.deepEqual(errors, []);
    console.log("PASS: entry points, folding, diagnostics, draft restore, import/export, battle outcomes and nested jumps");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
