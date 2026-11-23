import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CITY_CONFIG = {
  gridSize: 18,
  blockSize: 42,
  roadWidth: 14,
  buildingDensity: 0.75,
  minBuildingHeight: 14,
  maxBuildingHeight: 110,
  jaipurBounds: {
    latMin: 26.82,
    latMax: 26.98,
    lonMin: 75.70,
    lonMax: 75.88,
  },
  colors: {
    sky: 0x02050c,
    fogNear: 0x030812,
    fogFar: 0x061220,
    road: 0x0d1624,
    roadLine: 0x1e3a5f,
    sidewalk: 0x0f1a2c,
    buildingBase: 0x081224,
    buildingWindow: 0x0e2238,
    buildingWindowLit: 0x00f5d4,
    buildingAccent: 0x00ffff,
    buildingAccentWarm: 0xffd700,
    park: 0x061e12,
    parkGrass: 0x0a2a14,
    streetlight: 0x1a2e42,
    streetlightGlow: 0x00f5d4,
    markerHigh: 0xfb7185,
    markerMedium: 0xfbbf24,
    markerLow: 0x22e88d,
    vehicle: 0x00f5d4,
    vehicleWarm: 0xffcc00,
    vehicleTaillight: 0xff3344,
    water: 0x0066aa,
    waterSurface: 0x0088cc,
  },
  lod: {
    highDistance: 180,
    mediumDistance: 350,
    lowDistance: 600,
  },
  timeOfDay: 0.45,
};

let scene, camera, renderer, controls;
let cityGroup, markerGroup, vehicleGroup, labelGroup;
let animationId = null;
let isInitialized = false;
let currentReports = [];
let mapFilter = 'all';
let reducedMotion = false;
let selectedMarker = null;
let hoveredMarker = null;
let raycaster, mouse;
let markerLabels = new Map();
let time = 0;
let lastTime = 0;

let canvasContainer = null;
let mapContainer = null;
let toggleBtn = null;

const materialCache = new Map();
const geometryCache = new Map();

function getDomElements() {
  canvasContainer = document.getElementById('city-3d');
  mapContainer = document.getElementById('mini-map');
  toggleBtn = document.getElementById('map-view-toggle');
}

function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

function checkReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getCachedMaterial(key, factory) {
  if (!materialCache.has(key)) {
    materialCache.set(key, factory());
  }
  return materialCache.get(key);
}

function getCachedGeometry(key, factory) {
  if (!geometryCache.has(key)) {
    geometryCache.set(key, factory());
  }
  return geometryCache.get(key);
}

function initThreeCity() {
  if (isInitialized) return;
  getDomElements();
  if (!canvasContainer) {
    console.error('Canvas container #city-3d not found');
    return;
  }
  if (!checkWebGLSupport()) {
    showFallback('WebGL not supported in this browser.');
    return;
  }

  reducedMotion = checkReducedMotion();

  const width = canvasContainer.clientWidth;
  const height = canvasContainer.clientHeight;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.physicallyCorrectLights = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasContainer.appendChild(renderer.domElement);
  canvasContainer.classList.remove('loading');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(CITY_CONFIG.colors.sky);
  scene.fog = new THREE.FogExp2(CITY_CONFIG.colors.fogFar, 0.001);

  const aspect = width / height;
  const frustumSize = 240;
  camera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    frustumSize / -2,
    1,
    3000
  );
  camera.position.set(380, 380, 380);
  camera.lookAt(0, 0, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.04;
  controls.enablePan = true;
  controls.minZoom = 0.22;
  controls.maxZoom = 5;
  controls.maxPolarAngle = Math.PI / 2.02;
  controls.minPolarAngle = Math.PI / 8;
  controls.target.set(0, 0, 0);
  controls.enableRotate = true;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 1.1;
  controls.panSpeed = 0.7;

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  setupLighting();
  createCity();
  createMarkerSystem();
  createVehicles();
  createLabelSystem();

  window.addEventListener('resize', onResize);
  canvasContainer.addEventListener('pointermove', onPointerMove);
  canvasContainer.addEventListener('click', onClick);
  canvasContainer.addEventListener('pointerleave', onPointerLeave);
  canvasContainer.addEventListener('mouseenter', () => controls.enabled = true);
  canvasContainer.addEventListener('mouseleave', () => controls.enabled = false);

  canvasContainer.style.touchAction = 'none';
  canvasContainer.addEventListener('touchstart', onTouchStart, { passive: true });
  canvasContainer.addEventListener('touchmove', onTouchMove, { passive: false });
  canvasContainer.addEventListener('touchend', onTouchEnd);

  animate();
  isInitialized = true;
  console.log('CityFix 3D initialized');
}

function setupLighting() {
  const ambient = new THREE.AmbientLight(0x142840, 0.35);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0x00f5d4, 1.1);
  dirLight.position.set(300, 600, 300);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 10;
  dirLight.shadow.camera.far = 1200;
  dirLight.shadow.camera.left = -400;
  dirLight.shadow.camera.right = 400;
  dirLight.shadow.camera.top = 400;
  dirLight.shadow.camera.bottom = -400;
  dirLight.shadow.bias = -0.0006;
  dirLight.shadow.normalBias = 0.03;
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x004466, 0.2);
  fillLight.position.set(-300, 300, -300);
  scene.add(fillLight);

  const hemiLight = new THREE.HemisphereLight(0x00f5d4, 0x02050c, 0.4);
  scene.add(hemiLight);

  const accentLight1 = new THREE.PointLight(0x00f5d4, 3, 250, 2);
  accentLight1.position.set(-250, 100, -250);
  scene.add(accentLight1);

  const accentLight2 = new THREE.PointLight(0x8b5cf6, 2.5, 220, 2);
  accentLight2.position.set(250, 80, 250);
  scene.add(accentLight2);

  const accentLight3 = new THREE.PointLight(0x22e88d, 2, 200, 2);
  accentLight3.position.set(0, 60, -280);
  scene.add(accentLight3);
}

