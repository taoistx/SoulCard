"use strict";

const Runtime = window.NPCDialogueRuntime;
const clone = Runtime.clone;
const documentKey = (d) => `${d.kind || "npc"}:${d.id}`;
const isWorldDialogue = () => current()?.kind === "world";
const dataSource = () => isWorldDialogue() ? window.WorldDialogueData : window.NpcDialogueData;
const sourceDirectory = () => isWorldDialogue() ? "world-dialogues" : "npc-dialogues";
const $ = (selector) => document.querySelector(selector);
const h = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const els = {
  app: $("#editorApp"), npcSelect: $("#npcSelect"), npcSettings: $("#npcSettingsButton"), nodeList: $("#nodeList"), addNode: $("#addNodeButton"),
  graph: $("#graphViewport"), graphNodes: $("#graphNodes"), graphEdges: $("#graphEdges"), inspector: $("#inspector"), inspectorKind: $("#inspectorKind"),
  selectionStatus: $("#selectionStatus"), feedback: $("#feedback"), dirty: $("#dirtyState"), undo: $("#undoButton"), redo: $("#redoButton"),
  create: $("#newNpcButton"), importButton: $("#importButton"), importFile: $("#importFile"), validate: $("#validateButton"), export: $("#exportButton"),
  sandboxButton: $("#sandboxButton"), sandbox: $("#sandbox"), closeSandbox: $("#closeSandboxButton"), sandboxDay: $("#sandboxDay"),
  sandboxFlags: $("#sandboxFlags"), sandboxItems: $("#sandboxItems"), sandboxSacrifices: $("#sandboxSacrifices"), startSandbox: $("#startSandboxButton"),
  previewKicker: $("#previewKicker"), previewTitle: $("#previewTitle"), previewBody: $("#previewBody"), previewOptions: $("#previewOptions"), sandboxLog: $("#sandboxLog"),
};

let documents = {};
let originalSnapshots = {};
let currentId = null;
let selectedNodeId = null;
let selectedOptionIndex = null;
let linking = null;
let history = [];
let historyIndex = -1;
let cleanSnapshot = null;
let feedbackTimer = null;
let battleManifest = null;
let drag = null;
let graphPan = null;
let graphOffset = { x: 0, y: 0 };
let linkDrag = null;
let sandboxState = null;
let sandboxNodeId = null;

const itemNames = { freshFlesh: "新鲜血肉", oldKey: "老旧钥匙", ritualScrap: "秘仪残页", rustySword: "锈剑", longSword: "长剑", dagger: "剔骨匕首", greatSword: "排污双手剑", shield: "井盖盾", heavyArmor: "铸铁浴缸甲", gi: "污白道服", ladyHat: "克里斯的礼帽", mistWrapMaterial: "韧膜", eddieMistWrap: "粗糙鸟嘴防护", oldMistWrap: "旧鸟嘴防护", maintenanceHook: "检修钩" };
const bodyNames = { leftHand: "左手", rightHand: "右手", body: "身体", head: "头", eye: "眼", heart: "心", brain: "脑" };

function normalizeDialogue(dialogue) {
  dialogue.kind ||= "npc";
  dialogue.start ||= { default: Object.keys(dialogue.nodes || {})[0] || "root", rules: [] };
  dialogue.start.rules ||= [];
  dialogue.editor ||= { positions: {} };
  dialogue.editor.positions ||= {};
  Object.keys(dialogue.nodes || {}).forEach((id, index) => { dialogue.editor.positions[id] ||= { x: 60 + (index % 3) * 320, y: 60 + Math.floor(index / 3) * 230 }; });
  Object.values(dialogue.nodes || {}).forEach((node) => { node.options ||= []; node.effects ||= []; });
  return dialogue;
}

function current() { return documents[currentId]; }
function snapshot() { return JSON.stringify(current()); }

function dialogueReferences(dialogue) {
  const references = [];
  const worldDialogue = dialogue.kind === "world";
  for (const [setId, set] of Object.entries(window.WORLD_EVENT_SET_BUNDLE.eventSets)) {
    for (const entry of set.entries) if (worldDialogue ? entry.kind === "dialogue" && entry.dialogueId === dialogue.id : entry.kind === "npc" && entry.npcId === dialogue.id) {
      references.push(`world-events.js · ${setId}.${entry.id}`);
    }
  }
  for (const event of window.ActionEventData.list()) for (const [stageId, stage] of Object.entries(event.stages)) {
    for (const recipe of stage.recipes) if (worldDialogue && recipe.resultDialogueId === dialogue.id) references.push(`action-events/${window.ActionEventData.getManifest?.()?.events?.[event.id] || event.id} · ${stageId}.${recipe.id} → ${recipe.resultNodeId}`);
  }
  if (worldDialogue && (dialogue.entryNodes?.length || dialogue.id.startsWith("ending_"))) references.push(`World 具名入口 · ${dialogue.entryNodes?.join("、") || dialogue.start.default}`);
  return references;
}

function populateSandboxEntries() {
  const select = $("#sandboxEntry"); select.replaceChildren();
  const automatic = h("option", "", "自动判定入口"); automatic.value = ""; select.appendChild(automatic);
  for (const id of Object.keys(current().nodes)) { const option = h("option", "", id); option.value = id; select.appendChild(option); }
  if (selectedNodeId) select.value = selectedNodeId;
  const siteId = current().id.startsWith("site_") ? current().id.slice(5) : "";
  if (siteId && [...$("#sandboxLocation").options].some((o) => o.value === siteId)) $("#sandboxLocation").value = siteId;
}

function showFeedback(message, isError = false) {
  clearTimeout(feedbackTimer);
  els.feedback.textContent = message;
  els.feedback.classList.toggle("error", isError);
  feedbackTimer = setTimeout(() => { els.feedback.textContent = ""; els.feedback.classList.remove("error"); }, 4200);
}

function persistDraft() {
  if (!current()) return;
  for (const kind of ["npc", "world"]) {
    const saved = Object.fromEntries(Object.values(documents).filter((d) => d.kind === kind).map((d) => [d.id, d]));
    sessionStorage.setItem(`${kind}-editor-draft`, JSON.stringify({ id: current().kind === kind ? current().id : null, documents: saved }));
  }
  sessionStorage.setItem("dialogue-editor-selection", currentId);
}

function updateHistoryUi() {
  els.undo.disabled = historyIndex <= 0;
  els.redo.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
  const clean = cleanSnapshot === snapshot();
  els.dirty.textContent = clean ? "已保存" : "未保存";
  els.dirty.classList.toggle("saved", clean);
}

function resetHistory() {
  history = [snapshot()];
  historyIndex = 0;
  cleanSnapshot = originalSnapshots[currentId] || history[0];
  updateHistoryUi();
}

function recordHistory() {
  const next = snapshot();
  if (next === history[historyIndex]) return;
  history = history.slice(0, historyIndex + 1);
  history.push(next);
  historyIndex++;
  if (history.length > 100) { history.shift(); historyIndex--; }
  persistDraft();
  updateHistoryUi();
}

