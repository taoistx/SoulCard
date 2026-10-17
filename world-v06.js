"use strict";

// 沿沉积山抵达教堂。沿用既有具名接入接口；故事不依赖路径锁。
const V06_NODE_IDS = new Set(["start", "eddie", "slice_mudbank", "node", "slice_emperor_yard", "node3", "slice_fungus_edge", "slice_climbcourt", "slice_pipe_seam", "slice_drybench", "slice_church_approach", "slice_church_nave"]);
const V06_EVENT_IDS = new Set(["sliceMudbank", "sliceFungus", "sliceClimbcourt", "slicePipe"]);
const V06_SITE_EVENTS = { slice_mudbank: "sliceMudbank", slice_fungus_edge: "sliceFungus", slice_climbcourt: "sliceClimbcourt", slice_pipe_seam: "slicePipe" };
const V06_UPPER_NODES = new Set(["slice_drybench", "slice_church_approach", "slice_church_nave"]);
let v06EndingActive = false;

function v06InitialFlags() {
  return { thomasLocation: "node", thomasPlan: "none", thomasRescue: "unresolved", thomasWound: "none", thomasPrepared: false,
    genichiroLocation: "node3", genichiroWound: "none", genichiroSawPlayer: false, hollanLocation: "slice_drybench",
    mudbankHarvest: "none", courtPassToken: false, sliceDaySettled: 1, npcBattlePrepaidNode: null };
}
function v06HasProtection() {
  return !world.sacrificed.head && ["eddieMistWrap", "oldMistWrap"].includes(world.equipment.head);
}
function v06CourtSafe() { return getFlag("courtSwarmCleared") || getFlag("courtPassToken"); }
function v06UsesSiteEntry(node) {
  const entries = WORLD_EVENT_SETS[node?.eventSetId]?.entries;
  return V06_NODE_IDS.has(node?.id) && entries?.length === 1 && entries[0].kind === "dialogue" && entries[0].dialogueId === `site_${node.id}`;
}
function v06EntryDamage(fromId, toId) {
  if (!v06UsesSiteEntry(NODE_BY_ID.get(toId))) return 0;
  const mist = toId === "slice_fungus_edge" ? 3 : toId === "slice_climbcourt" ? 4 : 0;
  // 已揭示节点自由到达。穿行只改变成本，不以连线、事件或邻接条件拒绝移动。
  const crossing = toId === "slice_drybench" && !V06_UPPER_NODES.has(fromId) && !getFlag("pipeOpened") && !v06CourtSafe()
    ? (getFlag("narrowFootholdsKnown") ? 4 : 6) : 0;
  return (v06HasProtection() ? 0 : mist) + crossing;
}
function v06RouteCost(route) {
  const toId = route.at(-1);
  return { hp: route.length > 1 ? v06EntryDamage(route[0], toId) : 0,
    stamina: route.length > 1 && !world.exploredNodes.has(toId) ? 1 : 0 };
}
function v06OnMove(fromId, toId, damage) {
  world.flags.npcBattlePrepaidNode = null;
  world.hp = Math.max(0, world.hp - damage);
  if (["slice_fungus_edge", "slice_climbcourt"].includes(toId)) {
    if (v06HasProtection()) { if (world.equipment.head === "eddieMistWrap") world.flags.wrapTested = true; }
    else if (damage) world.flags.mistFirstExposure = true;
  }
  if (fromId === "slice_climbcourt" || toId === "slice_drybench") world.flags.courtPassToken = false;
  if (toId === "slice_drybench") world.flags.passedMidSlope = true;
}
function v06ShowDeath(source) {
  world.hp = 0; activeActionEvent = null; window.ActionEventPanel.close(); renderWorld();
  if (source === "terrain") return showWorldDialogue("ending_death", "terrain");
  showWorldDialogue("ending_death", "root", { deathReason: typeof source === "string" ? source : actionResultText(source) });
}

function v06Option(label, action, hint = "", enabled = true) { return { label, action, hint, enabled }; }
function v06AtSite(npcId, nodeId) { return !getFlag(`${npcId}Killed`) && getFlag(`${npcId}Location`) === nodeId; }
function v06TakeUpperMaterial() {
  if (world.currentNodeId !== "slice_drybench" || getFlag("upperMaterialTaken")) return false;
  world.flags.upperMaterialTaken = true; addItem("mistWrapMaterial"); showV06Site(getCurrentNode()); return true;
}
function showV06Ending() {
  v06EndingActive = true;
  if (!getFlag("sliceComplete")) { world.flags.sliceComplete = true; world.flags.churchReached = true; world.flags.churchArrivalDay = world.day; }
  showWorldDialogue("ending_church");
}

