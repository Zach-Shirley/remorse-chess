// The piece studio: builds every chess piece as a 3D model and renders it to a PNG.
// Driven by art/render.mjs (Playwright), which calls window.studio.render(name, pixels).
import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { KNIGHT_HEAD, KNIGHT_EYE, KNIGHT_NOSTRIL, KNIGHT_BACK } from "./shapes.mjs";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true; // the bishop's cut
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
  studio: pmrem.fromScene(studioEnvironment(), 0.02).texture
};

// ---------- materials ----------

// The two sides: warm ivory lacquer and obsidian lacquer. `light` scales the studio lights so
// the pale side does not blow out and the dark side still shows its form.
const SIDES = {
  white: { color: "#ecdcbc", roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.12, light: 0.7, env: 0.72 },
  black: { color: "#1b1c21", roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.08, light: 1, env: 1 }
};

const lacquer = (side) => {
  const { light: _light, env, ...physical } = SIDES[side];
  return new THREE.MeshPhysicalMaterial({ ...physical, envMapIntensity: env, vertexColors: true });
};
const gold = () => new THREE.MeshStandardMaterial({ color: "#f0a92a", metalness: 0.75, roughness: 0.3 });
const ink = () => new THREE.MeshPhysicalMaterial({ color: "#070708", roughness: 0.12, clearcoat: 1 });

// Every body mesh carries a white vertex colour so carved details can darken it locally.
function withVertexColors(geometry) {
  const count = geometry.attributes.position.count;
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  return geometry;
}

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

// ---------- turned pieces ----------
//
// Model units: the knight's outline box (100 wide). Every piece stands on the same style of
// turned pedestal with a gold collar, then a stem, then the top that identifies it.
// Heights step down king > queen > bishop > knight > rook > pawn.

// Turned pedestal: (radius, height) from the table up, for a base of radius 39.6.
const BASE_PROFILE = [
  [0, 0], [38, 0], [39.6, 1.2], [39.6, 4.6], [38.2, 6.2], [34.2, 7.4], [34.8, 9.2], [34.8, 11.2],
  [32.6, 12.8], [28.6, 14], [28.2, 16], [29.8, 17.2], [29.8, 19.6], [28.4, 21.4], [25, 24.5]
];
// The bishop's cut, in mitre-relative model units.
const BISHOP_CUT = { angle: -38, x: -19, y: 34, kerf: 2, length: 27, core: { white: "#2b2017", black: "#c9912a" } };
const BASE_RADIUS = 39.6;
const BASE_TOP = 24.5;
const COLLAR_RADIUS = 29.4;
const COLLAR_HEIGHT = 18.4;

