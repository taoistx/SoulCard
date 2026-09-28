"use strict";

// 这是 Vertical Slice 的 World 层：明确的数据与分支，不引入通用事件图或规则引擎。
const $w = (selector) => document.querySelector(selector);
const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_MAP_VIEW_WIDTH = 1000;
const DEFAULT_MAP_VIEW_HEIGHT = 680;
const MAP_MARGIN = 70;
const CAMERA_SAFE_MARGIN = 120;
const MAX_STAMINA = 6;
const WORLD_DIALOGUE_IDS = new Set(["start", "siltWoods", "drownedHuts", "bellRoad", "hut", "gate", "church", "quietClearing", "node2", "node3"]);

function validateConditionConfig(group, field, errors) {
  if (!group) return;
  if (!["all", "any"].includes(group.mode) || !Array.isArray(group.clauses)) {
    errors.push(`${field} 条件组格式无效`);
    return;
  }
  group.clauses.forEach((clause, index) => {
    if (!clause || typeof clause.source !== "string" || typeof clause.operator !== "string") errors.push(`${field}.clauses[${index}] 条件无效`);
  });
}

function validateWorldConfiguration(mapBundle, eventBundle) {
  const errors = [];
  if (!mapBundle || mapBundle.schemaVersion !== 3) return ["缺少受支持的 WORLD_MAP_BUNDLE（schemaVersion 必须为 3）"];
  if (!eventBundle || eventBundle.schemaVersion !== 1 || !eventBundle.eventSets) return ["缺少受支持的 WORLD_EVENT_SET_BUNDLE"];
  const map = mapBundle.map;
  if (!map || typeof map !== "object") return ["map 必须是对象"];
  if (!Array.isArray(map.nodes) || !map.nodes.length) errors.push("nodes 必须是非空数组");
  if (!Array.isArray(map.edges)) errors.push("edges 必须是数组");

  const eventSetIds = new Set(Object.keys(eventBundle.eventSets));
  Object.entries(eventBundle.eventSets).forEach(([setId, set]) => {
    if (!set || typeof set.name !== "string" || !set.name.trim()) errors.push(`事件集 ${setId} 缺少名称`);
    if (!Array.isArray(set?.entries) || !set.entries.length) errors.push(`事件集 ${setId} 至少需要一个元素`);
    const entryIds = new Set();
    (set?.entries || []).forEach((entry, index) => {
      const field = `事件集 ${setId}.entries[${index}]`;
      if (typeof entry?.id !== "string" || !entry.id) errors.push(`${field} 缺少 id`);
      if (entryIds.has(entry?.id)) errors.push(`${field} id 重复：${entry.id}`);
      entryIds.add(entry?.id);
      if (!["npc", "dialogue", "battle"].includes(entry?.kind)) errors.push(`${field} kind 无效`);
      if (!Number.isFinite(entry?.weight) || entry.weight <= 0) errors.push(`${field} weight 必须大于 0`);
      if (entry?.kind === "npc" && typeof entry.npcId !== "string") errors.push(`${field} 缺少 npcId`);
      if (entry?.kind === "dialogue" && !WORLD_DIALOGUE_IDS.has(entry.dialogueId)) errors.push(`${field} 引用了未知世界对话`);
      if (entry?.kind === "battle" && typeof entry.enemyId !== "string") errors.push(`${field} 缺少 enemyId`);
      validateConditionConfig(entry?.when, `${field}.when`, errors);
    });
  });

  const nodeIds = new Set();
  (Array.isArray(map.nodes) ? map.nodes : []).forEach((node) => {
    if (typeof node?.id !== "string" || !node.id) errors.push("节点 id 必须是非空字符串");
    if (nodeIds.has(node?.id)) errors.push(`节点 id 重复：${node.id}`);
    nodeIds.add(node?.id);
    if (typeof node?.label !== "string" || !node.label) errors.push(`节点 ${node?.id || "(空)"} 缺少 label`);
    if (!Number.isFinite(node?.x) || node.x < 0) errors.push(`节点 ${node?.id || "(空)"} x 必须大于等于 0`);
    if (!Number.isFinite(node?.y) || node.y < 0) errors.push(`节点 ${node?.id || "(空)"} y 必须大于等于 0`);
    if (typeof node?.eventSetId !== "string" || !eventSetIds.has(node.eventSetId)) errors.push(`节点 ${node?.id || "(空)"} 引用了未知事件集`);
    if (node?.revealFlag !== undefined && (typeof node.revealFlag !== "string" || !node.revealFlag.trim())) errors.push(`节点 ${node.id} revealFlag 无效`);
  });
  if (!nodeIds.has(map.startNodeId)) errors.push("startNodeId 必须指向现有节点");
  if (map.nodes?.find((node) => node.id === map.startNodeId)?.revealFlag) errors.push("起点不能是隐藏节点");
  (Array.isArray(map.edges) ? map.edges : []).forEach((edge, index) => {
    if (!nodeIds.has(edge?.from)) errors.push(`edges[${index}].from 指向未知节点`);
    if (!nodeIds.has(edge?.to)) errors.push(`edges[${index}].to 指向未知节点`);
    if (edge?.from === edge?.to) errors.push(`edges[${index}] 不能连接自身`);
    validateConditionConfig(edge?.activeWhen, `edges[${index}].activeWhen`, errors);
  });
  return [...new Set(errors)];
}

const MAP_CONFIG_ERRORS = validateWorldConfiguration(window.WORLD_MAP_BUNDLE, window.WORLD_EVENT_SET_BUNDLE);
const WORLD_MAP_BUNDLE = MAP_CONFIG_ERRORS.length ? {
  schemaVersion: 3,
  map: {
    meta: { eyebrow: "地图配置错误", title: "无法载入地图" },
    startNodeId: "start",
    nodes: [{ id: "start", icon: "!", label: "配置错误", x: 0, y: 0, eventSetId: "error" }],
    edges: [],
  },
} : window.WORLD_MAP_BUNDLE;
const WORLD_MAP = WORLD_MAP_BUNDLE.map;
const WORLD_NODES = WORLD_MAP.nodes.map((node) => ({ icon: "?", description: "", ...node }));
const WORLD_EDGES = WORLD_MAP.edges || [];
const NODE_BY_ID = new Map(WORLD_NODES.map((node) => [node.id, node]));
const WORLD_EVENT_SETS = MAP_CONFIG_ERRORS.length ? {} : window.WORLD_EVENT_SET_BUNDLE.eventSets;

