"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const TILE_SIZE = 34;
const MIN_MAP_SIZE = 5;
const MAX_MAP_SIZE = 80;
const TILE_BY_TOOL = { room: "r", corridor: ".", wall: "#" };
const TILE_NAME = { r: "房间", ".": "走廊", "#": "阻挡" };
const TERRAIN_PATTERNS = [
  { id: "editorRoomTerrain", file: "room-floor-v1.jpg", size: TILE_SIZE * 4, color: "#24231f", opacity: ".86" },
  { id: "editorCorridorTerrain", file: "drain-corridor-v1.jpg", size: TILE_SIZE * 4, color: "#3b3022", opacity: ".9" },
  { id: "editorWallTerrain", file: "thorn-wall-v1.jpg", size: TILE_SIZE * 4, color: "#0b0d0c", opacity: ".78" },
  { id: "editorVoidTerrain", file: "flesh-void-v1.jpg", size: TILE_SIZE * 5, color: "#030404", opacity: ".48" },
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const sourceBundle = window.WORLD_MAP_BUNDLE;
const registeredDefinitions = clone(sourceBundle?.objectDefinitions || {});

const els = {
  app: document.querySelector("#editorApp"),
  startScreen: document.querySelector("#startScreen"),
  startError: document.querySelector("#startError"),
  loadCurrent: document.querySelector("#loadCurrentButton"),
  newMap: document.querySelector("#newMapButton"),
  newWidth: document.querySelector("#newMapWidth"),
  newHeight: document.querySelector("#newMapHeight"),
  importButton: document.querySelector("#importButton"),
  importFile: document.querySelector("#importFile"),
  eyebrow: document.querySelector("#mapEyebrow"),
  title: document.querySelector("#mapTitle"),
  undo: document.querySelector("#undoButton"),
  redo: document.querySelector("#redoButton"),
  export: document.querySelector("#exportButton"),
  dirty: document.querySelector("#dirtyState"),
  toolButtons: [...document.querySelectorAll("[data-tool]")],
  paintTileHint: document.querySelector("#paintTileHint"),
  resizeButtons: [...document.querySelectorAll("[data-resize]")],
  mapSize: document.querySelector("#mapSize"),
  zoom: document.querySelector("#zoomRange"),
  zoomValue: document.querySelector("#zoomValue"),
  canvas: document.querySelector("#editorCanvas"),
  cursor: document.querySelector("#cursorPosition"),
  toolStatus: document.querySelector("#activeToolStatus"),
  feedback: document.querySelector("#feedback"),
  playerTemplate: document.querySelector("#playerTemplate"),
  playerPosition: document.querySelector("#playerPosition"),
  palette: document.querySelector("#objectPalette"),
  deleteSelection: document.querySelector("#deleteSelectionButton"),
  validate: document.querySelector("#validateButton"),
  validationSummary: document.querySelector("#validationSummary"),
  validationList: document.querySelector("#validationList"),
};

let map = null;
let tool = "select";
let paintTile = "r";
let zoom = 1;
let selection = null;
let placementTarget = null;
let rectStart = null;
let paintStroke = null;
let dragState = null;
let history = [];
let historyIndex = -1;
let cleanSnapshot = null;
let feedbackTimer = null;

function mapSnapshot() {
  return JSON.stringify(map);
}

function currentBundle() {
  return {
    schemaVersion: 1,
    objectDefinitions: clone(registeredDefinitions),
    map: clone(map),
  };
}

function getDimensions(targetMap = map) {
  return {
    width: targetMap?.grid?.[0] ? [...targetMap.grid[0]].length : 0,
    height: Array.isArray(targetMap?.grid) ? targetMap.grid.length : 0,
  };
}

function getTile(col, row) {
  return map.grid[row]?.[col];
}

function setTileValue(col, row, value) {
  const chars = [...map.grid[row]];
  chars[col] = value;
  map.grid[row] = chars.join("");
}

function objectAt(col, row, ignoredId = null) {
  return map.objects.find((object) => object.id !== ignoredId && object.col === col && object.row === row) || null;
}

function occupantAt(col, row, ignored = null) {
  if (ignored?.type !== "player" && map.playerStart.col === col && map.playerStart.row === row) return { type: "player" };
  const object = objectAt(col, row, ignored?.type === "object" ? ignored.id : null);
  return object ? { type: "object", id: object.id } : null;
}

function showFeedback(message, isError = false) {
  clearTimeout(feedbackTimer);
  els.feedback.textContent = message;
  els.feedback.classList.toggle("error", isError);
  feedbackTimer = setTimeout(() => {
    els.feedback.textContent = "";
    els.feedback.classList.remove("error");
  }, 3600);
}

function updateDirtyState() {
  const clean = cleanSnapshot !== null && mapSnapshot() === cleanSnapshot;
  els.dirty.textContent = clean ? "已保存" : "未保存";
  els.dirty.classList.toggle("saved", clean);
}

function resetHistory(isClean) {
  history = [mapSnapshot()];
  historyIndex = 0;
  cleanSnapshot = isClean ? history[0] : null;
  updateHistoryButtons();
  updateDirtyState();
}

function recordHistory() {
  const snapshot = mapSnapshot();
  if (snapshot === history[historyIndex]) return false;
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  historyIndex++;
  if (history.length > 100) {
    history.shift();
    historyIndex--;
  }
  updateHistoryButtons();
  updateDirtyState();
  return true;
}

function restoreHistory(nextIndex) {
  if (nextIndex < 0 || nextIndex >= history.length) return;
  historyIndex = nextIndex;
  map = JSON.parse(history[historyIndex]);
  selection = null;
  placementTarget = null;
  rectStart = null;
  syncMetaInputs();
  renderAll();
  updateHistoryButtons();
  updateDirtyState();
}

function updateHistoryButtons() {
  els.undo.disabled = historyIndex <= 0;
  els.redo.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
}

function setTool(nextTool) {
  tool = nextTool;
  if (TILE_BY_TOOL[tool]) paintTile = TILE_BY_TOOL[tool];
  rectStart = null;
  placementTarget = null;
  els.toolButtons.forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  els.paintTileHint.textContent = `矩形/填充使用最近选择的地形：${TILE_NAME[paintTile]}`;
  const names = { select: "选择工具", room: "绘制房间", corridor: "绘制走廊", wall: "绘制阻挡", rect: `矩形：${TILE_NAME[paintTile]}`, fill: `区域填充：${TILE_NAME[paintTile]}` };
  els.toolStatus.textContent = names[tool];
  renderCanvas();
  renderPalette();
}

function syncMetaInputs() {
  els.eyebrow.value = map.meta?.eyebrow || "";
  els.title.value = map.meta?.title || "";
}

function createBlankBundle(width, height) {
  const grid = Array.from({ length: height }, () => "#".repeat(width));
  const playerStart = { col: Math.floor(width / 2), row: Math.floor(height / 2) };
  const centerRow = [...grid[playerStart.row]];
  centerRow[playerStart.col] = "r";
  grid[playerStart.row] = centerRow.join("");
  return {
    schemaVersion: 1,
    objectDefinitions: clone(registeredDefinitions),
    map: {
      meta: { eyebrow: "未命名区域", title: "新地图" },
      grid,
      playerStart,
      objects: [],
    },
  };
}

function startEditing(bundle, isClean) {
  const candidate = {
    schemaVersion: bundle?.schemaVersion,
    objectDefinitions: clone(registeredDefinitions),
    map: clone(bundle?.map),
  };
  const result = validateBundle(candidate);
  if (result.errors.length) {
    els.startError.textContent = result.errors.join("；");
    return false;
  }
  map = candidate.map;
  selection = null;
  placementTarget = null;
  rectStart = null;
  syncMetaInputs();
  resetHistory(isClean);
  els.startScreen.classList.add("is-hidden");
  els.app.classList.remove("is-hidden");
  setTool("select");
  renderAll();
  return true;
}

function cellFromPointer(event) {
  const matrix = els.canvas.getScreenCTM();
  if (!matrix) return null;
  const point = els.canvas.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(matrix.inverse());
  const col = Math.floor(local.x / TILE_SIZE);
  const row = Math.floor(local.y / TILE_SIZE);
  const { width, height } = getDimensions();
  return col >= 0 && row >= 0 && col < width && row < height ? { col, row } : null;
}

function updateTileElement(col, row) {
  const tile = els.canvas.querySelector(`[data-cell="${col},${row}"]`);
  if (!tile) return;
  const value = getTile(col, row);
  tile.setAttribute("class", `editor-tile ${value === "r" ? "room" : value === "." ? "corridor" : "wall"}`);
}

function paintCell(col, row, value) {
  if (getTile(col, row) === value) return false;
  if (value === "#" && occupantAt(col, row)) {
    showFeedback("请先移动此格上的出生点或对象", true);
    return false;
  }
  setTileValue(col, row, value);
  updateTileElement(col, row);
  return true;
}

function applyRectangle(first, second) {
  const minCol = Math.min(first.col, second.col);
  const maxCol = Math.max(first.col, second.col);
  const minRow = Math.min(first.row, second.row);
  const maxRow = Math.max(first.row, second.row);
  if (paintTile === "#") {
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (occupantAt(col, row)) {
          showFeedback("矩形内有出生点或对象，未执行绘制", true);
          return;
        }
      }
    }
  }
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) setTileValue(col, row, paintTile);
  }
  recordHistory();
  renderAll();
}