function createCity() {
  cityGroup = new THREE.Group();
  cityGroup.name = 'city';
  scene.add(cityGroup);

  const { gridSize, blockSize, roadWidth, buildingDensity, minBuildingHeight, maxBuildingHeight } = CITY_CONFIG;
  const halfGrid = (gridSize * (blockSize + roadWidth)) / 2;

  const roadMat = getCachedMaterial('road', () => new THREE.MeshStandardMaterial({ color: CITY_CONFIG.colors.road, roughness: 0.95, metalness: 0.03 }));
  const roadLineMat = getCachedMaterial('roadLine', () => new THREE.MeshBasicMaterial({ color: CITY_CONFIG.colors.roadLine, transparent: true, opacity: 0.45 }));
  const sidewalkMat = getCachedMaterial('sidewalk', () => new THREE.MeshStandardMaterial({ color: CITY_CONFIG.colors.sidewalk, roughness: 0.82 }));
  const parkMat = getCachedMaterial('park', () => new THREE.MeshStandardMaterial({ color: CITY_CONFIG.colors.park, roughness: 0.9 }));
  const parkGrassMat = getCachedMaterial('parkGrass', () => new THREE.MeshStandardMaterial({ color: CITY_CONFIG.colors.parkGrass, roughness: 0.85 }));

  const buildingTypes = [
    { name: 'residential', baseColor: 0x0a1830, windowRatio: 0.72, accentColor: 0x00f5d4, heightBias: 0.8 },
    { name: 'commercial', baseColor: 0x08162a, windowRatio: 0.88, accentColor: 0x8b5cf6, heightBias: 1.2 },
    { name: 'civic', baseColor: 0x0c1a35, windowRatio: 0.6, accentColor: 0xffd700, heightBias: 1.0 },
    { name: 'landmark', baseColor: 0x081224, windowRatio: 0.5, accentColor: 0xff6b9d, heightBias: 1.5 },
  ];

  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      const x = gx * (blockSize + roadWidth) - halfGrid + blockSize / 2 + roadWidth / 2;
      const z = gz * (blockSize + roadWidth) - halfGrid + blockSize / 2 + roadWidth / 2;

      const isPark = (gx + gz) % 7 === 0 && Math.random() < 0.1;
      if (isPark) {
        createPark(x, z, blockSize);
        continue;
      }

      if (Math.random() < buildingDensity) {
        const type = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
        createBuilding(x, z, blockSize * 0.88, blockSize * 0.88, type);
      }
    }
  }

  createRoadNetwork();
  createStreetlights();
  createAmbientDetails();

  function createBuilding(bx, bz, bw, bd, type) {
    const baseFloors = Math.floor(minBuildingHeight + Math.random() * (maxBuildingHeight - minBuildingHeight));
    const floors = Math.max(3, Math.floor(baseFloors * type.heightBias));
    const height = floors * 3.5;
    const segments = Math.max(1, Math.floor(floors / 12));

    const cacheKey = `${Math.round(bw)}x${Math.round(bd)}x${height}`;
    const geo = getCachedGeometry(cacheKey, () => new THREE.BoxGeometry(bw, height, bd, 1, segments, 1));

    const mat = getCachedMaterial(`building_${type.name}`, () => new THREE.MeshStandardMaterial({
      color: type.baseColor,
      roughness: 0.62,
      metalness: 0.12,
    }));

    const building = new THREE.Mesh(geo, mat);
    building.position.set(bx, height / 2, bz);
    building.castShadow = true;
    building.receiveShadow = true;
    building.userData = { type: type.name, floors, height, bw, bd };
    cityGroup.add(building);

    addWindows(building, bw, bd, height, floors, type);
    addBuildingAccents(building, bw, bd, height, type);
    addRooftopDetails(building, bw, bd, height, type);
  }

  function addWindows(building, bw, bd, height, floors, type) {
    const windowGeo = getCachedGeometry('window', () => new THREE.PlaneGeometry(1.5, 1.5));
    const litMat = getCachedMaterial('windowLit', () => new THREE.MeshBasicMaterial({
      color: CITY_CONFIG.colors.buildingWindowLit,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    }));
    const darkMat = getCachedMaterial('windowDark', () => new THREE.MeshBasicMaterial({
      color: CITY_CONFIG.colors.buildingWindow,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    }));

    const windowGroup = new THREE.Group();
    const spacing = 3.8;
    const margin = 2.0;

    for (let side = 0; side < 4; side++) {
      const isFrontBack = side < 2;
      const width = isFrontBack ? bw : bd;
      const cols = Math.floor((width - margin * 2) / spacing);

      for (let col = 0; col < cols; col++) {
        for (let floor = 0; floor < floors; floor++) {
          if (Math.random() > type.windowRatio) continue;

          const isLit = Math.random() < 0.72;
          const win = new THREE.Mesh(windowGeo, isLit ? litMat : darkMat);
          const y = -height / 2 + 2.5 + floor * 3.5;
          const xOffset = -width / 2 + margin + col * spacing + (Math.random() - 0.5) * 0.4;

          if (side === 0) {
            win.position.set(xOffset, y, bd / 2 + 0.03);
          } else if (side === 1) {
            win.position.set(xOffset, y, -bd / 2 - 0.03);
            win.rotation.y = Math.PI;
          } else if (side === 2) {
            win.position.set(bw / 2 + 0.03, y, -xOffset);
            win.rotation.y = -Math.PI / 2;
          } else {
            win.position.set(-bw / 2 - 0.03, y, xOffset);
            win.rotation.y = Math.PI / 2;
          }
          windowGroup.add(win);
        }
      }
    }
    building.add(windowGroup);
  }

  function addBuildingAccents(building, bw, bd, height, type) {
    const accentMat = getCachedMaterial(`accent_${type.name}`, () => new THREE.MeshBasicMaterial({ color: type.accentColor, transparent: true, opacity: 0.65 }));
    const accentGeo = getCachedGeometry(`accent_${bw}_${bd}`, () => new THREE.BoxGeometry(bw + 0.5, 0.3, bd + 0.5));

    const accentCount = Math.floor(height / 16);
    for (let i = 1; i < accentCount; i++) {
      const accent = new THREE.Mesh(accentGeo, accentMat);
      accent.position.set(0, -height / 2 + i * 16, 0);
      building.add(accent);
    }

    const topAccent = new THREE.Mesh(
      getCachedGeometry(`topAccent_${bw}_${bd}`, () => new THREE.BoxGeometry(bw + 1, 1, bd + 1)),
      getCachedMaterial(`topAccentMat_${type.name}`, () => new THREE.MeshBasicMaterial({ color: type.accentColor, transparent: true, opacity: 0.35 }))
    );
    topAccent.position.set(0, height / 2 + 0.5, 0);
    building.add(topAccent);
  }

  function addRooftopDetails(building, bw, bd, height, type) {
    if (type.name === 'landmark' || Math.random() < 0.28) {
      const detailGeo = getCachedGeometry('roofDetail', () => new THREE.CylinderGeometry(0.9, 1.4, 6, 7));
      const detailMat = getCachedMaterial('roofDetailMat', () => new THREE.MeshStandardMaterial({ color: 0x122840, metalness: 0.45, roughness: 0.45 }));
      const detail = new THREE.Mesh(detailGeo, detailMat);
      detail.position.set((Math.random() - 0.5) * bw * 0.35, height / 2 + 3, (Math.random() - 0.5) * bd * 0.35);
      detail.castShadow = true;
      building.add(detail);
    }

    if (type.name === 'commercial' && Math.random() < 0.45) {
      const helipadGeo = getCachedGeometry('helipad', () => new THREE.RingGeometry(2.8, 4, 32));
      const helipadMat = getCachedMaterial('helipadMat', () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
      const helipad = new THREE.Mesh(helipadGeo, helipadMat);
      helipad.rotation.x = -Math.PI / 2;
      helipad.position.set(0, height / 2 + 0.15, 0);
      building.add(helipad);
    }

    if (type.name === 'civic' && Math.random() < 0.35) {
      const flagPoleGeo = getCachedGeometry('flagPole', () => new THREE.CylinderGeometry(0.08, 0.12, 10, 6));
      const flagPoleMat = getCachedMaterial('flagPoleMat', () => new THREE.MeshStandardMaterial({ color: 0x1a2e42, metalness: 0.5, roughness: 0.4 }));
      const flagPole = new THREE.Mesh(flagPoleGeo, flagPoleMat);
      flagPole.position.set(bw * 0.35, height / 2 + 5, bd * 0.35);
      flagPole.castShadow = true;
      building.add(flagPole);

      const flagGeo = getCachedGeometry('flag', () => new THREE.PlaneGeometry(4, 2.5));
      const flagMat = getCachedMaterial('flagMat', () => new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(0, 5, 2);
      flag.rotation.y = Math.PI / 4;
      flagPole.add(flag);
    }
  }

  function createPark(px, pz, size) {
    const parkGeo = getCachedGeometry(`park_${size}`, () => new THREE.BoxGeometry(size * 0.94, 1.5, size * 0.94));
    const park = new THREE.Mesh(parkGeo, parkMat);
    park.position.set(px, 0.75, pz);
    park.receiveShadow = true;
    park.userData = { isPark: true };
    cityGroup.add(park);

    const grassGeo = getCachedGeometry(`grass_${size}`, () => new THREE.BoxGeometry(size * 0.92, 0.2, size * 0.92));
    const grass = new THREE.Mesh(grassGeo, parkGrassMat);
    grass.position.set(px, 1.6, pz);
    grass.receiveShadow = true;
    cityGroup.add(grass);

    const treeCount = Math.floor(Math.random() * 7) + 5;
    for (let i = 0; i < treeCount; i++) {
      createTree(px + (Math.random() - 0.5) * size * 0.78, pz + (Math.random() - 0.5) * size * 0.78);
    }

    if (Math.random() < 0.35) {
      createFountain(px, pz);
    }
  }

  function createTree(tx, tz) {
    const trunkGeo = getCachedGeometry('treeTrunk', () => new THREE.CylinderGeometry(0.4, 0.65, 4, 7));
    const trunkMat = getCachedMaterial('treeTrunkMat', () => new THREE.MeshStandardMaterial({ color: 0x2d1a0f, roughness: 0.9 }));
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(tx, 3, tz);
    trunk.castShadow = true;
    cityGroup.add(trunk);

    const foliageGeo = getCachedGeometry('treeFoliage', () => new THREE.ConeGeometry(2.5, 7, 8));
    const foliageMat = getCachedMaterial('treeFoliageMat', () => new THREE.MeshStandardMaterial({ color: 0x0a3a14, roughness: 0.8 }));
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.set(tx, 7.5, tz);
    foliage.castShadow = true;
    cityGroup.add(foliage);
  }

  function createFountain(px, pz) {
    const fountainGeo = getCachedGeometry('fountain', () => new THREE.CylinderGeometry(1.8, 2.4, 0.6, 18));
    const fountainMat = getCachedMaterial('fountainMat', () => new THREE.MeshStandardMaterial({ color: 0x1a3a5a, metalness: 0.65, roughness: 0.15 }));
    const fountain = new THREE.Mesh(fountainGeo, fountainMat);
    fountain.position.set(px, 0.9, pz);
    cityGroup.add(fountain);

    const waterGeo = getCachedGeometry('fountainWater', () => new THREE.CylinderGeometry(1.6, 1.6, 0.15, 18));
    const waterMat = getCachedMaterial('fountainWaterMat', () => new THREE.MeshBasicMaterial({ color: CITY_CONFIG.colors.waterSurface, transparent: true, opacity: 0.7 }));
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(px, 1.25, pz);
    cityGroup.add(water);
    fountain.userData.water = water;

    const light = new THREE.PointLight(CITY_CONFIG.colors.streetlightGlow, 0.8, 20, 2);
    light.position.set(px, 2, pz);
    cityGroup.add(light);
    fountain.userData.light = light;
  }

  function createRoadNetwork() {
    const roadGeo = getCachedGeometry('roadSeg', () => new THREE.BoxGeometry(roadWidth, 0.25, gridSize * (blockSize + roadWidth)));
    const lineGeo = getCachedGeometry('roadLine', () => new THREE.BoxGeometry(0.3, 0.26, blockSize * 0.78));

    for (let i = 0; i <= gridSize; i++) {
      const pos = i * (blockSize + roadWidth) - halfGrid + roadWidth / 2;

      const roadX = new THREE.Mesh(roadGeo, roadMat);
      roadX.rotation.z = Math.PI / 2;
      roadX.position.set(pos, 0.125, 0);
      roadX.receiveShadow = true;
      cityGroup.add(roadX);

      const roadZ = new THREE.Mesh(roadGeo, roadMat);
      roadZ.position.set(0, 0.125, pos);
      roadZ.receiveShadow = true;
      cityGroup.add(roadZ);

      if (i < gridSize) {
        for (let j = 0; j < gridSize; j++) {
          const blockPos = j * (blockSize + roadWidth) - halfGrid + blockSize / 2 + roadWidth;
          const lineX = new THREE.Mesh(lineGeo, roadLineMat);
          lineX.position.set(pos, 0.14, blockPos);
          cityGroup.add(lineX);
          const lineZ = new THREE.Mesh(lineGeo, roadLineMat);
          lineZ.rotation.y = Math.PI / 2;
          lineZ.position.set(blockPos, 0.14, pos);
          cityGroup.add(lineZ);
        }
      }
    }

    const crosswalkGeo = getCachedGeometry('crosswalk', () => new THREE.BoxGeometry(roadWidth + 1.5, 0.14, 3));
    const crosswalkMat = getCachedMaterial('crosswalkMat', () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));

    for (let i = 0; i <= gridSize; i++) {
      const pos = i * (blockSize + roadWidth) - halfGrid + roadWidth / 2;
      const cw1 = new THREE.Mesh(crosswalkGeo, crosswalkMat);
      cw1.rotation.z = Math.PI / 2;
      cw1.position.set(pos, 0.15, 0);
      cityGroup.add(cw1);
      const cw2 = new THREE.Mesh(crosswalkGeo, crosswalkMat);
      cw2.position.set(0, 0.15, pos);
      cityGroup.add(cw2);
    }

    const sidewalkGeo = getCachedGeometry('sidewalkSeg', () => new THREE.BoxGeometry(3.5, 0.18, gridSize * (blockSize + roadWidth)));
    const sidewalkMat2 = getCachedMaterial('sidewalkMat2', () => new THREE.MeshStandardMaterial({ color: CITY_CONFIG.colors.sidewalk, roughness: 0.78 }));
    for (let i = 0; i <= gridSize; i++) {
      const pos = i * (blockSize + roadWidth) - halfGrid + roadWidth / 2;
      const offset = roadWidth / 2 + 1.75;
      const sw1 = new THREE.Mesh(sidewalkGeo, sidewalkMat2);
      sw1.rotation.z = Math.PI / 2;
      sw1.position.set(pos, 0.18, offset);
      sw1.receiveShadow = true;
      cityGroup.add(sw1);
      const sw2 = new THREE.Mesh(sidewalkGeo, sidewalkMat2);
      sw2.rotation.z = Math.PI / 2;
      sw2.position.set(pos, 0.18, -offset);
      sw2.receiveShadow = true;
      cityGroup.add(sw2);
      const sw3 = new THREE.Mesh(sidewalkGeo, sidewalkMat2);
      sw3.position.set(offset, 0.18, pos);
      sw3.receiveShadow = true;
      cityGroup.add(sw3);
      const sw4 = new THREE.Mesh(sidewalkGeo, sidewalkMat2);
      sw4.position.set(-offset, 0.18, pos);
      sw4.receiveShadow = true;
      cityGroup.add(sw4);
    }
  }

  function createStreetlights() {
    const poleGeo = getCachedGeometry('pole', () => new THREE.CylinderGeometry(0.14, 0.26, 11, 8));
    const poleMat = getCachedMaterial('poleMat', () => new THREE.MeshStandardMaterial({ color: 0x16243a, metalness: 0.55, roughness: 0.35 }));
    const headGeo = getCachedGeometry('lightHead', () => new THREE.BoxGeometry(3.2, 0.5, 1));
    const headMat = getCachedMaterial('lightHeadMat', () => new THREE.MeshStandardMaterial({ color: 0x16243a, metalness: 0.45, roughness: 0.35 }));
    const glowMat = getCachedMaterial('lightGlow', () => new THREE.MeshBasicMaterial({ color: CITY_CONFIG.colors.streetlightGlow, transparent: true, opacity: 0.3 }));
    const glowGeo = getCachedGeometry('glowSphere', () => new THREE.SphereGeometry(4, 10, 10));

    for (let gx = 0; gx <= gridSize; gx++) {
      for (let gz = 0; gz <= gridSize; gz++) {
        if (Math.random() < 0.6) continue;
        const x = gx * (blockSize + roadWidth) - halfGrid;
        const z = gz * (blockSize + roadWidth) - halfGrid;
        const offsets = [
          [roadWidth / 2 + 3, roadWidth / 2 + 3],
          [-roadWidth / 2 - 3, roadWidth / 2 + 3],
          [roadWidth / 2 + 3, -roadWidth / 2 - 3],
          [-roadWidth / 2 - 3, -roadWidth / 2 - 3],
        ];
        offsets.forEach(([ox, oz]) => {
          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.set(x + ox, 5.5, z + oz);
          pole.castShadow = true;
          cityGroup.add(pole);

          const head = new THREE.Mesh(headGeo, headMat);
          head.position.set(x + ox, 11.2, z + oz);
          cityGroup.add(head);

          const glow = new THREE.Mesh(glowGeo, glowMat);
          glow.position.set(x + ox, 11, z + oz);
          cityGroup.add(glow);

          const pointLight = new THREE.PointLight(CITY_CONFIG.colors.streetlightGlow, 0.7, 24, 2);
          pointLight.position.set(x + ox, 11, z + oz);
          cityGroup.add(pointLight);
        });
      }
    }
  }

  function createAmbientDetails() {
    const benchGeo = getCachedGeometry('benchSeat', () => new THREE.BoxGeometry(2.8, 0.35, 0.6));
    const benchMat = getCachedMaterial('benchMat', () => new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.7 }));
    const legGeo = getCachedGeometry('benchLeg', () => new THREE.BoxGeometry(0.25, 0.7, 0.25));
    const legMat = getCachedMaterial('benchLegMat', () => new THREE.MeshStandardMaterial({ color: 0x16243a, metalness: 0.55 }));

    for (let gx = 0; gx <= gridSize; gx++) {
      for (let gz = 0; gz <= gridSize; gz++) {
        if (Math.random() < 0.82) continue;
        const x = gx * (blockSize + roadWidth) - halfGrid;
        const z = gz * (blockSize + roadWidth) - halfGrid;
        const bench = new THREE.Group();
        const seat = new THREE.Mesh(benchGeo, benchMat);
        seat.position.y = 0.9;
        bench.add(seat);
        const leg1 = new THREE.Mesh(legGeo, legMat);
        leg1.position.set(-1.1, 0.35, 0);
        bench.add(leg1);
        const leg2 = new THREE.Mesh(legGeo, legMat);
        leg2.position.set(1.1, 0.35, 0);
        bench.add(leg2);
        bench.position.set(x + (Math.random() - 0.5) * roadWidth, 0, z + (Math.random() - 0.5) * roadWidth);
        bench.rotation.y = Math.random() * Math.PI * 2;
        cityGroup.add(bench);
      }
    }
  }
}

