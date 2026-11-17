# 对话树 JSON 结构与引擎接入速查

适用格式：`schemaVersion: 1`。核对日期：2026-11-09。

本文定义数据结构、引用关系、求值规则与宿主接口。字段和行为以 [npc-dialogues.js](../npc-dialogues.js) 为准；文本编译规则见 [dialogue-text.js](dialogue-text.js)。

当前独立范例 [examples/dialogue_debug.json](examples/dialogue_debug.json) 已使用 `nodes + optionLists` 与文本语法版本 4。共享运行时和编辑器支持此结构；游戏项目中的既有 NPC／世界对话尚未批量迁移，仍使用节点内嵌 `options` 和历史文本语法。`schemaVersion: 1` 本身不足以判断播放器是否支持独立选项组，跨引擎接入时须检查该能力。

## 1. 数据组织

一份 JSON 定义一个对话。`nodes` 保存正文节点，`optionLists` 保存可共享的回答组；节点通过 `optionList` 使用回答组，组内选项通过 `next` 跳转节点。结构允许多节点共用一组选项，也允许循环与汇合。

```text
Dialogue
├─ schemaVersion / kind / id / name
├─ start
│  ├─ default → NodeID
│  └─ rules[] → { when: Condition, node: NodeID }
├─ entryNodes[] → NodeID
├─ nodes: Record<NodeID, Node>
│  └─ Node
│     ├─ kicker / title / body: Text
│     ├─ effects[]: Effect
│     ├─ onEnter / allowClose / allowCloseWhen
│     └─ optionList → OptionListID
├─ optionLists: Record<OptionListID, OptionList>
│  └─ OptionList
│     └─ options[]: Option
│        ├─ id / label / hint
│        ├─ visibleWhen / enabledWhen
│        ├─ effects[] / action / repeat
│        └─ next → NodeID
└─ editor: 编辑器元数据
```

旧格式不含顶层 `optionLists`，将 `options[]` 直接保存在每个 node 内。新格式一旦存在 `optionLists`，节点就不能再保存内嵌 `options`，包括空数组。两种格式不能在同一份运行 JSON 中混用。

运行数据、宿主状态和编辑器元数据相互分离：

| 数据 | 保存位置 | 责任 |
| --- | --- | --- |
| 对话定义 | 当前 JSON 的 `start`、`nodes`、`optionLists` 等字段 | 解释文本、条件、效果和引用 |
| 状态与动作实现 | 宿主引擎 | 读写状态、调度动作、维护存档 |
| 编辑辅助信息 | `editor` | 保留布局、名称映射和编译身份 |

`optionLists` 是正式运行数据，播放器必须读取；它不属于可忽略的编辑器元数据。JSON 不包含执行脚本，也不包含当前播放进度。播放器可忽略 `editor`；编辑工具应保留它及其他未知扩展字段。

## 2. 最小结构

以下展示两个正文节点共用一组选项。选项组只保存一次，修改后所有引用节点立即使用同一份定义。

```json
{
  "schemaVersion": 1,
  "kind": "npc",
  "id": "dialogue_1",
  "name": "路边交谈",
  "start": { "default": "root", "rules": [] },
  "nodes": {
    "root": {
      "body": "露西看向你。",
      "optionList": "mainChoices"
    },
    "disappointed": {
      "body": "她很失望。",
      "optionList": "mainChoices"
    }
  },
  "optionLists": {
    "mainChoices": {
      "options": [
        { "id": "avoid", "label": "回避", "next": "disappointed" },
        { "id": "leave", "label": "离开" }
      ]
    }
  }
}
```

## 3. 顶层字段与身份

