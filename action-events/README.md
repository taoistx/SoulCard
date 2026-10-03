# 行动事件配置

事件 JSON 在 `manifest.json` 登记后，可在节点事件集编辑器中添加“行动事件”，选择对应 ID。地图继续引用事件集；现有 NPC、世界对话和直接战斗入口保持可用。

参考 `thomas-crossroads.json`。每份事件配置包含 `schemaVersion: 1`、稳定的 `id`、`name`、三个 `slots`、初始阶段 `start` 和 `stages`。阶段包含场景 `body` 与配方 `recipes`。

## 配方

```json
{
  "id": "lure",
  "slots": {
    "field": { "kind": "card", "category": "technique", "excludeCardId": "focus" },
    "monster": { "kind": "rhetoric", "tag": "lure" }
  },
  "action": "lure_dung",
  "result": "你把怪物引到了岔路。"
}
```

- `slots` 是配方需要的槽位；未列出的槽位可以有资源，但不会参与该配方结算。每个配方至少含一张 `kind: card` 战斗卡。卡牌按 `category` 匹配，也可用 `cardId` 指定某张卡，或用 `excludeCardId` 排除某张卡。
- 可选整数 `priority` 决定同时命中多个配方时的结果，数值越大越优先。托马斯事件中，双目标攻击优先于单目标攻击，攻击优先于防御，防御优先于技巧。相同优先级命中多个配方属于配置错误。
- 如果额外放入的攻击或防御卡没有命中对应行动，技巧配方也不能借此结算；需先调整槽位。
- `kind: rhetoric` 匹配物品或知识的 `tag`。物品的 `eventTags` 在 World 物品表登记；知识的 `tags` 在 `ActionEventRuntime.KNOWLEDGE` 登记。
- 只有胜出配方用到的物品每次消耗一份；知识不消耗。只有胜出配方用到的战斗卡实体副本增加一层疲劳，已有疲劳不妨碍用于事件。
- 可选 `when` 沿用 NPC 的条件组格式；可选 `effects` 支持 `setFlag`、`addItem`、`removeItem`。
- 普通配方可以只有 `effects` 和 `result`。设置 `next` 则切换阶段，否则结束事件。
- 特殊行为使用 World 中明确实现的 `action`：`kill_thomas`、`kill_thomas_and_attack_dung`、`attack_dung`、`observe_dung`、`observe_infected`、`protect_thomas`、`lure_dung`、`trap_dung`。这些是托马斯示例的具名动作；新增特殊行为时显式登记与实现，不填写脚本表达式。
- 具名动作需要事件的 `enemyId`；引开另需 `lureNodeId`。观察需配置 `next`。
- 条件与槽位同时命中两个最高优先级配方会显示配置错误并阻止提交，不采用数组顺序优先匹配。

结果文字在提交后才显示。不要把秘密结果放入槽位名称或阶段说明。玩家确认前只看到组合是否合法以及疲劳／消耗。

## 状态与战斗

`WorldGame.getState()` 可检查牌组副本、知识、事件阶段、威胁与剧情 Flag。状态仅在本局内存中保存，重新开始会重置。

`BattleBridge.startBattle(enemyId, context)` 可接收：

- `cardInstances`：`{ instanceId, cardId, fatigue }[]` 的快照。
- `openingDelay`：开局敌方整条意图队列增加的时刻数。
- `damageMultiplier`：最终伤害倍率，默认为 1。

结果增加 `cardFatigue`，按 `instanceId` 返回剩余层数。World 负责回写；临时战斗卡不会进入世界牌组。省略新增字段时，旧调用仍可用。

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
