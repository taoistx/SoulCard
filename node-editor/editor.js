"use strict";

const Runtime = window.NPCDialogueRuntime;
const clone = (value) => JSON.parse(JSON.stringify(value));
const $ = (selector) => document.querySelector(selector);
const h = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const els = {
  app: $("#editorApp"), nodeList: $("#nodeList"), graph: $("#graphViewport"), graphNodes: $("#graphNodes"), graphEdges: $("#graphEdges"),
  inspector: $("#inspector"), inspectorKind: $("#inspectorKind"), selectionStatus: $("#selectionStatus"), feedback: $("#feedback"), dirty: $("#dirtyState"),
  mapSettings: $("#mapSettingsButton"), addNode: $("#addNodeButton"), deleteNode: $("#deleteNodeButton"), undo: $("#undoButton"), redo: $("#redoButton"),
  validate: $("#validateButton"), export: $("#exportButton"), npcIds: $("#npcIds"), enemyIds: $("#enemyIds"), nodeIds: $("#nodeIds"),
};

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const TYPE_LABELS = { start: "起点", npc: "NPC", enemy: "战斗", poi: "地点", wilderness: "荒野", random: "随机" };
const DEFAULT_ICONS = { start: "!", npc: "@", enemy: "X", poi: "#", wilderness: "?", random: "*" };
const LOCATION_IDS = ["hut", "gate", "church"];
const BODY_PARTS = Runtime?.catalog?.bodyParts || ["leftHand", "rightHand", "body", "head", "eye", "heart", "brain"];
const ITEM_IDS = Runtime?.catalog?.itemIds || ["freshFlesh", "oldKey", "healingPotion", "ritualScrap"];
const KNOWN_WORLD_FLAGS = [
  "eddieMet", "helpedChris", "foundSecretPath", "bellSpared",
  "eddieKilled", "chrisGone", "bellKilled", "guardKilled",
  "bridgeOpened", "searchedHouse", "dungAKilled", "dungBKilled",
  "becameDung", "escapedPlane", "restedDay2", "restedDay3", "restedDay4", "restedDay5",
];
const MIN_GRAPH_ZOOM = 0.45;
const MAX_GRAPH_ZOOM = 1.8;
const MAP_NODE_MARGIN = 46;

let bundle = null;
let map = null;
let npcManifest = null;
let battleManifest = null;
let selectedNodeId = null;
let selectedEdgeIndex = null;
let selectedRandomIndex = null;
let linkingEdgeIndex = null;
let drag = null;
let history = [];
let historyIndex = -1;
let cleanSnapshot = "";
let feedbackTimer = null;
let graphZoom = Number(sessionStorage.getItem("node-editor-graph-zoom")) || 1;
let graphPan = null;
let linkDrag = null;
let conditionClipboard = null;

function normalizeBundle(source) {
  const next = clone(source || {});
  next.schemaVersion = 2;
  next.map ||= {};
  next.map.meta ||= {};
  next.map.viewBox ||= { width: 1000, height: 680 };
  next.map.nodes = Array.isArray(next.map.nodes) ? next.map.nodes : [];
  next.map.edges = Array.isArray(next.map.edges) ? next.map.edges : [];
  next.map.editor ||= {};
  next.map.editor.positions ||= {};
  if (!next.map.nodes.length) next.map.nodes.push({ id: "start", type: "start", icon: "!", label: "起点", x: 120, y: 340 });
  next.map.nodes.forEach((node, index) => {
    node.id ||= uniqueId("node", next.map.nodes);
    node.type ||= index === 0 ? "start" : "wilderness";
    node.icon ||= DEFAULT_ICONS[node.type] || "?";
    node.label ||= node.id;
    node.x = Number.isFinite(node.x) ? node.x : 120 + index * 120;
    node.y = Number.isFinite(node.y) ? node.y : 340;
    next.map.editor.positions[node.id] = { x: node.x, y: node.y };
  });
  Object.keys(next.map.editor.positions).forEach((id) => {
    if (!next.map.nodes.some((node) => node.id === id)) delete next.map.editor.positions[id];
  });
  next.map.startNodeId ||= next.map.nodes[0].id;
  next.map.initialRevealed = Array.isArray(next.map.initialRevealed) ? next.map.initialRevealed : [next.map.startNodeId];
  return next;
}

function currentNode() {
  return map.nodes.find((node) => node.id === selectedNodeId) || null;
}

function currentEdge() {
  return Number.isInteger(selectedEdgeIndex) ? map.edges[selectedEdgeIndex] || null : null;
}

function currentRandomEntry() {
  const node = currentNode();
  return Number.isInteger(selectedRandomIndex) ? node?.random?.entries?.[selectedRandomIndex] || null : null;
}

function snapshot() {
  return JSON.stringify(bundle);
}

function persistDraft() {
  sessionStorage.setItem("node-editor-draft", snapshot());
}