function showV06Completion() { showWorldDialogue("ending_church", "complete"); }

function showV06Site(node, arrivalPaid = false) {
  const id = node.id;
  if (arrivalPaid && ["eddie", "node3"].includes(id)) world.flags.npcBattlePrepaidNode = id;
  showWorldDialogue(`site_${id}`, null, { location: node, arrivalPaid });
}

function v06CanApplyEffects(effects) {
  const costs = new Map();
  for (const e of effects) if (e.type === "removeItem") costs.set(e.itemId, (costs.get(e.itemId) || 0) + (e.amount || 1));
  return [...costs].every(([id, amount]) => hasItem(id, amount));
}

function v06ActionEnabled(action) {
  if (action === "mud_cut") return getFlag("mudbankHarvest") === "none";
  if (action === "salvage_take") return !getFlag("wrapMaterialTaken");
  if (action === "fungus_search") return !getFlag("pipeFound");
  if (["pipe_open", "pipe_cut"].includes(action)) return !getFlag("pipeOpened");
  if (["court_battle", "court_hold", "court_bait"].includes(action)) return !getFlag("courtSwarmCleared") && !getFlag("courtPassToken");
  return true;
}

function openV06Event(eventId, node, prepaid = false) {
  const source = window.ActionEventData.get(eventId);
  if (!source || world.hp <= 0) return;
  const progress = world.eventStates[eventId] ||= { nodeId: node.id, stage: source.start, resolved: false };
  progress.prepaid = Boolean(progress.prepaid || prepaid);
  const event = structuredClone(source);
  for (const stage of Object.values(event.stages)) stage.recipes = stage.recipes.filter((r) => v06ActionEnabled(r.action));
  if (eventId === "sliceMudbank" && progress.stage === "opening") {
    if (getFlag("mudbankHarvest") !== "none") event.stages.opening.body = event.stages.opening.body.replace("一具新近死去的坠落者卡在石边，甲缝还没有白丝", "石边的遗体留下取肉的切痕，已没有可再取的完整肉块");
    if (getFlag("wrapMaterialTaken")) event.stages.opening.body = event.stages.opening.body.replace("露出一片半透明的旧衬膜", "只剩剥去衬膜后的空腔");
  }
  if (eventId === "sliceClimbcourt" && getFlag("courtPassToken")) event.stages.opening.body = "你已经挪到狭道上端，下侧怪物仍在翻找残骸。眼前就是检修台，可以趁这次机会继续走。";
  activeActionEvent = { eventId, nodeId: node.id, submitting: false };
  interactionLocked = true;
  elsWorld.modal.classList.add("hidden");
  window.ActionEventPanel.open({ event, stage: progress.stage, owned: eventResources(), lethalHpCost: true,
    match: (placements) => {
      const match = window.ActionEventRuntime.match(event, progress.stage, placements, eventResources(), evaluateWorldCondition);
      if (!match.valid) return match;
      const cost = (match.recipe.staminaCost || 0) + (v06ActionEnemy(eventId, match.recipe.action) && !progress.prepaid ? 1 : 0);
      return canSpendStamina(cost)
        ? { ...match, recipe: { ...match.recipe, staminaCost: cost } }
        : { valid: false, reason: `额外体力不足（需要${cost}点）；没有消耗任何资源。` };
    },
    submit: (placements) => submitV06Action(eventId, placements),
    leave: () => closeV06Event(),
  });
}

function closeV06Event() {
  if (activeActionEvent?.submitting) return false;
  if (activeActionEvent) world.eventStates[activeActionEvent.eventId].prepaid = false;
  activeActionEvent = null;
  interactionLocked = false;
  window.ActionEventPanel.close(); renderWorld();
  return true;
}

async function submitV06Action(eventId, placements) {
  if (!activeActionEvent || activeActionEvent.eventId !== eventId || activeActionEvent.submitting) return;
  const event = window.ActionEventData.get(eventId), progress = world.eventStates[eventId];
  const match = window.ActionEventRuntime.match(event, progress.stage, placements, eventResources(), evaluateWorldCondition);
  if (!match.valid) throw new Error(match.reason || "资源或组合已失效");
  if (!v06ActionEnabled(match.recipe.action)) throw new Error("场地已经改变，不能重复执行旧操作。");
  return commitV06Action(eventId, match.recipe, match.chosen);
}

