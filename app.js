
"use strict";

// ==========================================
// CITYFIX AI — COMPLETE APPLICATION ENGINE
// ==========================================

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_REPORTS = "cityfix_reports";
const STORAGE_POINTS = "cityfix_points";

const SEED_REPORTS = [
  {
    id: "CF-1024",
    title: "Deep pothole near bus stop",
    category: "Road damage",
    location: "Jhotwara, Jaipur",
    priority: "Critical",
    status: "Open",
    date: "Today",
    lat: 26.941,
    lon: 75.746,
    description: "Large pothole creating a road safety risk."
  },
  {
    id: "CF-1023",
    title: "Garbage overflowing",
    category: "Garbage",
    location: "Vaishali Nagar, Jaipur",
    priority: "High",
    status: "In progress",
    date: "Today",
    lat: 26.912,
    lon: 75.739,
    description: "Waste overflowing from public bin."
  },
  {
    id: "CF-1022",
    title: "Streetlight not working",
    category: "Streetlight",
    location: "Mansarovar, Jaipur",
    priority: "Normal",
    status: "Open",
    date: "Yesterday",
    lat: 26.854,
    lon: 75.764,
    description: "Streetlight is not working after dark."
  },
  {
    id: "CF-1021",
    title: "Waterlogging after rain",
    category: "Waterlogging",
    location: "Malviya Nagar, Jaipur",
    priority: "High",
    status: "Resolved",
    date: "Yesterday",
    lat: 26.854,
    lon: 75.805,
    description: "Water collected near the crossing."
  }
];

let reports = loadReports();
let points = Number(localStorage.getItem(STORAGE_POINTS) || 120);
let adminMode = false;

let miniMap = null;
let fullMap = null;

const mapMarkers = {
  mini: [],
  full: []
};

let currentMapFilter = "all";

// ==========================================
// STORAGE
// ==========================================

function loadReports() {
  try {
    const saved = localStorage.getItem(STORAGE_REPORTS);
    return saved ? JSON.parse(saved) : structuredClone(SEED_REPORTS);
  } catch (error) {
    console.error("Storage error:", error);
    return structuredClone(SEED_REPORTS);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_REPORTS, JSON.stringify(reports));
  localStorage.setItem(STORAGE_POINTS, String(points));
}

// ==========================================
// UTILITIES
// ==========================================

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function priorityRank(priority) {
  return {
    Critical: 3,
    High: 2,
    Normal: 1
  }[priority] || 0;
}

function categoryIcon(category) {
  return {
    "Road damage": "⌁",
    "Garbage": "♲",
    "Waterlogging": "≈",
    "Streetlight": "☼",
    "Other": "◇"
  }[category] || "◇";
}

