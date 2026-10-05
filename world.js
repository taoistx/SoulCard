"use strict";

// 这是 Vertical Slice 的 World 层：明确的数据与分支，不引入通用事件图或规则引擎。
const $w = (selector) => document.querySelector(selector);
const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_MAP_VIEW_WIDTH = 1000;
const DEFAULT_MAP_VIEW_HEIGHT = 680;
const MAP_MARGIN = 70;
const CAMERA_SAFE_MARGIN = 120;
const MAX_STAMINA = 6;
const WORLD_DIALOGUE_IDS = new Set(["start", "siltWoods", "drownedHuts", "bellRoad", "hut", "gate", "church", "quietClearing", "node2", "node3", "fallenDragTrail", "corpseHiddenPath", "metalSoundSource"]);
const SLICE_EVENT_IDS = new Set(["fallenSurvivor", "breathingCorpses", "metalInMist", "corpseDispute", "livingHand"]);

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
      if (!["npc", "dialogue", "battle", "action"].includes(entry?.kind)) errors.push(`${field} kind 无效`);
      if (!Number.isFinite(entry?.weight) || entry.weight <= 0) errors.push(`${field} weight 必须大于 0`);
      if (entry?.kind === "npc" && typeof entry.npcId !== "string") errors.push(`${field} 缺少 npcId`);
      if (entry?.kind === "dialogue" && !WORLD_DIALOGUE_IDS.has(entry.dialogueId)) errors.push(`${field} 引用了未知世界对话`);
      if (entry?.kind === "battle" && typeof entry.enemyId !== "string") errors.push(`${field} 缺少 enemyId`);
      if (entry?.kind === "action" && typeof entry.actionEventId !== "string") errors.push(`${field} 缺少 actionEventId`);
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
  baitMeat: { name: "诱饵肉", description: "艾迪给的刺鼻肉块。仅作事件诱饵，使用消耗一份，不能食用或充当新鲜血肉。", stackable: true, eventTags: ["lure"] },
  freshFlesh: { name: "新鲜血肉", description: "仍有人血肉特征的部分。艾迪只认这个。也可用于指定遭遇的喂食与诱导，使用消耗一份。", stackable: true, eventTags: ["freshFlesh"] },
  rottenFlesh: { name: "腐败血肉", description: "已经腐败或菌化的尸体部分，不能安全食用。不能交易给艾迪，也不能作为新鲜血肉诱饵。", stackable: true },
  oldKey: { name: "老旧钥匙", description: "粪锈遮住了齿纹，也许能打开山道的锁。", keyItem: true },
  healingPotion: { name: "止血瓶", description: "使用后恢复 18 HP。不会推进天数。", usable: true },
  ritualScrap: { name: "秘仪残页", description: "记载卡牌「割裂时序」。心脏仍在时无法使用。", keyItem: true },
  rustySword: { name: "锈剑", description: "单手武器：暴力卡伤害 +1，可选择左手或右手。", slot: "hand", modifiers: { attackBonus: 1 } },
  longSword: { name: "长剑", description: "单手武器：暴力卡伤害 +3。", slot: "hand", modifiers: { attackBonus: 3 } },
  dagger: { name: "剔骨匕首", description: "单手武器：1 时刻攻击额外施加 1 层流血。", slot: "hand", modifiers: { bleedOnFastAttack: true } },
  greatSword: { name: "排污双手剑", description: "占据双手；攻击耗时 +1，拼刀伤害翻倍。", slot: "bothHands", modifiers: { attackCost: 1, doubleClashDamage: true } },
  shield: { name: "井盖盾", description: "单手装备：执念卡格挡 +4。", slot: "hand", modifiers: { blockBonus: 4 } },
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
let activeActionEvent = null;
let worldModalDismissible = true;
const WORLD_DATA_READY = Promise.all([window.NpcDialogueData.ready, window.BattleData.ready, window.ActionEventData.ready]).then(async () => {
  for (const set of Object.values(WORLD_EVENT_SETS)) for (const entry of set.entries) {
    if (entry.kind === "action" && !window.ActionEventData.get(entry.actionEventId)) throw new Error(`未知行动事件：${entry.actionEventId}`);
  }
  for (const event of window.ActionEventData.list()) {
    if (event.lureNodeId && !NODE_BY_ID.has(event.lureNodeId)) throw new Error(`行动事件 ${event.id} 的迁移节点不存在`);
    if (event.enemyId && !(await window.BattleData.getCombatant(event.enemyId)).combatEnabled) throw new Error(`行动事件 ${event.id} 的敌人未启用战斗`);
  }
});
let worldDataError = null;
WORLD_DATA_READY.catch((error) => { worldDataError = error; });