function v06ActionEnemy(eventId, action) {
  if (action === "court_battle") return "dung_swarm";
  if (eventId === "thomasCrossroads" && ["kill_thomas", "kill_thomas_and_attack_dung", "attack_dung", "observe_infected", "protect_thomas"].includes(action)) return window.ActionEventData.get(eventId).enemyId;
  return null;
}

async function commitV06Action(eventId, recipe, chosen) {
  const progress = world.eventStates[eventId];
  if (!activeActionEvent || activeActionEvent.eventId !== eventId || activeActionEvent.submitting || !progress || world.hp <= 0) return false;
  const battleEnemy = v06ActionEnemy(eventId, recipe.action);
  const staminaCost = recipe.staminaCost || 0;
  if (!canSpendStamina(staminaCost + (battleEnemy && !progress.prepaid ? 1 : 0))) throw new Error("体力不足，本次行动未执行。");
  const removals = new Map();
  chosen.filter((r) => r.kind === "item").forEach((r) => removals.set(r.id, (removals.get(r.id) || 0) + 1));
  for (const effect of recipe.effects || []) if (effect.type === "removeItem") removals.set(effect.itemId, (removals.get(effect.itemId) || 0) + (effect.amount || 1));
  if ([...removals].some(([id, count]) => !hasItem(id, count))) throw new Error("物品不足，本次行动未执行。");
  const snapshot = structuredClone(world);
  activeActionEvent.submitting = true;
  try {
    for (const r of chosen) {
      if (r.kind === "card") {
        const card = world.deck.find((c) => c.instanceId === r.instanceId);
        if (!card) throw new Error("卡牌副本已失效");
        card.fatigue++;
      } else if (r.kind === "item" && !removeItem(r.id)) throw new Error("物品不足");
    }
    if (!applyDialogueEffects(recipe.effects || [])) throw new Error("后果所需资源不足");
    world.stamina -= staminaCost;
    world.hp = Math.max(0, world.hp - (recipe.hpCost || 0));
    if (recipe.next) progress.stage = recipe.next;
    progress.outcome = recipe.action;
    rememberActionResult(progress, recipe);
    applyV06Action(recipe.action, progress);
    if (world.hp <= 0) { v06ShowDeath(recipe); return true; }
    window.ActionEventPanel.close();
    if (battleEnemy) {
      const result = await runBattle(battleEnemy, `${eventId}_monster`, {
        prepaid: progress.prepaid, openingDelay: ["attack_dung", "kill_thomas_and_attack_dung"].includes(recipe.action) ? 4 : 0,
      });
      if (!result) throw new Error("战斗未能开始，本次行动已撤销。");
      if (result.result === "Win") {
        if (eventId === "sliceClimbcourt") world.flags.courtSwarmCleared = true;
        if (eventId === "thomasCrossroads") v06ResolveThomas("rescued");
      } else if (result.result === "Escape") {
        if (eventId === "thomasCrossroads") { world.flags.thomasWound = "minor"; world.flags.thomasRescue = "unresolved"; }
        progress.prepaid = false;
      }
      activeActionEvent = null; interactionLocked = false; renderWorld();
      if (result.result === "Lose") return true;
      if (result.result === "Escape") return true;
    }
  } catch (error) {
    world = snapshot;
    activeActionEvent = { eventId, nodeId: progress.nodeId, submitting: false };
    showWorldModal({ title: "行动未完成", bodyText: error.message, allowClose: false,
      options: [{ label: "返回行动选择", action: () => openV06Event(eventId, NODE_BY_ID.get(progress.nodeId), snapshot.eventStates[eventId].prepaid) }] });
    return false;
  }
  activeActionEvent = null; interactionLocked = false; renderWorld();
  showActionResult(recipe, { kicker: "行动结果", title: window.ActionEventData.get(eventId).name,
    allowClose: true, options: [v06Option("继续", () => {
      if (eventId === "thomasCrossroads" && getFlag("thomasRescue") === "rescued" && !getFlag("thomasKilled")) return showNpcDialogue("thomas");
      showV06Site(getCurrentNode());
    })] });
  return true;
}

function v06ResolveThomas(outcome) {
  world.flags.thomasRescue = getFlag("thomasKilled") ? "dead" : outcome;
  world.eventStates.thomasCrossroads.resolved = true;
  world.flags.thomasStayed = !getFlag("thomasKilled");
}

