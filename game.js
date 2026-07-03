import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* =========================================================================
   REVOLUCIONI FLAMINGO — 3D
   Loje zyre: hidh veze koleget e shperndare ne nje arene 3D.
   Per te lidhur renditjen online, plotesoni supabaseConfig me te dhenat
   e projektit tuaj Supabase (te njejtat fusha si supabase-setup.sql).
   ========================================================================= */

const supabaseConfig = {
  url: "https://xfcamhldlyioxrznuncz.supabase.co",
  anonKey: "sb_publishable_gzd4FRyhqa-Ik4pysBmoFQ_RhVdxgOt",
  table: "revolucioni_flamingo_players"
};

const boardKey = "revolucioni-flamingo-board-v2";
const avatarKey = "revolucioni-flamingo-avatars-v1";
const lastPlayerKey = "revolucioni-flamingo-last-player";

const players = [
  "Anisa Agolli", "Anjeza Xhelilaj", "Aurela Zeneli", "Bjanka Murati",
  "Endi Demneri", "Erisa Lenja", "Fabiola Mulaj", "Fatlinda Papa",
  "Gentian Balla", "Halime Manaj", "Marie Priftaj", "Sara Shehu", "Xhensila Kaziu"
];

const palettes = {
  skin: ["#ffdfc8", "#f1c6a8", "#d79b72", "#b77955", "#f8d7c1"],
  hair: ["#293241", "#3f2a1d", "#6b3f22", "#111827", "#8a5a44"],
  shirt: ["#ff5f96", "#7c3aed", "#16a34a", "#f97316", "#0a6db3"]
};
const maleNames = ["Endi Demneri", "Gentian Balla"];

const gameSeconds = 60;
const gravity = -13;
const baseSpeed = 10.4;
const maxChargeMs = 1100;
const arenaFar = { x: -12.5, z: 0 };
const playerOrigin = new THREE.Vector3(7.6, 1.6, 0);

/* ---------------------------------------------------------------------- */
/* DOM references                                                          */
/* ---------------------------------------------------------------------- */
const canvas = document.getElementById('gameCanvas');
const labelsRoot = document.getElementById('labels');
const reticle = document.getElementById('reticle');
const loadTip = document.getElementById('loadTip');
const loadTipText = document.getElementById('loadTipText');

const playerLabel = document.getElementById('playerLabel');
const scoreLabel = document.getElementById('scoreLabel');
const hitsLabel = document.getElementById('hitsLabel');
const eggsLabel = document.getElementById('eggsLabel');
const timeLabel = document.getElementById('timeLabel');
const timeMetric = timeLabel.closest('.metric');

const powerWrap = document.getElementById('powerWrap');
const powerFill = document.getElementById('powerFill');

const boardToggle = document.getElementById('boardToggle');
const boardPanel = document.getElementById('boardPanel');
const leaderboardEl = document.getElementById('leaderboard');
const syncStatusEl = document.getElementById('syncStatus');
const resetBoardButton = document.getElementById('resetBoardButton');

const startScreen = document.getElementById('startScreen');
const endScreen = document.getElementById('endScreen');
const playerNameSelect = document.getElementById('playerName');
const eggBagSelect = document.getElementById('eggBag');
const startButton = document.getElementById('startButton');
const setupHint = document.getElementById('setupHint');
const genderPills = document.getElementById('genderPills');
const hairStylePills = document.getElementById('hairStylePills');
const faceShapePills = document.getElementById('faceShapePills');
const bodySizePills = document.getElementById('bodySizePills');

const endHeadline = document.getElementById('endHeadline');
const endText = document.getElementById('endText');
const endScore = document.getElementById('endScore');
const endHits = document.getElementById('endHits');
const endAccuracy = document.getElementById('endAccuracy');
const endSyncHint = document.getElementById('endSyncHint');
const playAgainButton = document.getElementById('playAgainButton');
const changePlayerButton = document.getElementById('changePlayerButton');

const previewCanvas = document.getElementById('previewCanvas');

/* ---------------------------------------------------------------------- */
/* State                                                                    */
/* ---------------------------------------------------------------------- */
let playerName = "";
let eggs = 0;
let eggsThrown = 0;
let score = 0;
let hits = 0;
let timeLeft = gameSeconds;
let running = false;
let charging = false;
let chargeStart = 0;
let gameTimerId = null;

let remotePlayers = {};
let currentAvatarState = defaultAvatar("");

const mouseNDC = new THREE.Vector2(0, 0);
const mouseClient = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

const targets = [];       // { group, hitAnchor:THREE.Object3D, hit:false, name }
const projectiles = [];   // { mesh, vel:Vector3, life }
const bursts = [];        // { points, velocities, life, maxLife }
const floaters = [];      // { el, obj3d, life, maxLife }