function createInitialWorld() {
  const deck = window.BattleBridge.getDefaultDeck().map((cardId, index) => ({ instanceId: `card_${index + 1}`, cardId, fatigue: 0 }));
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
    nextCardInstance: deck.length + 1,
    knowledge: {},
    eventStates: {},
    threats: {},
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
  world.deck.push({ instanceId: `card_${world.nextCardInstance++}`, cardId, fatigue: 0 });
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
  return Boolean(activeActionEvent) || window.ActionEventPanel.isOpen() || !elsWorld.modal.classList.contains("hidden") || !elsWorld.characterPanel.classList.contains("hidden");
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
  if (entry.kind === "action") return Boolean(world.eventStates[entry.actionEventId]?.resolved);
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
  if (!node) return false;
  if (getNodeThreat(node.id)) return true;
  if (isNodeResolved(node)) return false;
  const set = WORLD_EVENT_SETS[node.eventSetId];
  return (set?.entries || []).some((entry) => entry.kind === "battle" || entry.kind === "action" || (entry.kind === "npc" && entry.npcId === "bell"));
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
  if ((firstVisit || getNodeThreat(nodeId)) && !canSpendStamina()) {
    showWorldModal({ kicker: "体力不足", title: "无法进入节点", body: "首次探索或面对节点中的怪物需要 1 点体力。你仍可在已探索的安全节点间移动，或长休恢复体力。" });
    return;
  }
  if (firstVisit) spendStamina();
  const dispute = world.eventStates.corpseDispute;
  if (dispute?.awaitingDeparture && world.currentNodeId === dispute.nodeId) {
    dispute.awaitingDeparture = false;
    dispute.threeCorpses = true;
    dispute.resolved = true;
    setFlag("corpseClaimantsDied", true);
  }
  world.currentNodeId = nodeId;
  if (firstVisit) world.exploredNodes.add(nodeId);
  renderWorld();
  focusCameraOnNode(node);
  if (firstVisit || getNodeThreat(node.id)) triggerNodeEvent(node, { arrivalPaid: firstVisit });
}

function closeWorldModal() {
  elsWorld.modal.classList.add("hidden");
  interactionLocked = false;
  renderWorld();
}

