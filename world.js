"use strict";

// 这是 Vertical Slice 的 World 层：明确的数据与分支，不引入通用事件图或规则引擎。
const $w = (selector) => document.querySelector(selector);
const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_MAP_VIEW_WIDTH = 1000;
const DEFAULT_MAP_VIEW_HEIGHT = 680;
const MAP_MARGIN = 70;
const CAMERA_SAFE_MARGIN = 120;
const MAX_STAMINA = 6;
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
      if (entry?.kind === "dialogue" && (typeof entry.dialogueId !== "string" || !entry.dialogueId)) errors.push(`${field} 引用了未知世界对话`);
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
    if (node?.fog !== undefined && typeof node.fog !== "boolean") errors.push(`节点 ${node.id} fog 必须是布尔值`);
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
  freshFlesh: { name: "新鲜血肉", description: "食用恢复10 HP，不改变五日期限；也可交易、供食或直接用作诱饵，每次消耗一份。", usable: true, stackable: true, eventTags: ["freshFlesh", "lure"] },
  rottenFlesh: { name: "腐败血肉", description: "已经腐败或菌化的尸体部分，不能安全食用。不能交易给艾迪，也不能作为新鲜血肉诱饵。", stackable: true },
  oldKey: { name: "老旧钥匙", description: "粪锈遮住了齿纹，也许能打开山道的锁。", keyItem: true },
  mistWrapMaterial: { name: "韧膜", description: "用于包扎、试制防护或保护作业位，每次消耗一份。", stackable: true, eventTags: ["wrapMaterial"] },
  eddieMistWrap: { name: "粗糙鸟嘴防护", description: "整套防护，装备在头槽后抵消普通孢雾侵蚀；不抵消擦伤、扬尘与战损。", slot: "head", modifiers: {}, eventTags: ["mistProtection"] },
  oldMistWrap: { name: "旧鸟嘴防护", description: "玄一螂的整套罩具，实际装备在头槽后才抵消普通孢雾侵蚀。", slot: "head", modifiers: {}, eventTags: ["mistProtection"] },
  maintenanceHook: { name: "检修钩", description: "从下方磨亮的钩，证明你已经实际放架并摸到下行路。", keyItem: true },
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