function floodFill(start) {
  const source = getTile(start.col, start.row);
  if (source === paintTile) return;
  const { width, height } = getDimensions();
  const cells = [];
  const queue = [start];
  const visited = new Set();
  while (queue.length) {
    const cell = queue.shift();
    const key = `${cell.col},${cell.row}`;
    if (visited.has(key) || getTile(cell.col, cell.row) !== source) continue;
    visited.add(key);
    cells.push(cell);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const col = cell.col + dx;
      const row = cell.row + dy;
      if (col >= 0 && row >= 0 && col < width && row < height) queue.push({ col, row });
    });
  }
  if (paintTile === "#" && cells.some((cell) => occupantAt(cell.col, cell.row))) {
    showFeedback("填充区域内有出生点或对象，未执行填充", true);
    return;
  }
  cells.forEach((cell) => setTileValue(cell.col, cell.row, paintTile));
  recordHistory();
  renderAll();
}

function placeTargetAt(target, cell) {
  if (getTile(cell.col, cell.row) === "#") {
    showFeedback("对象只能放在房间或走廊格", true);
    return false;
  }
  const occupied = occupantAt(cell.col, cell.row, target);
  if (occupied) {
    showFeedback("该格已经有其他对象", true);
    return false;
  }
  if (target.type === "player") {
    map.playerStart = { ...cell };
    selection = { type: "player" };
  } else {
    const object = map.objects.find((entry) => entry.id === target.id);
    if (object) Object.assign(object, cell);
    else map.objects.push({ id: target.id, ...cell });
    selection = { type: "object", id: target.id };
  }
  placementTarget = null;
  recordHistory();
  renderAll();
  return true;
}