function updateHistoryUi() {
  els.undo.disabled = historyIndex <= 0;
  els.redo.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
  const clean = snapshot() === cleanSnapshot;
  els.dirty.textContent = clean ? "已保存" : "未保存";
  els.dirty.classList.toggle("saved", clean);
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

function resetHistory() {
  history = [snapshot()];
  historyIndex = 0;
  cleanSnapshot = history[0];
  updateHistoryUi();
}

function restoreHistory(index) {
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  bundle = JSON.parse(history[index]);
  map = bundle.map;
  if (selectedNodeId && !map.nodes.some((node) => node.id === selectedNodeId)) selectedNodeId = null;
  if (selectedEdgeIndex !== null && !map.edges[selectedEdgeIndex]) selectedEdgeIndex = null;
  selectedRandomIndex = null;
  renderAll();
  updateHistoryUi();
}

function mutate(change, render = true) {
  change();
  recordHistory();
  if (render) renderAll();
}

function showFeedback(message, isError = false) {
  clearTimeout(feedbackTimer);
  els.feedback.textContent = message;
  els.feedback.classList.toggle("error", isError);
  feedbackTimer = setTimeout(() => { els.feedback.textContent = ""; els.feedback.classList.remove("error"); }, 4200);
}

function loadConditionClipboard() {
  if (conditionClipboard) return conditionClipboard;
  try {
    const saved = JSON.parse(sessionStorage.getItem("node-editor-condition-clipboard") || "null");
    if (saved?.mode && Array.isArray(saved.clauses)) conditionClipboard = saved;
  } catch {}
  return conditionClipboard;
}

function copyConditionGroup(value) {
  if (!value) return showFeedback("没有可复制的条件组", true);
  conditionClipboard = clone(value);
  sessionStorage.setItem("node-editor-condition-clipboard", JSON.stringify(conditionClipboard));
  showFeedback("已复制条件组");
}

function canPasteConditionGroup() {
  return Boolean(loadConditionClipboard());
}

function pastedConditionGroup() {
  const group = loadConditionClipboard();
  return group ? clone(group) : null;
}

function uniqueId(base, collection, field = "id") {
  let id = base.replace(/[^A-Za-z0-9_-]/g, "") || "node";
  if (!/^[A-Za-z]/.test(id)) id = `node${id}`;
  let next = id, suffix = 2;
  while (collection.some((item) => item[field] === next)) next = `${id}${suffix++}`;
  return next;
}

function makeInput(label, value, onChange, options = {}) {
  const wrapper = h("label", options.wide ? "wide" : "", label);
  const input = document.createElement(options.multiline ? "textarea" : "input");
  if (options.multiline) input.rows = options.rows || 4;
  else input.type = options.type || "text";
  input.value = value ?? "";
  if (options.list) input.setAttribute("list", options.list);
  input.addEventListener("change", () => onChange(options.type === "number" ? Number(input.value) : input.value));
  wrapper.appendChild(input);
  return wrapper;
}

function makeSelect(label, value, choices, onChange, options = {}) {
  const wrapper = h("label", options.wide ? "wide" : "", label);
  const select = document.createElement("select");
  choices.forEach(([id, name]) => {
    const option = h("option", "", name);
    option.value = id;
    option.selected = id === value;
    select.appendChild(option);
  });
  select.addEventListener("change", () => onChange(select.value));
  wrapper.appendChild(select);
  return wrapper;
}

function mapSize() {
  return {
    width: Number(map?.viewBox?.width) || 1000,
    height: Number(map?.viewBox?.height) || 680,
  };
}

function clampMapX(value) {
  const { width } = mapSize();
  return Math.round(Math.max(MAP_NODE_MARGIN, Math.min(width - MAP_NODE_MARGIN, Number(value) || MAP_NODE_MARGIN)));
}

function clampMapY(value) {
  const { height } = mapSize();
  return Math.round(Math.max(MAP_NODE_MARGIN, Math.min(height - MAP_NODE_MARGIN, Number(value) || MAP_NODE_MARGIN)));
}

function setNodeMapPosition(node, x, y) {
  node.x = clampMapX(x);
  node.y = clampMapY(y);
  syncEditorPosition(node);
}

function firstParentNode(node) {
  const edge = map.edges.find((item) => item.to === node.id);
  return edge ? map.nodes.find((item) => item.id === edge.from) || null : null;
}

function childSlot(parentId) {
  return parentId ? map.edges.filter((edge) => edge.from === parentId).length : map.nodes.length;
}

function mapPositionNear(parent) {
  if (!parent) {
    const { width, height } = mapSize();
    return {
      x: clampMapX(width * 0.5 + map.nodes.length * 18),
      y: clampMapY(height * 0.5 + map.nodes.length * 14),
    };
  }
  const offsets = [
    [170, 0],
    [150, 95],
    [150, -95],
    [230, 48],
    [230, -48],
    [95, 150],
    [95, -150],
  ];
  const slot = childSlot(parent.id);
  const [dx, dy] = offsets[slot % offsets.length];
  const ring = Math.floor(slot / offsets.length) * 54;
  return { x: clampMapX(parent.x + dx + ring), y: clampMapY(parent.y + dy) };
}

function optionSelect(value, choices, onChange) {
  const select = document.createElement("select");
  const normalized = [...new Set(choices.filter(Boolean))];
  if (value && !normalized.includes(value)) normalized.unshift(value);
  normalized.forEach((id) => {
    const option = h("option", "", id);
    option.value = id;
    option.selected = id === value;
    select.appendChild(option);
  });
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function collectFlagKeys(condition, target) {
  if (!condition?.clauses) return;
  condition.clauses.forEach((clause) => {
    if (clause?.source === "flag" && clause.key) target.add(clause.key);
  });
}

function knownFlagIds() {
  const flags = new Set(KNOWN_WORLD_FLAGS);
  if (!map) return [...flags].sort((a, b) => a.localeCompare(b));
  map.nodes.forEach((node) => {
    if (node.exploreFlag) flags.add(node.exploreFlag);
    if (node.type === "enemy") flags.add(`${node.battleSourceId || node.id}Killed`);
    collectFlagKeys(node.revealWhen, flags);
    (node.random?.entries || []).forEach((entry) => collectFlagKeys(entry.when, flags));
  });
  map.edges.forEach((edge) => {
    collectFlagKeys(edge.revealWhen, flags);
    collectFlagKeys(edge.activeWhen, flags);
  });
  return [...flags].sort((a, b) => a.localeCompare(b));
}

function defaultClause(source = "flag") {
  if (source === "day" || source === "sacrificedCount") return { source, operator: "eq", value: source === "day" ? 1 : 0 };
  if (source === "item") return { source, itemId: ITEM_IDS[0] || "healingPotion", operator: "has", amount: 1 };
  if (source === "sacrifice") return { source, partId: BODY_PARTS[0] || "head", operator: "sacrificed" };
  const flags = knownFlagIds();
  return { source: "flag", key: flags.includes("eddieMet") ? "eddieMet" : flags[0] || "storyFlag", operator: "exists" };
}

function conditionEditor(value, onChange, optional = true) {
  const root = h("div", "card");
  const actions = h("div", "condition-toolbar");
  const paste = h("button", "", "粘贴条件组");
  paste.type = "button";
  paste.disabled = !canPasteConditionGroup();
  paste.addEventListener("click", () => {
    const group = pastedConditionGroup();
    if (!group) return showFeedback("还没有复制过条件组", true);
    onChange(group);
  });
  if (!value) {
    root.appendChild(h("p", "subtle", "无条件：始终满足。"));
    const add = h("button", "", "添加条件组");
    add.type = "button";
    add.addEventListener("click", () => onChange({ mode: "all", clauses: [defaultClause()] }));
    actions.append(add, paste);
    root.appendChild(actions);
    return root;
  }
  const copy = h("button", "", "复制条件组");
  copy.type = "button";
  copy.addEventListener("click", () => {
    copyConditionGroup(value);
    renderAll();
  });
  actions.append(copy, paste);
  root.appendChild(actions);
  root.appendChild(makeSelect("组合方式", value.mode || "all", [["all", "全部满足（AND）"], ["any", "任一满足（OR）"]], (mode) => { value.mode = mode; onChange(value); }, { wide: true }));
  value.clauses ||= [];
  value.clauses.forEach((clause, index) => {
    const row = h("div", "condition-row");
    const source = document.createElement("select");
    [["flag", "Flag"], ["day", "天数"], ["sacrificedCount", "献祭数量"], ["item", "物品"], ["sacrifice", "身体部位"]].forEach(([id, name]) => {
      const option = h("option", "", name);
      option.value = id;
      option.selected = clause.source === id;
      source.appendChild(option);
    });
    source.addEventListener("change", () => { value.clauses[index] = defaultClause(source.value); onChange(value); });
    row.appendChild(source);
    const operators = clause.source === "flag" ? [["exists", "存在"], ["notExists", "不存在"], ["eq", "等于"], ["ne", "不等于"]]
      : clause.source === "item" ? [["has", "持有"], ["lacks", "不持有"]]
      : clause.source === "sacrifice" ? [["sacrificed", "已献祭"], ["intact", "完整"]]
      : [["eq", "="], ["ne", "!="], ["gte", ">="], ["lte", "<="]];
    const operator = document.createElement("select");
    operators.forEach(([id, name]) => {
      const option = h("option", "", name);
      option.value = id;
      option.selected = clause.operator === id;
      operator.appendChild(option);
    });
    operator.addEventListener("change", () => { clause.operator = operator.value; onChange(value); });
    row.appendChild(operator);
    let target;
    if (clause.source === "sacrifice") {
      target = optionSelect(clause.partId, BODY_PARTS, (partId) => { clause.partId = partId; onChange(value); });
    } else if (clause.source === "item") {
      target = optionSelect(clause.itemId, ITEM_IDS, (itemId) => { clause.itemId = itemId; onChange(value); });
    } else if (clause.source === "flag") {
      target = optionSelect(clause.key, knownFlagIds(), (key) => { clause.key = key; onChange(value); });
    } else {
      target = document.createElement("input");
      if (clause.source === "day" || clause.source === "sacrificedCount") {
        target.type = "number";
        target.value = clause.value ?? 0;
        target.addEventListener("change", () => { clause.value = Number(target.value); onChange(value); });
      } else {
        target.type = "text";
        target.value = "";
      }
    }
    row.appendChild(target);
    const remove = h("button", "danger", "X");
    remove.type = "button";
    remove.addEventListener("click", () => { value.clauses.splice(index, 1); onChange(value); });
    row.appendChild(remove);
    if (clause.source === "item") row.appendChild(makeInput("数量", clause.amount || 1, (amount) => { clause.amount = Math.max(1, amount || 1); onChange(value); }, { type: "number", wide: true }));
    if (clause.source === "flag" && ["eq", "ne"].includes(clause.operator)) {
      const rawValue = JSON.stringify(clause.value ?? true);
      const valueChoices = [["true", "true"], ["false", "false"]];
      if (!valueChoices.some(([id]) => id === rawValue)) valueChoices.unshift([rawValue, rawValue]);
      row.appendChild(makeSelect("比较值", rawValue, valueChoices, (raw) => { clause.value = JSON.parse(raw); onChange(value); }, { wide: true }));
    }
    root.appendChild(row);
  });
  const rowActions = h("div", "row-actions");
  const add = h("button", "", "添加条件");
  add.type = "button";
  add.addEventListener("click", () => { value.clauses.push(defaultClause()); onChange(value); });
  rowActions.appendChild(add);
  if (optional) {
    const clear = h("button", "danger", "清除条件组");
    clear.type = "button";
    clear.addEventListener("click", () => onChange(null));
    rowActions.appendChild(clear);
  }
  root.appendChild(rowActions);
  return root;
}

function setNodeType(node, type) {
  node.type = type;
  node.icon = DEFAULT_ICONS[type] || "?";
  delete node.npcId;
  delete node.enemyId;
  delete node.battleSourceId;
  delete node.locationId;
  delete node.random;
  if (type === "npc") node.npcId = Object.keys(npcManifest?.dialogues || {})[0] || "eddie";
  if (type === "enemy") node.enemyId = Object.keys(battleManifest?.combatants || {})[0] || "dungling";
  if (type === "poi") node.locationId = LOCATION_IDS[0];
  if (type === "wilderness") {
    node.exploreTitle ||= node.label;
    node.exploreText ||= "粪雾退开了一些，新的节点在远处显形。";
    node.exploreFlag ||= `explored${node.id[0].toUpperCase()}${node.id.slice(1)}`;
  }
  if (type === "random") node.random = { policy: "dailyFirstEnter", emptyTitle: "空无一人", emptyText: "今天这里没有遇到任何人。", entries: [] };
}

function renderMapInspector() {
  els.inspectorKind.textContent = "地图";
  els.inspector.appendChild(h("h3", "", "地图设置"));
  const fields = h("div", "field-grid");
  fields.appendChild(makeInput("区域眉题", map.meta?.eyebrow || "", (value) => mutate(() => { map.meta ||= {}; map.meta.eyebrow = value; })));
  fields.appendChild(makeInput("地图标题", map.meta?.title || "", (value) => mutate(() => { map.meta ||= {}; map.meta.title = value; })));
  fields.appendChild(makeInput("画布宽", map.viewBox?.width || 1000, (value) => mutate(() => { map.viewBox ||= {}; map.viewBox.width = Math.max(320, value || 1000); }), { type: "number" }));
  fields.appendChild(makeInput("画布高", map.viewBox?.height || 680, (value) => mutate(() => { map.viewBox ||= {}; map.viewBox.height = Math.max(240, value || 680); }), { type: "number" }));
  fields.appendChild(makeSelect("起点", map.startNodeId, map.nodes.map((node) => [node.id, node.id]), (value) => mutate(() => { map.startNodeId = value; if (!map.initialRevealed.includes(value)) map.initialRevealed.push(value); }), { wide: true }));
  els.inspector.appendChild(fields);
  els.inspector.appendChild(h("h4", "", "初始点亮节点"));
  const card = h("div", "card");
  map.nodes.forEach((node) => {
    const label = h("label", "");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = map.initialRevealed.includes(node.id);
    input.style.width = "auto";
    input.addEventListener("change", () => mutate(() => {
      if (input.checked && !map.initialRevealed.includes(node.id)) map.initialRevealed.push(node.id);
      if (!input.checked) map.initialRevealed = map.initialRevealed.filter((id) => id !== node.id);
      if (!map.initialRevealed.includes(map.startNodeId)) map.initialRevealed.unshift(map.startNodeId);
    }));
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "7px";
    label.append(input, document.createTextNode(`${node.label} · ${node.id}`));
    card.appendChild(label);
  });
  els.inspector.appendChild(card);
}

function renderNodeInspector() {
  const node = currentNode();
  if (!node) return renderMapInspector();
  els.inspectorKind.textContent = "节点";
  els.inspector.appendChild(h("h3", "", node.label || node.id));
  const fields = h("div", "field-grid");
  fields.appendChild(makeInput("节点 ID", node.id, (value) => renameNode(node.id, value)));
  fields.appendChild(makeSelect("类型", node.type, Object.entries(TYPE_LABELS), (value) => mutate(() => setNodeType(node, value))));
  fields.appendChild(makeInput("显示名", node.label, (value) => mutate(() => { node.label = value; })));
  fields.appendChild(makeInput("图标", node.icon, (value) => mutate(() => { node.icon = value || DEFAULT_ICONS[node.type] || "?"; })));
  fields.appendChild(makeInput("游戏 X", node.x, (value) => mutate(() => setNodeMapPosition(node, value, node.y)), { type: "number" }));
  fields.appendChild(makeInput("游戏 Y", node.y, (value) => mutate(() => setNodeMapPosition(node, node.x, value)), { type: "number" }));
  fields.appendChild(makeInput("描述", node.description || "", (value) => mutate(() => { if (value) node.description = value; else delete node.description; }), { multiline: true, rows: 3, wide: true }));
  els.inspector.appendChild(fields);
  renderCoordinateTools(node);
  renderTypeFields(node);
  els.inspector.appendChild(h("h4", "", "显示条件 revealWhen"));
  els.inspector.appendChild(conditionEditor(node.revealWhen, (group) => mutate(() => { if (group) node.revealWhen = group; else delete node.revealWhen; })));
  renderNodeChildren(node);
}

function renderCoordinateTools(node) {
  const parent = firstParentNode(node);
  const card = h("div", "card");
  card.appendChild(h("p", "subtle", `节点图坐标和游戏运行坐标一致。拖动图中的圆点会直接修改游戏 X/Y；圆点中心就是节点坐标。`));
  const actions = h("div", "row-actions");
  if (parent) {
    const placeNearParent = h("button", "", "放到父节点旁");
    placeNearParent.type = "button";
    placeNearParent.addEventListener("click", () => mutate(() => {
      const pos = mapPositionNear(parent);
      setNodeMapPosition(node, pos.x, pos.y);
    }));
    actions.appendChild(placeNearParent);
  }
  if (actions.children.length) card.appendChild(actions);
  els.inspector.appendChild(card);
}

function renderTypeFields(node) {
  const fields = h("div", "field-grid");
  if (node.type === "npc") fields.appendChild(makeInput("NPC ID", node.npcId || "", (value) => mutate(() => { node.npcId = value; }), { list: "npcIds", wide: true }));
  if (node.type === "enemy") {
    fields.appendChild(makeInput("敌人 ID", node.enemyId || "", (value) => mutate(() => { node.enemyId = value; }), { list: "enemyIds" }));
    fields.appendChild(makeInput("战斗来源 ID", node.battleSourceId || "", (value) => mutate(() => { if (value) node.battleSourceId = value; else delete node.battleSourceId; })));
  }
  if (node.type === "poi") fields.appendChild(makeSelect("地点 ID", node.locationId || LOCATION_IDS[0], LOCATION_IDS.map((id) => [id, id]), (value) => mutate(() => { node.locationId = value; }), { wide: true }));
  if (node.type === "wilderness") {
    fields.appendChild(makeInput("探索标题", node.exploreTitle || "", (value) => mutate(() => { node.exploreTitle = value; })));
    fields.appendChild(makeInput("探索 Flag", node.exploreFlag || "", (value) => mutate(() => { node.exploreFlag = value; })));
    fields.appendChild(makeInput("探索文本", node.exploreText || "", (value) => mutate(() => { node.exploreText = value; }), { multiline: true, rows: 3, wide: true }));
  }
  if (fields.children.length) els.inspector.appendChild(fields);
  if (node.type === "random") renderRandomEditor(node);
}

function renderRandomEditor(node) {
  node.random ||= { policy: "dailyFirstEnter", entries: [] };
  node.random.entries ||= [];
  els.inspector.appendChild(h("h4", "", "随机节点"));
  const fields = h("div", "field-grid");
  fields.appendChild(makeSelect("策略", node.random.policy || "dailyFirstEnter", [["dailyFirstEnter", "每天首次进入锁定"]], (value) => mutate(() => { node.random.policy = value; }), { wide: true }));
  fields.appendChild(makeInput("空结果标题", node.random.emptyTitle || "", (value) => mutate(() => { node.random.emptyTitle = value; })));
  fields.appendChild(makeInput("空结果文本", node.random.emptyText || "", (value) => mutate(() => { node.random.emptyText = value; }), { multiline: true, rows: 3, wide: true }));
  els.inspector.appendChild(fields);
  node.random.entries.forEach((entry, index) => {
    const button = h("button", `option-summary${selectedRandomIndex === index ? " active" : ""}`);
    button.type = "button";
    button.append(h("span", "", `${entry.id} · ${entry.type}`), h("small", "", `权重 ${entry.weight}`));
    button.addEventListener("click", () => { selectedRandomIndex = index; selectedEdgeIndex = null; renderAll(); });
    els.inspector.appendChild(button);
  });
  const actions = h("div", "row-actions");
  const addNpc = h("button", "", "添加 NPC");
  addNpc.type = "button";
  addNpc.addEventListener("click", () => mutate(() => addRandomEntry(node, "npc")));
  const addBattle = h("button", "", "添加战斗");
  addBattle.type = "button";
  addBattle.addEventListener("click", () => mutate(() => addRandomEntry(node, "battle")));
  const addEmpty = h("button", "", "添加空结果");
  addEmpty.type = "button";
  addEmpty.addEventListener("click", () => mutate(() => addRandomEntry(node, "empty")));
  actions.append(addNpc, addBattle, addEmpty);
  els.inspector.appendChild(actions);
}

function addRandomEntry(node, type) {
  node.random ||= { policy: "dailyFirstEnter", entries: [] };
  node.random.entries ||= [];
  const id = uniqueId(type, node.random.entries);
  const entry = { id, type, weight: 1 };
  if (type === "npc") entry.npcId = Object.keys(npcManifest?.dialogues || {})[0] || "eddie";
  if (type === "battle") {
    entry.enemyId = Object.keys(battleManifest?.combatants || {})[0] || "dungling";
    entry.battleSourceId = `${node.id}_${id}`;
  }
  if (type === "empty") {
    entry.title = "无人";
    entry.text = "今天这里没有遇到任何人。";
  }
  node.random.entries.push(entry);
  selectedRandomIndex = node.random.entries.length - 1;
}

function renderRandomEntryInspector() {
  const node = currentNode();
  const entry = currentRandomEntry();
  if (!node || !entry) return renderNodeInspector();
  els.inspectorKind.textContent = "随机项";
  els.inspector.appendChild(h("h3", "", entry.id));
  const fields = h("div", "field-grid");
  fields.appendChild(makeInput("随机项 ID", entry.id, (value) => mutate(() => {
    if (!ID_PATTERN.test(value) || node.random.entries.some((item, index) => index !== selectedRandomIndex && item.id === value)) return showFeedback("随机项 ID 无效或重复", true);
    entry.id = value;
  })));
  fields.appendChild(makeInput("权重", entry.weight, (value) => mutate(() => { entry.weight = Math.max(1, value || 1); }), { type: "number" }));
  fields.appendChild(makeSelect("类型", entry.type, [["npc", "NPC"], ["battle", "战斗"], ["empty", "空结果"]], (value) => mutate(() => {
    const next = { id: entry.id, type: value, weight: entry.weight || 1, when: entry.when || null };
    if (value === "npc") next.npcId = Object.keys(npcManifest?.dialogues || {})[0] || "eddie";
    if (value === "battle") { next.enemyId = Object.keys(battleManifest?.combatants || {})[0] || "dungling"; next.battleSourceId = `${node.id}_${entry.id}`; }
    if (value === "empty") { next.title = "无人"; next.text = "今天这里没有遇到任何人。"; }
    node.random.entries[selectedRandomIndex] = next;
  }), { wide: true }));
  if (entry.type === "npc") fields.appendChild(makeInput("NPC ID", entry.npcId || "", (value) => mutate(() => { entry.npcId = value; }), { list: "npcIds", wide: true }));
  if (entry.type === "battle") {
    fields.appendChild(makeInput("敌人 ID", entry.enemyId || "", (value) => mutate(() => { entry.enemyId = value; }), { list: "enemyIds" }));
    fields.appendChild(makeInput("来源 ID", entry.battleSourceId || "", (value) => mutate(() => { if (value) entry.battleSourceId = value; else delete entry.battleSourceId; })));
    fields.appendChild(makeInput("遭遇标题", entry.title || "", (value) => mutate(() => { if (value) entry.title = value; else delete entry.title; }), { wide: true }));
    fields.appendChild(makeInput("遭遇文本", entry.text || "", (value) => mutate(() => { if (value) entry.text = value; else delete entry.text; }), { multiline: true, rows: 3, wide: true }));
  }
  if (entry.type === "empty") {
    fields.appendChild(makeInput("标题", entry.title || "", (value) => mutate(() => { entry.title = value; })));
    fields.appendChild(makeInput("文本", entry.text || "", (value) => mutate(() => { entry.text = value; }), { multiline: true, rows: 3, wide: true }));
  }
  els.inspector.appendChild(fields);
  els.inspector.appendChild(h("h4", "", "出现条件 when"));
  els.inspector.appendChild(conditionEditor(entry.when, (group) => mutate(() => { if (group) entry.when = group; else delete entry.when; })));
  const actions = h("div", "row-actions");
  const back = h("button", "", "返回节点");
  back.type = "button";
  back.addEventListener("click", () => { selectedRandomIndex = null; renderAll(); });
  const remove = h("button", "danger", "删除随机项");
  remove.type = "button";
  remove.addEventListener("click", () => mutate(() => { node.random.entries.splice(selectedRandomIndex, 1); selectedRandomIndex = null; }));
  actions.append(back, remove);
  els.inspector.appendChild(actions);
}

function renderNodeChildren(node) {
  els.inspector.appendChild(h("h4", "", "子节点"));
  const outgoing = map.edges.map((edge, index) => ({ edge, index })).filter(({ edge }) => edge.from === node.id);
  outgoing.forEach(({ edge, index }) => {
    const target = map.nodes.find((item) => item.id === edge.to);
    const button = h("button", `option-summary${selectedEdgeIndex === index ? " active" : ""}`);
    button.type = "button";
    button.append(h("span", "", target ? target.label : edge.to), h("small", "", edge.activeWhen ? "条件通路" : "通路"));
    button.addEventListener("click", () => { selectedEdgeIndex = index; selectedRandomIndex = null; renderAll(); });
    els.inspector.appendChild(button);
  });
  const actions = h("div", "row-actions");
  const add = h("button", "", "添加子节点");
  add.type = "button";
  add.addEventListener("click", () => mutate(() => {
    const target = map.nodes.find((item) => item.id !== node.id) || node;
    map.edges.push({ from: node.id, to: target.id });
    selectedEdgeIndex = map.edges.length - 1;
  }));
  actions.appendChild(add);
  els.inspector.appendChild(actions);
}

function renderEdgeInspector() {
  const edge = currentEdge();
  if (!edge) return renderNodeInspector();
  els.inspectorKind.textContent = "子节点";
  els.inspector.appendChild(h("h3", "", `${edge.from} -> ${edge.to}`));
  const fields = h("div", "field-grid");
  fields.appendChild(makeSelect("来源", edge.from, map.nodes.map((node) => [node.id, node.id]), (value) => mutate(() => { edge.from = value; selectedNodeId = value; }), { wide: true }));
  fields.appendChild(makeSelect("目标子节点", edge.to, map.nodes.map((node) => [node.id, `${node.label} · ${node.id}`]), (value) => mutate(() => { edge.to = value; }), { wide: true }));
  fields.appendChild(makeInput("编辑备注", edge.note || "", (value) => mutate(() => { if (value) edge.note = value; else delete edge.note; }), { wide: true }));
  els.inspector.appendChild(fields);
  els.inspector.appendChild(h("h4", "", "显示条件 revealWhen"));
  els.inspector.appendChild(conditionEditor(edge.revealWhen, (group) => mutate(() => { if (group) edge.revealWhen = group; else delete edge.revealWhen; })));
  els.inspector.appendChild(h("h4", "", "通行条件 activeWhen"));
  els.inspector.appendChild(conditionEditor(edge.activeWhen, (group) => mutate(() => { if (group) edge.activeWhen = group; else delete edge.activeWhen; })));
  const actions = h("div", "row-actions");
  const remove = h("button", "danger", "删除子节点连线");
  remove.type = "button";
  remove.addEventListener("click", () => mutate(() => { map.edges.splice(selectedEdgeIndex, 1); selectedEdgeIndex = null; }));
  actions.append(remove);
  els.inspector.appendChild(h("p", "subtle", "也可以在图中拖动连线终点重连；拖到空白处会断开。"));
  els.inspector.appendChild(actions);
}

function renderInspector() {
  els.inspector.replaceChildren();
  if (selectedRandomIndex !== null) return renderRandomEntryInspector();
  if (selectedEdgeIndex !== null) return renderEdgeInspector();
  if (selectedNodeId) return renderNodeInspector();
  renderMapInspector();
}

function nodePosition(node) {
  return { x: clampMapX(node.x), y: clampMapY(node.y) };
}

function syncEditorPosition(node) {
  map.editor ||= {};
  map.editor.positions ||= {};
  map.editor.positions[node.id] = { x: node.x, y: node.y };
}

function graphPoint(node) {
  const pos = nodePosition(node);
  return { x: pos.x * graphZoom, y: pos.y * graphZoom };
}

function edgePoints(from, to) {
  const fromPos = graphPoint(from), toPos = graphPoint(to);
  return {
    x1: fromPos.x,
    y1: fromPos.y,
    x2: toPos.x,
    y2: toPos.y,
  };
}

function graphPointerPoint(event) {
  const rect = els.graph.getBoundingClientRect();
  return {
    x: els.graph.scrollLeft + event.clientX - rect.left,
    y: els.graph.scrollTop + event.clientY - rect.top,
  };
}

function edgePathData(points) {
  return `M ${points.x1} ${points.y1} C ${points.x1 + 80 * graphZoom} ${points.y1}, ${points.x2 - 80 * graphZoom} ${points.y2}, ${points.x2} ${points.y2}`;
}

function edgeMidpoint(points) {
  return {
    x: (points.x1 + points.x2) / 2,
    y: (points.y1 + points.y2) / 2,
  };
}

function disconnectEdge(index) {
  mutate(() => {
    map.edges.splice(index, 1);
    selectedEdgeIndex = null;
    selectedRandomIndex = null;
  });
  showFeedback("已断开连线");
}

function nodeFromPointer(event) {
  return document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".graph-node")?.dataset?.nodeId || null;
}

function hasEdge(fromId, toId, exceptIndex = null) {
  return map.edges.some((edge, index) => index !== exceptIndex && edge.from === fromId && edge.to === toId);
}

function startLinkDrag(event, options) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture(event.pointerId);
  const from = map.nodes.find((node) => node.id === options.fromId);
  if (!from) return;
  const start = graphPoint(from);
  linkDrag = {
    ...options,
    pointerId: event.pointerId,
    x1: start.x,
    y1: start.y,
    path: document.createElementNS("http://www.w3.org/2000/svg", "path"),
  };
  linkDrag.path.setAttribute("class", "graph-edge draft");
  const pointer = graphPointerPoint(event);
  linkDrag.path.setAttribute("d", edgePathData({ x1: linkDrag.x1, y1: linkDrag.y1, x2: pointer.x, y2: pointer.y }));
  els.graphEdges.appendChild(linkDrag.path);
}

