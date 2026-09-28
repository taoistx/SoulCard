"use strict";

const $ = (selector) => document.querySelector(selector);
const h = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const MARGIN = 90;
const EXTRA_SPACE = 420;
const MIN_WIDTH = 1200;
const MIN_HEIGHT = 820;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.8;

const els = {
  app: $("#editorApp"), nodeList: $("#nodeList"), graph: $("#graphViewport"), graphSurface: $("#graphSurface"), graphNodes: $("#graphNodes"), graphEdges: $("#graphEdges"),
  inspector: $("#inspector"), inspectorKind: $("#inspectorKind"), selectionStatus: $("#selectionStatus"), feedback: $("#feedback"), dirty: $("#dirtyState"),
  mapSettings: $("#mapSettingsButton"), addNode: $("#addNodeButton"), copyNode: $("#copyNodeButton"), pasteNode: $("#pasteNodeButton"), deleteNode: $("#deleteNodeButton"), undo: $("#undoButton"), redo: $("#redoButton"),
  validate: $("#validateButton"), export: $("#exportButton"),
};

let bundle = null;
let map = null;
let selectedNodeId = null;
let selectedEdgeIndex = null;
let history = [];
let historyIndex = -1;
let cleanSnapshot = "";
let feedbackTimer = null;
let zoom = Number(sessionStorage.getItem("node-editor-graph-zoom")) || 1;
let canvasWidth = MIN_WIDTH;
let canvasHeight = MIN_HEIGHT;
let drag = null;
let pan = null;
let linkDrag = null;
let edgeClickTimer = null;
let nodeClipboard = null;
const eventSets = window.WORLD_EVENT_SET_BUNDLE?.eventSets || {};

function normalizeBundle(source) {
  const next = clone(source || {});
  next.schemaVersion = 3;
  next.map ||= {};
  next.map.meta ||= {};
  next.map.nodes = Array.isArray(next.map.nodes) ? next.map.nodes : [];
  next.map.edges = Array.isArray(next.map.edges) ? next.map.edges : [];
  if (!next.map.nodes.length) next.map.nodes.push({ id: "start", label: "起点", icon: "✦", x: 0, y: 0, eventSetId: Object.keys(eventSets)[0] || "" });
  next.map.nodes.forEach((node) => {
    node.x = Math.max(0, Number(node.x) || 0);
    node.y = Math.max(0, Number(node.y) || 0);
    node.icon ||= "?";
    node.label ||= node.id;
    node.eventSetId ||= Object.keys(eventSets)[0] || "";
  });
  next.map.startNodeId ||= next.map.nodes[0].id;
  delete next.map.viewBox;
  delete next.map.initialRevealed;
  delete next.map.editor;
  return next;
}

function currentNode() { return map.nodes.find((node) => node.id === selectedNodeId) || null; }
function currentEdge() { return Number.isInteger(selectedEdgeIndex) ? map.edges[selectedEdgeIndex] || null : null; }
function snapshot() { return JSON.stringify(bundle); }

function showFeedback(message, isError = false) {
  clearTimeout(feedbackTimer);
  els.feedback.textContent = message;
  els.feedback.classList.toggle("error", isError);
  feedbackTimer = setTimeout(() => { els.feedback.textContent = ""; els.feedback.classList.remove("error"); }, 4200);
}

function persistDraft() { sessionStorage.setItem("node-editor-v3-draft", snapshot()); }
function updateHistoryUi() {
  els.undo.disabled = historyIndex <= 0;
  els.redo.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
  const clean = snapshot() === cleanSnapshot;
  els.dirty.textContent = clean ? "已保存" : "未保存";
  els.dirty.classList.toggle("saved", clean);
}
function resetHistory() { history = [snapshot()]; historyIndex = 0; cleanSnapshot = history[0]; updateHistoryUi(); }
function recordHistory() {
  const next = snapshot();
  if (next === history[historyIndex]) return;
  history = history.slice(0, historyIndex + 1);
  history.push(next);
  if (history.length > 100) history.shift(); else historyIndex++;
  persistDraft();
  updateHistoryUi();
}
function mutate(change, render = true) { change(); recordHistory(); if (render) renderAll(); }
function restoreHistory(index) {
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  bundle = JSON.parse(history[index]);
  map = bundle.map;
  if (selectedNodeId && !currentNode()) selectedNodeId = null;
  if (selectedEdgeIndex !== null && !currentEdge()) selectedEdgeIndex = null;
  persistDraft();
  renderAll();
  updateHistoryUi();
}