function restoreHistory(index) {
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  const restored = JSON.parse(history[index]), nextKey = documentKey(restored);
  if (nextKey !== currentId && documents[nextKey]) return showFeedback("该 ID 已被其他对话使用，无法撤销重命名", true);
  delete documents[currentId]; documents[nextKey] = restored; currentId = nextKey;
  if (selectedNodeId && !current().nodes[selectedNodeId]) selectedNodeId = null;
  if (selectedOptionIndex !== null && !current().nodes[selectedNodeId]?.options?.[selectedOptionIndex]) selectedOptionIndex = null;
  persistDraft();
  renderAll();
  updateHistoryUi();
}

function mutate(change, render = true) {
  change();
  recordHistory();
  if (render) renderAll();
}

function simpleText(spec) { return typeof spec === "string" ? spec : spec?.default || ""; }
function setDefaultText(owner, key, value) {
  if (typeof owner[key] === "object") owner[key].default = value;
  else owner[key] = value;
}

function makeInput(label, value, onChange, options = {}) {
  const wrapper = h("label", options.wide ? "wide" : "", label);
  const input = document.createElement(options.multiline ? "textarea" : "input");
  if (options.multiline) input.rows = options.rows || 5;
  else input.type = options.type || "text";
  input.value = value ?? "";
  if (options.list) input.setAttribute("list", options.list);
  input.addEventListener("change", () => onChange(options.type === "number" ? Number(input.value) : input.value));
  wrapper.appendChild(input);
  return wrapper;
}

function makeSelect(label, value, choices, onChange) {
  const wrapper = h("label", "", label);
  const select = document.createElement("select");
  choices.forEach(([id, name]) => { const option = h("option", "", name); option.value = id; option.selected = id === value; select.appendChild(option); });
  select.addEventListener("change", () => onChange(select.value));
  wrapper.appendChild(select);
  return wrapper;
}

function defaultClause(source = "flag") {
  if (source === "day" || source === "sacrificedCount") return { source, operator: "eq", value: source === "day" ? 1 : 0 };
  if (source === "item") return { source, itemId: "mistWrapMaterial", operator: "has", amount: 1 };
  if (source === "sacrifice") return { source, partId: "head", operator: "sacrificed" };
  return { source: "flag", key: "storyFlag", operator: "exists" };
}

function conditionEditor(value, onChange, optional = true) {
  const root = h("div", "card");
  if (!value) {
    root.appendChild(h("p", "help", "无条件：始终满足。"));
    const add = h("button", "", "添加条件组");
    add.type = "button";
    add.addEventListener("click", () => onChange({ mode: "all", clauses: [defaultClause()] }));
    root.appendChild(add);
    return root;
  }
  root.appendChild(makeSelect("组合方式", value.mode || "all", [["all", "全部满足（AND）"], ["any", "任一满足（OR）"]], (mode) => { value.mode = mode; onChange(value); }));
  value.clauses = value.clauses || [];
  value.clauses.forEach((clause, index) => {
    const row = h("div", "condition-row");
    const source = document.createElement("select");
    [["flag", "Flag"], ["day", "天数"], ["sacrificedCount", "献祭数量"], ["item", "物品"], ["sacrifice", "身体部位"]].forEach(([id, name]) => { const option = h("option", "", name); option.value = id; option.selected = clause.source === id; source.appendChild(option); });
    source.addEventListener("change", () => { value.clauses[index] = defaultClause(source.value); onChange(value); });
    row.appendChild(source);
    const operators = clause.source === "flag" ? [["exists", "存在"], ["notExists", "不存在"], ["eq", "等于"], ["ne", "不等于"]]
      : clause.source === "item" ? [["has", "持有"], ["lacks", "不持有"]]
      : clause.source === "sacrifice" ? [["sacrificed", "已献祭"], ["intact", "完整"]]
      : [["eq", "="], ["ne", "≠"], ["gte", "≥"], ["lte", "≤"]];
    const operator = document.createElement("select");
    operators.forEach(([id, name]) => { const option = h("option", "", name); option.value = id; option.selected = clause.operator === id; operator.appendChild(option); });
    operator.addEventListener("change", () => { clause.operator = operator.value; onChange(value); });
    row.appendChild(operator);
    let target;
    if (clause.source === "sacrifice") {
      target = document.createElement("select");
      Runtime.catalog.bodyParts.forEach((id) => { const option = h("option", "", bodyNames[id] || id); option.value = id; option.selected = clause.partId === id; target.appendChild(option); });
      target.addEventListener("change", () => { clause.partId = target.value; onChange(value); });
    } else {
      target = document.createElement("input");
      if (clause.source === "day" || clause.source === "sacrificedCount") { target.type = "number"; target.value = clause.value ?? 0; target.addEventListener("change", () => { clause.value = Number(target.value); onChange(value); }); }
      else if (clause.source === "item") { target.value = clause.itemId || ""; target.setAttribute("list", "itemIds"); target.addEventListener("change", () => { clause.itemId = target.value; onChange(value); }); }
      else { target.value = clause.key || ""; target.addEventListener("change", () => { clause.key = target.value; onChange(value); }); }
    }
    row.appendChild(target);
    const remove = h("button", "danger", "×"); remove.type = "button";
    remove.addEventListener("click", () => { value.clauses.splice(index, 1); onChange(value); });
    row.appendChild(remove);
    if (clause.source === "item") row.appendChild(makeInput("数量", clause.amount || 1, (amount) => { clause.amount = amount; onChange(value); }, { type: "number", wide: true }));
    if (clause.source === "flag" && ["eq", "ne"].includes(clause.operator)) row.appendChild(makeInput("比较值（JSON）", JSON.stringify(clause.value ?? true), (raw) => { try { clause.value = JSON.parse(raw); } catch { clause.value = raw; } onChange(value); }, { wide: true }));
    root.appendChild(row);
  });
  const actions = h("div", "row-actions");
  const add = h("button", "", "添加条件"); add.type = "button"; add.addEventListener("click", () => { value.clauses.push(defaultClause()); onChange(value); }); actions.appendChild(add);
  if (optional) { const clear = h("button", "danger", "清除条件组"); clear.type = "button"; clear.addEventListener("click", () => onChange(null)); actions.appendChild(clear); }
  root.appendChild(actions);
  return root;
}

