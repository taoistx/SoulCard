"use strict";

function createActionSandboxView(root) {
  let runner;
  let panel;
  let config;
  let selected = null;
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label, key, action, disabled = false) => {
    const node = element("button", label);
    node.type = "button";
    node.dataset.focusKey = key;
    node.disabled = disabled;
    node.addEventListener("click", () => { action(); render(); });
    return node;
  };
  const section = (heading, ...children) => {
    const node = element("section");
    node.append(element("h3", heading), ...children);
    return node;
  };

  function render() {
    const focusKey = root.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
    root.replaceChildren();
    if (!runner) { root.append(element("p", "转换成功后可运行沙盒。")); return; }
    const { state, deck, slots, placements, pending, closed, trace } = runner.view();
    const inactive = Boolean(pending || closed);
    const slotsInactive = closed || Boolean(pending && pending.command !== "choice");
    if (!deck.some(({ instanceId }) => instanceId === selected)) selected = null;
    const header = element("header");
    header.append(element("h2", closed ? "本轮已结束" : "行动面板"), button("重置", "reset", () => { runner.reset(); selected = null; }));
    root.append(header);
    if (panel.description) {
      const description = element("p", panel.description);
      description.className = "action-scene";
      root.append(description);
    }

    const slotList = element("div");
    slotList.className = "action-slot-list";
    for (const { id } of slots) {
      const instance = placements.get(id);
      const card = deck.find((entry) => entry.instanceId === instance);
      const slot = element("div");
      slot.className = "action-slot";
      const place = (value) => { runner.place(id, value); selected = null; };
      const target = button(`${id} · ${card ? `${card.cardId} #${instance}` : "空槽"}`, `slot:${id}`, () => {
        if (selected !== null) place(selected);
      }, slotsInactive);
      target.dataset.slot = id;
      target.addEventListener("dragover", (event) => { if (!slotsInactive) event.preventDefault(); });
      target.addEventListener("drop", (event) => {
        event.preventDefault();
        if (slotsInactive) return;
        const instanceId = Number(event.dataTransfer.getData("application/x-action-card"));
        if (deck.some((entry) => entry.instanceId === instanceId)) { place(instanceId); render(); }
      });
      slot.append(target);
      if (card) slot.append(button(`撤回 ${id} 的卡牌`, `clear:${id}`, () => place(null), slotsInactive));
      slotList.append(slot);
    }
    root.append(section("槽位", slotList));

    const cards = element("div");
    cards.className = "action-controls";
    for (const { cardId, instanceId } of deck) {
      const card = button(`${cardId} #${instanceId}`, `card:${instanceId}`, () => { selected = selected === instanceId ? null : instanceId; }, slotsInactive);
      card.setAttribute("aria-pressed", String(selected === instanceId));
      card.draggable = !slotsInactive;
      card.dataset.card = cardId;
      card.title = config.cards[cardId].join("、") || "无标签";
      card.addEventListener("dragstart", (event) => event.dataTransfer.setData("application/x-action-card", String(instanceId)));
      cards.append(card);
    }
    if (!deck.length) cards.append(element("span", "没有卡牌。"));
    const hint = element("p", "拖动卡牌，或先点击卡牌再点击目标槽位。");
    hint.className = "help";
    root.append(section("沙盒牌组", hint, cards));

    const controls = element("div");
    controls.className = "action-controls";
    for (const { name } of panel.operations) controls.append(button(name, `operation:${name}`, () => { selected = null; runner.start(name); }, inactive));
    root.append(controls);
    let nextOptions;
    if (pending) {
      const replies = element("div");
      replies.className = "action-controls";
      for (const value of pending.choices) replies.append(button(value, `reply:${value}`, () => { selected = null; runner.resume(value); }));
      if (pending.command === "choice") nextOptions = replies;
      else root.append(section(`${pending.command === "battle" ? "模拟战斗" : "模拟商店"} · ${pending.target}`, replies));
    }

    const stateView = element("div");
    stateView.className = "action-state-grid";
    for (const [title, values] of [["物品", state.items], ["Flag", state.flags]]) {
      stateView.append(section(title, element("pre", values.size ? [...values].map(([key, value]) => `${key} = ${value}`).join("\n") : "空")));
    }
    const steps = element("ol");
    steps.className = "action-trace";
    for (const { kind, text, loc } of trace) {
      const step = element("li", loc && kind !== "text" ? `第 ${loc.line} 行 · ${text}` : text);
      step.dataset.kind = kind;
      steps.append(step);
    }
    const traceView = section("本次执行轨迹", trace.length ? steps : element("p", "等待操作。"));
    if (nextOptions) traceView.append(nextOptions);
    traceView.setAttribute("aria-live", "polite");
    root.append(traceView, stateView);
    if (focusKey) {
      const enabled = [...root.querySelectorAll("button:not(:disabled)")];
      const focus = enabled.find((node) => node.dataset.focusKey === focusKey)
        || enabled.find((node) => node.dataset.focusKey.startsWith(pending ? "reply:" : "operation:")) || enabled[0];
      focus?.focus({ preventScroll: true });
    }
  }

  return {
    clear(message) {
      runner = null;
      root.replaceChildren(element("p", message));
    },
    load(document) {
      ({ panel, config } = document);
      runner = ActionEventSandbox.create(panel, config);
      selected = null;
      render();
    },
  };
}