function uniqueId(base) {
  let root = String(base || "node").replace(/[^A-Za-z0-9_-]/g, "") || "node";
  if (!/^[A-Za-z]/.test(root)) root = `node${root}`;
  let id = root;
  let suffix = 2;
  while (map.nodes.some((node) => node.id === id)) id = `${root}${suffix++}`;
  return id;
}

function makeInput(label, value, onChange, options = {}) {
  const wrapper = h("label", options.wide ? "wide" : "", label);
  const input = document.createElement(options.multiline ? "textarea" : "input");
  if (options.multiline) input.rows = options.rows || 4;
  else input.type = options.type || "text";
  input.value = value ?? "";
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

function jsonConditionEditor(value, onChange) {
  const card = h("div", "card");
  card.appendChild(h("p", "subtle", "留空表示始终可通行。条件格式与 NPC 对话条件一致。"));
  const textarea = document.createElement("textarea");
  textarea.rows = 7;
  textarea.placeholder = '{ "mode": "all", "clauses": [] }';
  textarea.value = value ? JSON.stringify(value, null, 2) : "";
  textarea.addEventListener("change", () => {
    if (!textarea.value.trim()) return onChange(null);
    try { onChange(JSON.parse(textarea.value)); }
    catch { showFeedback("条件 JSON 格式无效", true); textarea.value = value ? JSON.stringify(value, null, 2) : ""; }
  });
  card.appendChild(textarea);
  return card;
}

function computeCanvas() {
  const maxX = Math.max(0, ...map.nodes.map((node) => node.x));
  const maxY = Math.max(0, ...map.nodes.map((node) => node.y));
  canvasWidth = Math.max(MIN_WIDTH, maxX + MARGIN + EXTRA_SPACE);
  canvasHeight = Math.max(MIN_HEIGHT, maxY + MARGIN + EXTRA_SPACE);
}
function pointFor(node) { return { x: MARGIN + node.x, y: canvasHeight - MARGIN - node.y }; }

function applyCanvasSize() {
  const width = canvasWidth * zoom;
  const height = canvasHeight * zoom;
  els.graphSurface.style.width = `${width}px`;
  els.graphSurface.style.height = `${height}px`;
  [els.graphNodes, els.graphEdges].forEach((layer) => {
    layer.style.width = `${width}px`;
    layer.style.height = `${height}px`;
  });
  els.graphEdges.setAttribute("viewBox", `0 0 ${canvasWidth} ${canvasHeight}`);
  els.graphEdges.setAttribute("width", width);
  els.graphEdges.setAttribute("height", height);
}

function renderAxes() {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = '<marker id="edgeArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker>';
  els.graphEdges.appendChild(defs);
  const axisY = canvasHeight - MARGIN;
  const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  xAxis.setAttribute("class", "graph-axis"); xAxis.setAttribute("x1", MARGIN); xAxis.setAttribute("y1", axisY); xAxis.setAttribute("x2", canvasWidth - 30); xAxis.setAttribute("y2", axisY);
  const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  yAxis.setAttribute("class", "graph-axis"); yAxis.setAttribute("x1", MARGIN); yAxis.setAttribute("y1", axisY); yAxis.setAttribute("x2", MARGIN); yAxis.setAttribute("y2", 30);
  els.graphEdges.append(xAxis, yAxis);
  const labels = [[MARGIN + 8, axisY - 8, "(0,0)"], [canvasWidth - 64, axisY - 10, "+X"], [MARGIN + 10, 44, "+Y"]];
  labels.forEach(([x, y, text]) => {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "axis-label"); label.setAttribute("x", x); label.setAttribute("y", y); label.textContent = text; els.graphEdges.appendChild(label);
  });
}