function deleteSelectedObject() {
  if (selection?.type !== "object") return;
  const before = map.objects.length;
  map.objects = map.objects.filter((object) => object.id !== selection.id);
  if (map.objects.length === before) return;
  selection = null;
  placementTarget = null;
  recordHistory();
  renderAll();
  showFeedback("对象已移回摆放列表");
}

function createTerrainDefinitions() {
  const defs = document.createElementNS(SVG_NS, "defs");
  TERRAIN_PATTERNS.forEach((terrain) => {
    const pattern = document.createElementNS(SVG_NS, "pattern");
    pattern.id = terrain.id;
    pattern.setAttribute("width", terrain.size);
    pattern.setAttribute("height", terrain.size);
    pattern.setAttribute("patternUnits", "userSpaceOnUse");

    const base = document.createElementNS(SVG_NS, "rect");
    base.setAttribute("width", terrain.size);
    base.setAttribute("height", terrain.size);
    base.setAttribute("fill", terrain.color);

    const texture = document.createElementNS(SVG_NS, "image");
    texture.setAttribute("href", `../assets/map-terrain/${terrain.file}`);
    texture.setAttribute("width", terrain.size);
    texture.setAttribute("height", terrain.size);
    texture.setAttribute("opacity", terrain.opacity);
    texture.setAttribute("preserveAspectRatio", "xMidYMid slice");
    pattern.append(base, texture);
    defs.appendChild(pattern);
  });
  return defs;
}

