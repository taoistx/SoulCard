// Shared, data-only mapping for the game and the editor. One grid cell = one metre.
export const TERRAIN_3D = Object.freeze({
  r: { name: "石砖房间", walkable: true, color: 0x777568 },
  ".": { name: "排水走廊", walkable: true, color: 0x736246 },
  "#": { name: "地宫墙体 / 岩层", walkable: false, color: 0x474d49 },
});

export const OBJECT_3D = Object.freeze({
  eddie: "fisher", chris: "noble", bell: "warden", hut: "ruin",
  gate: "portcullis", dungA: "slime", dungB: "slime", church: "pump",
});

export function gridToScene({ col, row }) {
  return { x: col, z: row };
}

export function mapToDungeon(bundle) {
  const { grid, objects, playerStart } = bundle.map;
  const floors = [];
  const walls = [];
  const isFloor = (col, row) => TERRAIN_3D[grid[row]?.[col]]?.walkable === true;
  grid.forEach((line, row) => [...line].forEach((tile, col) => {
    const point = { col, row, ...gridToScene({ col, row }) };
    if (TERRAIN_3D[tile]?.walkable) floors.push({ ...point, tile });
    else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => isFloor(col + dx, row + dz))) {
      // Cut away walls in front of the fixed camera so narrow corridors remain readable.
      const cutaway = isFloor(col - 1, row) || isFloor(col, row - 1);
      walls.push({ ...point, height: cutaway ? 0.38 : 1.45, cutaway });
    }
    // Solid cells away from a passage stay unbuilt rock, never become walkable floor.
  }));
  return {
    width: grid[0].length, height: grid.length, floors, walls,
    player: { ...playerStart, ...gridToScene(playerStart) },
    objects: objects.map((point) => {
      const definition = bundle.objectDefinitions[point.id];
      return { ...definition, ...point, ...gridToScene(point),
        model: OBJECT_3D[point.id] || (definition.type === "npc" ? "fisher" : definition.type === "enemy" ? "warden" : "ruin") };
    }),
  };
}