function renderEdges() {
  els.graphEdges.replaceChildren();
  renderAxes();
  map.edges.forEach((edge, index) => {
    const from = map.nodes.find((node) => node.id === edge.from);
    const to = map.nodes.find((node) => node.id === edge.to);
    if (!from || !to) return;
    const a = pointFor(from), b = pointFor(to);
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / distance, uy = (b.y - a.y) / distance;
    const start = { x: a.x + ux * 20, y: a.y + uy * 20 };
    const end = { x: b.x - ux * 25, y: b.y - uy * 25 };
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", `graph-edge${selectedEdgeIndex === index ? " selected" : ""}${edge.activeWhen ? " locked" : ""}`);
    line.setAttribute("x1", start.x); line.setAttribute("y1", start.y); line.setAttribute("x2", end.x); line.setAttribute("y2", end.y);
    line.setAttribute("marker-end", "url(#edgeArrow)");
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hit.setAttribute("class", "graph-edge-hit"); hit.setAttribute("x1", start.x); hit.setAttribute("y1", start.y); hit.setAttribute("x2", end.x); hit.setAttribute("y2", end.y);
    hit.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail !== 1) return;
      clearTimeout(edgeClickTimer);
      edgeClickTimer = setTimeout(() => {
        if (map.edges[index] !== edge) return;
        selectedEdgeIndex = index;
        selectedNodeId = edge.from;
        renderAll();
      }, 220);
    });
    hit.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(edgeClickTimer);
      if (map.edges[index] !== edge) return;
      mutate(() => {
        map.edges.splice(index, 1);
        selectedEdgeIndex = null;
      });
      showFeedback(`已断开 ${edge.from} → ${edge.to}`);
    });
    els.graphEdges.append(line, hit);
  });
}

function graphPointerPoint(event) {
  const rect = els.graph.getBoundingClientRect();
  return {
    x: (els.graph.scrollLeft + event.clientX - rect.left) / zoom,
    y: (els.graph.scrollTop + event.clientY - rect.top) / zoom,
  };
}

function nodeFromPointer(event) {
  return document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".graph-node")?.dataset?.nodeId || null;
}

function clearLinkTarget() {
  els.graphNodes.querySelectorAll(".link-drop-target").forEach((node) => node.classList.remove("link-drop-target"));
}

function startLinkDrag(event, node) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture(event.pointerId);
  const start = pointFor(node);
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("class", "graph-edge draft");
  line.setAttribute("marker-end", "url(#edgeArrow)");
  line.setAttribute("x1", start.x);
  line.setAttribute("y1", start.y);
  line.setAttribute("x2", start.x);
  line.setAttribute("y2", start.y);
  els.graphEdges.appendChild(line);
  linkDrag = { pointerId: event.pointerId, fromId: node.id, line };
}

function updateLinkDrag(event) {
  if (!linkDrag || linkDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const pointer = graphPointerPoint(event);
  linkDrag.line.setAttribute("x2", pointer.x);
  linkDrag.line.setAttribute("y2", pointer.y);
  const targetId = nodeFromPointer(event);
  els.graphNodes.querySelectorAll(".graph-node").forEach((card) => {
    card.classList.toggle("link-drop-target", card.dataset.nodeId === targetId && targetId !== linkDrag.fromId);
  });
}

function finishLinkDrag(event) {
  if (!linkDrag || linkDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const { fromId, line } = linkDrag;
  const toId = nodeFromPointer(event);
  line.remove();
  linkDrag = null;
  clearLinkTarget();
  if (!toId || toId === fromId) return renderEdges();
  if (map.edges.some((edge) => edge.from === fromId && edge.to === toId)) {
    showFeedback(`${fromId} → ${toId} 已经存在`, true);
    return renderEdges();
  }
  mutate(() => {
    map.edges.push({ from: fromId, to: toId });
    selectedNodeId = fromId;
    selectedEdgeIndex = map.edges.length - 1;
  });
  showFeedback(`已连接父节点 ${fromId} → 子节点 ${toId}`);
}

function cancelLinkDrag() {
  if (!linkDrag) return;
  linkDrag.line.remove();
  linkDrag = null;
  clearLinkTarget();
  renderEdges();
}

function renderNodes() {
  els.graphNodes.replaceChildren();
  map.nodes.forEach((node) => {
    const point = pointFor(node);
    const card = h("article", `graph-node${selectedNodeId === node.id ? " selected" : ""}`);
    card.dataset.nodeId = node.id;
    card.style.left = `${point.x * zoom}px`;
    card.style.top = `${point.y * zoom}px`;
    const dot = h("div", "node-dot", node.icon || "?");
    dot.style.transform = `translate(-50%,-50%) scale(${Math.max(.72, Math.min(1, zoom))})`;
    const label = h("div", "node-label", node.label);
    label.style.transform = `translateX(-50%) scale(${Math.max(.78, Math.min(1, zoom))})`;
    const port = h("button", "port");
    port.type = "button";
    port.title = "从父节点拖到子节点创建有向连线";
    port.setAttribute("aria-label", `从父节点 ${node.label} 拖出连线`);
    port.addEventListener("pointerdown", (event) => startLinkDrag(event, node));
    port.addEventListener("click", (event) => event.stopPropagation());
    card.append(dot, label, port);
    card.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedNodeId = node.id; selectedEdgeIndex = null; renderAll();
    });
    card.addEventListener("pointerdown", (event) => startNodeDrag(event, node, card));
    els.graphNodes.appendChild(card);
  });
}

