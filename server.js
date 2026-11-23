const express = require("express");
const path = require("path");
const { GoogleGenAI, Type } = require("@google/genai");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const ROOT_DIR = __dirname;
const GEMINI_MODEL = "gemini-4-hydrogen";

const ALLOWED_CATEGORIES = [
  "road_damage",
  "garbage",
  "waterlogging",
  "streetlight",
  "other",
];
const ALLOWED_PRIORITIES = ["normal", "high", "critical"];
const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BASE64_LENGTH = 7_000_000; // ~5 MB binary

app.disable("x-powered-by");

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(express.json({ limit: "8mb" }));

// Prevent serving server source, package manifests, or raw SQL/Deno edge source
app.use((req, res, next) => {
  const normalized = req.path.toLowerCase();
  if (
    normalized === "/server.js" ||
    normalized === "/package.json" ||
    normalized === "/package-lock.json" ||
    normalized.startsWith("/supabase/functions") ||
    normalized === "/supabase/schema.sql"
  ) {
    return res.status(404).end();
  }
  next();
});

// Serve local Three.js modules without external CDN dependency
app.use(
  "/vendor/three",
  express.static(path.join(ROOT_DIR, "node_modules/three"), {
    maxAge: "1d",
  })
);

function getGeminiClient() {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function sanitizeShortText(value, maxLen = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLen);
}

function sanitizeExistingReports(reports) {
  if (!Array.isArray(reports)) return [];
  return reports.slice(0, 25).map((r) => ({
    id: sanitizeShortText(r?.id, 32),
    title: sanitizeShortText(r?.title, 100),
    location: sanitizeShortText(r?.location, 100),
    category: sanitizeShortText(r?.category, 40),
    status: sanitizeShortText(r?.status, 32),
  }));
}

function normalizeTriageResult(raw) {
  const category = ALLOWED_CATEGORIES.includes(raw?.category)
    ? raw.category
    : "other";
  const priority = ALLOWED_PRIORITIES.includes(raw?.priority)
    ? raw.priority
    : "normal";
  const confidenceNum = Number(raw?.confidence);
  const confidence = Number.isFinite(confidenceNum)
    ? Math.max(0, Math.min(1, confidenceNum))
    : 0.5;

  const visibleEvidence = Array.isArray(raw?.visible_evidence)
    ? raw.visible_evidence
        .slice(0, 4)
        .map((item) => sanitizeShortText(item, 80))
        .filter(Boolean)
    : [];

  const duplicateIds = Array.isArray(raw?.duplicate_ids)
    ? raw.duplicate_ids
        .slice(0, 3)
        .map((id) => sanitizeShortText(id, 32))
        .filter(Boolean)
    : [];

  return {
    category,
    priority,
    confidence,
    summary: sanitizeShortText(
      raw?.summary || "Issue assessment generated for human review.",
      220
    ),
    safety_reason: sanitizeShortText(
      raw?.safety_reason || "Requires verification by a city reviewer.",
      240
    ),
    recommended_department: sanitizeShortText(
      raw?.recommended_department || "Civic Operations Desk",
      80
    ),
    visible_evidence: visibleEvidence,
    duplicate_ids: duplicateIds,
    requires_human_review: true,
    provider: GEMINI_MODEL,
  };
}

const TRIAGE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      description:
        "One of: road_damage, garbage, waterlogging, streetlight, other",
    },
    priority: {
      type: Type.STRING,
      description: "One of: normal, high, critical",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confidence score from 0.0 to 1.0",
    },
    summary: {
      type: Type.STRING,
      description: "Concise objective summary under 25 words",
    },
    safety_reason: {
      type: Type.STRING,
      description: "Short explanation of safety or access risk under 30 words",
    },
    recommended_department: {
      type: Type.STRING,
      description:
        "Suggested municipal team category such as Roads & Pavements, Solid Waste, Drainage, Street Lighting, or General Civic",
    },
    visible_evidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Up to 4 short factual observations from the input",
    },
    duplicate_ids: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "IDs from existingReports that appear to describe the same issue and location, or empty array",
    },
  },
  required: [
    "category",
    "priority",
    "confidence",
    "summary",
    "safety_reason",
    "recommended_department",
    "visible_evidence",
    "duplicate_ids",
  ],
};

