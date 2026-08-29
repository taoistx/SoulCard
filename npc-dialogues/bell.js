"use strict";

window.NPC_DIALOGUES.bell = {
  name: "丧钟",
  start: (ctx) => ctx.hasSacrificed("head") && ctx.hasSacrificed("brain") ? "recognized" : "hostile",
  nodes: {
    hostile: () => ({
      kicker: "敌意 NPC",
      title: "丧钟",
      body: "他的头和脑都不在了。裂钟却准确转向你仍然完整的颈部。这里没有可以说服他的脸。",
      options: [{ label: "迎战", hint: "触发战斗", action: "fight_bell" }],
    }),
    recognized: () => ({
      kicker: "条件对白 · 头与脑均已献祭",
      title: "丧钟",
      body: "他把裂钟放低。两个没有头脑的人，在此地反而完成了身份确认。\n“你也……听见里面的水声。”",
      options: [{ label: "询问上山的路", hint: "避免战斗", action: "spare_bell", next: "spared" }],
    }),
    spared: () => ({
      kicker: "丧钟 · World Flag",
      title: "丧钟让路",
      body: "他把山道钥匙塞进你颈部的空洞，然后消失在粪雾里。",
    }),
  },
};