function startNodeDrag(event, node, element) {
  if (event.button !== 0 || event.target.closest(".port")) return;
  event.preventDefault();
  event.stopPropagation();
  element.setPointerCapture(event.pointerId);
  drag = { pointerId: event.pointerId, node, element, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y, moved: false };
  element.addEventListener("pointermove", moveNodeDrag);
  element.addEventListener("pointerup", finishNodeDrag, { once: true });
  element.addEventListener("pointercancel", finishNodeDrag, { once: true });
}
function moveNodeDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = (event.clientX - drag.startX) / zoom;
  const dy = (event.clientY - drag.startY) / zoom;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  drag.node.x = Math.max(0, Math.round(drag.x + dx));
  drag.node.y = Math.max(0, Math.round(drag.y - dy));
  const neededWidth = drag.node.x + MARGIN + EXTRA_SPACE;
  const neededHeight = drag.node.y + MARGIN + EXTRA_SPACE;
  if (neededWidth > canvasWidth || neededHeight > canvasHeight) {
    const previousHeight = canvasHeight;
    canvasWidth = Math.max(canvasWidth, neededWidth);
    canvasHeight = Math.max(canvasHeight, neededHeight);
    applyCanvasSize();
    els.graphNodes.querySelectorAll(".graph-node").forEach((card) => {
      const item = map.nodes.find((node) => node.id === card.dataset.nodeId);
      if (!item) return;
      const position = pointFor(item);
      card.style.left = `${position.x * zoom}px`;
      card.style.top = `${position.y * zoom}px`;
    });
    els.graph.scrollTop += (canvasHeight - previousHeight) * zoom;
  }
  const point = pointFor(drag.node);
  drag.element.style.left = `${point.x * zoom}px`;
  drag.element.style.top = `${point.y * zoom}px`;
  renderEdges();
  const rect = els.graph.getBoundingClientRect();
  if (event.clientX > rect.right - 36) els.graph.scrollLeft += 14;
  if (event.clientX < rect.left + 36) els.graph.scrollLeft -= 14;
  if (event.clientY > rect.bottom - 36) els.graph.scrollTop += 14;
  if (event.clientY < rect.top + 36) els.graph.scrollTop -= 14;
}
function finishNodeDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.element.removeEventListener("pointermove", moveNodeDrag);
  const moved = drag.moved;
  drag = null;
  if (moved) { recordHistory(); renderAll(); }
}

function renderNodeList() {
  els.nodeList.replaceChildren();
  map.nodes.forEach((node) => {
    const button = h("button", selectedNodeId === node.id && selectedEdgeIndex === null ? "active" : "");
    button.type = "button";
    const eventName = eventSets[node.eventSetId]?.name || node.eventSetId || "未绑定";
    button.append(h("span", "", node.label), h("small", "", `${node.revealFlag ? "隐藏 · " : ""}${eventName}`));
    button.addEventListener("click", () => { selectedNodeId = node.id; selectedEdgeIndex = null; renderAll(); });
    els.nodeList.appendChild(button);
  });
}

