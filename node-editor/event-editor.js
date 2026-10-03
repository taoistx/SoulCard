"use strict";

const $ = (selector) => document.querySelector(selector);
const h = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const clone = (value) => JSON.parse(JSON.stringify(value));
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const DIALOGUES = {
  start: "坠落处", siltWoods: "污泥林", drownedHuts: "腐叶原野", bellRoad: "碎钟坡", hut: "废弃小屋",
  gate: "封锁山道", church: "逆抽水器", quietClearing: "空地", node2: "腐叶原野深处", node3: "弦一螂",
};
const KIND_NAMES = { npc: "NPC 对话", dialogue: "世界对话", battle: "战斗", action: "行动事件" };
const els = {
  app: $("#eventEditorApp"), setList: $("#eventSetList"), entryList: $("#eventEntryList"), setTitle: $("#setTitle"), inspector: $("#inspector"), inspectorKind: $("#inspectorKind"),
  selectionStatus: $("#selectionStatus"), feedback: $("#feedback"), dirty: $("#dirtyState"), create: $("#newSetButton"), duplicate: $("#duplicateSetButton"), remove: $("#deleteSetButton"),
  undo: $("#undoButton"), redo: $("#redoButton"), validate: $("#validateButton"), save: $("#saveButton"), addNpc: $("#addNpcButton"), addDialogue: $("#addDialogueButton"), addBattle: $("#addBattleButton"),
};

let bundle = null;
let currentSetId = null;
let selectedEntryIndex = null;
let npcIds = [];
let enemyIds = [];
let history = [];
let historyIndex = -1;
let cleanSnapshot = "";
let feedbackTimer = null;

function snapshot() { return JSON.stringify(bundle); }
function currentSet() { return bundle.eventSets[currentSetId]; }
function currentEntry() { return Number.isInteger(selectedEntryIndex) ? currentSet()?.entries?.[selectedEntryIndex] || null : null; }
function mapReferences(setId) { return (window.WORLD_MAP_BUNDLE?.map?.nodes || []).filter((node) => node.eventSetId === setId).map((node) => node.id); }
function showFeedback(message, isError = false) { clearTimeout(feedbackTimer); els.feedback.textContent = message; els.feedback.classList.toggle("error", isError); feedbackTimer = setTimeout(() => { els.feedback.textContent = ""; els.feedback.classList.remove("error"); }, 4200); }
function persistDraft() { sessionStorage.setItem("event-set-editor-draft", snapshot()); }
function updateHistoryUi() { els.undo.disabled = historyIndex <= 0; els.redo.disabled = historyIndex < 0 || historyIndex >= history.length - 1; const clean = snapshot() === cleanSnapshot; els.dirty.textContent = clean ? "已保存" : "未保存"; els.dirty.classList.toggle("saved", clean); }
function resetHistory() { history = [snapshot()]; historyIndex = 0; cleanSnapshot = history[0]; updateHistoryUi(); }
function recordHistory() { const next = snapshot(); if (next === history[historyIndex]) return; history = history.slice(0, historyIndex + 1); history.push(next); if (history.length > 100) history.shift(); else historyIndex++; persistDraft(); updateHistoryUi(); }
function mutate(change) { change(); recordHistory(); renderAll(); }
function restoreHistory(index) { if (index < 0 || index >= history.length) return; historyIndex = index; bundle = JSON.parse(history[index]); if (!bundle.eventSets[currentSetId]) currentSetId = Object.keys(bundle.eventSets)[0]; if (!currentEntry()) selectedEntryIndex = null; persistDraft(); renderAll(); updateHistoryUi(); }

