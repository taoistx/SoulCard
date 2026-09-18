"use strict";

// Point Crawl 地图数据。节点与连线只描述世界布局；具体交互仍由 world.js 按稳定 id 登记。
window.WORLD_MAP_BUNDLE = {
  "schemaVersion": 2,
  "map": {
    "meta": {
      "eyebrow": "粪坑位面 · 外围",
      "title": "逆流山脚"
    },
    "viewBox": { "width": 1000, "height": 680 },
    "startNodeId": "start",
    "initialRevealed": ["start", "eddie"],
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "icon": "✦",
        "label": "坠落处",
        "x": 120,
        "y": 350,
        "description": "你从瓷白裂口里爬起来。这里没有路，只有会逐渐显形的选择。"
      },
      {
        "id": "eddie",
        "type": "npc",
        "icon": "♜",
        "label": "渔夫 艾迪",
        "x": 270,
        "y": 350,
        "npcId": "eddie"
      },
      {
        "id": "siltWoods",
        "type": "wilderness",
        "icon": "?",
        "label": "???",
        "x": 430,
        "y": 185,
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "eddieMet", "operator": "eq", "value": true }] },
        "exploreTitle": "污泥林",
        "exploreText": "你拨开像湿发一样缠绕的草根，发现一条仍有人类足迹的窄路。",
        "exploreFlag": "exploredSiltWoods"
      },
      {
        "id": "drownedHuts",
        "type": "wilderness",
        "icon": "?",
        "label": "???",
        "x": 450,
        "y": 350,
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "eddieMet", "operator": "eq", "value": true }] },
        "exploreTitle": "沉屋滩",
        "exploreText": "几间半沉的小屋在粪水里吱呀作响，门缝里露出还没烂尽的家具。",
        "exploreFlag": "exploredDrownedHuts"
      },
      {
        "id": "bellRoad",
        "type": "wilderness",
        "icon": "?",
        "label": "???",
        "x": 430,
        "y": 515,
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "eddieMet", "operator": "eq", "value": true }] },
        "exploreTitle": "碎钟坡",
        "exploreText": "越往坡上走，空气里的钟声越像骨头互相敲击。远处站着一个无头的人影。",
        "exploreFlag": "exploredBellRoad"
      },
      {
        "id": "chris",
        "type": "npc",
        "icon": "♛",
        "label": "失眠者 克里斯",
        "x": 615,
        "y": 185,
        "npcId": "chris",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "exploredSiltWoods", "operator": "eq", "value": true }] }
      },
      {
        "id": "hut",
        "type": "poi",
        "icon": "⌂",
        "label": "废弃小屋",
        "x": 640,
        "y": 350,
        "locationId": "hut",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "exploredDrownedHuts", "operator": "eq", "value": true }] }
      },
      {
        "id": "bell",
        "type": "npc",
        "icon": "☠",
        "label": "丧钟",
        "x": 615,
        "y": 515,
        "npcId": "bell",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "exploredBellRoad", "operator": "eq", "value": true }] }
      },
      {
        "id": "gate",
        "type": "poi",
        "icon": "╫",
        "label": "封锁山道",
        "x": 780,
        "y": 350,
        "locationId": "gate",
        "revealWhen": {
          "mode": "any",
          "clauses": [
            { "source": "flag", "key": "exploredSiltWoods", "operator": "eq", "value": true },
            { "source": "flag", "key": "exploredDrownedHuts", "operator": "eq", "value": true },
            { "source": "flag", "key": "exploredBellRoad", "operator": "eq", "value": true }
          ]
        }
      },
      {
        "id": "dungA",
        "type": "enemy",
        "icon": "●",
        "label": "粪怪",
        "x": 845,
        "y": 230,
        "enemyId": "dungling",
        "battleSourceId": "dungA",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "bridgeOpened", "operator": "eq", "value": true }] }
      },
      {
        "id": "dungB",
        "type": "enemy",
        "icon": "●",
        "label": "粪怪",
        "x": 910,
        "y": 165,
        "enemyId": "dungling",
        "battleSourceId": "dungB",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "dungAKilled", "operator": "eq", "value": true }] }
      },
      {
        "id": "church",
        "type": "poi",
        "icon": "♰",
        "label": "逆抽水器",
        "x": 910,
        "y": 350,
        "locationId": "church",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "dungBKilled", "operator": "eq", "value": true }] }
      }
    ],
    "edges": [
      { "from": "start", "to": "eddie" },
      {
        "from": "eddie",
        "to": "siltWoods",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "eddieMet", "operator": "eq", "value": true }] }
      },
      {
        "from": "eddie",
        "to": "drownedHuts",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "eddieMet", "operator": "eq", "value": true }] }
      },
      {
        "from": "eddie",
        "to": "bellRoad",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "eddieMet", "operator": "eq", "value": true }] }
      },
      {
        "from": "siltWoods",
        "to": "chris",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "exploredSiltWoods", "operator": "eq", "value": true }] }
      },
      {
        "from": "drownedHuts",
        "to": "hut",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "exploredDrownedHuts", "operator": "eq", "value": true }] }
      },
      {
        "from": "bellRoad",
        "to": "bell",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "exploredBellRoad", "operator": "eq", "value": true }] }
      },
      {
        "from": "chris",
        "to": "gate",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "exploredSiltWoods", "operator": "eq", "value": true }] }
      },
      {
        "from": "hut",
        "to": "gate",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "exploredDrownedHuts", "operator": "eq", "value": true }] }
      },
      {
        "from": "bell",
        "to": "gate",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "exploredBellRoad", "operator": "eq", "value": true }] }
      },
      {
        "from": "gate",
        "to": "dungA",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "bridgeOpened", "operator": "eq", "value": true }] },
        "activeWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "bridgeOpened", "operator": "eq", "value": true }] }
      },
      {
        "from": "dungA",
        "to": "dungB",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "dungAKilled", "operator": "eq", "value": true }] }
      },
      {
        "from": "dungB",
        "to": "church",
        "revealWhen": { "mode": "all", "clauses": [{ "source": "flag", "key": "dungBKilled", "operator": "eq", "value": true }] }
      }
    ]
  }
};
