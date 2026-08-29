"use strict";

// 这是地图编辑器和 World 层共同读取的唯一地图数据入口。
// 对象定义只描述地图上的外观；交互行为仍由 world.js 按稳定 id 登记。
window.WORLD_MAP_BUNDLE = {
  "schemaVersion": 1,
  "objectDefinitions": {
    "eddie": { "type": "npc", "icon": "♜", "label": "渔夫 艾迪" },
    "chris": { "type": "npc", "icon": "♛", "label": "失眠者 克里斯" },
    "bell": { "type": "enemy", "icon": "☠", "label": "丧钟" },
    "hut": { "type": "poi", "icon": "⌂", "label": "废弃小屋" },
    "gate": { "type": "poi", "icon": "╫", "label": "封锁山道" },
    "dungA": { "type": "enemy", "icon": "●", "label": "粪怪" },
    "dungB": { "type": "enemy", "icon": "●", "label": "粪怪" },
    "church": { "type": "poi", "icon": "♰", "label": "逆抽水器" }
  },
  "map": {
    "meta": {
      "eyebrow": "粪坑位面 · 外围",
      "title": "逆流山脚"
    },
    "grid": [
      "#######################",
      "###############rrrrr###",
      "###############rrrrr###",
      "###############rrrrr###",
      "#################.#####",
      "###############rrrrr###",
      "###############rrrrr###",
      "###########.....rrrr###",
      "###########.###########",
      "#rrrr###rrrr###########",
      "#rrrr###rrrr###########",
      "#rrrrr.rrrrr.rrrrrrrrr#",
      "#rrrrr.rrrrr.rrrrrrrrr#",
      "#rrrrr.rrrrr.rrrrrrrrr#",
      "#######################"
    ],
    "playerStart": { "col": 2, "row": 13 },
    "objects": [
      { "id": "eddie", "col": 2, "row": 12 },
      { "id": "chris", "col": 8, "row": 12 },
      { "id": "bell", "col": 14, "row": 12 },
      { "id": "hut", "col": 2, "row": 10 },
      { "id": "gate", "col": 14, "row": 7 },
      { "id": "dungA", "col": 16, "row": 6 },
      { "id": "dungB", "col": 18, "row": 5 },
      { "id": "church", "col": 17, "row": 2 }
    ]
  }
};
