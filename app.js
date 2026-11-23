"use strict";

// =========================================================
// CITYFIX AI — SMART CITY COMMAND CENTER ENGINE
// =========================================================

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_REPORTS = "cityfix_reports_v2";
const STORAGE_POINTS = "cityfix_points_v2";
const STORAGE_AUDIT = "cityfix_audit_v2";
const STORAGE_UPVOTES = "cityfix_upvotes_v2";
const STORAGE_LANG = "cityfix_lang_v1";

const CATEGORY_MAP_FROM_AI = {
  road_damage: "Road damage",
  garbage: "Garbage",
  waterlogging: "Waterlogging",
  streetlight: "Streetlight",
  other: "Other",
};

const SEED_REPORTS = [
  {
    id: "CF-1024",
    title: "Deep pothole near bus stop",
    category: "Road damage",
    location: "Jhotwara, Jaipur",
    priority: "Critical",
    status: "Open",
    date: "22 Nov 2026",
    createdAt: "2026-11-22T09:15:00.000Z",
    lat: 26.941,
    lon: 75.746,
    description: "Large pothole near the morning bus shelter creating a severe two-wheeler hazard.",
    aiAssessment: null,
    photoDataUrl: null,
    source: "demo",
  },
  {
    id: "CF-1023",
    title: "Garbage overflowing from corner bin",
    category: "Garbage",
    location: "Vaishali Nagar, Jaipur",
    priority: "High",
    status: "In progress",
    date: "22 Nov 2026",
    createdAt: "2026-11-22T07:40:00.000Z",
    lat: 26.912,
    lon: 75.739,
    description: "Solid waste spilling onto the pedestrian sidewalk near Amrapali Circle.",
    aiAssessment: null,
    photoDataUrl: null,
    source: "demo",
  },
  {
    id: "CF-1022",
    title: "Streetlight outage on main crossing",
    category: "Streetlight",
    location: "Mansarovar, Jaipur",
    priority: "Normal",
    status: "Open",
    date: "21 Nov 2026",
    createdAt: "2026-11-21T18:20:00.000Z",
    lat: 26.854,
    lon: 75.764,
    description: "Three consecutive LED fixtures unlit after sunset along the pedestrian stretch.",
    aiAssessment: null,
    photoDataUrl: null,
    source: "demo",
  },
  {
    id: "CF-1021",
    title: "Waterlogging near stormwater grate",
    category: "Waterlogging",
    location: "Malviya Nagar, Jaipur",
    priority: "High",
    status: "Resolved",
    date: "21 Nov 2026",
    createdAt: "2026-11-21T11:05:00.000Z",
    lat: 26.854,
    lon: 75.805,
    description: "Standing water accumulated across the service lane after drainage blockage.",
    aiAssessment: null,
    photoDataUrl: null,
    source: "demo",
  },
];

let reports = loadReports();
let points = Number(localStorage.getItem(STORAGE_POINTS) || 120);
let localAuditEvents = loadAuditEvents();
let upvoteState = loadUpvotes();
let currentLang = localStorage.getItem(STORAGE_LANG) === "hi" ? "hi" : "en";
let demoAdminMode = false;

let miniMap = null;
let fullMap = null;
let reportPinMap = null;
let reportPinMarker = null;
let hotspotLayerGroup = null;
let showHotspots = true;
const mapMarkers = { mini: [], full: [] };
const fullMapLayerGroups = {};
const MAP_LAYER_CATEGORIES = [
  { key: "Road damage", label: "Road damage", swatch: "road" },
  { key: "Garbage", label: "Waste & garbage", swatch: "waste" },
  { key: "Streetlight", label: "Streetlight", swatch: "light" },
  { key: "Waterlogging", label: "Waterlogging", swatch: "water" },
  { key: "Other", label: "Other", swatch: "other" },
];
const activeMapLayers = {
  "Road damage": true,
  Garbage: true,
  Streetlight: true,
  Waterlogging: true,
  Other: true,
};
const prevMapLayerStates = { ...activeMapLayers };
const layerCurrentOpacity = {
  "Road damage": 1,
  Garbage: 1,
  Streetlight: 1,
  Waterlogging: 1,
  Other: 1,
};
const layerFadeFrames = {};
const fullMapMarkersByCategory = {};
let lastFullMapBaseSig = "";
let currentMapFilter = "all";
let currentMapMode = "2d";
let currentView = "overview";

let latestAiAssessment = null;
let lastUploadedDataUrl = null;
let adminAfterPhotoDataUrl = null;
let lastConfirmedReportId = null;
let capabilitiesPromise = null;

const serverState = {
  aiConfigured: false,
  model: "gemini-4-hydrogen",
  checked: false,
};

const streetViewState = {
  osmMap: null,
  osmMapReady: false,
  osmMarkers: [],
  targetMarker: null,
  activeTarget: {
    lat: 26.9163,
    lng: 75.8087,
    title: "MI Road, Jaipur",
    label: "JAIPUR STREET CORRIDOR",
    category: "Other",
    priority: "Normal",
    reportId: null,
  },
  engine: "osm3d",
  manualProcedural: false,
  awaitingStreet3D: false,
  lastTargetBearing: 20,
  requestSeq: 0,
};

const cloudState = {
  configured: Boolean(window.CityFixCloud?.isConfigured),
  session: null,
  profile: null,
  isAdmin: false,
  cloudLoaded: false,
  cloudEvents: [],
};

// =========================================================
// STORAGE & SANITIZATION
// =========================================================

