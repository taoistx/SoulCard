"use strict";

(function initializeNpcDialogueLoader(global) {
  const loaderUrl = new URL(document.currentScript.src, document.baseURI);
  const MANIFEST_URL = new URL("npc-dialogues/manifest.json", loaderUrl);
  let registry = null;
  let manifest = null;

  async function fetchJson(url) {
    let response;
    try { response = await fetch(url, { cache: "no-store" }); }
    catch (error) {
      if (global.location.protocol === "file:") throw new Error("NPC 剧情 JSON 无法从 file:// 页面加载，请通过本地静态服务器打开 index.html。", { cause: error });
      throw new Error(`无法读取 NPC 剧情数据 ${url.pathname}。`, { cause: error });
    }
    if (!response.ok) throw new Error(`无法读取 NPC 剧情数据 ${url.pathname}（HTTP ${response.status}）。`);
    try { return await response.json(); }
    catch (error) { throw new Error(`NPC 剧情数据 ${url.pathname} 不是有效 JSON。`, { cause: error }); }
  }

  async function loadRegistry() {
    manifest = await fetchJson(MANIFEST_URL);
    if (!manifest || manifest.schemaVersion !== 1 || !manifest.dialogues || Array.isArray(manifest.dialogues)) throw new Error("NPC 剧情 manifest 格式无效。");
    const entries = Object.entries(manifest.dialogues);
    if (!entries.length) throw new Error("NPC 剧情 manifest 没有登记角色。");
    const loaded = {};
    await Promise.all(entries.map(async ([id, path]) => {
      if (typeof path !== "string" || !path) throw new Error(`NPC ${id} 的文件路径无效。`);
      const dialogue = await fetchJson(new URL(path, MANIFEST_URL));
      if (dialogue.id !== id) throw new Error(`NPC manifest id ${id} 与文件 id ${dialogue.id || "(空)"} 不一致。`);
      const result = global.NPCDialogueRuntime.validateDialogue(dialogue);
      if (result.errors.length) throw new Error(`NPC ${id} 配置错误：${result.errors.join("；")}`);
      result.warnings.forEach((warning) => console.warn(`NPC ${id}：${warning}`));
      loaded[id] = global.NPCDialogueRuntime.deepFreeze(dialogue);
    }));
    registry = Object.freeze(loaded);
    return registry;
  }

  const ready = loadRegistry();
  ready.catch((error) => console.error(error));
  global.NpcDialogueData = Object.freeze({ ready, get: (id) => registry?.[id] || null, getAll: () => registry || Object.freeze({}), getManifest: () => manifest });
})(window);
