import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Sign-in required" }), { status: 401, headers: cors });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: cors });

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string" || imageBase64.length > 7_000_000) {
      return new Response(JSON.stringify({ error: "Image is missing or too large (max 5 MB)." }), { status: 400, headers: cors });
    }
    if (!["image/jpeg","image/png","image/webp"].includes(mimeType)) {
      return new Response(JSON.stringify({ error: "Use a JPEG, PNG or WebP image." }), { status: 400, headers: cors });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-4-hydrogen";
    if (!apiKey) return new Response(JSON.stringify({ error: "AI service is not configured. Add GEMINI_API_KEY to Supabase function secrets." }), { status: 503, headers: cors });

    const prompt = `Inspect this user-submitted photo of a possible public-space issue. Return ONLY JSON with keys: category (one of road_damage, garbage, waterlogging, streetlight, other), priority (normal, high, critical), confidence (0 to 1), summary (max 24 words), safety_reason (max 30 words), recommended_department (short department name), visible_evidence (array of up to 4 short strings). Do not infer an exact address, identity, cause, or whether an authority has verified it. If the image does not clearly show an urban issue, use category other, priority normal, and explain uncertainty. This is a triage suggestion for human review, not an official assessment.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      console.error("Gemini error", payload);
      return new Response(JSON.stringify({ error: "Image analysis provider returned an error. Check model and API key settings." }), { status: 502, headers: cors });
    }

    const raw = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    let result;
    try { result = JSON.parse(raw); } catch { throw new Error("AI returned an unreadable result. Please retry or enter details manually."); }

    const allowedCategories = ["road_damage","garbage","waterlogging","streetlight","other"];
    const allowedPriorities = ["normal","high","critical"];
    if (!allowedCategories.includes(result.category)) result.category = "other";
    if (!allowedPriorities.includes(result.priority)) result.priority = "normal";
    result.confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
    result.requires_human_review = true;
    result.provider = model;

    return new Response(JSON.stringify(result), { status: 200, headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Unexpected error" }), { status: 500, headers: cors });
  }
});
