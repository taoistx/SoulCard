"use strict";

/*
 * NPC 对话脚本入口
 * ---------------------------------------------------------------------------
 * 每名 NPC 的正文与分支位于 npc-dialogues/ 下的独立文件。
 *
 * NPC 脚本结构：
 *   name: 显示名称
 *   start(context): 返回初始节点 id
 *   nodes[nodeId](context): 返回一个对话节点
 *
 * context 提供：
 *   day, dailyStockId, dailyStockName, sacrificedCount
 *   getFlag(key), hasItem(itemId), hasSacrificed(partId)
 *
 * 节点可配置：
 *   kicker, title, body
 *   effects: [{ action: "set_flag", key, value }]
 *   options: [{ label, hint, enabled, next, action }]
 *
 * next 是本 NPC 的下一个节点 id。
 * action 是 world.js 中 runNpcAction 支持的具名动作。
 * World 层会自动为每个 NPC 追加“献祭身体”，无需在脚本中重复填写。
 */
window.NPC_DIALOGUES = {};