function renderCanvas() {
  const { width, height } = getDimensions();
  els.canvas.setAttribute("viewBox", `0 0 ${width * TILE_SIZE} ${height * TILE_SIZE}`);
  els.canvas.setAttribute("width", width * TILE_SIZE * zoom);
  els.canvas.setAttribute("height", height * TILE_SIZE * zoom);
  els.canvas.innerHTML = "";
  els.canvas.appendChild(createTerrainDefinitions());

  const tileLayer = document.createElementNS(SVG_NS, "g");
  tileLayer.classList.add("tile-layer");
  map.grid.forEach((rowTiles, row) => {
    [...rowTiles].forEach((value, col) => {
      const neighborWalkable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const neighbor = map.grid[row + dy]?.[col + dx];
        return neighbor && neighbor !== "#";
      });
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", col * TILE_SIZE + 1);
      rect.setAttribute("y", row * TILE_SIZE + 1);
      rect.setAttribute("width", TILE_SIZE - 2);
      rect.setAttribute("height", TILE_SIZE - 2);
      rect.setAttribute("rx", "2");
      rect.dataset.cell = `${col},${row}`;
      const terrainClass = value === "r" ? "room" : value === "." ? "corridor" : neighborWalkable ? "wall" : "void";
      rect.setAttribute("class", `editor-tile ${terrainClass}`);
      if (rectStart?.col === col && rectStart?.row === row) rect.classList.add("rect-origin");
      tileLayer.appendChild(rect);
    });
  });
  els.canvas.appendChild(tileLayer);

  const objectLayer = document.createElementNS(SVG_NS, "g");
  map.objects.forEach((object) => {
    const definition = registeredDefinitions[object.id];
    if (!definition) return;
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("transform", `translate(${object.col * TILE_SIZE + TILE_SIZE / 2} ${object.row * TILE_SIZE + TILE_SIZE / 2})`);
    group.setAttribute("class", `editor-object ${definition.type}${selection?.type === "object" && selection.id === object.id ? " selected" : ""}`);
    group.dataset.objectId = object.id;
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("class", "ring");
    ring.setAttribute("r", "12");
    const icon = document.createElementNS(SVG_NS, "text");
    icon.setAttribute("class", "icon");
    icon.setAttribute("dy", "6");
    icon.textContent = definition.icon;
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "label");
    label.setAttribute("y", "26");
    label.textContent = definition.label;
    group.append(ring, icon, label);
    objectLayer.appendChild(group);
  });
  els.canvas.appendChild(objectLayer);

  const player = document.createElementNS(SVG_NS, "g");
  player.setAttribute("transform", `translate(${map.playerStart.col * TILE_SIZE + TILE_SIZE / 2} ${map.playerStart.row * TILE_SIZE + TILE_SIZE / 2})`);
  player.setAttribute("class", `editor-player${selection?.type === "player" ? " selected" : ""}`);
  player.dataset.player = "true";
  const playerRing = document.createElementNS(SVG_NS, "circle");
  playerRing.setAttribute("class", "ring");
  playerRing.setAttribute("r", "10");
  const playerIcon = document.createElementNS(SVG_NS, "text");
  playerIcon.setAttribute("dy", "5");
  playerIcon.textContent = "✦";
  player.append(playerRing, playerIcon);
  els.canvas.appendChild(player);
}

