# Technical architecture

## Runtime stack
- **Node.js + Express 5 (`server.js`)**: Serves static web assets, mounts `node_modules/three` locally under `/vendor/three`, blocks sensitive server/schema files (`/server.js`, `/package.json`, `/supabase/schema.sql`, `/supabase/functions/*`), sets security response headers, and exposes JSON API routes:
  - `GET /api/capabilities` — reports whether server-side `GEMINI_API_KEY` is configured and advertises upload limits (with `requiresMapsApiKey: false`).
  - `POST /api/triage-image` — validates base64 JPEG/PNG/WebP payloads (up to 5 MB binary) and queries `@google/genai` (`gemini-4-hydrogen`) using structured JSON `responseSchema`.
  - `POST /api/triage-issue` — evaluates report title, location, description, safety level, and recent report summaries for structured triage and duplicate candidates.
- **3D Street Corridor (`street-walk-3d.js`)**: ES module loaded via `/vendor/three` (with automatic CDN importmap fallback on static GitHub Pages) providing an interactive first-person street-level corridor fallback inside the City Map Street Explorer.
- **2D Map, Layer Panel & Zero-API 3D Street Explorer (`app.html`, `app.js`, `styles.css`)**: Synchronized 5-view SPA (`Overview`, `City Map`, `Issue Reports`, `Analytics & Impact`, `Admin Console`) using Leaflet `1.9.4` + animated per-category Layer Control Panel, MapLibre GL `4.7.1` + OpenFreeMap 3D extruded OSM buildings, optional Panoramax open street photos, strict HTML escaping (`escapeHTML`), URL scheme checks (`isSafeImageUrl`), and CSV formula neutralization (`neutralizeCsvCell`).
- **Landing Experience (`index.html`, `landing.css`, `landing.js`)**: 10-section responsive page with `IntersectionObserver` lazy loading for all 7 `assets/videos/flow-approved/01..07*.mp4` assets and reduced-motion pause controls.

## Cloud persistence & RLS (`supabase/schema.sql`, `supabase-client.js`)
- Citizen web app → Supabase Postgres (`profiles`, `issues`, `issue_events`) + Private Storage (`issue-photos`) + Edge Function (`supabase/functions/triage-image/index.ts`).
- Row Level Security enforces:
  - Public read on `issues` (never exposing personal user emails).
  - Authenticated resident insert (`auth.uid() = user_id`).
  - Admin-only status updates (`profiles.is_admin = true`) with automatic `issue_events` audit entries.
  - Owner/admin-only signed URL access for uploaded photos.

## Security & honesty guardrails
- API keys (`GEMINI_API_KEY`) live strictly in server environment variables (`process.env` or Supabase secrets), never in browser JS.
- Every AI triage response carries `requires_human_review: true`. If AI fails or is unconfigured, the UI displays an honest status rather than fabricating model results.
- Location access via `navigator.geolocation` runs strictly when the user presses **Use GPS (optional)**.