function loadReports() {
  try {
    const saved = localStorage.getItem(STORAGE_REPORTS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
    return structuredClone(SEED_REPORTS);
  } catch {
    return structuredClone(SEED_REPORTS);
  }
}

function loadAuditEvents() {
  try {
    const saved = localStorage.getItem(STORAGE_AUDIT);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return [
    {
      id: "EV-SEED-1",
      reportId: "CF-1021",
      oldStatus: "In progress",
      newStatus: "Resolved",
      note: "Demo seed audit record — drain cleared",
      createdAt: "2026-11-21T16:30:00.000Z",
      actorLabel: "Demo Reviewer",
    },
  ];
}

function loadUpvotes() {
  try {
    const saved = localStorage.getItem(STORAGE_UPVOTES);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        return {
          voted: parsed.voted && typeof parsed.voted === "object" ? parsed.voted : {},
          extra: parsed.extra && typeof parsed.extra === "object" ? parsed.extra : {},
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return { voted: {}, extra: {} };
}

function saveUpvotes() {
  try {
    localStorage.setItem(STORAGE_UPVOTES, JSON.stringify(upvoteState));
  } catch {
    // ignore quota errors
  }
}

function getUpvoteCount(report) {
  if (!report) return 0;
  const base = Math.max(0, Number(report.confirmations) || 0);
  const delta = Math.max(0, Number(upvoteState.extra[report.id]) || 0);
  return base + delta;
}

function hasConfirmedReport(reportId) {
  return Boolean(upvoteState.voted[reportId]);
}

function toggleReportConfirmation(reportId, { forceAdd = false } = {}) {
  const report = reports.find((r) => r.id === reportId);
  if (!report) return false;
  const already = hasConfirmedReport(reportId);
  if (forceAdd && already) {
    showToast(`Already confirmed ${report.id}`);
    return false;
  }
  if (already) {
    delete upvoteState.voted[reportId];
    upvoteState.extra[reportId] = Math.max(0, (Number(upvoteState.extra[reportId]) || 0) - 1);
    showToast(`Confirmation removed from ${report.id}`);
  } else {
    upvoteState.voted[reportId] = true;
    upvoteState.extra[reportId] = (Number(upvoteState.extra[reportId]) || 0) + 1;
    showToast(`Confirmed +1 citizen impact on ${report.id}`);
  }
  saveUpvotes();
  renderEverything();
  return true;
}

function formatIssueAge(createdAt, status) {
  if (status === "Resolved") {
    return currentLang === "hi" ? "हल हो गया" : "Resolved";
  }
  if (!createdAt) return "";
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return "";
  const hours = Math.max(0, Math.floor((Date.now() - ts) / 3600000));
  if (hours < 1) return currentLang === "hi" ? "अभी दर्ज" : "Just now";
  if (hours < 24) return currentLang === "hi" ? `${hours} घंटे से खुला` : `${hours}h open`;
  const days = Math.floor(hours / 24);
  return currentLang === "hi" ? `${days} दिन से खुला` : `${days}d open`;
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_REPORTS, JSON.stringify(reports));
    localStorage.setItem(STORAGE_POINTS, String(points));
    localStorage.setItem(STORAGE_AUDIT, JSON.stringify(localAuditEvents));
  } catch (err) {
    console.warn("Local storage quota reached:", err);
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function isSafeImageUrl(url) {
  if (!url || typeof url !== "string") return false;
  return (
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(url) ||
    /^https:\/\/[a-zA-Z0-9.-]+/.test(url)
  );
}

function priorityRank(priority) {
  return { Critical: 3, High: 2, Normal: 1 }[priority] || 0;
}

function statusClass(status) {
  if (status === "Resolved") return "resolved";
  if (status === "In progress") return "progress";
  return "open";
}

function severityClass(priority) {
  if (priority === "Critical") return "critical";
  if (priority === "High") return "high";
  return "normal";
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// =========================================================
// MODE & CAPABILITY INDICATORS
// =========================================================

function isCloudWriteActive() {
  return cloudState.configured && Boolean(cloudState.session?.user);
}

function canMutateStatus() {
  if (cloudState.configured && cloudState.cloudLoaded && isCloudWriteActive()) {
    return cloudState.isAdmin;
  }
  return demoAdminMode;
}

function updateEnvironmentUI() {
  const envLine = $("#env-status-line");
  const workspaceLabel = $("#workspace-mode-label");
  const userName = $("#user-display-name");
  const userRole = $("#user-role-label");
  const avatar = $("#user-avatar");
  const cloudBtn = $("#cloud-auth");

  if (cloudState.configured && cloudState.cloudLoaded) {
    if (cloudState.session?.user) {
      const email = cloudState.session.user.email || "Signed-in user";
      const displayName = cloudState.profile?.display_name || email.split("@")[0];
      if (envLine) envLine.textContent = "JAIPUR WORKSPACE · SUPABASE CLOUD CONNECTED";
      if (workspaceLabel) workspaceLabel.textContent = "Shared cloud workspace · RLS active";
      if (userName) userName.textContent = displayName;
      if (userRole) userRole.textContent = cloudState.isAdmin ? "Authorised Cloud Admin" : "Authenticated Resident";
      if (avatar) avatar.textContent = displayName.slice(0, 2).toUpperCase();
      if (cloudBtn) cloudBtn.textContent = "Sign out";
    } else {
      if (envLine) envLine.textContent = "JAIPUR WORKSPACE · CLOUD READ-ONLY";
      if (workspaceLabel) workspaceLabel.textContent = "Cloud public feed · Sign in to post";
      if (userName) userName.textContent = "Guest Viewer";
      if (userRole) userRole.textContent = "Not signed in";
      if (avatar) avatar.textContent = "GV";
      if (cloudBtn) cloudBtn.textContent = "Cloud sign in";
    }
  } else {
    if (envLine) envLine.textContent = "JAIPUR WORKSPACE · LOCAL DEMO DATA";
    if (workspaceLabel) workspaceLabel.textContent = "Local demo workspace · Synthetic seed data";
    if (userName) userName.textContent = "CityFix Resident";
    if (userRole) userRole.textContent = demoAdminMode ? "Demo admin preview (local)" : "Local demo session";
    if (avatar) avatar.textContent = "CR";
    if (cloudBtn) cloudBtn.textContent = cloudState.configured ? "Cloud sign in" : "Cloud unconfigured";
  }
}

async function checkServerCapabilities() {
  if (capabilitiesPromise) return capabilitiesPromise;
  capabilitiesPromise = (async () => {
    try {
      const res = await fetch("/api/capabilities", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        serverState.aiConfigured = Boolean(data.aiConfigured);
        serverState.model = data.model || "gemini-4-hydrogen";
      }
    } catch {
      serverState.aiConfigured = false;
    } finally {
      serverState.checked = true;
      updateEnvironmentUI();
    }
  })();
  return capabilitiesPromise;
}

// =========================================================
// OVERVIEW & ANALYTICS RENDERING
// =========================================================

function renderStats() {
  const total = reports.length;
  const open = reports.filter((r) => r.status !== "Resolved").length;
  const resolved = reports.filter((r) => r.status === "Resolved").length;
  const highPriority = reports.filter(
    (r) => r.status !== "Resolved" && priorityRank(r.priority) >= 2
  ).length;
  const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  $("#stat-open").textContent = String(open);
  $("#stat-resolved").textContent = String(resolved);
  $("#stat-priority").textContent = String(highPriority);
  $("#stat-resolution-rate").textContent = `${rate}%`;
  $("#nav-count").textContent = String(total);

  $("#impact-points").innerHTML = `${points}<span> pts</span>`;
  const userReports = reports.filter(
    (r) => !SEED_REPORTS.some((seed) => seed.id === r.id)
  ).length;

  $("#milestone-three").textContent = userReports >= 3 ? "Unlocked" : `${userReports} / 3`;
  $("#milestone-five").textContent = userReports >= 5 ? "Unlocked" : `${userReports} / 5`;

  const pct = Math.min(100, Math.max(10, Math.round((points / 300) * 100)));
  const progressBar = $("#impact-progress-bar");
  if (progressBar) progressBar.style.width = `${pct}%`;
}

function renderBarChart(containerSelector, entries, totalCount, colorOverride = null) {
  const container = $(containerSelector);
  if (!container) return;
  if (!entries.length || totalCount === 0) {
    container.innerHTML = '<p class="muted">No records available for breakdown.</p>';
    return;
  }
  container.innerHTML = entries
    .map(([label, count]) => {
      const pct = Math.round((count / totalCount) * 100);
      const fillStyle = colorOverride ? `background:${colorOverride(label)};` : "";
      return `
        <div class="bar-row">
          <div class="bar-row-head">
            <span>${escapeHTML(label)}</span>
            <span class="tabular">${count} (${pct}%)</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%;${fillStyle}"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderPriorityList() {
  const sorted = [...reports]
    .filter((r) => r.status !== "Resolved")
    .sort((a, b) => (priorityRank(b.priority) - priorityRank(a.priority)) || (getUpvoteCount(b) - getUpvoteCount(a)));

  const container = $("#priority-list");
  if (!sorted.length) {
    container.innerHTML = '<p class="muted">No open issues awaiting triage.</p>';
    return;
  }

  container.innerHTML = sorted
    .slice(0, 5)
    .map((r) => {
      const conf = getUpvoteCount(r);
      const age = formatIssueAge(r.createdAt, r.status);
      return `
      <button class="list-item" type="button" data-inspect="${escapeHTML(r.id)}">
        <div class="list-item-copy">
          <strong>${escapeHTML(r.title)}</strong>
          <small>${escapeHTML(r.location)} · ${escapeHTML(r.id)}${age ? ` · <span class="age-tag">${escapeHTML(age)}</span>` : ""}${conf > 0 ? ` · <span class="upvote-count">+${conf}</span>` : ""}</small>
        </div>
        <div class="list-item-meta">
          <span class="severity-text ${severityClass(r.priority)}">${escapeHTML(r.priority)}</span>
          <small class="muted">${escapeHTML(r.category)}</small>
        </div>
      </button>
    `;
    })
    .join("");
}

function renderRecentActivity() {
  const container = $("#recent-list");
  if (!reports.length) {
    container.innerHTML = '<p class="muted">No reports submitted yet.</p>';
    return;
  }

  container.innerHTML = reports
    .slice(0, 5)
    .map((r) => {
      const conf = getUpvoteCount(r);
      return `
      <button class="list-item" type="button" data-inspect="${escapeHTML(r.id)}">
        <div class="list-item-copy">
          <strong>${escapeHTML(r.title)}</strong>
          <small>${escapeHTML(r.location)} · ${escapeHTML(r.date)}${conf > 0 ? ` · <span class="upvote-count">+${conf} confirmed</span>` : ""}</small>
        </div>
        <div class="list-item-meta">
          <span class="status-text ${statusClass(r.status)}">${escapeHTML(r.status)}</span>
          <small class="id-label">${escapeHTML(r.id)}</small>
        </div>
      </button>
    `;
    })
    .join("");
}

function renderAnalytics() {
  const total = reports.length;

  // Categories
  const catCounts = {};
  ["Road damage", "Garbage", "Waterlogging", "Streetlight", "Other"].forEach((c) => (catCounts[c] = 0));
  reports.forEach((r) => {
    catCounts[r.category] = (catCounts[r.category] || 0) + 1;
  });
  const catEntries = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  renderBarChart("#overview-category-bars", catEntries, total);
  renderBarChart("#analytics-category-chart", catEntries, total);

  // Statuses
  const statusEntries = [
    ["Open", reports.filter((r) => r.status === "Open").length],
    ["In progress", reports.filter((r) => r.status === "In progress").length],
    ["Resolved", reports.filter((r) => r.status === "Resolved").length],
  ];
  renderBarChart("#analytics-status-chart", statusEntries, total, (label) => {
    if (label === "Resolved") return "var(--green)";
    if (label === "In progress") return "var(--accent)";
    return "var(--red)";
  });

  // Geographic distribution (grouped strictly by recorded locations)
  const geoMap = {};
  reports.forEach((r) => {
    const ward = String(r.location || "Unspecified").split(",")[0].trim() || "Unspecified";
    geoMap[ward] = (geoMap[ward] || 0) + 1;
  });
  const geoEntries = Object.entries(geoMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  renderBarChart("#geo-distribution", geoEntries, total);

  // Timeline (grouped by recorded date label)
  const dateMap = {};
  reports.forEach((r) => {
    const key = r.date || "Recent";
    dateMap[key] = (dateMap[key] || 0) + 1;
  });
  const dateEntries = Object.entries(dateMap).slice(0, 6);
  renderBarChart("#analytics-trend-chart", dateEntries, total);
}

// =========================================================
// REPORT TABLE & TRACKING
// =========================================================

function renderTable() {
  const search = ($("#search-reports")?.value || "").toLowerCase().trim();
  const status = $("#status-filter")?.value || "all";
  const category = $("#category-filter")?.value || "all";
  const severity = $("#severity-filter")?.value || "all";

  const filtered = reports.filter((r) => {
    const matchesSearch =
      !search ||
      [r.title, r.location, r.id, r.category, r.description]
        .join(" ")
        .toLowerCase()
        .includes(search);
    return (
      matchesSearch &&
      (status === "all" || r.status === status) &&
      (category === "all" || r.category === category) &&
      (severity === "all" || r.priority === severity)
    );
  });

  const tbody = $("#reports-body");
  tbody.innerHTML = filtered
    .map((r) => {
      const conf = getUpvoteCount(r);
      const age = formatIssueAge(r.createdAt, r.status);
      return `
      <tr data-inspect="${escapeHTML(r.id)}">
        <td>
          <strong>${escapeHTML(r.title)}</strong><br>
          <span class="id-label">${escapeHTML(r.id)}</span>
          ${age ? ` <span class="age-tag">· ${escapeHTML(age)}</span>` : ""}
          ${conf > 0 ? ` <span class="upvote-count">· +${conf}</span>` : ""}
        </td>
        <td>${escapeHTML(r.location)}</td>
        <td>${escapeHTML(r.category)}</td>
        <td><span class="severity-text ${severityClass(r.priority)}">${escapeHTML(r.priority)}</span></td>
        <td><span class="status-text ${statusClass(r.status)}">${escapeHTML(r.status)}</span></td>
        <td class="tabular">${escapeHTML(r.date)}</td>
        <td>
          <button class="row-action" type="button" data-inspect="${escapeHTML(r.id)}">Inspect</button>
          ${
            canMutateStatus()
              ? `<button class="row-action" type="button" data-status="${escapeHTML(r.id)}">Cycle status</button>`
              : ""
          }
        </td>
      </tr>
    `;
    })
    .join("");

  $("#empty-state").hidden = filtered.length > 0;

  tbody.querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      cycleReportStatus(btn.dataset.status);
    });
  });
}

// =========================================================
// LEAFLET 2D MAPS
// =========================================================

function initializeMap(selector, center, zoom) {
  const el = $(selector);
  if (!el) return null;
  if (!window.L) {
    el.innerHTML = '<div style="padding:20px;color:#94a3b8">Map library unavailable.</div>';
    return null;
  }
  const map = L.map(el, { scrollWheelZoom: false }).setView(center, zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);
  if (selector === "#full-map") {
    hotspotLayerGroup = L.layerGroup().addTo(map);
    MAP_LAYER_CATEGORIES.forEach(({ key }) => {
      fullMapLayerGroups[key] = L.layerGroup().addTo(map);
    });
  }
  return map;
}

function getBaseMapReports() {
  const query = ($("#map-search")?.value || "").trim().toLowerCase();

  return reports.filter((r) => {
    if (currentMapFilter === "open" && r.status === "Resolved") return false;
    if (currentMapFilter === "resolved" && r.status !== "Resolved") return false;
    if (query) {
      const hay = `${r.title} ${r.location} ${r.id} ${r.category}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

function getFilteredMapReports(baseList = getBaseMapReports()) {
  return baseList.filter((r) => {
    const key = Object.prototype.hasOwnProperty.call(activeMapLayers, r.category) ? r.category : "Other";
    return Boolean(activeMapLayers[key]);
  });
}

function renderMapLayerPanel(baseList) {
  const listEl = $("#map-layer-list");
  const summaryEl = $("#map-layers-summary");
  if (!listEl) return;

  const counts = {};
  MAP_LAYER_CATEGORIES.forEach(({ key }) => (counts[key] = 0));
  baseList.forEach((r) => {
    const key = Object.prototype.hasOwnProperty.call(counts, r.category) ? r.category : "Other";
    counts[key] += 1;
  });

  const activeKeys = MAP_LAYER_CATEGORIES.map((c) => c.key).filter((k) => activeMapLayers[k]);
  if (summaryEl) {
    if (activeKeys.length === MAP_LAYER_CATEGORIES.length) {
      summaryEl.textContent = `All ${MAP_LAYER_CATEGORIES.length} layers active`;
    } else if (activeKeys.length === 0) {
      summaryEl.textContent = "0 layers active";
    } else {
      summaryEl.textContent = `${activeKeys.length} of ${MAP_LAYER_CATEGORIES.length} layers active`;
    }
  }

  $$("[data-layer-solo]").forEach((btn) => {
    const target = btn.dataset.layerSolo;
    const isMatch =
      target === "all"
        ? activeKeys.length === MAP_LAYER_CATEGORIES.length
        : activeKeys.length === 1 && activeKeys[0] === target;
    btn.classList.toggle("active", isMatch);
    btn.setAttribute("aria-pressed", String(isMatch));
  });

  if (listEl.children.length === 0) {
    listEl.innerHTML = MAP_LAYER_CATEGORIES.map(({ key, label, swatch }) => {
      const on = Boolean(activeMapLayers[key]);
      return `
        <button type="button" class="layer-toggle-row" role="switch" aria-checked="${on}" data-layer-toggle="${escapeHTML(key)}">
          <span class="layer-toggle-label">
            <span class="layer-swatch ${swatch}" aria-hidden="true"></span>
            <span>${escapeHTML(label)}</span>
          </span>
          <span class="layer-toggle-meta">
            <span class="layer-count tabular" data-layer-count="${escapeHTML(key)}">${counts[key]}</span>
            <span class="layer-switch" aria-hidden="true"></span>
          </span>
        </button>
      `;
    }).join("");

    listEl.querySelectorAll("[data-layer-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.layerToggle;
        if (!Object.prototype.hasOwnProperty.call(activeMapLayers, key)) return;
        activeMapLayers[key] = !activeMapLayers[key];
        renderMaps();
      });
    });
  } else {
    listEl.querySelectorAll("[data-layer-toggle]").forEach((btn) => {
      const key = btn.dataset.layerToggle;
      const on = Boolean(activeMapLayers[key]);
      btn.setAttribute("aria-checked", String(on));
      const countEl = btn.querySelector("[data-layer-count]");
      if (countEl) countEl.textContent = String(counts[key] ?? 0);
    });
  }
}

function setLayerMarkersOpacity(categoryKey, alpha) {
  const markers = fullMapMarkersByCategory[categoryKey] || [];
  const clamped = Math.max(0, Math.min(1, alpha));
  layerCurrentOpacity[categoryKey] = clamped;
  markers.forEach((marker) => {
    marker.setStyle({
      opacity: clamped,
      fillOpacity: 0.88 * clamped,
    });
  });
}

function animateCategoryLayerOpacity(categoryKey, show) {
  if (!fullMap) return;
  const group = fullMapLayerGroups[categoryKey];
  if (!group) return;

  if (layerFadeFrames[categoryKey]) {
    cancelAnimationFrame(layerFadeFrames[categoryKey]);
    delete layerFadeFrames[categoryKey];
  }

  const target = show ? 1 : 0;
  const start = Number.isFinite(layerCurrentOpacity[categoryKey])
    ? layerCurrentOpacity[categoryKey]
    : (show ? 0 : 1);

  if (show && !fullMap.hasLayer(group)) {
    group.addTo(fullMap);
  }

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || Math.abs(target - start) < 0.01) {
    setLayerMarkersOpacity(categoryKey, target);
    if (!show && fullMap.hasLayer(group)) {
      fullMap.removeLayer(group);
    }
    return;
  }

  const duration = show ? 220 : 200;
  const startedAt = performance.now();

  const step = (now) => {
    const t = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = start + (target - start) * eased;
    setLayerMarkersOpacity(categoryKey, value);

    if (t < 1) {
      layerFadeFrames[categoryKey] = requestAnimationFrame(step);
    } else {
      delete layerFadeFrames[categoryKey];
      if (!activeMapLayers[categoryKey] && fullMap.hasLayer(group)) {
        fullMap.removeLayer(group);
      }
    }
  };

  layerFadeFrames[categoryKey] = requestAnimationFrame(step);
}

function createMapCircleMarker(report, initialAlpha = 1) {
  const color =
    report.status === "Resolved"
      ? "#10b981"
      : priorityRank(report.priority) >= 2
        ? "#f43f5e"
        : "#f59e0b";

  const marker = L.circleMarker([Number(report.lat), Number(report.lon)], {
    radius: 9,
    color,
    fillColor: color,
    opacity: initialAlpha,
    fillOpacity: 0.88 * initialAlpha,
    weight: 2,
  });

  const hasCoords = Number.isFinite(Number(report.lat)) && Number.isFinite(Number(report.lon));
  marker.bindPopup(`
    <strong>${escapeHTML(report.title)}</strong><br>
    <span>${escapeHTML(report.location)} · ${escapeHTML(report.id)}</span><br>
    <small>${escapeHTML(report.category)} · ${escapeHTML(report.priority)} · ${escapeHTML(report.status)}</small>
    ${hasCoords ? `<br><button class="popup-sv-btn" type="button" data-open-streetview="${escapeHTML(report.id)}">Live 3D Street View →</button>` : ""}
  `);

  marker.on("click", () => {
    openIssueDrawer(report.id);
  });

  marker._reportId = report.id;
  return marker;
}

function drawMarkers(map, mapType, list, filteredActiveList = list) {
  if (!map || !window.L) return;

  if (mapType === "mini") {
    mapMarkers.mini.forEach((m) => m.remove());
    mapMarkers.mini = [];
    list.forEach((report) => {
      if (!Number.isFinite(Number(report.lat)) || !Number.isFinite(Number(report.lon))) return;
      const marker = createMapCircleMarker(report, 1);
      marker.addTo(map);
      mapMarkers.mini.push(marker);
    });
    return;
  }

  // Full map: maintain per-category LayerGroups and smoothly animate opacity changes
  const baseSig = list
    .map((r) => `${r.id}:${r.status}:${r.priority}:${r.category}:${r.lat}:${r.lon}`)
    .join("|");

  if (baseSig !== lastFullMapBaseSig) {
    lastFullMapBaseSig = baseSig;
    mapMarkers.full = [];

    MAP_LAYER_CATEGORIES.forEach(({ key }) => {
      const group = fullMapLayerGroups[key];
      if (group) group.clearLayers();
      fullMapMarkersByCategory[key] = [];
    });

    list.forEach((report) => {
      if (!Number.isFinite(Number(report.lat)) || !Number.isFinite(Number(report.lon))) return;
      const layerKey = Object.prototype.hasOwnProperty.call(fullMapLayerGroups, report.category)
        ? report.category
        : "Other";
      const targetGroup = fullMapLayerGroups[layerKey];
      const initialAlpha = activeMapLayers[layerKey]
        ? (prevMapLayerStates[layerKey] ? 1 : 0)
        : (layerCurrentOpacity[layerKey] ?? 0);

      const marker = createMapCircleMarker(report, initialAlpha);
      if (targetGroup) {
        marker.addTo(targetGroup);
        fullMapMarkersByCategory[layerKey].push(marker);
      } else {
        marker.addTo(map);
      }
      mapMarkers.full.push(marker);
    });
  }

  MAP_LAYER_CATEGORIES.forEach(({ key }) => {
    const isNowOn = Boolean(activeMapLayers[key]);
    const wasOn = Boolean(prevMapLayerStates[key]);
    if (isNowOn !== wasOn) {
      if (isNowOn && !layerFadeFrames[key]) {
        layerCurrentOpacity[key] = 0;
        setLayerMarkersOpacity(key, 0);
      }
      animateCategoryLayerOpacity(key, isNowOn);
      prevMapLayerStates[key] = isNowOn;
    } else if (isNowOn && !layerFadeFrames[key] && layerCurrentOpacity[key] !== 1) {
      if (fullMapLayerGroups[key] && !map.hasLayer(fullMapLayerGroups[key])) {
        fullMapLayerGroups[key].addTo(map);
      }
      setLayerMarkersOpacity(key, 1);
    }
  });

  if ($("#map-total")) {
    const placed = filteredActiveList.filter(
      (r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon))
    ).length;
    $("#map-total").textContent = `${placed} pinned on map (${filteredActiveList.length} matching filters)`;
  }

  renderHotspotRings(filteredActiveList);
}

function renderHotspotRings(list) {
  if (!fullMap || !hotspotLayerGroup || !window.L) return;
  hotspotLayerGroup.clearLayers();

  const toggleBtn = $("#map-hotspot-toggle");
  if (toggleBtn) {
    toggleBtn.setAttribute("aria-pressed", String(showHotspots));
    toggleBtn.classList.toggle("active", showHotspots);
    toggleBtn.textContent = showHotspots ? "Hotspot rings: On" : "Hotspot rings: Off";
  }

  if (!showHotspots) {
    if (fullMap.hasLayer(hotspotLayerGroup)) fullMap.removeLayer(hotspotLayerGroup);
    return;
  }
  if (!fullMap.hasLayer(hotspotLayerGroup)) hotspotLayerGroup.addTo(fullMap);

  const openPinned = (list || []).filter(
    (r) => r.status !== "Resolved" && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon))
  );

  const clusters = [];
  openPinned.forEach((report) => {
    const lat = Number(report.lat);
    const lon = Number(report.lon);
    const hit = clusters.find((c) => Math.hypot(c.lat - lat, c.lon - lon) < 0.015);
    if (hit) {
      hit.items.push(report);
      hit.lat = hit.items.reduce((sum, item) => sum + Number(item.lat), 0) / hit.items.length;
      hit.lon = hit.items.reduce((sum, item) => sum + Number(item.lon), 0) / hit.items.length;
      if (priorityRank(report.priority) > hit.maxRank) hit.maxRank = priorityRank(report.priority);
    } else {
      clusters.push({
        lat,
        lon,
        items: [report],
        maxRank: priorityRank(report.priority),
      });
    }
  });

  clusters.forEach((cluster) => {
    const count = cluster.items.length;
    const color = cluster.maxRank >= 3 ? "#f43f5e" : cluster.maxRank >= 2 ? "#f59e0b" : "#38bdf8";
    const ward = String(cluster.items[0].location || "Jaipur").split(",")[0].trim();
    const ring = L.circle([cluster.lat, cluster.lon], {
      radius: 420 + count * 180,
      color,
      fillColor: color,
      fillOpacity: 0.14,
      weight: 1.4,
      dashArray: "5 5",
    });
    ring.bindTooltip(
      `${count} open issue${count === 1 ? "" : "s"} near ${escapeHTML(ward)}`,
      { direction: "top" }
    );
    ring.addTo(hotspotLayerGroup);
  });
}

function renderMapSyncList(list) {
  const container = $("#map-sync-list");
  if (!container) return;
  const anyLayerOn = MAP_LAYER_CATEGORIES.some((c) => activeMapLayers[c.key]);
  if (!anyLayerOn) {
    container.innerHTML = '<p class="muted">No issue layers selected. Enable a layer above to inspect reports.</p>';
    return;
  }
  if (!list.length) {
    container.innerHTML = '<p class="muted">No reports match your map filters.</p>';
    return;
  }
  container.innerHTML = list
    .map((r) => {
      const hasCoords = Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon));
      const conf = getUpvoteCount(r);
      const age = formatIssueAge(r.createdAt, r.status);
      return `
        <div class="sync-queue-card">
          <button class="list-item" type="button" data-map-focus="${escapeHTML(r.id)}">
            <div class="list-item-copy">
              <strong>${escapeHTML(r.title)}</strong>
              <small>${escapeHTML(r.location)}${hasCoords ? "" : " (no GPS pin)"}${age ? ` · <span class="age-tag">${escapeHTML(age)}</span>` : ""}${conf > 0 ? ` · <span class="upvote-count">+${conf}</span>` : ""}</small>
            </div>
            <div class="list-item-meta">
              <span class="severity-text ${severityClass(r.priority)}">${escapeHTML(r.priority)}</span>
              <small class="status-text ${statusClass(r.status)}">${escapeHTML(r.status)}</small>
            </div>
          </button>
          ${
            hasCoords
              ? `<div class="sync-queue-actions"><button class="row-action" type="button" data-sync-sv="${escapeHTML(r.id)}">Live 3D Street View</button></div>`
              : ""
          }
        </div>
      `;
    })
    .join("");

  container.querySelectorAll("[data-map-focus]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.mapFocus;
      const report = reports.find((r) => r.id === id);
      if (!report) return;
      if (fullMap && Number.isFinite(Number(report.lat)) && Number.isFinite(Number(report.lon))) {
        fullMap.setView([Number(report.lat), Number(report.lon)], 14, { animate: true });
        const marker = mapMarkers.full.find((m) => m._reportId === id);
        if (marker) marker.openPopup();
      }
      if (currentMapMode !== "2d" && Number.isFinite(Number(report.lat)) && Number.isFinite(Number(report.lon))) {
        openStreetViewForReport(report);
      } else {
        openIssueDrawer(id);
      }
    });
  });

  container.querySelectorAll("[data-sync-sv]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const report = reports.find((r) => r.id === btn.dataset.syncSv);
      if (report) openStreetViewForReport(report, { ensureVisibleMode: true });
    });
  });
}

