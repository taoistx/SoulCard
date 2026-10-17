"use strict";

// 商店拥有商品、限兑和结算；对话只负责打开面板，不执行交易。
const WORLD_SHOPS = {
  eddie: {
    name: "艾迪的货摊", nodeId: "eddie", npcId: "eddie",
    offers: [
      { id: "daily_equipment", category: "当日装备", dailyStock: true, cost: "freshFlesh", amount: 1, flag: "eddieTradeDone" },
      { id: "mist_wrap", category: "防护制作", itemId: "eddieMistWrap", cost: "mistWrapMaterial", amount: 1, flag: "eddieWrapMade" },
      { id: "work_cover", category: "营地服务", name: "作业位罩膜", description: "给打捞位留一片罩膜，改善艾迪的本地作业条件。此项服务不会产生背包物品。", cost: "mistWrapMaterial", amount: 1, flag: "eddieWorkProtected" },
    ],
  },
};
let activeWorldShop = null;
let selectedShopOffer = null;

function isWorldShopOpen() { return activeWorldShop !== null; }

function canAccessWorldShop(shopId) {
  const shop = WORLD_SHOPS[shopId];
  return Boolean(shop && isWorldActive() && world.hp > 0 && !v06EndingActive && !activeActionEvent
    && !getFlag("becameDung") && !getFlag(`${shop.npcId}Killed`) && world.currentNodeId === shop.nodeId);
}

function getShopOffer(shopId, offerId) {
  const offer = WORLD_SHOPS[shopId]?.offers.find((entry) => entry.id === offerId);
  if (!offer) return null;
  const itemId = offer.dailyStock ? getDailyStock() : offer.itemId;
  const item = ITEM_LIBRARY[itemId];
  const completed = Boolean(getFlag(offer.flag));
  const owned = world.inventory[offer.cost] || 0;
  const reason = !canAccessWorldShop(shopId) ? "当前无法交易" : completed ? "本局已兑换"
    : owned < offer.amount ? `${ITEM_LIBRARY[offer.cost].name}不足` : "";
  return { ...offer, itemId, name: item?.name || offer.name, description: item?.description || offer.description,
    owned, completed, reason };
}

function exchangeShopOffer(shopId, offerId) {
  // 点击结算时重新读取真实库存和限兑状态，旧按钮不能重复扣款或发货。
  const offer = getShopOffer(shopId, offerId);
  if (!offer || activeWorldShop !== shopId || offer.reason) return { ok: false, message: offer?.reason || "商品不存在" };
  if (!removeItem(offer.cost, offer.amount)) return { ok: false, message: "材料不足，未进行兑换。" };
  if (offer.itemId) addItem(offer.itemId);
  setFlag(offer.flag, true);
  if (["eddieWrapMade", "eddieWorkProtected"].includes(offer.flag)) {
    setFlag("materialUse", getFlag("eddieWrapMade") && getFlag("eddieWorkProtected") ? "both" : getFlag("eddieWrapMade") ? "wrap" : "work");
  }
  return { ok: true, message: `已交付 ${ITEM_LIBRARY[offer.cost].name} ×${offer.amount}；${offer.itemId ? `${offer.name}已放入背包。` : "作业位已加装罩膜。"}` };
}

function resetWorldShop() {
  activeWorldShop = null;
  selectedShopOffer = null;
  document.querySelector("#shopPanel").classList.add("hidden");
}

function closeWorldShop() {
  resetWorldShop();
  interactionLocked = false;
  renderWorld();
  elsWorld.characterButton.focus();
}

function openWorldShop(shopId) {
  if (!canAccessWorldShop(shopId)) return false;
  elsWorld.modal.classList.add("hidden");
  elsWorld.characterPanel.classList.add("hidden");
  window.ActionEventPanel.close();
  activeWorldShop = shopId;
  selectedShopOffer = WORLD_SHOPS[shopId].offers[0].id;
  interactionLocked = true;
  document.querySelector("#shopFeedback").textContent = "";
  document.querySelector("#shopPanel").classList.remove("hidden");
  renderWorldShop();
  document.querySelector("#closeShopButton").focus();
  return true;
}

function renderWorldShop() {
  const shop = WORLD_SHOPS[activeWorldShop];
  if (!shop) return;
  const panel = document.querySelector("#shopPanel");
  panel.querySelector("#shopTitle").textContent = shop.name;
  panel.querySelector("#shopDay").textContent = `岸台营地 · 第 ${world.day} 天`;
  const balances = panel.querySelector("#shopBalances");
  balances.replaceChildren();
  for (const itemId of [...new Set(shop.offers.map((offer) => offer.cost))]) {
    const balance = document.createElement("span");
    balance.textContent = `${ITEM_LIBRARY[itemId].name} ×${world.inventory[itemId] || 0}`;
    balances.append(balance);
  }
  const list = panel.querySelector("#shopOffers");
  list.replaceChildren();
  for (const entry of shop.offers) {
    const offer = getShopOffer(activeWorldShop, entry.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shop-offer";
    button.dataset.shopOffer = entry.id;
    button.setAttribute("aria-pressed", String(selectedShopOffer === entry.id));
    for (const [tag, value] of [["small", offer.category], ["strong", offer.name],
      ["span", `${ITEM_LIBRARY[offer.cost].name} ×${offer.amount}`], ["small", offer.completed ? "已兑换 · 剩余 0" : "本局限兑 1 次 · 剩余 1"]]) {
      const label = document.createElement(tag);
      label.textContent = value;
      button.append(label);
    }
    button.addEventListener("click", () => {
      selectedShopOffer = entry.id;
      renderWorldShop();
      list.querySelector(`[data-shop-offer="${entry.id}"]`).focus();
    });
    list.append(button);
  }
  const selected = getShopOffer(activeWorldShop, selectedShopOffer);
  panel.querySelector("#shopOfferCategory").textContent = selected.category;
  panel.querySelector("#shopOfferName").textContent = selected.name;
  panel.querySelector("#shopOfferDescription").textContent = selected.description;
  panel.querySelector("#shopOfferDelivery").textContent = selected.itemId
    ? `兑换后放入背包 · 当前持有 ${world.inventory[selected.itemId] || 0} 件 · 装备需在背包操作`
    : "兑换后立即改善作业位";
  panel.querySelector("#shopOfferPrice").textContent = `${ITEM_LIBRARY[selected.cost].name} ×${selected.amount}`;
  panel.querySelector("#shopOfferBalance").textContent = `持有 ${selected.owned} · ${selected.completed ? "本局已兑换，长休不重置" : "本局剩余 1 次"}`;
  const buy = panel.querySelector("#shopExchangeButton");
  buy.disabled = Boolean(selected.reason);
  buy.textContent = selected.reason || "确认兑换";
}

document.querySelector("#shopExchangeButton").addEventListener("click", () => {
  const result = exchangeShopOffer(activeWorldShop, selectedShopOffer);
  renderWorldShop();
  document.querySelector("#shopFeedback").textContent = result.message;
  if (result.ok) document.querySelector(`[data-shop-offer="${selectedShopOffer}"]`).focus();
});
document.querySelector("#closeShopButton").addEventListener("click", closeWorldShop);
document.querySelector("#shopPanel").addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const buttons = [...event.currentTarget.querySelectorAll("button:not(:disabled)")];
  const first = buttons[0], last = buttons.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
