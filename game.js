"use strict";

const $ = (selector) => document.querySelector(selector);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CARD_LIBRARY = {
  quick: { id: "quick", name: "短促刺击", type: "attack", label: "攻击", cost: 1, icon: "╱", text: "造成 <strong>6</strong> 点伤害。", damage: 6, speed: "迅捷" },
  thrust: { id: "thrust", name: "穿甲突刺", type: "attack", label: "攻击", cost: 2, icon: "ϟ", text: "造成 <strong>12</strong> 点伤害。", damage: 12, speed: "标准" },
  heavy: { id: "heavy", name: "葬仪重斩", type: "attack", label: "攻击", cost: 4, icon: "†", text: "造成 <strong>36</strong> 点伤害。", damage: 36, speed: "迟缓" },
  guard: { id: "guard", name: "灰钢架势", type: "defense", label: "防御", cost: 1, icon: "◇", text: "获得 <strong>12</strong> 点格挡值，抵消受到的伤害。选择补充手牌时，格挡值全部清零。", block: 12, speed: "架势" },
  evade: { id: "evade", name: "鸦步", type: "defense", label: "身法 · 即时", cost: 1, icon: "⌁", text: "弃 <strong>1</strong> 张手牌，闪避下一次攻击。无牌可弃则失败。", evade: true, discardCost: 1, immediate: true, speed: "即时" },
  parry: { id: "parry", name: "听钟辨刃", type: "technique", label: "技法 · 即时", cost: 2, icon: "⌖", text: "弃 <strong>1</strong> 张手牌，招架下一次攻击并反击 <strong>13</strong> 点。无牌可弃则失败。", parry: true, discardCost: 1, immediate: true, speed: "反制" },
  delay: { id: "delay", name: "割裂时序", type: "ritual", label: "秘仪", cost: 1, icon: "◴", text: "结算时令敌方意图延后 <strong>2</strong> 节点。", delay: 2, speed: "操时" },
  bleed: { id: "bleed", name: "刻血", type: "ritual", label: "秘仪", cost: 3, icon: "♢", text: "造成 <strong>2</strong> 点伤害；随后 4 个节点各造成 6 点。", damage: 2, bleed: 4, speed: "持续" },
  focus: { id: "focus", name: "窥见罅隙", type: "technique", label: "技法 · 即时", cost: 1, icon: "⊙", text: "下一张攻击牌伤害提高 <strong>50%</strong>。", focus: .5, immediate: true, speed: "蓄势" },
  mend: { id: "mend", name: "饮下残露", type: "restoration", label: "恢复", cost: 3, icon: "♜", text: "结算时恢复 <strong>13</strong> 点生命。", heal: 13, speed: "迟缓" },
  adjust: { id: "adjust", name: "调整", type: "technique", label: "技法 · 即时", cost: 1, icon: "↺", text: "抽 <strong>2</strong> 张牌。", draw: 2, speed: "调息" },
  adjustStance: { id: "adjustStance", name: "快速换架", type: "technique", label: "技法 · 即时", cost: 0, icon: "↻", text: "弃 <strong>1</strong> 张手牌，抽 <strong>2</strong> 张牌。", discardCost: 1, draw: 2, immediate: true, speed: "调息" },
  feint: { id: "feint", name: "佯攻", type: "technique", label: "技法 · 即时", cost: 1, icon: "◌", text: "指定一张攻击牌，其消耗刻度 <strong>-2</strong>，打出后恢复。", feint: 2, immediate: true, speed: "诱敌" },
  recoverStance: { id: "recoverStance", name: "收势", type: "technique", label: "技法 · 即时", cost: 1, icon: "⌒", text: "如果上一张打出的牌是攻击牌，抽 <strong>1</strong> 张牌。", drawIfPreviousAttack: 1, immediate: true, speed: "回锋" },
  preRead: { id: "preRead", name: "预读", type: "technique", label: "技法 · 即时", cost: 1, icon: "☉", text: "查看牌堆顶 <strong>3</strong> 张，选择 <strong>1</strong> 张加入手牌，其余放回。", scry: 3, immediate: true, speed: "观测" },
  chase: { id: "chase", name: "追击", type: "attack", label: "攻击", cost: 1, icon: "⌁", text: "造成 <strong>10</strong> 点伤害。若拼刀胜出，该卡自动抽回手牌。", damage: 10, returnOnClashWin: true, speed: "追击" },
};

const ENEMY_INTENTS = [
  { name: "哀钟横扫", damage: 24, windup: 3, desc: "沉重的钟摆将扫过战场" },
  { name: "铁靴践踏", damage: 8, windup: 1, desc: "一次短促而凶狠的进逼" },
  { name: "葬礼鸣响", damage: 36, windup: 5, desc: "裂钟中积蓄着致命回声" },
  { name: "锈刃裁断", damage: 28, windup: 4, desc: "狭刃正寻找护甲的缝隙" },
  { name: "末祷审判", damage: 50, windup: 7, desc: "缓慢，却足以终结猎杀" },
  { name: "哀钟横扫", damage: 24, windup: 2, desc: "沉重的钟摆将扫过战场" },

 
];

// 敌方意图队列大小
const ENEMY_INTENT_QUEUE_SIZE = 3;
// 敌方意图中断阈值
const ENEMY_BREAK_THRESHOLD = 3;
// 敌方意图中断持续时间
const ENEMY_BREAK_DURATION = 6;
// 补充手牌冷却时间
const REFILL_COOLDOWN = 6;
// 补充手牌目标手牌大小
const REFILL_TARGET_HAND_SIZE = 6;
// 补充手牌前是否弃掉全部当前手牌，再重新抽满
const REFILL_DISCARD_HAND_BEFORE_DRAW = false;
// 每个时间节点的推进间隔（毫秒），越短节奏越流畅
const NODE_STEP_MS = 160;
// 敌方攻击出手前的预警停顿
const ENEMY_TELL_MS = 110;
// 敌方攻击结算后的余韵停顿
const ENEMY_STRIKE_MS = 190;
// 卡牌结算后的短暂收尾停顿
const RESOLVE_GAP_MS = 130;

const DEFAULT_PLAYER_DECK_CONFIG = [
  { cardId: "quick", count: 2 },
  { cardId: "thrust", count: 2 },
  { cardId: "heavy", count: 1 },
  { cardId: "guard", count: 2 },
  { cardId: "evade", count: 1 },
  { cardId: "parry", count: 1 },
  { cardId: "delay", count: 1 },
  { cardId: "bleed", count: 1 },
  { cardId: "focus", count: 1 },
  { cardId: "mend", count: 2 },
  { cardId: "adjust", count: 2 },
  { cardId: "adjustStance", count: 1 },
  { cardId: "feint", count: 1 },
  { cardId: "recoverStance", count: 1 },
  { cardId: "preRead", count: 1 },
  { cardId: "chase", count: 1 },
];

const PLAYER_DECK_RECIPE = buildDeckRecipe(window.PLAYER_DECK_CONFIG || DEFAULT_PLAYER_DECK_CONFIG);

function buildDeckRecipe(deckConfig) {
  if (!Array.isArray(deckConfig)) {
    console.warn("玩家卡组配置必须是数组，已使用默认卡组。");
    return buildDeckRecipe(DEFAULT_PLAYER_DECK_CONFIG);
  }

  const deckRecipe = [];
  deckConfig.forEach((entry) => {
    const cardId = entry?.cardId ?? entry?.id;
    const count = Number(entry?.count ?? 1);

    if (!CARD_LIBRARY[cardId]) {
      console.warn(`玩家卡组配置忽略未知卡牌：${cardId}`);
      return;
    }
    if (!Number.isInteger(count) || count <= 0) {
      console.warn(`玩家卡组配置忽略无效数量：${cardId} x ${entry?.count}`);
      return;
    }

    for (let i = 0; i < count; i++) deckRecipe.push(cardId);
  });

  if (!deckRecipe.length) {
    console.warn("玩家卡组配置为空，已使用默认卡组。");
    return buildDeckRecipe(DEFAULT_PLAYER_DECK_CONFIG);
  }

  return deckRecipe;
}

