"use strict";

// A playtest uses a per-tab draft. It never replaces the default map file.
if (new URLSearchParams(window.location.search).get("mapPreview") === "1") {
  window.IS_MAP_PREVIEW = true;
  try {
    const saved = JSON.parse(sessionStorage.getItem("dungeon-map-playtest"));
    if (!saved?.bundle) throw new Error("没有找到试玩草稿，请返回编辑器重新开始试玩。");
    window.WORLD_MAP_BUNDLE = saved.bundle;
  } catch (error) {
    window.MAP_PREVIEW_ERROR = error.message;
  }
}
