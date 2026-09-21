"use strict";

// 由 node-editor 导出。节点与连线描述 World Point Crawl 布局。
window.WORLD_MAP_BUNDLE = {
  "schemaVersion": 2,
  "map": {
    "meta": {
      "eyebrow": "粪坑位面 · 外围",
      "title": "逆流山脚"
    },
    "viewBox": {
      "width": 1000,
      "height": 680
    },
    "startNodeId": "start",
    "initialRevealed": [
      "start",
      "eddie"
    ],
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "icon": "✦",
        "label": "坠落处",
        "x": 50,
        "y": 634,
        "description": "你从瓷白裂口里爬起来。这里没有路，只有会逐渐显形的选择。"
      },
      {
        "id": "eddie",
        "type": "npc",
        "icon": "♜",
        "label": "渔夫 艾迪",
        "x": 46,
        "y": 634,
        "npcId": "eddie"
      },
      {
        "id": "siltWoods",
        "type": "wilderness",
        "icon": "?",
        "label": "???",
        "x": 578,
        "y": 487,
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "eddieMet",
              "operator": "eq",
              "value": true
            }
          ]
        },
        "exploreTitle": "污泥林",
        "exploreText": "你拨开像湿发一样缠绕的草根，发现一条仍有人类足迹的窄路。",
        "exploreFlag": "exploredSiltWoods"
      },
      {
        "id": "drownedHuts",
        "type": "wilderness",
        "icon": "?",
        "label": "腐叶原野",
        "x": 526,
        "y": 634,
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "eddieMet",
              "operator": "eq",
              "value": true
            }
          ]
        },
        "exploreTitle": "腐叶原野",
        "exploreText": "几间半沉的小屋在粪水里吱呀作响，门缝里露出还没烂尽的家具。",
        "exploreFlag": "exploredDrownedHuts"
      },
      {
        "id": "bellRoad",
        "type": "wilderness",
        "icon": "?",
        "label": "???",
        "x": 806,
        "y": 634,
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "eddieMet",
              "operator": "eq",
              "value": true
            }
          ]
        },
        "exploreTitle": "碎钟坡",
        "exploreText": "越往坡上走，空气里的钟声越像骨头互相敲击。远处站着一个无头的人影。",
        "exploreFlag": "exploredBellRoad"
      },
      {
        "id": "chris",
        "type": "npc",
        "icon": "♛",
        "label": "失眠者 克里斯",
        "x": 706,
        "y": 157,
        "npcId": "chris",
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "exploredSiltWoods",
              "operator": "eq",
              "value": true
            }
          ]
        }
      },
      {
        "id": "hut",
        "type": "poi",
        "icon": "⌂",
        "label": "废弃小屋",
        "x": 808,
        "y": 634,
        "locationId": "hut",
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "exploredDrownedHuts",
              "operator": "eq",
              "value": true
            }
          ]
        }
      },
      {
        "id": "bell",
        "type": "npc",
        "icon": "☠",
        "label": "丧钟",
        "x": 954,
        "y": 634,
        "npcId": "bell",
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "exploredBellRoad",
              "operator": "eq",
              "value": true
            }
          ]
        }
      },
      {
        "id": "gate",
        "type": "poi",
        "icon": "╫",
        "label": "封锁山道",
        "x": 954,
        "y": 438,
        "locationId": "gate",
        "revealWhen": {
          "mode": "any",
          "clauses": [
            {
              "source": "flag",
              "key": "exploredSiltWoods",
              "operator": "eq",
              "value": true
            },
            {
              "source": "flag",
              "key": "exploredDrownedHuts",
              "operator": "eq",
              "value": true
            },
            {
              "source": "flag",
              "key": "exploredBellRoad",
              "operator": "eq",
              "value": true
            }
          ]
        }
      },
      {
        "id": "dungA",
        "type": "enemy",
        "icon": "●",
        "label": "粪怪",
        "x": 954,
        "y": 328,
        "enemyId": "dungling",
        "battleSourceId": "dungA",
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "bridgeOpened",
              "operator": "eq",
              "value": true
            }
          ]
        }
      },
      {
        "id": "dungB",
        "type": "enemy",
        "icon": "●",
        "label": "粪怪",
        "x": 954,
        "y": 206,
        "enemyId": "dungling",
        "battleSourceId": "dungB",
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "dungAKilled",
              "operator": "eq",
              "value": true
            }
          ]
        }
      },
      {
        "id": "church",
        "type": "poi",
        "icon": "♰",
        "label": "逆抽水器",
        "x": 910,
        "y": 350,
        "locationId": "church",
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "dungBKilled",
              "operator": "eq",
              "value": true
            }
          ]
        }
      },
      {
        "id": "node",
        "type": "poi",
        "icon": "#",
        "label": "空地",
        "x": 206,
        "y": 285,
        "description": "",
        "locationId": "hut"
      },
      {
        "id": "node2",
        "type": "wilderness",
        "icon": "?",
        "label": "腐叶原野",
        "x": 696,
        "y": 634,
        "description": ""
      },
      {
        "id": "node3",
        "type": "wilderness",
        "icon": "?",
        "label": "弦一螂",
        "x": 954,
        "y": 533,
        "description": ""
      }
    ],
    "edges": [
      {
        "from": "start",
        "to": "eddie"
      },
      {
        "from": "eddie",
        "to": "siltWoods",
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "eddieMet",
              "operator": "eq",
              "value": true
            }
          ]
        }
      },
      {
        "from": "eddie",
        "to": "drownedHuts",
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "eddieMet",
              "operator": "eq",
              "value": true
            }
          ]
        }
      },
      {
        "from": "eddie",
        "to": "bellRoad",
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "eddieMet",
              "operator": "eq",
              "value": true
            }
          ]
        }
      },
      {
        "from": "bellRoad",
        "to": "bell",
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "exploredBellRoad",
              "operator": "eq",
              "value": true
            }
          ]
        }
      },
      {
        "from": "gate",
        "to": "dungA",
        "revealWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "bridgeOpened",
              "operator": "eq",
              "value": true
            }
          ]
        },
        "activeWhen": {
          "mode": "all",
          "clauses": [
            {
              "source": "flag",
              "key": "bridgeOpened",
              "operator": "eq",
              "value": true
            }
          ]
        }
      },
      {
        "from": "eddie",
        "to": "node"
      },
      {
        "from": "siltWoods",
        "to": "hut"
      },
      {
        "from": "hut",
        "to": "chris"
      },
      {
        "from": "drownedHuts",
        "to": "node2"
      },
      {
        "from": "node2",
        "to": "dungB"
      },
      {
        "from": "dungB",
        "to": "node3"
      },
      {
        "from": "node3",
        "to": "gate"
      }
    ],
    "editor": {
      "positions": {
        "start": {
          "x": 37,
          "y": 992
        },
        "eddie": {
          "x": 35,
          "y": 843
        },
        "siltWoods": {
          "x": 579,
          "y": 454
        },
        "drownedHuts": {
          "x": 526,
          "y": 712
        },
        "bellRoad": {
          "x": 806,
          "y": 957
        },
        "chris": {
          "x": 595,
          "y": 64
        },
        "hut": {
          "x": 594,
          "y": 271
        },
        "bell": {
          "x": 1361,
          "y": 955
        },
        "gate": {
          "x": 1355,
          "y": 222
        },
        "dungA": {
          "x": 1004,
          "y": 227
        },
        "dungB": {
          "x": 1060,
          "y": 582
        },
        "church": {
          "x": 1280,
          "y": 56
        },
        "node": {
          "x": 206,
          "y": 285
        },
        "node2": {
          "x": 789,
          "y": 651
        },
        "node3": {
          "x": 1266,
          "y": 413
        }
      }
    }
  }
};
