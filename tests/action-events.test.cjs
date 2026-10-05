const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Runtime = require("../action-events.js");
const Cards = require("../card-instances.js");
const event = JSON.parse(fs.readFileSync(require.resolve("../action-events/thomas-crossroads.json"), "utf8"));
const catalog = {
  quick: { id: "quick", type: "attack", name: "短促刺击", damage: 6, cost: 1, bleed: 1 },
  heavy: { id: "heavy", type: "attack", name: "葬仪重斩", damage: 36, cost: 4 },
  focus: { id: "focus", type: "technique", name: "观察", immediate: true, focus: .5, cost: 1 },
  adjust: { id: "adjust", type: "technique", name: "调整", draw: 2, cost: 1 },
  guard: { id: "guard", type: "defense", name: "灰钢架势", block: 12, cost: 1 },
};
function fixture() {
  const state = { deck: Cards.copyDeck(["quick", "quick", "heavy", "focus", "guard", "adjust"], catalog), inventory: { baitMeat: 1 }, knowledge: { dungLore: true }, sacrificed: {} };
  const resources = Runtime.resources(state, catalog, { baitMeat: { name: "诱饵肉", eventTags: ["lure"] } });
  const match = (placements, stage = "opening", config = event) => Runtime.match(config, stage, placements, resources);
  return { state, resources, match };
}
test("JSON validates and all directional recipes work", () => {
  assert.deepEqual(Runtime.validate(event), []);
  const { match } = fixture();
  for (const [placements, action] of [
    [{ thomas: "card:battle_0" }, "kill_thomas"],
    [{ thomas: "card:battle_0", monster: "card:battle_1" }, "kill_thomas_and_attack_dung"],
    [{ monster: "card:battle_0" }, "attack_dung"],
    [{ monster: "card:battle_3" }, "observe_dung"],
    [{ field: "card:battle_3" }, "observe_dung"],
    [{ thomas: "card:battle_4" }, "protect_thomas"],
    [{ field: "card:battle_5", monster: "item:baitMeat" }, "lure_dung"],
    [{ monster: "card:battle_5", field: "item:baitMeat" }, "trap_dung"],
  ]) assert.equal(match(placements).recipe.action, action);
});
test("same category has same result; duplicate templates have separate fatigue", () => {
  const { match, state } = fixture();
  assert.equal(match({ monster: "card:battle_0" }).recipe.id, match({ monster: "card:battle_2" }).recipe.id);
  state.deck[0].fatigue = 2;
  assert.equal(state.deck[1].fatigue, 0);
  assert.notEqual(state.deck[0].instanceId, state.deck[1].instanceId);
});
test("knowledge substitutes for bait in both directions without an item cost", () => {
  const { match } = fixture();
  for (const [slots, action] of [[{ field: "card:battle_5", monster: "knowledge:dungLore" }, "lure_dung"], [{ monster: "card:battle_5", field: "knowledge:dungLore" }, "trap_dung"]]) {
    const result = match(slots, "infected");
    assert.equal(result.recipe.action, action);
    assert.equal(result.chosen.filter((r) => r.kind === "item").length, 0);
  }
});
test("second observation forces battle; non-focus technique cannot observe or lure", () => {
  const { match } = fixture();
  assert.equal(match({ monster: "card:battle_3" }, "infected").recipe.action, "observe_infected");
  assert.equal(match({ field: "card:battle_3" }, "infected").recipe.action, "observe_infected");
  assert.equal(match({ monster: "card:battle_5" }).valid, false);
  assert.equal(match({ field: "card:battle_5" }).valid, false);
  assert.equal(match({ field: "card:battle_3", monster: "item:baitMeat" }).recipe.action, "observe_dung");
  assert.equal(match({ field: "card:battle_3", monster: "card:battle_4" }).valid, false);
  assert.equal(match({ monster: "card:battle_3", field: "card:battle_0" }).valid, false);
  assert.equal(match({ thomas: "card:battle_4" }, "infected").valid, true);
});
test("attack and defense override technique without consuming overridden resources", () => {
  const { match } = fixture();
  for (const [slots, action, cardCount] of [
    [{ thomas: "card:battle_0", monster: "card:battle_1", field: "card:battle_3" }, "kill_thomas_and_attack_dung", 2],
    [{ thomas: "card:battle_0", field: "card:battle_3" }, "kill_thomas", 1],
    [{ monster: "card:battle_0", field: "card:battle_3" }, "attack_dung", 1],
    [{ thomas: "card:battle_4", field: "card:battle_3", monster: "item:baitMeat" }, "protect_thomas", 1],
    [{ thomas: "card:battle_4", monster: "card:battle_0", field: "card:battle_5" }, "attack_dung", 1],
  ]) {
    const result = match(slots);
    assert.equal(result.recipe.action, action);
    assert.equal(result.chosen.filter((r) => r.kind === "card").length, cardCount);
    assert.equal(result.chosen.some((r) => r.kind === "item"), false);
  }
});
test("duplicate instances, missing inventory, and unmatched combinations fail", () => {
  const { match } = fixture();
  for (const placements of [
    {}, { field: "item:baitMeat" }, { monster: "card:battle_0", thomas: "card:battle_0" },
    { field: "card:battle_5", monster: "item:missing" },
    { field: "card:battle_5", monster: "item:baitMeat", thomas: "item:baitMeat" },
  ]) assert.equal(match(placements).valid, false);
});
test("ambiguous recipes are an error; conditions can reject a recipe", () => {
  const config = structuredClone(event);
  config.stages.opening.recipes.push({ ...config.stages.opening.recipes.find((recipe) => recipe.id === "strike"), id: "duplicate" });
  assert.equal(fixture().match({ monster: "card:battle_0" }, "opening", config).ambiguous, true);
  assert.equal(Runtime.match(event, "opening", { monster: "card:battle_0" }, fixture().resources, () => false).valid, false);
});
test("Thomas shares the common rule while keeping named target slots", () => {
  const { resources } = fixture();
  const config = structuredClone(event);
  config.stages.opening.recipes.push({
    id: "test_trick", slots: { thomas: { kind: "card", category: "technique", excludeCardId: "focus" } },
    result: "test action",
  });
  const result = Runtime.match(config, "opening", { thomas: "card:battle_5", monster: "card:battle_3" }, resources);
  assert.equal(result.recipe.id, "test_trick");
  assert.deepEqual(result.chosen.map((resource) => resource.cardId), ["adjust"]);
  assert.equal(Runtime.match(event, "opening", { monster: "card:battle_3", thomas: "card:battle_5" }, resources).valid, false);
  assert.equal(Runtime.match(event, "opening", { thomas: "card:battle_0", monster: "card:battle_3" }, resources).recipe.action, "kill_thomas");
  assert.equal(Runtime.match(event, "opening", { monster: "card:battle_0", field: "card:battle_3" }, resources).recipe.action, "attack_dung");
});

