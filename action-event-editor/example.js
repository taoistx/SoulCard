"use strict";

((global) => {
  const example = {
    filename: "露西与粪怪.txt",
    source: `三只粪怪正缓缓逼近一个蜷缩在地上的女人。
她似乎已经失去了逃跑的勇气。

#露西 #粪怪

》确认
执念》露西 & 暴力》粪怪:
    你将女人护在身后，迎击粪怪。
    @battle monster1?
    》胜利
        你击败了粪怪。
        +flag: 露西获救
        +card: 处决
        @exit
    》失败
        你被怪物击倒。
        +flag: 露西死亡
        @exit
    》其他
        @exit

暴力》粪怪:
    你抢先发起攻击。
    +flag: 战斗先手
    @battle monster1?
    》胜利
        +flag: 露西获救
        @exit
    》失败
        @exit
    》其他
        @exit

[肉块]》粪怪:
    你抛出肉块，粪怪循着气味离开了。
    -card: 肉块
    +flag: 露西获救
    @exit

其他:
    这样的行动似乎没有意义。

》离开
`,
    config: {
      cards: { 灰钢架势: ["执念"], 固守: ["执念"], 短促刺击: ["暴力"], 肉块: [], 处决: ["暴力"] },
      items: ["乌鸦口罩"],
      battles: ["monster1"],
      shops: ["eddie"],
      initial: { deck: ["灰钢架势", "短促刺击", "肉块", "固守"], items: {}, flags: {} },
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = example;
  else global.ActionEventExample = example;
})(globalThis);
