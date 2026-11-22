# CITYFIX AI
### The intelligence layer for better cities.

CityFix AI is a civic-tech buildathon prototype that helps residents document local infrastructure issues and helps communities understand what needs attention first.

> **Prototype disclosure:** This repository contains a working browser-based prototype. Sample reports and ward rankings are illustrative, not official municipal data. Priority suggestions use transparent demo rules, not a trained AI model. No report is sent to a government department.

## Run it
**Fastest:** open `index.html` in a modern browser. Internet access is needed for OpenStreetMap map tiles, Leaflet and Google Fonts.

**VS Code:** open this folder and use the Live Server extension, or run:
```bash
python -m http.server 8000
```
Then visit `http://localhost:8000`.

## Included
- City overview with report metrics and priority queue
- Interactive Jaipur map using Leaflet + OpenStreetMap
- Issue submission with image preview
- Transparent rule-based priority suggestion
- Search, category and status filters
- Demo admin workflow to cycle issue status
- Community points and milestone badges
- Browser localStorage persistence
- Supabase SQL schema for the next integration step
- Landing-page copy, validation plan, demo script and launch-film script
- GitHub Pages deployment workflow

## Current limitations
- Data is stored in the current browser only; there is no shared cloud database yet.
- The admin toggle is a demo interaction, not secure authentication.
- The map markers use illustrative coordinates around Jaipur.
- Image selection previews locally and does not upload anywhere.
- No official municipal integration, SLA, department assignment or real-world resolution is claimed.
- AI vision classification is an integration milestone, not currently implemented.

## Cloud backend setup (optional next step)
1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env` only when a future frontend/backend integration is implemented.
4. Never put a Supabase `service_role` key or any secret API key in browser code.
5. Add authenticated server-side endpoints for image classification and report submission before using real citizen data.

## Suggested judging demo
1. Open the overview and explain the problem.
2. Explore map markers and click a report.
3. Submit a new report with a clear location and safety impact.
4. Show the transparent triage suggestion and explain human review.
5. Open the report table and use demo admin mode to move it through statuses.
6. Explain what the Supabase schema enables next and clearly distinguish prototype data from validated local research.

## Tech
HTML, CSS, JavaScript, Leaflet, OpenStreetMap, browser localStorage. Supabase SQL is provided as a backend foundation.