test("fatigue removes all original effects and retains physical identity", () => {
  for (const cardId of Object.keys(catalog)) {
    const instance = { instanceId: "a", cardId, fatigue: 2 };
    const card = Cards.describe(instance, catalog);
    assert.equal(card.instance, instance);
    assert.equal(card.cost, 1);
    assert.equal(card.type, "fatigue");
    for (const effect of ["damage", "block", "focus", "draw", "discardCost", "immediate", "bleed"]) assert.equal(card[effect], undefined);
    instance.fatigue = 0;
    assert.equal(Cards.describe(instance, catalog).type, catalog[cardId].type);
  }
});
test("battle copies preserve world state and reject duplicate identities", () => {
  const { state } = fixture();
  state.deck[0].fatigue = 3;
  const copy = Cards.copyDeck(state.deck, catalog);
  copy[0].fatigue--;
  assert.equal(state.deck[0].fatigue, 3);
  assert.equal(copy[0].fatigue, 2);
  assert.throws(() => Cards.copyDeck([state.deck[0], state.deck[0]], catalog), /重复/);
});
test("knowledge damage rounds at the damage boundary", () => {
  assert.equal(Cards.damageWithKnowledge(6, 1.15), 7);
  assert.equal(Cards.damageWithKnowledge(3, 1.15), 4);
  assert.equal(Cards.damageWithKnowledge(36, 1.15), 42);
  assert.equal(Cards.damageWithKnowledge(0, 1.15), 0);
});
