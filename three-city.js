import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const CITY_CONFIG = {
  gridSize: 10,
  blockSize: 44,
  roadWidth: 16,
  jaipurBounds: {
    latMin: 26.82,
    latMax: 26.98,
    lonMin: 75.70,
    lonMax: 75.88,
  },
  colors: {
    sky: 0x050a14,
    fog: 0x050a14,
    ground: 0x070d19,
    road: 0x0e1726,
    sidewalk: 0x162235,
    heritageBase: 0x5c342e,
    heritageTrim: 0xb97a63,
    civicBase: 0x1e2c44,
    civicDome: 0x67e8f9,
    commercialBase: 0x0f1c30,
    residentialBase: 0x132238,
    park: 0x0a251c,
    parkBorder: 0x16382c,
    water: 0x0ea5e9,
    markerCritical: 0xf43f5e,
    markerHigh: 0xfb7185,
    markerNormal: 0xf59e0b,
    markerResolved: 0x10b981,
    cluster: 0x38bdf8,
  },
};

const DISTRICT_ZONES = [
  { name: 'Jhotwara', gx: 1, gz: 1, lat: 26.941, lon: 75.746, kind: 'Residential & Transit' },
  { name: 'Walled Pink City', gx: 5, gz: 2, lat: 26.924, lon: 75.824, kind: 'Heritage Precinct' },
  { name: 'Vaishali Nagar', gx: 2, gz: 4, lat: 26.912, lon: 75.739, kind: 'Commercial & Residential' },
  { name: 'MI Road & Civic Core', gx: 5, gz: 5, lat: 26.912, lon: 75.787, kind: 'Civic & Central Corridor' },
  { name: 'Central Park', gx: 4, gz: 6, lat: 26.901, lon: 75.805, kind: 'Urban Green Zone' },
  { name: 'Mansarovar', gx: 3, gz: 8, lat: 26.854, lon: 75.764, kind: 'Residential Ward' },
  { name: 'Malviya Nagar', gx: 7, gz: 8, lat: 26.854, lon: 75.805, kind: 'Commercial & Tech Hub' },
];

const CAMERA_PRESETS = {
  overview: { pos: new THREE.Vector3(330, 265, 340), target: new THREE.Vector3(0, 12, 0) },
  heritage: { pos: new THREE.Vector3(145, 130, -35), target: new THREE.Vector3(30, 16, -150) },
  civic: { pos: new THREE.Vector3(150, 135, 165), target: new THREE.Vector3(15, 14, 10) },
  topdown: { pos: new THREE.Vector3(0, 460, 45), target: new THREE.Vector3(0, 0, 0) },
};

// Pre-allocated math helpers for zero-GC animation loop
const _vec3 = new THREE.Vector3();
const _vec3b = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let cityGroup = null;
let markerGroup = null;
let vehicleGroup = null;
let fountainWater = null;

let canvasContainer = null;
let hoverTooltip = null;

let isInitialized = false;
let isPaused = false;
let isSoftwareGl = false;
let reducedMotion = false;
let frameId = 0;
let lastTimestamp = 0;
let elapsedTime = 0;
let lastRaycastTime = 0;

let raycaster = null;
let pointerNDC = new THREE.Vector2();
let buildingHitTargets = [];
let markerHitTargets = [];
let hoveredTarget = null;
let selectedBuildingMesh = null;
let selectedMarkerGroup = null;

let cameraTransition = null;

let allReports = [];
let activeFilters = {
  status: 'all',
  category: 'all',
  severity: 'all',
  search: '',
  clustering: true,
};

let callbacks = {
  onSelectIssue: null,
  onSelectBuilding: null,
  onReady: null,
  onError: null,
};

const cachedGeometries = new Set();
const cachedMaterials = new Set();
const cachedTextures = new Set();

function trackGeo(geo) {
  cachedGeometries.add(geo);
  return geo;
}
function trackMat(mat) {
  cachedMaterials.add(mat);
  return mat;
}
function trackTex(tex) {
  cachedTextures.add(tex);
  return tex;
}

function detectSoftwareWebGL() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

function createWindowFacadeTexture(accentHex, baseHex, cols = 6, rows = 12) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const padX = 16;
  const padY = 18;
  const cellW = (canvas.width - padX * 2) / cols;
  const cellH = (canvas.height - padY * 2) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = ((r * 7 + c * 13) % 5) !== 0;
      const warm = ((r + c) % 4) === 0;
      if (lit) {
        ctx.fillStyle = warm ? 'rgba(251, 191, 36, 0.55)' : accentHex;
      } else {
        ctx.fillStyle = 'rgba(12, 24, 42, 0.85)';
      }
      ctx.fillRect(
        padX + c * cellW + 4,
        padY + r * cellH + 5,
        Math.max(4, cellW - 8),
        Math.max(6, cellH - 10)
      );
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return trackTex(tex);
}

function createRoadAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0e1726';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle asphalt grain
  for (let i = 0; i < 650; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Center dashed divider
  ctx.fillStyle = 'rgba(148, 163, 184, 0.36)';
  for (let y = 12; y < 256; y += 44) {
    ctx.fillRect(126, y, 4, 24);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 18);
  if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return trackTex(tex);
}