function effectsEditor(effects, onChange) {
  const root = h("div", "card");
  effects = effects || [];
  effects.forEach((effect, index) => {
    const row = h("div", "effect-row");
    const type = document.createElement("select");
    [["setFlag", "设置 Flag"], ["addItem", "获得物品"], ["removeItem", "消耗物品"]].forEach(([id, name]) => { const option = h("option", "", name); option.value = id; option.selected = effect.type === id; type.appendChild(option); });
    type.addEventListener("change", () => { effects[index] = type.value === "setFlag" ? { type: "setFlag", key: "storyFlag", value: true } : { type: type.value, itemId: "mistWrapMaterial", amount: 1 }; onChange(effects); });
    row.appendChild(type);
    const key = document.createElement("input"); key.value = effect.type === "setFlag" ? effect.key || "" : effect.itemId || ""; if (effect.type !== "setFlag") key.setAttribute("list", "itemIds");
    key.addEventListener("change", () => { if (effect.type === "setFlag") effect.key = key.value; else effect.itemId = key.value; onChange(effects); }); row.appendChild(key);
    const value = document.createElement("input"); value.value = effect.type === "setFlag" ? JSON.stringify(effect.value) : String(effect.amount || 1);
    value.addEventListener("change", () => { if (effect.type === "setFlag") { try { effect.value = JSON.parse(value.value); } catch { effect.value = value.value; } } else effect.amount = Math.max(1, Number(value.value) || 1); onChange(effects); }); row.appendChild(value);
    const remove = h("button", "danger", "×"); remove.type = "button"; remove.addEventListener("click", () => { effects.splice(index, 1); onChange(effects); }); row.appendChild(remove);
    root.appendChild(row);
  });
  const add = h("button", "", "添加效果"); add.type = "button"; add.addEventListener("click", () => { effects.push({ type: "setFlag", key: "storyFlag", value: true }); onChange(effects); }); root.appendChild(add);
  return root;
}

function textSpecEditor(label, owner, key) {
  const root = h("section", "card"); root.appendChild(h("h4", "", label));
  root.appendChild(makeInput("默认文本", simpleText(owner[key]), (value) => mutate(() => setDefaultText(owner, key, value)), { multiline: true, rows: key === "body" ? 6 : 3 }));
  const variants = typeof owner[key] === "object" ? owner[key].variants || [] : [];
  variants.forEach((variant, index) => {
    const card = h("div", "card"); card.appendChild(h("strong", "", `条件文本 ${index + 1}`));
    card.appendChild(makeInput("文本", variant.text, (value) => mutate(() => { variant.text = value; }), { multiline: true, rows: 4 }));
    card.appendChild(conditionEditor(variant.when, (group) => mutate(() => { variant.when = group || { mode: "all", clauses: [] }; })));
    const remove = h("button", "danger", "删除条件文本"); remove.type = "button"; remove.addEventListener("click", () => mutate(() => { owner[key].variants.splice(index, 1); })); card.appendChild(remove);
    root.appendChild(card);
  });
  const add = h("button", "", "添加条件文本"); add.type = "button";
  add.addEventListener("click", () => mutate(() => {
    if (typeof owner[key] === "string") owner[key] = { default: owner[key], variants: [] };
    owner[key].variants = owner[key].variants || [];
    owner[key].variants.push({ when: { mode: "all", clauses: [defaultClause()] }, text: "条件成立时的文本" });
  })); root.appendChild(add);
  return root;
}

function renderNpcInspector() {
  const dialogue = current();
  els.inspectorKind.textContent = isWorldDialogue() ? "世界对话" : "NPC";
  els.inspector.appendChild(h("p", "help", `来源：${sourceDirectory()}/${dataSource().getManifest()?.dialogues?.[dialogue.id] || dialogue.id + ".json"}`));
  for (const reference of dialogueReferences(dialogue)) els.inspector.appendChild(h("p", "help", `引用：${reference}`));
  els.inspector.appendChild(h("h3", "", dialogue.name));
  const fields = h("div", "field-grid");
  fields.appendChild(makeInput("稳定 ID", dialogue.id, renameNpc));
  fields.appendChild(makeInput("显示名称", dialogue.name, (value) => mutate(() => { dialogue.name = value; })));
  fields.appendChild(makeSelect("默认入口", dialogue.start.default, Object.keys(dialogue.nodes).map((id) => [id, id]), (value) => mutate(() => { dialogue.start.default = value; })));
  els.inspector.appendChild(fields);
  els.inspector.appendChild(h("h4", "", "条件入口规则（从上到下）"));
  (dialogue.start.rules || []).forEach((rule, index) => {
    const card = h("div", "card rule-summary"); card.appendChild(makeSelect(`规则 ${index + 1} 目标`, rule.node, Object.keys(dialogue.nodes).map((id) => [id, id]), (value) => mutate(() => { rule.node = value; })));
    card.appendChild(conditionEditor(rule.when, (group) => mutate(() => { rule.when = group || { mode: "all", clauses: [] }; }), false));
    const remove = h("button", "danger", "删除入口规则"); remove.type = "button"; remove.addEventListener("click", () => mutate(() => { dialogue.start.rules.splice(index, 1); })); card.appendChild(remove); els.inspector.appendChild(card);
  });
  const add = h("button", "", "添加条件入口"); add.type = "button"; add.addEventListener("click", () => mutate(() => { dialogue.start.rules.push({ when: { mode: "all", clauses: [defaultClause()] }, node: dialogue.start.default }); })); els.inspector.appendChild(add);
}

function renderNodeInspector() {
  const dialogue = current(), node = dialogue.nodes[selectedNodeId];
  els.inspectorKind.textContent = selectedOptionIndex === null ? "节点" : "选项";
  if (selectedOptionIndex !== null) return renderOptionInspector(node, node.options[selectedOptionIndex]);
  els.inspector.appendChild(h("h3", "", selectedNodeId));
  const fields = h("div", "field-grid");
  fields.appendChild(makeInput("节点 ID", selectedNodeId, (value) => renameNode(selectedNodeId, value)));
  fields.appendChild(makeInput("标题", simpleText(node.title), (value) => mutate(() => setDefaultText(node, "title", value))));
  fields.appendChild(makeInput("眉题", simpleText(node.kicker), (value) => mutate(() => setDefaultText(node, "kicker", value)), { wide: true }));
  els.inspector.appendChild(fields);
  els.inspector.appendChild(textSpecEditor("正文与条件文本", node, "body"));
  if (isWorldDialogue()) {
    fields.appendChild(makeSelect("入口动作（执行后转场）", node.onEnter || "", [["", "无"], ...Object.entries(window.WorldDialogueCatalog.actions)], (value) => mutate(() => { if (value) node.onEnter = value; else delete node.onEnter; })));
    els.inspector.appendChild(h("h4", "", "额外允许关闭条件"));
    if (node.allowCloseWhen) {
      els.inspector.appendChild(conditionEditor(node.allowCloseWhen, (group) => mutate(() => { if (group) node.allowCloseWhen = group; else delete node.allowCloseWhen; })));
    } else {
      els.inspector.appendChild(h("p", "help", "未配置额外条件；仅按“允许关闭 / 离开”设置判断。"));
      const addCloseCondition = h("button", "", "添加额外关闭条件"); addCloseCondition.type = "button";
      addCloseCondition.addEventListener("click", () => mutate(() => { node.allowCloseWhen = { mode: "all", clauses: [defaultClause()] }; }));
      els.inspector.appendChild(addCloseCondition);
    }
    fields.appendChild(makeSelect("允许关闭 / 离开", String(node.allowClose !== false), [["true", "允许"], ["false", "必须选择选项"]], (value) => mutate(() => { node.allowClose = value === "true"; })));
    fields.appendChild(makeSelect("可从 World 直接进入", String((dialogue.entryNodes || []).includes(selectedNodeId)), [["false", "否"], ["true", "是"]], (value) => mutate(() => { dialogue.entryNodes = (dialogue.entryNodes || []).filter((id) => id !== selectedNodeId); if (value === "true") dialogue.entryNodes.push(selectedNodeId); })));
  }
  els.inspector.appendChild(h("h4", "", "进入节点时的效果"));
  els.inspector.appendChild(effectsEditor(node.effects || [], (effects) => mutate(() => { node.effects = effects; })));
  els.inspector.appendChild(h("h4", "", "玩家选项"));
  (node.options || []).forEach((option, index) => { const button = h("button", `option-summary${selectedOptionIndex === index ? " active" : ""}`, `${index + 1}. ${simpleText(option.label) || option.id}`); button.type = "button"; button.addEventListener("click", () => { selectedOptionIndex = index; renderAll(); }); els.inspector.appendChild(button); });
  const actions = h("div", "row-actions");
  const add = h("button", "", "添加选项"); add.type = "button"; add.addEventListener("click", () => mutate(() => { node.options = node.options || []; node.options.push({ id: uniqueOptionId(node, "option"), label: "新选项", hint: "", next: "" }); selectedOptionIndex = node.options.length - 1; })); actions.appendChild(add);
  const duplicate = h("button", "", "复制节点"); duplicate.type = "button"; duplicate.addEventListener("click", () => duplicateNode(selectedNodeId)); actions.appendChild(duplicate);
  const remove = h("button", "danger", "删除节点"); remove.type = "button"; remove.addEventListener("click", () => deleteNode(selectedNodeId)); actions.appendChild(remove);
  els.inspector.appendChild(actions);
}