function createMarkerSystem() {
  markerGroup = new THREE.Group();
  markerGroup.name = 'markers';
  scene.add(markerGroup);
}

function createLabelSystem() {
  labelGroup = new THREE.Group();
  labelGroup.name = 'labels';
  scene.add(labelGroup);
}

function createVehicles() {
  vehicleGroup = new THREE.Group();
  vehicleGroup.name = 'vehicles';
  scene.add(vehicleGroup);

  const vehicleGeo = getCachedGeometry('vehicleBody', () => new THREE.BoxGeometry(3, 1.2, 5.8));
  const taillightGeo = getCachedGeometry('taillight', () => new THREE.BoxGeometry(2.8, 0.4, 0.2));
  const headlightGeo = getCachedGeometry('headlight', () => new THREE.SphereGeometry(0.5, 8, 8));

  const roadPositions = [];
  const { gridSize, blockSize, roadWidth } = CITY_CONFIG;
  const halfGrid = (gridSize * (blockSize + roadWidth)) / 2;

  for (let i = 0; i <= gridSize; i++) {
    const pos = i * (blockSize + roadWidth) - halfGrid + roadWidth / 2;
    roadPositions.push({ axis: 'x', coord: pos, lanes: 2 });
    roadPositions.push({ axis: 'z', coord: pos, lanes: 2 });
  }

  const vehicleCount = reducedMotion ? 8 : 18;
  for (let i = 0; i < vehicleCount; i++) {
    const road = roadPositions[Math.floor(Math.random() * roadPositions.length)];
    const vehicle = new THREE.Group();

    const isCool = Math.random() < 0.6;
    const vehicleMat = getCachedMaterial(`vehicle_${isCool ? 'cool' : 'warm'}`, () => new THREE.MeshStandardMaterial({
      color: isCool ? CITY_CONFIG.colors.vehicle : CITY_CONFIG.colors.vehicleWarm,
      metalness: 0.55,
      roughness: 0.3,
      emissive: isCool ? CITY_CONFIG.colors.vehicle : CITY_CONFIG.colors.vehicleWarm,
      emissiveIntensity: 0.3,
    }));
    const taillightMat = getCachedMaterial('taillightMat', () => new THREE.MeshBasicMaterial({ color: CITY_CONFIG.colors.vehicleTaillight, transparent: true, opacity: 0.85 }));
    const headlightMat = getCachedMaterial('headlightMat', () => new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: 0 }));

    const body = new THREE.Mesh(vehicleGeo, vehicleMat);
    body.castShadow = true;
    vehicle.add(body);

    const taillight = new THREE.Mesh(taillightGeo, taillightMat);
    taillight.position.set(0, 0.7, -3);
    vehicle.add(taillight);
    vehicle.userData.taillight = taillight;

    const headlight = new THREE.Mesh(headlightGeo, headlightMat);
    headlight.position.set(0, 0.7, 3);
    vehicle.add(headlight);
    vehicle.userData.headlight = headlight;

    const isXAxis = road.axis === 'x';
    const laneOffset = (Math.random() - 0.5) * 3.5;
    const start = isXAxis ? -halfGrid - 60 : road.coord + laneOffset;
    const fixed = isXAxis ? road.coord + laneOffset : -halfGrid - 60;

    vehicle.position.set(
      isXAxis ? start : fixed,
      1.6,
      isXAxis ? fixed : start
    );
    vehicle.rotation.y = isXAxis ? 0 : Math.PI / 2;

    const direction = Math.random() < 0.5 ? 1 : -1;
    if (direction === -1) {
      vehicle.rotation.y += Math.PI;
      vehicle.position.set(
        isXAxis ? halfGrid + 60 : fixed,
        1.6,
        isXAxis ? fixed : halfGrid + 60
      );
    }

    vehicle.userData = {
      speed: 0.5 + Math.random() * 0.8,
      axis: road.axis,
      direction,
      roadCoord: road.coord,
      laneOffset,
      bounds: halfGrid + 70,
      taillight: taillight,
      headlight: headlight,
      isXAxis,
    };
    vehicleGroup.add(vehicle);
  }
}