function renderMaps() {
  drawMarkers(miniMap, "mini", reports);
  const baseList = getBaseMapReports();
  renderMapLayerPanel(baseList);
  const fullList = getFilteredMapReports(baseList);
  drawMarkers(fullMap, "full", baseList, fullList);
  renderMapSyncList(fullList);
}

// =========================================================
// ZERO-API-KEY 3D STREET EXPLORER (MAPLIBRE + OPENFREEMAP + PANORAMAX + THREE.JS TWIN)
// =========================================================

function showStreetViewOverlay(title, message, showActions = true) {
  const overlay = $("#streetview-overlay");
  if (!overlay) return;
  $("#streetview-overlay-title").textContent = title;
  $("#streetview-overlay-msg").textContent = message;
  const actions = overlay.querySelector(".streetview-overlay-actions");
  if (actions) actions.hidden = !showActions;
  overlay.hidden = false;
}

function hideStreetViewOverlay() {
  const overlay = $("#streetview-overlay");
  if (overlay) overlay.hidden = true;
}

function updateStreetViewPresetHighlight(lat, lng) {
  $$("[data-sv-preset]").forEach((btn) => {
    const bLat = Number(btn.dataset.lat);
    const bLon = Number(btn.dataset.lon);
    const active = Math.abs(bLat - lat) < 0.002 && Math.abs(bLon - lng) < 0.002;
    btn.classList.toggle("active", active);
  });
}

function renderOsm3DMarkers() {
  if (!streetViewState.osmMap || !window.maplibregl) return;

  streetViewState.osmMarkers.forEach((m) => m.remove());
  streetViewState.osmMarkers = [];

  reports.forEach((r) => {
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const el = document.createElement("button");
    el.type = "button";
    const cls = r.status === "Resolved" ? "resolved" : severityClass(r.priority);
    el.className = `osm3d-issue-pin ${cls}`;
    el.title = `${r.id}: ${r.title}`;
    el.setAttribute("aria-label", `${r.title} (${r.location})`);

    const popup = new maplibregl.Popup({ offset: 14 }).setHTML(
      `<div style="color:#0f172a;font-family:sans-serif;max-width:220px;">
        <strong>${escapeHTML(r.title)}</strong><br>
        <span style="font-size:12px;color:#475569;">${escapeHTML(r.location)} · ${escapeHTML(r.id)}</span><br>
        <small style="color:#0369a1;">${escapeHTML(r.category)} · ${escapeHTML(r.priority)}</small>
      </div>`
    );

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([lon, lat])
      .setPopup(popup)
      .addTo(streetViewState.osmMap);

    el.addEventListener("click", () => {
      openStreetViewForReport(r);
    });

    streetViewState.osmMarkers.push(marker);
  });

  if (!streetViewState.activeTarget.reportId) {
    if (streetViewState.targetMarker) streetViewState.targetMarker.remove();
    const targetEl = document.createElement("div");
    targetEl.className = "osm3d-issue-pin normal";
    streetViewState.targetMarker = new maplibregl.Marker({ element: targetEl })
      .setLngLat([streetViewState.activeTarget.lng, streetViewState.activeTarget.lat])
      .addTo(streetViewState.osmMap);
  } else if (streetViewState.targetMarker) {
    streetViewState.targetMarker.remove();
    streetViewState.targetMarker = null;
  }
}