const ITEM_LIBRARY = {
  freshFlesh: { name: "新鲜血肉", description: "仍有人血肉特征的部分。艾迪只认这个。", stackable: true },
  oldKey: { name: "老旧钥匙", description: "粪锈遮住了齿纹，也许能打开山道的锁。", keyItem: true },
  healingPotion: { name: "止血瓶", description: "使用后恢复 18 HP。不会推进天数。", usable: true },
  ritualScrap: { name: "秘仪残页", description: "记载卡牌「割裂时序」。心脏仍在时无法使用。", keyItem: true },
  rustySword: { name: "锈剑", description: "单手武器：攻击卡伤害 +1，可选择左手或右手。", slot: "hand", modifiers: { attackBonus: 1 } },
  longSword: { name: "长剑", description: "单手武器：攻击卡伤害 +3。", slot: "hand", modifiers: { attackBonus: 3 } },
  dagger: { name: "剔骨匕首", description: "单手武器：1 时刻攻击额外施加 1 层流血。", slot: "hand", modifiers: { bleedOnFastAttack: true } },
  greatSword: { name: "排污双手剑", description: "占据双手；攻击耗时 +1，拼刀伤害翻倍。", slot: "bothHands", modifiers: { attackCost: 1, doubleClashDamage: true } },
  shield: { name: "井盖盾", description: "单手装备：防御卡格挡 +4。", slot: "hand", modifiers: { blockBonus: 4 } },
  heavyArmor: { name: "铸铁浴缸甲", description: "身体：补牌保留格挡，但补牌 CD +1。", slot: "body", modifiers: { retainBlockOnRefill: true, refillCooldown: 1 } },
  gi: { name: "污白道服", description: "身体：保留当前手牌，只补足手牌差值。", slot: "body", modifiers: { preserveHandOnRefill: true } },
  ladyHat: { name: "克里斯的礼帽", description: "头部：一件仍坚持体面的维多利亚礼帽。", slot: "head", modifiers: {} },
};

const BODY_SLOTS = [
  ["leftHand", "左手", "装备位"],
  ["rightHand", "右手", "装备位"],
  ["body", "身体", "装备位"],
  ["head", "头", "装备位"],
  ["eye", "眼", "核心器官"],
  ["heart", "心", "核心器官"],
  ["brain", "脑", "核心器官"],
];

const elsWorld = {
  mapScreen: $w("#mapScreen"),
  game: $w("#game"),
  mapSvg: $w("#mapSvg"),
  mapContent: $w("#mapContent"),
  ground: $w("#worldGround"),
  edges: $w("#worldEdges"),
  nodes: $w("#worldNodes"),
  player: $w("#mapPlayer"),
  prompt: $w("#interactionPrompt"),
  mapHint: $w("#mapHint"),
  eyebrow: $w("#worldEyebrow"),
  title: $w("#worldTitle"),
  day: $w("#worldDay"),
  daysLeft: $w("#daysLeft"),
  hp: $w("#worldHp"),
  hpFill: $w("#worldHpFill"),
  stamina: $w("#worldStamina"),
  staminaFill: $w("#worldStaminaFill"),
  flagCount: $w("#flagCount"),
  modal: $w("#worldModal"),
  modalKicker: $w("#worldModalKicker"),
  modalTitle: $w("#worldModalTitle"),
  modalBody: $w("#worldModalBody"),
  modalOptions: $w("#worldModalOptions"),
  characterButton: $w("#characterButton"),
  longRestButton: $w("#longRestButton"),
  characterPanel: $w("#characterPanel"),
  closeCharacterButton: $w("#closeCharacterButton"),
  humanSynergy: $w("#humanSynergy"),
  bodySlots: $w("#bodySlots"),
  inventoryList: $w("#inventoryList"),
  deckSummary: $w("#deckSummary"),
  focusPlayerButton: $w("#focusPlayerButton"),
};

const mapExtent = {
  width: Math.max(DEFAULT_MAP_VIEW_WIDTH, ...WORLD_NODES.map((node) => node.x + MAP_MARGIN * 2)),
  height: Math.max(DEFAULT_MAP_VIEW_HEIGHT, ...WORLD_NODES.map((node) => node.y + MAP_MARGIN * 2)),
};
const camera = { x: 0, y: 0, width: DEFAULT_MAP_VIEW_WIDTH, height: DEFAULT_MAP_VIEW_HEIGHT };
let mapDrag = null;
let suppressMapClick = false;
let cameraAnimationFrame = null;

function mapPoint(node) {
  return { x: MAP_MARGIN + node.x, y: mapExtent.height - MAP_MARGIN - node.y };
}

function clampCamera() {
  camera.x = Math.max(0, Math.min(camera.x, Math.max(0, mapExtent.width - camera.width)));
  camera.y = Math.max(0, Math.min(camera.y, Math.max(0, mapExtent.height - camera.height)));
}

