// The piece studio: builds every Knight Checkers piece as a 3D model and renders it to a PNG.
// Driven by art/render.mjs (Playwright), which calls window.studio.render(name, pixels).
import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { KNIGHT_HEAD, KNIGHT_EYE, KNIGHT_NOSTRIL, KNIGHT_BACK, CROWN } from "./shapes.mjs";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);

// ---------- lighting ----------

// Product-photo reflections: a dark room with a large overhead softbox, a warm key on the
// left and a cool strip behind on the right. `front` adds a reflector facing the camera.
function studioEnvironment({ front = "#ffffff", frontIntensity = 0.3 } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0d0d0f");
  const box = (color, intensity, w, h, position) => {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    panel.position.set(...position);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
  };
  box("#ffffff", 3.4, 14, 14, [0, 12, 2]);
  box("#ffe4c4", 2.8, 8, 12, [-12, 5, 8]);
  box("#cfe0ff", 2.4, 3, 14, [12, 3, -6]);
  box(front, frontIntensity, 24, 18, [0, 1, 16]);
  return scene;
}

const pmrem = new THREE.PMREMGenerator(renderer);
const ENV = {
  studio: pmrem.fromScene(studioEnvironment(), 0.02).texture,
  // Top-down shots look straight at flat faces, so they get a softer, more even room.
  top: pmrem.fromScene(studioEnvironment({ front: "#fff1e0", frontIntensity: 0.5 }), 0.04).texture
};

// ---------- materials ----------

const SIDES = {
  red: { color: "#a30c1a", roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 },
  black: { color: "#1b1c21", roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.08 },
  // Resting knights: the same piece in dull, unpolished stone.
  "red-rest": { color: "#8a5257", roughness: 0.85, clearcoat: 0 },
  "black-rest": { color: "#4d5058", roughness: 0.85, clearcoat: 0 }
};

const lacquer = (side) => new THREE.MeshPhysicalMaterial({ ...SIDES[side], envMapIntensity: 1 });
const gold = (dull = false) =>
  new THREE.MeshStandardMaterial({ color: dull ? "#8b7c5e" : "#f0a92a", metalness: 0.75, roughness: dull ? 0.6 : 0.3 });
// Seen flat-on from above, mirror gold washes out; an inlay needs a deeper, less metallic gold.
const inlayGold = () => new THREE.MeshStandardMaterial({ color: "#d18f12", metalness: 0.35, roughness: 0.42 });
const ink = () => new THREE.MeshPhysicalMaterial({ color: "#070708", roughness: 0.12, clearcoat: 1 });

// ---------- shapes ----------

function shapesFromPath(d, map, divisions = 96) {
  const shapes = SVGLoader.createShapes(new SVGLoader().parse(`<svg><path d="${d}"/></svg>`).paths[0]);
  return shapes.map((shape) => new THREE.Shape(shape.getPoints(divisions).map((p) => map(p.x, p.y))));
}

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const point = (i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
  const slope = (i) => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]);
  return { x: point(0), y: point(1), tx: slope(0), ty: slope(1) };
}

// ---------- checker ----------

const CHECKER_HEIGHT = 0.3;

// One disc, radius 1, lying on the XZ plane: a raised outer rim, a recessed field with one
// groove and a small centre boss, and fine flutes around the side wall like a real checker.
function checkerGeometry() {
  const h = CHECKER_HEIGHT;
  const profile = [
    [0, 0], [0.94, 0], [0.985, 0.012], [1, 0.05], [1, h - 0.06], [0.985, h - 0.018], [0.95, h],
    [0.81, h], [0.785, h - 0.012], [0.77, h - 0.04], [0.6, h - 0.045], [0.585, h - 0.062], [0.55, h - 0.062],
    [0.535, h - 0.045], [0.3, h - 0.045], [0.27, h - 0.03], [0.22, h - 0.024], [0, h - 0.024]
  ];
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 384);
  const position = geometry.attributes.position;
  const flutes = 44;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.99 && y > 0.045 && y < h - 0.055) {
      const k = 1 - 0.022 * (0.5 + 0.5 * Math.cos(flutes * Math.atan2(z, x)));
      position.setX(i, x * k);
      position.setZ(i, z * k);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

function crownEmblem(size, material) {
  const shapes = shapesFromPath(CROWN, (x, y) => new THREE.Vector2(((x - 50) / 50) * size, ((50 - y) / 50) * size), 24);
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelOffset: -0.03, bevelSegments: 4, curveSegments: 24
  });
  const mesh = new THREE.Mesh(geometry, material);
  // Lie flat on the disc with the crown's points toward the top of the screen.
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function buildChecker(side, king = false) {
  const group = new THREE.Group();
  const material = lacquer(side);
  const geometry = checkerGeometry();
  const levels = king ? 2 : 1;
  for (let level = 0; level < levels; level++) {
    const disc = new THREE.Mesh(geometry, material);
    disc.position.y = level * (CHECKER_HEIGHT + 0.012);
    disc.castShadow = disc.receiveShadow = true;
    group.add(disc);
  }
  if (king) {
    const crown = crownEmblem(0.66, inlayGold());
    crown.position.y = 2 * CHECKER_HEIGHT + 0.012 - 0.05;
    group.add(crown);
  }
  return group;
}