function initOsm3DStreetViewerOnce(startPos) {
  if (streetViewState.osmMap) return Promise.resolve(streetViewState.osmMap);
  if (!window.maplibregl) {
    return Promise.reject(new Error("MAPLIBRE_UNAVAILABLE"));
  }
  const panoEl = $("#streetview-pano");
  if (!panoEl) return Promise.reject(new Error("CONTAINER_MISSING"));

  return new Promise((resolve, reject) => {
    let settled = false;
    try {
      const map = new maplibregl.Map({
        container: panoEl,
        style: "https://tiles.openfreemap.org/styles/dark",
        center: [startPos.lng, startPos.lat],
        zoom: 17.8,
        pitch: 74,
        bearing: 20,
        maxPitch: 85,
        minZoom: 12,
        maxZoom: 20,
        antialias: true,
        attributionControl: true,
      });

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

      const updateHud = () => {
        const readout = $("#streetview-pov-readout");
        if (readout) {
          const b = Math.round(((map.getBearing() % 360) + 360) % 360);
          const p = Math.round(map.getPitch());
          const z = map.getZoom().toFixed(1);
          readout.textContent = `Heading ${b}° · Tilt ${p}° · Zoom ${z}`;
        }
        const c = map.getCenter();
        if (c && $("#streetview-coords-label")) {
          $("#streetview-coords-label").textContent = `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;
        }
      };

      map.on("move", updateHud);
      map.on("rotate", updateHud);
      map.on("pitch", updateHud);

      map.on("load", () => {
        streetViewState.osmMapReady = true;
        try {
          const style = map.getStyle();
          const sourceName = style?.sources?.openmaptiles ? "openmaptiles" : Object.keys(style?.sources || {})[0];
          if (sourceName && !map.getLayer("cityfix-osm-3d-buildings")) {
            const labelLayerId = (style.layers || []).find(
              (l) => l.type === "symbol" && l.layout && l.layout["text-field"]
            )?.id;

            map.addLayer(
              {
                id: "cityfix-osm-3d-buildings",
                source: sourceName,
                "source-layer": "building",
                type: "fill-extrusion",
                minzoom: 13.5,
                paint: {
                  "fill-extrusion-color": [
                    "interpolate",
                    ["linear"],
                    ["coalesce", ["get", "render_height"], 10],
                    0,
                    "#132036",
                    18,
                    "#1c3152",
                    45,
                    "#254572",
                  ],
                  "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
                  "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
                  "fill-extrusion-opacity": 0.9,
                },
              },
              labelLayerId
            );
          }
        } catch {
          // Keep flat OSM vector view if extrusion layer is unsupported on device
        }

        renderOsm3DMarkers();
        updateHud();
        if (!settled) {
          settled = true;
          resolve(map);
        }
      });

      map.on("error", () => {
        if (!streetViewState.osmMapReady && !settled) {
          settled = true;
          reject(new Error("OSM_TILES_UNAVAILABLE"));
        }
      });

      streetViewState.osmMap = map;
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(map);
        }
      }, 3200);
    } catch (err) {
      reject(err);
    }
  });
}

function syncStreetViewEngineUI() {
  const isProc = streetViewState.engine === "procedural";
  const osmPano = $("#streetview-pano");
  const twinPano = $("#streetview-twin-pano");
  const engineBtn = $("#streetview-engine-toggle");
  const badgeEl = $("#streetview-engine-badge");

  if (osmPano) osmPano.hidden = isProc;
  if (twinPano) twinPano.hidden = !isProc;

  if (engineBtn) {
    engineBtn.setAttribute("aria-pressed", String(isProc));
    engineBtn.classList.toggle("active", isProc);
    engineBtn.textContent = isProc ? "3D OSM Streets" : "3D Street Fallback";
  }

  if (badgeEl) {
    badgeEl.textContent = isProc ? "3D STREET FALLBACK" : "3D STREET VIEW";
  }

  if (window.CityFixStreet3D?.isInitialized) {
    const visible = isProc && currentView === "explore" && currentMapMode !== "2d";
    window.CityFixStreet3D.setPaused(!visible);
    if (visible) window.CityFixStreet3D.resize();
  }

  if (!isProc && streetViewState.osmMap) {
    setTimeout(() => streetViewState.osmMap?.resize(), 80);
  }
}

function activateProceduralStreetView(target, reasonNote) {
  streetViewState.engine = "procedural";
  syncStreetViewEngineUI();

  const initOrApply = () => {
    if (!window.CityFixStreet3D) return;
    const ok = window.CityFixStreet3D.init({
      containerId: "streetview-twin-pano",
      onPovChange: ({ heading, pitch, offsetMeters }) => {
        const readout = $("#streetview-pov-readout");
        if (readout) {
          readout.textContent = `Heading ${heading}° · Pitch ${pitch}° · ${offsetMeters}m to pin`;
        }
      },
      onReady: () => {
        hideStreetViewOverlay();
        window.CityFixStreet3D.setLocation({
          lat: target.lat,
          lng: target.lng,
          title: target.title,
          label: target.label,
          category: target.category || "Other",
          priority: target.priority || "Normal",
          district: target.title,
        });
        window.CityFixStreet3D.setPaused(currentView !== "explore" || currentMapMode === "2d");
      },
      onError: (msg) => {
        showStreetViewOverlay(
          "3D Street View unavailable",
          msg || "WebGL could not start in this browser. Use the 2D City Map.",
          true
        );
      },
    });
    if (ok) {
      window.CityFixStreet3D.setLocation({
        lat: target.lat,
        lng: target.lng,
        title: target.title,
        label: target.label,
        category: target.category || "Other",
        priority: target.priority || "Normal",
        district: target.title,
      });
      hideStreetViewOverlay();
    }
  };

  if (!window.CityFixStreet3D) {
    if (!streetViewState.awaitingStreet3D) {
      streetViewState.awaitingStreet3D = true;
      window.addEventListener(
        "cityfix:street3d-ready",
        () => {
          streetViewState.awaitingStreet3D = false;
          if (streetViewState.engine === "procedural") initOrApply();
        },
        { once: true }
      );
    }
  } else {
    initOrApply();
  }
}

async function loadStreetViewAtLocation(target) {
  const seq = ++streetViewState.requestSeq;
  const lat = Number(target.lat);
  const lng = Number(target.lng ?? target.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    showStreetViewOverlay("Coordinates missing", "This issue does not have GPS coordinates pinned yet.", true);
    return;
  }

  const matchedReport = target.reportId
    ? reports.find((r) => r.id === target.reportId)
    : null;

  streetViewState.activeTarget = {
    lat,
    lng,
    title: target.title || "Jaipur Street",
    label: target.label || "3D OSM STREET EXPLORER",
    category: target.category || matchedReport?.category || "Other",
    priority: target.priority || matchedReport?.priority || "Normal",
    reportId: target.reportId || null,
  };

  if ($("#streetview-kicker")) $("#streetview-kicker").textContent = streetViewState.activeTarget.label;
  if ($("#streetview-location-title")) $("#streetview-location-title").textContent = streetViewState.activeTarget.title;
  if ($("#streetview-coords-label")) $("#streetview-coords-label").textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  updateStreetViewPresetHighlight(lat, lng);

  if (streetViewState.manualProcedural) {
    activateProceduralStreetView(streetViewState.activeTarget);
    return;
  }

  streetViewState.engine = "osm3d";
  syncStreetViewEngineUI();
  showStreetViewOverlay("Loading 3D OSM Jaipur Streets…", "Loading 3D Jaipur street buildings and issue pins.", false);

  try {
    const map = await initOsm3DStreetViewerOnce({ lat, lng });
    if (seq !== streetViewState.requestSeq) return;

    map.flyTo({
      center: [lng, lat],
      zoom: 17.9,
      pitch: 74,
      bearing: streetViewState.lastTargetBearing || 20,
      duration: 900,
    });
    renderOsm3DMarkers();
    hideStreetViewOverlay();
    setTimeout(() => map.resize(), 90);
  } catch {
    if (seq !== streetViewState.requestSeq) return;
    activateProceduralStreetView(streetViewState.activeTarget);
  }
}

function setMapDisplayMode(mode) {
  const valid = ["2d", "split", "streetview"];
  const next = valid.includes(mode) ? mode : "2d";
  currentMapMode = next;

  $$("[data-mapmode]").forEach((btn) => {
    const active = btn.dataset.mapmode === next;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  const stageGrid = $("#map-stage-grid");
  const pane2d = $("#map-2d-pane");
  const paneSv = $("#streetview-stage");

  if (stageGrid) stageGrid.classList.toggle("split", next === "split");
  if (pane2d) pane2d.hidden = next === "streetview";
  if (paneSv) paneSv.hidden = next === "2d";

  if (fullMap && next !== "streetview") {
    setTimeout(() => fullMap.invalidateSize(), 120);
  }

  if (next !== "2d") {
    const needsInitialLoad =
      streetViewState.engine === "osm3d"
        ? !streetViewState.osmMap
        : !window.CityFixStreet3D?.isInitialized;
    if (needsInitialLoad) {
      loadStreetViewAtLocation(streetViewState.activeTarget);
    } else {
      syncStreetViewEngineUI();
      setTimeout(() => {
        if (streetViewState.engine === "osm3d" && streetViewState.osmMap) {
          streetViewState.osmMap.resize();
        }
      }, 120);
    }
  } else if (window.CityFixStreet3D?.isInitialized) {
    window.CityFixStreet3D.setPaused(true);
  }
}

function openStreetViewForReport(report, { ensureVisibleMode = false } = {}) {
  if (!report) return;
  const lat = Number(report.lat);
  const lng = Number(report.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    showToast("This report does not have GPS coordinates pinned yet.");
    return;
  }

  if (currentView !== "explore") {
    navigate("explore");
  }
  if (ensureVisibleMode || currentMapMode === "2d") {
    setMapDisplayMode(currentMapMode === "split" ? "split" : "streetview");
  }

  loadStreetViewAtLocation({
    lat,
    lng,
    title: report.title,
    label: `ISSUE ${report.id} · ${report.location}`,
    category: report.category,
    priority: report.priority,
    reportId: report.id,
  });
}

// =========================================================
// ADMIN CONSOLE & EXPORTS
// =========================================================

function renderAdminConsole() {
  const gateBanner = $("#admin-gate-banner");
  const toggleBtn = $("#admin-toggle");
  const queueContainer = $("#admin-priority-queue");
  const profileCard = $("#admin-profile-card");
  const auditList = $("#admin-audit-list");

  const cloudActive = cloudState.configured && cloudState.cloudLoaded;

  if (cloudActive) {
    toggleBtn.hidden = true;
    if (cloudState.isAdmin) {
      gateBanner.classList.add("authorized");
      gateBanner.textContent =
        "Cloud Admin Verified: status changes write directly to Supabase PostgreSQL and trigger an issue_events audit record.";
    } else {
      gateBanner.classList.remove("authorized");
      gateBanner.textContent =
        "Read-only Admin Preview: your account does not have profiles.is_admin = true in Supabase. Status updates are blocked by Row Level Security.";
    }
  } else {
    toggleBtn.hidden = false;
    toggleBtn.textContent = `Demo admin mode: ${demoAdminMode ? "on" : "off"}`;
    if (demoAdminMode) {
      gateBanner.classList.add("authorized");
      gateBanner.textContent =
        "Demo Admin Mode Active (Local Browser Only): status updates persist in localStorage for demonstration. Not a server security boundary.";
    } else {
      gateBanner.classList.remove("authorized");
      gateBanner.textContent =
        "Enable Demo admin mode above to test status transitions locally, or configure Supabase and promote an admin account.";
    }
  }

  // Priority queue for admin actions
  const ordered = [...reports].sort(
    (a, b) => (priorityRank(b.priority) - priorityRank(a.priority)) || (getUpvoteCount(b) - getUpvoteCount(a))
  );
  const allowed = canMutateStatus();
  queueContainer.innerHTML = ordered.length
    ? ordered
        .map((r) => {
          const conf = getUpvoteCount(r);
          const age = formatIssueAge(r.createdAt, r.status);
          return `
      <div class="admin-queue-row">
        <div class="admin-queue-top">
          <div>
            <strong>${escapeHTML(r.title)}</strong>
            <div class="muted">${escapeHTML(r.id)} · ${escapeHTML(r.location)} · ${escapeHTML(r.category)}${age ? ` · <span class="age-tag">${escapeHTML(age)}</span>` : ""}${conf > 0 ? ` · <span class="upvote-count">+${conf} confirmed</span>` : ""}</div>
          </div>
          <div class="list-item-meta">
            <span class="severity-text ${severityClass(r.priority)}">${escapeHTML(r.priority)}</span>
            <span class="status-text ${statusClass(r.status)}">${escapeHTML(r.status)}</span>
          </div>
        </div>
        <div class="admin-queue-actions">
          <button class="row-action" type="button" data-inspect="${escapeHTML(r.id)}">Inspect</button>
          <button class="row-action" type="button" data-set-status="Open" data-id="${escapeHTML(r.id)}" ${allowed ? "" : "disabled"}>Set Open</button>
          <button class="row-action" type="button" data-set-status="In progress" data-id="${escapeHTML(r.id)}" ${allowed ? "" : "disabled"}>In progress</button>
          <button class="row-action" type="button" data-set-status="Resolved" data-id="${escapeHTML(r.id)}" ${allowed ? "" : "disabled"}>Resolve</button>
        </div>
      </div>
    `;
        })
        .join("")
    : '<p class="muted">No reports in queue.</p>';

  queueContainer.querySelectorAll("[data-set-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      updateReportStatus(btn.dataset.id, btn.dataset.setStatus);
    });
  });

  // Profile & RLS card
  profileCard.innerHTML = `
    <div class="permission-row"><span>Backend mode</span><strong>${cloudActive ? "Supabase Postgres + RLS" : "Local Demo Storage"}</strong></div>
    <div class="permission-row"><span>Session identity</span><strong>${escapeHTML(cloudState.session?.user?.email || "Local Resident")}</strong></div>
    <div class="permission-row"><span>Admin role</span><strong>${cloudActive ? (cloudState.isAdmin ? "Granted (profiles.is_admin)" : "Resident (read-only)") : (demoAdminMode ? "Demo Preview On" : "Off")}</strong></div>
    <div class="permission-row"><span>Server AI key</span><strong>${serverState.aiConfigured ? "Configured (Server-side)" : "Not configured"}</strong></div>
  `;

  // Audit history
  const events = cloudActive && cloudState.session?.user ? cloudState.cloudEvents : localAuditEvents;
  auditList.innerHTML = events.length
    ? events
        .slice(0, 10)
        .map((ev) => {
          const when = ev.createdAt ? new Date(ev.createdAt).toLocaleString("en-IN") : "";
          const label = ev.reportId || (ev.issueId ? String(ev.issueId).slice(0, 8) : "Issue");
          return `
            <div class="audit-row">
              <strong>${escapeHTML(label)}: ${escapeHTML(ev.oldStatus || "—")} → ${escapeHTML(ev.newStatus)}</strong>
              <small>${escapeHTML(ev.note || "Status updated")} · ${escapeHTML(when)}</small>
            </div>
          `;
        })
        .join("")
    : '<p class="muted">No status transition audit events recorded yet.</p>';
}

async function updateReportStatus(reportId, nextStatus) {
  const report = reports.find((r) => r.id === reportId);
  if (!report || report.status === nextStatus) return;

  const attachedProof =
    nextStatus === "Resolved" && isSafeImageUrl(adminAfterPhotoDataUrl)
      ? adminAfterPhotoDataUrl
      : null;
  const rawNote = ($("#admin-audit-note")?.value || "").trim();
  const note =
    rawNote ||
    (attachedProof
      ? "Resolved with after-photo proof via Command Center"
      : "Status updated via Command Center");
  const oldStatus = report.status;

  if (cloudState.configured && report.dbId) {
    try {
      await window.CityFixCloud.updateIssueStatus(report.dbId, nextStatus, note);
      if (cloudState.session?.user) {
        cloudState.cloudEvents = await window.CityFixCloud.loadIssueEvents().catch(() => cloudState.cloudEvents);
      }
    } catch (err) {
      showToast(err.message || "Cloud status update rejected by permissions.");
      return;
    }
  } else {
    localAuditEvents.unshift({
      id: "EV-" + Date.now(),
      reportId: report.id,
      oldStatus,
      newStatus: nextStatus,
      note,
      createdAt: new Date().toISOString(),
      actorLabel: "Demo Admin",
    });
  }

  report.status = nextStatus;
  if (attachedProof) {
    report.afterPhotoDataUrl = attachedProof;
    adminAfterPhotoDataUrl = null;
    if ($("#admin-after-photo")) $("#admin-after-photo").value = "";
    if ($("#admin-after-photo-preview")) $("#admin-after-photo-preview").innerHTML = "";
    if ($("#admin-after-photo-clear")) $("#admin-after-photo-clear").hidden = true;
  }
  saveData();
  if ($("#admin-audit-note")) $("#admin-audit-note").value = "";
  renderEverything();
  showToast(`${report.id} updated to ${nextStatus}`);
}

async function cycleReportStatus(reportId) {
  const report = reports.find((r) => r.id === reportId);
  if (!report) return;
  const next =
    report.status === "Open"
      ? "In progress"
      : report.status === "In progress"
        ? "Resolved"
        : "Open";
  await updateReportStatus(reportId, next);
}

function neutralizeCsvCell(val) {
  const str = String(val ?? "").replace(/"/g, '""');
  const safe = /^[=+\-@\t\r]/.test(str) ? "'" + str : str;
  return `"${safe}"`;
}

function exportReports(format) {
  if (!reports.length) {
    showToast("No reports available to export.");
    return;
  }
  let content = "";
  let mime = "application/json";
  let filename = "cityfix-jaipur-reports.json";

  if (format === "csv") {
    const headers = ["id", "title", "category", "location", "priority", "status", "date", "lat", "lon", "description"];
    const rows = reports.map((r) =>
      headers.map((h) => neutralizeCsvCell(r[h])).join(",")
    );
    content = [headers.join(","), ...rows].join("\n");
    mime = "text/csv;charset=utf-8";
    filename = "cityfix-jaipur-reports.csv";
  } else {
    content = JSON.stringify(reports, null, 2);
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(`Exported ${reports.length} reports (${format.toUpperCase()})`);
}

// =========================================================
// ISSUE DETAIL DRAWER
// =========================================================

async function openIssueDrawer(reportId) {
  const report = reports.find((r) => r.id.toLowerCase() === String(reportId).toLowerCase());
  if (!report) {
    showToast(`No report found matching ${reportId}`);
    return;
  }

  $("#drawer-id").textContent = `${report.id} · ${report.source === "cloud" ? "CLOUD RECORD" : "DEMO RECORD"}`;
  $("#drawer-title").textContent = report.title;

  const body = $("#drawer-body");
  let photoHtml = "";
  if (isSafeImageUrl(report.afterPhotoDataUrl)) {
    const beforeBlock = isSafeImageUrl(report.photoDataUrl)
      ? `<img class="drawer-photo" src="${report.photoDataUrl}" alt="Before resolution issue photo" />`
      : `<div class="muted" style="padding:12px;border:1px dashed var(--line);border-radius:8px;font-size:12px;">No initial citizen photo attached</div>`;
    photoHtml = `
      <div class="drawer-photo-compare">
        <div class="drawer-photo-card">
          <span>BEFORE (REPORTED)</span>
          ${beforeBlock}
        </div>
        <div class="drawer-photo-card">
          <span>AFTER (RESOLVED)</span>
          <img class="drawer-photo" src="${report.afterPhotoDataUrl}" alt="After resolution proof photo" />
        </div>
      </div>
    `;
  } else if (isSafeImageUrl(report.photoDataUrl)) {
    photoHtml = `<img class="drawer-photo" src="${report.photoDataUrl}" alt="Submitted issue evidence" />`;
  } else if (report.photoPath && isCloudWriteActive()) {
    photoHtml = `<div id="drawer-cloud-photo" class="muted">Loading private photo…</div>`;
  }

  const ai = report.aiAssessment;
  const aiHtml = ai
    ? `
      <div class="drawer-section">
        <h4>AI TRIAGE ASSESSMENT (${escapeHTML(ai.provider || "Rule-based")})</h4>
        <p>${escapeHTML(ai.summary || "")}</p>
        <p class="muted">${escapeHTML(ai.safety_reason || "")}</p>
        ${ai.confidence != null ? `<small class="mono-meta">Confidence: ${Math.round(ai.confidence * 100)}% · Human review required</small>` : ""}
      </div>
    `
    : report.priorityReason
      ? `
        <div class="drawer-section">
          <h4>TRIAGE REASON</h4>
          <p>${escapeHTML(report.priorityReason)}</p>
        </div>
      `
      : "";

  const relatedEvents = (cloudState.configured && cloudState.cloudLoaded && cloudState.session?.user
    ? cloudState.cloudEvents.filter((e) => e.issueId === report.dbId)
    : localAuditEvents.filter((e) => e.reportId === report.id));

  const timelineHtml = relatedEvents.length
    ? relatedEvents
        .map(
          (ev) => `
          <div class="audit-row">
            <strong>${escapeHTML(ev.oldStatus || "Submitted")} → ${escapeHTML(ev.newStatus)}</strong>
            <small>${escapeHTML(ev.note || "")} · ${escapeHTML(new Date(ev.createdAt).toLocaleString("en-IN"))}</small>
          </div>
        `
        )
        .join("")
    : `<p class="muted">Initial submission recorded (${escapeHTML(report.date)}). No subsequent status transitions yet.</p>`;

  const confCount = getUpvoteCount(report);
  const confirmed = hasConfirmedReport(report.id);
  const ageLabel = formatIssueAge(report.createdAt, report.status);

  body.innerHTML = `
    ${photoHtml}
    <div class="drawer-section">
      <h4>METADATA</h4>
      <div class="permission-box">
        <div class="permission-row"><span>Status</span><strong class="status-text ${statusClass(report.status)}">${escapeHTML(report.status)}</strong></div>
        <div class="permission-row"><span>Severity</span><strong class="severity-text ${severityClass(report.priority)}">${escapeHTML(report.priority)}</strong></div>
        <div class="permission-row"><span>Category</span><strong>${escapeHTML(report.category)}</strong></div>
        <div class="permission-row"><span>Location</span><strong>${escapeHTML(report.location)}</strong></div>
        <div class="permission-row"><span>Coordinates</span><strong class="tabular">${Number.isFinite(Number(report.lat)) ? `${Number(report.lat).toFixed(4)}, ${Number(report.lon).toFixed(4)}` : "Not pinned"}</strong></div>
        <div class="permission-row"><span>Date</span><strong>${escapeHTML(report.date)}</strong></div>
        ${ageLabel ? `<div class="permission-row"><span>Duration</span><strong class="tabular">${escapeHTML(ageLabel)}</strong></div>` : ""}
        <div class="permission-row"><span>Citizen confirmations</span><strong class="tabular" id="drawer-confirm-count">${confCount}</strong></div>
      </div>
    </div>
    <div class="drawer-section">
      <h4>DESCRIPTION</h4>
      <p>${escapeHTML(report.description || "No additional description provided.")}</p>
    </div>
    ${aiHtml}
    <div class="drawer-section">
      <h4>STATUS TIMELINE</h4>
      <div class="stack-list">${timelineHtml}</div>
    </div>
    <div class="confirm-actions">
      <button class="secondary-btn ${confirmed ? "active" : ""}" type="button" id="drawer-upvote-btn" aria-pressed="${confirmed}">${confirmed ? "Confirmed ✓" : "Confirm same issue (+1)"} (${confCount})</button>
      <button class="secondary-btn" type="button" id="drawer-copy-link">Copy tracking link</button>
      <button class="secondary-btn" type="button" id="drawer-focus-map">View on 2D Map</button>
      <button class="primary-btn" type="button" id="drawer-focus-streetview">Live 3D Street View</button>
    </div>
  `;

  $("#drawer-upvote-btn")?.addEventListener("click", () => {
    toggleReportConfirmation(report.id);
    const updatedCount = getUpvoteCount(report);
    const updatedState = hasConfirmedReport(report.id);
    const btn = $("#drawer-upvote-btn");
    if (btn) {
      btn.classList.toggle("active", updatedState);
      btn.setAttribute("aria-pressed", String(updatedState));
      btn.textContent = `${updatedState ? "Confirmed ✓" : "Confirm same issue (+1)"} (${updatedCount})`;
    }
    if ($("#drawer-confirm-count")) {
      $("#drawer-confirm-count").textContent = String(updatedCount);
    }
  });

  $("#drawer-copy-link")?.addEventListener("click", async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#track=${encodeURIComponent(report.id)}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const tmp = document.createElement("textarea");
        tmp.value = shareUrl;
        tmp.setAttribute("readonly", "");
        tmp.style.position = "fixed";
        tmp.style.opacity = "0";
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand("copy");
        tmp.remove();
      }
      showToast(`Tracking link copied for ${report.id}`);
    } catch {
      showToast(`Tracking code: #track=${report.id}`);
    }
  });

  $("#drawer-focus-map")?.addEventListener("click", () => {
    closeIssueDrawer();
    const layerKey = Object.prototype.hasOwnProperty.call(activeMapLayers, report.category)
      ? report.category
      : "Other";
    if (!activeMapLayers[layerKey]) {
      activeMapLayers[layerKey] = true;
      renderMaps();
    }
    if (currentMapMode === "streetview") {
      setMapDisplayMode("split");
    }
    navigate("explore");
    setTimeout(() => {
      if (fullMap && Number.isFinite(Number(report.lat)) && Number.isFinite(Number(report.lon))) {
        fullMap.setView([Number(report.lat), Number(report.lon)], 14);
        const m = mapMarkers.full.find((mk) => mk._reportId === report.id);
        if (m) m.openPopup();
      }
    }, 250);
  });

  $("#drawer-focus-streetview")?.addEventListener("click", () => {
    closeIssueDrawer();
    openStreetViewForReport(report, { ensureVisibleMode: true });
  });

  $("#issue-drawer-backdrop").classList.add("open");
  $("#issue-drawer-backdrop").setAttribute("aria-hidden", "false");

  if (report.photoPath && isCloudWriteActive() && !report.photoDataUrl) {
    window.CityFixCloud.getPhotoSignedUrl(report.photoPath).then((signedUrl) => {
      const target = $("#drawer-cloud-photo");
      if (!target) return;
      if (signedUrl && isSafeImageUrl(signedUrl)) {
        target.outerHTML = `<img class="drawer-photo" src="${signedUrl}" alt="Cloud issue evidence" />`;
      } else {
        target.textContent = "Private photo restricted to owner or authorised admin.";
      }
    });
  }
}

function closeIssueDrawer() {
  $("#issue-drawer-backdrop").classList.remove("open");
  $("#issue-drawer-backdrop").setAttribute("aria-hidden", "true");
}

// =========================================================
// AI TRIAGE & DUPLICATE CHECKING
// =========================================================

function detectLocalDuplicates(title, location) {
  const words = `${title} ${location}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  if (words.length < 2) return [];

  return reports
    .filter((r) => {
      const hay = `${r.title} ${r.location}`.toLowerCase();
      const hits = words.filter((w) => hay.includes(w)).length;
      return hits >= 2;
    })
    .slice(0, 2);
}

function renderDuplicateAlert(candidates) {
  const box = $("#duplicate-alert");
  if (!box) return;
  if (!candidates || !candidates.length) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <div><strong>Possible duplicate report(s) nearby:</strong> ${candidates
      .map((c) => `${escapeHTML(c.id)} — ${escapeHTML(c.title)} (${escapeHTML(c.location)})`)
      .join(" · ")}</div>
    <div class="duplicate-actions">
      ${candidates
        .map(
          (c) => `<button type="button" class="duplicate-confirm-btn" data-confirm-duplicate="${escapeHTML(c.id)}">Confirm ${escapeHTML(c.id)} (+1) instead →</button>`
        )
        .join("")}
    </div>
  `;
}

function runLocalRuleTriage() {
  const title = $("#issue-title").value.trim();
  const desc = $("#issue-description").value.trim();
  const location = $("#issue-location").value.trim();
  const text = `${title} ${desc}`.toLowerCase();
  const safety = $("#issue-safety").value;

  let priority = safety === "Critical" ? "Critical" : safety === "High" ? "High" : "Normal";
  let reason = "Routine civic maintenance priority.";

  if (/accident|danger|injur|live wire|collapse|sinkhole|deep pothole/.test(text)) {
    priority = "Critical";
    reason = "Safety-critical keywords detected in description.";
  } else if (/block|overflow|dark|waterlog|garbage|broken|pothole|flood|outage/.test(text)) {
    if (priority === "Normal") priority = "High";
    reason = "Infrastructure disruption keywords detected.";
  }

  latestAiAssessment = {
    provider: "Local rule heuristic (non-AI)",
    summary: `Suggested priority: ${priority}. ${reason}`,
    safety_reason: reason,
    confidence: null,
  };

  $("#ai-provider-label").textContent = "Rule-based local preview";
  $("#ai-result-summary").textContent = `${latestAiAssessment.summary} Human review required.`;
  $("#ai-evidence-list").textContent = "";

  const dupes = detectLocalDuplicates(title, location);
  renderDuplicateAlert(dupes);
  return priority;
}

function applyStructuredAiResult(result, sourceLabel) {
  const mappedCategory = CATEGORY_MAP_FROM_AI[result.category] || "Other";
  const mappedPriority =
    result.priority === "critical" ? "Critical" : result.priority === "high" ? "High" : "Normal";

  $("#issue-category").value = mappedCategory;
  $("#issue-safety").value = mappedPriority;

  if (!$("#issue-description").value.trim() && result.summary) {
    $("#issue-description").value = result.summary;
  }

  latestAiAssessment = {
    provider: sourceLabel,
    summary: result.summary,
    safety_reason: result.safety_reason,
    recommended_department: result.recommended_department,
    confidence: result.confidence,
    visible_evidence: result.visible_evidence || [],
    duplicate_ids: result.duplicate_ids || [],
  };

  const confPct = Number.isFinite(Number(result.confidence))
    ? `${Math.round(Number(result.confidence) * 100)}% confidence`
    : "Structured triage";

  $("#ai-provider-label").textContent = `${sourceLabel} · ${confPct}`;
  $("#ai-result-summary").textContent = `${result.summary} (${mappedCategory} · ${mappedPriority} · Dept: ${result.recommended_department || "Civic Desk"}). Human review required.`;

  const evEl = $("#ai-evidence-list");
  if (Array.isArray(result.visible_evidence) && result.visible_evidence.length) {
    evEl.textContent = `Evidence: ${result.visible_evidence.join(" · ")}`;
  } else {
    evEl.textContent = "";
  }

  if (Array.isArray(result.duplicate_ids) && result.duplicate_ids.length) {
    const matched = reports.filter((r) => result.duplicate_ids.includes(r.id));
    renderDuplicateAlert(matched);
  }
}

async function handlePhotoAiAnalysis() {
  const file = $("#issue-photo")?.files?.[0];
  if (!file) {
    showToast("Choose a JPEG, PNG, or WebP photo first.");
    return;
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    showToast("Photo must be a JPEG, PNG, or WebP file under 5 MB.");
    return;
  }

  const btn = $("#ai-classify-photo");
  btn.disabled = true;
  btn.textContent = "Analysing photo…";

  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const response = await fetch("/api/triage-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: file.type,
        title: $("#issue-title").value.trim(),
        location: $("#issue-location").value.trim(),
        description: $("#issue-description").value.trim(),
        existingReports: reports.slice(0, 20).map((r) => ({
          id: r.id,
          title: r.title,
          location: r.location,
          category: r.category,
          status: r.status,
        })),
      }),
    });

    const data = await response.json();
    if (response.ok) {
      applyStructuredAiResult(data, data.provider || "Gemini AI");
      showToast("AI photo suggestion ready — review before submitting.");
      return;
    }

    // Fallback to Supabase Edge Function if configured & signed in
    if (response.status === 503 && isCloudWriteActive()) {
      const edgeResult = await window.CityFixCloud.classifyPhoto(file);
      applyStructuredAiResult(edgeResult, edgeResult.provider || "Supabase Gemini Edge");
      showToast("AI photo suggestion ready via Supabase Edge Function.");
      return;
    }

    // Zero-API-Key client-side visual + text heuristic fallback
    const dims = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = `data:${file.type};base64,${base64}`;
    });
    const textHint = `${file.name} ${$("#issue-title").value} ${$("#issue-description").value}`.toLowerCase();
    let cat = "other";
    if (/pothole|road|asphalt|crack|tar|highway|street/.test(textHint)) cat = "road_damage";
    else if (/garbage|trash|waste|dump|bin|litter/.test(textHint)) cat = "garbage";
    else if (/water|flood|drain|puddle|sewer|rain/.test(textHint)) cat = "waterlogging";
    else if (/light|lamp|pole|wire|dark/.test(textHint)) cat = "streetlight";

    const priority = runLocalRuleTriage().toLowerCase();
    applyStructuredAiResult(
      {
        category: cat,
        priority,
        confidence: 0.62,
        summary: "Local photo & keyword heuristic triage (no external AI key required).",
        safety_reason: "Computed locally in browser; confirm category & severity before dispatch.",
        recommended_department:
          cat === "road_damage"
            ? "Roads & Pavements"
            : cat === "garbage"
              ? "Solid Waste"
              : cat === "waterlogging"
                ? "Drainage"
                : cat === "streetlight"
                  ? "Street Lighting"
                  : "Civic Operations Desk",
        visible_evidence: [
          `Image validated (${dims.w}×${dims.h}px, ${Math.round(file.size / 1024)} KB)`,
          "Zero-API local heuristic classification",
        ],
        duplicate_ids: detectLocalDuplicates($("#issue-title").value, $("#issue-location").value).map((d) => d.id),
      },
      "Local Photo Heuristic (Zero API)"
    );
    showToast("Photo analysed locally (zero-API fallback). Review before submitting.");
  } catch (err) {
    runLocalRuleTriage();
    showToast(err.message || "Switched to local rule triage.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyse photo with AI";
  }
}

