"use strict";

// Presentation only. World owns submission, costs, phases and battle transitions.
window.ActionEventPanel = (() => {
  let current = null;
  const root = document.createElement("section");
  root.id = "actionEventPanel";
  root.className = "action-event-overlay hidden";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "actionEventTitle");
  document.body.appendChild(root);
  const element = (tag, className, text) => {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function button(text, action, className = "") {
    const el = element("button", className, text);
    el.type = "button";
    el.addEventListener("click", action);
    return el;
  }
  function place(slotId, key) {
    if (!current || current.busy || !current.owned.some((r) => r.key === key)) return;
    const resource = current.owned.find((r) => r.key === key);
    if (resource.kind !== "item") {
      for (const slot of Object.keys(current.placements)) if (current.placements[slot] === key) delete current.placements[slot];
    }
    current.placements[slotId] = key;
    current.selected = null;
    render();
  }
  function render() {
    const model = current;
    const focused = root.contains(document.activeElement) ? document.activeElement : null;
    const focusData = focused ? { ...focused.dataset } : null;
    root.replaceChildren();
    const panel = element("div", "action-event-card");
    const eyebrow = element("p", "eyebrow", "遭遇 · 行动选择");
    const title = element("h2", "", model.event.name);
    title.id = "actionEventTitle";
    panel.append(eyebrow, title, element("p", "action-event-story", model.event.stages[model.stage].body));
    panel.append(element("p", "action-event-help", "在槽位放入卡牌、物品或知识。只要放入观察以外的行动卡，就优先处理其他行动；条件未满足时不能结算观察。未参与结算的资源不会消耗。拖动资源，或先选资源再点槽位。"));
    if (model.event.actionSlot) panel.append(element("p", "action-event-help", "本事件的行动卡可放入任意槽位；需要的物品仍须放入配方指定槽位。"));
    const slots = element("div", "action-event-slots");
    slots.style.gridTemplateColumns = `repeat(${model.event.slots.length}, minmax(0, 1fr))`;
    for (const slot of model.event.slots) {
      const area = element("div", "action-event-target");
      const resource = model.owned.find((r) => r.key === model.placements[slot.id]);
      area.append(element("span", "action-target-icon", slot.icon || "◇"), element("h3", "", slot.name));
      const drop = button(resource ? resource.name : "放入卡牌或物品", () => {
        if (model.selected) place(slot.id, model.selected);
        else { delete model.placements[slot.id]; render(); }
      }, `action-event-slot${resource ? " filled" : ""}`);
      drop.dataset.slot = slot.id;
      drop.disabled = model.busy;
      drop.addEventListener("dragover", (e) => { e.preventDefault(); });
      drop.addEventListener("drop", (e) => { e.preventDefault(); place(slot.id, e.dataTransfer.getData("text/plain")); });
      area.append(drop);
      if (resource) {
        const retract = button("撤回", () => { delete model.placements[slot.id]; render(); }, "action-retract");
        retract.disabled = model.busy;
        retract.dataset.retract = slot.id;
        area.append(retract);
      }
      slots.append(area);
    }
    panel.append(slots);
    const tabs = element("div", "action-resource-tabs");
    for (const [kind, label] of [["card", "战斗卡"], ["item", "物品"], ["knowledge", "知识"]]) {
      const tab = button(label, () => { model.tab = kind; render(); }, model.tab === kind ? "active" : "");
      tab.setAttribute("aria-pressed", String(model.tab === kind));
      tab.dataset.tab = kind;
      tab.disabled = model.busy;
      tabs.append(tab);
    }
    panel.append(tabs);
    const resources = element("div", "action-resource-list");
    const categoryNames = { attack: "暴力", defense: "执念", technique: "伎俩", ritual: "秘仪", restoration: "恢复" };
    for (const resource of model.owned.filter((r) => r.kind === model.tab)) {
      const used = Object.values(model.placements).filter((key) => key === resource.key).length;
      const btn = button("", () => { model.selected = model.selected === resource.key ? null : resource.key; render(); }, `action-resource ${resource.category || resource.kind}${model.selected === resource.key ? " selected" : ""}`);
      btn.dataset.resource = resource.key;
      btn.disabled = !resource.available || model.busy;
      btn.draggable = resource.available && !model.busy;
      btn.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", resource.key));
      btn.append(element("strong", "", resource.name));
      btn.append(element("small", "", resource.kind === "card" ? `${categoryNames[resource.category]} · 疲劳 ${resource.fatigue} 层 · 副本 ${resource.copyNumber}` : resource.kind === "item" ? `拥有 ${resource.amount} · 使用消耗 1` : "知识 · 不消耗"));
      if (used) btn.append(element("span", "", `已放入 ${used}`));
      if (!resource.available) btn.append(element("span", "", "需要献祭心脏"));
      resources.append(btn);
    }
    if (!resources.children.length) resources.append(element("p", "", "尚无可用资源。"));
    panel.append(resources);
    const match = model.match(model.placements);
    const cardCount = match.valid ? match.chosen.filter((r) => r.kind === "card").length : 0;
    const status = element("p", "action-event-status", match.ambiguous ? "多个行动同时满足，请撤回多余卡牌。" : match.valid ? cardCount ? `可以提交 · ${cardCount} 张战斗卡各疲劳 +1` : "可以提交 · 不增加卡牌疲劳" : match.reason || "尚不能提交此组合");
    status.setAttribute("role", "status");
    if (match.valid) for (const r of match.chosen.filter((r) => r.kind === "item")) status.textContent += ` · ${r.name} -1`;
    if (match.valid && match.recipe.staminaCost) status.textContent += ` · 额外体力 -${match.recipe.staminaCost}`;
    if (match.valid && match.recipe.hpCost) status.textContent += ` · HP -${match.recipe.hpCost}（最低保留 1）`;
    panel.append(status);
    const submit = button(model.busy ? "处理中…" : "确认行动", async () => {
      if (model.busy) return;
      model.busy = true;
      render();
      try { await model.submit({ ...model.placements }); }
      catch (error) { model.busy = false; render(); root.querySelector(".action-event-status").textContent = `提交失败：${error.message}`; }
    }, "action-event-submit");
    submit.disabled = model.busy || !match.valid;
    panel.append(submit);
    if (model.leave) {
      const leave = button("离开", model.leave, "action-event-leave");
      leave.disabled = model.busy;
      panel.append(leave);
    }
    root.append(panel);
    if (focused) {
      const replacement = [...root.querySelectorAll("button:not(:disabled)")].find((el) => Object.keys(focusData).length && Object.entries(focusData).every(([key, value]) => el.dataset[key] === value));
      (replacement || root.querySelector("button:not(:disabled)"))?.focus();
    }
  }
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const buttons = [...root.querySelectorAll("button:not(:disabled)")];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  return Object.freeze({
    open(model) { current = { placements: {}, selected: null, tab: "card", busy: false, ...model }; root.classList.remove("hidden"); render(); root.querySelector("button")?.focus(); },
    close() { current = null; root.classList.add("hidden"); },
    isOpen: () => !root.classList.contains("hidden"),
  });
})();