function updateMarkers(reports, filter) {
  if (!markerGroup) return;
  currentReports = reports;
  mapFilter = filter;

  while (markerGroup.children.length > 0) {
    const child = markerGroup.children[0];
    markerGroup.remove(child);
    disposeObject(child);
  }
  clearLabels();

  const { jaipurBounds } = CITY_CONFIG;
  const { gridSize, blockSize, roadWidth } = CITY_CONFIG;
  const worldSize = gridSize * (blockSize + roadWidth);
  const halfWorld = worldSize / 2;

  reports.forEach((report, index) => {
    if (!report.lat || !report.lon) return;

    const shouldShow =
      filter === 'all' ||
      (filter === 'open' && report.status !== 'Resolved') ||
      (filter === 'resolved' && report.status === 'Resolved');
    if (!shouldShow) return;

    const lat = report.lat;
    const lon = report.lon;

    const latNorm = (lat - jaipurBounds.latMin) / (jaipurBounds.latMax - jaipurBounds.latMin);
    const lonNorm = (lon - jaipurBounds.lonMin) / (jaipurBounds.lonMax - jaipurBounds.lonMin);

    const x = (lonNorm - 0.5) * worldSize;
    const z = (0.5 - latNorm) * worldSize;

    if (x < -halfWorld || x > halfWorld || z < -halfWorld || z > halfWorld) return;

    const color = getMarkerColor(report);
    const marker = createMarker(x, z, color, report, index);
    markerGroup.add(marker);

    createLabel(x, z, report);
  });
}