/* ---------------------------------------------------------------------- */
/* Renderer / scene / camera                                               */
/* ---------------------------------------------------------------------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = false;

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
labelsRoot.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0e1c, 0.035);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.copy(playerOrigin);
const lookTarget = new THREE.Vector3(arenaFar.x, 1.45, 0);
camera.lookAt(lookTarget);
const baseQuaternion = camera.quaternion.clone();
scene.add(camera); // so viewmodel children of camera render

/* ---------------------------------------------------------------------- */
/* Environment                                                             */
/* ---------------------------------------------------------------------- */
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1c1440');
  grad.addColorStop(0.35, '#2a1e4d');
  grad.addColorStop(0.62, '#48244f');
  grad.addColorStop(0.82, '#7a3155');
  grad.addColorStop(1, '#c9536f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFloorTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#141a33';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,95,150,0.16)';
  ctx.lineWidth = 2;
  const step = size / 8;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,209,102,0.05)';
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 40 + 8, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildEnvironment() {
  scene.background = makeSkyTexture();

  const hemi = new THREE.HemisphereLight(0xffd6e8, 0x0d1024, 0.85);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffe7c2, 1.15);
  key.position.set(6, 9, 4);
  scene.add(key);

  const rim = new THREE.PointLight(0xff5f96, 2.2, 26, 2);
  rim.position.set(-11, 4.5, 0);
  scene.add(rim);

  const rim2 = new THREE.PointLight(0x3fe7c9, 1.4, 22, 2);
  rim2.position.set(-2, 3.5, -7);
  scene.add(rim2);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40),
    new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.92, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  // back wall glow strip
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 14),
    new THREE.MeshStandardMaterial({ color: 0x1a1436, roughness: 1 })
  );
  wall.position.set(-15.4, 6, 0);
  wall.rotation.y = Math.PI / 2;
  scene.add(wall);

  buildStringLights();
  buildMascot();
  buildConfetti();
  buildStage();
}

function buildStage() {
  // small raised platforms for the "colleague zone" ambience
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x20264a, roughness: 0.7, metalness: 0.2 });
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.2 + i * 3.6, 3.35 + i * 3.6, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(-12.5, 0.01, 0);
    scene.add(ring);
  }
}

function buildStringLights() {
  const points = [
    new THREE.Vector3(8.5, 5.6, -6.5),
    new THREE.Vector3(1, 6.4, -3),
    new THREE.Vector3(-6, 6.8, 2),
    new THREE.Vector3(-13.5, 6.1, 5.5)
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const bulbCount = 26;
  const colors = [0xff5f96, 0xffd166, 0x3fe7c9];
  const geo = new THREE.SphereGeometry(0.075, 8, 8);
  const group = new THREE.Group();
  const bulbs = [];
  for (let i = 0; i < bulbCount; i++) {
    const t = i / (bulbCount - 1);
    const pos = curve.getPoint(t);
    const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length] });
    const bulb = new THREE.Mesh(geo, mat);
    bulb.position.copy(pos);
    bulb.userData.basePos = pos.clone();
    bulb.userData.phase = i * 0.4;
    group.add(bulb);
    bulbs.push(bulb);
  }
  scene.add(group);
  animatedItems.push((t) => {
    bulbs.forEach((b) => {
      b.position.y = b.userData.basePos.y + Math.sin(t * 1.6 + b.userData.phase) * 0.08;
    });
  });
}

function buildMascot() {
  const mascot = new THREE.Group();
  const pink = new THREE.MeshStandardMaterial({ color: 0xff7fae, roughness: 0.55 });
  const pinkDark = new THREE.MeshStandardMaterial({ color: 0xd6427f, roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 16), pink);
  body.scale.set(1, 1.25, 0.85);
  body.position.y = 1.7;
  mascot.add(body);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.15, 10), pink);
  neck.position.set(0.35, 2.55, 0);
  neck.rotation.z = -0.55;
  mascot.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), pink);
  head.position.set(0.78, 3.15, 0);
  mascot.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 8), new THREE.MeshStandardMaterial({ color: 0x2a2233 }));
  beak.rotation.z = Math.PI / 2 + 0.5;
  beak.position.set(1.0, 3.06, 0);
  mascot.add(beak);

  const legMat = new THREE.MeshStandardMaterial({ color: 0xb84a75, roughness: 0.6 });
  const legStraight = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 1.15, 8), legMat);
  legStraight.position.set(-0.1, 0.58, 0.05);
  mascot.add(legStraight);
  const legBent = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.62, 8), legMat);
  legBent.position.set(0.12, 0.85, -0.08);
  legBent.rotation.z = 0.5;
  mascot.add(legBent);

  mascot.position.set(3.6, 0, -6.4);
  mascot.rotation.y = -0.6;
  mascot.scale.setScalar(0.92);
  scene.add(mascot);

  animatedItems.push((t) => {
    mascot.position.y = Math.sin(t * 1.4) * 0.05;
    head.rotation.y = Math.sin(t * 0.9) * 0.4;
    neck.rotation.x = Math.sin(t * 0.9) * 0.08;
  });
}

function buildConfetti() {
  const count = 220;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [
    new THREE.Color(0xff5f96), new THREE.Color(0xffd166),
    new THREE.Color(0x3fe7c9), new THREE.Color(0xffffff)
  ];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 30 - 5;
    positions[i * 3 + 1] = Math.random() * 8 + 1;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 18;
    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  animatedItems.push((t, dt) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < count; i++) {
      let y = pos.getY(i) - dt * 0.35;
      let x = pos.getX(i) + Math.sin(t * 0.5 + i) * dt * 0.06;
      if (y < 0.1) y = 8 + Math.random() * 1.5;
      pos.setY(i, y);
      pos.setX(i, x);
    }
    pos.needsUpdate = true;
  });
}

const animatedItems = [];

