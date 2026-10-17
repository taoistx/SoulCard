"use strict";
(function (global) {
  const actions = {
    shop_eddie: "打开艾迪商店",
    choose_waste_card: "用指定伎俩副本搬废料",
    restart: "重新开始", finish_ending: "结束结局并返回地图", enter_church: "抵达教堂",
    escape_plane: "拉动冲水链", search_hut: "搜索废弃小屋", gate_key: "钥匙开路",
    gate_path: "沿秘密路径开路", gate_fight: "挑战守卫", take_upper_material: "领取检修台韧膜",
    move_local_waste: "选择伎俩搬废料", result_continue: "继续当前行动结果",
    fallen_kill: "结束坠落者挣扎", fallen_abandon: "离开坠落者", claim_corpses: "领取三具尸体资源",
  };
  for (const [id, name] of Object.entries({ eddie: "艾迪", thomas: "托马斯", genichiro: "玄一螂", hollan: "霍兰", emperor: "小皇帝", mor: "莫尔", winnie: "温妮" })) actions[`talk_${id}`] = `与${name}交谈`;
  for (const id of ["sliceMudbank", "sliceFungus", "sliceClimbcourt", "slicePipe", "thomasCrossroads"]) actions[`open_${id}`] = `进入行动面板 ${id}`;
  global.WorldDialogueCatalog = Object.freeze({ actions: Object.freeze(actions) });
  if (typeof module !== "undefined" && module.exports) module.exports = global.WorldDialogueCatalog;
})(typeof window !== "undefined" ? window : globalThis);
