const STORAGE_KEY = "talkaton";
const MAX_ATTACHMENT_DATA_LENGTH = 1_200_000;

export function loadStoredState(defaultState) {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return defaultState;

  try {
    const value = JSON.parse(saved);
    return {
      ...defaultState,
      ...value,
      settings: { ...defaultState.settings, ...(value.settings || {}) },
      chats: Array.isArray(value.chats) ? value.chats : [],
      memory: Array.isArray(value.memory) ? value.memory : [],
      user: null,
      loggedIn: false,
      loading: false
    };
  } catch {
    return defaultState;
  }
}

export function saveStoredState(state) {
  try {
    const serialized = JSON.stringify(state, (key, value) => {
      if (["user", "loggedIn", "loading", "pendingAttachments"].includes(key)) return undefined;
      if (key === "dataUrl" && typeof value === "string" && value.length > MAX_ATTACHMENT_DATA_LENGTH) return undefined;
      if (key === "previewUrl" && typeof value === "string" && value.startsWith("blob:")) return undefined;
      if (key === "generatedImage" && typeof value === "string" && value.startsWith("data:") && value.length > MAX_ATTACHMENT_DATA_LENGTH) return undefined;
      return value;
    });
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    console.warn("Talkaton could not save all local data:", error);
  }
}

export function createId(prefix = "") {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}-${random}` : random;
}

export function getVisitorId() {
  const storageKey = "talkatonVisitorId";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let visitorId = localStorage.getItem(storageKey);

  if (!uuidPattern.test(visitorId || "")) {
    visitorId = createUuid();
    localStorage.setItem(storageKey, visitorId);
  }

  return visitorId;
}

function createUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
