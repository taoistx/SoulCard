"use strict";

(() => {
  const SCHEMA_VERSION = 1;
  const MANIFEST_URL = new URL("battle-data/manifest.json", document.baseURI);
  let registry = null;
  let loadError = null;

  function fail(message) {
    throw new Error(`战斗数据配置错误：${message}`);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function requireNonEmptyString(value, field) {
    if (typeof value !== "string" || !value.trim()) fail(`${field} 必须是非空字符串`);
  }

  function requireInteger(value, field, minimum) {
    if (!Number.isInteger(value) || value < minimum) fail(`${field} 必须是大于等于 ${minimum} 的整数`);
  }

  async function fetchJson(url) {
    let response;
    try {
      response = await fetch(url, { cache: "no-store" });
    } catch (error) {
      if (window.location.protocol === "file:") {
        throw new Error("战斗数据无法从 file:// 页面加载，请通过本地静态服务器打开 index.html。", { cause: error });
      }
      throw new Error(`无法读取战斗数据 ${url.pathname}。`, { cause: error });
    }
    if (!response.ok) throw new Error(`无法读取战斗数据 ${url.pathname}（HTTP ${response.status}）。`);
    try {
      return await response.json();
    } catch (error) {
      throw new Error(`战斗数据 ${url.pathname} 不是有效 JSON。`, { cause: error });
    }
  }

  function validateSkill(skill, combatantId, index, knownSkillIds) {
    const field = `${combatantId}.skills[${index}]`;
    if (!isObject(skill)) fail(`${field} 必须是对象`);
    requireNonEmptyString(skill.id, `${field}.id`);
    if (!skill.id.startsWith(`${combatantId}_`)) fail(`${field}.id 必须以 ${combatantId}_ 开头`);
    if (knownSkillIds.has(skill.id)) fail(`技能 id 重复：${skill.id}`);
    knownSkillIds.add(skill.id);
    requireNonEmptyString(skill.name, `${field}.name`);
    requireNonEmptyString(skill.description, `${field}.description`);
    requireInteger(skill.damage, `${field}.damage`, 0);
    requireInteger(skill.windup, `${field}.windup`, 1);
  }

  function validateCombatant(config, expectedId, knownSkillIds) {
    if (!isObject(config)) fail(`${expectedId} 必须是对象`);
    if (config.schemaVersion !== SCHEMA_VERSION) fail(`${expectedId}.schemaVersion 必须为 ${SCHEMA_VERSION}`);
    if (config.id !== expectedId) fail(`manifest 中的 ${expectedId} 与文件 id ${config.id || "(空)"} 不一致`);
    if (typeof config.combatEnabled !== "boolean") fail(`${expectedId}.combatEnabled 必须是布尔值`);
    requireNonEmptyString(config.displayName, `${expectedId}.displayName`);
    requireNonEmptyString(config.role, `${expectedId}.role`);
    if (typeof config.intro !== "string") fail(`${expectedId}.intro 必须是字符串`);
    if (!Array.isArray(config.skills)) fail(`${expectedId}.skills 必须是数组`);

    if (!config.combatEnabled) {
      if (config.stats !== null) fail(`${expectedId} 禁用战斗时 stats 必须为 null`);
      if (config.skills.length) fail(`${expectedId} 禁用战斗时 skills 必须为空数组`);
      return;
    }

    if (!isObject(config.stats)) fail(`${expectedId}.stats 必须是对象`);
    requireInteger(config.stats.maxHp, `${expectedId}.stats.maxHp`, 1);
    requireInteger(config.stats.poise, `${expectedId}.stats.poise`, 1);
    if (!config.skills.length) fail(`${expectedId}.skills 至少需要一个技能`);
    config.skills.forEach((skill, index) => validateSkill(skill, expectedId, index, knownSkillIds));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  async function loadRegistry() {
    if (window.location.protocol === "file:") {
      throw new Error("战斗数据无法从 file:// 页面加载，请通过本地静态服务器打开 index.html。");
    }

    const manifest = await fetchJson(MANIFEST_URL);
    if (!isObject(manifest) || manifest.schemaVersion !== SCHEMA_VERSION) {
      fail(`manifest.schemaVersion 必须为 ${SCHEMA_VERSION}`);
    }
    if (!isObject(manifest.combatants) || !Object.keys(manifest.combatants).length) {
      fail("manifest.combatants 必须是非空对象");
    }

    const entries = Object.entries(manifest.combatants);
    entries.forEach(([id, path]) => {
      requireNonEmptyString(id, "manifest combatant id");
      requireNonEmptyString(path, `manifest.combatants.${id}`);
    });

    const configs = await Promise.all(entries.map(async ([id, path]) => {
      const url = new URL(path, MANIFEST_URL);
      return [id, await fetchJson(url)];
    }));
    const knownSkillIds = new Set();
    const loaded = {};
    configs.forEach(([id, config]) => {
      validateCombatant(config, id, knownSkillIds);
      loaded[id] = deepFreeze(config);
    });

    Object.keys(window.NPC_DIALOGUES || {}).forEach((npcId) => {
      if (!loaded[npcId]) fail(`NPC ${npcId} 缺少对应战斗角色配置`);
    });
    return Object.freeze(loaded);
  }

  const ready = loadRegistry().then(
    (loaded) => {
      registry = loaded;
      return loaded;
    },
    (error) => {
      loadError = error;
      console.error(error);
      return null;
    },
  );

  async function getCombatant(id) {
    await ready;
    if (loadError) throw loadError;
    const config = registry?.[id];
    if (!config) throw new Error(`未知战斗角色 id：${id}`);
    return config;
  }

  window.BattleData = Object.freeze({ ready, getCombatant });
})();