function uniqueId(base, used) { let root = String(base || "event").replace(/[^A-Za-z0-9_-]/g, "") || "event"; if (!/^[A-Za-z]/.test(root)) root = `event${root}`; let id = root, n = 2; while (used.includes(id)) id = `${root}${n++}`; return id; }
function makeInput(label, value, onChange, options = {}) { const wrapper = h("label", options.wide ? "wide" : "", label); const input = document.createElement(options.multiline ? "textarea" : "input"); if (options.multiline) input.rows = options.rows || 4; else input.type = options.type || "text"; input.value = value ?? ""; input.addEventListener("change", () => onChange(options.type === "number" ? Number(input.value) : input.value)); wrapper.appendChild(input); return wrapper; }
function makeSelect(label, value, choices, onChange, options = {}) { const wrapper = h("label", options.wide ? "wide" : "", label); const select = document.createElement("select"); choices.forEach(([id, name]) => { const option = h("option", "", name); option.value = id; option.selected = id === value; select.appendChild(option); }); select.addEventListener("change", () => onChange(select.value)); wrapper.appendChild(select); return wrapper; }
function conditionEditor(value, onChange) { const card = h("div", "card"); card.appendChild(h("p", "subtle", "可选。留空表示该元素始终进入权重池。")); const area = document.createElement("textarea"); area.rows = 7; area.value = value ? JSON.stringify(value, null, 2) : ""; area.placeholder = '{ "mode": "all", "clauses": [] }'; area.addEventListener("change", () => { if (!area.value.trim()) return onChange(null); try { onChange(JSON.parse(area.value)); } catch { showFeedback("条件 JSON 格式无效", true); area.value = value ? JSON.stringify(value, null, 2) : ""; } }); card.appendChild(area); return card; }

function renameSet(nextId) {
  if (nextId === currentSetId) return;
  if (!ID_PATTERN.test(nextId) || bundle.eventSets[nextId]) return showFeedback("事件集 ID 无效或重复", true);
  const references = mapReferences(currentSetId);
  if (references.length) return showFeedback(`事件集正被节点引用，不能改 ID：${references.join("、")}`, true);
  mutate(() => { const entries = Object.entries(bundle.eventSets).map(([id, set]) => [id === currentSetId ? nextId : id, set]); bundle.eventSets = Object.fromEntries(entries); currentSetId = nextId; });
}

function renderSetList() {
  els.setList.replaceChildren();
  Object.entries(bundle.eventSets).forEach(([id, set]) => {
    const button = h("button", id === currentSetId ? "active" : ""); button.type = "button";
    button.append(h("span", "", set.name), h("small", "", `${set.entries.length} 项 · ${id}`));
    button.addEventListener("click", () => { currentSetId = id; selectedEntryIndex = null; renderAll(); }); els.setList.appendChild(button);
  });
}

function renderEntries() {
  els.entryList.replaceChildren();
  const set = currentSet();
  els.setTitle.textContent = set?.name || "—";
  const eligibleTotal = (set?.entries || []).reduce((sum, entry) => sum + Math.max(0, Number(entry.weight) || 0), 0);
  (set?.entries || []).forEach((entry, index) => {
    const percent = eligibleTotal > 0 ? entry.weight / eligibleTotal * 100 : 0;
    const card = h("button", `event-entry-card${selectedEntryIndex === index ? " active" : ""}`); card.type = "button";
    const heading = h("span", "event-entry-heading"); heading.append(h("strong", "", entry.id), h("small", "", KIND_NAMES[entry.kind] || entry.kind));
    const chance = h("span", "event-entry-chance", `${percent.toFixed(percent === 100 ? 0 : 1)}%`);
    const bar = h("i", "event-weight-bar"); bar.style.width = `${percent}%`;
    card.append(heading, chance, bar); card.addEventListener("click", () => { selectedEntryIndex = index; renderAll(); }); els.entryList.appendChild(card);
  });
  if (!set?.entries?.length) els.entryList.appendChild(h("p", "graph-empty", "添加一个事件元素开始配置。"));
}

