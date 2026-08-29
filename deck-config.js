"use strict";

// 玩家初始牌组配置：修改 count 就能调整对应卡牌数量。
// cardId 必须使用 game.js 里 CARD_LIBRARY 的 id。
window.PLAYER_DECK_CONFIG = [
  { cardId: "quick", count: 2 }, // 短促刺击
  { cardId: "thrust", count: 2 }, // 穿甲突刺
  { cardId: "heavy", count: 1 }, // 葬仪重斩
  { cardId: "guard", count: 2 }, // 灰钢架势
//   { cardId: "evade", count: 1 }, // 鸦步
//   { cardId: "parry", count: 1 }, // 听钟辨刃
//   { cardId: "delay", count: 1 }, // 割裂时序
//   { cardId: "bleed", count: 1 }, // 刻血
  { cardId: "focus", count: 1 }, // 窥见罅隙
//   { cardId: "mend", count: 1 }, // 饮下残露
  { cardId: "adjust", count: 1 }, // 调整
  { cardId: "adjustStance", count: 1 }, // 调整架势
//   { cardId: "feint", count: 1 }, // 佯攻
//   { cardId: "recoverStance", count: 1 }, // 收势
//   { cardId: "preRead", count: 1 }, // 预读
//   { cardId: "chase", count: 1 }, // 追击
];