function getMarkerColor(report) {
  if (report.status === 'Resolved') return CITY_CONFIG.colors.markerLow;
  const priority = report.priority || 'Normal';
  if (priority === 'Critical' || priority === 'High') return CITY_CONFIG.colors.markerHigh;
  return CITY_CONFIG.colors.markerMedium;
}

function createMarker(x, z, color, report, index) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.userData = { report, baseY: 7, animOffset: Math.random() * Math.PI * 2, index };

  const pulseGeo = getCachedGeometry('markerPulse', () => new THREE.RingGeometry(3.5, 6, 18));
  const pulseMat = getCachedMaterial(`pulse_${color}`, () => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false,
  }));
  const pulse = new THREE.Mesh(pulseGeo, pulseMat);
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.y = 0.4;
  group.add(pulse);
  group.userData.pulse = pulse;

  const markerGeo = getCachedGeometry('markerCone', () => new THREE.ConeGeometry(2.5, 8.5, 10));
  const markerMat = getCachedMaterial(`marker_${color}`, () => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.7,
    metalness: 0.28, roughness: 0.3,
  }));
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.y = 7;
  marker.castShadow = true;
  group.add(marker);

  const glowGeo = getCachedGeometry('markerGlow', () => new THREE.SphereGeometry(1.5, 10, 10));
  const glowMat = getCachedMaterial(`glow_${color}`, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.y = 11.5;
  group.add(glow);

  const beaconGeo = getCachedGeometry('beacon', () => new THREE.CylinderGeometry(0.18, 0.18, 14, 7));
  const beaconMat = getCachedMaterial(`beacon_${color}`, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22 }));
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.y = 7;
  group.add(beacon);

  const pointLight = new THREE.PointLight(color, 1.5, 22, 2);
  pointLight.position.set(0, 11.5, 0);
  group.add(pointLight);

  return group;
}