function gridToWorld(gx, gz) {
  const step = CITY_CONFIG.blockSize + CITY_CONFIG.roadWidth;
  const half = (CITY_CONFIG.gridSize * step) / 2;
  return {
    x: gx * step - half + step / 2,
    z: gz * step - half + step / 2,
  };
}

function geoToWorld(report) {
  const step = CITY_CONFIG.blockSize + CITY_CONFIG.roadWidth;
  const worldSize = CITY_CONFIG.gridSize * step;
  const half = worldSize / 2;
  const { latMin, latMax, lonMin, lonMax } = CITY_CONFIG.jaipurBounds;

  let lat = Number(report.lat);
  let lon = Number(report.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    // Deterministic Jaipur district fallback for reports submitted without GPS coordinates
    const text = String(report.location || '').toLowerCase();
    const matchedZone = DISTRICT_ZONES.find((z) => text.includes(z.name.toLowerCase().split(' ')[0]));
    if (matchedZone) {
      lat = matchedZone.lat;
      lon = matchedZone.lon;
    } else {
      let hash = 0;
      const key = String(report.id || report.location || 'CF');
      for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash) + key.charCodeAt(i);
      const zone = DISTRICT_ZONES[Math.abs(hash) % DISTRICT_ZONES.length];
      lat = zone.lat + ((hash % 7) - 3) * 0.002;
      lon = zone.lon + (((hash >> 3) % 7) - 3) * 0.002;
    }
  }

  const latNorm = THREE.MathUtils.clamp((lat - latMin) / (latMax - latMin), 0.06, 0.94);
  const lonNorm = THREE.MathUtils.clamp((lon - lonMin) / (lonMax - lonMin), 0.06, 0.94);
  return {
    x: (lonNorm - 0.5) * worldSize * 0.9,
    z: (0.5 - latNorm) * worldSize * 0.9,
    approximate: !Number.isFinite(Number(report.lat)) || !Number.isFinite(Number(report.lon)),
  };
}

function setupLighting() {
  const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x070d19, 0.55);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfef3c7, 1.45);
  keyLight.position.set(260, 420, 220);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 20;
    keyLight.shadow.camera.far = 1100;
    const d = 340;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.025;
  }
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
  rimLight.position.set(-280, 180, -240);
  scene.add(rimLight);
}

function createCompositeBuilding(x, z, w, d, districtKind, gx, gz) {
  const group = new THREE.Group();
  const seed = (gx * 31 + gz * 17) % 100;

  let baseColor = CITY_CONFIG.colors.residentialBase;
  let accentColor = 0x38bdf8;
  let windowColor = 'rgba(56, 189, 248, 0.65)';
  let height = 22 + (seed % 42);

  if (districtKind === 'heritage') {
    baseColor = CITY_CONFIG.colors.heritageBase;
    accentColor = 0xfbbf24;
    windowColor = 'rgba(251, 191, 36, 0.68)';
    height = 18 + (seed % 18);
  } else if (districtKind === 'civic') {
    baseColor = CITY_CONFIG.colors.civicBase;
    accentColor = 0x22d3ee;
    windowColor = 'rgba(34, 211, 238, 0.72)';
    height = 36 + (seed % 48);
  } else if (districtKind === 'commercial') {
    baseColor = CITY_CONFIG.colors.commercialBase;
    accentColor = 0x60a5fa;
    windowColor = 'rgba(96, 165, 250, 0.72)';
    height = 38 + (seed % 58);
  }

  const facadeTex = createWindowFacadeTexture(windowColor, districtKind === 'heritage' ? '#4a2621' : '#0b1628');
  const podiumMat = trackMat(new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.78,
    metalness: 0.12,
  }));
  const towerMat = trackMat(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: facadeTex,
    roughness: districtKind === 'heritage' ? 0.74 : 0.38,
    metalness: districtKind === 'heritage' ? 0.1 : 0.45,
  }));
  const trimMat = trackMat(new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.25,
    roughness: 0.35,
    metalness: 0.5,
  }));

  // 1. Grounded podium base
  const podiumH = 5.5;
  const podiumGeo = trackGeo(new THREE.BoxGeometry(w, podiumH, d));
  const podium = new THREE.Mesh(podiumGeo, podiumMat);
  podium.position.y = podiumH / 2;
  podium.castShadow = true;
  podium.receiveShadow = true;
  group.add(podium);

  // 2. Primary tower body
  const towerW = w * 0.84;
  const towerD = d * 0.84;
  const towerGeo = trackGeo(new THREE.BoxGeometry(towerW, height, towerD));
  const tower = new THREE.Mesh(towerGeo, towerMat);
  tower.position.y = podiumH + height / 2;
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  // 3. Upper architectural crown / setback
  const crownH = districtKind === 'heritage' ? 4.5 : 7.5;
  const crownGeo = trackGeo(new THREE.BoxGeometry(towerW * 0.68, crownH, towerD * 0.68));
  const crown = new THREE.Mesh(crownGeo, podiumMat);
  crown.position.y = podiumH + height + crownH / 2;
  crown.castShadow = true;
  group.add(crown);

  // 4. Rooftop accent rim or civic dome
  if (districtKind === 'civic' && (gx + gz) % 2 === 0) {
    const domeGeo = trackGeo(new THREE.SphereGeometry(towerW * 0.24, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2));
    const dome = new THREE.Mesh(domeGeo, trimMat);
    dome.position.y = podiumH + height + crownH;
    group.add(dome);
  } else {
    const rimGeo = trackGeo(new THREE.BoxGeometry(towerW * 0.72, 0.9, towerD * 0.72));
    const rim = new THREE.Mesh(rimGeo, trimMat);
    rim.position.y = podiumH + height + crownH + 0.45;
    group.add(rim);
  }

  // 5. Heritage chhatri finials / modern antenna mast
  if (districtKind === 'heritage') {
    const finGeo = trackGeo(new THREE.ConeGeometry(1.6, 4.2, 6));
    const fin1 = new THREE.Mesh(finGeo, trimMat);
    fin1.position.set(-towerW * 0.22, podiumH + height + crownH + 2.1, -towerD * 0.22);
    const fin2 = fin1.clone();
    fin2.position.set(towerW * 0.22, podiumH + height + crownH + 2.1, towerD * 0.22);
    group.add(fin1, fin2);
  } else if (height > 54) {
    const mastGeo = trackGeo(new THREE.CylinderGeometry(0.35, 0.6, 12, 6));
    const mast = new THREE.Mesh(mastGeo, trimMat);
    mast.position.y = podiumH + height + crownH + 6;
    group.add(mast);
  }

  group.position.set(x, 0, z);
  const nearestZone = DISTRICT_ZONES.reduce((best, zItem) => {
    const dist = Math.hypot(gx - zItem.gx, gz - zItem.gz);
    return dist < best.dist ? { dist, zone: zItem } : best;
  }, { dist: Infinity, zone: DISTRICT_ZONES[3] }).zone;

  const buildingMeta = {
    id: `BLDG-${gx}${gz}`,
    name: `${nearestZone.name} Block ${gx + 1}-${gz + 1}`,
    district: nearestZone.name,
    zoneKind: nearestZone.kind,
    floors: Math.round((podiumH + height + crownH) / 3.2),
    heightMeters: Math.round(podiumH + height + crownH),
    lat: nearestZone.lat,
    lon: nearestZone.lon,
    primaryMesh: tower,
    originalEmissive: new THREE.Color(0x000000),
  };

  tower.userData = { buildingMeta };
  podium.userData = { buildingMeta };
  crown.userData = { buildingMeta };
  buildingHitTargets.push(tower, podium);

  cityGroup.add(group);
}