function addMesh(group, geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// A lathed body. `draw(path, r, y)` continues the profile from the top of the pedestal
// (radius r, height y) and must end on the axis.
function turnedBody(group, material, radius, draw, { segments = 128, divisions = 20 } = {}) {
  const k = radius / BASE_RADIUS;
  const path = new THREE.Path();
  BASE_PROFILE.forEach(([r, y], index) => (index === 0 ? path.moveTo(r * k, y * k) : path.lineTo(r * k, y * k)));
  draw(path, 25 * k, BASE_TOP * k);
  const geometry = withVertexColors(new THREE.LatheGeometry(path.getPoints(divisions), segments));
  addMesh(group, geometry, material);
  const collar = addMesh(group, new THREE.TorusGeometry(COLLAR_RADIUS * k, 1.5, 20, 128), gold());
  collar.rotation.x = Math.PI / 2;
  collar.position.y = COLLAR_HEIGHT * k;
  return geometry;
}

// A turned ring (a flat collar with rounded edge) between y0 and y1.
function ring(path, inner, outer, y0, y1) {
  const mid = (y0 + y1) / 2;
  path.lineTo(inner, y0);
  path.quadraticCurveTo(outer, y0, outer, mid);
  path.quadraticCurveTo(outer, y1, inner, y1);
}

function buildPawn(side) {
  const group = new THREE.Group();
  turnedBody(group, lacquer(side), 31, (path, r, y) => {
    // Short waisted stem, a collar, then the round head.
    path.bezierCurveTo(r - 6, y + 5, 11, y + 12, 11, 43);
    ring(path, 11, 21, 43, 49.5);
    const center = 64, headRadius = 18;
    const start = -Math.acos(11 / headRadius);
    path.lineTo(Math.cos(start) * headRadius, center + Math.sin(start) * headRadius);
    path.absarc(0, center, headRadius, start, Math.PI / 2, false);
  });
  return group;
}

function buildRook(side) {
  const group = new THREE.Group();
  const material = lacquer(side);
  const wall = 29, floor = 82, top = 98;
  turnedBody(group, material, 38, (path, r, y) => {
    // A thick, nearly straight tower.
    path.bezierCurveTo(r - 3, y + 4, 20, y + 12, 20, 58);
    ring(path, 20, 26, 58, 64);
    path.bezierCurveTo(21, 66, 22, 70, wall - 2, 73);
    path.lineTo(wall, 75);
    path.lineTo(wall, floor);
    path.lineTo(wall - 9.5, floor);
    path.lineTo(wall - 10.5, floor - 5);
    path.lineTo(0, floor - 5);
  });
  // Battlements: five merlons with clear gaps, so the notched top reads at small sizes.
  const merlons = 5;
  const gap = 0.36;
  for (let i = 0; i < merlons; i += 1) {
    const span = (Math.PI * 2) / merlons;
    // Offset so a gap, not a merlon edge, faces the camera slightly off-centre.
    const a0 = i * span + span * gap * 0.5 + 0.35;
    const a1 = (i + 1) * span - span * gap * 0.5 + 0.35;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, wall - 0.6, a0, a1, false);
    shape.absarc(0, 0, wall - 9.4, a1, a0, true);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: top - floor - 1.2, curveSegments: 24, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 0.6, bevelOffset: -0.6, bevelSegments: 4
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, floor - 0.4, 0);
    addMesh(group, withVertexColors(geometry), material);
  }
  return group;
}

function buildBishop(side) {
  const group = new THREE.Group();
  const material = lacquer(side);
  const mitreBase = 62;
  turnedBody(group, material, 36, (path, r, y) => {
    path.bezierCurveTo(r - 7, y + 6, 9.5, y + 22, 9.5, 52);
    ring(path, 9.5, 19, 52, 57.5);
    ring(path, 9.5, 14, 57.5, mitreBase);
    path.lineTo(0, mitreBase);
  });

  const mitre = new THREE.Path();
  mitre.moveTo(0, mitreBase - 1);
  mitre.lineTo(9, mitreBase - 1);
  mitre.bezierCurveTo(17.5, mitreBase + 5, 20, mitreBase + 17, 12, mitreBase + 31);
  mitre.bezierCurveTo(9, mitreBase + 37, 5, mitreBase + 40, 3.2, mitreBase + 42.5);
  const tip = mitreBase + 46.5, tipRadius = 5;
  const start = -Math.acos(3.2 / tipRadius);
  mitre.lineTo(Math.cos(start) * tipRadius, tip + Math.sin(start) * tipRadius);
  mitre.absarc(0, tip, tipRadius, start, Math.PI / 2, false);
  const geometry = withVertexColors(new THREE.LatheGeometry(mitre.getPoints(48), 160));

  // The cut: a saw kerf sliced out of the mitre with clipping planes. It enters high on one
  // side and runs down toward the centre. A slimmer core in a contrasting colour shows inside.
  const angle = THREE.MathUtils.degToRad(BISHOP_CUT.angle);
  const along = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
  const across = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);
  const entry = new THREE.Vector3(BISHOP_CUT.x, mitreBase + BISHOP_CUT.y, 0);
  const localPlanes = [
    new THREE.Plane(across.clone(), -entry.dot(across) - BISHOP_CUT.kerf),
    new THREE.Plane(across.clone().negate(), entry.dot(across) - BISHOP_CUT.kerf),
    new THREE.Plane(along.clone(), -entry.dot(along) - BISHOP_CUT.length)
  ];
  const shell = lacquer(side);
  shell.clippingPlanes = localPlanes.map((plane) => plane.clone());
  shell.clipIntersection = true;
  shell.side = THREE.DoubleSide;
  const mesh = addMesh(group, geometry, shell);
  // Clipping planes live in world space, so follow the piece wherever it is placed.
  mesh.onBeforeRender = () => {
    shell.clippingPlanes.forEach((plane, index) => plane.copy(localPlanes[index]).applyMatrix4(mesh.matrixWorld));
  };
  const core = addMesh(group, geometry, new THREE.MeshStandardMaterial({ color: BISHOP_CUT.core[side], roughness: 0.6, metalness: 0.2 }));
  core.scale.set(0.74, 1, 0.74);
  return group;
}