function applyCamera() {
  clampCamera();
  elsWorld.mapSvg.setAttribute("viewBox", `${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
}

function animateCameraTo(x, y) {
  if (cameraAnimationFrame) cancelAnimationFrame(cameraAnimationFrame);
  const start = { x: camera.x, y: camera.y };
  camera.x = x;
  camera.y = y;
  clampCamera();
  const target = { x: camera.x, y: camera.y };
  camera.x = start.x;
  camera.y = start.y;
  const startedAt = performance.now();
  const frame = (now) => {
    const progress = Math.min(1, (now - startedAt) / 240);
    const eased = 1 - Math.pow(1 - progress, 3);
    camera.x = start.x + (target.x - start.x) * eased;
    camera.y = start.y + (target.y - start.y) * eased;
    applyCamera();
    if (progress < 1) cameraAnimationFrame = requestAnimationFrame(frame);
    else cameraAnimationFrame = null;
  };
  cameraAnimationFrame = requestAnimationFrame(frame);
}

function focusCameraOnNode(node, forceCenter = false) {
  if (!node) return;
  const point = mapPoint(node);
  const left = camera.x + CAMERA_SAFE_MARGIN;
  const right = camera.x + camera.width - CAMERA_SAFE_MARGIN;
  const top = camera.y + CAMERA_SAFE_MARGIN;
  const bottom = camera.y + camera.height - CAMERA_SAFE_MARGIN;
  if (forceCenter || point.x < left || point.x > right || point.y < top || point.y > bottom) {
    animateCameraTo(point.x - camera.width / 2, point.y - camera.height / 2);
  }
}

function configureMapFrame() {
  elsWorld.ground.setAttribute("x", 0);
  elsWorld.ground.setAttribute("y", 0);
  elsWorld.ground.setAttribute("width", mapExtent.width);
  elsWorld.ground.setAttribute("height", mapExtent.height);
  const terrain = elsWorld.mapSvg.querySelector(".world-terrain");
  if (terrain) {
    terrain.setAttribute("x", 0);
    terrain.setAttribute("y", 0);
    terrain.setAttribute("width", mapExtent.width);
    terrain.setAttribute("height", mapExtent.height);
    terrain.removeAttribute("clip-path");
  }
  applyCamera();
  elsWorld.eyebrow.textContent = WORLD_MAP.meta?.eyebrow || "未命名区域";
  elsWorld.title.textContent = WORLD_MAP.meta?.title || "未命名地图";
}

configureMapFrame();

let world = createInitialWorld();
let currentTarget = null;
let interactionLocked = false;
const WORLD_DATA_READY = Promise.all([window.NpcDialogueData.ready, window.BattleData.ready]);
let worldDataError = null;
WORLD_DATA_READY.catch((error) => { worldDataError = error; });

function createInitialWorld() {
  const deck = window.BattleBridge.getDefaultDeck();
  return {
    day: 1,
    hp: 60,
    maxHp: 60,
    currentNodeId: WORLD_MAP.startNodeId,
    exploredNodes: new Set([WORLD_MAP.startNodeId]),
    flags: {},
    inventory: { rustySword: 1, healingPotion: 1 },
    equipment: { leftHand: null, rightHand: null, body: null, head: null, eye: null, heart: null, brain: null },
    sacrificed: {},
    deck,
    innateCardId: null,
    stamina: MAX_STAMINA,
    maxStamina: MAX_STAMINA,
    battlesWon: 0,
    dailyEventRolls: {},
    dailyNpcLocations: {},
  };
}

function getCurrentNode() {
  return NODE_BY_ID.get(world.currentNodeId) || NODE_BY_ID.get(WORLD_MAP.startNodeId);
}

function getFlag(key) {
  return world.flags[key];
}

function setFlag(key, value = true) {
  world.flags[key] = value;
  renderWorld();
  return value;
}

function hasItem(itemId, amount = 1) {
  return (world.inventory[itemId] || 0) >= amount;
}

function addItem(itemId, amount = 1) {
  world.inventory[itemId] = (world.inventory[itemId] || 0) + amount;
  renderWorld();
}

function removeItem(itemId, amount = 1) {
  if (!hasItem(itemId, amount)) return false;
  world.inventory[itemId] -= amount;
  if (world.inventory[itemId] <= 0) delete world.inventory[itemId];
  renderWorld();
  return true;
}

function addCard(cardId) {
  if (!window.BattleBridge.getCardCatalog()[cardId]) return false;
  world.deck.push(cardId);
  renderWorld();
  return true;
}

function getMaxHp() {
  return Object.keys(world.sacrificed).length === 0 ? 66 : 60;
}

function syncMaxHp() {
  const previousMax = world.maxHp;
  world.maxHp = getMaxHp();
  if (world.maxHp > previousMax) world.hp += world.maxHp - previousMax;
  world.hp = Math.min(world.hp, world.maxHp);
}

function isWorldActive() {
  return !elsWorld.mapScreen.classList.contains("hidden");
}

function isOverlayOpen() {
  return !elsWorld.modal.classList.contains("hidden") || !elsWorld.characterPanel.classList.contains("hidden");
}

function canSpendStamina(amount = 1) {
  return world.stamina >= amount;
}

function spendStamina(amount = 1) {
  if (!canSpendStamina(amount)) return false;
  world.stamina -= amount;
  renderWorld();
  return true;
}

function staminaHint(text, amount = 1) {
  return canSpendStamina(amount) ? `${text} · 体力 -${amount}` : "体力不足";
}

function evaluateWorldCondition(condition) {
  if (!condition) return true;
  return window.NPCDialogueRuntime.evaluateCondition(condition, getNpcDialogueContext());
}

function assignNpcLocationForToday(npcId, nodeId) {
  if (!npcId || !nodeId) return true;
  const existing = world.dailyNpcLocations[npcId];
  if (existing && existing !== nodeId) return false;
  world.dailyNpcLocations[npcId] = nodeId;
  return true;
}

function getNpcLocationForToday(npcId) {
  return world.dailyNpcLocations[npcId] || null;
}

function incomingEdges(nodeId) {
  return WORLD_EDGES.filter((edge) => edge.to === nodeId);
}

function isNodeAvailable(node) {
  if (!node) return false;
  if (world.exploredNodes.has(node.id) || node.id === WORLD_MAP.startNodeId) return true;
  if (node.revealFlag && !getFlag(node.revealFlag)) return false;
  return incomingEdges(node.id).some((edge) => world.exploredNodes.has(edge.from));
}

function isEventEntryResolved(entry, node = null) {
  if (!entry) return false;
  if (entry.kind === "battle") return Boolean(getFlag(`${entry.battleSourceId || `${node?.id || "node"}_${entry.id}`}Killed`));
  if (entry.kind === "npc") {
    if (entry.npcId === "eddie") return Boolean(getFlag("eddieKilled"));
    if (entry.npcId === "chris") return Boolean(getFlag("chrisGone"));
    if (entry.npcId === "bell") return Boolean(getFlag("bellKilled") || getFlag("bellSpared"));
  }
  return false;
}

function isNodeResolved(node) {
  const entryId = world.dailyEventRolls[node?.id];
  const set = WORLD_EVENT_SETS[node?.eventSetId];
  const entry = set?.entries?.find((item) => item.id === entryId) || (set?.entries?.length === 1 ? set.entries[0] : null);
  return isEventEntryResolved(entry, node);
}

function isEdgeRevealed(edge) {
  return isNodeAvailable(NODE_BY_ID.get(edge.from)) && isNodeAvailable(NODE_BY_ID.get(edge.to));
}

function isEdgeActive(edge) {
  return isEdgeRevealed(edge) && evaluateWorldCondition(edge.activeWhen);
}

function edgesForNode(nodeId) {
  return WORLD_EDGES.filter((edge) => edge.from === nodeId || edge.to === nodeId);
}

function areNodesConnected(fromId, toId) {
  return edgesForNode(fromId).some((edge) => isEdgeActive(edge) && (edge.from === toId || edge.to === toId));
}

function blocksAutoPath(node) {
  if (!node || isNodeResolved(node)) return false;
  const set = WORLD_EVENT_SETS[node.eventSetId];
  return (set?.entries || []).some((entry) => entry.kind === "battle" || (entry.kind === "npc" && entry.npcId === "bell"));
}

function canPathThrough(nodeId, fromId, toId) {
  if (nodeId === fromId || nodeId === toId) return true;
  return !blocksAutoPath(NODE_BY_ID.get(nodeId));
}

function findReachablePath(fromId, toId) {
  if (fromId === toId) return [fromId];
  const queue = [[fromId]];
  const seen = new Set([fromId]);
  while (queue.length) {
    const path = queue.shift();
    const currentId = path[path.length - 1];
    for (const edge of edgesForNode(currentId)) {
      if (!isEdgeActive(edge)) continue;
      const nextId = edge.from === currentId ? edge.to : edge.from;
      if (seen.has(nextId) || !isNodeAvailable(NODE_BY_ID.get(nextId))) continue;
      if (nextId !== toId && !world.exploredNodes.has(nextId)) continue;
      if (!canPathThrough(nextId, fromId, toId)) continue;
      const nextPath = [...path, nextId];
      if (nextId === toId) return nextPath;
      seen.add(nextId);
      queue.push(nextPath);
    }
  }
  return null;
}

function renderWorld() {
  if (MAP_CONFIG_ERRORS.length) {
    elsWorld.edges.innerHTML = "";
    elsWorld.nodes.innerHTML = `<text class="map-config-error-text" x="${camera.width / 2}" y="${camera.height / 2}" text-anchor="middle">地图配置无效</text>`;
    elsWorld.player.classList.add("hidden");
    elsWorld.prompt.classList.add("hidden");
    elsWorld.mapHint.classList.add("map-config-error");
    elsWorld.mapHint.textContent = MAP_CONFIG_ERRORS.join(" · ");
    console.error("地图配置无效：", MAP_CONFIG_ERRORS);
    return;
  }
  syncMaxHp();
  renderPointCrawl();
  elsWorld.day.textContent = world.day;
  elsWorld.daysLeft.textContent = world.day < 5 ? `余 ${5 - world.day} 次安全长休` : "再睡一次就不再是人";
  elsWorld.hp.textContent = `${world.hp} / ${world.maxHp}`;
  elsWorld.hpFill.style.width = `${Math.max(0, world.hp / world.maxHp * 100)}%`;
  elsWorld.stamina.textContent = `${world.stamina} / ${world.maxStamina}`;
  elsWorld.staminaFill.style.width = `${Math.max(0, world.stamina / world.maxStamina * 100)}%`;
  elsWorld.flagCount.textContent = Object.keys(world.flags).length;
  currentTarget = getCurrentNode();
  elsWorld.prompt.classList.toggle("hidden", !currentTarget || isOverlayOpen());
  if (currentTarget) elsWorld.prompt.querySelector("span").textContent = `调查${currentTarget.label}`;
  elsWorld.mapHint.textContent = "拖动空白处查看地图 · 点击节点移动 · E 调查 · L 长休";
  if (!elsWorld.characterPanel.classList.contains("hidden")) renderCharacterPanel();
}

function renderPointCrawl() {
  elsWorld.edges.innerHTML = "";
  elsWorld.nodes.innerHTML = "";

  for (const edge of WORLD_EDGES) {
    if (!isEdgeRevealed(edge)) continue;
    const from = NODE_BY_ID.get(edge.from);
    const to = NODE_BY_ID.get(edge.to);
    if (!from || !to) continue;
    const line = document.createElementNS(SVG_NS, "line");
    line.classList.add("world-edge");
    if (!isEdgeActive(edge)) line.classList.add("locked");
    const fromPoint = mapPoint(from);
    const toPoint = mapPoint(to);
    line.setAttribute("x1", fromPoint.x);
    line.setAttribute("y1", fromPoint.y);
    line.setAttribute("x2", toPoint.x);
    line.setAttribute("y2", toPoint.y);
    elsWorld.edges.appendChild(line);
  }

  for (const node of WORLD_NODES) {
    if (!isNodeAvailable(node)) continue;
    const group = document.createElementNS(SVG_NS, "g");
    const isCurrent = node.id === world.currentNodeId;
    const isExplored = world.exploredNodes.has(node.id);
    const reachable = isCurrent || Boolean(findReachablePath(world.currentNodeId, node.id));
    const resolved = isNodeResolved(node);
    group.classList.add("world-node");
    if (isCurrent) group.classList.add("current");
    if (isExplored) group.classList.add("explored");
    else group.classList.add("unexplored");
    if (reachable) group.classList.add("reachable");
    if (resolved) group.classList.add("resolved");
    if (!reachable) group.classList.add("distant");
    const point = mapPoint(node);
    group.setAttribute("transform", `translate(${point.x} ${point.y})`);
    group.dataset.nodeId = node.id;
    group.innerHTML = `
      <circle class="node-aura" r="30"></circle>
      <circle class="node-ring" r="22"></circle>
      <text class="node-icon" dy="8">${node.icon || "?"}</text>
      <text class="node-label" y="45">${node.label}</text>`;
    group.addEventListener("click", () => handleNodeClick(node.id));
    elsWorld.nodes.appendChild(group);
  }

  const current = getCurrentNode();
  if (current) {
    const point = mapPoint(current);
    elsWorld.player.classList.remove("hidden");
    elsWorld.player.setAttribute("transform", `translate(${point.x} ${point.y - 34})`);
  } else {
    elsWorld.player.classList.add("hidden");
  }
}

function handleNodeClick(nodeId) {
  if (!isWorldActive() || isOverlayOpen() || interactionLocked) return;
  if (suppressMapClick) return;
  const node = NODE_BY_ID.get(nodeId);
  if (!isNodeAvailable(node)) return;
  if (nodeId === world.currentNodeId) return;
  if (!findReachablePath(world.currentNodeId, nodeId)) return;
  const firstVisit = !world.exploredNodes.has(nodeId);
  if (firstVisit && !canSpendStamina()) {
    showWorldModal({ kicker: "体力不足", title: "无法探索新节点", body: "首次到达尚未探索的节点需要 1 点体力。你仍可在已探索节点间移动，或长休恢复体力。" });
    return;
  }
  if (firstVisit) spendStamina();
  world.currentNodeId = nodeId;
  if (firstVisit) world.exploredNodes.add(nodeId);
  renderWorld();
  focusCameraOnNode(node);
  if (firstVisit) triggerNodeEvent(node, { arrivalPaid: true });
}

function closeWorldModal() {
  elsWorld.modal.classList.add("hidden");
  interactionLocked = false;
  renderWorld();
}

function showWorldModal({ kicker = "交互", title, body = "", bodyText = null, options = [], allowClose = true }) {
  interactionLocked = true;
  elsWorld.modalKicker.textContent = kicker;
  elsWorld.modalTitle.textContent = title;
  if (bodyText === null) elsWorld.modalBody.innerHTML = body;
  else elsWorld.modalBody.textContent = bodyText;
  elsWorld.modalOptions.innerHTML = "";
  const resolvedOptions = allowClose ? [...options, { label: "离开", hint: "返回地图", close: true }] : options;
  resolvedOptions.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "world-option";
    const enabled = option.enabled === undefined ? true : Boolean(option.enabled);
    button.disabled = !enabled;
    button.innerHTML = `<span>${option.label}</span><small>${option.hint || ""}</small>`;
    button.addEventListener("click", async () => {
      if (!enabled) return;
      if (option.close !== false) closeWorldModal();
      if (option.action) await option.action();
    });
    elsWorld.modalOptions.appendChild(button);
  });
  elsWorld.modal.classList.remove("hidden");
}

function openCharacterPanel() {
  if (!isWorldActive()) return;
  interactionLocked = true;
  renderCharacterPanel();
  elsWorld.characterPanel.classList.remove("hidden");
}

function closeCharacterPanel() {
  elsWorld.characterPanel.classList.add("hidden");
  interactionLocked = false;
  renderWorld();
}

function equipmentLabel(slotId) {
  const itemId = world.equipment[slotId];
  return itemId ? ITEM_LIBRARY[itemId]?.name || itemId : "空";
}

function inventoryActionMarkup(itemId, item) {
  if (item.usable) return `<button type="button" data-item-use="${itemId}">使用</button>`;
  if (item.slot === "hand") {
    return `<div class="inventory-actions">
      <button type="button" data-equip-item="${itemId}" data-equip-slot="leftHand" ${world.sacrificed.leftHand ? "disabled" : ""}>装左手</button>
      <button type="button" data-equip-item="${itemId}" data-equip-slot="rightHand" ${world.sacrificed.rightHand ? "disabled" : ""}>装右手</button>
    </div>`;
  }
  if (item.slot === "bothHands") {
    const disabled = world.sacrificed.leftHand || world.sacrificed.rightHand;
    return `<button type="button" data-equip-item="${itemId}" data-equip-slot="bothHands" ${disabled ? "disabled" : ""}>装备双手</button>`;
  }
  if (item.slot) {
    const disabled = world.sacrificed[item.slot];
    const slotName = BODY_SLOTS.find(([slotId]) => slotId === item.slot)?.[1] || item.slot;
    return `<button type="button" data-equip-item="${itemId}" data-equip-slot="${item.slot}" ${disabled ? "disabled" : ""}>装备到${slotName}</button>`;
  }
  return "";
}

function renderCharacterPanel() {
  const fullBody = Object.keys(world.sacrificed).length === 0;
  elsWorld.humanSynergy.textContent = fullBody
    ? "Human Synergy 生效：完整身体令最大生命 +6、攻击 +1、格挡 +2；正常人仍愿意相信你。"
    : "Human Synergy 已失效。失去的身体槽位不能再装备物品，但献祭规则已经生效。";

  elsWorld.bodySlots.innerHTML = BODY_SLOTS.map(([slotId, label, kind]) => {
    const sacrificed = Boolean(world.sacrificed[slotId]);
    const special = slotId === "leftHand" && world.innateCardId
      ? `内化：${window.BattleBridge.getCardCatalog()[world.innateCardId]?.name}`
      : sacrificed ? "已永久献祭" : equipmentLabel(slotId);
    const canUnequip = !sacrificed && Boolean(world.equipment[slotId]) && ["leftHand", "rightHand", "body", "head"].includes(slotId);
    return `<div class="body-slot ${kind === "核心器官" ? "organ" : ""} ${sacrificed ? "sacrificed" : ""}">
      <span>${kind}</span><strong>${label}</strong><small>${special}</small>
      ${canUnequip ? `<button type="button" class="slot-action" data-unequip-slot="${slotId}">卸下</button>` : ""}
    </div>`;
  }).join("");
  elsWorld.bodySlots.querySelectorAll("[data-unequip-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      unequipSlot(button.dataset.unequipSlot);
      renderCharacterPanel();
    });
  });

  const inventoryEntries = Object.entries(world.inventory);
  elsWorld.inventoryList.innerHTML = inventoryEntries.length ? inventoryEntries.map(([itemId, amount]) => {
    const item = ITEM_LIBRARY[itemId] || { name: itemId, description: "未知物品" };
    return `<div class="inventory-item">
      <strong>${item.name}${amount > 1 ? ` ×${amount}` : ""}</strong>
      ${inventoryActionMarkup(itemId, item)}
      <p>${item.description}</p>
    </div>`;
  }).join("") : '<div class="inventory-item"><p>背包是空的。</p></div>';

  elsWorld.inventoryList.querySelectorAll("[data-item-use]").forEach((button) => {
    button.addEventListener("click", () => {
      useItem(button.dataset.itemUse);
      renderCharacterPanel();
    });
  });
  elsWorld.inventoryList.querySelectorAll("[data-equip-item]").forEach((button) => {
    button.addEventListener("click", () => {
      equipItem(button.dataset.equipItem, button.dataset.equipSlot);
      renderCharacterPanel();
    });
  });

  const catalog = window.BattleBridge.getCardCatalog();
  const counts = {};
  world.deck.forEach((cardId) => { counts[cardId] = (counts[cardId] || 0) + 1; });
  const cards = Object.entries(counts).map(([cardId, count]) => `${catalog[cardId]?.name || cardId}×${count}`).join(" · ");
  const innate = world.innateCardId ? catalog[world.innateCardId]?.name : "无";
  elsWorld.deckSummary.innerHTML = `<strong>牌组：</strong>${cards}<br><strong>固有技能：</strong>${innate}（0 时刻，5 节点 CD）`;
}

function useItem(itemId) {
  if (itemId !== "healingPotion" || !removeItem(itemId)) return;
  const healed = Math.min(18, world.maxHp - world.hp);
  world.hp += healed;
  renderWorld();
}

function equipItem(itemId, targetSlot) {
  const item = ITEM_LIBRARY[itemId];
  if (!item?.slot || !hasItem(itemId)) return;
  if (item.slot === "bothHands") {
    if (world.sacrificed.leftHand || world.sacrificed.rightHand) return;
    world.equipment.leftHand = itemId;
    world.equipment.rightHand = itemId;
  } else if (item.slot === "hand") {
    if (!["leftHand", "rightHand"].includes(targetSlot) || world.sacrificed[targetSlot]) return;
    if (world.equipment.leftHand === "greatSword" || world.equipment.rightHand === "greatSword") {
      world.equipment.leftHand = null;
      world.equipment.rightHand = null;
    }
    const otherSlot = targetSlot === "leftHand" ? "rightHand" : "leftHand";
    if (world.equipment[otherSlot] === itemId && (world.inventory[itemId] || 0) < 2) {
      world.equipment[otherSlot] = null;
    }
    world.equipment[targetSlot] = itemId;
  } else {
    if (targetSlot !== item.slot || world.sacrificed[targetSlot]) return;
    world.equipment[targetSlot] = itemId;
  }
  renderWorld();
}

function unequipSlot(slotId) {
  const itemId = world.equipment[slotId];
  if (!itemId) return;
  if (itemId === "greatSword") {
    world.equipment.leftHand = null;
    world.equipment.rightHand = null;
  } else {
    world.equipment[slotId] = null;
  }
  renderWorld();
}

function sacrificeBodyPart(partId) {
  if (world.sacrificed[partId]) return;
  world.sacrificed[partId] = true;
  if (partId === "leftHand" || partId === "rightHand") {
    if (world.equipment.leftHand === "greatSword" || world.equipment.rightHand === "greatSword") {
      world.equipment.leftHand = null;
      world.equipment.rightHand = null;
    } else {
      world.equipment[partId] = null;
    }
  } else {
    world.equipment[partId] = null;
  }
  syncMaxHp();
  setFlag(`sacrificed${partId[0].toUpperCase()}${partId.slice(1)}`, true);
}

function chooseInnateCard(npcId) {
  const catalog = window.BattleBridge.getCardCatalog();
  const choices = [...new Set(world.deck)]
    .filter((cardId) => catalog[cardId] && (catalog[cardId].type === "attack" || catalog[cardId].type === "defense"));
  showWorldModal({
    kicker: "献祭左手 · 不可逆",
    title: "选择要写进身体的卡",
    body: "该卡会从牌组永久移除，成为 0 时刻、5 节点冷却的固有技能。左手装备槽永久消失。",
    options: choices.map((cardId) => ({
      label: catalog[cardId].name,
      hint: canSpendStamina() ? `${catalog[cardId].text.replace(/<[^>]+>/g, "")} · 体力 -1` : "体力不足",
      enabled: canSpendStamina(),
      action: () => {
        if (!spendStamina()) return showSacrificeMenu(npcId);
        const index = world.deck.indexOf(cardId);
        if (index >= 0) world.deck.splice(index, 1);
        world.innateCardId = cardId;
        sacrificeBodyPart("leftHand");
        showSacrificeMenu(npcId);
      },
    })),
  });
}

function getDailyStock() {
  return ["longSword", "shield", "dagger", "heavyArmor", "greatSword"][world.day - 1] || "healingPotion";
}

function getNpcDialogueContext() {
  const stockId = getDailyStock();
  return {
    day: world.day,
    dailyStockId: stockId,
    dailyStockName: ITEM_LIBRARY[stockId]?.name || stockId,
    sacrificedCount: Object.keys(world.sacrificed).length,
    getFlag,
    setFlag,
    hasItem,
    addItem,
    removeItem,
    hasSacrificed: (partId) => Boolean(world.sacrificed[partId]),
  };
}

function applyDialogueEffects(effects = []) {
  return window.NPCDialogueRuntime.applyEffects(effects, getNpcDialogueContext());
}

async function runNpcAction(npcId, actionId) {
  if (actionId === "fight_eddie") {
    await runBattle("eddie", "eddie");
  } else if (actionId === "fight_bell") {
    await runBattle("bell", "bell");
  } else {
    console.error(`NPC ${npcId} 请求了未登记动作：${actionId}`);
    return false;
  }
  return true;
}

function optionCostsStamina(option) {
  return option.action === "fight_eddie" || option.action === "fight_bell";
}

function showNpcDialogue(npcId, requestedNodeId = null) {
  const script = window.NpcDialogueData.get(npcId);
  if (!script) return;
  const context = getNpcDialogueContext();
  const nodeId = requestedNodeId || window.NPCDialogueRuntime.resolveStart(script, context);
  const node = window.NPCDialogueRuntime.resolveNode(script, nodeId, context);
  if (!node) return;
  applyDialogueEffects(node.effects);
  const optionNode = window.NPCDialogueRuntime.resolveNode(script, nodeId, getNpcDialogueContext());

  const configuredOptions = (optionNode.options || []).map((option) => {
    const staminaCost = optionCostsStamina(option);
    return {
      label: option.label,
      hint: staminaCost ? staminaHint(option.hint || "消耗体力", 1) : option.hint,
      enabled: option.enabled && (!staminaCost || canSpendStamina()),
      action: async () => {
        const freshContext = getNpcDialogueContext();
        if (!window.NPCDialogueRuntime.evaluateCondition(option.enabledWhen, freshContext)) return showNpcDialogue(npcId, nodeId);
        if (staminaCost && !canSpendStamina()) return showNpcDialogue(npcId, nodeId);
        const completed = option.action ? await runNpcAction(npcId, option.action) : true;
        if (completed === false) return showNpcDialogue(npcId, nodeId);
        if (!window.NPCDialogueRuntime.applyEffects(option.effects || [], freshContext)) return showNpcDialogue(npcId, nodeId);
        if (option.next) showNpcDialogue(npcId, option.next);
      },
    };
  });
  configuredOptions.push({
    label: `向${script.name}献祭身体`,
    hint: staminaHint("永久失去身体部分，换取规则", 1),
    enabled: canSpendStamina(),
    action: () => showSacrificeMenu(npcId),
  });

  showWorldModal({
    kicker: node.kicker,
    title: node.title || script.name,
    bodyText: node.body,
    options: configuredOptions,
  });
}

function showEddie() { showNpcDialogue("eddie"); }
function showChris() { showNpcDialogue("chris"); }
function showBell() { showNpcDialogue("bell"); }

function showNpcAway(node) {
  const script = window.NpcDialogueData.get(node.npcId);
  const assignedNode = NODE_BY_ID.get(getNpcLocationForToday(node.npcId));
  showWorldModal({
    kicker: "节点 · 今日行踪",
    title: node.label,
    body: `${script?.name || node.label}今天不在这里。${assignedNode ? `有人说在「${assignedNode.label}」附近见过对方。` : "这片污雾暂时吞掉了所有脚印。"}`,
  });
}

function weightedRandomEntry(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1] || null;
}

function resolveNodeEventEntry(node) {
  const eventSet = WORLD_EVENT_SETS[node.eventSetId];
  const lockedId = world.dailyEventRolls[node.id];
  if (lockedId) return eventSet?.entries?.find((entry) => entry.id === lockedId) || null;
  const candidates = (eventSet?.entries || []).filter((entry) => {
    if (!evaluateWorldCondition(entry.when)) return false;
    if (entry.kind !== "npc") return true;
    const assignedNodeId = getNpcLocationForToday(entry.npcId);
    return !assignedNodeId || assignedNodeId === node.id;
  });
  const entry = candidates.length === 1 ? candidates[0] : weightedRandomEntry(candidates);
  world.dailyEventRolls[node.id] = entry?.id || "__empty";
  if (entry?.kind === "npc") assignNpcLocationForToday(entry.npcId, node.id);
  return entry || null;
}

function showNoEvent(node) {
  showWorldModal({ kicker: "节点 · 今日结果", title: node.label, body: "今天这里没有发生任何事。" });
}

function showDiscovery(node, flag, title, text) {
  if (flag) setFlag(flag, true);
  showWorldModal({ kicker: "探索完成", title: title || node.label, body: text || node.description || "雾气散开，新的道路显出轮廓。" });
}

function runWorldDialogue(dialogueId, node) {
  const handlers = {
    start: () => showStartNode(),
    siltWoods: () => showDiscovery(node, "exploredSiltWoods", "污泥林", "你拨开像湿发一样缠绕的草根，发现一条仍有人类足迹的窄路。"),
    drownedHuts: () => showDiscovery(node, "exploredDrownedHuts", "腐叶原野", "几间半沉的小屋在粪水里吱呀作响，门缝里露出还没烂尽的家具。"),
    bellRoad: () => showDiscovery(node, "exploredBellRoad", "碎钟坡", "越往坡上走，空气里的钟声越像骨头互相敲击。远处站着一个无头的人影。"),
    hut: showHut,
    gate: showGate,
    church: showChurch,
    quietClearing: () => showWorldModal({ kicker: "地点", title: node.label, body: node.description || "这里只剩风吹过空地。" }),
    node2: () => showWorldModal({ kicker: "地点", title: node.label, body: node.description || "腐烂的叶片铺成一条继续向前的路。" }),
    node3: () => showWorldModal({ kicker: "地点", title: node.label, body: node.description || "弦鸣一样的虫声贴着泥水滑过。" }),
  };
  const handler = handlers[dialogueId];
  if (handler) return handler();
  showWorldModal({ kicker: "配置错误", title: node.label, body: `未登记世界对话：${dialogueId}` });
}

function triggerNodeEvent(node, { arrivalPaid = false } = {}) {
  const entry = resolveNodeEventEntry(node);
  if (!entry) return showNoEvent(node);
  if (isEventEntryResolved(entry, node)) {
    showWorldModal({ kicker: "节点 · 已解决", title: node.label, body: "这里的主要事件已经解决，节点仍可作为通路使用。" });
    return;
  }
  if (entry.kind === "npc") {
    if (!assignNpcLocationForToday(entry.npcId, node.id)) return showWorldModal({
      kicker: "节点 · 空缺",
      title: node.label,
      body: "你找到的是刚被雨水抹平的脚印。那个人今天已经去了别处。",
    });
    return showNpcDialogue(entry.npcId);
  }
  if (entry.kind === "battle") return runBattle(entry.enemyId, entry.battleSourceId || `${node.id}_${entry.id}`, { prepaid: arrivalPaid });
  if (entry.kind === "dialogue") return runWorldDialogue(entry.dialogueId, node);
  return showNoEvent(node);
}

function sacrificeOption(partId, action) {
  return () => {
    if (!spendStamina()) return;
    action();
  };
}

function showSacrificeMenu(npcId) {
  const npcName = window.NpcDialogueData.get(npcId)?.name || "眼前的人";
  const available = (part) => !world.sacrificed[part] && canSpendStamina();
  showWorldModal({
    kicker: `${npcName} · 血肉交易`,
    title: "献祭自己的身体",
    body: `${npcName}愿意接收仍然新鲜的血肉。这里不需要祭坛。\n<em>完整身体本身也是一种 Build；所有选择均永久生效。献祭会消耗 1 点体力。</em>`,
    options: [
      { label: "献祭左手", hint: canSpendStamina() ? "失去槽位；选择一张牌内化 · 体力 -1" : "体力不足", enabled: available("leftHand"), action: () => chooseInnateCard(npcId) },
      {
        label: "献祭心",
        hint: canSpendStamina() ? "解锁秘仪卡；你不会获得蓝条 · 体力 -1" : "体力不足",
        enabled: available("heart"),
        action: sacrificeOption("heart", () => {
          sacrificeBodyPart("heart");
          if (!world.deck.includes("bleed")) addCard("bleed");
          if (!world.deck.includes("delay")) addCard("delay");
          showSacrificeMenu(npcId);
        }),
      },
      {
        label: "献祭眼",
        hint: canSpendStamina() ? "每 8 时刻随机出现 2–3 个双倍伤害破绽 · 体力 -1" : "体力不足",
        enabled: available("eye"),
        action: sacrificeOption("eye", () => { sacrificeBodyPart("eye"); showSacrificeMenu(npcId); }),
      },
      {
        label: "献祭头",
        hint: canSpendStamina() ? "永久失去头部装备与正常人路线 · 体力 -1" : "体力不足",
        enabled: available("head"),
        action: sacrificeOption("head", () => { sacrificeBodyPart("head"); showSacrificeMenu(npcId); }),
      },
      {
        label: "献祭脑",
        hint: canSpendStamina() ? "与无头掠夺者共享一种理解 · 体力 -1" : "体力不足",
        enabled: available("brain"),
        action: sacrificeOption("brain", () => { sacrificeBodyPart("brain"); showSacrificeMenu(npcId); }),
      },
      { label: "返回对话", hint: npcName, action: () => showNpcDialogue(npcId) },
    ],
  });
}

function showHut() {
  if (getFlag("searchedHouse")) {
    showWorldModal({ kicker: "地点", title: "废弃小屋", body: "这里已经没有值得搜索的东西。墙上的抓痕倒是比昨天更长了。" });
    return;
  }
  showWorldModal({
    kicker: "地点 · 一次性搜索",
    title: "废弃小屋",
    body: "门后堆着不属于同一个人的家具与骨头。伸手进去，也许会摸到东西，也许会被东西摸到。",
    options: [{
      label: "搜索",
      hint: staminaHint("失去 0–5 HP；获得物品与卡牌", 1),
      enabled: canSpendStamina(),
      action: () => {
        if (!spendStamina()) return showHut();
        const damage = Math.floor(Math.random() * 6);
        world.hp = Math.max(1, world.hp - damage);
        addItem("ritualScrap");
        addItem("healingPotion");
        addCard("delay");
        setFlag("searchedHouse", true);
        showWorldModal({
          kicker: "探索奖励",
          title: damage ? `你被咬掉了 ${damage} HP` : "这次什么也没咬你",
          body: "获得「止血瓶」与秘仪卡「割裂时序」。在献祭心脏之前，秘仪卡会留在牌组中但无法使用。",
        });
      },
    }],
  });
}

function showLongRestPrompt() {
  showWorldModal({
    kicker: "固有操作 · 长休",
    title: "就地长休",
    body: `当前 ${world.hp}/${world.maxHp} HP，体力 ${world.stamina}/${world.maxStamina}，第 ${world.day} 天。\n长休会完全恢复生命和体力，然后经过一天。移动和对话不会推进天数。`,
    options: [{
      label: world.day < 5 ? "长休到次日" : "闭眼，让第五天结束",
      hint: world.day < 5 ? "HP / 体力完全恢复 · 天数 +1" : "你将化为粪怪",
      action: longRest,
    }],
  });
}

function longRest() {
  if (world.day >= 5) {
    setFlag("becameDung", true);
    showWorldModal({
      kicker: "结局 · 化粪",
      title: "第六次醒来",
      body: "你确实满血了。只是现在生命值属于一只粪怪。山顶不再是出口，只是一处讨厌的噪音。",
      options: [{ label: "重新开始 Vertical Slice", hint: "重置世界", action: startNewRun }],
    });
    return;
  }
  world.day++;
  world.hp = world.maxHp;
  world.stamina = world.maxStamina;
  world.dailyEventRolls = {};
  world.dailyNpcLocations = {};
  setFlag(`restedDay${world.day}`, true);
  showWorldModal({
    kicker: "时间推进",
    title: `第 ${world.day} 天`,
    body: "伤口完全闭合，体力恢复到 12 点。艾迪换了货，幸存者离极限更近了一天。世界中的死人和已经搜过的地方仍保持原样。",
  });
}

function showGate() {
  if (getFlag("bridgeOpened")) {
    showWorldModal({ kicker: "地点 · 已改变", title: "开放的山道", body: "守卫与铁栅已经不再封路。这个状态由 bridgeOpened 持久保存，山后的节点已经点亮。" });
    return;
  }
  showWorldModal({
    kicker: "地点 · World Flag",
    title: "封锁山道",
    body: "铁栅后的守卫没有兴趣谈判。锁孔很旧，山脊侧面也许另有缝隙。",
    options: [
      {
        label: "使用老旧钥匙",
        hint: hasItem("oldKey") ? staminaHint("打开道路", 1) : "缺少 oldKey",
        enabled: hasItem("oldKey") && canSpendStamina(),
        action: () => {
          if (!spendStamina()) return showGate();
          setFlag("bridgeOpened", true);
          showGate();
        },
      },
      {
        label: "走克里斯指出的骨缝",
        hint: getFlag("foundSecretPath") ? staminaHint("秘密路径可用", 1) : "尚未发现",
        enabled: Boolean(getFlag("foundSecretPath")) && canSpendStamina(),
        action: () => {
          if (!spendStamina()) return showGate();
          setFlag("bridgeOpened", true);
          showGate();
        },
      },
      {
        label: "挑战逆流守卫",
        hint: staminaHint("胜利后道路开放", 1),
        enabled: canSpendStamina(),
        action: () => runBattle("guard", "gate"),
      },
    ],
  });
}

function showChurch() {
  showWorldModal({
    kicker: "地点 · 唯一出口",
    title: "逆抽水器",
    body: `教堂中央是一只倒悬的巨大水箱，管道通向不存在的天空。你在第 ${world.day} 天抵达，仍然有心跳。`,
    options: [{
      label: "握住冲水链",
      hint: "完成 Vertical Slice",
      action: () => {
        setFlag("escapedPlane", true);
        showWorldModal({
          kicker: "结局 · 成功",
          title: "逆向冲水",
          body: "世界发出庄严而不体面的轰鸣。你被抽向山顶上方，带着剩余身体、装备和所有没有解决的关系离开。",
          options: [{ label: "重新体验", hint: "重置世界", action: startNewRun }],
        });
      },
    }],
  });
}

function showStartNode() {
  const node = getCurrentNode();
  showWorldModal({
    kicker: "起点",
    title: node.label,
    body: node.description || "这里是你醒来的地方。已点亮的节点可以自由移动。",
  });
}

function interactWithCurrentNode() {
  const node = getCurrentNode();
  if (!node || interactionLocked || !isNodeAvailable(node)) return;
  return triggerNodeEvent(node);
}

async function runBattle(enemyId, sourceId, options = {}) {
  const prepaid = Boolean(options.prepaid);
  if (!prepaid && !canSpendStamina()) {
    showWorldModal({ kicker: "体力不足", title: "无法进入战斗", body: "战斗需要 1 点体力。你仍可以在已经点亮的节点之间移动，或长休恢复体力。" });
    return false;
  }
  if (!prepaid) spendStamina();
  interactionLocked = true;
  let battle;
  try {
    battle = await window.BattleBridge.startBattle(enemyId, { playerHp: world.hp, playerMaxHp: world.maxHp });
  } catch (error) {
    console.error(`无法开始战斗：${enemyId}`, error);
    if (!prepaid) world.stamina = Math.min(world.maxStamina, world.stamina + 1);
    interactionLocked = false;
    elsWorld.mapScreen.classList.remove("hidden");
    renderWorld();
    showWorldModal({
      kicker: "配置错误 · 战斗未开始",
      title: "战斗数据无法加载",
      body: window.location.protocol === "file:"
        ? "独立 JSON 不能从本地文件页面读取。请通过本地静态服务器打开 <code>index.html</code>。"
        : "角色配置缺失或格式不正确。世界状态没有发生变化，请检查控制台中的具体错误。",
    });
    return false;
  }
  world.hp = battle.playerHp;
  elsWorld.mapScreen.classList.remove("hidden");
  interactionLocked = false;

  if (battle.result === "Win") {
    world.battlesWon++;
    if (sourceId === "eddie") {
      setFlag("eddieKilled", true);
      addItem(getDailyStock());
      addItem("oldKey");
      addItem("healingPotion", 2);
      addItem("freshFlesh", 2);
    } else if (sourceId === "bell") {
      setFlag("bellKilled", true);
      addItem("freshFlesh");
    } else if (sourceId === "gate") {
      setFlag("guardKilled", true);
      setFlag("bridgeOpened", true);
      addItem("shield");
    } else {
      setFlag(`${sourceId}Killed`, true);
    }
  }

  renderWorld();
  if (battle.result === "Lose") {
    showWorldModal({
      kicker: "结局 · 死亡",
      title: "三种结局之一",
      body: "这次失败按 Demo 规则作为死亡处理。战斗桥接只返回 Lose；由 World 决定在这里结束，而不是由战斗模块写死 Game Over。",
      options: [{ label: "重新开始 Vertical Slice", hint: "重置世界", action: startNewRun }],
    });
  } else if (battle.result === "Escape") {
    showWorldModal({ kicker: "战斗结果 · Escape", title: "敌人还在", body: "你保住了命，但损失的 HP 和战斗消耗的体力不会恢复，地图对象也没有消失。" });
  }
  return true;
}

function getCombatModifiersForBattle() {
  const modifiers = {};
  const equippedItems = new Set(Object.values(world.equipment).filter(Boolean));
  equippedItems.forEach((itemId) => {
    Object.entries(ITEM_LIBRARY[itemId]?.modifiers || {}).forEach(([key, value]) => {
      if (typeof value === "number") modifiers[key] = (modifiers[key] || 0) + value;
      else if (value) modifiers[key] = true;
    });
  });
  if (Object.keys(world.sacrificed).length === 0) {
    modifiers.attackBonus = (modifiers.attackBonus || 0) + 1;
    modifiers.blockBonus = (modifiers.blockBonus || 0) + 2;
    modifiers.humanSynergy = true;
  }
  modifiers.ritualUnlocked = Boolean(world.sacrificed.heart);
  modifiers.insight = Boolean(world.sacrificed.eye);
  modifiers.innateCardId = world.innateCardId;
  return modifiers;
}

async function startNewRun() {
  try { await WORLD_DATA_READY; }
  catch (error) {
    worldDataError = error;
    showWorldDataError();
    return false;
  }
  world = createInitialWorld();
  currentTarget = null;
  interactionLocked = false;
  elsWorld.modal.classList.add("hidden");
  elsWorld.characterPanel.classList.add("hidden");
  $w("#introOverlay").classList.remove("visible");
  elsWorld.game.classList.add("hidden");
  elsWorld.mapScreen.classList.remove("hidden");
  renderWorld();
  focusCameraOnNode(getCurrentNode(), true);
  return true;
}

function showWorldDataError() {
  elsWorld.game.classList.add("hidden");
  elsWorld.mapScreen.classList.remove("hidden");
  $w("#introOverlay").classList.remove("visible");
  showWorldModal({ kicker: "配置错误 · 无法开始", title: "剧情或战斗数据加载失败", bodyText: worldDataError?.message || "无法加载游戏数据，请检查控制台。", allowClose: false });
}

window.WorldGame = Object.freeze({
  startNewRun,
  isActive: isWorldActive,
  getFlag,
  setFlag,
  hasItem,
  addItem,
  getBattleDeck: () => [...world.deck],
  getCombatModifiers: getCombatModifiersForBattle,
  getState: () => ({
    day: world.day,
    hp: world.hp,
    maxHp: world.maxHp,
    flags: { ...world.flags },
    inventory: { ...world.inventory },
    sacrificed: { ...world.sacrificed },
    currentNodeId: world.currentNodeId,
    stamina: world.stamina,
    maxStamina: world.maxStamina,
    exploredNodes: [...world.exploredNodes],
    equipment: { ...world.equipment },
    dailyEventRolls: { ...world.dailyEventRolls },
    dailyNpcLocations: { ...world.dailyNpcLocations },
  }),
});

elsWorld.characterButton.addEventListener("click", openCharacterPanel);
elsWorld.longRestButton.addEventListener("click", showLongRestPrompt);
elsWorld.closeCharacterButton.addEventListener("click", closeCharacterPanel);
elsWorld.characterPanel.addEventListener("click", (event) => {
  if (event.target === elsWorld.characterPanel) closeCharacterPanel();
});
elsWorld.focusPlayerButton.addEventListener("click", () => focusCameraOnNode(getCurrentNode(), true));

elsWorld.mapSvg.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest?.(".world-node") || isOverlayOpen()) return;
  if (cameraAnimationFrame) cancelAnimationFrame(cameraAnimationFrame);
  cameraAnimationFrame = null;
  elsWorld.mapSvg.setPointerCapture(event.pointerId);
  mapDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, cameraX: camera.x, cameraY: camera.y, moved: false };
  elsWorld.mapSvg.classList.add("is-panning");
});

elsWorld.mapSvg.addEventListener("pointermove", (event) => {
  if (!mapDrag || mapDrag.pointerId !== event.pointerId) return;
  const rect = elsWorld.mapSvg.getBoundingClientRect();
  const dx = (event.clientX - mapDrag.startX) * camera.width / Math.max(1, rect.width);
  const dy = (event.clientY - mapDrag.startY) * camera.height / Math.max(1, rect.height);
  if (Math.abs(dx) + Math.abs(dy) > 4) mapDrag.moved = true;
  camera.x = mapDrag.cameraX - dx;
  camera.y = mapDrag.cameraY - dy;
  applyCamera();
});

function finishMapDrag(event) {
  if (!mapDrag || mapDrag.pointerId !== event.pointerId) return;
  suppressMapClick = mapDrag.moved;
  mapDrag = null;
  elsWorld.mapSvg.classList.remove("is-panning");
  if (suppressMapClick) setTimeout(() => { suppressMapClick = false; }, 0);
}

elsWorld.mapSvg.addEventListener("pointerup", finishMapDrag);
elsWorld.mapSvg.addEventListener("pointercancel", finishMapDrag);

document.addEventListener("keydown", (event) => {
  if (!isWorldActive()) return;
  if (event.key === "Escape") {
    if (!elsWorld.characterPanel.classList.contains("hidden")) closeCharacterPanel();
    else if (!worldDataError && !elsWorld.modal.classList.contains("hidden")) closeWorldModal();
    return;
  }
  if (isOverlayOpen()) return;
  if (event.key === "i" || event.key === "I") {
    event.preventDefault();
    openCharacterPanel();
    return;
  }
  if ((event.key === "l" || event.key === "L") && !event.repeat) {
    event.preventDefault();
    showLongRestPrompt();
    return;
  }
  if ((event.key === "e" || event.key === "E") && !event.repeat) {
    event.preventDefault();
    interactWithCurrentNode();
  }
});

renderWorld();
focusCameraOnNode(getCurrentNode(), true);
$w("#startButton").disabled = true;
WORLD_DATA_READY.then(() => {
  $w("#startButton").disabled = false;
}).catch((error) => {
  worldDataError = error;
  showWorldDataError();
});