const els = {
  game: $("#game"), hand: $("#hand"), timeline: $("#timeline"), currentNode: $("#currentNode"),
  enemyHp: $("#enemyHp"), enemyHpLag: $("#enemyHpLag"), enemyHpText: $("#enemyHpText"),
  playerHp: $("#playerHp"), playerHpText: $("#playerHpText"), playerHpTrack: $("#playerHpTrack"), enemyStatuses: $("#enemyStatuses"),
  playerStatuses: $("#playerStatuses"), intentPanel: $("#intentPanel"), intentName: $("#intentName"),
  intentDamage: $("#intentDamage"), intentDesc: $("#intentDesc"), intentCountdown: $("#intentCountdown"),
  interruptMeter: $("#interruptMeter"), interruptLabel: $("#interruptLabel"),
  interruptProgress: $("#interruptProgress"), interruptThreshold: $("#interruptThreshold"), interruptFill: $("#interruptFill"),
  timelineHint: $("#timelineHint"), combatLog: $("#combatLog"), deckCount: $("#deckCount"),
  discardCount: $("#discardCount"), actionBanner: $("#actionBanner"), damageFlash: $("#damageFlash"),
  enemyFlash: $("#enemyFlash"), introOverlay: $("#introOverlay"), endOverlay: $("#endOverlay"),
  endEyebrow: $("#endEyebrow"), endTitle: $("#endTitle"), endCopy: $("#endCopy"),
  resultNodes: $("#resultNodes"), resultCards: $("#resultCards"), startButton: $("#startButton"),
  restartButton: $("#restartButton"), enemyCanvas: $("#enemyCanvas"), enemyTarget: $("#enemyTarget"),
  playerDropZone: $("#playerDropZone"), dragHint: $("#dragHint"), refillButton: $("#refillButton"),
  vfxLayer: $("#vfxLayer"), mapScreen: $("#mapScreen"), mapHint: $("#mapHint"),
  mapWalls: $("#mapWalls"), mapPlayer: $("#mapPlayer"), mapBoss: $("#mapBoss"), mapKills: $("#mapKills"),
};

const PLAYER_MAX_HP = 60;
const PLAYER_START = { x: 240, y: 655 };
const BOSS_TRIGGER_INSET = 26;
const MAP_MOVE_SPEED = 330;

// 房间布局：普通房间为封闭矩形，走廊只画两侧墙壁（corridor: true）
const MAP_ROOMS = [
  { id: "boss", x: 70, y: 50, w: 210, h: 130, boss: true },
  { id: "r1", x: 280, y: 50, w: 170, h: 130 },
  { id: "r2", x: 450, y: 50, w: 170, h: 130 },
  { id: "r3", x: 620, y: 50, w: 190, h: 130 },
  { id: "cv1", x: 470, y: 180, w: 60, h: 130, corridor: true },
  { id: "r4", x: 170, y: 310, w: 190, h: 140 },
  { id: "r5", x: 360, y: 310, w: 190, h: 140 },
  { id: "cv2", x: 440, y: 450, w: 60, h: 140, corridor: true },
  { id: "r6", x: 150, y: 590, w: 180, h: 130 },
  { id: "r7", x: 330, y: 590, w: 180, h: 130 },
  { id: "r8", x: 510, y: 590, w: 180, h: 130 },
  { id: "r9", x: 690, y: 590, w: 170, h: 130 },
  { id: "r10", x: 830, y: 460, w: 180, h: 140 },
  { id: "ch1", x: 810, y: 530, w: 60, h: 80, corridor: true },
];

let state;
let audioContext;
let dragState = null;

// 出牌动作队列：特效播完前不锁输入，玩家可连续出牌，结算按入队顺序依次播放
const actionQueue = [];
let processingActions = false;

const runState = { playerHp: PLAYER_MAX_HP, battlesWon: 0 };
const mapState = { player: { ...PLAYER_START } };
let lastBattleWon = false;
let mapSceneBuilt = false;
let mapLoopId = null;
let mapLastTs = 0;
const mapKeys = new Set();

function loadEnemyLayer() {
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    try {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const scratch = document.createElement("canvas");
      scratch.width = width;
      scratch.height = height;
      const context = scratch.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, width, height);
      const data = pixels.data;
      const total = width * height;
      const cleared = new Uint8Array(total);
      const queue = new Int32Array(total);
      let head = 0;
      let tail = 0;

      const isConnectedBackdrop = (pixel) => {
        const offset = pixel * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const high = Math.max(r, g, b);
        const low = Math.min(r, g, b);
        const luminance = r * .299 + g * .587 + b * .114;
        return luminance > 178 && high - low < 30;
      };
      const enqueue = (pixel) => {
        if (pixel < 0 || pixel >= total || cleared[pixel] || !isConnectedBackdrop(pixel)) return;
        cleared[pixel] = 1;
        queue[tail++] = pixel;
      };

      for (let x = 0; x < width; x++) {
        enqueue(x);
        enqueue((height - 1) * width + x);
      }
      for (let y = 0; y < height; y++) {
        enqueue(y * width);
        enqueue(y * width + width - 1);
      }
      while (head < tail) {
        const pixel = queue[head++];
        const x = pixel % width;
        if (x > 0) enqueue(pixel - 1);
        if (x < width - 1) enqueue(pixel + 1);
        if (pixel >= width) enqueue(pixel - width);
        if (pixel < total - width) enqueue(pixel + width);
      }

      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      for (let pixel = 0; pixel < total; pixel++) {
        const offset = pixel * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const high = Math.max(r, g, b);
        const low = Math.min(r, g, b);
        const luminance = r * .299 + g * .587 + b * .114;
        const enclosedCheckerPixel = luminance > 231 && high - low < 22;
        if (cleared[pixel] || enclosedCheckerPixel) {
          data[offset + 3] = 0;
        } else {
          const x = pixel % width;
          const y = Math.floor(pixel / width);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }

      context.putImageData(pixels, 0, 0);
      const padding = 10;
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(width - 1, maxX + padding);
      maxY = Math.min(height - 1, maxY + padding);
      const cropWidth = maxX - minX + 1;
      const cropHeight = maxY - minY + 1;
      els.enemyCanvas.width = cropWidth;
      els.enemyCanvas.height = cropHeight;
      els.enemyCanvas.getContext("2d").drawImage(scratch, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      els.enemyTarget.classList.add("layer-ready");
    } catch (error) {
      els.enemyCanvas.width = image.naturalWidth;
      els.enemyCanvas.height = image.naturalHeight;
      els.enemyCanvas.getContext("2d").drawImage(image, 0, 0);
      els.enemyTarget.classList.add("layer-ready", "blend-fallback");
      console.warn("Enemy layer extraction fell back to blend mode.", error);
    }
  };
  image.src = "assets/bell-warden-cutout-v2.png";
}

function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 敌方意图每次随机抽取数量
const ENEMY_INTENT_ROLL_SIZE = 3;

function rollEnemyIntents() {
  const rolled = [];
  for (let i = 0; i < ENEMY_INTENT_ROLL_SIZE; i++) {
    rolled.push(Math.floor(Math.random() * ENEMY_INTENTS.length));
  }
  return shuffled(rolled);
}

function appendEnemyIntents(intents) {
  let countdown = intents.at(-1)?.countdown ?? 0;
  for (const intentIndex of rollEnemyIntents()) {
    countdown += ENEMY_INTENTS[intentIndex].windup;
    intents.push({ intentIndex, countdown, interruptDamage: 0 });
  }
}

function buildEnemyIntentQueue() {
  const intents = [];
  appendEnemyIntents(intents);
  return { intents };
}

function ensureEnemyIntentQueue() {
  while (state.enemy.intents.length < ENEMY_INTENT_QUEUE_SIZE) {
    appendEnemyIntents(state.enemy.intents);
  }
}

function getLeadEnemyEntry() {
  return state.enemy.intents[0];
}

function getLeadEnemyCountdown() {
  if (isEnemyBroken()) return Infinity;
  return getLeadEnemyEntry()?.countdown ?? Infinity;
}

function getEnemyEntryAt(countdown) {
  if (isEnemyBroken()) return null;
  return state.enemy.intents.find((entry) => entry.countdown === countdown);
}

function isEnemyBroken() {
  return Boolean(state?.enemy?.breakRemaining > 0);
}

function getEffectiveCardCost(card, costDelta = 0) {
  const baseCost = isEnemyBroken() ? 1 : card.cost;
  return Math.max(0, baseCost + costDelta);
}

function getHandCardCostDelta(handIndex) {
  return state.handCostDeltas?.[handIndex] ?? 0;
}

function getEffectiveHandCardCost(handIndex) {
  const card = CARD_LIBRARY[state.hand[handIndex]];
  return card ? getEffectiveCardCost(card, getHandCardCostDelta(handIndex)) : 0;
}

function getRefillCost() {
  return 1;
}

function resetBreakProgress(reason = "") {
  if (!state.enemy.breakProgress) return;
  state.enemy.breakProgress = 0;
  if (reason) addLog(reason, "damage");
}

function enterEnemyBreak() {
  state.enemy.breakProgress = 0;
  state.enemy.breakRemaining = ENEMY_BREAK_DURATION;
  state.player.refillCooldown = 0;
  showBanner("BREAK", "break");
  playStatusVfx("break");
  pulseTone(210, .28, .075);
  shakeScreen();
  els.refillButton.classList.remove("refill-ready");
  void els.refillButton.offsetWidth;
  els.refillButton.classList.add("refill-ready");
  addLog(`连续拼刀击溃守卫！失衡 ${ENEMY_BREAK_DURATION} 个节点，期间补充手牌无冷却。`, "good");
  renderAll();
}