function updateLinkDrag(event) {
  if (!linkDrag || linkDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const pointer = graphPointerPoint(event);
  linkDrag.path.setAttribute("d", edgePathData({ x1: linkDrag.x1, y1: linkDrag.y1, x2: pointer.x, y2: pointer.y }));
}

function finishLinkDrag(event) {
  if (!linkDrag || linkDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const dragState = linkDrag;
  linkDrag.path.remove();
  linkDrag = null;
  const toId = nodeFromPointer(event);
  if (dragState.mode === "create") {
    if (!toId || toId === dragState.fromId) return renderEdges();
    if (hasEdge(dragState.fromId, toId)) {
      showFeedback("这两个节点已经连接", true);
      return renderEdges();
    }
    mutate(() => {
      map.edges.push({ from: dragState.fromId, to: toId });
      selectedNodeId = dragState.fromId;
      selectedEdgeIndex = map.edges.length - 1;
      selectedRandomIndex = null;
    });
    return;
  }
  if (dragState.mode === "retarget") {
    const edge = map.edges[dragState.edgeIndex];
    if (!edge) return renderEdges();
    if (!toId) {
      mutate(() => {
        map.edges.splice(dragState.edgeIndex, 1);
        selectedEdgeIndex = null;
      });
      return;
    }
    if (toId === edge.from) {
      showFeedback("子节点不能连接自身", true);
      return renderEdges();
    }
    if (hasEdge(edge.from, toId, dragState.edgeIndex)) {
      showFeedback("这两个节点已经连接", true);
      return renderEdges();
    }
    mutate(() => {
      edge.to = toId;
      selectedNodeId = edge.from;
      selectedEdgeIndex = dragState.edgeIndex;
      selectedRandomIndex = null;
    });
  }
}

function clampGraphZoom(value) {
  return Math.max(MIN_GRAPH_ZOOM, Math.min(MAX_GRAPH_ZOOM, value));
}

function applyGraphZoom() {
  graphZoom = clampGraphZoom(graphZoom);
  sessionStorage.setItem("node-editor-graph-zoom", String(graphZoom));
  const { width: mapWidth, height: mapHeight } = mapSize();
  const width = `${mapWidth * graphZoom}px`;
  const height = `${mapHeight * graphZoom}px`;
  els.graphNodes.style.width = width;
  els.graphNodes.style.height = height;
  els.graphEdges.style.width = width;
  els.graphEdges.style.height = height;
  els.graph.style.backgroundSize = `${24 * graphZoom}px ${24 * graphZoom}px`;
}

function zoomGraphAt(nextZoom, clientX, clientY) {
  const oldZoom = graphZoom;
  const rect = els.graph.getBoundingClientRect();
  const anchorX = (els.graph.scrollLeft + clientX - rect.left) / oldZoom;
  const anchorY = (els.graph.scrollTop + clientY - rect.top) / oldZoom;
  graphZoom = clampGraphZoom(nextZoom);
  applyGraphZoom();
  renderGraph();
  els.graph.scrollLeft = anchorX * graphZoom - (clientX - rect.left);
  els.graph.scrollTop = anchorY * graphZoom - (clientY - rect.top);
}

function renderEdges() {
  els.graphEdges.replaceChildren();
  map.edges.forEach((edge, index) => {
    const from = map.nodes.find((node) => node.id === edge.from);
    const to = map.nodes.find((node) => node.id === edge.to);
    if (!from || !to) return;
    const points = edgePoints(from, to);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", edgePathData(points));
    path.setAttribute("class", `graph-edge${selectedEdgeIndex === index ? " selected" : ""}${edge.activeWhen ? " locked" : ""}`);
    els.graphEdges.appendChild(path);
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hit.setAttribute("d", edgePathData(points));
    hit.setAttribute("class", "graph-edge-hit");
    hit.addEventListener("click", (event) => {
      if (event.detail >= 2) {
        event.preventDefault();
        disconnectEdge(index);
        return;
      }
      selectedNodeId = edge.from;
      selectedEdgeIndex = index;
      selectedRandomIndex = null;
      renderAll();
    });
    hit.addEventListener("dblclick", (event) => {
      event.preventDefault();
      disconnectEdge(index);
    });
    els.graphEdges.appendChild(hit);
    const mid = edgeMidpoint(points);
    const breaker = document.createElementNS("http://www.w3.org/2000/svg", "g");
    breaker.setAttribute("class", "edge-breaker");
    breaker.setAttribute("transform", `translate(${mid.x} ${mid.y})`);
    breaker.setAttribute("role", "button");
    breaker.setAttribute("aria-label", `断开 ${edge.from} 到 ${edge.to}`);
    const breakerCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    breakerCircle.setAttribute("r", 8 * graphZoom);
    const breakerText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    breakerText.setAttribute("text-anchor", "middle");
    breakerText.setAttribute("dominant-baseline", "central");
    breakerText.textContent = "×";
    breaker.append(breakerCircle, breakerText);
    breaker.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    breaker.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      disconnectEdge(index);
    });
    els.graphEdges.appendChild(breaker);
    const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    handle.setAttribute("class", "edge-end-handle");
    handle.setAttribute("cx", points.x2);
    handle.setAttribute("cy", points.y2);
    handle.setAttribute("r", 6 * graphZoom);
    handle.addEventListener("pointerdown", (event) => startLinkDrag(event, { mode: "retarget", fromId: edge.from, edgeIndex: index }));
    els.graphEdges.appendChild(handle);
  });
}

