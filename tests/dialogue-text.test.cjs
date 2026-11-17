const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
require("../world-dialogue-catalog.js");
const Runtime = require("../npc-dialogues.js");
const DialogueText = require("../npc-editor/dialogue-text.js");
const Text = DialogueText.legacy;
const base = { schemaVersion: 1, id: "lucy", name: "露西", start: { default: "root", rules: [] }, nodes: { root: { body: "旧正文", options: [] } } };
const context = (flags) => ({ getFlag: (key) => flags[key] });
const stripAuthoring = (d) => { d = structuredClone(d); if (d.editor) { delete d.editor.textAuthoring; if (!Object.keys(d.editor).length) delete d.editor; } return d; };

test("SHA-256 fallback preserves flag identities without Web Crypto or Node require", async () => {
  const scope = vm.createContext({ window: { NPCDialogueRuntime: Runtime }, TextEncoder });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../npc-editor/dialogue-text.js"), "utf8"), scope);
  for (const name of ["", "abc", "露西怪兽", "中文💡abcd".repeat(100), "x".repeat(55), "x".repeat(56), "x".repeat(64)]) {
    assert.equal(await scope.window.DialogueText.flagKey(name), `storyFlag_${crypto.createHash("sha256").update(name).digest("hex")}`);
  }
});

test("standalone debug example validates and retains its Chinese aliases on round trip", async () => {
  const example = JSON.parse(fs.readFileSync(path.join(__dirname, "../npc-editor/examples/dialogue_debug.json"), "utf8"));
  assert.deepEqual(Runtime.validateDialogue(example), { errors: [], warnings: [] });
  const currentText = require("../npc-editor/dialogue-text.js");
  const result = await currentText.compile(currentText.serialize(example), example);
  assert.deepEqual(result.dialogue, example, JSON.stringify(result.diagnostics));
});

test("nested expressions, all symbol widths, truth table, precedence and missing flags", async () => {
  const aliases = { 条件1: "a", 条件2: "b", 条件3: "c" };
  for (const expression of ["条件1/！（条件2&条件3）", "条件1／!(条件2＆条件3)", " 条件1 / !（ 条件2 & 条件3 ) "]) {
    const result = await Text.compile(`场景\n》（${expression}）继续`, base, aliases);
    assert.ok(result.dialogue, JSON.stringify(result.diagnostics));
    const when = result.dialogue.nodes.root.options[0].visibleWhen;
    for (let mask = 0; mask < 8; mask++) {
      const [a, b, c] = [0, 1, 2].map((bit) => Boolean(mask & (1 << bit)));
      assert.equal(Runtime.evaluateCondition(when, context({ a, b, c })), a || !(b && c));
    }
    assert.equal(Runtime.evaluateCondition(when, context({})), true);
  }
  for (const [expr, expected] of [["条件1/条件2&条件3", true], ["（条件1/条件2）&条件3", false], ["!!条件1", true]]) {
    const r = await Text.compile(`场景\n》（${expr}）继续`, base, aliases);
    assert.equal(Runtime.evaluateCondition(r.dialogue.nodes.root.options[0].visibleWhen, context({ a: true, b: false, c: false })), expected);
  }
});

test("Lucy branches use one indentation level per parent-child and distinct effect timing", async () => {
  const source = "路边偶遇露西\n\n你又见到她\n》（理解感染&没有吃药）你好点吗？\n\t她摇摇头\n》问候（+问候过）\n\t她没有回答\n\t\t》继续追问\n\t\t\t她变成了怪兽\n\t\t\t（+露西怪兽）\n\t\t》离开\n》离开";
  const result = await Text.compile(source, base);
  assert.ok(result.dialogue, JSON.stringify(result.diagnostics));
  const root = result.dialogue.nodes.root;
  assert.equal(root.options.length, 3);
  assert.equal(root.options[1].effects[0].key, result.registry["问候过"]);
  const reply = result.dialogue.nodes[root.options[1].next];
  assert.equal(reply.options.length, 2);
  const monster = result.dialogue.nodes[reply.options[0].next];
  assert.equal(monster.effects[0].key, result.registry["露西怪兽"]);
  assert.equal(reply.options[1].next, undefined);
  assert.equal(root.options[2].next, undefined);
  assert.match(result.registry["露西怪兽"], /^storyFlag_[a-f0-9]{64}$/);
  assert.equal((await Text.compile(source, base)).registry["露西怪兽"], result.registry["露西怪兽"]);
  assert.deepEqual(stripAuthoring((await Text.compile(Text.serialize(result.dialogue), base)).dialogue), stripAuthoring(result.dialogue));
});