function statusClass(status) {
  if (status === "Resolved") return "resolved";
  if (status === "In progress") return "progress";
  return "";
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// ==========================================
// DASHBOARD STATISTICS
// ==========================================

function renderStats() {
  const open = reports.filter(r => r.status !== "Resolved").length;
  const resolved = reports.filter(r => r.status === "Resolved").length;

  const highPriority = reports.filter(r =>
    r.status !== "Resolved" &&
    priorityRank(r.priority) >= 2
  ).length;

  $("#stat-open").textContent = open;
  $("#stat-resolved").textContent = resolved;
  $("#stat-priority").textContent = highPriority;
  $("#stat-points").textContent = points;
  $("#impact-points").innerHTML =
    `${points}<span> pts</span>`;

  $("#nav-count").textContent = reports.length;

  const userReports = reports.filter(r =>
    !SEED_REPORTS.some(seed => seed.id === r.id)
  ).length;

  $("#milestone-three").textContent =
    userReports >= 3 ? "Unlocked" : "In progress";

  $("#milestone-five").textContent =
    userReports >= 5 ? "Unlocked" : "In progress";
}

// ==========================================
// PRIORITY LIST
// ==========================================

function renderPriorityList() {
  const sorted = [...reports]
    .filter(r => r.status !== "Resolved")
    .sort((a, b) =>
      priorityRank(b.priority) - priorityRank(a.priority)
    );

  $("#priority-list").innerHTML = sorted.length
    ? sorted.slice(0, 5).map(r => `
      <div class="priority-item">
        <div class="priority-symbol">
          ${categoryIcon(r.category)}
        </div>
        <div class="priority-copy">
          <b>${escapeHTML(r.title)}</b>
          <small>${escapeHTML(r.location)} · ${r.id}</small>
        </div>
        <span class="priority-score">${r.priority}</span>
      </div>
    `).join("")
    : '<p class="muted">No open issues. Great work!</p>';
}

// ==========================================
// RECENT ACTIVITY
// ==========================================

function renderRecentActivity() {
  $("#recent-list").innerHTML = [...reports]
    .slice(0, 5)
    .map(r => `
      <div class="recent-row">
        <div class="recent-icon">
          ${categoryIcon(r.category)}
        </div>
        <div class="recent-copy">
          <b>${escapeHTML(r.title)}</b>
          <small>${escapeHTML(r.location)} · ${r.date}</small>
        </div>
        <span class="status ${statusClass(r.status)}">
          ${r.status}
        </span>
      </div>
    `).join("");
}

// ==========================================
// REPORT TABLE
// ==========================================

function renderTable() {
  const search = $("#search-reports").value.toLowerCase();
  const status = $("#status-filter").value;
  const category = $("#category-filter").value;

  const filtered = reports.filter(r => {
    const matchesSearch = [
      r.title, r.location, r.id, r.category
    ].join(" ").toLowerCase().includes(search);

    return matchesSearch &&
      (status === "all" || r.status === status) &&
      (category === "all" || r.category === category);
  });

  $("#reports-body").innerHTML = filtered.map(r => `
    <tr>
      <td>
        <b>${escapeHTML(r.title)}</b><br>
        <span class="id-label">${r.id}</span>
      </td>
      <td>${escapeHTML(r.location)}</td>
      <td>${escapeHTML(r.category)}</td>
      <td>
        <span class="priority-pill ${
          r.priority === "Normal" ? "normal" : ""
        }">${r.priority}</span>
      </td>
      <td>
        <span class="status ${statusClass(r.status)}">
          ${r.status}
        </span>
      </td>
      <td>${r.date}</td>
      <td>
        ${adminMode
          ? `<button class="row-action"
               data-status="${r.id}">
               Update status
             </button>`
          : "—"}
      </td>
    </tr>
  `).join("");

  $("#empty-state").hidden = filtered.length > 0;

  $$("[data-status]").forEach(button => {
    button.onclick = () => updateStatus(button.dataset.status);
  });
}

// ==========================================
// MAP ENGINE — FIXED
// ==========================================

function initializeMap(selector, center, zoom) {
  const element = $(selector);

  if (!element) {
    console.warn("Map element missing:", selector);
    return null;
  }

  if (!window.L) {
    console.warn("Leaflet library unavailable.");
    element.innerHTML =
      '<div style="padding:20px;color:#fff">Map library unavailable. Check internet connection.</div>';
    return null;
  }

  // IMPORTANT: Leaflet needs the actual DOM element,
  // not a CSS selector string.
  const map = L.map(element, {
    scrollWheelZoom: false
  }).setView(center, zoom);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19
    }
  ).addTo(map);

  return map;
}

function clearMarkers(mapType) {
  mapMarkers[mapType].forEach(marker => marker.remove());
  mapMarkers[mapType] = [];
}