function renderGraph() {
  applyGraphZoom();
  els.graphNodes.replaceChildren();
  if (!map.nodes.length) {
    els.graphNodes.appendChild(h("p", "graph-empty", "创建一个节点开始编写地图。"));
    return;
  }
  map.nodes.forEach((node) => {
    const pos = graphPoint(node);
    const card = h("article", `graph-node ${node.type}${selectedNodeId === node.id ? " selected" : ""}`);
    card.dataset.nodeId = node.id;
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;
    card.style.transform = `scale(${graphZoom})`;
    card.style.transformOrigin = "0 0";
    const dot = h("span", "node-dot", node.icon || "?");
    const label = h("strong", "node-label", node.label || node.id);
    card.append(dot, label);
    const port = h("i", "port");
    port.title = "拖到另一个节点创建子节点连线";
    port.addEventListener("pointerdown", (event) => startLinkDrag(event, { mode: "create", fromId: node.id }));
    card.appendChild(port);
    card.addEventListener("click", () => {
      selectedNodeId = node.id;
      selectedEdgeIndex = null;
      selectedRandomIndex = null;
      renderAll();
    });
    card.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest?.(".port")) return;
      event.stopPropagation();
      card.setPointerCapture(event.pointerId);
      const original = nodePosition(node);
      drag = { node, startX: event.clientX, startY: event.clientY, originalX: original.x, originalY: original.y, moved: false, element: card };
    });
    card.addEventListener("pointermove", (event) => {
      if (!drag || drag.node !== node) return;
      const nextX = clampMapX(drag.originalX + (event.clientX - drag.startX) / graphZoom);
      const nextY = clampMapY(drag.originalY + (event.clientY - drag.startY) / graphZoom);
      setNodeMapPosition(node, nextX, nextY);
      syncEditorPosition(node);
      drag.moved = true;
      card.style.left = `${nextX * graphZoom}px`;
      card.style.top = `${nextY * graphZoom}px`;
      renderEdges();
    });
    card.addEventListener("pointerup", () => {
      if (drag?.moved) recordHistory();
      drag = null;
    });
    els.graphNodes.appendChild(card);
  });
  renderEdges();
}