function createLabel(x, z, report) {
  const div = document.createElement('div');
  div.className = 'marker-label';
  div.style.cssText = `
    position: absolute;
    pointer-events: none;
    padding: 8px 12px;
    background: rgba(10, 18, 36, 0.96);
    border: 1px solid rgba(0, 245, 212, 0.35);
    border-radius: 8px;
    font: 500 11.5px 'DM Sans', sans-serif;
    color: #f0f5ff;
    white-space: nowrap;
    box-shadow: 0 6px 24px rgba(0,0,0,0.5), 0 0 16px rgba(0, 245, 212, 0.15);
    opacity: 0;
    transform: translate(-50%, -100%) translateY(10px);
    transition: opacity 0.18s ease, transform 0.18s ease;
    z-index: 10;
    backdrop-filter: blur(12px);
  `;
  div.innerHTML = '<strong style="color:#00f5d4">' + escapeHTML(report.title) + '</strong><br><span style="color:#9ab0d1;font-size:10.5px">' + escapeHTML(report.location) + ' \u00b7 ' + escapeHTML(report.id) + '</span>';

  const container = canvasContainer;
  container.appendChild(div);

  const labelGroup3d = new THREE.Group();
  labelGroup3d.position.set(x, 14, z);
  labelGroup3d.userData = { report, labelDiv: div };
  markerGroup.add(labelGroup3d);
  markerLabels.set(report.id, labelGroup3d);

  requestAnimationFrame(() => updateLabelPosition(labelGroup3d));
}