function drawMarkers(map, mapType) {
  if (!map || !window.L) return;

  clearMarkers(mapType);

  const filtered = reports.filter(r => {
    if (currentMapFilter === "open") {
      return r.status !== "Resolved";
    }

    if (currentMapFilter === "resolved") {
      return r.status === "Resolved";
    }

    return true;
  });

  filtered.forEach(report => {
    if (!Number.isFinite(report.lat) || !Number.isFinite(report.lon)) return;
    const color =
      report.status === "Resolved"
        ? "#34d399"
        : priorityRank(report.priority) >= 2
          ? "#fb7185"
          : "#fbbf24";

    const marker = L.circleMarker(
      [report.lat, report.lon],
      {
        radius: 9,
        color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2
      }
    ).addTo(map);

    marker.bindPopup(`
      <strong>${escapeHTML(report.title)}</strong>
      <br>${escapeHTML(report.location)}
      <br><small>${report.priority} · ${report.status}</small>
    `);

    mapMarkers[mapType].push(marker);
  });

  if (mapType === "full") {
    $("#map-total").textContent =
      `${filtered.length} reports displayed`;
  }
}

function renderMaps() {
  drawMarkers(miniMap, "mini");
  drawMarkers(fullMap, "full");
}

function initializeMaps() {
  if (!window.L) {
    console.error("Leaflet not loaded.");
    return;
  }

  miniMap = initializeMap(
    "#mini-map",
    [26.9124, 75.7873],
    11
  );

  fullMap = initializeMap(
    "#full-map",
    [26.9124, 75.7873],
    12
  );

  renderMaps();
}

// ==========================================
// NAVIGATION
// ==========================================

function navigate(view) {
  $$(".view").forEach(section => {
    section.classList.toggle(
      "active",
      section.id === `view-${view}`
    );
  });

  $$(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === view
    );
  });

  const titles = {
    overview: "City overview",
    explore: "City map",
    reports: "Issue reports",
    impact: "Community impact"
  };

  $("#page-title").textContent =
    titles[view] || "CityFix AI";

  // Leaflet must recalculate dimensions after
  // a previously hidden map becomes visible.
  setTimeout(() => {
    if (view === "overview" && miniMap) {
      miniMap.invalidateSize();
    }

    if (view === "explore" && fullMap) {
      fullMap.invalidateSize();
    }
  }, 150);
}

// ==========================================
// REPORT PRIORITY ENGINE
// ==========================================

function classifyIssue() {
  const text = (
    $("#issue-title").value + " " +
    $("#issue-description").value
  ).toLowerCase();

  const safety = $("#issue-safety").value;

  let priority =
    safety === "Critical" ? "Critical" :
    safety === "High" ? "High" :
    "Normal";

  let reason = "Normal issue description.";

  if (/accident|danger|injur|live wire|collapse|deep pothole/.test(text)) {
    priority = "Critical";
    reason = "Potential safety risk detected.";
  } else if (/block|overflow|dark|waterlog|garbage|broken|pothole|flood/.test(text)) {
    if (priority === "Normal") priority = "High";
    reason = "Infrastructure disruption detected.";
  } else if (safety !== "Normal") {
    reason = "Safety impact selected by reporter.";
  }

  $("#ai-result").innerHTML = `
    <span>✦</span>
    <div>
      <b>Suggested priority: ${priority}</b>
      <small>
        ${reason}
        Rule-based prototype suggestion.
        Human review required. This is not a trained AI model.
      </small>
    </div>
  `;

  return priority;
}

// ==========================================
// REPORT MODAL
// ==========================================

function openModal() {
  $("#report-modal").classList.add("open");
  $("#report-modal").setAttribute("aria-hidden", "false");
}

function closeModal() {
  $("#report-modal").classList.remove("open");
  $("#report-modal").setAttribute("aria-hidden", "true");
}

async function updateStatus(id) {
  const report = reports.find(r => r.id === id);
  if (!report) return;

  const nextStatus =
    report.status === "Open" ? "In progress" :
    report.status === "In progress" ? "Resolved" : "Open";

  if (window.CityFixCloud?.isConfigured && report.dbId) {
    try {
      await window.CityFixCloud.updateIssueStatus(report.dbId, nextStatus);
    } catch (error) {
      showToast(error.message || "Could not update cloud report.");
      return;
    }
  }

  report.status = nextStatus;
  saveData();
  renderEverything();

  showToast(`${id} updated to ${report.status}`);
}

