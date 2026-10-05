"use strict";

// 由 node-editor 导出。坐标原点位于地图左下角，X 向右、Y 向上。
window.WORLD_MAP_BUNDLE = {
  "schemaVersion": 3,
  "map": {
    "meta": {
      "eyebrow": "粪坑位面 · 外围",
      "title": "逆流山脚"
    },
    "startNodeId": "start",
    "nodes": [
      {
        "id": "start",
        "icon": "✦",
        "label": "坠落处",
        "x": 50,
        "y": 46,
        "description": "你从瓷白裂口里爬起来。这里没有路，只有会逐渐显形的选择。",
        "eventSetId": "startArrival"
      },
      {
        "id": "eddie",
        "icon": "♜",
        "label": "渔夫 艾迪",
        "x": 114,
        "y": 162,
        "eventSetId": "eddieMeeting"
      },
      {
        "id": "siltWoods",
        "icon": "?",
        "label": "???",
        "x": 754,
        "y": 1060,
        "eventSetId": "siltWoodsDiscovery"
      },
      {
        "id": "drownedHuts",
        "icon": "?",
        "label": "上山的路",
        "x": 522,
        "y": 233,
        "eventSetId": "drownedHutsDiscovery"
      },
      {
        "id": "bellRoad",
        "icon": "?",
        "label": "???",
        "x": 1096,
        "y": 243,
        "eventSetId": "bellRoadDiscovery"
      },
      {
        "id": "chris",
        "icon": "♛",
        "label": "失眠者 克里斯",
        "x": 1529,
        "y": 660,
        "eventSetId": "chrisMeeting"
      },
      {
        "id": "hut",
        "icon": "⌂",
        "label": "废弃小屋",
        "x": 810,
        "y": 1196,
        "eventSetId": "hutSearch"
      },
      {
        "id": "bell",
        "icon": "☠",
        "label": "丧钟",
        "x": 1420,
        "y": 252,
        "eventSetId": "bellMeeting"
      },
      {
        "id": "node2",
        "icon": "?",
        "label": "山道粪怪",
        "x": 713,
        "y": 360,
        "eventSetId": "dungAEncounter"
      },
      {
        "id": "node3",
        "icon": "?",
        "label": "弦一螂",
        "x": 1048,
        "y": 649,
        "eventSetId": "node3Discovery"
      },
      {
        "id": "node",
        "label": "腐叶原野 路口",
        "icon": "?",
        "x": 352,
        "y": 292,
        "eventSetId": "thomasEncounter"
      },
      {
        "id": "node4",
        "label": "一截还活着的手",
        "icon": "?",
        "x": 306,
        "y": 75,
        "eventSetId": "livingHandEncounter"
      },
      {
        "id": "node4Copy",
        "label": "会呼吸的尸堆",
        "icon": "?",
        "x": 522,
        "y": 75,
        "eventSetId": "breathingCorpsesEncounter"
      },
      {
        "id": "node4CopyCopy",
        "label": "泥滩",
        "icon": "?",
        "x": 1024,
        "y": 78,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node2Copy",
        "icon": "?",
        "label": "原野粪怪",
        "x": 712,
        "y": 500,
        "eventSetId": "dungBEncounter"
      },
      {
        "id": "node2Copy2",
        "icon": "?",
        "label": "腐叶原野",
        "x": 806,
        "y": 652,
        "eventSetId": "eventSet"
      },
      {
        "id": "node5",
        "label": "安全区域",
        "icon": "?",
        "x": 796,
        "y": 251,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node6",
        "label": "争夺尸体",
        "icon": "?",
        "x": 252,
        "y": 465,
        "eventSetId": "corpseDisputeEncounter"
      },
      {
        "id": "node7",
        "label": "荒野",
        "icon": "?",
        "x": 535,
        "y": 435,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node7Copy",
        "label": "荒野 副本",
        "icon": "?",
        "x": 183,
        "y": 576,
        "eventSetId": "eventSet"
      },
      {
        "id": "node7Copy2",
        "label": "荒野 副本",
        "icon": "?",
        "x": 181,
        "y": 718,
        "eventSetId": "eventSet"
      },
      {
        "id": "node7Copy3",
        "label": "荒野",
        "icon": "?",
        "x": 113,
        "y": 867,
        "eventSetId": "eventSet"
      },
      {
        "id": "node8",
        "label": "半截坠落者",
        "icon": "?",
        "x": 242,
        "y": 856,
        "eventSetId": "fallenSurvivorEncounter"
      },
      {
        "id": "node8Copy",
        "label": "杂物屏障",
        "icon": "?",
        "x": 522,
        "y": 854,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node9",
        "label": "领地入口",
        "icon": "?",
        "x": 387,
        "y": 856,
        "eventSetId": "startArrival"
      },
      {
        "id": "node10",
        "label": "安全区域",
        "icon": "?",
        "x": 367,
        "y": 596,
        "eventSetId": "startArrival"
      },
      {
        "id": "node7CopyCopy",
        "label": "荒野",
        "icon": "?",
        "x": 537,
        "y": 549,
        "eventSetId": "eventSet"
      },
      {
        "id": "node7CopyCopy2",
        "label": "荒野",
        "icon": "?",
        "x": 610,
        "y": 666,
        "eventSetId": "eventSet"
      },
      {
        "id": "node7CopyCopy3",
        "label": "荒芜居所",
        "icon": "?",
        "x": 532,
        "y": 750,
        "eventSetId": "eventSet"
      },
      {
        "id": "node8CopyCopy",
        "label": "杂物屏障",
        "icon": "?",
        "x": 632,
        "y": 1066,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node11",
        "label": "皇帝领地",
        "icon": "?",
        "x": 381,
        "y": 1088,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node11Copy",
        "label": "囚禁区",
        "icon": "?",
        "x": 523,
        "y": 1001,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node11CopyCopy",
        "label": "营地棚屋",
        "icon": "?",
        "x": 249,
        "y": 998,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node11CopyCopyCopy",
        "label": "营地棚屋",
        "icon": "?",
        "x": 380,
        "y": 1261,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node11CopyCopyCopyCopy",
        "label": "管道入口",
        "icon": "?",
        "x": 580,
        "y": 1335,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node11CopyCopy2",
        "label": "物资库",
        "icon": "?",
        "x": 527,
        "y": 1154,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node11Copy2",
        "label": "肢解区",
        "icon": "?",
        "x": 243,
        "y": 1176,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node8Copy2",
        "label": "杂物屏障",
        "icon": "?",
        "x": 113,
        "y": 1052,
        "eventSetId": "quietClearing"
      },
      {
        "id": "node2Copy2Copy",
        "icon": "?",
        "label": "腐叶原野",
        "x": 757,
        "y": 850,
        "eventSetId": "eventSet"
      },
      {
        "id": "node12",
        "label": "菌雾里的金属声",
        "icon": "?",
        "x": 1054,
        "y": 433,
        "eventSetId": "metalInMistEncounter"
      },
      {
        "id": "fallenDragTrail",
        "label": "拖行痕迹",
        "x": 306,
        "y": 980,
        "revealFlag": "revealedDragTrail",
        "icon": "?",
        "eventSetId": "fallenDragTrailDiscovery"
      },
      {
        "id": "corpseHiddenPath",
        "label": "隐蔽小径",
        "x": 640,
        "y": 145,
        "revealFlag": "revealedCorpseHiddenPath",
        "icon": "?",
        "eventSetId": "corpseHiddenPathDiscovery"
      },
      {
        "id": "metalSoundSource",
        "label": "金属声源",
        "x": 1210,
        "y": 465,
        "revealFlag": "revealedMetalSource",
        "icon": "?",
        "eventSetId": "metalSoundSourceDiscovery"
      }
    ],
    "edges": [
      {
        "from": "start",
        "to": "eddie"
      },
      {
        "from": "bellRoad",
        "to": "bell"
      },
      {
        "from": "siltWoods",
        "to": "hut"
      },
      {
        "from": "drownedHuts",
        "to": "node2"
      },
      {
        "from": "eddie",
        "to": "node"
      },
      {
        "from": "node",
        "to": "drownedHuts"
      },
      {
        "from": "eddie",
        "to": "node4"
      },
      {
        "from": "node4",
        "to": "node4Copy"
      },
      {
        "from": "node4Copy",
        "to": "node4CopyCopy"
      },
      {
        "from": "node4Copy",
        "to": "drownedHuts"
      },
      {
        "from": "node4CopyCopy",
        "to": "bellRoad"
      },
      {
        "from": "node2",
        "to": "node2Copy"
      },
      {
        "from": "node2Copy",
        "to": "node2Copy2"
      },
      {
        "from": "node2Copy2",
        "to": "node3"
      },
      {
        "from": "node3",
        "to": "node5"
      },
      {
        "from": "node5",
        "to": "drownedHuts"
      },
      {
        "from": "node",
        "to": "node6"
      },
      {
        "from": "node",
        "to": "node7"
      },
      {
        "from": "node6",
        "to": "node7Copy"
      },
      {
        "from": "node7Copy",
        "to": "node7Copy2"
      },
      {
        "from": "node7Copy2",
        "to": "node7Copy3"
      },
      {
        "from": "node7Copy3",
        "to": "node8"
      },
      {
        "from": "node8",
        "to": "node9"
      },
      {
        "from": "node8Copy",
        "to": "node9"
      },
      {
        "from": "node9",
        "to": "node10"
      },
      {
        "from": "node10",
        "to": "node"
      },
      {
        "from": "node7",
        "to": "node7CopyCopy"
      },
      {
        "from": "node7CopyCopy",
        "to": "node7CopyCopy2"
      },
      {
        "from": "node7CopyCopy2",
        "to": "node7CopyCopy3"
      },
      {
        "from": "node10",
        "to": "node7CopyCopy3"
      },
      {
        "from": "node7CopyCopy3",
        "to": "node8Copy"
      },
      {
        "from": "node2Copy",
        "to": "node7CopyCopy"
      },
      {
        "from": "node9",
        "to": "node11"
      },
      {
        "from": "node8Copy",
        "to": "node11Copy"
      },
      {
        "from": "node8CopyCopy",
        "to": "node11CopyCopy2"
      },
      {
        "from": "node11",
        "to": "node11CopyCopy2"
      },
      {
        "from": "node11",
        "to": "node11Copy"
      },
      {
        "from": "node11",
        "to": "node11CopyCopy"
      },
      {
        "from": "node11",
        "to": "node11Copy2"
      },
      {
        "from": "node11",
        "to": "node11CopyCopyCopy"
      },
      {
        "from": "node11",
        "to": "node11CopyCopyCopyCopy"
      },
      {
        "from": "node8Copy2",
        "to": "node11Copy2"
      },
      {
        "from": "node8Copy2",
        "to": "node11CopyCopy"
      },
      {
        "from": "node7Copy3",
        "to": "node8Copy2"
      },
      {
        "from": "siltWoods",
        "to": "node8CopyCopy"
      },
      {
        "from": "node2Copy2",
        "to": "node2Copy2Copy"
      },
      {
        "from": "node2Copy2Copy",
        "to": "siltWoods"
      },
      {
        "from": "bellRoad",
        "to": "node12"
      },
      {
        "from": "node12",
        "to": "node3"
      },
      {
        "from": "node8",
        "to": "fallenDragTrail"
      },
      {
        "from": "node4Copy",
        "to": "corpseHiddenPath"
      },
      {
        "from": "node12",
        "to": "metalSoundSource"
      }
    ]
  }
};
