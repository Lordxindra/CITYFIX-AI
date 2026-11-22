(() => {
  const cfg = window.CITYFIX_SUPABASE_CONFIG || {};
  const configured = Boolean(cfg.url && cfg.publishableKey && window.supabase?.createClient);
  const client = configured
    ? window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  const statusToDb = value => ({ "Open":"open", "In progress":"in_progress", "Resolved":"resolved" }[value] || "open");
  const statusFromDb = value => ({ open:"Open", in_progress:"In progress", resolved:"Resolved" }[value] || "Open");
  const categoryToDb = value => ({
    "Road damage":"road_damage", "Garbage":"garbage", "Waterlogging":"waterlogging",
    "Streetlight":"streetlight", "Other":"other"
  }[value] || "other");
  const categoryFromDb = value => ({
    road_damage:"Road damage", garbage:"Garbage", waterlogging:"Waterlogging",
    streetlight:"Streetlight", other:"Other"
  }[value] || "Other");

  function mapIssue(row) {
    return {
      id: row.report_code || ("CF-" + String(row.id).slice(0,8).toUpperCase()),
      dbId: row.id,
      title: row.title,
      category: categoryFromDb(row.category),
      location: row.location_label,
      priority: row.priority === "critical" ? "Critical" : row.priority === "high" ? "High" : "Normal",
      status: statusFromDb(row.status),
      date: new Date(row.created_at).toLocaleDateString(),
      lat: row.latitude == null ? null : Number(row.latitude),
      lon: row.longitude == null ? null : Number(row.longitude),
      description: row.description || "",
      photoPath: row.photo_path || null,
      priorityReason: row.priority_reason || ""
    };
  }

  async function getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function loadIssues() {
    if (!client) return null;
    const { data, error } = await client.from("issues")
      .select("id,report_code,title,description,category,location_label,latitude,longitude,priority,priority_reason,status,photo_path,created_at")
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    return (data || []).map(mapIssue);
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

  async function createIssue(report, photoFile) {
    if (!client) throw new Error("Cloud backend is not configured.");
    const session = await getSession();
    if (!session?.user) throw new Error("Sign in with your email before submitting a cloud report.");
    let photoPath = null;
    if (photoFile) {
      if (!photoFile.type.startsWith("image/") || photoFile.size > 5 * 1024 * 1024) {
        throw new Error("Photo must be an image smaller than 5 MB.");
      }
      const safeName = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      photoPath = session.user.id + "/" + crypto.randomUUID() + "-" + safeName;
      const { error: uploadError } = await client.storage.from("issue-photos")
        .upload(photoPath, photoFile, { contentType: photoFile.type, upsert: false });
      if (uploadError) throw uploadError;
    }
    const { data, error } = await client.from("issues").insert({
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
    }).select("id,report_code,title,description,category,location_label,latitude,longitude,priority,priority_reason,status,photo_path,created_at").single();
    if (error) throw error;
    return mapIssue(data);
  }

  async function isAdmin() {
    if (!client) return false;
    const session = await getSession();
    if (!session?.user) return false;
    const { data, error } = await client.from("profiles")
      .select("is_admin").eq("id", session.user.id).maybeSingle();
    if (error) return false;
    return data?.is_admin === true;
  }

  async function updateIssueStatus(dbId, status) {
    if (!client) throw new Error("Cloud backend is not configured.");
    if (!(await isAdmin())) throw new Error("Only an authorised CityFix admin can update cloud report status.");
    const { error } = await client.from("issues")
      .update({ status: statusToDb(status) }).eq("id", dbId);
    if (error) throw error;
  }

  async function classifyPhoto(file) {
    if (!client) throw new Error("Cloud backend is not configured.");
    const session = await getSession();
    if (!session?.user) throw new Error("Sign in before using AI photo analysis.");
    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      throw new Error("Choose an image smaller than 5 MB.");
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
    loadIssues,
    signIn,
    signOut,
    createIssue,
    isAdmin,
    updateIssueStatus,
    classifyPhoto
  };
})();
