const form = document.getElementById("betaRequestForm");
const nameInput = document.getElementById("betaRequestName");
const emailInput = document.getElementById("betaRequestEmail");
const typeInput = document.getElementById("betaRequestType");
const titleInput = document.getElementById("betaRequestTitle");
const targetLabel = document.getElementById("betaRequestTargetLabel");
const targetHint = document.getElementById("betaRequestTargetHint");
const requestSuggestions = document.getElementById("betaRequestSuggestions");
const reasonInput = document.getElementById("betaRequestReason");
const submitButton = document.getElementById("betaRequestSubmit");
const requestStatus = document.getElementById("betaRequestStatus");
const requestHistory = document.getElementById("betaRequestHistory");
const accessLabel = document.getElementById("betaAccessLabel");
const accessTitle = document.getElementById("betaAccessTitle");
const accessDetail = document.getElementById("betaAccessDetail");
const accessStatus = document.getElementById("betaAccessStatus");
const accessAction = document.getElementById("betaAccessAction");
const devAccessOption = document.getElementById("devAccessOption");

const SUPABASE_URL = "https://cxulgeojkjnskdyoktkj.supabase.co";
const SUPABASE_KEY = "sb_publishable_GgxtfIaIamzZFY_jMU4_Cw_V8NKm475";
const FEATURE_LABELS = {
  beta_lab: "Beta Lab access",
  dev_access: "Dev Access",
  model_access: "Model access",
  tool_access: "Tool or integration",
  custom: "New model, mode, tool, or custom feature"
};
const REQUEST_TYPES = {
  beta_lab: {
    featureKey: "beta_lab",
    titlePrefix: "",
    inputLabel: "What should support approve?",
    placeholder: "Example: Access to Beta Lab",
    hint: "Beta Lab unlocks every listed model, higher limits, instant model comparisons, and power answers.",
    suggestions: ["Beta Lab access"]
  },
  dev_access: {
    featureKey: "dev_access",
    titlePrefix: "",
    inputLabel: "Why do you need Dev Access?",
    placeholder: "Example: Dev Access for building and testing",
    hint: "Only approved Beta members can request Dev Access. If approved, it unlocks unlimited messages, images, and web searches for a time chosen by Talkaton staff.",
    suggestions: ["Dev Access"]
  },
  existing_model: {
    featureKey: "model_access",
    titlePrefix: "Existing model",
    inputLabel: "Which available model do you want?",
    placeholder: "Example: GPT-5.4 Mini",
    hint: "Choose a model already listed in Talkaton.",
    suggestions: [
      "GPT-5.4 Nano",
      "GPT-4.1 Mini",
      "GPT-5.4 Mini",
      "Claude 3 Haiku",
      "Gemini 2.5 Flash Lite",
      "DeepSeek Chat",
      "Llama 3.1 8B",
      "Mistral Small"
    ]
  },
  new_model: {
    featureKey: "custom",
    titlePrefix: "New model",
    inputLabel: "Which new model should Talkaton add?",
    placeholder: "Example: a newer Claude or Gemini model",
    hint: "You can request any provider or model that is not currently listed.",
    suggestions: []
  },
  new_mode: {
    featureKey: "custom",
    titlePrefix: "New mode",
    inputLabel: "What new response mode should Talkaton add?",
    placeholder: "Example: Study Mode",
    hint: "Describe a mode that changes how Talkaton thinks or responds.",
    suggestions: ["Study Mode", "Research Mode", "Debate Mode", "Tutor Mode", "Focus Mode"]
  },
  existing_tool: {
    featureKey: "tool_access",
    titlePrefix: "Existing tool",
    inputLabel: "Which available tool do you want?",
    placeholder: "Example: Web search",
    hint: "Request access to a tool that Talkaton already supports.",
    suggestions: ["Web search", "Image generation", "File uploads", "Folder uploads", "Voice input", "Memory"]
  },
  new_tool: {
    featureKey: "custom",
    titlePrefix: "New tool or integration",
    inputLabel: "What tool or integration should Talkaton add?",
    placeholder: "Example: Google Drive",
    hint: "Name the service and explain what it should do inside Talkaton.",
    suggestions: ["Google Drive", "Gmail", "Slack", "Notion", "GitHub"]
  },
  custom: {
    featureKey: "custom",
    titlePrefix: "Custom feature",
    inputLabel: "What custom feature should Talkaton add?",
    placeholder: "Example: Shared chats",
    hint: "Request any other improvement that is not covered above.",
    suggestions: ["Shared chats", "Chat folders", "Conversation export", "Custom themes"]
  }
};

let supabase;
let currentSession = null;
let betaAccessApproved = false;
let devAccessApproved = false;

form?.addEventListener("submit", submitRequest);
typeInput?.addEventListener("change", updateRequestTypeFields);
updateRequestTypeFields();