/* ---------------------------------------------------------------------- */
/* Character factory (used both for arena targets & avatar preview)        */
/* ---------------------------------------------------------------------- */
function headGeometry(faceShape) {
  if (faceShape === 'oval') { const g = new THREE.SphereGeometry(0.24, 20, 16); g.scale(1, 1.32, 1); return g; }
  if (faceShape === 'square') return new THREE.BoxGeometry(0.42, 0.42, 0.4);
  return new THREE.SphereGeometry(0.27, 20, 16);
}

function bodyDims(bodySize) {
  if (bodySize === 'slim') return { r: 0.21, l: 0.85 };
  if (bodySize === 'strong') return { r: 0.34, l: 0.92 };
  return { r: 0.27, l: 0.9 };
}

function makeCharacter(avatar) {
  const group = new THREE.Group();
  group.userData.avatar = { ...avatar };

  const skinMat = new THREE.MeshStandardMaterial({ color: avatar.skin, roughness: 0.75 });
  const hairMat = new THREE.MeshStandardMaterial({ color: avatar.hair, roughness: 0.55 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: avatar.shirt, roughness: 0.65 });

  const dims = bodyDims(avatar.bodySize);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(dims.r, dims.l, 6, 12), shirtMat);
  body.position.y = dims.l / 2 + dims.r + 0.02;
  body.scale.x = avatar.gender === 'male' ? 1.08 : 0.95;
  body.scale.z = avatar.gender === 'male' ? 0.98 : 1;
  group.add(body);
  group.userData.body = body;

  const headTop = body.position.y + dims.l / 2 + dims.r + 0.2;
  const head = new THREE.Mesh(headGeometry(avatar.faceShape), skinMat);
  head.position.y = headTop;
  group.add(head);
  group.userData.head = head;

  const hairGroup = new THREE.Group();
  hairGroup.position.copy(head.position);
  buildHair(hairGroup, avatar.hairStyle, hairMat);
  group.add(hairGroup);
  group.userData.hair = hairGroup;

  // eyes (front = -Z after lookAt)
  const eyeGeo = new THREE.SphereGeometry(0.028, 8, 8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x22182a });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.09, headTop + 0.01, -0.2);
  eyeR.position.set(0.09, headTop + 0.01, -0.2);
  group.add(eyeL, eyeR);

  group.userData.materials = { skinMat, hairMat, shirtMat };
  group.userData.headTop = headTop;
  return group;
}

function buildHair(hairGroup, style, mat) {
  while (hairGroup.children.length) hairGroup.remove(hairGroup.children[0]);
  if (style === 'bald') return;
  if (style === 'long') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.285, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), mat);
    cap.position.y = 0.01;
    hairGroup.add(cap);
    const flow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.5, 12, 1, true), mat);
    flow.position.set(0, -0.28, 0.05);
    hairGroup.add(flow);
  } else if (style === 'curly') {
    const positions = [
      [0, 0.18, 0], [0.16, 0.12, 0.08], [-0.16, 0.12, 0.08],
      [0.1, 0.1, -0.14], [-0.1, 0.1, -0.14], [0, 0.24, -0.06]
    ];
    positions.forEach((p) => {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.115, 0), mat);
      puff.position.set(p[0], p[1], p[2]);
      hairGroup.add(puff);
    });
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
    cap.position.y = -0.01;
    hairGroup.add(cap);
  }
}

function applyAvatarToCharacter(group, avatar) {
  group.userData.avatar = { ...avatar };
  const { skinMat, hairMat, shirtMat } = group.userData.materials;
  skinMat.color.set(avatar.skin);
  hairMat.color.set(avatar.hair);
  shirtMat.color.set(avatar.shirt);

  const body = group.userData.body;
  const dims = bodyDims(avatar.bodySize);
  body.geometry.dispose();
  body.geometry = new THREE.CapsuleGeometry(dims.r, dims.l, 6, 12);
  body.position.y = dims.l / 2 + dims.r + 0.02;
  body.scale.x = avatar.gender === 'male' ? 1.08 : 0.95;
  body.scale.z = avatar.gender === 'male' ? 0.98 : 1;

  const headTop = body.position.y + dims.l / 2 + dims.r + 0.2;
  const head = group.userData.head;
  head.geometry.dispose();
  head.geometry = headGeometry(avatar.faceShape);
  head.position.y = headTop;

  group.userData.hair.position.y = headTop;
  buildHair(group.userData.hair, avatar.hairStyle, hairMat);
  group.userData.headTop = headTop;
}

/* ---------------------------------------------------------------------- */
/* Targets (colleagues in the arena)                                       */
/* ---------------------------------------------------------------------- */
function clearTargets() {
  targets.forEach((t) => scene.remove(t.group));
  targets.length = 0;
}

function placeTargets(names) {
  clearTargets();
  const cols = 4;
  names.forEach((name, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const jitterX = (Math.random() - 0.5) * 1.1;
    const jitterZ = (Math.random() - 0.5) * 1.1;
    const x = arenaFar.x - row * 2.6 + jitterX;
    const z = -5.2 + col * 3.3 + jitterZ;

    const avatar = getAvatar(name);
    const group = makeCharacter(avatar);
    group.position.set(x, 0, z);
    group.lookAt(playerOrigin.x, group.userData.headTop, 0);
    group.userData.baseY = 0;
    group.userData.phase = Math.random() * Math.PI * 2;
    scene.add(group);

    const tagEl = document.createElement('div');
    tagEl.className = 'css2d-tag';
    tagEl.textContent = displayName(name);
    const tag = new CSS2DObject(tagEl);
    tag.position.set(0, group.userData.headTop + 0.42, 0);
    group.add(tag);

    targets.push({ group, name, hit: false, radius: 0.62, tagEl });
  });
}

