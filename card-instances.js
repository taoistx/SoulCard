"use strict";

// A card's identity belongs to the run, not to its current pile or template.
(function (global) {
  function copyDeck(deck, catalog) {
    const ids = new Set();
    return deck.map((entry, index) => {
      const card = typeof entry === "string" ? { instanceId: `battle_${index}`, cardId: entry, fatigue: 0 } : { ...entry };
      if (typeof card.instanceId !== "string" || !card.instanceId || ids.has(card.instanceId) || !catalog[card.cardId] || !Number.isInteger(card.fatigue) || card.fatigue < 0) {
        throw new Error("卡牌副本配置无效或身份重复");
      }
      ids.add(card.instanceId);
      return card;
    });
  }

  function describe(instance, catalog) {
    if (!instance) return null;
    if (typeof instance === "string") return catalog[instance];
    const base = catalog[instance.cardId];
    if (!base) return null;
    if (!instance.fatigue) return { ...base, instance };
    return {
      id: base.id, name: base.name, icon: base.icon, instance,
      type: "fatigue", label: `疲劳 · ${instance.fatigue} 层`, cost: 1,
      text: "仅消耗 <strong>1</strong> 刻，消除 <strong>1</strong> 层疲劳。没有原卡效果。", speed: "恢复", fatigued: true,
    };
  }

  function damageWithKnowledge(amount, multiplier = 1) {
    return Math.ceil(amount * multiplier);
  }

  const api = Object.freeze({ copyDeck, describe, damageWithKnowledge });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.CardInstances = api;
})(globalThis);