function setAccessState({ label, title, detail, message, action, href, approved = false }) {
  accessLabel.textContent = label;
  accessTitle.textContent = title;
  accessDetail.textContent = detail;
  accessStatus.textContent = message;
  accessAction.textContent = action;
  accessAction.href = href;
  accessAction.classList.toggle("betaPrimaryBtn", approved);
  accessAction.classList.toggle("betaSecondaryBtn", !approved);
  document.querySelector(".betaSignalCard")?.classList.toggle("isApproved", approved);
}

function setRequestMessage(message, type = "") {
  requestStatus.textContent = message;
  requestStatus.classList.toggle("success", type === "success");
  requestStatus.classList.toggle("error", type === "error");
}

async function submitRequest(event) {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (!currentSession?.user) {
    setRequestMessage("Log in to your confirmed Talkaton account before submitting.", "error");
    return;
  }
  if (typeInput.value === "dev_access" && !betaAccessApproved) {
    setRequestMessage("Dev Access can only be requested by an active, trusted Beta member.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Submitting…";
  setRequestMessage("Adding your request to the support queue…");

  try {
    const requestType = REQUEST_TYPES[typeInput.value] || REQUEST_TYPES.custom;
    const requestedTitle = titleInput.value.trim();
    const storedTitle = requestType.titlePrefix
      ? `${requestType.titlePrefix}: ${requestedTitle}`
      : requestedTitle;
    const payload = {
      user_id: currentSession.user.id,
      user_email: String(currentSession.user.email || "").toLowerCase(),
      requester_name: nameInput.value.trim(),
      feature_key: requestType.featureKey,
      title: storedTitle,
      details: reasonInput.value.trim()
    };
    const { error } = await supabase.from("beta_requests").insert(payload);
    if (error) throw error;

    titleInput.value = "";
    reasonInput.value = "";
    setRequestMessage(
      "Request submitted. Manual review may take a while. If approved, building or enabling it may take additional time.",
      "success"
    );
    await loadMyRequests();
  } catch (error) {
    const missingTable = /beta_requests|schema cache|relation/i.test(error.message || "");
    setRequestMessage(
      missingTable
        ? "The request queue is finishing setup. Email supportaton@gmail.com if you need help right now."
        : (error.message || "Your request could not be submitted. Try again."),
      "error"
    );
  } finally {
    submitButton.disabled = !currentSession?.user;
    submitButton.textContent = "Submit request →";
  }
}

function updateRequestTypeFields() {
  const requestType = REQUEST_TYPES[typeInput?.value] || REQUEST_TYPES.custom;
  if (targetLabel) targetLabel.textContent = requestType.inputLabel;
  if (titleInput) titleInput.placeholder = requestType.placeholder;
  if (targetHint) targetHint.textContent = requestType.hint;
  if (!requestSuggestions) return;

  requestSuggestions.replaceChildren();
  requestType.suggestions.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    requestSuggestions.append(option);
  });
}

function updateDevRequestAvailability() {
  if (!devAccessOption) return;
  devAccessOption.hidden = !betaAccessApproved;
  devAccessOption.disabled = !betaAccessApproved;
  if (!betaAccessApproved && typeInput.value === "dev_access") {
    typeInput.value = "beta_lab";
    updateRequestTypeFields();
  }
}

