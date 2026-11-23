# Buildathon Live & Video Demo Script (10-Step Judge Walkthrough)

1. **0:00–0:20 — Cinematic Hook (`index.html`)**
   - Open the landing page showing the Jaipur hero video (`01_Jaipur_Cinematic_Reveal.mp4`), clear typography, and single-click entry into the Command Center.
   - Scroll briefly through *Urban Reality* (`02_Urban_Problems.mp4`) and *3D Digital Twin* (`04_Jaipur_3D_Digital_Twin.mp4`) to frame the civic problem.

2. **0:20–0:40 — Command Center Overview (`app.html#overview`)**
   - Open the Command Center and point out the honest mode banner (showing Demo vs. Supabase Cloud mode and live `/api/capabilities` AI status).
   - Review open/resolved KPIs, Priority Queue, and the interactive Leaflet snapshot.

3. **0:40–1:15 — Interactive 3D Jaipur Digital Twin (`app.html#twin`)**
   - Switch to **3D Digital Twin**. Orbit, pan, and zoom smoothly around the procedural Jaipur districts (Heritage Pink City, Civic Core, Central Park).
   - Click camera presets (`Heritage Core`, `Civic Core`, `Top-Down`) and toggle proximity clustering.
   - Click a critical issue beacon to open the 3D Inspector, then click a building block to see nearby district context.

4. **1:15–1:40 — City Map Layers & Zero-API 3D Street Explorer (`app.html#explore`)**
   - Switch to **City Map**, toggle category layers (`Road damage`, `Garbage`, `Streetlight`), and click a report in the synchronized queue.
   - Switch to **Split** or **3D Street View** to showcase real 3D OpenStreetMap Jaipur buildings (OpenFreeMap, zero API key), Panoramax open street photos (where covered), and the **3D Twin Corridor** toggle.

5. **1:40–2:15 — Citizen Reporting & Gemini AI Triage (`+ Report an issue`)**
   - Open the Report Modal, choose a Jaipur district quick-pin (or optional GPS), attach a sample photo, and click **Analyse photo with AI** / **Run AI text & duplicate check**.
   - Show how structured JSON returns category, priority, department hint, visible evidence, duplicate alerts, and the mandatory *human review required* notice.
   - Submit the report to receive a trackable `CF-XXXX` reference ID.

6. **2:15–2:35 — Citizen Tracking & Analytics (`#reports`, `#impact`)**
   - Enter the new `CF-XXXX` ID in the Reference Tracker to pull up the Issue Detail Drawer and status timeline.
   - Show Analytics charts computed directly from recorded issues.

7. **2:35–2:55 — Admin Operations Console & Exports (`#admin`)**
   - Open **Admin Console**. Highlight the verified RLS permission card (and toggle local Demo Admin mode when running without cloud admin auth).
   - Add an audit note, resolve an issue, inspect the new `issue_events` audit entry, and demonstrate **Export CSV** / **Export JSON**.

8. **2:55–3:05 — Honesty & Closing**
   - Note that default records are clearly labelled demo data, no external government affiliation is claimed, and close with: *"CityFix AI — See your city clearly. Prioritise what matters."*
