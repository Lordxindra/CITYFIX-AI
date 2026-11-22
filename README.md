# CITYFIX AI
### Report less. Resolve more.

CityFix AI is an independent civic-tech buildathon prototype for documenting public-space issues, viewing them on a map, and making triage reasoning and report status easier to understand.

## Public links
- Landing page: https://lordxindra.github.io/CITYFIX-AI/
- Interactive dashboard: https://lordxindra.github.io/CITYFIX-AI/app.html
- Source code: https://github.com/Lordxindra/CITYFIX-AI

## Run locally
Run: python -m http.server 8000
Open http://localhost:8000/ for the landing page or http://localhost:8000/app.html for the dashboard.

## Current working functionality
- Responsive public landing page
- Dashboard with overview metrics and report queue
- Interactive Leaflet map using OpenStreetMap tiles
- Report submission and image preview
- Transparent rule-based priority suggestions in demo mode
- Search, status and category filters
- Demo status workflow and community points
- Local browser persistence
- Optional Supabase authentication, shared reports and private photo upload (requires project configuration)
- Optional server-side Gemini image triage function (requires Supabase deployment and Gemini API key)

## Demo data and honesty
The default dashboard seed reports, coordinates, ward leaderboard and points are synthetic examples. They are visibly described as demo data and are not official Jaipur statistics. A report submitted in local demo mode stays in that browser. Nothing is sent to a municipal authority. CityFix AI is not affiliated with Jaipur Municipal Corporation or any government body.

## Configure the optional cloud backend
1. Create a Supabase project.
2. Run supabase/schema.sql in the Supabase SQL Editor.
3. Copy the Project URL and publishable key into supabase/config.js. The publishable key is designed for browser use; never paste a service-role or secret key into the website.
4. Deploy the function: supabase functions deploy triage-image.
5. Add server-side secrets: supabase secrets set GEMINI_API_KEY=YOUR_KEY GEMINI_MODEL=gemini-2.5-flash.
6. Sign in from the dashboard using the Cloud sign in button. A one-time email link is sent.
7. Promote the intended administrator by running the commented SQL statement at the end of supabase/schema.sql, replacing the email with the real admin email.
8. Test report submission, public list visibility and admin-only status updates with separate resident/admin accounts.

Supabase client setup uses the browser SDK and a publishable key with Row Level Security. AI provider credentials stay in the Edge Function secret store, never in frontend code.

## AI image triage
The Edge Function accepts an authenticated image (JPEG, PNG or WebP, max 5 MB), requests a structured classification from Gemini, validates the returned category/priority, and marks the result as requiring human review. AI output is a suggestion, not a verified finding or official priority decision.

## Project documentation
- Product overview: docs/PRODUCT_OVERVIEW.md
- Technical architecture: docs/TECHNICAL_ARCHITECTURE.md
- Problem validation plan: docs/VALIDATION_PLAN.md
- Brand kit: docs/BRAND_KIT.md
- Launch film script: docs/LAUNCH_FILM_SCRIPT.md
- Explainer demo script: docs/DEMO_SCRIPT.md
- Social post drafts: docs/SOCIAL_POSTS.md
- Final submission checklist: docs/FINAL_SUBMISSION_CHECKLIST.md
- Team roles: docs/TEAM_ROLES.md
- AI and tools disclosure: docs/AI_AND_TOOLS_DISCLOSURE.md
- Supabase and AI setup: docs/SUPABASE_SETUP.md

## Tech and third-party resources
HTML, CSS, JavaScript, Supabase JS v2 (optional), Supabase Postgres/Auth/Storage/Edge Functions (optional), Gemini API (optional), Leaflet 1.9.4, OpenStreetMap tiles, Google Fonts. See docs/THIRD_PARTY_NOTICES.md.

## Limitations
- Supabase and Gemini are not active until the owner supplies project credentials and deploys the backend.
- The local demo uses browser localStorage and synthetic sample reports.
- The map only places reports with coordinates; demo coordinates are illustrative.
- AI classification requires a deployed Edge Function and a valid provider key.
- No municipal integration, service-level agreement, dispatch or real-world resolution is claimed.
- The team must validate the problem with real residents and replace no data with fabricated findings.

## Judging demo flow
1. Start on the landing page and explain the user problem.
2. Open the interactive dashboard and explore the Jaipur demo map.
3. Submit a clearly labelled demo report and show the transparent triage.
4. If cloud setup is complete, sign in and show a shared report from another browser.
5. If AI setup is complete, analyse a user-provided image and explain the confidence and human-review step.
6. Show admin-only status changes and the event history.
7. End with validated resident feedback, limitations and the next pilot step.
