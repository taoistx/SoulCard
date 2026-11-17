"use strict";

// Shared by the browser editor and Node tests. This module never mutates its inputs.
(function (global) {
  const Runtime = global.NPCDialogueRuntime || (typeof require === "function" ? require("../npc-dialogues.js") : null);
  const clone = Runtime.clone;
  const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const own = (v, k) => Object.hasOwn(v, k);
  const idPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
  const fail = (message, line = 1, column = 1) => { throw Object.assign(new Error(message), { line, column }); };
  const decode = (s) => s === "\\" ? "" : s.replace(/\\(.)/gu, "$1");
  const escapeName = (s) => s.replace(/[\\!！&＆/／()（）+\-]/gu, "\\$&");
  const escapeText = (s) => s === "" ? "\\" : s.replace(/[\\()（）]/gu, "\\$&").replace(/^(》|@|#|->)/u, "\\$1").replace(/^[ \t]+|[ \t]+$/gu, (space) => space.replace(/./gu, "\\$&"));
  const knownAction = (id, kind) => own(kind === "world" ? global.WorldDialogueCatalog?.actions || {} : Runtime.catalog.actions, id);
  const defaultText = (v) => typeof v === "string" ? v : v?.default || "";
  const open = (c) => c === "(" || c === "（";
  const close = (c) => c === ")" || c === "）";
  // Formatting may add/remove redundant groups; retain the original JSON shape
  // when the text still expresses exactly the same ordered Boolean expression.
  function conditionSignature(entry) {
    if (!entry?.mode) return JSON.stringify(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)));
    const flatten = (c) => c.mode === entry.mode && entry.mode !== "not" ? c.clauses.flatMap(flatten) : [c];
    const children = entry.clauses.flatMap(flatten);
    const signatures = children.map(conditionSignature);
    if (entry.mode !== "not" && signatures.length === 1) return signatures[0];
    return JSON.stringify([entry.mode, ...signatures]);
  }

  function mergeAliases(...registries) {
    const result = Object.create(null), keys = new Map();
    for (const registry of registries) {
      if (registry === undefined) continue;
      if (!object(registry)) fail("Flag 映射必须是中文名称到内部字段的 JSON 对象");
      for (const [name, key] of Object.entries(registry)) {
        if (!name.trim() || name !== name.trim() || typeof key !== "string" || !key.trim()) fail("Flag 名称和字段必须是非空字符串，名称首尾不能含空格");
        if (own(result, name) && result[name] !== key) fail(`Flag 映射冲突：${name} 同时对应 ${result[name]} 和 ${key}`);
        if (keys.has(key) && keys.get(key) !== name) fail(`Flag 字段 ${key} 同时对应 ${keys.get(key)} 和 ${name}`);
        result[name] = key; keys.set(key, name);
      }
    }
    return result;
  }

  function parseExpression(source, line = 1, column = 1) {
    let at = 0;
    const skip = () => { while (/\s/u.test(source[at] || "") && at < source.length) at++; };
    const error = (message) => fail(message, line, column + at);
    function atom(depth) {
      if (depth > 64) error("条件嵌套不能超过 64 层");
      skip();
      if (source[at] === "!" || source[at] === "！") { at++; return { mode: "not", clauses: [atom(depth + 1)] }; }
      if (open(source[at])) {
        at++; const group = either(depth + 1); skip();
        if (!close(source[at])) error("条件缺少右括号");
        at++; return group;
      }
      let name = "";
      while (at < source.length && !/[!！&＆/／()（）]/u.test(source[at])) {
        if (source[at] === "\\") { at++; if (at >= source.length) error("转义符后缺少字符"); }
        name += source[at++];
      }
      name = name.trim();
      if (!name) error("缺少条件名称或操作数");
      return { flagName: name };
    }
    function all(depth) {
      let left = atom(depth); skip();
      while (source[at] === "&" || source[at] === "＆") { at++; left = { mode: "all", clauses: [left, atom(depth)] }; skip(); }
      return left;
    }
    function either(depth) {
      let left = all(depth); skip();
      while (source[at] === "/" || source[at] === "／") { at++; left = { mode: "any", clauses: [left, all(depth)] }; skip(); }
      return left;
    }
    const result = either(0); skip();
    if (at !== source.length) error("条件中出现多余符号或缺少运算符");
    return result;
  }

  function balanced(s, start, token) {
    let depth = 0;
    for (let i = start; i < s.length; i++) {
      if (s[i] === "\\") { i++; continue; }
      if (open(s[i])) depth++;
      if (close(s[i]) && --depth === 0) return { text: s.slice(start + 1, i), end: i + 1 };
    }
    fail("缺少右括号", token.line, token.column + start);
  }

  function effectsAndLabel(s, token) {
    const effects = []; let end = s.length;
    // Only unescaped, balanced trailing (+name)/(-name) groups are effects.
    const groups = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\\") { i++; continue; }
      if (open(s[i])) { const group = balanced(s, i, token); groups.push({ ...group, start: i }); i = group.end - 1; }
    }
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      if (s.slice(g.end, end).trim() || !/^[+\-＋－]/u.test(g.text.trim())) break;
      const raw = g.text.trim(), name = decode(raw.slice(1)).trim();
      if (!name) fail("Flag 效果缺少名称", token.line, token.column + g.start);
      effects.unshift({ flagName: name, value: raw[0] === "+" || raw[0] === "＋", line: token.line }); end = g.start;
    }
    let label = s.slice(0, end);
    while (/\s$/u.test(label)) {
      const slashes = label.slice(0, -1).match(/\\+$/u)?.[0].length || 0;
      if (slashes % 2) break;
      label = label.slice(0, -1);
    }
    return { label: decode(label), effects };
  }

  function split(source) {
    const lines = source.replace(/\r\n?/gu, "\n").split("\n");
    const start = lines.findIndex((s) => s === "@config");
    if (start < 0) return { text: lines.join("\n"), config: null };
    const end = lines.findIndex((s, i) => i > start && s === "@end");
    if (end < 0 || lines.slice(end + 1).some((s) => s.trim())) fail("高级配置必须由 @config 和 @end 包围并位于文件末尾", start + 1);
    let config;
    try { config = JSON.parse(lines.slice(start + 1, end).join("\n")); }
    catch (error) { fail(`高级 JSON 配置无效：${error.message}`, start + 2); }
    if (!object(config) || config.version !== 1 || !object(config.dialogue) || !object(config.nodes) || !object(config.options)) fail("高级配置格式无效", start + 2);
    return { text: lines.slice(0, start).join("\n").trimEnd(), config };
  }
  const combine = (text, config) => `${text.trimEnd()}\n\n@config\n${JSON.stringify(config, null, 2)}\n@end\n`;

  async function flagKey(name) {
    if (global.crypto?.subtle) {
      const digest = await global.crypto.subtle.digest("SHA-256", new TextEncoder().encode(name));
      return `storyFlag_${Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("")}`;
    }
    if (typeof require === "function") return `storyFlag_${require("node:crypto").createHash("sha256").update(name).digest("hex")}`;
    // Same SHA-256 result in file/ordinary HTTP contexts without Web Crypto.
    const constants = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
    ];
    const bytes = new TextEncoder().encode(name), buffer = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
    buffer.set(bytes); buffer[bytes.length] = 0x80;
    const view = new DataView(buffer.buffer);
    view.setUint32(buffer.length - 8, Math.floor(bytes.length / 0x20000000));
    view.setUint32(buffer.length - 4, (bytes.length * 8) >>> 0);
    const hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const rotate = (v, n) => (v >>> n) | (v << (32 - n)), words = new Uint32Array(64);
    for (let offset = 0; offset < buffer.length; offset += 64) {
      for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i++) {
        const x = words[i - 15], y = words[i - 2];
        words[i] = (words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>> 0;
      }
      let [a,b,c,d,e,f,g,h] = hash;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + constants[i] + words[i]) >>> 0;
        const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
      }
      [a,b,c,d,e,f,g,h].forEach((v, i) => { hash[i] = (hash[i] + v) >>> 0; });
    }
    return `storyFlag_${hash.map((v) => v.toString(16).padStart(8, "0")).join("")}`;
  }

  async function compileLegacy(source, baseDialogue, registry = {}, { maxIndent = 64, deferReferences = false } = {}) {
    try {
      const { text, config: supplied } = split(source);
      const config = supplied || { version: 1, dialogue: Object.fromEntries(Object.entries(clone(baseDialogue)).filter(([k]) => k !== "nodes")), nodes: {}, options: {} };
      if (own(config.dialogue, "nodes")) fail("高级对话配置不能重复定义 nodes");
      const aliases = mergeAliases(registry, config.flagAliases, config.dialogue.editor?.textAuthoring?.flagAliases);
      const initialAliases = JSON.stringify(aliases);
      const resolveFlag = async (name) => {
        if (!own(aliases, name)) {
          const key = await flagKey(name);
          if (own(aliases, name)) return aliases[name];
          if (Object.values(aliases).includes(key)) fail(`生成的 Flag 字段冲突：${name}`);
          aliases[name] = key;
        }
        return aliases[name];
      };
      const resolveExpression = async (entry) => entry.flagName
        ? { source: "flag", key: await resolveFlag(entry.flagName), operator: "eq", value: true }
        : { mode: entry.mode, clauses: await Promise.all(entry.clauses.map(resolveExpression)) };
      const resolveEffects = async (entries) => Promise.all(entries.map(async (e) => ({ type: "setFlag", key: await resolveFlag(e.flagName), value: e.value })));
      const raw = text.replace(/\r/gu, "").split("\n");
      const titleIndex = raw.findIndex((s) => s.trim());
      if (titleIndex < 0) fail("请输入场景标题");
      if (/^[\t ]/u.test(raw[titleIndex])) fail("标题不能缩进", titleIndex + 1);
      const title = decode(raw[titleIndex]);
      const tokens = [];
      for (let i = titleIndex + 1; i < raw.length; i++) {
        if (!raw[i].trim()) continue;
        const prefix = raw[i].match(/^[\t ]*/u)[0];
        if ((prefix.includes("\t") && prefix.includes(" ")) || (!prefix.includes("\t") && prefix.length % 4)) fail("缩进必须使用 Tab 或每级四个空格，同一行不能混用", i + 1);
        const depth = prefix.includes("\t") ? prefix.length : prefix.length / 4;
        if (depth > maxIndent) fail(`分支缩进不能超过 ${maxIndent} 层`, i + 1);
        tokens.push({ value: raw[i].slice(prefix.length), depth, line: i + 1, column: prefix.length + 1 });
      }
      const reserved = new Set([...Object.keys(baseDialogue.nodes || {}), ...tokens.filter((t) => t.value.startsWith("@node ")).map((t) => t.value.slice(6).trim())]);
      const nodes = Object.create(null), optionMeta = config.options, optionLocations = new Map();
      let index = 0, serial = 1;
      const generatedId = () => { let id; do { id = `textNode${serial++}`; } while (reserved.has(id) || own(nodes, id)); reserved.add(id); return id; };
      const readId = (token, prefix) => {
        const id = token.value.slice(prefix.length).trim();
        if (!idPattern.test(id) || ["__proto__", "constructor", "prototype"].includes(id)) fail("节点或选项 ID 无效", token.line, token.column);
        return id;
      };
      let firstId;
      function readNode(depth, implicitId) {
        const start = tokens[index] || { line: titleIndex + 2, column: 1 };
        let id = implicitId || generatedId();
        if (tokens[index]?.depth === depth && tokens[index].value.startsWith("@node ")) id = readId(tokens[index++], "@node ");
        if (own(nodes, id)) fail(`节点 ID 重复：${id}`, start.line, start.column);
        const metadata = clone(config.nodes[id] || {});
        if (!object(metadata) || own(metadata, "options") && (!Array.isArray(metadata.options) || metadata.options.length) || typeof metadata.body === "string" || object(metadata.body) && own(metadata.body, "default")) fail(`节点 ${id} 的高级配置重复定义了正文或选项`, start.line, start.column);
        const node = metadata; nodes[id] = node; firstId ||= id;
        const paragraphs = [], effects = [], options = []; let lastBodyLine = null, optionPhase = false;
        while (index < tokens.length) {
          const t = tokens[index];
          if (t.depth < depth || t.depth === depth && t.value.startsWith("@node ")) break;
          if (t.value.startsWith("#")) fail("#调用必须紧跟在对应选项下一行，并与选项同级缩进", t.line, t.column);
          if (t.depth === depth && !t.value.startsWith("@option ") && !t.value.startsWith("》")) {
            if (optionPhase) fail("正文不能出现在同级回答之后；请缩进到对应回答下", t.line, t.column);
            if (t.value.startsWith("->")) fail("跳转只能放在回答的下一级，且不能同时附带正文", t.line, t.column);
            if (t.value.startsWith("@")) fail("未知辅助标记", t.line, t.column);
            const parsed = effectsAndLabel(t.value, t);
            if (parsed.effects.length && parsed.label === "") effects.push(...parsed.effects);
            else {
              if (lastBodyLine !== null) for (let line = lastBodyLine + 1; line < t.line; line++) paragraphs.push("");
              paragraphs.push(decode(t.value)); lastBodyLine = t.line;
            }
            index++; continue;
          }
          const optionDepth = depth === 0 ? 0 : depth + 1;
          if (t.depth !== optionDepth) fail("缩进跳级或内容归属不明确：正文下一级应为回答，回答下一级应为正文", t.line, t.column);
          optionPhase = true;
          let optionId;
          if (t.value.startsWith("@option ")) { optionId = readId(t, "@option "); index++; }
          const optionToken = tokens[index];
          if (!optionToken || optionToken.depth !== optionDepth || !optionToken.value.startsWith("》")) fail("此处需要 》 开头的回答选项", t.line, t.column);
          index++;
          optionId ||= (() => { let n = options.length + 1, candidate; do { candidate = `choice${n++}`; } while (options.some((o) => o.id === candidate) || tokens.some((v) => v.value === `@option ${candidate}`)); return candidate; })();
          if (options.some((o) => o.id === optionId)) fail(`选项 ID 重复：${optionId}`, t.line, t.column);
          const option = clone(optionMeta[id]?.[optionId] || {});
          if (!object(option) || ["id", "next"].some((k) => own(option, k)) || typeof option.label === "string" || object(option.label) && own(option.label, "default")) fail(`选项 ${id}.${optionId} 的高级配置重复定义了 ID、跳转或文字`, t.line, t.column);
          option.id = optionId;
          optionLocations.set(`${id}/${optionId}`, optionToken);
          let value = optionToken.value.slice(1), condition;
          if (open(value.trimStart()[0])) {
            const offset = value.length - value.trimStart().length;
            const group = balanced(value, offset, { ...optionToken, column: optionToken.column + 1 });
            condition = parseExpression(group.text, optionToken.line, optionToken.column + offset + 2); value = value.slice(group.end);
          }
          const parsed = effectsAndLabel(value, optionToken);
          if (object(option.label)) option.label.default = parsed.label;
          else if (parsed.label !== "" || !config.missingLabels?.[id]?.includes(optionId)) option.label = parsed.label;
          if (condition) {
            if (own(option, "visibleWhen")) fail("显示条件在正文和高级配置中重复定义", t.line, t.column);
            option._condition = condition;
          }
          if (parsed.effects.length) {
            if (own(option, "effects")) fail("选项效果在正文和高级配置中重复定义", t.line, t.column);
            option._effects = parsed.effects;
          }
          const call = tokens[index];
          if (call?.value.startsWith("#") && call.depth >= optionDepth) {
            if (call.depth !== optionDepth || call.line !== optionToken.line + 1) fail("#调用必须紧跟在对应选项下一行，并与选项同级缩进", call.line, call.column);
            const action = call.value.slice(1).trim();
            if (!idPattern.test(action)) fail("# 后需要一个调用 ID，例如 #shop_eddie", call.line, call.column);
            if (!knownAction(action, config.dialogue.kind)) fail("未登记的调用：" + action, call.line, call.column);
            if (own(option, "action")) fail("同一选项的调用在正文和高级配置中重复定义", call.line, call.column);
            option.action = action;
            index++;
          }
          if (tokens[index]?.depth > optionDepth) {
            const child = tokens[index];
            if (child.depth !== optionDepth + 1) fail("回答下一级必须只增加一层缩进", child.line, child.column);
            if (child.value.startsWith("-> ")) {
              option.next = readId(child, "-> "); index++;
              if (tokens[index]?.depth > optionDepth) fail("跳转不能同时附带正文或其他子级", tokens[index].line, tokens[index].column);
            } else option.next = readNode(optionDepth + 1);
          }
          if (call?.value.startsWith("#") && option.action === "shop_eddie" && option.next) fail("打开商店的选项不能同时进入后续对白", call.line, call.column);
          options.push(option);
        }
        if (paragraphs.length) { const body = paragraphs.join("\n"); if (object(node.body)) node.body.default = body; else node.body = body; }
        else if (object(node.body)) node.body.default = "";
        if (options.length || own(node, "options")) node.options = options;
        if (effects.length) {
          if (own(node, "effects")) fail("节点效果在正文和高级配置中重复定义", start.line, start.column);
          node._effects = effects;
        }
        return id;
      }
      readNode(0, config.dialogue.start?.default || "root");
      while (index < tokens.length) {
        const t = tokens[index];
        if (t.depth !== 0 || !t.value.startsWith("@node ")) fail("独立节点需要顶格的 @node 标记", t.line, t.column);
        readNode(0);
      }
      for (const [id, node] of Object.entries(nodes)) for (const option of node.options || []) {
        if (option.next && !own(nodes, option.next) && !deferReferences) {
          const t = optionLocations.get(`${id}/${option.id}`);
          fail(`跳转指向未知节点：${option.next}`, t.line, t.column);
        }
      }
      for (const [nodeId, node] of Object.entries(nodes)) {
        if (node._effects) { node.effects = await resolveEffects(node._effects); delete node._effects; }
        for (const option of node.options || []) {
          if (option._condition) {
            const group = await resolveExpression(option._condition);
            option.visibleWhen = group.mode ? group : { mode: "all", clauses: [group] };
            const template = config.conditionTemplates?.[nodeId]?.[option.id];
            if (template && conditionSignature(template) === conditionSignature(option.visibleWhen)) option.visibleWhen = clone(template);
            delete option._condition;
          }
          if (option._effects) { option.effects = await resolveEffects(option._effects); delete option._effects; }
        }
      }
      const dialogue = clone(config.dialogue);
      if (dialogue.editor !== undefined && (!object(dialogue.editor) || dialogue.editor.positions !== undefined && !object(dialogue.editor.positions) || dialogue.editor.textAuthoring !== undefined && !object(dialogue.editor.textAuthoring))) fail("editor、positions 和 textAuthoring 必须是 JSON 对象");
      for (const [id, position] of Object.entries(dialogue.editor?.positions || {})) if (!object(position) || !Number.isFinite(position.x) || !Number.isFinite(position.y)) fail(`节点 ${id} 的布局坐标必须包含有效的 x 和 y 数值`);
      dialogue.name = title;
      dialogue.schemaVersion ??= 1; dialogue.id ||= baseDialogue.id; dialogue.start ||= { default: firstId, rules: [] };
      const order = [...new Set([...(config.nodeOrder || []), ...Object.keys(nodes)])].filter((id) => own(nodes, id));
      dialogue.nodes = Object.fromEntries(order.map((id) => [id, nodes[id]]));
      if (!supplied && !own(nodes[firstId], "title")) nodes[firstId].title = title;
      const usedKeys = new Set();
      const collectKeys = (value) => { if (!value || typeof value !== "object") return; if (typeof value.key === "string") usedKeys.add(value.key); Object.values(value).forEach(collectKeys); };
      collectKeys(dialogue.nodes); collectKeys(dialogue.start);
      const customAliases = Object.fromEntries(Object.entries(aliases).filter(([name, key]) => name !== key && usedKeys.has(key)));
      if (Object.keys(customAliases).length || dialogue.editor?.textAuthoring) {
        dialogue.editor ||= {}; dialogue.editor.textAuthoring ||= {}; dialogue.editor.textAuthoring.flagAliases = customAliases;
      }
      if (dialogue.editor?.positions) dialogue.editor.positions = Object.fromEntries(Object.entries(dialogue.editor.positions).filter(([id]) => own(nodes, id)));
      const result = Runtime.validateDialogue(dialogue);
      if (result.errors.length && !deferReferences) fail(result.errors.join("；"));
      return { dialogue, registry: aliases, registryChanged: JSON.stringify(aliases) !== initialAliases, diagnostics: result.warnings.map((message) => ({ severity: "warning", message, line: 1, column: 1 })) };
    } catch (error) {
      return { dialogue: null, registry: null, diagnostics: [{ severity: "error", message: error.message, line: error.line || 1, column: error.column || 1 }] };
    }
  }

  function serializeLegacy(dialogue, registry = {}, { plain = false } = {}) {
    if (!plain && object(dialogue.optionLists)) fail("独立选项组请使用新版文本导出");
    const typed = plain && object(dialogue.optionLists);
    const listConfig = typed ? { optionLists: clone(dialogue.optionLists), referenceNodes: clone(dialogue.nodes), nodeLists: {}, listOwners: {} } : null;
    if (typed) {
      const original = dialogue;
      dialogue = clone(dialogue); delete dialogue.optionLists;
      dialogue.editor ||= {}; dialogue.editor.textAuthoring ||= {};
      dialogue.editor.textAuthoring.optionSources = {};
      for (const [id, node] of Object.entries(dialogue.nodes)) {
        node.options = clone(Runtime.getNodeOptions(original, original.nodes[id]));
        if (node.optionList) {
          listConfig.nodeLists[id] = node.optionList;
          if (!listConfig.listOwners[node.optionList]) listConfig.listOwners[node.optionList] = id;
          else dialogue.editor.textAuthoring.optionSources[id] = node.optionList;
        }
        delete node.optionList;
      }
    }
    const aliases = mergeAliases(registry, dialogue.editor?.textAuthoring?.flagAliases);
    const names = new Map(Object.entries(aliases).map(([name, key]) => [key, name]));
    const used = Object.create(null);
    const nameOf = (key) => { const name = names.get(key) || key; used[name] = key; return escapeName(name); };
    function expression(entry) {
      if (!object(entry)) return null;
      if (!entry.mode) return entry.source === "flag" && entry.operator === "eq" && entry.value === true && Object.keys(entry).every((k) => ["source", "key", "operator", "value"].includes(k)) ? nameOf(entry.key) : null;
      if (!Array.isArray(entry.clauses) || !entry.clauses.length) return null;
      const children = entry.clauses.map(expression);
      if (children.some((s) => s === null)) return null;
      if (entry.mode === "not") return children.length === 1 ? `!${children[0]}` : null;
      if (!["all", "any"].includes(entry.mode)) return null;
      return children.length === 1 ? children[0] : `（${children.join(entry.mode === "all" ? "&" : "/")}）`;
    }
    function effects(entries) {
      if (!Array.isArray(entries) || !entries.length || entries.some((e) => e.type !== "setFlag" || typeof e.value !== "boolean" || Object.keys(e).some((k) => !["type", "key", "value"].includes(k)))) return null;
      return entries.map((e) => `（${e.value ? "+" : "-"}${nameOf(e.key)}）`).join("");
    }
    const config = { version: 1, dialogue: clone(dialogue), nodeOrder: Object.keys(dialogue.nodes), nodes: {}, options: {}, flagAliases: {}, conditionTemplates: {}, missingLabels: {} };
    if (plain) { config.syntaxVersion = 3; config.plainBindings = []; }
    delete config.dialogue.nodes;
    const lines = plain ? [] : [escapeText(dialogue.name), ""], seen = new Set();
    const put = (depth, value) => lines.push(`${"    ".repeat(depth)}${value}`);
    function emit(id, depth, path = "root") {
      seen.add(id);
      const original = dialogue.nodes[id], node = clone(original); config.nodes[id] = node; config.options[id] = {}; config.conditionTemplates[id] = {}; config.missingLabels[id] = [];
      const binding = { path, id, body: defaultText(original.body), options: [] };
      if (plain) config.plainBindings.push(binding); else put(depth, `@node ${id}`);
      if (own(original, "body")) {
        for (const line of defaultText(original.body).split("\n")) put(depth, plain && line === "" && defaultText(original.body) !== "" ? "" : escapeText(line));
        if (object(node.body)) delete node.body.default; else delete node.body;
      }
      const nodeEffects = effects(node.effects);
      if (nodeEffects) { put(depth, nodeEffects); delete node.effects; }
      const options = original.options || [];
      if (own(node, "options")) node.options = [];
      const optionSource = dialogue.editor?.textAuthoring?.optionSources?.[id];
      if (plain && optionSource) { put(depth, `@ ${optionSource}`); return; }
      for (const [optionIndex, originalOption] of options.entries()) {
        const option = clone(originalOption), optionDepth = plain ? depth : depth === 0 ? 0 : depth + 1;
        config.options[id][option.id] = option;
        if (!plain) put(optionDepth, `@option ${option.id}`);
        const condition = expression(option.visibleWhen), optionEffects = effects(option.effects);
        const conditionText = plain && condition?.startsWith("（") ? condition.slice(1, -1) : condition;
        put(optionDepth, `》${conditionText === null ? "" : `（${conditionText}）`}${escapeText(defaultText(option.label))}${optionEffects || ""}`);
        if (plain) binding.options.push({ id: originalOption.id, label: defaultText(originalOption.label) });
        delete option.id; delete option.next;
        if (object(option.label)) delete option.label.default; else delete option.label;
        if (!own(originalOption, "label")) config.missingLabels[id].push(originalOption.id);
        if (condition !== null) { config.conditionTemplates[id][originalOption.id] = clone(option.visibleWhen); delete option.visibleWhen; }
        if (optionEffects) delete option.effects;
        if (knownAction(originalOption.action, dialogue.kind) && !(originalOption.action === "shop_eddie" && originalOption.next)) {
          put(optionDepth, "#" + originalOption.action);
          delete option.action;
        }
        if (originalOption.next) {
          if (seen.has(originalOption.next) || !plain && optionDepth + 1 > 60) put(plain ? optionDepth : optionDepth + 1, `${plain ? "@ " : "-> "}${originalOption.next}`);
          else emit(originalOption.next, optionDepth + 1, `${path}.${optionIndex}`);
        }
      }
    }
    emit(dialogue.start.default, 0);
    for (const id of Object.keys(dialogue.nodes)) if (!seen.has(id)) {
      if (plain) fail(`文本模式暂不展开独立入口节点 ${id}；请先使用独立范例调试文本。`);
      lines.push(""); emit(id, 0);
    }
    config.flagAliases = { ...used };
    if (typed) {
      Object.assign(config, listConfig); config.syntaxVersion = 4;
      delete config.dialogue.editor.textAuthoring.optionSources;
    }
    return combine(lines.join("\n"), config);
  }

  async function compilePlain(source, baseDialogue, registry = {}) {
    let lineMap = [];
    try {
      const parts = split(source), config = clone(parts.config || {
        version: 1, syntaxVersion: object(baseDialogue.optionLists) ? 4 : 3,
        dialogue: Object.fromEntries(Object.entries(clone(baseDialogue)).filter(([k]) => k !== "nodes")),
        nodes: {}, options: {},
      });
      const typed = config.syntaxVersion === 4;
      const listDefinitions = clone(config.optionLists || baseDialogue.optionLists || {});
      const listIds = new Set(Object.keys(listDefinitions));
      const referenceNodes = config.referenceNodes || baseDialogue.nodes || {};
      if (typed) {
        for (const id of listIds) if (own(baseDialogue.nodes || {}, id)) fail(`ID ${id} 同时用于 node 和 optionList`);
        delete config.dialogue.optionLists;
        for (const metadata of Object.values(config.nodes)) delete metadata.optionList;
      }
      const sameLevel = config.syntaxVersion !== 2;
      const tokens = [];
      for (const [i, raw] of parts.text.replace(/\r/gu, "").split("\n").entries()) {
        if (!raw.trim()) continue;
        const prefix = raw.match(/^[\t ]*/u)[0], value = raw.slice(prefix.length);
        const reference = value.startsWith("@");
        if (!reference && (prefix.includes("\t") && prefix.includes(" ") || !prefix.includes("\t") && prefix.length % 4)) fail("缩进必须使用 Tab 或每级四个空格", i + 1);
        const depth = prefix.includes("\t") ? prefix.length : prefix.length / 4;
        if (depth > 64) fail("分支缩进不能超过 64 层", i + 1);
        tokens.push({ value, depth, line: i + 1, column: prefix.length + 1, reference });
      }
      if (!tokens.length) fail("请输入正文或回答选项");
      const ast = []; let at = 0;
      function readNode(depth, path, bodyDepth = depth) {
        const node = { depth, path, lines: [], options: [], reference: null, line: tokens[at]?.line || 1 };
        ast.push(node); let optionPhase = false;
        while (at < tokens.length) {
          const t = tokens[at];
          if (t.value.startsWith("#") && t.depth >= bodyDepth) fail("#调用必须紧跟在对应选项下一行，并与选项同级缩进", t.line, t.column);
          if (t.reference) {
            if (Number.isInteger(t.depth) && t.depth < bodyDepth) break;
            const match = t.value.match(/^@\s*([A-Za-z][A-Za-z0-9_-]*)\s*$/u);
            if (!match) fail("@ 后填写任意已有节点 ID，例如 @textNode2 或 @ unwell；不要在正文中声明节点 ID", t.line, t.column);
            if (node.reference || node.options.length) fail("复用选项的 @ 跳转不能与当前节点的自有选项混用", t.line, t.column);
            node.reference = { target: match[1], line: t.line, column: t.column }; at++;
            break;
          }
          const optionDepth = sameLevel ? depth : depth === 0 ? 0 : depth + 1;
          if (t.value.startsWith("》")) {
            if (t.depth < optionDepth) break;
            if (t.depth !== optionDepth) fail("选项必须与所属正文同级缩进；只有选项的后续回复才增加一级缩进", t.line, t.column);
            optionPhase = true; at++;
            const option = { token: t, child: null };
            node.options.push(option);
            const call = tokens[at];
            if (call?.value.startsWith("#") && call.depth >= optionDepth) {
              if (call.depth !== optionDepth || call.line !== t.line + 1) fail("#调用必须紧跟在对应选项下一行，并与选项同级缩进", call.line, call.column);
              option.call = call;
              at++;
            }
            const next = tokens[at];
            if (next?.value.startsWith("#") && next.depth >= optionDepth) fail("每个选项只能写一个 #调用", next.line, next.column);
            if (next && (next.reference ? next.depth >= optionDepth : next.depth > optionDepth || !next.value.startsWith("》") && next.depth === optionDepth)) {
              if (!next.reference && next.depth > optionDepth + 1) fail("回答下的回复正文只能增加一级缩进", next.line, next.column);
              option.child = readNode(optionDepth + 1, `${path}.${node.options.length - 1}`, next.depth === optionDepth ? optionDepth : optionDepth + 1);
              if (typed && option.child.reference && listIds.has(option.child.reference.target) && !option.child.lines.length) {
                option.child.lines = node.lines.filter((line) => { const p = effectsAndLabel(line.value, line); return p.label || !p.effects.length; }).map((line) => ({ ...line }));
              }
            }
            continue;
          }
          if (t.depth < bodyDepth) break;
          if (optionPhase) fail("回复正文应放在对应回答之后，或增加一级缩进", t.line, t.column);
          if (t.depth !== bodyDepth) fail("正文缩进跳级或归属不明确", t.line, t.column);
          if (t.value.startsWith("->")) fail("请使用 @节点ID 或 @ 节点ID 引用任意已有节点，例如 @ unwell", t.line, t.column);
          node.lines.push(t); at++;
        }
        return node;
      }
      const root = readNode(0, "root");
      if (at < tokens.length) fail("跳转后不能再附加当前节点的正文或选项", tokens[at].line, tokens[at].column);
      const bodyOf = (node) => {
        const lines = []; let last = null;
        for (const t of node.lines) {
          const parsed = effectsAndLabel(t.value, t);
          if (parsed.effects.length && parsed.label === "") continue;
          if (last !== null) for (let line = last + 1; line < t.line; line++) lines.push("");
          lines.push(decode(t.value)); last = t.line;
        }
        return lines.join("\n");
      };
      const direct = (node) => node !== root && node.reference && (typed ? !listIds.has(node.reference.target) : !node.lines.length && !node.options.length);
      const rootRedirect = typed && root.reference && !listIds.has(root.reference.target);
      const bindings = Array.isArray(config.plainBindings) ? config.plainBindings : [];
      const used = new Set(), reserved = new Set([...Object.keys(baseDialogue.nodes || {}), ...(typed ? listIds : [])]);
      const assign = (node, binding) => { node.id = binding.id; used.add(binding.id); };
      const actual = ast.filter((n) => !direct(n) && !(n === root && rootRedirect));
      root.id = config.dialogue.start?.default || "root"; used.add(root.id);
      for (const node of actual.filter((n) => n !== root)) {
        const matching = bindings.filter((b) => b.body === bodyOf(node) && !used.has(b.id));
        if (matching.length === 1) assign(node, matching[0]);
      }
      const storedCounter = config.dialogue.editor?.textAuthoring?.nextNodeSerial;
      if (storedCounter !== undefined && (!Number.isSafeInteger(storedCounter) || storedCounter < 1)) fail("系统节点 ID 计数器无效");
      let serial = Math.max(storedCounter || 1, ...[...reserved].map((id) => /^textNode\d+$/u.test(id) ? Number(id.slice(8)) + 1 : 1));
      for (const node of actual) {
        if (node.id) continue;
        const binding = bindings.find((b) => b.path === node.path && !used.has(b.id));
        if (binding) assign(node, binding);
        else { do { node.id = `textNode${serial++}`; } while (used.has(node.id) || reserved.has(node.id)); used.add(node.id); }
      }
      for (const node of ast) {
        if (node.reference && !used.has(node.reference.target) && !(typed && (listIds.has(node.reference.target) || own(referenceNodes, node.reference.target)))) fail(`跳转指向未知节点或选项组：${node.reference.target}。请在左侧目录查看 ID。`, node.reference.line, node.reference.column);
      }
      const inherited = Object.create(null), hidden = [];
      const put = (value, token) => { hidden.push(value); lineMap.push({ line: token?.line || 1, delta: (token?.column || 1) - (value.match(/^ */u)[0].length + 1) }); };
      put(escapeText(config.dialogue.name || baseDialogue.name), null);
      function emit(node, legacyDepth = 0) {
        put(`${"    ".repeat(legacyDepth)}@node ${node.id}`, node);
        if (Array.isArray(config.nodes[node.id]?.effects) && !config.nodes[node.id].effects.length && node.lines.some((t) => { const p = effectsAndLabel(t.value, t); return p.effects.length && !p.label; })) delete config.nodes[node.id].effects;
        let last = null;
        for (const t of node.lines) {
          if (last !== null) for (let line = last + 1; line < t.line; line++) put("", { ...t, line });
          put(`${"    ".repeat(legacyDepth)}${t.value}`, t); last = t.line;
        }
        if (node.reference) inherited[node.id] = node.reference;
        const previous = bindings.find((b) => b.id === node.id);
        const optionIds = new Set();
        const labels = node.options.map((option) => {
          let value = option.token.value.slice(1).trimStart();
          if (open(value[0])) value = value.slice(balanced(value, 0, option.token).end);
          return effectsAndLabel(value, option.token).label;
        });
        const optionBindings = labels.map((label) => {
          const matches = (previous?.options || []).filter((option) => option.label === label);
          return matches.length === 1 && labels.filter((entry) => entry === label).length === 1 ? matches[0].id : null;
        });
        const claimed = new Set(optionBindings.filter(Boolean));
        const reservedOptions = new Set((previous?.options || []).map((option) => option.id));
        for (const [i, option] of node.options.entries()) {
          let id = optionBindings[i];
          const positional = previous?.options?.[i]?.id;
          if (!id && previous?.options?.length === node.options.length && !claimed.has(positional)) { id = positional; claimed.add(id); }
          if (!id) { let serial = i + 1; do { id = `choice${serial++}`; } while (reservedOptions.has(id) || claimed.has(id) || optionIds.has(id)); }
          if (!idPattern.test(id) || optionIds.has(id)) { let n = i + 1; do { id = `choice${n++}`; } while (optionIds.has(id)); }
          optionIds.add(id);
          const optionEffects = effectsAndLabel(option.token.value.slice(1), option.token).effects;
          if (optionEffects.length && Array.isArray(config.options[node.id]?.[id]?.effects) && !config.options[node.id][id].effects.length) delete config.options[node.id][id].effects;
          const depth = legacyDepth === 0 ? 0 : legacyDepth + 1;
          put(`${"    ".repeat(depth)}@option ${id}`, option.token);
          put(`${"    ".repeat(depth)}${option.token.value}`, option.token);
          if (option.call) put("    ".repeat(depth) + option.call.value, option.call);
          if (option.child) {
            if (direct(option.child)) put(`${"    ".repeat(depth + 1)}-> ${option.child.reference.target}`, option.child.reference);
            else emit(option.child, depth + 1);
          }
        }
      }
      emit(root);
      // Typed references to option lists use real shared records, never copied options.
      const result = await compileLegacy(combine(hidden.join("\n"), config), baseDialogue, registry, { maxIndent: 128, deferReferences: typed });
      result.diagnostics.forEach((d) => { const mapped = lineMap[d.line - 1]; if (mapped) { d.line = mapped.line; d.column = Math.max(1, d.column + mapped.delta); } });
      if (!result.dialogue) return result;
      const nodes = result.dialogue.nodes, resolving = new Set(), resolved = new Set();
      function copyOptions(id) {
        if (resolved.has(id) || !inherited[id]) return;
        const ref = inherited[id];
        if (resolving.has(id)) fail("选项复用形成循环，必须有一个实际提供选项的节点", ref.line, ref.column);
        resolving.add(id); copyOptions(ref.target);
        nodes[id].options = clone(nodes[ref.target].options || []);
        resolving.delete(id); resolved.add(id);
      }
      if (!typed) Object.keys(inherited).forEach(copyOptions);
      result.dialogue.nodes = Object.fromEntries(actual.map((node) => [node.id, nodes[node.id]]));
      if (typed) {
        const lists = Object.create(null), nodeLists = config.nodeLists || {};
        const occupied = new Set([...Object.keys(result.dialogue.nodes), ...Object.keys(referenceNodes), ...listIds]);
        function storeOptions(id, node) {
          const options = node.options || [];
          delete node.options;
          if (inherited[id]) { node.optionList = inherited[id].target; return; }
          let listId = nodeLists[id] || baseDialogue.nodes?.[id]?.optionList;
          if (!listId && !options.length) return;
          // Editing a reference into local choices creates an independent group.
          if (!listId || config.listOwners?.[listId] && config.listOwners[listId] !== id) {
            const stem = `${id}Choices`; listId = stem; let serial = 2;
            while (occupied.has(listId)) listId = `${stem}${serial++}`;
          }
          if (own(result.dialogue.nodes, listId)) fail(`ID ${listId} 同时用于 node 和 optionList`);
          occupied.add(listId);
          lists[listId] = { ...clone(listDefinitions[listId] || {}), options };
          node.optionList = listId;
        }
        for (const [id, node] of Object.entries(result.dialogue.nodes)) {
          storeOptions(id, node);
        }
        for (const node of Object.values(result.dialogue.nodes)) {
          if (node.optionList && !lists[node.optionList]) {
            if (!listDefinitions[node.optionList]) fail(`未知选项组：${node.optionList}`);
            lists[node.optionList] = clone(listDefinitions[node.optionList]);
          }
        }
        // References may target existing content whose definition was removed from
        // the visible prose. Keep only the referenced nodes and their dependencies.
        if (rootRedirect) result.dialogue.start.default = root.reference.target;
        const retain = (id) => {
          if (own(result.dialogue.nodes, id)) return;
          if (!own(referenceNodes, id)) fail(`跳转指向未知节点：${id}`);
          result.dialogue.nodes[id] = clone(referenceNodes[id]);
          const position = config.dialogue.editor?.positions?.[id];
          if (position) {
            result.dialogue.editor ||= {}; result.dialogue.editor.positions ||= {};
            result.dialogue.editor.positions[id] = clone(position);
          }
        };
        retain(result.dialogue.start.default);
        for (const rule of result.dialogue.start.rules || []) retain(rule.node);
        for (const id of result.dialogue.entryNodes || []) retain(id);
        const pending = Object.keys(result.dialogue.nodes), scanned = new Set();
        while (pending.length) {
          const id = pending.shift(); if (scanned.has(id)) continue; scanned.add(id);
          const node = result.dialogue.nodes[id];
          if (own(node, "options")) storeOptions(id, node);
          if (node.optionList && !lists[node.optionList]) {
            if (!listDefinitions[node.optionList]) fail(`未知选项组：${node.optionList}`);
            lists[node.optionList] = clone(listDefinitions[node.optionList]);
          }
          for (const option of node.optionList ? lists[node.optionList].options : node.options || []) {
            if (option.next) { retain(option.next); pending.push(option.next); }
          }
        }
        result.dialogue.optionLists = Object.fromEntries(Object.entries(lists));
        delete result.dialogue.editor?.textAuthoring?.optionSources;
        const keys = new Set();
        const scan = (value) => { if (!object(value) && !Array.isArray(value)) return; if (typeof value.key === "string") keys.add(value.key); Object.values(value).forEach(scan); };
        scan(result.dialogue.nodes); scan(result.dialogue.optionLists); scan(result.dialogue.start);
        result.dialogue.editor ||= {}; result.dialogue.editor.textAuthoring ||= {};
        result.dialogue.editor.textAuthoring.flagAliases = Object.fromEntries(Object.entries(result.registry).filter(([name, key]) => name !== key && keys.has(key)));
      } else {
        const optionSources = Object.fromEntries(Object.entries(inherited).map(([id, ref]) => [id, ref.target]));
        if (Object.keys(optionSources).length || result.dialogue.editor?.textAuthoring?.optionSources) {
          result.dialogue.editor ||= {}; result.dialogue.editor.textAuthoring ||= {};
          result.dialogue.editor.textAuthoring.optionSources = optionSources;
          result.dialogue.editor.textAuthoring.flagAliases ||= {};
        }
      }
      result.dialogue.editor ||= {}; result.dialogue.editor.textAuthoring ||= {};
      result.dialogue.editor.textAuthoring.nextNodeSerial = serial;
      result.dialogue.editor.textAuthoring.syntaxVersion = typed ? 4 : 3;
      result.dialogue.editor.textAuthoring.flagAliases ||= {};
      const checked = Runtime.validateDialogue(result.dialogue);
      if (checked.errors.length) fail(checked.errors.join("；"));
      const replaced = typed ? ast.filter((node) => (direct(node) || node === root && rootRedirect) && node.lines.length).map((node) => ({ severity: "warning", message: `@${node.reference.target} 进入目标 node，前面的临时正文和进入效果不执行；保留正文请引用 optionList ID。`, line: node.reference.line, column: node.reference.column })) : [];
      result.diagnostics = [...replaced, ...checked.warnings.map((message) => ({ severity: "warning", message, line: 1, column: 1 }))];
      return result;
    } catch (error) { return { dialogue: null, registry: null, diagnostics: [{ severity: "error", message: error.message, line: error.line || 1, column: error.column || 1 }] }; }
  }

  async function compile(source, base, registry = {}) {
    try { const config = split(source).config; return config && ![2, 3, 4].includes(config.syntaxVersion) ? compileLegacy(source, base, registry) : compilePlain(source, base, registry); }
    catch (error) { return { dialogue: null, registry: null, diagnostics: [{ severity: "error", message: error.message, line: error.line || 1, column: error.column || 1 }] }; }
  }
  const serialize = (dialogue, registry = {}, { legacy = false } = {}) => serializeLegacy(dialogue, registry, { plain: object(dialogue.optionLists) || !legacy });
  const api = Object.freeze({ compile, serialize, split, combine, parseExpression, mergeAliases, flagKey, legacy: Object.freeze({ compile: compileLegacy, serialize: serializeLegacy, split, combine, parseExpression, mergeAliases, flagKey }) });
  global.DialogueText = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
