const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const example = require("../action-event-editor/example.js");
const native = require("../action-events/metal-in-mist.json");
const { serialize } = require("../action-event-editor/event-text.js");

async function main() {
  const root = path.resolve(__dirname, "..");
  const temporary = fs.mkdtempSync(path.join(process.env.ACTION_EVENT_TEST_TMP || os.tmpdir(), "action-event-folder-"));
  const directory = path.join(temporary, "事件 JSON 文件");
  const settingsFile = path.join(temporary, "settings.json");
  fs.mkdirSync(directory);
  const write = (name, data) => fs.writeFileSync(path.join(directory, name), JSON.stringify(data), "utf8");
  write("正式事件.json", native);
  write("沙盒事件.json", { ...example, kind: "action-event-sandbox", schemaVersion: 1 });
  write("manifest.json", { events: {} });
  fs.writeFileSync(path.join(directory, "损坏.json"), "{");
  const server = spawn(process.env.PYTHON || "python", ["-B", "-u", "-c", [
    "import runpy, sys",
    "from pathlib import Path",
    "from http.server import ThreadingHTTPServer",
    "NodeEditorHandler = runpy.run_path('node-editor/server.py')['NodeEditorHandler']",
    "NodeEditorHandler.action_settings_file = Path(sys.argv[1])",
    "with ThreadingHTTPServer(('127.0.0.1', 0), NodeEditorHandler) as server:",
    "    print(server.server_port, flush=True)",
    "    server.serve_forever()",
  ].join("\n"), settingsFile], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "inherit"] });
  const stopped = once(server, "exit");
  let browser;
  try {
    const port = await Promise.race([
      once(server.stdout, "data").then(([chunk]) => Number(chunk.toString().trim())),
      stopped.then(([code]) => { throw new Error(`File service exited during startup (${code})`); }),
    ]);
    assert.ok(port > 0);
    const base = `http://127.0.0.1:${port}`;
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge", headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const button = (name) => page.getByRole("button", { name, exact: true });
    const select = page.locator("#eventFile");
    const input = page.locator("#source");
    const folderDialog = page.locator("#eventFolderSettings");
    const filenameIs = (name) => page.waitForFunction((value) => document.querySelector("#filename").textContent === value, name);

    await page.goto(base + "/action-event-editor/index.html");
    await select.locator('option[value="metal-in-mist.json"]').waitFor({ state: "attached" });
    assert.equal(await select.locator('option[value="manifest.json"]').count(), 0);
    await select.selectOption("metal-in-mist.json");
    await filenameIs("metal-in-mist.json");
    assert.match(await input.inputValue(), /^@event metalInMist\n/u);
    assert.match(await input.inputValue(), /\[opening\][\s\S]*伎俩\[focus\]》subject/u);
    await page.getByRole("tab", { name: "当前 JSON" }).click();
    assert.deepEqual(JSON.parse(await page.locator("#jsonPreview").textContent()), native);
    assert.ok(await button("导出 JSON").isEnabled());

    await button("设置").click();
    assert.match(await page.locator("#eventDirectory").inputValue(), /action-events$/u);
    await page.locator("#eventDirectory").fill(path.join(directory, "不存在"));
    await button("应用文件夹").click();
    await page.getByText(/事件 JSON 文件夹不存在/u).waitFor();
    assert.equal(await select.inputValue(), "metal-in-mist.json");
    await page.locator("#eventDirectory").fill(directory);
    await button("应用文件夹").click();
    await folderDialog.waitFor({ state: "hidden" });
    assert.deepEqual(await select.locator("option").evaluateAll((items) => items.map((item) => item.value).sort()), ["", "正式事件.json", "沙盒事件.json"]);
    assert.equal(JSON.parse(fs.readFileSync(settingsFile, "utf8")).directory, directory);
    assert.match(await page.locator("#eventFolderStatus").innerText(), /1 个 JSON 读取失败/u);

    await select.selectOption("正式事件.json");
    await filenameIs("正式事件.json");
    await input.fill(serialize(native).replace("标题：菌雾里的金属声", "标题：已修改的标题"));
    await button("转换并应用").click();
    const [download] = await Promise.all([page.waitForEvent("download"), button("导出 JSON").click()]);
    assert.equal(download.suggestedFilename(), "正式事件.json");
    assert.equal(JSON.parse(fs.readFileSync(await download.path(), "utf8")).name, "已修改的标题");
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "正式事件.json"), "utf8")).name, native.name);

    await input.fill("{");
    await button("转换并应用").click();
    await page.locator("#diagnostics button.error").waitFor();
    const cancel = page.waitForEvent("dialog");
    await select.selectOption("沙盒事件.json");
    await (await cancel).dismiss();
    await page.waitForFunction(() => document.querySelector("#eventFile").value === "正式事件.json");
    assert.equal(await input.inputValue(), "{");
    const confirm = page.waitForEvent("dialog");
    await select.selectOption("沙盒事件.json");
    await (await confirm).accept();
    await filenameIs(example.filename);
    assert.equal(await input.inputValue(), example.source);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#eventFile").value === "沙盒事件.json");

    const query = new URLSearchParams({ directory, file: "../manifest.json" });
    assert.equal((await fetch(base + `/__action_event_editor/document?${query}`)).status, 400);
    assert.deepEqual(errors, []);
    console.log("PASS: configurable folder, native JSON and DSL loading, export, draft protection and traversal rejection");
  } finally {
    if (browser) await browser.close();
    server.kill();
    await stopped;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
