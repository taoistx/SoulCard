"use strict";

// 这是 Vertical Slice 的 World 层：明确的数据与分支，不引入通用事件图或规则引擎。
const $w = (selector) => document.querySelector(selector);
const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_MAP_VIEW_WIDTH = 1000;
const DEFAULT_MAP_VIEW_HEIGHT = 680;
const MAX_STAMINA = 12;

function validateMapBundle(bundle) {
  const errors = [];
  if (!bundle || bundle.schemaVersion !== 2) return ["缺少受支持的 WORLD_MAP_BUNDLE（schemaVersion 必须为 2）"];
  const map = bundle.map;
  if (!map || typeof map !== "object") return ["map 必须是对象"];
  const width = map.viewBox?.width || DEFAULT_MAP_VIEW_WIDTH;
  const height = map.viewBox?.height || DEFAULT_MAP_VIEW_HEIGHT;
  if (!Number.isFinite(width) || width < 320 || width > 3000) errors.push("viewBox.width 必须在 320–3000 之间");
  if (!Number.isFinite(height) || height < 240 || height > 2000) errors.push("viewBox.height 必须在 240–2000 之间");
  if (!Array.isArray(map.nodes) || !map.nodes.length) errors.push("nodes 必须是非空数组");
  if (!Array.isArray(map.edges)) errors.push("edges 必须是数组");

  const nodeIds = new Set();
  (Array.isArray(map.nodes) ? map.nodes : []).forEach((node) => {
    if (typeof node?.id !== "string" || !node.id) errors.push("节点 id 必须是非空字符串");
    if (nodeIds.has(node?.id)) errors.push(`节点 id 重复：${node.id}`);
    nodeIds.add(node?.id);
    if (!["start", "npc", "poi", "enemy", "wilderness", "random"].includes(node?.type)) errors.push(`节点 ${node?.id || "(空)"} 类型无效`);
    if (typeof node?.label !== "string" || !node.label) errors.push(`节点 ${node?.id || "(空)"} 缺少 label`);
    if (!Number.isFinite(node?.x) || node.x < 0 || node.x > width) errors.push(`节点 ${node?.id || "(空)"} x 越界`);
    if (!Number.isFinite(node?.y) || node.y < 0 || node.y > height) errors.push(`节点 ${node?.id || "(空)"} y 越界`);
    if (node?.type === "npc" && typeof node.npcId !== "string") errors.push(`NPC 节点 ${node.id} 缺少 npcId`);
    if (node?.type === "enemy" && typeof node.enemyId !== "string") errors.push(`敌人节点 ${node.id} 缺少 enemyId`);
    if (node?.type === "poi" && typeof node.locationId !== "string") errors.push(`地点节点 ${node.id} 缺少 locationId`);
    if (node?.type === "random") {
      if (!node.random || !Array.isArray(node.random.entries)) errors.push(`随机节点 ${node.id} 缺少 random.entries`);
      const entryIds = new Set();
      (node.random?.entries || []).forEach((entry, index) => {
        const field = `随机节点 ${node.id}.entries[${index}]`;
        if (typeof entry?.id !== "string" || !entry.id) errors.push(`${field} 缺少 id`);
        if (entryIds.has(entry?.id)) errors.push(`${field} id 重复：${entry.id}`);
        entryIds.add(entry?.id);
        if (!["npc", "battle", "empty"].includes(entry?.type)) errors.push(`${field} 类型无效`);
        if (!Number.isFinite(entry?.weight) || entry.weight <= 0) errors.push(`${field} weight 必须大于 0`);
        if (entry?.type === "npc" && typeof entry.npcId !== "string") errors.push(`${field} 缺少 npcId`);
        if (entry?.type === "battle" && typeof entry.enemyId !== "string") errors.push(`${field} 缺少 enemyId`);
      });
    }
  });
  if (!nodeIds.has(map.startNodeId)) errors.push("startNodeId 必须指向现有节点");
  (map.initialRevealed || []).forEach((id) => {
    if (!nodeIds.has(id)) errors.push(`initialRevealed 指向未知节点：${id}`);
  });
  (Array.isArray(map.edges) ? map.edges : []).forEach((edge, index) => {
    if (!nodeIds.has(edge?.from)) errors.push(`edges[${index}].from 指向未知节点`);
    if (!nodeIds.has(edge?.to)) errors.push(`edges[${index}].to 指向未知节点`);
    if (edge?.from === edge?.to) errors.push(`edges[${index}] 不能连接自身`);
  });
  return [...new Set(errors)];
}

