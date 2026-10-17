const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const catalog = require("../world-dialogue-catalog.js");
const runtime = require("../npc-dialogues.js");
const root = path.join(__dirname, "..");
const json = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const manifest = json("world-dialogues/manifest.json");
const documents = Object.fromEntries(Object.entries(manifest.dialogues).map(([id, file]) => [id, json(`world-dialogues/${file}`)]));
const condition = (key, value) => ({ mode: "all", clauses: [{ source: "flag", key, operator: "eq", value }] });

test("every world tree is registered, validates, and has resolvable actions and entries", () => {
  assert.deepEqual(fs.readdirSync(path.join(root, "world-dialogues")).filter((f) => f.endsWith(".json") && f !== "manifest.json").sort(), Object.values(manifest.dialogues).sort());
  assert.equal(new Set(Object.values(manifest.dialogues)).size, Object.keys(documents).length);
  for (const [id, document] of Object.entries(documents)) {
    assert.equal(document.id, id);
    assert.equal(document.kind, "world");
    assert.deepEqual(runtime.validateDialogue(document).errors, [], id);
    for (const node of Object.values(document.nodes)) for (const option of node.options || []) if (option.action) assert.ok(catalog.actions[option.action], `${id}: ${option.action}`);
  }
});

test("all map dialogue and action result references resolve without duplicated result text", () => {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "world-events.js"), "utf8"), scope);
  for (const set of Object.values(scope.window.WORLD_EVENT_SET_BUNDLE.eventSets)) for (const entry of set.entries) if (entry.kind === "dialogue") assert.ok(documents[entry.dialogueId], entry.dialogueId);
  for (const file of Object.values(json("action-events/manifest.json").events)) {
    const event = json(`action-events/${file}`);
    for (const [stageId, stage] of Object.entries(event.stages)) for (const recipe of stage.recipes) {
      assert.ok(documents[recipe.resultDialogueId]?.nodes[recipe.resultNodeId], `${file}.${stageId}.${recipe.id}`);
      assert.equal(recipe.result, undefined, `${file}.${stageId}.${recipe.id} must have one text source`);
    }
  }
});

test("visibility, enabled conditions and closing policy are independent", () => {
  const script = { schemaVersion: 1, kind: "world", id: "example", name: "Example", start: { default: "root" }, nodes: { root: {
    body: "第 {{day}} 天 · {{nodeLabel}}", allowClose: false, allowCloseWhen: condition("canLeave", true),
    options: [{ id: "hidden", label: "hidden", visibleWhen: condition("visible", true) }, { id: "locked", label: "locked", enabledWhen: condition("enabled", true) }],
  } } };
  const flags = {}, context = { day: 2, nodeLabel: "岸台", getFlag: (key) => flags[key] };
  let resolved = runtime.resolveNode(script, "root", context);
  assert.equal(resolved.body, "第 2 天 · 岸台");
  assert.deepEqual(resolved.options.map((o) => o.id), ["locked"]);
  assert.equal(resolved.options[0].enabled, false);
  assert.equal(resolved.allowClose, false);
  Object.assign(flags, { visible: true, enabled: true, canLeave: true });
  resolved = runtime.resolveNode(script, "root", context);
  assert.equal(resolved.options.length, 2);
  assert.equal(resolved.options[1].enabled, true);
  assert.equal(resolved.allowClose, true);
  assert.deepEqual(runtime.validateDialogue(script).errors, []);
  script.nodes.root.options[0].action = "not_registered";
  assert.match(runtime.validateDialogue(script).errors.join(" "), /未登记/);
});

test("world loader freezes data and rejects missing files, bad IDs, paths and invalid JSON", async () => {
  const loader = fs.readFileSync(path.join(root, "world-dialogue-loader.js"), "utf8");
  async function load(overrides = {}) {
    const fake = { console: { error() {} }, URL, document: { currentScript: { src: "http://local/world-dialogue-loader.js" } }, window: { NPCDialogueRuntime: runtime } };
    fake.fetch = async (url) => {
      const name = url.pathname.slice(1);
      if (overrides[name] === "missing") return { ok: false, status: 404 };
      return { ok: true, json: async () => { if (overrides[name] === "invalid") throw new Error("JSON"); return overrides[name] || json(name); } };
    };
    vm.runInNewContext(loader, fake);
    await fake.window.WorldDialogueData.ready;
    return fake.window.WorldDialogueData;
  }
  const loaded = await load();
  assert.ok(Object.isFrozen(loaded.getAll()));
  assert.ok(Object.isFrozen(loaded.get("site_start").nodes.root));
  assert.equal(loaded.get("missing"), null);
  await assert.rejects(load({ "world-dialogues/site_start.json": "missing" }), /site_start.json.*404/);
  await assert.rejects(load({ "world-dialogues/site_start.json": "invalid" }), /site_start.json.*JSON/);
  await assert.rejects(load({ "world-dialogues/site_start.json": { ...documents.site_start, id: "wrong" } }), /ID/);
  await assert.rejects(load({ "world-dialogues/manifest.json": { schemaVersion: 1, dialogues: { site_start: "site_start.json", duplicate: "site_start.json" } } }), /重复/);
});
