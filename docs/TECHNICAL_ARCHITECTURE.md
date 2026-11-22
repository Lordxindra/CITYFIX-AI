# Technical architecture

## Current prototype
Browser (HTML/CSS/JS) → localStorage for demo reports and points. Leaflet renders map markers using OpenStreetMap tiles.

## Intended production architecture
Citizen web app → authenticated API → Supabase Postgres + Storage → authorised admin console.
Image classification should run server-side through a model provider. The server should return category, confidence and a short explanation; low-confidence or safety-critical reports must be reviewed by a person.

## Security requirements before real deployment
- Supabase Row Level Security on every user-facing table
- Authenticated admin role enforced server-side, never by a client-side toggle
- File type, file size and image-content validation
- Strip EXIF metadata before storage where feasible
- Rate limiting, abuse reporting and audit logs
- Collect only necessary personal data; publish a clear retention policy
- Never expose service-role keys or model API keys in client code
- Provide deletion/contact process and accessibility support

## Priority model
The current demo rules are intentionally simple and explainable. A future model should combine safety impact, obstruction, issue type, repeat reports and human review. Avoid using popularity alone as a priority signal.