function buildQueen(side) {
  const group = new THREE.Group();
  const material = lacquer(side);
  const cup = 86, rim = 110, points = 8;
  turnedBody(group, material, 39, (path, r, y) => {
    path.bezierCurveTo(r - 7, y + 6, 10.5, y + 26, 10.5, 74);
    ring(path, 10.5, 21, 74, 80);
    ring(path, 10.5, 15, 80, cup);
    path.lineTo(0, cup);
  });

  // Coronet: a flared cup whose rim is cut into points, each tipped with a ball.
  const crown = new THREE.Path();
  crown.moveTo(0, cup - 1);
  crown.lineTo(10, cup - 1);
  crown.bezierCurveTo(12, cup + 8, 17, cup + 16, 25, rim);
  crown.lineTo(20, rim);
  crown.bezierCurveTo(16, rim - 9, 12, rim - 12, 0, rim - 13);
  const geometry = withVertexColors(new THREE.LatheGeometry(crown.getPoints(40), 320));
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const weight = THREE.MathUtils.smoothstep(y, rim - 12, rim) * THREE.MathUtils.smoothstep(Math.hypot(x, z), 14, 20);
    if (weight > 0) {
      const wave = Math.pow(0.5 + 0.5 * Math.cos(points * Math.atan2(z, x)), 1.6);
      position.setY(i, y - (1 - wave) * 9 * weight);
    }
  }
  geometry.computeVertexNormals();
  addMesh(group, geometry, material);
  for (let i = 0; i < points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    const ball = addMesh(group, withVertexColors(new THREE.SphereGeometry(3.6, 20, 14)), material);
    ball.position.set(Math.cos(a) * 22.8, rim + 2.2, Math.sin(a) * 22.8);
  }
  // Domed cap and a gold ball on top.
  const dome = addMesh(group, withVertexColors(new THREE.SphereGeometry(13.5, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2)), material);
  dome.scale.y = 0.85;
  dome.position.y = rim - 9;
  const finial = addMesh(group, new THREE.SphereGeometry(5.2, 28, 20), gold());
  finial.position.y = rim + 6.5;
  return group;
}

function buildKing(side) {
  const group = new THREE.Group();
  const material = lacquer(side);
  const cup = 82, rim = 104;
  turnedBody(group, material, 40, (path, r, y) => {
    path.bezierCurveTo(r - 7, y + 6, 11.5, y + 28, 11.5, 70);
    ring(path, 11.5, 22, 70, 76);
    ring(path, 11.5, 16, 76, cup);
    // Crown: a flared cup closed by a low dome.
    path.bezierCurveTo(12, cup + 9, 16, cup + 17, 23, rim - 2);
    path.quadraticCurveTo(24.5, rim, 22.5, rim + 1.5);
    path.bezierCurveTo(16, rim + 5, 9, rim + 7, 4.5, rim + 7.5);
    path.lineTo(4.5, rim + 10);
    path.lineTo(0, rim + 10);
  });

  // The cross, in gold so the king is unmistakable at any size.
  const top = rim + 9, bar = 3.8, arm = 10.5, height = 24, crossbar = top + 14;
  const shape = new THREE.Shape();
  shape.moveTo(-bar, top);
  shape.lineTo(bar, top);
  shape.lineTo(bar, crossbar - bar);
  shape.lineTo(arm, crossbar - bar);
  shape.lineTo(arm, crossbar + bar);
  shape.lineTo(bar, crossbar + bar);
  shape.lineTo(bar, top + height);
  shape.lineTo(-bar, top + height);
  shape.lineTo(-bar, crossbar + bar);
  shape.lineTo(-arm, crossbar + bar);
  shape.lineTo(-arm, crossbar - bar);
  shape.lineTo(-bar, crossbar - bar);
  shape.closePath();
  const depth = 5;
  const cross = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.2, bevelOffset: -0.6, bevelSegments: 5
  });
  cross.translate(0, 0, -depth / 2);
  addMesh(group, cross, gold());
  return group;
}

