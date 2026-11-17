const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Text = require("../npc-editor/dialogue-text.js");
const Runtime = require("../npc-dialogues.js");
const sample = () => JSON.parse(fs.readFileSync(require.resolve("../npc-editor/examples/dialogue_debug.json"), "utf8"));
const edit = (d, change) => { const p = Text.split(Text.serialize(d)); return Text.compile(Text.combine(change(p.text), p.config), d); };

test("JSON node references align with their choices without adding an indentation level", async () => {
  const d = sample(), encoded = Text.serialize(d), prose = Text.split(encoded).text;
  assert.match(prose, /\n {4}》返回交谈\n {4}@ root\n {4}》离开/);
  const lines = prose.split("\n");
  let references = 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() !== "@ root") continue;
    assert.ok(lines[i - 1].trimStart().startsWith("》"));
    assert.equal(lines[i].match(/^ */)[0].length, lines[i - 1].match(/^ */)[0].length);
    references++;
  }
  assert.ok(references > 1);
  const result = await Text.compile(encoded, d);
  assert.deepEqual(result.dialogue, d, JSON.stringify(result.diagnostics));
  assert.equal(Text.split(Text.serialize(result.dialogue)).text, prose);
});

test("debug fixture has one shared list and complete text round trips without copies", async () => {
  const d = sample();
  assert.deepEqual(Runtime.validateDialogue(d), { errors: [], warnings: [] });
  assert.equal(d.nodes.root.optionList, "mainChoices");
  assert.equal(d.nodes.textNode1.optionList, "mainChoices");
  assert.ok(Object.values(d.nodes).every((node) => !Object.hasOwn(node, "options")));
  assert.match(Text.split(Text.serialize(d)).text, /@ mainChoices/);
  const r = await Text.compile(Text.serialize(d), d);
  assert.deepEqual(r.dialogue, d, JSON.stringify(r.diagnostics));
  // Complete text carries enough metadata to import into a fresh document.
  const fresh = { ...d, nodes: { root: { body: "" } }, optionLists: {} };
  assert.deepEqual((await Text.compile(Text.serialize(d), fresh)).dialogue, d);
});

test("@list retains reply and entry effects, @node replaces both with the target", async () => {
  const d = sample();
  d.nodes.root.effects = [{ type: "setFlag", key: "rootEffect", value: true }];
  d.nodes.textNode1.effects = [{ type: "setFlag", key: "replyEffect", value: true }];
  const borrowed = await Text.compile(Text.serialize(d), d);
  const reply = Runtime.resolveNode(borrowed.dialogue, "textNode1");
  assert.equal(reply.body, d.nodes.textNode1.body);
  assert.deepEqual(reply.effects, d.nodes.textNode1.effects);
  const jumped = await edit(d, (text) => text.replace("@ mainChoices", "@ root"));
  assert.ok(jumped.dialogue, JSON.stringify(jumped.diagnostics));
  assert.equal(jumped.dialogue.optionLists.mainChoices.options.find((o) => o.id === "avoid").next, "root");
  assert.equal(jumped.dialogue.nodes.textNode1, undefined);
  assert.ok(jumped.diagnostics.some((entry) => entry.message.includes("临时正文")));
  const flags = {};
  Runtime.applyEffects(Runtime.resolveNode(jumped.dialogue, "root").effects, { setFlag: (k, v) => { flags[k] = v; } });
  assert.deepEqual(flags, { rootEffect: true });
});

test("bare @list retains the current prose without replaying parent entry effects", async () => {
  const d = sample(); d.nodes.root.effects = [{ type: "setFlag", key: "entry", value: true }];
  const r = await edit(d, (text) => text.replace("    她非常失望，但又不愿意表现出来。\n    @ mainChoices", "    @mainChoices"));
  assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
  const reply = Runtime.resolveNode(r.dialogue, r.dialogue.optionLists.mainChoices.options.find((o) => o.id === "avoid").next);
  assert.equal(reply.body, d.nodes.root.body);
  assert.deepEqual(reply.effects, []);
});

test("editing shared answers immediately updates both runtime nodes and survives conversion", async () => {
  const d = sample(); d.optionLists.mainChoices.options[0].label = "共同修改";
  for (const id of ["root", "textNode1"]) assert.equal(Runtime.resolveNode(d, id).options[0].label, "共同修改");
  const r = await edit(d, (text) => text.replace("共同修改", "文本修改"));
  for (const id of ["root", "textNode1"]) assert.equal(Runtime.resolveNode(r.dialogue, id).options[0].label, "文本修改");
  assert.deepEqual((await Text.compile(Text.serialize(r.dialogue), r.dialogue)).dialogue, r.dialogue);
});

