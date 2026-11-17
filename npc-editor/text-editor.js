"use strict";

async function initializeTextEditor() {
  if (window.DialogueTextEditor) { window.DialogueTextEditor.refresh(); return; }
  try { await window.DialogueEditorEnvironment?.ready; } catch { return; }
  const environment = window.DialogueEditorEnvironment;
  const folderMode = environment?.folderMode && Boolean(environment.flagMappings);
  const Text = window.DialogueText;
  const input = $("#dialogueTextInput"), configInput = $("#textConfigInput"), aliasesInput = $("#textFlagAliases");
  const folding = createDialogueFolding(input, $("#textLineNumbers"), (text) => {
    state().text = text;
    changed();
  });
  const workspace = $("#textWorkspace"), diagnostics = $("#textDiagnostics"), draftDialog = $("#textDraftDialog");
  const sheetTabs = [...document.querySelectorAll("#textSheetTabs [role=tab]")];
  const jsonPreview = $("#textJsonPreview");
  const numberedViews = [
    { view: configInput, gutter: $("#configLineNumbers"), text: () => configInput.value },
    { view: jsonPreview, gutter: $("#jsonLineNumbers"), text: () => jsonPreview.textContent },
  ];
  let drafts = {}, mode = window.DialogueEditorEnvironment?.sampleOnly ? "text" : "graph", visibleKey = null, busy = false, pendingAction = null;
  let rememberedAliases = {}, savingAliases = false;
  const aliasTransactions = new Map();
  try {
    const saved = JSON.parse(sessionStorage.getItem(editorStorageKey("dialogue-text-drafts")) || "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) drafts = saved;
    rememberedAliases = Text.mergeAliases(folderMode ? environment.flagMappings.aliases :
      JSON.parse(sessionStorage.getItem(editorStorageKey("dialogue-text-aliases")) || "{}"));
  } catch { showFeedback("部分文本草稿或映射无法读取，已保留项目对话", true); }
  const save = () => {
    sessionStorage.setItem(editorStorageKey("dialogue-text-drafts"), JSON.stringify(drafts));
    if (!folderMode) sessionStorage.setItem(editorStorageKey("dialogue-text-aliases"), JSON.stringify(rememberedAliases));
  };
  function withoutAliases(dialogue) {
    if (!folderMode) return dialogue;
    delete dialogue.editor?.textAuthoring?.flagAliases;
    return dialogue;
  }
  function registry() {
    return folderMode ? rememberedAliases : Text.mergeAliases(rememberedAliases, ...Object.values(documents).map((d) => d.editor?.textAuthoring?.flagAliases));
  }
  function makeDraft() {
    const parts = Text.split(Text.serialize(withoutAliases(clone(current())), registry(), { legacy: !environment?.sampleOnly }));
    return { text: parts.text, config: JSON.stringify(parts.config, null, 2), base: snapshot(), dirty: false, aliases: null, layoutVersion: 1,
      mappingRevision: environment?.flagMappings?.revision };
  }
  const state = () => drafts[currentId];
  const draftFormat = (draft) => { try { return JSON.parse(draft.config).syntaxVersion; } catch { return null; } };
  const hasDraft = () => Boolean(state()?.dirty);
  const completion = createDialogueCompletion(input, $("#textReferenceCompletion"), current,
    () => draftFormat(state()), (edit) => folding.updateFromInput(edit));
  function jsonLineNumbers(entry) {
    const text = entry.text();
    if (entry.lastText !== text) {
      entry.gutter.textContent = text.split("\n").map((_, i) => i + 1).join("\n");
      entry.lastText = text;
    }
    entry.gutter.style.transform = `translateY(${-entry.view.scrollTop}px)`;
  }
  numberedViews.forEach((entry) => entry.view.addEventListener("scroll", () => jsonLineNumbers(entry)));
  function selectSheet(name, focusTab = false) {
    const selected = sheetTabs.find((tab) => tab.dataset.sheet === name); if (!selected) return;
    if (name !== "body") completion.close();
    for (const tab of sheetTabs) {
      const active = tab === selected;
      tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !active;
    }
    if (name === "body") folding.syncScroll();
    numberedViews.forEach(jsonLineNumbers);
    if (focusTab) selected.focus();
  }
  for (const [index, tab] of sheetTabs.entries()) {
    tab.addEventListener("click", () => selectSheet(tab.dataset.sheet));
    tab.addEventListener("keydown", (event) => {
      const next = event.key === "ArrowRight" ? (index + 1) % sheetTabs.length : event.key === "ArrowLeft" ? (index + sheetTabs.length - 1) % sheetTabs.length : event.key === "Home" ? 0 : event.key === "End" ? sheetTabs.length - 1 : null;
      if (next !== null) { event.preventDefault(); selectSheet(sheetTabs[next].dataset.sheet, true); }
      else if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        const panel = document.getElementById(tab.getAttribute("aria-controls"));
        (panel.querySelector("textarea, input") || panel.querySelector("button") || panel).focus();
      }
    });
  }
  function report(entries) {
    diagnostics.replaceChildren();
    for (const entry of entries) {
      const button = h("button", entry.severity, `${entry.severity === "error" ? "错误" : "提示"} · 第 ${entry.line} 行，第 ${entry.column} 列：${entry.message}`);
      button.type = "button";
      button.addEventListener("click", () => {
        selectSheet("body");
        folding.reveal(entry.line, entry.column);
      });
      diagnostics.appendChild(button);
    }
  }
  function combined() {
    let config;
    try { config = JSON.parse(state().config); } catch (error) { throw new Error(`高级 JSON 配置无效：${error.message}`); }
    if (folderMode) {
      const aliases = registry(), authoring = config.dialogue?.editor?.textAuthoring;
      const embedded = Text.mergeAliases(config.flagAliases, authoring?.flagAliases);
      for (const [name, key] of Object.entries(embedded)) {
        if (Object.hasOwn(aliases, name) && aliases[name] !== key) {
          throw new Error(`Flag 映射冲突：“${name}”在当前目录对应 ${aliases[name]}，文本配置中对应 ${key}。`);
        }
      }
      config.flagAliases = harmonize(aliases, embedded);
      if (authoring) delete authoring.flagAliases;
    }
    return Text.combine(state().text, config);
  }
  function harmonize(aliases, target) {
    const names = new Map(Object.entries(aliases).map(([name, key]) => [key, name]));
    return Object.fromEntries(Object.entries(target || {}).map(([name, key]) => [names.get(key) || name, key]));
  }
  async function candidate() {
    const draft = state();
    if (draft.base !== snapshot()) throw new Error("节点图已在草稿建立后修改。请先保存完整文本，再从节点图重新生成并合并；不能覆盖较新的修改。");
    const aliases = folderMode ? registry() : draft.aliases || registry();
    let source = combined();
    if (!folderMode && draft.aliases) {
      const parts = Text.split(source);
      parts.config.flagAliases = harmonize(aliases, parts.config.flagAliases);
      if (parts.config.dialogue.editor?.textAuthoring) parts.config.dialogue.editor.textAuthoring.flagAliases = harmonize(aliases, parts.config.dialogue.editor.textAuthoring.flagAliases);
      source = Text.combine(parts.text, parts.config);
    }
    const result = await Text.compile(source, current(), aliases);
    if (folderMode) {
      const config = JSON.parse(draft.config);
      const labels = new Map(Object.entries(aliases).map(([name, key]) => [key, name]));
      const oldAliases = { ...config.dialogue?.editor?.textAuthoring?.flagAliases, ...config.flagAliases };
      for (const [name, key] of Object.entries(oldAliases)) {
        const usedOldLabel = Object.hasOwn(result.registry || {}, name) ||
          result.diagnostics.some((entry) => entry.message === `生成的 Flag 字段冲突：${name}`);
        if (usedOldLabel && !Object.hasOwn(aliases, name) && labels.has(key)) {
          throw new Error(`Flag“${name}”已改名为“${labels.get(key)}”，请同步修改正文中的名称。`);
        }
      }
    }
    if (result.dialogue) {
      const previous = Text.mergeAliases(registry(), Text.split(combined()).config.flagAliases);
      for (const [name, key] of Object.entries(previous)) {
        if (Object.hasOwn(result.registry, name) && result.registry[name] !== key) throw new Error(`已登记的 Flag“${name}”不能改绑字段；改名时请同步修改正文中的名称。`);
      }
      if (documentKey(result.dialogue) !== currentId) throw new Error("文本模式不能修改对话类型或 ID，请使用对话与入口设置。");
      // Preserve externally used entry nodes even if they have no inbound edge.
      const entries = new Set(current().entryNodes || []);
      if (current().kind === "world") for (const event of window.ActionEventData.list()) for (const stage of Object.values(event.stages)) for (const recipe of stage.recipes) if (recipe.resultDialogueId === current().id && recipe.resultNodeId) entries.add(recipe.resultNodeId);
      for (const id of entries) if (!result.dialogue.nodes[id]) throw new Error(`不能删除仍被外部引用的入口节点：${id}`);
    }
    return result;
  }
  function draftStatus() {
    $("#textDraftState").textContent = hasDraft() ? "文本草稿尚未转换 · 编辑完成后点击“转换并应用 JSON”；当前 JSON 保持不变" : "文本与当前 JSON 一致 · 修改文本后可手动转换";
    $("#textModeButton").textContent = hasDraft() ? "文本模式 · 有草稿" : "文本模式";
    $("#applyTextButton").disabled = busy || savingAliases || !hasDraft();
    $("#acceptAliasesButton").disabled = busy || savingAliases;
  }
  function references() {
    const lines = [];
    for (const [name, key] of Object.entries(registry())) {
      const used = [];
      for (const d of Object.values(documents)) for (const [id, node] of Object.entries(d.nodes)) {
        // Search structured fields, excluding prose and editor metadata.
        const scan = (value) => value && typeof value === "object" && (value.key === key || Object.values(value).some((v) => typeof v === "object" && scan(v)));
        if (scan({ effects: node.effects, options: Runtime.getNodeOptions(d, node), body: typeof node.body === "object" ? node.body : null }) || scan(d.start)) used.push(`${documentKey(d)}/${id}`);
      }
      lines.push(`${name} → ${key}\n${used.length ? used.join("、") : "尚未应用到对话"}`);
    }
    $("#textFlagReferences").textContent = lines.join("\n\n") || "尚无已登记的文本 Flag。原有字段可在这里绑定中文名称。";
  }
  function refresh() {
    if (!current()) return;
    try {
      if (!state() || !state().dirty && (state().layoutVersion !== 1 || state().base !== snapshot() ||
        state().mappingRevision !== environment?.flagMappings?.revision ||
        environment?.sampleOnly && draftFormat(state()) !== (current().optionLists ? 4 : 3))) drafts[currentId] = makeDraft();
      const d = state();
      if (visibleKey !== currentId || !d.dirty) {
        completion.close();
        folding.setText(d.text, visibleKey !== currentId); configInput.value = d.config; visibleKey = currentId;
        aliasesInput.value = JSON.stringify(folderMode ? registry() : d.aliases || registry(), null, 2);
        report([]);
      }
      workspace.hidden = mode !== "text"; els.graph.hidden = mode === "text";
      $("#graphToolbar").hidden = mode === "text";
      $("#graphModeButton").setAttribute("aria-pressed", String(mode === "graph"));
      $("#textModeButton").setAttribute("aria-pressed", String(mode === "text"));
      $("#flagMappingsHelp").textContent = folderMode
        ? "采用映射会保存到当前 JSON 文件夹的 flag-mappings.json。新增 Flag 会在文本转换成功时写入。改名时保留字段，已有正文草稿需同步修改名称。"
        : "名称与内部字段一一对应。新增名称可在转换前绑定已有字段。改名时保留字段并同步修改正文。采用映射后手动转换文本。";
      draftStatus(); references();
      jsonPreview.textContent = JSON.stringify(current(), null, 2);
      numberedViews.forEach(jsonLineNumbers);
    } catch (error) { showFeedback(error.message, true); }
  }
  function changed() {
    state().config = configInput.value; state().dirty = true;
    save(); report([]); draftStatus();
    jsonLineNumbers(numberedViews[0]);
  }
  async function apply() {
    if (busy || savingAliases) return false;
    busy = true; draftStatus();
    const key = currentId, draftSnapshot = JSON.stringify(state()), original = snapshot();
    try {
      const result = await candidate();
      if (currentId !== key || snapshot() !== original || JSON.stringify(state()) !== draftSnapshot) throw new Error("转换期间内容已修改，请重新应用。");
      if (!result.dialogue) { report(result.diagnostics); return false; }
      const aliasesBefore = {}, aliasesAfter = {};
      for (const [id, d] of folderMode ? [] : Object.entries(documents)) {
        if (id === currentId || !d.editor?.textAuthoring?.flagAliases) continue;
        const previous = d.editor.textAuthoring.flagAliases, next = harmonize(result.registry, previous);
        if (JSON.stringify(previous) !== JSON.stringify(next)) { aliasesBefore[id] = clone(previous); aliasesAfter[id] = next; }
      }
      // All parsing, reference and mapping checks complete before this transaction.
      const normalized = normalizeDialogue(withoutAliases(result.dialogue));
      Text.serialize(normalized, result.registry, { legacy: !window.DialogueEditorEnvironment?.sampleOnly });
      if (folderMode && (Object.keys(result.registry).length || environment.flagMappings?.revision)) {
        await environment.saveFlagMappings(result.registry);
        if (currentId !== key || snapshot() !== original || JSON.stringify(state()) !== draftSnapshot) {
          rememberedAliases = Text.mergeAliases(result.registry);
          throw new Error("Flag 映射已保存，转换期间对话已修改，请重新应用文本。");
        }
      }
      for (const [id, aliases] of Object.entries(aliasesAfter)) documents[id].editor.textAuthoring.flagAliases = aliases;
      documents[currentId] = normalized;
      rememberedAliases = { ...result.registry };
      drafts[currentId] = makeDraft();
      const submitted = JSON.parse(draftSnapshot);
      if (window.DialogueEditorEnvironment?.sampleOnly && [3, 4].includes(draftFormat(submitted))) drafts[currentId].text = submitted.text;
      if (!folderMode) aliasTransactions.set(snapshot(), { before: aliasesBefore, after: aliasesAfter, previous: original });
      recordHistory(); persistDraft(); save(); renderAll();
      report(result.diagnostics);
      showFeedback(`文本已转换并应用：${Object.keys(current().nodes).length} 个节点；可使用撤销恢复。`);
      return true;
    } catch (error) { report([{ severity: "error", message: error.message, line: 1, column: 1 }]); return false; }
    finally { busy = false; draftStatus(); }
  }
  function guard(action) {
    pendingAction = action;
    if (!draftDialog.open) draftDialog.showModal();
  }
  function finishGuard() { const action = pendingAction; pendingAction = null; draftDialog.close(); action?.(); }
  function download(name, value, type) {
    const url = URL.createObjectURL(new Blob([value], { type })), link = h("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("#textModeButton").addEventListener("click", () => { mode = "text"; refresh(); });
  $("#graphModeButton").addEventListener("click", () => { const go = () => { mode = "graph"; refresh(); }; if (hasDraft()) guard(go); else go(); });
  $("#applyTextButton").addEventListener("click", apply);
  $("#resetTextButton").addEventListener("click", () => {
    if (hasDraft() && !window.confirm("放弃当前文本草稿，并从最新节点图重新生成？")) return;
    drafts[currentId] = makeDraft(); visibleKey = null; save(); refresh();
  });
  configInput.addEventListener("input", changed);
  input.addEventListener("keydown", (event) => {
    if (completion.handleKey(event) || event.isComposing || event.key !== "Tab") return;
    event.preventDefault();
    if (input.selectionStart !== input.selectionEnd) folding.revealSelection();
    const start = input.selectionStart, end = input.selectionEnd, source = input.value;
    if (start === end && !event.shiftKey) {
      input.setRangeText("\t", start, end, "end");
      folding.updateFromInput({ start, end });
    } else {
      const lineStart = source.lastIndexOf("\n", start - 1) + 1;
      const selected = source.slice(lineStart, end), lines = selected.split("\n");
      if (end > start && source[end - 1] === "\n") lines.pop();
      const originalLength = lines.join("\n").length;
      const updated = lines.map((line) => event.shiftKey ? line.replace(/^(\t| {1,4})/u, "") : `\t${line}`).join("\n");
      const firstDelta = updated.split("\n")[0].length - lines[0].length;
      input.setRangeText(updated, lineStart, lineStart + originalLength, "preserve");
      input.setSelectionRange(Math.max(lineStart, start + firstDelta), Math.max(lineStart, end + updated.length - originalLength));
      folding.updateFromInput({ start: lineStart, end: lineStart + originalLength });
    }
  });
  $("#draftApplyContinue").addEventListener("click", async () => { if (await apply()) finishGuard(); });
  $("#draftKeepContinue").addEventListener("click", () => { save(); finishGuard(); });
  $("#draftDiscardContinue").addEventListener("click", () => { delete drafts[currentId]; visibleKey = null; save(); refresh(); finishGuard(); });
  $("#draftCancel").addEventListener("click", () => { pendingAction = null; draftDialog.close(); renderNpcSelect(); });
  draftDialog.addEventListener("cancel", () => { pendingAction = null; renderNpcSelect(); });
  $("#exportTextButton").addEventListener("click", () => {
    try { download(`${current().id}.dialogue.txt`, combined(), "text/plain;charset=utf-8"); showFeedback(hasDraft() ? "已导出完整文本草稿；未改变当前 JSON。" : "已导出完整文本。"); }
    catch (error) { showFeedback(error.message, true); }
  });
  $("#importTextButton").addEventListener("click", () => $("#importTextFile").click());
  $("#importTextFile").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    const content = await file.text(), key = currentId;
    const load = () => {
      if (currentId !== key) return;
      try {
        const parts = Text.split(content);
        if (!parts.config && /^(?:[ \t]|&#x20;)*&#x20;/mu.test(parts.text)) {
          // Markdown exports can encode indentation and append a hard-break marker.
          parts.text = parts.text
            .replace(/^(?:[ \t]|&#x20;)+/gmu, (indent) => indent.replaceAll("&#x20;", " "))
            .replace(/(?<=[^\\\s])((?:\\\\)*)\\$/gmu, "$1");
        }
        let config = parts.config;
        if (!config && (environment?.sampleOnly || current().optionLists)) {
          config = JSON.parse(makeDraft().config);
          config.syntaxVersion = 4;
        }
        if (!config) {
          const dialogue = clone(current()); delete dialogue.nodes;
          config = { version: 1, dialogue, nodes: {}, options: {} };
        }
        state().text = parts.text;
        folding.setText(parts.text, true);
        configInput.value = JSON.stringify(config, null, 2);
        changed();
      } catch (error) { showFeedback(error.message, true); }
    };
    if (hasDraft()) guard(load); else load(); event.target.value = "";
  });
  async function acceptAliases(value) {
    const next = Text.mergeAliases(value), previous = registry();
    for (const [name, key] of Object.entries(previous)) {
      if (Object.hasOwn(next, name) && next[name] !== key) throw new Error(`已登记的“${name}”不能改绑字段，请使用新名称。`);
      if (!Object.values(next).includes(key)) throw new Error(`不能删除已登记字段 ${key}；改名时保留该字段。`);
    }
    if (folderMode) {
      if (busy || savingAliases) throw new Error("正在保存映射或转换文本，请稍后再试。");
      const key = currentId;
      savingAliases = true;
      draftStatus();
      try {
        await environment.saveFlagMappings(next);
        rememberedAliases = next;
        if (drafts[key]) drafts[key].aliases = null;
        save(); refresh();
        if (currentId === key) aliasesInput.value = JSON.stringify(next, null, 2);
        showFeedback("Flag 映射已保存到当前文件夹的 flag-mappings.json。");
      } finally { savingAliases = false; draftStatus(); }
      return;
    }
    state().aliases = { ...next }; state().dirty = true; save(); report([]); draftStatus();
  }
  $("#acceptAliasesButton").addEventListener("click", async () => { try { await acceptAliases(JSON.parse(aliasesInput.value)); } catch (error) { showFeedback(error.message, true); } });
  $("#exportAliasesButton").addEventListener("click", () => { try { download("dialogue-flag-aliases.json", `${JSON.stringify(Text.mergeAliases(JSON.parse(aliasesInput.value)), null, 2)}\n`, "application/json"); } catch (error) { showFeedback(error.message, true); } });
  $("#importAliasesButton").addEventListener("click", () => $("#importAliasesFile").click());
  $("#importAliasesFile").addEventListener("change", async (event) => {
    try { if (event.target.files[0]) { const next = JSON.parse(await event.target.files[0].text()); await acceptAliases(Text.mergeAliases(registry(), next)); if (!folderMode) aliasesInput.value = JSON.stringify(state().aliases, null, 2); } }
    catch (error) { showFeedback(error.message, true); } event.target.value = "";
  });
  window.DialogueTextEditor = {
    refresh, hasDraft, guard, hasAnyDraft: () => Object.values(drafts).some((d) => d.dirty),
    moveDraft(previous, next) { if (previous !== next && drafts[previous]) { drafts[next] = drafts[previous]; delete drafts[previous]; visibleKey = null; save(); } },
    async validateImport(dialogue) {
      const imported = dialogue.editor?.textAuthoring?.flagAliases;
      if (folderMode) {
        if (imported && Object.keys(imported).length) await acceptAliases(Text.mergeAliases(registry(), imported));
        withoutAliases(dialogue);
      } else Text.mergeAliases(rememberedAliases, ...Object.entries(documents).filter(([id]) => id !== documentKey(dialogue)).map(([, d]) => d.editor?.textAuthoring?.flagAliases), imported);
    },
    restoreAliases(previous, next) {
      if (folderMode) return;
      const undo = aliasTransactions.get(previous), redo = aliasTransactions.get(next);
      const changes = undo?.previous === next ? undo.before : redo?.previous === previous ? redo.after : {};
      for (const [id, aliases] of Object.entries(changes)) if (documents[id]) documents[id].editor.textAuthoring.flagAliases = clone(aliases);
      // Field identities remain reserved; labels follow the restored documents.
      const restored = Object.assign({}, ...Object.values(documents).map((d) => d.editor?.textAuthoring?.flagAliases || {}));
      const keys = new Set(Object.values(restored));
      rememberedAliases = Object.fromEntries(Object.entries(rememberedAliases).filter(([, key]) => !keys.has(key)));
      rememberedAliases = { ...rememberedAliases, ...restored }; save();
    },
  };
  refresh();
}
initializeTextEditor();
