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
        "x": 56,
        "y": 522,
        "npcId": "eddie"
      },
      {
        "id": "siltWoods",
        "type": "wilderness",
        "icon": "?",
        "label": "???",
        "x": 337,
        "y": 336,
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
        "x": 417,
        "y": 445,
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
        "x": 443,
        "y": 598,
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
        "x": 666,
        "y": 89,
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
        "x": 496,
        "y": 266,
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
        "x": 937,
        "y": 628,
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
        "x": 901,
        "y": 216,
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
        "x": 879,
        "y": 110,
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
        "x": 748,
        "y": 427,
        "enemyId": "dungling",
        "battleSourceId": "dungB",
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
        "id": "church",
        "type": "poi",
        "icon": "♰",
        "label": "逆抽水器",
        "x": 924,
        "y": 46,
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
        "x": 141,
        "y": 119,
        "description": "",
        "locationId": "hut"
      },
      {
        "id": "node2",
        "type": "wilderness",
        "icon": "?",
        "label": "腐叶原野",
        "x": 622,
        "y": 435,
        "description": "",
        "revealWhen": {
          "mode": "all",
          "clauses": []
        }
      },
      {
        "id": "node3",
        "type": "wilderness",
        "icon": "?",
        "label": "弦一螂",
        "x": 844,
        "y": 320,
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
          "x": 50,
          "y": 634
        },
        "eddie": {
          "x": 56,
          "y": 522
        },
        "siltWoods": {
          "x": 337,
          "y": 336
        },
        "drownedHuts": {
          "x": 417,
          "y": 445
        },
        "bellRoad": {
          "x": 443,
          "y": 598
        },
        "chris": {
          "x": 666,
          "y": 89
        },
        "hut": {
          "x": 496,
          "y": 266
        },
        "bell": {
          "x": 937,
          "y": 628
        },
        "gate": {
          "x": 901,
          "y": 216
        },
        "dungA": {
          "x": 879,
          "y": 110
        },
        "dungB": {
          "x": 748,
          "y": 427
        },
        "church": {
          "x": 924,
          "y": 46
        },
        "node": {
          "x": 141,
          "y": 119
        },
        "node2": {
          "x": 622,
          "y": 435
        },
        "node3": {
          "x": 844,
          "y": 320
        }
      }
    }
  }
};