function renderNodeList() {
  els.nodeList.replaceChildren();
  map.nodes.forEach((node) => {
    const button = h("button", selectedNodeId === node.id ? "active" : "");
    button.type = "button";
    button.append(h("span", "", node.label || node.id), h("small", "", TYPE_LABELS[node.type] || node.type));
    button.addEventListener("click", () => { selectedNodeId = node.id; selectedEdgeIndex = null; selectedRandomIndex = null; linkingEdgeIndex = null; renderAll(); });
    els.nodeList.appendChild(button);
  });
}

function renderDatalists() {
  els.npcIds.replaceChildren();
  Object.keys(npcManifest?.dialogues || {}).forEach((id) => {
    const option = document.createElement("option");
    option.value = id;
    els.npcIds.appendChild(option);
  });
  els.enemyIds.replaceChildren();
  Object.keys(battleManifest?.combatants || {}).forEach((id) => {
    const option = document.createElement("option");
    option.value = id;
    els.enemyIds.appendChild(option);
  });
  els.nodeIds.replaceChildren();
  map.nodes.forEach((node) => {
    const option = document.createElement("option");
    option.value = node.id;
    option.label = node.label;
    els.nodeIds.appendChild(option);
  });
}

function renderAll() {
  renderDatalists();
  renderNodeList();
  renderGraph();
  renderInspector();
  const edge = currentEdge();
  const random = currentRandomEntry();
  els.selectionStatus.textContent = random ? `${selectedNodeId} / 随机项 ${random.id}` : edge ? `${edge.from} -> ${edge.to}` : selectedNodeId || "地图设置";
  updateHistoryUi();
}