function renderOptionInspector(node, option) {
  els.inspector.appendChild(h("h3", "", simpleText(option.label) || option.id));
  const fields = h("div", "field-grid");
  fields.appendChild(makeInput("选项 ID", option.id, (value) => mutate(() => { if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(value) && !node.options.some((item, i) => i !== selectedOptionIndex && item.id === value)) option.id = value; else showFeedback("选项 ID 无效或重复", true); })));
  fields.appendChild(makeSelect("下一节点", option.next || "", [["", "结束 / 不跳转"], ...Object.keys(current().nodes).map((id) => [id, id])], (value) => mutate(() => { if (value) option.next = value; else delete option.next; })));
  if (isWorldDialogue()) fields.appendChild(makeSelect("选项来源", option.repeat || "", [["", "单个选项"], ["wasteCards", "每个可搬废料的伎俩副本"]], (value) => mutate(() => { if (value) option.repeat = value; else delete option.repeat; })));
  fields.appendChild(makeInput("具名动作", option.action || "", (value) => mutate(() => { if (value) option.action = value; else delete option.action; }), { list: "actionIds", wide: true }));
  els.inspector.appendChild(fields);
  els.inspector.appendChild(textSpecEditor("选项文字", option, "label"));
  els.inspector.appendChild(textSpecEditor("提示文字", option, "hint"));
  els.inspector.appendChild(h("h4", "", "显示条件"));
  els.inspector.appendChild(conditionEditor(option.visibleWhen, (group) => mutate(() => { if (group) option.visibleWhen = group; else delete option.visibleWhen; })));
  els.inspector.appendChild(h("h4", "", "可用条件"));
  els.inspector.appendChild(conditionEditor(option.enabledWhen, (group) => mutate(() => { if (group) option.enabledWhen = group; else delete option.enabledWhen; })));
  els.inspector.appendChild(h("h4", "", "选择后的通用效果"));
  els.inspector.appendChild(effectsEditor(option.effects || [], (effects) => mutate(() => { option.effects = effects; })));
  const actions = h("div", "row-actions");
  const connect = h("button", "", option.next ? "重新连线" : "连接节点"); connect.type = "button"; connect.addEventListener("click", () => { linking = { nodeId: selectedNodeId, optionIndex: selectedOptionIndex }; renderGraph(); showFeedback("点击图中的目标节点完成连线"); }); actions.appendChild(connect);
  const back = h("button", "", "返回节点"); back.type = "button"; back.addEventListener("click", () => { selectedOptionIndex = null; renderAll(); }); actions.appendChild(back);
  const remove = h("button", "danger", "删除选项"); remove.type = "button"; remove.addEventListener("click", () => mutate(() => { node.options.splice(selectedOptionIndex, 1); selectedOptionIndex = null; })); actions.appendChild(remove);
  els.inspector.appendChild(actions);
}

function renderInspector() {
  els.inspector.replaceChildren();
  if (!selectedNodeId) renderNpcInspector(); else renderNodeInspector();
}

function nodePosition(id, index) {
  const positions = current().editor ||= { positions: {} };
  positions.positions ||= {};
  return positions.positions[id] ||= { x: 60 + (index % 3) * 320, y: 60 + Math.floor(index / 3) * 230 };
}

function graphPointerPoint(event) {
  const rect = els.graph.getBoundingClientRect();
  return {
    x: event.clientX - rect.left - graphOffset.x,
    y: event.clientY - rect.top - graphOffset.y,
  };
}

function edgePathData(x1, y1, x2, y2) {
  return `M ${x1} ${y1} C ${x1 + 80} ${y1}, ${x2 - 80} ${y2}, ${x2} ${y2}`;
}

function optionPortPoint(nodeId, nodeIndex, optionIndex) {
  const pos = nodePosition(nodeId, nodeIndex);
  return { x: pos.x + 250, y: pos.y + 104 + optionIndex * 25 };
}

function nodeFromPointer(event) {
  return document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".graph-node")?.dataset?.nodeId || null;
}

function disconnectOption(nodeId, optionIndex) {
  const option = current().nodes[nodeId]?.options?.[optionIndex];
  if (!option?.next) return;
  mutate(() => {
    delete option.next;
    selectedNodeId = nodeId;
    selectedOptionIndex = optionIndex;
    linking = null;
  });
  showFeedback("已断开连线");
}

function startLinkDrag(event, nodeId, optionIndex) {
  if (event.button !== 0) return;
  const ids = Object.keys(current().nodes);
  const start = optionPortPoint(nodeId, ids.indexOf(nodeId), optionIndex);
  event.preventDefault();
  event.stopPropagation();
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  linking = null;
  selectedNodeId = nodeId;
  selectedOptionIndex = optionIndex;
  linkDrag = {
    nodeId,
    optionIndex,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    x1: start.x,
    y1: start.y,
    moved: false,
    path: document.createElementNS("http://www.w3.org/2000/svg", "path"),
  };
  linkDrag.path.setAttribute("class", "graph-edge draft");
  const pointer = graphPointerPoint(event);
  linkDrag.path.setAttribute("d", edgePathData(linkDrag.x1, linkDrag.y1, pointer.x, pointer.y));
  els.graphEdges.appendChild(linkDrag.path);
}