function renderMapInspector() {
  els.inspectorKind.textContent = "地图";
  els.inspector.appendChild(h("h3", "", map.meta.title || "未命名地图"));
  const fields = h("div", "field-grid");
  fields.append(makeInput("眉题", map.meta.eyebrow || "", (value) => mutate(() => { map.meta.eyebrow = value; })), makeInput("标题", map.meta.title || "", (value) => mutate(() => { map.meta.title = value; })));
  fields.appendChild(makeSelect("起点", map.startNodeId, map.nodes.map((node) => [node.id, `${node.label} · ${node.id}`]), (value) => mutate(() => { map.startNodeId = value; const start = map.nodes.find((node) => node.id === value); if (start) delete start.revealFlag; }), { wide: true }));
  els.inspector.appendChild(fields);
  els.inspector.appendChild(h("p", "subtle", "地图没有固定宽高。画布会按最大节点坐标自动向右、向上扩展。"));
}

function renameNode(oldId, nextId) {
  if (oldId === nextId) return;
  if (!ID_PATTERN.test(nextId) || map.nodes.some((node) => node.id === nextId)) return showFeedback("节点 ID 无效或重复", true);
  mutate(() => {
    currentNode().id = nextId;
    map.edges.forEach((edge) => { if (edge.from === oldId) edge.from = nextId; if (edge.to === oldId) edge.to = nextId; });
    if (map.startNodeId === oldId) map.startNodeId = nextId;
    selectedNodeId = nextId;
  });
}

function renderNodeInspector() {
  const node = currentNode();
  if (!node) return renderMapInspector();
  els.inspectorKind.textContent = "节点";
  els.inspector.appendChild(h("h3", "", node.label));
  const fields = h("div", "field-grid");
  fields.append(makeInput("节点 ID", node.id, (value) => renameNode(node.id, value)), makeInput("显示名", node.label, (value) => mutate(() => { node.label = value; })));
  fields.append(makeInput("图标", node.icon, (value) => mutate(() => { node.icon = value || "?"; })), makeSelect("事件集", node.eventSetId, Object.entries(eventSets).map(([id, set]) => [id, `${set.name} · ${id}`]), (value) => mutate(() => { node.eventSetId = value; })));
  fields.append(makeInput("X（向右）", node.x, (value) => mutate(() => { node.x = Math.max(0, value || 0); }), { type: "number" }), makeInput("Y（向上）", node.y, (value) => mutate(() => { node.y = Math.max(0, value || 0); }), { type: "number" }));
  fields.appendChild(makeInput("描述", node.description || "", (value) => mutate(() => { if (value) node.description = value; else delete node.description; }), { multiline: true, rows: 3, wide: true }));
  els.inspector.appendChild(fields);
  const hiddenCard = h("div", "card");
  const hiddenLabel = h("label", "toggle-row");
  const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = Boolean(node.revealFlag); checkbox.disabled = node.id === map.startNodeId;
  checkbox.addEventListener("change", () => mutate(() => { if (checkbox.checked) node.revealFlag = "storyFlag"; else delete node.revealFlag; }));
  hiddenLabel.append(checkbox, document.createTextNode("隐藏节点：必须由 Flag 与已探索父节点共同揭示")); hiddenCard.appendChild(hiddenLabel);
  if (node.revealFlag) hiddenCard.appendChild(makeInput("揭示 Flag", node.revealFlag, (value) => mutate(() => { node.revealFlag = value; }), { wide: true }));
  els.inspector.appendChild(hiddenCard);
  els.inspector.appendChild(h("h4", "", "子节点"));
  map.edges.forEach((edge, index) => {
    if (edge.from !== node.id) return;
    const target = map.nodes.find((item) => item.id === edge.to);
    const button = h("button", `option-summary${selectedEdgeIndex === index ? " active" : ""}`);
    button.type = "button"; button.append(h("span", "", target?.label || edge.to), h("small", "", edge.activeWhen ? "条件通路" : "通路"));
    button.addEventListener("click", () => { selectedEdgeIndex = index; renderAll(); }); els.inspector.appendChild(button);
  });
}

