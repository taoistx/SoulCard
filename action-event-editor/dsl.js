"use strict";

((global) => {
  const id = /^[\p{L}\p{N}_-]+$/u;
  const slotsLine = /^#([\p{L}\p{N}_-]+)(?: +#([\p{L}\p{N}_-]+))*$/u;
  const groupLine = /^\[([\p{L}\p{N}_-]+)\]$/u;
  const constraint = /(?:\[([\p{L}\p{N}_-]+)\]|([\p{L}\p{N}_-]+))\s*》\s*([\p{L}\p{N}_-]+)/uy;
  const operators = { "（": "(", "）": ")", "！": "!", "＆": "&", "｜": "|" };
  const outcomes = Object.freeze(["胜利", "失败", "逃跑"]);
  const returnValues = new Set([...outcomes, "其他"]);
  const stateKinds = Object.freeze(["flag", "card", "item"]);
  const reserved = /^(?:[#》@]|[+-][\p{L}_])/u;
  const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const stripColon = (text) => text.replace(/[:：]$/u, "").trimEnd();
  const hasColon = (text) => /[:：]$/u.test(text);
  const normalize = (source) => source.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const indentDepth = (indent) => indent.replace(/\t/gu, "    ").length / 4;
  const looksLikeRule = (text) => hasColon(text) && (stripColon(text) === "其他" || (!text.startsWith("》") && text.includes("》")));
  const returnHeader = (text) => text.startsWith("》") && id.test(stripColon(text.slice(1).trim()));
  const optionName = (text) => text.slice(1).trim();
  const validOptionName = (name) => Boolean(name) && !/[:：》]/u.test(name);
  const readSlots = (text, loc) => [...text.matchAll(/#([^ ]+)/gu)].map((match) => ({
    id: match[1], loc: { ...loc, column: loc.column + match.index },
  }));
  const structural = (text) => reserved.test(text) || groupLine.test(text) || ruleHeader(text);
  const escaped = (text) => text.startsWith("\\") && (text.startsWith("\\\\") || structural(text.slice(1)));

  function opensBlock(text, depth) {
    return ruleHeader(text) || (text.startsWith("》") && (depth !== 0 || text !== "》确认"));
  }

  function belongsToHeader(header, line) {
    return (groupLine.test(header) || header.startsWith("》")) && looksLikeRule(line);
  }

  function parseCondition(text, loc) {
    const source = text.replace(/[（）！＆｜]/gu, (character) => operators[character]);
    let offset = 0;
    const skip = () => { while (/\s/u.test(source[offset] || "")) offset++; };
    const fail = (message) => { throw Object.assign(new SyntaxError(message), { column: loc.column + offset }); };

    function atom() {
      skip();
      if (source[offset] === "!") {
        offset++;
        return { kind: "not", terms: [atom()] };
      }
      if (source[offset] === "(") {
        offset++;
        const term = or();
        if (source[offset] !== ")") fail("条件缺少右括号。");
        offset++;
        return term;
      }
      constraint.lastIndex = offset;
      const match = constraint.exec(source);
      if (!match) fail("这里需要卡槽条件，例如 类型》槽位、[卡牌ID]》槽位 或 空》槽位。");
      const [, card, tag, slot] = match;
      const position = { ...loc, column: loc.column + offset };
      offset = constraint.lastIndex;
      if (tag === "空") return { kind: "empty", slot, loc: position };
      return { kind: card ? "card" : "tag", slot, value: card || tag, loc: position };
    }

    function sequence(kind, operator, read) {
      const terms = [];
      do {
        const term = read();
        if (term.kind === kind) terms.push(...term.terms);
        else terms.push(term);
        skip();
        if (source[offset] !== operator) break;
        offset++;
      } while (true);
      return terms.length === 1 ? terms[0] : { kind, terms };
    }

    const and = () => sequence("and", "&", atom);
    const or = () => sequence("or", "|", and);
    const expression = or();
    if (offset !== source.length) fail("条件中有多余符号或缺少运算符。");
    return expression.kind === "and" ? expression.terms : [expression];
  }

  function ruleHeader(text) {
    if (!looksLikeRule(text)) return false;
    const pattern = stripColon(text);
    if (pattern === "其他") return true;
    try { parseCondition(pattern, { column: 1 }); return true; }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return false;
    }
  }

  function scan(source) {
    return normalize(source).split("\n").flatMap((raw, index) => {
      const indent = /^[ \t]*/u.exec(raw)[0];
      if (!raw.trim()) return [];
      return [{
        text: raw.slice(indent.length).trimEnd(), raw: raw.slice(indent.length),
        depth: indentDepth(indent), loc: { line: index + 1, column: indent.length + 1 }, indent,
      }];
    });
  }

  function parse(source, file = "面板.txt") {
    const lines = scan(source);
    const diagnostics = [];
    const report = (loc, code, message) => diagnostics.push({ severity: "error", file, ...loc, code, message });
    for (const { depth, loc } of lines) {
      if (!Number.isInteger(depth)) report(loc, "InvalidIndent", "每级缩进使用一个 Tab 或四个空格。");
    }
    if (diagnostics.length) return { panel: null, diagnostics };

    const panel = { description: "", slots: [], operations: [], groups: [] };
    let cursor = 0;
    let phase = 0;
    let lastTextLine = 0;

    function skipChildren(depth) {
      while (lines[cursor]?.depth > depth) cursor++;
    }

    function statements(depth, header) {
      if (lines[cursor]?.depth !== depth) report(header.loc, "EmptyBlock", "此处需要下一级缩进的执行体。");
      const body = [];
      let previousText = 0;
      while (lines[cursor]?.depth >= depth) {
        const row = lines[cursor++];
        const { text, raw, loc } = row;
        if (row.depth !== depth) {
          report(loc, "InvalidNesting", "此行的缩进超出了当前执行体。");
          skipChildren(depth);
          continue;
        }
        if (text.startsWith("》")) {
          const options = readOptions(depth, row);
          body.push({ type: "choice", options, loc });
          previousText = 0;
          continue;
        }
        if (text.startsWith("#")) {
          if (slotsLine.test(text)) body.push({ type: "slots", slots: readSlots(text, loc), loc });
          else report(loc, "InvalidSlots", "槽位应写成 #槽位名 #另一个槽位名。");
        } else if (text.startsWith("@")) {
          const jump = /^@jump +([^ ]+)$/u.exec(text);
          const external = /^@(battle|shop) +([^ ?]+)(\?)?$/u.exec(text);
          if (text === "@exit") body.push({ type: "exit", loc });
          else if (jump && id.test(jump[1])) body.push({ type: "jump", target: jump[1], loc });
          else if (external && id.test(external[2]) && !(external[1] === "shop" && external[3])) {
            const dispatch = Boolean(external[3]);
            const branches = dispatch ? returns(depth, row) : [];
            body.push({ type: "external", command: external[1], target: external[2], dispatch, branches, loc });
          } else report(loc, "InvalidCommand", "未知指令或参数错误。请检查 @jump、@exit、@battle 或 @shop 的写法。");
        } else if (/^[+-][\p{L}_]/u.test(text)) {
          const change = /^([+-])([a-z]+)[:：] *([^ ]+)$/u.exec(text);
          if (change && id.test(change[3])) body.push({ type: "state", sign: change[1], kind: change[2], target: change[3], loc });
          else report(loc, "InvalidStateCommand", "状态指令应写成 +类型: ID 或 -类型: ID。");
        } else if (!escaped(text) && structural(text)) {
          report(loc, "InvalidNesting", "此结构不能出现在执行体中。显示字面符号时请在行首加反斜杠。");
        } else {
          const value = escaped(text) ? raw.slice(1) : raw;
          if (previousText && body.at(-1)?.type === "text") body.at(-1).value += "\n".repeat(loc.line - previousText) + value;
          else body.push({ type: "text", value, loc });
          previousText = loc.line;
          continue;
        }
        previousText = 0;
        if (lines[cursor]?.depth > depth) {
          report(lines[cursor].loc, "InvalidNesting", "只有带 ? 的 @battle 可以声明返回分支。");
          skipChildren(depth);
        }
      }
      return body;
    }

    function readOption(row) {
      const name = optionName(row.text);
      if (lines[cursor]?.depth === row.depth && looksLikeRule(lines[cursor].text)) {
        return { name, loc: row.loc, body: [], rules: rules(row) };
      }
      const body = name === "离开" && !(lines[cursor]?.depth > row.depth)
        ? [{ type: "exit", loc: row.loc }] : statements(row.depth + 1, row);
      return { name, loc: row.loc, body };
    }

    function readOptions(depth, first) {
      const options = [];
      let row = first;
      while (row) {
        const name = optionName(row.text);
        if (!validOptionName(name)) {
          report(row.loc, "InvalidOption", "选项应写成 》选项名称。");
          skipChildren(depth);
        } else options.push(readOption(row));
        row = lines[cursor]?.depth === depth && lines[cursor].text.startsWith("》") ? lines[cursor++] : null;
      }
      return options;
    }

    function returns(depth, header) {
      const result = [];
      while (lines[cursor]?.depth === depth && lines[cursor].text.startsWith("》")) {
        const value = stripColon(optionName(lines[cursor].text));
        if (result.length && !returnValues.has(value)) break;
        const row = lines[cursor++];
        if (!returnHeader(row.text)) {
          report(row.loc, "InvalidReturn", "返回分支应写成 》胜利、》失败、》逃跑 或 》其他。");
          skipChildren(depth);
          continue;
        }
        result.push({ value, loc: row.loc, body: statements(depth + 1, row) });
      }
      if (!result.length) report(header.loc, "MissingReturns", "带 ? 的战斗至少需要一个返回分支。请将 》胜利 等分支写在与 @battle 相同的缩进层级。");
      return result;
    }

    function rules(header) {
      const result = [];
      const { depth } = header;
      if (lines[cursor]?.depth !== depth || !looksLikeRule(lines[cursor].text)) report(header.loc, "EmptyGroup", "规则组至少需要一条与组名同级的规则。");
      while (lines[cursor]?.depth === depth && looksLikeRule(lines[cursor].text)) {
        const row = lines[cursor++];
        const pattern = stripColon(row.text);
        const fallback = pattern === "其他";
        let conditions;
        try { conditions = fallback ? [] : parseCondition(pattern, row.loc); }
        catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
          report({ ...row.loc, column: error.column }, "InvalidConstraint", error.message);
          skipChildren(depth);
          continue;
        }
        result.push({ conditions, fallback, loc: row.loc, body: statements(depth + 1, row) });
      }
      return result;
    }

    while (cursor < lines.length) {
      const row = lines[cursor++];
      const { text, raw, loc } = row;
      if (row.depth) {
        report(loc, "InvalidNesting", "顶层声明和开场正文不能缩进。");
        skipChildren(0);
      } else if (text.startsWith("#")) {
        if (phase !== 0 || !slotsLine.test(text)) report(loc, "InvalidSlots", "槽位只声明一次，放在正文之后，例如 #露西 #粪怪。");
        else {
          panel.slots = readSlots(text, loc);
          phase = 1;
        }
      } else if (text.startsWith("》")) {
        const name = optionName(text);
        if (![1, 2].includes(phase) || !validOptionName(name)) report(loc, "InvalidOperation", "面板操作应放在槽位和规则组之间，写成 》操作名称。");
        else phase = 2;
        panel.operations.push(readOption(row));
      } else if (groupLine.test(text) || (phase > 0 && text.startsWith("["))) {
        const match = groupLine.exec(text);
        if (!match || phase < 2) report(loc, "InvalidGroup", "规则组应放在面板操作之后，写成 [组ID]。");
        else phase = 3;
        const entries = rules(row);
        if (match) panel.groups.push({ id: match[1], loc, rules: entries });
      } else if (phase === 0 && (escaped(text) || !structural(text))) {
        if (lastTextLine) panel.description += "\n".repeat(loc.line - lastTextLine);
        panel.description += escaped(text) ? raw.slice(1) : raw;
        lastTextLine = loc.line;
      } else report(loc, "UnexpectedLine", "此处需要槽位、面板操作或规则组。开场正文应在槽位之前。");
    }
    const start = { line: 1, column: 1 };
    if (!panel.slots.length) report(start, "MissingSlots", "至少声明一个槽位。");
    if (!panel.operations.length) report(start, "MissingOperations", "至少声明一个面板操作。");
    return { panel: diagnostics.length ? null : panel, diagnostics };
  }

  function validateConfig(config) {
    if (!record(config)) return ["沙盒配置必须是 JSON 对象。"];
    const errors = [];
    const { cards, items, battles, shops, initial } = config;
    const validIds = (list) => Array.isArray(list) && list.every((entry) => typeof entry === "string" && id.test(entry)) && new Set(list).size === list.length;
    const validCards = record(cards) && Object.keys(cards).every((key) => id.test(key)) && Object.values(cards).every((tags) => validIds(tags) && !tags.includes("空"));
    if (!validCards) errors.push("cards 应将合法卡牌 ID 映射到互不重复的标签数组，空 是保留条件。");
    for (const [key, list] of Object.entries({ items, battles, shops })) if (!validIds(list)) errors.push(`${key} 应是互不重复的合法 ID 数组。`);
    if (!record(initial)) return [...errors, "initial 应包含 deck、items 和 flags。"];
    if (!Array.isArray(initial.deck) || !initial.deck.every((key) => typeof key === "string" && validCards && Object.hasOwn(cards, key))) errors.push("initial.deck 应是已注册卡牌 ID 的数组，可用重复 ID 表示多张副本。");
    if (!record(initial.items) || !Object.entries(initial.items).every(([key, count]) => Array.isArray(items) && items.includes(key) && Number.isSafeInteger(count) && count >= 0)) errors.push("initial.items 应将已注册物品 ID 映射到非负整数。");
    if (!record(initial.flags) || !Object.entries(initial.flags).every(([key, value]) => id.test(key) && typeof value === "boolean")) errors.push("initial.flags 应将合法 Flag ID 映射到布尔值。");
    return errors;
  }

  function accepts(condition, cardId, cards) {
    if (condition.kind === "empty") return cardId === undefined;
    if (condition.kind === "card") return cardId === condition.value;
    return cardId !== undefined && Object.hasOwn(cards, cardId) && cards[cardId].includes(condition.value);
  }

  function conditionsMatch(conditions, slots, cards) {
    function matches(term, negated = false) {
      if (term.kind === "not") return matches(term.terms[0], !negated);
      if (term.terms) {
        const matchChild = (child) => matches(child, negated);
        return (term.kind === "and") !== negated ? term.terms.every(matchChild) : term.terms.some(matchChild);
      }
      return slots.has(term.slot) && accepts(term, slots.get(term.slot)?.cardId, cards) !== negated;
    }
    return conditions.every((term) => matches(term));
  }

  function validate(panel, config, file) {
    const diagnostics = [];
    const report = (loc, code, message, severity = "error") => diagnostics.push({ severity, file, ...loc, code, message });
    const unique = (entries, key, kind) => {
      const seen = new Set();
      for (const entry of entries) {
        if (seen.has(entry[key])) report(entry.loc, "Duplicate", `${kind}重复：${entry[key]}`);
        seen.add(entry[key]);
      }
      return seen;
    };
    const slots = unique(panel.slots, "id", "槽位");
    const referencedSlots = [];
    const groups = unique(panel.groups, "id", "规则组");
    unique(panel.operations, "name", "操作名称");
    const tags = new Set(Object.values(config.cards).flat());
    const groupTargets = new Map();
    function checkBody(body, targets) {
      let continues = true;
      for (const statement of body) {
        const { type, loc, target } = statement;
        if (type === "jump" && target !== "root") {
          if (!groups.has(target)) report(loc, "UnknownGroup", `未定义规则组 ${target}。`);
          else if (continues) targets.add(target);
        }
        if (type === "jump" || type === "exit") continues = false;
        if (type === "slots") {
          for (const slot of unique(statement.slots, "id", "槽位")) slots.add(slot);
        }
        if (type === "state") {
          if (!stateKinds.includes(statement.kind)) report(loc, "UnknownStateKind", `未知状态类型 ${statement.kind}。`);
          else if (statement.kind === "card" && !Object.hasOwn(config.cards, target)) report(loc, "UnknownCard", `未注册卡牌 ${target}。`);
          else if (statement.kind === "item" && !config.items.includes(target)) report(loc, "UnknownItem", `未注册物品 ${target}。`);
        }
        if (type === "choice") {
          unique(statement.options, "name", "选项名称");
          let returnsToCaller = false;
          for (const option of statement.options) {
            if (checkOption(option, continues ? targets : new Set())) returnsToCaller = true;
          }
          if (!returnsToCaller) continues = false;
        }
        if (type === "external") {
          const ids = statement.command === "battle" ? config.battles : config.shops;
          if (!ids.includes(target)) report(loc, "UnknownExternalId", `未注册 ${statement.command} 配置 ${target}。`);
          unique(statement.branches, "value", "返回值");
          let returnsToCaller = false;
          for (const branch of statement.branches) {
            if (!returnValues.has(branch.value)) report(branch.loc, "UnknownReturn", `未知战斗返回值 ${branch.value}。`);
            if (checkBody(branch.body, continues ? targets : new Set())) returnsToCaller = true;
          }
          if (statement.dispatch && !returnsToCaller) continues = false;
        }
      }
      return continues;
    }
    function checkConditions(conditions, requireAll) {
      const seen = new Set();
      for (const { kind, slot, value, loc, terms } of conditions) {
        if (terms) { checkConditions(terms, kind === "and"); continue; }
        const key = JSON.stringify([kind, slot, value]);
        if (requireAll && seen.has(key)) report(loc, "DuplicateConstraint", "同一组且条件不能重复书写同一个约束。");
        seen.add(key);
        referencedSlots.push({ slot, loc });
        if (kind === "card" && !Object.hasOwn(config.cards, value)) report(loc, "UnknownCard", `未注册卡牌 ${value}。`);
        if (kind === "tag" && !tags.has(value)) report(loc, "UnknownTag", `未注册标签 ${value}。`);
      }
    }
    function checkRules(rules, targets) {
      let continues = false;
      for (const [index, rule] of rules.entries()) {
        if (checkBody(rule.body, targets)) continues = true;
        if (rule.fallback) {
          if (index !== rules.length - 1) report(rule.loc, "MisplacedFallback", "每组最多一个 其他:，且必须位于最后。");
          continue;
        }
        checkConditions(rule.conditions, true);
      }
      return continues;
    }
    function checkOption(option, targets) {
      return option.rules ? checkRules(option.rules, targets) : checkBody(option.body, targets);
    }
    const rootTargets = new Set();
    for (const entry of panel.operations) checkOption(entry, rootTargets);
    for (const group of panel.groups) {
      if (group.id === "root") report(group.loc, "ReservedGroup", "root 保留用于返回面板。");
      const targets = new Set();
      groupTargets.set(group.id, targets);
      checkRules(group.rules, targets);
    }
    for (const { slot, loc } of referencedSlots) if (!slots.has(slot)) report(loc, "UnknownSlot", `未声明槽位 ${slot}。`);
    const reachable = new Set(rootTargets);
    for (const groupId of reachable) for (const target of groupTargets.get(groupId) || []) reachable.add(target);
    for (const group of panel.groups) if (!reachable.has(group.id)) report(group.loc, "UnreachableGroup", `没有操作可进入规则组 ${group.id}。`, "warning");
    return diagnostics;
  }

  function compile(source, config, file = "面板.txt") {
    const { panel, diagnostics } = parse(source, file);
    const configErrors = validateConfig(config);
    for (const message of configErrors) diagnostics.push({ severity: "error", file: "沙盒配置", code: "InvalidConfig", message, line: 1, column: 1, config: true });
    if (panel && !configErrors.length) diagnostics.push(...validate(panel, config, file));
    return { panel, diagnostics, ok: !diagnostics.some(({ severity }) => severity === "error") };
  }

  function outline(source) {
    return scan(source).filter(({ depth, indent }) => depth === 0 && !indent).flatMap(({ text, loc }) => {
      if (slotsLine.test(text)) return [...text.matchAll(/#([^ ]+)/gu)].map((match) => ({ kind: "槽位", label: match[1], loc: { ...loc, column: match.index + 1 } }));
      if (text.startsWith("》")) return [{ kind: "操作", label: text.slice(1).trim(), loc }];
      if (groupLine.test(text)) return [{ kind: "规则组", label: text.slice(1, -1), loc }];
      return [];
    });
  }

  const api = { normalize, indentDepth, parse, compile, outline, opensBlock, belongsToHeader, conditionsMatch, outcomes };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.ActionEventDsl = api;
})(globalThis);
