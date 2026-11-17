"use strict";

// Keep the default authoring session separate from the game's content and drafts.
(function (global) {
  const baseUrl = document.currentScript.src;
  const project = new URLSearchParams(location.search).get("source") === "project";
  const environment = { sampleOnly: !project, storagePrefix: "", samplePath: "npc-editor/examples/dialogue_debug.json" };
  environment.files = {};
  environment.request = async (path, payload) => {
    const response = await fetch(`/__dialogue_editor/${path}`, payload === undefined ? { cache: "no-store" } : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!response.ok) {
      let message = "请通过“启动剧情编辑器.cmd”打开；普通静态服务器不支持文件夹设置和直接保存。";
      try { message = (await response.json()).error || message; } catch { /* Static servers return HTML. */ }
      throw new Error(message);
    }
    return response.json();
  };
  environment.loadFolder = async () => {
    const loaded = await environment.request("documents"), registries = { npc: {}, world: {} }, skipped = [...loaded.skipped];
    environment.directory = loaded.directory;
    environment.flagMappings = loaded.flagMappings;
    environment.folderMode = true;
    environment.sampleOnly = true; // Standalone authoring does not require game manifests or combat data.
    for (const entry of loaded.files) {
      const dialogue = entry.dialogue, kind = dialogue.kind || "npc", key = `${kind}:${dialogue.id}`;
      let result;
      try { result = global.NPCDialogueRuntime.validateDialogue(dialogue); }
      catch (error) { skipped.push(`${entry.file}：对话格式无效（${error.message}）`); continue; }
      if (!["npc", "world"].includes(kind) || result.errors.length || registries[kind]?.[dialogue.id]) {
        skipped.push(`${entry.file}：${result.errors.join("；") || "类型无效或对话 ID 重复"}`); continue;
      }
      registries[kind][dialogue.id] = global.NPCDialogueRuntime.deepFreeze(dialogue);
      environment.files[key] = { file: entry.file, revision: entry.revision };
    }
    environment.skipped = skipped;
    // Each folder owns drafts; individual disk revisions are checked before restoring them.
    const fingerprint = await global.DialogueText.flagKey(loaded.directory);
    environment.storagePrefix = `dialogue-folder:${fingerprint}:`;
    if (environment.flagMappings?.revision === null) {
      let previous;
      try { previous = JSON.parse(sessionStorage.getItem(`${environment.storagePrefix}dialogue-text-aliases`) || "{}"); }
      catch { previous = {}; }
      try {
        previous = global.DialogueText.mergeAliases(previous);
        const knownKeys = new Set(Object.values(previous));
        const embedded = Object.values(registries).flatMap((registry) =>
          Object.values(registry).map((dialogue) => global.DialogueText.mergeAliases(dialogue.editor?.textAuthoring?.flagAliases)));
        const aliases = global.DialogueText.mergeAliases(previous, ...embedded.map((table) =>
          Object.fromEntries(Object.entries(table).filter(([, key]) => !knownKeys.has(key)))));
        if (Object.keys(aliases).length) await environment.saveFlagMappings(aliases);
      } catch (error) { throw new Error(`Flag 映射迁移失败：${error.message}`); }
    }
    global.WORLD_EVENT_SET_BUNDLE = { eventSets: {} };
    global.WORLD_MAP_BUNDLE = { map: { nodes: [{ id: "debug_scene", label: "独立调试场景" }] } };
    global.ActionEventData = { ready: Promise.resolve(), list: () => [], get: () => null };
    for (const [kind, name] of [["npc", "NpcDialogueData"], ["world", "WorldDialogueData"]]) {
      const registry = Object.freeze(registries[kind]);
      const paths = Object.freeze(Object.fromEntries(Object.keys(registry).map((id) => [id, environment.files[`${kind}:${id}`].file])));
      global[name] = Object.freeze({ ready: Promise.resolve(registry), get: (id) => registry[id] || null, getAll: () => registry,
        getManifest: () => ({ schemaVersion: 1, dialogues: paths }) });
    }
  };
  environment.saveFlagMappings = async (aliases) => {
    if (!environment.flagMappings) throw new Error("请重启本地编辑器服务后保存 Flag 映射。");
    const saved = await environment.request("flag-mappings", {
      directory: environment.directory, revision: environment.flagMappings.revision, aliases,
    });
    environment.flagMappings = saved;
    return saved;
  };
  const script = (file) => new Promise((resolve, reject) => {
    const node = document.createElement("script"); node.src = new URL(file, baseUrl);
    node.onload = resolve; node.onerror = () => reject(new Error(`无法载入 ${file}`)); document.head.appendChild(node);
  });
  environment.loadSample = async (source) => {
    const sample = JSON.parse(source);
    if (sample.id !== "dialogue_debug" || sample.kind !== "npc") throw new Error("调试范例必须保持 id 为 dialogue_debug、kind 为 npc");
    const checked = global.NPCDialogueRuntime.validateDialogue(sample);
    if (checked.errors.length) throw new Error(`调试范例无效：${checked.errors.join("；")}`);
    const fingerprint = (await global.DialogueText.flagKey(source)).slice("storyFlag_".length);
    environment.folderMode = false;
    environment.flagMappings = undefined;
    environment.storagePrefix = `dialogue-debug:${fingerprint}:`;
    environment.sampleOnly = true;
    global.WORLD_EVENT_SET_BUNDLE = { eventSets: {} };
    global.WORLD_MAP_BUNDLE = { map: { nodes: [{ id: "debug_scene", label: "独立调试场景" }] } };
    global.ActionEventData = { ready: Promise.resolve(), list: () => [], get: () => null };
    const registry = Object.freeze({ [sample.id]: global.NPCDialogueRuntime.deepFreeze(sample) }), empty = Object.freeze({});
    global.NpcDialogueData = Object.freeze({ ready: Promise.resolve(registry), get: (id) => registry[id] || null, getAll: () => registry, getManifest: () => ({ schemaVersion: 1, dialogues: { dialogue_debug: "dialogue_debug.json" } }) });
    global.WorldDialogueData = Object.freeze({ ready: Promise.resolve(empty), get: () => null, getAll: () => empty, getManifest: () => ({ schemaVersion: 1, dialogues: {} }) });
  };
  environment.ready = (async () => {
    // Explicit opt-in retained for project-integration regressions; no UI auto-enables it.
    if (project) {
      for (const file of ["../world-events.js", "../world-map.js", "../action-events.js", "../npc-dialogue-loader.js", "../world-dialogue-loader.js"]) await script(file);
      return;
    }
    if (location.protocol !== "file:") {
      // Fall back only when no authoring API exists. A configured but missing folder is an actionable startup error.
      let available = false;
      try { const response = await fetch("/__dialogue_editor/settings", { cache: "no-store" }); available = response.ok; } catch { /* Offline/static entry. */ }
      if (available) { await environment.loadFolder(); return; }
    }
    if (location.protocol === "file:") throw new Error("直接打开 HTML 时，浏览器不能自动读取范例 JSON。请在下方选择 examples/dialogue_debug.json，或双击“启动剧情编辑器.cmd”通过本地服务打开。");
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(new URL("examples/dialogue_debug.json", baseUrl), { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`无法读取调试范例（HTTP ${response.status}）`);
      await environment.loadSample(await response.text());
    } catch (error) {
      if (error.name === "AbortError") throw new Error("读取调试范例超时，可重试或在下方手动选择范例 JSON。");
      throw error;
    } finally { clearTimeout(timeout); }
  })();
  environment.ready.catch(() => {}); // initialize() reports loading errors in the editor.
  global.DialogueEditorEnvironment = environment;
})(window);