function addNode() {
  mutate(() => {
    const id = uniqueId("node", map.nodes);
    const parent = currentNode();
    const gamePos = mapPositionNear(parent);
    map.nodes.push({ id, type: "wilderness", icon: "?", label: "新节点", x: gamePos.x, y: gamePos.y, description: "" });
    map.editor ||= {};
    map.editor.positions ||= {};
    map.editor.positions[id] = gamePos;
    selectedNodeId = id;
    selectedEdgeIndex = null;
    selectedRandomIndex = null;
  });
}

function deleteSelectedNode() {
  const node = currentNode();
  if (!node) return showFeedback("先选择一个节点", true);
  if (node.id === map.startNodeId) return showFeedback("不能删除起点节点", true);
  mutate(() => {
    map.nodes = map.nodes.filter((item) => item.id !== node.id);
    map.edges = map.edges.filter((edge) => edge.from !== node.id && edge.to !== node.id);
    map.initialRevealed = map.initialRevealed.filter((id) => id !== node.id);
    delete map.editor?.positions?.[node.id];
    selectedNodeId = null;
    selectedEdgeIndex = null;
    selectedRandomIndex = null;
  });
}

function renameNode(oldId, nextId) {
  if (oldId === nextId) return;
  if (!ID_PATTERN.test(nextId) || map.nodes.some((node) => node.id === nextId)) return showFeedback("节点 ID 无效或已经存在", true);
  mutate(() => {
    const node = map.nodes.find((item) => item.id === oldId);
    node.id = nextId;
    if (map.editor?.positions?.[oldId]) {
      map.editor.positions[nextId] = map.editor.positions[oldId];
      delete map.editor.positions[oldId];
    }
    if (map.startNodeId === oldId) map.startNodeId = nextId;
    map.initialRevealed = map.initialRevealed.map((id) => id === oldId ? nextId : id);
    map.edges.forEach((edge) => {
      if (edge.from === oldId) edge.from = nextId;
      if (edge.to === oldId) edge.to = nextId;
    });
    selectedNodeId = nextId;
  });
}

