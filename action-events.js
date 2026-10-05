"use strict";

(function (global) {
  const ACTIONS = new Set(["kill_thomas", "kill_thomas_and_attack_dung", "attack_dung", "observe_dung", "observe_infected", "protect_thomas", "lure_dung", "trap_dung", "fallen_cut", "fallen_rescue", "fallen_lie", "fallen_observe", "corpse_observe_first", "corpse_observe_worms", "corpse_observe_environment", "corpse_reveal_path", "corpse_attack_stack", "corpse_attack_environment", "corpse_defend_stack", "corpse_defend_environment", "metal_observe", "metal_endure", "metal_distract", "metal_cut", "dispute_drive", "dispute_endure", "dispute_lie", "dispute_observe", "dispute_ritual", "hand_observe", "hand_attack", "hand_grab", "hand_strike", "hand_drown", "hand_throw_flesh"]);
  const ENEMY_ACTIONS = new Set(["kill_thomas", "kill_thomas_and_attack_dung", "attack_dung", "observe_dung", "observe_infected", "protect_thomas", "lure_dung", "trap_dung"]);
  const KNOWLEDGE = Object.freeze({
    dungLore: { name: "粪怪习性", description: "辨识粪怪对气味与动静的反应。对粪怪伤害 +15%；可作诱导依据，不消耗。", tags: ["lure"] },
    wormFarming: { name: "蠕虫养殖", description: "尸体下藏着巨大的蠕虫，尸堆更像是人为搭建的饲养堆。", tags: ["wormFarming"] },
    mistRhythm: { name: "菌雾节奏", description: "金属声与风吹菌盖的间隔固定。掌握节奏后可安全穿越菌雾。", tags: [] },
    corpseCorruption: { name: "菌化尸体", description: "争夺的尸体已严重菌化，不能安全食用。", tags: [] },
    corpseAnomaly: { name: "尸内异常", description: "权柄感知到菌化尸体内部的异常。用途：测试版尚未接入。", tags: [] },
  });

  function validate(event) {
    const errors = [];
    if (!event || event.schemaVersion !== 1 || !event.id || !event.name) return ["行动事件缺少版本、ID 或名称"];
    if (!Array.isArray(event.slots) || ![2, 3].includes(event.slots.length)) return ["行动事件需要两个或三个槽位"];
    const slots = new Set(event.slots.map((slot) => slot?.id));
    if (slots.size !== event.slots.length || event.slots.some((slot) => !slot?.id || !slot?.name)) errors.push("槽位 ID 重复或缺少名称");
    if (event.actionSlot !== undefined && !slots.has(event.actionSlot)) errors.push("actionSlot 必须引用已定义的槽位");
    if (!event.stages || !event.stages[event.start]) errors.push("初始阶段不存在");
    for (const [id, stage] of Object.entries(event.stages || {})) {
      if (!stage || typeof stage.body !== "string" || !Array.isArray(stage.recipes)) { errors.push(`阶段 ${id} 格式无效`); continue; }
      const recipeIds = new Set();
      for (const recipe of stage.recipes) {
        if (!recipe || typeof recipe !== "object") { errors.push(`阶段 ${id} 配方无效`); continue; }
        if (!recipe.id || recipeIds.has(recipe.id)) errors.push(`阶段 ${id} 配方 ID 重复或缺失`);
        recipeIds.add(recipe.id);
        if ((recipe.action && !ACTIONS.has(recipe.action)) || typeof recipe.result !== "string") errors.push(`配方 ${recipe.id} 动作或结果无效`);
        if (ENEMY_ACTIONS.has(recipe.action) && !event.enemyId) errors.push(`配方 ${recipe.id} 缺少事件敌人`);
        if (recipe.action === "lure_dung" && !event.lureNodeId) errors.push(`配方 ${recipe.id} 缺少迁移节点`);
        for (const field of ["staminaCost", "hpCost"]) if (recipe[field] !== undefined && (!Number.isInteger(recipe[field]) || recipe[field] < 0)) errors.push(`配方 ${recipe.id} ${field} 无效`);
        if (recipe.next && !event.stages[recipe.next]) errors.push(`配方 ${recipe.id} 后续阶段不存在`);
        if (recipe.action === "observe_dung" && !recipe.next) errors.push(`配方 ${recipe.id} 缺少后续阶段`);
        if (recipe.priority !== undefined && (!Number.isInteger(recipe.priority) || recipe.priority < 0)) errors.push(`配方 ${recipe.id} 优先级无效`);
        if (recipe.when && (!["all", "any"].includes(recipe.when.mode) || !Array.isArray(recipe.when.clauses))) errors.push(`配方 ${recipe.id} 条件无效`);
        if (recipe.effects !== undefined && !Array.isArray(recipe.effects)) errors.push(`配方 ${recipe.id} effects 必须是数组`);
        for (const effect of Array.isArray(recipe.effects) ? recipe.effects : []) {
          if (!effect || !["setFlag", "addItem", "removeItem"].includes(effect.type) || (effect.type === "setFlag" ? !effect.key : !effect.itemId || (effect.amount !== undefined && (!Number.isInteger(effect.amount) || effect.amount < 1)))) errors.push(`配方 ${recipe.id} 后果无效`);
        }
        const selectors = Object.entries(recipe.slots || {});
        if (recipe.itemOnly) {
          if (selectors.length !== 1 || selectors[0][1]?.kind !== "rhetoric") errors.push(`配方 ${recipe.id} 仅物品行动必须指定单个资源槽位`);
        } else if (!selectors.some(([, selector]) => selector?.kind === "card")) errors.push(`配方 ${recipe.id} 至少需要一张战斗卡`);
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
    if (!stage || !Object.keys(chosen).length) return { valid: false };
    const accepts = (resource, selector) => resource && (selector.kind === "card"
      ? resource.kind === "card" && resource.category === selector.category && (!selector.cardId || resource.cardId === selector.cardId) && (!selector.excludeCardId || resource.cardId !== selector.excludeCardId)
      : ["item", "knowledge"].includes(resource.kind) && resource.tags.includes(selector.tag));
    // Shared by all kind: action events: any non-observation card suppresses observation.
    const hasAction = Object.values(chosen).some((resource) => resource.kind === "card" && resource.cardId !== "focus");
    const matches = [];
    for (const recipe of stage.recipes) {
      if (!evaluate(recipe.when)) continue;
      if (recipe.itemOnly && (Object.keys(chosen).length !== 1 || !Object.values(chosen).every((resource) => resource.kind === "item"))) continue;
      const usedSlots = new Set(), selected = [];
      for (const [slot, selector] of Object.entries(recipe.slots)) {
        // Single-target events allow their action card in any slot. Named targets
        // (e.g. Thomas vs. monster) and required items retain their explicit slots.
        const candidates = selector.kind === "card" && slot === event.actionSlot
          ? [slot, ...event.slots.map((entry) => entry.id).filter((id) => id !== slot)] : [slot];
        const actualSlot = candidates.find((id) => !usedSlots.has(id) && accepts(chosen[id], selector));
        if (actualSlot === undefined) break;
        usedSlots.add(actualSlot);
        selected.push(chosen[actualSlot]);
      }
      if (selected.length !== Object.keys(recipe.slots).length) continue;
      const cards = selected.filter((resource) => resource.kind === "card");
      if (hasAction && cards.length && cards.every((resource) => resource.cardId === "focus")) continue;
      matches.push({ recipe, selected, usedSlots });
    }
    const highest = Math.max(...matches.map(({ recipe }) => recipe.priority || 0));
    const winners = matches.filter(({ recipe }) => (recipe.priority || 0) === highest);
    if (winners.length !== 1) return {
      valid: false, ambiguous: winners.length > 1,
      reason: hasAction && !winners.length ? "其他行动的槽位或资源条件未满足；请调整资源或撤回其他行动卡。" : undefined,
    };
    const { recipe, selected, usedSlots } = winners[0];
    if ((recipe.priority || 0) === 0 && Object.entries(chosen).some(([slot, resource]) =>
      !usedSlots.has(slot) && resource.kind === "card" && ["attack", "defense"].includes(resource.category))) return { valid: false };
    return { valid: true, recipe, chosen: selected };
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
