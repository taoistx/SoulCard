const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const Runtime = require("../npc-dialogues.js");

const dialogueDirectory = join(__dirname, "..", "npc-dialogues");
const manifest = JSON.parse(readFileSync(join(dialogueDirectory, "manifest.json"), "utf8"));
assert.equal(manifest.schemaVersion, 1);
const dialogues = Object.fromEntries(readdirSync(dialogueDirectory)
  .filter((name) => name.endsWith(".json") && name !== "manifest.json")
  .map((name) => {
    const dialogue = JSON.parse(readFileSync(join(dialogueDirectory, name), "utf8"));
    assert.deepEqual(Runtime.validateDialogue(dialogue).errors, [], `${name} must pass schema validation`);
    return [dialogue.id, dialogue];
  }));
assert.deepEqual(Object.keys(dialogues).sort(), Object.keys(manifest.dialogues).sort());
Object.entries(manifest.dialogues).forEach(([id, file]) => assert.equal(JSON.parse(readFileSync(join(dialogueDirectory, file), "utf8")).id, id));
assert.doesNotThrow(() => Runtime.validateDialogue({ schemaVersion: 1, id: "broken", name: "Broken", start: { default: "root", rules: {} }, nodes: { root: { body: "", options: {} } } }));
assert.doesNotThrow(() => Runtime.validateDialogue({ schemaVersion: 1, id: "brokenEffects", name: "Broken", start: { default: "root", rules: [] }, nodes: { root: { body: "", options: [{ id: "bad", label: "Bad", effects: {} }] } } }));

function createState(overrides = {}) {
  const state = { day: 1, flags: {}, inventory: {}, sacrificed: {}, ...overrides };
  return {
    state,
    context: {
      get day() { return state.day; },
      get sacrificedCount() { return Object.keys(state.sacrificed).length; },
      dailyStockId: "longSword", dailyStockName: "长剑",
      getFlag: (key) => state.flags[key], setFlag: (key, value) => { state.flags[key] = value; },
      hasItem: (id, amount = 1) => (state.inventory[id] || 0) >= amount,
      addItem: (id, amount = 1) => { state.inventory[id] = (state.inventory[id] || 0) + amount; },
      removeItem: (id, amount = 1) => { if ((state.inventory[id] || 0) < amount) return false; state.inventory[id] -= amount; if (state.inventory[id] <= 0) delete state.inventory[id]; return true; },
      hasSacrificed: (id) => Boolean(state.sacrificed[id]),
    },
  };
}

const bellState = createState();
assert.equal(Runtime.resolveStart(dialogues.bell, bellState.context), "hostile");
bellState.state.sacrificed = { head: true, brain: true };
assert.equal(Runtime.resolveStart(dialogues.bell, bellState.context), "recognized");

const chrisState = createState({ day: 4, flags: {}, inventory: { healingPotion: 1 }, sacrificed: {} });
assert.match(Runtime.resolveNode(dialogues.chris, "root", chrisState.context).body, /明天我就上山/);
assert.equal(Runtime.resolveNode(dialogues.chris, "root", chrisState.context).options[0].enabled, true);

const eddieState = createState({ day: 2, flags: {}, inventory: { freshFlesh: 1 }, sacrificed: {} });
const eddieNode = Runtime.resolveNode(dialogues.eddie, "root", eddieState.context);
assert.equal(eddieNode.options.find((option) => option.id === "attack").action, "fight_eddie");
assert.equal(Runtime.resolveStart(dialogues.eddie, eddieState.context), "first_gift");
assert.equal(Runtime.applyEffects(Runtime.resolveNode(dialogues.eddie, "first_gift", eddieState.context).effects, eddieState.context), true);
assert.deepEqual(eddieState.state.inventory, { freshFlesh: 1, baitMeat: 1 });
assert.equal(Runtime.resolveStart(dialogues.eddie, eddieState.context), "root");
assert.equal(Runtime.renderTemplate("{{dailyStockName}} · 第 {{day}} 天", eddieState.context), "长剑 · 第 2 天");
assert.equal(Runtime.applyEffects([{ type: "setFlag", key: "visitedDay{{day}}", value: true }], eddieState.context), true);
assert.equal(eddieState.state.flags.visitedDay2, true);

const thomasState = createState();
assert.equal(Runtime.resolveStart(dialogues.thomas, thomasState.context), "root");
thomasState.state.flags.thomasInfected = true;
assert.equal(Runtime.resolveStart(dialogues.thomas, thomasState.context), "infected");
assert.match(Runtime.resolveNode(dialogues.thomas, "infected", thomasState.context).body, /孢子/);

const atomicState = createState({ inventory: { freshFlesh: 1 } });
assert.equal(Runtime.applyEffects([{ type: "removeItem", itemId: "freshFlesh", amount: 1 }, { type: "removeItem", itemId: "freshFlesh", amount: 1 }, { type: "setFlag", key: "bad", value: true }], atomicState.context), false);
assert.deepEqual(atomicState.state.inventory, { freshFlesh: 1 });
assert.equal(atomicState.state.flags.bad, undefined);

console.log("PASS: NPC schema, entry rules, text variants, templates and atomic effects");
