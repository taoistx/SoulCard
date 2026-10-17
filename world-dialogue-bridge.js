"use strict";

// Only this adapter connects authored world dialogue to existing World operations.
function worldDialogueContext(context = {}) {
  const location = context.location || getCurrentNode();
  const progress = context.eventId ? world.eventStates[context.eventId] : null;
  const resultText = context.resultText ?? (progress ? actionResultText(progress) : "");
  const localFlags = {
    dialogueDamage: context.damage || 0,
    dialogueNpcLocationKnown: Boolean(context.assignedNode),
    dialogueResultDismissible: Boolean(context.resultDismissible),
    dialogueBattleAction: Boolean(context.battleAction),
    dialogueRewardClaimed: Boolean(progress?.rewardClaimed),
    dialogueHasResult: Boolean(resultText),
    dialogueMetalDistract: progress?.outcome === "metal_distract",
    dialogueMistSafe: getFlag("mistSafeDay") === world.day,
    dialogueInfectedCorpse: context.eventId === "thomasCrossroads" && Boolean(getFlag("thomasInfectedCorpse")),
  };
  return {
    ...getNpcDialogueContext(), nodeId: location?.id || "", nodeLabel: location?.label || "",
    churchArrivalDay: getFlag("churchArrivalDay"), damage: context.damage || 0,
    resultText, eventName: window.ActionEventData.get(context.eventId)?.name || "",
    deathReason: context.deathReason || "",
    npcName: context.npcName || "", npcWhereabouts: context.assignedNode?.label || "",
    cardName: context.cardName || "", cardIndex: context.cardIndex || "",
    getFlag: (key) => Object.hasOwn(localFlags, key) ? localFlags[key] : getFlag(key),
  };
}

function worldDialogueActionEnabled(action, context = {}) {
  if (!action) return true;
  if (!Object.hasOwn(window.WorldDialogueCatalog.actions, action)) return false;
  if (action === "shop_eddie") return canAccessWorldShop("eddie");
  if (action.startsWith("talk_")) {
    const id = action.slice(5);
    return Boolean(window.NpcDialogueData.get(id)) && !getFlag(`${id}Killed`);
  }
  if (["search_hut", "gate_key", "gate_path", "gate_fight"].includes(action) && !canSpendStamina()) return false;
  if (action === "search_hut") return !getFlag("searchedHouse");
  if (action === "gate_key") return hasItem("oldKey") && !getFlag("bridgeOpened");
  if (action === "gate_path") return Boolean(getFlag("foundSecretPath")) && !getFlag("bridgeOpened");
  if (action === "take_upper_material") return world.currentNodeId === "slice_drybench" && !getFlag("upperMaterialTaken");
  if (action === "move_local_waste") return !getFlag("localWasteMoved");
  if (action === "choose_waste_card") {
    const card = world.deck.find((c) => c.instanceId === context.cardInstanceId);
    return ["localWasteMoved", "emperorWasteMoved"].includes(context.wasteFlag) && !getFlag(context.wasteFlag) && Boolean(card && card.cardId !== "focus" && window.BattleBridge.getCardCatalog()[card.cardId]?.type === "technique");
  }
  if (action === "result_continue") return typeof context.continueAction === "function";
  if (["fallen_kill", "fallen_abandon"].includes(action)) return Boolean(world.eventStates.fallenSurvivor && !world.eventStates.fallenSurvivor.resolved);
  if (action === "claim_corpses") return Boolean(world.eventStates.corpseDispute?.threeCorpses && !world.eventStates.corpseDispute.rewardClaimed);
  return true;
}

async function runWorldDialogueAction(action, context) {
  if (!worldDialogueActionEnabled(action, context)) return false;
  if (action.startsWith("talk_")) {
    const id = action.slice(5);
    if (id === "genichiro") setFlag("genichiroSawPlayer", true);
    showNpcDialogue(id); return true;
  }
  if (action.startsWith("open_")) { openV06Event(action.slice(5), context.location || getCurrentNode(), context.arrivalPaid); return true; }
  switch (action) {
    case "shop_eddie": return openWorldShop("eddie");
    case "restart": startNewRun(); break;
    case "finish_ending": v06EndingActive = false; closeWorldModal(); break;
    case "enter_church": showV06Ending(); break;
    case "escape_plane": setFlag("escapedPlane", true); showWorldDialogue("ending_escape"); break;
    case "gate_fight": return Boolean(await runBattle("guard", "gate"));
    case "gate_key": case "gate_path":
      if (!spendStamina()) return false;
      setFlag("bridgeOpened", true); showWorldDialogue("gate"); break;
    case "search_hut": {
      if (!spendStamina()) return false;
      const damage = Math.floor(Math.random() * 6);
      world.hp = Math.max(1, world.hp - damage);
      addItem("ritualScrap"); addCard("delay"); setFlag("searchedHouse", true);
      showWorldDialogue("hut", "reward", { ...context, damage }); break;
    }
    case "take_upper_material": return v06TakeUpperMaterial();
    case "move_local_waste": return v06ChooseWasteCard("localWasteMoved");
    case "choose_waste_card": {
      const card = world.deck.find((c) => c.instanceId === context.cardInstanceId);
      card.fatigue++; setFlag(context.wasteFlag, true); showV06Site(getCurrentNode()); break;
    }
    case "result_continue": await context.continueAction(); break;
    case "fallen_kill": case "fallen_abandon": {
      const progress = world.eventStates.fallenSurvivor, kill = action === "fallen_kill";
      progress.outcome = kill ? "fallen_kill" : "fallen_abandon";
      setFlag(kill ? "fallenKilled" : "fallenAbandoned", true);
      rememberActionResult(progress, { resultDialogueId: "event_fallenSurvivor", resultNodeId: kill ? "killed" : "abandoned" });
      completeActionEvent("fallenSurvivor");
      showWorldDialogue(progress.resultDialogueId, progress.resultNodeId, { eventId: "fallenSurvivor" }); break;
    }
    case "claim_corpses": {
      const progress = world.eventStates.corpseDispute;
      progress.rewardClaimed = true; progress.outcome = "dispute_three_corpses"; progress.resolved = true;
      addItem("rottenFlesh", 3);
      rememberActionResult(progress, { resultDialogueId: "event_corpseDispute", resultNodeId: "claimed" });
      renderWorld(); showWorldDialogue(progress.resultDialogueId, progress.resultNodeId, { eventId: "corpseDispute" }); break;
    }
    default: return false;
  }
  return true;
}