// ---------- knight ----------

// SVG outline space (0..100, y down) to model space (y up), centred over the base.
const NECK_CENTER_X = 55;
const KNIGHT_BASE_HEIGHT = 24;
const toModel = (x, y) => new THREE.Vector2(x - NECK_CENTER_X, 96 - y + KNIGHT_BASE_HEIGHT);

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

// The knight is modelled 120 units tall; it is scaled to sit between the bishop and the rook.
const KNIGHT_SCALE = 0.9;
// Lathed pieces are widened a little: stockier pieces read better on a small phone square.
const STOCKY = 1.2;

function buildKnight(side) {
  const group = new THREE.Group();
  const body = lacquer(side);
  const extrude = (shapes, depth, bevel, size = 0.6, offset = -0.3) => {
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth, curveSegments: 48, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * size,
      bevelOffset: bevel * offset, bevelSegments: 14
    });
    geometry.translate(0, 0, -depth / 2);
    return withVertexColors(geometry);
  };

  // Head and neck, rounded so it reads as carved rather than cut from sheet.
  const headDepth = 16, headBevel = 8;
  addMesh(group, extrude(shapesFromPath(KNIGHT_HEAD, toModel), headDepth, headBevel), body);
  // Mane stands proud of the neck on both sides and scallops the silhouette.
  addMesh(group, extrude([maneShape()], headDepth + 8, 5, 0.5, -0.2), body);
  // Pedestal with a gold collar where the neck meets it.
  turnedBody(group, body, BASE_RADIUS, (path) => path.lineTo(0, BASE_TOP));

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
  group.scale.setScalar(KNIGHT_SCALE);
  return group;
}

const BUILDERS = { pawn: buildPawn, knight: buildKnight, bishop: buildBishop, rook: buildRook, queen: buildQueen, king: buildKing };

function buildPiece(kind, side) {
  const builder = BUILDERS[kind];
  if (!builder) throw new Error(`Unknown piece: ${kind}`);
  // Wrapped so callers can scale and place a piece without disturbing its own transform.
  const wrapper = new THREE.Group();
  const piece = builder(side);
  if (kind !== "knight") piece.scale.set(STOCKY, 1, STOCKY);
  wrapper.add(piece);
  return wrapper;
}

// ---------- rendering ----------

function light(scene, side) {
  const level = SIDES[side].light;
  scene.environment = ENV.studio;
  const key = new THREE.DirectionalLight("#fff3e2", 2.2 * level);
  key.position.set(-140, 260, 220);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#dbe6ff", 1.5 * level);
  rim.position.set(220, 140, -200);
  scene.add(rim);
  scene.add(new THREE.AmbientLight("#ffffff", 0.22 * level));
}

function snapshot(scene, camera, pixels) {
  renderer.setSize(pixels, pixels);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}

// Every sprite shares one frame (sized for the king, the tallest piece) and one floor line, so
// the pieces keep their relative heights on the board. Front three-quarter view, slightly above.
const SPRITE_HALF = 80;
const SPRITE_FLOOR = 0.9; // the pedestal's lowest point sits this far down the frame's half-height
const YAW = { knight: -0.36, bishop: -0.3, king: -0.42, rook: -0.2 };