async function callGeminiWithRetry(ai, params, maxAttempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error) {
      lastError = error;
      const status = error?.status || error?.statusCode;
      if (attempt < maxAttempts && (status === 429 || status === 503)) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function formatGeminiError(error, fallbackMessage) {
  const upstreamStatus = Number(error?.status || error?.statusCode) || 0;
  const rawMsg = String(error?.message || "");
  if (upstreamStatus === 429) {
    return {
      httpStatus: 429,
      message: "AI triage quota temporarily reached. Please wait a moment or complete details manually.",
    };
  }
  if (upstreamStatus === 400 || upstreamStatus === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(rawMsg)) {
    return {
      httpStatus: 503,
      message: "Gemini API key invalid or missing permissions. Please verify GEMINI_API_KEY in Settings > Secrets.",
    };
  }
  if (upstreamStatus === 404 || /NOT_FOUND/i.test(rawMsg)) {
    return {
      httpStatus: 502,
      message: `Gemini model (${GEMINI_MODEL}) returned not found.`,
    };
  }
  return {
    httpStatus: 502,
    message: upstreamStatus ? `${fallbackMessage} (upstream ${upstreamStatus})` : fallbackMessage,
  };
}

app.get("/api/capabilities", (_req, res) => {
  const aiConfigured = Boolean((process.env.GEMINI_API_KEY || "").trim());
  res.setHeader("Cache-Control", "no-store");
  res.json({
    aiConfigured,
    streetViewProvider: "openfreemap-3d-panoramax-threejs",
    requiresMapsApiKey: false,
    model: GEMINI_MODEL,
    maxImageBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
    serverTime: new Date().toISOString(),
  });
});

app.post("/api/triage-image", async (req, res) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error:
          "AI image service is not configured on this server. Add GEMINI_API_KEY in Settings > Secrets, or configure Supabase Edge Functions.",
      });
    }

    const { imageBase64, mimeType, title, description, location, existingReports } =
      req.body || {};

    if (
      !imageBase64 ||
      typeof imageBase64 !== "string" ||
      imageBase64.length > MAX_IMAGE_BASE64_LENGTH
    ) {
      return res.status(400).json({
        error: "Image is missing or exceeds the 5 MB upload limit.",
      });
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType)) {
      return res.status(400).json({
        error: "Unsupported image type. Please upload a JPEG, PNG, or WebP photo.",
      });
    }

    if (!/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
      return res.status(400).json({
        error: "Malformed base64 image payload.",
      });
    }

    const safeTitle = sanitizeShortText(title, 120);
    const safeDescription = sanitizeShortText(description, 600);
    const safeLocation = sanitizeShortText(location, 120);
    const candidates = sanitizeExistingReports(existingReports);

    const prompt = [
      "Inspect this user-submitted photo of a potential urban public-space civic issue.",
      "Classify strictly using the JSON schema.",
      "Allowed categories: road_damage (potholes, broken pavement, road collapse), garbage (overflowing waste, litter dumps), waterlogging (standing water, flooded street, blocked drain), streetlight (broken pole, unlit lamp, exposed wiring), other.",
      "Allowed priorities: normal (routine maintenance), high (significant disruption or moderate hazard), critical (immediate physical danger, deep road collapse, live wires, severe flooding).",
      "Do not invent an exact street address, do not identify people or license plates, and do not claim municipal verification.",
      "If the photo does not clearly depict an urban civic issue, set category to 'other', priority to 'normal', lower confidence accordingly, and explain the uncertainty honestly.",
      safeTitle ? `Reporter title: ${safeTitle}` : "",
      safeLocation ? `Reported location label: ${safeLocation}` : "",
      safeDescription ? `Reporter description: ${safeDescription}` : "",
      candidates.length
        ? `Existing open/recent reports to check for possible duplicates: ${JSON.stringify(
            candidates
          )}`
        : "No existing reports provided for duplicate check.",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await callGeminiWithRetry(ai, {
      model: GEMINI_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        systemInstruction:
          "You are a cautious civic-infrastructure triage assistant. Always return factual, calibrated structured JSON for human review.",
        responseMimeType: "application/json",
        responseSchema: TRIAGE_SCHEMA,
      },
    });

    const rawText = (response.text || "").trim();
    if (!rawText) {
      return res.status(502).json({
        error: "AI service returned an empty response. Please review manually.",
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        error:
          "AI service returned an unreadable response format. Please enter category and priority manually.",
      });
    }

    return res.json(normalizeTriageResult(parsed));
  } catch (error) {
    console.error("Server /api/triage-image error:", error?.status || "", error?.message || error);
    const formatted = formatGeminiError(error, "AI image analysis failed on the server. Please verify manually.");
    return res.status(formatted.httpStatus).json({ error: formatted.message });
  }
});

app.post("/api/triage-issue", async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { title, description, location, safety, existingReports } =
      req.body || {};

    const safeTitle = sanitizeShortText(title, 120);
    const safeDescription = sanitizeShortText(description, 1000);
    const safeLocation = sanitizeShortText(location, 120);
    const safeSafety = sanitizeShortText(safety, 32);

    if (!safeTitle || safeTitle.length < 3) {
      return res.status(400).json({
        error: "Please enter a brief issue title (at least 3 characters).",
      });
    }

    if (!ai) {
      return res.status(503).json({
        error: "Server Gemini AI is not configured (GEMINI_API_KEY not set).",
        aiUnavailable: true,
      });
    }

    const candidates = sanitizeExistingReports(existingReports);
    const prompt = [
      "Evaluate this civic issue report for triage and duplicate detection.",
      `Title: ${safeTitle}`,
      `Location: ${safeLocation || "Not specified"}`,
      `Description: ${safeDescription || "Not provided"}`,
      `Reporter safety selection: ${safeSafety || "Normal"}`,
      candidates.length
        ? `Existing reports to compare for potential duplicates: ${JSON.stringify(
            candidates
          )}`
        : "No existing reports provided.",
    ].join("\n");

    const response = await callGeminiWithRetry(ai, {
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction:
          "You assist civic operators by suggesting a category, priority, short objective explanation, department routing, and possible duplicate report IDs. Always treat outputs as assistive suggestions requiring human review.",
        responseMimeType: "application/json",
        responseSchema: TRIAGE_SCHEMA,
      },
    });

    const rawText = (response.text || "").trim();
    const parsed = JSON.parse(rawText);
    return res.json(normalizeTriageResult(parsed));
  } catch (error) {
    console.error("Server /api/triage-issue error:", error?.status || "", error?.message || error);
    const formatted = formatGeminiError(error, "AI text triage failed on the server.");
    return res.status(formatted.httpStatus).json({
      error: formatted.message,
      aiUnavailable: true,
    });
  }
});

app.use(
  express.static(ROOT_DIR, {
    dotfiles: "ignore",
    extensions: ["html"],
  })
);

app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

app.get("/app", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "app.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`CITYFIX AI server listening on http://${HOST}:${PORT}`);
});