test("moved or inserted answers keep advanced effects attached to their identities", async () => {
  const d = sample(); d.optionLists.mainChoices.options.find((o) => o.id === "leave").hint = "只属于离开";
  const r = await edit(d, (text) => text.replace("》回避\n", "》新增\n》离开\n》回避\n").replace(/\n》离开$/, ""));
  assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
  const choices = r.dialogue.optionLists.mainChoices.options;
  assert.equal(choices.find((o) => o.label === "离开").hint, "只属于离开");
  assert.equal(choices.find((o) => o.label === "新增").hint, undefined);
  assert.equal(choices.find((o) => o.label === "问候").effects[0].key, "debugGreetedLucy");
});

test("unknown references and colliding IDs fail without changing the document", async () => {
  const d = sample(), before = JSON.stringify(d);
  const r = await edit(d, (text) => text.replace("@ mainChoices", "@missing"));
  assert.equal(r.dialogue, null); assert.match(r.diagnostics[0].message, /未知/);
  assert.equal(JSON.stringify(d), before);
  d.optionLists.root = { options: [] };
  assert.ok(Runtime.validateDialogue(d).errors.some((e) => e.includes("同时用于")));
  assert.equal((await edit(d, (text) => text)).dialogue, null);
});

test("validation checks group options, missing groups and mixed inline storage", () => {
  const d = sample(); d.nodes.root.optionList = "missing";
  d.nodes.textNode1.options = [];
  d.optionLists.mainChoices.options[0].next = "missing";
  const errors = Runtime.validateDialogue(d).errors.join("\n");
  assert.match(errors, /未知选项组/); assert.match(errors, /不能同时保存 options/); assert.match(errors, /next 指向未知节点/);
});

test("references retain existing targets even when their definitions are not in the prose", async () => {
  const d = sample();
  for (const source of ["新的正文\n@mainChoices", "临时正文\n@unwell", "开场\n》继续\n    @unwell"]) {
    const r = await edit(d, () => source);
    assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
    assert.deepEqual(Runtime.validateDialogue(r.dialogue), { errors: [], warnings: [] });
    assert.ok(r.dialogue.nodes.unwell);
    if (source.includes("@mainChoices")) assert.equal(r.dialogue.nodes.root.body, "新的正文");
    else if (source.startsWith("临时")) assert.equal(r.dialogue.start.default, "unwell");
    else assert.equal(r.dialogue.optionLists.mainChoices.options[0].next, "unwell");
    assert.ok((await Text.compile(Text.serialize(r.dialogue), r.dialogue)).dialogue);
  }
});

test("a same-level # call round trips as an option action with its visibility condition", async () => {
  const d = sample();
  const r = await edit(d, () => "\\#岸台\n》交谈\n    问问看\n    》（交易知识）交易\n    #shop_eddie\n    》离开");
  assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
  const root = Runtime.resolveNode(r.dialogue, "root");
  assert.equal(root.body, "#岸台");
  const reply = r.dialogue.nodes[root.options[0].next];
  const choice = r.dialogue.optionLists[reply.optionList].options[0];
  assert.equal(choice.label, "交易");
  assert.equal(choice.action, "shop_eddie");
  assert.equal(choice.next, undefined);
  const key = r.registry["交易知识"];
  assert.equal(Runtime.resolveNode(r.dialogue, root.options[0].next).options.some((option) => option.action), false);
  assert.equal(Runtime.resolveNode(r.dialogue, root.options[0].next, { getFlag: (id) => id === key }).options[0].action, "shop_eddie");
  const encoded = Text.serialize(r.dialogue);
  assert.match(Text.split(encoded).text, /    》（交易知识）交易\n    #shop_eddie/);
  assert.deepEqual((await Text.compile(encoded, r.dialogue)).dialogue, r.dialogue);
});

test("# calls reject invalid placement, unknown IDs, duplicates and shop continuations", async () => {
  const d = sample();
  for (const [source, line, message] of [
    ["开场\n#shop_eddie", 2, /紧跟/],
    ["开场\n》交易\n    #shop_eddie", 3, /同级/],
    ["开场\n》交易\n#missing", 3, /未登记/],
    ["开场\n》交易\n#shop_eddie\n#fight_eddie", 4, /只能写一个/],
    ["开场\n》交易\n#shop_eddie\n    再说一句", 3, /后续对白/],
  ]) {
    const r = await edit(d, () => source);
    assert.equal(r.dialogue, null);
    assert.equal(r.diagnostics[0].line, line);
    assert.match(r.diagnostics[0].message, message);
  }
});
