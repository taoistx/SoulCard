"use strict";

// 地图与事件编辑器共享的数据。
window.WORLD_MAP_BUNDLE = {
  "schemaVersion": 3,
  "map": {
    "meta": {
      "eyebrow": "沉积山 · 五日期限",
      "title": "沿沉积山抵达教堂"
    },
    "startNodeId": "start",
    "nodes": [
      {
        "id": "start",
        "icon": "◇",
        "label": "坠落浅滩",
        "x": 140,
        "y": 95,
        "description": "污水退到脚边，留下你和一柄锈剑。右上方的岸台有火光；更高处，一座尖顶建筑靠着巨大的铁壁。甲缝里的白絮随着呼吸轻轻颤动。",
        "eventSetId": "v06_start",
        "siteNpcIds": []
      },
      {
        "id": "eddie",
        "icon": "⌂",
        "label": "岸台营地",
        "x": 260,
        "y": 230,
        "eventSetId": "v06_eddie",
        "siteNpcIds": [
          "eddie",
          "thomas"
        ],
        "description": "硬泥台高出水面，几根短桩拴住打捞绳。艾迪把湿壳拖到脚边，挑出能用的东西。沿岸向左是漂满杂物的回水湾，右边的硬堤向山上爬去。"
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
        "x": 869,
        "y": 412,
        "eventSetId": "dungAEncounter"
      },
      {
        "id": "node3",
        "icon": "◇",
        "label": "铁壁避风凹",
        "x": 515,
        "y": 665,
        "eventSetId": "v06_node3",
        "siteNpcIds": [
          "genichiro"
        ],
        "description": "堤路贴上巨大的铁壁，一道凹缝挡住了坡下的湿气。上方硬壳逐渐变成黄白菌层；更高处的建筑仍露着尖顶。石面有擦刀的亮痕和反复系紧行囊留下的勒印。"
      },
      {
        "id": "node",
        "label": "断堤路口",
        "icon": "◇",
        "x": 420,
        "y": 390,
        "eventSetId": "v06_node",
        "siteNpcIds": [
          "thomas"
        ],
        "description": "岸路在这里爬上硬堤。左侧断口下是松泥，托马斯背贴着断边；一只粪怪正沿堤脊向她逼近。你站在仍完整的堤面上，侧下方的残骸坡能容它落脚。"
      },
      {
        "id": "node4",
        "label": "一截还活着的手",
        "icon": "?",
        "x": 573,
        "y": 64,
        "eventSetId": "livingHandEncounter"
      },
      {
        "id": "node4Copy",
        "label": "会呼吸的尸堆",
        "icon": "?",
        "x": 715,
        "y": 63,
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
        "x": 418,
        "y": 476,
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
        "x": 480,
        "y": 577,
        "eventSetId": "eventSet"
      },
      {
        "id": "node7CopyCopy2",
        "label": "荒野",
        "icon": "?",
        "x": 692,
        "y": 710,
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
      },
      {
        "id": "slice_mudbank",
        "label": "漂积湾",
        "icon": "◇",
        "x": 95,
        "y": 300,
        "eventSetId": "v06_slice_mudbank",
        "description": "岸线在这里弯进去，回水把漂流物推到同一片浅泥上。一具新近死去的坠落者卡在石边，甲缝还没有白丝；更远处的废壳下面，露出一片半透明的旧衬膜。来时的岸台就在右后方。",
        "siteNpcIds": []
      },
      {
        "id": "slice_salvage",
        "label": "废壳滩",
        "icon": "◇",
        "x": 460,
        "y": 96,
        "eventSetId": "quietClearing",
        "revealFlag": "salvageFound"
      },
      {
        "id": "slice_lowfork",
        "label": "山脚岔路",
        "icon": "◇",
        "x": 650,
        "y": 400,
        "eventSetId": "quietClearing"
      },
      {
        "id": "slice_winnie_stop",
        "label": "温妮歇脚处",
        "icon": "◇",
        "x": 550,
        "y": 680,
        "eventSetId": "quietClearing"
      },
      {
        "id": "slice_emperor_yard",
        "label": "收肉棚",
        "icon": "⌂",
        "x": 235,
        "y": 535,
        "eventSetId": "v06_slice_emperor_yard",
        "siteNpcIds": [
          "emperor",
          "mor",
          "winnie",
          "thomas"
        ],
        "description": "几根支架撑起低棚，搬肉的人从堤路进来，把废壳扔向棚外。小皇帝占着最干的一块地；莫尔盯着来往的人，温妮蹲在废料旁挑拣。棚后的脚印绕回铁壁下方。"
      },
      {
        "id": "slice_fungus_edge",
        "label": "菌壳斜坡",
        "icon": "◇",
        "x": 585,
        "y": 865,
        "eventSetId": "v06_slice_fungus_edge",
        "description": "硬堤到这里散成一层层湿壳。右手的铁壁上挂着黄白菌须，脚下每压碎一片壳，灰粉便从缝里腾起。上方的小路夹在铁壁和陡坡之间，几只伏低的身影正在拖拽残骸。靠墙处另有一道半埋的槽口，里面的刮痕斜着伸向高处。",
        "siteNpcIds": []
      },
      {
        "id": "slice_climbcourt",
        "label": "落壳狭道",
        "icon": "◇",
        "x": 445,
        "y": 1080,
        "eventSetId": "v06_slice_climbcourt",
        "description": "铁壁和陡坡把路挤成一条窄带。上方沟里滑下的碎壳停在路边，几只粪怪围住其中的残骸，时而撞上能落脚的石面。下侧有一片宽些的残骸坡；越过这里，就是伸出井壁的检修台。",
        "siteNpcIds": []
      },
      {
        "id": "slice_pipe_seam",
        "label": "半埋检修槽",
        "icon": "◇",
        "x": 790,
        "y": 1020,
        "eventSetId": "v06_slice_pipe_seam",
        "description": "槽口沿铁壁斜着上升，几片碎壳堵在最窄的一段。透过外侧裂缝，能看见狭道里的怪物；上端的日光落在同一座检修台底下。碎壳表面布满干粉，脚边留有一条可缓慢挪身的缝。",
        "siteNpcIds": [],
        "revealFlag": "pipeFound"
      },
      {
        "id": "slice_drybench",
        "label": "山腰检修台",
        "icon": "◇",
        "x": 615,
        "y": 1240,
        "eventSetId": "v06_slice_drybench",
        "siteNpcIds": [
          "hollan",
          "thomas",
          "genichiro"
        ],
        "description": "铆在井壁上的平台接住了两条来路：一边是狭道，另一边是检修槽的上口。脚下终于是完整的金属板，靠墙的旧工具匣里露出一角衬膜。前方石阶沿井壁继续升高，顶端就是教堂。"
      },
      {
        "id": "slice_church_approach",
        "label": "登堂石阶",
        "icon": "◇",
        "x": 730,
        "y": 1370,
        "eventSetId": "v06_slice_church_approach",
        "siteNpcIds": [
          "thomas",
          "genichiro"
        ],
        "description": "石阶嵌在井壁与教堂平台之间。松掉的扶手刚用新带子绑紧，台阶上的灰被扫到两侧，一道搬运擦痕一直延伸到上面的门廊。金属闷响从门后传来，间或夹着人声。"
      },
      {
        "id": "slice_church_nave",
        "label": "教堂门廊",
        "icon": "⌂",
        "x": 800,
        "y": 1510,
        "eventSetId": "v06_slice_church_nave",
        "description": "门缝里透出暖光。一路上听见的金属闷响，到这里终于分成了绞盘和铁链的声音。\n门被拉开一线。越过守门人的肩膀，你看见一架载着活人的吊笼缓缓沉入地板下。\n他看了看你身上的白絮。\n“你也是来下去的？”",
        "siteNpcIds": []
      },
      {
        "id": "slice_catchgallery",
        "label": "收网回廊",
        "icon": "◇",
        "x": 1150,
        "y": 2000,
        "eventSetId": "quietClearing"
      },
      {
        "id": "slice_pipe_threshold",
        "label": "下层门槛",
        "icon": "◇",
        "x": 1000,
        "y": 2240,
        "eventSetId": "quietClearing",
        "revealFlag": "galleryLowered"
      }
    ],
    "edges": [
      {
        "to": "eddie",
        "from": "start"
      },
      {
        "to": "slice_mudbank",
        "from": "eddie"
      },
      {
        "to": "node",
        "from": "eddie"
      },
      {
        "to": "slice_emperor_yard",
        "from": "node"
      },
      {
        "to": "node3",
        "from": "node"
      },
      {
        "to": "node3",
        "from": "slice_emperor_yard"
      },
      {
        "to": "slice_fungus_edge",
        "from": "node3"
      },
      {
        "to": "slice_climbcourt",
        "from": "slice_fungus_edge"
      },
      {
        "to": "slice_pipe_seam",
        "from": "slice_fungus_edge"
      },
      {
        "to": "slice_drybench",
        "from": "slice_climbcourt"
      },
      {
        "to": "slice_drybench",
        "from": "slice_pipe_seam"
      },
      {
        "to": "slice_church_approach",
        "from": "slice_drybench"
      },
      {
        "to": "slice_church_nave",
        "from": "slice_church_approach"
      }
    ]
  }
};