function createCentralPark(x, z, size) {
  const parkGroup = new THREE.Group();
  const baseGeo = trackGeo(new THREE.BoxGeometry(size * 0.94, 0.8, size * 0.94));
  const baseMat = trackMat(new THREE.MeshStandardMaterial({
    color: CITY_CONFIG.colors.park,
    roughness: 0.92,
    metalness: 0.02,
  }));
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.4;
  base.receiveShadow = true;
  parkGroup.add(base);

  // Central civic plaza ring & water feature
  const basinGeo = trackGeo(new THREE.CylinderGeometry(6.5, 7.2, 1.1, 24));
  const basinMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.3 }));
  const basin = new THREE.Mesh(basinGeo, basinMat);
  basin.position.y = 0.95;
  basin.receiveShadow = true;
  parkGroup.add(basin);

  const waterGeo = trackGeo(new THREE.CylinderGeometry(5.6, 5.6, 0.35, 24));
  const waterMat = trackMat(new THREE.MeshStandardMaterial({
    color: CITY_CONFIG.colors.water,
    emissive: 0x0284c7,
    emissiveIntensity: 0.35,
    roughness: 0.15,
    metalness: 0.65,
  }));
  fountainWater = new THREE.Mesh(waterGeo, waterMat);
  fountainWater.position.y = 1.45;
  parkGroup.add(fountainWater);

  // Instanced trees
  const treeCount = 16;
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.35, 0.55, 3.6, 7));
  const trunkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x452b1b, roughness: 0.9 }));
  const crownGeo = trackGeo(new THREE.ConeGeometry(2.3, 6.4, 8));
  const crownMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.82 }));

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  trunks.castShadow = true;
  crowns.castShadow = true;

  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2;
    const radius = 12 + (i % 3) * 4.2;
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;
    const s = 0.85 + ((i * 7) % 4) * 0.1;

    _scale.set(s, s, s);
    _vec3.set(tx, 1.8 * s + 0.8, tz);
    _mat4.compose(_vec3, _quat.identity(), _scale);
    trunks.setMatrixAt(i, _mat4);

    _vec3.set(tx, 5.6 * s + 0.8, tz);
    _mat4.compose(_vec3, _quat.identity(), _scale);
    crowns.setMatrixAt(i, _mat4);

    _color.setHSL(0.38 + (i % 3) * 0.02, 0.55, 0.28 + (i % 4) * 0.03);
    crowns.setColorAt(i, _color);
  }
  trunks.computeBoundingSphere();
  crowns.computeBoundingSphere();
  parkGroup.add(trunks, crowns);

  parkGroup.position.set(x, 0, z);
  cityGroup.add(parkGroup);
}