function resetState() {
  cancelChoice();
  cancelActiveDrag();
  actionQueue.length = 0;
  const enemyPlan = buildEnemyIntentQueue();
  state = {
    active: false, node: 0, cardsPlayed: 0,
    player: { hp: runState.playerHp, maxHp: PLAYER_MAX_HP, block: 0, evade: false, parry: false, focus: 0, refillCooldown: 0 },
    enemy: { hp: 120, maxHp: 120, intents: enemyPlan.intents, bleedTicks: 0, breakProgress: 0, breakRemaining: 0 },
    deck: shuffled(PLAYER_DECK_RECIPE), discard: [], hand: [], handCostDeltas: [],
    hoveredCard: null, hoveredHandIndex: null, logs: [], choice: null, lastPlayedCardId: null,
  };
  drawCards(REFILL_TARGET_HAND_SIZE);
  els.game.classList.remove("enemy-dead", "shake");
  els.endOverlay.classList.remove("visible");
  renderAll();
  addLog("丧钟守卫举起裂钟。", "");
}

function drawCards(amount) {
  for (let i = 0; i < amount; i++) {
    if (!state.deck.length) {
      if (!state.discard.length) return;
      state.deck = shuffled(state.discard);
      state.discard = [];
      addLog("弃牌重归命运之手。", "good");
    }
    state.hand.push(state.deck.pop());
    state.handCostDeltas.push(0);
  }
}

function renderAll() {
  renderVitals();
  renderIntent();
  renderTimeline();
  renderHand();
  renderLogs();
}

function renderVitals() {
  const enemyPct = Math.max(0, state.enemy.hp / state.enemy.maxHp * 100);
  const playerPct = Math.max(0, state.player.hp / state.player.maxHp * 100);
  els.enemyHp.style.width = `${enemyPct}%`;
  els.enemyHpLag.style.width = `${enemyPct}%`;
  els.enemyHpText.textContent = `${Math.max(0, state.enemy.hp)} / ${state.enemy.maxHp}`;
  els.playerHp.style.width = `${playerPct}%`;
  els.playerHpText.textContent = `${Math.max(0, state.player.hp)} / ${state.player.maxHp}`;
  els.currentNode.textContent = String(state.node).padStart(2, "0");
  els.deckCount.textContent = state.deck.length;
  els.discardCount.textContent = state.discard.length;
  els.game.classList.toggle("enemy-broken", isEnemyBroken());

  const playerStatuses = [];
  if (state.player.block > 0) playerStatuses.push(`<span class="status-chip">护甲 <b>${state.player.block}</b></span>`);
  if (state.player.evade) playerStatuses.push(`<span class="status-chip">鸦步 <b>待命</b></span>`);
  if (state.player.parry) playerStatuses.push(`<span class="status-chip">招架 <b>待命</b></span>`);
  if (state.player.focus) playerStatuses.push(`<span class="status-chip">窥隙 <b>+${formatPercent(state.player.focus)}</b></span>`);
  els.playerStatuses.innerHTML = playerStatuses.join("");

  const enemyStatuses = [];
  if (state.enemy.bleedTicks) enemyStatuses.push(`<span class="status-chip">刻血 <b>${state.enemy.bleedTicks}</b></span>`);
  enemyStatuses.push(`<span class="status-chip stagger-chip">失衡 <b>${state.enemy.breakProgress}/${ENEMY_BREAK_THRESHOLD}</b></span>`);
  if (isEnemyBroken()) enemyStatuses.push(`<span class="status-chip break-chip">BREAK <b>${state.enemy.breakRemaining}</b></span>`);
  els.enemyStatuses.innerHTML = enemyStatuses.join("");
}

function renderIntent() {
  if (isEnemyBroken()) {
    els.intentName.textContent = "BREAK";
    els.intentDamage.textContent = "0";
    els.intentDamage.classList.remove("threat-pop");
    void els.intentDamage.offsetWidth;
    els.intentDamage.classList.add("threat-pop");
    els.intentDesc.textContent = "守卫失衡，敌方攻击暂时停摆";
    els.intentCountdown.textContent = state.enemy.breakRemaining;
    els.interruptMeter.classList.add("free-refill");
    els.interruptLabel.textContent = "补牌特权";
    els.interruptProgress.textContent = "无";
    els.interruptThreshold.textContent = "CD";
    els.interruptFill.style.width = "100%";
    els.interruptMeter.setAttribute("aria-label", "敌人失衡期间，补充手牌不会产生冷却");
    els.intentPanel.classList.remove("danger");
    els.intentPanel.classList.add("break");
    return;
  }

  const leadEntry = getLeadEnemyEntry();
  const intent = ENEMY_INTENTS[leadEntry.intentIndex];
  els.intentName.textContent = intent.name;
  els.intentDamage.textContent = intent.damage;
  els.intentDamage.classList.remove("threat-pop");
  void els.intentDamage.offsetWidth;
  els.intentDamage.classList.add("threat-pop");
  els.intentDesc.textContent = intent.desc;
  els.intentCountdown.textContent = leadEntry.countdown;
  const interruptDamage = Math.min(intent.damage, leadEntry.interruptDamage ?? 0);
  els.interruptMeter.classList.remove("free-refill");
  els.interruptLabel.textContent = "抢攻打断";
  els.interruptProgress.textContent = interruptDamage;
  els.interruptThreshold.textContent = intent.damage;
  els.interruptFill.style.width = `${interruptDamage / intent.damage * 100}%`;
  els.interruptMeter.setAttribute("aria-label", `抢攻打断进度 ${interruptDamage} / ${intent.damage}`);
  els.intentPanel.classList.toggle("danger", leadEntry.countdown <= 2);
  els.intentPanel.classList.remove("break");
}

function renderTimeline() {
  const hover = state.hoveredCard ? CARD_LIBRARY[state.hoveredCard] : null;
  const hoverCost = hover ? getEffectiveCardCost(hover, getHandCardCostDelta(state.hoveredHandIndex)) : null;
  const leadCountdown = getLeadEnemyCountdown();
  const hoverClashEntry = hover ? getEnemyEntryAt(hoverCost) : null;
  els.timeline.innerHTML = "";
  for (let i = 1; i <= 8; i++) {
    const node = document.createElement("div");
    const enemyEntry = getEnemyEntryAt(i);
    const enemyHere = Boolean(enemyEntry);
    const enemyOrder = enemyEntry ? state.enemy.intents.indexOf(enemyEntry) : -1;
    const playerHere = hover && i === hoverCost;
    node.className = `time-node${isEnemyBroken() ? " break-window" : ""}${enemyHere ? " enemy-node" : ""}${enemyOrder > 0 ? " queued-enemy-node" : ""}${playerHere ? " player-node" : ""}${enemyHere && playerHere ? " clash" : ""}`;
    let marker = "";
    if (enemyHere && playerHere) marker = "⚔";
    else if (enemyHere) marker = enemyOrder === 0 ? "◆" : "◇";
    else if (playerHere) marker = "○";
    node.innerHTML = `${marker ? `<span class="marker">${marker}</span>` : ""}<small>${state.node + i}</small>`;
    els.timeline.appendChild(node);
  }
  if (!hover) {
    els.timelineHint.textContent = isEnemyBroken() ? `BREAK 窗口剩余 ${state.enemy.breakRemaining} 节点` : "悬停卡牌以预演结算位置";
  } else if (isEnemyBroken()) {
    els.timelineHint.textContent = `${hover.name} 在 BREAK 中仅消耗 ${hoverCost} 节点`;
  } else if (hoverCost < leadCountdown) {
    const intent = ENEMY_INTENTS[getLeadEnemyEntry().intentIndex];
    const remainingInterruptDamage = Math.max(0, intent.damage - (getLeadEnemyEntry().interruptDamage ?? 0));
    const previewDamage = getPreviewCardDamage(hover);
    els.timelineHint.textContent = previewDamage >= remainingInterruptDamage
      ? `${hover.name} 将抢先打断「${intent.name}」`
      : `${hover.name} 将抢先结算 · 还差 ${remainingInterruptDamage - previewDamage} 伤害可打断`;
  } else if (!hover.immediate && isAttackCard(hover) && hoverClashEntry) {
    els.timelineHint.textContent = `${hover.name} 将与敌方攻击拼刀`;
  } else if (!hover.immediate && hover.block && hoverClashEntry) {
    els.timelineHint.textContent = `${hover.name} 将在敌方攻击时生效`;
  } else if (hover.immediate) {
    els.timelineHint.textContent = `${hover.name} 即时生效，可接住攻击`;
  } else {
    els.timelineHint.textContent = `警告：敌方会在结算前攻击`;
  }
}

