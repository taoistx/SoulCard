# 行动事件配置

事件 JSON 在 `manifest.json` 登记后，可在节点事件集编辑器中添加“行动事件”，选择对应 ID。地图继续引用事件集；现有 NPC、世界对话和直接战斗入口保持可用。

参考 `thomas-crossroads.json`。每份事件配置包含 `schemaVersion: 1`、稳定的 `id`、`name`、两个或三个 `slots`、初始阶段 `start` 和 `stages`。阶段包含场景 `body` 与配方 `recipes`。

## 配方

托马斯路口与五个测试版遭遇均属于 `kind: action`（卡槽行动事件），共用以下规则：

- 任意槽位出现非 `focus` 的行动卡，就排除观察配方；这条规则先于数字 `priority`。
- 其他行动条件不足、目标放错或没有对应配方时，阻止提交，不自动退回观察。
- 其他行动之间依照配方优先级结算；最高优先级仍有多个结果时，提示撤回多余卡牌。
- 只有最终配方用到的资源参与消耗，未结算的观察卡不疲劳。
- 四个单目标事件设置 `actionSlot`，行动卡可从任意槽位匹配；尸堆与托马斯按配方指定槽位匹配。
- 物品与知识的条件由具体配方决定。“诱饵”不是此分类的通用设定，后续调整这些配方不影响观察规则。

```json
{
  "id": "observe",
  "slots": {
    "field": { "kind": "card", "category": "technique", "cardId": "focus" }
  },
  "effects": [{ "type": "setFlag", "key": "noticedTracks", "value": true }],
  "result": "你发现了泥地里的脚印。"
}
```

- `slots` 是配方需要的槽位；未列出的槽位可以有资源，但不会参与该配方结算。通常每个配方至少含一张 `kind: card` 战斗卡；`itemOnly: true` 允许单个物品独立结算，其他槽位必须为空。卡牌按 `category` 匹配，也可用 `cardId` 指定某张卡，或用 `excludeCardId` 排除某张卡。
- 排除观察后，可选整数 `priority` 决定同时命中多个配方时的结果，数值越大越优先。托马斯事件中，双目标暴力优先于单目标暴力，暴力优先于执念，执念优先于伎俩。相同最高优先级命中多个配方时需调整组合。
- 如果额外放入的暴力或执念卡没有命中对应行动，伎俩配方也不能借此结算；需先调整槽位。
- `kind: rhetoric` 匹配物品或知识的 `tag`。物品的 `eventTags` 在 World 物品表登记；知识的 `tags` 在 `ActionEventRuntime.KNOWLEDGE` 登记。
- 只有胜出配方用到的物品每次消耗一份；知识不消耗。只有胜出配方用到的战斗卡实体副本增加一层疲劳，已有疲劳不妨碍用于事件。
- 可选 `when` 沿用 NPC 的条件组格式；可选 `effects` 支持 `setFlag`、`addItem`、`removeItem`。
- 普通配方可以只有 `effects` 和 `result`。设置 `next` 则切换阶段，否则结束事件。
- 特殊行为使用 World 中明确实现的 `action`：`kill_thomas`、`kill_thomas_and_attack_dung`、`attack_dung`、`observe_dung`、`observe_infected`、`protect_thomas`、`lure_dung`、`trap_dung`。这些是托马斯示例的具名动作；新增特殊行为时显式登记与实现，不填写脚本表达式。
- 战斗具名动作需要事件的 `enemyId`；引开另需 `lureNodeId`。托马斯事件的 `observe_dung` 需配置 `next`。
- 条件与槽位同时命中两个最高优先级配方会提示撤回多余卡牌并阻止提交，不采用数组顺序优先匹配。

结果文字在提交后才显示。不要把秘密结果放入槽位名称或阶段说明。玩家确认前只看到组合是否合法以及疲劳／消耗。

## 状态与战斗

`WorldGame.getState()` 可检查牌组副本、知识、事件阶段、威胁与剧情 Flag。状态仅在本局内存中保存，重新开始会重置。