function renderEdgeInspector() {
  const edge = currentEdge();
  if (!edge) return renderNodeInspector();
  els.inspectorKind.textContent = "父子连线";
  els.inspector.appendChild(h("h3", "", `${edge.from} → ${edge.to}`));
  const choices = map.nodes.map((node) => [node.id, `${node.label} · ${node.id}`]);
  const fields = h("div", "field-grid");
  fields.append(makeSelect("父节点", edge.from, choices, (value) => mutate(() => { edge.from = value; selectedNodeId = value; })), makeSelect("子节点", edge.to, choices, (value) => mutate(() => { edge.to = value; })));
  fields.appendChild(makeInput("备注", edge.note || "", (value) => mutate(() => { if (value) edge.note = value; else delete edge.note; }), { wide: true }));
  els.inspector.appendChild(fields);
  els.inspector.appendChild(h("h4", "", "通行条件 activeWhen"));
  els.inspector.appendChild(jsonConditionEditor(edge.activeWhen, (value) => mutate(() => { if (value) edge.activeWhen = value; else delete edge.activeWhen; })));
  const remove = h("button", "danger", "删除连线"); remove.type = "button"; remove.addEventListener("click", () => mutate(() => { map.edges.splice(selectedEdgeIndex, 1); selectedEdgeIndex = null; })); els.inspector.appendChild(remove);
}

function renderInspector() {
  els.inspector.replaceChildren();
  if (selectedEdgeIndex !== null) renderEdgeInspector(); else if (selectedNodeId) renderNodeInspector(); else renderMapInspector();
}

function renderAll() {
  const oldHeight = canvasHeight;
  const wasAtBottom = Math.abs(els.graph.scrollTop + els.graph.clientHeight - els.graph.scrollHeight) < 8;
  computeCanvas(); applyCanvasSize(); renderEdges(); renderNodes(); renderNodeList(); renderInspector();
  const node = currentNode();
  els.selectionStatus.textContent = currentEdge() ? `${currentEdge().from} → ${currentEdge().to}` : node ? `${node.id} · (${node.x}, ${node.y})` : "地图设置";
  els.deleteNode.disabled = !node || node.id === map.startNodeId;
  els.copyNode.disabled = !node || selectedEdgeIndex !== null;
  els.pasteNode.disabled = !nodeClipboard;
  if (wasAtBottom && oldHeight !== canvasHeight) els.graph.scrollTop = els.graph.scrollHeight;
  updateHistoryUi();
}

function addNode() {
  const parent = currentNode();
  const id = uniqueId("node");
  mutate(() => {
    const node = { id, label: "新节点", icon: "?", x: parent ? parent.x + 180 : 0, y: parent ? parent.y + 80 : 0, eventSetId: Object.keys(eventSets)[0] || "" };
    map.nodes.push(node);
    selectedNodeId = id; selectedEdgeIndex = null;
  });
}

function copySelectedNode() {
  const node = selectedEdgeIndex === null ? currentNode() : null;
  if (!node) return showFeedback("请先选择要复制的节点", true);
  nodeClipboard = clone(node);
  sessionStorage.setItem("node-editor-node-clipboard", JSON.stringify(nodeClipboard));
  els.pasteNode.disabled = false;
  showFeedback(`已复制节点 ${node.label}`);
}

function pasteCopiedNode() {
  if (!nodeClipboard) return showFeedback("还没有复制节点", true);
  const source = clone(nodeClipboard);
  const id = uniqueId(`${source.id}Copy`);
  let offset = 40;
  while (map.nodes.some((node) => node.x === source.x + offset && node.y === source.y + offset)) offset += 40;
  const pasted = {
    ...source,
    id,
    label: `${source.label} 副本`,
    x: Math.max(0, source.x + offset),
    y: Math.max(0, source.y + offset),
  };
  mutate(() => {
    map.nodes.push(pasted);
    selectedNodeId = id;
    selectedEdgeIndex = null;
  });
  showFeedback(`已粘贴 ${pasted.label}；未复制父子连线`);
}

