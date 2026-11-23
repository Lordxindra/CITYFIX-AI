# CITYFIX AI — Smart City Command Center
### See your city clearly. Prioritise what matters.

CityFix AI is an independent civic-tech buildathon prototype for Jaipur, Rajasthan that connects citizen issue reporting, an interactive procedural Three.js 3D Digital Twin, OpenStreetMap 2D mapping, server-side Gemini AI triage, and role-gated operations tracking.

## Public links
- Landing page: https://lordxindra.github.io/CITYFIX-AI/
- Interactive Command Center: https://lordxindra.github.io/CITYFIX-AI/app.html
- Source code: https://github.com/Lordxindra/CITYFIX-AI

## Run locally (recommended full-stack Express server)
1. Install dependencies: `npm install`
2. Optionally set `GEMINI_API_KEY` in your environment (see `.env.example`) for server-side Gemini photo & text triage.
3. Start the server: `npm start` (runs `node server.js` on port `3000`).
4. Open `http://localhost:3000/` for the cinematic landing page or `http://localhost:3000/app.html` for the Command Center.

> Static fallback: Opening the site on GitHub Pages still works cleanly for UI, 3D Digital Twin, 2D Leaflet map, and local demo persistence (with Three.js loaded from `/vendor/three` when served by Express or Supabase Edge Functions when configured).

## Current working functionality
- **Cinematic 10-section landing site** (`index.html`, `landing.css`, `landing.js`) integrating all 7 supplied Jaipur showcase videos (`assets/videos/flow-approved/01_*.mp4` – `07_*.mp4`) with lazy loading, dark scrims, and reduced-motion pause control.
- **Interactive Procedural 3D Jaipur Digital Twin** (`three-city.js`) built with Three.js `0.187.0` (`PerspectiveCamera`, `OrbitControls`, `RoomEnvironment`, raycasted building and issue beacon inspection, proximity marker clustering, category/severity/search filters, camera presets, collapsible bottom dock, and automatic 2D Leaflet fallback when WebGL is unavailable).
- **Synchronized 2D City Map, Layer Controls & Zero-API 3D Street Explorer** (`app.html`, `app.js`, `street-walk-3d.js`) using Leaflet `1.9.4` + animated per-category Layer Control Panel, MapLibre GL `4.7.1` + OpenFreeMap 3D extruded OSM buildings, optional Panoramax open street-level photos, and a Three.js 3D Twin street-corridor fallback (zero map API key required).
- **Server-side Gemini AI Triage & Duplicate Check** (`server.js` via `@google/genai` `gemini-4-hydrogen` at `/api/triage-image` and `/api/triage-issue`, plus optional Supabase Edge Function `supabase/functions/triage-image/index.ts`). If no `GEMINI_API_KEY` is configured, both photo and text triage fall back cleanly to transparent client-side local heuristic previews.
- **Citizen Reporting & Reference Tracking** with JPEG/PNG/WebP preview (5 MB limit), consent-only GPS + quick Jaipur locality buttons, upload progress, `CF-XXXX` reference IDs, and Reference ID lookup.
- **Admin Operations Console** with priority queue, audit notes, `issue_events` history, Supabase `profiles.is_admin` verification (or local Demo Admin toggle in demo mode), and formula-safe CSV / JSON exports.
- **Analytics & Community Visibility** computed strictly from recorded reports (`Open`, `In progress`, `Resolved`, category mix, geographic distribution, and timeline).

## Demo data and honesty
- Default seed reports (`CF-1021` to `CF-1024`), coordinates, participation points (`+30 pts` per local demo report), and ward distributions are synthetic examples visibly labelled as demo data—not official Jaipur Municipal Corporation statistics.
- No `.glb` or `.gltf` 3D city model is present in `assets/`; the 3D Digital Twin uses a clearly labelled procedural Three.js city generator.
- Reports submitted in local demo mode remain in browser `localStorage`. CityFix AI is not affiliated with any government authority.

## Configure the optional Supabase cloud backend
1. Create a Supabase project and run `supabase/schema.sql` in the SQL Editor.
2. Set your Project URL and publishable key in `supabase/config.js` (never place `service_role`, `sb_secret_*`, or `GEMINI_API_KEY` in client code).
3. Deploy the Edge Function (`supabase functions deploy triage-image`) and set `GEMINI_API_KEY` in Supabase Secrets if using Supabase-hosted AI without the Express backend.
4. Sign in from the Command Center via **Cloud sign in** (passwordless email link), and promote an admin account using the commented SQL snippet at the end of `supabase/schema.sql`.

## Project documentation
- Product overview: `docs/PRODUCT_OVERVIEW.md`
- Technical architecture: `docs/TECHNICAL_ARCHITECTURE.md`
- Problem validation plan: `docs/VALIDATION_PLAN.md`
- Brand kit: `docs/BRAND_KIT.md`
- Launch film script: `docs/LAUNCH_FILM_SCRIPT.md`
- Explainer demo script: `docs/DEMO_SCRIPT.md`
- Social post drafts: `docs/SOCIAL_POSTS.md`
- Final submission checklist: `docs/FINAL_SUBMISSION_CHECKLIST.md`
- Team roles: `docs/TEAM_ROLES.md`
- AI and tools disclosure: `docs/AI_AND_TOOLS_DISCLOSURE.md`
- Supabase and AI setup: `docs/SUPABASE_SETUP.md`

## Known limitations
- Gemini photo/text LLM triage uses local heuristic fallbacks unless `GEMINI_API_KEY` is set server-side in Express (`process.env.GEMINI_API_KEY`) or in Supabase Edge Function secrets.
- Without Supabase sign-in, reports and demo admin transitions persist only in the local browser (`localStorage`).
- No municipal dispatch integration or guaranteed SLA is claimed.
