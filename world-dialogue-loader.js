"use strict";
(function (global) {
  const manifestUrl = new URL("world-dialogues/manifest.json", document.currentScript.src);
  let registry = Object.freeze({}), manifest = null;
  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`世界对话 ${url.pathname}：HTTP ${response.status}`);
    try { return await response.json(); } catch { throw new Error(`世界对话 ${url.pathname}：JSON 无效`); }
  }
  const ready = (async () => {
    manifest = await fetchJson(manifestUrl);
    if (manifest?.schemaVersion !== 1 || !manifest.dialogues || typeof manifest.dialogues !== "object" || Array.isArray(manifest.dialogues)) throw new Error("世界对话清单格式无效");
    const loaded = {}, paths = new Set();
    for (const [id, file] of Object.entries(manifest.dialogues)) {
      if (typeof file !== "string" || !file || paths.has(file)) throw new Error(`世界对话 ${id} 文件路径无效或重复`);
      paths.add(file);
      const script = await fetchJson(new URL(file, manifestUrl));
      if (script.id !== id || script.kind !== "world") throw new Error(`${file}：ID 或 kind 与世界对话清单不一致`);
      const checked = global.NPCDialogueRuntime.validateDialogue(script);
      if (checked.errors.length) throw new Error(`${file}：${checked.errors.join("；")}`);
      loaded[id] = global.NPCDialogueRuntime.deepFreeze(script);
    }
    registry = Object.freeze(loaded);
    return registry;
  })();
  ready.catch((error) => console.error(error));
  global.WorldDialogueData = Object.freeze({ ready, get: (id) => Object.hasOwn(registry, id) ? registry[id] : null, getAll: () => registry, getManifest: () => manifest });
})(window);