const connectedMapNodes = WORLD_NODES.filter((node) => node.id === WORLD_MAP.startNodeId || WORLD_EDGES.some((e) => e.from === node.id || e.to === node.id));
const mapExtent = {
  width: Math.max(DEFAULT_MAP_VIEW_WIDTH, ...connectedMapNodes.map((node) => node.x + MAP_MARGIN * 2)),
  height: Math.max(DEFAULT_MAP_VIEW_HEIGHT, ...connectedMapNodes.map((node) => node.y + MAP_MARGIN * 2)),
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
  if (forceCenter) {
    camera.width = DEFAULT_MAP_VIEW_WIDTH;
    camera.height = DEFAULT_MAP_VIEW_HEIGHT;
  }
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
const WORLD_DATA_READY = Promise.all([window.NpcDialogueData.ready, window.WorldDialogueData.ready, window.BattleData.ready, window.ActionEventData.ready]).then(async () => {
  for (const set of Object.values(WORLD_EVENT_SETS)) for (const entry of set.entries) {
    if (entry.kind === "dialogue" && !window.WorldDialogueData.get(entry.dialogueId)) throw new Error(`未知世界对话：${entry.dialogueId}`);
    if (entry.kind === "action" && !window.ActionEventData.get(entry.actionEventId)) throw new Error(`未知行动事件：${entry.actionEventId}`);
  }
  for (const event of window.ActionEventData.list()) {
    for (const [stageId, stage] of Object.entries(event.stages)) for (const recipe of stage.recipes) {
      if (recipe.resultDialogueId && !window.WorldDialogueData.get(recipe.resultDialogueId)?.nodes[recipe.resultNodeId]) throw new Error(`行动事件 ${event.id}.${stageId}.${recipe.id} 引用了未知结果 ${recipe.resultDialogueId}.${recipe.resultNodeId}`);
    }
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
    flags: v06InitialFlags(),
    inventory: { rustySword: 1 },
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
  return isWorldShopOpen() || Boolean(activeActionEvent) || window.ActionEventPanel.isOpen() || !elsWorld.modal.classList.contains("hidden") || !elsWorld.characterPanel.classList.contains("hidden");
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
  return getFlag(`${npcId}Location`) || world.dailyNpcLocations[npcId] || null;
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

// 迷雾只过滤地图显示，不改写揭示状态或已揭示节点的可达性。
function isNodeVisibleOnMap(node) {
  if (!isNodeAvailable(node)) return false;
  const current = getCurrentNode();
  if (!current?.fog || node.id === current.id) return true;
  return WORLD_EDGES.some((edge) =>
    (edge.from === current.id && edge.to === node.id) ||
    (edge.to === current.id && edge.from === node.id));
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

// 连线控制揭示，不限制已揭示节点之间的移动。
function findReachablePath(fromId, toId) {
  if (!NODE_BY_ID.has(fromId) || !isNodeAvailable(NODE_BY_ID.get(toId))) return null;
  return fromId === toId ? [fromId] : [fromId, toId];
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
  elsWorld.mapHint.textContent = `${currentTarget?.fog ? "迷雾中：仅显示当前位置及已揭示的直接父、子节点 · " : ""}拖动空白处查看地图 · 点击节点移动 · E 调查 · L 长休`;
  if (!elsWorld.characterPanel.classList.contains("hidden")) renderCharacterPanel();
}

function renderPointCrawl() {
  elsWorld.edges.innerHTML = "";
  elsWorld.nodes.innerHTML = "";
  const visibleNodeIds = new Set(WORLD_NODES.filter(isNodeVisibleOnMap).map((node) => node.id));

  for (const edge of WORLD_EDGES) {
    if (!visibleNodeIds.has(edge.from) || !visibleNodeIds.has(edge.to)) continue;
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
    if (!visibleNodeIds.has(node.id)) continue;
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
  if (!isWorldActive() || isOverlayOpen() || interactionLocked || world.hp <= 0 || getFlag("becameDung")) return;
  if (suppressMapClick || nodeId === world.currentNodeId) return;
  const route = findReachablePath(world.currentNodeId, nodeId);
  if (!route) return;
  const preview = v06RouteCost(route);
  if (!canSpendStamina(preview.stamina)) return showWorldModal({ title: "体力不足", bodyText: `这条路线需要 ${preview.stamina} 点体力。可以在已探索的安全点间移动，或长休。` });
  if (preview.hp) return showWorldModal({
    kicker: "移动预览", title: NODE_BY_ID.get(nodeId).label,
    bodyText: `前往${NODE_BY_ID.get(nodeId).label}。\n体力 -${preview.stamina}，HP -${preview.hp}。${nodeId === "slice_drybench" ? "未清理的狭道需要挤过怪物和碎壳；清开检修槽或处理狭道可降低这项代价。" : "孢粉会侵蚀甲缝；实际装备鸟嘴防护可免除这项损耗。"}${preview.hp >= world.hp ? "这次通行会导致死亡。" : ""}`,
    options: [{ label: "确认前往", hint: `体力 -${preview.stamina} · HP -${preview.hp}`, action: () => moveAlongWorldPath(route) }],
  });
  moveAlongWorldPath(route);
}

function moveAcrossWorldEdge(toId) {
  if (world.hp <= 0 || v06EndingActive || world.currentNodeId === toId || !isNodeAvailable(NODE_BY_ID.get(toId))) return false;
  const fromId = world.currentNodeId, node = NODE_BY_ID.get(toId);
  const firstVisit = !world.exploredNodes.has(toId);
  if (firstVisit && !canSpendStamina()) return false;
  if (firstVisit) world.stamina--;
  const dispute = world.eventStates.corpseDispute;
  if (dispute?.awaitingDeparture && fromId === dispute.nodeId) {
    dispute.awaitingDeparture = false; dispute.threeCorpses = true; dispute.resolved = true;
    setFlag("corpseClaimantsDied", true);
  }
  const damage = v06EntryDamage(fromId, toId);
  world.currentNodeId = toId;
  if (firstVisit) world.exploredNodes.add(toId);
  v06OnMove(fromId, toId, damage);
  renderWorld(); focusCameraOnNode(node);
  if (world.hp <= 0) { v06ShowDeath("terrain"); return false; }
  if (firstVisit || getNodeThreat(toId)) {
    triggerNodeEvent(node, { arrivalPaid: firstVisit });
    return false;
  }
  return true;
}

function moveAlongWorldPath(route) {
  // 每步重新检查真实状态；不能把寻路成功当作已经移动。
  for (const id of route.slice(1)) if (!moveAcrossWorldEdge(id)) break;
}

function closeWorldModal() {
  elsWorld.modal.classList.add("hidden");
  interactionLocked = false;
  renderWorld();
}

function showWorldModal({ kicker = "交互", title, body = "", bodyText = null, options = [], allowClose = true }) {
  resetWorldShop();
  // Descriptions own the screen until their final option explicitly opens the next interaction.
  window.ActionEventPanel.close();
  interactionLocked = true;
  worldModalDismissible = allowClose;
  elsWorld.modalKicker.textContent = kicker;
  elsWorld.modalTitle.textContent = title;
  if (bodyText === null) elsWorld.modalBody.innerHTML = body;
  else elsWorld.modalBody.textContent = bodyText;
  elsWorld.modalOptions.innerHTML = "";
  const resolvedOptions = allowClose ? [...options, { label: "离开", hint: "返回地图", close: true }] : options;
  let optionSelected = false;
  resolvedOptions.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "world-option";
    const enabled = option.enabled === undefined ? true : Boolean(option.enabled);
    button.disabled = !enabled;
    const label = document.createElement("span"), hint = document.createElement("small");
    label.textContent = option.label; hint.textContent = option.hint || ""; button.append(label, hint);
    button.addEventListener("click", async () => {
      if (!enabled || optionSelected) return;
      optionSelected = true;
      if (option.close !== false) closeWorldModal();
      if (option.action) await option.action();
    });
    elsWorld.modalOptions.appendChild(button);
  });
  elsWorld.modal.classList.remove("hidden");
}

function openCharacterPanel() {
  if (!isWorldActive() || activeActionEvent || isWorldShopOpen() || world.hp <= 0 || v06EndingActive) return;
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
  if (item.usable) return `<button type="button" data-item-use="${itemId}" ${world.hp >= world.maxHp || world.hp <= 0 ? "disabled" : ""}>食用 · 恢复10 HP</button>`;
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
  if (itemId !== "freshFlesh" || world.hp <= 0 || world.hp >= world.maxHp || !removeItem(itemId)) return false;
  world.hp = Math.min(world.maxHp, world.hp + 10);
  renderWorld();
  return true;
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
  return ["longSword", "shield", "dagger", "heavyArmor", "greatSword"][world.day - 1] || "greatSword";
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
  if (actionId === "shop_eddie") return npcId === "eddie" && openWorldShop("eddie");
  if (actionId.startsWith("v06_")) return runV06NpcAction(npcId, actionId);
  if (actionId === "fight_eddie") {
    const result = await runBattle("eddie", "eddie", { prepaid: v06NpcBattlePrepaid(actionId) });
    if (result) world.flags.npcBattlePrepaidNode = null;
  } else if (actionId === "fight_bell") {
    await runBattle("bell", "bell");
  } else {
    console.error(`NPC ${npcId} 请求了未登记动作：${actionId}`);
    return false;
  }
  return true;
}

function optionCostsStamina(option) {
  if (v06NpcBattlePrepaid(option.action)) return false;
  return option.action === "fight_eddie" || option.action === "fight_bell" || option.action === "v06_genichiro_fight";
}

function showNpcDialogue(npcId, requestedNodeId = null) {
  const script = window.NpcDialogueData.get(npcId);
  if (!script || getFlag(`${npcId}Killed`) || world.hp <= 0) return;
  const context = getNpcDialogueContext();
  const nodeId = requestedNodeId || window.NPCDialogueRuntime.resolveStart(script, context);
  const node = window.NPCDialogueRuntime.resolveNode(script, nodeId, context);
  if (!node) return;
  const optionNode = node;
  applyDialogueEffects(node.effects);

  const configuredOptions = (optionNode.options || []).map((option) => {
    const staminaCost = optionCostsStamina(option);
    return {
      label: option.label,
      hint: staminaCost ? staminaHint(option.hint || "消耗体力", 1) : option.hint,
      enabled: option.enabled && v06NpcOptionEnabled(npcId, option.action) && (!staminaCost || canSpendStamina()),
      action: async () => {
        const freshContext = getNpcDialogueContext();
        if (!window.NPCDialogueRuntime.evaluateCondition(option.enabledWhen, freshContext)) return showNpcDialogue(npcId, nodeId);
        if (!v06NpcOptionEnabled(npcId, option.action) || (staminaCost && !canSpendStamina())) return showNpcDialogue(npcId, nodeId);
        if (!v06CanApplyEffects(option.effects || [])) return showNpcDialogue(npcId, nodeId);
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
  const npcName = window.NpcDialogueData.get(node.npcId)?.name || node.label;
  const assignedNode = NODE_BY_ID.get(getNpcLocationForToday(node.npcId));
  showWorldDialogue("world_status", "npcAway", { location: node, npcName, assignedNode });
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

function showNoEvent(node) { showWorldDialogue("world_status", "root", { location: node }); }

function runWorldDialogue(dialogueId, node) {
  if (["fallenDragTrail", "corpseHiddenPath", "metalSoundSource"].includes(dialogueId)) return showSliceFollowup(dialogueId, node);
  if (dialogueId === `site_${node.id}`) return showV06Site(node);
  showWorldDialogue(dialogueId, null, { location: node });
}

function triggerNodeEvent(node, { arrivalPaid = false } = {}) {
  if (v06UsesSiteEntry(node)) return showV06Site(node, arrivalPaid);
  if (getNodeThreat(node.id)) return runNodeThreat(node, arrivalPaid);
  if (getFlag("thomasStayed") && world.eventStates.thomasCrossroads?.nodeId === node.id) return showNpcDialogue("thomas");
  const entry = resolveNodeEventEntry(node);
  if (!entry) return showNoEvent(node);
  if (entry.kind === "action" && SLICE_EVENT_IDS.has(entry.actionEventId) && showSliceRevisit(entry.actionEventId)) return;
  if (isEventEntryResolved(entry, node)) {
    showWorldDialogue("world_status", "resolved", { location: node, eventId: entry.actionEventId });
    return;
  }
  if (entry.kind === "npc") {
    if (!assignNpcLocationForToday(entry.npcId, node.id)) return showWorldDialogue("world_status", "away", { location: node });
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
  if (V06_EVENT_IDS.has(eventId) || (eventId === "thomasCrossroads" && v06UsesSiteEntry(node))) return openV06Event(eventId, node, prepaid);
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
  showWorldDialogue("event_fallenSurvivor", "grounded", { eventId });
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
    rememberActionResult(progress, { resultDialogueId: "event_livingHand", resultNodeId: "dead" });
  } else {
    rememberActionResult(progress, { resultDialogueId: "event_livingHand", resultNodeId: "failed" });
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
    rememberActionResult(progress, recipe);
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
    showWorldDialogue(progress.resultDialogueId, progress.resultNodeId, { eventId });
    return;
  }
  showActionResult(progress, {
    kicker: "行动结果", title: event.name, allowClose: false,
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
  if (eventId === "corpseDispute" && progress.threeCorpses) { showWorldDialogue("event_corpseDispute", "threeCorpses", { eventId }); return true; }
  if (!progress.resolved) return false;
  const nodeId = eventId === "fallenSurvivor" && progress.outcome === "fallen_rescue" ? "rescuedRevisit" : "revisit";
  showWorldDialogue(`event_${eventId}`, nodeId, { eventId });
  return true;
}

function showSliceFollowup(dialogueId, node, alreadyPaidMistDamage = false) {
  let damage = 0;
  if (dialogueId === "metalSoundSource" && !getFlag("visitedMetalSource")) {
    const safe = getFlag("knowsMistRhythm") || getFlag("mistSafeDay") === world.day || alreadyPaidMistDamage;
    if (!safe) { damage = Math.min(6, Math.max(0, world.hp - 1)); world.hp -= damage; }
    setFlag("visitedMetalSource", true);
  }
  showWorldDialogue(dialogueId, null, { location: node, damage });
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
  if (V06_EVENT_IDS.has(eventId) || (eventId === "thomasCrossroads" && v06UsesSiteEntry(NODE_BY_ID.get(world.eventStates[eventId]?.nodeId)))) return submitV06Action(eventId, placements);
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
  showActionResult(recipe, {
    kicker: "行动结果", title: event.name, allowClose: false,
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

function showHut() { showWorldDialogue("hut"); }

function showLongRestPrompt() {
  if (world.hp <= 0 || getFlag("becameDung") || v06EndingActive) return;
  if (activeActionEvent || isWorldShopOpen() || !isWorldActive()) return;
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
  if (activeActionEvent || v06EndingActive || world.hp <= 0 || getFlag("becameDung")) return;
  if (world.day >= 5) {
    setFlag("becameDung", true);
    showWorldDialogue("ending_dung");
    return;
  }
  const releasedThreat = Object.values(world.threats).some((threat) => threat.releaseDay === world.day + 1);
  world.day++;
  world.deck.forEach((card) => { card.fatigue = 0; });
  world.hp = world.maxHp;
  world.stamina = world.maxStamina;
  world.dailyEventRolls = {};
  world.dailyNpcLocations = {};
  advanceV06Day();
  setFlag(`restedDay${world.day}`, true);
  showWorldModal({
    kicker: "时间推进",
    title: `第 ${world.day} 天`,
    body: `伤口完全闭合，体力恢复到 ${world.maxStamina} 点，卡牌疲劳清空。${releasedThreat ? "被困的怪物已挣脱。" : ""}艾迪换了货，幸存者离极限更近了一天。世界中的死人和已经搜过的地方仍保持原样。`,
  });
}

function showGate() { showWorldDialogue("gate"); }

function showChurch() { showWorldDialogue("church"); }

function showStartNode() { showWorldDialogue("start"); }

function interactWithCurrentNode() {
  if (world.hp <= 0 || getFlag("becameDung") || v06EndingActive) return;
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
    world.hp = 0;
    showWorldDialogue("ending_battle");
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
  resetWorldShop();
  v06EndingActive = false;
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
$w("#mapOverviewButton").addEventListener("click", () => {
  if (isOverlayOpen()) return;
  if (cameraAnimationFrame) cancelAnimationFrame(cameraAnimationFrame);
  cameraAnimationFrame = null;
  camera.width = mapExtent.width;
  camera.height = mapExtent.height;
  camera.x = 0;
  camera.y = 0;
  applyCamera();
});

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
    if (isWorldShopOpen()) closeWorldShop();
    else if (!elsWorld.characterPanel.classList.contains("hidden")) closeCharacterPanel();
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
