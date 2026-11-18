const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse, serialize, outline } = require("../action-event-editor/event-text.js");
const { validate } = require("../action-events.js");
const sample = require("../action-events/metal-in-mist.json");

test("all existing game events round-trip through editable text with their fields and matcher order intact", () => {
  const directory = path.join(__dirname, "..", "action-events");
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith(".json") && name !== "manifest.json")) {
    const original = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
    const text = serialize(original);
    const result = parse(text, file);
    assert.deepEqual(result.diagnostics, [], file);
    assert.deepEqual(result.event, original, file);
    assert.deepEqual(validate(result.event), [], file);
    for (const [id, stage] of Object.entries(original.stages)) {
      const matchOrder = (recipes) => recipes.map((recipe) => Object.keys(recipe.slots || {}));
      assert.deepEqual(matchOrder(result.event.stages[id].recipes), matchOrder(stage.recipes), file);
    }
  }
});

test("editing text changes only the intended event properties and leaves extensions intact", () => {
  const original = structuredClone(sample);
  original.metadata = { note: "自定义数据" };
  original.stages.opening.body = "\n标题：保留标点\n  缩进\n";
  original.stages.opening.recipes[0].slots.subject.extra = "未来的匹配选项";
  const text = serialize(original).replace("标题：菌雾里的金属声", "标题：新的名字");
  const { event, diagnostics } = parse(text, "面板.json");
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(event, { ...original, name: "新的名字" });
  assert.ok(outline(text).some(({ kind, label }) => kind === "规则组" && label === "opening"));
  assert.ok(outline(text).some(({ kind, label }) => kind === "配方" && label === "metal_observe"));
});

test("malformed text locates diagnostics and rejects repeated slots or fields in a recipe", () => {
  const text = serialize(sample).replace("伎俩[focus]》subject", "伎俩[focus]》subject\n        暴力》subject");
  const { diagnostics } = parse(text + "  字段：错误\n", "面板.json");
  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].file, "面板.json");
  assert.equal(diagnostics[0].column, 9);
  assert.match(diagnostics[0].message, /重复/u);
  assert.match(diagnostics[1].message, /缩进/u);
});
