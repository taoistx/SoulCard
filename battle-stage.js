import * as THREE from "./vendor/three.module.js";

function paintCreature(color, large = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const middle = 96;
  ctx.fillStyle = "#120f10";
  ctx.beginPath();
  ctx.moveTo(42, 240);
  ctx.quadraticCurveTo(24, 178, 52, 110);
  ctx.quadraticCurveTo(30, 67, 69, 52);
  ctx.quadraticCurveTo(77, 14, middle, 24);
  ctx.quadraticCurveTo(119, 12, 127, 52);
  ctx.quadraticCurveTo(167, 66, 139, 113);
  ctx.quadraticCurveTo(170, 192, 148, 240);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.globalAlpha = .91;
  ctx.beginPath();
  ctx.moveTo(57, 231);
  ctx.quadraticCurveTo(40, 151, 64, 112);
  ctx.quadraticCurveTo(43, 75, 78, 62);
  ctx.quadraticCurveTo(84, 34, middle, 40);
  ctx.quadraticCurveTo(109, 31, 118, 63);
  ctx.quadraticCurveTo(153, 78, 130, 114);
  ctx.quadraticCurveTo(151, 160, 135, 231);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#100e0c";
  ctx.lineWidth = large ? 9 : 6;
  [[52, 133, 19, 176], [140, 132, 172, 187], [69, 217, 53, 251], [125, 217, 139, 251]]
    .forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
  ctx.fillStyle = "#d6ca9b";
  ctx.fillRect(67, 92, 18, 8);
  ctx.fillRect(108, 92, 18, 8);
  ctx.fillStyle = "#120c0a";
  ctx.fillRect(73, 93, 8, 7);
  ctx.fillRect(109, 93, 8, 7);
  ctx.strokeStyle = "#31231d";
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(72, 143); ctx.quadraticCurveTo(96, 158, 120, 142); ctx.stroke();
  for (let i = 0; i < 13; i++) {
    const x = 59 + (i * 37) % 78;
    const y = 77 + (i * 53) % 145;
    ctx.fillStyle = i % 2 ? "rgba(24,37,20,.35)" : "rgba(205,184,126,.15)";
    ctx.beginPath(); ctx.arc(x, y, 3 + i % 4, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeShadow(scene, x, z, size) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(size, 24),
    new THREE.MeshBasicMaterial({ color: 0x050606, transparent: true, opacity: .47, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, .014, z);
  scene.add(mesh);
  return mesh;
}

export function createBattleStage(container, config, group) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101412);
  scene.fog = new THREE.FogExp2(0x101412, .055);
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 100);
  camera.position.set(0, 2.05, 7.2);
  camera.lookAt(0, .75, -3.2);
  scene.add(new THREE.HemisphereLight(0x9aab9c, 0x282019, 1.7));
  const sideLight = new THREE.DirectionalLight(0xc4a88b, 1.1);
  sideLight.position.set(-3, 7, 3);
  scene.add(sideLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshLambertMaterial({ color: 0x30372e, side: THREE.DoubleSide }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.03;
  scene.add(ground);
  if (group) {
    for (const [z, color] of [[-1.05, 0x595142], [-4.25, 0x4a5142], [-7.55, 0x404c42]]) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(6.9, .045),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .55, depthWrite: false }),
      );
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, .008, z);
      scene.add(line);
    }
  }
  for (let i = 0; i < 16; i++) {
    const x = Math.sin(i * 8.2) * (2.2 + i % 5);
    const z = 2.7 - i * .75;
    const stain = new THREE.Mesh(
      new THREE.CircleGeometry(.23 + i % 4 * .12, 12),
      new THREE.MeshBasicMaterial({ color: i % 3 ? 0x253129 : 0x3b3328, transparent: true, opacity: .5, depthWrite: false }),
    );
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(x, .002, z);
    scene.add(stain);
  }

  const texture = paintCreature(group ? "#697951" : "#786b65", !group);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const figures = new Map();
  const initialUnits = group?.units || [{ id: 0, x: .55, y: 0, z: -3.55, hp: config.stats.maxHp, alive: true }];
  for (const unit of initialUnits) {
    const height = group ? 1.74 : 2.85;
    const width = group ? 1.28 : 2.06;
    const visual = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      map: texture, transparent: true, alphaTest: .07, side: THREE.DoubleSide,
    }));
    visual.scale.set(width, height, 1);
    visual.position.set(unit.x, height / 2, unit.z);
    visual.lookAt(camera.position);
    visual.userData.unitId = unit.id;
    scene.add(visual);
    const shadow = makeShadow(scene, unit.x, unit.z, group ? .62 : .98);
    figures.set(unit.id, {
      mesh: visual, shadow, height, homeX: unit.x, homeZ: unit.z,
      targetX: unit.x, targetZ: unit.z, dead: false, deathProgress: 0, hitUntil: 0,
    });
  }

  let frame = 0;
  let disposed = false;
  let scatterUntil = 0;
  const size = { width: 0, height: 0 };
  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    if (width === size.width && height === size.height) return;
    size.width = width;
    size.height = height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  function animate() {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (scatterUntil && performance.now() >= scatterUntil) { scatterUntil = 0; settle(); }
    for (const visual of figures.values()) {
      const { mesh, shadow } = visual;
      mesh.position.x += (visual.targetX - mesh.position.x) * .075;
      mesh.position.z += (visual.targetZ - mesh.position.z) * .075;
      shadow.position.x = mesh.position.x;
      shadow.position.z = mesh.position.z;
      if (visual.dead) {
        visual.deathProgress = Math.min(1, visual.deathProgress + .035);
        mesh.rotation.x += (-Math.PI / 2 - mesh.rotation.x) * .08;
        mesh.position.y = visual.height / 2 * (1 - visual.deathProgress) + .08;
        mesh.scale.y = visual.height * (1 - visual.deathProgress * .35);
        shadow.material.opacity = .2;
        mesh.material.color.setHex(0x777872);
      } else {
        const recentlyHit = performance.now() < visual.hitUntil;
        mesh.material.color.setHex(recentlyHit ? 0xffc6a0 : 0xffffff);
        mesh.position.y = visual.height / 2 + Math.sin(performance.now() * .002 + mesh.userData.unitId) * .035 + (recentlyHit ? .1 : 0);
        mesh.lookAt(camera.position);
      }
    }
    renderer.render(scene, camera);
  }
  animate();

  function living() {
    return (group?.units || initialUnits).filter((unit) => unit.alive)
      .sort((a, b) => (a.band ?? 0) - (b.band ?? 0) || a.rank - b.rank);
  }

  function actors(action) {
    if (!group) return living().slice(0, 1);
    if (action === "bite") return living().filter((unit) => unit.band === 0).slice(0, 2);
    return living();
  }

  function telegraph(action) {
    for (const unit of actors(action)) {
      const visual = figures.get(unit.id);
      visual.targetZ = visual.homeZ + .52;
    }
  }

  function strike(action) {
    for (const unit of actors(action)) {
      const visual = figures.get(unit.id);
      visual.targetZ += .28;
    }
  }

  function settle() {
    for (const unit of living()) {
      const visual = figures.get(unit.id);
      visual.targetX = visual.homeX;
      visual.targetZ = visual.homeZ;
    }
  }

  function kill(ids) {
    for (const id of ids) {
      const visual = figures.get(id);
      if (visual) visual.dead = true;
    }
  }

  function updateFormation() {
    for (const unit of living()) {
      const visual = figures.get(unit.id);
      visual.homeX = unit.x;
      visual.homeZ = unit.z;
      visual.targetX = unit.x;
      visual.targetZ = unit.z;
    }
  }

  function hit(ids) {
    for (const id of ids) {
      const visual = figures.get(id);
      if (visual) visual.hitUntil = performance.now() + 230;
    }
  }

  function collapse() {
    for (const unit of living()) {
      const visual = figures.get(unit.id);
      visual.targetZ = visual.homeZ - .3;
      visual.targetX = visual.homeX + (unit.id % 2 ? .28 : -.28);
    }
    scatterUntil = performance.now() + 500;
  }

  function getEnemyScreenPoint(id = null) {
    const unit = id == null ? living()[0] : initialUnits.find((entry) => entry.id === id);
    const visual = figures.get(unit?.id) || figures.values().next().value;
    if (!visual) return { x: size.width / 2, y: size.height / 2 };
    const vector = visual.mesh.position.clone();
    vector.y = visual.dead ? .28 : visual.height * .65;
    vector.project(camera);
    return { x: (vector.x + 1) * size.width / 2, y: (1 - vector.y) * size.height / 2 };
  }

  function dispose() {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    for (const visual of figures.values()) {
      visual.mesh.material.dispose();
      visual.shadow.geometry.dispose();
      visual.shadow.material.dispose();
    }
    texture.dispose();
    geometry.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
    scene.traverse((object) => {
      if (object.isMesh && ![ground, ...Array.from(figures.values(), (visual) => visual.mesh), ...Array.from(figures.values(), (visual) => visual.shadow)].includes(object)) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { telegraph, strike, settle, hit, kill, updateFormation, collapse, getEnemyScreenPoint, dispose };
}
