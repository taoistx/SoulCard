const { test } = require("node:test");
const assert = require("node:assert/strict");
const Runtime = require("../npc-dialogues.js");
const Text = require("../npc-editor/dialogue-text.js");
const base = { schemaVersion: 1, kind: "npc", id: "dialogue_debug", name: "测试场景", start: { default: "root", rules: [] }, nodes: { root: { body: "原文", options: [] } } };
const sample = "露西看向你\n》回避\n她非常失望，但又不愿意表现出来\n @ root\n》离开";

test("ordinary blank lines preserve paragraph spacing without escape markers", async () => {
  for (const blank of ["", "    "]) {
    const source = `第一段\n\n第二段\n\n\n第三段\n》继续\n    回复第一段\n${blank}\n${blank}\n    回复第二段\n    》离开\n\n》离开`;
    const r = await Text.compile(source, base);
    assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
    assert.equal(r.dialogue.nodes.root.body, "第一段\n\n第二段\n\n\n第三段");
    const child = r.dialogue.nodes[r.dialogue.nodes.root.options[0].next];
    assert.equal(child.body, "回复第一段\n\n\n回复第二段");
    assert.equal(Object.keys(r.dialogue.nodes).length, 2);
    const encoded = Text.serialize(r.dialogue);
    assert.doesNotMatch(Text.split(encoded).text, /^\s*\\\s*$/m);
    assert.deepEqual((await Text.compile(encoded, r.dialogue)).dialogue, r.dialogue);
  }
});

test("existing escaped empty lines remain readable and export as natural spacing", async () => {
  const r = await Text.compile("第一段\n\\\n第二段\n》离开", base);
  assert.equal(r.dialogue.nodes.root.body, "第一段\n\n第二段");
  assert.equal(Text.split(Text.serialize(r.dialogue)).text, "第一段\n\n第二段\n》离开");
});

test("basic prose and its choices share the same indentation", async () => {
  const r = await Text.compile("主文本1\n》主文本1选项1\n》离开", base);
  assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
  assert.equal(r.dialogue.nodes.root.body, "主文本1");
  assert.deepEqual(r.dialogue.nodes.root.options.map((o) => o.label), ["主文本1选项1", "离开"]);
  assert.deepEqual(Object.keys(r.dialogue.nodes), ["root"]);
});

test("the user's nested example works with tabs and four spaces", async () => {
  for (const indent of ["\t", "    "]) {
    const source = `主文本1\n》主文本1选项1\n${indent}主文本2\n${indent}》主文本2选项1\n${indent}》主文本2选项2\n》离开`;
    const r = await Text.compile(source, base);
    assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
    const root = r.dialogue.nodes.root, child = r.dialogue.nodes[root.options[0].next];
    assert.equal(child.body, "主文本2");
    assert.deepEqual(child.options.map((o) => o.label), ["主文本2选项1", "主文本2选项2"]);
    assert.deepEqual(root.options.map((o) => o.label), ["主文本1选项1", "离开"]);
    assert.equal(Object.keys(r.dialogue.nodes).length, 2);
    const encoded = Text.serialize(r.dialogue), text = Text.split(encoded).text;
    assert.match(text, /\n {4}主文本2\n {4}》主文本2选项1\n {4}》主文本2选项2/);
    assert.deepEqual((await Text.compile(encoded, r.dialogue)).dialogue, r.dialogue);
  }
});

test("deep choices, conditions, effects and dedenting keep their correct owner", async () => {
  const r = await Text.compile("主文本1\n》进入第二层\n    主文本2\n    （+已到第二层）\n    》（已到第二层）进入第三层（+选择过）\n        主文本3\n        》回开场\n            @root\n        》第三层离开\n    》第二层离开\n》根层离开", base);
  assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
  const root = r.dialogue.nodes.root, second = r.dialogue.nodes[root.options[0].next], third = r.dialogue.nodes[second.options[0].next];
  assert.deepEqual(root.options.map((o) => o.label), ["进入第二层", "根层离开"]);
  assert.deepEqual(second.options.map((o) => o.label), ["进入第三层", "第二层离开"]);
  assert.deepEqual(third.options.map((o) => o.label), ["回开场", "第三层离开"]);
  assert.equal(third.options[0].next, "root");
  assert.equal(second.effects[0].key, r.registry["已到第二层"]);
  assert.equal(second.options[0].effects[0].key, r.registry["选择过"]);
});

test("version 2 complete-text imports remain readable and export the new indentation", async () => {
  const cfg = { version: 1, syntaxVersion: 2, dialogue: structuredClone(base), nodes: {}, options: {} }; delete cfg.dialogue.nodes;
  const old = "开场\n》进入\n    旧回复\n        》回开场\n            @root";
  const r = await Text.compile(Text.combine(old, cfg), base);
  assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
  const next = Text.split(Text.serialize(r.dialogue));
  assert.equal(next.config.syntaxVersion, 3);
  assert.match(next.text, /\n {4}旧回复\n {4}》回开场\n {4}@ root/);
  assert.deepEqual((await Text.compile(Text.combine(next.text, next.config), r.dialogue)).dialogue, r.dialogue);
});

