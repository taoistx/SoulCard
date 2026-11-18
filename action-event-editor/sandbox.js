"use strict";

((global) => {
  const { conditionsMatch, outcomes } = global.ActionEventDsl || require("./dsl.js");

  function match(group, slots, cards) {
    const rule = group.rules.find((entry) => entry.fallback || conditionsMatch(entry.conditions, slots, cards));
    return rule ? { rule } : { error: "NoMatch" };
  }

  class ExecutionError extends Error {
    constructor(code, message, loc) {
      super(message);
      this.code = code;
      this.loc = loc;
    }
  }

  function create(panel, config) {
    const groups = new Map(panel.groups.map((group) => [group.id, group]));
    const operations = new Map(panel.operations.map((operation) => [operation.name, operation]));
    let state, slots, placements, interactionDeck, nextInstance, process, pending, closed, trace, error;

    function reset() {
      state = {
        deck: config.initial.deck.map((cardId, index) => ({ cardId, instanceId: index + 1 })),
        items: new Map(Object.entries(config.initial.items)),
        flags: new Map(Object.entries(config.initial.flags)),
      };
      nextInstance = state.deck.length + 1;
      slots = panel.slots;
      placements = new Map();
      interactionDeck = null;
      pending = null;
      process = null;
      closed = false;
      trace = [];
      error = null;
    }

    function place(slot, instanceId) {
      if (closed || (process && pending?.command !== "choice") || !slots.some(({ id }) => id === slot)) return;
      if (instanceId === null) { placements.delete(slot); return; }
      if (!(interactionDeck || state.deck).some((card) => card.instanceId === instanceId)) return;
      for (const [other, value] of placements) if (value === instanceId) placements.delete(other);
      placements.set(slot, instanceId);
    }

    function setSlots(next, deck) {
      slots = next;
      const visible = new Set(slots.map(({ id }) => id));
      const owned = new Set(deck.map(({ instanceId }) => instanceId));
      for (const [slot, instance] of placements) if (!visible.has(slot) || !owned.has(instance)) placements.delete(slot);
    }

    function placedCards(deck) {
      return new Map(slots.map(({ id }) => [id, deck.find((card) => card.instanceId === placements.get(id))]));
    }

    function* execute(operation) {
      const staged = { deck: [...state.deck], items: new Map(state.items), flags: new Map(state.flags) };
      interactionDeck = staged.deck;
      let snapshot = placedCards(staged.deck);
      let newInstance = nextInstance;
      const path = [];
      const log = (kind, text, loc) => trace.push({ kind, text, loc });
      function select(branches, label, loc) {
        const result = match(branches, snapshot, config.cards);
        if (result.error) throw new ExecutionError(result.error, `${label}没有匹配分支。`, loc);
        log("step", `命中 ${label} 第 ${result.rule.loc.line} 行${result.rule.fallback ? "（其他）" : ""}`, result.rule.loc);
        return result.rule.body;
      }
      const optionBody = (option) => option.rules ? select(option, `选项「${option.name}」`, option.loc) : option.body;
      let body = optionBody(operation);
      const frames = [];
      let index = 0;
      let active = true;
      let exit = false;
      function enterBranch(nextBody) {
        frames.push({ body, index });
        body = nextBody;
        index = 0;
      }
      while (active) {
        if (index >= body.length) {
          const parent = frames.pop();
          if (!parent) break;
          ({ body, index } = parent);
          continue;
        }
        const statement = body[index++];
        const { type, target, loc } = statement;
        switch (type) {
          case "text":
            log("text", statement.value, loc);
            break;
          case "slots":
            setSlots(statement.slots, staged.deck);
            snapshot = placedCards(staged.deck);
            break;
          case "exit":
            log("step", "结束交互", loc);
            exit = true;
            active = false;
            break;
          case "jump": {
            log("step", `跳转至 ${target}`, loc);
            if (target === "root") { active = false; break; }
            path.push(target);
            if (path.length > 64) throw new ExecutionError("JumpLimit", `超过 64 次组跳转：${path.join(" → ")}`, loc);
            frames.length = 0;
            body = select(groups.get(target), `规则组「${target}」`, loc);
            index = 0;
            break;
          }
          case "state": {
            const { sign, kind } = statement;
            const gain = sign === "+";
            if (kind === "flag") staged.flags.set(target, gain);
            else if (kind === "item") {
              const count = staged.items.get(target) || 0;
              if (!gain && !count) throw new ExecutionError("MissingItem", `没有物品 ${target} 可移除。`, loc);
              if (gain && count === Number.MAX_SAFE_INTEGER) throw new ExecutionError("ItemLimit", `物品 ${target} 已达数量上限。`, loc);
              staged.items.set(target, count + (gain ? 1 : -1));
            } else if (gain) staged.deck.push({ cardId: target, instanceId: newInstance++ });
            else {
              const preferred = [...snapshot.values()].find((card) => card?.cardId === target && staged.deck.includes(card));
              const removed = preferred || staged.deck.find((card) => card.cardId === target);
              if (!removed) throw new ExecutionError("MissingCard", `没有卡牌 ${target} 可移除。`, loc);
              staged.deck.splice(staged.deck.indexOf(removed), 1);
            }
            log("state", `${sign}${kind}: ${target}`, loc);
            break;
          }
          case "choice": {
            const choices = statement.options.map(({ name }) => name);
            placements.clear();
            const name = yield { command: "choice", choices, loc };
            snapshot = placedCards(staged.deck);
            const option = statement.options.find((entry) => entry.name === name);
            log("step", `选择「${name}」`, option.loc);
            enterBranch(optionBody(option));
            break;
          }
          case "external": {
            log("step", `@${statement.command} ${target}`, loc);
            const choices = statement.command === "battle" ? outcomes : ["关闭商店"];
            const value = yield { command: statement.command, target, choices, loc };
            log("step", `${target} · ${value}`, loc);
            if (!statement.dispatch) break;
            const branch = statement.branches.find((branch) => branch.value === value) || statement.branches.find((branch) => branch.value === "其他");
            if (!branch) throw new ExecutionError("UnhandledReturnValue", `${target} 返回「${value}」，脚本没有对应分支。`, loc);
            log("step", `进入返回分支「${branch.value}」`, branch.loc);
            enterBranch(branch.body);
            break;
          }
        }
      }
      state = staged;
      interactionDeck = null;
      nextInstance = newInstance;
      if (!exit) placements.clear();
      setSlots(panel.slots, state.deck);
      closed = exit;
      log("step", exit ? "本轮已结束" : "已返回面板");
    }

    function advance(value) {
      try {
        const result = process.next(value);
        pending = result.done ? null : result.value;
        if (result.done) process = null;
      } catch (failure) {
        if (!(failure instanceof ExecutionError)) throw failure;
        error = { code: failure.code, message: failure.message, loc: failure.loc };
        trace.push({ kind: "error", text: `${error.code}：${error.message} 本次状态变更已撤回。`, loc: error.loc });
        process = null;
        pending = null;
        interactionDeck = null;
        setSlots(panel.slots, state.deck);
      }
    }

    function start(name) {
      if (process || closed || !operations.has(name)) return;
      const operation = operations.get(name);
      trace = [{ kind: "step", text: `执行「${name}」`, loc: operation.loc }];
      error = null;
      process = execute(operation);
      advance();
    }

    function resume(value) {
      if (!pending?.choices.includes(value)) return;
      advance(value);
    }

    reset();
    return { reset, place, start, resume, view: () => structuredClone({ state, deck: interactionDeck || state.deck, slots, placements, pending, closed, trace, error }) };
  }

  const api = { create, match };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.ActionEventSandbox = api;
})(globalThis);