function updateLabelPosition(group) {
  if (!group || !group.parent || !renderer) {
    if (group && group.userData.labelDiv) group.userData.labelDiv.remove();
    return;
  }
  const vector = new THREE.Vector3();
  group.getWorldPosition(vector);
  vector.project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  const x = (vector.x * 0.5 + 0.5) * rect.width;
  const y = (-vector.y * 0.5 + 0.5) * rect.height;
  const div = group.userData.labelDiv;
  if (div) {
    div.style.left = x + 'px';
    div.style.top = y + 'px';
  }
}

function clearLabels() {
  markerLabels.forEach((group) => {
    if (group.userData.labelDiv) group.userData.labelDiv.remove();
  });
  markerLabels.clear();
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;');
}

function animateMarkers(delta) {
  if (!markerGroup) return;
  const t = time;
  markerGroup.children.forEach(marker => {
    const offset = marker.userData.animOffset;
    const markerTime = t + offset;

    marker.children.forEach(child => {
      if (child === marker.userData.pulse) {
        const scale = 1 + Math.sin(markerTime * 2.2) * 0.2;
        child.scale.setScalar(scale);
        child.material.opacity = 0.4 + Math.sin(markerTime * 2.2) * 0.15;
      }
      if (child.geometry && child.geometry.type === 'CylinderGeometry' && child.geometry.parameters.heightTop === 0.18) {
        child.rotation.y += delta * 0.4;
      }
    });

    const bob = Math.sin(markerTime) * 0.3;
    marker.position.y = bob;
    marker.children.forEach(c => {
      if (c.geometry && c.geometry.type === 'ConeGeometry') {
        c.position.y = marker.userData.baseY + bob;
      }
    });
  });

  markerLabels.forEach((group) => {
    updateLabelPosition(group);
  });
}

function animateVehicles(delta) {
  if (!vehicleGroup) return;
  const { gridSize, blockSize, roadWidth } = CITY_CONFIG;
  const halfGrid = (gridSize * (blockSize + roadWidth)) / 2;

  vehicleGroup.children.forEach(vehicle => {
    const data = vehicle.userData;
    const move = data.speed * delta * 60 * data.direction;

    if (data.isXAxis) {
      vehicle.position.x += move;
      if (vehicle.position.x > data.bounds) vehicle.position.x = -data.bounds;
      if (vehicle.position.x < -data.bounds) vehicle.position.x = data.bounds;
    } else {
      vehicle.position.z += move;
      if (vehicle.position.z > data.bounds) vehicle.position.z = -data.bounds;
      if (vehicle.position.z < -data.bounds) vehicle.position.z = data.bounds;
    }

    const brakeIntensity = Math.abs(Math.sin(time * 5 * data.speed)) * 0.35;
    data.taillight.material.opacity = 0.4 + brakeIntensity;
    data.headlight.material.opacity = 0.2;
  });
}

function onPointerMove(event) {
  if (!isInitialized || !canvasContainer) return;
  const rect = canvasContainer.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  checkHover();
}

function checkHover() {
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(markerGroup.children, true);

  if (intersects.length > 0) {
    let markerGroup3d = intersects[0].object;
    while (markerGroup3d.parent && markerGroup3d.parent !== markerGroup) {
      markerGroup3d = markerGroup3d.parent;
    }
    if (markerGroup3d !== hoveredMarker) {
      if (hoveredMarker) setMarkerState(hoveredMarker, 'normal');
      hoveredMarker = markerGroup3d;
      setMarkerState(hoveredMarker, 'hover');
      canvasContainer.style.cursor = 'pointer';
      showLabel(hoveredMarker);
    }
  } else {
    if (hoveredMarker) {
      setMarkerState(hoveredMarker, 'normal');
      hoveredMarker = null;
    }
    canvasContainer.style.cursor = 'grab';
    hideAllLabels();
  }
}

function setMarkerState(marker, state) {
  marker.children.forEach(child => {
    if (child.geometry && child.geometry.type === 'ConeGeometry') {
      if (state === 'hover') {
        child.scale.set(1.18, 1.18, 1.18);
        child.material.emissiveIntensity = 1.1;
      } else if (state === 'selected') {
        child.scale.set(1.3, 1.3, 1.3);
        child.material.emissiveIntensity = 1.4;
      } else {
        child.scale.set(1, 1, 1);
        child.material.emissiveIntensity = 0.7;
      }
    }
    if (child === marker.userData.pulse) {
      child.material.opacity = state === 'hover' ? 0.7 : 0.4;
      child.scale.setScalar(state === 'hover' ? 1.3 : 1);
    }
    if (child.geometry && child.geometry.type === 'SphereGeometry') {
      child.material.opacity = state === 'hover' ? 0.8 : 0.55;
      child.scale.setScalar(state === 'hover' ? 1.2 : 1);
    }
  });
}

function showLabel(marker) {
  markerLabels.forEach((group) => {
    if (group.userData.report === marker.userData.report) {
      const div = group.userData.labelDiv;
      if (div) {
        div.style.opacity = '1';
        div.style.transform = 'translate(-50%, -100%) translateY(0)';
      }
    }
  });
}

function hideAllLabels() {
  markerLabels.forEach((group) => {
    if (group.userData.labelDiv) {
      group.userData.labelDiv.style.opacity = '0';
      group.userData.labelDiv.style.transform = 'translate(-50%, -100%) translateY(10px)';
    }
  });
}