test("the user's exact flat example generates IDs and retains reply text with root choices", async () => {
  const r = await Text.compile(sample, base);
  assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
  const d = r.dialogue, replyId = d.nodes.root.options[0].next;
  assert.equal(d.name, "测试场景");
  assert.equal(d.nodes.root.body, "露西看向你");
  assert.equal(d.nodes[replyId].body, "她非常失望，但又不愿意表现出来");
  assert.deepEqual(d.nodes[replyId].options, d.nodes.root.options);
  assert.equal(d.editor.textAuthoring.optionSources[replyId], "root");
  assert.equal(d.nodes[replyId].options[0].next, replyId);
  assert.equal(d.nodes[replyId].options[1].next, undefined);
  const text = Text.split(Text.serialize(d)).text;
  assert.doesNotMatch(text, /@node|@option|->/);
  assert.match(text, /@ root/);
  assert.ok(text.startsWith("露西看向你"));
  const back = await Text.compile(Text.serialize(d), d);
  assert.deepEqual(back.dialogue, d, JSON.stringify(back.diagnostics));
});

test("indented replies and both @ spellings borrow only options, not target effects/body", async () => {
  for (const ref of ["    @root", "        @ root"]) {
    const r = await Text.compile(`露西看向你\n（+开场）\n》回避\n    她很失望\n    （+失望）\n${ref}\n》离开`, base);
    assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
    const d = r.dialogue, id = d.nodes.root.options[0].next, flags = {};
    const ctx = { getFlag: (key) => flags[key], setFlag: (key, value) => { flags[key] = value; } };
    Runtime.applyEffects(d.nodes[id].effects, ctx);
    assert.equal(flags[r.registry["开场"]], undefined);
    assert.equal(flags[r.registry["失望"]], true);
    const reply = Runtime.resolveNode(d, id, ctx);
    assert.equal(reply.body, "她很失望");
    assert.deepEqual(reply.options.map((o) => o.label), ["回避", "离开"]);
    assert.equal(reply.effects.length, 1);
  }
});

test("a bare reference below an option jumps directly to the named node", async () => {
  for (const ref of ["    @ root", "@root"]) {
    const r = await Text.compile(`露西看向你\n》再看一次\n${ref}\n》离开`, base);
    assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
    assert.equal(r.dialogue.nodes.root.options[0].next, "root");
    assert.deepEqual(Object.keys(r.dialogue.nodes), ["root"]);
  }
});

test("IDs stay outside prose and survive edits and inserted branches", async () => {
  const first = await Text.compile("开场\n》甲\n    回复甲\n》乙\n    回复乙", base);
  const parts = Text.split(Text.serialize(first.dialogue));
  const changed = await Text.compile(Text.combine("开场\n》新分支\n    新的回复\n》甲\n    回复甲\n》乙\n    回复乙", parts.config), first.dialogue);
  assert.ok(changed.dialogue, JSON.stringify(changed.diagnostics));
  const idsBefore = first.dialogue.nodes.root.options.map((o) => o.next);
  const idsAfter = changed.dialogue.nodes.root.options.map((o) => o.next);
  assert.deepEqual(idsAfter.slice(1), idsBefore);
  assert.ok(!idsBefore.includes(idsAfter[0]));
  const secondParts = Text.split(Text.serialize(changed.dialogue));
  const edited = await Text.compile(Text.combine(secondParts.text.replace("回复甲", "修改后的回复甲"), secondParts.config), changed.dialogue);
  assert.deepEqual(edited.dialogue.nodes.root.options.map((o) => o.next), idsAfter);
});

test("references can borrow forward/chained options and keep live flag conditions", async () => {
  const source = "开场\n》先到甲\n    甲的正文\n    @textNode2\n》再到乙\n    乙的正文\n    》（条件1/！（条件2&条件3））继续\n    》离开";
  const r = await Text.compile(source, base);
  assert.ok(r.dialogue, JSON.stringify(r.diagnostics));
  const d = r.dialogue, flags = { [r.registry["条件2"]]: true, [r.registry["条件3"]]: true };
  assert.deepEqual(Runtime.resolveNode(d, "textNode1", { getFlag: (k) => flags[k] }).options.map((o) => o.label), ["离开"]);
  flags[r.registry["条件1"]] = true;
  assert.deepEqual(Runtime.resolveNode(d, "textNode1", { getFlag: (k) => flags[k] }).options.map((o) => o.label), ["继续", "离开"]);
});

test("deleted node IDs are not reassigned to later unrelated replies", async () => {
  const first = await Text.compile("开场\n》旧分支\n    旧的回复\n》离开", base);
  const deletedId = first.dialogue.nodes.root.options[0].next;
  const cfg = Text.split(Text.serialize(first.dialogue)).config;
  const removed = await Text.compile(Text.combine("开场\n》离开", cfg), first.dialogue);
  const nextCfg = Text.split(Text.serialize(removed.dialogue)).config;
  const next = await Text.compile(Text.combine("开场\n》新分支\n    新的回复\n》离开", nextCfg), removed.dialogue);
  assert.ok(next.dialogue, JSON.stringify(next.diagnostics));
  assert.notEqual(next.dialogue.nodes.root.options[0].next, deletedId);
});

test("unknown targets, reference cycles, mixed local choices and declarations fail atomically", async () => {
  const before = JSON.stringify(base);
  for (const source of ["正文\n》选项\n    回复\n    @missing", "正文\n@root", "正文\n》甲\n    甲\n    @textNode2\n》乙\n    乙\n    @textNode1", "正文\n@node root", "正文\n》选项\n    回复\n    @root\n    》本地回答", "正文\n》选项\n    回复\n        》错误的额外缩进"]) {
    const r = await Text.compile(source, base);
    assert.equal(r.dialogue, null, source);
    assert.equal(r.registry, null);
    assert.ok(r.diagnostics[0].line >= 1);
  }
  assert.equal(JSON.stringify(base), before);
});