function validateCondition(group, field, errors) {
  if (!group) return;
  if (!group || !["all", "any"].includes(group.mode) || !Array.isArray(group.clauses)) {
    errors.push(`${field} 条件组无效`);
    return;
  }
  group.clauses.forEach((clause, index) => {
    const path = `${field}.clauses[${index}]`;
    if (!clause || typeof clause !== "object") errors.push(`${path} 必须是对象`);
    else if (clause.source === "flag" && (!clause.key || !["exists", "notExists", "eq", "ne"].includes(clause.operator))) errors.push(`${path} Flag 条件无效`);
    else if (clause.source === "item" && (!clause.itemId || !["has", "lacks"].includes(clause.operator))) errors.push(`${path} 物品条件无效`);
    else if (clause.source === "sacrifice" && (!clause.partId || !["sacrificed", "intact"].includes(clause.operator))) errors.push(`${path} 献祭条件无效`);
    else if ((clause.source === "day" || clause.source === "sacrificedCount") && (!["eq", "ne", "gte", "lte"].includes(clause.operator) || !Number.isFinite(clause.value))) errors.push(`${path} 数值条件无效`);
    else if (!["flag", "item", "sacrifice", "day", "sacrificedCount"].includes(clause.source)) errors.push(`${path} 条件来源未知`);
  });
}

function validationResult() {
  const errors = [], warnings = [];
  const nodeIds = new Set();
  const npcIds = new Set(Object.keys(npcManifest?.dialogues || {}));
  const enemyIds = new Set(Object.keys(battleManifest?.combatants || {}));
  const { width, height } = mapSize();
  if (!map.nodes.length) errors.push("地图至少需要一个节点");
  map.nodes.forEach((node) => {
    if (!ID_PATTERN.test(node.id)) errors.push(`节点 ID 无效：${node.id}`);
    if (nodeIds.has(node.id)) errors.push(`节点 ID 重复：${node.id}`);
    nodeIds.add(node.id);
    if (!TYPE_LABELS[node.type]) errors.push(`节点 ${node.id} 类型无效`);
    if (!node.label) errors.push(`节点 ${node.id} 缺少显示名`);
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) errors.push(`节点 ${node.id} 坐标无效`);
    else if (node.x < 0 || node.x > width || node.y < 0 || node.y > height) errors.push(`节点 ${node.id} 坐标超出游戏地图范围`);
    if (node.type === "npc" && !node.npcId) errors.push(`NPC 节点 ${node.id} 缺少 npcId`);
    if (node.type === "npc" && node.npcId && !npcIds.has(node.npcId)) warnings.push(`NPC 节点 ${node.id} 引用了未登记 NPC：${node.npcId}`);
    if (node.type === "enemy" && !node.enemyId) errors.push(`战斗节点 ${node.id} 缺少 enemyId`);
    if (node.type === "enemy" && node.enemyId && !enemyIds.has(node.enemyId)) warnings.push(`战斗节点 ${node.id} 引用了未登记敌人：${node.enemyId}`);
    if (node.type === "poi" && !node.locationId) errors.push(`地点节点 ${node.id} 缺少 locationId`);
    validateCondition(node.revealWhen, `${node.id}.revealWhen`, errors);
    validateRandomNode(node, npcIds, enemyIds, errors, warnings);
  });
  if (!nodeIds.has(map.startNodeId)) errors.push("startNodeId 必须指向现有节点");
  (map.initialRevealed || []).forEach((id) => { if (!nodeIds.has(id)) errors.push(`initialRevealed 指向未知节点：${id}`); });
  map.edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.from)) errors.push(`edges[${index}].from 指向未知节点`);
    if (!nodeIds.has(edge.to)) errors.push(`edges[${index}].to 指向未知节点`);
    if (edge.from === edge.to) errors.push(`edges[${index}] 不能连接自身`);
    validateCondition(edge.revealWhen, `edges[${index}].revealWhen`, errors);
    validateCondition(edge.activeWhen, `edges[${index}].activeWhen`, errors);
  });
  const fixedNpcIds = new Set(map.nodes.filter((node) => node.type === "npc" && node.npcId).map((node) => node.npcId));
  const randomNpcIds = new Set();
  map.nodes.forEach((node) => (node.random?.entries || []).forEach((entry) => { if (entry.type === "npc" && entry.npcId) randomNpcIds.add(entry.npcId); }));
  [...randomNpcIds].forEach((npcId) => { if (fixedNpcIds.has(npcId)) warnings.push(`NPC ${npcId} 同时存在固定节点和随机池；运行时会按当天占位处理`); });
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function validateRandomNode(node, npcIds, enemyIds, errors, warnings) {
  if (node.type !== "random") return;
  if (!node.random || !Array.isArray(node.random.entries)) {
    errors.push(`随机节点 ${node.id} 缺少 random.entries`);
    return;
  }
  const entryIds = new Set();
  node.random.entries.forEach((entry, index) => {
    const field = `${node.id}.random.entries[${index}]`;
    if (!entry.id || !ID_PATTERN.test(entry.id)) errors.push(`${field}.id 无效`);
    if (entryIds.has(entry.id)) errors.push(`${field}.id 重复：${entry.id}`);
    entryIds.add(entry.id);
    if (!["npc", "battle", "empty"].includes(entry.type)) errors.push(`${field}.type 无效`);
    if (!Number.isFinite(entry.weight) || entry.weight <= 0) errors.push(`${field}.weight 必须大于 0`);
    if (entry.type === "npc" && !entry.npcId) errors.push(`${field} 缺少 npcId`);
    if (entry.type === "npc" && entry.npcId && !npcIds.has(entry.npcId)) warnings.push(`${field} 引用了未登记 NPC：${entry.npcId}`);
    if (entry.type === "battle" && !entry.enemyId) errors.push(`${field} 缺少 enemyId`);
    if (entry.type === "battle" && entry.enemyId && !enemyIds.has(entry.enemyId)) warnings.push(`${field} 引用了未登记敌人：${entry.enemyId}`);
    validateCondition(entry.when, `${field}.when`, errors);
  });
}