/* ---------------------------------------------------------------------- */
/* Player viewmodel (arm + egg-in-hand)                                    */
/* ---------------------------------------------------------------------- */
const armGroup = new THREE.Group();
armGroup.position.set(0.48, -0.5, -0.9);
camera.add(armGroup);

const skinArmMat = new THREE.MeshStandardMaterial({ color: currentAvatarState.skin, roughness: 0.7 });
const sleeveMat = new THREE.MeshStandardMaterial({ color: currentAvatarState.shirt, roughness: 0.65 });

const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), skinArmMat);
forearm.rotation.z = Math.PI / 2.1;
forearm.position.set(0.08, -0.02, 0.05);
armGroup.add(forearm);

const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.18, 4, 8), sleeveMat);
sleeve.rotation.z = Math.PI / 2.1;
sleeve.position.set(0.32, 0.06, 0.05);
armGroup.add(sleeve);

const handAnchor = new THREE.Object3D();
handAnchor.position.set(-0.16, -0.04, 0.05);
armGroup.add(handAnchor);

const eggGeo = new THREE.SphereGeometry(0.11, 16, 14);
eggGeo.scale(1, 1.28, 1);
const eggMat = new THREE.MeshStandardMaterial({ color: 0xfdf6ea, roughness: 0.35, emissive: 0x000000 });
let eggInHand = new THREE.Mesh(eggGeo, eggMat.clone());
eggInHand.position.set(0, 0, 0);
handAnchor.add(eggInHand);

function spawnHandEgg() {
  if (eggInHand) handAnchor.remove(eggInHand);
  eggInHand = new THREE.Mesh(eggGeo, eggMat.clone());
  handAnchor.add(eggInHand);
}

/* ---------------------------------------------------------------------- */
/* Aiming (raycast onto a plane facing the camera)                         */
/* ---------------------------------------------------------------------- */
const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane();
const aimPoint = new THREE.Vector3();
const forwardVec = new THREE.Vector3();

function computeAimPoint() {
  camera.getWorldDirection(forwardVec);
  const planePoint = camera.position.clone().addScaledVector(forwardVec, 9);
  aimPlane.setFromNormalAndCoplanarPoint(forwardVec, planePoint);
  raycaster.setFromCamera(mouseNDC, camera);
  raycaster.ray.intersectPlane(aimPlane, aimPoint);
  return aimPoint;
}

/* ---------------------------------------------------------------------- */
/* Throwing physics                                                        */
/* ---------------------------------------------------------------------- */
function throwEgg(power) {
  if (eggs <= 0) return;
  const target = computeAimPoint().clone();
  const handWorld = new THREE.Vector3();
  handAnchor.getWorldPosition(handWorld);

  const dir = target.sub(handWorld).normalize();
  const speed = baseSpeed * power;

  const mesh = new THREE.Mesh(eggGeo, eggMat.clone());
  mesh.position.copy(handWorld);
  scene.add(mesh);

  projectiles.push({
    mesh,
    vel: dir.multiplyScalar(speed),
    life: 0
  });

  eggs -= 1;
  eggsThrown += 1;
  updateHud();
  spawnHandEgg();

  // tiny recoil punch
  armGroup.position.z += 0.08;
  setTimeout(() => { armGroup.position.z = -0.9; }, 90);

  if (eggs <= 0) handAnchor.visible = false;
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life += dt;
    p.vel.y += gravity * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += dt * 14;
    p.mesh.rotation.z += dt * 9;

    let hitTarget = null;
    for (const t of targets) {
      if (t.hit) continue;
      const anchor = new THREE.Vector3();
      t.group.getWorldPosition(anchor);
      anchor.y += t.group.userData.headTop * 0.72;
      if (p.mesh.position.distanceTo(anchor) < t.radius) { hitTarget = t; break; }
    }

    if (hitTarget) {
      registerHit(hitTarget, p.mesh.position.clone());
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
      continue;
    }

    const out = p.mesh.position.y < 0.05 || p.life > 3 ||
      p.mesh.position.x < -17 || p.mesh.position.x > 12 ||
      Math.abs(p.mesh.position.z) > 10;

    if (out) {
      spawnBurst(new THREE.Vector3(p.mesh.position.x, Math.max(p.mesh.position.y, 0.05), p.mesh.position.z), [0xfdf6ea, 0xf4d9a0], 10);
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
      if (eggs <= 0 && projectiles.length === 0 && running) {
        setTimeout(endGame, 260);
      }
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Hits, particles, floating score                                         */
/* ---------------------------------------------------------------------- */
function registerHit(target, worldPos) {
  target.hit = true;
  hits += 1;

  const dist = Math.round(playerOrigin.distanceTo(worldPos));
  const gained = 5 + Math.max(1, Math.round(dist / 3));
  score += gained;
  updateHud();

  spawnBurst(worldPos, [0xff5f96, 0xffd166, 0xfdf6ea, 0x3fe7c9], 20);
  spawnFloatingScore('+' + gained, worldPos);

  target.tagEl.style.opacity = '0';
  const start = performance.now();
  const group = target.group;
  const fall = () => {
    const t = Math.min(1, (performance.now() - start) / 420);
    group.rotation.x = -1.35 * t;
    group.position.y = -0.5 * t;
    group.scale.setScalar(1 - 0.3 * t);
    if (t < 1) requestAnimationFrame(fall);
    else scene.remove(group);
  };
  requestAnimationFrame(fall);

  if (targets.every((item) => item.hit)) {
    setTimeout(endGame, 480);
  }
}

function spawnBurst(position, colorInts, count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = [];
  const cols = colorInts.map((c) => new THREE.Color(c));
  for (let i = 0; i < count; i++) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;
    const c = cols[Math.floor(Math.random() * cols.length)];
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    const speed = 1.4 + Math.random() * 2.2;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.6;
    velocities.push(new THREE.Vector3(
      Math.cos(theta) * Math.sin(phi) * speed,
      Math.cos(phi) * speed + 1.4,
      Math.sin(theta) * Math.sin(phi) * speed
    ));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.1, vertexColors: true, transparent: true, opacity: 1, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  bursts.push({ points, velocities, life: 0, maxLife: 0.85 });
}

function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life += dt;
    const pos = b.points.geometry.attributes.position;
    for (let j = 0; j < b.velocities.length; j++) {
      const v = b.velocities[j];
      v.y += gravity * 0.5 * dt;
      pos.setX(j, pos.getX(j) + v.x * dt);
      pos.setY(j, pos.getY(j) + v.y * dt);
      pos.setZ(j, pos.getZ(j) + v.z * dt);
    }
    pos.needsUpdate = true;
    b.points.material.opacity = Math.max(0, 1 - b.life / b.maxLife);
    if (b.life >= b.maxLife) {
      scene.remove(b.points);
      b.points.geometry.dispose();
      b.points.material.dispose();
      bursts.splice(i, 1);
    }
  }
}