function applyV06Action(action, progress) {
  const flag = (key, value = true) => { world.flags[key] = value; };
  switch (action) {
    case "mud_cut": {
      if (getFlag("mudbankHarvest") !== "none") throw new Error("石边的肉已经取过。");
      flag("mudbankHarvest", "flesh");
      addItem("freshFlesh"); break;
    }
    case "mud_observe": break;
    case "salvage_take":
      if (getFlag("wrapMaterialTaken")) throw new Error("废壳中的衬膜已取走。");
      flag("wrapMaterialTaken"); addItem("mistWrapMaterial"); break;
    case "fungus_search": flag("pipeFound"); break;
    case "court_observe": flag("narrowFootholdsKnown"); break;
    case "court_hold": case "court_bait": flag("courtPassToken"); break;
    case "pipe_observe": flag("pipeRouteKnown"); break;
    case "pipe_open": case "pipe_cut": flag("pipeOpened"); flag("pipeRouteKnown"); progress.resolved = true; break;
    case "court_battle": break;
    case "observe_dung": flag("thomasInfected"); flag("thomasWound", "minor"); world.knowledge.dungLore = true; flag("knowsDungLore"); break;
    case "kill_thomas": case "kill_thomas_and_attack_dung": case "observe_infected":
      flag("thomasKilled"); flag("thomasLocation", null); flag("thomasRescue", "dead"); break;
    case "attack_dung": case "protect_thomas": break;
    case "lure_dung": case "trap_dung": flag("thomasMonsterDiverted"); v06ResolveThomas("rescued"); break;
    default: throw new Error(`未登记切片动作：${action}`);
  }
}

function advanceV06Day() {
  if (getFlag("sliceDaySettled") >= world.day) return;
  const f = world.flags;
  f.sliceDaySettled = world.day; f.npcBattlePrepaidNode = null; f.courtPassToken = false;
  if (f.thomasKilled) f.thomasLocation = null;
  else {
    const previous = f.thomasLocation;
    if (f.thomasRescue === "unresolved") { f.thomasRescue = "self_fled"; f.thomasWound = "minor"; f.thomasLocation = "eddie"; f.thomasResentful = true; if (world.eventStates.thomasCrossroads) world.eventStates.thomasCrossroads.resolved = true; }
    else if (f.thomasPlan === "camp") { if (f.eddieKilled) { f.thomasPlan = "none"; f.thomasLocation = "slice_emperor_yard"; } else f.thomasLocation = "eddie"; }
    else if (f.thomasPlan === "stop") f.thomasLocation = "slice_drybench";
    else if (f.thomasPlan === "climb") f.thomasLocation = previous === "slice_drybench" && f.thomasPrepared ? "slice_church_approach" : previous === "slice_church_approach" ? previous : "slice_drybench";
    else if (world.day >= 3) f.thomasLocation = "slice_emperor_yard";
    if (previous !== f.thomasLocation) f.thomasTravelled = true;
    if (["minor", "serious"].includes(f.thomasWound) && world.day >= 3) f.thomasWound = "serious";
    if (["minor", "serious"].includes(f.thomasWound) && f.thomasAidGiven && !f.thomasAidUsed) { f.thomasWound = "treated"; f.thomasTreated = true; f.thomasAidUsed = true; }
  }
  if (f.genichiroKilled) f.genichiroLocation = null;
  else {
    f.genichiroTravelled = true;
    f.genichiroLocation = world.day === 2 ? "slice_drybench" : world.day === 3 ? "slice_church_approach" : "slice_drybench";
    if (!f.genichiroTreated) {
      // 伤来自到平台之前的狭道；提前清怪/开槽会真正帮助后来登山的人。
      if (world.day === 2 && !f.pipeOpened && !f.courtSwarmCleared) f.genichiroWound = "minor";
      if (world.day >= 4 && f.genichiroWound === "minor") f.genichiroWound = "serious";
      if (["minor", "serious"].includes(f.genichiroWound) && f.genichiroAidGiven) {
        f.genichiroWound = "treated"; f.genichiroTreated = true; f.genichiroAidUsed = true;
      }
    }
  }
  f.eddieWorkShrunk = !f.localWasteMoved && !f.eddieWorkProtected && f.thomasLocation !== "eddie";
  f.emperorGuardsAdded = !f.emperorWasteMoved; f.winnieTrading = world.day >= 3; f.morTipOutdated = world.day >= 2;
  f.hollanLocation = world.day % 2 === 0 ? "hunting" : "slice_drybench";
}