function renderSetInspector() {
  const set = currentSet(); if (!set) return;
  els.inspectorKind.textContent = "事件集"; els.inspector.appendChild(h("h3", "", set.name));
  const fields = h("div", "field-grid");
  fields.append(makeInput("稳定 ID", currentSetId, renameSet), makeInput("显示名称", set.name, (value) => mutate(() => { set.name = value; })));
  els.inspector.appendChild(fields);
  const references = mapReferences(currentSetId);
  els.inspector.appendChild(h("p", "subtle", references.length ? `地图引用：${references.join("、")}` : "当前没有地图节点引用，可安全改名或删除。"));
}

function changeEntryKind(entry, kind) {
  const next = { id: entry.id, kind, weight: entry.weight || 1 };
  if (entry.when) next.when = entry.when;
  if (kind === "npc") next.npcId = npcIds[0] || "eddie";
  if (kind === "dialogue") next.dialogueId = Object.keys(DIALOGUES)[0];
  if (kind === "battle") next.enemyId = enemyIds[0] || "dungling";
  if (kind === "action") next.actionEventId = window.ActionEventData.list()[0]?.id || "";
  currentSet().entries[selectedEntryIndex] = next;
}

function renderEntryInspector() {
  const entry = currentEntry(); if (!entry) return renderSetInspector();
  els.inspectorKind.textContent = "事件元素"; els.inspector.appendChild(h("h3", "", entry.id));
  const fields = h("div", "field-grid");
  fields.append(makeInput("元素 ID", entry.id, (value) => mutate(() => { if (!ID_PATTERN.test(value) || currentSet().entries.some((item, index) => index !== selectedEntryIndex && item.id === value)) return showFeedback("元素 ID 无效或重复", true); entry.id = value; })), makeInput("权重", entry.weight, (value) => mutate(() => { entry.weight = Math.max(1, value || 1); }), { type: "number" }));
  fields.appendChild(makeSelect("类型", entry.kind, Object.entries(KIND_NAMES), (value) => mutate(() => changeEntryKind(entry, value)), { wide: true }));
  if (entry.kind === "npc") fields.appendChild(makeSelect("NPC", entry.npcId, npcIds.map((id) => [id, id]), (value) => mutate(() => { entry.npcId = value; }), { wide: true }));
  if (entry.kind === "dialogue") fields.appendChild(makeSelect("世界对话", entry.dialogueId, Object.entries(DIALOGUES).map(([id, name]) => [id, `${name} · ${id}`]), (value) => mutate(() => { entry.dialogueId = value; }), { wide: true }));
  if (entry.kind === "action") fields.appendChild(makeSelect("行动事件 JSON", entry.actionEventId, window.ActionEventData.list().map((event) => [event.id, `${event.name} · ${event.id}`]), (value) => mutate(() => { entry.actionEventId = value; }), { wide: true }));
  if (entry.kind === "battle") {
    fields.appendChild(makeSelect("敌人", entry.enemyId, enemyIds.map((id) => [id, id]), (value) => mutate(() => { entry.enemyId = value; })));
    fields.appendChild(makeInput("战斗来源 ID（可选）", entry.battleSourceId || "", (value) => mutate(() => { if (value) entry.battleSourceId = value; else delete entry.battleSourceId; })));
  }
  els.inspector.appendChild(fields);
  els.inspector.appendChild(h("h4", "", "进入权重池的条件 when"));
  els.inspector.appendChild(conditionEditor(entry.when, (value) => mutate(() => { if (value) entry.when = value; else delete entry.when; })));
  const actions = h("div", "row-actions");
  const back = h("button", "", "返回事件集"); back.type = "button"; back.addEventListener("click", () => { selectedEntryIndex = null; renderAll(); });
  const remove = h("button", "danger", "删除元素"); remove.type = "button"; remove.addEventListener("click", () => mutate(() => { currentSet().entries.splice(selectedEntryIndex, 1); selectedEntryIndex = null; }));
  actions.append(back, remove); els.inspector.appendChild(actions);
}

