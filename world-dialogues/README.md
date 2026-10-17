# 世界对话

通过本地静态服务器打开 `npc-editor/index.html`，类型选“世界对话”，或使用 `?kind=world&id=site_start` 按 ID 打开。可用 `node` 参数定位树内节点。

## 编辑与发布到本地游戏

1. 编辑标题、正文、选项、条件、连线和效果；使用状态沙盒预览。
2. 检查后导出 JSON，替换本目录的对应文件，再刷新游戏。
3. 新建对话还须将 `"稳定ID": "文件名.json"` 登记到 `manifest.json`，并在事件集或明确的 World 调用点引用它。编辑器不写入项目文件。

世界对话使用 `kind: "world"`；旧 NPC 文件缺少 `kind` 时仍视为 NPC。两类对话分别注册，编辑器用 `类型:ID` 区分同名对话；草稿也分别保存在当前浏览器会话中。修改树 ID 或外部入口节点 ID 后，必须同步更新清单、事件集、行动配方及具名 World 调用。导出文件不会自动更新这些引用。

## 对话结构

复用 NPC 的 `schemaVersion / id / name / start / nodes / editor`。

- `start.default` 与 `start.rules` 决定入口；`next` 指向本树节点。
- `entryNodes` 标记可被 World 或行动配方直接进入的节点，参与可达性检查。
- `visibleWhen` 控制选项显示，`enabledWhen` 控制可用性。条件和文本变体沿用 NPC 的格式。
- `allowClose: false` 禁止直接关闭；可选的 `allowCloseWhen` 允许在条件成立时额外关闭。未配置额外条件时只按 `allowClose` 判断。
- `onEnter` 是明确登记的 World 入口动作，执行后转场，不展示当前正文。例如地点入口自动进入原行动面板，保持原交互步数。删除该动作后可将此节点改为普通对话。
- `action` 仅引用 `world-dialogue-catalog.js` 中的具名动作。特殊动作的实际资源检查和执行留在 World；JSON 不包含可执行脚本。
- `result_continue` 由触发该结果的 World 流程提供继续操作；在沙盒中仅记录，不能脱离行动上下文直接执行。

地点使用 `site_<地图节点ID>`；旧世界对话 ID 保留。行动结果、重访与后续选择集中在 `event_<事件ID>`；结局使用 `ending_`。行动配方通过 `resultDialogueId / resultNodeId` 引用结果，不能再同时维护 `result` 正文。行动面板的阶段说明、槽位与配方仍在 `action-events` 中。

新结果状态记录对话与节点引用，重访时读取最新文本；旧 `resultText` 快照仍可显示。对白展示不重复执行行动配方的资源消耗或奖励。

## 沙盒上下文

关联地点提供 `nodeId / nodeLabel`。动态上下文 JSON 可填写 `churchArrivalDay / damage / resultText / eventName / deathReason`，共享变量还包括 `day / dailyStockId / dailyStockName / sacrificedCount`。未知变量会报错。

World 根据实际状态提供只读条件标记；沙盒可在 Flags 中手工设置它们以预览分支：`dialogueDamage`、`dialogueRewardClaimed`、`dialogueHasResult`、`dialogueMetalDistract`、`dialogueMistSafe`、`dialogueInfectedCorpse`、`dialogueResultDismissible`、`dialogueBattleAction`。

沙盒可选自动入口或任意节点。特殊动作只记日志，不运行战斗、移动或真实资源结算。非 NPC 对话不会获得自动献祭入口，也不要求战斗角色配置。