async function handleTextAiAnalysis() {
  const title = $("#issue-title").value.trim();
  const location = $("#issue-location").value.trim();
  const description = $("#issue-description").value.trim();
  const safety = $("#issue-safety").value;

  if (title.length < 3) {
    showToast("Enter a brief issue title before running AI triage.");
    return;
  }

  const btn = $("#ai-classify-text");
  btn.disabled = true;
  btn.textContent = "Running AI triage…";

  try {
    const res = await fetch("/api/triage-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        location,
        description,
        safety,
        existingReports: reports.slice(0, 20).map((r) => ({
          id: r.id,
          title: r.title,
          location: r.location,
          category: r.category,
          status: r.status,
        })),
      }),
    });

    const data = await res.json();
    if (res.ok) {
      applyStructuredAiResult(data, data.provider || "Gemini AI");
      showToast("AI text & duplicate analysis ready.");
      return;
    }

    // Honest fallback if server key is unset
    runLocalRuleTriage();
    showToast(data.error || "Using local rule-based triage (Gemini AI key unset).");
  } catch {
    runLocalRuleTriage();
    showToast("Server AI unreachable — local rule-based triage applied.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Run AI text & duplicate check";
  }
}

// =========================================================
// REPORT SUBMISSION WORKFLOW
// =========================================================

