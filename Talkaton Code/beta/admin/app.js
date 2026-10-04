const SUPABASE_URL = "https://cxulgeojkjnskdyoktkj.supabase.co";
const SUPABASE_KEY = "sb_publishable_GgxtfIaIamzZFY_jMU4_Cw_V8NKm475";
const SUPPORT_EMAIL = "supportaton@gmail.com";
const OWNER_EMAIL = "sdgoldstein14@gmail.com";
const FEATURE_LABELS = {
  beta_lab: "Beta Lab access",
  dev_access: "Dev Access · unlimited usage",
  model_access: "Model access",
  tool_access: "Tool or integration",
  custom: "New model, mode, tool, or custom feature"
};

const gate = document.getElementById("adminGate");
const dashboard = document.getElementById("adminDashboard");
const requestList = document.getElementById("adminRequestList");
const statusMessage = document.getElementById("adminStatus");
const refreshButton = document.getElementById("adminRefreshBtn");
const searchInput = document.getElementById("adminSearchInput");
const pendingCount = document.getElementById("adminPendingCount");
const reviewedArchive = document.getElementById("adminReviewedArchive");
const reviewedList = document.getElementById("adminReviewedList");
const reviewedCount = document.getElementById("adminReviewedCount");

let supabase;
let reviewerSession = null;
let reviewerEmail = "";
let reviewerRole = "";
let requests = [];
let loadInFlight = false;

refreshButton.addEventListener("click", loadRequests);
searchInput.addEventListener("input", () => {
  renderRequests();
  renderReviewedRequests();
});
requestList.addEventListener("click", handleRequestAction);

async function initialize() {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await applySession(data?.session || null);
    supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });
  } catch (error) {
    showGate("Approval inbox unavailable", error.message || "Talkaton account access could not be checked.");
  }
}

async function applySession(session) {
  const email = String(session?.user?.email || "").toLowerCase();
  reviewerRole = email === OWNER_EMAIL
    ? "owner"
    : email === SUPPORT_EMAIL
      ? "support"
      : "";
  reviewerSession = reviewerRole ? session : null;
  reviewerEmail = reviewerSession ? email : "";

  if (!session?.user) {
    showGate("Log in to an approval account", "Use the confirmed Talkaton Owner or Support account, then return to this page.");
    return;
  }

  if (!reviewerSession) {
    showGate("This account cannot open the inbox", `Signed in as ${email}. Only the Talkaton Owner or Support account can review requests.`);
    return;
  }

  gate.hidden = true;
  dashboard.hidden = false;
  refreshButton.disabled = false;
  statusMessage.textContent = reviewerRole === "owner"
    ? `Owner access · signed in as ${OWNER_EMAIL}`
    : `Support access · signed in as ${SUPPORT_EMAIL}`;
  await loadRequests();
}

function showGate(title, message) {
  gate.hidden = false;
  dashboard.hidden = true;
  refreshButton.disabled = true;
  gate.querySelector("strong").textContent = title;
  gate.querySelector("p").textContent = message;
}

async function loadRequests() {
  if (!reviewerSession || loadInFlight) return;
  loadInFlight = true;
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing…";
  statusMessage.textContent = "Loading the request queue…";

  try {
    let { data, error } = await supabase
      .from("beta_requests")
      .select("id, user_id, user_email, requester_name, feature_key, title, details, status, admin_note, reviewed_by, reviewed_at, access_expires_at, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error && /access_expires_at|column/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("beta_requests")
        .select("id, user_id, user_email, requester_name, feature_key, title, details, status, admin_note, reviewed_by, reviewed_at, created_at, updated_at")
        .order("created_at", { ascending: false }));
    }
    if (error) throw error;
    requests = Array.isArray(data) ? data : [];
    updateCounts();
    renderRequests();
    renderReviewedRequests();
    const pendingTotal = requests.filter(request => request.status === "pending").length;
    statusMessage.textContent = `${pendingTotal} pending request${pendingTotal === 1 ? "" : "s"}.`;
  } catch (error) {
    requests = [];
    updateCounts();
    renderRequests();
    renderReviewedRequests();
    statusMessage.textContent = /beta_requests|schema cache|relation/i.test(error.message || "")
      ? "The secure request table still needs to be installed in Supabase."
      : (error.message || "The request queue could not be loaded.");
  } finally {
    loadInFlight = false;
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh list";
  }
}

function updateCounts() {
  pendingCount.textContent = requests.filter(request => request.status === "pending").length;
  reviewedCount.textContent = requests.filter(request => request.status !== "pending").length;
}

