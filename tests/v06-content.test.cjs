const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Runtime = require("../action-events.js");
const Npcs = require("../npc-dialogues.js");
const root = path.join(__dirname, "..");
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const context = vm.createContext({ window: {} });
for (const file of ["world-map.js", "world-events.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
const map = context.window.WORLD_MAP_BUNDLE.map;
const sets = context.window.WORLD_EVENT_SET_BUNDLE.eventSets;
const active = map.nodes.filter((n) => n.eventSetId === `v06_${n.id}`);

test("12-node sediment slice retains orphaned content and a directed reveal graph", () => {
  assert.equal(active.length, 12);
  assert.equal(map.edges.length, 13);
  assert.ok(map.nodes.some((n) => n.id === "node12"));
  const ids = new Set(active.map((n) => n.id));
  for (const edge of map.edges) { assert.ok(ids.has(edge.from)); assert.ok(ids.has(edge.to)); }
  const seen = new Set(["start"]);
  for (let i = 0; i < 12; i++) for (const e of map.edges) {
    if (seen.has(e.from)) seen.add(e.to);
  }
  assert.equal(seen.size, 12);
  for (const node of active) assert.equal(sets[node.eventSetId].entries[0].dialogueId, `site_${node.id}`);
  assert.equal(map.nodes.find((n) => n.id === "slice_pipe_seam").revealFlag, "pipeFound");
  assert.equal(map.edges.some((e) => e.from === "slice_church_nave"), false);
  assert.ok(!active.some((n) => ["slice_catchgallery", "slice_pipe_threshold", "slice_salvage", "slice_winnie_stop", "slice_lowfork"].includes(n.id)));
});

test("all action and NPC files validate, including the explicit new actions", () => {
  const manifest = json("action-events/manifest.json");
  for (const [id, file] of Object.entries(manifest.events)) {
    const event = json(`action-events/${file}`);
    assert.equal(event.id, id);
    assert.deepEqual(Runtime.validate(event), [], id);
  }
  for (const file of Object.values(json("npc-dialogues/manifest.json").dialogues)) {
    const script = json(`npc-dialogues/${file}`);
    const checked = Npcs.validateDialogue(script);
    assert.deepEqual(checked.errors, [], file);
    assert.ok(!checked.warnings.some((s) => /未登记|未知物品/.test(s)), file);
  }
});

test("Eddie gives limited firsthand evidence, no free meat or lifespan claim", () => {
  const current = json("npc-dialogues/eddie.json");
  assert.equal(current.start.default, "root");
  assert.equal(current.nodes.first_gift, undefined);
  assert.match(current.nodes.church_info.body, /我见过有人背着东西/);
  assert.match(current.nodes.church_info.body, /我没见谁回来告诉我/);
  assert.doesNotMatch(JSON.stringify(current), /唯一出口|唯一离开|撑得更久|延寿/);
  assert.ok(current.nodes.root.options.some((o) => o.action === "fight_eddie"));
});

test("potion removed from runtime, registries, editor and all NPC content", () => {
  const files = ["world.js", "world-v06.js", "npc-dialogues.js", "npc-editor/editor.js", ...Object.values(json("npc-dialogues/manifest.json").dialogues).map((p) => `npc-dialogues/${p}`)];
  for (const file of files) assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), /healingPotion|止血瓶|止血剂/, file);
});

test("narrow passage uses visible targets and bait must be a consumed item", () => {
  const event = json("action-events/slice-climbcourt.json");
  const owned = [
    { key: "attack", kind: "card", category: "attack", cardId: "quick", amount: 1, available: true },
    { key: "guard", kind: "card", category: "defense", cardId: "guard", amount: 1, available: true },
    { key: "meat", kind: "item", tags: ["freshFlesh", "lure"], amount: 1, available: true },
    { key: "lore", kind: "knowledge", tags: ["lure"], amount: 1, available: true },
  ];
  assert.equal(Runtime.match(event, "opening", { monster: "attack" }, owned).recipe.action, "court_battle");
  assert.equal(Runtime.match(event, "opening", { field: "guard" }, owned).recipe.hpCost, 4);
  assert.equal(Runtime.match(event, "opening", { ridge: "lore" }, owned).valid, false);
  assert.equal(Runtime.match(event, "opening", { ridge: "meat" }, owned).recipe.action, "court_bait");
  const manifest = json("action-events/manifest.json");
  for (const id of ["sliceNave", "sliceGallery", "sliceSalvage"]) assert.equal(manifest.events[id], undefined);
});

test("new moving characters all have combat records and only supported single/group fields", () => {
  const manifest = json("battle-data/manifest.json");
  for (const id of ["thomas", "genichiro", "winnie", "mor", "emperor", "hollan", "church_resident"]) {
    const c = json(`battle-data/${manifest.combatants[id]}`);
    assert.equal(c.id, id);
    if (!c.combatEnabled) { assert.equal(c.stats, null); assert.deepEqual(c.skills, []); }
    else for (const skill of c.skills) { assert.ok(skill.id.startsWith(`${id}_`)); assert.ok(skill.windup >= 1); }
  }
});
