(() => {
  const cfg = window.CITYFIX_SUPABASE_CONFIG || {};
  const configured = Boolean(cfg.url && cfg.publishableKey && window.supabase?.createClient);
  const client = configured
    ? window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  const statusToDb = (value) => ({ Open: "open", "In progress": "in_progress", Resolved: "resolved" }[value] || "open");
  const statusFromDb = (value) => ({ open: "Open", in_progress: "In progress", resolved: "Resolved" }[value] || "Open");
  const categoryToDb = (value) => ({
    "Road damage": "road_damage",
    Garbage: "garbage",
    Waterlogging: "waterlogging",
    Streetlight: "streetlight",
    Other: "other"
  }[value] || "other");
  const categoryFromDb = (value) => ({
    road_damage: "Road damage",
    garbage: "Garbage",
    waterlogging: "Waterlogging",
    streetlight: "Streetlight",
    other: "Other"
  }[value] || "Other");

  function mapIssue(row) {
    const createdAt = row.created_at ? new Date(row.created_at) : new Date();
    return {
      id: row.report_code || ("CF-" + String(row.id).slice(0, 8).toUpperCase()),
      dbId: row.id,
      reporterId: row.reporter_id || null,
      title: row.title,
      category: categoryFromDb(row.category),
      location: row.location_label,
      priority: row.priority === "critical" ? "Critical" : row.priority === "high" ? "High" : "Normal",
      status: statusFromDb(row.status),
      date: createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      createdAt: row.created_at || createdAt.toISOString(),
      updatedAt: row.updated_at || row.created_at || createdAt.toISOString(),
      lat: row.latitude == null ? null : Number(row.latitude),
      lon: row.longitude == null ? null : Number(row.longitude),
      description: row.description || "",
      photoPath: row.photo_path || null,
      priorityReason: row.priority_reason || "",
      source: "cloud"
    };
  }

  async function getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function getUserProfile() {
    if (!client) return null;
    const session = await getSession();
    if (!session?.user) return null;
    const { data, error } = await client
      .from("profiles")
      .select("id,display_name,is_admin,created_at")
      .eq("id", session.user.id)
      .maybeSingle();
    if (error) return null;
    return data ? { ...data, email: session.user.email || "" } : { id: session.user.id, display_name: "CityFix Resident", is_admin: false, email: session.user.email || "" };
  }

  async function loadIssues() {
    if (!client) return null;
    const { data, error } = await client
      .from("issues")
      .select("id,report_code,reporter_id,title,description,category,location_label,latitude,longitude,priority,priority_reason,status,photo_path,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data || []).map(mapIssue);
  }

  async function loadIssueEvents(issueDbId = null) {
    if (!client) return [];
    const session = await getSession();
    if (!session?.user) return [];
    let query = client
      .from("issue_events")
      .select("id,issue_id,actor_id,old_status,new_status,note,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (issueDbId) query = query.eq("issue_id", issueDbId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((ev) => ({
      id: ev.id,
      issueId: ev.issue_id,
      actorId: ev.actor_id,
      oldStatus: ev.old_status ? statusFromDb(ev.old_status) : null,
      newStatus: statusFromDb(ev.new_status),
      note: ev.note || "",
      createdAt: ev.created_at
    }));
  }

  async function getPhotoSignedUrl(photoPath) {
    if (!client || !photoPath) return null;
    const session = await getSession();
    if (!session?.user) return null;
    const { data, error } = await client.storage.from("issue-photos").createSignedUrl(photoPath, 300);
    if (error) return null;
    return data?.signedUrl || null;
  }

  async function signIn(email) {
    if (!client) throw new Error("Add your Supabase URL and publishable key in supabase/config.js first.");
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) throw error;
    return true;
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function createIssue(report, photoFile, onProgress) {
    if (!client) throw new Error("Cloud backend is not configured.");
    const session = await getSession();
    if (!session?.user) throw new Error("Sign in with your email before submitting a cloud report.");

    let photoPath = null;
    if (photoFile) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(photoFile.type) || photoFile.size > 5 * 1024 * 1024) {
        throw new Error("Photo must be a JPEG, PNG, or WebP image smaller than 5 MB.");
      }
      if (typeof onProgress === "function") onProgress(35, "Uploading photo to private storage...");
      const safeName = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      photoPath = session.user.id + "/" + crypto.randomUUID() + "-" + safeName;
      const { error: uploadError } = await client.storage
        .from("issue-photos")
        .upload(photoPath, photoFile, { contentType: photoFile.type, upsert: false });
      if (uploadError) throw uploadError;
    }

    if (typeof onProgress === "function") onProgress(75, "Saving issue record...");
    const { data, error } = await client
      .from("issues")
      .insert({
        reporter_id: session.user.id,
        title: report.title,
        description: report.description || "",
        category: categoryToDb(report.category),
        location_label: report.location,
        latitude: Number.isFinite(report.lat) ? report.lat : null,
        longitude: Number.isFinite(report.lon) ? report.lon : null,
        priority: report.priority.toLowerCase(),
        priority_reason: report.priorityReason || "Human-reviewed reporter selection",
        photo_path: photoPath
      })
      .select("id,report_code,reporter_id,title,description,category,location_label,latitude,longitude,priority,priority_reason,status,photo_path,created_at,updated_at")
      .single();

    if (error) throw error;
    if (typeof onProgress === "function") onProgress(100, "Saved to CityFix cloud.");
    return mapIssue(data);
  }

  async function isAdmin() {
    if (!client) return false;
    const session = await getSession();
    if (!session?.user) return false;
    const { data, error } = await client
      .from("profiles")
      .select("is_admin")
      .eq("id", session.user.id)
      .maybeSingle();
    if (error) return false;
    return data?.is_admin === true;
  }

  async function updateIssueStatus(dbId, status, note = "") {
    if (!client) throw new Error("Cloud backend is not configured.");
    if (!(await isAdmin())) throw new Error("Only an authorised CityFix admin can update cloud report status.");
    const dbStatus = statusToDb(status);
    const { data: currentRow } = await client.from("issues").select("status").eq("id", dbId).maybeSingle();
    const { error } = await client.from("issues").update({ status: dbStatus }).eq("id", dbId);
    if (error) throw error;

    // Trigger issues_log_status_change logs automatically; if custom note was provided, log supplemental audit note if allowed
    if (note && currentRow && currentRow.status !== dbStatus) {
      const session = await getSession();
      if (session?.user) {
        await client.from("issue_events").insert({
          issue_id: dbId,
          actor_id: session.user.id,
          old_status: currentRow.status,
          new_status: dbStatus,
          note: String(note).slice(0, 500)
        }).catch(() => {});
      }
    }
  }

  async function classifyPhoto(file) {
    if (!client) throw new Error("Cloud backend is not configured.");
    const session = await getSession();
    if (!session?.user) throw new Error("Sign in before using Supabase AI photo analysis.");
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      throw new Error("Choose a JPEG, PNG, or WebP image smaller than 5 MB.");
    }
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const { data, error } = await client.functions.invoke("triage-image", {
      body: { imageBase64: base64, mimeType: file.type }
    });
    if (error) throw error;
    return data;
  }

  window.CityFixCloud = {
    isConfigured: configured,
    getSession,
    getUserProfile,
    loadIssues,
    loadIssueEvents,
    getPhotoSignedUrl,
    signIn,
    signOut,
    createIssue,
    isAdmin,
    updateIssueStatus,
    classifyPhoto
  };
})();
