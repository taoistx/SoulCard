# 项目协作指引

这是一个纯前端卡牌战斗 Demo，外层是轻量 RPG / CRPG Vertical Slice。核心循环为地图探索 → 地点或 NPC 交互 → 行动或战斗 → 返回世界 → 长休推进一天 → 继续探索。

## 当前项目状态

- 主线切片为「沿沉积山抵达教堂」，当前路网有 12 个节点、13 条有向揭示边。到达教堂门廊触发切片收束，完成界面可返回地图或重开。旧的 17 节点方案及收网回廊等内容仍有历史数据，当前路线以 `world-map.js`、`world-events.js` 和运行时加载的清单为准。
- 新局从第 1 天开始，完整身体最大 HP 为 66，每天 6 点体力。首次探索消耗 1 点体力，回访免除首次探索费用，部分地点另有通行伤害。只有长休换日，同时恢复 HP、体力，清空卡牌疲劳，并结算人物日程和临时状态。第 5 天再长休触发期限结局。世界状态保存在本局内存，重开会清空。
- 地点交互包含卡槽行动配方、物品与知识、具名操作和战斗。当前切片加载漂积湾、菌壳斜坡、落壳狭道和半埋检修槽四个切片行动事件。鲜肉用于食用、交易和引诱，韧膜用于制作防护或包扎。艾迪提供随日期变化的商店内容。
- 战斗由独立模块执行，包含单体与群体遭遇，并以本地 Three.js 呈现 3D 战斗场景。牌组中的卡牌按实体副本记录疲劳，战斗结束后按副本 ID 回写剩余疲劳。
- 地图与事件集各有编辑器。剧情编辑器可在节点图、文本和状态沙盒中处理 NPC 与世界对话，可通过本地服务读写配置的 JSON 文件夹。
- 内容与路线预算见 [沿沉积山抵达教堂 · 节点报告](Docs/沿沉积山抵达教堂_节点报告.md) 和 [实施与验收](Docs/沿沉积山抵达教堂_实施与验收.md)。

## 开发边界

- 把现有卡牌战斗视为独立模块。除接入所需的小接口外，不重构战斗规则。
- 沿用现有节点图、事件集和具名动作。不提前建设通用任务图、通用事件框架、规则引擎、程序生成地图或完整经济系统。
- 不引入 XP、等级，以及「每次胜利固定三选一卡」。
- 天数只由长休推进。移动、对话、地点交互和战斗不推进天数。长休是地图 HUD 的常驻操作，不依赖营地。
- 献祭不依赖祭坛。World 层为每个 NPC 对话自动增加献祭入口。完整身体必须保持为有效 Build，献祭必须有代价。
- 物品保持最小支持，覆盖获得、查看、持有判断、使用和明确槽位装备。单手装备须能选择左手或右手，双手装备占据左右手。所有装备槽均应支持卸下。

## 节点地图基础逻辑保护条款

- 节点地图的揭示逻辑与基础通行机制属于受保护的基础逻辑。除非用户特别声明允许变更，后续业务开发应沿用现有机制，不得擅自改变。
- 已探索的父节点单向揭示子节点，首次揭示还须满足子节点的额外条件，例如检修槽的 `revealFlag: "pipeFound"`。不得让子节点反向揭示父节点、改为双向揭示或绕过条件。起点和已探索节点始终视为已揭示。
- 玩家可直接到达任意已揭示节点。不得以邻接、父子连接、路径或事件完成状态限制其可达性。通行消耗可按业务需要调整，仍须保持上述机制。
- 当前位置带有 `fog: true` 时，地图只显示当前位置及已揭示的直接父、子节点，连线只显示两端均可见的边。迷雾仅过滤显示，揭示状态和可达性沿用同一套规则。

## 本地入口

- 游戏入口为 `index.html`。可双击 `启动Demo.cmd`，或运行 `python node-editor/server.py` 后打开 `http://127.0.0.1:8765/index.html`。
- 同一服务提供 `/node-editor/index.html` 和 `/node-editor/events.html`，可分别保存 `world-map.js` 与 `world-events.js`。也可用 `node-editor/启动节点编辑器.cmd` 打开节点编辑器。
- `npc-editor/启动剧情编辑器.cmd` 使用 Python 3.10+ 启动剧情编辑器独立服务并打开实际端口。默认读取 `npc-editor/examples`，可在设置中切换目录。运行时项目集成入口使用 `/npc-editor/index.html?source=project`。操作步骤见 [剧情编辑器 README](npc-editor/README.md)。

## 维护位置

