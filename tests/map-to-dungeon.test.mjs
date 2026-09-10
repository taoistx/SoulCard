import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { mapToDungeon } from "../map-to-dungeon.js";

const context = { window: {} };
vm.runInNewContext(readFileSync(new URL("../world-map.js", import.meta.url), "utf8"), context);
const original = context.window.WORLD_MAP_BUNDLE;
const before = JSON.stringify(original);
const dungeon = mapToDungeon(original);
assert.equal(dungeon.floors.length, original.map.grid.join("").replace(/#/g, "").length);
assert.equal(JSON.stringify(original), before, "Mapping must not mutate the World bundle");
assert.equal(dungeon.objects.length, original.map.objects.length);
assert.equal(dungeon.objects.find((item) => item.id === "gate").model, "portcullis");
assert.ok(dungeon.walls.some((item) => item.cutaway));
assert.ok(dungeon.walls.some((item) => !item.cutaway));
assert.ok(dungeon.walls.every(({ col, row }) => original.map.grid[row][col] === "#"));

const custom = {
  schemaVersion: 1, objectDefinitions: original.objectDefinitions,
  map: { grid: ["#######", "#rr#rr#", "#rr#rr#", "#r...r#", "#rr#rr#", "#rr#rr#", "#######"],
    playerStart: { col: 1, row: 1 }, objects: [{ id: "gate", col: 3, row: 3 }, { id: "eddie", col: 2, row: 2 }] },
};
const moved = mapToDungeon(custom);
assert.deepEqual(moved.player, { col: 1, row: 1, x: 1, z: 1 });
assert.equal(moved.objects[0].x, 3);
assert.equal(moved.objects[0].z, 3);
assert.equal(moved.objects[1].model, "fisher");
assert.ok(!moved.floors.some((item) => item.col === 3 && item.row === 2), "An edited wall remains a wall");
custom.map.grid[2] = "#rrrrr#";
assert.ok(mapToDungeon(custom).floors.some((item) => item.col === 3 && item.row === 2), "A newly painted room becomes floor");
for (const size of [5, 80]) {
  custom.map.grid = Array.from({ length: size }, () => "r".repeat(size));
  const large = mapToDungeon(custom);
  assert.equal(large.floors.length, size * size);
  assert.equal(large.width, size);
  assert.equal(large.height, size);
  assert.equal(large.walls.length, 0);
}
console.log("PASS: default / edited terrain, translated objects, no mutation, 5–80 cell maps");