function renderHand() {
  els.hand.innerHTML = "";
  renderRefillButton();
  if (state.choice?.kind === "deck") {
    renderDeckChoiceCards();
    return;
  }
  const handChoice = state.choice?.kind === "hand" ? state.choice : null;
  state.hand.forEach((cardId, index) => {
    const card = CARD_LIBRARY[cardId];
    const effectiveCost = getEffectiveHandCardCost(index);
    const enemyTargeted = targetsEnemy(card);
    const button = document.createElement("button");
    const clashReady = !card.immediate && isAttackCard(card) && Boolean(getEnemyEntryAt(effectiveCost));
    const guardReady = !card.immediate && card.block && Boolean(getEnemyEntryAt(effectiveCost));
    const interruptReady = canCardInterruptLeadIntent(card, effectiveCost);
    const risky = !card.immediate && effectiveCost >= getLeadEnemyCountdown() && !clashReady && !guardReady;
    const selectable = !handChoice || handChoice.filter(card, index);
    button.className = `card ${card.type}${risky ? " risky" : ""}${clashReady ? " clash-ready" : ""}${interruptReady ? " interrupt-ready" : ""}${handChoice && selectable ? " choice-selectable" : ""}${handChoice && !selectable ? " choice-blocked" : ""}`;
    button.disabled = !state.active || (handChoice && !selectable);
    button.setAttribute("aria-label", `${card.name}，消耗 ${effectiveCost} 个时间节点`);
    button.innerHTML = `
      <span class="card-time"><span>${effectiveCost}</span></span>
      <p class="card-type">${card.label}</p>
      <div class="card-art"><span>${card.icon}</span></div>
      <h3>${card.name}</h3>
      <p>${card.text}</p>
      <span class="card-key">${index + 1}</span>
      <span class="card-speed">${interruptReady ? "可打断" : clashReady ? "拼刀" : guardReady ? "格挡" : risky ? "危险" : card.speed} · ${enemyTargeted ? "敌方" : "自身"}</span>`;
    button.addEventListener("mouseenter", () => previewCard(card.id, index));
    button.addEventListener("focus", () => previewCard(card.id, index));
    button.addEventListener("mouseleave", clearPreview);
    button.addEventListener("blur", clearPreview);
    if (handChoice) {
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        completeHandChoice(index);
      });
    } else {
      button.addEventListener("pointerdown", (event) => beginCardDrag(event, index, button));
      button.addEventListener("click", (event) => event.preventDefault());
    }
    els.hand.appendChild(button);
  });
}

function renderDeckChoiceCards() {
  state.choice.cards.forEach((cardId, index) => {
    const card = CARD_LIBRARY[cardId];
    const button = document.createElement("button");
    button.className = `card ${card.type} choice-selectable`;
    button.setAttribute("aria-label", `选择 ${card.name}`);
    button.innerHTML = `
      <span class="card-time"><span>${getEffectiveCardCost(card)}</span></span>
      <p class="card-type">${card.label}</p>
      <div class="card-art"><span>${card.icon}</span></div>
      <h3>${card.name}</h3>
      <p>${card.text}</p>
      <span class="card-key">${index + 1}</span>
      <span class="card-speed">预读 · 入手</span>`;
    button.addEventListener("mouseenter", () => previewCard(card.id, null));
    button.addEventListener("focus", () => previewCard(card.id, null));
    button.addEventListener("mouseleave", clearPreview);
    button.addEventListener("blur", clearPreview);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      completeDeckChoice(index);
    });
    els.hand.appendChild(button);
  });
}

function beginHandChoice(prompt, filter) {
  if (!state.active) return Promise.resolve(null);
  cancelActiveDrag();
  return new Promise((resolve) => {
    state.choice = { kind: "hand", prompt, filter, resolve };
    state.hoveredCard = null;
    state.hoveredHandIndex = null;
    els.dragHint.textContent = prompt;
    els.game.classList.add("choosing");
    renderAll();
  });
}

function beginDeckChoice(prompt, cards) {
  if (!state.active || !cards.length) return Promise.resolve(null);
  cancelActiveDrag();
  return new Promise((resolve) => {
    state.choice = { kind: "deck", prompt, cards, resolve };
    state.hoveredCard = null;
    state.hoveredHandIndex = null;
    els.dragHint.textContent = prompt;
    els.game.classList.add("choosing");
    renderAll();
  });
}

function completeHandChoice(index) {
  const choice = state.choice;
  if (choice?.kind !== "hand") return;
  const card = CARD_LIBRARY[state.hand[index]];
  if (!card || !choice.filter(card, index)) return;
  state.choice = null;
  els.game.classList.remove("choosing");
  state.hoveredCard = null;
  state.hoveredHandIndex = null;
  choice.resolve(index);
}

function completeDeckChoice(index) {
  const choice = state.choice;
  if (choice?.kind !== "deck" || index < 0 || index >= choice.cards.length) return;
  state.choice = null;
  els.game.classList.remove("choosing");
  state.hoveredCard = null;
  state.hoveredHandIndex = null;
  choice.resolve(index);
}

function cancelChoice(result = null) {
  if (!state?.choice) return;
  const choice = state.choice;
  state.choice = null;
  els.game.classList.remove("choosing");
  choice.resolve(result);
}

function renderRefillButton() {
  const cooldown = state.player.refillCooldown;
  const cooldownDisabled = !isEnemyBroken() && cooldown > 0;
  els.refillButton.disabled = !state.active || cooldownDisabled || Boolean(state.choice);
  els.refillButton.classList.toggle("cooling", cooldownDisabled);
  els.refillButton.classList.toggle("break-free", isEnemyBroken());
  if (cooldownDisabled) els.refillButton.classList.remove("refill-ready");
  els.refillButton.querySelector("small").textContent = isEnemyBroken() ? "无CD" : cooldownDisabled ? `CD ${cooldown}` : getRefillCost();
  els.refillButton.setAttribute("aria-label", cooldownDisabled
    ? `补充手牌冷却中，还剩 ${cooldown} 个时间节点`
    : `${REFILL_DISCARD_HAND_BEFORE_DRAW ? "弃掉当前手牌并重新抽到" : "保留当前手牌并抽到"} ${REFILL_TARGET_HAND_SIZE} 张，消耗 ${getRefillCost()} 个时间节点${isEnemyBroken() ? "，失衡期间不产生冷却" : ""}`);
}

function targetsEnemy(card) {
  return card.type === "attack" || Boolean(card.damage || card.delay || card.bleed);
}

function isAttackCard(card) {
  return card?.type === "attack" && Boolean(card.damage);
}

function getPreviewCardDamage(card) {
  if (!card?.damage) return 0;
  return isAttackCard(card) && state.player.focus
    ? Math.ceil(card.damage * (1 + state.player.focus))
    : card.damage;
}