// ---------- knight ----------

// SVG outline space (0..100, y down) to model space (y up), centred over the base.
const NECK_CENTER_X = 55;
const BASE_HEIGHT = 24;
const toModel = (x, y) => new THREE.Vector2(x - NECK_CENTER_X, 96 - y + BASE_HEIGHT);

// Carved mane: a band along the back of the neck whose outer edge is cut into locks.
function maneShape() {
  const [a, b] = KNIGHT_BACK;
  const samples = 120;
  const locks = 7;
  const outer = [];
  const inner = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = u < 0.5 ? cubic(...a, u * 2) : cubic(...b, (u - 0.5) * 2);
    const length = Math.hypot(p.tx, p.ty) || 1;
    const nx = p.ty / length, ny = -p.tx / length;
    const taper = Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.04));
    const lock = Math.pow(Math.abs(Math.sin(Math.PI * locks * u)), 0.7);
    const out = (0.6 + 2.6 * lock) * taper;
    const inn = (3 + 7.5 * taper);
    outer.push(toModel(p.x + nx * out, p.y + ny * out));
    inner.push(toModel(p.x - nx * inn, p.y - ny * inn));
  }
  return new THREE.Shape([...outer, ...inner.reverse()]);
}

// Turned pedestal: (radius, height) from the table up.
const BASE_PROFILE = [
  [0, 0], [38, 0], [39.6, 1.2], [39.6, 4.6], [38.2, 6.2], [34.2, 7.4], [34.8, 9.2], [34.8, 11.2],
  [32.6, 12.8], [28.6, 14], [28.2, 16], [29.8, 17.2], [29.8, 19.6], [28.4, 21.4], [25, BASE_HEIGHT + 0.5], [0, BASE_HEIGHT + 0.5]
];

function buildKnight(side) {
  const group = new THREE.Group();
  const resting = side.endsWith("rest");
  const body = lacquer(side);
  const add = (geometry, material = body) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const extrude = (shapes, depth, bevel, size = 0.6, offset = -0.3) => {
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth, curveSegments: 48, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * size,
      bevelOffset: bevel * offset, bevelSegments: 14
    });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  };

  // Head and neck, rounded so it reads as carved rather than cut from sheet.
  const headDepth = 16, headBevel = 8;
  add(extrude(shapesFromPath(KNIGHT_HEAD, toModel), headDepth, headBevel));
  // Mane stands proud of the neck on both sides and scallops the silhouette.
  add(extrude([maneShape()], headDepth + 8, 5, 0.5, -0.2));
  // Pedestal with a gold collar where the neck meets it.
  add(new THREE.LatheGeometry(BASE_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 128));
  const collar = add(new THREE.TorusGeometry(29.4, 1.5, 20, 128), gold(resting));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 18.4;

  // Eyes and nostrils on both cheeks.
  const surface = headDepth / 2 + headBevel;
  const dark = ink();
  for (const z of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), dark);
    const e = toModel(KNIGHT_EYE.cx, KNIGHT_EYE.cy);
    eye.scale.set(KNIGHT_EYE.rx, KNIGHT_EYE.ry, 1.8);
    eye.rotation.z = THREE.MathUtils.degToRad(-KNIGHT_EYE.rotate);
    eye.position.set(e.x, e.y, z * (surface - 0.5));
    group.add(eye);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(KNIGHT_NOSTRIL.r, 16, 12), dark);
    const n = toModel(KNIGHT_NOSTRIL.cx, KNIGHT_NOSTRIL.cy);
    nostril.scale.z = 0.6;
    nostril.position.set(n.x + 1.6, n.y, z * (surface - 3.6));
    group.add(nostril);
  }
  return group;
}

// ---------- rendering ----------

function light(scene, env) {
  scene.environment = ENV[env];
  const top = env === "top";
  const key = new THREE.DirectionalLight("#fff3e2", top ? 1.25 : 2.2);
  key.position.set(-140, 260, 220);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#dbe6ff", top ? 0.7 : 1.5);
  rim.position.set(220, 140, -200);
  scene.add(rim);
  scene.add(new THREE.AmbientLight("#ffffff", 0.22));
}

function snapshot(scene, camera, pixels) {
  renderer.setSize(pixels, pixels);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}

// Checkers are seen from almost straight above, tilted just enough to show their thickness.
const CHECKER_TILT = THREE.MathUtils.degToRad(24);