function deleteSelectedNode() {
  const node = currentNode();
  if (!node || node.id === map.startNodeId) return showFeedback("不能删除起点", true);
  mutate(() => {
    map.nodes = map.nodes.filter((item) => item.id !== node.id);
    map.edges = map.edges.filter((edge) => edge.from !== node.id && edge.to !== node.id);
    selectedNodeId = map.startNodeId; selectedEdgeIndex = null;
  });
}

function validateCondition(group, field, errors) {
  if (!group) return;
  if (!["all", "any"].includes(group.mode) || !Array.isArray(group.clauses)) errors.push(`${field} 条件组格式无效`);
}
function validationResult() {
  const errors = [], warnings = [], ids = new Set();
  map.nodes.forEach((node) => {
    if (!ID_PATTERN.test(node.id)) errors.push(`节点 ID 无效：${node.id}`);
    if (ids.has(node.id)) errors.push(`节点 ID 重复：${node.id}`); ids.add(node.id);
    if (!node.label) errors.push(`节点 ${node.id} 缺少显示名`);
    if (!Number.isFinite(node.x) || node.x < 0 || !Number.isFinite(node.y) || node.y < 0) errors.push(`节点 ${node.id} 坐标必须为非负数`);
    if (!eventSets[node.eventSetId]) errors.push(`节点 ${node.id} 引用了未知事件集：${node.eventSetId || "(空)"}`);
    if (node.revealFlag !== undefined && !String(node.revealFlag).trim()) errors.push(`节点 ${node.id} 的揭示 Flag 为空`);
    if (node.id !== map.startNodeId && !map.edges.some((edge) => edge.to === node.id)) warnings.push(`节点 ${node.id} 没有父节点，运行时不可见`);
  });
  if (!ids.has(map.startNodeId)) errors.push("起点必须指向现有节点");
  if (map.nodes.find((node) => node.id === map.startNodeId)?.revealFlag) errors.push("起点不能是隐藏节点");
  map.edges.forEach((edge, index) => {
    if (!ids.has(edge.from) || !ids.has(edge.to)) errors.push(`连线 ${index + 1} 指向未知节点`);
    if (edge.from === edge.to) errors.push(`连线 ${index + 1} 不能连接自身`);
    if (map.edges.some((other, otherIndex) => otherIndex < index && other.from === edge.from && other.to === edge.to)) errors.push(`重复连线：${edge.from} → ${edge.to}`);
    validateCondition(edge.activeWhen, `edges[${index}].activeWhen`, errors);
  });
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
function showValidation() {
  const result = validationResult();
  const card = h("section", "card"); card.appendChild(h("h4", "", `检查：${result.errors.length} 错误，${result.warnings.length} 警告`));
  const list = h("ul", "validation-list");
  result.errors.forEach((message) => list.appendChild(h("li", "error", `错误：${message}`)));
  result.warnings.forEach((message) => list.appendChild(h("li", "warning", `警告：${message}`)));
  if (!result.errors.length && !result.warnings.length) list.appendChild(h("li", "", "配置完整，可以保存。"));
  card.appendChild(list); els.inspector.prepend(card);
  showFeedback(result.errors.length ? "存在阻止保存的错误" : result.warnings.length ? "结构通过，但有警告" : "检查通过", Boolean(result.errors.length));
  return result;
}

async function exportWorldMap() {
  selectedEdgeIndex = null; renderAll();
  const result = showValidation(); if (result.errors.length) return;
  const source = `"use strict";\n\n// 由 node-editor 导出。坐标原点位于地图左下角，X 向右、Y 向上。\nwindow.WORLD_MAP_BUNDLE = ${JSON.stringify(bundle, null, 2)};\n`;
  try {
    const response = await fetch("/__node_editor/save_world_map", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source }) });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
    cleanSnapshot = snapshot(); updateHistoryUi(); showFeedback("已保存 world-map.js");
  } catch (error) { showFeedback("保存失败：请通过启动节点编辑器.cmd 打开", true); console.error(error); }
}

function zoomAt(nextZoom, clientX, clientY) {
  nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
  const rect = els.graph.getBoundingClientRect();
  const worldX = (els.graph.scrollLeft + clientX - rect.left) / zoom;
  const worldY = (els.graph.scrollTop + clientY - rect.top) / zoom;
  zoom = nextZoom; sessionStorage.setItem("node-editor-graph-zoom", String(zoom)); renderAll();
  els.graph.scrollLeft = worldX * zoom - (clientX - rect.left);
  els.graph.scrollTop = worldY * zoom - (clientY - rect.top);
}