function renderPiece(kind, side, pixels, { yaw = YAW[kind] ?? -0.36, pitch = 0.12, fit = 0 } = {}) {
  const scene = new THREE.Scene();
  light(scene, side);
  const pivot = new THREE.Group();
  pivot.add(buildPiece(kind, side));
  pivot.rotation.set(pitch, yaw, 0);
  scene.add(pivot);
  const box = new THREE.Box3().setFromObject(pivot);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // `fit` frames the piece on its own (for the icon) instead of in the shared sprite frame.
  const half = fit ? (Math.max(size.x, size.y) / 2) * fit : SPRITE_HALF;
  const y = fit ? center.y : box.min.y + half * SPRITE_FLOOR;
  // Lathed pieces are symmetric, so centre them on their axis; the knight on its own bounds.
  const x = kind === "knight" || fit ? center.x : 0;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 1, 2000);
  camera.position.set(x, y, center.z + 600);
  camera.lookAt(x, y, center.z);
  return snapshot(scene, camera, pixels);
}

// Cinematic shot of a real 3D board for the home screen and README: a middlegame after the
// first exchanges, with White's bishop standing among its pieces like a confessor.
const HERO_POSITION = {
  white: {
    king: ["g1"], queen: ["d2"], rook: ["e1"], bishop: ["e3"], knight: ["f3", "d5"],
    pawn: ["a2", "b2", "c3", "e4", "f2", "g2", "h3"]
  },
  black: {
    king: ["g8"], queen: ["c7"], rook: ["d8"], bishop: ["b7"], knight: ["f6"],
    pawn: ["a7", "b6", "c5", "f7", "g7", "h7"]
  }
};

function renderHero(pixels, { aspect = 16 / 9, eye = [9, 9, 20.5], target = [-1.2, 0, 0.8], fov = 30 } = {}) {
  const scene = new THREE.Scene();
  scene.environment = ENV.studio;
  scene.environmentIntensity = 0.55;
  const tile = 2.5;
  const squareCenter = (name) => {
    const col = name.charCodeAt(0) - 97, row = 8 - Number(name[1]);
    return new THREE.Vector3((col - 3.5) * tile, 0, (row - 3.5) * tile);
  };
  const tileGeometry = new THREE.BoxGeometry(tile - 0.02, 0.3, tile - 0.02);
  const darkTile = new THREE.MeshPhysicalMaterial({ color: "#41596f", roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const lightTile = new THREE.MeshPhysicalMaterial({ color: "#c9b996", roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 });
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
    new THREE.MeshPhysicalMaterial({ color: "#0f0b1d", roughness: 0.3, clearcoat: 1 })
  );
  frame.position.y = -0.3;
  frame.receiveShadow = true;
  scene.add(frame);

  for (const side of ["white", "black"]) {
    for (const [kind, squares] of Object.entries(HERO_POSITION[side])) {
      for (const name of squares) {
        const piece = buildPiece(kind, side);
        piece.scale.setScalar(0.02);
        piece.position.copy(squareCenter(name));
        // White faces up the board, Black faces down it; knights and bishops turn a little.
        const facing = side === "white" ? -Math.PI / 2 : Math.PI / 2;
        piece.rotation.y = kind === "knight" ? facing + 0.9 : kind === "king" ? 0.4 : kind === "bishop" ? 0.9 : name.charCodeAt(0) * 0.9;
        scene.add(piece);
      }
    }
  }

  const key = new THREE.SpotLight("#ffe9d2", 900, 0, 0.5, 0.7, 2);
  key.position.set(-9, 20, 9);
  key.target.position.set(1, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.0004;
  key.shadow.radius = 6;
  scene.add(key, key.target);
  const rim = new THREE.SpotLight("#7a5cff", 650, 0, 0.7, 0.9, 2);
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
  // name: "<kind>-<side>" (for example "queen-white") or "hero".
  render(name, pixels = 512, options = {}) {
    if (name === "hero") return renderHero(pixels, options);
    const [kind, ...rest] = name.split("-");
    const side = rest.join("-");
    if (!SIDES[side]) throw new Error(`Unknown sprite: ${name}`);
    return renderPiece(kind, side, pixels, options);
  }
};
