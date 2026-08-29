"use strict";

window.NPC_DIALOGUES.chris = {
  name: "失眠者 克里斯",
  start: () => "root",
  nodes: {
    root: (ctx) => ({
      kicker: `NPC · 第 ${ctx.day} 天`,
      title: "失眠者 克里斯",
      body: ctx.day >= 4
        ? "她闭着眼，帽檐仍保持端正。裙装背后只剩骨头。\n“明天我就上山。不是因为准备好了，只是因为已经没有别的明天。”"
        : "她没有双手，胸前仍尽力维持着上流社会的体面。\n“你好，请你不要伤害我，我已经快没有血肉了，我想留下自己的脸面”",
      options: [
        {
          label: "给她一瓶止血剂",
          hint: ctx.hasItem("healingPotion") && !ctx.getFlag("helpedChris") ? "也许能换来信任" : "无法选择",
          enabled: ctx.hasItem("healingPotion") && !ctx.getFlag("helpedChris"),
          action: "help_chris",
          next: "gift",
        },
        {
          label: "谈论完整的身体",
          hint: ctx.sacrificedCount === 0 ? "Human Synergy 路线" : "她不再把你当普通人",
          enabled: ctx.sacrificedCount === 0,
          next: "human_body",
        },
      ],
    }),
    gift: () => ({
      kicker: "克里斯 · 世界发生变化",
      title: "克里斯的礼物",
      body: "她告诉你山道锁的旧制式，并把礼帽留给你。地图没有多出节点；只是某个人决定相信你。",
      options: [{ label: "继续交谈", hint: "返回", next: "root" }],
    }),
    human_body: () => ({
      kicker: "克里斯 · 完整身体路线",
      title: "仍然像个人",
      body: "“别急着把自己拆成天赋点。两只手能握剑与盾，眼睛能读人，心脏能让别人相信你还会心软。”",
      options: [{ label: "继续交谈", hint: "返回", next: "root" }],
    }),
  },
};