// ==========================================
// SUBMIT REPORT
// ==========================================

async function submitReport(event) {
  event.preventDefault();

  const title = $("#issue-title").value.trim();
  const location = $("#issue-location").value.trim();

  if (!title || !location) {
    showToast("Please complete required fields.");
    return;
  }

  const priority = classifyIssue();
  const category = $("#issue-category").value;

  const nextNumber = Math.max(
    1024,
    ...reports.map(r =>
      Number(r.id.replace("CF-", "")) || 0
    )
  ) + 1;

  const chosenLat = $("#issue-lat")?.value ? Number($("#issue-lat").value) : null;
  const chosenLon = $("#issue-lon")?.value ? Number($("#issue-lon").value) : null;

  const report = {
    id: `CF-${nextNumber}`,
    title,
    category,
    location,
    priority,
    status: "Open",
    date: "Just now",
    lat: chosenLat,
    lon: chosenLon,
    description: $("#issue-description").value.trim()
  };

  if (window.CityFixCloud?.isConfigured) {
    try {
      const photo = $("#issue-photo").files[0] || null;
      const savedReport = await window.CityFixCloud.createIssue(report, photo);
      reports.unshift(savedReport);
      renderEverything();
      closeModal();
      event.target.reset();
      $("#photo-preview").innerHTML = "";
      showToast("Report saved to shared CityFix cloud.");
      navigate("reports");
      return;
    } catch (error) {
      showToast(error.message || "Cloud submission failed.");
      return;
    }
  }

  reports.unshift(report);
  points += 30;
  saveData();
  renderEverything();
  closeModal();
  event.target.reset();
  $("#photo-preview").innerHTML = "";
  showToast("Demo report saved locally · +30 points");
  navigate("reports");
}

// ==========================================
// PHOTO PREVIEW
// ==========================================

