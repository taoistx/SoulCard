"use strict";

(function (global) {
  const ACTIONS = new Set(["kill_thomas", "kill_thomas_and_attack_dung", "attack_dung", "observe_dung", "observe_infected", "protect_thomas", "lure_dung", "trap_dung"]);
  const KNOWLEDGE = Object.freeze({
    dungLore: { name: "粪怪习性", description: "辨识粪怪对气味与动静的反应。对粪怪伤害 +15%；可作诱导依据，不消耗。", tags: ["lure"] },
  });

  function validate(event) {
    const errors = [];
    if (!event || event.schemaVersion !== 1 || !event.id || !event.name) return ["行动事件缺少版本、ID 或名称"];
    if (!Array.isArray(event.slots) || event.slots.length !== 3) return ["行动事件需要三个槽位"];
    const slots = new Set(event.slots.map((slot) => slot?.id));
    if (slots.size !== 3 || event.slots.some((slot) => !slot?.id || !slot?.name)) errors.push("槽位 ID 重复或缺少名称");
    if (!event.stages || !event.stages[event.start]) errors.push("初始阶段不存在");
    for (const [id, stage] of Object.entries(event.stages || {})) {
      if (!stage || typeof stage.body !== "string" || !Array.isArray(stage.recipes)) { errors.push(`阶段 ${id} 格式无效`); continue; }
      const recipeIds = new Set();
      for (const recipe of stage.recipes) {
        if (!recipe || typeof recipe !== "object") { errors.push(`阶段 ${id} 配方无效`); continue; }
        if (!recipe.id || recipeIds.has(recipe.id)) errors.push(`阶段 ${id} 配方 ID 重复或缺失`);
        recipeIds.add(recipe.id);
        if ((recipe.action && !ACTIONS.has(recipe.action)) || typeof recipe.result !== "string") errors.push(`配方 ${recipe.id} 动作或结果无效`);
        if (recipe.action && !event.enemyId) errors.push(`配方 ${recipe.id} 缺少事件敌人`);
        if (recipe.action === "lure_dung" && !event.lureNodeId) errors.push(`配方 ${recipe.id} 缺少迁移节点`);
        if (recipe.next && !event.stages[recipe.next]) errors.push(`配方 ${recipe.id} 后续阶段不存在`);
        if (recipe.action === "observe_dung" && !recipe.next) errors.push(`配方 ${recipe.id} 缺少后续阶段`);
        if (recipe.priority !== undefined && (!Number.isInteger(recipe.priority) || recipe.priority < 0)) errors.push(`配方 ${recipe.id} 优先级无效`);
        if (recipe.when && (!["all", "any"].includes(recipe.when.mode) || !Array.isArray(recipe.when.clauses))) errors.push(`配方 ${recipe.id} 条件无效`);
        if (recipe.effects !== undefined && !Array.isArray(recipe.effects)) errors.push(`配方 ${recipe.id} effects 必须是数组`);
        for (const effect of Array.isArray(recipe.effects) ? recipe.effects : []) {
          if (!effect || !["setFlag", "addItem", "removeItem"].includes(effect.type) || (effect.type === "setFlag" ? !effect.key : !effect.itemId || (effect.amount !== undefined && (!Number.isInteger(effect.amount) || effect.amount < 1)))) errors.push(`配方 ${recipe.id} 后果无效`);
        }
        const selectors = Object.entries(recipe.slots || {});
        if (!selectors.some(([, selector]) => selector?.kind === "card")) errors.push(`配方 ${recipe.id} 至少需要一张战斗卡`);
        for (const [slot, selector] of selectors) {
          if (!slots.has(slot) || !selector || !["card", "rhetoric"].includes(selector.kind)) errors.push(`配方 ${recipe.id} 槽位条件无效`);
          else if (selector.kind === "card" && !["attack", "defense", "technique", "ritual", "restoration"].includes(selector.category)) errors.push(`配方 ${recipe.id} 卡牌类别无效`);
          else if (selector.kind === "card" && selector.cardId && selector.excludeCardId) errors.push(`配方 ${recipe.id} 不能同时指定和排除卡牌`);
          else if (selector.kind === "rhetoric" && !selector.tag) errors.push(`配方 ${recipe.id} 缺少语义标签`);
        }
      }
    }
    return errors;
  }

  // Resources are reconstructed from ownership on every validation, never trusted from drag data.
  function resources(state, catalog, items) {
    return [
      ...state.deck.map((card, index) => ({ key: `card:${card.instanceId}`, kind: "card", cardId: card.cardId, category: catalog[card.cardId].type, name: catalog[card.cardId].name, instanceId: card.instanceId, copyNumber: index + 1, fatigue: card.fatigue, amount: 1, tags: [], available: catalog[card.cardId].type !== "ritual" || Boolean(state.sacrificed.heart) })),
      ...Object.entries(state.inventory).filter(([id, amount]) => amount > 0 && items[id]?.eventTags).map(([id, amount]) => ({ key: `item:${id}`, kind: "item", id, name: items[id].name, tags: items[id].eventTags, amount, available: true })),
      ...Object.keys(KNOWLEDGE).filter((id) => state.knowledge[id]).map((id) => ({ key: `knowledge:${id}`, kind: "knowledge", id, name: KNOWLEDGE[id].name, tags: KNOWLEDGE[id].tags, amount: 1, available: true })),
    ];
  }

  function match(event, stageId, placements, owned, evaluate = () => true) {
    const stage = event.stages[stageId];
    const byKey = new Map(owned.map((resource) => [resource.key, resource]));
    const chosen = {};
    const counts = new Map();
    for (const [slotId, key] of Object.entries(placements)) {
      if (!key) continue;
      const resource = byKey.get(key);
      if (!event.slots.some((slot) => slot.id === slotId) || !resource?.available) return { valid: false };
      counts.set(key, (counts.get(key) || 0) + 1);
      if (counts.get(key) > resource.amount) return { valid: false };
      chosen[slotId] = resource;
    }
    if (!stage || !Object.values(chosen).some((resource) => resource.kind === "card")) return { valid: false };
    const matches = stage.recipes.filter((recipe) => evaluate(recipe.when) &&
      Object.entries(recipe.slots).every(([slot, selector]) => {
        const resource = chosen[slot];
        return resource && (selector.kind === "card"
          ? resource.kind === "card" && resource.category === selector.category && (!selector.cardId || resource.cardId === selector.cardId) && (!selector.excludeCardId || resource.cardId !== selector.excludeCardId)
          : ["item", "knowledge"].includes(resource.kind) && resource.tags.includes(selector.tag));
      }));
    const highest = Math.max(...matches.map((recipe) => recipe.priority || 0));
    const winners = matches.filter((recipe) => (recipe.priority || 0) === highest);
    if (winners.length !== 1) return { valid: false, ambiguous: winners.length > 1 };
    const recipe = winners[0];
    if ((recipe.priority || 0) === 0 && Object.entries(chosen).some(([slot, resource]) =>
      !recipe.slots[slot] && resource.kind === "card" && ["attack", "defense"].includes(resource.category))) return { valid: false };
    return { valid: true, recipe, chosen: Object.keys(recipe.slots).map((slot) => chosen[slot]) };
  }

  const api = Object.freeze({ validate, resources, match, KNOWLEDGE });
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  global.ActionEventRuntime = api;
  const base = new URL("action-events/", document.currentScript.src);
  let registry = {};
  async function readJson(path) {
    const response = await fetch(new URL(path, base), { cache: "no-store" });
    if (!response.ok) throw new Error(`无法加载行动事件 ${path}（${response.status}）`);
    return response.json();
  }
  const ready = readJson("manifest.json").then(async (manifest) => {
    if (manifest.schemaVersion !== 1 || !manifest.events) throw new Error("行动事件清单格式无效");
    const entries = await Promise.all(Object.entries(manifest.events).map(async ([id, path]) => {
      const event = await readJson(path);
      const errors = validate(event);
      if (event.id !== id) errors.push("事件 ID 与清单不一致");
      if (errors.length) throw new Error(`${path}：${errors.join("；")}`);
      return [id, event];
    }));
    registry = Object.fromEntries(entries);
    return registry;
  });
  ready.catch(() => {});
  global.ActionEventData = Object.freeze({ ready, get: (id) => registry[id], list: () => Object.values(registry) });
})(globalThis);
