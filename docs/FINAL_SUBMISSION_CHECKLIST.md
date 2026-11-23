# TuteDude Buildathon — CityFix AI submission checklist

Deadline in the supplied problem statement: Saturday, 28 November 2026, 11:59 PM IST. Late submissions are not accepted.

## Engineering & product deliverables
- [x] Redesigned 10-section cinematic landing page (`index.html`, `landing.css`, `landing.js`) with all 7 `flow-approved` Jaipur videos
- [x] Interactive Smart City Command Center (`app.html`, `app.js`, `styles.css`)
- [x] Interactive procedural Three.js 3D Jaipur Digital Twin (`three-city.js`, local `/vendor/three`) with orbit controls, clustering, search/severity/category filters, building & issue inspection, and WebGL fallback
- [x] Interactive City Map with animated category Layer Control Panel (`.layer-toggle-row`) + Zero-API-Key 3D Street Explorer (`MapLibre + OpenFreeMap 3D OSM Buildings`, optional `Panoramax` open street photos, and Three.js `3D Twin Corridor` in `street-walk-3d.js`)
- [x] Server-side Gemini AI endpoints (`server.js`: `/api/capabilities`, `/api/triage-image`, `/api/triage-issue`) using `@google/genai` (`gemini-4-hydrogen`) + aligned Supabase Edge Function (`supabase/functions/triage-image/index.ts`) + zero-API local photo/rule fallback
- [x] Citizen reporting workflow (photo MIME/size validation, consent-only GPS + quick Jaipur locations, AI/heuristic triage & duplicate check, confirmation ID, and Reference ID lookup)
- [x] Supabase config wired (`supabase/config.js`) + Admin Command Center with `profiles.is_admin` permission checks, local Demo Admin preview toggle, `issue_events` audit log, and sanitized CSV/JSON exports
- [x] GitHub source repository & brand/script docs (`README.md`, `docs/BRAND_KIT.md`, `docs/DEMO_SCRIPT.md`, `docs/LAUNCH_FILM_SCRIPT.md`, `docs/SOCIAL_POSTS.md`, `docs/RESEARCH_TEMPLATE.md`)
- [x] Edited 66.5-second 1280×720 Launch Film generated (`assets/videos/cityfix-launch-film.mp4`) from the 7 Jaipur scenes with title/CTA cards and captions

## External & manual items still required by the team
- [ ] Push final code updates to GitHub (`Lordxindra/CITYFIX-AI`) and verify live deployment (AI Studio Shared App URL, Render, or GitHub Pages)
- [ ] Conduct and document 5–10 real resident/student interviews in `docs/RESEARCH_TEMPLATE.md`
- [ ] Screen-record the 2–3 min product walkthrough (`docs/DEMO_SCRIPT.md`) and upload both videos (YouTube/Drive public links)
- [ ] Publish 5 original Instagram + X posts (`docs/SOCIAL_POSTS.md`), engage organically, and save screenshots + public post links
- [ ] Verify all submission URLs (live app, GitHub, videos, social links) open in a signed-out/incognito browser before submitting on TuteDude

## Compliance and integrity
- Keep synthetic, demo and estimated data clearly labelled.
- Never claim verified city impact, municipal dispatch, external GLB models not present in `/assets/`, or government affiliation.
- Obtain consent before filming in private spaces and blur faces/number plates.
- Never commit `GEMINI_API_KEY`, `service_role`, or `sb_secret_*` keys in client code.