function updateLinkDrag(event) {
  if (!linkDrag || linkDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const pointer = graphPointerPoint(event);
  if (Math.hypot(event.clientX - linkDrag.startClientX, event.clientY - linkDrag.startClientY) > 4) linkDrag.moved = true;
  linkDrag.path.setAttribute("d", edgePathData(linkDrag.x1, linkDrag.y1, pointer.x, pointer.y));
}

function finishLinkDrag(event) {
  if (!linkDrag || linkDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const dragState = linkDrag;
  dragState.path.remove();
  linkDrag = null;
  if (!dragState.moved) return renderEdges();
  const targetNodeId = nodeFromPointer(event);
  if (!targetNodeId) return renderEdges();
  const option = current().nodes[dragState.nodeId]?.options?.[dragState.optionIndex];
  if (!option) return renderEdges();
  mutate(() => {
    option.next = targetNodeId;
    selectedNodeId = dragState.nodeId;
    selectedOptionIndex = dragState.optionIndex;
    linking = null;
  });
}

function renderEdges() {
  els.graphEdges.replaceChildren();
  const ids = Object.keys(current().nodes);
  ids.forEach((nodeId, nodeIndex) => {
    const from = nodePosition(nodeId, nodeIndex);
    (current().nodes[nodeId].options || []).forEach((option, optionIndex) => {
      if (!option.next || !current().nodes[option.next]) return;
      const targetIndex = ids.indexOf(option.next), to = nodePosition(option.next, targetIndex);
      const { x: x1, y: y1 } = optionPortPoint(nodeId, nodeIndex, optionIndex);
      const x2 = to.x, y2 = to.y + 45;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", edgePathData(x1, y1, x2, y2));
      path.setAttribute("class", `graph-edge${selectedNodeId === nodeId && selectedOptionIndex === optionIndex ? " selected" : ""}`);
      els.graphEdges.appendChild(path);
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("d", edgePathData(x1, y1, x2, y2));
      hit.setAttribute("class", "graph-edge-hit");
      hit.setAttribute("role", "button");
      hit.setAttribute("aria-label", `断开 ${nodeId} 到 ${option.next}`);
      hit.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        disconnectOption(nodeId, optionIndex);
      });
      els.graphEdges.appendChild(hit);
    });
  });
}

function renderGraph() {
  els.graphNodes.replaceChildren();
  const dialogue = current(), ids = Object.keys(dialogue.nodes), entries = new Set([dialogue.start.default, ...(dialogue.start.rules || []).map((rule) => rule.node)]);
  if (!ids.length) { els.graphNodes.appendChild(h("p", "graph-empty", "创建一个节点开始编写剧情。")); return; }
  ids.forEach((nodeId, index) => {
    const node = dialogue.nodes[nodeId], pos = nodePosition(nodeId, index);
    const card = h("article", `graph-node${selectedNodeId === nodeId ? " selected" : ""}${linking ? " linking-target" : ""}`); card.dataset.nodeId = nodeId; card.style.left = `${pos.x}px`; card.style.top = `${pos.y}px`;
    const head = h("header", "node-head"); if (entries.has(nodeId)) head.appendChild(h("span", "entry-badge", "入口")); head.appendChild(h("strong", "", simpleText(node.title) || nodeId)); head.appendChild(h("small", "", nodeId)); card.appendChild(head);
    card.appendChild(h("p", "node-excerpt", simpleText(node.body).replace(/\n/g, " ") || "空白节点"));
    const options = h("div", "node-options");
    (node.options || []).forEach((option, optionIndex) => { const row = h("div", `node-option${selectedNodeId === nodeId && selectedOptionIndex === optionIndex ? " active" : ""}`); row.appendChild(h("span", "", simpleText(option.label) || option.id)); const port = h("i", "port"); port.title = "拖到目标节点连接；也可点击后选择目标节点"; port.addEventListener("pointerdown", (event) => startLinkDrag(event, nodeId, optionIndex)); port.addEventListener("click", (event) => { event.stopPropagation(); linking = { nodeId, optionIndex }; selectedNodeId = nodeId; selectedOptionIndex = optionIndex; renderAll(); showFeedback("点击目标节点完成连线"); }); row.appendChild(port); row.addEventListener("click", (event) => { event.stopPropagation(); selectedNodeId = nodeId; selectedOptionIndex = optionIndex; linking = null; renderAll(); }); options.appendChild(row); });
    card.appendChild(options);
    card.addEventListener("click", () => {
      if (linking) { const source = current().nodes[linking.nodeId]?.options?.[linking.optionIndex]; if (source) mutate(() => { source.next = nodeId; linking = null; selectedNodeId = nodeId; selectedOptionIndex = null; }); return; }
      selectedNodeId = nodeId; selectedOptionIndex = null; renderAll();
    });
    head.addEventListener("pointerdown", (event) => { event.stopPropagation(); head.setPointerCapture(event.pointerId); drag = { nodeId, startX: event.clientX, startY: event.clientY, original: { ...pos }, element: card, moved: false }; });
    head.addEventListener("pointermove", (event) => { if (!drag || drag.nodeId !== nodeId) return; const next = nodePosition(nodeId, index); next.x = Math.max(16, drag.original.x + event.clientX - drag.startX); next.y = Math.max(16, drag.original.y + event.clientY - drag.startY); drag.moved = true; card.style.left = `${next.x}px`; card.style.top = `${next.y}px`; renderEdges(); });
    head.addEventListener("pointerup", () => { if (drag?.moved) recordHistory(); drag = null; });
    els.graphNodes.appendChild(card);
  });
  renderEdges();
}

function applyGraphOffset() {
  const transform = `translate(${graphOffset.x}px, ${graphOffset.y}px)`;
  els.graphNodes.style.transform = transform;
  els.graphEdges.style.transform = transform;
  els.graph.style.backgroundPosition = `${graphOffset.x}px ${graphOffset.y}px, ${graphOffset.x}px ${graphOffset.y}px, 0 0`;
}

function renderNodeList() {
  els.nodeList.replaceChildren();
  Object.keys(current().nodes).forEach((id) => { const button = h("button", selectedNodeId === id ? "active" : ""); button.type = "button"; button.append(h("span", "", simpleText(current().nodes[id].title) || id), h("small", "", id)); button.addEventListener("click", () => { selectedNodeId = id; selectedOptionIndex = null; linking = null; renderAll(); }); els.nodeList.appendChild(button); });
}

function renderNpcSelect() {
  els.npcSelect.replaceChildren();
  const kind = $("#dialogueKind").value, query = $("#dialogueSearch").value.trim().toLowerCase();
  const matches = Object.values(documents).filter((d) => (kind === "all" || d.kind === kind) && `${d.name} ${d.id}`.toLowerCase().includes(query));
  matches.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")).forEach((dialogue) => {
    const option = h("option", "", `${dialogue.kind === "world" ? "世界" : "NPC"} · ${dialogue.name} · ${dialogue.id}`);
    option.value = dialogue.kind === "npc" ? dialogue.id : documentKey(dialogue); option.selected = documentKey(dialogue) === currentId; els.npcSelect.appendChild(option);
  });
  if (!matches.some((d) => documentKey(d) === currentId)) { const placeholder = h("option", "", matches.length ? "选择筛选结果" : "无匹配对话"); placeholder.value = ""; placeholder.selected = true; els.npcSelect.prepend(placeholder); }
}