test("errors are diagnostic and never mutate dialogue or registry", async () => {
  const aliases = { 已有: "existing" }, before = JSON.stringify(base), flagsBefore = JSON.stringify(aliases);
  for (const tail of ["》（）继续", "》（条件1/）继续", "》（!）继续", "》（（条件1）继续", "》（条件1 条件2）继续\n   非法缩进", "》问候\n        跳级", "@node root\n正文\n@node root\n重复", "@option a\n》一个\n@option a\n》两个", "》跳转\n    -> missing", "》跳转\n    -> root\n    多余正文", "@unknown"]) {
    const r = await Text.compile(`场景\n${tail}`, base, aliases);
    assert.equal(r.dialogue, null, tail);
    assert.equal(r.registry, null);
    assert.ok(r.diagnostics[0].line >= 1 && r.diagnostics[0].column >= 1);
  }
  assert.equal(JSON.stringify(base), before);
  assert.equal(JSON.stringify(aliases), flagsBefore);
  assert.throws(() => Text.mergeAliases({ 中文: "one" }, { 中文: "two" }), /冲突/);
  assert.throws(() => Text.mergeAliases({ 中文: "one", 另一个: "one" }), /同时对应/);
});

test("invalid negations fail closed and old empty groups retain behavior", () => {
  for (const group of [{ mode: "not", clauses: [] }, { mode: "not", clauses: [null] }, { mode: "not", clauses: [{ mode: "wrong", clauses: [] }] }, { mode: "not", clauses: [{ source: "flag", key: "a", operator: "unknown" }] }]) {
    assert.equal(Runtime.evaluateCondition(group, context({})), false);
    const d = structuredClone(base); d.nodes.root.options.push({ id: "x", label: "x", visibleWhen: group });
    assert.ok(Runtime.validateDialogue(d).errors.length);
  }
  assert.equal(Runtime.evaluateCondition({ mode: "any", clauses: [] }), true);
  assert.equal(Runtime.evaluateCondition({ mode: "all", clauses: [] }), true);
});

test("round trip retains whitespace, escaping, advanced fields, original condition shape and cycles", async () => {
  const flag = (key) => ({ source: "flag", key, operator: "eq", value: true });
  const d = structuredClone(base);
  d.nodes.root.body = " 前导空格\n\t制表\n  \n\n@config\n》（普通文字）\n反斜杠\\";
  d.nodes.root.options = [
    { id: "one", label: " 尾部空格  ", visibleWhen: { mode: "all", clauses: [flag("a"), flag("b"), flag("c"), flag("d")] }, effects: [{ type: "setFlag", key: "a", value: true }, { type: "addItem", itemId: "oldKey", amount: 1 }], next: "root" },
    { id: "two", hint: "缺少 label 字段也应保留", next: "shared" },
    { id: "three", label: "同一节点", next: "shared" },
  ];
  d.nodes.shared = { body: "", options: [{ id: "back", label: "返回", next: "root", enabledWhen: { mode: "not", clauses: [{ mode: "any", clauses: [flag("x"), flag("y")] }] } }] };
  const result = await Text.compile(Text.serialize(d), d);
  assert.ok(result.dialogue, JSON.stringify(result.diagnostics));
  assert.deepEqual(stripAuthoring(result.dialogue), d);
  const parts = Text.split(Text.serialize(d)); parts.config.options.root.one.visibleWhen = { mode: "all", clauses: [flag("a")] };
  assert.equal((await Text.compile(Text.combine(parts.text, parts.config), d)).dialogue, null, "duplicated text/config fields must fail");
});

test("escaped Flag names, repeated names, group negation and effect order", async () => {
  const result = await Text.compile("场景\n》（道路\\/感染&道路\\/感染）重复（+道路\\/感染）（-道路\\/感染）\n    回复\n    （+道路\\/感染）", base);
  assert.ok(result.dialogue, JSON.stringify(result.diagnostics));
  assert.equal(Object.keys(result.registry).length, 1);
  assert.deepEqual(result.dialogue.nodes.root.options[0].effects.map((e) => e.value), [true, false]);
  const back = await Text.compile(Text.serialize(result.dialogue), base);
  assert.ok(back.dialogue, JSON.stringify(back.diagnostics));
  assert.deepEqual(back.dialogue, result.dialogue);
});

for (const directory of ["npc-dialogues", "world-dialogues"]) {
  for (const file of fs.readdirSync(path.join(__dirname, "..", directory)).filter((s) => s.endsWith(".json") && !["manifest.json", "flag-mappings.json"].includes(s))) {
    test(`lossless round trip ${directory}/${file}`, async () => {
      const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", directory, file), "utf8"));
      const codec = d.optionLists ? DialogueText : Text;
      const result = await codec.compile(codec.serialize(d), d);
      assert.ok(result.dialogue, JSON.stringify(result.diagnostics));
      assert.deepEqual(stripAuthoring(result.dialogue), stripAuthoring(d));
    });
  }
}