async function checkBetaAccess() {
  betaAccessApproved = false;
  devAccessApproved = false;
  if (!currentSession?.access_token) {
    updateDevRequestAvailability();
    setAccessState({
      label: "Sign-in required",
      title: "Check your Beta Lab seat",
      detail: "Use the confirmed Talkaton account from your request.",
      message: "No signed-in Talkaton account was found in this browser.",
      action: "Log in and check",
      href: "/chat?auth=login&beta=1"
    });
    return;
  }

  try {
    const response = await fetch("/api/beta-status", {
      headers: { Authorization: `Bearer ${currentSession.access_token}` },
      cache: "no-store"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || "Beta access could not be checked.");
    betaAccessApproved = result.approved === true;
    devAccessApproved = result.devApproved === true;
    updateDevRequestAvailability();

    if (devAccessApproved) {
      setAccessState({
        label: "Dev Access active",
        title: "Unlimited access is active",
        detail: "Infinite messages, image generations, and web searches are unlocked.",
        message: `${currentSession.user?.email || "This account"} is trusted for Dev Access${formatExpiry(result.devExpiresAt)}.`,
        action: "Open Talkaton →",
        href: "/chat?beta=1",
        approved: true
      });
      return;
    }

    if (betaAccessApproved) {
      setAccessState({
        label: "Trusted Beta active",
        title: "Your private Beta access is ready",
        detail: "All 8 models, higher daily limits, instant model comparison, and power answers are active.",
        message: `Approved for ${currentSession.user?.email || "this account"}${formatExpiry(result.betaExpiresAt)}. You can now request Dev Access below.`,
        action: "Launch Beta Lab →",
        href: "/chat?beta=1",
        approved: true
      });
      return;
    }

    setAccessState({
      label: "Not approved yet",
      title: "Request trusted Beta access",
      detail: "Beta is private. Talkaton’s Owner or Support account approves only trusted people.",
      message: `${currentSession.user?.email || "This account"} is not in the trusted Beta yet.`,
      action: "Request access",
      href: "#request"
    });
  } catch (error) {
    setAccessState({
      label: "Check unavailable",
      title: "Beta Lab is still online",
      detail: "The access check could not finish right now.",
      message: error.message || "Refresh the page and try again.",
      action: "Open Talkaton",
      href: "/chat"
    });
  }
}

async function loadMyRequests() {
  requestHistory.replaceChildren();
  if (!currentSession?.user) {
    requestHistory.append(emptyMessage("Log in to view your submitted requests and approval notes."));
    return;
  }

  const loading = emptyMessage("Loading your requests…");
  requestHistory.append(loading);

  try {
    let { data, error } = await supabase
      .from("beta_requests")
      .select("id, feature_key, title, details, status, admin_note, reviewed_at, access_expires_at, created_at")
      .order("created_at", { ascending: false });
    if (error && /access_expires_at|column/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("beta_requests")
        .select("id, feature_key, title, details, status, admin_note, reviewed_at, created_at")
        .order("created_at", { ascending: false }));
    }
    if (error) throw error;

    requestHistory.replaceChildren();
    if (!data?.length) {
      requestHistory.append(emptyMessage("No requests yet. Submit one above and it will appear here."));
      return;
    }
    data.forEach(request => requestHistory.append(createRequestCard(request)));
  } catch (error) {
    requestHistory.replaceChildren(emptyMessage(
      /beta_requests|schema cache|relation/i.test(error.message || "")
        ? "The request history is finishing setup."
        : "Your request history could not be loaded."
    ));
  }
}

function createRequestCard(request) {
  const card = document.createElement("article");
  card.className = "betaRequestHistoryCard";

  const header = document.createElement("header");
  const title = document.createElement("div");
  const eyebrow = document.createElement("small");
  eyebrow.textContent = `${FEATURE_LABELS[request.feature_key] || "Custom request"} · ${formatDate(request.created_at)}`;
  const heading = document.createElement("h3");
  heading.textContent = request.title;
  title.append(eyebrow, heading);

  const badge = document.createElement("span");
  badge.className = `betaRequestBadge ${request.status}`;
  badge.textContent = request.status;
  header.append(title, badge);

  const details = document.createElement("p");
  details.textContent = request.details;
  card.append(header, details);

  if (request.status === "approved" && ["beta_lab", "dev_access"].includes(request.feature_key)) {
    const accessWindow = document.createElement("p");
    accessWindow.className = "betaRequestAccessWindow";
    accessWindow.textContent = request.access_expires_at
      ? `Access ends ${formatDate(request.access_expires_at)}.`
      : "Access has no expiration date.";
    card.append(accessWindow);
  } else if (request.status === "approved" && request.feature_key !== "beta_lab") {
    const timing = document.createElement("p");
    timing.className = "betaRequestFulfillmentNote";
    timing.textContent = "Approved means support accepted this request. Building or enabling it may still take time.";
    card.append(timing);
  }

  if (request.admin_note) {
    const note = document.createElement("aside");
    const noteTitle = document.createElement("strong");
    noteTitle.textContent = "Talkaton staff note";
    const noteBody = document.createElement("span");
    noteBody.textContent = request.admin_note;
    note.append(noteTitle, noteBody);
    card.append(note);
  }

  return card;
}

function emptyMessage(message) {
  const paragraph = document.createElement("p");
  paragraph.className = "betaRequestEmpty";
  paragraph.textContent = message;
  return paragraph;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

function formatExpiry(value) {
  if (!value) return "";
  return ` until ${formatDate(value)}`;
}

async function applySession(session) {
  currentSession = session || null;
  if (!currentSession?.user) {
    betaAccessApproved = false;
    devAccessApproved = false;
    updateDevRequestAvailability();
  }
  const user = currentSession?.user;
  emailInput.value = user?.email || "";
  submitButton.disabled = !user;

  if (!user) {
    setRequestMessage("Log in to submit a custom request. Your confirmed account email will be attached automatically.");
  } else if (!nameInput.value) {
    nameInput.value = user.user_metadata?.display_name || user.user_metadata?.full_name || "";
  }

  await Promise.all([checkBetaAccess(), loadMyRequests()]);
}

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
    submitButton.disabled = true;
    setRequestMessage(error.message || "Talkaton account access is temporarily unavailable.", "error");
    requestHistory.replaceChildren(emptyMessage("Request history is temporarily unavailable."));
  }
}

initialize();