function renderAll() {
  if (!current()) return;
  renderNpcSelect(); renderNodeList(); renderGraph(); renderInspector();
  els.selectionStatus.textContent = selectedNodeId ? `${selectedNodeId}${selectedOptionIndex === null ? "" : ` / 选项 ${selectedOptionIndex + 1}`}` : `${current().id} / 对话设置`;
  updateHistoryUi();
}

function uniqueNodeId(base = "node") { let id = base, suffix = 2; while (current().nodes[id]) id = `${base}${suffix++}`; return id; }
function uniqueOptionId(node, base) { let id = base, suffix = 2; while ((node.options || []).some((item) => item.id === id)) id = `${base}${suffix++}`; return id; }

function addNode() {
  const id = uniqueNodeId();
  mutate(() => { current().nodes[id] = { kicker: `${current().name} · 对话`, title: "新节点", body: "在这里输入对白。", options: [] }; current().editor ||= { positions: {} }; current().editor.positions[id] = { x: 80 + Object.keys(current().nodes).length * 35, y: 90 + Object.keys(current().nodes).length * 30 }; selectedNodeId = id; selectedOptionIndex = null; });
}

function duplicateNode(id) {
  const nextId = uniqueNodeId(`${id}Copy`), source = current().nodes[id], pos = current().editor?.positions?.[id] || { x: 80, y: 80 };
  mutate(() => { current().nodes[nextId] = clone(source); current().nodes[nextId].options = (current().nodes[nextId].options || []).map((option, i) => ({ ...option, id: uniqueOptionId(current().nodes[nextId], `${option.id || "option"}${i + 1}`) })); current().editor.positions[nextId] = { x: pos.x + 50, y: pos.y + 70 }; selectedNodeId = nextId; selectedOptionIndex = null; });
}

function deleteNode(id) {
  const dialogue = current();
  const inbound = [];
  if ((dialogue.entryNodes || []).includes(id)) inbound.push("World 外部入口（先移除入口标记及外部引用）");
  if (dialogue.start.default === id) inbound.push("默认入口");
  (dialogue.start.rules || []).forEach((rule, index) => { if (rule.node === id) inbound.push(`入口规则 ${index + 1}`); });
  Object.entries(dialogue.nodes).forEach(([sourceId, node]) => (node.options || []).forEach((option) => { if (option.next === id) inbound.push(`${sourceId}.${option.id}`); }));
  if (inbound.length) return showFeedback(`节点仍被引用：${inbound.join("、")}`, true);
  if (Object.keys(dialogue.nodes).length === 1) return showFeedback("对话至少需要一个节点", true);
  mutate(() => { delete dialogue.nodes[id]; delete dialogue.editor?.positions?.[id]; selectedNodeId = null; selectedOptionIndex = null; });
}

function renameNode(oldId, nextId) {
  if (oldId === nextId) return;
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(nextId) || current().nodes[nextId]) return showFeedback("节点 ID 无效或已经存在", true);
  mutate(() => {
    const dialogue = current(), entries = Object.entries(dialogue.nodes), replacement = {};
    entries.forEach(([id, node]) => { replacement[id === oldId ? nextId : id] = node; (node.options || []).forEach((option) => { if (option.next === oldId) option.next = nextId; }); });
    dialogue.nodes = replacement; if (dialogue.entryNodes) dialogue.entryNodes = dialogue.entryNodes.map((id) => id === oldId ? nextId : id); if (dialogue.start.default === oldId) dialogue.start.default = nextId; dialogue.start.rules.forEach((rule) => { if (rule.node === oldId) rule.node = nextId; });
    if (dialogue.editor?.positions?.[oldId]) { dialogue.editor.positions[nextId] = dialogue.editor.positions[oldId]; delete dialogue.editor.positions[oldId]; }
    selectedNodeId = nextId;
  });
}

function renameNpc(nextId) {
  const oldKey = currentId, dialogue = current(), nextKey = `${dialogue.kind}:${nextId}`;
  if (dialogue.id === nextId) return;
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(nextId) || documents[nextKey]) return showFeedback("同类型对话 ID 无效或已经存在", true);
  const references = dialogueReferences(dialogue);
  delete documents[oldKey]; documents[nextKey] = dialogue; dialogue.id = nextId; currentId = nextKey;
  recordHistory(); renderAll(); showFeedback(`已修改 ID；导出后更新 ${sourceDirectory()}/manifest.json 及引用：${references.join("；") || "调用该对话的 World 入口"}`);
}

function validationResult() {
  const result = Runtime.validateDialogue(current());
  const warnings = [...result.warnings];
  const manifest = dataSource().getManifest();
  const id = current().id;
  if (!manifest?.dialogues?.[id]) warnings.push(`manifest.json 尚未登记 ${id}`);
  if (isWorldDialogue()) {
    for (const event of window.ActionEventData.list()) for (const [stageId, stage] of Object.entries(event.stages)) for (const recipe of stage.recipes) {
      if (recipe.resultDialogueId === id && !current().nodes[recipe.resultNodeId]) result.errors.push(`${event.id}.${stageId}.${recipe.id} 引用了缺失节点 ${recipe.resultNodeId}`);
    }
    return { errors: result.errors, warnings: [...new Set(warnings)] };
  }
  const placed = window.WORLD_MAP_BUNDLE?.map?.nodes?.some((node) =>
    (node.type === "npc" && node.npcId === id) || node.siteNpcIds?.includes(id) ||
    (window.WORLD_EVENT_SET_BUNDLE?.eventSets?.[node.eventSetId]?.entries || []).some((entry) =>
      (entry.kind === "npc" && entry.npcId === id) ||
      (entry.kind === "action" && window.ActionEventData.get(entry.actionEventId)?.slots.some((slot) => slot.npcId === id))));
  if (!placed) warnings.push(`world-map.js 尚未摆放 NPC 或行动事件角色 ${id}`);
  if (!battleManifest?.combatants?.[id]) warnings.push(`battle-data/manifest.json 没有角色 ${id}`);
  return { errors: result.errors, warnings: [...new Set(warnings)] };
}

function showValidation() {
  selectedNodeId = null; selectedOptionIndex = null; renderAll();
  const result = validationResult(), card = h("section", "card"); card.appendChild(h("h4", "", `检查：${result.errors.length} 错误，${result.warnings.length} 警告`));
  const list = h("ul", "validation-list"); result.errors.forEach((message) => list.appendChild(h("li", "error", `错误：${message}`))); result.warnings.forEach((message) => list.appendChild(h("li", "warning", `警告：${message}`))); if (!result.errors.length && !result.warnings.length) list.appendChild(h("li", "", "配置完整，可以导出。")); card.appendChild(list); els.inspector.prepend(card);
  showFeedback(result.errors.length ? "存在阻止导出的错误" : result.warnings.length ? "结构通过，但有联动警告" : "检查通过", Boolean(result.errors.length));
  return result;
}