const MAP_CONFIG_ERRORS = validateMapBundle(window.WORLD_MAP_BUNDLE);
if (window.MAP_PREVIEW_ERROR) MAP_CONFIG_ERRORS.push(window.MAP_PREVIEW_ERROR);
const WORLD_MAP_BUNDLE = MAP_CONFIG_ERRORS.length ? {
  schemaVersion: 2,
  map: {
    meta: { eyebrow: "地图配置错误", title: "无法载入地图" },
    viewBox: { width: DEFAULT_MAP_VIEW_WIDTH, height: DEFAULT_MAP_VIEW_HEIGHT },
    startNodeId: "start",
    initialRevealed: ["start"],
    nodes: [{ id: "start", type: "start", icon: "!", label: "配置错误", x: 500, y: 340 }],
    edges: [],
  },
} : window.WORLD_MAP_BUNDLE;
const WORLD_MAP = WORLD_MAP_BUNDLE.map;
const MAP_VIEW_WIDTH = WORLD_MAP.viewBox?.width || DEFAULT_MAP_VIEW_WIDTH;
const MAP_VIEW_HEIGHT = WORLD_MAP.viewBox?.height || DEFAULT_MAP_VIEW_HEIGHT;
const WORLD_NODES = WORLD_MAP.nodes.map((node) => ({ icon: "?", description: "", ...node }));
const WORLD_EDGES = WORLD_MAP.edges || [];
const NODE_BY_ID = new Map(WORLD_NODES.map((node) => [node.id, node]));

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
};

function configureMapFrame() {
  elsWorld.mapSvg.setAttribute("viewBox", `0 0 ${MAP_VIEW_WIDTH} ${MAP_VIEW_HEIGHT}`);
  elsWorld.ground.setAttribute("width", MAP_VIEW_WIDTH - 36);
  elsWorld.ground.setAttribute("height", MAP_VIEW_HEIGHT - 36);
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
  const revealedNodes = new Set(WORLD_MAP.initialRevealed || [WORLD_MAP.startNodeId]);
  revealedNodes.add(WORLD_MAP.startNodeId);
  return {
    day: 1,
    hp: 60,
    maxHp: 60,
    currentNodeId: WORLD_MAP.startNodeId,
    revealedNodes,
    visitedNodes: new Set([WORLD_MAP.startNodeId]),
    exploredNodes: new Set(),
    flags: {},
    inventory: { rustySword: 1, healingPotion: 1 },
    equipment: { leftHand: null, rightHand: null, body: null, head: null, eye: null, heart: null, brain: null },
    sacrificed: {},
    deck,
    innateCardId: null,
    stamina: MAX_STAMINA,
    maxStamina: MAX_STAMINA,
    battlesWon: 0,
    randomNodeRolls: {},
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
  refreshRevealedNodes();
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

function refreshRevealedNodes() {
  for (const node of WORLD_NODES) {
    if (evaluateWorldCondition(node.revealWhen)) world.revealedNodes.add(node.id);
  }
  for (const edge of WORLD_EDGES) {
    if (!evaluateWorldCondition(edge.revealWhen)) continue;
    const fromRevealed = world.revealedNodes.has(edge.from);
    const toRevealed = world.revealedNodes.has(edge.to);
    if (fromRevealed || toRevealed) {
      world.revealedNodes.add(edge.from);
      world.revealedNodes.add(edge.to);
    }
  }
}

function isNodeAvailable(node) {
  if (!node || !world.revealedNodes.has(node.id)) return false;
  return true;
}

function isNodeResolved(node) {
  if (!node) return false;
  if (node.id === "eddie") return Boolean(getFlag("eddieKilled"));
  if (node.id === "chris") return Boolean(getFlag("chrisGone"));
  if (node.id === "bell") return Boolean(getFlag("bellKilled") || getFlag("bellSpared"));
  if (node.id === "dungA") return Boolean(getFlag("dungAKilled"));
  if (node.id === "dungB") return Boolean(getFlag("dungBKilled"));
  return false;
}

function isEdgeRevealed(edge) {
  return world.revealedNodes.has(edge.from) &&
    world.revealedNodes.has(edge.to) &&
    evaluateWorldCondition(edge.revealWhen);
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
  return node.type === "enemy" || node.id === "bell";
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
      if (seen.has(nextId) || !world.revealedNodes.has(nextId)) continue;
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
    elsWorld.nodes.innerHTML = `<text class="map-config-error-text" x="${MAP_VIEW_WIDTH / 2}" y="${MAP_VIEW_HEIGHT / 2}" text-anchor="middle">地图配置无效</text>`;
    elsWorld.player.classList.add("hidden");
    elsWorld.prompt.classList.add("hidden");
    elsWorld.mapHint.classList.add("map-config-error");
    elsWorld.mapHint.textContent = MAP_CONFIG_ERRORS.join(" · ");
    console.error("地图配置无效：", MAP_CONFIG_ERRORS);
    return;
  }
  syncMaxHp();
  refreshRevealedNodes();
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
  elsWorld.mapHint.textContent = "点击已点亮节点移动 · E 交互 · L 长休 · 探索/献祭/战斗消耗体力";
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
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
    elsWorld.edges.appendChild(line);
  }

  for (const node of WORLD_NODES) {
    if (!isNodeAvailable(node)) continue;
    const group = document.createElementNS(SVG_NS, "g");
    const isCurrent = node.id === world.currentNodeId;
    const isVisited = world.visitedNodes.has(node.id);
    const reachable = isCurrent || Boolean(findReachablePath(world.currentNodeId, node.id));
    const explored = world.exploredNodes.has(node.id);
    const resolved = isNodeResolved(node);
    group.classList.add("world-node", node.type);
    if (isCurrent) group.classList.add("current");
    if (isVisited) group.classList.add("visited");
    if (reachable) group.classList.add("reachable");
    if (explored) group.classList.add("explored");
    if (resolved) group.classList.add("resolved");
    if (!reachable) group.classList.add("distant");
    group.setAttribute("transform", `translate(${node.x} ${node.y})`);
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
    elsWorld.player.classList.remove("hidden");
    elsWorld.player.setAttribute("transform", `translate(${current.x} ${current.y - 34})`);
  } else {
    elsWorld.player.classList.add("hidden");
  }
}