function createCityEnvironment() {
  cityGroup = new THREE.Group();
  cityGroup.name = 'jaipur-digital-twin';
  scene.add(cityGroup);

  const { gridSize, blockSize, roadWidth } = CITY_CONFIG;
  const step = blockSize + roadWidth;
  const worldSize = gridSize * step;

  // Extended terrain base (extends well past urban blocks into fog)
  const terrainGeo = trackGeo(new THREE.PlaneGeometry(worldSize * 3.6, worldSize * 3.6));
  const terrainMat = trackMat(new THREE.MeshStandardMaterial({
    color: CITY_CONFIG.colors.ground,
    roughness: 0.95,
    metalness: 0.02,
  }));
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = 0;
  terrain.receiveShadow = true;
  cityGroup.add(terrain);

  // Subtle spatial coordinate grid
  const gridHelper = new THREE.GridHelper(worldSize * 1.4, 36, 0x1e3a5f, 0x0f1f38);
  gridHelper.position.y = 0.04;
  cityGroup.add(gridHelper);

  // Paved arterial road network with canvas texture
  const roadTex = createRoadAsphaltTexture();
  const roadMat = trackMat(new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: 0.88,
    metalness: 0.08,
  }));
  const roadGeo = trackGeo(new THREE.BoxGeometry(roadWidth, 0.22, worldSize + roadWidth));
  const half = worldSize / 2;

  for (let i = 0; i <= gridSize; i++) {
    const pos = i * step - half;
    const roadZ = new THREE.Mesh(roadGeo, roadMat);
    roadZ.position.set(pos, 0.12, 0);
    roadZ.receiveShadow = true;
    cityGroup.add(roadZ);

    const roadX = new THREE.Mesh(roadGeo, roadMat);
    roadX.rotation.y = Math.PI / 2;
    roadX.position.set(0, 0.14, pos);
    roadX.receiveShadow = true;
    cityGroup.add(roadX);
  }

  // Sidewalk plinths & buildings / parks
  const sidewalkGeo = trackGeo(new THREE.BoxGeometry(blockSize + 3.2, 0.35, blockSize + 3.2));
  const sidewalkMat = trackMat(new THREE.MeshStandardMaterial({
    color: CITY_CONFIG.colors.sidewalk,
    roughness: 0.85,
  }));

  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      const { x, z } = gridToWorld(gx, gz);

      const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
      sidewalk.position.set(x, 0.18, z);
      sidewalk.receiveShadow = true;
      cityGroup.add(sidewalk);

      // Central Park & neighborhood green squares
      if ((gx === 4 && gz === 6) || (gx === 7 && gz === 3) || (gx === 1 && gz === 7)) {
        createCentralPark(x, z, blockSize);
        continue;
      }

      let districtKind = 'residential';
      if (gx >= 4 && gx <= 6 && gz <= 3) districtKind = 'heritage';
      else if (gx >= 4 && gx <= 6 && gz >= 4 && gz <= 6) districtKind = 'civic';
      else if (gx <= 3 || gz >= 7) districtKind = (gx + gz) % 3 === 0 ? 'commercial' : 'residential';

      createCompositeBuilding(x, z, blockSize * 0.82, blockSize * 0.82, districtKind, gx, gz);
    }
  }

  // Instanced streetlamp poles + glowing fixtures (high performance)
  const lampPositions = [];
  for (let gx = 0; gx <= gridSize; gx += 2) {
    for (let gz = 0; gz <= gridSize; gz += 2) {
      const posX = gx * step - half + roadWidth * 0.55;
      const posZ = gz * step - half + roadWidth * 0.55;
      lampPositions.push([posX, posZ]);
    }
  }

  const poleGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.28, 9.5, 6));
  const poleMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 }));
  const bulbGeo = trackGeo(new THREE.SphereGeometry(0.75, 8, 8));
  const bulbMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x67e8f9 }));

  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPositions.length);
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampPositions.length);
  lampPositions.forEach(([lx, lz], idx) => {
    _scale.set(1, 1, 1);
    _vec3.set(lx, 4.75, lz);
    _mat4.compose(_vec3, _quat.identity(), _scale);
    poles.setMatrixAt(idx, _mat4);

    _vec3.set(lx, 9.8, lz);
    _mat4.compose(_vec3, _quat.identity(), _scale);
    bulbs.setMatrixAt(idx, _mat4);
  });
  poles.computeBoundingSphere();
  bulbs.computeBoundingSphere();
  cityGroup.add(poles, bulbs);
}