function initialize() {
  try {
    try {
      const savedClipboard = JSON.parse(sessionStorage.getItem("node-editor-node-clipboard") || "null");
      if (savedClipboard && typeof savedClipboard === "object" && ID_PATTERN.test(savedClipboard.id || "")) nodeClipboard = savedClipboard;
    } catch {}
    const saved = sessionStorage.getItem("node-editor-v3-draft");
    let source = window.WORLD_MAP_BUNDLE;
    if (saved) { try { const parsed = JSON.parse(saved); if (parsed?.schemaVersion === 3) source = parsed; } catch {} }
    bundle = normalizeBundle(source); map = bundle.map; selectedNodeId = map.startNodeId; resetHistory(); renderAll(); els.app.classList.remove("is-loading");
    requestAnimationFrame(() => { els.graph.scrollLeft = 0; els.graph.scrollTop = els.graph.scrollHeight; });
  } catch (error) { els.dirty.textContent = "载入失败"; showFeedback(error.message, true); console.error(error); }
}

els.mapSettings.addEventListener("click", () => { selectedNodeId = null; selectedEdgeIndex = null; renderAll(); });
els.addNode.addEventListener("click", addNode);
els.copyNode.addEventListener("click", copySelectedNode);
els.pasteNode.addEventListener("click", pasteCopiedNode);
els.deleteNode.addEventListener("click", deleteSelectedNode);
els.undo.addEventListener("click", () => restoreHistory(historyIndex - 1));
els.redo.addEventListener("click", () => restoreHistory(historyIndex + 1));
els.validate.addEventListener("click", () => { renderAll(); showValidation(); });
els.export.addEventListener("click", exportWorldMap);
els.graph.addEventListener("wheel", (event) => { event.preventDefault(); zoomAt(zoom * Math.exp(-event.deltaY * .0012), event.clientX, event.clientY); }, { passive: false });
els.graph.addEventListener("selectstart", (event) => event.preventDefault());
els.graph.addEventListener("dragstart", (event) => event.preventDefault());
els.graph.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest(".graph-node, .graph-edge-hit")) return;
  event.preventDefault();
  els.graph.setPointerCapture(event.pointerId);
  pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: els.graph.scrollLeft, top: els.graph.scrollTop };
  els.graph.classList.add("is-panning");
});
els.graph.addEventListener("pointermove", (event) => { if (!pan || pan.pointerId !== event.pointerId) return; els.graph.scrollLeft = pan.left - (event.clientX - pan.x); els.graph.scrollTop = pan.top - (event.clientY - pan.y); });
els.graph.addEventListener("pointerup", (event) => { if (!pan || pan.pointerId !== event.pointerId) return; pan = null; els.graph.classList.remove("is-panning"); });
els.graph.addEventListener("pointercancel", () => { pan = null; els.graph.classList.remove("is-panning"); });
document.addEventListener("pointermove", updateLinkDrag);
document.addEventListener("pointerup", finishLinkDrag);
document.addEventListener("pointercancel", cancelLinkDrag);
document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isEditing = target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);
  const commandKey = event.ctrlKey || event.metaKey;
  if (commandKey && !isEditing && event.key.toLowerCase() === "c") {
    event.preventDefault();
    copySelectedNode();
    return;
  }
  if (commandKey && !isEditing && event.key.toLowerCase() === "v") {
    event.preventDefault();
    pasteCopiedNode();
    return;
  }
  if (event.key === "Delete" && !isEditing && selectedNodeId && selectedEdgeIndex === null) {
    event.preventDefault();
    deleteSelectedNode();
    return;
  }
  if (event.key === "Escape") cancelLinkDrag();
  if (event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); restoreHistory(historyIndex - 1); }
  if (event.ctrlKey && event.key.toLowerCase() === "y") { event.preventDefault(); restoreHistory(historyIndex + 1); }
});
window.addEventListener("beforeunload", (event) => { if (snapshot() !== cleanSnapshot) { event.preventDefault(); event.returnValue = ""; } });

initialize();