| 字段 | 类型 | 约束／用途 |
| --- | --- | --- |
| `schemaVersion` | number | 必须为 `1` |
| `kind` | string，可选 | 当前支持 `npc`、`world`；旧文件可省略，按 `npc` 使用 |
| `id` | string | 对话稳定 ID |
| `name` | string | 非空显示名称，也是节点默认标题 |
| `start` | object | 必须包含有效 `default`；`rules` 可省略 |
| `nodes` | object | 非空节点表，以节点 ID 为键 |
| `optionLists` | object，新格式使用 | 选项组表，以选项组 ID 为键；每组必须包含 `options` 数组 |
| `entryNodes` | string[]，可选 | 补充入口集合，供可达性检查使用 |
| `editor` | object，可选 | 不参与共享运行时的逻辑求值 |

身份约束：

- 对话 ID、节点 ID、选项组 ID、选项 ID 均匹配 `^[A-Za-z][A-Za-z0-9_-]*$`。
- 节点 ID 和选项组 ID 在同一对话中共用命名空间，不能重名。选项组 ID 不能为 `__proto__`、`constructor`、`prototype`。
- 新格式的选项 ID 在所属 optionList 内唯一；旧格式在所属 node 内唯一。
- 选项组身份由 `optionLists` 的键决定，节点的 `optionList` 必须引用现有选项组。
- 节点身份由 `nodes` 的键决定，节点内部不重复保存 `id`。
- `next` 仅引用当前对话内的节点，不解析路径或跨文件引用。
- 显示名称与 ID 独立，不能使用正文或标题代替引用 ID。
- `root` 没有运行时特殊含义，入口由 `start` 指定。
- 合并多个分类注册表时，使用 `(kind, id)` 区分对话身份。

`options`、`start.rules`、文本变体及效果数组的顺序必须保留。`nodes` 的键顺序不决定运行路径，但编辑工具应保留其目录顺序。

## 4. 入口与节点

### 4.1 入口结构

`start` 的结构为：

```text
start.default: NodeID
start.rules?: Array<{ when?: Condition | null, node: NodeID }>
```

按数组顺序选择第一个条件成立的规则；无匹配项时使用 `default`。省略或为 `null` 的条件恒成立。宿主显式指定节点时，可以跳过入口选择。

`entryNodes` 不参与自动入口选择，只为直接进入的节点补充可达性起点。

### 4.2 节点字段

| 字段 | 类型 | 默认／含义 |
| --- | --- | --- |
| `kicker` | Text | 默认空字符串 |
| `title` | Text | 缺失或空字符串时使用顶层 `name` |
| `body` | Text | 默认空字符串 |
| `effects` | Effect[] | 默认空数组，每次进入节点时执行 |
| `optionList` | OptionListID，可选 | 新格式：引用共享选项组；缺失时没有普通选项 |
| `options` | Option[]，仅旧格式 | 不含顶层 `optionLists` 时使用，默认空数组 |
| `onEnter` | string，可选 | 宿主入口动作 ID；当前仅 `world` 支持 |
| `allowClose` | boolean，可选 | 默认 `true` |
| `allowCloseWhen` | Condition，可选 | 条件成立时额外允许关闭 |

关闭结果为 `allowClose !== false OR allowCloseWhen成立`。`allowCloseWhen` 不会限制已允许关闭的节点。实际窗口是否采用此结果由宿主决定。

节点没有选项时，不会自动跳到节点表的下一项；结束交互由宿主实现。

## 5. 选项组与选项

新格式的选项组为 `{ "options": [...] }`，数组按展示顺序排列。多个节点可以引用同一组；进入节点本身不会执行任何选项效果。只有玩家选择选项成功后，才执行该选项的效果及后续跳转。

选项组不包含正文和节点进入效果，也不通过 `next` 引用其他组。当前不支持在 node 上合并共享组与本地选项；需要独立差异时创建另一组选项。


| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` | string | 所属选项组内的稳定身份；旧格式为所属节点内唯一 |
| `label`、`hint` | Text | 默认空字符串 |
| `visibleWhen` | Condition，可选 | 假时从展示列表移除 |
| `enabledWhen` | Condition，可选 | 假时保留展示但禁用 |
| `effects` | Effect[]，可选 | 选择成功时执行 |
| `action` | string，可选 | 宿主动作 ID |
| `next` | NodeID，可选 | 目标节点 |
| `repeat` | string，可选 | 宿主选项展开扩展；当前允许值由校验器限定 |

条件缺失或为 `null` 时为真。展示和点击时都应读取最新状态重新判断条件。

没有 `next` 和 `action` 时，普通分支结束。有 `action` 而没有 `next` 时，后续流程可能由动作接管，不能一律视为立即关闭。

`repeat` 的展开、动作可用性以及额外按钮均不由共享节点解析器实现，需要宿主适配。

## 6. 条件数据结构

### 6.1 递归组

```text
Condition = {
  mode: "all" | "any" | "not",
  clauses: Array<Condition | Leaf>
}
```

条件字段最外层必须为组，不能直接放叶子。

| `mode` | 求值 |
| --- | --- |
| `all` | 所有子项为真 |
| `any` | 任一子项为真 |
| `not` | 对唯一子项取反，要求 `clauses.length === 1` |

兼容语义：空 `all` 和空 `any` 均为真；条件缺失或 `null` 也为真。根组深度按 0 计数，递归组深度大于 64 时校验失败。

必须先校验完整条件树，再进行布尔求值。任意非法子项使整个条件失败，不能通过外层 `not` 将非法结构转为真。

JSON 直接保存运算树，没有字符串运算优先级问题。

### 6.2 叶子结构

| `source` | 字段 | `operator` |
| --- | --- | --- |
| `flag` | `key: string`；比较操作使用 `value` | `eq`、`ne`、`exists`、`notExists` |
| `day`、`sacrificedCount` | `value: number` | `eq`、`ne`、`gte`、`lte` |
| `item` | `itemId: string`、`amount?: number` | `has`、`lacks` |
| `sacrifice` | `partId: string` | `sacrificed`、`intact` |

以上名称是当前格式的保留枚举；对应状态通过宿主接口提供。注册枚举与模板白名单可从 `NPCDialogueRuntime.catalog` 查询，不应从某份对话内容推断。

移植时需保留以下类型规则：

- `eq`、`ne` 使用严格类型比较，不做字符串、数字与布尔值之间的隐式转换。
- 未设置与已设置为 `false` 或 `null` 必须区分；`exists` 判断键是否存在，不判断真值。
- `not` 反转子条件结果，不等同于将字段与 `false` 比较。
- 数值条件要求有限数字；运行时缺失的数值来源按 0 处理。
- 数量省略时为 1，新数据应使用正整数。当前实现以 `amount || 1` 取默认值，旧数据中的 0 也按 1 处理。
- 比较值建议使用 JSON 标量；当前 JS 对象／数组相等采用引用语义，不是结构相等。

## 7. 效果与状态写入

| `type` | 字段 | 操作 |
| --- | --- | --- |
| `setFlag` | `key: string`、`value: JSONValue` | 将指定键设为给定值 |
| `addItem` | `itemId: string`、`amount?: number` | 增加指定数量 |
| `removeItem` | `itemId: string`、`amount?: number` | 移除指定数量 |

`effects` 按数组顺序执行。同一键多次赋值时以后面的结果为准。`setFlag` 必须带 `value`，设为 `false` 不表示删除；当前没有通用删除键效果。

共享 `applyEffects` 的执行步骤为：

1. 解析字段中的模板引用。
2. 累计整批 `removeItem`，基于执行前状态检查数量。
3. 检查通过后按数组顺序调用宿主写接口。
4. 返回执行结果，不自动跳转。

前面的 `addItem` 不参与本批移除预检查。该实现不提供完整事务回滚，宿主回调中途失败时，已有写入可能保留。需要事务保证时应在适配层实现。

## 8. 文本与模板

```text
Text = string | {
  default: string,
  variants?: Array<{ when?: Condition | null, text: string }>
}
```

按顺序选择第一个条件成立的变体，否则使用 `default`；不合并多个变体。选择文本后再替换 `{{变量名}}`，括号内允许空白。

模板变量由运行时白名单限定，未知变量校验失败。合法变量缺失或为 `null` 时替换为空字符串。模板仅进行值替换，不执行表达式或函数。

支持模板的位置为：文本字段、条件的 `key`／`itemId`、效果的 `key`／`itemId`。`next` 不进行模板替换。换行使用 JSON 字符串中的 `\n`。文本模式中，同一节点正文的段落之间直接留空行即可，编译器自动转为换行；连续多个空行按数量保留，不需要手写 `\`。例如 `第一段`、一个空行、`第二段` 对应 `"第一段\n\n第二段"`。正文前后及选项之间的排版空行不用于创建新节点。

新版文本导出会将正文段落之间的换行还原为普通空行。旧文本中单独一行 `\` 仍兼容为空正文行；普通文字中的保留符号转义规则不变。

## 9. 运行时模块与宿主边界

### 9.1 共享 API

浏览器接口为 `window.NPCDialogueRuntime`，CommonJS 在项目根目录可使用 `require("./npc-dialogues.js")`。

| API | 职责 |
| --- | --- |
| `validateDialogue(dialogue, options)` | 返回 `{errors, warnings}` |
| `evaluateCondition(condition, context)` | 校验并求值条件 |
| `resolveStart(dialogue, context)` | 解析入口节点 ID |
| `resolveText(text, context)` | 解析条件文本与模板 |
| `resolveNode(dialogue, nodeId, context)` | 返回节点展示结果，自动读取共享选项组或旧内嵌选项；未知节点返回 `null` |
| `getNodeOptions(dialogue, node)` | 获取原始选项数组，兼容两种存储方式；不筛选条件，不复制数据 |
| `applyEffects(effects, context)` | 调用宿主接口应用效果并返回成功状态 |
| `clone`、`deepFreeze` | 数据复制与只读处理 |
| `catalog` | 查询当前注册的枚举、动作和模板变量 |

`resolveNode` 返回的 `id`、解析后的文本、可见选项及 `enabled` 是派生结果，不应直接覆盖原始定义。它不会执行节点效果、动作、关闭或跳转。

宿主应通过 `getNodeOptions(dialogue, node)` 按 ID 查找原始选项，避免只读取 `node.options`。运行中不要修改返回的原始数组；编辑器修改共享数组则会影响所有引用节点。

### 9.2 上下文接口

```text
context:
  getFlag(key) → value | Missing
  setFlag(key, value)
  hasItem(itemId, amount) → boolean
  addItem(itemId, amount)
  removeItem(itemId, amount) → success
  hasSacrificed(partId) → boolean
  day: number
  sacrificedCount: number
  [允许的模板变量]: value