function spawnFloatingScore(text, worldPos) {
  const el = document.createElement('div');
  el.className = 'css2d-float';
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.position.copy(worldPos);
  obj.position.y += 0.3;
  scene.add(obj);
  floaters.push({ obj, el, life: 0, maxLife: 0.9 });
}

function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life += dt;
    f.obj.position.y += dt * 0.9;
    f.el.style.opacity = String(Math.max(0, 1 - f.life / f.maxLife));
    if (f.life >= f.maxLife) {
      scene.remove(f.obj);
      floaters.splice(i, 1);
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Camera look + reticle                                                   */
/* ---------------------------------------------------------------------- */
const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();
function updateCameraLook() {
  const yaw = -mouseNDC.x * 0.14;
  const pitch = mouseNDC.y * 0.09;
  tmpEuler.set(pitch, yaw, 0, 'YXZ');
  tmpQuat.setFromEuler(tmpEuler);
  camera.quaternion.copy(baseQuaternion).multiply(tmpQuat);
}

function updateReticle() {
  reticle.style.transform = `translate(${mouseClient.x}px, ${mouseClient.y}px)`;
}

/* ---------------------------------------------------------------------- */
/* Input handling                                                          */
/* ---------------------------------------------------------------------- */
function setMouseFromClient(x, y) {
  mouseClient.x = x; mouseClient.y = y;
  mouseNDC.x = (x / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(y / window.innerHeight) * 2 + 1;
}

function onPointerMove(e) {
  setMouseFromClient(e.clientX, e.clientY);
}

function onPointerDown(e) {
  if (!running || eggs <= 0) return;
  setMouseFromClient(e.clientX, e.clientY);
  charging = true;
  chargeStart = performance.now();
  reticle.classList.add('charging');
  powerWrap.classList.add('show');
}

function onPointerUp(e) {
  if (!charging) return;
  setMouseFromClient(e.clientX, e.clientY);
  charging = false;
  reticle.classList.remove('charging');
  const elapsed = Math.min(maxChargeMs, performance.now() - chargeStart);
  const power = 0.5 + (elapsed / maxChargeMs) * 0.85;
  powerFill.style.width = '0%';
  powerWrap.classList.remove('show');
  throwEgg(power);
}

window.addEventListener('pointermove', onPointerMove, { passive: true });
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  resizePreview();
});

/* ---------------------------------------------------------------------- */
/* Avatar preview (start screen mini scene)                                */
/* ---------------------------------------------------------------------- */
const previewScene = new THREE.Scene();
const previewCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
previewCamera.position.set(0, 1.55, 3.4);
previewCamera.lookAt(0, 1.05, 0);
const previewRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true });
previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
previewRenderer.outputColorSpace = THREE.SRGBColorSpace;

previewScene.add(new THREE.HemisphereLight(0xffd6e8, 0x0d1024, 1.0));
const previewKey = new THREE.DirectionalLight(0xffe7c2, 1.2);
previewKey.position.set(2, 3, 3);
previewScene.add(previewKey);
const previewRim = new THREE.PointLight(0xff5f96, 1.6, 10);
previewRim.position.set(-2, 2, -1.5);
previewScene.add(previewRim);

let previewCharacter = makeCharacter(currentAvatarState);
previewScene.add(previewCharacter);

