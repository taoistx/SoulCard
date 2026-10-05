const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Runtime = require("../action-events.js");
const Cards = require("../card-instances.js");
const directory = path.join(__dirname, "../action-events");
const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
const events = Object.entries(manifest.events).filter(([id]) => id !== "thomasCrossroads")
  .map(([id, file]) => ({ id, event: JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")) }));
const catalog = {
  quick: { type: "attack", name: "短促刺击" }, guard: { type: "defense", name: "灰钢架势" },
  focus: { type: "technique", name: "观察" }, adjust: { type: "technique", name: "调整" },
  delay: { type: "ritual", name: "割裂时序" }, heavy: { type: "attack", name: "葬仪重斩" },
  thrust: { type: "attack", name: "穿甲突刺" },
};
function resources(heart = false, flesh = true, wormKnowledge = false) {
  const state = {
    deck: Cards.copyDeck(Object.keys(catalog), catalog), inventory: flesh ? { freshFlesh: 1, baitMeat: 1, rottenFlesh: 1 } : {},
    knowledge: { dungLore: true, ...(wormKnowledge ? { wormFarming: true } : {}) }, sacrificed: heart ? { heart: true } : {},
  };
  return Runtime.resources(state, catalog, {
    freshFlesh: { name: "新鲜血肉", eventTags: ["freshFlesh"] },
    baitMeat: { name: "诱饵肉", eventTags: ["lure"] }, rottenFlesh: { name: "腐败血肉" },
  });
}
const placements = (index, bait = false) => ({ subject: `card:battle_${index}`, ...(bait ? { bait: "item:freshFlesh" } : {}) });

test("all five manifest entries validate and the corpse encounter needs no enemy", () => {
  assert.equal(events.length, 5);
  for (const { id, event } of events) {
    assert.equal(event.id, id);
    assert.deepEqual(Runtime.validate(event), []);
  }
  const broken = structuredClone(events.find(({ id }) => id === "breathingCorpses").event);
  assert.equal(broken.enemyId, undefined);
  assert.equal(broken.lureNodeId, undefined);
  assert.deepEqual(Runtime.validate(broken), []);
  const thomas = JSON.parse(fs.readFileSync(path.join(directory, "thomas-crossroads.json"), "utf8"));
  delete thomas.enemyId;
  assert.ok(Runtime.validate(thomas).some((error) => error.includes("缺少事件敌人")));
});

test("observation has exactly one outcome and cannot become a generic trick", () => {
  for (const { id, event } of events.filter(({ id }) => !["livingHand", "breathingCorpses"].includes(id))) {
    const match = Runtime.match(event, "opening", placements(2), resources());
    assert.equal(match.valid, true);
    assert.ok(match.recipe.action.endsWith("_observe"));
    assert.equal(match.recipe.next, undefined);
    const withBait = Runtime.match(event, "opening", placements(2, true), resources());
    assert.equal(withBait.recipe.id, match.recipe.id);
    assert.equal(withBait.chosen.length, 1);
  }
});

test("ritual requires an actual ritual card and sacrificed heart", () => {
  for (const id of ["corpseDispute"]) {
    const event = events.find((entry) => entry.id === id).event;
    assert.equal(Runtime.match(event, "opening", placements(4), resources(false)).valid, false);
    assert.equal(Runtime.match(event, "opening", placements(4), resources(true)).valid, true);
  }
});

test("non-observation actions win in either slot and never consume observation", () => {
  for (const { id, event } of events.filter(({ id }) => !["livingHand", "breathingCorpses"].includes(id))) {
    const indexes = [0, 1, 3, ...(id === "corpseDispute" ? [4] : [])];
    for (const index of indexes) {
      for (const [observeSlot, actionSlot] of [["subject", "field"], ["field", "subject"]]) {
        const result = Runtime.match(event, "opening", {
          [observeSlot]: "card:battle_2", [actionSlot]: `card:battle_${index}`,
        }, resources(true));
        assert.equal(result.valid, true, `${id}: ${index} in ${actionSlot}`);
        assert.ok(!result.recipe.action.endsWith("_observe"));
        assert.equal(result.chosen.filter((resource) => resource.kind === "card").length, 1);
        assert.ok(result.chosen.every((resource) => resource.cardId !== "focus"));
      }
    }
  }
});

test("unfulfilled or unsupported actions block observation", () => {
  for (const id of ["breathingCorpses"]) {
    const event = events.find((entry) => entry.id === id).event;
    const result = Runtime.match(event, "opening", { subject: "card:battle_2", field: "card:battle_3" }, resources());
    assert.equal(result.valid, false);
    assert.match(result.reason, /其他行动/);
  }
  const event = events.find((entry) => entry.id === "fallenSurvivor").event;
  assert.equal(Runtime.match(event, "opening", { subject: "card:battle_2", field: "card:battle_4" }, resources(true)).valid, false);
});

test("corpse encounter keeps fixed targets and two observation stages", () => {
  const event = events.find(({ id }) => id === "breathingCorpses").event;
  assert.deepEqual(event.slots.map(({ name }) => name), ["尸堆", "周围环境"]);
  assert.equal(event.actionSlot, undefined);
  assert.deepEqual(Object.keys(event.stages), ["opening", "examined"]);
  assert.equal(Runtime.match(event, "opening", { subject: "card:battle_2" }, resources()).recipe.next, "examined");
  assert.equal(Runtime.match(event, "examined", { subject: "card:battle_2" }, resources()).recipe.action, "corpse_observe_worms");
  for (const stage of ["opening", "examined"]) {
    assert.equal(Runtime.match(event, stage, { field: "card:battle_2" }, resources()).recipe.action, "corpse_observe_environment");
    assert.equal(Runtime.match(event, stage, { subject: "card:battle_0" }, resources()).recipe.action, "corpse_attack_stack");
    assert.equal(Runtime.match(event, stage, { field: "card:battle_0" }, resources()).recipe.action, "corpse_attack_environment");
    assert.equal(Runtime.match(event, stage, { subject: "card:battle_1" }, resources()).recipe.action, "corpse_defend_stack");
    assert.equal(Runtime.match(event, stage, { field: "card:battle_1" }, resources()).recipe.action, "corpse_defend_environment");
    assert.equal(Runtime.match(event, stage, { subject: "card:battle_3" }, resources()).valid, false);
    assert.equal(Runtime.match(event, stage, { subject: "item:freshFlesh" }, resources()).valid, false);
    assert.equal(event.stages[stage].recipes.some(({ action }) => ["corpse_stab", "corpse_lure", "corpse_wait"].includes(action)), false);
  }
});

test("worm knowledge and environmental observation reveal the path without consuming knowledge", () => {
  const event = events.find(({ id }) => id === "breathingCorpses").event;
  const placement = { subject: "knowledge:wormFarming", field: "card:battle_2" };
  assert.equal(Runtime.match(event, "opening", placement, resources(false, true, true)).recipe.action, "corpse_observe_environment");
  assert.equal(Runtime.match(event, "examined", placement, resources()).valid, false);
  const result = Runtime.match(event, "examined", placement, resources(false, true, true));
  assert.equal(result.recipe.action, "corpse_reveal_path");
  assert.deepEqual(result.chosen.map(({ kind }) => kind), ["knowledge", "card"]);
  assert.equal(result.recipe.effects[0].key, "revealedCorpseHiddenPath");
  const withoutKnowledge = Runtime.match(event, "examined", { field: "card:battle_2" }, resources());
  assert.equal(withoutKnowledge.recipe.action, "corpse_observe_environment");
  const actionWins = Runtime.match(event, "examined", { subject: "card:battle_2", field: "card:battle_1" }, resources(false, true, true));
  assert.equal(actionWins.recipe.action, "corpse_defend_environment");
  assert.deepEqual(actionWins.chosen.map(({ cardId }) => cardId), ["guard"]);
});

test("living hand has two slots, two stages and no old branches", () => {
  const event = events.find(({ id }) => id === "livingHand").event;
  assert.deepEqual(event.slots.map(({ name }) => name), ["手", "泥水"]);
  assert.deepEqual(Object.keys(event.stages), ["opening", "trapped"]);
  assert.deepEqual(Runtime.validate(event), []);
  assert.equal(event.stages.opening.recipes.find((recipe) => recipe.action === "hand_observe").next, "opening");
  assert.equal(event.stages.opening.recipes.find((recipe) => recipe.action === "hand_grab").next, "trapped");
  assert.equal(event.stages.trapped.recipes.some((recipe) => recipe.action === "hand_throw_flesh"), true);
  for (const stage of Object.values(event.stages)) {
    assert.equal(stage.recipes.some((recipe) => ["hand_feed", "hand_ritual"].includes(recipe.action)), false);
  }
});

test("living hand matches either slot and consumes both attack cards together", () => {
  const event = events.find(({ id }) => id === "livingHand").event;
  for (const stage of ["opening", "trapped"]) {
    for (const slot of ["hand", "mud"]) {
      assert.equal(Runtime.match(event, stage, { [slot]: "card:battle_0" }, resources()).recipe.action,
        stage === "opening" ? "hand_attack" : "hand_strike");
      assert.equal(Runtime.match(event, stage, { [slot]: "card:battle_2" }, resources()).recipe.action,
        stage === "opening" ? "hand_observe" : "hand_drown");
      assert.equal(Runtime.match(event, stage, { [slot]: "card:battle_1" }, resources()).recipe.action,
        stage === "opening" ? "hand_grab" : "hand_drown");
    }
    for (const pair of [["card:battle_0", "card:battle_6"], ["card:battle_5", "card:battle_0"], ["card:battle_0", "card:battle_5"]]) {
      const match = Runtime.match(event, stage, { hand: pair[0], mud: pair[1] }, resources());
      assert.equal(match.valid, true);
      assert.equal(match.chosen.length, 2);
      assert.deepEqual(match.chosen.map((resource) => resource.key), pair);
    }
    const withObserve = Runtime.match(event, stage, { hand: "card:battle_2", mud: "card:battle_0" }, resources());
    assert.equal(withObserve.valid, true);
    assert.equal(withObserve.chosen.length, 1);
    assert.equal(withObserve.chosen[0].cardId, "quick");
  }
});

test("living hand can throw only fresh flesh into mud without a card", () => {
  const event = events.find(({ id }) => id === "livingHand").event;
  const placement = { mud: "item:freshFlesh" };
  const result = Runtime.match(event, "trapped", placement, resources());
  assert.equal(result.recipe.action, "hand_throw_flesh");
  assert.deepEqual(result.chosen.map((resource) => resource.id), ["freshFlesh"]);
  assert.equal(Runtime.match(event, "opening", placement, resources()).valid, false);
  assert.equal(Runtime.match(event, "trapped", placement, resources(false, false)).valid, false);
  for (const key of ["item:baitMeat", "item:rottenFlesh", "knowledge:dungLore"]) {
    assert.equal(Runtime.match(event, "trapped", { mud: key }, resources()).valid, false);
  }
  assert.equal(Runtime.match(event, "trapped", { hand: "item:freshFlesh" }, resources()).valid, false);
  assert.equal(Runtime.match(event, "trapped", { hand: "card:battle_0", mud: "item:freshFlesh" }, resources()).recipe.action, "hand_strike");
});

test("common rule overrides observation priority; tied other actions require adjustment", () => {
  const event = structuredClone(events.find((entry) => entry.id === "metalInMist").event);
  event.stages.opening.recipes.find((recipe) => recipe.action === "metal_observe").priority = 999;
  const result = Runtime.match(event, "opening", { subject: "card:battle_2", field: "card:battle_3" }, resources());
  assert.equal(result.recipe.action, "metal_distract");
  assert.deepEqual(result.chosen.map((resource) => resource.cardId), ["adjust"]);
  assert.equal(Runtime.match(event, "opening", {
    subject: "card:battle_2", field: "card:battle_0", bait: "card:battle_1",
  }, resources()).ambiguous, true);
});

test("single-target action slot is validated and a lone action can use any slot", () => {
  const event = structuredClone(events[0].event);
  for (const slot of ["subject", "field", "bait"]) {
    assert.equal(Runtime.match(event, "opening", { [slot]: "card:battle_0" }, resources()).recipe.action, "fallen_cut");
  }
  event.actionSlot = "missing";
  assert.ok(Runtime.validate(event).some((error) => error.includes("actionSlot")));
});

test("negative or fractional environmental costs are rejected", () => {
  for (const [field, value] of [["hpCost", -1], ["staminaCost", 0.5]]) {
    const broken = structuredClone(events[0].event);
    broken.stages.opening.recipes[0][field] = value;
    assert.ok(Runtime.validate(broken).some((error) => error.includes(field)));
  }
});