function renderPalette() {
  els.palette.innerHTML = "";
  const placements = new Map(map.objects.map((object) => [object.id, object]));
  Object.entries(registeredDefinitions).forEach(([id, definition]) => {
    const object = placements.get(id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "object-template";
    if (object) button.classList.add("placed");
    if (selection?.type === "object" && selection.id === id) button.classList.add("selected");
    const icon = document.createElement("b");
    icon.textContent = definition.icon;
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = definition.label;
    const position = document.createElement("small");
    position.textContent = object ? `(${object.col}, ${object.row}) · 点击移动` : "未放置 · 点击摆放";
    const objectId = document.createElement("em");
    objectId.textContent = id;
    copy.append(name, position);
    button.append(icon, copy, objectId);
    button.addEventListener("click", () => {
      selection = { type: "object", id };
      placementTarget = { type: "object", id };
      setTool("select");
      placementTarget = { type: "object", id };
      els.toolStatus.textContent = `${object ? "移动" : "放置"}：${definition.label}`;
      renderCanvas();
      renderPalette();
    });
    els.palette.appendChild(button);
  });
  els.playerPosition.textContent = `(${map.playerStart.col}, ${map.playerStart.row}) · 点击移动`;
  els.playerTemplate.classList.toggle("selected", selection?.type === "player");
  els.deleteSelection.disabled = selection?.type !== "object";
}

function renderValidation() {
  const result = validateBundle(currentBundle());
  els.validationList.innerHTML = "";
  if (!result.errors.length && !result.warnings.length) {
    els.validationSummary.className = "validation-summary ok";
    els.validationSummary.textContent = "地图结构与连通性检查通过";
    return result;
  }
  els.validationSummary.className = `validation-summary${result.errors.length ? " error" : ""}`;
  els.validationSummary.textContent = `${result.errors.length} 个错误 · ${result.warnings.length} 个警告`;
  result.errors.forEach((message) => appendValidationItem("错误", message, "error"));
  result.warnings.forEach((message) => appendValidationItem("警告", message, "warning"));
  return result;
}

function appendValidationItem(prefix, message, className) {
  const item = document.createElement("li");
  item.className = className;
  item.textContent = `${prefix}：${message}`;
  els.validationList.appendChild(item);
}

function renderAll() {
  const { width, height } = getDimensions();
  els.mapSize.textContent = `${width} × ${height}`;
  renderCanvas();
  renderPalette();
  renderValidation();
  updateDirtyState();
}

function resizeMap(edge, delta) {
  const { width, height } = getDimensions();
  const nextWidth = width + (edge === "left" || edge === "right" ? delta : 0);
  const nextHeight = height + (edge === "top" || edge === "bottom" ? delta : 0);
  if (nextWidth < MIN_MAP_SIZE || nextHeight < MIN_MAP_SIZE || nextWidth > MAX_MAP_SIZE || nextHeight > MAX_MAP_SIZE) {
    showFeedback(`地图尺寸必须保持在 ${MIN_MAP_SIZE}–${MAX_MAP_SIZE} 格`, true);
    return;
  }
  if (delta < 0) {
    const removedCol = edge === "left" ? 0 : edge === "right" ? width - 1 : null;
    const removedRow = edge === "top" ? 0 : edge === "bottom" ? height - 1 : null;
    const clipsPlayer = (removedCol !== null && map.playerStart.col === removedCol) || (removedRow !== null && map.playerStart.row === removedRow);
    const clippedObject = map.objects.find((object) => (removedCol !== null && object.col === removedCol) || (removedRow !== null && object.row === removedRow));
    if (clipsPlayer || clippedObject) {
      showFeedback(clipsPlayer ? "该边缘包含玩家出生点，请先移动" : `该边缘包含 ${registeredDefinitions[clippedObject.id]?.label || clippedObject.id}，请先移动`, true);
      return;
    }
  }

  if (edge === "top") {
    if (delta > 0) {
      map.grid.unshift("#".repeat(width));
      map.playerStart.row++;
      map.objects.forEach((object) => object.row++);
    } else {
      map.grid.shift();
      map.playerStart.row--;
      map.objects.forEach((object) => object.row--);
    }
  } else if (edge === "bottom") {
    if (delta > 0) map.grid.push("#".repeat(width));
    else map.grid.pop();
  } else if (edge === "left") {
    map.grid = map.grid.map((row) => delta > 0 ? `#${row}` : row.slice(1));
    map.playerStart.col += delta;
    map.objects.forEach((object) => object.col += delta);
  } else if (edge === "right") {
    map.grid = map.grid.map((row) => delta > 0 ? `${row}#` : row.slice(0, -1));
  }
  recordHistory();
  renderAll();
}

function getReachable(targetMap, gateClosed) {
  const { width, height } = getDimensions(targetMap);
  const gate = targetMap.objects.find((object) => object.id === "gate");
  const start = targetMap.playerStart;
  if (!start || targetMap.grid[start.row]?.[start.col] === "#") return new Set();
  const visited = new Set();
  const queue = [{ ...start }];
  while (queue.length) {
    const cell = queue.shift();
    const key = `${cell.col},${cell.row}`;
    if (visited.has(key)) continue;
    if (cell.col < 0 || cell.row < 0 || cell.col >= width || cell.row >= height) continue;
    if (targetMap.grid[cell.row][cell.col] === "#") continue;
    if (gateClosed && gate && cell.col === gate.col && cell.row === gate.row) continue;
    visited.add(key);
    queue.push(
      { col: cell.col + 1, row: cell.row },
      { col: cell.col - 1, row: cell.row },
      { col: cell.col, row: cell.row + 1 },
      { col: cell.col, row: cell.row - 1 },
    );
  }
  return visited;
}

function validateBundle(bundle) {
  const errors = [];
  const warnings = [];
  if (!bundle || bundle.schemaVersion !== 1) return { errors: ["schemaVersion 必须为 1"], warnings };
  const definitions = registeredDefinitions;
  const targetMap = bundle.map;
  if (!targetMap || typeof targetMap !== "object") return { errors: ["缺少 map 对象"], warnings };
  const grid = targetMap.grid;
  if (!Array.isArray(grid)) return { errors: ["grid 必须是字符串数组"], warnings };
  const height = grid.length;
  const width = typeof grid[0] === "string" ? [...grid[0]].length : 0;
  if (width < MIN_MAP_SIZE || width > MAX_MAP_SIZE) errors.push(`地图宽度必须为 ${MIN_MAP_SIZE}–${MAX_MAP_SIZE} 格`);
  if (height < MIN_MAP_SIZE || height > MAX_MAP_SIZE) errors.push(`地图高度必须为 ${MIN_MAP_SIZE}–${MAX_MAP_SIZE} 格`);
  if (grid.some((row) => typeof row !== "string" || [...row].length !== width)) errors.push("地图每一行必须等宽");
  if (grid.some((row) => typeof row === "string" && /[^#r.]/.test(row))) errors.push("地图只能包含 #、r、. 三种地形");
  const inBounds = (point) => Number.isInteger(point?.col) && Number.isInteger(point?.row) && point.col >= 0 && point.row >= 0 && point.col < width && point.row < height;
  const walkable = (point) => inBounds(point) && grid[point.row]?.[point.col] !== "#";
  if (!inBounds(targetMap.playerStart)) errors.push("玩家出生点缺失或越界");
  else if (!walkable(targetMap.playerStart)) errors.push("玩家出生点必须位于可通行格");
  if (!Array.isArray(targetMap.objects)) errors.push("objects 必须是数组");

  const ids = new Set();
  const cells = new Set(inBounds(targetMap.playerStart) ? [`${targetMap.playerStart.col},${targetMap.playerStart.row}`] : []);
  (Array.isArray(targetMap.objects) ? targetMap.objects : []).forEach((object) => {
    if (!definitions[object?.id]) errors.push(`未知对象 id：${object?.id || "(空)"}`);
    if (ids.has(object?.id)) errors.push(`对象 id 重复：${object.id}`);
    ids.add(object?.id);
    if (!inBounds(object)) errors.push(`对象 ${object?.id || "(空)"} 坐标越界`);
    else if (!walkable(object)) errors.push(`对象 ${object.id} 必须位于可通行格`);
    const cellKey = `${object?.col},${object?.row}`;
    if (cells.has(cellKey)) errors.push(`出生点或多个对象重叠在 (${object?.col}, ${object?.row})`);
    cells.add(cellKey);
  });
  const missing = Object.keys(definitions).filter((id) => !ids.has(id));
  if (missing.length) warnings.push(`未放置已登记对象：${missing.join("、")}`);

  if (!errors.length) {
    const reachableOpen = getReachable(targetMap, false);
    const reachableClosed = getReachable(targetMap, true);
    const floorCount = grid.reduce((total, row) => total + [...row].filter((tile) => tile !== "#").length, 0);
    if (reachableOpen.size < floorCount) warnings.push(`有 ${floorCount - reachableOpen.size} 个可通行格与出生点隔绝`);
    const unreachableObjects = targetMap.objects.filter((object) => !reachableOpen.has(`${object.col},${object.row}`));
    if (unreachableObjects.length) warnings.push(`开门后仍不可达的对象：${unreachableObjects.map((object) => object.id).join("、")}`);
    const gate = targetMap.objects.find((object) => object.id === "gate");
    if (gate && reachableOpen.size === reachableClosed.size) warnings.push("封锁山道没有切断任何可通行区域，关门状态未形成有效阻挡");
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function serializeBundle(bundle) {
  return `"use strict";\n\n// 由 map-editor 导出。对象行为仍在 world.js 中登记。\nwindow.WORLD_MAP_BUNDLE = ${JSON.stringify(bundle, null, 2)};\n`;
}

function parseMapScript(text) {
  let source = text.replace(/^\uFEFF/, "");
  const assignmentAt = source.indexOf("window.WORLD_MAP_BUNDLE");
  if (assignmentAt < 0) throw new Error("没有找到 window.WORLD_MAP_BUNDLE 赋值");
  const prefix = source.slice(0, assignmentAt)
    .replace(/^\s*"use strict";?/, "")
    .replace(/^\s*(?:\/\/[^\r\n]*(?:\r?\n|$)\s*)*/, "")
    .trim();
  if (prefix) throw new Error("赋值之前含有不受支持的代码");
  source = source.slice(assignmentAt);
  const match = source.match(/^window\.WORLD_MAP_BUNDLE\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error("文件必须只包含固定的 WORLD_MAP_BUNDLE 赋值");
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error("WORLD_MAP_BUNDLE 必须是严格 JSON 数据，不能包含函数或注释");
  }
}

function exportMap() {
  const result = renderValidation();
  if (result.errors.length) {
    showFeedback("请先修复阻止导出的地图错误", true);
    return;
  }
  if (result.warnings.length && !window.confirm(`地图有 ${result.warnings.length} 个警告，仍要导出吗？`)) return;
  const source = serializeBundle(currentBundle());
  const blob = new Blob([source], { type: "text/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "world-map.js";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  cleanSnapshot = mapSnapshot();
  updateDirtyState();
  showFeedback("已导出 world-map.js");
}

els.canvas.addEventListener("pointerdown", (event) => {
  if (!map) return;
  const cell = cellFromPointer(event);
  if (!cell) return;
  els.canvas.setPointerCapture(event.pointerId);
  const objectGroup = event.target.closest?.(".editor-object");
  const playerGroup = event.target.closest?.(".editor-player");
  if (tool === "select" && !placementTarget && (objectGroup || playerGroup)) {
    selection = objectGroup ? { type: "object", id: objectGroup.dataset.objectId } : { type: "player" };
    dragState = { target: clone(selection), start: cell };
    renderCanvas();
    renderPalette();
    return;
  }
  if (placementTarget) {
    placeTargetAt(placementTarget, cell);
    return;
  }
  if (TILE_BY_TOOL[tool]) {
    paintStroke = { changed: paintCell(cell.col, cell.row, paintTile), last: cell };
    return;
  }
  if (tool === "rect") {
    if (!rectStart) {
      rectStart = cell;
      showFeedback("请选择矩形的另一个角");
      renderCanvas();
    } else {
      const first = rectStart;
      rectStart = null;
      applyRectangle(first, cell);
    }
    return;
  }
  if (tool === "fill") {
    floodFill(cell);
    return;
  }
  selection = null;
  renderCanvas();
  renderPalette();
});

els.canvas.addEventListener("pointermove", (event) => {
  if (!map) return;
  const cell = cellFromPointer(event);
  els.cursor.textContent = cell ? `坐标 ${cell.col}, ${cell.row} · ${TILE_NAME[getTile(cell.col, cell.row)]}` : "坐标 —";
  if (!paintStroke || !cell) return;
  if (paintStroke.last.col === cell.col && paintStroke.last.row === cell.row) return;
  paintStroke.last = cell;
  paintStroke.changed = paintCell(cell.col, cell.row, paintTile) || paintStroke.changed;
});

function finishPointer(event) {
  const cell = cellFromPointer(event);
  if (paintStroke) {
    if (paintStroke.changed) {
      recordHistory();
      renderValidation();
      updateDirtyState();
    }
    paintStroke = null;
  }
  if (dragState) {
    const target = dragState.target;
    dragState = null;
    if (cell) placeTargetAt(target, cell);
  }
}

els.canvas.addEventListener("pointerup", finishPointer);
els.canvas.addEventListener("pointercancel", finishPointer);
els.canvas.addEventListener("pointerleave", (event) => {
  if (!paintStroke && !dragState) els.cursor.textContent = "坐标 —";
});

els.toolButtons.forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
els.resizeButtons.forEach((button) => button.addEventListener("click", () => {
  const [edge, delta] = button.dataset.resize.split(":");
  resizeMap(edge, Number(delta));
}));

els.playerTemplate.addEventListener("click", () => {
  selection = { type: "player" };
  setTool("select");
  placementTarget = { type: "player" };
  els.toolStatus.textContent = "移动：玩家出生点";
  renderCanvas();
  renderPalette();
});

els.deleteSelection.addEventListener("click", deleteSelectedObject);
els.undo.addEventListener("click", () => restoreHistory(historyIndex - 1));
els.redo.addEventListener("click", () => restoreHistory(historyIndex + 1));
els.validate.addEventListener("click", () => {
  const result = renderValidation();
  showFeedback(result.errors.length ? "地图仍有错误" : result.warnings.length ? "地图可导出，但仍有警告" : "地图检查通过", Boolean(result.errors.length));
});
els.export.addEventListener("click", exportMap);

els.zoom.addEventListener("input", () => {
  zoom = Number(els.zoom.value) / 100;
  els.zoomValue.textContent = `${els.zoom.value}%`;
  renderCanvas();
});

els.eyebrow.addEventListener("input", () => {
  map.meta = map.meta || {};
  map.meta.eyebrow = els.eyebrow.value;
  updateDirtyState();
});
els.eyebrow.addEventListener("change", () => { recordHistory(); renderValidation(); });
els.title.addEventListener("input", () => {
  map.meta = map.meta || {};
  map.meta.title = els.title.value;
  updateDirtyState();
});
els.title.addEventListener("change", () => { recordHistory(); renderValidation(); });

els.loadCurrent.addEventListener("click", () => {
  if (!sourceBundle) {
    els.startError.textContent = "未能读取 ../world-map.js";
    return;
  }
  startEditing(sourceBundle, true);
});

els.newMap.addEventListener("click", () => {
  const width = Number(els.newWidth.value);
  const height = Number(els.newHeight.value);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < MIN_MAP_SIZE || height < MIN_MAP_SIZE || width > MAX_MAP_SIZE || height > MAX_MAP_SIZE) {
    els.startError.textContent = `宽高必须是 ${MIN_MAP_SIZE}–${MAX_MAP_SIZE} 之间的整数`;
    return;
  }
  startEditing(createBlankBundle(width, height), false);
});

els.importButton.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files?.[0];
  if (!file) return;
  try {
    const imported = parseMapScript(await file.text());
    startEditing(imported, true);
  } catch (error) {
    els.startError.textContent = error.message;
  } finally {
    els.importFile.value = "";
  }
});

document.addEventListener("keydown", (event) => {
  if (!map || els.app.classList.contains("is-hidden")) return;
  const editingText = event.target instanceof HTMLInputElement;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    restoreHistory(historyIndex + (event.shiftKey ? 1 : -1));
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    restoreHistory(historyIndex + 1);
  } else if (!editingText && event.key === "Delete") {
    event.preventDefault();
    deleteSelectedObject();
  } else if (event.key === "Escape") {
    placementTarget = null;
    rectStart = null;
    setTool("select");
    showFeedback("已取消当前操作");
  }
});

window.addEventListener("beforeunload", (event) => {
  if (map && (cleanSnapshot === null || mapSnapshot() !== cleanSnapshot)) event.preventDefault();
});

if (!sourceBundle || !Object.keys(registeredDefinitions).length) {
  els.startError.textContent = "地图对象定义未载入，请确认 ../world-map.js 存在且格式正确。";
  els.loadCurrent.disabled = true;
  els.newMap.disabled = true;
  els.importButton.disabled = true;
}