function handleNodeClick(nodeId) {
  if (!isWorldActive() || isOverlayOpen() || interactionLocked) return;
  const node = NODE_BY_ID.get(nodeId);
  if (!isNodeAvailable(node)) return;
  if (nodeId === world.currentNodeId) {
    interactWithCurrentNode();
    return;
  }
  if (!findReachablePath(world.currentNodeId, nodeId)) return;
  const firstVisit = !world.visitedNodes.has(nodeId);
  world.currentNodeId = nodeId;
  world.visitedNodes.add(nodeId);
  renderWorld();
  enterCurrentNode(firstVisit);
}

function enterCurrentNode(firstVisit = false) {
  const node = getCurrentNode();
  if (!node || node.type === "start") return;
  if (node.type === "enemy" || node.type === "random" || (node.type === "npc" && firstVisit)) interactWithCurrentNode();
  else if (node.type === "wilderness" && !world.exploredNodes.has(node.id)) showWilderness(node);
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

function resolveRandomNodeEntry(node) {
  if (world.randomNodeRolls[node.id]) return world.randomNodeRolls[node.id];
  const candidates = (node.random?.entries || []).filter((entry) => {
    if (!evaluateWorldCondition(entry.when)) return false;
    if (entry.type !== "npc") return true;
    const assignedNodeId = getNpcLocationForToday(entry.npcId);
    return !assignedNodeId || assignedNodeId === node.id;
  });
  const entry = weightedRandomEntry(candidates) || {
    id: "empty",
    type: "empty",
    weight: 1,
    title: node.random?.emptyTitle || node.label,
    text: node.random?.emptyText || "今天这里没有遇到任何人。",
  };
  world.randomNodeRolls[node.id] = { ...entry };
  if (entry.type === "npc") assignNpcLocationForToday(entry.npcId, node.id);
  return world.randomNodeRolls[node.id];
}

function showRandomNode(node) {
  const entry = resolveRandomNodeEntry(node);
  if (entry.type === "npc") {
    if (!assignNpcLocationForToday(entry.npcId, node.id)) return showWorldModal({
      kicker: "随机节点 · 空缺",
      title: node.label,
      body: "你找到的是刚被雨水抹平的脚印。那个人今天已经去了别处。",
    });
    return showNpcDialogue(entry.npcId);
  }
  if (entry.type === "battle") return showWorldModal({
    kicker: "随机节点 · 遭遇",
    title: entry.title || node.label,
    body: entry.text || "有什么东西从污雾里扑了出来。",
    options: [{
      label: entry.actionLabel || "迎战",
      hint: staminaHint("进入战斗", 1),
      enabled: canSpendStamina(),
      action: () => runBattle(entry.enemyId, entry.battleSourceId || `${node.id}_${entry.id}`),
    }],
  });
  return showWorldModal({
    kicker: "随机节点 · 今日结果",
    title: entry.title || node.random?.emptyTitle || node.label,
    body: entry.text || node.random?.emptyText || "今天这里没有遇到任何人。",
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

function showWilderness(node) {
  const explored = world.exploredNodes.has(node.id);
  showWorldModal({
    kicker: explored ? "荒野 · 已探索" : "荒野 · 未知节点",
    title: explored ? node.exploreTitle || node.label : node.label,
    body: explored
      ? `${node.exploreTitle || node.label}已经被你点亮。这里不会再消耗体力。`
      : node.description || "前方被粪雾盖住，只有真正踏进去才会显出后路。",
    options: explored ? [] : [{
      label: "探索",
      hint: staminaHint("点亮无条件子节点", 1),
      enabled: canSpendStamina(),
      action: () => exploreWilderness(node),
    }],
  });
}

function exploreWilderness(node) {
  if (world.exploredNodes.has(node.id)) return showWilderness(node);
  if (!spendStamina()) return showWilderness(node);
  world.exploredNodes.add(node.id);
  setFlag(node.exploreFlag || `explored${node.id[0].toUpperCase()}${node.id.slice(1)}`, true);
  edgesForNode(node.id).forEach((edge) => {
    const otherId = edge.from === node.id ? edge.to : edge.from;
    const otherNode = NODE_BY_ID.get(otherId);
    if (otherNode && !edge.activeWhen && evaluateWorldCondition(edge.revealWhen)) world.revealedNodes.add(otherId);
  });
  showWorldModal({
    kicker: "探索完成",
    title: node.exploreTitle || node.label,
    body: node.exploreText || "粪雾退开了一些，新的节点在远处显形。",
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
  world.randomNodeRolls = {};
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
  if (isNodeResolved(node)) {
    showWorldModal({
      kicker: "节点 · 已解决",
      title: node.label,
      body: node.id === "bell" && getFlag("bellSpared")
        ? "丧钟已经让出道路。这个节点仍保留在地图上，作为通往山道的已点亮支点。"
        : "这里的主要威胁或人物状态已经改变。这个节点仍保留在地图上，作为已点亮路径的一部分。",
    });
    return;
  }
  if (node.type === "start") return showStartNode();
  if (node.type === "wilderness") return showWilderness(node);
  if (node.type === "random") return showRandomNode(node);
  if (node.type === "npc") {
    const assignedNodeId = getNpcLocationForToday(node.npcId);
    if (assignedNodeId && assignedNodeId !== node.id) return showNpcAway(node);
    assignNpcLocationForToday(node.npcId, node.id);
    return showNpcDialogue(node.npcId);
  }
  if (node.type === "enemy") return runBattle(node.enemyId, node.battleSourceId || node.id);
  if (node.type === "poi") return ({ hut: showHut, gate: showGate, church: showChurch })[node.locationId]?.();
}

async function runBattle(enemyId, sourceId) {
  if (!canSpendStamina()) {
    showWorldModal({ kicker: "体力不足", title: "无法进入战斗", body: "战斗需要 1 点体力。你仍可以在已经点亮的节点之间移动，或长休恢复体力。" });
    return false;
  }
  spendStamina();
  interactionLocked = true;
  let battle;
  try {
    battle = await window.BattleBridge.startBattle(enemyId, { playerHp: world.hp, playerMaxHp: world.maxHp });
  } catch (error) {
    console.error(`无法开始战斗：${enemyId}`, error);
    world.stamina = Math.min(world.maxStamina, world.stamina + 1);
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
    revealedNodes: [...world.revealedNodes],
    exploredNodes: [...world.exploredNodes],
    visitedNodes: [...world.visitedNodes],
    equipment: { ...world.equipment },
    randomNodeRolls: { ...world.randomNodeRolls },
    dailyNpcLocations: { ...world.dailyNpcLocations },
  }),
});

elsWorld.characterButton.addEventListener("click", openCharacterPanel);
elsWorld.longRestButton.addEventListener("click", showLongRestPrompt);
elsWorld.closeCharacterButton.addEventListener("click", closeCharacterPanel);
elsWorld.characterPanel.addEventListener("click", (event) => {
  if (event.target === elsWorld.characterPanel) closeCharacterPanel();
});

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
$w("#startButton").disabled = true;
WORLD_DATA_READY.then(() => {
  $w("#startButton").disabled = false;
  if (window.IS_MAP_PREVIEW) {
    $w("#returnToEditor").classList.remove("hidden");
    startNewRun();
  }
}).catch((error) => {
  worldDataError = error;
  showWorldDataError();
});