function canCardInterruptLeadIntent(card, effectiveCost) {
  if (isEnemyBroken() || !card?.damage || effectiveCost >= getLeadEnemyCountdown()) return false;
  const entry = getLeadEnemyEntry();
  const intent = ENEMY_INTENTS[entry.intentIndex];
  return getPreviewCardDamage(card) >= Math.max(0, intent.damage - (entry.interruptDamage ?? 0));
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function beginCardDrag(event, handIndex, source) {
  if (!state.active || state.choice || dragState || (event.button !== undefined && event.button !== 0)) return;
  const card = CARD_LIBRARY[state.hand[handIndex]];
  if (!card) return;
  event.preventDefault();

  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true);
  ghost.disabled = false;
  ghost.classList.add("drag-ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.left = `${event.clientX}px`;
  ghost.style.top = `${event.clientY}px`;
  ghost.style.setProperty("--drag-tilt", "0deg");
  document.body.appendChild(ghost);
  source.classList.add("drag-source");

  dragState = {
    pointerId: event.pointerId,
    handIndex,
    card,
    source,
    ghost,
    startX: rect.left + rect.width / 2,
    startY: rect.top + rect.height / 2,
    x: event.clientX,
    y: event.clientY,
    valid: false,
  };

  els.game.classList.add("dragging");
  els.dragHint.textContent = "拖至释放区松手";
  state.hoveredCard = card.id;
  state.hoveredHandIndex = handIndex;
  renderTimeline();
  updateDrag(event);
  window.addEventListener("pointermove", updateDrag, { passive: false });
  window.addEventListener("pointerup", finishCardDrag, { passive: false });
  window.addEventListener("pointercancel", cancelActiveDrag, { passive: false });
}

function updateDrag(event) {
  if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return;
  event.preventDefault?.();
  if (state.hoveredCard !== dragState.card.id) {
    state.hoveredCard = dragState.card.id;
    state.hoveredHandIndex = dragState.handIndex;
    renderTimeline();
  }
  dragState.x = event.clientX;
  dragState.y = event.clientY;
  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  const distance = Math.hypot(dx, dy);
  const tilt = Math.max(-10, Math.min(10, dx / 18));
  dragState.ghost.style.left = `${event.clientX}px`;
  dragState.ghost.style.top = `${event.clientY}px`;
  dragState.ghost.style.setProperty("--drag-tilt", `${tilt}deg`);

  const nx = (event.clientX / window.innerWidth - .5) * 2;
  const ny = (event.clientY / window.innerHeight - .5) * 2;
  setParallax(nx, ny);

  const target = els.playerDropZone;
  const targetRect = target.getBoundingClientRect();
  dragState.valid = distance > 45 && event.clientX >= targetRect.left && event.clientX <= targetRect.right &&
    event.clientY >= targetRect.top && event.clientY <= targetRect.bottom;

  dragState.ghost.classList.toggle("valid", dragState.valid);
  target.classList.toggle("drop-active", dragState.valid);
  els.dragHint.textContent = dragState.valid
    ? `松手释放「${dragState.card.name}」`
    : "拖至释放区松手";
}

function finishCardDrag(event) {
  if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return;
  event.preventDefault?.();
  const { valid, card, ghost, startX, startY, handIndex } = dragState;

  if (!valid) {
    ghost.classList.add("returning");
    ghost.style.left = `${startX}px`;
    ghost.style.top = `${startY}px`;
  }

  cleanupDrag(valid);
  if (valid) {
    playCard(handIndex);
  }
}

function cleanupDrag(committed = false) {
  if (!dragState) return;
  const { ghost, source } = dragState;
  source?.classList.remove("drag-source");
  els.playerDropZone.classList.remove("drop-active");
  els.game.classList.remove("dragging");
  window.removeEventListener("pointermove", updateDrag);
  window.removeEventListener("pointerup", finishCardDrag);
  window.removeEventListener("pointercancel", cancelActiveDrag);
  state.hoveredCard = null;
  state.hoveredHandIndex = null;
  renderTimeline();
  resetParallax();
  dragState = null;
  if (committed) ghost.remove();
  else setTimeout(() => ghost.remove(), 210);
}

function cancelActiveDrag() {
  if (!dragState) return;
  dragState.ghost.classList.add("returning");
  dragState.ghost.style.left = `${dragState.startX}px`;
  dragState.ghost.style.top = `${dragState.startY}px`;
  cleanupDrag(false);
}

function setParallax(nx, ny) {
  const aimBoost = dragState?.valid ? 1.35 : 1;
  els.game.style.setProperty("--bg-x", `${-nx * 7}px`);
  els.game.style.setProperty("--bg-y", `${-ny * 4}px`);
  els.game.style.setProperty("--mist-x", `${nx * 8}px`);
  els.game.style.setProperty("--mist-y", `${ny * 5}px`);
  els.game.style.setProperty("--enemy-x", `${nx * 19 * aimBoost}px`);
  els.game.style.setProperty("--enemy-y", `${ny * 10 * aimBoost}px`);
  els.game.style.setProperty("--fg-x", `${nx * 29}px`);
  els.game.style.setProperty("--fg-y", `${ny * 15}px`);
}

function resetParallax() {
  ["--bg-x", "--bg-y", "--mist-x", "--mist-y", "--enemy-x", "--enemy-y", "--fg-x", "--fg-y"]
    .forEach((property) => els.game.style.setProperty(property, "0px"));
}

function previewCard(cardId, handIndex = null) {
  state.hoveredCard = cardId;
  state.hoveredHandIndex = handIndex;
  renderTimeline();
}

function clearPreview() {
  if (dragState) {
    state.hoveredCard = dragState.card.id;
    return;
  }
  state.hoveredCard = null;
  state.hoveredHandIndex = null;
  renderTimeline();
}

function addLog(text, tone = "") {
  if (!state) return;
  state.logs.unshift({ text, tone });
  state.logs = state.logs.slice(0, 3);
  renderLogs();
}

function renderLogs() {
  els.combatLog.innerHTML = state.logs.map((entry, i) =>
    `<p class="log-entry ${entry.tone} ${i > 0 ? "old" : ""}">${entry.text}</p>`
  ).join("");
}

function showBanner(text, variant = "") {
  els.actionBanner.textContent = text;
  els.actionBanner.classList.remove("show");
  els.actionBanner.classList.toggle("clash-banner", variant === "clash");
  els.actionBanner.classList.toggle("break-banner", variant === "break");
  void els.actionBanner.offsetWidth;
  els.actionBanner.classList.add("show");
}

function getVfxPoint(element, x = .5, y = .5) {
  const bounds = element.getBoundingClientRect();
  const gameBounds = els.game.getBoundingClientRect();
  return {
    x: bounds.left - gameBounds.left + bounds.width * x,
    y: bounds.top - gameBounds.top + bounds.height * y,
  };
}

function getEnemyImpactPoint() {
  return getVfxPoint(els.enemyTarget, .5, .28);
}

function getPlayerImpactPoint() {
  return getVfxPoint(els.playerDropZone, .5, .48);
}

function getPlayerDamageNumberPoint() {
  return getVfxPoint(els.playerHpTrack, .5, .5);
}

function getEnemyDamageNumberPoint() {
  return getVfxPoint(els.enemyTarget, .5, .31);
}

function spawnVfx(kind, point, options = {}) {
  if (!els.vfxLayer) return;
  while (els.vfxLayer.childElementCount >= 22) els.vfxLayer.firstElementChild?.remove();
  const node = document.createElement("i");
  node.className = `vfx ${kind}`;
  node.style.left = `${point.x}px`;
  node.style.top = `${point.y}px`;
  if (options.size) node.style.setProperty("--vfx-size", `${options.size}px`);
  if (options.rotation !== undefined) node.style.setProperty("--vfx-rotation", `${options.rotation}deg`);
  if (options.tone) node.style.setProperty("--vfx-tone", options.tone);
  els.vfxLayer.appendChild(node);
  setTimeout(() => node.remove(), options.duration ?? 760);
}

function spawnDamageNumber(target, amount) {
  if (!els.vfxLayer || amount <= 0) return;
  const point = target === "player" ? getPlayerDamageNumberPoint() : getEnemyDamageNumberPoint();
  const node = document.createElement("span");
  node.className = `damage-number damage-number-${target}`;
  node.textContent = `-${amount}`;
  node.style.left = `${point.x + (Math.random() - .5) * 24}px`;
  node.style.top = `${point.y}px`;
  els.vfxLayer.appendChild(node);
  setTimeout(() => node.remove(), 1280);
}

function spawnTrail(from, to, tone = "#d8c6af") {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const trail = document.createElement("i");
  trail.className = "vfx vfx-trail";
  trail.style.left = `${from.x}px`;
  trail.style.top = `${from.y}px`;
  trail.style.setProperty("--vfx-length", `${Math.max(42, Math.hypot(dx, dy))}px`);
  trail.style.setProperty("--vfx-rotation", `${Math.atan2(dy, dx) * 180 / Math.PI}deg`);
  trail.style.setProperty("--vfx-tone", tone);
  els.vfxLayer.appendChild(trail);
  setTimeout(() => trail.remove(), 520);
}

function playCardCastVfx(card) {
  const player = getPlayerImpactPoint();
  const enemy = getEnemyImpactPoint();
  const targetsEnemyNow = targetsEnemy(card);
  const target = targetsEnemyNow ? enemy : player;
  const tone = card.type === "ritual" ? "#a576ad" : card.type === "defense" ? "#91b7cc" : card.type === "restoration" ? "#8cad7e" : "#d7c19e";
  spawnVfx("vfx-cast", target, { size: targetsEnemyNow ? 112 : 96, tone, duration: 620 });
  if (targetsEnemyNow) spawnTrail({ x: player.x, y: player.y + 55 }, enemy, tone);
}

function playPlayerAttackVfx(card) {
  const player = getPlayerImpactPoint();
  const enemy = getEnemyImpactPoint();
  const heavy = getEffectiveCardCost(card) >= 4;
  spawnTrail({ x: player.x + 36, y: player.y + 38 }, enemy, heavy ? "#f0cfad" : "#e5d4bd");
  spawnVfx("vfx-slash", enemy, { size: heavy ? 230 : 170, rotation: heavy ? -18 : -31, tone: heavy ? "#f3d1ae" : "#e6ddcf", duration: 520 });
  spawnVfx("vfx-impact", enemy, { size: heavy ? 178 : 130, tone: heavy ? "#e6b486" : "#dfd2bd", duration: 620 });
}

function playEnemyAttackVfx(intent) {
  const enemy = getEnemyImpactPoint();
  const player = getPlayerImpactPoint();
  const size = Math.min(220, 94 + intent.damage * 2);
  spawnVfx("vfx-enemy-tell", enemy, { size, tone: "#b63d42", duration: 680 });
  spawnTrail(enemy, { x: player.x, y: player.y + 4 }, "#cb4044");
}

function playStatusVfx(type) {
  const enemy = getEnemyImpactPoint();
  const player = getPlayerImpactPoint();
  const center = { x: (enemy.x + player.x) / 2, y: (enemy.y + player.y) / 2 };
  const effects = {
    evade: ["vfx-evade", player, 130, "#c7d4df"],
    parry: ["vfx-parry", player, 150, "#f1d1a0"],
    focus: ["vfx-focus", enemy, 158, "#d4a16e"],
    guard: ["vfx-guard", player, 148, "#8eb6ca"],
    delay: ["vfx-delay", enemy, 170, "#a379ba"],
    heal: ["vfx-heal", player, 148, "#91b780"],
    draw: ["vfx-draw", player, 138, "#d4b77a"],
    bleed: ["vfx-bleed", enemy, 142, "#b73a42"],
    clash: ["vfx-clash", center, 200, "#f0c98e"],
    break: ["vfx-clash", enemy, 260, "#ffd28b"],
    interrupt: ["vfx-interrupt", enemy, 230, "#f3c36f"],
  };
  const [kind, point, size, tone] = effects[type] || [];
  if (kind) spawnVfx(kind, point, { size, tone });
}

function pulseTone(frequency = 130, duration = .08, volume = .035) {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (_) { /* Audio is optional. */ }
}

function playCard(handIndex) {
  if (state.choice?.kind === "hand") {
    completeHandChoice(handIndex);
    return;
  }
  if (state.choice?.kind === "deck") {
    completeDeckChoice(handIndex);
    return;
  }
  if (!state.active || handIndex < 0 || handIndex >= state.hand.length) return;
  const cardId = state.hand.splice(handIndex, 1)[0];
  const costDelta = state.handCostDeltas.splice(handIndex, 1)[0] ?? 0;
  state.hoveredCard = null;
  state.hoveredHandIndex = null;
  renderAll();
  enqueueAction(() => performCardPlay(cardId, costDelta));
}

function enqueueAction(action) {
  actionQueue.push(action);
  processActionQueue();
}

async function processActionQueue() {
  if (processingActions) return;
  processingActions = true;
  try {
    while (actionQueue.length) {
      const action = actionQueue.shift();
      await action();
      if (!state.active) { actionQueue.length = 0; break; }
    }
  } finally {
    processingActions = false;
  }
}

async function performCardPlay(cardId, costDelta = 0) {
  let cardClashed = false;
  let cardBlockPreResolved = false;
  const card = CARD_LIBRARY[cardId];
  const effectiveCost = getEffectiveCardCost(card, costDelta);
  const previousCardId = state.lastPlayedCardId;
  state.cardsPlayed++;
  state.discard.push(cardId);
  showBanner(card.name);
  playCardCastVfx(card);
  addLog(`你打出「${card.name}」，刻度推进 ${effectiveCost}。`, "good");
  pulseTone(180, .1, .025);

  if (card.immediate) await applyImmediate(card, { previousCardId });
  renderAll();

  for (let step = 0; step < effectiveCost; step++) {
    await wait(NODE_STEP_MS);
    if (!state.active) return;
    const resolvesNow = !card.immediate && step === effectiveCost - 1;
    const result = await advanceNode(resolvesNow ? card : null);
    cardClashed ||= result.clashed;
    cardBlockPreResolved ||= result.preResolvedBlock;
    if (!state.active) return;
  }

  if (!card.immediate && state.active) {
    resolveCard(card, { skipDamage: cardClashed, skipBlock: cardBlockPreResolved });
    renderAll();
    await wait(RESOLVE_GAP_MS);
  }

  state.lastPlayedCardId = cardId;
  checkBattleEnd();
}

function replenishHand() {
  if (!state.active || state.choice || (!isEnemyBroken() && state.player.refillCooldown > 0)) return;
  cancelActiveDrag();
  state.hoveredCard = null;
  enqueueAction(performReplenish);
}

async function performReplenish() {
  if (!isEnemyBroken() && state.player.refillCooldown > 0) return;
  const noCooldown = isEnemyBroken();
  showBanner("补充手牌");
  playStatusVfx("draw");
  if (state.player.block > 0) {
    state.player.block = 0;
    addLog("换气之间，灰钢架势崩解：格挡值全部清零。", "damage");
  }
  if (REFILL_DISCARD_HAND_BEFORE_DRAW && state.hand.length > 0) {
    const discardedCount = state.hand.length;
    state.discard.push(...state.hand);
    state.hand.length = 0;
    state.handCostDeltas.length = 0;
    addLog(`你弃掉当前 ${discardedCount} 张手牌，重新整理牌堆。`, "good");
  }
  const cardsNeeded = Math.max(0, REFILL_TARGET_HAND_SIZE - state.hand.length);
  if (cardsNeeded > 0) {
    const handBeforeDraw = state.hand.length;
    drawCards(cardsNeeded);
    const cardsDrawn = state.hand.length - handBeforeDraw;
    addLog(cardsDrawn > 0
      ? `${REFILL_DISCARD_HAND_BEFORE_DRAW ? "你重新整理牌组，抽取" : "你稳住呼吸，补入"} ${cardsDrawn} 张手牌。`
      : "你试图补充手牌，但已无牌可抽。", "good");
  } else {
    addLog("手牌已足，无需抽牌。", "good");
  }
  pulseTone(145, .1, .025);
  renderAll();

  await wait(NODE_STEP_MS);
  if (!state.active) return;
  await advanceNode();
  if (!state.active) return;
  state.player.refillCooldown = noCooldown ? 0 : REFILL_COOLDOWN;
  if (noCooldown) addLog("失衡窗口仍在延续：本次补牌不进入冷却。", "good");
  renderAll();

  checkBattleEnd();
}

async function applyImmediate(card, context = {}) {
  if (card.discardCost && !await discardHandForCardCost(card)) return false;

  if (card.evade) {
    state.player.evade = true;
    playStatusVfx("evade");
    addLog("你的身影隐入鸦羽。", "good");
  }
  if (card.parry) {
    state.player.parry = true;
    playStatusVfx("parry");
    addLog("你开始倾听武器撕开空气的声音。", "good");
  }
  if (card.focus) {
    state.player.focus += card.focus;
    playStatusVfx("focus");
    addLog(`你窥见甲胄罅隙：下次攻击 +${formatPercent(card.focus)}。`, "good");
  }
  if (card.feint) {
    await applyFeint(card);
  }
  if (card.drawIfPreviousAttack) {
    const previousCard = CARD_LIBRARY[context.previousCardId];
    if (isAttackCard(previousCard)) {
      drawCards(card.drawIfPreviousAttack);
      playStatusVfx("draw");
      addLog(`你顺着上一击收势，抽取 ${card.drawIfPreviousAttack} 张牌。`, "good");
    } else {
      addLog("上一张并非攻击牌，收势没有抽牌。", "damage");
    }
  }
  if (card.scry) {
    await resolveScry(card);
  }
  if (card.draw) {
    drawCards(card.draw);
    playStatusVfx("draw");
    addLog(`你调整呼吸，抽取 ${card.draw} 张牌。`, "good");
  }
  return true;
}

async function applyFeint(card) {
  const hasTarget = state.hand.some((cardId, index) => isAttackCard(CARD_LIBRARY[cardId]) && getEffectiveHandCardCost(index) > 0);
  if (!hasTarget) {
    addLog("没有可被佯攻牵动的攻击牌。", "damage");
    return false;
  }

  const index = await beginHandChoice("选择一张攻击牌：消耗刻度 -1", (candidate, handIndex) =>
    isAttackCard(candidate) && getEffectiveHandCardCost(handIndex) > 0
  );
  if (index === null) return false;

  state.handCostDeltas[index] = getHandCardCostDelta(index) - card.feint;
  playStatusVfx("focus");
  addLog(`你以佯攻牵动节奏，「${CARD_LIBRARY[state.hand[index]].name}」消耗刻度 -${card.feint}。`, "good");
  return true;
}

async function discardHandForCardCost(card) {
  if (!card.discardCost) return true;
  if (state.hand.length < card.discardCost) {
    addLog(`「${card.name}」需要弃牌，但你已无牌可弃，效果失败。`, "damage");
    return false;
  }

  for (let i = 0; i < card.discardCost; i++) {
    const index = await beginHandChoice(`选择 ${card.discardCost - i} 张牌弃掉`, () => true);
    if (index === null) return false;
    const discardedId = state.hand.splice(index, 1)[0];
    state.handCostDeltas.splice(index, 1);
    state.discard.push(discardedId);
    addLog(`你弃掉「${CARD_LIBRARY[discardedId].name}」作为代价。`, "good");
  }
  return true;
}

function takeDeckTopCards(amount) {
  const cards = [];
  for (let i = 0; i < amount; i++) {
    if (!state.deck.length) {
      if (!state.discard.length) break;
      state.deck = shuffled(state.discard);
      state.discard = [];
      addLog("弃牌重归命运之手。", "good");
    }
    cards.push(state.deck.pop());
  }
  return cards;
}

function putCardsBackOnDeck(cards) {
  for (let i = cards.length - 1; i >= 0; i--) {
    state.deck.push(cards[i]);
  }
}

async function resolveScry(card) {
  const seenCards = takeDeckTopCards(card.scry);
  if (!seenCards.length) {
    addLog("牌堆与弃牌堆皆空，预读无牌可取。", "damage");
    return false;
  }

  const index = await beginDeckChoice(`预读牌堆顶 ${seenCards.length} 张：选择 1 张加入手牌`, seenCards);
  if (index === null) {
    putCardsBackOnDeck(seenCards);
    return false;
  }

  const chosenId = seenCards[index];
  const remaining = seenCards.filter((_, cardIndex) => cardIndex !== index);
  putCardsBackOnDeck(remaining);
  state.hand.push(chosenId);
  state.handCostDeltas.push(0);
  playStatusVfx("draw");
  addLog(`你预读命运，取走「${CARD_LIBRARY[chosenId].name}」。`, "good");
  return true;
}

function consumeCardDamage(card) {
  let damage = card.damage;
  if (isAttackCard(card) && state.player.focus) {
    damage = Math.ceil(damage * (1 + state.player.focus));
    state.player.focus = 0;
    addLog("罅隙被命中，攻击伤害提高。", "good");
  }
  return damage;
}

function applyCardBlock(card) {
  state.player.block += card.block;
  playStatusVfx("guard");
  addLog(`灰钢架势落定：获得 ${card.block} 点格挡值。`, "good");
}

function resolveCard(card, options = {}) {
  if (card.block && !options.skipBlock) {
    applyCardBlock(card);
  }
  if (card.damage && !options.skipDamage) {
    const damage = consumeCardDamage(card);
    playPlayerAttackVfx(card);
    damageEnemy(damage);
  }
  if (card.bleed && state.enemy.hp > 0) {
    state.enemy.bleedTicks += card.bleed;
    playStatusVfx("bleed");
    addLog(`刻血嵌入铁甲，将持续 ${card.bleed} 个节点。`, "damage");
  }
  if (card.delay && state.enemy.hp > 0) {
    state.enemy.intents.forEach((entry) => entry.countdown += card.delay);
    playStatusVfx("delay");
    addLog(`敌方意图队列被撕开，整体延后 ${card.delay} 个节点。`, "good");
  }
  if (card.heal) {
    const healed = Math.min(card.heal, state.player.maxHp - state.player.hp);
    state.player.hp += healed;
    playStatusVfx("heal");
    addLog(`残露缝合伤口，恢复 ${healed} 点生命。`, "good");
    pulseTone(260, .14, .02);
  }
  if (card.draw) {
    drawCards(card.draw);
    playStatusVfx("draw");
    addLog(`你调整呼吸，抽取 ${card.draw} 张牌。`, "good");
  }
}

async function advanceNode(resolvingCard = null) {
  state.node++;
  const result = { clashed: false, preResolvedBlock: false };
  if (state.player.refillCooldown > 0) state.player.refillCooldown--;
  const wasBroken = isEnemyBroken();
  if (wasBroken) state.enemy.breakRemaining--;
  else state.enemy.intents.forEach((entry) => entry.countdown--);
  let clashed = false;
  pulseTone(75 + Math.max(0, 4 - getLeadEnemyCountdown()) * 18, .07, .018);

  if (state.enemy.bleedTicks > 0) {
    state.enemy.bleedTicks--;
    playStatusVfx("bleed");
    damageEnemy(6, false);
    addLog("刻血随时间撕裂伤口：3 点伤害。", "damage");
    if (checkBattleEnd()) return result;
  }

  els.intentPanel.classList.remove("ticking");
  void els.intentPanel.offsetWidth;
  els.intentPanel.classList.add("ticking");
  renderVitals();
  renderIntent();
  renderTimeline();

  if (wasBroken) {
    if (state.enemy.breakRemaining <= 0) {
      state.enemy.breakRemaining = 0;
      showBanner("压迫回归");
      addLog("失衡结束，守卫重新稳住攻势。", "damage");
      pulseTone(70, .18, .055);
      renderAll();
    }
    return result;
  }

  if (getLeadEnemyCountdown() <= 0) {
    await wait(ENEMY_TELL_MS);
    if (resolvingCard?.block) {
      applyCardBlock(resolvingCard);
      result.preResolvedBlock = true;
      renderAll();
    }
    clashed = resolveEnemyAttack(resolvingCard);
    result.clashed = clashed;
    if (checkBattleEnd()) return result;
    await wait(ENEMY_STRIKE_MS);
  }
  return result;
}

function resolveEnemyAttack(resolvingCard = null) {
  const entry = getLeadEnemyEntry();
  const intent = ENEMY_INTENTS[entry.intentIndex];
  showBanner(intent.name);
  playEnemyAttackVfx(intent);
  pulseTone(55, .26, .075);

  let clashed = false;
  if (resolvingCard && isAttackCard(resolvingCard)) {
    clashed = true;
    resolveClash(intent, resolvingCard);
  } else if (state.player.evade) {
    state.player.evade = false;
    resetBreakProgress("闪避打断了连续拼刀节奏，失衡进度归零。");
    playStatusVfx("evade");
    addLog(`${intent.name}落空——只斩中了散开的鸦羽。`, "good");
  } else if (state.player.parry) {
    state.player.parry = false;
    resetBreakProgress("招架打断了连续拼刀节奏，失衡进度归零。");
    playStatusVfx("parry");
    addLog(`完美招架！你以裂响回敬守卫。`, "good");
    damageEnemy(13);
  } else {
    if (resolvingCard?.block) resetBreakProgress("格挡打断了连续拼刀节奏，失衡进度归零。");
    damagePlayer(intent.damage, intent.name);
  }

  state.enemy.intents.shift();
  ensureEnemyIntentQueue();
  renderAll();
  return clashed;
}

function resolveClash(intent, card) {
  const playerDamage = consumeCardDamage(card);
  const enemyDamage = intent.damage;
  const remainder = playerDamage - enemyDamage;
  showBanner("拼刀", "clash");
  playStatusVfx("clash");
  registerClashStagger();
  shakeScreen();
  pulseTone(175, .16, .05);

  if (remainder > 0) {
    addLog(`拼刀！「${card.name}」压过${intent.name}，余势 ${remainder} 点。`, "good");
    damageEnemy(remainder);
    if (card.returnOnClashWin) returnPlayedCardToHand(card);
  } else if (remainder < 0) {
    const incoming = Math.abs(remainder);
    addLog(`拼刀！${intent.name}压过「${card.name}」，残伤 ${incoming} 点。`, "damage");
    damagePlayer(incoming, `${intent.name}余势`, { preserveBreakProgress: true });
  } else {
    addLog(`拼刀！「${card.name}」与${intent.name}互相弹开。`, "good");
    pulseTone(110, .12, .035);
  }
}

function returnPlayedCardToHand(card) {
  const discardIndex = state.discard.lastIndexOf(card.id);
  if (discardIndex >= 0) state.discard.splice(discardIndex, 1);
  state.hand.push(card.id);
  state.handCostDeltas.push(0);
  playStatusVfx("draw");
  addLog(`「${card.name}」乘胜追回手牌。`, "good");
}

function registerClashStagger() {
  if (isEnemyBroken()) return;
  state.enemy.breakProgress++;
  addLog(`拼刀撼动守卫：失衡 ${state.enemy.breakProgress}/${ENEMY_BREAK_THRESHOLD}。`, "good");
  if (state.enemy.breakProgress >= ENEMY_BREAK_THRESHOLD) enterEnemyBreak();
}

function registerPreemptiveDamage(amount) {
  const entry = getLeadEnemyEntry();
  if (!entry || isEnemyBroken() || entry.countdown <= 0 || state.enemy.hp <= 0) return false;
  const intent = ENEMY_INTENTS[entry.intentIndex];
  entry.interruptDamage = (entry.interruptDamage ?? 0) + amount;
  if (entry.interruptDamage < intent.damage) return false;

  state.enemy.intents.shift();
  ensureEnemyIntentQueue();
  showBanner("攻击打断", "interrupt");
  playStatusVfx("interrupt");
  shakeScreen();
  pulseTone(230, .18, .055);
  addLog(`抢攻累计造成 ${entry.interruptDamage} 点伤害，「${intent.name}」被打断！`, "good");
  els.intentPanel.classList.remove("interrupted");
  void els.intentPanel.offsetWidth;
  els.intentPanel.classList.add("interrupted");
  setTimeout(() => els.intentPanel.classList.remove("interrupted"), 620);
  return true;
}

function damageEnemy(amount, dramatic = true) {
  state.enemy.hp -= amount;
  spawnDamageNumber("enemy", amount);
  if (dramatic) {
    addLog(`丧钟守卫受到 ${amount} 点伤害。`, "damage");
    hitEffect("enemy");
    pulseTone(95, .1, .04);
  }
  registerPreemptiveDamage(amount);
  renderVitals();
}

function damagePlayer(amount, sourceName, options = {}) {
  let incoming = amount;
  const absorbed = Math.min(incoming, state.player.block);
  state.player.block -= absorbed;
  incoming -= absorbed;
  if (absorbed) addLog(`护甲吸收了 ${absorbed} 点伤害。`, "good");
  if (incoming > 0) {
    if (!options.preserveBreakProgress) {
      resetBreakProgress("被敌人命中，失衡进度归零。");
    }
    state.player.hp -= incoming;
    spawnDamageNumber("player", incoming);
    addLog(`${sourceName}命中：受到 ${incoming} 点伤害。`, "damage");
    hitEffect("player");
  } else {
    addLog(`${sourceName}被灰钢完全挡下。`, "good");
    playStatusVfx("guard");
    pulseTone(110, .12, .035);
  }
}

function hitEffect(target) {
  const flash = target === "player" ? els.damageFlash : els.enemyFlash;
  flash.classList.remove("hit");
  void flash.offsetWidth;
  flash.classList.add("hit");
  spawnVfx("vfx-impact", target === "player" ? getPlayerImpactPoint() : getEnemyImpactPoint(), {
    size: target === "player" ? 170 : 146,
    tone: target === "player" ? "#d75155" : "#ebd9bf",
  });
  shakeScreen();
}

function shakeScreen() {
  els.game.classList.remove("shake");
  void els.game.offsetWidth;
  els.game.classList.add("shake");
  setTimeout(() => els.game.classList.remove("shake"), 360);
}

function checkBattleEnd() {
  if (state.enemy.hp <= 0) {
    finishBattle(true);
    return true;
  }
  if (state.player.hp <= 0) {
    finishBattle(false);
    return true;
  }
  return false;
}

function finishBattle(won) {
  state.active = false;
  cancelChoice();
  actionQueue.length = 0;
  lastBattleWon = won;
  els.game.classList.toggle("enemy-dead", won);
  if (won) {
    runState.battlesWon++;
    runState.playerHp = Math.min(PLAYER_MAX_HP, Math.max(1, state.player.hp) + 15);
    els.restartButton.innerHTML = `回到地图 <span>↗</span>`;
  } else {
    runState.playerHp = PLAYER_MAX_HP;
    els.endEyebrow.textContent = "你已死去";
    els.endTitle.textContent = "刻度吞没无名者";
    els.endCopy.textContent = "你把最后一个节点交给了敌人。灰烬将你送回回廊入口。";
    els.restartButton.innerHTML = `重整旗鼓 <span>↻</span>`;
  }
  els.resultNodes.textContent = state.node;
  els.resultCards.textContent = state.cardsPlayed;
  renderAll();
  setTimeout(() => els.endOverlay.classList.add("visible"), 700);
}

function isMapActive() {
  return !els.mapScreen.classList.contains("hidden");
}

function isMapPointAllowed(x, y) {
  return MAP_ROOMS.some((room) => x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h);
}

function buildMapScene() {
  const walls = [];
  for (const room of MAP_ROOMS) {
    if (room.corridor) {
      if (room.h > room.w) {
        walls.push(`M${room.x} ${room.y} V${room.y + room.h}`, `M${room.x + room.w} ${room.y} V${room.y + room.h}`);
      } else {
        walls.push(`M${room.x} ${room.y} H${room.x + room.w}`, `M${room.x} ${room.y + room.h} H${room.x + room.w}`);
      }
    } else {
      walls.push(`M${room.x} ${room.y} h${room.w} v${room.h} h${-room.w} Z`);
    }
  }
  els.mapWalls.setAttribute("d", walls.join(" "));
  const bossRoom = MAP_ROOMS.find((room) => room.boss);
  const bossX = bossRoom.x + bossRoom.w / 2;
  const bossY = bossRoom.y + bossRoom.h / 2 - 6;
  els.mapBoss.querySelectorAll("text").forEach((label) => {
    label.setAttribute("x", bossX);
  });
  els.mapBoss.querySelector(".boss-skull").setAttribute("y", bossY);
  els.mapBoss.querySelector(".boss-label").setAttribute("y", bossY + 30);
}

function positionMapPlayer() {
  els.mapPlayer.setAttribute("transform", `translate(${mapState.player.x} ${mapState.player.y})`);
}

function updateMapHint() {
  const bossRoom = MAP_ROOMS.find((room) => room.boss);
  const distance = Math.hypot(bossRoom.x + bossRoom.w / 2 - mapState.player.x, bossRoom.y + bossRoom.h / 2 - mapState.player.y);
  els.mapHint.textContent = distance < 220
    ? "钟声就在附近——推门即是战斗。"
    : `WASD / 方向键移动 · 你听见丧钟在远方回荡。`;
}

function startMapLoop() {
  if (mapLoopId) return;
  mapLastTs = performance.now();
  const step = (ts) => {
    mapLoopId = requestAnimationFrame(step);
    updateMapMovement(ts);
  };
  mapLoopId = requestAnimationFrame(step);
}

function stopMapLoop() {
  if (mapLoopId) cancelAnimationFrame(mapLoopId);
  mapLoopId = null;
  mapKeys.clear();
}

function updateMapMovement(ts) {
  const delta = Math.min(.05, (ts - mapLastTs) / 1000);
  mapLastTs = ts;
  let dx = 0;
  let dy = 0;
  for (const key of mapKeys) {
    const move = MAP_MOVE_KEYS[key];
    if (move) { dx += move[0]; dy += move[1]; }
  }
  if (!dx && !dy) return;
  const length = Math.hypot(dx, dy) || 1;
  const nextX = mapState.player.x + (dx / length) * MAP_MOVE_SPEED * delta;
  const nextY = mapState.player.y + (dy / length) * MAP_MOVE_SPEED * delta;
  if (isMapPointAllowed(nextX, mapState.player.y)) mapState.player.x = nextX;
  if (isMapPointAllowed(mapState.player.x, nextY)) mapState.player.y = nextY;
  positionMapPlayer();
  updateMapHint();

  const bossRoom = MAP_ROOMS.find((room) => room.boss);
  const inset = BOSS_TRIGGER_INSET;
  const { x, y } = mapState.player;
  if (x > bossRoom.x + inset && x < bossRoom.x + bossRoom.w - inset &&
    y > bossRoom.y + inset && y < bossRoom.y + bossRoom.h - inset) {
    stopMapLoop();
    pulseTone(90, .2, .05);
    enterBattle();
  }
}

function renderMap() {
  if (!mapSceneBuilt) {
    buildMapScene();
    mapSceneBuilt = true;
  }
  els.mapKills.textContent = runState.battlesWon;
  positionMapPlayer();
  updateMapHint();
  startMapLoop();
}

function showMap() {
  els.endOverlay.classList.remove("visible");
  els.game.classList.add("hidden");
  els.game.classList.remove("enemy-dead");
  els.mapScreen.classList.remove("hidden");
  renderMap();
}

function enterBattle() {
  stopMapLoop();
  els.mapScreen.classList.add("hidden");
  els.game.classList.remove("hidden");
  els.game.scrollTop = 0;
  resetState();
  state.active = true;
  renderAll();
  pulseTone(90, .18, .04);
}

function startGame() {
  els.introOverlay.classList.remove("visible");
  els.startButton.blur();
  runState.playerHp = PLAYER_MAX_HP;
  runState.battlesWon = 0;
  mapState.player = { ...PLAYER_START };
  showMap();
  pulseTone(90, .18, .04);
}

els.startButton.addEventListener("click", startGame);
els.refillButton.addEventListener("click", replenishHand);
els.restartButton.addEventListener("click", () => {
  els.restartButton.blur();
  if (!lastBattleWon) runState.playerHp = PLAYER_MAX_HP;
  mapState.player = { ...PLAYER_START };
  showMap();
});

const MAP_MOVE_KEYS = {
  ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
  ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
  ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
};

document.addEventListener("keydown", (event) => {
  if (isMapActive()) {
    if ((event.key === "Enter" || event.key === " ") && els.introOverlay.classList.contains("visible")) startGame();
    if (MAP_MOVE_KEYS[event.key]) {
      event.preventDefault();
      mapKeys.add(event.key);
    }
    return;
  }
  if (event.key >= "1" && event.key <= "5") playCard(Number(event.key) - 1);
  if ((event.key === "Enter" || event.key === " ") && els.introOverlay.classList.contains("visible")) startGame();
  else if (event.key === " " && !els.endOverlay.classList.contains("visible")) {
    event.preventDefault();
    replenishHand();
  }
  if (event.key.toLowerCase() === "r" && els.endOverlay.classList.contains("visible")) {
    els.restartButton.click();
  }
});

document.addEventListener("keyup", (event) => {
  mapKeys.delete(event.key);
});

window.addEventListener("blur", () => mapKeys.clear());

loadEnemyLayer();
resetState();