```

动作注册、异步完成、选项展开和界面生命周期由宿主管理。即使当前 JS 使用可选回调，目标引擎也应验证所需接口已实现。

### 9.3 执行生命周期

```text
打开：校验 → 解析入口 → 进入节点
进入：节点效果 → 可选入口动作 → 解析展示结果
选择：重新验证条件与资源 → 可选动作 → 选项效果 → next 或结束
刷新：重新解析展示结果，不重复执行进入效果
```

上述生命周期用于组织适配层，不表示共享 API 会自动串联所有步骤。节点入口效果在每次重新进入时触发，没有隐含的“仅执行一次”语义。

当前宿主并非完全一致：节点进入后都会重新解析选项，但有的宿主保留效果前解析的正文，有的会重算全文；条件失败后的刷新也可能重新进入。迁移时应明确“进入”和“重绘”的界限，并单独约定文本解析时机。

`action` 与 `onEnter` 仅保存动作 ID，不保存实现。当前宿主通常等待选项动作成功后再执行效果与跳转；入口动作可接管当前展示流程。这些调度约定应由适配层显式实现。

存档应独立保存对话身份、当前节点、状态及必要上下文。恢复进度时需明确是否重放入口效果。

## 10. 文本编译与编辑元数据

### 10.1 运行 JSON 与辅助封装

最终导出的完整 JSON 是引擎输入。文本编辑器的高级配置是编译辅助数据，需与正文组合后才能恢复完整对话。

完整文本以 `@config`、`@end` 包围辅助配置。公共字段包括 `dialogue`、`nodes`、`options`、`nodeOrder`、`plainBindings`、`conditionTemplates` 等；新版另有 `optionLists`、`nodeLists`、`listOwners`、`referenceNodes`，用于保存组身份、共享关系和已知引用目标。这些是完整文本中的编译辅助字段，不应直接当作最终运行 JSON。

版本分为三个层次：

| 字段 | 当前值 | 含义 |
| --- | --- | --- |
| 运行 JSON 的 `schemaVersion` | `1` | 对话数据格式；包含新旧两种选项存储方式 |
| 辅助封装的 `version` | `1` | 编译封装格式 |
| 新版文本的 `syntaxVersion` | `4` | `@ID` 按 node／optionList 类型解析 |
| 旧文本的 `syntaxVersion` | `3` 及更早版本 | 保留相应读取路径，不代表已迁移为独立选项组 |

正文输入只保留草稿，点击“转换并应用 JSON”且转换成功后才更新运行 JSON。语法错误、未知引用或 ID 重名会保留原 JSON，并显示诊断位置。其他引擎不应读取未应用草稿作为正式数据。

### 10.2 ID 与引用编译

普通正文直接写文本和 `》` 回答，不声明节点、选项组或选项 ID；编译器自动分配并尽量保留稳定身份。目录显示 node ID 和关联的 `@optionListId`，引用使用 ID，不使用显示标题。`root`、`mainChoices` 都只是示例名称。

新版统一使用 `@ID` 或 `@ ID`，只按目标类型区分行为，不按“前面是否有正文”改变目标类型：

| 目标类型 | 运行含义 | 编译方式 |
| --- | --- | --- |
| node，例如 `@root` | 进入目标正文、执行目标进入效果，并使用目标选项组 | 回答后的引用写入选项的 `next`；根位置的引用可改变默认入口 |
| optionList，例如 `@mainChoices` | 保留当前正文，只使用对应回答组 | 当前正文 node 的 `optionList` 指向目标组，不复制选项 |

引用 node 前即使写了临时正文或进入效果，也不会先显示、执行这些内容；转换会给出提示。要保留这段正文，应引用 optionList。

```text
露西看向你
》回避
    她很失望
    @mainChoices
