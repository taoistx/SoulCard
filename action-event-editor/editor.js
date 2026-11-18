"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const { normalize, indentDepth, compile, outline, opensBlock, belongsToHeader } = ActionEventDsl;
  const format = "action-event-sandbox";
  const storageKey = "action-event-editor:session:v1";
  const source = $("source");
  const config = $("config");
  const tabs = [...$("tabs").querySelectorAll('[role="tab"]')];
  const sandbox = createActionSandboxView($("sandboxPlay"));
  const example = {
    filename: ActionEventExample.filename,
    source: ActionEventExample.source,
    config: JSON.stringify(ActionEventExample.config, null, 2),
  };
  let draft = { ...example };
  let saved = { ...example };
  let applied = null;
  let storageAvailable = true;
  let folder;
  const isEvent = (value = draft) => value.kind === "event";
  const isEventText = (value = draft) => isEvent(value) && value.textVersion === 1;

  const folding = createDialogueFolding(source, $("lineNumbers"), (text) => {
    draft.source = text;
    changed();
    renderOutline();
  }, {
    isFoldHeader: (text, depth) => isEvent()
      ? isEventText() && Boolean(ActionEventText.heading(text.trimEnd(), depth))
      : text.startsWith("》") || (depth === 0 && /^\[[\p{L}\p{N}_-]+\] *$/u.test(text)),
    allowFlatReply: false,
    indentDepth,
    belongsToHeader: (header, line) => !isEvent() && belongsToHeader(header, line),
  });

  function selectTab(id, focus = false) {
    for (const tab of tabs) {
      const active = tab.id === id;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      $(tab.getAttribute("aria-controls")).hidden = !active;
      if (active && focus) tab.focus();
    }
    if (id === "sourceTab") folding.syncScroll();
  }

  function jumpTo(entry) {
    if (entry.config) {
      selectTab("sandboxTab");
      $("sandboxSettings").open = true;
      const lines = config.value.split("\n");
      const line = Math.min(entry.line, lines.length);
      const offset = lines.slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0);
      config.focus();
      config.setSelectionRange(offset + entry.column - 1, offset + entry.column - 1);
      config.scrollTop = Math.max(0, line - 3) * parseFloat(getComputedStyle(config).lineHeight);
    } else {
      selectTab("sourceTab");
      folding.reveal(entry.line, entry.column);
    }
  }

  function diagnostics(entries) {
    $("diagnostics").replaceChildren(...entries.map((entry) => {
      const row = document.createElement(entry.line ? "button" : "div");
      row.className = entry.severity;
      const location = entry.line ? `${entry.file}:${entry.line}:${entry.column} · ` : "";
      row.textContent = `${location}${entry.message}`;
      if (entry.line) {
        row.type = "button";
        row.addEventListener("click", () => jumpTo(entry));
      }
      return row;
    }));
  }

  function renderOutline() {
    const entries = isEvent() ? (isEventText() ? ActionEventText.outline(draft.source) : []) : outline(draft.source);
    $("outlineNav").hidden = isEvent() && !isEventText();
    $("outline").replaceChildren(...entries.map(({ kind, label, loc }) => {
      const button = document.createElement("button");
      button.type = "button";
      const name = document.createElement("strong");
      name.textContent = label;
      const type = document.createElement("small");
      type.textContent = kind;
      button.append(name, type);
      button.addEventListener("click", () => jumpTo(loc));
      return button;
    }));
  }

  const upToDate = () => applied?.draft.filename === draft.filename && isEvent(applied.draft) === isEvent() && applied.draft.textVersion === draft.textVersion && applied.draft.source === draft.source && applied.draft.config === draft.config;
  const unexported = () => saved.source !== draft.source || saved.config !== draft.config;

  function updateStatus() {
    $("filename").textContent = draft.filename;
    $("exportJson").disabled = !upToDate();
    $("exportText").hidden = isEvent() && !isEventText();
    $("apply").textContent = isEvent() && !isEventText() ? "校验并应用 JSON" : "转换并应用";
    source.setAttribute("aria-label", isEvent() && !isEventText() ? "旧版行动事件 JSON 草稿" : "行动事件正文");
    const status = isEvent()
      ? `${isEventText() ? "游戏事件文本" : "旧版 JSON 草稿"} · ${upToDate() ? "已转换" : "草稿待转换"}`
      : upToDate() ? "已转换" : "草稿待转换";
    $("draftState").textContent = `${status} · ${unexported() ? "有未导出的修改" : "无未导出的修改"}${storageAvailable ? "" : " · 浏览器会话存储不可用"}`;
    $("sandboxVersion").textContent = isEvent() ? "当前是游戏事件。可导出 JSON 后在游戏中验证流程。" : applied
      ? `沙盒正在运行第 ${applied.version} 版 · ${applied.draft.filename}${upToDate() ? "" : " · 当前草稿尚未应用"}`
      : "沙盒尚无已应用版本。";
  }

  function persist() {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ draft, saved, last: applied && { draft: applied.draft, version: applied.version } }));
      storageAvailable = true;
    } catch { storageAvailable = false; }
  }

  function changed() {
    diagnostics([]);
    persist();
    updateStatus();
  }

  function loadFields() {
    folding.setText(draft.source, true);
    config.value = draft.config;
    renderOutline();
    $("sandboxSettings").hidden = isEvent();
    $("eventTextHelp").hidden = !isEvent();
    $("sandboxTextHelp").hidden = isEvent();
    folder?.syncSelection();
  }

  function jsonError(error, text, file, config = false) {
    const exact = /line (\d+) column (\d+)/u.exec(error.message);
    const position = /position (\d+)/u.exec(error.message);
    const before = text.slice(0, position ? Number(position[1]) : text.length).split("\n");
    const loc = { line: exact ? Number(exact[1]) : before.length, column: exact ? Number(exact[2]) : before.at(-1).length + 1 };
    return { ok: false, diagnostics: [{ severity: "error", file, ...loc, config, message: `JSON 语法错误：${error.message}` }] };
  }

  function candidate(value) {
    if (isEvent(value)) {
      let document;
      if (isEventText(value)) {
        const parsed = ActionEventText.parse(value.source, value.filename);
        if (parsed.diagnostics.length) return { ok: false, diagnostics: parsed.diagnostics };
        document = parsed.event;
      } else {
        try { document = JSON.parse(value.source); }
        catch (error) { return jsonError(error, value.source, value.filename); }
      }
      const errors = ActionEventRuntime.validate(document);
      return { ok: !errors.length, diagnostics: errors.map((message) => ({ severity: "error", message })), document };
    }
    let parsedConfig;
    try { parsedConfig = JSON.parse(value.config); }
    catch (error) { return jsonError(error, value.config, "沙盒配置", true); }
    const result = compile(value.source, parsedConfig, value.filename);
    if (result.ok) result.document = { kind: format, schemaVersion: 1, filename: value.filename, source: value.source, panel: result.panel, config: parsedConfig };
    return result;
  }

  function applyResult(value, document, version) {
    applied = { draft: { ...value }, document, version };
    $("jsonPreview").textContent = JSON.stringify(document, null, 2);
    if (isEvent(value)) sandbox.clear("可在「当前 JSON」查看校验结果，或导出修改后的文件。");
    else sandbox.load(document);
  }

  function apply() {
    const result = candidate(draft);
    if (result.ok) {
      if (isEvent() && !isEventText()) {
        draft = upgradeEventDraft(draft);
        loadFields();
      }
      applyResult(draft, result.document, (applied?.version || 0) + 1);
    }
    diagnostics(result.diagnostics);
    persist();
    updateStatus();
    return result.ok;
  }

  function download(filename, contents, type) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function mayReplace() {
    return !unexported() || window.confirm("当前有未导出的修改。替换草稿？");
  }

  function jsonDraft(content, filename) {
    const data = JSON.parse(content);
    if (typeof data?.id === "string" && Array.isArray(data.slots) && data.stages && typeof data.stages === "object" && !Array.isArray(data.stages)) {
      return { kind: "event", textVersion: 1, filename, source: ActionEventText.serialize(data), config: example.config };
    }
    if (data?.kind !== format || data.schemaVersion !== 1 || typeof data.source !== "string" || !Object.hasOwn(data, "config")) {
      throw new Error("请选择行动事件 JSON 或编辑器导出的沙盒 JSON。");
    }
    const basename = typeof data.filename === "string" ? data.filename.split(/[/\\]/u).at(-1)?.trim() : "";
    return { filename: basename || filename.replace(/\.json$/iu, ".txt"), source: normalize(data.source), config: JSON.stringify(data.config, null, 2) };
  }

  function replaceDraft(next, applyJson) {
    if (!mayReplace()) return;
    if (next.selected || isEvent(next) !== isEvent()) {
      applied = null;
      $("jsonPreview").textContent = "";
      sandbox.clear(isEvent(next) ? "校验事件后可查看和导出 JSON。" : "转换成功后可运行沙盒。");
    }
    draft = next;
    saved = applyJson ? { ...draft } : { ...saved, source: draft.source };
    loadFields();
    selectTab("sourceTab");
    if (applyJson) apply(); else changed();
  }

  async function importFile(file) {
    const content = normalize(await file.text());
    const isJson = /\.json$/iu.test(file.name);
    const next = isJson ? jsonDraft(content, file.name)
      : /^\s*@event\s/u.test(content) ? { kind: "event", textVersion: 1, filename: file.name.replace(/\.txt$/iu, ".json"), source: content, config: example.config }
      : { filename: file.name, source: content, config: draft.config };
    replaceDraft(next, isJson);
  }

  $("tabs").addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) selectTab(tab.id);
  });
  $("tabs").addEventListener("keydown", (event) => {
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    const indexByKey = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 };
    if (!Object.hasOwn(indexByKey, event.key)) return;
    event.preventDefault();
    selectTab(tabs[indexByKey[event.key]].id, true);
  });
  function outdentSource(event) {
    folding.revealSelection();
    const { value, selectionStart, selectionEnd, selectionDirection } = source;
    const first = value.slice(0, selectionStart).lastIndexOf("\n") + 1;
    const last = value.indexOf("\n", Math.max(selectionStart, selectionEnd - 1));
    const endOfLines = last === -1 ? value.length : last;
    const lines = value.slice(first, endOfLines).split("\n");
    const width = isEvent() && !isEventText() ? 2 : 4;
    let offset = first;
    let start = selectionStart;
    let end = selectionEnd;
    const replacement = lines.map((line) => {
      const indent = /^[ \t]*/u.exec(line)[0];
      const tab = indent.indexOf("\t");
      const removeTab = tab >= 0 && tab < width;
      const from = removeTab ? tab : 0;
      const removed = removeTab ? 1 : Math.min(width, indent.length);
      start -= Math.max(0, Math.min(removed, selectionStart - offset - from));
      end -= Math.max(0, Math.min(removed, selectionEnd - offset - from));
      offset += line.length + 1;
      return line.slice(0, from) + line.slice(from + removed);
    }).join("\n");
    if (replacement.length === endOfLines - first) return;
    event.preventDefault();
    source.setRangeText(replacement, first, endOfLines);
    source.setSelectionRange(start, end, selectionDirection);
    folding.updateFromInput({ start: first, end: endOfLines });
  }

  source.addEventListener("keydown", (event) => {
    if (event.isComposing || event.altKey) return;
    if (event.shiftKey) {
      if (event.key === "Tab" && !event.ctrlKey && !event.metaKey) outdentSource(event);
      return;
    }
    const enter = event.key === "Enter";
    if (enter && (event.ctrlKey || event.metaKey)) { event.preventDefault(); apply(); return; }
    const beforeCaret = () => source.value.slice(0, source.selectionStart).split("\n").at(-1);
    const tab = event.key === "Tab" && !event.ctrlKey && !event.metaKey && /^[ \t]*$/u.test(beforeCaret());
    if (!enter && !tab) return;
    event.preventDefault();
    folding.revealSelection();
    const start = source.selectionStart;
    const end = source.selectionEnd;
    const before = beforeCaret();
    const indent = /^[ \t]*/u.exec(before)[0];
    const text = before.slice(indent.length).trimEnd();
    const depth = indentDepth(indent);
    const opens = isEventText() ? ActionEventText.heading(text, depth)
      : isEvent() ? /[\[{]$/u.test(text) : opensBlock(text, depth);
    const nextIndent = opens ? (indent.includes("\t") ? "\t" : isEvent() && !isEventText() ? "  " : "    ") : "";
    const marker = isEventText() && /^[|>]/u.test(text) ? text[0] : "";
    source.setRangeText(tab ? "\t" : `\n${indent}${nextIndent}${marker}`, start, end, "end");
    folding.updateFromInput({ start, end });
  });
  config.addEventListener("input", () => { draft.config = config.value; changed(); });
  $("apply").addEventListener("click", apply);
  $("import").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try { await importFile(file); }
    catch (error) { diagnostics([{ severity: "error", message: `${file.name} · 导入失败：${error.message}` }]); }
  });
  $("exportText").addEventListener("click", () => {
    download(`${draft.filename.replace(/\.(?:txt|json)$/iu, "")}.txt`, draft.source, "text/plain;charset=utf-8");
    saved.source = draft.source;
    persist();
    updateStatus();
  });
  $("exportJson").addEventListener("click", () => {
    if (!upToDate()) return;
    const filename = isEvent() ? draft.filename : `${draft.filename.replace(/\.txt$/iu, "")}.json`;
    download(filename, `${JSON.stringify(applied.document, null, 2)}\n`, "application/json;charset=utf-8");
    saved = { ...draft };
    persist();
    updateStatus();
  });
  $("loadExample").addEventListener("click", () => replaceDraft({ ...example }, true));

  function isDraft(value) {
    return ["filename", "source", "config"].every((key) => typeof value?.[key] === "string");
  }

  function upgradeEventDraft(value) {
    if (!isEvent(value) || isEventText(value)) return value;
    try {
      return { ...value, ...jsonDraft(normalize(value.source), value.filename) };
    } catch { return value; }
  }

  let restored;
  try { restored = JSON.parse(sessionStorage.getItem(storageKey)); }
  catch { /* Start from the example when there is no readable session. */ }
  if (isDraft(restored?.draft)) draft = upgradeEventDraft(restored.draft);
  if (isDraft(restored?.saved)) saved = upgradeEventDraft(restored.saved);
  loadFields();
  const last = isDraft(restored?.last?.draft) ? upgradeEventDraft(restored.last.draft) : isEvent() ? null : example;
  if (last) {
    const result = candidate(last);
    if (result.ok) applyResult(last, result.document, Number.isSafeInteger(restored?.last?.version) ? restored.last.version : 1);
    if (upToDate()) diagnostics(result.diagnostics);
  }
  if (isEvent() && !applied) sandbox.clear("校验事件后可查看和导出 JSON。");
  folder = connectActionEventFolder({
    current: () => draft.selected,
    openDocument: ({ source: raw, file }, directory) => {
      replaceDraft({ ...jsonDraft(normalize(raw), file), selected: { directory, file } }, true);
    },
  });
  persist();
  updateStatus();
})();