function exportCurrent() {
  const result = showValidation(); if (result.errors.length) return;
  const source = `${JSON.stringify(current(), null, 2)}\n`, blob = new Blob([source], { type: "application/json;charset=utf-8" }), url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = `${current().id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  originalSnapshots[currentId] = snapshot(); cleanSnapshot = snapshot(); updateHistoryUi();
  const manifestEntry = `"${current().id}": "${current().id}.json"`;
  navigator.clipboard?.writeText(manifestEntry).catch(() => {});
  showFeedback(`已导出；请替换 ${sourceDirectory()}/${current().id}.json${dataSource().getManifest()?.dialogues?.[current().id] ? "" : `，并登记 ${sourceDirectory()}/manifest.json：${manifestEntry}`}。ID 变化时还需更新外部引用。`);
  persistDraft();
}

function createNpc() {
  const kind = $("#dialogueKind").value === "world" || ($("#dialogueKind").value === "all" && isWorldDialogue()) ? "world" : "npc";
  const id = window.prompt(`输入稳定英文 ${kind === "world" ? "世界对话" : "NPC"} ID`, kind === "world" ? "newDialogue" : "newNpc"); if (!id) return;
  const key = `${kind}:${id}`;
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id) || documents[key]) return showFeedback("同类型对话 ID 无效或已经存在", true);
  const name = window.prompt("输入显示名称", kind === "world" ? "新对话" : "新角色") || id;
  documents[key] = normalizeDialogue({ schemaVersion: 1, kind, id, name, start: { default: "root", rules: [] }, nodes: { root: { title: name, body: "在这里输入对白。", options: [] } } });
  originalSnapshots[key] = null; selectNpc(key); persistDraft();
}

function selectNpc(id) {
  currentId = id.includes(":") ? id : `npc:${id}`; selectedNodeId = null; selectedOptionIndex = null; linking = null; resetHistory(); renderAll();
}

async function importDialogue(file) {
  try {
    const dialogue = JSON.parse(await file.text()), result = Runtime.validateDialogue(dialogue);
    if (result.errors.length) throw new Error(result.errors.join("；"));
    const key = documentKey(dialogue); documents[key] = normalizeDialogue(clone(dialogue)); originalSnapshots[key] ||= null; $("#dialogueKind").value = "all"; $("#dialogueSearch").value = ""; selectNpc(key); persistDraft(); showFeedback(`已导入 ${dialogue.name}`);
  } catch (error) { showFeedback(`导入失败：${error.message}`, true); }
  els.importFile.value = "";
}

function sandboxContext() {
  const stockId = Runtime.catalog.dailyStocks[sandboxState.day - 1] || "greatSword";
  return {
    ...sandboxState.context, nodeId: sandboxState.location?.id || "", nodeLabel: sandboxState.location?.label || "",
    day: sandboxState.day, dailyStockId: stockId, dailyStockName: itemNames[stockId] || stockId, sacrificedCount: Object.keys(sandboxState.sacrificed).length,
    getFlag: (key) => sandboxState.flags[key], setFlag: (key, value) => { sandboxState.flags[key] = value; },
    hasItem: (id, amount = 1) => (sandboxState.inventory[id] || 0) >= amount,
    addItem: (id, amount = 1) => { sandboxState.inventory[id] = (sandboxState.inventory[id] || 0) + amount; },
    removeItem: (id, amount = 1) => { if ((sandboxState.inventory[id] || 0) < amount) return false; sandboxState.inventory[id] -= amount; if (sandboxState.inventory[id] <= 0) delete sandboxState.inventory[id]; return true; },
    hasSacrificed: (id) => Boolean(sandboxState.sacrificed[id]),
  };
}

function appendSandboxLog(message, before = null) {
  const lines = [message];
  if (before) lines.push(`之前：${JSON.stringify(before)}`, `之后：${JSON.stringify({ flags: sandboxState.flags, inventory: sandboxState.inventory })}`);
  els.sandboxLog.textContent = `${els.sandboxLog.textContent === "尚未执行剧情。" ? "" : `${els.sandboxLog.textContent}\n\n`}${lines.join("\n")}`;
}

function enterSandboxNode(nodeId) {
  const dialogue = current(), context = sandboxContext(), node = Runtime.resolveNode(dialogue, nodeId, context);
  if (!node) return appendSandboxLog(`无法进入未知节点 ${nodeId}`);
  sandboxNodeId = nodeId;
  if (node.onEnter) appendSandboxLog(`入口动作（仅记录，游戏中会转场）：${node.onEnter}`);
  const before = clone({ flags: sandboxState.flags, inventory: sandboxState.inventory });
  Runtime.applyEffects(node.effects, context);
  const optionNode = Runtime.resolveNode(dialogue, nodeId, sandboxContext());
  els.previewKicker.textContent = node.kicker; els.previewTitle.textContent = node.title; els.previewBody.textContent = node.body; els.previewOptions.replaceChildren();
  optionNode.options.forEach((option, index) => {
    const button = document.createElement("button"); button.type = "button"; button.disabled = !option.enabled; button.append(h("span", "", option.label), h("small", "", option.hint));
    button.addEventListener("click", () => {
      const raw = dialogue.nodes[sandboxNodeId].options.find((entry) => entry.id === option.id), fresh = sandboxContext();
      if (!Runtime.evaluateCondition(raw.visibleWhen, fresh) || !Runtime.evaluateCondition(raw.enabledWhen, fresh)) return enterSandboxNode(sandboxNodeId);
      if (raw.action) appendSandboxLog(`具名动作（仅记录）：${raw.action}`);
      const effectBefore = clone({ flags: sandboxState.flags, inventory: sandboxState.inventory });
      if (!Runtime.applyEffects(raw.effects || [], fresh)) return appendSandboxLog("效果执行失败：物品不足");
      appendSandboxLog(`选择：${option.label}${raw.next ? ` → ${raw.next}` : " → 结束"}`, effectBefore);
      if (raw.next) enterSandboxNode(raw.next); else { els.previewOptions.replaceChildren(); els.previewOptions.appendChild(h("p", "help", "该分支没有下一节点。")); }
    });
    els.previewOptions.appendChild(button);
  });
  els.previewOptions.appendChild(h("p", "help", isWorldDialogue() ? (node.allowClose ? "可离开并返回地图。" : "此节点必须选择选项，不能直接关闭。") : "World 会在这里自动追加献祭身体与离开选项。"));
  if (JSON.stringify(before) !== JSON.stringify({ flags: sandboxState.flags, inventory: sandboxState.inventory })) appendSandboxLog(`进入节点：${nodeId}`, before);
}

function startSandbox() {
  try {
    const flags = JSON.parse(els.sandboxFlags.value || "{}"), inventory = JSON.parse(els.sandboxItems.value || "{}");
    if (!flags || Array.isArray(flags) || !inventory || Array.isArray(inventory)) throw new Error("Flags 和物品必须是 JSON 对象");
    const sacrificed = {}; els.sandboxSacrifices.querySelectorAll("input:checked").forEach((input) => { sacrificed[input.value] = true; });
    const extraContext = JSON.parse($("#sandboxContext").value || "{}");
    if (!extraContext || typeof extraContext !== "object" || Array.isArray(extraContext)) throw new Error("动态上下文必须是 JSON 对象");
    for (const key of Object.keys(extraContext)) if (!Runtime.catalog.templateKeys.includes(key)) throw new Error(`未知上下文变量：${key}`);
    sandboxState = { context: extraContext, location: window.WORLD_MAP_BUNDLE.map.nodes.find((n) => n.id === $("#sandboxLocation").value), day: Math.max(1, Math.min(5, Number(els.sandboxDay.value) || 1)), flags, inventory, sacrificed };
    els.sandboxLog.textContent = "尚未执行剧情。";
    const start = $("#sandboxEntry").value || Runtime.resolveStart(current(), sandboxContext()); appendSandboxLog(`入口判定：${start}`); enterSandboxNode(start);
  } catch (error) { els.sandboxLog.textContent = `状态错误：${error.message}`; }
}

async function initialize() {
  try {
    const [registry, worlds, battle] = await Promise.all([window.NpcDialogueData.ready, window.WorldDialogueData.ready, fetch("../battle-data/manifest.json", { cache: "no-store" }).then((response) => response.json()), window.ActionEventData.ready]);
    battleManifest = battle;
    for (const [kind, entries] of [["npc", registry], ["world", worlds]]) {
      for (const source of Object.values(entries)) { const dialogue = normalizeDialogue(clone(source)); dialogue.kind = kind; const key = documentKey(dialogue); documents[key] = dialogue; originalSnapshots[key] = JSON.stringify(dialogue); }
      try { const saved = JSON.parse(sessionStorage.getItem(`${kind}-editor-draft`) || "null");
        for (const [id, source] of Object.entries(saved?.documents || {})) if (source?.id === id) { const dialogue = normalizeDialogue(clone(source)); dialogue.kind = kind; if (!Runtime.validateDialogue(dialogue).errors.length) documents[documentKey(dialogue)] = dialogue; }
      } catch { showFeedback("部分草稿无法读取，已加载项目配置", true); }
    }
    const params = new URLSearchParams(location.search), requested = `${params.get("kind") || "world"}:${params.get("id")}`;
    const saved = sessionStorage.getItem("dialogue-editor-selection");
    selectNpc(documents[requested] ? requested : documents[saved] ? saved : Object.keys(documents)[0]);
    if (params.get("node") && current().nodes[params.get("node")]) { selectedNodeId = params.get("node"); renderAll(); }
    for (const n of window.WORLD_MAP_BUNDLE.map.nodes) { const option = h("option", "", `${n.label} · ${n.id}`); option.value = n.id; $("#sandboxLocation").appendChild(option); }
    els.app.classList.remove("is-loading");
  } catch (error) { els.dirty.textContent = "载入失败"; showFeedback(error.message, true); console.error(error); }
}

Runtime.catalog.itemIds.forEach((id) => { const option = document.createElement("option"); option.value = id; option.label = itemNames[id] || id; $("#itemIds").appendChild(option); });
Object.entries({ ...Runtime.catalog.actions, ...window.WorldDialogueCatalog.actions }).forEach(([id, name]) => { const option = document.createElement("option"); option.value = id; option.label = name; $("#actionIds").appendChild(option); });
Runtime.catalog.bodyParts.forEach((id) => { const label = h("label", ""); const input = document.createElement("input"); input.type = "checkbox"; input.value = id; label.append(input, document.createTextNode(bodyNames[id] || id)); els.sandboxSacrifices.appendChild(label); });

$("#dialogueKind").addEventListener("change", renderNpcSelect);
$("#dialogueSearch").addEventListener("input", renderNpcSelect);
els.npcSelect.addEventListener("change", () => { if (els.npcSelect.value) selectNpc(els.npcSelect.value); });
els.npcSettings.addEventListener("click", () => { selectedNodeId = null; selectedOptionIndex = null; linking = null; renderAll(); });
els.addNode.addEventListener("click", addNode); els.create.addEventListener("click", createNpc);
els.undo.addEventListener("click", () => restoreHistory(historyIndex - 1)); els.redo.addEventListener("click", () => restoreHistory(historyIndex + 1));
els.importButton.addEventListener("click", () => els.importFile.click()); els.importFile.addEventListener("change", () => { if (els.importFile.files[0]) importDialogue(els.importFile.files[0]); });
els.validate.addEventListener("click", showValidation); els.export.addEventListener("click", exportCurrent);
els.sandboxButton.addEventListener("click", () => { els.sandbox.classList.remove("is-hidden"); populateSandboxEntries(); startSandbox(); }); els.closeSandbox.addEventListener("click", () => els.sandbox.classList.add("is-hidden")); els.startSandbox.addEventListener("click", startSandbox);
els.sandbox.addEventListener("click", (event) => { if (event.target === els.sandbox) els.sandbox.classList.add("is-hidden"); });
els.graph.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest?.(".graph-node, .graph-edge-hit, .graph-edge")) return;
  event.preventDefault();
  try { els.graph.setPointerCapture(event.pointerId); } catch {}
  graphPan = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: graphOffset.x,
    offsetY: graphOffset.y,
  };
  els.graph.classList.add("is-panning");
}, { capture: true });
els.graph.addEventListener("selectstart", (event) => event.preventDefault());
document.addEventListener("pointermove", (event) => {
  if (!graphPan || graphPan.pointerId !== event.pointerId) return;
  event.preventDefault();
  graphOffset = {
    x: graphPan.offsetX + event.clientX - graphPan.startX,
    y: graphPan.offsetY + event.clientY - graphPan.startY,
  };
  applyGraphOffset();
});
document.addEventListener("pointermove", updateLinkDrag);
document.addEventListener("pointerup", finishLinkDrag);
document.addEventListener("pointercancel", (event) => {
  if (!linkDrag || linkDrag.pointerId !== event.pointerId) return;
  linkDrag.path.remove();
  linkDrag = null;
  renderEdges();
});
function stopGraphPan(event) {
  if (!graphPan || (event && graphPan.pointerId !== event.pointerId)) return;
  graphPan = null;
  els.graph.classList.remove("is-panning");
}
document.addEventListener("pointerup", stopGraphPan);
document.addEventListener("pointercancel", stopGraphPan);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { if (linkDrag) { linkDrag.path.remove(); linkDrag = null; } linking = null; els.sandbox.classList.add("is-hidden"); renderGraph(); } if (event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); restoreHistory(historyIndex - 1); } if (event.ctrlKey && event.key.toLowerCase() === "y") { event.preventDefault(); restoreHistory(historyIndex + 1); } });
window.addEventListener("beforeunload", (event) => {
  const dirty = Object.entries(documents).some(([id, dialogue]) => JSON.stringify(dialogue) !== originalSnapshots[id]);
  if (dirty) { event.preventDefault(); event.returnValue = ""; }
});

initialize();
