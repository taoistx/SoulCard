import * as THREE from "./vendor/three/three.module.min.js";

// The drowned, industrial sanctuary. Decorations follow terrain, never add collision.
export function createDungeonAtmosphere({ scene, data, own, mesh, instanced, box, sphere, cylinder, stone, iron, gold }) {
  const time = { value: 0 };
  const decay = { value: 0 };
  const focus = { value: new THREE.Vector2(data.player.x, data.player.z) };
  const random = (x, z, salt = 0) => {
    const value = Math.sin(x * 127.1 + z * 311.7 + salt * 73.9) * 43758.5453;
    return value - Math.floor(value);
  };
  const mat = (color, options = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options }));
  const rust = mat(0x5e3b26, { metalness: 0.65, roughness: 0.6 });
  const bone = mat(0xafa38a), flesh = mat(0x3f2827, { roughness: 0.48 });
  const soot = mat(0x191e1b), wax = mat(0xa89870);
  const archStone = mat(0x555a50);
  const plane = own(new THREE.PlaneGeometry(1, 1));
  const noise = `
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
    }
    float mist(vec2 p) { return noise(p)*0.55 + noise(p*2.03)*0.3 + noise(p*4.01)*0.15; }
  `;
  const worldVertex = `varying vec3 vWorld;
    void main() { vWorld=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.); }`;
  const waterMaterial = own(new THREE.ShaderMaterial({
    uniforms: { uTime: time, uDecay: decay, uFocus: focus }, vertexShader: worldVertex,
    fragmentShader: `uniform float uTime; uniform float uDecay; uniform vec2 uFocus; varying vec3 vWorld; ${noise}
      void main() {
        vec2 p=vWorld.xz;
        float sludge=mist(p*0.38+vec2(uTime*0.015,-uTime*0.009));
        float ripple=pow(0.5+0.5*sin(p.x*12.0+p.y*17.0+sludge*24.0-uTime*0.6),22.0);
        float pool=exp(-length(p-uFocus)*0.17);
        vec3 deep=mix(vec3(0.008,0.014,0.013),vec3(0.022,0.025,0.013),sludge);
        deep+=vec3(0.014,0.019,0.012)*ripple*pool;
        deep=mix(deep,deep*vec3(1.35,0.86,0.73),uDecay);
        gl_FragColor=vec4(deep,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const water = mesh(scene, plane, waterMaterial, [(data.width - 1) / 2, -0.91, (data.height - 1) / 2], [data.width + 160, data.height + 160, 1]);
  water.rotation.x = -Math.PI / 2;
  water.receiveShadow = false;

  // Sparse architectural remains and pipework live only on existing blocked cells.
  const pillars = [], feet = [], pipes = [], pipeRims = [], buds = [], candles = [], niches = [], spires = [];
  const neighbors = [[0, 1], [1, 0], [-1, 0], [0, -1]];
  const floorCells = new Set(data.floors.map(({ x, z }) => `${x},${z}`));
  const isFloor = (x, z) => floorCells.has(`${x},${z}`);
  const archShape = new THREE.Shape();
  archShape.moveTo(-0.34, 0); archShape.lineTo(-0.34, 0.55);
  archShape.quadraticCurveTo(-0.33, 0.88, 0, 1.1);
  archShape.quadraticCurveTo(0.33, 0.88, 0.34, 0.55); archShape.lineTo(0.34, 0);
  const hole = new THREE.Path();
  hole.moveTo(-0.23, 0); hole.lineTo(-0.23, 0.53);
  hole.quadraticCurveTo(-0.23, 0.75, 0, 0.94);
  hole.quadraticCurveTo(0.23, 0.75, 0.23, 0.53); hole.lineTo(0.23, 0);
  archShape.holes.push(hole);
  const arch = own(new THREE.ExtrudeGeometry(archShape, { depth: 0.09, bevelEnabled: false, curveSegments: 8 }));
  const crossbar = [], uprights = [];
  data.walls.forEach(({ x, z, height, cutaway }) => {
    if (!cutaway && (x + z) % 3 === 0) {
      pillars.push({ position: [x, 0.92, z], scale: [0.32, 1.85, 0.32] });
      feet.push({ position: [x, 1.88, z], scale: [0.44, 0.13, 0.44] });
      spires.push({ position: [x, 2.06, z], scale: [0.2, 0.28, 0.2] });
      const face = neighbors.find(([dx, dz]) => isFloor(x + dx, z + dz));
      if (face) {
        const [dx, dz] = face;
        niches.push({ position: [x + dx * 0.505, 0.14, z + dz * 0.505], scale: [1, 1, 1], rotation: Math.atan2(dx, dz) });
        // A sealed funerary niche: it remains unmistakably a wall, not a doorway.
        crossbar.push({ position: [x + dx * 0.55, 0.77, z + dz * 0.55], scale: [dx ? 0.04 : 0.18, 0.035, dx ? 0.18 : 0.04] });
        uprights.push({ position: [x + dx * 0.55, 0.72, z + dz * 0.55], scale: [0.035, 0.28, 0.035] });
      }
    }
    if (!cutaway && (x * 7 + z) % 4 === 0) {
      pipes.push({ position: [x + 0.14, 0.64, z + 0.13], scale: [0.1, 2.35, 0.1] });
      for (const y of [-0.2, 0.65, 1.35]) pipeRims.push({ position: [x + 0.14, y, z + 0.13], scale: [0.14, 0.08, 0.14] });
    }
    if (random(x, z) > 0.72) {
      buds.push({ position: [x + 0.36, Math.min(height, 0.4), z + 0.26], scale: [0.19, 0.1 + random(z, x) * 0.2, 0.16] });
    }
    if (!cutaway && (x * 3 + z) % 5 === 0) {
      for (let i = 0; i < 3; i++) candles.push({ position: [x - 0.12 + i * 0.12, height + 0.18 + (i % 2) * 0.08, z], scale: [0.035, 0.2 + (i % 2) * 0.16, 0.035] });
    }
  });
  instanced(pillars, stone); instanced(feet, archStone); instanced(pipes, rust, cylinder);
  instanced(niches, archStone, arch);
  instanced(spires, stone, own(new THREE.ConeGeometry(1, 1, 4)));
  instanced(pipeRims, iron, cylinder); instanced(buds, flesh, sphere);
  instanced(candles, wax, cylinder); instanced(crossbar, gold); instanced(uprights, gold);

  const rubble = [], bones = [], sludge = [];
  const occupied = new Set(data.objects.map(({ x, z }) => `${x},${z}`));
  occupied.add(`${data.player.x},${data.player.z}`);
  data.floors.forEach(({ x, z, tile }) => {
    if (occupied.has(`${x},${z}`)) return;
    const r = random(x, z, 2);
    if (r > 0.67) rubble.push({ position: [x - 0.36, 0.045, z + 0.32], scale: [0.08 + r * 0.06, 0.07, 0.1] });
    if (r > 0.91 && tile === "r") {
      bones.push({ position: [x + 0.3, 0.035, z - 0.31], scale: [0.22, 0.035, 0.035] });
      bones.push({ position: [x + 0.38, 0.035, z - 0.3], scale: [0.035, 0.035, 0.12] });
    }
    if (r < 0.24) sludge.push({ position: [x + 0.18, 0.008, z - 0.14], scale: [0.28, 0.015, 0.36] });
  });
  instanced(rubble, stone, sphere); instanced(bones, bone); instanced(sludge, soot, sphere);

  const fogUniforms = { uTime: time, uDecay: decay, uFocus: focus };
  const fogMaterial = own(new THREE.ShaderMaterial({
    uniforms: fogUniforms, vertexShader: worldVertex, transparent: true, depthWrite: false,
    fragmentShader: `uniform float uTime; uniform float uDecay; uniform vec2 uFocus; varying vec3 vWorld; ${noise}
      void main() {
        float n=mist(vWorld.xz*0.28+vec2(uTime*0.027,-uTime*0.018));
        float clear=smoothstep(0.8,4.0,length(vWorld.xz-uFocus));
        float alpha=smoothstep(0.38,0.79,n)*(0.09+uDecay*0.035)*(0.35+clear*0.65);
        gl_FragColor=vec4(mix(vec3(0.13,0.17,0.15),vec3(0.2,0.15,0.10),uDecay),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  for (const y of [-0.58, 0.18, 0.65]) {
    const fog = mesh(scene, plane, fogMaterial, [(data.width - 1) / 2, y, (data.height - 1) / 2], [data.width + 40, data.height + 40, 1]);
    fog.rotation.x = -Math.PI / 2;
    fog.castShadow = false; fog.receiveShadow = false;
  }

  const positions = [], phases = [];
  const count = Math.min(220, Math.max(55, data.floors.length));
  for (let i = 0; i < count; i++) {
    positions.push(random(i, 1) * (data.width + 4) - 2, random(i, 2) * 2.5, random(i, 3) * (data.height + 4) - 2);
    phases.push(random(i, 4));
  }
  const moteGeometry = own(new THREE.BufferGeometry());
  moteGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  moteGeometry.setAttribute("phase", new THREE.Float32BufferAttribute(phases, 1));
  const moteMaterial = own(new THREE.ShaderMaterial({
    uniforms: { uTime: time }, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime; attribute float phase; varying float vAlpha;
      void main() { vec3 p=position; p.x+=sin(uTime*0.09+phase*13.)*0.45;
        p.y=mod(p.y+uTime*0.035,2.5); vAlpha=sin(p.y/2.5*3.14159)*0.42;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); gl_PointSize=1.5+phase*1.8; }`,
    fragmentShader: `varying float vAlpha; void main() {
      float a=1.-smoothstep(0.1,0.5,length(gl_PointCoord-0.5)); gl_FragColor=vec4(0.66,0.59,0.4,a*vAlpha); }`,
  }));
  scene.add(new THREE.Points(moteGeometry, moteMaterial));
  return {
    update(seconds, position, day) {
      time.value = seconds;
      focus.value.set(position.x, position.z);
      decay.value = THREE.MathUtils.clamp(((day || 1) - 1) / 4, 0, 1);
    },
  };
}
