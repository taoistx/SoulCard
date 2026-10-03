const test = require("node:test");
const assert = require("node:assert/strict");
const GroupCombat = require("../group-combat.js");

function group() { return GroupCombat.createEnemyGroup(6, 12, 2); }

test("frontline starts 1 / 2 / 3 and group events use live positions", () => {
  const enemy = group();
  assert.deepEqual(GroupCombat.getBandCounts(enemy), [1, 2, 3]);
  assert.equal(GroupCombat.getGroupEventDamage(enemy, "bite"), 2);
  assert.equal(GroupCombat.getGroupEventDamage(enemy, "surge"), 0);
  assert.equal(GroupCombat.getGroupEventDamage(enemy, "encircle"), 12);
  GroupCombat.advanceFrontline(enemy);
  assert.deepEqual(GroupCombat.getBandCounts(enemy), [3, 3, 0]);
  assert.equal(GroupCombat.getGroupEventDamage(enemy, "bite"), 4);
  GroupCombat.advanceFrontline(enemy);
  assert.deepEqual(GroupCombat.getBandCounts(enemy), [6, 0, 0]);
  GroupCombat.retreatFrontline(enemy);
  assert.deepEqual(GroupCombat.getBandCounts(enemy), [0, 6, 0]);
  assert.equal(GroupCombat.getGroupEventDamage(enemy, "bite"), 0);
});

test("kills leave a frontline gap until a surge, and the nearest band takes damage", () => {
  const enemy = group();
  const corpsePosition = { x: enemy.units[0].x, z: enemy.units[0].z };
  GroupCombat.applySequentialDamage(enemy, 12);
  assert.deepEqual(GroupCombat.getBandCounts(enemy), [0, 2, 3]);
  assert.deepEqual({ x: enemy.units[0].x, z: enemy.units[0].z }, corpsePosition);
  assert.equal(GroupCombat.getGroupEventDamage(enemy, "bite"), 0);
  GroupCombat.advanceFrontline(enemy);
  assert.deepEqual(GroupCombat.getBandCounts(enemy), [2, 3, 0]);
  assert.deepEqual(GroupCombat.applySequentialDamage(enemy, 3).hit, [1]);
  assert.equal(GroupCombat.getGroupEventDamage(enemy, "bite"), 4);
});

test("within one band, sequential damage chooses the sprite closest to the camera", () => {
  const enemy = group();
  GroupCombat.applySequentialDamage(enemy, 12);
  enemy.units[2].z = enemy.units[1].z + .5;
  assert.deepEqual(GroupCombat.applySequentialDamage(enemy, 3).hit, [2]);
});

test("encircle fizzles as soon as fewer than four survive", () => {
  const enemy = group();
  GroupCombat.applySequentialDamage(enemy, 36);
  assert.equal(GroupCombat.getAliveCount(enemy), 3);
  assert.equal(GroupCombat.getGroupEventDamage(enemy, "encircle"), 0);
});

test("sequential damage starts at the nearest survivor and overflows", () => {
  const enemy = group();
  const first = GroupCombat.applySequentialDamage(enemy, 14);
  assert.deepEqual(first.killed, [0]);
  assert.deepEqual(enemy.units.map((unit) => unit.hp), [0, 10, 12, 12, 12, 12]);
  assert.equal(GroupCombat.getGroupAttackDamage(enemy), 10);
  const second = GroupCombat.applySequentialDamage(enemy, 23);
  assert.deepEqual(second.killed, [1, 2]);
  assert.deepEqual(enemy.units.map((unit) => unit.hp), [0, 0, 0, 11, 12, 12]);
});

test("spread hits three nearest living units without overflow", () => {
  const enemy = group();
  GroupCombat.applySequentialDamage(enemy, 12);
  const result = GroupCombat.applySpreadDamage(enemy, 3, 3);
  assert.deepEqual(result.hit, [1, 2, 3]);
  assert.deepEqual(enemy.units.map((unit) => unit.hp), [0, 9, 9, 9, 12, 12]);
  enemy.units[1].hp = 1;
  const next = GroupCombat.applySpreadDamage(enemy, 3, 3);
  assert.deepEqual(next.killed, [1]);
  assert.deepEqual(enemy.units.map((unit) => unit.hp), [0, 0, 6, 6, 12, 12]);
});

test("overkill stops at zero and can kill multiple units", () => {
  const enemy = group();
  const result = GroupCombat.applySequentialDamage(enemy, 100);
  assert.equal(result.dealt, 72);
  assert.deepEqual([...result.killed].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  assert.equal(GroupCombat.getGroupAttackDamage(enemy), 0);
});

test("collapse counts the last three card plays and triggers once", () => {
  const enemy = group();
  assert.equal(GroupCombat.recordCardKills(enemy, 1), false);
  assert.equal(GroupCombat.recordCardKills(enemy, 0), false);
  assert.equal(GroupCombat.recordCardKills(enemy, 2), true);
  assert.equal(enemy.recentKillCount, 3);
  assert.equal(GroupCombat.recordCardKills(enemy, 3), false);
  assert.equal(enemy.recentKillCount, 5);
});

test("a fully dead group cannot collapse", () => {
  const enemy = group();
  GroupCombat.applySequentialDamage(enemy, 72);
  assert.equal(GroupCombat.recordCardKills(enemy, 6), false);
});
