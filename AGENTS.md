# 项目协作指引

这是一个纯前端卡牌战斗 Demo，并在其外增加轻量 RPG / CRPG Vertical Slice。目标体验是：

`地图探索 → NPC / 地点交互 → 可能进入战斗 → 返回世界 → 长休推进一天 → 继续探索`

## 开发边界

- 把现有卡牌战斗视为独立模块。除接入所需的小接口外，不重构战斗规则。
- 不提前建设大型通用框架、任务图、事件图、规则引擎、程序生成地图或完整经济系统。
- 不引入 XP、等级，以及“每次胜利固定三选一卡”。
- 天数只由长休推进；移动、对话、地点交互和战斗不推进天数。
- 长休是地图 HUD 的常驻操作，不依赖营地。
- 献祭不依赖祭坛；World 层会为每个 NPC 对话自动增加献祭入口。
- 世界地图应长期存在，采用固定方格与明确阻挡，不要把每个格子都设为可通行。

## 主要文件

- `index.html`：页面结构及脚本加载顺序。
- `styles.css`：World、地图、弹窗、角色面板与战斗界面样式。
- `world.js`：地图、World State、Inventory、装备、献祭、长休、NPC 交互和战斗桥接。
- `game.js`：现有卡牌战斗模块及 `BattleBridge`。
- `deck-config.js`：卡牌 / 牌组配置。
- `npc-dialogues.js`：NPC 对话配置格式说明和注册表。
- `npc-dialogues/*.js`：每名 NPC 独立的对白与分支配置。

## 模块约定

- World 只能通过 `BattleBridge.startBattle(enemyId, context)` 请求战斗，并处理 `Win / Lose / Escape` 结果。
- World / NPC 代码不要直接修改战斗内部对象。
- 简单世界后果使用 `getFlag(key)` 和 `setFlag(key, value)`。
- 物品保持最小支持：获得、查看、持有判断、使用和明确槽位装备。
- 单手装备必须允许玩家选择左手或右手；双手装备占据左右手；所有装备槽应支持卸下。
- 完整身体必须保持为有效 Build，不要把献祭实现成无代价升级。

## NPC 对话配置

修改某名 NPC 时，优先编辑其独立脚本，不把台词重新写回 `world.js`。

每份 NPC 脚本包含：

- `name`：NPC 名称。
- `start(context)`：依据 Day、World Flag、物品或献祭状态选择初始节点。
- `nodes`：对白节点；节点可提供 `body`、`effects` 和 `options`。
- 选项使用 `next` 跳转本 NPC 的其他节点；需要改变世界时使用 `world.js` 中明确登记的具名 `action`。

新增 NPC 脚本后，记得在 `index.html` 中于 `world.js` 之前加载。

## 修改原则

- 先检查当前工作区状态，保留用户已有和无关改动。
- 优先做局部、可读的数据和函数，不为少量内容制造抽象层。
- 新增 World Flag、物品或 NPC 动作时使用清晰稳定的英文 ID。
- UI 文案和规则提示应与实际实现一致。
- 除非用户明确要求，不新增构建工具、框架或外部依赖。

## 最低验证

修改后至少运行：

```powershell
node --check game.js
node --check world.js
node --check npc-dialogues.js
Get-ChildItem npc-dialogues -Filter *.js | ForEach-Object { node --check $_.FullName }
git diff --check
```

涉及 UI 或流程时，再通过本地静态服务器打开 `index.html`，实际验证地图移动、NPC 分支、长休、装备和战斗返回流程。