function renderChecker(side, king, pixels) {
  const scene = new THREE.Scene();
  light(scene, "top");
  scene.add(buildChecker(side, king));
  const half = 1.3;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 100);
  const distance = 20;
  // Aim slightly above the disc so single and stacked pieces share one frame.
  const target = new THREE.Vector3(0, 0.16, -0.1);
  camera.position.set(target.x, target.y + Math.cos(CHECKER_TILT) * distance, target.z + Math.sin(CHECKER_TILT) * distance);
  camera.up.set(0, 0, -1);
  camera.lookAt(target);
  return snapshot(scene, camera, pixels);
}

function renderKnight(side, pixels, { yaw = -0.36, pitch = 0.12, frame = 1.06 } = {}) {
  const scene = new THREE.Scene();
  light(scene, "studio");
  const pivot = new THREE.Group();
  pivot.add(buildKnight(side));
  pivot.rotation.set(pitch, yaw, 0);
  scene.add(pivot);
  const box = new THREE.Box3().setFromObject(pivot);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const half = (Math.max(size.x, size.y) / 2) * frame;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 1, 2000);
  camera.position.set(center.x, center.y, center.z + 600);
  camera.lookAt(center);
  return snapshot(scene, camera, pixels);
}

function renderCrown(pixels) {
  const scene = new THREE.Scene();
  light(scene, "top");
  scene.add(crownEmblem(1, inlayGold()));
  const camera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.1, 100);
  camera.position.set(0, 20, 0.001);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  return snapshot(scene, camera, pixels);
}

// Cinematic shot of a real 3D board for the home screen and README.
const HERO_POSITION = {
  red: { men: ["a1", "c1", "g1", "b2", "h2", "c3", "g3", "f4"], kings: ["d6"], knight: "d4" },
  black: { men: ["b8", "f8", "h8", "a7", "g7", "b6", "h6", "c5"], kings: ["e3"], knight: "f5" }
};

function renderHero(pixels, { aspect = 16 / 9, eye = [6.5, 7.5, 16], target = [0.8, 0.6, 0.6], fov = 30 } = {}) {
  const scene = new THREE.Scene();
  scene.environment = ENV.studio;
  scene.environmentIntensity = 0.55;
  const tile = 2.5;
  const squareCenter = (name) => {
    const col = name.charCodeAt(0) - 97, row = 8 - Number(name[1]);
    return new THREE.Vector3((col - 3.5) * tile, 0, (row - 3.5) * tile);
  };
  const tileGeometry = new THREE.BoxGeometry(tile - 0.02, 0.3, tile - 0.02);
  const darkTile = new THREE.MeshPhysicalMaterial({ color: "#3a5062", roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const lightTile = new THREE.MeshPhysicalMaterial({ color: "#d8cdb8", roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const mesh = new THREE.Mesh(tileGeometry, (row + col) % 2 ? darkTile : lightTile);
      mesh.position.set((col - 3.5) * tile, -0.15, (row - 3.5) * tile);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(tile * 8 + 1.6, 0.5, tile * 8 + 1.6),
    new THREE.MeshPhysicalMaterial({ color: "#16090c", roughness: 0.3, clearcoat: 1 })
  );
  frame.position.y = -0.3;
  frame.receiveShadow = true;
  scene.add(frame);

  for (const side of ["red", "black"]) {
    const setup = HERO_POSITION[side];
    for (const [squares, king] of [[setup.men, false], [setup.kings, true]]) {
      for (const name of squares) {
        const piece = buildChecker(side, king);
        piece.position.copy(squareCenter(name));
        piece.rotation.y = name.charCodeAt(0) * 1.7;
        scene.add(piece);
      }
    }
    const knight = buildKnight(side);
    knight.scale.setScalar(0.027);
    knight.position.copy(squareCenter(setup.knight));
    knight.rotation.y = side === "red" ? 0.2 : Math.PI + 0.35;
    scene.add(knight);
  }

  const key = new THREE.SpotLight("#ffe9d2", 900, 0, 0.5, 0.7, 2);
  key.position.set(-9, 20, 9);
  key.target.position.set(1, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.0004;
  key.shadow.radius = 6;
  scene.add(key, key.target);
  const rim = new THREE.SpotLight("#ff3b4f", 500, 0, 0.7, 0.9, 2);
  rim.position.set(14, 7, -12);
  rim.target.position.set(0, 0, 0);
  scene.add(rim, rim.target);
  scene.add(new THREE.AmbientLight("#ffffff", 0.05));

  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 200);
  camera.position.set(...eye);
  camera.lookAt(...target);
  renderer.setSize(pixels, Math.round(pixels / aspect));
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}

window.studio = {
  render(name, pixels = 512, options = {}) {
    if (name === "crown") return renderCrown(pixels);
    if (name === "hero") return renderHero(pixels, options);
    const [kind, ...rest] = name.split("-");
    const side = rest.join("-");
    if (kind === "checker") return renderChecker(side, false, pixels);
    if (kind === "king") return renderChecker(side, true, pixels);
    if (kind === "knight") return renderKnight(side, pixels, options);
    throw new Error(`Unknown sprite: ${name}`);
  }
};