》重新交谈
@root
》离开
```

JSON 转文本时，直接引用 node 的行与其所属选项同级，不再额外缩进；已有文本中多缩进一层的引用仍兼容读取。

以上以 `mainChoices` 为当前已有组 ID：回避后保留失望正文，重新交谈则进入 root 正文。回答下只有 `@optionListId`、没有新正文时，编译器保留当前显示的正文，但不重复执行原节点进入效果。有自己的回复正文时，执行的是回复节点自身的进入效果。

`@` 不能引用单个 option，也不能同时引用选项组并声明本节点的自有回答。已知引用目标即使不再在正文中展开，编译器仍会保留被引用的节点及必要依赖；未知目标会阻止转换。当前独立入口节点的完整文本展开仍有限制，此阶段未推广到全部项目内容。

最终运行 JSON 不包含需要宿主解释的 `@` 指令：node 跳转使用 `next`／入口字段，回答组使用 `optionList`。播放器根据这两个结构执行，不根据正文内容猜测引用类型。

历史语法中“正文后 `@nodeId` 复制目标选项”的行为仅供旧数据兼容；新版语法 4 不沿用该含义，也不再保存选项副本。

### 10.3 元数据速查

| 字段 | 用途 |
| --- | --- |
| `editor.positions` | 节点 ID 到 `{x,y}` 的布局表 |
| `editor.textAuthoring.flagAliases` | 作者名称到稳定状态键的映射 |
| `editor.textAuthoring.optionSources` | 仅历史格式使用，记录选项副本来源；新版共享组不使用 |
| `editor.textAuthoring.nextNodeSerial` | 自动节点 ID 的后续分配计数 |
| `editor.textAuthoring.syntaxVersion` | 写作语法版本 |

新名称默认映射为 `storyFlag_<名称UTF-8的完整SHA-256摘要>`，也可在首次采用前绑定已有键。已用键保持稳定；更改作者名称不应重建键。映射冲突应在导入／编译前解决。

播放器只使用条件和效果内已有的键，不需要重新生成摘要或解释别名。移除 `editor` 不影响播放，但会丢失部分往返编辑信息；不能同时移除正式运行字段 `optionLists` 或 node 的 `optionList`。

节点 ID 优先根据正文和原位置匹配；选项重排或插入时优先按唯一文字保留身份及高级配置。同名选项同时重排和改名仍可能存在歧义，编辑时应避免依赖这种自动推断。

## 11. 加载、校验与兼容

清单加载属于可选外层协议：

```text
Manifest = {
  schemaVersion: 1,
  dialogues: Record<DialogueID, RelativeFilePath>
}
```

路径相对清单解析，清单键与文件 `id` 一致；分类加载器可追加 `kind` 约束。也可直接加载单份对话，不使用清单。

加载时应检查版本、ID、结构、引用目标、递归条件、文本模板、效果与动作能力。当前校验器允许未知扩展字段，且部分宿主扩展存在不同的错误／警告策略；通过校验不代表目标引擎已实现全部扩展。

可达性从 `start.default`、所有入口规则目标及 `entryNodes` 出发，先读取节点实际使用的选项组或旧内嵌选项，再沿 `next` 遍历；不使用当前状态裁剪，也不推测动作内的转场。不可达节点当前仅产生警告。

格式仍为版本 1，但独立选项组、递归条件与 `not` 都要求播放器具备相应能力。只支持内嵌 `node.options` 的播放器必须显式适配 `optionList` 查找，或在导入阶段转换为内嵌选项，不能将新格式误判为“所有节点都没有选项”。当前游戏宿主仍有直接访问旧 `node.options` 的调用，因此范例验证通过不代表可以直接替换全部项目数据。只支持旧扁平条件的播放器应报告能力不足，不能静默忽略子组。新扩展也应明确报告不支持的字段语义或枚举。

接入验证应覆盖：身份与顺序保留、入口优先级、递归条件及非法结构、缺失值与类型比较、效果顺序及失败处理、共享选项组及即时修改、node／optionList ID 冲突、两类 `@` 引用、自然空行往返、循环引用、显示与禁用区别、重绘与进入的界限、元数据可忽略性，以及加载后再次导出的结构完整性。

## 12. 代码索引

| 文件 | 职责 |
| --- | --- |
| [npc-dialogues.js](../npc-dialogues.js) | 数据校验、条件、文本、节点及效果的共享实现 |
| [npc-dialogue-loader.js](../npc-dialogue-loader.js)、[world-dialogue-loader.js](../world-dialogue-loader.js) | 分类清单加载与只读注册表 |
| [dialogue-text.js](dialogue-text.js) | 写作文本与完整 JSON 的转换 |
| [editor.js](editor.js)、[text-editor.js](text-editor.js) | 编辑状态、界面与转换调度 |
| [world.js](../world.js)、[world-dialogue-bridge.js](../world-dialogue-bridge.js) | 当前宿主适配实现 |

扩展字段、条件来源、效果类型或动作协议时，应同步更新此速查及对应能力检查。