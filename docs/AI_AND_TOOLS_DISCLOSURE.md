# AI, tools and third-party disclosure

## Runtime frameworks, libraries, and APIs used
- **Node.js & Express (`^5.3.0`)**: Local web server, static asset delivery, `/vendor/three` module hosting, and server-side AI proxy routes (`server.js`).
- **Three.js (`^0.187.0`)**: Procedural 3D Jaipur Digital Twin (`three-city.js`) and offline 3D Twin street corridor (`street-walk-3d.js`) using `OrbitControls` and `RoomEnvironment`.
- **Google Gemini via `@google/genai` (`^3.6.1`, `gemini-4-hydrogen`)**: Server-side structured JSON photo/text issue triage and duplicate checking (`/api/triage-image`, `/api/triage-issue`) plus optional Supabase Edge Function (`supabase/functions/triage-image/index.ts`).
- **Leaflet (`1.9.4`), MapLibre GL (`4.7.1`), OpenStreetMap, OpenFreeMap & Panoramax**: Interactive 2D geospatial mapping with animated category layer toggles, zero-API-key 3D extruded OSM Jaipur buildings, and open crowd-sourced Panoramax street imagery.
- **Supabase JS v2, Postgres, Auth, Storage, Edge Functions**: Optional cloud authentication, RLS-enforced issue/audit persistence, and private photo storage.
- **Google Fonts**: `Urbanist`, `DM Sans`, and `JetBrains Mono`.
- **Supplied Media Assets**: Seven curated `.mp4` scenes in `assets/videos/flow-approved/` (`01_Jaipur_Cinematic_Reveal.mp4` – `07_Future_of_Jaipur_Final.mp4`) plus an edited 66.5s composite launch film (`assets/videos/cityfix-launch-film.mp4`).

## Data sources & honesty disclosures
- **Demo dataset**: Default reports (`CF-1021`–`CF-1024`), Jaipur coordinates, and participation points are synthetic seed examples clearly labelled in the UI.
- **3D city geometry**: Procedural Three.js geometry (no external `.glb`/`.gltf` model was supplied in the repository) alongside OpenStreetMap building footprints via OpenFreeMap.
- **No official municipal feed**: No Jaipur Municipal Corporation API or live government dataset is connected.

## AI limitations
- Gemini triage produces assistive structured suggestions (`requires_human_review: true`), never final municipal priority rulings.
- When `GEMINI_API_KEY` is absent on an external server, both photo and text triage fall back transparently to clearly labelled local browser heuristics rather than blocking the reporting flow.
- Citizens are instructed not to upload faces, vehicle license plates, or private documents.