function resizePreview() {
  const rect = previewCanvas.parentElement.getBoundingClientRect();
  const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
  previewCamera.aspect = w / h;
  previewCamera.updateProjectionMatrix();
  previewRenderer.setSize(w, h, false);
}

function updatePreviewAvatar() {
  applyAvatarToCharacter(previewCharacter, currentAvatarState);
}

/* ---------------------------------------------------------------------- */
/* Avatar persistence                                                      */
/* ---------------------------------------------------------------------- */
function displayName(name) { return (name || '').split(' ')[0] || name; }
function playerId(name) { return (name || '').trim().toLowerCase().replace(/\s+/g, '-'); }

function loadAvatars() {
  try { return JSON.parse(localStorage.getItem(avatarKey)) || {}; } catch { return {}; }
}
function saveAvatars(avatars) { localStorage.setItem(avatarKey, JSON.stringify(avatars)); }

function defaultAvatar(name) {
  const index = Math.max(0, players.indexOf(name));
  const gender = maleNames.includes(name) ? 'male' : 'female';
  return {
    skin: palettes.skin[index % palettes.skin.length],
    hair: palettes.hair[index % palettes.hair.length],
    shirt: palettes.shirt[index % palettes.shirt.length],
    hairStyle: gender === 'female' ? 'long' : 'short',
    faceShape: 'round',
    bodySize: 'normal',
    gender
  };
}

function getAvatar(name) {
  const localAvatar = loadAvatars()[name];
  const remoteAvatar = remotePlayers[name] && remotePlayers[name].avatar;
  if (name === playerNameSelect.value && localAvatar) {
    return { ...defaultAvatar(name), ...remoteAvatar, ...localAvatar };
  }
  return { ...defaultAvatar(name), ...localAvatar, ...remoteAvatar };
}

function saveCurrentAvatar() {
  if (!playerNameSelect.value) return;
  const avatars = loadAvatars();
  avatars[playerNameSelect.value] = { ...currentAvatarState };
  saveAvatars(avatars);
}

/* ---------------------------------------------------------------------- */
/* Supabase sync                                                           */
/* ---------------------------------------------------------------------- */
function isRemoteEnabled() {
  return supabaseConfig.url.startsWith('https://') &&
    supabaseConfig.anonKey.length > 20 &&
    !supabaseConfig.url.includes('PASTE_') &&
    !supabaseConfig.anonKey.includes('PASTE_');
}

function setSyncStatus(message) {
  syncStatusEl.textContent = message;
  endSyncHint.textContent = message;
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${supabaseConfig.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseConfig.anonKey,
      Authorization: `Bearer ${supabaseConfig.anonKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`HTTP ${response.status}: ${details || 'Supabase request failed'}`);
  }
  return response.status === 204 ? null : response.json();
}

function remoteRowToPlayer(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    displayName: row.display_name,
    avatar: row.avatar || defaultAvatar(row.full_name),
    totalScore: row.total_score || 0,
    bestScore: row.best_score || 0,
    games: row.games || 0,
    hits: row.hits || 0,
    lastScore: row.last_score || 0
  };
}

async function loadRemotePlayers() {
  if (!isRemoteEnabled()) {
    setSyncStatus('Ruajtja online nuk eshte konfiguruar ende.');
    return {};
  }
  try {
    const rows = await supabaseRequest(
      `${supabaseConfig.table}?select=id,full_name,display_name,avatar,total_score,best_score,games,hits,last_score,updated_at&order=total_score.desc`
    );
    remotePlayers = {};
    rows.forEach((row) => { remotePlayers[row.full_name] = remoteRowToPlayer(row); });
    setSyncStatus('Te dhenat po ruhen online ne Supabase.');
    return remotePlayers;
  } catch (error) {
    console.error(error);
    setSyncStatus('Supabase nuk u lexua: ' + error.message.slice(0, 140));
    return {};
  }
}

async function saveScoreOnline() {
  if (!isRemoteEnabled()) return false;
  try {
    const existing = remotePlayers[playerName] || { totalScore: 0, bestScore: 0, games: 0, hits: 0 };
    const payload = {
      id: playerId(playerName),
      full_name: playerName,
      display_name: displayName(playerName),
      avatar: currentAvatarState,
      total_score: (existing.totalScore || 0) + score,
      best_score: Math.max(existing.bestScore || 0, score),
      games: (existing.games || 0) + 1,
      hits: (existing.hits || 0) + hits,
      last_score: score,
      updated_at: new Date().toISOString()
    };
    const rows = await supabaseRequest(`${supabaseConfig.table}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload)
    });
    if (rows && rows[0]) remotePlayers[playerName] = remoteRowToPlayer(rows[0]);
    setSyncStatus('Rezultati dhe avatari u ruajten online.');
    return true;
  } catch (error) {
    console.error(error);
    setSyncStatus('Ruajtja online deshtoi: ' + error.message.slice(0, 140));
    return false;
  }
}

