"use strict";

((global) => {
  const { indentDepth } = global.ActionEventDsl || require("./dsl.js");
  const fields = {
    event: { schemaVersion: ["版本", "json"], name: ["标题"], start: ["起始阶段"], allowLeave: ["允许离开", "json"], actionSlot: ["行动槽"], enemyId: ["敌人"], lureNodeId: ["引开节点"] },
    slot: { name: ["名称"], icon: ["图标"], npcId: ["关联角色"] },
    recipe: {
      action: ["动作"], next: ["下一阶段"], priority: ["优先级", "json"], itemOnly: ["仅物品", "json"],
      staminaCost: ["体力消耗", "json"], hpCost: ["生命消耗", "json"], when: ["世界条件", "json"],
      effects: ["世界后果", "json"], resultDialogueId: ["结果对话"], resultNodeId: ["结果节点"],
    },
  };
  const categories = { attack: "暴力", defense: "执念", technique: "伎俩", ritual: "秘仪", restoration: "恢复" };
  const categoryIds = new Map(Object.entries(categories).map(([id, label]) => [label, id]));
  const atom = /^[\p{L}\p{N}_-]+$/u;
  const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const own = (obj, key) => Object.hasOwn(obj, key);
  const write = (obj, key, value) => Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
  const renderId = (value) => typeof value === "string" && atom.test(value) ? value : JSON.stringify(value);
  const renderText = (value) => /[\r\n]/u.test(value) || value.trim() !== value || value.startsWith('"') ? JSON.stringify(value) : value;
  const readText = (raw) => {
    if (!raw.startsWith('"')) return raw;
    const value = JSON.parse(raw);
    if (typeof value !== "string") throw new Error("这里需要文本。");
    return value;
  };
  const readId = (raw) => {
    const value = readText(raw.trim());
    if (!value || (!raw.trim().startsWith('"') && !atom.test(value))) throw new Error("请输入有效的 ID。含空格或符号的 ID 需要双引号。");
    return value;
  };

  function serialize(event) {
    const lines = [];
    const emit = (depth, line) => lines.push("    ".repeat(depth) + line);
    const raw = (depth, key, value) => emit(depth, `@字段 ${JSON.stringify([key, value])}`);
    function props(depth, obj, kind, excluded) {
      for (const [key, value] of Object.entries(obj)) {
        if (excluded.includes(key)) continue;
        const descriptor = own(fields[kind] || {}, key) && fields[kind][key];
        if (descriptor?.[1] === "json") emit(depth, `${descriptor[0]}：${JSON.stringify(value)}`);
        else if (descriptor && typeof value === "string") emit(depth, `${descriptor[0]}：${renderText(value)}`);
        else raw(depth, key, value);
      }
    }
    function prose(depth, value, key) {
      const marker = key === "body" ? "|" : ">";
      if (typeof value === "string" && !value.includes("\r")) {
        for (const line of value.split("\n")) emit(depth, marker + line);
      } else raw(depth, key, value);
    }
    function selector(slot, condition) {
      if (atom.test(slot) && record(condition)) {
        const { kind, category, cardId, excludeCardId, tag } = condition;
        const keys = Object.keys(condition).length;
        if (kind === "rhetoric" && keys === 2 && typeof tag === "string" && atom.test(tag)) return `物品或知识[${tag}]》${slot}`;
        if (kind === "card" && own(categories, category)) {
          const label = categories[category];
          if (keys === 2) return `${label}》${slot}`;
          if (keys === 3 && typeof cardId === "string" && atom.test(cardId)) return `${label}[${cardId}]》${slot}`;
          if (keys === 3 && typeof excludeCardId === "string" && atom.test(excludeCardId)) return `${label}[!${excludeCardId}]》${slot}`;
        }
      }
      return `@匹配 ${JSON.stringify([slot, condition])}`;
    }
    emit(0, `@event ${renderId(event.id)}`);
    props(0, event, "event", ["id", "slots", "stages"]);
    for (const slot of event.slots) {
      if (!record(slot) || typeof slot.id !== "string" || !slot.id) { emit(0, `@槽位 ${JSON.stringify(slot)}`); continue; }
      lines.push("");
      emit(0, `#${renderId(slot.id)}`);
      props(1, slot, "slot", ["id"]);
    }
    for (const [stageId, stage] of Object.entries(event.stages)) {
      lines.push("");
      emit(0, `[${renderId(stageId)}]`);
      if (!record(stage)) { emit(1, `@阶段 ${JSON.stringify(stage)}`); continue; }
      if (own(stage, "body")) prose(1, stage.body, "body");
      props(1, stage, "stage", ["body", "recipes"]);
      if (!Array.isArray(stage.recipes) || !stage.recipes.length) {
        if (own(stage, "recipes")) raw(1, "recipes", stage.recipes);
        continue;
      }
      for (const recipe of stage.recipes) {
        if (!record(recipe) || typeof recipe.id !== "string" || !recipe.id) { emit(1, `@配方 ${JSON.stringify(recipe)}`); continue; }
        emit(1, `》${renderId(recipe.id)}`);
        if (record(recipe.slots) && Object.keys(recipe.slots).length) {
          for (const [slot, condition] of Object.entries(recipe.slots)) emit(2, selector(slot, condition));
        } else if (own(recipe, "slots")) raw(2, "slots", recipe.slots);
        if (own(recipe, "result")) prose(2, recipe.result, "result");
        props(2, recipe, "recipe", ["id", "slots", "result"]);
      }
    }
    return lines.join("\n") + "\n";
  }

  function heading(text, depth) {
    if (depth === 0 && text.startsWith("#")) return ["槽位", text.slice(1)];
    if (depth === 0 && text.startsWith("[") && text.endsWith("]")) return ["规则组", text.slice(1, -1)];
    if (depth === 1 && text.startsWith("》")) return ["配方", text.slice(1)];
    return null;
  }

  function parse(source, file) {
    const errorAt = (line, column, message) => ({ severity: "error", file, line, column, message });
    const diagnostics = [];
    let event;
    let section;
    let recipe;
    let stageKey;
    const stageBodies = new Set(), results = new Set();
    function set(obj, key, value, reserved = []) {
      if (reserved.includes(key) || own(obj, key)) throw new Error(`「${key}」在此处不可重复定义或覆盖。`);
      write(obj, key, value);
    }
    function pair(raw) {
      const pair = JSON.parse(raw);
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string") throw new Error("需要 [字段名, 值]。");
      return pair;
    }
    function addMatch(text) {
      let slot, condition;
      if (text.startsWith("@匹配 ")) [slot, condition] = pair(text.slice(4));
      else {
        const match = /^([^\[》:：]+)(?:\[(!?)([^\]]+)\])?》(.+)$/u.exec(text.trimEnd());
        if (!match) return false;
        const [, label, exclude, value, target] = match;
        if (label === "物品或知识" && value && !exclude) condition = { kind: "rhetoric", tag: readId(value) };
        else if (categoryIds.has(label)) {
          condition = { kind: "card", category: categoryIds.get(label) };
          if (value) condition[exclude ? "excludeCardId" : "cardId"] = readId(value);
        } else throw new Error(`无法识别匹配类型「${label}」。`);
        slot = readId(target);
      }
      if (!own(recipe, "slots")) recipe.slots = {};
      if (!record(recipe.slots)) throw new Error("已有 slots 字段，不能再添加匹配条件。");
      set(recipe.slots, slot, condition);
      return true;
    }
    function addProse(obj, key, value, written) {
      if (written.has(obj)) obj[key] += "\n" + value;
      else { set(obj, key, value); written.add(obj); }
    }
    for (const [index, line] of source.split("\n").entries()) {
      if (!line.trim()) continue;
      const indent = /^[ \t]*/u.exec(line)[0];
      const text = line.slice(indent.length);
      const depth = indentDepth(indent);
      try {
        if (!Number.isInteger(depth)) throw new Error("每级缩进使用一个 Tab 或四个空格。");
        if (!event) {
          if (depth || !text.startsWith("@event ")) throw new Error("首行应为 @event 事件ID。");
          event = { id: readId(text.slice(7)), slots: [], stages: {} };
          continue;
        }
        const header = heading(text.trimEnd(), depth);
        if (depth === 0) { section = null; recipe = null; stageKey = undefined; }
        if (header?.[0] === "槽位") {
          section = { id: readId(header[1]) };
          event.slots.push(section);
        } else if (header?.[0] === "规则组") {
          stageKey = readId(header[1]);
          section = {};
          set(event.stages, stageKey, section);
        } else if (header?.[0] === "配方" && stageKey !== undefined && section) {
          recipe = { id: readId(header[1]) };
          if (!own(section, "recipes")) section.recipes = [];
          if (!Array.isArray(section.recipes)) throw new Error("已有 recipes 字段，不能再添加配方。");
          section.recipes.push(recipe);
        } else if (depth === 0 && text.startsWith("@槽位 ")) {
          event.slots.push(JSON.parse(text.slice(4)));
        } else if (depth === 1 && stageKey !== undefined && text.startsWith("@阶段 ")) {
          if (Object.keys(section).length) throw new Error("当前阶段已有内容。");
          write(event.stages, stageKey, JSON.parse(text.slice(4)));
          section = null;
        } else if (depth === 1 && stageKey !== undefined && section && text.startsWith("@配方 ")) {
          if (!own(section, "recipes")) section.recipes = [];
          if (!Array.isArray(section.recipes)) throw new Error("已有 recipes 字段，不能再添加配方。");
          section.recipes.push(JSON.parse(text.slice(4)));
          recipe = null;
        } else if (depth === 1 && stageKey !== undefined && section && text.startsWith("|")) {
          addProse(section, "body", text.slice(1), stageBodies);
        } else if (depth === 2 && recipe && text.startsWith(">")) {
          addProse(recipe, "result", text.slice(1), results);
        } else if (depth === 2 && recipe && !text.startsWith("@字段 ") && addMatch(text)) {
          // The matching line is already attached to the current recipe.
        } else {
          const context = depth === 0 ? [event, "event", ["id", "slots", "stages"]]
            : depth === 1 && section ? [section, stageKey === undefined ? "slot" : "stage", stageKey === undefined ? ["id"] : []]
            : depth === 2 && recipe ? [recipe, "recipe", ["id"]] : null;
          if (!context) throw new Error("请检查这一行所属的槽位、规则组或配方，以及缩进。");
          const [obj, kind, reserved] = context;
          if (text.startsWith("@字段 ")) {
            const [key, value] = pair(text.slice(4));
            set(obj, key, value, reserved);
          } else {
            const match = /^([^：:]+)[：:] ?(.*)$/u.exec(text);
            const descriptor = match && Object.entries(fields[kind] || {}).find(([, [label]]) => label === match[1].trimEnd());
            if (!descriptor) throw new Error("无法识别此行。请检查字段名或参考「语法帮助」。");
            const [key, [, type]] = descriptor;
            set(obj, key, type === "json" ? JSON.parse(match[2]) : readText(match[2]), reserved);
          }
        }
      } catch (error) { diagnostics.push(errorAt(index + 1, indent.length + 1, error.message)); }
    }
    if (!event && !diagnostics.length) diagnostics.push(errorAt(1, 1, "首行应为 @event 事件ID。"));
    return { event, diagnostics };
  }

  function outline(source) {
    return source.split("\n").flatMap((line, index) => {
      const indent = /^[ \t]*/u.exec(line)[0];
      const header = heading(line.trim(), indentDepth(indent));
      return header ? [{ kind: header[0], label: header[1], loc: { line: index + 1, column: indent.length + 1 } }] : [];
    });
  }
  const api = { serialize, parse, heading, outline };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.ActionEventText = api;
})(globalThis);