function v06NpcOptionEnabled(npcId, action) {
  if (!action?.startsWith("v06_")) return true;
  if (!action.startsWith(`v06_${npcId}_`) || getFlag(`${npcId}Killed`)) return false;
  if (action === "v06_thomas_camp") return !getFlag("eddieKilled");
  if (action === "v06_mor_buy") return hasItem("freshFlesh") && !getFlag("morTipBought");
  if (action === "v06_thomas_route") return getFlag("pipeOpened") || getFlag("narrowFootholdsKnown");
  if (action === "v06_thomas_protection") return hasItem("eddieMistWrap") || hasItem("oldMistWrap");
  if (["v06_thomas_bandage", "v06_genichiro_bandage"].includes(action)) return hasItem("mistWrapMaterial") && ["minor", "serious"].includes(getFlag(`${npcId}Wound`));
  if (["v06_thomas_supply", "v06_genichiro_supply"].includes(action)) return hasItem("mistWrapMaterial") && !getFlag(`${npcId}AidGiven`);
  if (action === "v06_genichiro_exposure") return getFlag("mistFirstExposure");
  if (action === "v06_mor_challenge") return getFlag("narrowFootholdsKnown") || getFlag("pipeRouteKnown");
  if (action === "v06_emperor_waste") return !getFlag("emperorWasteMoved") && world.deck.some((c) => window.BattleBridge.getCardCatalog()[c.cardId]?.type === "technique" && c.cardId !== "focus");
  if (action === "v06_hollan_respect") return world.battlesWon > 0;
  if (action === "v06_hollan_material") return getFlag("hollanRespect") && !getFlag("hollanMaterialTaken") && hasItem("freshFlesh");
  return true;
}

function v06NpcBattlePrepaid(action) {
  return ["fight_eddie", "v06_genichiro_fight"].includes(action) && getFlag("npcBattlePrepaidNode") === world.currentNodeId;
}

function v06ChooseWasteCard(key) {
  if (!["localWasteMoved", "emperorWasteMoved"].includes(key) || getFlag(key)) return false;
  showWorldDialogue("world_waste", null, { wasteFlag: key });
  return true;
}

async function runV06NpcAction(npcId, action) {
  if (!v06NpcOptionEnabled(npcId, action)) return false;
  const f = world.flags;
  switch (action) {
    case "v06_eddie_salvage": f.driftBayTold = true; break;
    case "v06_thomas_camp": f.thomasPlan = "camp"; break;
    case "v06_thomas_climb": f.thomasPlan = "climb"; break;
    case "v06_thomas_stop": f.thomasPlan = "stop"; break;
    case "v06_thomas_route": f.thomasPrepared = true; f.thomasRouteTold = true; break;
    case "v06_thomas_protection": {
      const id = hasItem("eddieMistWrap") ? "eddieMistWrap" : "oldMistWrap";
      if (world.equipment.head === id) unequipSlot("head");
      removeItem(id); f.thomasPrepared = true; f.thomasProtectionGiven = true; break;
    }
    case "v06_thomas_supply": case "v06_genichiro_supply":
      removeItem("mistWrapMaterial"); f[`${npcId}AidGiven`] = true;
      if (npcId === "thomas") f.thomasPrepared = true;
      break;
    case "v06_thomas_bandage": case "v06_genichiro_bandage":
      removeItem("mistWrapMaterial"); f[`${npcId}Wound`] = "treated"; f[`${npcId}Treated`] = true;
      if (npcId === "thomas") f.thomasPrepared = true;
      break;
    case "v06_genichiro_exposure": f.genichiroToldExposure = true; break;
    case "v06_genichiro_fight": {
      const result = await runBattle("genichiro", "genichiro", { prepaid: v06NpcBattlePrepaid(action) });
      if (result) f.npcBattlePrepaidNode = null;
      if (!result || result.result !== "Win") return false;
      f.genichiroLocation = null;
      if (!f.genichiroProtectionLooted) { addItem("oldMistWrap"); addItem("freshFlesh"); f.genichiroProtectionLooted = true; }
      showV06Site(getCurrentNode()); return true;
    }
    case "v06_winnie_teach": f.winnieSacrificeTaught = true; break;
    case "v06_mor_buy": removeItem("freshFlesh"); f.morTipBought = true; break;
    case "v06_mor_challenge": f.morChallenged = true; break;
    case "v06_emperor_waste": return v06ChooseWasteCard("emperorWasteMoved");
    case "v06_hollan_respect": f.hollanRespect = true; break;
    case "v06_hollan_material": removeItem("freshFlesh"); addItem("mistWrapMaterial"); f.hollanMaterialTaken = true; break;
    default: return false;
  }
  renderWorld();
  return true;
}

