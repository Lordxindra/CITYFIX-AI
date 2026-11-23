# Supabase setup guide

This is an optional production-backend path. The public demo works without it; shared cloud reporting and AI photo analysis are not active until the steps below are completed.

## 1. Create a Supabase project
Create a new project in the team's Supabase account. Keep the database password private.

## 2. Create the schema
Open SQL Editor and run the complete file at supabase/schema.sql from this repository. It creates profiles, issues, issue_events, Row Level Security policies and a private issue-photos bucket.

## 3. Configure the browser client
Open Project Settings → API. Copy the Project URL and the publishable key (not the service_role key). Edit supabase/config.js in the GitHub repository:
- url: your project URL
- publishableKey: your publishable key

Commit and push the change. A publishable key is intended to be used in a browser only when RLS is correctly configured.

## 4. Deploy the image triage function
Install the Supabase CLI, log in, link the local project, and run:
- supabase login
- supabase link --project-ref YOUR_PROJECT_REF
- supabase functions deploy triage-image

Set secrets on the server side:
- supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_KEY
- supabase secrets set GEMINI_MODEL=gemini-4-hydrogen

Never commit the Gemini API key or a Supabase service_role key. The function requires a signed-in user JWT and accepts JPEG, PNG or WebP images up to 5 MB.

## 5. Promote the team admin
First, sign in from the dashboard using the intended admin email. Then run the commented SQL statement at the end of schema.sql with that exact email. This is a privileged manual operation; do not expose admin controls to ordinary residents.

## 6. Test safely
- Test a resident account: sign in, submit a report and attach a non-sensitive sample photo.
- Test an anonymous browser: public issue rows should be readable, but it must not be able to insert or update.
- Test a non-admin account: it must not update report status.
- Test the admin account: it can update status and the database writes an issue_events audit record.
- Confirm private photo objects cannot be opened by an unrelated user.
- Check the Edge Function error handling with an invalid image and a missing AI secret.

## 7. Realtime (optional)
If you enable Realtime for public.issues in the Supabase dashboard, the client can later subscribe to new reports. The current app reloads reports when it starts; it does not yet promise live multi-user updates.

## Important
Use only the minimum data needed. Ask permission before using device location, never collect a home address unless necessary, and do not upload faces, number plates or sensitive documents. A model suggestion is not a verified report or official city priority.
