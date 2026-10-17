"use strict";

// 地图与事件编辑器共享的数据。
window.WORLD_EVENT_SET_BUNDLE = {
  "schemaVersion": 1,
  "eventSets": {
    "thomasEncounter": {
      "name": "托马斯与粪怪",
      "entries": [
        {
          "id": "thomas",
          "kind": "action",
          "actionEventId": "thomasCrossroads",
          "weight": 1
        }
      ]
    },
    "startArrival": {
      "name": "坠落处",
      "entries": [
        {
          "id": "start",
          "kind": "dialogue",
          "dialogueId": "start",
          "weight": 1
        }
      ]
    },
    "eddieMeeting": {
      "name": "渔夫艾迪",
      "entries": [
        {
          "id": "eddie",
          "kind": "npc",
          "npcId": "eddie",
          "weight": 1
        }
      ]
    },
    "siltWoodsDiscovery": {
      "name": "污泥林探索",
      "entries": [
        {
          "id": "siltWoods",
          "kind": "dialogue",
          "dialogueId": "siltWoods",
          "weight": 1
        }
      ]
    },
    "drownedHutsDiscovery": {
      "name": "腐叶原野探索",
      "entries": [
        {
          "id": "drownedHuts",
          "kind": "dialogue",
          "dialogueId": "drownedHuts",
          "weight": 1
        }
      ]
    },
    "bellRoadDiscovery": {
      "name": "碎钟坡探索",
      "entries": [
        {
          "id": "bellRoad",
          "kind": "dialogue",
          "dialogueId": "bellRoad",
          "weight": 1
        }
      ]
    },
    "chrisMeeting": {
      "name": "失眠者克里斯",
      "entries": [
        {
          "id": "chris",
          "kind": "npc",
          "npcId": "chris",
          "weight": 1
        }
      ]
    },
    "hutSearch": {
      "name": "废弃小屋",
      "entries": [
        {
          "id": "hut",
          "kind": "dialogue",
          "dialogueId": "hut",
          "weight": 1
        }
      ]
    },
    "bellMeeting": {
      "name": "丧钟",
      "entries": [
        {
          "id": "bell",
          "kind": "npc",
          "npcId": "bell",
          "weight": 1
        }
      ]
    },
    "gateEncounter": {
      "name": "封锁山道",
      "entries": [
        {
          "id": "gate",
          "kind": "dialogue",
          "dialogueId": "gate",
          "weight": 1
        }
      ]
    },
    "dungAEncounter": {
      "name": "山道粪怪",
      "entries": [
        {
          "id": "dungA",
          "kind": "battle",
          "enemyId": "dung_swarm",
          "battleSourceId": "dungA",
          "weight": 1
        }
      ]
    },
    "dungBEncounter": {
      "name": "原野粪怪",
      "entries": [
        {
          "id": "dungB",
          "kind": "battle",
          "enemyId": "dungling",
          "battleSourceId": "dungB",
          "weight": 1
        }
      ]
    },
    "churchExit": {
      "name": "逆抽水器",
      "entries": [
        {
          "id": "church",
          "kind": "dialogue",
          "dialogueId": "church",
          "weight": 1
        }
      ]
    },
    "quietClearing": {
      "name": "空地",
      "entries": [
        {
          "id": "quiet",
          "kind": "dialogue",
          "dialogueId": "quietClearing",
          "weight": 1
        }
      ]
    },
    "node2Discovery": {
      "name": "腐叶原野深处",
      "entries": [
        {
          "id": "node2",
          "kind": "dialogue",
          "dialogueId": "node2",
          "weight": 1
        }
      ]
    },
    "node3Discovery": {
      "name": "弦一螂",
      "entries": [
        {
          "id": "node3",
          "kind": "dialogue",
          "dialogueId": "node3",
          "weight": 1
        }
      ]
    },
    "eventSet": {
      "name": "荒野",
      "entries": [
        {
          "id": "dialogue",
          "kind": "dialogue",
          "dialogueId": "siltWoods",
          "weight": 1
        },
        {
          "id": "battle",
          "kind": "battle",
          "weight": 1,
          "enemyId": "eddie"
        }
      ]
    },
    "fallenSurvivorEncounter": {
      "name": "半截坠落者",
      "entries": [
        {
          "id": "fallenSurvivor",
          "kind": "action",
          "actionEventId": "fallenSurvivor",
          "weight": 1
        }
      ]
    },
    "breathingCorpsesEncounter": {
      "name": "会呼吸的尸堆",
      "entries": [
        {
          "id": "breathingCorpses",
          "kind": "action",
          "actionEventId": "breathingCorpses",
          "weight": 1
        }
      ]
    },
    "metalInMistEncounter": {
      "name": "菌雾里的金属声",
      "entries": [
        {
          "id": "metalInMist",
          "kind": "action",
          "actionEventId": "metalInMist",
          "weight": 1
        }
      ]
    },
    "corpseDisputeEncounter": {
      "name": "争夺尸体",
      "entries": [
        {
          "id": "corpseDispute",
          "kind": "action",
          "actionEventId": "corpseDispute",
          "weight": 1
        }
      ]
    },
    "livingHandEncounter": {
      "name": "一截还活着的手",
      "entries": [
        {
          "id": "livingHand",
          "kind": "action",
          "actionEventId": "livingHand",
          "weight": 1
        }
      ]
    },
    "fallenDragTrailDiscovery": {
      "name": "拖行痕迹",
      "entries": [
        {
          "id": "fallenDragTrail",
          "kind": "dialogue",
          "dialogueId": "fallenDragTrail",
          "weight": 1
        }
      ]
    },
    "corpseHiddenPathDiscovery": {
      "name": "隐蔽小径",
      "entries": [
        {
          "id": "corpseHiddenPath",
          "kind": "dialogue",
          "dialogueId": "corpseHiddenPath",
          "weight": 1
        }
      ]
    },
    "metalSoundSourceDiscovery": {
      "name": "金属声源",
      "entries": [
        {
          "id": "metalSoundSource",
          "kind": "dialogue",
          "dialogueId": "metalSoundSource",
          "weight": 1
        }
      ]
    },
    "v06_start": {
      "name": "坠落浅滩",
      "entries": [
        {
          "id": "site",
          "kind": "dialogue",
          "dialogueId": "site_start",
          "weight": 1
        }
      ]
    },
    "v06_eddie": {
      "name": "岸台营地",
      "entries": [
        {
          "id": "site",
          "kind": "dialogue",
          "dialogueId": "site_eddie",
          "weight": 1
        }
      ]
    },
    "v06_node": {
      "name": "断堤路口",
      "entries": [
        {
          "id": "site",
          "kind": "dialogue",
          "dialogueId": "site_node",
          "weight": 1
        }
      ]
    },
    "v06_node3": {
      "name": "铁壁避风凹",
      "entries": [
        {
          "id": "site",
          "kind": "dialogue",
          "dialogueId": "site_node3",
          "weight": 1
        }
      ]
    },
    "v06_slice_mudbank": {
      "name": "漂积湾",
      "entries": [
        {
          "id": "site",
          "kind": "dialogue",
          "dialogueId": "site_slice_mudbank",
          "weight": 1
        }
      ]
    },
    "v06_slice_emperor_yard": {
      "name": "收肉棚",
      "entries": [
        {
          "id": "site",
          "kind": "dialogue",
          "dialogueId": "site_slice_emperor_yard",
          "weight": 1
        }
      ]
    },
    "v06_slice_fungus_edge": {
      "name": "菌壳斜坡",
      "entries": [
        {
          "id": "site",
          "kind": "dialogue",
          "dialogueId": "site_slice_fungus_edge",
          "weight": 1
        }
      ]
    },
    "v06_slice_climbcourt": {
      "name": "落壳狭道",
      "entries": [
        {
          "id": "site",
          "kind": "dialogue",
          "dialogueId": "site_slice_climbcourt",
          "weight": 1
        }
      ]
    },
    "v06_slice_pipe_seam": {
      "name": "半埋检修槽",
      "entries": [
        {
          "id": "site",
          "kind": "dialogue",
          "dialogueId": "site_slice_pipe_seam",
          "weight": 1
        }
      ]
    },
    "v06_slice_drybench": {
      "name": "山腰检修台",
      "entries": [
        {
          "id": "site",
          "kind": "dialogue",
          "dialogueId": "site_slice_drybench",
          "weight": 1
        }
      ]
    },
    "v06_slice_church_approach": {
      "name": "登堂石阶",
      "entries": [
        {
          "id": "site",
          "kind": "dialogue",
          "dialogueId": "site_slice_church_approach",
          "weight": 1
        }
      ]
    },
    "v06_slice_church_nave": {
      "name": "教堂门廊",
      "entries": [
        {
          "id": "site",
          "kind": "dialogue",
          "dialogueId": "site_slice_church_nave",
          "weight": 1
        }
      ]
    }
  }
};