function showWorldModal({ kicker = "交互", title, body = "", bodyText = null, options = [], allowClose = true }) {
  interactionLocked = true;
  worldModalDismissible = allowClose;
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
  if (!isWorldActive() || activeActionEvent) return;
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
  world.deck.forEach(({ cardId }) => { counts[cardId] = (counts[cardId] || 0) + 1; });
  const cards = Object.entries(counts).map(([cardId, count]) => `${catalog[cardId]?.name || cardId}×${count}`).join(" · ");
  const innate = world.innateCardId ? catalog[world.innateCardId]?.name : "无";
  const fatigue = world.deck.map((card, index) => card.fatigue ? `${catalog[card.cardId].name}（副本 ${index + 1}）：${card.fatigue} 层` : "").filter(Boolean).join(" · ") || "无";
  const knowledge = Object.keys(world.knowledge).filter((id) => world.knowledge[id]).map((id) => window.ActionEventRuntime.KNOWLEDGE[id]?.description || id).join("<br>") || "无";
  elsWorld.deckSummary.innerHTML = `<strong>牌组：</strong>${cards}<br><strong>疲劳：</strong>${fatigue}<br><strong>固有技能：</strong>${innate}（0 时刻，5 节点 CD）<br><strong>知识：</strong>${knowledge}`;
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
  const choices = world.deck.filter(({ cardId }) => ["attack", "defense"].includes(catalog[cardId]?.type));
  showWorldModal({
    kicker: "献祭左手 · 不可逆",
    title: "选择要写进身体的卡",
    body: "该卡会从牌组永久移除，成为 0 时刻、5 节点冷却的固有技能。左手装备槽永久消失。",
    options: choices.map((instance, index) => ({
      label: `${catalog[instance.cardId].name} · 副本 ${index + 1} · 疲劳 ${instance.fatigue}`,
      hint: canSpendStamina() ? `${catalog[instance.cardId].text.replace(/<[^>]+>/g, "")} · 体力 -1` : "体力不足",
      enabled: canSpendStamina(),
      action: () => {
        if (!spendStamina()) return showSacrificeMenu(npcId);
        const index = world.deck.findIndex((card) => card.instanceId === instance.instanceId);
        if (index >= 0) world.deck.splice(index, 1);
        world.innateCardId = instance.cardId;
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
  if (["fallenDragTrail", "corpseHiddenPath", "metalSoundSource"].includes(dialogueId)) return showSliceFollowup(dialogueId, node);
  if (handler) return handler();
  showWorldModal({ kicker: "配置错误", title: node.label, body: `未登记世界对话：${dialogueId}` });
}

function triggerNodeEvent(node, { arrivalPaid = false } = {}) {
  if (getNodeThreat(node.id)) return runNodeThreat(node, arrivalPaid);
  if (getFlag("thomasStayed") && world.eventStates.thomasCrossroads?.nodeId === node.id) return showNpcDialogue("thomas");
  const entry = resolveNodeEventEntry(node);
  if (!entry) return showNoEvent(node);
  if (entry.kind === "action" && SLICE_EVENT_IDS.has(entry.actionEventId) && showSliceRevisit(entry.actionEventId)) return;
  if (isEventEntryResolved(entry, node)) {
    showWorldModal({ kicker: "节点 · 已解决", title: node.label, body: getFlag("thomasInfectedCorpse") && entry.actionEventId === "thomasCrossroads"
      ? "托马斯感染孢子的尸体仍留在路口。粪怪已经不在这里，节点可以继续通行。"
      : "这里的主要事件已经解决，节点仍可作为通路使用。" });
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
  if (entry.kind === "action") return openActionEvent(entry.actionEventId, node, arrivalPaid);
  if (entry.kind === "battle") return runBattle(entry.enemyId, entry.battleSourceId || `${node.id}_${entry.id}`, { prepaid: arrivalPaid });
  if (entry.kind === "dialogue") return runWorldDialogue(entry.dialogueId, node);
  return showNoEvent(node);
}

function getNodeThreat(nodeId) {
  return Object.values(world.threats).find((threat) => threat.nodeId === nodeId && world.day >= (threat.releaseDay || 0));
}

async function runNodeThreat(node, prepaid) {
  const threat = getNodeThreat(node.id);
  if (!threat) return;
  return runBattle(threat.enemyId, threat.id, {
    prepaid,
    onResult: (battle) => {
      if (battle.result === "Win") delete world.threats[threat.id];
    },
  });
}

function eventResources() {
  return window.ActionEventRuntime.resources(world, window.BattleBridge.getCardCatalog(), ITEM_LIBRARY);
}

function openActionEvent(eventId, node, prepaid = false) {
  const event = window.ActionEventData.get(eventId);
  if (!event) return;
  let progress = world.eventStates[eventId];
  if (!progress) progress = world.eventStates[eventId] = { nodeId: node.id, stage: event.start, resolved: false, prepaid };
  if (progress.resolved) return;
  if (SLICE_EVENT_IDS.has(eventId)) {
    progress.prepaid = prepaid;
    if (eventId === "corpseDispute") progress.awaitingDeparture = false;
    if (progress.stage === "grounded") return showGroundedSurvivor();
  }
  activeActionEvent = { eventId, nodeId: node.id, submitting: false };
  interactionLocked = true;
  elsWorld.modal.classList.add("hidden");
  window.ActionEventPanel.open({
    event, stage: progress.stage, owned: eventResources(),
    match: (placements) => matchEventPlacements(event, progress, placements),
    submit: (placements) => submitEventAction(eventId, placements),
    leave: event.allowLeave && !(eventId === "livingHand" && progress.stage === "trapped") ? () => leaveSliceEvent(eventId) : null,
  });
}

function completeActionEvent(eventId) {
  world.eventStates[eventId].resolved = true;
  activeActionEvent = null;
  interactionLocked = false;
  window.ActionEventPanel.close();
  renderWorld();
}


function matchEventPlacements(event, progress, placements) {
  const match = window.ActionEventRuntime.match(event, progress.stage, placements, eventResources(), evaluateWorldCondition);
  if (!match.valid || !SLICE_EVENT_IDS.has(event.id)) return match;
  const cost = match.recipe.staminaCost || 0;
  return canSpendStamina(cost) ? match : { valid: false, reason: `体力不足，本次行动需要 ${cost} 点额外体力。` };
}

function leaveSliceEvent(eventId) {
  if (!activeActionEvent || activeActionEvent.eventId !== eventId || activeActionEvent.submitting) return;
  const progress = world.eventStates[eventId];
  if (eventId === "livingHand" && progress.stage === "trapped") return;
  progress.prepaid = false;
  if (eventId === "corpseDispute") progress.awaitingDeparture = true;
  activeActionEvent = null;
  interactionLocked = false;
  window.ActionEventPanel.close();
  renderWorld();
}

function showGroundedSurvivor() {
  const eventId = "fallenSurvivor", progress = world.eventStates[eventId];
  activeActionEvent = { eventId, nodeId: progress.nodeId, submitting: false };
  window.ActionEventPanel.close();
  const finish = (kill) => {
    if (world.eventStates[eventId].resolved) return;
    progress.outcome = kill ? "fallen_kill" : "fallen_abandon";
    setFlag(kill ? "fallenKilled" : "fallenAbandoned", true);
    progress.resultText = kill ? "你结束了他的挣扎。先前取得的血肉没有增加。" : "你留下仍在挣扎的半截坠落者，走回菌林。后续命运：测试版尚未接入。";
    completeActionEvent(eventId);
    showWorldModal({ kicker: "行动结果", title: "半截坠落者", bodyText: progress.resultText });
  };
  showWorldModal({
    kicker: "半截坠落者 · 再次选择", title: "他还活着", allowClose: false,
    bodyText: "砍断的菌柄躺在泥地里。他痛苦地挣扎着。你已取得新鲜血肉 ×1，现在必须选择杀死或离开。",
    options: [{ label: "杀死", hint: "结束挣扎；不再次消耗卡牌，不重复奖励", action: () => finish(true) },
      { label: "离开", hint: "留下他；返回地图", action: () => finish(false) }],
  });
}

function handleFallenSurvivor(recipe, progress) {
  if (recipe.action === "fallen_cut") progress.stage = "grounded";
}

function handleBreathingCorpses(recipe, progress) {
  if (recipe.action === "corpse_observe_first") progress.corpseObservations = 1;
  if (recipe.action === "corpse_observe_worms") {
    progress.corpseObservations = 2;
    world.knowledge.wormFarming = true;
  }
}

function handleMetalInMist(recipe) {
  if (recipe.action === "metal_observe") world.knowledge.mistRhythm = true;
  if (recipe.action === "metal_distract") setFlag("mistSafeDay", world.day);
}

function handleCorpseDispute(recipe) {
  if (recipe.action === "dispute_observe") world.knowledge.corpseCorruption = true;
  if (recipe.action === "dispute_ritual") world.knowledge.corpseAnomaly = true;
}

function handleLivingHand(recipe, progress, chosen) {
  if (recipe.action === "hand_grab") progress.failedStrikes = 0;
  if (recipe.action === "hand_drown") progress.dead = true;
  progress.retry = false;
  if (recipe.action !== "hand_strike" || chosen.some((resource) => resource.kind === "card" && resource.cardId === "heavy")) return;
  progress.failedStrikes = (progress.failedStrikes || 0) + 1;
  if (progress.failedStrikes >= 2) {
    progress.dead = true;
    progress.outcome = "hand_drown";
    progress.resultText = "你被不知名的东西拖入了泥水中，很快就被看不清的巨大压力包裹…………";
  } else {
    progress.resultText = "泥水下东西感动了痛疼，但这似乎并不足以威胁到它，它反而更激烈地把你往泥水里拖";
    progress.stage = "trapped";
    progress.retry = true;
  }
}

async function submitSliceEventAction(eventId, placements) {
  if (!activeActionEvent || activeActionEvent.eventId !== eventId || activeActionEvent.submitting) return;
  const event = window.ActionEventData.get(eventId), progress = world.eventStates[eventId];
  const match = matchEventPlacements(event, progress, placements);
  if (!match.valid) throw new Error(match.reason || "资源或组合已失效");
  const recipe = match.recipe, snapshot = structuredClone(world);
  activeActionEvent.submitting = true;
  try {
    for (const resource of match.chosen) {
      if (resource.kind === "card") world.deck.find((card) => card.instanceId === resource.instanceId).fatigue++;
      if (resource.kind === "item" && !removeItem(resource.id)) throw new Error("物品不足");
    }
    if (!applyDialogueEffects(recipe.effects || [])) throw new Error("后果所需的物品不足");
    if (recipe.staminaCost) spendStamina(recipe.staminaCost);
    if (recipe.hpCost) world.hp = Math.max(1, world.hp - recipe.hpCost);
    progress.outcome = recipe.action;
    progress.resultText = recipe.result;
    if (recipe.next) progress.stage = recipe.next;
    const handlers = {
      fallenSurvivor: handleFallenSurvivor, breathingCorpses: handleBreathingCorpses,
      metalInMist: handleMetalInMist, corpseDispute: handleCorpseDispute, livingHand: handleLivingHand,
    };
    handlers[eventId](recipe, progress, match.chosen);
    if (progress.dead) world.hp = 0;
  } catch (error) {
    Object.assign(world, snapshot);
    activeActionEvent.submitting = false;
    renderWorld();
    throw error;
  }
  window.ActionEventPanel.close();
  if (progress.dead) {
    completeActionEvent(eventId);
    showWorldModal({
      kicker: "结局 · 死亡", title: event.name, bodyText: progress.resultText, allowClose: false,
      options: [{ label: "重新开始 Vertical Slice", hint: "重置世界", close: false, action: startNewRun }],
    });
    return;
  }
  showWorldModal({
    kicker: "行动结果", title: event.name, bodyText: progress.resultText, allowClose: false,
    options: [{ label: "继续", close: false, action: async () => {
      if (!activeActionEvent || activeActionEvent.continuing) return;
      activeActionEvent.continuing = true;
      elsWorld.modal.classList.add("hidden");
      if (progress.stage === "grounded") return showGroundedSurvivor();
      if (recipe.next || (eventId === "livingHand" && progress.retry)) {
        return openActionEvent(eventId, NODE_BY_ID.get(progress.nodeId), progress.prepaid);
      }
      completeActionEvent(eventId);
      if (recipe.action === "metal_endure") {
        const source = NODE_BY_ID.get("metalSoundSource");
        world.currentNodeId = source.id;
        world.exploredNodes.add(source.id);
        renderWorld();
        focusCameraOnNode(source);
        showSliceFollowup("metalSoundSource", source, true);
      }
    } }],
  });
}

function showSliceRevisit(eventId) {
  const progress = world.eventStates[eventId];
  if (!progress) return false;
  if (eventId === "corpseDispute" && progress.threeCorpses) {
    showWorldModal({
      kicker: "再次到访", title: "三具尸体",
      bodyText: progress.rewardClaimed ? "三具尸体还在这里，可以取得的部分已经被你收走。"
        : "你回来时，已经没有人争夺。地上只剩三具尸体。原本的一份资源，如今成了三份。它们都不能安全食用。",
      options: progress.rewardClaimed ? [] : [{
        label: "取得腐败血肉 ×3", hint: "一次性领取；不消耗卡牌",
        action: () => {
          if (progress.rewardClaimed) return;
          progress.rewardClaimed = true;
          progress.outcome = "dispute_three_corpses";
          progress.resultText = "你从三具尸体中取得腐败血肉 ×3。";
          addItem("rottenFlesh", 3);
          progress.resolved = true;
          renderWorld();
          showWorldModal({ kicker: "取得资源", title: "三具尸体", bodyText: progress.resultText });
        },
      }],
    });
    return true;
  }
  if (!progress.resolved) return false;
  let body = eventId === "fallenSurvivor" && progress.outcome === "fallen_rescue"
    ? "他还躺在你把他拖出来的位置，无法移动。再次到访后的死亡／被 NPC 找到：测试版尚未接入。"
    : progress.resultText ? `此前的行动结果：\n\n${progress.resultText}` : "遭遇已经结束，这里仍可作为通路。";
  if (progress.outcome === "metal_distract") body += getFlag("mistSafeDay") === world.day
    ? "\n\n当前诱导仍然有效，下一次长休后失效。"
    : "\n\n已经长休，临时诱导已失效。";
  showWorldModal({ kicker: "节点 · 遭遇后果", title: window.ActionEventData.get(eventId).name, bodyText: body });
  return true;
}

function showSliceFollowup(dialogueId, node, alreadyPaidMistDamage = false) {
  const bodies = {
    fallenDragTrail: "拖行沟延伸进菌盖背后的黑暗。泥地中留下啃食者的痕迹。\n\n追踪啃食者的后续：测试版尚未接入。",
    corpseHiddenPath: "类似人类的脚印延伸进一条隐蔽的小径。继续追查搭建蠕虫养殖堆的人：测试版尚未接入。",
  };
  if (dialogueId === "metalSoundSource") {
    let damageText = "";
    if (!getFlag("visitedMetalSource")) {
      const safe = getFlag("knowsMistRhythm") || getFlag("mistSafeDay") === world.day || alreadyPaidMistDamage;
      if (!safe) {
        const lost = Math.min(6, Math.max(0, world.hp - 1));
        world.hp -= lost;
        damageText = `穿过孢子雾，HP -${lost}（最低保留 1）。污染后续：测试版尚未接入。\n\n`;
      }
      setFlag("visitedMetalSource", true);
    }
    bodies.metalSoundSource = damageText + "声源不是人在敲东西。\n\n一具死了很久的尸体，手腕被藤状菌丝吊着。风吹动菌盖时，它的手便一次次撞在腰间的金属杯上。\n\n铛。\n\n你之前一直以为那里有人。";
  }
  showWorldModal({ kicker: "探索后续", title: node.label, bodyText: bodies[dialogueId] });
}

function leaveThomas() {
  if (!getFlag("thomasKilled")) setFlag("thomasFled", true);
  setFlag("thomasStayed", false);
}

function addEncounterThreat(event, nodeId, releaseDay = 0) {
  const id = `${event.id}_monster`;
  world.threats[id] = { id, enemyId: event.enemyId, nodeId, releaseDay };
}

async function submitEventAction(eventId, placements) {
  if (SLICE_EVENT_IDS.has(eventId)) return submitSliceEventAction(eventId, placements);
  if (!activeActionEvent || activeActionEvent.eventId !== eventId || activeActionEvent.submitting) return;
  const event = window.ActionEventData.get(eventId);
  const progress = world.eventStates[eventId];
  const match = window.ActionEventRuntime.match(event, progress.stage, placements, eventResources(), evaluateWorldCondition);
  if (!match.valid) throw new Error(match.ambiguous ? "组合结果存在歧义，请检查配置" : "资源或组合已失效");
  const battleAction = ["kill_thomas", "kill_thomas_and_attack_dung", "attack_dung", "observe_infected", "protect_thomas"].includes(match.recipe.action);
  if (battleAction && !progress.prepaid && !canSpendStamina()) throw new Error("战斗需要 1 点体力");
  activeActionEvent.submitting = true;
  // Rollback is scoped to this submission. Earlier observation and fatigue remain in the snapshot.
  const snapshot = structuredClone({
    deck: world.deck, inventory: world.inventory, flags: world.flags, knowledge: world.knowledge,
    eventStates: world.eventStates, threats: world.threats, stamina: world.stamina, hp: world.hp,
  });
  for (const resource of match.chosen) {
    if (resource.kind === "card") world.deck.find((card) => card.instanceId === resource.instanceId).fatigue++;
    if (resource.kind === "item") removeItem(resource.id);
  }
  const recipe = match.recipe;
  if (!applyDialogueEffects(recipe.effects || [])) {
    Object.assign(world, snapshot);
    activeActionEvent.submitting = false;
    throw new Error("后果所需的物品不足，本次行动已撤销");
  }
  if (recipe.action === "observe_dung") {
    setFlag("thomasInfected", true);
    world.knowledge.dungLore = true;
    setFlag("knowsDungLore", true);
    progress.stage = recipe.next;
  } else if (["kill_thomas", "kill_thomas_and_attack_dung", "observe_infected"].includes(recipe.action)) {
    setFlag("thomasKilled", true);
    if (recipe.action === "observe_infected") setFlag("thomasInfectedCorpse", true);
  } else if (!recipe.action && recipe.next) {
    progress.stage = recipe.next;
  }
  window.ActionEventPanel.close();
  showWorldModal({
    kicker: "行动结果", title: event.name, bodyText: recipe.result, allowClose: false,
    options: [{ label: battleAction ? "面对粪怪" : "继续", close: false, action: async () => {
      // The same result button cannot launch two battles or pay costs twice.
      if (!activeActionEvent || activeActionEvent.continuing) return;
      activeActionEvent.continuing = true;
      elsWorld.modal.classList.add("hidden");
      if (recipe.action === "observe_dung" || (!recipe.action && recipe.next)) {
        openActionEvent(eventId, NODE_BY_ID.get(progress.nodeId));
        return;
      }
      if (battleAction) {
        const battle = await runBattle(event.enemyId, `${eventId}_monster`, {
          prepaid: progress.prepaid, openingDelay: ["attack_dung", "kill_thomas_and_attack_dung"].includes(recipe.action) ? 4 : 0,
          onResult: (result) => {
            if (result.result === "Win" && recipe.action === "protect_thomas") {
              setFlag("thomasStayed", true);
              setFlag("thomasFled", false);
            } else leaveThomas();
            if (result.result === "Escape") addEncounterThreat(event, progress.nodeId);
            completeActionEvent(eventId);
          },
        });
        if (!battle) {
          Object.assign(world, snapshot);
          activeActionEvent = { eventId, nodeId: progress.nodeId, submitting: false };
          showWorldModal({
            kicker: "战斗未开始", title: "本次行动已撤销", bodyText: "本次疲劳、物品与剧情变化已恢复。此前完成的行动仍然保留。请检查战斗数据或图形加速后重试。", allowClose: false,
            options: [{ label: "返回行动选择", action: () => openActionEvent(eventId, NODE_BY_ID.get(progress.nodeId)) }],
          });
        } else if (battle.result === "Win" && getFlag("thomasStayed")) showNpcDialogue("thomas");
        return;
      }
      if (recipe.action === "lure_dung") addEncounterThreat(event, event.lureNodeId);
      if (recipe.action === "trap_dung") addEncounterThreat(event, progress.nodeId, world.day + 1);
      if (["lure_dung", "trap_dung"].includes(recipe.action)) leaveThomas();
      completeActionEvent(eventId);
    } }],
  });
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
          if (!world.deck.some((card) => card.cardId === "bleed")) addCard("bleed");
          if (!world.deck.some((card) => card.cardId === "delay")) addCard("delay");
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
  if (activeActionEvent || !isWorldActive()) return;
  showWorldModal({
    kicker: "固有操作 · 长休",
    title: "就地长休",
    body: `当前 ${world.hp}/${world.maxHp} HP，体力 ${world.stamina}/${world.maxStamina}，第 ${world.day} 天。\n长休会完全恢复生命、体力并清空卡牌疲劳，然后经过一天。移动和对话不会推进天数。`,
    options: [{
      label: world.day < 5 ? "长休到次日" : "闭眼，让第五天结束",
      hint: world.day < 5 ? "HP / 体力完全恢复 · 天数 +1" : "你将化为粪怪",
      action: longRest,
    }],
  });
}

function longRest() {
  if (activeActionEvent) return;
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
  const releasedThreat = Object.values(world.threats).some((threat) => threat.releaseDay === world.day + 1);
  world.day++;
  world.deck.forEach((card) => { card.fatigue = 0; });
  world.hp = world.maxHp;
  world.stamina = world.maxStamina;
  world.dailyEventRolls = {};
  world.dailyNpcLocations = {};
  setFlag(`restedDay${world.day}`, true);
  showWorldModal({
    kicker: "时间推进",
    title: `第 ${world.day} 天`,
    body: `伤口完全闭合，体力恢复到 ${world.maxStamina} 点，卡牌疲劳清空。${releasedThreat ? "被困的怪物已挣脱。" : ""}艾迪换了货，幸存者离极限更近了一天。世界中的死人和已经搜过的地方仍保持原样。`,
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
    battle = await window.BattleBridge.startBattle(enemyId, {
      playerHp: world.hp, playerMaxHp: world.maxHp,
      cardInstances: world.deck.map((card) => ({ ...card })),
      openingDelay: options.openingDelay || 0,
      openingDamage: options.openingDamage || 0,
      damageMultiplier: world.knowledge.dungLore && ["dungling", "dung_swarm"].includes(enemyId) ? 1.15 : 1,
    });
  } catch (error) {
    console.error(`无法开始战斗：${enemyId}`, error);
    if (!prepaid) world.stamina = Math.min(world.maxStamina, world.stamina + 1);
    interactionLocked = false;
    elsWorld.mapScreen.classList.remove("hidden");
    renderWorld();
    showWorldModal({
      kicker: "配置错误 · 战斗未开始",
      title: error.message.startsWith("3D 战斗舞台") ? "战斗舞台无法启动" : "战斗数据无法加载",
      body: error.message.startsWith("3D 战斗舞台")
        ? "3D 战斗舞台无法初始化。请使用支持 WebGL 的浏览器，并检查浏览器图形加速设置。"
        : window.location.protocol === "file:"
        ? "独立 JSON 不能从本地文件页面读取。请通过本地静态服务器打开 <code>index.html</code>。"
        : "角色配置缺失或格式不正确。世界状态没有发生变化，请检查控制台中的具体错误。",
    });
    return false;
  }
  world.hp = battle.playerHp;
  world.deck.forEach((card) => {
    const fatigue = battle.cardFatigue?.[card.instanceId];
    if (Number.isInteger(fatigue) && fatigue >= 0) card.fatigue = fatigue;
  });
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

  options.onResult?.(battle);
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
  return battle;
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
  activeActionEvent = null;
  window.ActionEventPanel.close();
  currentTarget = null;
  interactionLocked = false;
  worldModalDismissible = true;
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
  getBattleDeck: () => world.deck.map((card) => card.cardId),
  getCombatModifiers: getCombatModifiersForBattle,
  getState: () => ({
    day: world.day,
    deck: world.deck.map((card) => ({ ...card })),
    knowledge: { ...world.knowledge },
    eventStates: structuredClone(world.eventStates),
    threats: structuredClone(world.threats),
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
  if (activeActionEvent) { if (event.key === "Escape") event.preventDefault(); return; }
  if (event.key === "Escape") {
    if (!elsWorld.characterPanel.classList.contains("hidden")) closeCharacterPanel();
    else if (!worldDataError && worldModalDismissible && !elsWorld.modal.classList.contains("hidden")) closeWorldModal();
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