function setReportPinCoords(lat, lon, { label = null, updateInputIfEmpty = false } = {}) {
  const numLat = Number(lat);
  const numLon = Number(lon);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) return;
  $("#issue-lat").value = numLat.toFixed(5);
  $("#issue-lon").value = numLon.toFixed(5);
  if (label && $("#issue-location")) {
    $("#issue-location").value = label;
  } else if (updateInputIfEmpty && $("#issue-location") && !$("#issue-location").value.trim()) {
    $("#issue-location").value = `Pinned Jaipur location (${numLat.toFixed(4)}, ${numLon.toFixed(4)})`;
  }
  if ($("#location-coords-hint")) {
    $("#location-coords-hint").textContent = `Coordinates pinned (${numLat.toFixed(4)}, ${numLon.toFixed(4)}).`;
  }
  $$(".quick-loc-btn:not(#toggle-pin-map)").forEach((b) => {
    const match = label ? b.dataset.loc === label : false;
    b.classList.toggle("active", match);
  });
  if (reportPinMap && window.L) {
    if (!reportPinMarker) {
      reportPinMarker = L.circleMarker([numLat, numLon], {
        radius: 8,
        color: "#38bdf8",
        fillColor: "#38bdf8",
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(reportPinMap);
    } else {
      reportPinMarker.setLatLng([numLat, numLon]);
    }
    reportPinMap.setView([numLat, numLon], Math.max(reportPinMap.getZoom(), 13));
  }
}

function ensureReportPinMap() {
  const el = $("#report-pin-map");
  if (!el || !window.L) return null;
  if (!reportPinMap) {
    reportPinMap = L.map(el, { scrollWheelZoom: false }).setView([26.9124, 75.7873], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(reportPinMap);
    reportPinMap.on("click", (ev) => {
      setReportPinCoords(ev.latlng.lat, ev.latlng.lng, { updateInputIfEmpty: true });
      runLocalRuleTriage();
    });
  }
  const lat = Number($("#issue-lat")?.value);
  const lon = Number($("#issue-lon")?.value);
  if (Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0) {
    setReportPinCoords(lat, lon);
  }
  return reportPinMap;
}

function resetReportPinPicker() {
  const wrap = $("#report-pin-map-wrap");
  const toggleBtn = $("#toggle-pin-map");
  if (wrap) wrap.hidden = true;
  if (toggleBtn) {
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.classList.remove("active");
    toggleBtn.textContent = currentLang === "hi" ? "मैप पर पिन लगाएँ" : "Drop pin on map";
  }
  if (reportPinMarker) {
    reportPinMarker.remove();
    reportPinMarker = null;
  }
  $$(".quick-loc-btn:not(#toggle-pin-map)").forEach((b) => b.classList.remove("active"));
}

function openReportModal(prefill = null) {
  $("#report-form").hidden = false;
  $("#report-confirmation").hidden = true;
  $("#upload-progress").hidden = true;
  $("#duplicate-alert").hidden = true;
  resetReportPinPicker();

  if (prefill?.location) $("#issue-location").value = prefill.location;
  if (prefill?.lat && prefill?.lon) {
    setReportPinCoords(prefill.lat, prefill.lon, { label: prefill.location || null });
  }

  $("#report-modal").classList.add("open");
  $("#report-modal").setAttribute("aria-hidden", "false");
  const modalBox = $("#report-modal .modal");
  if (modalBox) modalBox.scrollTop = 0;

  if (reportPinMap && !$("#report-pin-map-wrap")?.hidden) {
    requestAnimationFrame(() => {
      setTimeout(() => reportPinMap?.invalidateSize(true), 120);
    });
  }
}

function closeReportModal() {
  $("#report-modal").classList.remove("open");
  $("#report-modal").setAttribute("aria-hidden", "true");
}

function previewPhoto(event) {
  const file = event.target.files?.[0];
  lastUploadedDataUrl = null;
  if (!file) {
    $("#photo-preview").innerHTML = "";
    return;
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showToast("Please select a JPEG, PNG, or WebP image.");
    event.target.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast("Image must be 5 MB or smaller.");
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const res = String(reader.result || "");
    if (isSafeImageUrl(res)) {
      lastUploadedDataUrl = res;
      $("#photo-preview").innerHTML = `<img src="${res}" alt="Selected civic issue photo preview" />`;
    }
  };
  reader.readAsDataURL(file);
}

async function submitReport(event) {
  event.preventDefault();
  const title = $("#issue-title").value.trim();
  const location = $("#issue-location").value.trim();

  if (title.length < 5) {
    showToast("Please enter an issue title of at least 5 characters.");
    $("#issue-title").focus();
    return;
  }
  if (location.length < 2) {
    showToast("Please enter a Jaipur location or neighbourhood.");
    $("#issue-location").focus();
    return;
  }

  const priority = $("#issue-safety").value || runLocalRuleTriage();
  const category = $("#issue-category").value;
  const description = $("#issue-description").value.trim();
  const latVal = $("#issue-lat").value ? Number($("#issue-lat").value) : null;
  const lonVal = $("#issue-lon").value ? Number($("#issue-lon").value) : null;
  const photoFile = $("#issue-photo").files?.[0] || null;

  const nextNum =
    Math.max(
      1024,
      ...reports.map((r) => Number(String(r.id).replace("CF-", "")) || 0)
    ) + 1;

  const newReport = {
    id: `CF-${nextNum}`,
    title,
    category,
    location,
    priority,
    status: "Open",
    date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    createdAt: new Date().toISOString(),
    lat: Number.isFinite(latVal) ? latVal : null,
    lon: Number.isFinite(lonVal) ? lonVal : null,
    description,
    priorityReason: latestAiAssessment?.safety_reason || "Reporter-verified priority",
    aiAssessment: latestAiAssessment,
    photoDataUrl: lastUploadedDataUrl,
    source: "demo",
  };

  const submitBtn = $("#submit-report-btn");
  const progressBox = $("#upload-progress");
  const progressFill = $("#upload-progress-fill");
  const progressText = $("#upload-progress-text");

  submitBtn.disabled = true;
  progressBox.hidden = false;
  progressFill.style.width = "30%";
  progressText.textContent = "Validating report…";

  try {
    let savedReport = newReport;

    if (isCloudWriteActive()) {
      savedReport = await window.CityFixCloud.createIssue(newReport, photoFile, (pct, msg) => {
        progressFill.style.width = `${pct}%`;
        progressText.textContent = msg;
      });
      savedReport.aiAssessment = latestAiAssessment;
    } else {
      progressFill.style.width = "100%";
      progressText.textContent = "Saving to local demo workspace…";
      points += 30;
    }

    reports.unshift(savedReport);
    saveData();
    renderEverything();

    lastConfirmedReportId = savedReport.id;
    $("#confirmed-ref-id").textContent = savedReport.id;
    $("#confirmed-message").textContent = isCloudWriteActive()
      ? "Saved to shared Supabase cloud storage."
      : "Saved to your local demo workspace (+30 demo community points).";

    $("#report-form").reset();
    $("#photo-preview").innerHTML = "";
    $("#issue-lat").value = "";
    $("#issue-lon").value = "";
    if ($("#location-coords-hint")) {
      $("#location-coords-hint").textContent = "Device location is requested only if you click Use GPS.";
    }
    resetReportPinPicker();
    lastUploadedDataUrl = null;
    latestAiAssessment = null;

    $("#report-form").hidden = true;
    $("#report-confirmation").hidden = false;
    showToast(`Report ${savedReport.id} submitted`);
  } catch (err) {
    showToast(err.message || "Could not submit report.");
  } finally {
    submitBtn.disabled = false;
    progressBox.hidden = true;
  }
}

// =========================================================
// LANGUAGE (EN / HI), NAVIGATION & GLOBAL EVENTS
// =========================================================

const UI_TRANSLATIONS = {
  en: {
    titles: {
      overview: "City overview",
      explore: "City map",
      reports: "Issue reports",
      impact: "Analytics & impact",
      admin: "Admin console",
    },
    nav: {
      overview: "Overview",
      explore: "City Map",
      reports: "Issue Reports",
      impact: "Analytics & Impact",
      admin: "Admin Console",
    },
    reportBtn: "+ Report an issue",
    reportBtn2: "+ New report",
    stats: ["Open issues", "Resolved", "High & critical", "Resolution rate"],
    modalTitle: "Report a civic issue",
    submitBtn: "Submit issue report",
    pinToggle: "Drop pin on map",
    pinToggleHide: "Hide pin map",
    langToggle: "हिन्दी",
  },
  hi: {
    titles: {
      overview: "शहर अवलोकन",
      explore: "जयपुर सिटी मैप",
      reports: "नागरिक शिकायतें",
      impact: "विश्लेषण और प्रभाव",
      admin: "एडमिन कंसोल",
    },
    nav: {
      overview: "अवलोकन",
      explore: "सिटी मैप",
      reports: "शिकायत रिपोर्ट",
      impact: "विश्लेषण",
      admin: "एडमिन कंसोल",
    },
    reportBtn: "+ समस्या दर्ज करें",
    reportBtn2: "+ नई शिकायत",
    stats: ["खुली समस्याएँ", "समाधान हो चुके", "उच्च एवं गंभीर", "समाधान दर"],
    modalTitle: "नागरिक समस्या दर्ज करें",
    submitBtn: "शिकायत सबमिट करें",
    pinToggle: "मैप पर पिन लगाएँ",
    pinToggleHide: "पिन मैप छिपाएँ",
    langToggle: "English",
  },
};

function applyLanguage(lang) {
  currentLang = lang === "hi" ? "hi" : "en";
  localStorage.setItem(STORAGE_LANG, currentLang);
  document.documentElement.lang = currentLang;
  const copy = UI_TRANSLATIONS[currentLang];

  $$(".nav-item").forEach((btn) => {
    const labelSpan = btn.querySelector("span:not(.nav-icon)");
    const key = btn.dataset.view;
    if (labelSpan && copy.nav[key]) labelSpan.textContent = copy.nav[key];
  });

  if ($("#page-title")) $("#page-title").textContent = copy.titles[currentView] || copy.titles.overview;
  if ($("#open-report")) $("#open-report").textContent = copy.reportBtn;
  if ($("#open-report-2")) $("#open-report-2").textContent = copy.reportBtn2;
  if ($("#report-modal-title")) $("#report-modal-title").textContent = copy.modalTitle;
  if ($("#submit-report-btn")) $("#submit-report-btn").textContent = copy.submitBtn;
  if ($("#lang-toggle")) $("#lang-toggle").textContent = copy.langToggle;

  $$("#view-overview .stat-label").forEach((el, idx) => {
    if (copy.stats[idx]) el.textContent = copy.stats[idx];
  });

  const pinToggle = $("#toggle-pin-map");
  const pinWrap = $("#report-pin-map-wrap");
  if (pinToggle && pinWrap) {
    pinToggle.textContent = pinWrap.hidden ? copy.pinToggle : copy.pinToggleHide;
  }
}

function navigate(view) {
  const validViews = ["overview", "explore", "reports", "impact", "admin"];
  const target = validViews.includes(view) ? view : "overview";
  currentView = target;

  $$(".view").forEach((sec) => {
    sec.classList.toggle("active", sec.id === `view-${target}`);
  });
  $$(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === target);
  });

  const copy = UI_TRANSLATIONS[currentLang] || UI_TRANSLATIONS.en;
  $("#page-title").textContent = copy.titles[target] || "Command center";

  // Close mobile sidebar
  $("#sidebar")?.classList.remove("open");
  $("#sidebar-overlay")?.classList.remove("open");

  if (target === "overview" && miniMap) {
    setTimeout(() => miniMap.invalidateSize(), 150);
  }
  if (target === "explore") {
    if (fullMap && currentMapMode !== "streetview") {
      setTimeout(() => fullMap.invalidateSize(), 150);
    }
    if (currentMapMode !== "2d") {
      syncStreetViewEngineUI();
      if (streetViewState.engine === "osm3d" && streetViewState.osmMap) {
        setTimeout(() => streetViewState.osmMap.resize(), 150);
      }
    }
  } else if (window.CityFixStreet3D?.isInitialized) {
    window.CityFixStreet3D.setPaused(true);
  }
}

