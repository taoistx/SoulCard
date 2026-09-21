"use strict";

// A playtest uses a per-tab draft. It never replaces the default map file.
if (new URLSearchParams(window.location.search).get("mapPreview") === "1") {
  try {
    const saved = JSON.parse(sessionStorage.getItem("dungeon-map-playtest"));
    if (saved?.bundle && saved.previewKind === "legacy-map-editor") {
      window.IS_MAP_PREVIEW = true;
      window.WORLD_MAP_BUNDLE = saved.bundle;
    } else {
      console.warn("忽略缺失或过期的地图试玩缓存，改用项目根目录 world-map.js。");
    }
  } catch (error) {
    console.warn("地图试玩缓存读取失败，改用项目根目录 world-map.js。", error);
  }
}