function renderAll() {
  renderSetList(); renderEntries(); els.inspector.replaceChildren(); if (selectedEntryIndex === null) renderSetInspector(); else renderEntryInspector();
  els.selectionStatus.textContent = currentEntry() ? `${currentSetId} / ${currentEntry().id}` : currentSetId || "事件集";
  els.remove.disabled = !currentSetId; els.duplicate.disabled = !currentSetId; updateHistoryUi();
}

function addSet() { const id = uniqueId("eventSet", Object.keys(bundle.eventSets)); mutate(() => { bundle.eventSets[id] = { name: "新事件集", entries: [{ id: "dialogue", kind: "dialogue", dialogueId: "start", weight: 1 }] }; currentSetId = id; selectedEntryIndex = null; }); }
function duplicateSet() { if (!currentSet()) return; const id = uniqueId(`${currentSetId}Copy`, Object.keys(bundle.eventSets)); mutate(() => { bundle.eventSets[id] = clone(currentSet()); bundle.eventSets[id].name += " 副本"; currentSetId = id; selectedEntryIndex = null; }); }
function deleteSet() { const references = mapReferences(currentSetId); if (references.length) return showFeedback(`无法删除；节点仍在引用：${references.join("、")}`, true); if (Object.keys(bundle.eventSets).length === 1) return showFeedback("至少保留一个事件集", true); mutate(() => { delete bundle.eventSets[currentSetId]; currentSetId = Object.keys(bundle.eventSets)[0]; selectedEntryIndex = null; }); }
function addEntry(kind) { const entries = currentSet().entries; const id = uniqueId(kind, entries.map((entry) => entry.id)); mutate(() => { const entry = { id, kind, weight: 1 }; if (kind === "npc") entry.npcId = npcIds[0] || "eddie"; if (kind === "dialogue") entry.dialogueId = Object.keys(DIALOGUES)[0]; if (kind === "battle") entry.enemyId = enemyIds[0] || "dungling"; if (kind === "action") entry.actionEventId = window.ActionEventData.list()[0]?.id || ""; entries.push(entry); selectedEntryIndex = entries.length - 1; }); }