function onClick(event) {
  if (!hoveredMarker) return;
  if (selectedMarker === hoveredMarker) {
    selectedMarker = null;
    setMarkerState(hoveredMarker, 'hover');
    hideAllLabels();
    showToast('Deselected ' + hoveredMarker.userData.report.id);
  } else {
    if (selectedMarker) setMarkerState(selectedMarker, 'normal');
    selectedMarker = hoveredMarker;
    setMarkerState(selectedMarker, 'selected');
    showLabel(selectedMarker);
    showMarkerDetail(selectedMarker.userData.report);
  }
}

function onPointerLeave() {
  if (hoveredMarker && hoveredMarker !== selectedMarker) {
    setMarkerState(hoveredMarker, 'normal');
    hoveredMarker = null;
  }
  canvasContainer.style.cursor = 'grab';
  hideAllLabels();
}

let touchStartX = 0, touchStartY = 0;
function onTouchStart(event) {
  if (event.touches.length === 1) {
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  }
}
function onTouchMove(event) {
  if (event.touches.length === 1) {
    event.preventDefault();
    const deltaX = event.touches[0].clientX - touchStartX;
    const deltaY = event.touches[0].clientY - touchStartY;
    if (controls) {
      controls.enabled = false;
      const rotateSpeed = 0.005;
      controls.target.x -= deltaX * rotateSpeed;
      controls.target.z -= deltaY * rotateSpeed;
    }
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  }
}
function onTouchEnd(event) {
  controls.enabled = true;
  const rect = canvasContainer.getBoundingClientRect();
  mouse.x = ((touchStartX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((touchStartY - rect.top) / rect.height) * 2 + 1;
  checkHover();
  if (hoveredMarker) onClick();
}

function showMarkerDetail(report) {
  const priorityLabel = report.priority || 'Normal';
  const statusLabel = report.status || 'Open';
  showToast(report.id + ': ' + report.title + ' \u2014 ' + priorityLabel + ' \u00b7 ' + statusLabel);
}

function animate() {
  animationId = requestAnimationFrame(animate);
  const now = performance.now();
  const delta = reducedMotion ? 0 : Math.min((now - lastTime) / 1000, 1/30);
  lastTime = now;
  time += delta;

  if (controls) controls.update();
  animateMarkers(delta);
  animateVehicles(delta);
  animateFountains(delta);
  renderer.render(scene, camera);
}

function animateFountains(delta) {
  if (!cityGroup) return;
  cityGroup.traverse(obj => {
    if (obj.userData && obj.userData.water) {
      const water = obj.userData.water;
      water.scale.y = 0.8 + Math.sin(time * 3) * 0.2;
      water.material.opacity = 0.6 + Math.sin(time * 4) * 0.1;
    }
    if (obj.userData && obj.userData.light) {
      obj.userData.light.intensity = 0.7 + Math.sin(time * 2.5) * 0.3;
    }
  });
}

function onResize() {
  if (!renderer || !camera || !canvasContainer) return;
  const width = canvasContainer.clientWidth;
  const height = canvasContainer.clientHeight;
  const aspect = width / height;
  const frustumSize = 240;

  camera.left = frustumSize * aspect / -2;
  camera.right = frustumSize * aspect / 2;
  camera.top = frustumSize / 2;
  camera.bottom = frustumSize / -2;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function disposeObject(obj) {
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    if (Array.isArray(obj.material)) {
      obj.material.forEach(m => m.dispose());
    } else {
      obj.material.dispose();
    }
  }
  obj.children.forEach(disposeObject);
}

function showFallback(message) {
  canvasContainer.innerHTML = `
    <div style="padding:32px;color:#fff;text-align:center;background:#081224;border-radius:16px;border:1px solid rgba(0,245,212,0.2)">
      <div style="font-size:28px;margin-bottom:12px">\u26a0</div>
      <p style="margin:0 0 12px; font-size:15px">${message}</p>
      <p style="font-size:12.5px;color:#6b82a3;margin:0">Showing 2D map instead.</p>
    </div>
  `;
  canvasContainer.style.display = 'block';
  if (mapContainer) mapContainer.style.display = 'none';
  if (toggleBtn) toggleBtn.style.display = 'none';
}

function toggleView(show3D) {
  getDomElements();
  if (show3D) {
    if (canvasContainer) canvasContainer.style.display = 'block';
    if (mapContainer) mapContainer.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.innerHTML = '\u25ab <span>2D</span>';
      toggleBtn.title = 'Switch to 2D map';
    }
    if (!isInitialized) initThreeCity();
  } else {
    if (canvasContainer) canvasContainer.style.display = 'none';
    if (mapContainer) mapContainer.style.display = 'block';
    if (toggleBtn) {
      toggleBtn.innerHTML = '\u25a7 <span>3D</span>';
      toggleBtn.title = 'Switch to 3D city';
    }
  }
}

function updateReports(reports, filter) {
  currentReports = reports;
  mapFilter = filter;
  if (isInitialized) updateMarkers(reports, filter);
}

function destroy() {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener('resize', onResize);
  if (canvasContainer) {
    canvasContainer.removeEventListener('pointermove', onPointerMove);
    canvasContainer.removeEventListener('click', onClick);
    canvasContainer.removeEventListener('pointerleave', onPointerLeave);
    canvasContainer.removeEventListener('touchstart', onTouchStart);
    canvasContainer.removeEventListener('touchmove', onTouchMove);
    canvasContainer.removeEventListener('touchend', onTouchEnd);
  }
  clearLabels();
  materialCache.forEach(m => m.dispose());
  materialCache.clear();
  geometryCache.forEach(g => g.dispose());
  geometryCache.clear();
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
  }
  if (scene) {
    scene.traverse(disposeObject);
  }
  isInitialized = false;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

export { initThreeCity, toggleView, updateReports, destroy };