function getFilteredRequests() {
  const query = searchInput.value.trim().toLowerCase();
  return requests.filter(request => {
    if (request.status !== "pending") return false;
    if (!query) return true;
    return requestMatchesSearch(request, query);
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function requestMatchesSearch(request, query) {
  return [
    request.user_email,
    request.requester_name,
    request.title,
    request.details,
    request.admin_note,
    FEATURE_LABELS[request.feature_key] || request.feature_key
  ].some(value => String(value || "").toLowerCase().includes(query));
}

function renderRequests() {
  requestList.replaceChildren();
  const filtered = getFilteredRequests();
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "betaRequestEmpty";
    empty.textContent = requests.some(request => request.status === "pending")
      ? "No pending requests match your search."
      : "No pending requests. You’re all caught up.";
    requestList.append(empty);
    return;
  }
  filtered.forEach(request => requestList.append(createAdminRequestCard(request)));
}

function renderReviewedRequests() {
  reviewedList.replaceChildren();
  const query = searchInput.value.trim().toLowerCase();
  const reviewed = requests
    .filter(request => request.status === "approved" || request.status === "declined")
    .filter(request => !query || requestMatchesSearch(request, query))
    .sort((a, b) => new Date(b.reviewed_at || b.updated_at).getTime() - new Date(a.reviewed_at || a.updated_at).getTime());

  if (!reviewed.length) {
    const empty = document.createElement("p");
    empty.className = "betaRequestEmpty";
    empty.textContent = query
      ? "No approved or declined requests match your search."
      : "No requests have been approved or declined yet.";
    reviewedList.append(empty);
    return;
  }

  reviewed.forEach(request => reviewedList.append(createReviewedRequestCard(request)));
}

function createReviewedRequestCard(request) {
  const card = document.createElement("article");
  card.className = "betaReviewedRequestCard";

  const header = document.createElement("header");
  const identity = document.createElement("div");
  const feature = document.createElement("small");
  feature.textContent = FEATURE_LABELS[request.feature_key] || "Custom request";
  const title = document.createElement("h3");
  title.textContent = request.title;
  const requester = document.createElement("p");
  requester.textContent = `${request.requester_name} · ${request.user_email}`;
  identity.append(feature, title, requester);

  const badge = document.createElement("span");
  badge.className = `betaRequestBadge ${request.status}`;
  badge.textContent = request.status;
  header.append(identity, badge);

  const details = document.createElement("p");
  details.className = "betaAdminRequestDetails";
  details.textContent = request.details;
  card.append(header, details);

  if (request.admin_note) {
    const note = document.createElement("aside");
    const noteTitle = document.createElement("strong");
    noteTitle.textContent = "Staff note";
    const noteText = document.createElement("span");
    noteText.textContent = request.admin_note;
    note.append(noteTitle, noteText);
    card.append(note);
  }

  const reviewed = document.createElement("small");
  reviewed.className = "betaAdminReviewed";
  const expires = request.access_expires_at
    ? ` · access ends ${formatDate(request.access_expires_at)}`
    : "";
  reviewed.textContent = `Reviewed ${formatDate(request.reviewed_at || request.updated_at)} by ${request.reviewed_by || "Talkaton staff"}${expires}`;
  card.append(reviewed);
  return card;
}

function createAdminRequestCard(request) {
  const card = document.createElement("article");
  card.className = "betaAdminRequestCard";
  card.dataset.requestId = request.id;

  const header = document.createElement("header");
  const identity = document.createElement("div");
  const feature = document.createElement("small");
  feature.textContent = `${FEATURE_LABELS[request.feature_key] || "Custom request"} · ${formatDate(request.created_at)}`;
  const title = document.createElement("h2");
  title.textContent = request.title;
  const requester = document.createElement("p");
  requester.textContent = `${request.requester_name} · ${request.user_email}`;
  identity.append(feature, title, requester);

  const badge = document.createElement("span");
  badge.className = `betaRequestBadge ${request.status}`;
  badge.textContent = request.status;
  header.append(identity, badge);

  const details = document.createElement("p");
  details.className = "betaAdminRequestDetails";
  details.textContent = request.details;

  const timedAccess = ["beta_lab", "dev_access"].includes(request.feature_key);
  let duration = null;
  if (timedAccess) {
    duration = createDurationControl(request);
  }

  const noteLabel = document.createElement("label");
  noteLabel.textContent = "Staff note shown to the user";
  const note = document.createElement("textarea");
  note.className = "betaAdminNote";
  note.rows = 3;
  note.maxLength = 1000;
  note.placeholder = "Explain what was approved, declined, or what happens next.";
  note.value = request.admin_note || "";
  noteLabel.append(note);

  const actions = document.createElement("div");
  actions.className = "betaAdminRequestActions";
  actions.append(
    actionButton("Approve this item", "approved", "approve"),
    actionButton("Decline", "declined", "decline")
  );
  const email = document.createElement("a");
  email.className = "betaSecondaryBtn";
  email.href = `mailto:${encodeURIComponent(request.user_email)}?subject=${encodeURIComponent(`Talkaton request: ${request.title}`)}`;
  email.textContent = "Email user";
  actions.append(email);

  card.append(header, details);
  if (duration) card.append(duration);
  card.append(noteLabel, actions);
  if (request.reviewed_at) {
    const reviewed = document.createElement("small");
    reviewed.className = "betaAdminReviewed";
    const expires = request.access_expires_at
      ? ` · access ends ${formatDate(request.access_expires_at)}`
      : "";
    reviewed.textContent = `Last reviewed ${formatDate(request.reviewed_at)} by ${request.reviewed_by || "Talkaton staff"}${expires}`;
    card.append(reviewed);
  }
  return card;
}

function createDurationControl(request) {
  const wrapper = document.createElement("div");
  wrapper.className = "betaAdminDuration";

  const label = document.createElement("label");
  label.textContent = request.feature_key === "dev_access"
    ? "How long should unlimited Dev Access last?"
    : "How long should trusted Beta access last?";

  const controls = document.createElement("div");
  const amount = document.createElement("input");
  amount.className = "betaAccessAmount";
  amount.type = "number";
  amount.min = "1";
  amount.max = "3650";
  amount.step = "1";
  amount.value = String(getSuggestedDurationDays(request.access_expires_at));
  amount.setAttribute("aria-label", "Access duration amount");

  const unit = document.createElement("select");
  unit.className = "betaAccessUnit";
  unit.setAttribute("aria-label", "Access duration unit");
  [
    ["seconds", "Seconds"],
    ["minutes", "Minutes"],
    ["hours", "Hours"],
    ["days", "Days"],
    ["weeks", "Weeks"],
    ["months", "Months"],
    ["years", "Years"]
  ].forEach(([value, labelText]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelText;
    if (value === "days") option.selected = true;
    unit.append(option);
  });

  const hint = document.createElement("small");
  hint.textContent = request.feature_key === "dev_access"
    ? "Dev Access works only while this person also has active Beta access."
    : "When this time ends, Beta perks turn off automatically.";

  controls.append(amount, unit);
  label.append(controls, hint);
  wrapper.append(label);
  return wrapper;
}

function getSuggestedDurationDays(expiresAt) {
  if (!expiresAt) return 30;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return 30;
  return Math.max(1, Math.ceil(remaining / 86_400_000));
}

function calculateAccessExpiration(card) {
  const amount = Number(card.querySelector(".betaAccessAmount")?.value);
  const unit = card.querySelector(".betaAccessUnit")?.value;
  const unitMs = {
    seconds: 1_000,
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
    weeks: 604_800_000,
    months: 2_592_000_000,
    years: 31_536_000_000
  }[unit];
  if (!Number.isFinite(amount) || amount < 1 || !unitMs) {
    throw new Error("Choose a valid access duration before approving.");
  }
  return new Date(Date.now() + (amount * unitMs)).toISOString();
}

function actionButton(label, nextStatus, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `betaAdminDecision ${className}`;
  button.dataset.reviewStatus = nextStatus;
  button.textContent = label;
  return button;
}

async function handleRequestAction(event) {
  const button = event.target.closest("[data-review-status]");
  if (!button || !reviewerSession) return;
  const card = button.closest("[data-request-id]");
  const requestId = card?.dataset.requestId;
  const nextStatus = button.dataset.reviewStatus;
  const note = card?.querySelector(".betaAdminNote")?.value.trim() || "";
  const request = requests.find(item => item.id === requestId);
  if (!requestId || !request || !["approved", "declined"].includes(nextStatus)) return;

  card.querySelectorAll("button").forEach(item => { item.disabled = true; });
  statusMessage.textContent = `${nextStatus === "approved" ? "Approving" : "Declining"} the selected request…`;

  try {
    const isTimedAccess = ["beta_lab", "dev_access"].includes(request?.feature_key);
    const accessExpiresAt = nextStatus === "approved" && isTimedAccess
      ? calculateAccessExpiration(card)
      : null;
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase
      .from("beta_requests")
      .update({
        status: nextStatus,
        admin_note: note || null,
        reviewed_by: reviewerEmail,
        reviewed_at: reviewedAt,
        access_expires_at: accessExpiresAt
      })
      .eq("id", requestId);
    if (error) throw error;
    Object.assign(request, {
      status: nextStatus,
      admin_note: note || null,
      reviewed_by: reviewerEmail,
      reviewed_at: reviewedAt,
      access_expires_at: accessExpiresAt,
      updated_at: reviewedAt
    });
    updateCounts();
    renderRequests();
    renderReviewedRequests();
    statusMessage.textContent = nextStatus === "approved"
      ? isTimedAccess
        ? `Access is approved until ${formatDate(accessExpiresAt)}.`
        : "That specific request is approved."
      : "That specific request was declined.";
  } catch (error) {
    statusMessage.textContent = error.message || "The request could not be updated.";
    card.querySelectorAll("button").forEach(item => { item.disabled = false; });
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

setInterval(() => {
  if (!document.hidden && reviewerSession) loadRequests();
}, 15_000);

initialize();
