import * as THREE from "three";

// =========================================================
// CITYFIX AI — ZERO-API-KEY 3D TWIN STREET-LEVEL VIEW
// Procedural Three.js Street Corridor (Offline / Any-Host Ready)
// =========================================================

let container = null;
let scene = null;
let camera = null;
let renderer = null;
let corridorGroup = null;
let issueGroup = null;
let trafficVehicles = [];
let flickerLamp = null;
let beaconMesh = null;
let ringMesh = null;
let resizeObserver = null;
let rafId = null;
let isPaused = false;
let isInitialized = false;
let povCallback = null;

// Interactive camera state
let yawDeg = 18;
let pitchDeg = -3;
let targetYawDeg = 18;
let targetPitchDeg = -3;
let camZ = 16;
let targetCamZ = 16;
let fov = 62;
let targetFov = 62;
let isDragging = false;
let dragLastX = 0;
let dragLastY = 0;

let activeLocation = {
  lat: 26.9163,
  lng: 75.8087,
  title: "MI Road, Jaipur",
  label: "JAIPUR STREET CORRIDOR",
  category: "Other",
  priority: "Normal",
  district: "Jaipur",
};

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashLocation(lat, lng, title) {
  const str = `${Number(lat || 26.91).toFixed(4)}:${Number(lng || 75.8).toFixed(4)}:${title || ""}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function inferStreetTheme(loc) {
  const txt = `${loc.title || ""} ${loc.label || ""} ${loc.district || ""}`.toLowerCase();
  if (/hawa|pink|badi|chaupar|johari|tripolia|heritage/.test(txt)) {
    return "heritage";
  }
  if (/mi road|vaishali|malviya|c-scheme|tonk|civic/.test(txt)) {
    return "commercial";
  }
  return "urban";
}

function emitPov() {
  if (typeof povCallback !== "function") return;
  const normalizedHeading = Math.round(((yawDeg % 360) + 360) % 360);
  const roundedPitch = Math.round(pitchDeg);
  const distToMarker = Math.round(Math.abs(camZ - -14));
  povCallback({
    heading: normalizedHeading,
    pitch: roundedPitch,
    offsetMeters: distToMarker,
  });
}

function disposeGroup(group) {
  if (!group) return;
  group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

function buildStreetCorridor(loc) {
  if (!scene) return;

  if (corridorGroup) {
    scene.remove(corridorGroup);
    disposeGroup(corridorGroup);
  }
  if (issueGroup) {
    scene.remove(issueGroup);
    disposeGroup(issueGroup);
  }

  corridorGroup = new THREE.Group();
  issueGroup = new THREE.Group();
  trafficVehicles = [];
  flickerLamp = null;
  beaconMesh = null;
  ringMesh = null;

  const theme = inferStreetTheme(loc);
  const rand = seededRandom(hashLocation(loc.lat, loc.lng, loc.title));

  // Road surface
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.88,
    metalness: 0.08,
  });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(14, 150), roadMat);
  road.rotation.x = -Math.PI / 2;
  corridorGroup.add(road);

  // Dashed lane markings along Z
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    emissive: 0x1e293b,
    roughness: 0.5,
  });
  for (let z = -68; z <= 68; z += 7.5) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 3.2), stripeMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.02, z);
    corridorGroup.add(dash);
  }

  // Edge shoulder lines
  [-5.6, 5.6].forEach((x) => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 146), stripeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(x, 0.02, 0);
    corridorGroup.add(edge);
  });

  // Curbs & raised sidewalks
  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: theme === "heritage" ? 0x472d30 : 0x1e293b,
    roughness: 0.85,
  });
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.75,
  });
  [-8.6, 8.6].forEach((x) => {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.24, 150), sidewalkMat);
    walk.position.set(x, 0.12, 0);
    corridorGroup.add(walk);

    const curbX = x < 0 ? -6.05 : 6.05;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 150), curbMat);
    curb.position.set(curbX, 0.14, 0);
    corridorGroup.add(curb);
  });

  // Procedural Jaipur Street Facades
  const palette =
    theme === "heritage"
      ? [0x7c3f48, 0x8a4850, 0x6f363f, 0x93535b]
      : theme === "commercial"
        ? [0x1b2940, 0x22334d, 0x263954, 0x192538]
        : [0x1c2536, 0x243044, 0x2a3548, 0x182130];

  const windowGlowMat = new THREE.MeshBasicMaterial({
    color: theme === "heritage" ? 0xfdba74 : 0x7dd3fc,
  });
  const shopGlowMat = new THREE.MeshBasicMaterial({
    color: theme === "heritage" ? 0xfbbf24 : 0x38bdf8,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: theme === "heritage" ? 0xd69e8e : 0x334155,
    roughness: 0.7,
  });

  [-1, 1].forEach((side) => {
    let zCursor = -64;
    while (zCursor < 60) {
      const length = 7 + rand() * 7;
      const depth = 6 + rand() * 4;
      const floors = theme === "heritage" ? 2 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 4);
      const height = floors * 3.6 + 1.2;
      const color = palette[Math.floor(rand() * palette.length)];

      const bMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.78,
        metalness: 0.1,
      });

      const xPos = side * (11.6 + depth * 0.5);
      const zCenter = zCursor + length * 0.5;
      const block = new THREE.Mesh(new THREE.BoxGeometry(depth, height, length - 0.5), bMat);
      block.position.set(xPos, height * 0.5, zCenter);
      corridorGroup.add(block);

      // Parapet / cornice line
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.35, 0.4, length - 0.3), trimMat);
      cornice.position.set(xPos - side * 0.1, height + 0.15, zCenter);
      corridorGroup.add(cornice);

      // Street-facing facade plane position
      const faceX = side * 11.55;

      // Ground-floor shopfront or heritage veranda glow
      if (rand() > 0.2) {
        const shop = new THREE.Mesh(new THREE.PlaneGeometry(length * 0.62, 1.8), shopGlowMat);
        shop.position.set(faceX, 1.6, zCenter);
        shop.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        corridorGroup.add(shop);
      }

      // Upper story lit windows
      for (let f = 1; f < floors; f += 1) {
        if (rand() < 0.28) continue;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(length * 0.52, 0.9), windowGlowMat);
        win.position.set(faceX, f * 3.5 + 1.4, zCenter);
        win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        corridorGroup.add(win);
      }

      zCursor += length + 0.6;
    }
  });

  // Streetlights along both sidewalks
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.35 });
  const isStreetlightIssue = loc.category === "Streetlight";

  for (let z = -54; z <= 54; z += 18) {
    [-6.6, 6.6].forEach((x) => {
      const isOutagePole = isStreetlightIssue && Math.abs(z - -18) < 2 && x < 0;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 6.2, 8), poleMat);
      pole.position.set(x, 3.1, z);
      corridorGroup.add(pole);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), poleMat);
      arm.position.set(x + (x < 0 ? 0.65 : -0.65), 6.1, z);
      corridorGroup.add(arm);

      const bulbMat = new THREE.MeshBasicMaterial({
        color: isOutagePole ? 0x334155 : 0xfde68a,
      });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), bulbMat);
      bulb.position.set(x + (x < 0 ? 1.25 : -1.25), 5.95, z);
      corridorGroup.add(bulb);

      if (isOutagePole) {
        flickerLamp = bulb;
      }
    });
  }

  // Subtle passing civic traffic
  const vehicleSpecs = [
    { x: -2.4, z: -48, speed: 9.5, color: 0x38bdf8 },
    { x: 2.4, z: 38, speed: -8.5, color: 0xe2e8f0 },
    { x: -2.6, z: 12, speed: 7.2, color: 0xf59e0b },
  ];
  vehicleSpecs.forEach((spec) => {
    const car = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.9, 3.4),
      new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.4, metalness: 0.4 })
    );
    body.position.y = 0.62;
    car.add(body);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.55, 1.7),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25, metalness: 0.6 })
    );
    cabin.position.set(0, 1.25, -0.15);
    car.add(cabin);

    const headLightColor = spec.speed > 0 ? 0xfef08a : 0xf43f5e;
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.18, 0.1),
      new THREE.MeshBasicMaterial({ color: headLightColor })
    );
    glow.position.set(0, 0.6, spec.speed > 0 ? 1.72 : -1.72);
    car.add(glow);

    car.position.set(spec.x, 0, spec.z);
    car.userData.speed = spec.speed;
    corridorGroup.add(car);
    trafficVehicles.push(car);
  });

  // Category-specific 3D Issue Site ahead at z = -14
  const issueColor =
    loc.priority === "Critical"
      ? 0xf43f5e
      : loc.priority === "High"
        ? 0xf59e0b
        : 0x38bdf8;

  const issueX = loc.category === "Garbage" || loc.category === "Streetlight" ? -4.8 : -2.2;
  const issueZ = -14;
  issueGroup.position.set(issueX, 0, issueZ);

  if (loc.category === "Road damage") {
    const pothole = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.15, 0.08, 20),
      new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.95 })
    );
    pothole.position.y = 0.03;
    issueGroup.add(pothole);
  } else if (loc.category === "Waterlogging") {
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 24),
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0369a1,
        emissiveIntensity: 0.45,
        roughness: 0.12,
        metalness: 0.85,
        transparent: true,
        opacity: 0.82,
      })
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.y = 0.04;
    issueGroup.add(puddle);
  } else if (loc.category === "Garbage") {
    const binMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.6 });
    const bin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 1.1), binMat);
    bin.position.y = 0.65;
    issueGroup.add(bin);
    for (let i = 0; i < 4; i += 1) {
      const sack = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.32, 0),
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0x334155 : 0x78350f, roughness: 0.9 })
      );
      sack.position.set((i - 1.5) * 0.42, 0.3, 0.72 + (i % 2) * 0.25);
      issueGroup.add(sack);
    }
  }

  // Caution cones for civic issue sites
  if (loc.category !== "Other") {
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x431407 });
    [
      [-1.5, 1.1],
      [1.5, 1.1],
    ].forEach(([cx, cz]) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.68, 12), coneMat);
      cone.position.set(cx, 0.34, cz);
      issueGroup.add(cone);
    });
  }

  // Ground pulse ring + floating diamond beacon
  ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 1.85, 32),
    new THREE.MeshBasicMaterial({
      color: issueColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    })
  );
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.07;
  issueGroup.add(ringMesh);

  beaconMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.62, 0),
    new THREE.MeshStandardMaterial({
      color: issueColor,
      emissive: issueColor,
      emissiveIntensity: 0.7,
      roughness: 0.25,
    })
  );
  beaconMesh.position.y = 3.1;
  issueGroup.add(beaconMesh);

  // Subtle vertical beam
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2.9, 8),
    new THREE.MeshBasicMaterial({ color: issueColor, transparent: true, opacity: 0.45 })
  );
  beam.position.y = 1.55;
  issueGroup.add(beam);

  scene.add(corridorGroup);
  scene.add(issueGroup);

  // Face camera smoothly toward the issue marker down the street
  const dx = issueX - 0;
  const dz = issueZ - camZ;
  const yawToTarget = (Math.atan2(dx, -dz) * 180) / Math.PI;
  yawDeg = yawToTarget;
  targetYawDeg = yawToTarget;
  pitchDeg = -3;
  targetPitchDeg = -3;
  emitPov();
}

function renderLoop(now) {
  if (!isInitialized) return;
  rafId = requestAnimationFrame(renderLoop);
  if (isPaused || !renderer || !scene || !camera) return;

  const t = now * 0.001;

  // Smooth damping for look & walk
  yawDeg += (targetYawDeg - yawDeg) * 0.22;
  pitchDeg += (targetPitchDeg - pitchDeg) * 0.22;
  camZ += (targetCamZ - camZ) * 0.16;
  fov += (targetFov - fov) * 0.18;

  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  camera.position.set(0, 2.35, camZ);
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(pitchDeg),
    THREE.MathUtils.degToRad(-yawDeg),
    0,
    "YXZ"
  );
  camera.quaternion.setFromEuler(euler);

  // Animate beacon & ring
  if (beaconMesh) {
    beaconMesh.rotation.y = t * 1.4;
    beaconMesh.position.y = 3.05 + Math.sin(t * 2.4) * 0.22;
  }
  if (ringMesh) {
    const pulse = 1 + Math.sin(t * 3.1) * 0.12;
    ringMesh.scale.set(pulse, pulse, 1);
  }
  if (flickerLamp) {
    const on = Math.sin(t * 17) > 0.65;
    flickerLamp.material.color.setHex(on ? 0xf59e0b : 0x334155);
  }

  // Ambient traffic glide
  const dt = 0.016;
  trafficVehicles.forEach((car) => {
    car.position.z += (car.userData.speed || 0) * dt;
    if (car.position.z > 65) car.position.z = -65;
    if (car.position.z < -65) car.position.z = 65;
  });

  renderer.render(scene, camera);
}

function attachPointerControls(el) {
  el.style.cursor = "grab";

  const onDown = (clientX, clientY) => {
    isDragging = true;
    dragLastX = clientX;
    dragLastY = clientY;
    el.style.cursor = "grabbing";
  };

  const onMove = (clientX, clientY) => {
    if (!isDragging) return;
    const dx = clientX - dragLastX;
    const dy = clientY - dragLastY;
    dragLastX = clientX;
    dragLastY = clientY;

    targetYawDeg -= dx * 0.28;
    targetPitchDeg = Math.max(-42, Math.min(58, targetPitchDeg + dy * 0.22));
    emitPov();
  };

  const onUp = () => {
    if (!isDragging) return;
    isDragging = false;
    el.style.cursor = "grab";
  };

  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture?.(e.pointerId);
    onDown(e.clientX, e.clientY);
  });
  window.addEventListener("pointermove", (e) => onMove(e.clientX, e.clientY));
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);

  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      targetFov = Math.max(38, Math.min(82, targetFov + e.deltaY * 0.04));
    },
    { passive: false }
  );
}

function resize() {
  if (!container || !renderer || !camera) return;
  const w = Math.max(200, container.clientWidth);
  const h = Math.max(200, container.clientHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function init({ containerId, onPovChange, onReady, onError }) {
  povCallback = onPovChange || null;
  if (isInitialized) {
    resize();
    onReady?.();
    return true;
  }

  container = document.getElementById(containerId);
  if (!container) {
    onError?.("Street 3D container not found.");
    return false;
  }

  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060d1a);
    scene.fog = new THREE.FogExp2(0x060d1a, 0.0155);

    const w = Math.max(200, container.clientWidth);
    const h = Math.max(200, container.clientHeight);
    camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 220);
    camera.position.set(0, 2.35, camZ);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 1.05);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xf8fafc, 1.25);
    keyLight.position.set(18, 32, 22);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    rimLight.position.set(-20, 14, -24);
    scene.add(rimLight);

    attachPointerControls(renderer.domElement);

    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(container);

    isInitialized = true;
    buildStreetCorridor(activeLocation);
    renderLoop(performance.now());
    onReady?.();
    return true;
  } catch (err) {
    onError?.(err?.message || "WebGL street renderer unavailable.");
    return false;
  }
}

function setLocation(loc = {}) {
  activeLocation = {
    lat: Number(loc.lat) || 26.9163,
    lng: Number(loc.lng ?? loc.lon) || 75.8087,
    title: loc.title || "Jaipur Street Corridor",
    label: loc.label || "3D TWIN STREET VIEW",
    category: loc.category || "Other",
    priority: loc.priority || "Normal",
    district: loc.district || "Jaipur",
  };
  camZ = 16;
  targetCamZ = 16;
  if (isInitialized) {
    buildStreetCorridor(activeLocation);
  }
}

function moveAlongStreet(deltaMeters) {
  targetCamZ = Math.max(-44, Math.min(44, targetCamZ - deltaMeters));
  emitPov();
}

function turn(deltaDeg) {
  targetYawDeg += Number(deltaDeg) || 0;
  emitPov();
}

function recenterOnIssue() {
  targetCamZ = 14;
  const issueX = activeLocation.category === "Garbage" || activeLocation.category === "Streetlight" ? -4.8 : -2.2;
  const dz = -14 - targetCamZ;
  targetYawDeg = (Math.atan2(issueX, -dz) * 180) / Math.PI;
  targetPitchDeg = -3;
  targetFov = 62;
  emitPov();
}

function setPaused(paused) {
  isPaused = Boolean(paused);
}

function destroy() {
  if (rafId) cancelAnimationFrame(rafId);
  resizeObserver?.disconnect();
  if (corridorGroup) disposeGroup(corridorGroup);
  if (issueGroup) disposeGroup(issueGroup);
  renderer?.dispose();
  isInitialized = false;
}

window.CityFixStreet3D = {
  get isInitialized() {
    return isInitialized;
  },
  init,
  setLocation,
  moveAlongStreet,
  turn,
  recenterOnIssue,
  setPaused,
  resize,
  destroy,
};

window.dispatchEvent(new CustomEvent("cityfix:street3d-ready"));