async function saveAvatarOnline() {
  if (!isRemoteEnabled() || !playerName) return;
  try {
    const existing = remotePlayers[playerName] || { totalScore: 0, bestScore: 0, games: 0, hits: 0, lastScore: 0 };
    const payload = {
      id: playerId(playerName),
      full_name: playerName,
      display_name: displayName(playerName),
      avatar: currentAvatarState,
      total_score: existing.totalScore || 0,
      best_score: existing.bestScore || 0,
      games: existing.games || 0,
      hits: existing.hits || 0,
      last_score: existing.lastScore || 0,
      updated_at: new Date().toISOString()
    };
    const rows = await supabaseRequest(`${supabaseConfig.table}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload)
    });
    if (rows && rows[0]) remotePlayers[playerName] = remoteRowToPlayer(rows[0]);
  } catch (error) {
    console.error(error);
    setSyncStatus('Avatari nuk u ruajt online: ' + error.message.slice(0, 120));
  }
}

function loadBoard() {
  try { return JSON.parse(localStorage.getItem(boardKey)) || []; } catch { return []; }
}
function saveBoard(board) { localStorage.setItem(boardKey, JSON.stringify(board)); }

async function renderBoard(refreshRemote = false) {
  if (refreshRemote) await loadRemotePlayers();
  const board = Object.keys(remotePlayers).length > 0
    ? Object.values(remotePlayers)
      .sort((a, b) => b.totalScore - a.totalScore || b.bestScore - a.bestScore)
      .map((entry) => ({ name: entry.fullName, score: entry.totalScore }))
      .slice(0, 8)
    : loadBoard().slice(0, 8);

  leaderboardEl.innerHTML = '';
  if (board.length === 0) {
    leaderboardEl.innerHTML = '<div class="board-empty">Ende nuk ka revolucione.</div>';
    return;
  }
  board.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'leader-row';
    row.innerHTML = `<div class="rank">${index + 1}</div><strong>${displayName(entry.name)}</strong><span class="pts">${entry.score}</span>`;
    leaderboardEl.appendChild(row);
  });
}

/* ---------------------------------------------------------------------- */
/* HUD                                                                      */
/* ---------------------------------------------------------------------- */
function updateHud() {
  playerLabel.textContent = playerName ? displayName(playerName) : '-';
  eggsLabel.textContent = eggs;
  scoreLabel.textContent = score;
  hitsLabel.textContent = hits;
  timeLabel.textContent = timeLeft;
  timeMetric.classList.toggle('low', timeLeft <= 10 && running);
}

/* ---------------------------------------------------------------------- */
/* Game flow                                                                */
/* ---------------------------------------------------------------------- */
function parseTargetNames() { return players.filter((n) => n !== playerName); }

async function startGame() {
  playerName = playerNameSelect.value;
  if (!playerName) {
    setupHint.textContent = 'Zgjidh emrin tend per te filluar.';
    setupHint.classList.add('warn');
    return;
  }

  saveCurrentAvatar();
  localStorage.setItem(lastPlayerKey, playerName);
  saveAvatarOnline();

  eggs = Number(eggBagSelect.value);
  eggsThrown = 0;
  score = 0;
  hits = 0;
  timeLeft = gameSeconds;
  running = true;
  charging = false;
  projectiles.forEach((p) => scene.remove(p.mesh));
  projectiles.length = 0;
  handAnchor.visible = true;
  spawnHandEgg();

  startScreen.classList.add('hidden');
  endScreen.classList.add('hidden');

  placeTargets(parseTargetNames());
  updateHud();

  clearInterval(gameTimerId);
  gameTimerId = setInterval(() => {
    timeLeft -= 1;
    updateHud();
    if (timeLeft <= 0) endGame();
  }, 1000);
}

async function endGame() {
  if (!running) return;
  running = false;
  charging = false;
  clearInterval(gameTimerId);
  powerWrap.classList.remove('show');
  powerFill.style.width = '0%';

  const savedOnline = await saveScoreOnline();
  if (!savedOnline) {
    const board = loadBoard();
    board.push({ name: playerName, score, date: new Date().toISOString() });
    board.sort((a, b) => b.score - a.score);
    saveBoard(board.slice(0, 20));
  }
  await renderBoard(savedOnline);

  const accuracy = eggsThrown > 0 ? Math.round((hits / eggsThrown) * 100) : 0;
  let headline = 'Mire u pafshim!';
  if (score >= 90) headline = 'Legjende e zyres! 🏆';
  else if (score >= 55) headline = 'Snajper i flamingos! 🎯';
  else if (score >= 25) headline = 'Fillim i mire!';

  endHeadline.textContent = headline;
  endText.textContent = `${displayName(playerName)}, godite ${hits} kolege dhe mblodhe ${score} pike.`;
  endScore.textContent = score;
  endHits.textContent = hits;
  endAccuracy.textContent = accuracy + '%';
  endScreen.classList.remove('hidden');
}

function backToMenu() {
  endScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
}

/* ---------------------------------------------------------------------- */
/* Start-screen UI wiring                                                  */
/* ---------------------------------------------------------------------- */
function populatePlayerSelect() {
  players.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = displayName(name);
    playerNameSelect.appendChild(opt);
  });
}

function buildSwatchRow(container, field, palette) {
  container.innerHTML = '';
  palette.forEach((hex) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.style.background = hex;
    btn.dataset.color = hex;
    btn.addEventListener('click', () => {
      currentAvatarState[field] = hex;
      refreshSwatchActive(container, hex);
      updatePreviewAvatar();
      saveCurrentAvatar();
    });
    container.appendChild(btn);
  });

  const customWrap = document.createElement('label');
  customWrap.className = 'swatch custom';
  const input = document.createElement('input');
  input.type = 'color';
  input.addEventListener('input', () => {
    currentAvatarState[field] = input.value;
    refreshSwatchActive(container, input.value);
    updatePreviewAvatar();
    saveCurrentAvatar();
  });
  customWrap.appendChild(input);
  container.appendChild(customWrap);
}

function refreshSwatchActive(container, hex) {
  container.querySelectorAll('.swatch').forEach((el) => {
    el.classList.toggle('active', el.dataset.color === hex);
  });
}

function wirePillGroup(container, field) {
  container.querySelectorAll('.pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentAvatarState[field] = btn.dataset.value;
      container.querySelectorAll('.pill').forEach((b) => b.classList.toggle('active', b === btn));
      updatePreviewAvatar();
      saveCurrentAvatar();
    });
  });
}

function setUIFromAvatar(avatar) {
  currentAvatarState = { ...avatar };
  refreshSwatchActive(document.querySelector('[data-swatch="skin"]'), avatar.skin);
  refreshSwatchActive(document.querySelector('[data-swatch="hair"]'), avatar.hair);
  refreshSwatchActive(document.querySelector('[data-swatch="shirt"]'), avatar.shirt);
  setPillActive(genderPills, avatar.gender);
  setPillActive(hairStylePills, avatar.hairStyle);
  setPillActive(faceShapePills, avatar.faceShape);
  setPillActive(bodySizePills, avatar.bodySize);
  updatePreviewAvatar();
}

function setPillActive(container, value) {
  container.querySelectorAll('.pill').forEach((b) => b.classList.toggle('active', b.dataset.value === value));
}

function loadSelectedAvatar() {
  const selectedName = playerNameSelect.value;
  const avatar = selectedName ? getAvatar(selectedName) : defaultAvatar('');
  setUIFromAvatar(avatar);
}

function wireStartScreen() {
  populatePlayerSelect();
  buildSwatchRow(document.querySelector('[data-swatch="skin"]'), 'skin', palettes.skin);
  buildSwatchRow(document.querySelector('[data-swatch="hair"]'), 'hair', palettes.hair);
  buildSwatchRow(document.querySelector('[data-swatch="shirt"]'), 'shirt', palettes.shirt);
  wirePillGroup(genderPills, 'gender');
  wirePillGroup(hairStylePills, 'hairStyle');
  wirePillGroup(faceShapePills, 'faceShape');
  wirePillGroup(bodySizePills, 'bodySize');

  playerNameSelect.addEventListener('change', () => {
    setupHint.classList.remove('warn');
    setupHint.textContent = 'Gati per revolucion!';
    loadSelectedAvatar();
  });

  startButton.addEventListener('click', startGame);
  playAgainButton.addEventListener('click', () => { endScreen.classList.add('hidden'); startGame(); });
  changePlayerButton.addEventListener('click', backToMenu);
  resetBoardButton.addEventListener('click', () => {
    localStorage.removeItem(boardKey);
    renderBoard();
  });

  boardToggle.addEventListener('click', () => boardPanel.classList.toggle('open'));

  const lastPlayer = localStorage.getItem(lastPlayerKey);
  if (lastPlayer && players.includes(lastPlayer)) {
    playerNameSelect.value = lastPlayer;
    loadSelectedAvatar();
  } else {
    setUIFromAvatar(defaultAvatar(''));
  }
}

/* ---------------------------------------------------------------------- */
/* Main loop                                                                */
/* ---------------------------------------------------------------------- */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());
  const t = clock.elapsedTime;

  updateCameraLook();
  updateReticle();

  if (charging) {
    const elapsed = Math.min(maxChargeMs, performance.now() - chargeStart);
    const percent = Math.round((elapsed / maxChargeMs) * 100);
    powerFill.style.width = percent + '%';
    if (eggInHand) {
      const s = 1 + (percent / 100) * 0.35;
      eggInHand.scale.setScalar(s);
      eggInHand.material.emissive.setHex(0xffd166);
      eggInHand.material.emissiveIntensity = percent / 140;
    }
  } else if (eggInHand) {
    eggInHand.scale.setScalar(1);
    eggInHand.material.emissiveIntensity = 0;
  }

  if (running) {
    updateProjectiles(dt);
  }
  updateBursts(dt);
  updateFloaters(dt);

  targets.forEach((tg) => {
    tg.group.position.y = tg.group.userData.baseY + Math.sin(t * 1.6 + tg.group.userData.phase) * 0.035;
  });

  animatedItems.forEach((fn) => fn(t, dt));

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);

  if (!startScreen.classList.contains('hidden')) {
    previewCharacter.rotation.y = t * 0.55;
    previewRenderer.render(previewScene, previewCamera);
  }
}

/* ---------------------------------------------------------------------- */
/* Init                                                                     */
/* ---------------------------------------------------------------------- */
async function init() {
  buildEnvironment();
  placeTargets(players.filter((n) => n !== 'Gentian Balla').slice(0, 12)); // idle preview crowd
  wireStartScreen();
  resizePreview();
  updateHud();

  loadTipText.textContent = 'Po lidhemi me renditjen…';
  await loadRemotePlayers();
  loadSelectedAvatar();
  await renderBoard();

  animate();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    loadTip.classList.add('hidden');
  }));
}

init();
