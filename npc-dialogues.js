"use strict";

// NPC dialogue schema, validator and interpreter shared by World and npc-editor.
(function initializeNpcDialogueRuntime(global) {
  const SCHEMA_VERSION = 1;
  const TEMPLATE_KEYS = new Set(["day", "dailyStockId", "dailyStockName", "sacrificedCount", "nodeId", "nodeLabel", "churchArrivalDay", "damage", "resultText", "eventName", "deathReason", "cardName", "cardIndex", "npcName", "npcWhereabouts"]);
  const BODY_PARTS = ["leftHand", "rightHand", "body", "head", "eye", "heart", "brain"];
  const ITEM_IDS = ["freshFlesh", "oldKey", "ritualScrap", "rustySword", "longSword", "dagger", "greatSword", "shield", "heavyArmor", "gi", "ladyHat", "mistWrapMaterial", "eddieMistWrap", "oldMistWrap", "maintenanceHook"];
  const ACTIONS = { fight_eddie: "与艾迪战斗", fight_bell: "与丧钟战斗", shop_eddie: "打开艾迪商店" };
  Object.assign(ACTIONS, {
    v06_eddie_salvage: "艾迪 · 介绍漂积湾",
    v06_thomas_camp: "托马斯 · 安置营地", v06_thomas_climb: "托马斯 · 选择上山",
    v06_thomas_stop: "托马斯 · 选择检修台", v06_thomas_route: "托马斯 · 分享已验证路线",
    v06_thomas_bandage: "托马斯 · 包扎", v06_thomas_supply: "托马斯 · 留包扎材料",
    v06_thomas_protection: "托马斯 · 交付防护", v06_genichiro_exposure: "玄一螂 · 告知孢雾伤害",
    v06_genichiro_supply: "玄一螂 · 留包扎材料", v06_genichiro_bandage: "玄一螂 · 包扎",
    v06_genichiro_fight: "玄一螂 · 挑战", v06_winnie_teach: "温妮 · 献祭指引",
    v06_mor_buy: "莫尔 · 购买旧路线", v06_mor_challenge: "莫尔 · 质疑路线",
    v06_emperor_waste: "小皇帝 · 搬开废料",
    v06_hollan_respect: "霍兰 · 出示战绩", v06_hollan_material: "霍兰 · 换取韧膜",
  });
  const NUMERIC_SOURCES = new Set(["day", "sacrificedCount"]);
  const NUMERIC_OPERATORS = new Set(["eq", "ne", "gte", "lte"]);
  const FLAG_OPERATORS = new Set(["exists", "notExists", "eq", "ne"]);
  const ITEM_OPERATORS = new Set(["has", "lacks"]);
  const SACRIFICE_OPERATORS = new Set(["sacrificed", "intact"]);
  const EFFECT_TYPES = new Set(["setFlag", "addItem", "removeItem"]);
  const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

  const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function renderTemplate(value, context = {}) {
    if (typeof value !== "string") return value;
    return value.replace(/\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g, (_, key) => String(TEMPLATE_KEYS.has(key) ? context[key] ?? "" : ""));
  }

  function compareNumeric(actual, operator, expected) {
    if (operator === "eq") return actual === expected;
    if (operator === "ne") return actual !== expected;
    if (operator === "gte") return actual >= expected;
    if (operator === "lte") return actual <= expected;
    return false;
  }

  function evaluateClause(clause, context = {}) {
    if (!isObject(clause)) return false;
    if (NUMERIC_SOURCES.has(clause.source)) return compareNumeric(Number(context[clause.source] || 0), clause.operator, Number(clause.value));
    if (clause.source === "flag") {
      const value = context.getFlag?.(renderTemplate(clause.key, context));
      if (clause.operator === "exists") return value !== undefined;
      if (clause.operator === "notExists") return value === undefined;
      if (clause.operator === "eq") return value === clause.value;
      if (clause.operator === "ne") return value !== clause.value;
      return false;
    }
    if (clause.source === "item") {
      const hasItem = Boolean(context.hasItem?.(renderTemplate(clause.itemId, context), clause.amount || 1));
      return clause.operator === "has" ? hasItem : clause.operator === "lacks" ? !hasItem : false;
    }
    if (clause.source === "sacrifice") {
      const sacrificed = Boolean(context.hasSacrificed?.(clause.partId));
      return clause.operator === "sacrificed" ? sacrificed : clause.operator === "intact" ? !sacrificed : false;
    }
    return false;
  }

  function evaluateCondition(group, context = {}) {
    if (group === undefined || group === null) return true;
    if (!isObject(group) || !Array.isArray(group.clauses)) return false;
    if (!group.clauses.length) return true;
    return group.mode === "any" ? group.clauses.some((clause) => evaluateClause(clause, context)) : group.clauses.every((clause) => evaluateClause(clause, context));
  }

  function resolveText(spec, context = {}) {
    if (typeof spec === "string") return renderTemplate(spec, context);
    if (!isObject(spec)) return "";
    const variant = (spec.variants || []).find((entry) => evaluateCondition(entry.when, context));
    return renderTemplate(variant ? variant.text : spec.default || "", context);
  }

  function resolveStart(dialogue, context = {}) {
    const rule = (dialogue.start?.rules || []).find((entry) => evaluateCondition(entry.when, context));
    return rule?.node || dialogue.start?.default;
  }

  function resolveNode(dialogue, nodeId, context = {}) {
    const node = dialogue?.nodes?.[nodeId];
    if (!node) return null;
    return {
      id: nodeId, onEnter: node.onEnter, allowClose: node.allowClose !== false || (node.allowCloseWhen !== undefined && evaluateCondition(node.allowCloseWhen, context)),
      kicker: resolveText(node.kicker || "", context), title: resolveText(node.title || dialogue.name, context), body: resolveText(node.body || "", context),
      effects: clone(node.effects || []),
      options: (node.options || []).filter((option) => evaluateCondition(option.visibleWhen, context)).map((option) => ({ ...clone(option), label: resolveText(option.label || "", context), hint: resolveText(option.hint || "", context), enabled: evaluateCondition(option.enabledWhen, context) })),
    };
  }

  function applyEffects(effects = [], context = {}) {
    const resolved = effects.map((effect) => ({ ...clone(effect), key: typeof effect.key === "string" ? renderTemplate(effect.key, context) : effect.key, itemId: typeof effect.itemId === "string" ? renderTemplate(effect.itemId, context) : effect.itemId }));
    const removals = new Map();
    resolved.forEach((effect) => { if (effect.type === "removeItem") removals.set(effect.itemId, (removals.get(effect.itemId) || 0) + (effect.amount || 1)); });
    for (const [itemId, amount] of removals) if (!context.hasItem?.(itemId, amount)) return false;
    for (const effect of resolved) {
      if (effect.type === "setFlag") context.setFlag?.(effect.key, effect.value);
      else if (effect.type === "addItem") context.addItem?.(effect.itemId, effect.amount || 1);
      else if (effect.type === "removeItem" && context.removeItem?.(effect.itemId, effect.amount || 1) === false) return false;
    }
    return true;
  }

  function validateTemplates(value, field, errors) {
    if (typeof value !== "string") return;
    for (const match of value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) if (!TEMPLATE_KEYS.has(match[1])) errors.push(`${field} 使用了未知变量 {{${match[1]}}}`);
  }

  function validateCondition(group, field, errors) {
    if (group === undefined || group === null) return;
    if (!isObject(group) || !["all", "any"].includes(group.mode) || !Array.isArray(group.clauses)) return errors.push(`${field} 必须是包含 mode 和 clauses 的条件组`);
    group.clauses.forEach((clause, index) => {
      const path = `${field}.clauses[${index}]`;
      if (!isObject(clause)) return errors.push(`${path} 必须是对象`);
      if (NUMERIC_SOURCES.has(clause.source)) {
        if (!NUMERIC_OPERATORS.has(clause.operator) || !Number.isFinite(clause.value)) errors.push(`${path} 数值条件无效`);
      } else if (clause.source === "flag") {
        if (!FLAG_OPERATORS.has(clause.operator) || typeof clause.key !== "string" || !clause.key) errors.push(`${path} Flag 条件无效`);
        validateTemplates(clause.key, `${path}.key`, errors);
      } else if (clause.source === "item") {
        if (!ITEM_OPERATORS.has(clause.operator) || typeof clause.itemId !== "string" || !clause.itemId || !Number.isInteger(clause.amount || 1) || (clause.amount || 1) < 1) errors.push(`${path} 物品条件无效`);
        validateTemplates(clause.itemId, `${path}.itemId`, errors);
      } else if (clause.source === "sacrifice") {
        if (!SACRIFICE_OPERATORS.has(clause.operator) || !BODY_PARTS.includes(clause.partId)) errors.push(`${path} 献祭条件无效`);
      } else errors.push(`${path} 使用了未知条件来源 ${clause.source || "(空)"}`);
    });
  }

  function validateText(spec, field, errors) {
    if (typeof spec === "string") return validateTemplates(spec, field, errors);
    if (!isObject(spec) || typeof spec.default !== "string" || !Array.isArray(spec.variants || [])) return errors.push(`${field} 必须是字符串或条件文本对象`);
    validateTemplates(spec.default, `${field}.default`, errors);
    (spec.variants || []).forEach((variant, index) => {
      if (!isObject(variant) || typeof variant.text !== "string") errors.push(`${field}.variants[${index}] 文本无效`);
      else validateTemplates(variant.text, `${field}.variants[${index}].text`, errors);
      validateCondition(variant?.when, `${field}.variants[${index}].when`, errors);
    });
  }

  function validateEffects(effects, field, errors) {
    if (effects === undefined) return;
    if (!Array.isArray(effects)) return errors.push(`${field} 必须是数组`);
    effects.forEach((effect, index) => {
      const path = `${field}[${index}]`;
      if (!isObject(effect) || !EFFECT_TYPES.has(effect.type)) return errors.push(`${path} 效果类型无效`);
      if (effect.type === "setFlag") {
        if (typeof effect.key !== "string" || !effect.key) errors.push(`${path}.key 必须是非空字符串`);
        validateTemplates(effect.key, `${path}.key`, errors);
        if (!("value" in effect)) errors.push(`${path}.value 不能为空`);
      } else {
        if (typeof effect.itemId !== "string" || !effect.itemId) errors.push(`${path}.itemId 必须是非空字符串`);
        validateTemplates(effect.itemId, `${path}.itemId`, errors);
        if (!Number.isInteger(effect.amount || 1) || (effect.amount || 1) < 1) errors.push(`${path}.amount 必须是正整数`);
      }
    });
  }

  function validateDialogue(dialogue, options = {}) {
    const errors = [], warnings = [];
    const knownActions = new Set(options.knownActions || [...Object.keys(ACTIONS), ...Object.keys(global.WorldDialogueCatalog?.actions || {})]);
    const knownItems = new Set(options.knownItems || ITEM_IDS);
    if (!isObject(dialogue)) return { errors: ["对话文件必须是对象"], warnings };
    if (dialogue.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion 必须为 ${SCHEMA_VERSION}`);
    if (typeof dialogue.id !== "string" || !ID_PATTERN.test(dialogue.id)) errors.push("id 必须是稳定英文 ID");
    if (dialogue.kind !== undefined && !["npc", "world"].includes(dialogue.kind)) errors.push("kind 必须是 npc 或 world");
    if (typeof dialogue.name !== "string" || !dialogue.name.trim()) errors.push("name 必须是非空字符串");
    if (!isObject(dialogue.nodes) || !Object.keys(dialogue.nodes).length) errors.push("nodes 至少需要一个节点");
    const nodeIds = new Set(Object.keys(dialogue.nodes || {}));
    if (dialogue.entryNodes !== undefined && (!Array.isArray(dialogue.entryNodes) || dialogue.entryNodes.some((id) => !nodeIds.has(id)))) errors.push("entryNodes 必须引用现有节点");
    if (!isObject(dialogue.start) || !nodeIds.has(dialogue.start?.default)) errors.push("start.default 必须指向现有节点");
    if (dialogue.start?.rules !== undefined && !Array.isArray(dialogue.start.rules)) errors.push("start.rules 必须是数组");
    const startRules = Array.isArray(dialogue.start?.rules) ? dialogue.start.rules : [];
    startRules.forEach((rule, index) => { if (!nodeIds.has(rule?.node)) errors.push(`start.rules[${index}].node 指向未知节点`); validateCondition(rule?.when, `start.rules[${index}].when`, errors); });
    nodeIds.forEach((nodeId) => {
      if (!ID_PATTERN.test(nodeId)) errors.push(`节点 id ${nodeId} 无效`);
      const node = dialogue.nodes[nodeId];
      if (!isObject(node)) return errors.push(`nodes.${nodeId} 必须是对象`);
      validateText(node.kicker || "", `nodes.${nodeId}.kicker`, errors); validateText(node.title || "", `nodes.${nodeId}.title`, errors); validateText(node.body || "", `nodes.${nodeId}.body`, errors);
      if (node.onEnter && (dialogue.kind !== "world" || !knownActions.has(node.onEnter))) errors.push(`nodes.${nodeId}.onEnter 未登记或不是世界对话动作`);
      if (node.allowClose !== undefined && typeof node.allowClose !== "boolean") errors.push(`nodes.${nodeId}.allowClose 必须是布尔值`);
      validateCondition(node.allowCloseWhen, `nodes.${nodeId}.allowCloseWhen`, errors);
      validateEffects(node.effects, `nodes.${nodeId}.effects`, errors);
      if (node.options !== undefined && !Array.isArray(node.options)) errors.push(`nodes.${nodeId}.options 必须是数组`);
      const optionIds = new Set();
      const nodeOptions = Array.isArray(node.options) ? node.options : [];
      nodeOptions.forEach((option, index) => {
        const field = `nodes.${nodeId}.options[${index}]`;
        if (!isObject(option)) return errors.push(`${field} 必须是对象`);
        if (typeof option.id !== "string" || !ID_PATTERN.test(option.id) || optionIds.has(option.id)) errors.push(`${field}.id 无效或重复`);
        optionIds.add(option.id);
        validateText(option.label || "", `${field}.label`, errors); validateText(option.hint || "", `${field}.hint`, errors);
        validateCondition(option.visibleWhen, `${field}.visibleWhen`, errors);
        validateCondition(option.enabledWhen, `${field}.enabledWhen`, errors); validateEffects(option.effects, `${field}.effects`, errors);
        if (option.repeat !== undefined && (dialogue.kind !== "world" || option.repeat !== "wasteCards")) errors.push(`${field}.repeat 不是受支持的世界选项来源`);
        if (option.next && !nodeIds.has(option.next)) errors.push(`${field}.next 指向未知节点 ${option.next}`);
        if (option.action && !knownActions.has(option.action)) (dialogue.kind === "world" ? errors : warnings).push(`${field}.action 未登记：${option.action}`);
        (Array.isArray(option.effects) ? option.effects : []).forEach((effect) => { if (effect.itemId && !effect.itemId.includes("{{") && !knownItems.has(effect.itemId)) warnings.push(`${field} 使用了未知物品：${effect.itemId}`); });
      });
    });
    const reachable = new Set(), queue = [...(dialogue.entryNodes || []), dialogue.start?.default, ...startRules.map((rule) => rule.node)].filter((id) => nodeIds.has(id));
    while (queue.length) { const id = queue.shift(); if (reachable.has(id)) continue; reachable.add(id); (Array.isArray(dialogue.nodes[id]?.options) ? dialogue.nodes[id].options : []).forEach((option) => { if (option.next) queue.push(option.next); }); }
    const unreachable = [...nodeIds].filter((id) => !reachable.has(id));
    if (unreachable.length) warnings.push(`不可达节点：${unreachable.join("、")}`);
    nodeIds.forEach((id) => { if (dialogue.kind !== "world" && !(Array.isArray(dialogue.nodes[id]?.options) ? dialogue.nodes[id].options : []).length) warnings.push(`节点 ${id} 没有普通选项，将只能献祭或离开`); });
    return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
  }

  const api = { SCHEMA_VERSION, catalog: Object.freeze({ templateKeys: [...TEMPLATE_KEYS], bodyParts: [...BODY_PARTS], itemIds: [...ITEM_IDS], actions: { ...ACTIONS }, dailyStocks: ["longSword", "shield", "dagger", "heavyArmor", "greatSword"] }), clone, deepFreeze, renderTemplate, resolveText, evaluateCondition, resolveStart, resolveNode, applyEffects, validateDialogue };
  global.NPCDialogueRuntime = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