| 范围 | 主要文件与职责 |
| --- | --- |
| 界面 | `index.html` 管理结构与脚本加载，`styles.css` 管理游戏界面样式。 |
| 地图和事件集 | `world-map.js` 保存节点、揭示边和地图布局，`world-events.js` 保存事件集及其入口，`node-editor/` 提供编辑页面和本地保存接口。 |
| 世界流程 | `world.js` 管理 World State、地图移动、背包、装备、献祭、长休、NPC 交互和战斗桥接，`world-v06.js` 管理当前切片的地点行为、通行代价、人物日程与结局，`world-shop.js` 管理艾迪商店交互。 |
| 行动事件 | `action-events.js` 匹配槽位与配方，`action-event-panel.js` 渲染行动面板，`action-events/manifest.json` 登记事件。资源检查、扣除和特殊动作由 World 执行。 |
| 对话运行与接入 | `npc-dialogues.js` 提供共享校验、条件求值与运行时解释。NPC 与世界对话分别由 `npc-dialogue-loader.js`、`world-dialogue-loader.js` 按各自清单加载，世界具名动作通过 `world-dialogue-catalog.js` 和 `world-dialogue-bridge.js` 接入。 |
| 剧情编辑 | `npc-editor/` 提供节点图、文本转换、共享选项组和状态沙盒，`dialogue_editor_server.py` 提供文件夹设置和写回接口。 |
| 战斗 | `game.js` 提供 `BattleBridge`，`deck-config.js` 管理卡牌和牌组，`card-instances.js` 管理副本与疲劳，`group-combat.js` 管理群体战斗，`battle-stage.js` 管理场景。战斗角色由 `battle-data-loader.js` 按 `battle-data/manifest.json` 加载。 |

## 内容接入约定

- World 只能通过 `BattleBridge.startBattle(enemyId, context)` 请求战斗，并处理 `Win / Lose / Escape`。World 与 NPC 代码不得直接修改战斗内部对象。简单世界后果使用 `getFlag(key)` 和 `setFlag(key, value)`。
- 修改 NPC 优先编辑其在 `npc-dialogues/` 下的独立 JSON。新增 NPC 时登记 `npc-dialogues/manifest.json`，并在 `battle-data/` 提供已登记的角色配置。非战斗角色使用 `combatEnabled: false`。
- 地点、行动结果和结局的正文优先编辑 `world-dialogues/`，常用 ID 前缀为 `site_`、`event_`、`ending_`。新增世界对话须登记 `world-dialogues/manifest.json` 并接入事件集、行动配方或 World 调用点。
- 对话以 `start.default` 和 `start.rules` 选择入口，选项的 `next` 指向本树节点。旧配置在节点内声明 `options`，也可用顶层 `optionLists` 与节点的 `optionList` 引用共享选项组。每份 JSON 使用其中一种结构。Flag 与物品变化使用通用 `effects`，特殊行为引用明确登记的具名动作。
- 行动事件的阶段说明、槽位和配方放在 `action-events/`。由世界对话展示的结果用 `resultDialogueId` 和 `resultNodeId` 引用正文。新增事件须登记清单，再由事件集或现有具名地点入口引用。
- 剧情编辑器写回 JSON 后，接入游戏仍需同步清单及外部引用。目录级中文 Flag 映射见该目录的 `flag-mappings.json`。字段细则见 [对话树 JSON 结构说明](npc-editor/对话树JSON结构说明.md)。

## 修改原则

- 先检查工作区状态，保留用户已有和无关改动。
- 优先做局部、可读的数据和函数，不为少量内容制造抽象层。
- 新增 World Flag、物品、对话和具名动作时使用清晰稳定的英文 ID。
- UI 文案和规则提示应与实际实现一致。
- 除非用户明确要求，不新增构建工具、框架或外部依赖。

## 最低验证

修改后至少运行以下检查。若改动其他脚本，补跑对应的语法检查与回归。

```powershell
node --check game.js
node --check world.js
node --check npc-dialogues.js
node --check npc-dialogue-loader.js
node --check npc-editor/editor.js
Get-ChildItem -Path npc-dialogues,world-dialogues,action-events,battle-data -Recurse -Filter *.json |
  ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop | Out-Null }
git diff --check
```

逻辑回归可运行 `node --test tests/*.test.cjs`。涉及 UI 或流程时，再通过本地服务验证地图移动、NPC 分支、长休、装备和战斗返回。现有浏览器回归见 `tests/*-flow.cjs`，例如 `sediment-flow.cjs`、`sediment-boundaries-flow.cjs`、`node-fog-flow.cjs`、`battle-card-instances-flow.cjs` 和 `dialogue-folder-flow.cjs`。可以用 `PLAYWRIGHT_MODULE` 指向环境已有的 Playwright。