function createVehicles() {
  vehicleGroup = new THREE.Group();
  vehicleGroup.name = 'transit-vehicles';
  scene.add(vehicleGroup);

  const { gridSize, blockSize, roadWidth } = CITY_CONFIG;
  const step = blockSize + roadWidth;
  const half = (gridSize * step) / 2;

  const chassisGeo = trackGeo(new THREE.BoxGeometry(2.6, 1.0, 5.2));
  const cabinGeo = trackGeo(new THREE.BoxGeometry(2.1, 0.85, 2.6));
  const lightGeo = trackGeo(new THREE.BoxGeometry(2.0, 0.3, 0.2));

  const chassisMatA = trackMat(new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.5, roughness: 0.3 }));
  const chassisMatB = trackMat(new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.4, roughness: 0.35 }));
  const cabinMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.15 }));
  const headMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xe0f2fe }));
  const tailMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xf43f5e }));

  const count = 16;
  for (let i = 0; i < count; i++) {
    const car = new THREE.Group();
    const isTransit = i % 3 === 0;
    const body = new THREE.Mesh(chassisGeo, isTransit ? chassisMatB : chassisMatA);
    body.position.y = 0.7;
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.5, -0.2);
    const head = new THREE.Mesh(lightGeo, headMat);
    head.position.set(0, 0.75, 2.62);
    const tail = new THREE.Mesh(lightGeo, tailMat);
    tail.position.set(0, 0.75, -2.62);
    car.add(body, cabin, head, tail);

    const isX = i % 2 === 0;
    const laneIdx = (i * 2) % (gridSize + 1);
    const roadCoord = laneIdx * step - half;
    const dir = i % 4 < 2 ? 1 : -1;
    const laneOffset = dir * 3.2;
    const startOffset = ((i * 53) % (gridSize * step)) - half;

    if (isX) {
      car.position.set(startOffset, 0.25, roadCoord + laneOffset);
      car.rotation.y = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.position.set(roadCoord + laneOffset, 0.25, startOffset);
      car.rotation.y = dir === 1 ? 0 : Math.PI;
    }

    car.userData = {
      isX,
      dir,
      speed: 14 + (i % 5) * 4,
      bounds: half + 18,
    };
    vehicleGroup.add(car);
  }
}

function getMarkerColor(report) {
  if (report.status === 'Resolved') return CITY_CONFIG.colors.markerResolved;
  if (report.priority === 'Critical') return CITY_CONFIG.colors.markerCritical;
  if (report.priority === 'High') return CITY_CONFIG.colors.markerHigh;
  return CITY_CONFIG.colors.markerNormal;
}

function createIssueBeacon(x, z, color, report) {
  const group = new THREE.Group();
  group.position.set(x, 0.4, z);

  // 1. Ground halo ring
  const ringGeo = trackGeo(new THREE.RingGeometry(4.0, 6.2, 24));
  const ringMat = trackMat(new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;

  // 2. Vertical signal stem
  const stemGeo = trackGeo(new THREE.CylinderGeometry(0.35, 0.35, 22, 8));
  const stemMat = trackMat(new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.45,
  }));
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.y = 11;

  // 3. Elevated diamond beacon
  const pinGeo = trackGeo(new THREE.OctahedronGeometry(4.2, 0));
  const pinMat = trackMat(new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.65,
    roughness: 0.25,
    metalness: 0.35,
  }));
  const pin = new THREE.Mesh(pinGeo, pinMat);
  pin.position.y = 24;
  pin.castShadow = true;

  // 4. Invisible larger hit proxy for easy mouse/touch clicking
  const hitGeo = trackGeo(new THREE.CylinderGeometry(7, 7, 32, 8));
  const hitMat = trackMat(new THREE.MeshBasicMaterial({ visible: false }));
  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.position.y = 16;

  group.add(ring, stem, pin, hit);
  group.userData = {
    type: 'issue',
    report,
    ring,
    pin,
    hit,
    phase: Math.random() * Math.PI * 2,
  };
  hit.userData = { markerGroup: group };
  pin.userData = { markerGroup: group };
  markerHitTargets.push(hit);

  return group;
}

function createClusterBeacon(x, z, clusterReports) {
  const group = new THREE.Group();
  group.position.set(x, 0.4, z);

  const hasCritical = clusterReports.some((r) => r.priority === 'Critical' && r.status !== 'Resolved');
  const color = hasCritical ? CITY_CONFIG.colors.markerCritical : CITY_CONFIG.colors.cluster;

  const baseGeo = trackGeo(new THREE.RingGeometry(7, 10, 28));
  const baseMat = trackMat(new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  const ring = new THREE.Mesh(baseGeo, baseMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;

  const orbGeo = trackGeo(new THREE.IcosahedronGeometry(6.5, 1));
  const orbMat = trackMat(new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.55,
    roughness: 0.2,
    metalness: 0.5,
  }));
  const pin = new THREE.Mesh(orbGeo, orbMat);
  pin.position.y = 22;

  const hitGeo = trackGeo(new THREE.CylinderGeometry(10, 10, 34, 8));
  const hitMat = trackMat(new THREE.MeshBasicMaterial({ visible: false }));
  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.position.y = 17;

  group.add(ring, pin, hit);
  group.userData = {
    type: 'cluster',
    reports: clusterReports,
    ring,
    pin,
    hit,
    phase: 0,
  };
  hit.userData = { markerGroup: group };
  markerHitTargets.push(hit);

  return group;
}