function renderEverything() {
  renderStats();
  renderPriorityList();
  renderRecentActivity();
  renderAnalytics();
  renderTable();
  renderMaps();
  renderAdminConsole();
}

function bindEvents() {
  // Navigation
  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.view));
  });
  $$("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.goto));
  });

  // Mobile sidebar
  $("#mobile-menu-btn")?.addEventListener("click", () => {
    $("#sidebar")?.classList.add("open");
    $("#sidebar-overlay")?.classList.add("open");
  });
  $("#sidebar-close")?.addEventListener("click", () => {
    $("#sidebar")?.classList.remove("open");
    $("#sidebar-overlay")?.classList.remove("open");
  });
  $("#sidebar-overlay")?.addEventListener("click", () => {
    $("#sidebar")?.classList.remove("open");
    $("#sidebar-overlay")?.classList.remove("open");
  });

  // Delegated inspect click for cards & table rows
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-inspect]");
    if (target && !e.target.closest("[data-status]")) {
      openIssueDrawer(target.dataset.inspect);
    }
  });

  // Modals & Drawers
  $("#open-report")?.addEventListener("click", () => openReportModal());
  $("#open-report-2")?.addEventListener("click", () => openReportModal());
  $("#close-modal")?.addEventListener("click", closeReportModal);
  $("#report-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "report-modal") closeReportModal();
  });

  $("#close-drawer")?.addEventListener("click", closeIssueDrawer);
  $("#issue-drawer-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "issue-drawer-backdrop") closeIssueDrawer();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("#report-modal")?.classList.contains("open")) closeReportModal();
    if ($("#issue-drawer-backdrop")?.classList.contains("open")) closeIssueDrawer();
    if ($("#auth-modal")?.classList.contains("open")) {
      $("#auth-modal").classList.remove("open");
      $("#auth-modal").setAttribute("aria-hidden", "true");
    }
  });

  $("#confirmed-track-btn")?.addEventListener("click", () => {
    closeReportModal();
    navigate("reports");
    if (lastConfirmedReportId) openIssueDrawer(lastConfirmedReportId);
  });
  $("#confirmed-new-btn")?.addEventListener("click", () => {
    openReportModal();
  });

  // Report Form interactions
  $("#report-form")?.addEventListener("submit", submitReport);
  $("#issue-photo")?.addEventListener("change", previewPhoto);
  $("#ai-classify-photo")?.addEventListener("click", handlePhotoAiAnalysis);
  $("#ai-classify-text")?.addEventListener("click", handleTextAiAnalysis);
  $("#issue-title")?.addEventListener("input", runLocalRuleTriage);
  $("#issue-description")?.addEventListener("input", runLocalRuleTriage);
  $("#issue-safety")?.addEventListener("change", runLocalRuleTriage);

  $$(".quick-loc-btn:not(#toggle-pin-map)").forEach((btn) => {
    btn.addEventListener("click", () => {
      setReportPinCoords(btn.dataset.lat, btn.dataset.lon, { label: btn.dataset.loc });
      runLocalRuleTriage();
    });
  });

  $("#toggle-pin-map")?.addEventListener("click", () => {
    const wrap = $("#report-pin-map-wrap");
    const btn = $("#toggle-pin-map");
    if (!wrap || !btn) return;
    const willShow = wrap.hidden;
    wrap.hidden = !willShow;
    btn.setAttribute("aria-expanded", String(willShow));
    btn.classList.toggle("active", willShow);
    const copy = UI_TRANSLATIONS[currentLang] || UI_TRANSLATIONS.en;
    btn.textContent = willShow ? copy.pinToggleHide : copy.pinToggle;
    if (willShow) {
      ensureReportPinMap();
      requestAnimationFrame(() => {
        setTimeout(() => reportPinMap?.invalidateSize(true), 120);
      });
    }
  });

  $("#duplicate-alert")?.addEventListener("click", (e) => {
    const dupBtn = e.target.closest("[data-confirm-duplicate]");
    if (!dupBtn) return;
    const targetId = dupBtn.dataset.confirmDuplicate;
    toggleReportConfirmation(targetId, { forceAdd: true });
    closeReportModal();
    navigate("reports");
    openIssueDrawer(targetId);
  });

  $("#lang-toggle")?.addEventListener("click", () => {
    applyLanguage(currentLang === "en" ? "hi" : "en");
    renderEverything();
    showToast(currentLang === "hi" ? "हिन्दी भाषा सक्रिय" : "Switched to English");
  });

  $("#use-location")?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast("Geolocation is unavailable in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setReportPinCoords(pos.coords.latitude, pos.coords.longitude, { updateInputIfEmpty: true });
        showToast("Device coordinates attached with your consent.");
      },
      () => showToast("Location permission declined. Use a district button or type a neighbourhood."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

  // Reports filters & tracking
  ["#search-reports", "#status-filter", "#category-filter", "#severity-filter"].forEach((sel) => {
    $(sel)?.addEventListener("input", renderTable);
    $(sel)?.addEventListener("change", renderTable);
  });
  $("#reset-filters-btn")?.addEventListener("click", () => {
    $("#search-reports").value = "";
    $("#status-filter").value = "all";
    $("#category-filter").value = "all";
    $("#severity-filter").value = "all";
    renderTable();
  });
  $("#track-ref-btn")?.addEventListener("click", () => {
    const ref = ($("#track-ref-input")?.value || "").trim();
    if (!ref) {
      showToast("Enter a report reference ID such as CF-1024.");
      return;
    }
    openIssueDrawer(ref);
  });

  // Map filters, 2D / 3D Street View mode & Layer Control Panel
  $$("[data-mapmode]").forEach((btn) => {
    btn.addEventListener("click", () => setMapDisplayMode(btn.dataset.mapmode));
  });

  $$("[data-sv-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      loadStreetViewAtLocation({
        lat: Number(btn.dataset.lat),
        lng: Number(btn.dataset.lon),
        title: btn.dataset.svPreset,
        label: "JAIPUR STREET PRESET",
        reportId: null,
      });
    });
  });

  $("#streetview-engine-toggle")?.addEventListener("click", () => {
    if (streetViewState.engine === "procedural") {
      streetViewState.manualProcedural = false;
      loadStreetViewAtLocation(streetViewState.activeTarget);
    } else {
      streetViewState.manualProcedural = true;
      activateProceduralStreetView(streetViewState.activeTarget);
    }
  });

  $("#streetview-step-fwd")?.addEventListener("click", () => {
    if (streetViewState.engine === "procedural") {
      window.CityFixStreet3D?.moveAlongStreet(7);
      return;
    }
    const map = streetViewState.osmMap;
    if (!map) return;
    const c = map.getCenter();
    const rad = (map.getBearing() * Math.PI) / 180;
    const stepDeg = 0.00045;
    map.easeTo({
      center: [c.lng + Math.sin(rad) * stepDeg, c.lat + Math.cos(rad) * stepDeg],
      duration: 280,
    });
  });

  $("#streetview-step-back")?.addEventListener("click", () => {
    if (streetViewState.engine === "procedural") {
      window.CityFixStreet3D?.moveAlongStreet(-7);
      return;
    }
    const map = streetViewState.osmMap;
    if (!map) return;
    const c = map.getCenter();
    const rad = (map.getBearing() * Math.PI) / 180;
    const stepDeg = 0.00045;
    map.easeTo({
      center: [c.lng - Math.sin(rad) * stepDeg, c.lat - Math.cos(rad) * stepDeg],
      duration: 280,
    });
  });

  $("#streetview-step-left")?.addEventListener("click", () => {
    if (streetViewState.engine === "procedural") {
      window.CityFixStreet3D?.turn(-32);
      return;
    }
    const map = streetViewState.osmMap;
    if (map) map.easeTo({ bearing: map.getBearing() - 35, duration: 280 });
  });

  $("#streetview-step-right")?.addEventListener("click", () => {
    if (streetViewState.engine === "procedural") {
      window.CityFixStreet3D?.turn(32);
      return;
    }
    const map = streetViewState.osmMap;
    if (map) map.easeTo({ bearing: map.getBearing() + 35, duration: 280 });
  });

  $("#streetview-recenter")?.addEventListener("click", () => {
    if (streetViewState.engine === "procedural") {
      window.CityFixStreet3D?.recenterOnIssue();
      return;
    }
    if (!streetViewState.osmMap) return;
    streetViewState.osmMap.flyTo({
      center: [streetViewState.activeTarget.lng, streetViewState.activeTarget.lat],
      zoom: 17.9,
      pitch: 74,
      bearing: 20,
      duration: 700,
    });
  });

  $("#streetview-fallback-twin")?.addEventListener("click", () => {
    streetViewState.manualProcedural = true;
    activateProceduralStreetView(streetViewState.activeTarget);
  });

  $("#streetview-fallback-2d")?.addEventListener("click", () => {
    setMapDisplayMode("2d");
  });

  document.addEventListener("click", (e) => {
    const svBtn = e.target.closest("[data-open-streetview]");
    if (svBtn) {
      e.stopPropagation();
      const report = reports.find((r) => r.id === svBtn.dataset.openStreetview);
      if (report) openStreetViewForReport(report, { ensureVisibleMode: true });
    }
  });

  $("#map-hotspot-toggle")?.addEventListener("click", () => {
    showHotspots = !showHotspots;
    renderHotspotRings(getFilteredMapReports());
    showToast(showHotspots ? "Map hotspot density rings enabled" : "Map hotspot density rings hidden");
  });

  $$("[data-mapfilter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("[data-mapfilter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentMapFilter = btn.dataset.mapfilter;
      renderMaps();
    });
  });
  $("#map-search")?.addEventListener("input", renderMaps);

  $$("[data-layer-solo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.layerSolo;
      MAP_LAYER_CATEGORIES.forEach(({ key }) => {
        activeMapLayers[key] = target === "all" ? true : key === target;
      });
      renderMaps();
    });
  });
  $("#map-layers-reset")?.addEventListener("click", () => {
    MAP_LAYER_CATEGORIES.forEach(({ key }) => {
      activeMapLayers[key] = true;
    });
    renderMaps();
  });

  // Admin & Export
  $("#admin-toggle")?.addEventListener("click", () => {
    demoAdminMode = !demoAdminMode;
    renderEverything();
    updateEnvironmentUI();
    showToast(demoAdminMode ? "Demo admin preview enabled (local only)" : "Demo admin preview disabled");
  });

  $("#admin-after-photo")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    adminAfterPhotoDataUrl = null;
    if (!file) {
      if ($("#admin-after-photo-preview")) $("#admin-after-photo-preview").innerHTML = "";
      if ($("#admin-after-photo-clear")) $("#admin-after-photo-clear").hidden = true;
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      showToast("Resolution proof photo must be JPEG, PNG, or WebP under 5 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      if (isSafeImageUrl(res)) {
        adminAfterPhotoDataUrl = res;
        if ($("#admin-after-photo-preview")) {
          $("#admin-after-photo-preview").innerHTML = `<img src="${res}" alt="Resolution proof preview" />`;
        }
        if ($("#admin-after-photo-clear")) $("#admin-after-photo-clear").hidden = false;
      }
    };
    reader.readAsDataURL(file);
  });

  $("#admin-after-photo-clear")?.addEventListener("click", () => {
    adminAfterPhotoDataUrl = null;
    if ($("#admin-after-photo")) $("#admin-after-photo").value = "";
    if ($("#admin-after-photo-preview")) $("#admin-after-photo-preview").innerHTML = "";
    if ($("#admin-after-photo-clear")) $("#admin-after-photo-clear").hidden = true;
  });

  $("#export-csv")?.addEventListener("click", () => exportReports("csv"));
  $("#export-json")?.addEventListener("click", () => exportReports("json"));

  // Cloud Sign-in Modal (replaces window.prompt)
  $("#cloud-auth")?.addEventListener("click", async () => {
    if (!cloudState.configured) {
      showToast("Add Supabase URL and publishable key in supabase/config.js.");
      return;
    }
    if (cloudState.session?.user) {
      try {
        await window.CityFixCloud.signOut();
        cloudState.session = null;
        cloudState.profile = null;
        cloudState.isAdmin = false;
        updateEnvironmentUI();
        renderAdminConsole();
        showToast("Signed out of CityFix cloud.");
      } catch (err) {
        showToast(err.message || "Sign out failed.");
      }
      return;
    }
    $("#auth-status-msg").textContent = "";
    $("#auth-modal").classList.add("open");
    $("#auth-modal").setAttribute("aria-hidden", "false");
    $("#auth-email").focus();
  });

  $("#close-auth-modal")?.addEventListener("click", () => {
    $("#auth-modal").classList.remove("open");
    $("#auth-modal").setAttribute("aria-hidden", "true");
  });

  $("#auth-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = ($("#auth-email").value || "").trim();
    if (!email) return;
    const btn = $("#auth-submit-btn");
    btn.disabled = true;
    btn.textContent = "Sending link…";
    try {
      await window.CityFixCloud.signIn(email);
      $("#auth-status-msg").textContent = "Check your inbox for the Supabase magic sign-in link.";
      showToast("Magic sign-in link sent.");
    } catch (err) {
      $("#auth-status-msg").textContent = err.message || "Could not send sign-in link.";
    } finally {
      btn.disabled = false;
      btn.textContent = "Send sign-in link";
    }
  });
}

