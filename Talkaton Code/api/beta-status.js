const SUPABASE_URL = "https://cxulgeojkjnskdyoktkj.supabase.co";
const SUPABASE_KEY = "sb_publishable_GgxtfIaIamzZFY_jMU4_Cw_V8NKm475";
const ACCOUNT_ROLES = new Map([
  ["kantertal1@gmail.com", "owner"],
  ["sdgoldstein14@gmail.com", "owner"],
  ["supportaton@gmail.com", "support"]
]);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authorization = typeof req.headers.authorization === "string"
    ? req.headers.authorization
    : "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return res.status(401).json({ approved: false, error: "Log in to check beta access." });
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: authorization
      }
    });
    if (!response.ok) {
      return res.status(401).json({ approved: false, error: "Your session is invalid or expired." });
    }

    const user = await response.json();
    const email = String(user?.email || "").trim().toLowerCase();
    const approvedByMetadata = user?.app_metadata?.beta === true
      || user?.app_metadata?.beta_approved === true;
    const role = ACCOUNT_ROLES.get(email) || null;
    const grants = await getApprovedRequests(authorization, user?.id);
    const activeGrants = grants.filter(isGrantActive);
    const betaGrant = activeGrants.find(grant => grant.feature_key === "beta_lab");
    const approved = Boolean(role)
      || approvedByMetadata
      || getApprovedBetaEmails().has(email)
      || Boolean(betaGrant);
    const devGrant = activeGrants.find(grant => grant.feature_key === "dev_access");
    const devApproved = Boolean(role) || (approved && Boolean(devGrant));

    return res.status(200).json({
      approved,
      devApproved,
      betaExpiresAt: betaGrant?.access_expires_at || null,
      devExpiresAt: devGrant?.access_expires_at || null,
      grants: activeGrants,
      role
    });
  } catch (error) {
    console.error("Beta access check failed:", error);
    return res.status(503).json({ approved: false, error: "Beta access check is temporarily unavailable." });
  }
}

async function getApprovedRequests(authorization, userId) {
  if (!userId) return [];
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/beta_requests`);
    url.searchParams.set("select", "feature_key,title,admin_note,reviewed_at,access_expires_at");
    url.searchParams.set("user_id", `eq.${userId}`);
    url.searchParams.set("status", "eq.approved");
    url.searchParams.set("order", "reviewed_at.desc.nullslast");
    let response = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: authorization
      }
    });
    if (!response.ok) {
      url.searchParams.set("select", "feature_key,title,admin_note,reviewed_at");
      response = await fetch(url, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: authorization
        }
      });
    }
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function isGrantActive(grant) {
  if (!grant?.access_expires_at) return true;
  const expiresAt = new Date(grant.access_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function getApprovedBetaEmails() {
  return new Set(
    String(process.env.BETA_APPROVED_EMAILS || "")
      .split(/[\s,;]+/)
      .map(email => email.trim().toLowerCase())
      .filter(Boolean)
  );
}