function filterReports(reports) {
  const query = (activeFilters.search || '').trim().toLowerCase();
  return (reports || []).filter((r) => {
    if (activeFilters.status === 'open' && r.status === 'Resolved') return false;
    if (activeFilters.status === 'resolved' && r.status !== 'Resolved') return false;
    if (activeFilters.category !== 'all' && r.category !== activeFilters.category) return false;
    if (activeFilters.severity !== 'all' && r.priority !== activeFilters.severity) return false;
    if (query) {
      const hay = `${r.title} ${r.location} ${r.id} ${r.category}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

function rebuildMarkers() {
  if (!markerGroup) return;
  while (markerGroup.children.length > 0) {
    markerGroup.remove(markerGroup.children[0]);
  }
  markerHitTargets = [];
  selectedMarkerGroup = null;

  const filtered = filterReports(allReports);
  const mapped = filtered.map((report) => {
    const pos = geoToWorld(report);
    return { report, x: pos.x, z: pos.z, approximate: pos.approximate };
  });

  if (activeFilters.clustering && mapped.length > 1) {
    const clusters = [];
    const clusterRadius = 46;

    mapped.forEach((item) => {
      const existing = clusters.find((c) => Math.hypot(c.cx - item.x, c.cz - item.z) < clusterRadius);
      if (existing) {
        existing.items.push(item);
        existing.cx = existing.items.reduce((s, it) => s + it.x, 0) / existing.items.length;
        existing.cz = existing.items.reduce((s, it) => s + it.z, 0) / existing.items.length;
      } else {
        clusters.push({ cx: item.x, cz: item.z, items: [item] });
      }
    });

    clusters.forEach((cluster) => {
      if (cluster.items.length === 1) {
        const only = cluster.items[0];
        markerGroup.add(createIssueBeacon(only.x, only.z, getMarkerColor(only.report), only.report));
      } else {
        markerGroup.add(createClusterBeacon(cluster.cx, cluster.cz, cluster.items.map((i) => i.report)));
      }
    });
  } else {
    mapped.forEach((item) => {
      markerGroup.add(createIssueBeacon(item.x, item.z, getMarkerColor(item.report), item.report));
    });
  }
}

function createTooltip() {
  if (hoverTooltip || !canvasContainer) return;
  hoverTooltip = document.createElement('div');
  hoverTooltip.className = 'twin-hover-tooltip';
  hoverTooltip.hidden = true;
  canvasContainer.appendChild(hoverTooltip);
}

function showTooltip(clientX, clientY, title, subtitle) {
  if (!hoverTooltip || !canvasContainer) return;
  const rect = canvasContainer.getBoundingClientRect();
  hoverTooltip.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const span = document.createElement('span');
  span.textContent = subtitle;
  hoverTooltip.appendChild(strong);
  hoverTooltip.appendChild(span);

  const left = Math.min(rect.width - 220, Math.max(12, clientX - rect.left + 14));
  const top = Math.min(rect.height - 72, Math.max(12, clientY - rect.top - 18));
  hoverTooltip.style.left = `${left}px`;
  hoverTooltip.style.top = `${top}px`;
  hoverTooltip.hidden = false;
}

function hideTooltip() {
  if (hoverTooltip) hoverTooltip.hidden = true;
}

function focusWorldPoint(x, y, z, distanceOffset = 115) {
  cameraTransition = {
    pos: new THREE.Vector3(x + distanceOffset, y + distanceOffset * 0.85, z + distanceOffset),
    target: new THREE.Vector3(x, y, z),
  };
}

function handlePointerMove(event) {
  if (!isInitialized || !canvasContainer || !camera) return;
  const now = performance.now();
  if (now - lastRaycastTime < 45) return;
  lastRaycastTime = now;

  const rect = canvasContainer.getBoundingClientRect();
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointerNDC, camera);
  const markerHits = raycaster.intersectObjects(markerHitTargets, false);

  if (markerHits.length > 0) {
    const mGroup = markerHits[0].object.userData.markerGroup;
    hoveredTarget = mGroup;
    canvasContainer.style.cursor = 'pointer';
    if (mGroup.userData.type === 'cluster') {
      showTooltip(
        event.clientX,
        event.clientY,
        `${mGroup.userData.reports.length} civic issues in cluster`,
        'Click to zoom in & expand'
      );
    } else {
      const r = mGroup.userData.report;
      showTooltip(event.clientX, event.clientY, r.title, `${r.location} · ${r.priority} · ${r.status}`);
    }
    return;
  }

  const bldgHits = raycaster.intersectObjects(buildingHitTargets, false);
  if (bldgHits.length > 0) {
    const meta = bldgHits[0].object.userData.buildingMeta;
    hoveredTarget = bldgHits[0].object;
    canvasContainer.style.cursor = 'pointer';
    showTooltip(event.clientX, event.clientY, meta.name, `${meta.zoneKind} · ${meta.floors} floors`);
    return;
  }

  hoveredTarget = null;
  canvasContainer.style.cursor = 'grab';
  hideTooltip();
}

function handleCanvasClick(event) {
  if (!isInitialized || !canvasContainer || !camera) return;
  const rect = canvasContainer.getBoundingClientRect();
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointerNDC, camera);
  const markerHits = raycaster.intersectObjects(markerHitTargets, false);

  if (markerHits.length > 0) {
    const mGroup = markerHits[0].object.userData.markerGroup;
    if (mGroup.userData.type === 'cluster') {
      // Disable clustering temporarily when user clicks a cluster to inspect individual pins
      activeFilters.clustering = false;
      focusWorldPoint(mGroup.position.x, 8, mGroup.position.z, 95);
      rebuildMarkers();
      if (typeof callbacks.onSelectBuilding === 'function') {
        callbacks.onSelectBuilding({
          isClusterExpand: true,
          count: mGroup.userData.reports.length,
          reports: mGroup.userData.reports,
        });
      }
      return;
    }

    selectedMarkerGroup = mGroup;
    const report = mGroup.userData.report;
    focusWorldPoint(mGroup.position.x, 10, mGroup.position.z, 105);
    if (typeof callbacks.onSelectIssue === 'function') {
      callbacks.onSelectIssue(report);
    }
    return;
  }

  const bldgHits = raycaster.intersectObjects(buildingHitTargets, false);
  if (bldgHits.length > 0) {
    const meta = bldgHits[0].object.userData.buildingMeta;
    if (selectedBuildingMesh && selectedBuildingMesh.material?.emissive) {
      selectedBuildingMesh.material.emissive.setHex(0x000000);
    }
    selectedBuildingMesh = meta.primaryMesh;
    if (selectedBuildingMesh && selectedBuildingMesh.material?.emissive) {
      selectedBuildingMesh.material.emissive.setHex(0x0b3b59);
    }
    const wp = _vec3;
    bldgHits[0].object.getWorldPosition(wp);
    focusWorldPoint(wp.x, 14, wp.z, 125);
    if (typeof callbacks.onSelectBuilding === 'function') {
      const nearby = allReports.filter((r) =>
        String(r.location || '').toLowerCase().includes(meta.district.toLowerCase().split(' ')[0])
      );
      callbacks.onSelectBuilding({ ...meta, nearbyReports: nearby });
    }
  }
}

function handleResize() {
  if (!renderer || !camera || !canvasContainer) return;
  const w = Math.max(1, canvasContainer.clientWidth);
  const h = Math.max(1, canvasContainer.clientHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function afterDraw(cb) {
  const gl = renderer?.getContext?.();
  if (!gl || typeof gl.fenceSync !== 'function') {
    frameId = window.setTimeout(cb, 80);
    return;
  }
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const poll = () => {
    const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
    if (state === gl.UNSIGNALED) {
      frameId = window.setTimeout(poll, 6);
    } else {
      if (sync) gl.deleteSync(sync);
      frameId = window.setTimeout(cb, 80);
    }
  };
  frameId = window.setTimeout(poll, 6);
}

function animate(now = performance.now()) {
  if (!isInitialized || isPaused) return;
  const delta = reducedMotion ? 0 : Math.min((now - (lastTimestamp || now)) / 1000, 0.05);
  lastTimestamp = now;
  elapsedTime += delta;

  if (cameraTransition) {
    const dampLambda = 4.5;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraTransition.pos.x, dampLambda, delta || 0.016);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraTransition.pos.y, dampLambda, delta || 0.016);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, cameraTransition.pos.z, dampLambda, delta || 0.016);
    controls.target.x = THREE.MathUtils.damp(controls.target.x, cameraTransition.target.x, dampLambda, delta || 0.016);
    controls.target.y = THREE.MathUtils.damp(controls.target.y, cameraTransition.target.y, dampLambda, delta || 0.016);
    controls.target.z = THREE.MathUtils.damp(controls.target.z, cameraTransition.target.z, dampLambda, delta || 0.016);

    if (camera.position.distanceTo(cameraTransition.pos) < 1.2) {
      cameraTransition = null;
    }
  }

  if (controls) controls.update();

  // Animate beacons
  if (markerGroup && !reducedMotion) {
    for (let i = 0; i < markerGroup.children.length; i++) {
      const m = markerGroup.children[i];
      const d = m.userData;
      if (d.pin) {
        d.pin.rotation.y += delta * 1.1;
        d.pin.position.y = 22 + Math.sin(elapsedTime * 2.2 + (d.phase || 0)) * 1.6;
      }
      if (d.ring) {
        const s = 1 + Math.sin(elapsedTime * 2.6 + (d.phase || 0)) * 0.16;
        d.ring.scale.set(s, s, 1);
      }
    }
  }

  // Animate vehicles along arterial roads
  if (vehicleGroup && !reducedMotion) {
    for (let i = 0; i < vehicleGroup.children.length; i++) {
      const car = vehicleGroup.children[i];
      const u = car.userData;
      const move = u.speed * delta * u.dir;
      if (u.isX) {
        car.position.x += move;
        if (car.position.x > u.bounds) car.position.x = -u.bounds;
        if (car.position.x < -u.bounds) car.position.x = u.bounds;
      } else {
        car.position.z += move;
        if (car.position.z > u.bounds) car.position.z = -u.bounds;
        if (car.position.z < -u.bounds) car.position.z = u.bounds;
      }
    }
  }

  // Animate Central Park fountain shimmer
  if (fountainWater && !reducedMotion) {
    fountainWater.scale.y = 0.85 + Math.sin(elapsedTime * 3.2) * 0.25;
  }

  renderer.render(scene, camera);

  if (isSoftwareGl) {
    afterDraw(() => animate(performance.now()));
  } else {
    frameId = requestAnimationFrame(animate);
  }
}

export function initThreeCity(options = {}) {
  callbacks = { ...callbacks, ...options };
  canvasContainer = document.getElementById(options.containerId || 'city-3d');
  if (!canvasContainer) return false;

  if (isInitialized) {
    handleResize();
    if (isPaused) {
      isPaused = false;
      animate();
    }
    return true;
  }

  if (!checkWebGLSupport()) {
    if (typeof callbacks.onError === 'function') {
      callbacks.onError('WebGL is unavailable in this browser. Switch to the 2D Leaflet map.');
    }
    return false;
  }

  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  isSoftwareGl = detectSoftwareWebGL();

  const width = Math.max(320, canvasContainer.clientWidth || 800);
  const height = Math.max(320, canvasContainer.clientHeight || 520);

  renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  canvasContainer.innerHTML = '';
  canvasContainer.appendChild(renderer.domElement);
  createTooltip();

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    isPaused = true;
    if (typeof callbacks.onError === 'function') {
      callbacks.onError('3D WebGL context was suspended. Click Reset View or switch to 2D map.');
    }
  });

  scene = new THREE.Scene();
  scene.background = new THREE.Color(CITY_CONFIG.colors.sky);
  scene.fog = new THREE.FogExp2(CITY_CONFIG.colors.fog, 0.00125);

  // Studio environment reflections for metallic/glass surfaces
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  pmremGenerator.dispose();

  camera = new THREE.PerspectiveCamera(44, width / height, 1, 2400);
  camera.position.copy(CAMERA_PRESETS.overview.pos);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !isSoftwareGl;
  controls.dampingFactor = 0.06;
  controls.enablePan = true;
  controls.minDistance = 85;
  controls.maxDistance = 680;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.minPolarAngle = Math.PI / 10;
  controls.target.copy(CAMERA_PRESETS.overview.target);
  controls.addEventListener('start', () => {
    cameraTransition = null;
  });

  raycaster = new THREE.Raycaster();

  setupLighting();
  createCityEnvironment();

  markerGroup = new THREE.Group();
  markerGroup.name = 'issue-markers';
  scene.add(markerGroup);

  createVehicles();

  if (options.reports) allReports = options.reports;
  rebuildMarkers();

  window.addEventListener('resize', handleResize);
  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerleave', hideTooltip);
  renderer.domElement.addEventListener('click', handleCanvasClick);

  isInitialized = true;
  isPaused = false;
  lastTimestamp = performance.now();
  animate(lastTimestamp);

  if (typeof callbacks.onReady === 'function') {
    callbacks.onReady({
      modelSource: 'procedural-jaipur-fallback',
      softwareWebGL: isSoftwareGl,
      buildingCount: buildingHitTargets.length / 2,
    });
  }
  return true;
}

export function updateReports(reports) {
  allReports = Array.isArray(reports) ? reports : [];
  if (isInitialized) rebuildMarkers();
}

export function setFilters(nextFilters = {}) {
  activeFilters = { ...activeFilters, ...nextFilters };
  if (isInitialized) rebuildMarkers();
}

export function setCameraPreset(presetName = 'overview') {
  const preset = CAMERA_PRESETS[presetName] || CAMERA_PRESETS.overview;
  cameraTransition = {
    pos: preset.pos.clone(),
    target: preset.target.clone(),
  };
}

export function focusReport(reportId) {
  if (!isInitialized) return;
  const targetReport = allReports.find((r) => r.id === reportId);
  if (!targetReport) return;
  const pos = geoToWorld(targetReport);
  focusWorldPoint(pos.x, 12, pos.z, 100);
}

export function setPaused(paused) {
  isPaused = Boolean(paused);
  if (!isPaused && isInitialized) {
    lastTimestamp = performance.now();
    animate(lastTimestamp);
  } else {
    cancelAnimationFrame(frameId);
    clearTimeout(frameId);
  }
}

export function destroy() {
  isPaused = true;
  cancelAnimationFrame(frameId);
  clearTimeout(frameId);
  window.removeEventListener('resize', handleResize);
  if (renderer?.domElement) {
    renderer.domElement.removeEventListener('pointermove', handlePointerMove);
    renderer.domElement.removeEventListener('pointerleave', hideTooltip);
    renderer.domElement.removeEventListener('click', handleCanvasClick);
  }
  cachedGeometries.forEach((g) => g.dispose());
  cachedMaterials.forEach((m) => m.dispose());
  cachedTextures.forEach((t) => t.dispose());
  cachedGeometries.clear();
  cachedMaterials.clear();
  cachedTextures.clear();
  if (hoverTooltip) {
    hoverTooltip.remove();
    hoverTooltip = null;
  }
  if (controls) controls.dispose();
  if (renderer) renderer.dispose();
  isInitialized = false;
}

window.CityFix3D = {
  initThreeCity,
  updateReports,
  setFilters,
  setCameraPreset,
  focusReport,
  setPaused,
  destroy,
  get isInitialized() {
    return isInitialized;
  },
  get filters() {
    return { ...activeFilters };
  },
};

window.dispatchEvent(new CustomEvent('cityfix:3d-ready'));