`BattleBridge.startBattle(enemyId, context)` 可接收：

- `cardInstances`：`{ instanceId, cardId, fatigue }[]` 的快照。
- `openingDelay`：开局敌方整条意图队列增加的时刻数。
- `openingDamage`：单体敌人的固定先制伤害，默认 0；不改变最大 HP，最低保留 1 HP，群体战斗忽略此值。
- `damageMultiplier`：最终伤害倍率，默认为 1。

结果增加 `cardFatigue`，按 `instanceId` 返回剩余层数。World 负责回写；临时战斗卡不会进入世界牌组。省略新增字段时，旧调用仍可用。

## 五个测试版遭遇

固定挂载于原有节点，不替换道路：`fallenSurvivor → node8`、`breathingCorpses → node4Copy`、`metalInMist → node12`、`corpseDispute → node6`、`livingHand → node4`。三个后续节点用现有 `revealFlag` 揭示。

- 尸堆事件按「尸堆／周围环境」定点匹配，其余单目标事件的行动卡可放入任意槽位。观察限定 `focus`，普通伎俩排除 `focus`；秘仪需实际持有秘仪卡并已献祭心脏。断手与尸堆的观察返回当前阶段，其余三个事件的观察结束遭遇。
- 新鲜血肉的 `freshFlesh` 标签用于断手事件第二阶段单独投入「泥水」脱险。尸堆不再接受诱饵或触发战斗；第二次观察尸堆获得「蠕虫养殖」知识，与环境槽的观察卡组合可揭示「隐蔽小径」。
- 可选 `staminaCost`／`hpCost` 是非负整数，表示分支的额外消耗；环境 HP 损耗最低保留 1 HP。首次探索和进入战斗的现有体力规则继续适用，等待不推进天数。
- `allowLeave: true` 为新遭遇开放免费离开；断手事件第二阶段例外。卡牌行动仍疲劳 +1。未处理遭遇可回来继续；争夺尸体需实际离开到另一节点后，才变为三具尸体。
- 半截坠落者的杀死／离开、三具尸体的领取使用 World 弹窗，不再次疲劳卡牌。物品奖励只能领取一次。
- 金属声源仅首次穿雾可能损失 HP。观察的节奏知识永久有效，伎俩诱导通过 `mistSafeDay` 记录当天，长休后失效；执念直接抵达不重复支付穿雾损耗。
- 非战斗具名动作不要求 `enemyId`；尸堆现有的暴力行动直接在 World 结算。具名动作仅在 World 中明确登记，JSON 不执行脚本。
- 未确定的剧情用玩家可见的“测试版尚未接入”提示与 Flag 占位。不新增 NPC、污染数值、材料用途或人格系统。

新增检查：`node --test tests/slice-events.test.cjs`；可选浏览器回归：`node tests/slice-events-flow.cjs`（与其他流程检查一样复用已有 Playwright，支持 `PLAYWRIGHT_MODULE` 与 `DUNGEON_URL`）。

疲劳牌固定消耗 1 刻，只移除一层疲劳；抽取、弃置、预读和回手不移除层数。剩余疲劳跨战斗保留，长休清空。伤害知识在原加成之后乘算、向上取整；拼刀在比较伤害前应用一次。

## 验证

```powershell
node --test tests/action-events.test.cjs tests/group-combat.test.cjs tests/npc-dialogue-runtime.test.cjs
python node-editor/server.py
```

另一个终端中使用已有 Playwright 安装运行浏览器回归，不需要给项目添加依赖：

```powershell
$env:PLAYWRIGHT_MODULE = '已有 Playwright 模块的绝对路径'
node tests/action-events-flow.cjs
node tests/battle-card-instances-flow.cjs
node tests/npc-editor-flow.cjs
```

默认地址为 `http://127.0.0.1:8765`，可用 `DUNGEON_URL` 覆盖；默认浏览器为 Edge，可用 `BROWSER_CHANNEL` 覆盖。浏览器测试只操作新开的测试页面，不保存编辑器草稿到项目文件。