function previewPhoto(event) {
  const file = event.target.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Please select an image file.");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    $("#photo-preview").innerHTML = `
      <img
        src="${reader.result}"
        alt="Selected issue photo preview"
      >
    `;
  };

  reader.readAsDataURL(file);
}

// ==========================================
// RENDER EVERYTHING
// ==========================================

function renderEverything() {
  renderStats();
  renderPriorityList();
  renderRecentActivity();
  renderTable();
  renderMaps();
}

// ==========================================
// EVENT LISTENERS
// ==========================================

function bindEvents() {
  $("#open-report").onclick = openModal;
  $("#open-report-2").onclick = openModal;
  $("#close-modal").onclick = closeModal;

  $("#report-modal").onclick = event => {
    if (event.target.id === "report-modal") {
      closeModal();
    }
  };

  $("#report-form").addEventListener(
    "submit",
    submitReport
  );

  $("#issue-title").addEventListener(
    "input",
    classifyIssue
  );

  $("#issue-description").addEventListener(
    "input",
    classifyIssue
  );

  $("#issue-safety").addEventListener(
    "change",
    classifyIssue
  );

  $("#issue-photo").addEventListener(
    "change",
    previewPhoto
  );

  $("#use-location")?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast("This browser does not support location sharing.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        $("#issue-lat").value = position.coords.latitude;
        $("#issue-lon").value = position.coords.longitude;
        showToast("Location added after your permission.");
      },
      () => showToast("Location was not shared. You can still enter a neighbourhood."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

  $("#ai-classify-photo")?.addEventListener("click", async () => {
    const file = $("#issue-photo").files[0];
    if (!file) { showToast("Choose a photo first."); return; }
    if (!window.CityFixCloud?.isConfigured) {
      showToast("Connect Supabase and deploy the AI function first.");
      return;
    }
    const button = $("#ai-classify-photo");
    button.disabled = true;
    button.textContent = "Analysing photo…";
    try {
      const result = await window.CityFixCloud.classifyPhoto(file);
      const categories = {
        road_damage: "Road damage", garbage: "Garbage",
        waterlogging: "Waterlogging", streetlight: "Streetlight", other: "Other"
      };
      $("#issue-category").value = categories[result.category] || "Other";
      $("#issue-safety").value =
        result.priority === "critical" ? "Critical" :
        result.priority === "high" ? "High" : "Normal";
      if (!$("#issue-description").value.trim() && result.summary) {
        $("#issue-description").value = result.summary;
      }
      $("#ai-result").innerHTML = `
        <span>✦</span><div>
          <b>AI suggestion: ${result.priority} · ${Math.round((result.confidence || 0)*100)}% confidence</b>
          <small>${escapeHTML(result.summary || "Image analysed.")} Human review required. ${escapeHTML(result.safety_reason || "")}</small>
        </div>`;
      showToast("AI photo suggestion ready. Review before submitting.");
    } catch (error) {
      showToast(error.message || "AI image analysis failed.");
    } finally {
      button.disabled = false;
      button.textContent = "✦ Analyse photo with AI";
    }
  });

  $("#admin-toggle").onclick = async () => {
    if (window.CityFixCloud?.isConfigured && !(await window.CityFixCloud.isAdmin())) {
      showToast("Cloud admin mode is restricted to an authorised account.");
      return;
    }
    adminMode = !adminMode;

    $("#admin-toggle").innerHTML =
      `⚙ <span>Admin mode: ${adminMode ? "on" : "off"}</span>`;

    renderTable();

    showToast(
      adminMode
        ? "Demo admin controls enabled"
        : "Admin controls disabled"
    );
  };

  $$(".nav-item").forEach(button => {
    button.onclick = () => navigate(button.dataset.view);
  });

  $$("[data-goto]").forEach(button => {
    button.onclick = () => navigate(button.dataset.goto);
  });

  ["#search-reports", "#status-filter", "#category-filter"]
    .forEach(selector => {
      $(selector).addEventListener("input", renderTable);
    });

  $$("[data-mapfilter]").forEach(button => {
    button.onclick = () => {
      $$("[data-mapfilter]").forEach(item =>
        item.classList.remove("active")
      );

      button.classList.add("active");
      currentMapFilter = button.dataset.mapfilter;

      renderMaps();
    };
  });
}

// ==========================================
// APPLICATION START
// ==========================================

function startCityFix() {
  console.log("CITYFIX AI initializing...");

  bindEvents();

  // Render data BEFORE map initialization.
  // A map failure should never stop the dashboard.
  renderEverything();

  initializeMaps();

  console.log("CITYFIX AI ready.");
  console.log("Reports loaded:", reports.length);
}

startCityFix();

const cloudButton = $("#cloud-auth");
if (cloudButton) {
  cloudButton.onclick = async () => {
    if (!window.CityFixCloud?.isConfigured) {
      showToast("Add Supabase URL and publishable key in supabase/config.js.");
      return;
    }
    try {
      const session = await window.CityFixCloud.getSession();
      if (session?.user) {
        await window.CityFixCloud.signOut();
        cloudButton.innerHTML = "☁ <span>Cloud sign in</span>";
        showToast("Signed out of CityFix cloud.");
      } else {
        const email = prompt("Enter your email to receive a secure sign-in link:");
        if (!email) return;
        await window.CityFixCloud.signIn(email.trim());
        showToast("Check your email for the secure sign-in link.");
      }
    } catch (error) {
      showToast(error.message || "Cloud sign-in failed.");
    }
  };
}

if (window.CityFixCloud?.isConfigured) {
  window.CityFixCloud.getSession().then(session => {
    if (session?.user && cloudButton) cloudButton.innerHTML = "☁ <span>Cloud connected</span>";
  }).catch(console.warn);

  window.CityFixCloud.loadIssues().then(cloudReports => {
    reports = cloudReports || [];
    renderEverything();
    showToast("Shared CityFix reports loaded.");
  }).catch(error => {
    console.warn("Cloud load failed; local demo remains available.", error);
  });
}
