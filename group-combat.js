"use strict";

// 0 = 贴身, 1 = 近距, 2 = 远距. A corpse keeps its last position until the next surge.
const GROUP_FORMATION = Object.freeze([
  { band: 0, x: 0, y: 0, z: -1.05 },
  { band: 1, x: -1.55, y: 0, z: -4.15 },
  { band: 1, x: 1.55, y: 0, z: -4.35 },
  { band: 2, x: -3.1, y: 0, z: -7.35 },
  { band: 2, x: .7, y: 0, z: -7.75 },
  { band: 2, x: 3.1, y: 0, z: -7.35 },
]);

const BAND_Z = [-1.05, -4.25, -7.55];

function createEnemyGroup(unitCount, unitHp, damagePerUnit) {
  return {
    units: Array.from({ length: unitCount }, (_, index) => ({
      id: index,
      hp: unitHp,
      maxHp: unitHp,
      alive: true,
      rank: index,
      ...(GROUP_FORMATION[index] || { band: 2, x: 0, y: 0, z: BAND_Z[2] }),
    })),
    damagePerUnit,
    recentKills: [],
    recentKillCount: 0,
    collapsed: false,
  };
}

function getAliveUnits(group) {
  return group.units.filter((unit) => unit.alive).sort((a, b) => a.band - b.band || b.z - a.z || a.rank - b.rank);
}

function getBandCounts(group) {
  const counts = [0, 0, 0];
  getAliveUnits(group).forEach((unit) => { counts[unit.band]++; });
  return counts;
}

function layoutFrontline(group) {
  for (let band = 0; band < 3; band++) {
    const units = getAliveUnits(group).filter((unit) => unit.band === band);
    const count = units.length;
    units.forEach((unit, index) => {
      const column = index - (count - 1) / 2;
      unit.x = column * (count > 3 ? .85 : band === 2 ? 3.1 : 1.5);
      unit.z = BAND_Z[band] + (count > 3 ? (index % 2 ? -.24 : .24) : (index % 2 ? -.12 : .12));
    });
  }
}

function advanceFrontline(group) {
  getAliveUnits(group).forEach((unit) => { unit.band = Math.max(0, unit.band - 1); });
  layoutFrontline(group);
  return getBandCounts(group);
}

function retreatFrontline(group) {
  getAliveUnits(group).forEach((unit) => { unit.band = Math.min(2, unit.band + 1); });
  layoutFrontline(group);
  return getBandCounts(group);
}

function getAliveCount(group) {
  return getAliveUnits(group).length;
}

function getGroupCurrentHP(group) {
  return group.units.reduce((total, unit) => total + unit.hp, 0);
}

function getGroupAttackDamage(group) {
  return getAliveCount(group) * group.damagePerUnit;
}

function getGroupEventDamage(group, action) {
  if (action === "bite") return Math.min(2, getBandCounts(group)[0]) * group.damagePerUnit;
  if (action === "encircle") return getAliveCount(group) >= 4 ? getGroupAttackDamage(group) : 0;
  return 0;
}

function applySequentialDamage(group, amount) {
  let remaining = Math.max(0, amount);
  let dealt = 0;
  const hit = [];
  const killed = [];
  for (const unit of getAliveUnits(group)) {
    if (remaining <= 0) break;
    const damage = Math.min(unit.hp, remaining);
    unit.hp -= damage;
    remaining -= damage;
    dealt += damage;
    hit.push(unit.id);
    if (unit.hp === 0) {
      unit.alive = false;
      killed.push(unit.id);
    }
  }
  return { dealt, hit, killed };
}

function applySpreadDamage(group, targetCount, damagePerTarget) {
  let dealt = 0;
  const hit = [];
  const killed = [];
  for (const unit of getAliveUnits(group).slice(0, targetCount)) {
    const damage = Math.min(unit.hp, Math.max(0, damagePerTarget));
    unit.hp -= damage;
    dealt += damage;
    if (damage > 0) hit.push(unit.id);
    if (unit.hp === 0) {
      unit.alive = false;
      killed.push(unit.id);
    }
  }
  return { dealt, hit, killed };
}

function recordCardKills(group, kills) {
  group.recentKills.push(kills);
  if (group.recentKills.length > 3) group.recentKills.shift();
  group.recentKillCount = group.recentKills.reduce((sum, count) => sum + count, 0);
  if (group.collapsed || group.recentKillCount < 3 || getAliveCount(group) === 0) return false;
  group.collapsed = true;
  return true;
}

const GroupCombat = Object.freeze({
  createEnemyGroup, getAliveUnits, getAliveCount, getBandCounts, getGroupCurrentHP,
  getGroupAttackDamage, getGroupEventDamage, advanceFrontline, retreatFrontline,
  applySequentialDamage, applySpreadDamage, recordCardKills,
});

if (typeof module !== "undefined" && module.exports) module.exports = GroupCombat;
if (typeof window !== "undefined") window.GroupCombat = GroupCombat;