function showWorldDialogue(dialogueId, nodeId = null, context = {}, enter = true) {
  const runtime = window.NPCDialogueRuntime, script = window.WorldDialogueData.get(dialogueId);
  if (!script) throw new Error(`未知世界对话：${dialogueId}`);
  const resolvedId = nodeId || runtime.resolveStart(script, worldDialogueContext(context));
  let resolved = runtime.resolveNode(script, resolvedId, worldDialogueContext(context));
  if (!resolved) throw new Error(`世界对话 ${dialogueId} 缺少节点 ${resolvedId}`);
  if (enter && !runtime.applyEffects(resolved.effects, worldDialogueContext(context))) {
    showWorldModal({ title: "无法继续", bodyText: "所需物品不足，未执行对话效果。" }); return;
  }
  if (enter && resolved.onEnter) {
    runWorldDialogueAction(resolved.onEnter, context).then((completed) => {
      if (completed === false) showWorldModal({ title: "无法继续", bodyText: "当前状态无法执行入口动作。" });
    }).catch((error) => { console.error(error); showWorldModal({ title: "无法继续", bodyText: error.message }); });
    return;
  }
  resolved = runtime.resolveNode(script, resolvedId, worldDialogueContext(context));
  showWorldModal({
    kicker: resolved.kicker, title: resolved.title, bodyText: resolved.body, allowClose: resolved.allowClose,
    options: expandWorldDialogueOptions(resolved.options, script.nodes[resolvedId], context).map(({ option, actionContext }) => ({
      label: option.label, hint: option.hint,
      enabled: option.enabled && worldDialogueActionEnabled(option.action, actionContext), close: false,
      action: async () => {
        const fresh = worldDialogueContext(actionContext);
        if (!runtime.evaluateCondition(option.visibleWhen, fresh) || !runtime.evaluateCondition(option.enabledWhen, fresh) || !worldDialogueActionEnabled(option.action, context) || !v06CanApplyEffects(option.effects || [])) {
          return showWorldDialogue(dialogueId, resolvedId, context, false);
        }
        if (option.action && await runWorldDialogueAction(option.action, actionContext) === false) return showWorldDialogue(dialogueId, resolvedId, context, false);
        if (!runtime.applyEffects(option.effects || [], worldDialogueContext(actionContext))) return showWorldDialogue(dialogueId, resolvedId, context, false);
        if (option.next) showWorldDialogue(dialogueId, option.next, actionContext);
        else if (!option.action) closeWorldModal();
      },
    })),
  });
}

function actionResultText(source) {
  if (!source?.resultDialogueId) return source?.resultText ?? source?.result ?? "";
  const script = window.WorldDialogueData.get(source.resultDialogueId);
  return window.NPCDialogueRuntime.resolveNode(script, source.resultNodeId, getNpcDialogueContext())?.body || "";
}

function rememberActionResult(progress, recipe) {
  if (recipe.resultDialogueId) {
    progress.resultDialogueId = recipe.resultDialogueId; progress.resultNodeId = recipe.resultNodeId;
    delete progress.resultText;
  } else {
    delete progress.resultDialogueId; delete progress.resultNodeId; progress.resultText = recipe.result || "";
  }
}

// The callback remains the existing World continuation; editable JSON selects it by name.
function showActionResult(source, modal, context = {}) {
  if (!source.resultDialogueId) return showWorldModal({ ...modal, bodyText: actionResultText(source) });
  const continueAction = modal.options?.[0]?.action;
  showWorldDialogue(source.resultDialogueId, source.resultNodeId, { ...context, continueAction, resultDismissible: modal.allowClose !== false, battleAction: modal.options?.[0]?.label === "面对粪怪" });
}

function expandWorldDialogueOptions(options, node, context) {
  const runtime = window.NPCDialogueRuntime, catalog = window.BattleBridge.getCardCatalog();
  return options.flatMap((option) => {
    if (option.repeat !== "wasteCards") return [{ option, actionContext: context }];
    const template = node.options.find((raw) => raw.id === option.id);
    return world.deck.flatMap((card, index) => {
      if (catalog[card.cardId]?.type !== "technique" || card.cardId === "focus") return [];
      const actionContext = { ...context, cardInstanceId: card.instanceId, cardName: catalog[card.cardId].name, cardIndex: index + 1 };
      const fresh = worldDialogueContext(actionContext);
      return [{ option: { ...option, label: runtime.resolveText(template.label, fresh), hint: runtime.resolveText(template.hint || "", fresh) }, actionContext }];
    });
  });
}