function showValidation() {
  const result = validationResult();
  const card = h("section", "card");
  card.appendChild(h("h4", "", `检查：${result.errors.length} 错误，${result.warnings.length} 警告`));
  const list = h("ul", "validation-list");
  result.errors.forEach((message) => list.appendChild(h("li", "error", `错误：${message}`)));
  result.warnings.forEach((message) => list.appendChild(h("li", "warning", `警告：${message}`)));
  if (!result.errors.length && !result.warnings.length) list.appendChild(h("li", "", "配置完整，可以导出。"));
  card.appendChild(list);
  els.inspector.prepend(card);
  showFeedback(result.errors.length ? "存在阻止导出的错误" : result.warnings.length ? "结构通过，但有联动警告" : "检查通过", Boolean(result.errors.length));
  return result;
}

async function saveWorldMapSource(source) {
  const response = await fetch("/__node_editor/save_world_map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `保存失败：HTTP ${response.status}`);
  }
  return response.json();
}

async function exportWorldMap() {
  selectedEdgeIndex = null;
  selectedRandomIndex = null;
  renderAll();
  const result = showValidation();
  if (result.errors.length) return;
  const source = `"use strict";\n\n// 由 node-editor 导出。节点与连线描述 World Point Crawl 布局。\nwindow.WORLD_MAP_BUNDLE = ${JSON.stringify(bundle, null, 2)};\n`;
  try {
    await saveWorldMapSource(source);
    cleanSnapshot = snapshot();
    updateHistoryUi();
    showFeedback("已覆盖项目根目录 world-map.js；请刷新游戏页面并重新开始");
  } catch (error) {
    console.warn("无法直接保存 world-map.js。", error);
    showFeedback("保存失败：请通过 node-editor/启动节点编辑器.cmd 打开编辑器", true);
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} 读取失败`);
  return response.json();
}

async function initialize() {
  try {
    const [npc, battle] = await Promise.all([fetchJson("../npc-dialogues/manifest.json"), fetchJson("../battle-data/manifest.json")]);
    npcManifest = npc;
    battleManifest = battle;
    const draft = sessionStorage.getItem("node-editor-draft");
    let draftBundle = null;
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed?.map?.editor?.positions) draftBundle = parsed;
      } catch {}
    }
    bundle = normalizeBundle(draftBundle || window.WORLD_MAP_BUNDLE);
    map = bundle.map;
    selectedNodeId = map.startNodeId;
    resetHistory();
    renderAll();
    els.app.classList.remove("is-loading");
  } catch (error) {
    els.dirty.textContent = "载入失败";
    showFeedback(error.message, true);
    console.error(error);
  }
}

els.mapSettings.addEventListener("click", () => { selectedNodeId = null; selectedEdgeIndex = null; selectedRandomIndex = null; linkingEdgeIndex = null; renderAll(); });
els.addNode.addEventListener("click", addNode);
els.deleteNode.addEventListener("click", deleteSelectedNode);
els.undo.addEventListener("click", () => restoreHistory(historyIndex - 1));
els.redo.addEventListener("click", () => restoreHistory(historyIndex + 1));
els.validate.addEventListener("click", () => { selectedEdgeIndex = null; selectedRandomIndex = null; renderAll(); showValidation(); });
els.export.addEventListener("click", exportWorldMap);
els.graph.addEventListener("wheel", (event) => {
  event.preventDefault();
  const nextZoom = graphZoom * Math.exp(-event.deltaY * 0.0012);
  zoomGraphAt(nextZoom, event.clientX, event.clientY);
}, { passive: false });
els.graph.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest?.(".graph-node, .graph-edge-hit, .edge-end-handle, .edge-breaker, .graph-edge")) return;
  event.preventDefault();
  els.graph.setPointerCapture(event.pointerId);
  graphPan = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: els.graph.scrollLeft,
    scrollTop: els.graph.scrollTop,
  };
  els.graph.classList.add("is-panning");
});
els.graph.addEventListener("pointermove", (event) => {
  if (!graphPan || graphPan.pointerId !== event.pointerId) return;
  event.preventDefault();
  els.graph.scrollLeft = graphPan.scrollLeft - (event.clientX - graphPan.startX);
  els.graph.scrollTop = graphPan.scrollTop - (event.clientY - graphPan.startY);
});
els.graph.addEventListener("pointerup", (event) => {
  if (!graphPan || graphPan.pointerId !== event.pointerId) return;
  graphPan = null;
  els.graph.classList.remove("is-panning");
});
els.graph.addEventListener("pointercancel", () => {
  graphPan = null;
  els.graph.classList.remove("is-panning");
});
document.addEventListener("pointermove", updateLinkDrag);
document.addEventListener("pointerup", finishLinkDrag);
document.addEventListener("pointercancel", (event) => {
  if (!linkDrag || linkDrag.pointerId !== event.pointerId) return;
  linkDrag.path.remove();
  linkDrag = null;
  renderEdges();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (linkDrag) {
      linkDrag.path.remove();
      linkDrag = null;
      renderEdges();
    }
    linkingEdgeIndex = null;
    selectedRandomIndex = null;
    renderAll();
  }
  if (event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); restoreHistory(historyIndex - 1); }
  if (event.ctrlKey && event.key.toLowerCase() === "y") { event.preventDefault(); restoreHistory(historyIndex + 1); }
});
window.addEventListener("beforeunload", (event) => {
  if (snapshot() !== cleanSnapshot) { event.preventDefault(); event.returnValue = ""; }
});

initialize();
