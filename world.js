"use strict";

// 这是 Vertical Slice 的 World 层：明确的数据与分支，不引入通用事件图或规则引擎。
const $w = (selector) => document.querySelector(selector);
const SVG_NS = "http://www.w3.org/2000/svg";
const GRID_SIZE = 40;
const GRID_ORIGIN_X = 40;
const GRID_ORIGIN_Y = 40;
const GRID_MOVE_REPEAT_MS = 135;
const INTERACTION_RADIUS = 62;

function validateMapBundle(bundle) {
  const errors = [];
  if (!bundle || bundle.schemaVersion !== 1) return ["缺少受支持的 WORLD_MAP_BUNDLE（schemaVersion 必须为 1）"];
  const definitions = bundle.objectDefinitions;
  const map = bundle.map;
  if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) errors.push("objectDefinitions 必须是对象");
  if (!map || typeof map !== "object") return [...errors, "map 必须是对象"];
  const grid = map.grid;
  if (!Array.isArray(grid) || grid.length < 5 || grid.length > 80) errors.push("地图高度必须为 5–80 格");
  const width = Array.isArray(grid) && typeof grid[0] === "string" ? [...grid[0]].length : 0;
  if (width < 5 || width > 80) errors.push("地图宽度必须为 5–80 格");
  if (Array.isArray(grid) && grid.some((row) => typeof row !== "string" || [...row].length !== width)) errors.push("地图每一行必须等宽");
  if (Array.isArray(grid) && grid.some((row) => typeof row === "string" && /[^#r.]/.test(row))) errors.push("地图只能包含 #、r、. 三种地形");

  const inBounds = (point) => Number.isInteger(point?.col) && Number.isInteger(point?.row) &&
    point.col >= 0 && point.col < width && point.row >= 0 && point.row < (grid?.length || 0);
  const isFloor = (point) => inBounds(point) && grid[point.row][point.col] !== "#";
  if (!inBounds(map.playerStart)) errors.push("玩家出生点越界或缺失");
  else if (!isFloor(map.playerStart)) errors.push("玩家出生点必须位于可通行格");

  if (!Array.isArray(map.objects)) errors.push("objects 必须是数组");
  const usedIds = new Set();
  const usedCells = new Set(inBounds(map.playerStart) ? [`${map.playerStart.col},${map.playerStart.row}`] : []);
  (Array.isArray(map.objects) ? map.objects : []).forEach((object) => {
    if (!definitions?.[object?.id]) errors.push(`未知对象 id：${object?.id || "(空)"}`);
    if (usedIds.has(object?.id)) errors.push(`对象 id 重复：${object.id}`);
    usedIds.add(object?.id);
    if (!inBounds(object)) errors.push(`对象 ${object?.id || "(空)"} 的坐标越界`);
    else if (!isFloor(object)) errors.push(`对象 ${object.id} 必须位于可通行格`);
    const cellKey = `${object?.col},${object?.row}`;
    if (usedCells.has(cellKey)) errors.push(`出生点或多个对象重叠在 ${cellKey}`);
    usedCells.add(cellKey);
  });
  return [...new Set(errors)];
}

const MAP_CONFIG_ERRORS = validateMapBundle(window.WORLD_MAP_BUNDLE);
const WORLD_MAP_BUNDLE = MAP_CONFIG_ERRORS.length ? {
  schemaVersion: 1,
  objectDefinitions: {},
  map: {
    meta: { eyebrow: "地图配置错误", title: "无法载入地图" },
    grid: ["#####", "#rrr#", "#rrr#", "#rrr#", "#####"],
    playerStart: { col: 2, row: 2 },
    objects: [],
  },
} : window.WORLD_MAP_BUNDLE;
const WORLD_MAP = WORLD_MAP_BUNDLE.map;
const WORLD_GRID = WORLD_MAP.grid;
const MAP_ROWS = WORLD_GRID.length;
const MAP_COLS = [...WORLD_GRID[0]].length;
const MAP_VIEW_WIDTH = GRID_ORIGIN_X * 2 + MAP_COLS * GRID_SIZE;
const MAP_VIEW_HEIGHT = GRID_ORIGIN_Y * 2 + MAP_ROWS * GRID_SIZE;

function gridPoint(col, row) {
  return {
    x: GRID_ORIGIN_X + col * GRID_SIZE + GRID_SIZE / 2,
    y: GRID_ORIGIN_Y + row * GRID_SIZE + GRID_SIZE / 2,
  };
}

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

const WORLD_OBJECTS = WORLD_MAP.objects.map((placement) => ({
  id: placement.id,
  ...WORLD_MAP_BUNDLE.objectDefinitions[placement.id],
  col: placement.col,
  row: placement.row,
  ...gridPoint(placement.col, placement.row),
}));
const GATE_TILE = WORLD_MAP.objects.find((object) => object.id === "gate") || null;

const elsWorld = {
  mapScreen: $w("#mapScreen"),
  game: $w("#game"),
  mapSvg: $w("#mapSvg"),
  ground: $w("#worldGround"),
  fogBounds: $w("#fogBounds"),
  fogOverlay: $w("#fogOverlay"),
  grid: $w("#worldGrid"),
  objects: $w("#worldObjects"),
  player: $w("#mapPlayer"),
  fogReveal: $w("#fogReveal"),
  prompt: $w("#interactionPrompt"),
  mapHint: $w("#mapHint"),
  eyebrow: $w("#worldEyebrow"),
  title: $w("#worldTitle"),
  day: $w("#worldDay"),
  daysLeft: $w("#daysLeft"),
  hp: $w("#worldHp"),
  hpFill: $w("#worldHpFill"),
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
  elsWorld.fogBounds.setAttribute("width", MAP_VIEW_WIDTH);
  elsWorld.fogBounds.setAttribute("height", MAP_VIEW_HEIGHT);
  elsWorld.fogOverlay.setAttribute("width", MAP_VIEW_WIDTH);
  elsWorld.fogOverlay.setAttribute("height", MAP_VIEW_HEIGHT);
  elsWorld.eyebrow.textContent = WORLD_MAP.meta?.eyebrow || "未命名区域";
  elsWorld.title.textContent = WORLD_MAP.meta?.title || "未命名地图";
}

configureMapFrame();

let world = createInitialWorld();
let worldLoopId = null;
let worldLastTs = 0;
let worldNextMoveAt = 0;
let gridBuilt = false;
let currentTarget = null;
let interactionLocked = false;
const worldKeys = new Set();

function createInitialWorld() {
  const deck = window.BattleBridge.getDefaultDeck();
  return {
    day: 1,
    hp: 60,
    maxHp: 60,
    player: gridPoint(WORLD_MAP.playerStart.col, WORLD_MAP.playerStart.row),
    flags: {},
    inventory: { rustySword: 1, healingPotion: 1 },
    equipment: { leftHand: null, rightHand: null, body: null, head: null, eye: null, heart: null, brain: null },
    sacrificed: {},
    deck,
    innateCardId: null,
    battlesWon: 0,
  };
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

function isObjectAvailable(object) {
  if (!object) return false;
  if (object.id === "eddie" && getFlag("eddieKilled")) return false;
  if (object.id === "chris" && getFlag("chrisGone")) return false;
  if (object.id === "bell" && (getFlag("bellKilled") || getFlag("bellSpared"))) return false;
  if (object.id === "dungA" && getFlag("dungAKilled")) return false;
  if (object.id === "dungB" && getFlag("dungBKilled")) return false;
  return true;
}

function isWalkable(x, y) {
  const col = Math.round((x - GRID_ORIGIN_X - GRID_SIZE / 2) / GRID_SIZE);
  const row = Math.round((y - GRID_ORIGIN_Y - GRID_SIZE / 2) / GRID_SIZE);
  const tile = WORLD_GRID[row]?.[col];
  if (!tile || tile === "#") return false;
  if (!getFlag("bridgeOpened") && GATE_TILE && col === GATE_TILE.col && row === GATE_TILE.row) return false;
  return true;
}

function getNearestObject() {
  let nearest = null;
  let best = Infinity;
  for (const object of WORLD_OBJECTS) {
    if (!isObjectAvailable(object)) continue;
    const distance = Math.hypot(object.x - world.player.x, object.y - world.player.y);
    if (distance < best) {
      best = distance;
      nearest = object;
    }
  }
  return best <= INTERACTION_RADIUS ? nearest : null;
}

function renderGrid() {
  if (!gridBuilt) {
    const tiles = [];
    WORLD_GRID.forEach((rowTiles, row) => {
      [...rowTiles].forEach((tile, col) => {
        const walkable = tile !== "#";
        const neighborWalkable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const neighbor = WORLD_GRID[row + dy]?.[col + dx];
          return neighbor && neighbor !== "#";
        });
        const classes = ["grid-tile"];
        if (walkable) classes.push("floor", tile === "r" ? "room" : "corridor");
        else classes.push(neighborWalkable ? "wall" : "void");
        if (GATE_TILE && col === GATE_TILE.col && row === GATE_TILE.row) classes.push("gate-floor");
        tiles.push(`<rect class="${classes.join(" ")}" data-col="${col}" data-row="${row}"
          x="${GRID_ORIGIN_X + col * GRID_SIZE + 1.5}" y="${GRID_ORIGIN_Y + row * GRID_SIZE + 1.5}"
          width="${GRID_SIZE - 3}" height="${GRID_SIZE - 3}" rx="2"></rect>`);
      });
    });
    elsWorld.grid.innerHTML = tiles.join("");
    gridBuilt = true;
  }
  const gateTile = GATE_TILE ? elsWorld.grid.querySelector(`[data-col="${GATE_TILE.col}"][data-row="${GATE_TILE.row}"]`) : null;
  gateTile?.classList.toggle("sealed", !getFlag("bridgeOpened"));
  gateTile?.classList.toggle("opened", Boolean(getFlag("bridgeOpened")));
}

function renderObjects() {
  elsWorld.objects.innerHTML = "";
  for (const object of WORLD_OBJECTS) {
    if (!isObjectAvailable(object)) continue;
    const group = document.createElementNS(SVG_NS, "g");
    const locked = object.id === "gate" && !getFlag("bridgeOpened");
    group.classList.add("world-object", object.type);
    if (locked) group.classList.add("locked");
    if (currentTarget?.id === object.id) group.classList.add("targeted");
    group.setAttribute("transform", `translate(${object.x} ${object.y})`);
    group.dataset.objectId = object.id;
    group.innerHTML = `
      <circle class="object-ring" r="18"></circle>
      <text class="object-icon" dy="7">${object.icon}</text>
      <text class="object-label" y="39">${object.label}</text>`;
    group.addEventListener("click", () => {
      if (Math.hypot(object.x - world.player.x, object.y - world.player.y) <= INTERACTION_RADIUS) interactWith(object);
    });
    elsWorld.objects.appendChild(group);
  }
}

function renderWorld() {
  if (MAP_CONFIG_ERRORS.length) {
    elsWorld.grid.innerHTML = `<text class="map-config-error-text" x="${MAP_VIEW_WIDTH / 2}" y="${MAP_VIEW_HEIGHT / 2}" text-anchor="middle">地图配置无效</text>`;
    elsWorld.objects.innerHTML = "";
    elsWorld.player.classList.add("hidden");
    elsWorld.prompt.classList.add("hidden");
    elsWorld.mapHint.classList.add("map-config-error");
    elsWorld.mapHint.textContent = MAP_CONFIG_ERRORS.join(" · ");
    console.error("地图配置无效：", MAP_CONFIG_ERRORS);
    return;
  }
  syncMaxHp();
  renderGrid();
  elsWorld.player.classList.remove("hidden");
  elsWorld.player.setAttribute("transform", `translate(${world.player.x} ${world.player.y})`);
  elsWorld.fogReveal.setAttribute("cx", world.player.x);
  elsWorld.fogReveal.setAttribute("cy", world.player.y);
  elsWorld.day.textContent = world.day;
  elsWorld.daysLeft.textContent = world.day < 5 ? `余 ${5 - world.day} 次安全长休` : "再睡一次就不再是人";
  elsWorld.hp.textContent = `${world.hp} / ${world.maxHp}`;
  elsWorld.hpFill.style.width = `${Math.max(0, world.hp / world.maxHp * 100)}%`;
  elsWorld.flagCount.textContent = Object.keys(world.flags).length;
  currentTarget = getNearestObject();
  elsWorld.prompt.classList.toggle("hidden", !currentTarget || isOverlayOpen());
  if (currentTarget) elsWorld.prompt.querySelector("span").textContent = `与${currentTarget.label}交互`;
  elsWorld.mapHint.textContent = getFlag("bridgeOpened")
    ? "WASD / 方向键逐格移动 · L 随时长休 · 山道已开，树林里的粪怪没有血肉。"
    : "浅色格可通行，斜线格不可通行 · L 随时长休 · 封锁格是上山的唯一入口。";
  renderObjects();
  if (!elsWorld.characterPanel.classList.contains("hidden")) renderCharacterPanel();
}

function closeWorldModal() {
  elsWorld.modal.classList.add("hidden");
  interactionLocked = false;
  renderWorld();
}

function showWorldModal({ kicker = "交互", title, body, options = [] }) {
  interactionLocked = true;
  worldKeys.clear();
  elsWorld.modalKicker.textContent = kicker;
  elsWorld.modalTitle.textContent = title;
  elsWorld.modalBody.innerHTML = body;
  elsWorld.modalOptions.innerHTML = "";
  const resolvedOptions = [...options, { label: "离开", hint: "返回地图", close: true }];
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
  worldKeys.clear();
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
      hint: catalog[cardId].text.replace(/<[^>]+>/g, ""),
      action: () => {
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
    hasItem,
    hasSacrificed: (partId) => Boolean(world.sacrificed[partId]),
  };
}

function applyDialogueEffects(effects = []) {
  effects.forEach((effect) => {
    if (effect.action === "set_flag") setFlag(effect.key, effect.value);
  });
}

async function runNpcAction(npcId, actionId) {
  if (actionId === "eddie_buy_daily") {
    const stockId = getDailyStock();
    if (!removeItem("freshFlesh")) return false;
    addItem(stockId);
    setFlag(`eddieBoughtDay${world.day}`, true);
  } else if (actionId === "eddie_buy_key") {
    if (!removeItem("freshFlesh")) return false;
    addItem("oldKey");
  } else if (actionId === "help_chris") {
    if (!removeItem("healingPotion")) return false;
    setFlag("helpedChris", true);
    setFlag("foundSecretPath", true);
    addItem("ladyHat");
  } else if (actionId === "spare_bell") {
    setFlag("bellSpared", true);
    addItem("oldKey");
  } else if (actionId === "fight_eddie") {
    await runBattle("eddie", "eddie");
  } else if (actionId === "fight_bell") {
    await runBattle("bell", "bell");
  }
  return true;
}

function showNpcDialogue(npcId, requestedNodeId = null) {
  const script = window.NPC_DIALOGUES?.[npcId];
  if (!script) return;
  const context = getNpcDialogueContext();
  const nodeId = requestedNodeId || script.start(context);
  const nodeFactory = script.nodes[nodeId];
  const node = typeof nodeFactory === "function" ? nodeFactory(context) : nodeFactory;
  if (!node) return;
  applyDialogueEffects(node.effects);

  const configuredOptions = (node.options || []).map((option) => ({
    label: option.label,
    hint: option.hint,
    enabled: option.enabled,
    action: async () => {
      const completed = option.action ? await runNpcAction(npcId, option.action) : true;
      if (completed !== false && option.next) showNpcDialogue(npcId, option.next);
    },
  }));
  configuredOptions.push({
    label: `向${script.name}献祭身体`,
    hint: "永久失去身体部分，换取规则",
    action: () => showSacrificeMenu(npcId),
  });

  showWorldModal({
    kicker: node.kicker,
    title: node.title || script.name,
    body: node.body,
    options: configuredOptions,
  });
}

function showEddie() { showNpcDialogue("eddie"); }
function showChris() { showNpcDialogue("chris"); }
function showBell() { showNpcDialogue("bell"); }

function showSacrificeMenu(npcId) {
  const npcName = window.NPC_DIALOGUES?.[npcId]?.name || "眼前的人";
  const available = (part) => !world.sacrificed[part];
  showWorldModal({
    kicker: `${npcName} · 血肉交易`,
    title: "献祭自己的身体",
    body: `${npcName}愿意接收仍然新鲜的血肉。这里不需要祭坛。\n<em>完整身体本身也是一种 Build；所有选择均永久生效。</em>`,
    options: [
      { label: "献祭左手", hint: "失去槽位；选择一张牌内化", enabled: available("leftHand"), action: () => chooseInnateCard(npcId) },
      {
        label: "献祭心",
        hint: "解锁秘仪卡；你不会获得蓝条",
        enabled: available("heart"),
        action: () => {
          sacrificeBodyPart("heart");
          if (!world.deck.includes("bleed")) addCard("bleed");
          if (!world.deck.includes("delay")) addCard("delay");
          showSacrificeMenu(npcId);
        },
      },
      {
        label: "献祭眼",
        hint: "每 8 时刻随机出现 2–3 个双倍伤害破绽",
        enabled: available("eye"),
        action: () => { sacrificeBodyPart("eye"); showSacrificeMenu(npcId); },
      },
      {
        label: "献祭头",
        hint: "永久失去头部装备与正常人路线",
        enabled: available("head"),
        action: () => { sacrificeBodyPart("head"); showSacrificeMenu(npcId); },
      },
      {
        label: "献祭脑",
        hint: "与无头掠夺者共享一种理解",
        enabled: available("brain"),
        action: () => { sacrificeBodyPart("brain"); showSacrificeMenu(npcId); },
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
      hint: "失去 0–5 HP；获得物品与卡牌",
      action: () => {
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
    body: `当前 ${world.hp}/${world.maxHp} HP，第 ${world.day} 天。\n你不需要寻找营地：长休会完全恢复生命，然后经过一天。移动、对话、战斗都不会推进天数。`,
    options: [{
      label: world.day < 5 ? "长休到次日" : "闭眼，让第五天结束",
      hint: world.day < 5 ? "HP 完全恢复 · 天数 +1" : "你将化为粪怪",
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
  setFlag(`restedDay${world.day}`, true);
  showWorldModal({
    kicker: "时间推进",
    title: `第 ${world.day} 天`,
    body: "伤口完全闭合。艾迪换了货，幸存者离极限更近了一天。世界中的死人和已经搜过的地方仍保持原样。",
  });
}

function showGate() {
  if (getFlag("bridgeOpened")) {
    showWorldModal({ kicker: "地点 · 已改变", title: "开放的山道", body: "守卫与铁栅已经不再封路。这个状态由 bridgeOpened 持久保存。" });
    return;
  }
  showWorldModal({
    kicker: "地点 · World Flag",
    title: "封锁山道",
    body: "铁栅后的守卫没有兴趣谈判。锁孔很旧，山脊侧面也许另有缝隙。",
    options: [
      {
        label: "使用老旧钥匙",
        hint: hasItem("oldKey") ? "打开道路" : "缺少 oldKey",
        enabled: hasItem("oldKey"),
        action: () => {
          setFlag("bridgeOpened", true);
          showGate();
        },
      },
      {
        label: "走克里斯指出的骨缝",
        hint: getFlag("foundSecretPath") ? "秘密路径可用" : "尚未发现",
        enabled: getFlag("foundSecretPath"),
        action: () => {
          setFlag("bridgeOpened", true);
          showGate();
        },
      },
      { label: "挑战逆流守卫", hint: "胜利后道路开放", action: () => runBattle("guard", "gate") },
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
        stopWorldLoop();
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

function interactWith(object) {
  if (!object || interactionLocked || !isObjectAvailable(object)) return;
  ({
    eddie: showEddie,
    chris: showChris,
    bell: showBell,
    hut: showHut,
    gate: showGate,
    dungA: () => runBattle("dungling", "dungA"),
    dungB: () => runBattle("dungling", "dungB"),
    church: showChurch,
  })[object.id]?.();
}

async function runBattle(enemyId, sourceId) {
  interactionLocked = true;
  stopWorldLoop();
  let battle;
  try {
    battle = await window.BattleBridge.startBattle(enemyId, { playerHp: world.hp, playerMaxHp: world.maxHp });
  } catch (error) {
    console.error(`无法开始战斗：${enemyId}`, error);
    interactionLocked = false;
    elsWorld.mapScreen.classList.remove("hidden");
    renderWorld();
    startWorldLoop();
    showWorldModal({
      kicker: "配置错误 · 战斗未开始",
      title: "战斗数据无法加载",
      body: window.location.protocol === "file:"
        ? "独立 JSON 不能从本地文件页面读取。请通过本地静态服务器打开 <code>index.html</code>。"
        : "角色配置缺失或格式不正确。世界状态没有发生变化，请检查控制台中的具体错误。",
    });
    return;
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
  startWorldLoop();
  if (battle.result === "Lose") {
    stopWorldLoop();
    showWorldModal({
      kicker: "结局 · 死亡",
      title: "三种结局之一",
      body: "这次失败按 Demo 规则作为死亡处理。战斗桥接只返回 Lose；由 World 决定在这里结束，而不是由战斗模块写死 Game Over。",
      options: [{ label: "重新开始 Vertical Slice", hint: "重置世界", action: startNewRun }],
    });
  } else if (battle.result === "Escape") {
    showWorldModal({ kicker: "战斗结果 · Escape", title: "敌人还在", body: "你保住了命，但损失的 HP 没有恢复，地图对象也没有消失。" });
  }
}

const WORLD_MOVE_KEYS = {
  ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
  ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
  ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
};

function updateWorldMovement(ts) {
  worldLastTs = ts;
  if (!isWorldActive() || interactionLocked || isOverlayOpen()) return;
  if (ts < worldNextMoveAt) return;
  let dx = 0;
  let dy = 0;
  worldKeys.forEach((key) => {
    const move = WORLD_MOVE_KEYS[key];
    if (move) { dx += move[0]; dy += move[1]; }
  });
  if (!dx && !dy) return;
  // 跑团式四方向移动：每次严格落在一个格心，不允许切墙角。
  if (dx) dy = 0;
  else dx = 0;
  dx = Math.sign(dx);
  dy = Math.sign(dy);
  const nextX = world.player.x + dx * GRID_SIZE;
  const nextY = world.player.y + dy * GRID_SIZE;
  if (isWalkable(nextX, nextY)) {
    world.player.x = nextX;
    world.player.y = nextY;
  }
  worldNextMoveAt = ts + GRID_MOVE_REPEAT_MS;
  renderWorld();

  const bell = WORLD_OBJECTS.find((object) => object.id === "bell");
  const bellHostile = isObjectAvailable(bell) && !getFlag("bellConfronted") &&
    !(world.sacrificed.head && world.sacrificed.brain) &&
    Math.hypot(bell.x - world.player.x, bell.y - world.player.y) < 42;
  if (bellHostile) {
    setFlag("bellConfronted", true);
    showBell();
  }
}

function startWorldLoop() {
  if (MAP_CONFIG_ERRORS.length || worldLoopId || !isWorldActive()) return;
  worldLastTs = performance.now();
  worldNextMoveAt = 0;
  const step = (ts) => {
    worldLoopId = requestAnimationFrame(step);
    updateWorldMovement(ts);
  };
  worldLoopId = requestAnimationFrame(step);
}

function stopWorldLoop() {
  if (worldLoopId) cancelAnimationFrame(worldLoopId);
  worldLoopId = null;
  worldKeys.clear();
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

function startNewRun() {
  stopWorldLoop();
  world = createInitialWorld();
  currentTarget = null;
  interactionLocked = false;
  elsWorld.modal.classList.add("hidden");
  elsWorld.characterPanel.classList.add("hidden");
  $w("#introOverlay").classList.remove("visible");
  elsWorld.game.classList.add("hidden");
  elsWorld.mapScreen.classList.remove("hidden");
  renderWorld();
  startWorldLoop();
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
    else if (!elsWorld.modal.classList.contains("hidden")) closeWorldModal();
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
    interactWith(currentTarget);
    return;
  }
  if (WORLD_MOVE_KEYS[event.key]) {
    event.preventDefault();
    worldKeys.add(event.key);
  }
});

document.addEventListener("keyup", (event) => {
  worldKeys.delete(event.key);
});

window.addEventListener("blur", () => worldKeys.clear());

renderWorld();
