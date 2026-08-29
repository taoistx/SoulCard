"use strict";

window.NPC_DIALOGUES.eddie = {
  name: "渔夫 艾迪",
  start: () => "root",
  nodes: {
    root: (ctx) => ({
      kicker: `NPC · 第 ${ctx.day} 天货物`,
      title: "渔夫 艾迪",
      body: ctx.getFlag("eddieMet")
        ? `“我这有好东西你可能用得着。”\n“但得给我血肉来——你自己的，或者别人的都行。”`
        : "中年男人站在粪海边，似乎在打捞着什么东西。\n他注意到了你，“嗯……又有新来者了”",
      effects: [{ action: "set_flag", key: "eddieMet", value: true }],
      options: [
        { label: "这里是什么地方？", hint: "免费情报", next: "church_info" },
        // { label: "你是谁？", hint: "免费情报", next: "eddie_info" },
        {
          label: `用 1 份血肉换 ${ctx.dailyStockName}`,
          hint: ctx.hasItem("freshFlesh") ? "可交易" : "缺少新鲜血肉",
          enabled: ctx.hasItem("freshFlesh"),
          action: "eddie_buy_daily",
          next: "root",
        },
        {
          label: "用 1 份血肉换老旧钥匙",
          hint: ctx.hasItem("oldKey") ? "已经拥有" : ctx.hasItem("freshFlesh") ? "可交易" : "缺少新鲜血肉",
          enabled: !ctx.hasItem("oldKey") && ctx.hasItem("freshFlesh"),
          action: "eddie_buy_key",
          next: "root",
        },
        { label: "袭击艾迪，夺走货物", hint: "触发战斗", action: "fight_eddie" },
      ],
    }),
    
    church_info: () => ({
      kicker: "艾迪 · 情报",
      title: "山顶的建筑是唯一出口",
      body: "“这里就是粪世界，粪坑的东西都会到的一个奇怪次元。如果5天内你回不去原来的世界，你就会变成粪怪，永远的留在这。当然，如果你能吃到正常人的血肉，你能撑得更久。唯一离开这里的东西在山顶那建筑里，但这一路上不好走”",
      options: [{label: "你是谁？", hint: "情报", next: "eddie_info"},{label: "吃人的血肉？！", hint: "情报", next: "flesh_info"},{ label: "继续交易", hint: "返回", next: "root" }],
    }),
    eddie_info: () => ({
      kicker: "艾迪 · 情报",
      title: "这里能交易",
      body: "“我叫艾迪，也是一个坠入粪坑的倒霉蛋…………已经记不得在这里多久了。靠捞点有用的东西换点血肉维持着……你要有血肉也可以拿来跟我换点东西，你肯定不会后悔的”",
      options: [{label: "你为什么不去那建筑？", hint: "情报", next: "whyhere_info"},{ label: "继续交易", hint: "返回", next: "root" }],
    }),
    flesh_info: () => ({
      kicker: "艾迪 · 情报",
      title: "主动献上血肉能获得异能",
      body: "“是的，唯一维持自我的方式。甚至如果自愿把血肉献给其他人吃，你还能获得异能…………你要试试么？”",
      options: [{ label: "继续交易", hint: "返回", next: "root" }],
    }),
    whyhere_info: () => ({
      kicker: "艾迪 · 情报",
      title: "这里能交易",
      body: "“我老了，没那个本事…………在山里，大量以前想回去的人困在那变成了粪怪……唉，太难了”",
      options: [{ label: "继续交易", hint: "返回", next: "root" }],
    }),
  },
};