function validationResult() {
  const errors = [], warnings = [];
  Object.entries(bundle.eventSets).forEach(([setId, set]) => {
    if (!ID_PATTERN.test(setId)) errors.push(`事件集 ID 无效：${setId}`);
    if (!set.name?.trim()) errors.push(`事件集 ${setId} 缺少显示名`);
    if (!set.entries?.length) errors.push(`事件集 ${setId} 没有元素`);
    const ids = new Set();
    (set.entries || []).forEach((entry, index) => {
      const path = `${setId}.entries[${index}]`;
      if (!ID_PATTERN.test(entry.id || "")) errors.push(`${path}.id 无效`);
      if (ids.has(entry.id)) errors.push(`${path}.id 重复`); ids.add(entry.id);
      if (!KIND_NAMES[entry.kind]) errors.push(`${path}.kind 无效`);
      if (!Number.isFinite(entry.weight) || entry.weight <= 0) errors.push(`${path}.weight 必须大于 0`);
      if (entry.kind === "npc" && !npcIds.includes(entry.npcId)) errors.push(`${path} 引用了未知 NPC：${entry.npcId}`);
      if (entry.kind === "dialogue" && !DIALOGUES[entry.dialogueId]) errors.push(`${path} 引用了未知世界对话：${entry.dialogueId}`);
      if (entry.kind === "battle" && !enemyIds.includes(entry.enemyId)) errors.push(`${path} 引用了未知敌人：${entry.enemyId}`);
      if (entry.kind === "action" && !window.ActionEventData.get(entry.actionEventId)) errors.push(`${path} 引用了未知行动事件`);
      if (entry.when && (!["all", "any"].includes(entry.when.mode) || !Array.isArray(entry.when.clauses))) errors.push(`${path}.when 格式无效`);
    });
    if (!mapReferences(setId).length) warnings.push(`事件集 ${setId} 尚未被地图引用`);
  });
  (window.WORLD_MAP_BUNDLE?.map?.nodes || []).forEach((node) => { if (!bundle.eventSets[node.eventSetId]) errors.push(`地图节点 ${node.id} 引用了不存在的事件集 ${node.eventSetId}`); });
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
function showValidation() { const result = validationResult(); const card = h("section", "card"); card.appendChild(h("h4", "", `检查：${result.errors.length} 错误，${result.warnings.length} 警告`)); const list = h("ul", "validation-list"); result.errors.forEach((message) => list.appendChild(h("li", "error", `错误：${message}`))); result.warnings.forEach((message) => list.appendChild(h("li", "warning", `警告：${message}`))); if (!result.errors.length && !result.warnings.length) list.appendChild(h("li", "", "配置完整，可以保存。")); card.appendChild(list); els.inspector.prepend(card); showFeedback(result.errors.length ? "存在阻止保存的错误" : result.warnings.length ? "结构通过，但有警告" : "检查通过", Boolean(result.errors.length)); return result; }

async function save() {
  selectedEntryIndex = null; renderAll(); const result = showValidation(); if (result.errors.length) return;
  const source = `"use strict";\n\n// 由事件集编辑器导出。事件集可被任意数量的地图节点复用。\nwindow.WORLD_EVENT_SET_BUNDLE = ${JSON.stringify(bundle, null, 2)};\n`;
  try { const response = await fetch("/__node_editor/save_world_events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source }) }); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`); cleanSnapshot = snapshot(); updateHistoryUi(); showFeedback("已保存 world-events.js"); }
  catch (error) { showFeedback("保存失败：请通过启动节点编辑器.cmd 打开", true); console.error(error); }
}

async function initialize() {
  try {
    await window.ActionEventData.ready;
    const [npc, battle] = await Promise.all([fetch("../npc-dialogues/manifest.json", { cache: "no-store" }).then((r) => r.json()), fetch("../battle-data/manifest.json", { cache: "no-store" }).then((r) => r.json())]);
    npcIds = Object.keys(npc.dialogues || {}); enemyIds = Object.keys(battle.combatants || {});
    const saved = sessionStorage.getItem("event-set-editor-draft"); let source = window.WORLD_EVENT_SET_BUNDLE;
    if (saved) { try { const parsed = JSON.parse(saved); if (parsed?.schemaVersion === 1) source = parsed; } catch {} }
    bundle = clone(source); currentSetId = Object.keys(bundle.eventSets)[0]; resetHistory(); renderAll(); els.app.classList.remove("is-loading");
  } catch (error) { els.dirty.textContent = "载入失败"; showFeedback(error.message, true); console.error(error); }
}

$("#addActionButton").addEventListener("click", () => addEntry("action"));
els.create.addEventListener("click", addSet); els.duplicate.addEventListener("click", duplicateSet); els.remove.addEventListener("click", deleteSet);
els.addNpc.addEventListener("click", () => addEntry("npc")); els.addDialogue.addEventListener("click", () => addEntry("dialogue")); els.addBattle.addEventListener("click", () => addEntry("battle"));
els.undo.addEventListener("click", () => restoreHistory(historyIndex - 1)); els.redo.addEventListener("click", () => restoreHistory(historyIndex + 1)); els.validate.addEventListener("click", () => { renderAll(); showValidation(); }); els.save.addEventListener("click", save);
document.addEventListener("keydown", (event) => { if (event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); restoreHistory(historyIndex - 1); } if (event.ctrlKey && event.key.toLowerCase() === "y") { event.preventDefault(); restoreHistory(historyIndex + 1); } });
window.addEventListener("beforeunload", (event) => { if (snapshot() !== cleanSnapshot) { event.preventDefault(); event.returnValue = ""; } });
initialize();