// =========================================================
// INITIALIZATION
// =========================================================

async function bootstrapCloud() {
  if (!cloudState.configured) {
    updateEnvironmentUI();
    return;
  }

  try {
    const [session, cloudIssues] = await Promise.all([
      window.CityFixCloud.getSession(),
      window.CityFixCloud.loadIssues(),
    ]);

    cloudState.session = session;
    cloudState.cloudLoaded = true;

    if (Array.isArray(cloudIssues) && cloudIssues.length > 0) {
      reports = cloudIssues;
    }

    if (session?.user) {
      const [profile, adminFlag, events] = await Promise.all([
        window.CityFixCloud.getUserProfile(),
        window.CityFixCloud.isAdmin(),
        window.CityFixCloud.loadIssueEvents().catch(() => []),
      ]);
      cloudState.profile = profile;
      cloudState.isAdmin = adminFlag;
      cloudState.cloudEvents = events;
    }

    updateEnvironmentUI();
    renderEverything();
  } catch (err) {
    console.warn("Supabase cloud load unavailable; retaining local demo workspace:", err?.message || err);
    cloudState.cloudLoaded = false;
    updateEnvironmentUI();
  }
}

function handleHashRoute() {
  const raw = (window.location.hash || "").replace(/^#/, "");
  if (!raw) return;
  if (raw === "report") {
    openReportModal();
    return;
  }
  if (raw.toLowerCase().startsWith("track=")) {
    const refId = decodeURIComponent(raw.slice(6)).trim();
    if (refId) {
      navigate("reports");
      if ($("#track-ref-input")) $("#track-ref-input").value = refId;
      openIssueDrawer(refId);
    }
    return;
  }
  if (["overview", "explore", "reports", "impact", "admin"].includes(raw)) {
    navigate(raw);
  }
}

function startCityFix() {
  bindEvents();
  applyLanguage(currentLang);
  renderEverything();

  miniMap = initializeMap("#mini-map", [26.9124, 75.7873], 11);
  fullMap = initializeMap("#full-map", [26.9124, 75.7873], 12);
  renderMaps();

  checkServerCapabilities();
  bootstrapCloud();

  window.addEventListener("hashchange", handleHashRoute);
  handleHashRoute();
}

startCityFix();
