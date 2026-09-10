import * as THREE from "./vendor/three/three.module.min.js";
import { mapToDungeon } from "./map-to-dungeon.js";
import { createDungeonAtmosphere } from "./dungeon-atmosphere.js";

// Presentation only. World retains movement, collision, availability and interaction rules.
export function createDungeonView(host, bundle, { preview = false, onObject, onCell } = {}) {
  const data = mapToDungeon(bundle);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b100e);
  const camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 250);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute("aria-label", "45 度俯视地宫，使用 WASD 或方向键移动");
  host.replaceChildren(renderer.domElement);
  host.classList.add("dungeon-view");

  const resources = new Set();
  const own = (resource) => { resources.add(resource); return resource; };
  const box = own(new THREE.BoxGeometry(1, 1, 1));
  const sphere = own(new THREE.IcosahedronGeometry(1, 1));
  const cylinder = own(new THREE.CylinderGeometry(1, 1, 1, 10));
  const cone = own(new THREE.ConeGeometry(1, 1, 8));
  const cloth = own(new THREE.CylinderGeometry(0.46, 1, 1, 9));
  const material = (color, emissive = 0) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.12, emissive, emissiveIntensity: 0.9 }));
  const textureLoader = new THREE.TextureLoader();
  function texture(file) {
    const map = own(textureLoader.load(new URL(`./assets/map-terrain/${file}`, import.meta.url).href));
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return map;
  }
  const stoneMap = texture("room-floor-v1.jpg");
  const drainMap = texture("drain-corridor-v1.jpg");
  const wallMap = texture("thorn-wall-v1.jpg");
  const stone = material(0xd6d1bc), trim = material(0xb9b59e), iron = material(0x343932);
  stone.map = stoneMap; stone.bumpMap = stoneMap; stone.bumpScale = 0.065;
  trim.map = stoneMap;
  iron.metalness = 0.72; iron.roughness = 0.43;
  const gold = material(0x847044), wood = material(0x43362a), skin = material(0xada58c);
  wood.map = wallMap;
  const teal = material(0x3b433d), red = material(0x423237), dark = material(0x242824);
  const fire = material(0xffcf7c, 0xff941f), blueFire = material(0xc2d2b2, 0x83ac83);
  const slimeMat = material(0x4c4430);
  slimeMat.roughness = 0.28;

  function mesh(parent, geometry, mat, position, scale) {
    const item = new THREE.Mesh(geometry, mat);
    item.position.set(...position);
    item.scale.set(...scale);
    item.castShadow = !mat.transparent;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }
  function instanced(items, mat, geometry = box) {
    if (!items.length) return null;
    const group = new THREE.InstancedMesh(geometry, mat, items.length);
    const dummy = new THREE.Object3D();
    items.forEach((item, i) => {
      dummy.position.set(...item.position);
      dummy.scale.set(...item.scale);
      dummy.rotation.set(0, item.rotation || 0, 0);
      dummy.updateMatrix();
      group.setMatrixAt(i, dummy.matrix);
      if (item.shade) group.setColorAt(i, new THREE.Color().setScalar(item.shade));
    });
    group.instanceMatrix.needsUpdate = true;
    group.computeBoundingSphere();
    group.castShadow = true;
    group.receiveShadow = true;
    scene.add(group);
    return group;
  }
  const pickFloors = [];
  for (const tile of ["r", "."]) {
    const cells = data.floors.filter((cell) => cell.tile === tile);
    const floorMaterial = material(tile === "r" ? 0xd3ccba : 0xc6b28b);
    floorMaterial.map = tile === "r" ? stoneMap : drainMap;
    floorMaterial.bumpMap = floorMaterial.map;
    floorMaterial.bumpScale = 0.035;
    floorMaterial.roughness = tile === "r" ? 0.65 : 0.45;
    // Continuous masonry across edited tiles, not the same image stamped on each cell.
    floorMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
        vec4 floorWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          floorWorld = instanceMatrix * floorWorld;
        #endif
        floorWorld = modelMatrix * floorWorld;
        vMapUv = floorWorld.xz * 0.28;
        vBumpMapUv = vMapUv;
      `);
    };
    const tiles = instanced(cells.map(({ x, z }) => ({ position: [x, -0.12, z], scale: [0.97, 0.24, 0.97], shade: 0.91 + ((x * 13 + z * 7) % 9) / 80 })), floorMaterial);
    if (tiles) { tiles.userData.cells = cells; pickFloors.push(tiles); }
  }
  instanced(data.floors.map(({ x, z }) => ({ position: [x, -0.59, z], scale: [1, 0.72, 1] })), stone);
  const wallBlocks = [], caps = [], drains = [];
  data.walls.forEach(({ x, z, height }) => {
    const courses = height > 1 ? 5 : 1;
    for (let i = 0; i < courses; i++) {
      for (const half of [-1, 1]) wallBlocks.push({ position: [x + half * 0.25, (i + 0.5) * (height / courses), z], scale: [0.48, height / courses - 0.025, 0.98], shade: 0.8 + ((x * 5 + z * 3 + i + half + 7) % 7) / 30 });
    }
    caps.push({ position: [x, height + 0.055, z], scale: [1.015, 0.11, 1.015] });
  });
  data.floors.filter((cell) => cell.tile === ".").forEach(({ x, z }) => {
    for (let i = -1; i <= 1; i++) drains.push({ position: [x + i * 0.18, 0.014, z], scale: [0.065, 0.025, 0.48] });
  });
  instanced(wallBlocks, stone);
  instanced(caps, trim);
  instanced(drains, iron);

  const ambient = new THREE.HemisphereLight(0x9aafa4, 0x33291d, 1.25);
  scene.add(ambient);
  const moon = new THREE.DirectionalLight(0xa9c1bd, 2.3);
  moon.position.set(-5, 9, -3);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.5, far: 30 });
  moon.shadow.bias = -0.0005;
  moon.shadow.normalBias = 0.035;
  scene.add(moon);
  scene.add(moon.target);
  const warm = new THREE.DirectionalLight(0x9e7854, 0.5);
  warm.position.set(8, 5, -6);
  scene.add(warm);
  // Emissive sconces do not add a separate GPU light for every wall on large maps.
  const sconces = data.walls.filter((wall) => !wall.cutaway && (wall.x * 3 + wall.z) % 5 === 0);
  instanced(sconces.map(({ x, z }) => ({ position: [x, 1.5, z], scale: [0.2, 0.23, 0.2] })), iron);
  instanced(sconces.flatMap(({ x, z }) => [-1, 0, 1].map((i) => ({ position: [x + i * 0.12, 1.83 + (i === 0 ? 0.12 : 0), z], scale: [0.033, 0.09, 0.033] }))), fire, sphere);
  const atmosphere = createDungeonAtmosphere({ scene, data, own, mesh, instanced, box, sphere, cylinder, stone, iron, gold });
  // A fixed pool of nearby candle lights avoids an unbounded light count on custom maps.
  const candleLights = Array.from({ length: 4 }, () => {
    const light = new THREE.PointLight(0xffa354, 5, 4.8, 2);
    scene.add(light);
    return light;
  });

  const labelLayer = document.createElement("div");
  labelLayer.className = "dungeon-labels";
  host.appendChild(labelLayer);
  const objectViews = new Map();
  const pickObjects = [];
  const ringGeometry = own(new THREE.RingGeometry(0.34, 0.39, 40));
  const ringMaterials = {};
  function ring(parent, color) {
    ringMaterials[color] ||= own(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.38, depthWrite: false }));
    const item = mesh(parent, ringGeometry, ringMaterials[color], [0, 0.025, 0], [1, 1, 1]);
    item.rotation.x = -Math.PI / 2;
    return item;
  }
  function human(parent, coat, kind) {
    mesh(parent, cloth, coat, [0, 0.48, 0], [0.2, 0.63, 0.16]);
    mesh(parent, sphere, coat, [0, 0.77, 0], [0.19, 0.15, 0.14]);
    for (const x of [-0.075, 0.075]) mesh(parent, box, dark, [x, 0.1, 0], [0.08, 0.21, 0.15]);
    if (kind !== "warden") {
      mesh(parent, sphere, skin, [0, 0.97, 0], [0.095, 0.145, 0.095]);
      mesh(parent, cylinder, dark, [0, 1.09, 0], [kind === "player" ? 0.14 : 0.21, 0.04, 0.18]);
    }
    if (kind === "noble") mesh(parent, cylinder, dark, [0, 1.18, 0], [0.115, 0.18, 0.115]);
    if (kind === "fisher") mesh(parent, cylinder, wood, [0.31, 0.66, 0], [0.025, 1.3, 0.025]);
    if (kind === "player") {
      mesh(parent, box, iron, [-0.26, 0.48, 0], [0.07, 0.65, 0.1]);
      mesh(parent, box, gold, [0.24, 0.48, 0], [0.14, 0.22, 0.14]);
      mesh(parent, sphere, fire, [0.24, 0.49, 0.08], [0.045, 0.07, 0.025]);
      mesh(parent, cloth, dark, [0, 0.56, -0.09], [0.24, 0.71, 0.09]);
    }
  }
  function makeObject(object) {
    const group = new THREE.Group();
    group.position.set(object.x, 0, object.z);
    scene.add(group);
    let bars = null;
    if (object.model === "fisher" || object.model === "noble") human(group, object.model === "fisher" ? teal : red, object.model);
    else if (object.model === "warden") {
      human(group, iron, "warden");
      const bell = mesh(group, cloth, gold, [0, 1.12, 0], [0.3, 0.49, 0.3]);
      bell.rotation.z = -0.12;
      mesh(group, cylinder, iron, [0, 0.89, 0], [0.31, 0.04, 0.31]);
      mesh(group, box, dark, [0.11, 1.09, 0.275], [0.028, 0.39, 0.014]);
      mesh(group, box, iron, [0.38, 0.61, 0], [0.1, 1.1, 0.16]);
    } else if (object.model === "slime") {
      mesh(group, sphere, slimeMat, [0, 0.27, 0], [0.39, 0.3, 0.36]);
      mesh(group, sphere, slimeMat, [0.17, 0.43, -0.08], [0.21, 0.23, 0.2]);
      for (const x of [-0.13, 0.13]) mesh(group, sphere, skin, [x, 0.4, 0.27], [0.025, 0.027, 0.015]);
      mesh(group, box, skin, [0.3, 0.18, 0.11], [0.21, 0.05, 0.045]);
    } else if (object.model === "portcullis") {
      // Face across the passage, even after the editor moves the gate.
      const horizontal = data.floors.some((cell) => cell.col === object.col - 1 && cell.row === object.row) &&
        data.floors.some((cell) => cell.col === object.col + 1 && cell.row === object.row);
      if (horizontal) group.rotation.y = Math.PI / 2;
      for (const x of [-0.44, 0.44]) mesh(group, box, stone, [x, 0.65, 0], [0.17, 1.3, 0.32]);
      mesh(group, box, trim, [0, 1.36, 0], [1.08, 0.2, 0.38]);
      bars = new THREE.Group();
      group.add(bars);
      for (let i = -2; i <= 2; i++) mesh(bars, box, iron, [i * 0.14, 0.63, 0], [0.045, 1.2, 0.05]);
      mesh(bars, box, gold, [0, 0.65, 0], [0.73, 0.07, 0.09]);
    } else if (object.model === "ruin") {
      for (const x of [-0.37, 0.37]) mesh(group, box, stone, [x, 0.38, -0.17], [0.18, 0.76, 0.65]);
      mesh(group, box, trim, [0, 0.82, -0.38], [0.95, 0.18, 0.23]);
      mesh(group, box, wood, [0, 0.22, 0.08], [0.46, 0.43, 0.38]);
      mesh(group, box, gold, [0, 0.26, 0.28], [0.08, 0.12, 0.025]);
    } else {
      mesh(group, cylinder, stone, [0, 0.13, 0], [0.47, 0.26, 0.47]);
      mesh(group, cylinder, iron, [0, 0.67, 0], [0.23, 0.98, 0.23]);
      mesh(group, cylinder, gold, [0, 1.16, 0], [0.3, 0.08, 0.3]);
      mesh(group, sphere, blueFire, [0, 1.34, 0], [0.18, 0.2, 0.18]);
      mesh(group, box, iron, [0.3, 0.83, 0], [0.46, 0.16, 0.19]);
    }
    group.traverse((child) => { if (child.isMesh) { child.userData.objectId = object.id; pickObjects.push(child); } });
    const marker = ring(group, object.type === "enemy" ? 0xd77763 : object.type === "npc" ? 0xd1b579 : 0x75beb0);
    const label = document.createElement("button");
    label.type = "button";
    label.className = `dungeon-label ${object.type}`;
    label.textContent = object.label;
    label.dataset.objectId = object.id;
    label.addEventListener("click", () => activateObject(object.id));
    labelLayer.appendChild(label);
    objectViews.set(object.id, { object, group, bars, marker, label });
  }
  data.objects.forEach(makeObject);
  const player = new THREE.Group();
  human(player, teal, "player");
  ring(player, 0xddc092);
  scene.add(player);
  const lantern = new THREE.PointLight(0xffc58a, 9, 5.5, 2);
  scene.add(lantern);

  const controls = document.createElement("div");
  controls.className = "dungeon-controls";
  controls.innerHTML = '<span class="dungeon-caption">逆流深处 / 45°</span><button type="button" data-view="zoom-in" aria-label="放大地图">＋</button><button type="button" data-view="zoom-out" aria-label="缩小地图">−</button><button type="button" data-view="overview">全图</button>';
  host.appendChild(controls);
  const compass = document.createElement("div");
  compass.className = "dungeon-compass";
  compass.textContent = preview ? "滚轮缩放 · 点击对象定位 · 与游戏共用映射" : "W ↗　D ↘　S ↙　A ↖  /  方向键 · 滚轮缩放";
  host.appendChild(compass);
  const atmosphereCopy = document.createElement("div");
  atmosphereCopy.className = "dungeon-atmosphere-copy";
  atmosphereCopy.innerHTML = '<span>沉淀层 · 黑水之下</span><p>这里的水声，从不向下。</p>';
  host.appendChild(atmosphereCopy);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let overview = preview, span = 10, width = 1, height = 1, disposed = false;
  let state = { player: { col: data.player.col, row: data.player.row }, availableIds: data.objects.map((item) => item.id), gateOpened: false, targetId: null };
  let availableIds = new Set(state.availableIds);
  const focus = new THREE.Vector3(data.player.x, 0, data.player.z);
  const targetFocus = focus.clone();
  player.position.copy(focus);
  const projected = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3(24, 24 * Math.SQRT2, 24); // Exact 45° elevation and azimuth.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const overviewButton = controls.querySelector('[data-view="overview"]');
  function fitSpan() {
    return Math.max(6, (data.width + data.height) * 0.5 + 4, ((data.width + data.height) / Math.SQRT2 + 4) / (width / height));
  }
  function projection() {
    const viewSpan = overview ? fitSpan() : span;
    const aspect = width / height;
    camera.left = -viewSpan * aspect / 2; camera.right = viewSpan * aspect / 2;
    camera.top = viewSpan / 2; camera.bottom = -viewSpan / 2;
    camera.updateProjectionMatrix();
    overviewButton.textContent = overview ? (preview ? "出生点" : "跟随角色") : "全图";
    overviewButton.setAttribute("aria-pressed", String(overview));
  }
  function zoomBy(factor) {
    span = THREE.MathUtils.clamp((overview ? fitSpan() : span) * factor, 5, 100);
    overview = false;
    projection();
  }
  function controlClick(event) {
    const action = event.target.closest("button")?.dataset.view;
    if (action === "overview") {
      overview = !overview;
      if (!overview) targetFocus.set(state.player.col, 0, state.player.row);
      projection();
    }
    else if (action) zoomBy(action === "zoom-in" ? 0.8 : 1.25);
  }
  controls.addEventListener("click", controlClick);
  function wheel(event) { event.preventDefault(); zoomBy(event.deltaY > 0 ? 1.1 : 0.9); }
  host.addEventListener("wheel", wheel, { passive: false });
  function activateObject(id) {
    if (preview) {
      const object = objectViews.get(id).object;
      targetFocus.set(object.x, 0, object.z);
      overview = false; span = 8; projection();
    } else onObject?.(id);
  }
  function clickCanvas(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hitObject = raycaster.intersectObjects(pickObjects.filter((item) => availableIds.has(item.userData.objectId)), false)[0];
    if (hitObject) { activateObject(hitObject.object.userData.objectId); return; }
    const hit = raycaster.intersectObjects(pickFloors, false)[0];
    if (hit) onCell?.(hit.object.userData.cells[hit.instanceId]);
  }
  renderer.domElement.addEventListener("click", clickCanvas);
  function resize() {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width; height = rect.height;
    renderer.setSize(width, height, false);
    projection();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  function setState(next) {
    state = next;
    availableIds = new Set(next.availableIds);
    const lateDay = (next.day || 1) >= 4;
    atmosphereCopy.querySelector("p").textContent = lateDay ? "雾里，多了一点熟悉的呼吸。" : "这里的水声，从不向下。";
    host.classList.toggle("dungeon-late-day", lateDay);
    objectViews.forEach(({ group, marker, bars, label, object }, id) => {
      group.visible = availableIds.has(id);
      marker.scale.setScalar(next.targetId === id ? 1.2 : 1);
      if (bars) bars.visible = !next.gateOpened;
      label.classList.toggle("targeted", next.targetId === id);
      label.disabled = !preview && Math.hypot(object.col - next.player.col, object.row - next.player.row) > 1.55;
      if (bars) label.textContent = `${object.label} · ${next.gateOpened ? "已开启" : "封锁"}`;
    });
  }
  setState(state);
  let lastTs = 0;
  function frame(ts) {
    if (disposed) return;
    frameId = requestAnimationFrame(frame);
    if (!host.getClientRects().length || document.hidden) { lastTs = ts; return; }
    const dt = Math.min((ts - lastTs) / 1000 || 0.016, 0.05);
    lastTs = ts;
    const target = new THREE.Vector3(state.player.col, 0, state.player.row);
    const moving = player.position.distanceTo(target) > 0.015;
    player.position.lerp(target, 1 - Math.exp(-24 * dt));
    if (moving) player.rotation.y = Math.atan2(target.x - player.position.x, target.z - player.position.z);
    player.position.y = moving ? Math.abs(Math.sin(ts * 0.02)) * 0.055 : 0;
    if (overview) targetFocus.set((data.width - 1) / 2, 0, (data.height - 1) / 2);
    else if (!preview) targetFocus.set(state.player.col, 0, state.player.row);
    focus.lerp(targetFocus, 1 - Math.exp(-7 * dt));
    camera.position.copy(focus).add(cameraOffset);
    camera.lookAt(focus);
    camera.updateMatrixWorld();
    lantern.position.copy(player.position).add(new THREE.Vector3(0, 1.5, 0));
    const seconds = reducedMotion.matches ? 0 : ts / 1000;
    atmosphere.update(seconds, focus, state.day);
    ambient.intensity = 1.25 - Math.max(0, (state.day || 1) - 1) * 0.045;
    moon.position.copy(focus).add(new THREE.Vector3(-5, 9, -3));
    moon.target.position.copy(focus);
    const nearby = sconces.map((sconce) => ({ sconce, distance: Math.hypot(sconce.x - focus.x, sconce.z - focus.z) })).sort((a, b) => a.distance - b.distance);
    candleLights.forEach((light, i) => {
      const entry = nearby[i];
      light.intensity = entry ? 5 * (0.93 + Math.sin(seconds * 2.3 + i * 7) * 0.07) : 0;
      if (entry) light.position.set(entry.sconce.x, 1.94, entry.sconce.z);
    });
    renderer.render(scene, camera);
    objectViews.forEach(({ group, label, object }) => {
      projected.set(object.x, object.model === "pump" ? 1.8 : 1.6, object.z).project(camera);
      const show = group.visible && Math.abs(projected.x) < 0.94 && Math.abs(projected.y) < 0.88;
      label.hidden = !show;
      if (show) label.style.transform = `translate(${(projected.x + 1) * width / 2}px,${(1 - projected.y) * height / 2}px) translate(-50%,-100%)`;
    });
  }
  let frameId = requestAnimationFrame(frame);
  function contextLost(event) {
    event.preventDefault();
    cancelAnimationFrame(frameId);
    const notice = document.createElement("p");
    notice.className = "dungeon-error";
    notice.textContent = "3D 图形上下文已中断，请刷新页面重新载入。";
    host.appendChild(notice);
  }
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  return {
    setState,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      host.removeEventListener("wheel", wheel);
      controls.removeEventListener("click", controlClick);
      renderer.domElement.removeEventListener("click", clickCanvas);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      scene.traverse((item) => { if (item.isInstancedMesh) item.dispose(); });
      resources.forEach((resource) => resource.dispose());
      moon.shadow.dispose();
      renderer.dispose();
      host.replaceChildren();
    },
  };
}
